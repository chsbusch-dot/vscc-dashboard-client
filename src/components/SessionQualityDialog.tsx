import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import {
    fetchSessionQuality,
    sessionEdfUrl,
    type SessionInfo,
    type SessionQuality,
} from '../data/sessionsApi';
import { formatCount, formatDuration, signalDisplayLabel } from '../utils/sessionFormat';

const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'Unknown error';

/** Traffic-light color for a completeness percentage. */
const completenessColor = (pct: number | null): 'success' | 'warning' | 'error' | 'default' => {
    if (pct === null) return 'default';
    if (pct >= 99) return 'success';
    if (pct >= 95) return 'warning';
    return 'error';
};

interface SessionQualityDialogProps {
    /** The session to show stats for; null keeps the dialog closed. */
    session: SessionInfo | null;
    onClose: () => void;
}

interface QualityContentProps {
    session: SessionInfo;
    onClose: () => void;
}

/**
 * Mounted fresh per session (keyed by id in the parent), so quality/error
 * start at null on every open — the effect only fetches, never resets.
 */
const QualityContent: React.FC<QualityContentProps> = ({ session, onClose }) => {
    const [quality, setQuality] = useState<SessionQuality | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchSessionQuality(session.id)
            .then(q => { if (!cancelled) setQuality(q); })
            .catch(err => { if (!cancelled) setError(errorMessage(err)); });
        return () => { cancelled = true; };
    }, [session.id]);

    const handleEdfDownload = () => {
        const anchor = document.createElement('a');
        anchor.href = sessionEdfUrl(session.id);
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const hasWaveforms = (quality?.waveforms.length ?? 0) > 0;

    return (
        <>
            <DialogTitle>
                Capture quality — session #{session.id}
                {session.recording && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        still recording: numbers grow as data arrives
                    </Typography>
                )}
            </DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error">Could not fetch quality stats: {error}</Alert>}
                {!quality && !error && (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2" color="text.secondary">
                            Computing loss statistics…
                        </Typography>
                    </Stack>
                )}
                {quality && (
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Waveforms</Typography>
                            {!hasWaveforms ? (
                                <Typography variant="body2" color="text.secondary">
                                    No waveform data in this session.
                                </Typography>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Signal</TableCell>
                                            <TableCell align="right">Rate</TableCell>
                                            <TableCell align="right">Samples</TableCell>
                                            <TableCell align="right">Expected</TableCell>
                                            <TableCell align="right">Complete</TableCell>
                                            <TableCell align="right">Gaps</TableCell>
                                            <TableCell align="right">Longest gap</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {quality.waveforms.map(w => (
                                            <TableRow key={w.physio_id}>
                                                <TableCell>{signalDisplayLabel(w.physio_id)}</TableCell>
                                                <TableCell align="right">{w.rate_hz} Hz</TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title={`${w.samples.toLocaleString()} samples`}>
                                                        <span>{formatCount(w.samples)}</span>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title={`${w.expected_samples.toLocaleString()} expected — ${w.missing_samples.toLocaleString()} missing`}>
                                                        <span>{formatCount(w.expected_samples)}</span>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip
                                                        size="small"
                                                        color={completenessColor(w.completeness_pct)}
                                                        label={w.completeness_pct === null ? '--' : `${w.completeness_pct.toFixed(1)}%`}
                                                        sx={{ height: 20, fontSize: '0.6875rem' }}
                                                    />
                                                </TableCell>
                                                <TableCell align="right">{w.gap_count}</TableCell>
                                                <TableCell align="right">
                                                    {w.gap_count > 0 ? formatDuration(w.longest_gap_s) : '--'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                            <Typography variant="caption" color="text.secondary">
                                Rate is measured from the capture (mode of per-second sample counts);
                                expected = rate × the signal&apos;s active span. Gaps are seconds without data.
                            </Typography>
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Numerics</Typography>
                            {quality.numerics.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                    No numeric data in this session.
                                </Typography>
                            ) : (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {quality.numerics.map(n => (
                                        <Tooltip key={n.physio_id} title={`${n.samples.toLocaleString()} values`}>
                                            <Chip
                                                size="small"
                                                variant="outlined"
                                                label={`${signalDisplayLabel(n.physio_id)} · ${formatCount(n.samples)}`}
                                                sx={{ height: 20, fontSize: '0.6875rem' }}
                                            />
                                        </Tooltip>
                                    ))}
                                </Box>
                            )}
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                Counts only — many numerics are intermittent by design (NIBP measures on inflation).
                            </Typography>
                        </Box>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Tooltip title="One EDF channel per waveform at its measured rate; gaps stay zero-filled in place">
                    <span>
                        <Button
                            startIcon={<DownloadIcon />}
                            disabled={!hasWaveforms}
                            onClick={handleEdfDownload}
                        >
                            Download EDF
                        </Button>
                    </span>
                </Tooltip>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </>
    );
};

/**
 * Loss statistics for one session: per-waveform nominal rate, expected vs
 * actual samples, gaps — plus the EDF download (the EDF covers exactly these
 * waveform channels). Numerics get plain counts: many are intermittent by
 * design (e.g. NIBP only on cuff inflation), so "expected" is meaningless.
 */
const SessionQualityDialog: React.FC<SessionQualityDialogProps> = ({ session, onClose }) => (
    <Dialog open={session !== null} onClose={onClose} maxWidth="md" fullWidth>
        {session && <QualityContent key={session.id} session={session} onClose={onClose} />}
    </Dialog>
);

export default SessionQualityDialog;
