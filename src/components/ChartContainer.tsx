import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { PHYSIO_META, type PhysioId } from '../data/constants';
import { getClinicalColor } from '../utils/colors';
import { useDashboard } from '../data/DashboardContext';
import { useSciChart } from '../hooks/useSciChart';

import * as SciChart from "scichart";

interface ChartContainerProps {
    groupName: string;
    physioIds: PhysioId[];
    verticalGroup: SciChart.SciChartVerticalGroup;
}

const ChartContainer: React.FC<ChartContainerProps> = ({
    groupName,
    physioIds,
    verticalGroup
}) => {
    const { state, actions, subscribeToData, dataRef } = useDashboard();
    const sciChartSurfaceRef = useRef<SciChart.SciChartSurface | null>(null);
    const dataSeriesRefs = useRef<Record<PhysioId, SciChart.XyDataSeries>>({} as Record<PhysioId, SciChart.XyDataSeries>);
    const divElementId = `scichart-root-${groupName.replace(/\s/g, '')}`;
    
    const physioIdsRef = useRef(physioIds);
    physioIdsRef.current = physioIds;

    // Keep a ref to autoScroll state to access it inside the stable init effect
    const autoScrollRef = useRef(state.autoScroll);
    autoScrollRef.current = state.autoScroll;

    // Use the custom hook for initialization and lifecycle management
    const { sciChartSurface: surface, wasmContext } = useSciChart(divElementId);

    const [displayStats, setDisplayStats] = useState<Record<string, { current: string; min: string; max: string; avg: string; }>>({});
    const latestStatsRef = useRef<Record<string, { current: string; min: string; max: string; avg: string; }>>({});
    const runningStatsRef = useRef<Record<string, { min: number; max: number; sum: number; count: number }>>({});
    
    const lastDataRef = useRef<{ timestamp: number; receivedAt: number } | null>(null);
    
    const [isSignalLost, setIsSignalLost] = useState(false);
    const isSignalLostRef = useRef(false);
    const lastChartDataReceivedAtRef = useRef<number>(0);

    // Update the visible stats on a throttled interval to reduce UI flicker and render cost.
    useEffect(() => {
        const timerId = setInterval(() => {
            setDisplayStats(latestStatsRef.current);
        }, 500); // Update stats display every 500ms
        return () => clearInterval(timerId);
    }, []); // This effect runs only once on mount

    // Sync vertical group and refs when surface is ready
    useEffect(() => {
        if (surface) {
            // @ts-expect-error - This is the correct runtime API, but types might be mismatched in environment
             
            surface.verticalGroup = verticalGroup;
            sciChartSurfaceRef.current = surface;
        }
        return () => {
            sciChartSurfaceRef.current = null;
        };
    }, [surface, verticalGroup]);

    const physioIdsStr = physioIds.join(',');

    // Effect to configure axes and series when physioIds change
    useEffect(() => {
        if (!surface || !wasmContext) return;
        surface.suspendUpdates(); // Rule 3

        // Clear previous configuration
        surface.xAxes.clear();
        surface.yAxes.clear();
        surface.renderableSeries.clear();
        surface.chartModifiers.clear();
        surface.annotations.clear();
        dataSeriesRefs.current = {} as Record<PhysioId, SciChart.XyDataSeries>;

        // Configure X-Axis
        const now = Date.now() / 1000;
        surface.xAxes.add(new SciChart.DateTimeNumericAxis(wasmContext, {
            visibleRange: new SciChart.NumberRange(now - state.timeWindow * 60, now),
            labelProvider: new SciChart.SmartDateLabelProvider({
                labelFormat: SciChart.ENumericFormat.Date_HHMMSS
            }),
            drawMajorBands: false,
        }));

        // Configure Y-Axis
        const units = new Set(physioIds.map(id => PHYSIO_META[id].unit).filter(Boolean));
        const yAxisTitle = units.size === 1 ? Array.from(units)[0] : "Value";

        // FIX: For BIS, clamp Y-Axis to 0-100 to prevent auto-ranging noise
        const isBis = physioIds.includes('NOM_EEG_BISPECTRAL_INDEX');
        const yAxisOptions: SciChart.INumericAxisOptions = {
            axisTitle: yAxisTitle,
            drawMajorBands: false,
            autoRange: isBis ? SciChart.EAutoRange.Never : SciChart.EAutoRange.Always,
            growBy: isBis ? undefined : new SciChart.NumberRange(0.2, 0.2),
            visibleRange: isBis ? new SciChart.NumberRange(0, 100) : undefined,
        };

        surface.yAxes.add(new SciChart.NumericAxis(wasmContext, yAxisOptions));

        // Create Series
        physioIds.forEach(id => {
            const clinicalColor = getClinicalColor(id);

            // Rule: NBP/NIBP does not get a waveform
            if (id.toUpperCase().includes("NBP") || id.toUpperCase().includes("NIBP")) return;

            const dataSeries = new SciChart.XyDataSeries(wasmContext, {
                fifoCapacity: 500000, // Rule 6: Memory Safety
                containsNaN: true, // Enable NaN support for visual gaps (Lead Off)
                dataSeriesName: id // Set the series name to the PhysioID for lookup in tooltip
            });
            dataSeriesRefs.current[id] = dataSeries;

            // Pre-fill with historical data so charts don't blank out on layout updates
            const existing = dataRef.current[id];
            if (existing && existing.x.length > 0) {
                const safeY = existing.y.map(val => val === null ? Number.NaN : val);
                dataSeries.appendRange(existing.x, safeY);
            }

            const lineSeries = new SciChart.FastLineRenderableSeries(wasmContext, {
                dataSeries,
                stroke: clinicalColor,
                strokeThickness: 2,
            });
            surface.renderableSeries.add(lineSeries);
        });

        // Add SpO2 Warning Threshold Band (< 90%)
        if (physioIds.includes('NOM_PULS_OXIM_SAT_O2')) {
            surface.annotations.add(new SciChart.BoxAnnotation({
                y1: 0,
                y2: 90,
                xCoordinateMode: SciChart.ECoordinateMode.Relative,
                x1: 0,
                x2: 1,
                fill: "rgba(220, 20, 60, 0.1)", // Light transparent red
                stroke: "rgba(220, 20, 60, 0.8)", // Solid red border at 90%
                strokeThickness: 1.5,
                annotationLayer: SciChart.EAnnotationLayer.Background
            }));
        }

        const onUserZoom = () => {
            if (autoScrollRef.current) {
                actions.setAutoScroll(false);
            }
        };

        const subscribeIfAvailable = (eventSource: unknown, handler: () => void) => {
            const candidate = eventSource as { subscribe?: (cb: () => void) => void } | undefined;
            if (candidate && typeof candidate.subscribe === "function") {
                candidate.subscribe(handler);
            }
        };

        const mouseWheelZoomModifier = new SciChart.MouseWheelZoomModifier({ modifierGroup: "GlobalSyncGroup" });
        // Some SciChart builds/types expose different event shapes; guard at runtime.
        subscribeIfAvailable((mouseWheelZoomModifier as unknown as { zoomed?: unknown }).zoomed, onUserZoom);

        const zoomPanModifier = new SciChart.ZoomPanModifier({ modifierGroup: "GlobalSyncGroup" });
        // Some SciChart builds/types expose different event shapes; guard at runtime.
        subscribeIfAvailable((zoomPanModifier as unknown as { panned?: unknown }).panned, onUserZoom);

        surface.chartModifiers.add(
            mouseWheelZoomModifier,
            zoomPanModifier,
            new SciChart.ZoomExtentsModifier({ modifierGroup: "GlobalSyncGroup" }),
            new SciChart.RolloverModifier({
                modifierGroup: "GlobalSyncGroup",
                showTooltip: true,
                showRolloverLine: true,
                tooltipDataTemplate: (seriesInfo: SciChart.SeriesInfo) => {
                    const date = new Date(seriesInfo.xValue * 1000);
                    
                    // FIX: Use UTC methods to align exactly with SciChart's native SmartDateLabelProvider
                    const h = date.getUTCHours().toString().padStart(2, '0');
                    const m = date.getUTCMinutes().toString().padStart(2, '0');
                    const s = date.getUTCSeconds().toString().padStart(2, '0');
                    const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
                    const timeStr = `${h}:${m}:${s}.${ms}`;
                    
                    const unit = PHYSIO_META[seriesInfo.seriesName as PhysioId]?.unit || '';
                    const value = (seriesInfo.yValue === undefined || Number.isNaN(seriesInfo.yValue)) ? '---' : seriesInfo.yValue.toFixed(2);
                    return [`Time: ${timeStr}`, 
                    `${PHYSIO_META[seriesInfo.seriesName as PhysioId].name}: ${value} ${unit}`];
                }
            })
        );

        surface.resumeUpdates(); // Rule 3
    }, [surface, wasmContext, physioIdsStr]);
    // Keep Zoom Add this to ChartContainer.tsx
    useEffect(() => {
        const container = document.getElementById(divElementId);
        const disableAutoScroll = () => {
            if (autoScrollRef.current) {
                actions.setAutoScroll(false);
            }
        };
        
        // Listen for user interactions on the SciChart canvas
        container?.addEventListener('mousedown', disableAutoScroll);
        container?.addEventListener('wheel', disableAutoScroll);
        container?.addEventListener('touchstart', disableAutoScroll);
        
        return () => {
            container?.removeEventListener('mousedown', disableAutoScroll);
            container?.removeEventListener('wheel', disableAutoScroll);
            container?.removeEventListener('touchstart', disableAutoScroll);
        };
    }, [divElementId, actions]);


    // Rule 1 & Rule 5: Imperative Data Subscription
    // This replaces the old useEffect that depended on `processedData`
    useEffect(() => {
        if (!surface) return;

        const unsubscribe = subscribeToData((data) => {
            if (data === 'clear') {
                surface.suspendUpdates();
                Object.values(dataSeriesRefs.current).forEach(ds => ds.clear());
                runningStatsRef.current = {};
                latestStatsRef.current = {};
                setDisplayStats({});
                surface.resumeUpdates();
                
                // Reset signal tracking state
                isSignalLostRef.current = false;
                setIsSignalLost(false);
                lastChartDataReceivedAtRef.current = Date.now();
                return;
            }

            const records = data;
            if (state.status === 'Paused') return;

            surface.suspendUpdates();

            // Filter records relevant to this chart
            // We group updates by series to call appendRange once per series
            const updates = {} as Record<PhysioId, { x: number[], y: number[] }>;
            let maxTimestamp = 0;
            let chartReceivedData = false;

            records.forEach(rec => {
                if (physioIdsRef.current.includes(rec.physio_id)) {
                    chartReceivedData = true;
                    if (!updates[rec.physio_id]) updates[rec.physio_id] = { x: [], y: [] };
                    updates[rec.physio_id].x.push(rec.time);
                    
                    // The Gap Rule: Convert missing, null, undefined, or empty string to NaN
                    const val = rec.value;
                    const isInvalid = val === null || val === undefined || (typeof val === 'string' && val === '') || Number.isNaN(Number(val));
                    updates[rec.physio_id].y.push(isInvalid ? Number.NaN : Number(val));
                }
                if (rec.time > maxTimestamp) maxTimestamp = rec.time;
            });
            
            if (chartReceivedData) {
                lastChartDataReceivedAtRef.current = Date.now();
                if (isSignalLostRef.current) {
                    isSignalLostRef.current = false;
                    setIsSignalLost(false);
                }
            }

            // Apply updates to SciChart
            Object.entries(updates).forEach(([id, data]) => {
                const series = dataSeriesRefs.current[id as PhysioId];
                if (series) {
                    // 1. Get the very last timestamp currently on the chart
                    const count = series.count();
                    let lastX = count > 0 ? series.getNativeXValues().get(count - 1) : -Infinity;
                    
                    // 2. Only push points that are NEWER than the last timestamp
                    const newX: number[] = [];
                    const newY: number[] = [];
                    for (let i = 0; i < data.x.length; i++) {
                        let currentX = data.x[i];
                        
                        if (currentX <= lastX) {
                            if (lastX - currentX < 1.0) {
                                currentX = lastX + 0.010; // Un-bunch VSCapture duplicate packet timestamps
                            } else {
                                continue; // Drop old out-of-order data
                            }
                        }

                        // Detect temporal gaps (e.g., monitor disconnected, MQTT paused)
                        if (lastX !== -Infinity && (currentX - lastX) > 2.0) {
                            newX.push(currentX - 0.001); // Append NaN just before new point
                            newY.push(Number.NaN);
                        }
                        
                        newX.push(currentX);
                        newY.push(data.y[i]);
                        lastX = currentX;
                    }

                    // 3. Append the clean, filtered array
                    if (newX.length > 0) {
                        series.appendRange(newX, newY);
                    }
                    // 4. Update Stats (Incremental, ignoring NaNs)
                    const stats = runningStatsRef.current[id] || { min: Infinity, max: -Infinity, sum: 0, count: 0 };
                    for (const val of data.y) {
                        if (!Number.isNaN(val)) {
                            if (val < stats.min) stats.min = val;
                            if (val > stats.max) stats.max = val;
                            stats.sum += val;
                            stats.count++;
                        }
                    }
                    runningStatsRef.current[id] = stats;

                    // Update Latest Stats Ref for UI
                    let lastValue = Number.NaN;
                    for (let i = data.y.length - 1; i >= 0; i--) {
                        if (!Number.isNaN(data.y[i])) {
                            lastValue = data.y[i];
                            break;
                        }
                    }
                    
                    const avg = stats.count > 0 ? stats.sum / stats.count : NaN;

                    latestStatsRef.current[id] = {
                        current: !isNaN(lastValue) ? lastValue.toFixed(2) : 'N/A',
                        min: stats.min !== Infinity ? stats.min.toFixed(2) : 'N/A',
                        max: stats.max !== -Infinity ? stats.max.toFixed(2) : 'N/A',
                        avg: !isNaN(avg) ? avg.toFixed(2) : 'N/A'
                    };
                }
            });

            // Rule 4: Global Auto-Scroll
            if (maxTimestamp > 0) {
                lastDataRef.current = { timestamp: maxTimestamp, receivedAt: Date.now() };
                
                // Legacy data-driven scroll for non-live sources (File Replay, URL)
                if (state.autoScroll && state.dataSource !== 'mqtt' && state.dataSource !== 'websocket') {
                    const xAxis = surface.xAxes.get(0);
                    if (xAxis) {
                        const window = state.timeWindow * 60;
                        xAxis.visibleRange = new SciChart.NumberRange(maxTimestamp - window, maxTimestamp);
                    }
                }
            }

            surface.resumeUpdates();
        });
        
        return () => {
            unsubscribe();
        };
     
    }, [surface, state.status, state.autoScroll, state.timeWindow, subscribeToData]);

    // Effect for continuous smooth scrolling in live modes (MQTT/WS)
    // Keeps the X-axis moving forward even if the signal is lost.
    useEffect(() => {
        if (!surface || !state.autoScroll || state.status !== 'Streaming') return;
        if (state.dataSource !== 'mqtt' && state.dataSource !== 'websocket') return;

        // Reset signal timeout tracker when stream starts
        lastChartDataReceivedAtRef.current = Date.now();

        const xAxis = surface.xAxes.get(0);
        if (!xAxis) return;

        const intervalId = setInterval(() => {
            const now = Date.now();
            if (lastDataRef.current) {
                const elapsedSeconds = (now - lastDataRef.current.receivedAt) / 1000;
                const virtualMax = lastDataRef.current.timestamp + elapsedSeconds;
                const timeWindowSeconds = state.timeWindow * 60;
                
                xAxis.visibleRange = new SciChart.NumberRange(virtualMax - timeWindowSeconds, virtualMax);
            }
            
            // Signal Loss Detection (2 seconds threshold)
            const chartElapsedSeconds = (now - lastChartDataReceivedAtRef.current) / 1000;
            if (chartElapsedSeconds > 2.0 && !isSignalLostRef.current) {
                isSignalLostRef.current = true;
                setIsSignalLost(true);
            }
        }, 50); // 20Hz continuous tracking

        return () => clearInterval(intervalId);
    }, [surface, state.autoScroll, state.status, state.dataSource, state.timeWindow]);

    // Effect for handling all zoom and pan behavior
    useEffect(() => {
        if (!surface) return;
        const xAxis = surface.xAxes.get(0);
        if (!xAxis) return;

        const timeWindowSeconds = state.timeWindow * 60;

        if (state.autoScroll) {
            // When auto-scrolling, this effect adjusts the window size while keeping the right edge fixed.
            const currentRange = xAxis.visibleRange;
            if (currentRange) {
                xAxis.visibleRange = new SciChart.NumberRange(currentRange.max - timeWindowSeconds, currentRange.max);
            }
        } else {
            // When not auto-scrolling, center the zoom on the current view.
            const currentRange = xAxis.visibleRange;
            if (currentRange && Math.abs(currentRange.diff - timeWindowSeconds) > 1) {
                const middle = currentRange.min + currentRange.diff / 2;
                xAxis.visibleRange = new SciChart.NumberRange(middle - timeWindowSeconds / 2, middle + timeWindowSeconds / 2);
            }
        }
     
    }, [surface, state.timeWindow, state.autoScroll]);

    const handleSnapshot = () => {
        const surface = sciChartSurfaceRef.current;
        if (surface) {
            // exportToCanvas returns an HTMLCanvasElement
            // @ts-expect-error - This is the correct runtime API, but types might be mismatched in environment
            const canvas = surface.exportToCanvas();
            const dataUrl = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = `${groupName}-snapshot.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const chartHeight = physioIds.length === 1 ? 125 : 250;

    return (
        <Paper elevation={3} sx={{ p: 2, mb: 2, width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', flexDirection: 'row', width: '100%', alignItems: 'center' }}>
                {/* Stats Box (Left) */}
                <Box sx={{ width: '200px', flexShrink: 0, pr: 2 }}>
                    {physioIds.map(id => {
                        const color = getClinicalColor(id);
                        const idStats = displayStats[id] || { current: 'N/A', min: 'N/A', max: 'N/A' };
                        return (
                            <Box key={id} sx={{ mb: 1, borderLeft: `4px solid ${color}`, pl: 1 }}>
                                <Typography variant="subtitle2" display="block" sx={{ fontWeight: 'bold', color: color }}>{PHYSIO_META[id].name}</Typography>
                                <Typography variant="h6" display="block" sx={{ color: color, fontWeight: 'bold' }}>
                                    {idStats.current}
                                </Typography>
                                <Typography variant="caption" display="block" sx={{ opacity: 0.7 }}>
                                    Min: {idStats.min} | Max: {idStats.max}
                                </Typography>
                            </Box>
                        );
                    })}
                    <Button variant="outlined" size="small" onClick={handleSnapshot} sx={{ mt: 1 }}>Snapshot</Button>
                </Box>
                {/* Chart Box (Right) */}
                <Box sx={{ flexGrow: 1, minWidth: 0, height: chartHeight, position: 'relative' }}>
                    <div id={divElementId} style={{ width: "100%", height: "100%", position: 'relative' }}></div>
                    {isSignalLost && (
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
                                pointerEvents: 'none', // Allows interaction with the chart behind it
                                zIndex: 10,
                                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                            }}
                        >
                            <Typography
                                variant="h3"
                                sx={{
                                    color: 'error.main',
                                    fontWeight: 'bold',
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                                    letterSpacing: 2
                                }}
                            >
                                NO SIGNAL
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Paper>
    );
};

export default ChartContainer;