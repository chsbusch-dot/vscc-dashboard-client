import { useCallback, useEffect, useRef } from 'react';
import { useDashboard, type TelemetryRecord } from '../data/DashboardContext';
import type { PhysioId } from '../data/constants';
import { fetchSessionData } from '../data/sessionsApi';
import { pickAgg, planWindow, type ReplayWindow } from '../utils/replayWindow';
import { GAP_BREAK_SEC, gapBreakSecFor } from '../utils/seriesAgg';

/**
 * Windowed / level-of-detail replay of a stored session. Headless (renders null).
 *
 * When a session is loaded (state.loadedSession set), this:
 *  - loads an OVERVIEW of the whole session at a coarse, zoom-appropriate
 *    resolution and fits the view to its full extent;
 *  - watches the charts' visible range (reported via the view channel) and, when
 *    you pan/zoom past what's loaded, fetches just that window at the resolution
 *    the zoom level warrants (raw when tight, 1-/5-min when wide) and swaps it in.
 *
 * So the browser only ever holds the visible window (+ a margin), and raw beats
 * are reachable anywhere across a multi-hour recording.
 */

const LOAD_CHUNK_SIZE = 5000;
const DEBOUNCE_MS = 250;

const WindowedReplayController = () => {
    const { state, actions, subscribeToView, requestView, gapBreakSecRef } = useDashboard();
    const loaded = state.loadedSession;

    // `actions` is rebuilt on every render. Read it through a ref so fetchWindow
    // (and the view subscription that depends on it) stays stable; otherwise the
    // subscription re-subscribes each render and drops the pending debounce.
    const actionsRef = useRef(actions);
    useEffect(() => { actionsRef.current = actions; });

    // The window currently in memory, so we can tell when the view leaves it.
    const loadedWindowRef = useRef<ReplayWindow | null>(null);
    // Whether that window came back empty (a gap inside the session).
    const loadedEmptyRef = useRef(false);
    // View reports are ignored until the whole-session overview has landed: while
    // the charts settle they report ranges anchored at wall-clock now, which used
    // to supersede the overview with a window outside the session.
    const overviewReadyRef = useRef(false);
    // Last value sent to setReplayEmpty, so a pan doesn't re-render the dashboard.
    const replayEmptyRef = useRef(false);
    // Supersede in-flight fetches when a newer one starts (rapid scrolling).
    const seqRef = useRef(0);
    const debounceRef = useRef<number | null>(null);

    const setEmpty = useCallback((empty: boolean) => {
        if (replayEmptyRef.current === empty) return;
        replayEmptyRef.current = empty;
        actionsRef.current.setReplayEmpty(empty);
    }, []);

    const fetchWindow = useCallback(async (
        sessionId: number, win: ReplayWindow, fitTo: [number, number] | null,
    ) => {
        const seq = ++seqRef.current;
        const isOverview = fitTo !== null;
        actionsRef.current.setStatus('Loading');
        try {
            const data = await fetchSessionData(sessionId, win.agg, win.from, win.to);
            if (seq !== seqRef.current) return; // a newer window superseded this one
            const records: TelemetryRecord[] = [...data.numerics, ...data.waveforms]
                .filter(r => r && typeof r.time === 'number' && !!r.physio_id)
                .map(r => ({
                    time: r.time, physio_id: r.physio_id as PhysioId, value: r.value, device_id: `session-${sessionId}`,
                    min: r.min, max: r.max,
                }));
            records.sort((a, b) => a.time - b.time);

            // An empty window never wipes what is on screen; the overlay says why.
            if (records.length > 0) {
                // Set before the first append: the charts read it as data arrives.
                gapBreakSecRef.current = gapBreakSecFor(win.agg);
                actionsRef.current.setReplayAgg(win.agg);
                actionsRef.current.clearData();
                for (let i = 0; i < records.length; i += LOAD_CHUNK_SIZE) {
                    if (seq !== seqRef.current) return; // superseded mid-load
                    actionsRef.current.appendData(records.slice(i, i + LOAD_CHUNK_SIZE));
                    await new Promise(resolve => setTimeout(resolve, 0)); // keep the UI responsive
                }
            }
            loadedWindowRef.current = win;
            loadedEmptyRef.current = records.length === 0;
            setEmpty(records.length === 0);
            if (isOverview) overviewReadyRef.current = true;
            actionsRef.current.setStatus('Ready');
            const label = win.agg === 'raw' ? 'raw' : win.agg === '5min' ? '5-min avg' : '1-min avg';
            actionsRef.current.setStatusNote(`Replay #${sessionId} • ${label} • ${records.length} pts`);
            if (fitTo) requestView(fitTo[0], fitTo[1]); // fit the overview to the whole session
        } catch {
            if (seq !== seqRef.current) return;
            // Let pan/zoom retry even if the overview failed.
            if (isOverview) overviewReadyRef.current = true;
            actionsRef.current.setStatus('Error');
        }
    }, [requestView, setEmpty, gapBreakSecRef]);

    // On load: show the session's extent at once, then fetch an overview of the
    // whole session at the resolution its full width warrants (so the fitted view
    // is already covered, with no immediate re-fetch).
    useEffect(() => {
        loadedWindowRef.current = null;
        loadedEmptyRef.current = false;
        overviewReadyRef.current = false;
        replayEmptyRef.current = false; // setLoadedSession resets replayEmpty too
        if (!loaded) {
            gapBreakSecRef.current = GAP_BREAK_SEC; // back to live / raw data
            return;
        }
        requestView(loaded.start, loaded.end);
        const win: ReplayWindow = { agg: pickAgg(loaded.end - loaded.start), from: loaded.start, to: loaded.end };
        void fetchWindow(loaded.id, win, [loaded.start, loaded.end]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded?.id]);

    // On view change: fetch the window the view moved into, if it's no longer covered.
    useEffect(() => {
        if (!loaded) return;
        const unsub = subscribeToView((min, max) => {
            if (!overviewReadyRef.current) return;
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => {
                const plan = planWindow({ min, max }, loaded, loadedWindowRef.current);
                if (plan.kind === 'outside') {
                    setEmpty(true);
                } else if (plan.kind === 'covered') {
                    setEmpty(loadedEmptyRef.current);
                } else {
                    // Don't refit: preserve exactly the range the user scrolled to.
                    void fetchWindow(loaded.id, plan.window, null);
                }
            }, DEBOUNCE_MS);
        });
        return () => {
            unsub();
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
        };
    }, [loaded, subscribeToView, fetchWindow, setEmpty]);

    return null;
};

export default WindowedReplayController;
