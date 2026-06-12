import { type TelemetryRecord } from '../data/DashboardContext';
import { type PhysioId } from '../data/constants';

/**
 * Shape of one record in the VSCapture JSON export (DataExportVSC.json).
 * The export is line-delimited JSON arrays of these records; every field is a
 * string and "Value" may be "-" meaning no reading.
 */
export interface VscRawRecord {
    Timestamp?: string;
    Relativetimestamp?: string;
    SystemLocalTime?: string;
    PhysioID?: string;
    Value?: string;
    DeviceID?: string;
}

const isOptionalString = (value: unknown): value is string | undefined =>
    value === undefined || typeof value === 'string';

export const isVscRawRecord = (x: unknown): x is VscRawRecord => {
    if (typeof x !== 'object' || x === null) return false;
    const rec = x as Record<string, unknown>;
    return isOptionalString(rec.Timestamp)
        && isOptionalString(rec.Relativetimestamp)
        && isOptionalString(rec.SystemLocalTime)
        && isOptionalString(rec.PhysioID)
        && isOptionalString(rec.Value)
        && isOptionalString(rec.DeviceID);
};

/**
 * Shape of a single live telemetry payload published over MQTT/WebSocket:
 * time is epoch seconds, value null means no reading.
 */
export interface MqttTelemetryMessage {
    time: number;
    physio_id: string;
    value: number | null;
    device_id?: string;
}

export const isMqttTelemetryMessage = (x: unknown): x is MqttTelemetryMessage => {
    if (typeof x !== 'object' || x === null) return false;
    const rec = x as Record<string, unknown>;
    return typeof rec.time === 'number'
        && typeof rec.physio_id === 'string'
        && (rec.value === null || typeof rec.value === 'number')
        && isOptionalString(rec.device_id);
};

export const processRawData = (text: string): TelemetryRecord[] => {
    const trimmedText = text.trim();
    if (!trimmedText) return [];
    let rawRecords: unknown[] = [];
    try {
        const validJsonString = `[${trimmedText.replace(/\]\s*\[/g, '],[')}]`;
        const parsed: unknown = JSON.parse(validJsonString);
        if (Array.isArray(parsed)) rawRecords = (parsed as unknown[]).flat();
    } catch {
        const lines = trimmedText.split(/\r?\n/);
        lines.forEach(line => {
            try {
                if (line.trim()) {
                    const parsedLine: unknown = JSON.parse(line);
                    if (Array.isArray(parsedLine)) rawRecords.push(...(parsedLine as unknown[]));
                }
            } catch { /* skip */ }
        });
    }
    return rawRecords.flatMap(r => {
        if (!isVscRawRecord(r)) return [];
        const rawTime = r.Timestamp || r.SystemLocalTime;
        const physioId = r.PhysioID;

        if (!rawTime || !physioId) return [];

        const rawValue = r.Value;
        let val: number | null;
        if (rawValue === "-" || rawValue === undefined) {
            val = null;
        } else {
            val = parseFloat(rawValue);
            if (isNaN(val)) val = null;
        }

        const match = rawTime.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!match) return [];
        const [, d, m, y, h, min, s, msStr] = match;
        const ms = msStr ? parseInt(msStr.padEnd(3, '0')) : 0;
        const utcTimeMs = Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s), ms);
        if (isNaN(utcTimeMs)) return [];
        return [{
            time: utcTimeMs / 1000,
            physio_id: physioId as PhysioId,
            value: val,
            device_id: r.DeviceID || 'mp50'
        }];
    });
};
