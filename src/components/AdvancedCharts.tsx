import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import * as SciChart from 'scichart';
import { useDashboard, type WaveformId } from '../data/DashboardContext';
import { getClinicalColor } from '../utils/colors';

interface AdvancedChartsProps {
    verticalGroup: SciChart.SciChartVerticalGroup;
    showRawPleth: boolean;
    showResp: boolean; // Add RESP prop
    showPpi: boolean;
    showOverlay: boolean;
    showSpectrogram: boolean;
}

// Utility to safely append only newer, strictly increasing points to avoid SciChart sorting exceptions
const appendSafe = (series: SciChart.XyDataSeries | undefined, xArr: number[], yArr: (number | null)[]) => {
    if (!series) return;
    const count = series.count();
    let lastX = count > 0 ? series.getNativeXValues().get(count - 1) : -Infinity;
    const newX: number[] = [];
    const newY: number[] = [];
    
    for (let i = 0; i < xArr.length; i++) {
        let x = xArr[i];
        
        if (x <= lastX) {
            if (lastX - x < 1.0) {
                // VSCapture outputs multiple points per packet with the identical timestamp.
                // We space them out by ~10ms (assuming ~100Hz standard waveform rate) 
                // to reconstruct the continuous signal and satisfy SciChart's strict ascending rule.
                x = lastX + 0.010; 
            } else {
                continue; // Old out-of-order data, drop it
            }
        }
        
        // Gap Rule: Break the line visually if signal was lost for > 2 seconds
        if (lastX !== -Infinity && (x - lastX) > 2.0) {
            newX.push(x - 0.001);
            newY.push(Number.NaN);
        }
        newX.push(x);
        const yVal = yArr[i];
        newY.push(yVal === null || yVal === undefined ? Number.NaN : yVal);
        lastX = x;
    }
    if (newX.length > 0) {
        series.appendRange(newX, newY);
    }
};

const AdvancedCharts: React.FC<AdvancedChartsProps> = ({ verticalGroup, showRawPleth, showResp, showPpi, showOverlay, showSpectrogram }) => {
    const { state, actions, subscribeToData, dataRef } = useDashboard();
    const chart1Div = useRef<HTMLDivElement>(null);
    const chartRespDiv = useRef<HTMLDivElement>(null); // Ref for RESP chart
    const chart2Div = useRef<HTMLDivElement>(null);
    const chart3Div = useRef<HTMLDivElement>(null);
    const chart4Div = useRef<HTMLDivElement>(null);

    const dataSeriesRefs = useRef<Record<string, SciChart.XyDataSeries>>(Object.create(null));
    const surfacesRef = useRef<SciChart.SciChartSurface[]>([]);
    const observersRef = useRef<ResizeObserver[]>([]);
    const ppiLastPeakRef = useRef<{time: number, val: number}>({time: -1, val: 0}); 
    const lastDataRef = useRef<{ timestamp: number; receivedAt: number } | null>(null);

    // Keep a stable ref for event listeners to check autoScroll status without triggering re-renders
    const autoScrollRef = useRef(state.autoScroll);
    useEffect(() => {
        autoScrollRef.current = state.autoScroll;
    }, [state.autoScroll]);

    // 1. DOM Listeners: Disable auto-scroll when user clicks, touches, or uses the mouse wheel on any chart
    useEffect(() => {
        const disableAutoScroll = () => {
            if (autoScrollRef.current) actions.setAutoScroll(false);
        };

        const divs = [chart1Div.current, chartRespDiv.current, chart2Div.current, chart3Div.current, chart4Div.current];
        divs.forEach(container => {
            container?.addEventListener('mousedown', disableAutoScroll);
            container?.addEventListener('wheel', disableAutoScroll);
            container?.addEventListener('touchstart', disableAutoScroll);
        });

        return () => {
            divs.forEach(container => {
                container?.removeEventListener('mousedown', disableAutoScroll);
                container?.removeEventListener('wheel', disableAutoScroll);
                container?.removeEventListener('touchstart', disableAutoScroll);
            });
        };
    }, [actions, showRawPleth, showResp, showPpi, showOverlay, showSpectrogram]);

    useEffect(() => {
        return () => {
            surfacesRef.current.forEach(s => s.delete());
            surfacesRef.current = [];
            observersRef.current.forEach(o => o.disconnect());
            observersRef.current = [];
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const localSurfaces: SciChart.SciChartSurface[] = [];
        const localObservers: ResizeObserver[] = [];

        const initCharts = async () => {
            if (!isMounted) return;

            SciChart.SciChartSurface.UseCommunityLicense();
            SciChart.SciChartDefaults.performanceWarnings = false;
            SciChart.SciChartSurface.configure({ wasmUrl: "/scichart2d.wasm" });

            const now = Date.now() / 1000;

            // 2. SciChart Listeners: Helper to build modifiers that disable auto-scroll on active interaction
            const getModifiers = () => {
                const onUserZoom = () => {
                    if (autoScrollRef.current) actions.setAutoScroll(false);
                };

                const subscribeIfAvailable = (eventSource: unknown, handler: () => void) => {
                    const candidate = eventSource as { subscribe?: (cb: () => void) => void } | undefined;
                    if (candidate && typeof candidate.subscribe === "function") {
                        candidate.subscribe(handler);
                    }
                };

                const mouseWheelZoomModifier = new SciChart.MouseWheelZoomModifier({ modifierGroup: "GlobalSyncGroup" });
                subscribeIfAvailable((mouseWheelZoomModifier as unknown as { zoomed?: unknown }).zoomed, onUserZoom);

                const zoomPanModifier = new SciChart.ZoomPanModifier({ modifierGroup: "GlobalSyncGroup" });
                subscribeIfAvailable((zoomPanModifier as unknown as { panned?: unknown }).panned, onUserZoom);

                return [
                    new SciChart.ZoomExtentsModifier({ modifierGroup: "GlobalSyncGroup" }),
                    mouseWheelZoomModifier,
                    zoomPanModifier
                ];
            };

            // --- Chart 1: Time-Domain Waveform Plot (Raw PLETH Signal) ---
            if (chart1Div.current && showRawPleth) {
                const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chart1Div.current, {
                    theme: new SciChart.SciChartJSLightTheme()
                });
                if (!isMounted) {
                    sciChartSurface.delete();
                    return;
                }
                localSurfaces.push(sciChartSurface);
                surfacesRef.current.push(sciChartSurface);
                sciChartSurface.suspendUpdates();
                
                const xAxis = new SciChart.DateTimeNumericAxis(wasmContext, { 
                    axisTitle: "Time", 
                    visibleRange: new SciChart.NumberRange(now - state.timeWindow * 60, now),
                    labelProvider: new SciChart.SmartDateLabelProvider({ labelFormat: SciChart.ENumericFormat.Date_HHMMSS }) 
                });
                const yAxis = new SciChart.NumericAxis(wasmContext, { 
                    axisTitle: "Amplitude (A-D Units)",
                    autoRange: SciChart.EAutoRange.Always,
                    growBy: new SciChart.NumberRange(0.1, 0.1)
                });
                sciChartSurface.xAxes.add(xAxis);
                sciChartSurface.yAxes.add(yAxis);

                const dataSeries = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 500000, containsNaN: true });
                dataSeriesRefs.current.rawPleth = dataSeries;
                
                const existingPleth = dataRef.current['NOM_PLETH'];
                if (existingPleth && existingPleth.x.length > 0) {
                    appendSafe(dataSeries, existingPleth.x, existingPleth.y);
                }

                sciChartSurface.renderableSeries.add(new SciChart.FastLineRenderableSeries(wasmContext, {
                    dataSeries, stroke: getClinicalColor('NOM_PLETH'), strokeThickness: 2
                }));

                sciChartSurface.chartModifiers.add(...getModifiers());

                const observer = new ResizeObserver(() => sciChartSurface?.invalidateElement());
                observer.observe(chart1Div.current);
                localObservers.push(observer);
                observersRef.current.push(observer);
                sciChartSurface.resumeUpdates();
            }

            // --- Chart 5: RESP Waveform ---
            if (chartRespDiv.current && showResp) {
                const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chartRespDiv.current, {
                    theme: new SciChart.SciChartJSLightTheme()
                });
                if (!isMounted) {
                    sciChartSurface.delete();
                    return;
                }
                localSurfaces.push(sciChartSurface);
                surfacesRef.current.push(sciChartSurface);
                sciChartSurface.suspendUpdates();
                
                const xAxis = new SciChart.DateTimeNumericAxis(wasmContext, { 
                    axisTitle: "Time", 
                    visibleRange: new SciChart.NumberRange(now - state.timeWindow * 60, now),
                    labelProvider: new SciChart.SmartDateLabelProvider({ labelFormat: SciChart.ENumericFormat.Date_HHMMSS }) 
                });
                const yAxis = new SciChart.NumericAxis(wasmContext, { 
                    axisTitle: "RESP",
                    autoRange: SciChart.EAutoRange.Always,
                    growBy: new SciChart.NumberRange(0.2, 0.2),
                    drawLabels: false,
                    drawMajorTickLines: false,
                    drawMinorTickLines: false,
                    drawMajorGridLines: false,
                    drawMinorGridLines: false
                });
                sciChartSurface.xAxes.add(xAxis);
                sciChartSurface.yAxes.add(yAxis);

                const dataSeries = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 500000, containsNaN: true });
                dataSeriesRefs.current.rawResp = dataSeries;

                const existingResp = dataRef.current['NOM_RESP'];
                if (existingResp && existingResp.x.length > 0) {
                    appendSafe(dataSeries, existingResp.x, existingResp.y);
                }

                sciChartSurface.renderableSeries.add(new SciChart.FastLineRenderableSeries(wasmContext, {
                    dataSeries, stroke: getClinicalColor('NOM_RESP'), strokeThickness: 2
                }));

                sciChartSurface.chartModifiers.add(...getModifiers());

                const observer = new ResizeObserver(() => sciChartSurface?.invalidateElement());
                observer.observe(chartRespDiv.current);
                localObservers.push(observer);
                observersRef.current.push(observer);
                sciChartSurface.resumeUpdates();
            }
            // Other charts remain unchanged
        };

        initCharts();

        return () => {
            isMounted = false;
            
            // Clean up ONLY what this specific hook execution created 
            // to protect against React StrictMode double-invocations & race conditions.
            localSurfaces.forEach(s => {
                s.delete();
                surfacesRef.current = surfacesRef.current.filter(ref => ref !== s);
            });
            localObservers.forEach(o => {
                o.disconnect();
                observersRef.current = observersRef.current.filter(ref => ref !== o);
            });
            
            // Clears mapping strictly on unmount so the live data pipeline
            // doesn't attempt to append data to an invalidated/deleted WebGL surface
            dataSeriesRefs.current = {};
        }
    }, [showRawPleth, showResp, showPpi, showOverlay, showSpectrogram, verticalGroup]);

    // DATA SUBSCRIPTION EFFECT
    useEffect(() => {
        const unsubscribe = subscribeToData((data) => {
            if (data === 'clear') {
                Object.values(dataSeriesRefs.current).forEach(ds => ds?.clear());
                ppiLastPeakRef.current = {time: -1, val: 0};
                return;
            }

            if (state.status === 'Paused') return;

            const updateMap: Record<string, { x: number[], y: (number)[] }> = {};
            let maxTimestamp = 0;

            for (const rec of data) {
                if (!rec || rec.value === null) continue;
                if (!updateMap[rec.physio_id]) {
                    updateMap[rec.physio_id] = { x: [], y: [] };
                }
                updateMap[rec.physio_id].x.push(rec.time);
                updateMap[rec.physio_id].y.push(rec.value);
                if (rec.time > maxTimestamp) maxTimestamp = rec.time;
            }

            if (maxTimestamp > 0) {
                lastDataRef.current = { timestamp: maxTimestamp, receivedAt: Date.now() };
            }

            // Suspend WebGL redraws across all active surfaces to prevent render storms
            surfacesRef.current.forEach(s => s.suspendUpdates());

            // --- UPDATE PHYSIO ID FOR PLETH ---
            const plethData = updateMap['NOM_PLETH'];
            if (plethData && dataSeriesRefs.current.rawPleth) {
                appendSafe(dataSeriesRefs.current.rawPleth, plethData.x, plethData.y);
            }

            // --- Append RESP data ---
            const respData = updateMap['NOM_RESP'];
            if (respData && dataSeriesRefs.current.rawResp) {
                appendSafe(dataSeriesRefs.current.rawResp, respData.x, respData.y);
            }
            
            const prData = updateMap['NOM_PLETH_PULS_RATE'];
            if (prData && dataSeriesRefs.current.overlayPR) {
                 appendSafe(dataSeriesRefs.current.overlayPR, prData.x, prData.y);
            }

            const spo2Data = updateMap['NOM_PULS_OXIM_SAT_O2'];
            if (spo2Data && dataSeriesRefs.current.overlaySpo2) {
                 appendSafe(dataSeriesRefs.current.overlaySpo2, spo2Data.x, spo2Data.y);
            }
            
            // Batch flush the WebGL paints
            surfacesRef.current.forEach(s => s.resumeUpdates());
        });

        return () => unsubscribe();
    }, [state.status, subscribeToData]);

    // Continuous smooth scrolling effect to track live time window
    useEffect(() => {
        if (!state.autoScroll || state.status !== 'Streaming') return;

        const intervalId = setInterval(() => {
            const now = Date.now();
            if (lastDataRef.current) {
                const elapsedSeconds = (now - lastDataRef.current.receivedAt) / 1000;
                const virtualMax = lastDataRef.current.timestamp + elapsedSeconds;
                const timeWindowSeconds = state.timeWindow * 60;
                
                surfacesRef.current.forEach(surface => {
                    surface.suspendUpdates();
                    const xAxis = surface.xAxes.get(0);
                    if (xAxis) {
                        xAxis.visibleRange = new SciChart.NumberRange(virtualMax - timeWindowSeconds, virtualMax);
                    }
                    surface.resumeUpdates();
                });
            }
        }, 50);
        return () => clearInterval(intervalId);
    }, [state.autoScroll, state.status, state.timeWindow]);

    // 3. Recenter/Resize View when the time window slider changes while Auto-Scroll is OFF
    useEffect(() => {
        const timeWindowSeconds = state.timeWindow * 60;

        surfacesRef.current.forEach(surface => {
            const xAxis = surface.xAxes.get(0);
            if (!xAxis) return;
            
            surface.suspendUpdates();
            if (state.autoScroll) {
                const currentRange = xAxis.visibleRange;
                if (currentRange) {
                    xAxis.visibleRange = new SciChart.NumberRange(currentRange.max - timeWindowSeconds, currentRange.max);
                }
            } else {
                const currentRange = xAxis.visibleRange;
                if (currentRange && Math.abs(currentRange.diff - timeWindowSeconds) > 1) {
                    const middle = currentRange.min + currentRange.diff / 2;
                    xAxis.visibleRange = new SciChart.NumberRange(middle - timeWindowSeconds / 2, middle + timeWindowSeconds / 2);
                }
            }
            surface.resumeUpdates();
        });
    }, [state.timeWindow, state.autoScroll]);

    // Task 4: Dynamic Header Text for Upload / Replay tracking
    const getProgressText = (waveformId: WaveformId | null) => {
        if (state.status === 'Loading' && waveformId) {
            return ` - Upload Progress: ${state.uploadProgress[waveformId] || 0}%`;
        }
        if (state.status === 'Streaming' || state.status === 'Paused') {
            return ` - Played: ${state.replayProgress}%`;
        }
        return '';
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2, width: '100%' }}>
            {showRawPleth && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Raw PLETH Waveform{getProgressText('Pleth')}</Typography>
                    <div id="adv-chart-pleth" ref={chart1Div} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
            {showResp && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Respiration Waveform{getProgressText('Resp')}</Typography>
                    <div id="adv-chart-resp" ref={chartRespDiv} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
            {showPpi && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Pulse Rate vs Time (PPI){getProgressText(null)}</Typography>
                    <div id="adv-chart-ppi" ref={chart2Div} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
            {showSpectrogram && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Spectrogram{getProgressText(null)}</Typography>
                    <div id="adv-chart-spectrogram" ref={chart4Div} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
        </Box>
    );
};

export default AdvancedCharts;
