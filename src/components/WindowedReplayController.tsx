import { useCallback, useEffect, useRef } from 'react';
import { useDashboard, type TelemetryRecord } from '../data/DashboardContext';
import type { PhysioId } from '../data/constants';
import { fetchSessionData } from '../data/sessionsApi';

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
const COVER_EPS = 0.5; // seconds of slack when testing whether the view is still covered

/** Resolution from visible window width (seconds). Tight → raw beats; wide → averages. */
const pickAgg = (widthSec: number): 'raw' | '1min' | '5min' =>
    widthSec <= 60 ? 'raw' : widthSec <= 3600 ? '1min' : '5min';

const WindowedReplayController = () => {
    const { state, actions, subscribeToView, requestView } = useDashboard();
    const loaded = state.loadedSession;

    // The window currently in memory, so we can tell when the view leaves it.
    const loadedWindowRef = useRef<{ agg: string; from: number; to: number } | null>(null);
    // Supersede in-flight fetches when a newer one starts (rapid scrolling).
    const seqRef = useRef(0);
    const debounceRef = useRef<number | null>(null);

    const fetchWindow = useCallback(async (
        sessionId: number, agg: 'raw' | '1min' | '5min',
        from: number, to: number, fitTo: [number, number] | null,
    ) => {
        const seq = ++seqRef.current;
        actions.setStatus('Loading');
        try {
            const data = await fetchSessionData(sessionId, agg, from, to);
            if (seq !== seqRef.current) return; // a newer window superseded this one
            const records: TelemetryRecord[] = [...data.numerics, ...data.waveforms]
                .filter(r => r && typeof r.time === 'number' && !!r.physio_id)
                .map(r => ({ time: r.time, physio_id: r.physio_id as PhysioId, value: r.value, device_id: `session-${sessionId}` }));
            records.sort((a, b) => a.time - b.time);

            actions.clearData();
            for (let i = 0; i < records.length; i += LOAD_CHUNK_SIZE) {
                if (seq !== seqRef.current) return; // superseded mid-load
                actions.appendData(records.slice(i, i + LOAD_CHUNK_SIZE));
                await new Promise(resolve => setTimeout(resolve, 0)); // keep the UI responsive
            }
            loadedWindowRef.current = { agg, from, to };
            actions.setStatus('Ready');
            const label = agg === 'raw' ? 'raw' : agg === '5min' ? '5-min avg' : '1-min avg';
            actions.setStatusNote(`Replay #${sessionId} • ${label} • ${records.length} pts`);
            if (fitTo) requestView(fitTo[0], fitTo[1]); // fit the overview to the whole session
        } catch {
            if (seq === seqRef.current) actions.setStatus('Error');
        }
    }, [actions, requestView]);

    // On load: overview of the whole session at the resolution its full width warrants
    // (so the first reported view is already covered — no immediate re-fetch).
    useEffect(() => {
        if (!loaded) { loadedWindowRef.current = null; return; }
        loadedWindowRef.current = null;
        const agg = pickAgg(loaded.end - loaded.start);
        void fetchWindow(loaded.id, agg, loaded.start, loaded.end, [loaded.start, loaded.end]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded?.id]);

    // On view change: fetch the window the view moved into, if it's no longer covered.
    useEffect(() => {
        if (!loaded) return;
        const unsub = subscribeToView((min, max) => {
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => {
                const width = Math.max(1, max - min);
                const agg = pickAgg(width);
                const margin = width * 0.5;
                const from = Math.max(loaded.start, min - margin);
                const to = Math.min(loaded.end, max + margin);
                const lw = loadedWindowRef.current;
                const covered = lw !== null && lw.agg === agg
                    && min >= lw.from - COVER_EPS && max <= lw.to + COVER_EPS;
                if (!covered) {
                    // Don't refit — preserve exactly the range the user scrolled to.
                    void fetchWindow(loaded.id, agg, from, to, null);
                }
            }, DEBOUNCE_MS);
        });
        return () => {
            unsub();
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
        };
    }, [loaded?.id, loaded, subscribeToView, fetchWindow]);

    return null;
};

export default WindowedReplayController;
