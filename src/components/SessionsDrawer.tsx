import React, { useCallback, useEffect, useState } from 'react';
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
    IconButton,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useDashboard, type TelemetryRecord } from '../data/DashboardContext';
import type { PhysioId } from '../data/constants';
import {
    deleteSession,
    exportSession,
    fetchSessionData,
    fetchSessions,
    patchSession,
    type SessionInfo,
} from '../data/sessionsApi';
import { formatDuration } from '../utils/sessionFormat';
import { formatFullTime, type TimeDisplayMode } from '../utils/timeFormat';

const LIST_POLL_INTERVAL_MS = 10000;
const LOAD_CHUNK_SIZE = 5000;

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
    onLoad: (session: SessionInfo) => void;
    onExport: (session: SessionInfo) => void;
    onDeleteRequest: (session: SessionInfo) => void;
    onPatched: (updated: SessionInfo) => void;
    onError: (message: string) => void;
}

const SessionRow: React.FC<SessionRowProps> = ({
    session,
    timeDisplay,
    busy,
    anyBusy,
    onLoad,
    onExport,
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
                    <Tooltip title="Export to files on the server">
                        <span>
                            <IconButton
                                size="small"
                                aria-label={`Export session ${session.id}`}
                                disabled={anyBusy}
                                onClick={() => onExport(session)}
                            >
                                <FileDownloadIcon fontSize="small" />
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
            <Divider sx={{ mt: 1.5 }} />
        </Box>
    );
};

// --- Drawer ---

interface SessionsDrawerProps {
    open: boolean;
    onClose: () => void;
}

const SessionsDrawer: React.FC<SessionsDrawerProps> = ({ open, onClose }) => {
    const { state, actions, stopStreamsRef } = useDashboard();
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [busySessionId, setBusySessionId] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<SessionInfo | null>(null);
    const [snack, setSnack] = useState<SnackState | null>(null);
    const [snackOpen, setSnackOpen] = useState(false);

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

    const handlePatched = useCallback((updated: SessionInfo) => {
        setSessions(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    }, []);

    const handleLoad = async (session: SessionInfo) => {
        setBusySessionId(session.id);
        try {
            // Stop any active live stream via the Sidebar's registered stop handler
            stopStreamsRef.current?.();
            // Loaded sessions behave like file replays: data-driven auto-scroll
            actions.setDataSource('upload');
            actions.setStatus('Loading');
            actions.clearData();
            actions.setAutoScroll(true);

            const data = await fetchSessionData(session.id);
            const records: TelemetryRecord[] = [...data.numerics, ...data.waveforms]
                .filter(r => r && typeof r.time === 'number' && !!r.physio_id)
                .map(r => ({
                    time: r.time,
                    physio_id: r.physio_id as PhysioId,
                    value: r.value,
                    device_id: `session-${session.id}`,
                }));
            records.sort((a, b) => a.time - b.time);

            for (let i = 0; i < records.length; i += LOAD_CHUNK_SIZE) {
                actions.appendData(records.slice(i, i + LOAD_CHUNK_SIZE));
                // Yield to the main thread so charts and UI stay responsive
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            actions.setStatus('Ready');
            const note = data.aggregated_waveforms
                ? `Loaded session #${session.id} • waveforms averaged to 1-min for this span`
                : `Loaded session #${session.id}`;
            actions.setStatusNote(note);
            showSnack({
                severity: data.aggregated_waveforms ? 'info' : 'success',
                message: `${note} (${records.length} records)`,
            });
        } catch (err) {
            actions.setStatus('Error');
            showSnack({ severity: 'error', message: `Failed to load session #${session.id}: ${errorMessage(err)}` });
        } finally {
            setBusySessionId(null);
        }
    };

    const handleExport = async (session: SessionInfo) => {
        setBusySessionId(session.id);
        try {
            const result = await exportSession(session.id);
            if (result.ok) {
                const rows = (result.numeric_rows ?? 0) + (result.waveform_rows ?? 0);
                showSnack({
                    severity: 'success',
                    message: `Exported session #${session.id} (${rows} rows) to ${result.path ?? 'the sessions directory'}`,
                });
            } else {
                showSnack({ severity: 'error', message: result.error ?? `Export failed for session #${session.id}` });
            }
        } catch (err) {
            showSnack({ severity: 'error', message: `Export failed for session #${session.id}: ${errorMessage(err)}` });
        } finally {
            setBusySessionId(null);
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
                                    onLoad={(s) => { void handleLoad(s); }}
                                    onExport={(s) => { void handleExport(s); }}
                                    onDeleteRequest={setConfirmDelete}
                                    onPatched={handlePatched}
                                    onError={(message) => showSnack({ severity: 'error', message })}
                                />
                            ))
                        )}
                    </Box>
                </Box>
            </Drawer>

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
