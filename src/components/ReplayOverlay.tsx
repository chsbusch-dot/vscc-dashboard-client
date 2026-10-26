import { Box, LinearProgress, Typography } from '@mui/material';
import { useDashboard } from '../data/DashboardContext';
import { formatFullTime } from '../utils/timeFormat';

/**
 * Sits over a chart while a stored session is replayed: a progress bar while a
 * window loads, and a note when the visible range holds no data, naming the
 * session's own start and end so the user knows where to look.
 * Renders nothing outside replay. Never takes pointer events from the chart.
 */
const ReplayOverlay = () => {
    const { state } = useDashboard();
    const session = state.loadedSession;
    if (!session) return null;

    const loading = state.status === 'Loading';
    const empty = state.replayEmpty && !loading;
    if (!loading && !empty) return null;

    return (
        <Box
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 5,
            }}
        >
            {loading && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0 }} />}
            {empty && (
                <Typography
                    variant="body2"
                    sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'rgba(0, 0, 0, 0.6)', color: '#fff', textAlign: 'center' }}
                >
                    No data in this range. The session runs {formatFullTime(session.start, state.timeDisplay)} to {formatFullTime(session.end, state.timeDisplay)}.
                </Typography>
            )}
        </Box>
    );
};

export default ReplayOverlay;
