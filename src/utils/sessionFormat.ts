/**
 * Small pure formatting helpers for the Sessions and Settings features.
 */

import { PHYSIO_META } from '../data/constants';

// Widened view of PHYSIO_META so arbitrary backend physio_id strings can be looked up.
const SIGNAL_META: Record<string, { name?: string } | undefined> = PHYSIO_META;

/**
 * Maps a backend physio_id to its friendly display name from PHYSIO_META,
 * falling back to the raw id for signals we have no metadata for.
 */
export const signalDisplayLabel = (physioId: string): string =>
    SIGNAL_META[physioId]?.name ?? physioId;

/**
 * Formats a duration given in seconds as a compact human string,
 * e.g. 42 -> "42s", 330 -> "5m 30s", 11100 -> "3h 05m".
 */
export const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '--';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
    return `${s}s`;
};

/**
 * Compact sample-count formatting for the quality table,
 * e.g. 950 -> "950", 343744 -> "344k", 2062528 -> "2.06M".
 */
export const formatCount = (count: number): string => {
    if (!Number.isFinite(count) || count < 0) return '--';
    if (count < 1000) return String(Math.round(count));
    if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
    return `${(count / 1_000_000).toFixed(2)}M`;
};

/**
 * Pretty-prints a byte count, e.g. 2048 -> "2.0 KB", 5368709120 -> "5.0 GB".
 */
export const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return '--';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'] as const;
    let value = bytes;
    let unit: string = 'B';
    for (const u of units) {
        if (value < 1024) break;
        value /= 1024;
        unit = u;
    }
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
};
