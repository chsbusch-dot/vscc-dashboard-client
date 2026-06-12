import React, { useEffect, useState } from 'react';
import { Chip, Tooltip, Box, Typography, Divider } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { fetchStatus, type StatusResponse } from '../data/sessionsApi';

const POLL_MS = 5000;

type Severity = 'success' | 'warning' | 'default' | 'error';

const STATE_META: Record<StatusResponse['capture_state'], { label: string; color: Severity }> = {
    live: { label: 'Live', color: 'success' },
    stalled: { label: 'Stalled', color: 'warning' },
    offline: { label: 'Offline', color: 'error' },
    no_data: { label: 'No data', color: 'default' },
};

const fmtAge = (s: number | null): string => {
    if (s === null || !Number.isFinite(s)) return '—';
    if (s < 90) return `${Math.round(s)}s`;
    if (s < 5400) return `${Math.round(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
};

/**
 * Header health chip: polls GET /api/status and shows capture liveness with a
 * tooltip breakdown (last-data age, DB lag, per-source clock offset). Read-only
 * observability — never a clinical alarm.
 */
const HealthIndicator: React.FC = () => {
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [reachable, setReachable] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            try {
                const s = await fetchStatus();
                if (!cancelled) { setStatus(s); setReachable(true); }
            } catch {
                if (!cancelled) setReachable(false);
            }
        };
        void tick();
        const id = window.setInterval(() => { void tick(); }, POLL_MS);
        return () => { cancelled = true; window.clearInterval(id); };
    }, []);

    if (!reachable) {
        return (
            <Tooltip title="Cannot reach the backend status endpoint">
                <Chip size="small" icon={<FavoriteIcon />} label="Backend ?" color="error" variant="outlined"
                    sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.6)', '& .MuiChip-icon': { color: 'inherit' } }} />
            </Tooltip>
        );
    }
    if (!status) return null;

    const meta = STATE_META[status.capture_state];
    const sources = Object.entries(status.sources);
    const tip = (
        <Box sx={{ p: 0.5 }}>
            <Typography variant="caption" display="block">Last data: {fmtAge(status.last_data_age_seconds)} ago</Typography>
            <Typography variant="caption" display="block">DB lag: {fmtAge(status.db_lag_seconds)}</Typography>
            <Typography variant="caption" display="block">Buffer: {status.buffer_backlog.numerics + status.buffer_backlog.waveforms} rows</Typography>
            {sources.length > 0 && <Divider sx={{ my: 0.5 }} />}
            {sources.map(([dev, s]) => (
                <Typography key={dev} variant="caption" display="block">
                    {dev}: clock {s.clock_offset_seconds === null ? '—' : `${s.clock_offset_seconds.toFixed(1)}s`}
                    {s.sequence_regressions > 0 ? `, ${s.sequence_regressions} restarts` : ''}
                </Typography>
            ))}
        </Box>
    );

    return (
        <Tooltip title={tip}>
            <Chip
                size="small"
                icon={<FavoriteIcon />}
                label={meta.label}
                color={meta.color}
                variant={meta.color === 'default' ? 'outlined' : 'filled'}
                sx={meta.color === 'default'
                    ? { color: 'inherit', borderColor: 'rgba(255,255,255,0.6)', '& .MuiChip-icon': { color: 'inherit' } }
                    : undefined}
            />
        </Tooltip>
    );
};

export default HealthIndicator;
