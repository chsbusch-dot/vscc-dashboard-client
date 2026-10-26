/**
 * Pure helpers for the live-trend aggregation view (the RT / 1m / 5m slider).
 * Extracted from ChartContainer so they can be unit-tested independently of the
 * imperative SciChart boundary. Only low-frequency numeric trends pass through
 * here — waveforms are never binned.
 */

/** Gap longer than this (seconds) breaks the line with a NaN, both on live append
 *  and on buffer rebuild — kept in one place so the two paths can't drift apart. */
export const GAP_BREAK_SEC = 2;

/** Aggregation bucket width in seconds for the live trend view; 0 = raw (no binning). */
export const bucketSecondsFor = (agg: 'raw' | '1min' | '5min'): number =>
    agg === '1min' ? 60 : agg === '5min' ? 300 : 0;

/**
 * Gap threshold for data that arrives already aggregated (windowed replay at
 * 1-/5-min resolution). Consecutive buckets sit a full bucket apart, so the raw
 * 2 s rule would break the line between every pair and nothing would draw; one
 * and a half buckets still breaks across a missing bucket.
 */
export const gapBreakSecFor = (agg: 'raw' | '1min' | '5min'): number =>
    Math.max(GAP_BREAK_SEC, 1.5 * bucketSecondsFor(agg));

/** Chart legend for the gap shading, naming the threshold actually in force. */
export const gapLegendFor = (agg: 'raw' | '1min' | '5min'): string => {
    const sec = gapBreakSecFor(agg);
    return `signal gap (>${sec < 120 ? `${sec} s` : `${sec / 60} min`})`;
};

/**
 * Raw passthrough that re-inserts the same `>gapSec` NaN line-breaks the
 * incremental append path draws, so rebuilding a series from the buffer (e.g.
 * switching back to RT) reproduces signal-dropout gaps instead of connecting
 * straight across them. `null` y values become NaN.
 */
export const rawWithGapBreaks = (
    x: number[],
    y: (number | null)[],
    gapSec: number = GAP_BREAK_SEC,
): { gx: number[]; gy: number[] } => {
    const gx: number[] = [];
    const gy: number[] = [];
    let lastX = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < x.length; i++) {
        const cx = x[i];
        if (lastX !== Number.NEGATIVE_INFINITY && cx - lastX > gapSec) {
            gx.push(cx - 0.001);
            gy.push(Number.NaN);
        }
        gx.push(cx);
        gy.push(y[i] === null ? Number.NaN : (y[i] as number));
        lastX = cx;
    }
    return { gx, gy };
};

/**
 * Min/max envelope rows for an aggregated replay waveform (an averaged ECG is a
 * flat line, so the bucket range is drawn instead). Continues from `lastX`, the
 * last x already in the series: points at or before it are dropped so the
 * series stays ascending, and a gap over `gapSec` gets the same NaN break as
 * rawWithGapBreaks. Returns the gaps it broke across, for shading.
 */
export const bandWithGapBreaks = (
    x: number[],
    lo: (number | null)[],
    hi: (number | null)[],
    gapSec: number,
    lastX: number = Number.NEGATIVE_INFINITY,
): { bx: number[]; blo: number[]; bhi: number[]; gaps: { start: number; end: number }[] } => {
    const bx: number[] = [];
    const blo: number[] = [];
    const bhi: number[] = [];
    const gaps: { start: number; end: number }[] = [];
    let prev = lastX;
    for (let i = 0; i < x.length; i++) {
        const cx = x[i];
        if (cx <= prev) continue;
        if (prev !== Number.NEGATIVE_INFINITY && cx - prev > gapSec) {
            gaps.push({ start: prev, end: cx });
            bx.push(cx - 0.001);
            blo.push(Number.NaN);
            bhi.push(Number.NaN);
        }
        bx.push(cx);
        blo.push(lo[i] === null ? Number.NaN : lo[i] as number);
        bhi.push(hi[i] === null ? Number.NaN : hi[i] as number);
        prev = cx;
    }
    return { bx, blo, bhi, gaps };
};

/**
 * Bins a raw (x in epoch seconds, y) numeric trend into fixed-width time-bucket
 * averages for the live aggregation view. Each bucket is plotted at its CENTER
 * (so the newest bin sits near the live right edge — start-of-bucket would lag a
 * full bucket behind and fall off-screen). A NaN point is inserted across skipped
 * buckets so the line breaks over gaps; buckets with no valid value are skipped.
 * Caller must pass bucketSec > 0 (raw mode routes through rawWithGapBreaks).
 */
export const binSeries = (
    x: number[],
    y: (number | null)[],
    bucketSec: number,
): { bx: number[]; by: number[] } => {
    const bx: number[] = [];
    const by: number[] = [];
    let curIdx = Number.NaN;
    let sum = 0;
    let cnt = 0;
    let lastIdx = Number.NaN;
    const flush = () => {
        if (cnt === 0) return;
        if (!Number.isNaN(lastIdx) && curIdx - lastIdx > 1) {
            bx.push((lastIdx + 1) * bucketSec);
            by.push(Number.NaN); // break the line across empty buckets
        }
        bx.push(curIdx * bucketSec + bucketSec / 2);
        by.push(sum / cnt);
        lastIdx = curIdx;
    };
    for (let i = 0; i < x.length; i++) {
        const idx = Math.floor(x[i] / bucketSec);
        if (idx !== curIdx) {
            flush();
            curIdx = idx;
            sum = 0;
            cnt = 0;
        }
        const v = y[i];
        if (v !== null && !Number.isNaN(v)) {
            sum += v;
            cnt++;
        }
    }
    flush();
    return { bx, by };
};
