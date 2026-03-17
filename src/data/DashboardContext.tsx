import React, { createContext, useContext, useReducer, useRef, useCallback } from 'react';
import { PHYSIO_META, type PhysioId } from './constants';

// --- Types ---

export interface TelemetryRecord {
    time: number;
    physio_id: PhysioId;
    value: number | null;
    device_id: string;
}

export interface TimeSeries {
    x: number[];
    y: (number | null)[];
}

export type WaveformId = 'VitalSigns' | 'ECG' | 'EEG' | 'Pleth' | 'Resp';
export type ProviderId = 'url' | 'websocket' | 'mqtt' | 'upload';

export interface WaveformMatrixEntry {
    label: string;
    isHighFrequency: boolean;
    mappings: Record<ProviderId, string>;
}

export interface DashboardState {
    status: 'Ready' | 'Loading' | 'Streaming' | 'Paused' | 'Error';
    dataSource: ProviderId | null;
    jsonUrl: string;
    websocketUrl: string;
    mqttBrokerUrl: string;
    globalWaveformToggles: Record<WaveformId, boolean>;
    providerMappings: Record<WaveformId, WaveformMatrixEntry>;
    fileInputs: Record<WaveformId, File | null>;
    uploadProgress: Record<WaveformId, number>;
    recordCount: number;
    replayProgress: number;
    timeWindow: number;
    autoScroll: boolean;
    aggregation: 'raw' | '1min' | '5min';
    selectedPhysioIds: Record<PhysioId, boolean>;
    advancedCharts: {
        rawPleth: boolean;
        resp: boolean;
        ppi: boolean;
        overlay: boolean;
        spectrogram: boolean;
    };
}

export interface DashboardActions {
    setStatus: (status: DashboardState['status']) => void;
    setDataSource: (source: DashboardState['dataSource']) => void;
    setJsonUrl: (url: string) => void;
    setWebsocketUrl: (url: string) => void;
    setMqttBrokerUrl: (url: string) => void;
    setGlobalWaveformToggle: (id: WaveformId, enabled: boolean) => void;
    setProviderMapping: (id: WaveformId, provider: ProviderId, value: string) => void;
    setFileInput: (id: WaveformId, file: File | null) => void;
    setUploadProgress: (id: WaveformId, progress: number) => void;
    setRecordCount: (count: number) => void;
    setReplayProgress: (progress: number) => void;
    setTimeWindow: (window: number) => void;
    setAutoScroll: (auto: boolean) => void;
    setAggregation: (agg: DashboardState['aggregation']) => void;
    togglePhysioId: (id: PhysioId) => void;
    selectAll: () => void;
    deselectAll: () => void;
    toggleAdvancedChart: (chart: keyof DashboardState['advancedCharts']) => void;
    appendData: (records: TelemetryRecord[]) => void;
    clearData: () => void;
}

interface DashboardContextType {
    state: DashboardState;
    actions: DashboardActions;
    dataRef: React.MutableRefObject<Record<string, TimeSeries>>;
    subscribeToData: (callback: (records: TelemetryRecord[] | 'clear') => void) => () => void;
}

const initialState: DashboardState = {
    status: 'Ready',
    dataSource: 'mqtt',
    jsonUrl: 'http://192.168.1.188:8000/DataExportVSC.json',
    websocketUrl: 'ws://192.168.1.188:8000/ws/stream',
    mqttBrokerUrl: 'ws://192.168.1.188:8083/mqtt',
    globalWaveformToggles: {
        VitalSigns: true,
        ECG: false,
        EEG: false,
        Pleth: true,
        Resp: true,
    },
    providerMappings: {
        VitalSigns: { label: 'Vital Signs', isHighFrequency: false, mappings: { url: 'DataExportVSC.json', websocket: 'ws/stream', mqtt: 'mp50/VitalSigns', upload: 'DataExportVSC.json' } },
        ECG: { label: 'HF ECG', isHighFrequency: true, mappings: { url: 'ECG.json', websocket: 'ws/stream/ecg', mqtt: 'mp50/HF-ECG', upload: 'NOM_ECG_ELEC_POTL_IIWaveExport.csv' } },
        EEG: { label: 'HF EEG', isHighFrequency: true, mappings: { url: 'EEG.json', websocket: 'ws/stream/eeg', mqtt: 'mp50/HF-EEG', upload: 'NOM_EEG_ELEC_POTL_CRTXWaveExport.csv' } },
        Pleth: { label: 'HF PLETH', isHighFrequency: true, mappings: { url: 'PLETH.json', websocket: 'ws/stream/pleth', mqtt: 'mp50/HF-PLETH', upload: 'NOM_PLETHWaveExport.csv' } },
        Resp: { label: 'HF RESP', isHighFrequency: true, mappings: { url: 'RESP.json', websocket: 'ws/stream/resp', mqtt: 'mp50/HF-RESP', upload: 'NOM_RESPWaveExport.csv' } },
    },
    fileInputs: {
        VitalSigns: null,
        ECG: null,
        EEG: null,
        Pleth: null,
        Resp: null,
    },
    uploadProgress: {
        VitalSigns: 0,
        ECG: 0,
        EEG: 0,
        Pleth: 0,
        Resp: 0,
    },
    recordCount: 0,
    replayProgress: 0,
    timeWindow: 1,
    autoScroll: true,
    aggregation: 'raw',
    selectedPhysioIds: (Object.keys(PHYSIO_META) as PhysioId[]).reduce((acc, key) => {
        acc[key] = ['NOM_PULS_OXIM_SAT_O2', 'NOM_PLETH_PULS_RATE', 'NOM_PLETH', 'NOM_RESP'].includes(key);
        return acc;
    }, {} as Record<PhysioId, boolean>),
    advancedCharts: { rawPleth: true, resp: true, ppi: false, overlay: false, spectrogram: false },
};

const dashboardReducer = (prev: DashboardState, action: Partial<DashboardState>): DashboardState => {
    return { ...prev, ...action };
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(dashboardReducer, initialState);
    
    const dataRef = useRef<Record<string, TimeSeries>>({});
    const listenersRef = useRef<Set<(records: TelemetryRecord[] | 'clear') => void>>(new Set());
    const lastRecordUpdateRef = useRef<number>(0);

    const subscribeToData = useCallback((callback: (records: TelemetryRecord[] | 'clear') => void) => {
        listenersRef.current.add(callback);
        return () => { listenersRef.current.delete(callback); };
    }, []);

    const actions: DashboardActions = {
        setStatus: (status) => dispatch({ status }),
        setDataSource: (dataSource) => dispatch({ dataSource }),
        setJsonUrl: (jsonUrl) => dispatch({ jsonUrl }),
        setWebsocketUrl: (websocketUrl) => dispatch({ websocketUrl }),
        setMqttBrokerUrl: (mqttBrokerUrl) => dispatch({ mqttBrokerUrl }),
        setGlobalWaveformToggle: (id, enabled) => dispatch({ globalWaveformToggles: { ...state.globalWaveformToggles, [id]: enabled } }),
        setProviderMapping: (id, provider, value) => {
            const updatedMappings = { ...state.providerMappings };
            updatedMappings[id] = {
                ...updatedMappings[id],
                mappings: { ...updatedMappings[id].mappings, [provider]: value }
            };
            dispatch({ providerMappings: updatedMappings });
        },
        setFileInput: (id, file) => dispatch({ fileInputs: { ...state.fileInputs, [id]: file } }),
        setUploadProgress: (id, progress) => dispatch({ uploadProgress: { ...state.uploadProgress, [id]: progress } }),
        setRecordCount: (recordCount) => dispatch({ recordCount }),
        setReplayProgress: (replayProgress) => dispatch({ replayProgress }),
        setTimeWindow: (timeWindow) => dispatch({ timeWindow }),
        setAutoScroll: (autoScroll) => dispatch({ autoScroll }),
        setAggregation: (aggregation) => dispatch({ aggregation }),
        togglePhysioId: (id) => dispatch({ selectedPhysioIds: { ...state.selectedPhysioIds, [id]: !state.selectedPhysioIds[id] } }),
        selectAll: () => {
            const allIds = (Object.keys(PHYSIO_META) as PhysioId[]).reduce((acc, key) => { acc[key] = true; return acc; }, {} as Record<PhysioId, boolean>);
            dispatch({ selectedPhysioIds: allIds });
        },
        deselectAll: () => {
            const allIds = (Object.keys(PHYSIO_META) as PhysioId[]).reduce((acc, key) => { acc[key] = false; return acc; }, {} as Record<PhysioId, boolean>);
            dispatch({ selectedPhysioIds: allIds });
        },
        toggleAdvancedChart: (chart) => dispatch({ advancedCharts: { ...state.advancedCharts, [chart]: !state.advancedCharts[chart] } }),
        appendData: (records: TelemetryRecord[]) => {
            if (records.length === 0) return;
            records.forEach(r => {
                if (!r || !r.physio_id || r.time === undefined || r.value === undefined) return;
                if (!dataRef.current[r.physio_id]) dataRef.current[r.physio_id] = { x: [], y: [] };
                dataRef.current[r.physio_id].x.push(r.time);
                dataRef.current[r.physio_id].y.push(r.value);
            });
            listenersRef.current.forEach(listener => listener(records));
            const now = Date.now();
            if (now - lastRecordUpdateRef.current > 500) {
                let total = 0;
                Object.values(dataRef.current).forEach(s => total += s.x.length);
                dispatch({ recordCount: total });
                lastRecordUpdateRef.current = now;
            }
        },
        clearData: () => {
            dataRef.current = {};
            dispatch({ recordCount: 0, replayProgress: 0 });
            listenersRef.current.forEach(listener => listener('clear'));
        }
    };

    return (
        <DashboardContext.Provider value={{ state, actions, dataRef, subscribeToData }}>
            {children}
        </DashboardContext.Provider>
    );
};

export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) throw new Error('useDashboard must be used within DashboardProvider');
    return context;
};
