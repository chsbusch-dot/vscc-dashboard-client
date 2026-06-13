import { useMemo, useState } from 'react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    Drawer,
    CircularProgress,
    LinearProgress,
    Chip,
    Button,
    IconButton,
    Tooltip,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import { SciChartVerticalGroup } from 'scichart';
import Sidebar from './Sidebar';
import { useDashboard } from '../data/DashboardContext';
import { PHYSIO_META } from '../data/constants';
import ChartContainer from './ChartContainer';
import AdvancedCharts from './AdvancedCharts';
import SessionsDrawer from './SessionsDrawer';
import SettingsDialog from './SettingsDialog';
import HealthIndicator from './HealthIndicator';
import AnnotationsDialog from './AnnotationsDialog';
import LayoutsDialog from './LayoutsDialog';
import RecordingIndicator from './RecordingIndicator';
import { getZoneLabel } from '../utils/timeFormat';

const drawerWidth = 300;

const verticalGroup = new SciChartVerticalGroup();

const AppLayout = () => {
    const { state } = useDashboard();
    const [sessionsOpen, setSessionsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [annotationsOpen, setAnnotationsOpen] = useState(false);
    const [layoutsOpen, setLayoutsOpen] = useState(false);

    const zoneLabel = useMemo(() => getZoneLabel(state.timeDisplay), [state.timeDisplay]);

    const chartGroups = useMemo(() => {
        const activePhysioIds = Object.entries(state.selectedPhysioIds)
            .filter(([, isSelected]) => isSelected)
            .map(([id]) => id);

        if (activePhysioIds.length === 0) {
            return [];
        }

        const groups = activePhysioIds.reduce((acc, id) => {
            const groupName = PHYSIO_META[id as keyof typeof PHYSIO_META].group;
            if (!acc[groupName]) {
                acc[groupName] = [];
            }
            acc[groupName].push(id as keyof typeof PHYSIO_META);
            return acc;
        }, {} as Record<string, (keyof typeof PHYSIO_META)[]>);

        return Object.entries(groups);
    }, [state.selectedPhysioIds]);
    
    const getStatusText = () => {
        if (state.dataSource === 'upload' && state.recordCount > 0 && state.status !== 'Streaming' && state.status !== 'Paused') {
            return `${state.recordCount} records loaded`;
        }
        if (state.status === 'Streaming') {
            return state.dataSource === 'url' ? `Polling (${state.recordCount})` : 'Live Streaming';
        }
        return state.status;
    };


    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar
                position="fixed"
                sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
            >
                <Toolbar>
                    <Typography variant="h6" noWrap component="div">
                        VSCC Studio
                    </Typography>
                    <Chip
                        label={state.dataSource || 'None'}
                        size="small"
                        color="secondary"
                        sx={{ ml: 2, textTransform: 'uppercase' }}
                    />
                    <RecordingIndicator />
                    <Box sx={{ flex: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {state.status === 'Loading' && <CircularProgress size={24} color="inherit" />}
                        {state.statusNote && (
                            <Chip
                                label={state.statusNote}
                                size="small"
                                variant="outlined"
                                sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.6)', maxWidth: 360 }}
                            />
                        )}
                        <Typography variant="body1" sx={{ textTransform: 'uppercase' }}>
                            ({getStatusText()})
                        </Typography>
                        {state.replayProgress > 0 && (
                            <LinearProgress variant="determinate" value={state.replayProgress} color="secondary" sx={{ width: '100px', ml: 2, height: 8 }} />
                        )}
                        <HealthIndicator />
                        <Tooltip title="Chart time display zone (change in Settings)">
                            <Chip
                                icon={<AccessTimeIcon />}
                                label={zoneLabel}
                                size="small"
                                variant="outlined"
                                sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.6)', '& .MuiChip-icon': { color: 'inherit' } }}
                            />
                        </Tooltip>
                        <Tooltip title="Mark an event (annotation)">
                            <IconButton color="inherit" aria-label="Mark event" onClick={() => setAnnotationsOpen(true)}>
                                <BookmarkAddIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Saved layouts">
                            <IconButton color="inherit" aria-label="Saved layouts" onClick={() => setLayoutsOpen(true)}>
                                <DashboardCustomizeIcon />
                            </IconButton>
                        </Tooltip>
                        <Button
                            color="inherit"
                            startIcon={<HistoryIcon />}
                            onClick={() => setSessionsOpen(true)}
                        >
                            Sessions
                        </Button>
                        <Tooltip title="Settings">
                            <IconButton color="inherit" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
                                <SettingsIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Toolbar>
            </AppBar>
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
                }}
            >
                <Toolbar />
                <Sidebar />
            </Drawer>
            <Box
                component="main"
                sx={{ flexGrow: 1, bgcolor: 'background.default', p: '20px', height: '100vh', overflow: 'auto' }}
            >
                <Toolbar />

                {chartGroups.length > 0 ? (
                    chartGroups.map(([groupName, physioIds]) => (
                        <ChartContainer key={groupName} groupName={groupName} physioIds={physioIds} verticalGroup={verticalGroup} />
                    ))
                ) : (
                    <Box sx={{textAlign: 'center', mt: 4}}>
                        <Typography variant="h6">No data types selected.</Typography>
                        <Typography>Select data types from the sidebar to view charts.</Typography>
                    </Box>
                )}

                {(state.advancedCharts.rawPleth || state.advancedCharts.resp || state.advancedCharts.ppi || state.advancedCharts.overlay) && (
                    <AdvancedCharts
                        verticalGroup={verticalGroup}
                        showRawPleth={state.advancedCharts.rawPleth}
                        showResp={state.advancedCharts.resp}
                        showPpi={state.advancedCharts.ppi}
                        showOverlay={state.advancedCharts.overlay}
                    />
                )}
            </Box>

            <SessionsDrawer open={sessionsOpen} onClose={() => setSessionsOpen(false)} />
            <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <AnnotationsDialog open={annotationsOpen} onClose={() => setAnnotationsOpen(false)} />
            <LayoutsDialog open={layoutsOpen} onClose={() => setLayoutsOpen(false)} />
        </Box>
    );
};

export default AppLayout;
