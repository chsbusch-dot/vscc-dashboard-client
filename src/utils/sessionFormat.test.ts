import { describe, it, expect } from 'vitest';
import { formatDuration, formatBytes } from './sessionFormat';

describe('formatDuration', () => {
    it('formats sub-minute durations as seconds', () => {
        expect(formatDuration(0)).toBe('0s');
        expect(formatDuration(42)).toBe('42s');
    });

    it('formats minutes with padded seconds', () => {
        expect(formatDuration(330)).toBe('5m 30s');
        expect(formatDuration(61)).toBe('1m 01s');
    });

    it('formats hours with padded minutes', () => {
        expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3h 05m');
        expect(formatDuration(26 * 3600 + 30 * 60)).toBe('26h 30m');
    });

    it('rounds fractional seconds', () => {
        expect(formatDuration(59.6)).toBe('1m 00s');
    });

    it('returns -- for invalid input', () => {
        expect(formatDuration(-5)).toBe('--');
        expect(formatDuration(Number.NaN)).toBe('--');
    });
});

describe('formatBytes', () => {
    it('keeps small values in bytes', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(123)).toBe('123 B');
    });

    it('scales through KB/MB/GB', () => {
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
        expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
    });

    it('drops decimals for three-digit values', () => {
        expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    });

    it('returns -- for invalid input', () => {
        expect(formatBytes(-1)).toBe('--');
        expect(formatBytes(Number.NaN)).toBe('--');
    });
});
