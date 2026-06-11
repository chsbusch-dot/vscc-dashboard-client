import React, { useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Switch,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    alpha
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useDashboard, type ProviderId, type WaveformId } from '../data/DashboardContext';

interface DataSourceModalProps {
    open: boolean;
    onClose: () => void;
    handlers: {
        handleDataSourceChange: (newDataSource: ProviderId | null) => void;
        handleFileChange?: (event: React.ChangeEvent<HTMLInputElement>) => void; // Maintained for backward compatibility
        handleApplyConfig?: () => void; // Trigger for processing configurations without changing the source
    }
}

export const DataSourceModal: React.FC<DataSourceModalProps> = ({ open, onClose, handlers }) => {
    const { state, actions } = useDashboard();
    
    const [localProvider, setLocalProvider] = useState<ProviderId>(state.dataSource || 'mqtt');
    const [localMappings, setLocalMappings] = useState(state.providerMappings);
    const [localEndpoints, setLocalEndpoints] = useState({
        url: state.jsonUrl,
        websocket: state.websocketUrl,
        mqtt: state.mqttBrokerUrl,
        upload: ''
    });

    // Synchronize local state when modal opens
    const [prevOpen, setPrevOpen] = useState(open);
    if (open && !prevOpen) {
        setLocalProvider(state.dataSource || 'mqtt');
        setLocalMappings(state.providerMappings);
        setLocalEndpoints({
            url: state.jsonUrl,
            websocket: state.websocketUrl,
            mqtt: state.mqttBrokerUrl,
            upload: ''
        });
        setPrevOpen(true);
    } else if (!open && prevOpen) {
        setPrevOpen(false);
    }

    const handleSave = () => {
        // Task 2: Upload Data Validation
        if (localProvider === 'upload') {
            const missingFiles = (Object.keys(state.globalWaveformToggles) as WaveformId[])
                .filter(id => state.globalWaveformToggles[id] && !state.fileInputs[id]);
            
            if (missingFiles.length > 0) {
                const labels = missingFiles.map(id => state.providerMappings[id].label).join(', ');
                alert(`Please select a file for active waveforms:\n\n${labels}`);
                return; // Prevent the modal from closing and processing
            }
        }

        actions.setJsonUrl(localEndpoints.url);
        actions.setWebsocketUrl(localEndpoints.websocket);
        actions.setMqttBrokerUrl(localEndpoints.mqtt);
        
        (Object.keys(localMappings) as WaveformId[]).forEach(id => {
            const map = localMappings[id].mappings;
            (Object.keys(map) as ProviderId[]).forEach(provider => {
                actions.setProviderMapping(id, provider, map[provider]);
            });
        });
        
        if (localProvider !== state.dataSource) {
            handlers.handleDataSourceChange(localProvider);
        } else if (handlers.handleApplyConfig) {
            handlers.handleApplyConfig();
        }

        onClose();
    };

    const handleMappingChange = (id: WaveformId, val: string) => {
        setLocalMappings(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                mappings: {
                    ...prev[id].mappings,
                    [localProvider]: val
                }
            }
        }));
    };

    const getDynamicLabel = (label: string) => {
        switch (localProvider) {
            case 'url': return `${label} JSON Path`;
            case 'websocket': return `${label} WS Topic/Path`;
            case 'mqtt': return `${label} MQTT Topic`;
            case 'upload': return `${label} CSV File Path`;
            default: return label;
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Configure Data Matrix</DialogTitle>
            <DialogContent>
                <Box sx={{ pt: 1, pb: 2 }}>
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel>Primary Data Source Provider</InputLabel>
                        <Select
                            value={localProvider}
                            label="Primary Data Source Provider"
                            onChange={(e) => setLocalProvider(e.target.value as ProviderId)}
                        >
                            <MenuItem value="url">URL (Polling)</MenuItem>
                            <MenuItem value="websocket">WebSocket</MenuItem>
                            <MenuItem value="mqtt">MQTT Broker</MenuItem>
                            <MenuItem value="upload">Local File Upload</MenuItem>
                        </Select>
                    </FormControl>
                    
                    {localProvider !== 'upload' && (
                        <TextField
                            label={`Global Endpoint (${localProvider.toUpperCase()})`}
                            variant="outlined"
                            size="small"
                            fullWidth
                            sx={{ mb: 3 }}
                            value={localEndpoints[localProvider]}
                            onChange={(e) => setLocalEndpoints(prev => ({ ...prev, [localProvider]: e.target.value }))}
                        />
                    )}

                    <Typography variant="subtitle2" gutterBottom>Waveform Toggles & Matrix Mapping</Typography>
                    
                    {(Object.keys(localMappings) as WaveformId[]).map((id) => {
                        const config = localMappings[id];
                        const isActive = state.globalWaveformToggles[id];
                        
                        return (
                            <Accordion 
                                key={id} 
                                expanded={isActive}
                                onChange={(_, expanded) => actions.setGlobalWaveformToggle(id, expanded)}
                                disableGutters
                                sx={{ 
                                    opacity: isActive ? 1 : 0.6,
                                    backgroundColor: isActive ? 'inherit' : alpha('#000', 0.04),
                                    transition: 'all 0.2s ease',
                                    '&:before': { display: 'none' },
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    mb: 1,
                                    borderRadius: 1
                                }}
                            >
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <Switch 
                                            size="small" 
                                            checked={isActive} 
                                            onClick={(e) => e.stopPropagation()} 
                                            onChange={(e) => actions.setGlobalWaveformToggle(id, e.target.checked)}
                                            sx={{ mr: 2 }}
                                        />
                                        <Typography variant="body1">{config.label}</Typography>
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    {localProvider === 'upload' ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Button variant="outlined" component="label" size="small" disabled={!isActive} sx={{ flexShrink: 0 }}>
                                                Select File
                                                <input 
                                                    type="file" 
                                                    hidden 
                                                    accept=".csv,.json,.txt"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] || null;
                                                        actions.setFileInput(id, file);
                                                        e.target.value = ''; // Reset to allow re-selecting the same file if needed
                                                    }} 
                                                />
                                            </Button>
                                            <Typography variant="body2" color={state.fileInputs[id] ? "text.primary" : "text.secondary"} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {state.fileInputs[id]?.name || 'No file selected'}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={getDynamicLabel(config.label)}
                                            value={config.mappings[localProvider]}
                                            onChange={(e) => handleMappingChange(id, e.target.value)}
                                            disabled={!isActive}
                                        />
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        );
                    })}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="primary">
                    {localProvider === 'upload' ? 'Upload Data' : 'Apply Configuration'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};