import { describe, it, expect } from 'vitest';
import { fft, hann, powerSpectrum, bandPowers, spectralEdge, binToFreq, movingAverage } from './stft';

describe('movingAverage', () => {
    it('preserves a flat signal and conserves total energy', () => {
        const flat = Float64Array.from([5, 5, 5, 5, 5]);
        expect(Array.from(movingAverage(flat, 3))).toEqual([5, 5, 5, 5, 5]);
        const spike = Float64Array.from([0, 0, 9, 0, 0]);
        const sm = movingAverage(spike, 3);
        expect(sm[2]).toBeLessThan(9);            // spike spread out
        expect(sm[1]).toBeGreaterThan(0);
        const sum = (a: Float64Array) => a.reduce((s, v) => s + v, 0);
        expect(sum(sm)).toBeCloseTo(sum(spike), 5); // interior energy conserved
    });
    it('w<=1 is a no-op', () => {
        const a = Float64Array.from([1, 2, 3]);
        expect(movingAverage(a, 1)).toBe(a);
    });
});

describe('fft', () => {
    it('transforms a DC signal to a single bin', () => {
        const re = Float64Array.from([1, 1, 1, 1]);
        const im = new Float64Array(4);
        fft(re, im);
        expect(re[0]).toBeCloseTo(4, 6); // sum at DC
        expect(im[0]).toBeCloseTo(0, 6);
        for (let k = 1; k < 4; k++) {
            expect(Math.hypot(re[k], im[k])).toBeCloseTo(0, 6);
        }
    });

    it('puts a pure tone in the expected bin (Parseval-consistent)', () => {
        const N = 64, fs = 64, f = 8; // 8 Hz tone, bin = f*N/fs = 8
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = Math.cos((2 * Math.PI * f * i) / fs);
        fft(re, im);
        let peakBin = 0, peak = -1;
        for (let k = 0; k <= N / 2; k++) {
            const m = Math.hypot(re[k], im[k]);
            if (m > peak) { peak = m; peakBin = k; }
        }
        expect(peakBin).toBe((f * N) / fs);
    });
});

describe('powerSpectrum', () => {
    it('peaks at the windowed tone frequency', () => {
        const fftSize = 256, fs = 128, f = 10; // 10 Hz (alpha)
        const win = hann(fftSize);
        const samples: number[] = [];
        for (let i = 0; i < fftSize; i++) samples.push(Math.sin((2 * Math.PI * f * i) / fs));
        const p = powerSpectrum(samples, fftSize, win);
        let peakBin = 0, peak = -1;
        for (let k = 0; k < p.length; k++) if (p[k] > peak) { peak = p[k]; peakBin = k; }
        expect(binToFreq(peakBin, fftSize, fs)).toBeCloseTo(f, 0); // within ~1 Hz
    });
});

describe('bandPowers', () => {
    it('puts a 10 Hz tone in the alpha band', () => {
        const fftSize = 256, fs = 128;
        const win = hann(fftSize);
        const samples = Array.from({ length: fftSize }, (_, i) => Math.sin((2 * Math.PI * 10 * i) / fs));
        const bp = bandPowers(powerSpectrum(samples, fftSize, win), fftSize, fs);
        expect(bp.alpha).toBeGreaterThan(bp.delta);
        expect(bp.alpha).toBeGreaterThan(bp.theta);
        expect(bp.alpha).toBeGreaterThan(bp.beta);
    });

    it('puts a 2 Hz tone in the delta band', () => {
        const fftSize = 256, fs = 128;
        const win = hann(fftSize);
        const samples = Array.from({ length: fftSize }, (_, i) => Math.sin((2 * Math.PI * 2 * i) / fs));
        const bp = bandPowers(powerSpectrum(samples, fftSize, win), fftSize, fs);
        expect(bp.delta).toBeGreaterThan(bp.alpha);
        expect(bp.delta).toBeGreaterThan(bp.beta);
    });
});

describe('spectralEdge', () => {
    it('is low for a low-frequency-dominated spectrum', () => {
        const fftSize = 256, fs = 128;
        const win = hann(fftSize);
        const samples = Array.from({ length: fftSize }, (_, i) => Math.sin((2 * Math.PI * 3 * i) / fs));
        const sef = spectralEdge(powerSpectrum(samples, fftSize, win), fftSize, fs);
        expect(sef).toBeLessThan(8);
    });

    it('is higher when energy extends into beta', () => {
        const fftSize = 256, fs = 128;
        const win = hann(fftSize);
        const samples = Array.from({ length: fftSize }, (_, i) =>
            Math.sin((2 * Math.PI * 3 * i) / fs) + Math.sin((2 * Math.PI * 25 * i) / fs));
        const sef = spectralEdge(powerSpectrum(samples, fftSize, win), fftSize, fs);
        expect(sef).toBeGreaterThan(20);
    });

    it('returns 0 on silence', () => {
        const fftSize = 256, fs = 128;
        expect(spectralEdge(new Float64Array(fftSize / 2 + 1), fftSize, fs)).toBe(0);
    });
});
