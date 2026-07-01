/**
 * Shared time formatting for chart axes, cursors/rollovers and session lists.
 *
 * The dashboard stores all telemetry timestamps as epoch seconds (UTC).
 * The user can choose to *render* those timestamps in the browser's local
 * zone or in UTC — this module only changes formatting, never the data.
 */

export type TimeDisplayMode = 'local' | 'utc';

/** localStorage key used to persist the preferred time display mode. */
export const TIME_DISPLAY_STORAGE_KEY = 'vscc.timeDisplay';

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/**
 * Formats an epoch-seconds timestamp as HH:MM:SS (optionally with .mmm)
 * in the requested display mode. Used by both the SciChart axis label
 * providers and the cursor/rollover formatters so they always agree.
 */
export const formatChartTime = (
    epochSeconds: number,
    mode: TimeDisplayMode,
    opts?: { millis?: boolean }
): string => {
    const date = new Date(epochSeconds * 1000);
    if (Number.isNaN(date.getTime())) return '';

    const h = mode === 'utc' ? date.getUTCHours() : date.getHours();
    const m = mode === 'utc' ? date.getUTCMinutes() : date.getMinutes();
    const s = mode === 'utc' ? date.getUTCSeconds() : date.getSeconds();
    let label = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;

    if (opts?.millis) {
        const ms = mode === 'utc' ? date.getUTCMilliseconds() : date.getMilliseconds();
        label += `.${ms.toString().padStart(3, '0')}`;
    }
    return label;
};

/**
 * Formats an epoch-seconds timestamp as "YYYY-MM-DD HH:MM:SS" in the
 * requested display mode. Used for session start times and the REC chip.
 */
export const formatFullTime = (epochSeconds: number, mode: TimeDisplayMode): string => {
    const date = new Date(epochSeconds * 1000);
    if (Number.isNaN(date.getTime())) return '';

    const y = mode === 'utc' ? date.getUTCFullYear() : date.getFullYear();
    const mo = (mode === 'utc' ? date.getUTCMonth() : date.getMonth()) + 1;
    const d = mode === 'utc' ? date.getUTCDate() : date.getDate();
    return `${y}-${pad2(mo)}-${pad2(d)} ${formatChartTime(epochSeconds, mode)}`;
};

/**
 * Short label for the zone badge: "UTC" in utc mode, otherwise the
 * browser's short zone name (e.g. "CEST", "PST"), falling back to "Local".
 */
export const getZoneLabel = (mode: TimeDisplayMode): string => {
    if (mode === 'utc') return 'UTC';
    try {
        return (
            new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
                .formatToParts(new Date())
                .find(p => p.type === 'timeZoneName')?.value ?? 'Local'
        );
    } catch {
        return 'Local';
    }
};

/** Reads the persisted time display mode; defaults to 'local'. */
export const loadTimeDisplay = (): TimeDisplayMode => {
    try {
        if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem(TIME_DISPLAY_STORAGE_KEY);
            if (stored === 'local' || stored === 'utc') return stored;
        }
    } catch {
        // localStorage unavailable (private mode, sandboxed iframe) — fall through
    }
    return 'local';
};

/** Persists the time display mode for future visits. */
export const saveTimeDisplay = (mode: TimeDisplayMode): void => {
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(TIME_DISPLAY_STORAGE_KEY, mode);
        }
    } catch {
        // Persisting is best-effort only
    }
};
