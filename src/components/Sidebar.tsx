import { useRef, useState, useEffect } from 'react';
import {
    Box,
    Button,
    Slider,
    Checkbox,
    FormControlLabel,
    Typography,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Divider,
    FormControl,
    styled,
    ToggleButtonGroup,
    ToggleButton,
    LinearProgress,
} from '@mui/material';
import mqtt, { type MqttClient } from 'mqtt';
import { useDashboard, type TelemetryRecord, type ProviderId, type WaveformId } from '../data/DashboardContext';
import { PHYSIO_META, type PhysioId } from '../data/constants';
import { getClinicalColor } from '../utils/colors';
import { DataSourceModal } from './DataSourceModal';
import { isMqttTelemetryMessage, processRawData } from '../utils/dataParser';

const StyledButton = styled(Button)(({ theme, color }) => ({
    ...(color === 'error' && { backgroundColor: theme.palette.error.main, color: theme.palette.error.contrastText, '&:hover': { backgroundColor: theme.palette.error.dark } }),
    ...(color === 'success' && { backgroundColor: theme.palette.success.main, color: theme.palette.success.contrastText, '&:hover': { backgroundColor: theme.palette.success.dark } }),
    ...(color === 'warning' && { backgroundColor: theme.palette.warning.main, color: theme.palette.warning.contrastText, '&:hover': { backgroundColor: theme.palette.warning.dark } }),
}));

const Sidebar = () => {
    const { state, actions, stopStreamsRef } = useDashboard();
    const [modalOpen, setModalOpen] = useState(false);
    const [triggerUploadCount, setTriggerUploadCount] = useState(0);
    
    // Refs for connection objects and state that shouldn't trigger re-renders
    const pollingInterval = useRef<number | null>(null);
    const mqttClient = useRef<MqttClient | null>(null);
    const websocket = useRef<WebSocket | null>(null);
    const replayState = useRef<{ intervalId: number | null }>({ intervalId: null });
    const statusRef = useRef(state.status);
    const [activeMode, setActiveMode] = useState<'live' | 'replay' | null>(null);
    const [replaySpeed] = useState<1 | 2 | 4 | 8 | 16>(1);
    const replaySpeedRef = useRef(replaySpeed);
    const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
    
    useEffect(() => { statusRef.current = state.status; }, [state.status]);
    useEffect(() => { replaySpeedRef.current = replaySpeed; }, [replaySpeed]);

    // Keeps state refs fresh without breaking intervals
    const togglesRef = useRef(state.globalWaveformToggles);
    const mappingsRef = useRef(state.providerMappings);
    useEffect(() => { togglesRef.current = state.globalWaveformToggles; }, [state.globalWaveformToggles]);
    useEffect(() => { mappingsRef.current = state.providerMappings; }, [state.providerMappings]);
    
    const hfDataBuffer = useRef<Record<string, TelemetryRecord[]>>({});
    useEffect(() => {
        const flushInterval = setInterval(() => {
            if (statusRef.current === 'Paused' || !mqttClient.current?.connected) return;
            const bufferKeys = Object.keys(hfDataBuffer.current);
            if (bufferKeys.length === 0) return;
            let recordsToAppend: TelemetryRecord[] = [];
            bufferKeys.forEach(topic => {
                // Check if this topic has been globally toggled OFF
                const mappedId = (Object.keys(mappingsRef.current) as WaveformId[]).find(
                    id => mappingsRef.current[id].mappings.mqtt === topic
                );
                if (mappedId && !togglesRef.current[mappedId]) {
                    hfDataBuffer.current[topic] = []; // Purge dead buffers
                    return;
                }

                if (hfDataBuffer.current[topic]?.length > 0) {
                    recordsToAppend = recordsToAppend.concat(hfDataBuffer.current[topic]);
                    hfDataBuffer.current[topic] = [];
                }
            });
            if (recordsToAppend.length > 0) actions.appendData(recordsToAppend);
        }, 100);
        return () => clearInterval(flushInterval);
    }, [actions]);

    useEffect(() => {
        const client = mqttClient.current;
        if (client && client.connected) {
            (Object.keys(state.providerMappings) as WaveformId[]).forEach((id) => {
                const topic = state.providerMappings[id].mappings.mqtt;
                const enabled = state.globalWaveformToggles[id] && state.dataSource === 'mqtt';
                
                if (enabled && topic) {
                    client.subscribe(topic, { qos: 0 }, (err) => {
                        if (!err) console.log(`Successfully subscribed to MQTT topic: ${topic}`);
                    });
                } else if (topic) {
                    client.unsubscribe(topic, (err) => {
                        if (!err) console.log(`Unsubscribed from MQTT topic: ${topic}`);
                    });
                    if (hfDataBuffer.current[topic]) {
                        hfDataBuffer.current[topic] = []; // Clear immediately
                    }
                }
            });
        }
    }, [state.globalWaveformToggles, state.providerMappings, state.dataSource, state.status]);

    const stopAllStreams = () => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        pollingInterval.current = null;
        if (replayState.current.intervalId) clearInterval(replayState.current.intervalId);
        replayState.current.intervalId = null;
        if (websocket.current) websocket.current.close();
        websocket.current = null;
        if (mqttClient.current) mqttClient.current.end(true);
        mqttClient.current = null;
    };

    const handleDataSourceChange = (newDataSource: ProviderId | null) => {
        if (newDataSource !== null && newDataSource !== state.dataSource) {
            stopAllStreams();
            setActiveMode(null);
            actions.setStatus('Ready');
            actions.setReplayProgress(0);
            actions.clearData();
            actions.setDataSource(newDataSource);
            actions.setAutoScroll(true);
            if (newDataSource === 'upload') {
                setTriggerUploadCount(c => c + 1);
            }
        }
    };
    
    const handleApplyConfig = () => {
        if (state.dataSource === 'upload') {
            setTriggerUploadCount(c => c + 1);
        }
    };

    const lastProcessedTriggerRef = useRef(0);
    useEffect(() => {
        // We only proceed if triggered AND React has flushed the file selection to Context
        if (triggerUploadCount > lastProcessedTriggerRef.current && state.dataSource === 'upload') {
            lastProcessedTriggerRef.current = triggerUploadCount;
            
            const loadFilesFromState = async () => {
                actions.setStatus('Loading');
                // Update the ref synchronously too: the CSV chunk loop guards on
                // statusRef.current and would otherwise read the stale 'Ready' value
                // (the effect that syncs this ref hasn't re-run yet) and break on its
                // first iteration, silently dropping all waveform data.
                statusRef.current = 'Loading';
                actions.clearData();
                
                const filePromises = (Object.keys(state.fileInputs) as WaveformId[]).map(async (waveformId) => {
                    const file = state.fileInputs[waveformId];
                    // Skip if no file or if the waveform is globally toggled off
                    if (!file || !state.globalWaveformToggles[waveformId]) return;
                    
                    actions.setUploadProgress(waveformId, 0); // Initialize progress
                    
                    try {
                        if (file.name.endsWith('.json')) {
                            // JSON uses the whole-file FileReader approach because it requires bracket matching
                            const text = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onprogress = (event) => {
                                    if (event.lengthComputable) {
                                        actions.setUploadProgress(waveformId, Math.round((event.loaded / event.total) * 100));
                                    }
                                };
                                reader.onload = () => {
                                    actions.setUploadProgress(waveformId, 100);
                                    resolve(reader.result as string);
                                };
                                reader.onerror = () => reject(new Error("File reading failed"));
                                reader.readAsText(file);
                            });
                            
                            const records = processRawData(text);
                            if (records.length > 0) {
                                records.sort((a, b) => a.time - b.time);
                                actions.appendData(records);
                            }
                        } else if (file.name.endsWith('.csv')) {
                            // Extract specific target PhysioID dynamically (e.g. NOM_PLETHWaveExport.csv -> NOM_PLETH)
                            const uploadFileName = state.providerMappings[waveformId]?.mappings.upload;
                            const physioIdMatch = uploadFileName ? uploadFileName.split('Wave')[0] : null;
                            const physioId = physioIdMatch || `NOM_${waveformId.toUpperCase()}`;
                            
                            // CSV uses Chunked Streaming for Massive Files (300MB - 2GB+)
                            const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (perfect balance between RAM & thread blocking)
                            let offset = 0;
                            let remainder = '';
                            
                            while (offset < file.size) {
                                // Check if user manually clicked "Stop" mid-upload
                                if (statusRef.current === 'Ready' || statusRef.current === 'Paused') break;
                                
                                const slice = file.slice(offset, offset + CHUNK_SIZE);
                                const chunkText = await slice.text();
                                
                                const lines = (remainder + chunkText).split(/\r?\n/);
                                remainder = lines.pop() || ''; // Keep the last incomplete line for the next chunk
                                
                                const records: TelemetryRecord[] = [];
                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i].trim();
                                    if (!line || line.startsWith('Date') || line.startsWith('Time')) continue;
                                    
                                    const parts = line.split(',');
                                    if (parts.length < 4) continue;
                                    
                                    const rawTime = parts[2];
                                    if (!rawTime || rawTime.length < 19) continue;
                                    
                                    // High-speed substring date parsing (bypassing slow Regex limits)
                                    // Expected: "14-03-2026 04:39:00.123"
                                    const d = parseInt(rawTime.substring(0, 2), 10);
                                    const m = parseInt(rawTime.substring(3, 5), 10) - 1; // JS months are 0-11
                                    const y = parseInt(rawTime.substring(6, 10), 10);
                                    const h = parseInt(rawTime.substring(11, 13), 10);
                                    const min = parseInt(rawTime.substring(14, 16), 10);
                                    const s = parseInt(rawTime.substring(17, 19), 10);
                                    let ms = 0;
                                    if (rawTime.length > 20) {
                                        ms = parseInt(rawTime.substring(20).padEnd(3, '0'), 10);
                                    }
                                    
                                    const utcTimeMs = Date.UTC(y, m, d, h, min, s, ms);
                                    if (isNaN(utcTimeMs)) continue;
                                    
                                    const value = parseFloat(parts[3]);
                                    if (isNaN(value)) continue;
                                    
                                    records.push({ time: utcTimeMs / 1000, physio_id: physioId as PhysioId, value, device_id: 'mp50' });
                                }
                                
                                if (records.length > 0) {
                                    actions.appendData(records);
                                }
                                
                                offset += CHUNK_SIZE;
                                actions.setUploadProgress(waveformId, Math.min(100, Math.round((offset / file.size) * 100)));
                                
                                // Yield to main thread to prevent UI freezing (Allows React to update the progress bar)
                                await new Promise(resolve => setTimeout(resolve, 0));
                            }
                        }
                    } catch (err) { console.error(`Error processing file for ${waveformId}:`, err); }
                });
                
                await Promise.all(filePromises);
                actions.setStatus('Ready');
            };
            
            loadFilesFromState().catch(console.error);
        }
    }, [triggerUploadCount, state.dataSource, state.fileInputs, state.providerMappings, actions, state.globalWaveformToggles]);
    
    const handlePauseResume = () => actions.setStatus(state.status === 'Streaming' ? 'Paused' : 'Streaming');
    
    const handleStop = () => {
        stopAllStreams();
        actions.clearData();        // blank the charts — Stop means stop, not "freeze on stale data"
        actions.setStatus('Ready');
        actions.setReplayProgress(0);
        setActiveMode(null);
    };

    // Expose the stop handler so other features (e.g. loading a stored session
    // from the Sessions drawer) can stop an active live stream. Re-registered
    // every render to keep the closure fresh.
    useEffect(() => {
        stopStreamsRef.current = handleStop;
        return () => { stopStreamsRef.current = null; };
    });

    const handleStartLive = () => {
        if (activeMode === 'live') { handlePauseResume(); return; }
        stopAllStreams();
        actions.clearData();
        setActiveMode('live');
        actions.setAutoScroll(true);
        const startPolling = async () => {
            actions.setStatus('Loading');
            const response = await fetch(state.jsonUrl);
            const text = await response.text();
            const records = processRawData(text);
            actions.appendData(records);
            actions.setStatus('Streaming');
            if (state.dataSource === 'url') {
                pollingInterval.current = window.setInterval(() => {
                    const poll = async () => {
                        const resp = await fetch(state.jsonUrl);
                        const newText = await resp.text();
                        const newRecords = processRawData(newText);
                        actions.appendData(newRecords);
                    };
                    poll().catch(console.error);
                }, 5000);
            }
        };
        startPolling().catch(console.error);
    };

    const handleReplay = async () => {
        // Implementation for replay...
    };

    const startLiveStream = (initConnection: () => void) => {
        if (activeMode === 'live') { handlePauseResume(); return; }
        stopAllStreams();
        actions.clearData();
        setActiveMode('live');
        actions.setAutoScroll(true);
        actions.setStatus('Streaming');
        initConnection();
    };

    const handleMqttMessage = (topic: string, payload: Buffer) => {
        if (statusRef.current === 'Paused') return;
        try {
            const message: unknown = JSON.parse(payload.toString());
            if (!isMqttTelemetryMessage(message)) return;
            const { time, physio_id, value, device_id } = message;
            if (!physio_id) return;

            const mappedId = (Object.keys(mappingsRef.current) as WaveformId[]).find(
                id => mappingsRef.current[id].mappings.mqtt === topic
            );

            // Drop incoming payload entirely if globally toggled off
            if (!mappedId || !togglesRef.current[mappedId]) return;

            const record: TelemetryRecord = { time, physio_id: physio_id as PhysioId, value, device_id: device_id || 'mp50' };
            
            if (mappingsRef.current[mappedId].isHighFrequency) {
                if (!hfDataBuffer.current[topic]) hfDataBuffer.current[topic] = [];
                hfDataBuffer.current[topic].push(record);
            } else {
                actions.appendData([record]);
            }
        } catch (error) { console.error("Error processing MQTT message:", error); }
    };
    
    const handleStartLiveMqtt = () => {
        startLiveStream(() => {
            const client = mqtt.connect(state.mqttBrokerUrl);
            mqttClient.current = client;
            client.on('connect', () => {
                actions.setStatus('Streaming');
                // Subscribe here: the subscription effect only fires on state changes
                // and skips while the client is still connecting, so the initial
                // CONNACK would otherwise never trigger a subscribe on remote brokers.
                (Object.keys(mappingsRef.current) as WaveformId[]).forEach((id) => {
                    const topic = mappingsRef.current[id].mappings.mqtt;
                    if (topic && togglesRef.current[id]) {
                        client.subscribe(topic, { qos: 0 }, (err) => {
                            if (!err) console.log(`Successfully subscribed to MQTT topic: ${topic}`);
                        });
                    }
                });
            });
            client.on('message', handleMqttMessage);
            client.on('error', (err) => { console.error("MQTT error:", err); handleStop(); });
            client.on('close', () => { if (activeMode === 'live' && state.dataSource === 'mqtt') handleStop(); });
        });
    };

    const handleStartLiveWs = () => {
        // Implementation for websocket...
    };

    const getActivePlayHandler = () => {
        switch(state.dataSource) {
            case 'url': return handleStartLive;
            case 'mqtt': return handleStartLiveMqtt;
            case 'websocket': return handleStartLiveWs;
            default: return () => console.log("No active live handler");
        }
    }

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            {/* SECTION 1: Data Source Config */}
            <Box sx={{ mb: 2, flexShrink: 0 }}>
                <Typography variant="h6" gutterBottom>Data Source</Typography>
                <Button variant="contained" fullWidth onClick={() => setModalOpen(true)}>
                    Configure Data Source
                </Button>
                
                {state.status === 'Loading' && (Object.keys(state.uploadProgress) as WaveformId[]).map((id) => {
                    if (state.globalWaveformToggles[id] && state.fileInputs[id]) {
                        const prog = state.uploadProgress[id];
                        return (
                            <Box key={id} sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Reading {id}... {prog}%
                                </Typography>
                                <LinearProgress variant="determinate" value={prog} sx={{ height: 6, borderRadius: 1 }} />
                            </Box>
                        );
                    }
                    return null;
                })}

                <DataSourceModal 
                    open={modalOpen} 
                    onClose={() => setModalOpen(false)}
                    handlers={{ handleDataSourceChange, handleApplyConfig }}
                />
            </Box>

            {/* SECTION 2: Playback Controls */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, flexShrink: 0 }}>
                 <StyledButton
                    variant="contained"
                    color={activeMode === 'live' && state.status !== 'Paused' ? 'warning' : 'success'}
                    size="small"
                    onClick={getActivePlayHandler()}
                >
                    {activeMode === 'live' ? (state.status === 'Paused' ? 'Resume' : 'Pause') : 'Play Live'}
                </StyledButton>
                <Button variant="contained" size="small" onClick={() => { void handleReplay(); }}>Replay</Button>
                <StyledButton variant="contained" color="error" size="small" onClick={handleStop}>Stop</StyledButton>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* SECTION 3: Time & Aggregation Controls (RESTORED) */}
            <Box sx={{ flexShrink: 0 }}>
                <Typography variant="h6" gutterBottom>Controls</Typography>
                <Typography gutterBottom>Time Interval (min): {state.timeWindow}</Typography>
                <Slider value={state.timeWindow} onChange={(_, value) => actions.setTimeWindow(value)} aria-labelledby="time-window-slider" valueLabelDisplay="auto" step={5} min={5} max={60} />
                <FormControlLabel control={<Checkbox checked={state.autoScroll} onChange={(e) => actions.setAutoScroll(e.target.checked)} />} label="Auto-Scroll (Follow Live Data)" />
                <FormControl fullWidth sx={{ mt: 2 }}>
                    <Typography gutterBottom>Aggregation</Typography>
                    <Slider value={state.aggregation === 'raw' ? 0 : state.aggregation === '1min' ? 1 : 2} onChange={(_, value) => actions.setAggregation(({ 0: 'raw', 1: '1min', 2: '5min' } as const)[value as 0 | 1 | 2])} step={null} marks={[{ value: 0, label: 'RT' }, { value: 1, label: '1m' }, { value: 2, label: '5m' }]} min={0} max={2} />
                </FormControl>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* SECTION 4: Chart & Data Type Selectors (RESTORED) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
                 <ToggleButtonGroup value={activeTab} exclusive onChange={(_, v: 'basic' | 'advanced' | null) => v && setActiveTab(v)} fullWidth size="small" sx={{ mb: 2, flexShrink: 0 }}>
                    <ToggleButton value="basic">Basic Vitals</ToggleButton>
                    <ToggleButton value="advanced">Advanced Charts</ToggleButton>
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
                                    <ListItem key={id} dense onClick={() => actions.togglePhysioId(id)} sx={{ cursor: 'pointer', py: 0 }}>
                                        <ListItemIcon>
                                            <Checkbox edge="start" checked={!!state.selectedPhysioIds[id]} tabIndex={-1} disableRipple sx={{ color: getClinicalColor(id), '&.Mui-checked': { color: getClinicalColor(id) } }} />
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
                        <FormControlLabel control={<Checkbox checked={state.advancedCharts.rawPleth} onChange={() => actions.toggleAdvancedChart('rawPleth')} />} label="Raw PLETH Waveform" />
                        <FormControlLabel control={<Checkbox checked={state.advancedCharts.resp} onChange={() => actions.toggleAdvancedChart('resp')} />} label="Respiration Waveform" />
                        <FormControlLabel control={<Checkbox checked={state.advancedCharts.ppi} onChange={() => actions.toggleAdvancedChart('ppi')} />} label="PPI Plot" />
                        <FormControlLabel control={<Checkbox checked={state.advancedCharts.overlay} onChange={() => actions.toggleAdvancedChart('overlay')} />} label="Derived Parameters Overlay" />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default Sidebar;
