import React, { createContext, useContext, useReducer, useRef, useCallback } from 'react';
import { PHYSIO_META, type PhysioId } from './constants';

// --- Types ---

export interface TelemetryRecord {
    time: number;       // Epoch Seconds (Float)
    physio_id: PhysioId;
    value: number;
    device_id: string;
}

export interface TimeSeries {
    x: number[];
    y: number[];
}

export interface DashboardState {
    status: 'Ready' | 'Loading' | 'Streaming' | 'Paused' | 'Error';
    dataSource: 'url' | 'websocket' | 'mqtt' | 'upload' | null;
    jsonUrl: string;
    websocketUrl: string;
    mqttBrokerUrl: string;
    mqttTopic: string;
    recordCount: number; // Updated on a throttle
    replayProgress: number;
    timeWindow: number; // Minutes
    autoScroll: boolean;
    aggregation: 'raw' | '1min' | '5min';
    selectedPhysioIds: Record<PhysioId, boolean>;
    advancedCharts: {
        rawPleth: boolean;
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
    setMqttTopic: (topic: string) => void;
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
    // Access to raw history without triggering renders
    dataRef: React.MutableRefObject<Record<string, TimeSeries>>;
    // Subscription for high-frequency updates
    subscribeToData: (callback: (records: TelemetryRecord[] | 'clear') => void) => () => void;
}

const initialState: DashboardState = {
    status: 'Ready',
    dataSource: 'url',
    jsonUrl: 'http://192.168.1.188:8000/DataExportVSC.json',
    websocketUrl: 'ws://192.168.1.188:8000/ws/stream',
    mqttBrokerUrl: 'ws://192.168.1.188:8083/mqtt',
    mqttTopic: 'telemetry/mp50',
    recordCount: 0,
    replayProgress: 0,
    timeWindow: 1, // Default 1 minute for better high-freq visibility
    autoScroll: true,
    aggregation: 'raw',
    // Initialize all physioIds to false, then set defaults to true
    selectedPhysioIds: (Object.keys(PHYSIO_META) as PhysioId[]).reduce((acc, key) => {
        acc[key] = [
            'NOM_PULS_OXIM_SAT_O2',
            'NOM_PLETH_PULS_RATE',
            'NOM_PULS_OXIM_PERF_REL'
        ].includes(key);
        return acc;
    }, {} as Record<PhysioId, boolean>),
    advancedCharts: { rawPleth: false, ppi: false, overlay: false, spectrogram: false },
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer((prev: DashboardState, action: Partial<DashboardState>) => ({ ...prev, ...action }), initialState);
    
    // Rule 2: useState Prohibition for Telemetry
    // We store the actual data history in a Ref. This is mutable and does NOT trigger re-renders.
    const dataRef = useRef<Record<string, TimeSeries>>({});
    
    // Event Emitter for High-Frequency Updates (Rule 4)
    const listenersRef = useRef<Set<(records: TelemetryRecord[] | 'clear') => void>>(new Set());
    
    // Throttling ref for record count updates
    const lastRecordUpdateRef = useRef<number>(0);

    const subscribeToData = useCallback((callback: (records: TelemetryRecord[] | 'clear') => void) => {
        listenersRef.current.add(callback);
        return () => {
            listenersRef.current.delete(callback);
        };
    }, []);

    const actions: DashboardActions = {
        setStatus: (status) => dispatch({ status }),
        setDataSource: (dataSource) => dispatch({ dataSource }),
        setJsonUrl: (jsonUrl) => dispatch({ jsonUrl }),
        setWebsocketUrl: (websocketUrl) => dispatch({ websocketUrl }),
        setMqttBrokerUrl: (mqttBrokerUrl) => dispatch({ mqttBrokerUrl }),
        setMqttTopic: (mqttTopic) => dispatch({ mqttTopic }),
        setRecordCount: (recordCount) => dispatch({ recordCount }),
        setReplayProgress: (replayProgress) => dispatch({ replayProgress }),
        setTimeWindow: (timeWindow) => dispatch({ timeWindow }),
        setAutoScroll: (autoScroll) => dispatch({ autoScroll }),
        setAggregation: (aggregation) => dispatch({ aggregation }),
        
        togglePhysioId: (id) => {
            const newSelection = { ...state.selectedPhysioIds, [id]: !state.selectedPhysioIds[id] };
            dispatch({ selectedPhysioIds: newSelection });
        },
        selectAll: () => {
            const allIds = (Object.keys(PHYSIO_META) as PhysioId[]).reduce((acc, key) => {
                acc[key] = true;
                return acc;
            }, {} as Record<PhysioId, boolean>);
            dispatch({ selectedPhysioIds: allIds });
        },
        deselectAll: () => {
            const allIds = (Object.keys(PHYSIO_META) as PhysioId[]).reduce((acc, key) => {
                acc[key] = false;
                return acc;
            }, {} as Record<PhysioId, boolean>);
            dispatch({ selectedPhysioIds: allIds });
        },
        toggleAdvancedChart: (chart) => {
            dispatch({ advancedCharts: { ...state.advancedCharts, [chart]: !state.advancedCharts[chart] } });
        },

        // Rule 1: High-Frequency Data Ingestion
        appendData: (records: TelemetryRecord[]) => {
            if (records.length === 0) return;

            // 1. Update Mutable Storage (O(N) where N is small packet size)
            records.forEach(r => {
                if (!dataRef.current[r.physio_id]) {
                    dataRef.current[r.physio_id] = { x: [], y: [] };
                }
                dataRef.current[r.physio_id].x.push(r.time);
                dataRef.current[r.physio_id].y.push(r.value);
            });

            // 2. Notify Subscribers (Charts) imperatively
            listenersRef.current.forEach(listener => listener(records));

            // 3. Update UI Record Count (Throttled to 2Hz)
            // This ensures the AppLayout header updates, but not 100 times/sec
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
            // Notify subscribers to clear their internal state
            listenersRef.current.forEach(listener => listener('clear'));
        }
    };

    return (
        <DashboardContext.Provider value={{ state, actions, dataRef, subscribeToData }}>
            {children}
        </DashboardContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) throw new Error('useDashboard must be used within DashboardProvider');
    return context;
};