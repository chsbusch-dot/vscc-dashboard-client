import React, { useRef, useState } from 'react';
import {
    Box,
    ToggleButtonGroup,
    ToggleButton,
    TextField,
    Button,
    Slider,
    Checkbox,
    FormControlLabel,
    Select,
    MenuItem,
    Typography,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Divider,
    FormControl,
    InputLabel,
    styled,
} from '@mui/material';
import mqtt, { type MqttClient } from 'mqtt';
import type { SelectChangeEvent } from '@mui/material';
import { useDashboard, type DashboardState, type DashboardActions, type TelemetryRecord } from '../data/DashboardContext';
import { PHYSIO_META, type PhysioId } from '../data/constants';
import { getClinicalColor } from '../utils/colors';

const StyledButton = styled(Button)(({ theme, color }) => ({
    ...(color === 'error' && {
        backgroundColor: theme.palette.error.main,
        color: theme.palette.error.contrastText,
        '&:hover': {
            backgroundColor: theme.palette.error.dark,
        },
    }),
    ...(color === 'success' && {
        backgroundColor: theme.palette.success.main,
        color: theme.palette.success.contrastText,
        '&:hover': {
            backgroundColor: theme.palette.success.dark,
        },
    }),
    ...(color === 'warning' && {
        backgroundColor: theme.palette.warning.main,
        color: theme.palette.warning.contrastText,
        '&:hover': {
            backgroundColor: theme.palette.warning.dark,
        },
    }),
}));

interface ControlsProps {
    state: DashboardState;
    actions: DashboardActions;
    activeMode: 'live' | 'replay' | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlers: Record<string, any>;
}

// Controls Components for each Data Source Type
const UrlControls: React.FC<ControlsProps> = ({ state, actions, activeMode, handlers }) => {
    const isLiveActive = activeMode === 'live';
    const isReplayActive = activeMode === 'replay';
    const isPaused = state.status === 'Paused';

    return (
        <>
            <TextField
                label="JSON URL"
                variant="outlined"
                size="small"
                fullWidth
                placeholder="e.g., http://localhost:8080/data.json"
                value={state.jsonUrl}
                onChange={(e) => actions.setJsonUrl(e.target.value)}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <StyledButton
                    variant="contained"
                    color={isLiveActive && !isPaused ? 'warning' : 'success'}
                    size="small"
                    onClick={handlers.handleStartLive}
                >
                    {isLiveActive ? (isPaused ? 'Resume' : 'Pause') : 'Play Live'}
                </StyledButton>
                <Button
                    variant="contained"
                    color={isReplayActive && !isPaused ? 'warning' : 'primary'}
                    size="small"
                    onClick={handlers.handleReplay}
                >
                    {isReplayActive ? (isPaused ? 'Resume Replay' : 'Pause Replay') : 'Replay'}
                </Button>
                {isReplayActive && (
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handlers.handleSpeedChange}
                        sx={{ minWidth: '45px', color: 'text.primary', borderColor: 'action.active' }}
                    >
                        {handlers.replaySpeed}x
                    </Button>
                )}
                <StyledButton variant="contained" color="error" size="small" onClick={handlers.handleStop}>Stop</StyledButton>
            </Box>
        </>
    );
};

const WebsocketControls: React.FC<ControlsProps> = ({ state, actions, activeMode, handlers }) => {
    const isLiveActive = activeMode === 'live';
    const isPaused = state.status === 'Paused';

    return (
        <>
            <TextField
                label="WebSocket URL"
                variant="outlined"
                size="small"
                fullWidth
                placeholder="e.g., ws://localhost:8080/ws"
                value={state.websocketUrl}
                onChange={(e) => actions.setWebsocketUrl(e.target.value)}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <StyledButton
                    variant="contained"
                    color={isLiveActive && !isPaused ? 'warning' : 'success'}
                    size="small"
                    onClick={handlers.handleStartLiveWs}
                >
                    {isLiveActive ? (isPaused ? 'Resume' : 'Pause') : 'Play Live'}
                </StyledButton>
                <StyledButton variant="contained" color="error" size="small" onClick={handlers.handleStop}>Stop</StyledButton>
            </Box>
        </>
    );
};

const MqttControls: React.FC<ControlsProps> = ({ state, actions, activeMode, handlers }) => {
    const isLiveActive = activeMode === 'live';
    const isPaused = state.status === 'Paused';

    return (
        <>
            <TextField
                label="MQTT Broker URL"
                variant="outlined"
                size="small"
                fullWidth
                placeholder="e.g., mqtt://localhost:1883"
                value={state.mqttBrokerUrl}
                onChange={(e) => actions.setMqttBrokerUrl(e.target.value)}
                sx={{ mb: 1 }}
                helperText="For WebSockets, use ws://localhost:8083/mqtt"
            />
            <TextField
                label="MQTT Topic"
                variant="outlined"
                size="small"
                fullWidth
                value={state.mqttTopic}
                onChange={(e) => actions.setMqttTopic(e.target.value)}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <StyledButton
                    variant="contained"
                    color={isLiveActive && !isPaused ? 'warning' : 'success'}
                    size="small"
                    onClick={handlers.handleStartLiveMqtt}
                >
                    {isLiveActive ? (isPaused ? 'Resume' : 'Pause') : 'Play Live'}
                </StyledButton>
                <StyledButton variant="contained" color="error" size="small" onClick={handlers.handleStop}>Stop</StyledButton>
            </Box>
        </>
    );
};

const UploadControls: React.FC<Omit<ControlsProps, "actions">> = ({ state, activeMode, handlers }) => {
    const isReplayActive = activeMode === 'replay';
    const isPaused = state.status === 'Paused';

    return (
        <>
            <Button variant="contained" component="label" fullWidth>
                Upload File
                <input type="file" hidden onChange={handlers.handleFileChange} />
            </Button>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                {/* Play Live button completely removed! */}
                
                <Button
                    variant="contained"
                    color={isReplayActive && !isPaused ? 'warning' : 'primary'}
                    size="small"
                    onClick={handlers.handleReplay}
                >
                    {isReplayActive ? (isPaused ? 'Resume Replay' : 'Pause Replay') : 'Replay'}
                </Button>
                
                {isReplayActive && (
                    <Button variant="outlined" size="small" onClick={handlers.handleSpeedChange} sx={{ minWidth: '45px', color: 'text.primary', borderColor: 'action.active' }}>
                        {handlers.replaySpeed}x
                    </Button>
                )}
                <StyledButton variant="contained" color="error" size="small" onClick={handlers.handleStop}>Stop</StyledButton>
            </Box>
        </>
    );
};
const Sidebar = () => {
    const { state, actions } = useDashboard();
    const pollingInterval = useRef<number | null>(null);
    const mqttClient = useRef<MqttClient | null>(null);
    const websocket = useRef<WebSocket | null>(null);
    const replayState = useRef<{ intervalId: number | null }>({ intervalId: null });
    const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
    const [activeMode, setActiveMode] = useState<'live' | 'replay' | null>(null);
    const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4 | 8 | 16>(1);
    const replaySpeedRef = useRef(replaySpeed);
    replaySpeedRef.current = replaySpeed;
    const fileRecordsRef = useRef<TelemetryRecord[]>([]);

    const handleSpeedChange = () => {
        setReplaySpeed(currentSpeed => (currentSpeed === 16 ? 1 : ((currentSpeed * 2) as 1 | 2 | 4 | 8 | 16)));
    };

    const handleDataSourceChange = (
        _event: React.MouseEvent<HTMLElement>,
        newDataSource: 'url' | 'websocket' | 'mqtt' | 'upload' | null,
    ) => {
        if (newDataSource !== null && newDataSource !== state.dataSource) {
            // Stop any active stream from the old source
            stopAllStreams();
            // Reset local and global state for the new source
            setActiveMode(null);
            actions.setStatus('Ready');
            actions.setReplayProgress(0);
            // Clear data from the charts
            actions.clearData();
            // Finally, switch to the new data source
            actions.setDataSource(newDataSource);
        }
    };

    const stopAllStreams = () => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        if (replayState.current.intervalId) {
            clearInterval(replayState.current.intervalId);
            replayState.current.intervalId = null;
        }
        websocket.current?.close();
        mqttClient.current?.end();
    };

    const processRawData = (text: string): TelemetryRecord[] => {
        const trimmedText = text.trim();
        if (!trimmedText) return [];

        // Handle the concatenated JSON array format "[...][...]"
        const validJsonString = `[${trimmedText.replace(/\]\s*\[/g, '],[')}]`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records = JSON.parse(validJsonString).flat() as any[];
        
        return records.flatMap(record => {
            // FIX: Timestamp Mismatch (UTC vs Local)
            // The file contains UTC timestamps (e.g., 18:28), but the app parses strings as Local Time.
            // We must parse as UTC, convert to Browser Local Time, and re-serialize the string.
            const rawTime = record.Timestamp || record.SystemLocalTime;
            if (!rawTime) return [];

            // Regex matches VSCapture format: DD-MM-YYYY HH:mm:ss.SSS
            const match = rawTime.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
            if (match) {
                const [, d, m, y, h, min, s, msStr] = match;
                const ms = msStr ? parseInt(msStr) : 0;

                // 1. Construct UTC timestamp (ms) and convert to Seconds (float)
                const localTimeMs = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s), ms).getTime();                
                // 2. Create standardized TelemetryRecord (Seconds, Numeric Value, Snake Case)
                return [{
                    time: localTimeMs / 1000,
                    physio_id: record.PhysioID,
                    value: Number(record.Value),
                    device_id: record.DeviceID || 'mp50',
                }];
            }
            return [];
        });
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) {
                const records = processRawData(text);
                fileRecordsRef.current = records;
                actions.setRecordCount(records.length);
                actions.setStatus('Ready');
            }
        };
        reader.readAsText(file);
    };

    const fetchData = async (shouldAppend: boolean = true) => {
        if (state.dataSource === 'upload') {
            const records = fileRecordsRef.current;
            if (shouldAppend && records.length > 0) {
                actions.appendData(records);
            }
            return records;
        }

        actions.setStatus('Loading');
        try {
            const response = await fetch(state.jsonUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            const records = processRawData(text);
            actions.setRecordCount(records.length);
            if (shouldAppend) {
                actions.appendData(records);
            }
            return records;
        } catch (error) {
            console.error("Failed to fetch or parse data:", error);
        } finally {
            actions.setStatus(pollingInterval.current ? 'Streaming' : 'Ready');
        }
    };

    const handleStartLive = () => {
        if (activeMode === 'live') {
            handlePauseResume();
            return;
        }

        stopAllStreams();
        actions.clearData();
        actions.setStatus('Streaming');
        setActiveMode('live');

        const startPolling = async () => {
            await fetchData(); // Load the full chart first
            // Check if we are still in url mode before starting interval
            if (state.dataSource === 'url') {
                pollingInterval.current = window.setInterval(fetchData, 5000);
            }
        };
        startPolling();
    };

    const handleReplay = async () => {
        if (activeMode === 'replay') {
            handlePauseResume();
            return;
        }

        stopAllStreams();
        actions.clearData();
        actions.setStatus('Loading');
        actions.setReplayProgress(0);
        setActiveMode('replay');

        const records = await fetchData(false);
        if (!records || records.length === 0) {
            actions.setStatus('Ready');
            return;
        }

        let currentIndex = 0;
        actions.setStatus('Streaming');

        replayState.current.intervalId = window.setInterval(() => { // Rule 7
            if (state.status === 'Paused') {
                return;
            }

            if (currentIndex >= records.length) {
                handleStop();
                return;
            }

            const pointsToProcess = replaySpeedRef.current;
            const endIndex = Math.min(currentIndex + pointsToProcess, records.length);
            const recordsToAppend = records.slice(currentIndex, endIndex);

            if (recordsToAppend.length > 0) {
                actions.appendData(recordsToAppend);
                currentIndex = endIndex;
                const progress = (currentIndex / records.length) * 100;
                actions.setReplayProgress(progress);
            }
        }, 50); // Replay tick rate
    };

    const handlePauseResume = () => {
        if (state.status === 'Streaming') {
            actions.setStatus('Paused');
        } else if (state.status === 'Paused') {
            actions.setStatus('Streaming');
            // If we were replaying, the interval is still running but the effect in ChartContainer
            // might need to know we are back to streaming.
            // For live streams (WS/MQTT), they just continue processing messages.
            // For URL replay, the interval continues.
            // For URL polling, we might need to restart it if it was cleared.
        }
    };

    const handleStop = () => {
        stopAllStreams();
        actions.setStatus('Ready');
        actions.setReplayProgress(0);
        setActiveMode(null);
        // Optional: clear data on stop
        // actions.clearData();
    };

    const startLiveStream = (initConnection: () => void) => {
        if (activeMode === 'live') {
            handlePauseResume();
            return;
        }

        stopAllStreams();
        actions.clearData();
        actions.setStatus('Streaming');
        setActiveMode('live');
        initConnection();
    };

    const handleWsMessage = (event: MessageEvent) => {
        if (state.status === 'Paused') return;
        try {
            let message = JSON.parse(event.data);
            if (typeof message === 'string') message = JSON.parse(message);

            const { time, physio_id, value, device_id } = message;
            if (typeof time !== 'number' || typeof physio_id !== 'string' || value === undefined) {
                console.warn("Malformed WS message:", message);
                return;
            }

            actions.appendData([{
                time,
                physio_id: physio_id as PhysioId,
                value,
                device_id: device_id || '',
            }]);
        } catch (error) {
            console.error("Error processing WS message:", error);
        }
    };

    const handleStartLiveWs = () => {
        startLiveStream(() => {
            const ws = new WebSocket(state.websocketUrl);
            ws.onopen = () => actions.setStatus('Streaming');
            ws.onmessage = handleWsMessage;
            ws.onerror = (err) => { console.error("WebSocket error:", err); actions.setStatus('Ready'); };
            ws.onclose = () => { if (websocket.current === ws) { actions.setStatus('Ready'); websocket.current = null; } };
            websocket.current = ws;
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMqttMessage = (_topic: string, payload: any) => {
        if (state.status === 'Paused') {
            return;
        }

        try {
            const message = JSON.parse(payload.toString());
            const { time, physio_id, value, device_id } = message;

            if (typeof time !== 'number' || typeof physio_id !== 'string' || value === undefined) {
                console.warn("Received malformed MQTT message:", message);
                return;
            }

            // Heuristic to detect if timestamp is in milliseconds and convert to seconds.
            // A JS timestamp in ms will be 13 digits, e.g., > 1,000,000,000,000
            const timestampInSeconds = time > 1000000000000 ? time / 1000 : time;

            const newRecord: TelemetryRecord = {
                time: timestampInSeconds,
                physio_id: physio_id as PhysioId,
                value: value,
                device_id: device_id || '',
            };

            actions.appendData([newRecord]);
        } catch (error) {
            console.error("Error processing MQTT message:", error, payload.toString());
        }
    };

    const handleStartLiveMqtt = () => {
        startLiveStream(() => {
            const client = mqtt.connect(state.mqttBrokerUrl);
            mqttClient.current = client;

            client.on('connect', () => {
                console.log('Connected to MQTT broker');
                actions.setStatus('Streaming');
                client.subscribe(state.mqttTopic, (err) => {
                    if (err) {
                        console.error('MQTT subscription error:', err);
                        actions.setStatus('Ready');
                    } else {
                        console.log(`Subscribed to topic: ${state.mqttTopic}`);
                    }
                });
            });

            client.on('message', handleMqttMessage);

            client.on('error', (err) => {
                console.error("MQTT connection error:", err);
                actions.setStatus('Ready');
                client.end();
            });
        });
    };

    const renderDataSourceControls = () => {
        const controlHandlers = {
            handleStartLive,
            handleReplay,
            handleStop,
            handleSpeedChange,
            replaySpeed,
            handleStartLiveWs,
            handleStartLiveMqtt,
            handleFileChange,
        };

        switch (state.dataSource) {
            case 'url':
                return <UrlControls state={state} actions={actions} activeMode={activeMode} handlers={controlHandlers} />;
            case 'websocket':
                return <WebsocketControls state={state} actions={actions} activeMode={activeMode} handlers={controlHandlers} />;
            case 'mqtt':
                return <MqttControls state={state} actions={actions} activeMode={activeMode} handlers={controlHandlers} />;
            case 'upload':
                return <UploadControls state={state} activeMode={activeMode} handlers={controlHandlers} />;
            default:
                return null;
        }
    };

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            <Typography variant="h6" gutterBottom>Data Source</Typography>
            <ToggleButtonGroup
                value={state.dataSource}
                exclusive
                onChange={handleDataSourceChange}
                aria-label="data source"
                fullWidth
                size="small"
            >
                <ToggleButton value="url" aria-label="url">URL</ToggleButton>
                <ToggleButton value="websocket" aria-label="websocket">WS</ToggleButton>
                <ToggleButton value="mqtt" aria-label="mqtt">MQTT</ToggleButton>
                <ToggleButton value="upload" aria-label="upload">File</ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ mt: 2, mb: 2 }}>
                {renderDataSourceControls()}
            </Box>

            <Divider />

            <Box sx={{ mt: 2 }}>
                <Typography variant="h6" gutterBottom>Controls</Typography>

                <Typography gutterBottom>Time Interval (min): {state.timeWindow}</Typography>
                <Slider
                    value={state.timeWindow}
                    onChange={(_, value) => actions.setTimeWindow(value as number)}
                    aria-labelledby="time-window-slider"
                    valueLabelDisplay="auto"
                    step={5}
                    min={5}
                    max={60}
                />

                <FormControlLabel
                    control={<Checkbox checked={state.autoScroll} onChange={(e) => actions.setAutoScroll(e.target.checked)} />}
                    label="Auto-Scroll (Follow Live Data)"
                />

                <FormControl fullWidth sx={{ mt: 2 }}>
                    <Typography gutterBottom sx={{ mt: 2, fontWeight: 500 }}>
                        Aggregation: {
                            state.aggregation === 'raw' ? 'Real-Time (High Frequency)' : 
                            state.aggregation === '1min' ? '1 Minute Averages' : 
                            '5 Minute Averages'
                        }
                    </Typography>
                    <Slider
                        value={state.aggregation === 'raw' ? 0 : state.aggregation === '1min' ? 1 : 2}
                        onChange={(_, value) => {
                            const mapping = { 0: 'raw', 1: '1min', 2: '5min' } as const;
                            actions.setAggregation(mapping[value as 0 | 1 | 2]);
                        }}
                        step={null}
                        marks={[
                            { value: 0, label: 'RT' },
                            { value: 1, label: '1m' },
                            { value: 2, label: '5m' }
                        ]}
                        min={0}
                        max={2}
                    />
                </FormControl>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
                <ToggleButtonGroup
                    value={activeTab}
                    exclusive
                    onChange={(_, newTab) => { if (newTab) setActiveTab(newTab); }}
                    aria-label="chart selection tabs"
                    fullWidth
                    size="small"
                    sx={{ mb: 2, flexShrink: 0 }}
                >
                    <ToggleButton value="basic" aria-label="basic vital signs">Basic Vitals</ToggleButton>
                    <ToggleButton value="advanced" aria-label="advanced charts">Advanced Charts</ToggleButton>
                </ToggleButtonGroup>

                {activeTab === 'basic' && (
                    <>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexShrink: 0 }}>
                            <Button variant="outlined" size="small" onClick={actions.selectAll}>Select All</Button>
                            <Button variant="outlined" size="small" onClick={actions.deselectAll}>Deselect All</Button>
                        </Box>
                        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                            <List dense>
                                {(Object.keys(PHYSIO_META) as PhysioId[]).map((id) => (
                                    <ListItem
                                        key={id}
                                        dense
                                        onClick={() => actions.togglePhysioId(id)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <ListItemIcon>
                                            <Checkbox
                                                edge="start"
                                                checked={state.selectedPhysioIds[id]}
                                                tabIndex={-1}
                                                disableRipple
                                                sx={{
                                                    color: getClinicalColor(id),
                                                    '&.Mui-checked': {
                                                        color: getClinicalColor(id),
                                                    },
                                                }}
                                            />
                                        </ListItemIcon>
                                        <ListItemText primary={PHYSIO_META[id].name} />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    </>
                )}

                {activeTab === 'advanced' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflowY: 'auto' }}>
                        <FormControlLabel
                            control={<Checkbox checked={state.advancedCharts.rawPleth} onChange={() => actions.toggleAdvancedChart('rawPleth')} />}
                            label="Raw PLETH Waveform"
                        />
                        <FormControlLabel
                            control={<Checkbox checked={state.advancedCharts.ppi} onChange={() => actions.toggleAdvancedChart('ppi')} />}
                            label="PPI Plot"
                        />
                        <FormControlLabel
                            control={<Checkbox checked={state.advancedCharts.overlay} onChange={() => actions.toggleAdvancedChart('overlay')} />}
                            label="Derived Parameters Overlay"
                        />
                        <FormControlLabel
                            control={<Checkbox checked={state.advancedCharts.spectrogram} onChange={() => actions.toggleAdvancedChart('spectrogram')} />}
                            label="Spectrogram"
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default Sidebar;