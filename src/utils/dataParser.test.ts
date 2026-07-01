import { describe, it, expect } from 'vitest';
import { processRawData, selectFreshRecords } from './dataParser';
import type { TelemetryRecord } from '../data/DashboardContext';

const rec = (physio_id: string, time: number, value = 1): TelemetryRecord =>
    ({ physio_id: physio_id as TelemetryRecord['physio_id'], time, value, device_id: 'mp50' });

describe('processRawData', () => {
    it('should correctly parse standard valid JSON telemetry', () => {
        const input = '[{"Timestamp": "14-03-2026 04:39:00.123", "PhysioID": "NOM_PLETH", "Value": "98", "DeviceID": "mp50"}]';
        const result = processRawData(input);
        
        expect(result).toHaveLength(1);
        expect(result[0].physio_id).toBe('NOM_PLETH');
        expect(result[0].value).toBe(98);
        expect(result[0].device_id).toBe('mp50');
        expect(result[0].time).toBe(Date.UTC(2026, 2, 14, 4, 39, 0, 123) / 1000); // Note: Month is 0-indexed in JS Date.UTC
    });

    it('should convert missing values or "-" to null (Gap Rule)', () => {
        const input = '[{"Timestamp": "14-03-2026 04:39:00", "PhysioID": "NOM_RESP", "Value": "-"}]';
        const result = processRawData(input);
        
        expect(result).toHaveLength(1);
        expect(result[0].value).toBeNull();
    });

    it('should gracefully skip invalid records or unparseable lines', () => {
        const input = `[{"Timestamp": "14-03-2026 04:39:00", "PhysioID": "NOM_RESP", "Value": "10"}]\ninvalid data line\n[{"Timestamp": "14-03-2026 04:39:01", "PhysioID": "NOM_RESP", "Value": "11"}]`;
        const result = processRawData(input);
        
        expect(result).toHaveLength(2);
        expect(result[0].value).toBe(10);
        expect(result[1].value).toBe(11);
    });

    it('should stitch back-to-back JSON arrays ("][" seam)', () => {
        // The monitor concatenates array chunks with no separator; the parser
        // must split "][" into distinct records rather than fail the whole blob.
        const input = '[{"Timestamp":"14-03-2026 04:39:00","PhysioID":"NOM_PLETH","Value":"1"}][{"Timestamp":"14-03-2026 04:39:01","PhysioID":"NOM_PLETH","Value":"2"}]';
        const result = processRawData(input);
        expect(result).toHaveLength(2);
        expect(result.map(r => r.value)).toEqual([1, 2]);
    });

    it('should return an empty array for empty or whitespace input', () => {
        expect(processRawData('')).toEqual([]);
        expect(processRawData('   \n  ')).toEqual([]);
    });

    it('should skip records missing a PhysioID or timestamp', () => {
        const input = '[{"Timestamp":"14-03-2026 04:39:00","Value":"5"},{"PhysioID":"NOM_RESP","Value":"5"}]';
        expect(processRawData(input)).toHaveLength(0);
    });

    it('should skip records whose timestamp is not DD-MM-YYYY HH:MM:SS', () => {
        const input = '[{"Timestamp":"2026-03-14T04:39:00","PhysioID":"NOM_RESP","Value":"5"}]';
        expect(processRawData(input)).toHaveLength(0);
    });

    it('should left-pad fractional seconds to milliseconds', () => {
        // "04:39:00.5" is 500ms, not 5ms.
        const input = '[{"Timestamp":"14-03-2026 04:39:00.5","PhysioID":"NOM_PLETH","Value":"1"}]';
        const result = processRawData(input);
        expect(result[0].time).toBe(Date.UTC(2026, 2, 14, 4, 39, 0, 500) / 1000);
    });

    it('should default device_id to mp50 when DeviceID is absent', () => {
        const input = '[{"Timestamp":"14-03-2026 04:39:00","PhysioID":"NOM_PLETH","Value":"1"}]';
        expect(processRawData(input)[0].device_id).toBe('mp50');
    });
});

describe('selectFreshRecords', () => {
    it('passes everything on the first poll and seeds the high-water map', () => {
        const hw: Record<string, number> = {};
        const out = selectFreshRecords([rec('NOM_PLETH', 10), rec('NOM_RESP', 12)], hw);
        expect(out).toHaveLength(2);
        expect(hw).toEqual({ NOM_PLETH: 10, NOM_RESP: 12 });
    });

    it('returns empty for empty input and leaves the map untouched', () => {
        const hw: Record<string, number> = { NOM_PLETH: 10 };
        expect(selectFreshRecords([], hw)).toEqual([]);
        expect(hw).toEqual({ NOM_PLETH: 10 });
    });

    it('drops re-fetched duplicates and keeps only strictly-newer records', () => {
        const hw: Record<string, number> = {};
        selectFreshRecords([rec('NOM_PLETH', 10), rec('NOM_PLETH', 11)], hw);
        // Next poll re-sends 10,11 (dupes) plus a new 12 — only 12 survives.
        const out = selectFreshRecords(
            [rec('NOM_PLETH', 10), rec('NOM_PLETH', 11), rec('NOM_PLETH', 12)], hw);
        expect(out.map(r => r.time)).toEqual([12]);
        expect(hw.NOM_PLETH).toBe(12);
    });

    it('treats a same-timestamp record as an already-seen re-fetch (strict >)', () => {
        const hw: Record<string, number> = {};
        selectFreshRecords([rec('NOM_PLETH', 100)], hw);
        // Intentional for the one-reading-per-interval JSON source: a record at the
        // prior max second is a re-fetch, not a new sample, so it is dropped.
        expect(selectFreshRecords([rec('NOM_PLETH', 100)], hw)).toEqual([]);
        expect(selectFreshRecords([rec('NOM_PLETH', 101)], hw).map(r => r.time)).toEqual([101]);
    });

    it('tracks the high-water mark per channel independently', () => {
        const hw: Record<string, number> = { NOM_PLETH: 100 };
        // NOM_RESP is new and lagging behind PLETH's mark — it must still pass.
        const out = selectFreshRecords([rec('NOM_PLETH', 99), rec('NOM_RESP', 5)], hw);
        expect(out.map(r => r.physio_id)).toEqual(['NOM_RESP']);
        expect(hw).toEqual({ NOM_PLETH: 100, NOM_RESP: 5 });
    });
});