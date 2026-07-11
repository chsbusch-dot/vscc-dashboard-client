import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    Drawer,
    FormControlLabel,
    IconButton,
    Snackbar,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SessionQualityDialog from './SessionQualityDialog';
import { useDashboard } from '../data/DashboardContext';
import {
    createSession,
    deleteSession,
    fetchSessions,
    fetchSessionSignals,
    patchSession,
    sessionDownloadUrl,
    sessionsDownloadAllUrl,
    type SessionInfo,
    type SessionSignals,
} from '../data/sessionsApi';
import { formatDuration, isCommunitySignal, signalDisplayLabel } from '../utils/sessionFormat';
import { formatFullTime, type TimeDisplayMode } from '../utils/timeFormat';

const LIST_POLL_INTERVAL_MS = 10000;
/** Signal legends of recording sessions are re-fetched at most this often. */
const SIGNALS_REFRESH_MS = 30000;

const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'Unknown error';

interface SnackState {
    severity: 'success' | 'info' | 'error';
    message: string;
}

// --- Per-row component with inline-editable label / subject code ---

interface SessionRowProps {
    session: SessionInfo;
    timeDisplay: TimeDisplayMode;
    busy: boolean;
    anyBusy: boolean;
    /** undefined = not fetched yet, null = fetch failed; both render no legend */
    signals: SessionSignals | null | undefined;
    onLoad: (session: SessionInfo) => void;
    onDownload: (session: SessionInfo) => void;
    onQuality: (session: SessionInfo) => void;
    onDeleteRequest: (session: SessionInfo) => void;
    onPatched: (updated: SessionInfo) => void;
    onError: (message: string) => void;
}

const signalChipSx = { height: 20, fontSize: '0.6875rem' } as const;

const SessionRow: React.FC<SessionRowProps> = ({
    session,
    timeDisplay,
    busy,
    anyBusy,
    signals,
    onLoad,
    onDownload,
    onQuality,
    onDeleteRequest,
    onPatched,
    onError,
}) => {
    const serverLabel = session.label ?? '';
    const serverSubject = session.subject_code ?? '';
    const [label, setLabel] = useState(serverLabel);
    const [subject, setSubject] = useState(serverSubject);
    const [editing, setEditing] = useState<'label' | 'subject' | null>(null);
    const [prevServer, setPrevServer] = useState({ label: serverLabel, subject: serverSubject });

    // Keep drafts in sync with poll refreshes, but never clobber an active edit.
    // Render-adjustment pattern (see DataSourceModal) instead of a sync effect.
    if (prevServer.label !== serverLabel || prevServer.subject !== serverSubject) {
        if (editing !== 'label' && prevServer.label !== serverLabel) setLabel(serverLabel);
        if (editing !== 'subject' && prevServer.subject !== serverSubject) setSubject(serverSubject);
        setPrevServer({ label: serverLabel, subject: serverSubject });
    }

    const commitField = async (field: 'label' | 'subject_code', draft: string) => {
        const current = (field === 'label' ? session.label : session.subject_code) ?? '';
        const next = draft.trim();
        if (next === current) return;
        try {
            const updated = await patchSession(session.id, { [field]: next });
            onPatched(updated);
        } catch (err) {
            // Revert the draft so the UI reflects what the backend still has
            if (field === 'label') setLabel(current); else setSubject(current);
            onError(`Failed to update session #${session.id}: ${errorMessage(err)}`);
        }
    };

    const blurOnEnter = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') (event.target as HTMLElement).blur();
    };

    const startedAtText = formatFullTime(session.started_at, timeDisplay);

    return (
        <Box sx={{ py: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="flex-end">
                <TextField
                    variant="standard"
                    size="small"
                    label="Label"
                    value={label}
                    placeholder={`Session #${session.id}`}
                    onChange={(e) => setLabel(e.target.value)}
                    onFocus={() => setEditing('label')}
                    onBlur={() => { setEditing(null); void commitField('label', label); }}
                    onKeyDown={blurOnEnter}
                    sx={{ flexGrow: 1 }}
                    slotProps={{ htmlInput: { 'aria-label': `Label for session ${session.id}` } }}
                />
                <TextField
                    variant="standard"
                    size="small"
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onFocus={() => setEditing('subject')}
                    onBlur={() => { setEditing(null); void commitField('subject_code', subject); }}
                    onKeyDown={blurOnEnter}
                    sx={{ width: 110, flexShrink: 0 }}
                    slotProps={{ htmlInput: { 'aria-label': `Subject code for session ${session.id}` } }}
                />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" noWrap>
                        #{session.id} • {startedAtText}
                    </Typography>
                    {session.recording ? (
                        <Chip
                            label="REC"
                            size="small"
                            sx={{
                                fontWeight: 'bold',
                                bgcolor: 'error.main',
                                color: 'error.contrastText',
                                animation: 'vsccRecPulse 1.4s ease-in-out infinite',
                                '@keyframes vsccRecPulse': {
                                    '0%': { opacity: 1 },
                                    '50%': { opacity: 0.55 },
                                    '100%': { opacity: 1 },
                                },
                            }}
                        />
                    ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                            {session.ended_at !== null ? formatDuration(session.ended_at - session.started_at) : '--'}
                        </Typography>
                    )}
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Tooltip title="Load into charts">
                        <span>
                            <IconButton
                                size="small"
                                color="primary"
                                aria-label={`Load session ${session.id}`}
                                disabled={anyBusy}
                                onClick={() => onLoad(session)}
                            >
                                {busy ? <CircularProgress size={18} /> : <PlayArrowIcon fontSize="small" />}
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Loss statistics & EDF export">
                        <span>
                            <IconButton
                                size="small"
                                aria-label={`Quality stats for session ${session.id}`}
                                disabled={anyBusy}
                                onClick={() => onQuality(session)}
                            >
                                <QueryStatsIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Download zip (full data package)">
                        <span>
                            <IconButton
                                size="small"
                                aria-label={`Download session ${session.id} zip`}
                                disabled={anyBusy}
                                onClick={() => onDownload(session)}
                            >
                                <SaveAltIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Delete session and its data">
                        <span>
                            <IconButton
                                size="small"
                                color="error"
                                aria-label={`Delete session ${session.id}`}
                                disabled={anyBusy}
                                onClick={() => onDeleteRequest(session)}
                            >
                                <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </Stack>
            {signals != null && (() => {
                // Community edition is MMS-only: keep non-MMS ids (e.g. EEG/BIS rows
                // still in the database from earlier captures) out of the legend.
                const numerics = signals.numerics.filter(isCommunitySignal);
                const waveforms = signals.waveforms.filter(isCommunitySignal);
                return numerics.length === 0 && waveforms.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                        no data yet
                    </Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                        {numerics.map(id => (
                            <Chip key={`n-${id}`} label={signalDisplayLabel(id)} size="small" sx={signalChipSx} />
                        ))}
                        {waveforms.map(id => (
                            <Tooltip key={`w-${id}`} title={`${signalDisplayLabel(id)} (wave)`}>
                                <Chip label={signalDisplayLabel(id)} size="small" variant="outlined" sx={signalChipSx} />
                            </Tooltip>
                        ))}
                    </Box>
                );
            })()}
            <Divider sx={{ mt: 1.5 }} />
        </Box>
    );
};

// --- Drawer ---

interface SessionsDrawerProps {
    open: boolean;
    onClose: () => void;
}

interface SignalsCacheEntry {
    /** null when the fetch failed (renders no legend, retried after the refresh window) */
    signals: SessionSignals | null;
    fetchedAt: number;
}

const SessionsDrawer: React.FC<SessionsDrawerProps> = ({ open, onClose }) => {
    const { state, actions, stopStreamsRef } = useDashboard();
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [busySessionId, setBusySessionId] = useState<number | null>(null);
    const [creatingSession, setCreatingSession] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<SessionInfo | null>(null);
    const [qualityFor, setQualityFor] = useState<SessionInfo | null>(null);
    const [snack, setSnack] = useState<SnackState | null>(null);
    const [snackOpen, setSnackOpen] = useState(false);
    const [signalsCache, setSignalsCache] = useState<Record<number, SignalsCacheEntry>>({});
    const signalsInFlight = useRef<Set<number>>(new Set());

    const showSnack = useCallback((next: SnackState) => {
        setSnack(next);
        setSnackOpen(true);
    }, []);

    const refresh = useCallback(async (showSpinner = false) => {
        if (showSpinner) setListLoading(true);
        try {
            const list = await fetchSessions();
            setSessions(list);
            setListError(null);
        } catch (err) {
            setListError(`Could not fetch sessions: ${errorMessage(err)}`);
        } finally {
            if (showSpinner) setListLoading(false);
        }
    }, []);

    // Poll the session list every 10s while the drawer is open
    useEffect(() => {
        if (!open) return;
        void refresh(true);
        const intervalId = window.setInterval(() => { void refresh(); }, LIST_POLL_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [open, refresh]);

    // Lazily fetch each visible session's signal legend, caching per session id.
    // Recording sessions (and failed fetches) are re-fetched on a poll tick at
    // most every SIGNALS_REFRESH_MS; closed sessions are fetched once.
    useEffect(() => {
        if (!open) return;
        const now = Date.now();
        for (const session of sessions) {
            const entry = signalsCache[session.id];
            const stale =
                entry !== undefined &&
                (session.recording || entry.signals === null) &&
                now - entry.fetchedAt >= SIGNALS_REFRESH_MS;
            if ((entry !== undefined && !stale) || signalsInFlight.current.has(session.id)) continue;
            signalsInFlight.current.add(session.id);
            fetchSessionSignals(session.id)
                .then(signals => {
                    setSignalsCache(prev => ({ ...prev, [session.id]: { signals, fetchedAt: Date.now() } }));
                })
                .catch(() => {
                    // Quietly skip the legend; retried after the refresh window
                    setSignalsCache(prev => ({ ...prev, [session.id]: { signals: null, fetchedAt: Date.now() } }));
                })
                .finally(() => {
                    signalsInFlight.current.delete(session.id);
                });
        }
    }, [open, sessions, signalsCache]);

    const handlePatched = useCallback((updated: SessionInfo) => {
        setSessions(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    }, []);

    const handleLoad = (session: SessionInfo) => {
        // Stop any active live stream via the Sidebar's registered stop handler.
        stopStreamsRef.current?.();
        actions.clearData();
        actions.setDataSource('upload');
        // Windowed replay: auto-scroll off — the window controller owns the view
        // and fetches data for the visible span at a zoom-appropriate resolution.
        actions.setAutoScroll(false);
        actions.setStatus('Loading');
        actions.setLoadedSession({
            id: session.id,
            start: session.started_at,
            end: session.ended_at ?? Date.now() / 1000,
        });
        showSnack({ severity: 'info', message: `Loading session #${session.id} — zoom in for raw detail` });
        onClose(); // reveal the charts
    };

    // De-identified ("share-safe") downloads: relative timestamps, no label/notes.
    const [deid, setDeid] = useState(false);

    // Same native-download pattern for the everything-zip. Honours the de-id
    // toggle so "Download all" can't silently export identified data.
    const handleDownloadAll = () => {
        const anchor = document.createElement('a');
        anchor.href = sessionsDownloadAllUrl(deid);
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        showSnack({
            severity: 'info',
            message: 'Preparing download of all sessions — the save dialog appears when streaming starts',
        });
    };

    const handleDownload = (session: SessionInfo) => {
        const anchor = document.createElement('a');
        anchor.href = sessionDownloadUrl(session.id, deid);
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        showSnack({
            severity: 'info',
            message: 'Preparing download — the save dialog appears when the server starts streaming',
        });
    };

    const handleNewSession = async () => {
        setCreatingSession(true);
        try {
            // Default the label to the browser's LOCAL wall-clock time. The server
            // would otherwise stamp it in UTC (it cannot know the operator's zone);
            // formatFullTime('local') gives "YYYY-MM-DD HH:MM:SS" — trim to minutes.
            const stamp = formatFullTime(Date.now() / 1000, 'local').slice(0, 16);
            const created = await createSession(`Session ${stamp}`);
            showSnack({ severity: 'success', message: `Recording into session #${created.id}` });
            await refresh();
        } catch (err) {
            showSnack({ severity: 'error', message: `Could not start a new session: ${errorMessage(err)}` });
        } finally {
            setCreatingSession(false);
        }
    };

    const handleDeleteConfirmed = async () => {
        const session = confirmDelete;
        setConfirmDelete(null);
        if (!session) return;
        setBusySessionId(session.id);
        try {
            const result = await deleteSession(session.id);
            if (result.ok) {
                showSnack({
                    severity: 'success',
                    message: `Deleted session #${session.id} (${result.deleted_data_rows ?? 0} data rows removed)`,
                });
            } else {
                // e.g. the backend refuses to delete a recording session
                showSnack({ severity: 'error', message: result.error ?? `Could not delete session #${session.id}` });
            }
        } catch (err) {
            showSnack({ severity: 'error', message: `Delete failed for session #${session.id}: ${errorMessage(err)}` });
        } finally {
            setBusySessionId(null);
            void refresh();
        }
    };

    return (
        <>
            <Drawer
                anchor="right"
                open={open}
                onClose={onClose}
                slotProps={{ paper: { sx: { width: { xs: '100%', sm: 480 } } } }}
            >
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <Typography variant="h6" sx={{ flexGrow: 1 }}>Sessions</Typography>
                        {listLoading && <CircularProgress size={18} />}
                        <Tooltip title="Refresh now">
                            <IconButton aria-label="Refresh sessions" onClick={() => { void refresh(true); }}>
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                        <IconButton aria-label="Close sessions" onClick={onClose}>
                            <CloseIcon />
                        </IconButton>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AddIcon />}
                            disabled={creatingSession}
                            onClick={() => { void handleNewSession(); }}
                        >
                            New session
                        </Button>
                        {creatingSession && <CircularProgress size={16} />}
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<SaveAltIcon />}
                            disabled={sessions.length === 0}
                            onClick={handleDownloadAll}
                        >
                            Download all
                        </Button>
                    </Stack>

                    <FormControlLabel
                        sx={{ ml: 0, mb: 0.5 }}
                        control={<Switch size="small" checked={deid} onChange={(e) => setDeid(e.target.checked)} />}
                        label={<Typography variant="caption" color="text.secondary">
                            De-identified downloads (relative time, no labels)
                        </Typography>}
                    />

                    {listError && <Alert severity="error" sx={{ mb: 1 }}>{listError}</Alert>}

                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {sessions.length === 0 && !listLoading && !listError ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                                No sessions recorded yet.
                            </Typography>
                        ) : (
                            sessions.map(session => (
                                <SessionRow
                                    key={session.id}
                                    session={session}
                                    timeDisplay={state.timeDisplay}
                                    busy={busySessionId === session.id}
                                    anyBusy={busySessionId !== null}
                                    signals={signalsCache[session.id]?.signals}
                                    onLoad={(s) => { void handleLoad(s); }}
                                    onDownload={handleDownload}
                                    onQuality={setQualityFor}
                                    onDeleteRequest={setConfirmDelete}
                                    onPatched={handlePatched}
                                    onError={(message) => showSnack({ severity: 'error', message })}
                                />
                            ))
                        )}
                    </Box>
                </Box>
            </Drawer>

            <SessionQualityDialog session={qualityFor} onClose={() => setQualityFor(null)} />

            <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)}>
                <DialogTitle>Delete session #{confirmDelete?.id}?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This also deletes this range&apos;s data from the database. This cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={() => { void handleDeleteConfirmed(); }}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackOpen}
                autoHideDuration={6000}
                onClose={() => setSnackOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    severity={snack?.severity ?? 'info'}
                    onClose={() => setSnackOpen(false)}
                    sx={{ width: '100%' }}
                >
                    {snack?.message ?? ''}
                </Alert>
            </Snackbar>
        </>
    );
};

export default SessionsDrawer;
