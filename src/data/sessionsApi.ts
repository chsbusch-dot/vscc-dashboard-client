import { VSCC_HOST } from './DashboardContext';

/** Base URL of the vscc-mqtt-server REST API. */
export const API_BASE = `http://${VSCC_HOST}:8001`;

// --- API shapes (mirroring the deployed backend) ---

export interface SessionInfo {
    id: number;
    label: string | null;
    subject_code: string | null;
    notes: string | null;
    /** epoch seconds */
    started_at: number;
    /** epoch seconds, null while the session is still recording */
    ended_at: number | null;
    recording: boolean;
}

export interface SessionDataRecord {
    time: number;
    physio_id: string;
    value: number | null;
}

export interface SessionDataResponse {
    session: SessionInfo;
    /** true when waveforms were 1-min averaged because the span exceeds 15 min */
    aggregated_waveforms: boolean;
    numerics: SessionDataRecord[];
    waveforms: SessionDataRecord[];
}

export interface DeleteSessionResult {
    ok: boolean;
    deleted_data_rows?: number;
    error?: string;
}

export interface ExportSessionResult {
    ok: boolean;
    path?: string;
    files?: string[];
    numeric_rows?: number;
    waveform_rows?: number;
    error?: string;
}

export interface BackendSettings {
    retention_hours: number;
    session_gap_minutes: number;
    db_size_bytes: number;
    disk: {
        total_bytes: number;
        free_bytes: number;
    };
    sessions_dir: string;
    parquet_available: boolean;
}

export interface PutSettingsResult {
    ok: boolean;
    error?: string;
    retention_hours?: number;
    session_gap_minutes?: number;
}

// --- Fetch helpers ---

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, init);
    const body = (await response.json().catch(() => null)) as T | null;
    if (!response.ok) {
        const detail =
            body && typeof body === 'object' && 'error' in body && (body as { error?: unknown }).error
                ? String((body as { error?: unknown }).error)
                : `HTTP ${response.status}`;
        throw new Error(detail);
    }
    if (body === null) throw new Error('Empty response from backend');
    return body;
}

const jsonInit = (method: string, payload: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
});

/** GET /api/sessions — newest first. */
export const fetchSessions = (): Promise<SessionInfo[]> => request<SessionInfo[]>('/api/sessions');

/** PATCH /api/sessions/{id} — returns the updated session. */
export const patchSession = (
    id: number,
    payload: { label?: string; subject_code?: string; notes?: string }
): Promise<SessionInfo> => request<SessionInfo>(`/api/sessions/${id}`, jsonInit('PATCH', payload));

/** GET /api/sessions/{id}/data */
export const fetchSessionData = (id: number): Promise<SessionDataResponse> =>
    request<SessionDataResponse>(`/api/sessions/${id}/data`);

/** POST /api/sessions/{id}/export */
export const exportSession = (id: number): Promise<ExportSessionResult> =>
    request<ExportSessionResult>(`/api/sessions/${id}/export`, { method: 'POST' });

/**
 * DELETE /api/sessions/{id}?purge_data=true
 * The backend answers {ok:false, error} for a recording session — surface
 * that as a result instead of throwing so the UI can show the message.
 */
export async function deleteSession(id: number): Promise<DeleteSessionResult> {
    const response = await fetch(`${API_BASE}/api/sessions/${id}?purge_data=true`, { method: 'DELETE' });
    const body = (await response.json().catch(() => null)) as DeleteSessionResult | null;
    if (body && typeof body.ok === 'boolean') return body;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true };
}

/** GET /api/settings */
export const fetchSettings = (): Promise<BackendSettings> => request<BackendSettings>('/api/settings');

/** PUT /api/settings */
export const putSettings = (
    payload: { retention_hours?: number; session_gap_minutes?: number }
): Promise<PutSettingsResult> => request<PutSettingsResult>('/api/settings', jsonInit('PUT', payload));
