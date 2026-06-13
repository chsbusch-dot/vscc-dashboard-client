import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import * as SciChart from 'scichart';
import { useDashboard, type WaveformId } from '../data/DashboardContext';
import { getClinicalColor } from '../utils/colors';
import { applyTimeDisplayToLabelProvider, refreshSurfaceTimeLabels } from '../utils/chartTimeAxis';
import SpectrogramChart from './SpectrogramChart';

interface AdvancedChartsProps {
    verticalGroup: SciChart.SciChartVerticalGroup;
    showRawPleth: boolean;
    showResp: boolean; // Add RESP prop
    showPpi: boolean;
    showOverlay: boolean;
    showSpectrogram: boolean;
}

/** A signal-loss interval [start, end] in epoch seconds, used for gap shading. */
interface Gap { start: number; end: number; }

// Utility to safely append only newer, strictly increasing points to avoid SciChart sorting exceptions.
// Returns the >2 s gaps it detected so the caller can shade them on the trace.
const appendSafe = (series: SciChart.XyDataSeries | undefined, xArr: number[], yArr: (number | null)[]): Gap[] => {
    const gaps: Gap[] = [];
    if (!series) return gaps;
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

        // Gap Rule: Break the line visually if signal was lost for > 2 seconds,
        // and record the interval so it can be shaded.
        if (lastX !== -Infinity && (x - lastX) > 2.0) {
            gaps.push({ start: lastX, end: x });
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
    return gaps;
};

const MAX_GAP_BOXES = 60;
const GAP_FILL = 'rgba(244, 67, 54, 0.12)';

type GapState = { surface: SciChart.SciChartSurface; boxes: SciChart.BoxAnnotation[] };

/**
 * Shade signal-loss intervals as translucent full-height boxes on a surface,
 * pruning to a bounded number so a long recording can't accumulate annotations
 * without limit. Wrapped in try/catch — gap shading must never break the trace.
 */
const shadeGaps = (st: GapState | undefined, gaps: Gap[]) => {
    if (!st || gaps.length === 0) return;
    for (const g of gaps) {
        try {
            const box = new SciChart.BoxAnnotation({
                x1: g.start, x2: g.end,
                y1: 0, y2: 1,
                yCoordinateMode: SciChart.ECoordinateMode.Relative,
                fill: GAP_FILL,
                strokeThickness: 0,
                isEditable: false,
            });
            st.surface.annotations.add(box);
            st.boxes.push(box);
        } catch {
            // Annotation API guard.
        }
    }
    while (st.boxes.length > MAX_GAP_BOXES) {
        const old = st.boxes.shift();
        if (old) {
            try { st.surface.annotations.remove(old); } catch { /* already gone */ }
        }
    }
};

const AdvancedCharts: React.FC<AdvancedChartsProps> = ({ verticalGroup, showRawPleth, showResp, showPpi, showOverlay, showSpectrogram }) => {
    const { state, actions, subscribeToData, dataRef } = useDashboard();
    const chart1Div = useRef<HTMLDivElement>(null);
    const chartRespDiv = useRef<HTMLDivElement>(null); // Ref for RESP chart
    const chart2Div = useRef<HTMLDivElement>(null);
    const chart3Div = useRef<HTMLDivElement>(null);

    const dataSeriesRefs = useRef<Record<string, SciChart.XyDataSeries>>(Object.create(null));
    const surfacesRef = useRef<SciChart.SciChartSurface[]>([]);
    // Per-waveform signal-gap shading: the surface to draw on + its live box annotations.
    const gapStateRef = useRef<Record<string, { surface: SciChart.SciChartSurface; boxes: SciChart.BoxAnnotation[] }>>(Object.create(null));
    const observersRef = useRef<ResizeObserver[]>([]);
    const ppiLastPeakRef = useRef<{time: number, val: number}>({time: -1, val: 0}); 
    const lastDataRef = useRef<{ timestamp: number; receivedAt: number } | null>(null);

    // Keep a stable ref for event listeners to check autoScroll status without triggering re-renders
    const autoScrollRef = useRef(state.autoScroll);
    useEffect(() => {
        autoScrollRef.current = state.autoScroll;
    }, [state.autoScroll]);

    // Local/UTC display mode, read by label formatters at format time so the
    // toggle never forces surface re-creation.
    const timeDisplayRef = useRef(state.timeDisplay);
    useEffect(() => {
        timeDisplayRef.current = state.timeDisplay;
    }, [state.timeDisplay]);

    // 1. DOM Listeners: Disable auto-scroll when user clicks, touches, or uses the mouse wheel on any chart
    useEffect(() => {
        const disableAutoScroll = () => {
            if (autoScrollRef.current) actions.setAutoScroll(false);
        };

        const divs = [chart1Div.current, chartRespDiv.current, chart2Div.current, chart3Div.current];
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

            // Builds an X-axis label provider wired to the Local/UTC display toggle
            const makeTimeLabelProvider = () => {
                const provider = new SciChart.SmartDateLabelProvider({ labelFormat: SciChart.ENumericFormat.Date_HHMMSS });
                applyTimeDisplayToLabelProvider(provider, () => timeDisplayRef.current);
                return provider;
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
                    labelProvider: makeTimeLabelProvider()
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
                gapStateRef.current.rawPleth = { surface: sciChartSurface, boxes: [] };

                const existingPleth = dataRef.current['NOM_PLETH'];
                if (existingPleth && existingPleth.x.length > 0) {
                    shadeGaps(gapStateRef.current.rawPleth, appendSafe(dataSeries, existingPleth.x, existingPleth.y));
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
                    labelProvider: makeTimeLabelProvider()
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
                gapStateRef.current.rawResp = { surface: sciChartSurface, boxes: [] };

                const existingResp = dataRef.current['NOM_RESP'];
                if (existingResp && existingResp.x.length > 0) {
                    shadeGaps(gapStateRef.current.rawResp, appendSafe(dataSeries, existingResp.x, existingResp.y));
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
            gapStateRef.current = {};
        }
    }, [showRawPleth, showResp, showPpi, showOverlay, showSpectrogram, verticalGroup]);

    // Re-render axis labels when the Local/UTC toggle changes.
    // Formatting only: existing surfaces are invalidated, never recreated.
    useEffect(() => {
        surfacesRef.current.forEach(surface => refreshSurfaceTimeLabels(surface));
    }, [state.timeDisplay]);

    // DATA SUBSCRIPTION EFFECT
    useEffect(() => {
        const unsubscribe = subscribeToData((data) => {
            if (data === 'clear') {
                Object.values(dataSeriesRefs.current).forEach(ds => ds?.clear());
                Object.values(gapStateRef.current).forEach(st => {
                    st.boxes.forEach(b => { try { st.surface.annotations.remove(b); } catch { /* gone */ } });
                    st.boxes = [];
                });
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
                shadeGaps(gapStateRef.current.rawPleth, appendSafe(dataSeriesRefs.current.rawPleth, plethData.x, plethData.y));
            }

            // --- Append RESP data ---
            const respData = updateMap['NOM_RESP'];
            if (respData && dataSeriesRefs.current.rawResp) {
                shadeGaps(gapStateRef.current.rawResp, appendSafe(dataSeriesRefs.current.rawResp, respData.x, respData.y));
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
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="subtitle1" gutterBottom>Raw PLETH Waveform{getProgressText('Pleth')}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(211,47,47,0.85)' }}>▦ signal gap (&gt;2 s)</Typography>
                    </Box>
                    <div id="adv-chart-pleth" ref={chart1Div} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
            {showResp && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="subtitle1" gutterBottom>Respiration Waveform{getProgressText('Resp')}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(211,47,47,0.85)' }}>▦ signal gap (&gt;2 s)</Typography>
                    </Box>
                    <div id="adv-chart-resp" ref={chartRespDiv} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
            {showPpi && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Pulse Rate vs Time (PPI){getProgressText(null)}</Typography>
                    <div id="adv-chart-ppi" ref={chart2Div} style={{ flexGrow: 1, width: "100%", minHeight: 0 }} />
                </Paper>
            )}
            {showSpectrogram && <SpectrogramChart />}
        </Box>
    );
};

export default AdvancedCharts;
