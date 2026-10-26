import { describe, it, expect } from 'vitest';
import { pickAgg, planWindow, type ReplayWindow } from './replayWindow';

// An 8.5 h session, like the overnight recording that replayed empty.
const SESSION = { start: 1_000_000, end: 1_000_000 + 8.5 * 3600 };
const OVERVIEW: ReplayWindow = { agg: '5min', from: SESSION.start, to: SESSION.end };

describe('pickAgg', () => {
    it('maps visible width to a resolution', () => {
        expect(pickAgg(60)).toBe('raw');
        expect(pickAgg(61)).toBe('1min');
        expect(pickAgg(3600)).toBe('1min');
        expect(pickAgg(3601)).toBe('5min');
    });
});

describe('planWindow', () => {
    it('does nothing for a view after the session end (chart anchored at now)', () => {
        const now = SESSION.end + 9 * 3600;
        expect(planWindow({ min: now - 600, max: now }, SESSION, OVERVIEW)).toEqual({ kind: 'outside' });
        expect(planWindow({ min: now - 600, max: now }, SESSION, null)).toEqual({ kind: 'outside' });
    });

    it('does nothing for a view before the session start', () => {
        expect(planWindow({ min: SESSION.start - 900, max: SESSION.start - 300 }, SESSION, null))
            .toEqual({ kind: 'outside' });
    });

    it('does nothing for a NaN range', () => {
        expect(planWindow({ min: NaN, max: NaN }, SESSION, null)).toEqual({ kind: 'outside' });
    });

    it('clamps a view that overlaps the session end to the session', () => {
        const plan = planWindow({ min: SESSION.end - 30, max: SESSION.end + 30 }, SESSION, OVERVIEW);
        expect(plan).toEqual({
            kind: 'fetch',
            window: { agg: 'raw', from: SESSION.end - 60, to: SESSION.end },
        });
    });

    it('never produces an inverted window', () => {
        const views = [
            { min: SESSION.end, max: SESSION.end + 600 },
            { min: SESSION.start - 600, max: SESSION.start },
            { min: SESSION.start + 100, max: SESSION.start + 100 },
        ];
        for (const v of views) {
            const plan = planWindow(v, SESSION, null);
            if (plan.kind === 'fetch') expect(plan.window.to).toBeGreaterThan(plan.window.from);
        }
    });

    it('keeps a view inside the loaded window at the same resolution', () => {
        const loaded: ReplayWindow = { agg: '1min', from: SESSION.start + 3600, to: SESSION.start + 7200 };
        expect(planWindow({ min: SESSION.start + 4000, max: SESSION.start + 5000 }, SESSION, loaded))
            .toEqual({ kind: 'covered' });
    });

    it('refetches when the zoom level needs a different resolution', () => {
        const plan = planWindow({ min: SESSION.start + 3600, max: SESSION.start + 3630 }, SESSION, OVERVIEW);
        expect(plan).toEqual({
            kind: 'fetch',
            window: { agg: 'raw', from: SESSION.start + 3585, to: SESSION.start + 3645 },
        });
    });

    it('treats the fitted overview as covered', () => {
        expect(planWindow({ min: SESSION.start, max: SESSION.end }, SESSION, OVERVIEW)).toEqual({ kind: 'covered' });
    });

    it('stays covered when zoomed out past the session', () => {
        expect(planWindow({ min: SESSION.start - 86400, max: SESSION.end + 86400 }, SESSION, OVERVIEW))
            .toEqual({ kind: 'covered' });
    });

    it('fetches when panned past the loaded window', () => {
        const loaded: ReplayWindow = { agg: '1min', from: SESSION.start, to: SESSION.start + 3600 };
        const plan = planWindow({ min: SESSION.start + 3000, max: SESSION.start + 4800 }, SESSION, loaded);
        expect(plan).toEqual({
            kind: 'fetch',
            window: { agg: '1min', from: SESSION.start + 2100, to: SESSION.start + 5700 },
        });
    });
});
