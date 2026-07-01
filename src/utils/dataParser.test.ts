import { describe, it, expect } from 'vitest';
import { processRawData } from './dataParser';

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