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
});