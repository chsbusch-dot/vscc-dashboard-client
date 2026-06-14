import { describe, it, expect } from 'vitest';
import { GAP_BREAK_SEC, bucketSecondsFor, binSeries, rawWithGapBreaks } from './seriesAgg';

describe('bucketSecondsFor', () => {
    it('maps the slider positions to bucket widths', () => {
        expect(bucketSecondsFor('raw')).toBe(0);
        expect(bucketSecondsFor('1min')).toBe(60);
        expect(bucketSecondsFor('5min')).toBe(300);
    });
});

describe('rawWithGapBreaks', () => {
    it('returns empty for empty input', () => {
        expect(rawWithGapBreaks([], [])).toEqual({ gx: [], gy: [] });
    });

    it('passes points through and converts null to NaN', () => {
        expect(rawWithGapBreaks([0, 1], [5, null])).toEqual({ gx: [0, 1], gy: [5, Number.NaN] });
    });

    it('inserts one NaN break when the gap exceeds gapSec', () => {
        // 5 - 1 = 4 > 2 → break just before x=5
        expect(rawWithGapBreaks([0, 1, 5], [1, 2, 3])).toEqual({
            gx: [0, 1, 4.999, 5],
            gy: [1, 2, Number.NaN, 3],
        });
    });

    it('does NOT break when the gap is exactly gapSec', () => {
        expect(rawWithGapBreaks([0, 2], [1, 2], GAP_BREAK_SEC)).toEqual({ gx: [0, 2], gy: [1, 2] });
    });

    it('breaks when the gap is just over gapSec', () => {
        const { gy } = rawWithGapBreaks([0, 2.001], [1, 2], GAP_BREAK_SEC);
        expect(gy).toEqual([1, Number.NaN, 2]);
    });
});

describe('binSeries', () => {
    it('returns empty for empty input', () => {
        expect(binSeries([], [], 60)).toEqual({ bx: [], by: [] });
    });

    it('averages points within a bucket and plots at the bucket centre', () => {
        // both in bucket 0 → one point at centre (0*60 + 30), value (10+20)/2
        expect(binSeries([0, 30], [10, 20], 60)).toEqual({ bx: [30], by: [15] });
    });

    it('inserts a NaN break across skipped buckets (centre-plotted)', () => {
        // bucket 0 then bucket 2 → break at (0+1)*60, points at 30 and 150
        expect(binSeries([0, 120], [10, 20], 60)).toEqual({
            bx: [30, 60, 150],
            by: [10, Number.NaN, 20],
        });
    });

    it('skips an all-null bucket and breaks the line across it', () => {
        // bucket 1 is null-only → no point, gap break inserted before bucket 2
        expect(binSeries([0, 60, 120], [10, null, 20], 60)).toEqual({
            bx: [30, 60, 150],
            by: [10, Number.NaN, 20],
        });
    });

    it('ignores null/NaN samples inside an otherwise-valid bucket', () => {
        expect(binSeries([0, 10, 20], [10, null, 20], 60)).toEqual({ bx: [30], by: [15] });
    });
});
