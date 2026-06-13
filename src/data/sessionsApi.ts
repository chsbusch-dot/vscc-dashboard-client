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

export interface SessionSignals {
    /** physio_ids with numeric (trend) data in the session */
    numerics: string[];
    /** physio_ids with waveform data in the session */
    waveforms: string[];
}

export interface WaveformQuality {
    physio_id: string;
    /** nominal capture rate: mode of per-second sample counts */
    rate_hz: number;
    samples: number;
    expected_samples: number;
    missing_samples: number;
    /** null when the signal has no measurable span */
    completeness_pct: number | null;
    gap_count: number;
    longest_gap_s: number;
    /** epoch seconds */
    first_sample: number;
    last_sample: number;
}

export interface NumericQuality {
    physio_id: string;
    samples: number;
    first_sample: number;
    last_sample: number;
}

export interface SessionQuality {
    session: SessionInfo;
    waveforms: WaveformQuality[];
    numerics: NumericQuality[];
}

export interface SourceIntegrity {
    clock_offset_seconds: number | null;
    sequence_regressions: number;
    samples_seen: number;
    last_seen_age_seconds: number | null;
}

export interface StatusResponse {
    capture_state: 'live' | 'stalled' | 'offline' | 'no_data';
    last_data_age_seconds: number | null;
    db_lag_seconds: number | null;
    db_size_bytes: number | null;
    worker_uptime_seconds: number | null;
    buffer_backlog: { numerics: number; waveforms: number };
    inserted_total: { patient_numerics: number; patient_waveforms: number };
    sources: Record<string, SourceIntegrity>;
    thresholds: { stall_s: number; offline_s: number };
}

export interface CaptureConfig {
    /** empty string = the capture container's MONITOR_IP environment default */
    monitor_ip: string;
    /** numerics export interval, seconds: '1' | '10' | '60' | '300' */
    interval: string;
    /** VSCapture waveform set, '0'..'12' (12 = all waves) */
    waveset: string;
    scale: string;
    devid: string;
    config_file?: string;
}

export interface PutCaptureConfigResult extends Partial<CaptureConfig> {
    ok: boolean;
    error?: string;
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

/**
 * POST /api/sessions — closes any open recording session and creates + returns
 * a new recording one (the backend moves the session boundary).
 */
export const createSession = (label?: string): Promise<SessionInfo> =>
    request<SessionInfo>(
        '/api/sessions',
        label === undefined ? { method: 'POST' } : jsonInit('POST', { label })
    );

/** GET /api/sessions/{id}/signals — physio_id lists present in the session. */
export const fetchSessionSignals = (id: number): Promise<SessionSignals> =>
    request<SessionSignals>(`/api/sessions/${id}/signals`);

/**
 * URL of GET /api/sessions/{id}/download (streaming zip, Content-Disposition
 * set by the server). Packages can be several GB, so navigate the browser to
 * this URL for a native download — never fetch it into memory.
 */
export const sessionDownloadUrl = (id: number, deidentify = false): string =>
    `${API_BASE}/api/sessions/${id}/download${deidentify ? '?deidentify=1' : ''}`;

/**
 * URL of GET /api/sessions/download-all — every session's package in one
 * streamed zip. Same rule as above: navigate, never fetch.
 */
export const sessionsDownloadAllUrl = (): string =>
    `${API_BASE}/api/sessions/download-all`;

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

/** GET /api/sessions/{id}/quality — per-waveform loss statistics + numeric counts. */
export const fetchSessionQuality = (id: number): Promise<SessionQuality> =>
    request<SessionQuality>(`/api/sessions/${id}/quality`);

/** GET /api/status — worker/capture health snapshot. */
export const fetchStatus = (): Promise<StatusResponse> => request<StatusResponse>('/api/status');

export interface Annotation {
    id: number;
    /** epoch seconds */
    time: number;
    label: string;
    session_id: number | null;
}

/** POST /api/annotations — add an event marker (time defaults to now on the server). */
export const createAnnotation = (
    payload: { label: string; time?: number; session_id?: number | null }
): Promise<Annotation> => request<Annotation>('/api/annotations', jsonInit('POST', payload));

/** GET /api/annotations — newest first; optional session/time filters. */
export const fetchAnnotations = (params?: { session_id?: number; from_ts?: number; to_ts?: number }): Promise<Annotation[]> => {
    const q = new URLSearchParams();
    if (params?.session_id != null) q.set('session_id', String(params.session_id));
    if (params?.from_ts != null) q.set('from_ts', String(params.from_ts));
    if (params?.to_ts != null) q.set('to_ts', String(params.to_ts));
    const qs = q.toString();
    return request<Annotation[]>(`/api/annotations${qs ? `?${qs}` : ''}`);
};

/** DELETE /api/annotations/{id} */
export const deleteAnnotation = (id: number): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/api/annotations/${id}`, { method: 'DELETE' });

/**
 * URL of GET /api/sessions/{id}/edf — waveforms as EDF, regenerated on every
 * call. Navigate the browser to it for a native download (same rule as the
 * zip downloads: never fetch it into memory).
 */
export const sessionEdfUrl = (id: number): string => `${API_BASE}/api/sessions/${id}/edf`;

/** GET /api/capture-config — current VSCapture service settings. */
export const fetchCaptureConfig = (): Promise<CaptureConfig> =>
    request<CaptureConfig>('/api/capture-config');

/**
 * PUT /api/capture-config — persist VSCapture service settings. Applying a
 * change recycles the capture process; data resumes within ~2 minutes.
 */
export const putCaptureConfig = (
    payload: Partial<Omit<CaptureConfig, 'config_file'>>
): Promise<PutCaptureConfigResult> =>
    request<PutCaptureConfigResult>('/api/capture-config', jsonInit('PUT', payload));
