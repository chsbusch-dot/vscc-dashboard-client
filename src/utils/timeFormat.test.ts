import { describe, it, expect } from 'vitest';
import { formatChartTime, formatFullTime, getZoneLabel } from './timeFormat';

// Pin the process timezone so "local" assertions are deterministic.
// Node >= 16 re-reads TZ dynamically, so this affects all Date calls below.
// America/Chicago is UTC-5 (CDT) on the chosen June date.
process.env.TZ = 'America/Chicago';

// 2026-06-12T15:04:05.250Z
const EPOCH = Date.UTC(2026, 5, 12, 15, 4, 5, 250) / 1000;

describe('formatChartTime', () => {
    it('formats in UTC mode using getUTC* semantics', () => {
        expect(formatChartTime(EPOCH, 'utc')).toBe('15:04:05');
        expect(formatChartTime(EPOCH, 'utc', { millis: true })).toBe('15:04:05.250');
    });

    it('formats in local mode using local Date methods', () => {
        expect(formatChartTime(EPOCH, 'local')).toBe('10:04:05'); // CDT = UTC-5
        expect(formatChartTime(EPOCH, 'local', { millis: true })).toBe('10:04:05.250');
    });

    it('only changes the rendering, never the underlying value', () => {
        // Same epoch rendered twice — the strings differ but reuse the input as-is
        expect(formatChartTime(EPOCH, 'utc')).not.toBe(formatChartTime(EPOCH, 'local'));
    });

    it('pads single-digit fields to two digits', () => {
        const earlyMorning = Date.UTC(2026, 5, 12, 3, 7, 9, 5) / 1000;
        expect(formatChartTime(earlyMorning, 'utc')).toBe('03:07:09');
        expect(formatChartTime(earlyMorning, 'utc', { millis: true })).toBe('03:07:09.005');
    });

    it('returns an empty string for non-finite input', () => {
        expect(formatChartTime(Number.NaN, 'utc')).toBe('');
        expect(formatChartTime(Number.POSITIVE_INFINITY, 'local')).toBe('');
    });
});

describe('formatFullTime', () => {
    it('formats date and time in UTC mode', () => {
        expect(formatFullTime(EPOCH, 'utc')).toBe('2026-06-12 15:04:05');
    });

    it('formats date and time in local mode', () => {
        expect(formatFullTime(EPOCH, 'local')).toBe('2026-06-12 10:04:05');
    });
});

describe('getZoneLabel', () => {
    it('returns UTC in utc mode', () => {
        expect(getZoneLabel('utc')).toBe('UTC');
    });

    it('returns a non-empty browser zone name in local mode', () => {
        const label = getZoneLabel('local');
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
    });
});
