/**
 * Window planning for windowed session replay (pure, no React / I/O).
 *
 * Given the chart's visible range, the loaded session's bounds and the window
 * already in memory, decide whether to fetch a new window, keep what is loaded,
 * or do nothing because the view is outside the session.
 */

export type ReplayAgg = 'raw' | '1min' | '5min';

export interface ReplayWindow {
    agg: ReplayAgg;
    from: number;
    to: number;
}

export type WindowPlan =
    | { kind: 'outside' }
    | { kind: 'covered' }
    | { kind: 'fetch'; window: ReplayWindow };

/** Seconds of slack when testing whether the view is still covered. */
export const COVER_EPS = 0.5;

/** Resolution from visible window width (seconds). Tight → raw beats; wide → averages. */
export const pickAgg = (widthSec: number): ReplayAgg =>
    widthSec <= 60 ? 'raw' : widthSec <= 3600 ? '1min' : '5min';

export const planWindow = (
    view: { min: number; max: number },
    session: { start: number; end: number },
    loaded: ReplayWindow | null,
): WindowPlan => {
    const { min, max } = view;
    // No overlap with the session (or a NaN range): there is nothing to fetch.
    // Fetching here is what used to send an inverted window to the worker.
    if (!(max >= session.start && min <= session.end)) return { kind: 'outside' };

    const width = Math.max(1, max - min);
    // Zooming out past the session never needs a coarser level than the overview.
    const agg = pickAgg(Math.min(width, Math.max(1, session.end - session.start)));

    // Only the part of the view inside the session has to be covered.
    const lo = Math.max(session.start, min);
    const hi = Math.min(session.end, max);
    if (loaded && loaded.agg === agg
        && lo >= loaded.from - COVER_EPS && hi <= loaded.to + COVER_EPS) {
        return { kind: 'covered' };
    }

    const margin = width * 0.5;
    const from = Math.max(session.start, min - margin);
    const to = Math.min(session.end, max + margin);
    if (!(to > from)) return { kind: 'outside' };
    return { kind: 'fetch', window: { agg, from, to } };
};
