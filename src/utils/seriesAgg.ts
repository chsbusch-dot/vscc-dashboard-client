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
