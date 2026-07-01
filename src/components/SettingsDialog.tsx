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
    Divider,
    LinearProgress,
    MenuItem,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { useDashboard } from '../data/DashboardContext';
import {
    fetchCaptureConfig,
    fetchSettings,
    putCaptureConfig,
    putSettings,
    type BackendSettings,
    type CaptureConfig,
} from '../data/sessionsApi';
import { formatBytes } from '../utils/sessionFormat';
import { getZoneLabel, type TimeDisplayMode } from '../utils/timeFormat';

const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'Unknown error';

type Feedback = { severity: 'success' | 'error'; message: string } | null;

/** Editable subset of the capture config (config_file is server-side info). */
type CaptureDraft = Omit<CaptureConfig, 'config_file'>;

const INTERVAL_OPTIONS = [
    { value: '1', label: '1 s' },
    { value: '10', label: '10 s' },
    { value: '60', label: '1 min' },
    { value: '300', label: '5 min' },
] as const;

const WAVESET_OPTIONS = Array.from({ length: 13 }, (_, n) => ({
    value: String(n),
    label: n === 0 ? '0 — no waveforms' : n === 12 ? '12 — all waveforms' : String(n),
}));

interface NumberSettingRowProps {
    label: string;
    helper: string;
    value: string;
    onChange: (value: string) => void;
    onSave: () => void;
    saving: boolean;
    feedback: Feedback;
}

const NumberSettingRow: React.FC<NumberSettingRowProps> = ({
    label,
    helper,
    value,
    onChange,
    onSave,
    saving,
    feedback,
}) => (
    <Box>
        <Stack direction="row" spacing={1} alignItems="center">
            <TextField
                label={label}
                type="number"
                size="small"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                helperText={helper}
                sx={{ flexGrow: 1 }}
                slotProps={{ htmlInput: { min: 1, 'aria-label': label } }}
            />
            <Button
                variant="outlined"
                size="small"
                onClick={onSave}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={14} /> : undefined}
                sx={{ mb: 2.5 }}
            >
                Save
            </Button>
        </Stack>
        {feedback && (
            <Alert severity={feedback.severity} sx={{ mt: 0.5, py: 0 }}>{feedback.message}</Alert>
        )}
    </Box>
);

interface SettingsDialogProps {
    open: boolean;
    onClose: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose }) => {
    const { state, actions } = useDashboard();
    const [settings, setSettings] = useState<BackendSettings | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retentionDraft, setRetentionDraft] = useState('');
    const [gapDraft, setGapDraft] = useState('');
    const [retentionFeedback, setRetentionFeedback] = useState<Feedback>(null);
    const [gapFeedback, setGapFeedback] = useState<Feedback>(null);
    const [savingField, setSavingField] = useState<'retention_hours' | 'session_gap_minutes' | null>(null);
    const [captureDraft, setCaptureDraft] = useState<CaptureDraft | null>(null);
    const [captureError, setCaptureError] = useState<string | null>(null);
    const [captureFeedback, setCaptureFeedback] = useState<Feedback>(null);
    const [applyingCapture, setApplyingCapture] = useState(false);

    // (Re)load settings each time the dialog opens
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setRetentionFeedback(null);
        setGapFeedback(null);
        setCaptureFeedback(null);
        const load = async () => {
            try {
                const loaded = await fetchSettings();
                if (cancelled) return;
                setSettings(loaded);
                setLoadError(null);
                setRetentionDraft(String(loaded.retention_hours));
                setGapDraft(String(loaded.session_gap_minutes));
            } catch (err) {
                if (!cancelled) setLoadError(`Could not fetch settings: ${errorMessage(err)}`);
            }
        };
        const loadCapture = async () => {
            try {
                const cfg = await fetchCaptureConfig();
                if (cancelled) return;
                setCaptureDraft({
                    monitor_ip: cfg.monitor_ip,
                    interval: cfg.interval,
                    waveset: cfg.waveset,
                    scale: cfg.scale,
                    devid: cfg.devid,
                });
                setCaptureError(null);
            } catch (err) {
                if (!cancelled) setCaptureError(`Capture settings unavailable: ${errorMessage(err)}`);
            }
        };
        void load();
        void loadCapture();
        return () => { cancelled = true; };
    }, [open]);

    const saveNumberSetting = async (
        field: 'retention_hours' | 'session_gap_minutes',
        draft: string,
        setFeedback: (feedback: Feedback) => void
    ) => {
        const value = Number(draft);
        if (!Number.isFinite(value) || value <= 0) {
            setFeedback({ severity: 'error', message: 'Enter a positive number' });
            return;
        }
        setSavingField(field);
        try {
            const result = await putSettings({ [field]: value });
            if (result.ok) {
                setFeedback({ severity: 'success', message: 'Saved' });
                setSettings(prev => (prev ? { ...prev, [field]: value } : prev));
            } else {
                setFeedback({ severity: 'error', message: result.error ?? 'Save failed' });
            }
        } catch (err) {
            setFeedback({ severity: 'error', message: errorMessage(err) });
        } finally {
            setSavingField(null);
        }
    };

    const applyCaptureConfig = async () => {
        if (!captureDraft) return;
        setApplyingCapture(true);
        setCaptureFeedback(null);
        try {
            const result = await putCaptureConfig(captureDraft);
            if (result.ok) {
                setCaptureFeedback({
                    severity: 'success',
                    message: 'Applied — the capture restarts now; data resumes within ~2 minutes',
                });
            } else {
                setCaptureFeedback({ severity: 'error', message: result.error ?? 'Apply failed' });
            }
        } catch (err) {
            setCaptureFeedback({ severity: 'error', message: errorMessage(err) });
        } finally {
            setApplyingCapture(false);
        }
    };

    const setCaptureField = (field: keyof CaptureDraft) =>
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value;
            setCaptureDraft(prev => (prev ? { ...prev, [field]: value } : prev));
        };

    const usedBytes = settings ? settings.disk.total_bytes - settings.disk.free_bytes : 0;
    const usedPercent = settings && settings.disk.total_bytes > 0
        ? Math.min(100, Math.max(0, (usedBytes / settings.disk.total_bytes) * 100))
        : 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Settings</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    {/* FEATURE 3: time display toggle (client-side, applies immediately) */}
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2">Time:</Typography>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={state.timeDisplay}
                                onChange={(_, value: TimeDisplayMode | null) => {
                                    if (value) actions.setTimeDisplay(value);
                                }}
                                aria-label="Time display mode"
                            >
                                <ToggleButton value="local">Local</ToggleButton>
                                <ToggleButton value="utc">UTC</ToggleButton>
                            </ToggleButtonGroup>
                            <Chip size="small" variant="outlined" label={getZoneLabel(state.timeDisplay)} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            Applies to chart axes, cursors and session times. Display only — data is never shifted.
                        </Typography>
                    </Box>

                    <Divider />

                    {/* Backend settings */}
                    {loadError && <Alert severity="error">{loadError}</Alert>}
                    {!settings && !loadError && (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={18} />
                            <Typography variant="body2" color="text.secondary">Loading backend settings…</Typography>
                        </Stack>
                    )}
                    {settings && (
                        <>
                            <NumberSettingRow
                                label="Retention (hours)"
                                helper="How long telemetry rows are kept in the database"
                                value={retentionDraft}
                                onChange={setRetentionDraft}
                                onSave={() => { void saveNumberSetting('retention_hours', retentionDraft, setRetentionFeedback); }}
                                saving={savingField === 'retention_hours'}
                                feedback={retentionFeedback}
                            />
                            <NumberSettingRow
                                label="Session gap (minutes)"
                                helper="Idle gap that splits incoming data into separate sessions"
                                value={gapDraft}
                                onChange={setGapDraft}
                                onSave={() => { void saveNumberSetting('session_gap_minutes', gapDraft, setGapFeedback); }}
                                saving={savingField === 'session_gap_minutes'}
                                feedback={gapFeedback}
                            />

                            <Divider />

                            <Box>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                    <Typography variant="subtitle2">Storage</Typography>
                                    <Chip
                                        size="small"
                                        label={settings.parquet_available ? 'Parquet available' : 'Parquet unavailable'}
                                        color={settings.parquet_available ? 'success' : 'default'}
                                        variant={settings.parquet_available ? 'filled' : 'outlined'}
                                    />
                                </Stack>
                                <TextField
                                    label="Sessions directory"
                                    value={settings.sessions_dir}
                                    size="small"
                                    fullWidth
                                    slotProps={{ input: { readOnly: true } }}
                                    sx={{ mb: 2 }}
                                />
                                <Typography variant="body2" sx={{ mb: 0.5 }}>
                                    Database size: <strong>{formatBytes(settings.db_size_bytes)}</strong>
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={usedPercent}
                                    color={usedPercent > 90 ? 'error' : 'primary'}
                                    sx={{ height: 8, borderRadius: 1 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                    Disk: {formatBytes(usedBytes)} used of {formatBytes(settings.disk.total_bytes)}
                                    {' '}({formatBytes(settings.disk.free_bytes)} free)
                                </Typography>
                            </Box>
                        </>
                    )}

                    <Divider />

                    {/* Capture service (VSCapture command line) configuration */}
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Capture</Typography>
                        {captureError && (
                            <Typography variant="caption" color="text.secondary">{captureError}</Typography>
                        )}
                        {!captureDraft && !captureError && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={18} />
                                <Typography variant="body2" color="text.secondary">Loading capture settings…</Typography>
                            </Stack>
                        )}
                        {captureDraft && (
                            <Stack spacing={1.5}>
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        label="Monitor IP"
                                        size="small"
                                        value={captureDraft.monitor_ip}
                                        onChange={setCaptureField('monitor_ip')}
                                        placeholder="container default"
                                        helperText="Leave empty to keep the install-time IP"
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { 'aria-label': 'Monitor IP' } }}
                                    />
                                    <TextField
                                        label="Device id"
                                        size="small"
                                        value={captureDraft.devid}
                                        onChange={setCaptureField('devid')}
                                        helperText="Used in file names / topics"
                                        sx={{ width: 140, flexShrink: 0 }}
                                        slotProps={{ htmlInput: { 'aria-label': 'Device id' } }}
                                    />
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        select
                                        label="Numerics interval"
                                        size="small"
                                        value={captureDraft.interval}
                                        onChange={setCaptureField('interval')}
                                        sx={{ flexGrow: 1 }}
                                    >
                                        {INTERVAL_OPTIONS.map(opt => (
                                            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        select
                                        label="Waveset"
                                        size="small"
                                        value={captureDraft.waveset}
                                        onChange={setCaptureField('waveset')}
                                        sx={{ flexGrow: 1 }}
                                    >
                                        {WAVESET_OPTIONS.map(opt => (
                                            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        select
                                        label="Scale"
                                        size="small"
                                        value={captureDraft.scale}
                                        onChange={setCaptureField('scale')}
                                        sx={{ width: 90, flexShrink: 0 }}
                                    >
                                        <MenuItem value="1">1</MenuItem>
                                        <MenuItem value="2">2</MenuItem>
                                    </TextField>
                                </Stack>
                                <Alert severity="warning" sx={{ py: 0 }}>
                                    Applying restarts the capture process — data resumes within ~2 minutes
                                    (the monitor must drop its association first).
                                </Alert>
                                <Box>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={() => { void applyCaptureConfig(); }}
                                        disabled={applyingCapture}
                                        startIcon={applyingCapture ? <CircularProgress size={14} /> : undefined}
                                    >
                                        Apply capture settings
                                    </Button>
                                </Box>
                                {captureFeedback && (
                                    <Alert severity={captureFeedback.severity} sx={{ py: 0 }}>
                                        {captureFeedback.message}
                                    </Alert>
                                )}
                            </Stack>
                        )}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default SettingsDialog;
