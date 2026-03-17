import { useMemo } from 'react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    Drawer,
    CircularProgress,
    LinearProgress,
    Chip,
} from '@mui/material';
import { SciChartVerticalGroup } from 'scichart';
import Sidebar from './Sidebar';
import { useDashboard } from '../data/DashboardContext';
import { PHYSIO_META } from '../data/constants';
import ChartContainer from './ChartContainer';
import AdvancedCharts from './AdvancedCharts';

const drawerWidth = 300;

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
                        VSCapture Visualizer
                    </Typography>
                    <Chip 
                        label={state.dataSource || 'None'} 
                        size="small" 
                        color="secondary"
                        sx={{ ml: 2, textTransform: 'uppercase' }} 
                    />
                    <Box sx={{ flex: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {state.status === 'Loading' && <CircularProgress size={24} color="inherit" />}
                        <Typography variant="body1" sx={{ textTransform: 'uppercase' }}>
                            ({getStatusText()})
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

                {(state.advancedCharts.rawPleth || state.advancedCharts.resp || state.advancedCharts.ppi || state.advancedCharts.overlay || state.advancedCharts.spectrogram) && (
                    <AdvancedCharts
                        verticalGroup={verticalGroup}
                        showRawPleth={state.advancedCharts.rawPleth}
                        showResp={state.advancedCharts.resp}
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
