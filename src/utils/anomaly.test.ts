import { describe, it, expect } from 'vitest';
import { meanStd, rollingZScores, anomalyRuns, type TrendPoint } from './anomaly';

const pts = (vals: number[]): TrendPoint[] => vals.map((v, i) => ({ t: i, v }));

describe('meanStd', () => {
    it('returns zeros for an empty slice', () => {
        expect(meanStd([])).toEqual({ mean: 0, std: 0 });
    });
    it('computes population mean and std', () => {
        const { mean, std } = meanStd([2, 4, 4, 4, 5, 5, 7, 9]);
        expect(mean).toBe(5);
        expect(std).toBeCloseTo(2, 10);
    });
});

describe('rollingZScores', () => {
    it('flags nothing on a constant series', () => {
        const scored = rollingZScores(pts(Array(20).fill(60)), { window: 5, threshold: 3 });
        expect(scored.every((s) => !s.anomaly)).toBe(true);
        expect(scored.every((s) => s.z === 0)).toBe(true);
    });

    it('never flags points before minSamples history exists', () => {
        const scored = rollingZScores(pts([60, 200, 60, 200]), { window: 5, threshold: 2, minSamples: 5 });
        expect(scored.every((s) => !s.anomaly)).toBe(true);
    });

    it('flags a clear spike against a stable baseline', () => {
        // baseline ~70 with ±1 jitter so std > 0 and the spike yields a genuine large z
        const vals = Array.from({ length: 15 }, (_, i) => 70 + (i % 2 ? 1 : -1));
        vals.push(140); // sudden doubling
        vals.push(70);
        const scored = rollingZScores(pts(vals), { window: 10, threshold: 3, minSamples: 10 });
        expect(scored[15].anomaly).toBe(true);
        expect(scored[15].z).toBeGreaterThan(3);
        // the point after the spike returns to baseline; the window now includes
        // the spike so its std is inflated — that recovery point is not anomalous
        expect(scored[16].anomaly).toBe(false);
    });

    it('does not flag a slow ramp the rolling mean can track', () => {
        // +0.5/sample drift with tiny jitter — within a few std of the trailing mean
        const vals = Array.from({ length: 40 }, (_, i) => 60 + i * 0.5 + (i % 2 ? 0.1 : -0.1));
        const scored = rollingZScores(pts(vals), { window: 10, threshold: 4, minSamples: 10 });
        expect(scored.some((s) => s.anomaly)).toBe(false);
    });

    it('treats a break from a perfectly flat window as an anomaly with clamped z', () => {
        const vals = [...Array(10).fill(98), 92];
        const scored = rollingZScores(pts(vals), { window: 8, threshold: 3, minSamples: 8 });
        const last = scored[scored.length - 1];
        expect(last.anomaly).toBe(true);
        expect(last.z).toBe(-3); // clamped to -threshold
    });
});

describe('anomalyRuns', () => {
    it('groups contiguous anomalies into inclusive index ranges', () => {
        // a sustained step (indices 20-21 read as anomalous before the window
        // absorbs the new level) then, well after the window flushes, a lone spike
        const vals = [
            ...Array(20).fill(70), // 0-19 baseline
            150, 150,              // 20-21 step up
            ...Array(18).fill(70), // 22-39 baseline restored
            150,                   // 40 isolated spike
            70, 70, 70, 70,        // 41-44
        ];
        const scored = rollingZScores(pts(vals), { window: 10, threshold: 3, minSamples: 10 });
        const runs = anomalyRuns(scored);
        expect(runs).toEqual([[20, 21], [40, 40]]);
    });

    it('returns no runs when nothing is anomalous', () => {
        const scored = rollingZScores(pts(Array(12).fill(5)), { window: 4, threshold: 3 });
        expect(anomalyRuns(scored)).toEqual([]);
    });
});
