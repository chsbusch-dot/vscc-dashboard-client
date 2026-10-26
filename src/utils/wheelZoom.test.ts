import { describe, it, expect } from 'vitest';
import { symmetricZoomFraction } from './wheelZoom';

// SciChart's growBy scales the visible width by (1 + fraction).
const widthFactor = (fraction: number) => 1 + symmetricZoomFraction(fraction);

describe('symmetricZoomFraction', () => {
    it('leaves a zero delta alone', () => {
        expect(symmetricZoomFraction(0)).toBe(0);
    });

    it('keeps the direction: negative zooms in, positive zooms out', () => {
        expect(widthFactor(-0.1)).toBeLessThan(1);
        expect(widthFactor(0.1)).toBeGreaterThan(1);
    });

    it('makes a step in and the same step out cancel exactly', () => {
        for (const f of [0.01, 0.1, 0.5, 1, 3]) {
            expect(widthFactor(-f) * widthFactor(f)).toBeCloseTo(1, 12);
        }
    });

    it('never collapses or inverts the range, however large the delta', () => {
        // The linear step gives 1 + (-1) = 0 and 1 + (-2) = -1 here.
        expect(widthFactor(-1)).toBeGreaterThan(0);
        expect(widthFactor(-2)).toBeGreaterThan(0);
        expect(widthFactor(-10)).toBeGreaterThan(0);
    });

    it('returns from a deep zoom in as many steps as it took to get there', () => {
        let width = 3600;
        for (let i = 0; i < 20; i++) width *= widthFactor(-0.5);
        for (let i = 0; i < 20; i++) width *= widthFactor(0.5);
        expect(width).toBeCloseTo(3600, 6);
    });
});
