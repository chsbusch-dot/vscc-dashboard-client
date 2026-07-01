import React, { useState } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List,
    ListItem, ListItemButton, ListItemText, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useDashboard, type DashboardState } from '../data/DashboardContext';

const LS_KEY = 'vscc.layouts';

/** The slice of view state a layout captures (which charts/channels + the time window). */
type Layout = Pick<DashboardState,
    'globalWaveformToggles' | 'selectedPhysioIds' | 'advancedCharts' | 'timeWindow' | 'aggregation' | 'autoScroll'>;

function loadLayouts(): Record<string, Layout> {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Record<string, Layout>; } catch { return {}; }
}
function persist(m: Record<string, Layout>) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch { /* quota / private mode */ }
}

interface Props { open: boolean; onClose: () => void; }

/** Save / restore named dashboard layouts (which charts and channels are shown,
 *  plus the time window) in this browser's localStorage. */
const LayoutsDialog: React.FC<Props> = ({ open, onClose }) => {
    const { state, actions } = useDashboard();
    const [layouts, setLayouts] = useState<Record<string, Layout>>(() => loadLayouts());
    const [name, setName] = useState('');

    const snapshot = (): Layout => ({
        globalWaveformToggles: state.globalWaveformToggles,
        selectedPhysioIds: state.selectedPhysioIds,
        advancedCharts: state.advancedCharts,
        timeWindow: state.timeWindow,
        aggregation: state.aggregation,
        autoScroll: state.autoScroll,
    });

    const save = () => {
        const n = name.trim();
        if (!n) return;
        const next = { ...layouts, [n]: snapshot() };
        setLayouts(next); persist(next); setName('');
    };

    const apply = (n: string) => {
        const l = layouts[n];
        // Merge over current state so a layout saved before a new chart/channel
        // existed doesn't blank it out.
        actions.applyLayout({
            ...l,
            advancedCharts: { ...state.advancedCharts, ...l.advancedCharts },
            globalWaveformToggles: { ...state.globalWaveformToggles, ...l.globalWaveformToggles },
            selectedPhysioIds: { ...state.selectedPhysioIds, ...l.selectedPhysioIds },
        });
        onClose();
    };

    const remove = (n: string) => {
        const next = { ...layouts };
        delete next[n];
        setLayouts(next); persist(next);
    };

    const names = Object.keys(layouts).sort();
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Saved layouts</DialogTitle>
            <DialogContent dividers>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField size="small" label="Save current view as…" value={name} fullWidth
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                        slotProps={{ htmlInput: { 'aria-label': 'Layout name' } }} />
                    <Button variant="contained" startIcon={<AddIcon />} onClick={save}
                        disabled={!name.trim()} sx={{ flexShrink: 0 }}>Save</Button>
                </Stack>
                {names.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No saved layouts yet.
                    </Typography>
                ) : (
                    <List dense>
                        {names.map((n) => (
                            <ListItem key={n} disablePadding secondaryAction={
                                <Tooltip title="Delete">
                                    <IconButton edge="end" size="small" aria-label={`Delete layout ${n}`}
                                        onClick={() => remove(n)}>
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            }>
                                <ListItemButton onClick={() => apply(n)}>
                                    <ListItemText primary={n} secondary="Click to apply" />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Captures which charts &amp; channels are shown plus the time window — stored in this browser.
                </Typography>
            </DialogContent>
            <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
        </Dialog>
    );
};

export default LayoutsDialog;
