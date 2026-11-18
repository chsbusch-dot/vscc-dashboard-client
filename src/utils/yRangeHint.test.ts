import { describe, expect, it } from 'vitest';
import { applyYRangeHint, combineYRangeHints } from './yRangeHint';

describe('combineYRangeHints', () => {
    it('is undefined when no series has a hint, so the axis autoranges', () => {
        expect(combineYRangeHints([undefined])).toBeUndefined();
        expect(combineYRangeHints([undefined, undefined])).toBeUndefined();
        expect(combineYRangeHints([])).toBeUndefined();
    });

    it('keeps a fixed range when every series sets both bounds', () => {
        expect(combineYRangeHints([{ min: 0, max: 100 }])).toEqual({ min: 0, max: 100 });
        expect(combineYRangeHints([{ min: 0, max: 100 }, { min: 0, max: 100 }])).toEqual({ min: 0, max: 100 });
    });

    it('keeps a floor alone when only the minimum is set', () => {
        expect(combineYRangeHints([{ min: 0 }])).toEqual({ min: 0 });
    });

    it('uses a bound only when every series in the chart sets it', () => {
        expect(combineYRangeHints([{ min: 0, max: 100 }, { min: 0 }])).toEqual({ min: 0 });
        expect(combineYRangeHints([{ min: 0, max: 100 }, undefined])).toBeUndefined();
    });

    it('takes the widest shared bounds so no series is cut', () => {
        expect(combineYRangeHints([{ min: 0, max: 100 }, { min: -10, max: 50 }])).toEqual({ min: -10, max: 100 });
    });

    it('drops an inverted hint', () => {
        expect(combineYRangeHints([{ min: 5, max: 5 }])).toBeUndefined();
    });
});

describe('applyYRangeHint', () => {
    it('leaves the data range alone without a hint', () => {
        expect(applyYRangeHint(-5.2, 41, undefined)).toEqual({ min: -5.2, max: 41 });
    });

    it('pins both ends of a fixed range whatever the data do', () => {
        expect(applyYRangeHint(-5, 41, { min: 0, max: 100 })).toEqual({ min: 0, max: 100 });
        expect(applyYRangeHint(12, 18, { min: 0, max: 100 })).toEqual({ min: 0, max: 100 });
    });

    it('fixes the floor and lets the top follow the data', () => {
        expect(applyYRangeHint(-1.5, 22, { min: 0 })).toEqual({ min: 0, max: 22 });
        expect(applyYRangeHint(8, 22, { min: 0 })).toEqual({ min: 0, max: 22 });
        expect(applyYRangeHint(8, 30, { min: 0 })).toEqual({ min: 0, max: 30 });
    });

    it('never returns an empty range under a floor', () => {
        expect(applyYRangeHint(-4, -1, { min: 0 })).toEqual({ min: 0, max: 1 });
        expect(applyYRangeHint(0, 0, { min: 0 })).toEqual({ min: 0, max: 1 });
    });
});
