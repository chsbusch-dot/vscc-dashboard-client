import React, { useEffect, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Grid, Stack, Typography,
} from '@mui/material';
import { fetchSessionHrv, type HrvResponse, type SessionInfo } from '../data/sessionsApi';

const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'Unknown error';

interface Props {
    session: SessionInfo | null;
    onClose: () => void;
}

const Metric: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <Box sx={{ textAlign: 'center', px: 1 }}>
        <Typography variant="h5">{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {hint && <Typography variant="caption" color="text.secondary" display="block">{hint}</Typography>}
    </Box>
);

/** Poincaré scatter: (RR[n], RR[n+1]) in ms, with the line of identity. Pure SVG. */
const Poincare: React.FC<{ points: [number, number][] }> = ({ points }) => {
    if (points.length < 2) {
        return <Typography variant="body2" color="text.secondary">Not enough intervals to plot.</Typography>;
    }
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const lo = Math.max(0, Math.min(...xs, ...ys) - 50);
    const hi = Math.max(...xs, ...ys) + 50;
    const S = 280, M = 36;
    const scale = (v: number) => M + ((v - lo) / (hi - lo)) * (S - 2 * M);
    const px = (v: number) => scale(v);
    const py = (v: number) => S - scale(v);
    const ticks = [lo, (lo + hi) / 2, hi].map(Math.round);
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 320 }} role="img" aria-label="Poincaré plot">
            <rect x={M} y={S - M} width={S - 2 * M} height={1} fill="var(--mui-palette-divider, #ccc)" />
            <rect x={M} y={M} width={1} height={S - 2 * M} fill="var(--mui-palette-divider, #ccc)" />
            <line x1={px(lo)} y1={py(lo)} x2={px(hi)} y2={py(hi)} stroke="#888" strokeDasharray="4 4" strokeWidth={1} />
            {points.map((p, i) => (
                <circle key={i} cx={px(p[0])} cy={py(p[1])} r={2} fill="#1976d2" fillOpacity={0.35} />
            ))}
            {ticks.map((t, i) => (
                <text key={`x${i}`} x={px(t)} y={S - M + 14} fontSize={9} textAnchor="middle" fill="currentColor">{t}</text>
            ))}
            {ticks.map((t, i) => (
                <text key={`y${i}`} x={M - 6} y={py(t) + 3} fontSize={9} textAnchor="end" fill="currentColor">{t}</text>
            ))}
            <text x={S / 2} y={S - 4} fontSize={10} textAnchor="middle" fill="currentColor">RRₙ (ms)</text>
            <text x={10} y={S / 2} fontSize={10} textAnchor="middle" fill="currentColor" transform={`rotate(-90 10 ${S / 2})`}>RRₙ₊₁ (ms)</text>
        </svg>
    );
};

const HrvContent: React.FC<{ session: SessionInfo; onClose: () => void }> = ({ session, onClose }) => {
    const [data, setData] = useState<HrvResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchSessionHrv(session.id)
            .then(d => { if (!cancelled) setData(d); })
            .catch(err => { if (!cancelled) setError(errorMessage(err)); });
        return () => { cancelled = true; };
    }, [session.id]);

    const hrv = data?.hrv;
    const ok = data?.ok && hrv && !hrv.insufficient;

    return (
        <>
            <DialogTitle>Heart-rate variability — session #{session.id}</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error">Could not compute HRV: {error}</Alert>}
                {!data && !error && (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2" color="text.secondary">
                            Detecting R-peaks and computing HRV…
                        </Typography>
                    </Stack>
                )}
                {data && !ok && (
                    <Alert severity="info">
                        {data.error || (hrv?.insufficient ? 'Not enough clean beats for HRV in this session.' : 'No HRV available.')}
                    </Alert>
                )}
                {data && ok && hrv && (
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Grid container rowSpacing={2}>
                                <Grid size={6}><Metric label="Mean HR" value={`${hrv.mean_hr_bpm} bpm`} /></Grid>
                                <Grid size={6}><Metric label="Beats" value={String(hrv.beats)} /></Grid>
                                <Grid size={6}><Metric label="SDNN" value={`${hrv.sdnn_ms} ms`} /></Grid>
                                <Grid size={6}><Metric label="RMSSD" value={hrv.rmssd_ms != null ? `${hrv.rmssd_ms} ms` : '—'} /></Grid>
                                <Grid size={6}><Metric label="pNN50" value={hrv.pnn50_pct != null ? `${hrv.pnn50_pct}%` : '—'} /></Grid>
                                <Grid size={6}><Metric label="SD1 / SD2" value={`${hrv.sd1_ms ?? '—'} / ${hrv.sd2_ms ?? '—'}`} hint="ms" /></Grid>
                            </Grid>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                                {data.physio_id} · {data.r_peaks} R-peaks · {data.rr_accepted} accepted, {data.rr_rejected} rejected (artifact/gap)
                            </Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Poincaré</Typography>
                            <Poincare points={data.poincare ?? []} />
                        </Grid>
                    </Grid>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                    Research/education only — not for diagnosis. Computed from the recorded ECG.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </>
    );
};

/** HRV (R-peak → RR → SDNN/RMSSD/pNN50 + Poincaré) for one session's ECG. */
const SessionHrvDialog: React.FC<Props> = ({ session, onClose }) => (
    <Dialog open={session !== null} onClose={onClose} maxWidth="md" fullWidth>
        {session && <HrvContent key={session.id} session={session} onClose={onClose} />}
    </Dialog>
);

export default SessionHrvDialog;
