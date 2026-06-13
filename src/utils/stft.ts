// Pure DSP for the EEG spectrogram — no dependencies, unit-tested in stft.test.ts.
// Short-Time Fourier Transform: window → FFT → one-sided power spectrum, plus
// EEG band powers (δ/θ/α/β) and spectral edge frequency.

/** In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` length must be a power of 2. */
export function fft(re: Float64Array, im: Float64Array): void {
    const n = re.length;
    // Bit-reversal permutation.
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const tr = re[i]; re[i] = re[j]; re[j] = tr;
            const ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len >> 1; k++) {
                const a = i + k, b = a + (len >> 1);
                const tr = re[b] * cr - im[b] * ci;
                const ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti;
                re[a] += tr; im[a] += ti;
                const ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
    }
}

/** Hann window of length n. */
export function hann(n: number): Float64Array {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    return w;
}

export function binToFreq(bin: number, fftSize: number, fs: number): number {
    return (bin * fs) / fftSize;
}

/**
 * Centered moving-average over `w` bins — trades spectral resolution for lower
 * variance (the "smoothing" a clinical spectrogram applies to reach ~1 Hz
 * resolution from a finer FFT). w ≤ 1 returns the input unchanged.
 */
export function movingAverage(arr: Float64Array, w: number): Float64Array {
    if (w <= 1) return arr;
    const out = new Float64Array(arr.length);
    const half = Math.floor(w / 2);
    for (let i = 0; i < arr.length; i++) {
        let s = 0, n = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) { s += arr[j]; n++; }
        out[i] = s / n;
    }
    return out;
}

/**
 * One-sided power spectrum of the most recent `fftSize` samples: mean-removed,
 * Hann-windowed, |FFT|². Returns power for bins 0..fftSize/2.
 */
export function powerSpectrum(samples: ArrayLike<number>, fftSize: number, win: Float64Array): Float64Array {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    const start = Math.max(0, samples.length - fftSize);
    let mean = 0;
    for (let i = 0; i < fftSize; i++) mean += samples[start + i] ?? 0;
    mean /= fftSize;
    for (let i = 0; i < fftSize; i++) re[i] = ((samples[start + i] ?? 0) - mean) * win[i];
    fft(re, im);
    const half = fftSize >> 1;
    const p = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    return p;
}

export const EEG_BANDS: ReadonlyArray<readonly [name: string, lo: number, hi: number]> = [
    ['delta', 0.5, 4],
    ['theta', 4, 8],
    ['alpha', 8, 13],
    ['beta', 13, 30],
];

/** Summed power within each EEG band (δ/θ/α/β). */
export function bandPowers(power: Float64Array, fftSize: number, fs: number): Record<string, number> {
    const out: Record<string, number> = { delta: 0, theta: 0, alpha: 0, beta: 0 };
    for (let k = 0; k < power.length; k++) {
        const f = binToFreq(k, fftSize, fs);
        for (const [name, lo, hi] of EEG_BANDS) {
            if (f >= lo && f < hi) { out[name] += power[k]; break; }
        }
    }
    return out;
}

/**
 * Spectral edge frequency: the frequency below which `pct` (default 95%) of the
 * total power in [0, fMax] lies. A standard anaesthetic-depth EEG measure.
 */
export function spectralEdge(power: Float64Array, fftSize: number, fs: number, pct = 0.95, fMax = 30): number {
    const kMax = Math.min(power.length - 1, Math.floor((fMax * fftSize) / fs));
    let total = 0;
    for (let k = 0; k <= kMax; k++) total += power[k];
    if (total <= 0) return 0;
    let cum = 0;
    for (let k = 0; k <= kMax; k++) {
        cum += power[k];
        if (cum >= pct * total) return binToFreq(k, fftSize, fs);
    }
    return binToFreq(kMax, fftSize, fs);
}
