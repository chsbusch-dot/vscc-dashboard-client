import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, IconButton, List, ListItem, ListItemText, Stack, TextField,
    Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useDashboard } from '../data/DashboardContext';
import {
    createAnnotation, deleteAnnotation, fetchAnnotations, type Annotation,
} from '../data/sessionsApi';
import { formatFullTime } from '../utils/timeFormat';

const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : 'Unknown error';

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Event markers: capture a timestamped note ("intubation", "drug given",
 * "artifact") at the current time and review/delete past ones. Markers persist
 * server-side (GET/POST/DELETE /api/annotations) on the data-time axis.
 */
const AnnotationsDialog: React.FC<Props> = ({ open, onClose }) => {
    const { state } = useDashboard();
    const [items, setItems] = useState<Annotation[]>([]);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setItems(await fetchAnnotations());
            setError(null);
        } catch (err) {
            setError(errorMessage(err));
        }
    }, []);

    useEffect(() => {
        if (open) void refresh();
    }, [open, refresh]);

    const add = async () => {
        const text = label.trim();
        if (!text) return;
        setBusy(true);
        try {
            await createAnnotation({ label: text });
            setLabel('');
            await refresh();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: number) => {
        try {
            await deleteAnnotation(id);
            setItems(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Event markers</DialogTitle>
            <DialogContent dividers>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                        label="New event"
                        size="small"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
                        placeholder="e.g. intubation"
                        fullWidth
                        slotProps={{ htmlInput: { 'aria-label': 'New event label' } }}
                    />
                    <Button
                        variant="contained"
                        startIcon={busy ? <CircularProgress size={14} /> : <AddIcon />}
                        onClick={() => { void add(); }}
                        disabled={busy || !label.trim()}
                        sx={{ flexShrink: 0 }}
                    >
                        Mark now
                    </Button>
                </Stack>
                {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
                {items.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No event markers yet.
                    </Typography>
                ) : (
                    <List dense>
                        {items.map(a => (
                            <ListItem
                                key={a.id}
                                secondaryAction={
                                    <Tooltip title="Delete">
                                        <IconButton edge="end" size="small" aria-label={`Delete marker ${a.id}`}
                                            onClick={() => { void remove(a.id); }}>
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                }
                            >
                                <ListItemText
                                    primary={a.label}
                                    secondary={
                                        <Box component="span">
                                            {formatFullTime(a.time, state.timeDisplay)}
                                            {a.session_id != null ? ` · session #${a.session_id}` : ''}
                                        </Box>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default AnnotationsDialog;
