import { useMemo } from 'react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    Drawer,
    CircularProgress,
    LinearProgress,
} from '@mui/material';
import { SciChartVerticalGroup } from 'scichart';
import Sidebar from './Sidebar';
import { useDashboard } from '../data/DashboardContext';
import { PHYSIO_META } from '../data/constants';
import ChartContainer from './ChartContainer';
import AdvancedCharts from './AdvancedCharts';

const drawerWidth = 300;

// Create a single vertical group to sync all charts
const verticalGroup = new SciChartVerticalGroup();


const AppLayout = () => {
    const { state } = useDashboard();

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
    
    // Note: state.recordCount updates are now throttled in DashboardContext to prevent header flickering

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar
                position="fixed"
                sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
            >
                <Toolbar>
                    <Typography variant="h6" noWrap component="div" sx={{ flex: 1 }}>
                        VSCapture Visualizer
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                        <Typography variant="h6" component="div">
                            Philips MP50 Data Stream
                        </Typography>
                        {state.status === 'Loading' && <CircularProgress size={24} color="inherit" />}
                        <Typography variant="body1" sx={{ textTransform: 'uppercase' }}>
                            ({state.dataSource === 'url' && state.recordCount > 0
                                ? `Now streaming ${state.recordCount} records`
                                : state.status})
                        </Typography>
                        {state.replayProgress > 0 && (
                            <LinearProgress variant="determinate" value={state.replayProgress} color="secondary" sx={{ width: '100px', ml: 2, height: 8 }} />
                        )}
                    </Box>
                </Toolbar>
            </AppBar>
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column'
                    },
                }}
            >
                <Toolbar />
                <Sidebar />
            </Drawer>
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    bgcolor: 'background.default',
                    p: '20px',
                    height: '100vh',
                    overflow: 'auto',
                    boxSizing: 'border-box'
                }}
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

                {(state.advancedCharts.rawPleth || state.advancedCharts.ppi || state.advancedCharts.overlay || state.advancedCharts.spectrogram) && (
                    <AdvancedCharts
                        verticalGroup={verticalGroup}
                        showRawPleth={state.advancedCharts.rawPleth}
                        showPpi={state.advancedCharts.ppi}
                        showOverlay={state.advancedCharts.overlay}
                        showSpectrogram={state.advancedCharts.spectrogram}
                    />
                )}
            </Box>
        </Box>
    );
};

export default AppLayout;