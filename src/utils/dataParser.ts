import { type TelemetryRecord } from '../data/DashboardContext';
import { type PhysioId } from '../data/constants';

export const processRawData = (text: string): TelemetryRecord[] => {
    const trimmedText = text.trim();
    if (!trimmedText) return [];
    let rawRecords: any[] = [];
    try {
        const validJsonString = `[${trimmedText.replace(/\]\s*\[/g, '],[')}]`;
        rawRecords = JSON.parse(validJsonString).flat();
    } catch (error) {
        const lines = trimmedText.split(/\r?\n/);
        lines.forEach(line => {
            try { if (line.trim()) rawRecords.push(...JSON.parse(line)); } catch (e) { /* skip */ }
        });
    }
    return rawRecords.flatMap(r => {
        const rawTime = r.Timestamp || r.SystemLocalTime;
        const physioId = r.PhysioID;
        
        if (!rawTime || !physioId) return [];
        
        let val = r.Value;
        if (val === "-" || val === undefined) {
            val = null;
        } else {
            val = parseFloat(val);
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