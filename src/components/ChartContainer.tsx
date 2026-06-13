import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { PHYSIO_META, type PhysioId } from '../data/constants';
import { getClinicalColor } from '../utils/colors';
import { useDashboard } from '../data/DashboardContext';
import { useSciChart } from '../hooks/useSciChart';
import { formatChartTime } from '../utils/timeFormat';
import { applyTimeDisplayToLabelProvider, refreshSurfaceTimeLabels } from '../utils/chartTimeAxis';

import * as SciChart from "scichart";

/** Aggregation bucket width in seconds for the live trend view; 0 = raw (no binning). */
const bucketSecondsFor = (agg: 'raw' | '1min' | '5min'): number =>
    agg === '1min' ? 60 : agg === '5min' ? 300 : 0;

/**
 * Raw passthrough that re-inserts the same >gapSec NaN line-breaks the incremental
 * append path draws, so rebuilding a series from the buffer (e.g. switching back to
 * RT) reproduces signal-dropout gaps instead of connecting straight across them.
 */
const rawWithGapBreaks = (
    x: number[],
    y: (number | null)[],
    gapSec = 2,
): { gx: number[]; gy: number[] } => {
    const gx: number[] = [];
    const gy: number[] = [];
    let lastX = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < x.length; i++) {
        const cx = x[i];
        if (lastX !== Number.NEGATIVE_INFINITY && cx - lastX > gapSec) {
            gx.push(cx - 0.001);
            gy.push(Number.NaN);
        }
        gx.push(cx);
        gy.push(y[i] === null ? Number.NaN : (y[i] as number));
        lastX = cx;
    }
    return { gx, gy };
};

/**
 * Bins a raw (x in epoch seconds, y) numeric trend into fixed-width time-bucket
 * averages for the live aggregation view. Each bucket is plotted at its start;
 * a NaN point is inserted across skipped buckets so the line breaks over gaps.
 * Only low-frequency numeric trends pass through here — waveforms are never binned.
 */
const binSeries = (
    x: number[],
    y: (number | null)[],
    bucketSec: number,
): { bx: number[]; by: number[] } => {
    const bx: number[] = [];
    const by: number[] = [];
    let curIdx = Number.NaN;
    let sum = 0;
    let cnt = 0;
    let lastIdx = Number.NaN;
    const flush = () => {
        if (cnt === 0) return;
        if (!Number.isNaN(lastIdx) && curIdx - lastIdx > 1) {
            bx.push((lastIdx + 1) * bucketSec);
            by.push(Number.NaN); // break the line across empty buckets
        }
        // Plot at the bucket CENTER so the newest bin sits near the live right
        // edge (start-of-bucket would lag a full bucket behind and fall off-screen).
        bx.push(curIdx * bucketSec + bucketSec / 2);
        by.push(sum / cnt);
        lastIdx = curIdx;
    };
    for (let i = 0; i < x.length; i++) {
        const idx = Math.floor(x[i] / bucketSec);
        if (idx !== curIdx) {
            flush();
            curIdx = idx;
            sum = 0;
            cnt = 0;
        }
        const v = y[i];
        if (v !== null && !Number.isNaN(v)) {
            sum += v;
            cnt++;
        }
    }
    flush();
    return { bx, by };
};

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

    // Time display mode (Local vs UTC) read by label/cursor formatters at format
    // time, so toggling never requires recreating the surface or its axes.
    const timeDisplayRef = useRef(state.timeDisplay);
    timeDisplayRef.current = state.timeDisplay;

    // Aggregation + data-source read via refs so the imperative data subscription
    // can react to slider/source changes without being torn down and re-created.
    const aggregationRef = useRef(state.aggregation);
    aggregationRef.current = state.aggregation;
    const dataSourceRef = useRef(state.dataSource);
    dataSourceRef.current = state.dataSource;
    // Set when live binned-mode data arrives; the refresh timer rebuilds the
    // aggregated series from the raw buffer on its next tick.
    const binnedDirtyRef = useRef(false);

    // Use the custom hook for initialization and lifecycle management
    const { sciChartSurface: surface, wasmContext } = useSciChart(divElementId);

    const [displayStats, setDisplayStats] = useState<Record<string, { current: string; min: string; max: string; avg: string; }>>({});
    const latestStatsRef = useRef<Record<string, { current: string; min: string; max: string; avg: string; }>>({});
    const runningStatsRef = useRef<Record<string, { min: number; max: number; sum: number; count: number }>>({});
    
    const lastDataRef = useRef<{ timestamp: number; receivedAt: number } | null>(null);
    
    const [isSignalLost, setIsSignalLost] = useState(false);
    const isSignalLostRef = useRef(false);
    const lastChartDataReceivedAtRef = useRef<number>(0);

    // Rebuild every series for this chart from the raw buffer, applying the current
    // live aggregation (raw passthrough, or 1-/5-min averages). Sessions (upload)
    // and the raw setting render every sample; only live numeric trends are binned.
    const rebuildAllSeries = () => {
        if (!surface) return;
        const ds = dataSourceRef.current;
        const live = ds === 'mqtt' || ds === 'websocket' || ds === 'url';
        const bucketSec = live ? bucketSecondsFor(aggregationRef.current) : 0;
        surface.suspendUpdates();
        physioIdsRef.current.forEach(id => {
            const series = dataSeriesRefs.current[id];
            if (!series) return;
            series.clear();
            const raw = dataRef.current[id];
            if (!raw || raw.x.length === 0) return;
            if (bucketSec === 0) {
                const { gx, gy } = rawWithGapBreaks(raw.x, raw.y);
                series.appendRange(gx, gy);
            } else {
                const { bx, by } = binSeries(raw.x, raw.y, bucketSec);
                if (bx.length > 0) series.appendRange(bx, by);
            }
        });
        surface.resumeUpdates();
    };

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
        const xLabelProvider = new SciChart.SmartDateLabelProvider({
            labelFormat: SciChart.ENumericFormat.Date_HHMMSS
        });
        // Axis labels and cursor labels follow the Local/UTC time display toggle
        applyTimeDisplayToLabelProvider(xLabelProvider, () => timeDisplayRef.current);
        surface.xAxes.add(new SciChart.DateTimeNumericAxis(wasmContext, {
            visibleRange: new SciChart.NumberRange(now - state.timeWindow * 60, now),
            labelProvider: xLabelProvider,
            drawMajorBands: false,
        }));

        // Configure Y-Axis
        const units = new Set(physioIds.map(id => PHYSIO_META[id].unit).filter(Boolean));
        const yAxisTitle = units.size === 1 ? Array.from(units)[0] : "Value";

        const yAxisOptions: SciChart.INumericAxisOptions = {
            axisTitle: yAxisTitle,
            drawMajorBands: false,
            autoRange: SciChart.EAutoRange.Always,
            growBy: new SciChart.NumberRange(0.2, 0.2),
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
                    // Shared formatter keeps the rollover aligned with the axis labels
                    // for both Local and UTC display modes.
                    const timeStr = formatChartTime(seriesInfo.xValue, timeDisplayRef.current, { millis: true });

                    const unit = PHYSIO_META[seriesInfo.seriesName as PhysioId]?.unit || '';
                    const value = (seriesInfo.yValue === undefined || Number.isNaN(seriesInfo.yValue)) ? '---' : seriesInfo.yValue.toFixed(2);
                    return [`Time: ${timeStr}`, 
                    `${PHYSIO_META[seriesInfo.seriesName as PhysioId].name}: ${value} ${unit}`];
                }
            })
        );

        surface.resumeUpdates(); // Rule 3
    }, [surface, wasmContext, physioIdsStr]);

    // Re-render axis labels when the Local/UTC toggle changes.
    // Formatting only: the surface, axes and series are NOT recreated.
    useEffect(() => {
        if (!surface) return;
        refreshSurfaceTimeLabels(surface);
    }, [surface, state.timeDisplay]);

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
                binnedDirtyRef.current = false;
                return;
            }

            const records = data;
            if (state.status === 'Paused') return;

            // Live numeric trends are aggregated by rebuilding from the raw buffer
            // (see the refresh timer below); raw mode and sessions append directly.
            const ds = dataSourceRef.current;
            const liveBinned =
                (ds === 'mqtt' || ds === 'websocket' || ds === 'url') &&
                aggregationRef.current !== 'raw';

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
                if (!series) return;

                // Append raw points incrementally — skipped in live binned mode,
                // where the refresh timer rebuilds the aggregated series instead.
                if (!liveBinned) {
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
                }

                // 4. Update Stats (Incremental, ignoring NaNs) — always from raw values
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
            });

            // In live binned mode, mark the raw buffer dirty so the refresh timer
            // re-bins on its next tick (cheap: numeric trends only).
            if (liveBinned) binnedDirtyRef.current = true;

            // Rule 4: Global Auto-Scroll
            if (maxTimestamp > 0) {
                lastDataRef.current = { timestamp: maxTimestamp, receivedAt: Date.now() };
                
                // Legacy data-driven scroll for non-live sources (File Replay, URL)
                if (state.autoScroll && state.dataSource !== 'mqtt' && state.dataSource !== 'websocket') {
                    const xAxis = surface.xAxes.get(0);
                    if (xAxis) {
                        // URL polling is binnable (live); sessions render server-aggregated
                        // data raw. Floor the window to a few buckets when binning.
                        const bs = state.dataSource === 'url' ? bucketSecondsFor(aggregationRef.current) : 0;
                        const window = Math.max(state.timeWindow * 60, bs * 3);
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

    // Re-bin every series when the aggregation slider (or data source) changes, so
    // switching RT / 1m / 5m takes effect immediately on the already-plotted data.
    // physioIdsStr is a dependency so a fresh series set is filled at the right
    // resolution right after the configure-series effect recreates it.
    useEffect(() => {
        rebuildAllSeries();
        binnedDirtyRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surface, wasmContext, physioIdsStr, state.aggregation, state.dataSource]);

    // While live and aggregating, refresh the binned series from the raw buffer on
    // a slow tick. Raw mode and sessions use the incremental append path instead.
    useEffect(() => {
        if (!surface) return;
        const intervalId = window.setInterval(() => {
            const ds = dataSourceRef.current;
            const live = ds === 'mqtt' || ds === 'websocket' || ds === 'url';
            if (live && aggregationRef.current !== 'raw' && binnedDirtyRef.current) {
                binnedDirtyRef.current = false;
                rebuildAllSeries();
            }
        }, 1000);
        return () => window.clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surface]);

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
                // Keep at least ~3 buckets in view while aggregating so a binned
                // trend is never squeezed down to a single off-screen point.
                const bs = bucketSecondsFor(aggregationRef.current);
                const timeWindowSeconds = Math.max(state.timeWindow * 60, bs * 3);

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