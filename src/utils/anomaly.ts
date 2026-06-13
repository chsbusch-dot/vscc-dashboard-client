/**
 * Rolling-window z-score anomaly detection for numeric trend streams.
 *
 * Each point is scored against the distribution of the samples that *precede*
 * it (a trailing window), so the score answers "is this reading unusual given
 * recent history?" rather than smoothing the current value into its own
 * baseline. No dependencies — unit-tested in anomaly.test.ts.
 */

export interface TrendPoint {
    /** timestamp, seconds */
    t: number;
    /** measured value */
    v: number;
}

export interface ScoredPoint extends TrendPoint {
    /** mean of the trailing window (equals v until enough history exists) */
    mean: number;
    /** population std of the trailing window */
    std: number;
    /** (v - mean) / std; 0 before the window has minSamples */
    z: number;
    /** true when the trailing window is established and |z| >= threshold */
    anomaly: boolean;
}

export interface RollingOptions {
    /** number of preceding samples used to estimate mean/std */
    window: number;
    /** |z| at or above this flags an anomaly */
    threshold: number;
    /** minimum preceding samples before any point can be flagged (default = window) */
    minSamples?: number;
}

const EPS = 1e-9;

/** Population mean and standard deviation of a slice. */
export function meanStd(xs: number[]): { mean: number; std: number } {
    const n = xs.length;
    if (n === 0) return { mean: 0, std: 0 };
    let sum = 0;
    for (const x of xs) sum += x;
    const mean = sum / n;
    let sq = 0;
    for (const x of xs) sq += (x - mean) * (x - mean);
    return { mean, std: Math.sqrt(sq / n) };
}

/**
 * Score every point against the up-to-`window` samples immediately before it.
 * A flat trailing window (std ≈ 0) flags any departure from the baseline as an
 * anomaly with z clamped to ±threshold so the display stays bounded.
 */
export function rollingZScores(points: TrendPoint[], opts: RollingOptions): ScoredPoint[] {
    const { window, threshold } = opts;
    const minSamples = opts.minSamples ?? window;
    const out: ScoredPoint[] = [];

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const start = Math.max(0, i - window);
        const prior = points.slice(start, i).map((q) => q.v);

        if (prior.length < minSamples) {
            out.push({ ...p, mean: p.v, std: 0, z: 0, anomaly: false });
            continue;
        }

        const { mean, std } = meanStd(prior);
        let z: number;
        let anomaly: boolean;
        if (std > EPS) {
            z = (p.v - mean) / std;
            anomaly = Math.abs(z) >= threshold;
        } else {
            // Trailing window is perfectly flat — any change is notable.
            const broke = Math.abs(p.v - mean) > EPS;
            z = broke ? Math.sign(p.v - mean) * threshold : 0;
            anomaly = broke;
        }
        out.push({ ...p, mean, std, z, anomaly });
    }
    return out;
}

/** Contiguous runs of anomalous points, as [startIndex, endIndex] inclusive pairs. */
export function anomalyRuns(scored: ScoredPoint[]): [number, number][] {
    const runs: [number, number][] = [];
    let runStart = -1;
    for (let i = 0; i < scored.length; i++) {
        if (scored[i].anomaly) {
            if (runStart === -1) runStart = i;
        } else if (runStart !== -1) {
            runs.push([runStart, i - 1]);
            runStart = -1;
        }
    }
    if (runStart !== -1) runs.push([runStart, scored.length - 1]);
    return runs;
}
