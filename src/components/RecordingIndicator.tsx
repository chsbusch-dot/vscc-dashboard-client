import { useEffect, useState } from 'react';
import { Chip, Tooltip } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { fetchSessions, type SessionInfo } from '../data/sessionsApi';
import { formatFullTime } from '../utils/timeFormat';
import { useDashboard } from '../data/DashboardContext';

const POLL_INTERVAL_MS = 15000;

/**
 * Small header chip shown whenever the backend reports a session with
 * recording=true, so the operator can see recording state without opening
 * the Sessions drawer. Polls lightly (15s) and hides itself when the
 * backend is unreachable.
 */
const RecordingIndicator = () => {
    const { state } = useDashboard();
    const [recordingSession, setRecordingSession] = useState<SessionInfo | null>(null);

    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const sessions = await fetchSessions();
                if (!cancelled) {
                    setRecordingSession(sessions.find(s => s.recording) ?? null);
                }
            } catch {
                // Backend unreachable — hide the chip rather than spamming errors
                if (!cancelled) setRecordingSession(null);
            }
        };
        void poll();
        const intervalId = window.setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    if (!recordingSession) return null;

    const label = recordingSession.label?.trim()
        ? recordingSession.label
        : `Session #${recordingSession.id}`;

    return (
        <Tooltip title={`Recording since ${formatFullTime(recordingSession.started_at, state.timeDisplay)}`}>
            <Chip
                icon={<FiberManualRecordIcon />}
                label={`REC • ${label}`}
                size="small"
                sx={{
                    ml: 2,
                    fontWeight: 'bold',
                    bgcolor: 'error.main',
                    color: 'error.contrastText',
                    '& .MuiChip-icon': { color: 'inherit' },
                    animation: 'vsccRecPulse 1.4s ease-in-out infinite',
                    '@keyframes vsccRecPulse': {
                        '0%': { opacity: 1 },
                        '50%': { opacity: 0.55 },
                        '100%': { opacity: 1 },
                    },
                }}
            />
        </Tooltip>
    );
};

export default RecordingIndicator;
