import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import * as SciChart from 'scichart';
import { useDashboard } from '../data/DashboardContext';
import { getClinicalColor } from '../utils/colors';

interface AdvancedChartsProps {
    verticalGroup: SciChart.SciChartVerticalGroup;
    showRawPleth: boolean;
    showPpi: boolean;
    showOverlay: boolean;
    showSpectrogram: boolean;
}

const AdvancedCharts: React.FC<AdvancedChartsProps> = ({ verticalGroup, showRawPleth, showPpi, showOverlay, showSpectrogram }) => {
    const { state, subscribeToData } = useDashboard();
    const chart1Div = useRef<HTMLDivElement>(null);
    const chart2Div = useRef<HTMLDivElement>(null);
    const chart3Div = useRef<HTMLDivElement>(null);
    const chart4Div = useRef<HTMLDivElement>(null);

    // FIX 1: Use 'any' here to bypass the missing ISciChartDataSeries export. 
    // We cast to specific series types (XyDataSeries, etc) below anyway.
    const dataSeriesRefs = useRef<Record<string, any>>({});
    const surfacesRef = useRef<SciChart.SciChartSurface[]>([]);
    const observersRef = useRef<ResizeObserver[]>([]);
    const ppiLastPeakRef = useRef<{time: number, val: number}>({time: -1, val: 0}); 

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

        const initCharts = async () => {
            surfacesRef.current.forEach(s => s.delete());
            surfacesRef.current = [];
            observersRef.current.forEach(o => o.disconnect());
            observersRef.current = [];
            dataSeriesRefs.current = {};

            if (!isMounted) return;

            SciChart.SciChartSurface.UseCommunityLicense();
            SciChart.SciChartDefaults.performanceWarnings = false;
            SciChart.SciChartSurface.configure({ wasmUrl: "/scichart2d.wasm" });

            // --- Chart 1: Time-Domain Waveform Plot (Raw PLETH Signal) ---
            if (chart1Div.current && showRawPleth) {
                const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chart1Div.current);
                surfacesRef.current.push(sciChartSurface);
                sciChartSurface.suspendUpdates();
                
                const xAxis = new SciChart.NumericAxis(wasmContext, { axisTitle: "Time", labelProvider: new SciChart.SmartDateLabelProvider() });
                const yAxis = new SciChart.NumericAxis(wasmContext, { axisTitle: "Amplitude (A-D Units)" });
                sciChartSurface.xAxes.add(xAxis);
                sciChartSurface.yAxes.add(yAxis);

                const dataSeries = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 500000 });
                dataSeriesRefs.current.rawPleth = dataSeries;
                sciChartSurface.renderableSeries.add(new SciChart.FastLineRenderableSeries(wasmContext, {
                    dataSeries, stroke: getClinicalColor('NOM_PULS_OXIM_SAT_O2'), strokeThickness: 2
                }));

                // FIX 2: Assign vertical group directly to the surface property
                // @ts-expect-error - Runtime API assignment
                sciChartSurface.verticalGroup = verticalGroup;
                sciChartSurface.chartModifiers.add(
                    new SciChart.ZoomExtentsModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.MouseWheelZoomModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.ZoomPanModifier({ modifierGroup: "GlobalSyncGroup" })
                );

                const observer = new ResizeObserver(() => sciChartSurface?.invalidateElement());
                observer.observe(chart1Div.current);
                observersRef.current.push(observer);
                sciChartSurface.resumeUpdates();
            }

            // --- Chart 2: Pulse Rate vs. Time (Tachogram/PPI Plot) ---
            if (chart2Div.current && showPpi) {
                const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chart2Div.current);
                surfacesRef.current.push(sciChartSurface);
                sciChartSurface.suspendUpdates();

                sciChartSurface.xAxes.add(new SciChart.NumericAxis(wasmContext, { axisTitle: "Time", labelProvider: new SciChart.SmartDateLabelProvider() }));
                sciChartSurface.yAxes.add(new SciChart.NumericAxis(wasmContext, { axisTitle: "Pulse-to-Pulse Interval (ms)" }));

                const dataSeries = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 50000 });
                dataSeriesRefs.current.ppi = dataSeries;
                sciChartSurface.renderableSeries.add(new SciChart.XyScatterRenderableSeries(wasmContext, {
                    dataSeries,
                    pointMarker: new SciChart.EllipsePointMarker(wasmContext, {
                        width: 7, height: 7, fill: getClinicalColor('NOM_PULS_INTERVAL'), stroke: "#FFFFFF", strokeThickness: 1
                    })
                }));

                // FIX 2
                // @ts-expect-error - Runtime API assignment
                sciChartSurface.verticalGroup = verticalGroup;
                sciChartSurface.chartModifiers.add(
                    new SciChart.ZoomExtentsModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.MouseWheelZoomModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.ZoomPanModifier({ modifierGroup: "GlobalSyncGroup" })
                );

                const observer = new ResizeObserver(() => sciChartSurface?.invalidateElement());
                observer.observe(chart2Div.current);
                observersRef.current.push(observer);
                sciChartSurface.resumeUpdates();
            }

            // --- Chart 3: Overlayed Derived Physiological Parameters ---
            if (chart3Div.current && showOverlay) {
                const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chart3Div.current);
                surfacesRef.current.push(sciChartSurface);
                sciChartSurface.suspendUpdates();

                sciChartSurface.xAxes.add(new SciChart.NumericAxis(wasmContext, { labelProvider: new SciChart.SmartDateLabelProvider() }));
                sciChartSurface.yAxes.add(new SciChart.NumericAxis(wasmContext, { id: "LeftAxis", axisTitle: "Raw Amplitude", axisAlignment: SciChart.EAxisAlignment.Left }));
                sciChartSurface.yAxes.add(new SciChart.NumericAxis(wasmContext, { id: "RightAxis", axisTitle: "Derived Parameters", axisAlignment: SciChart.EAxisAlignment.Right }));

                const dsRaw = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 500000 });
                dataSeriesRefs.current.overlayPleth = dsRaw;
                sciChartSurface.renderableSeries.add(new SciChart.FastLineRenderableSeries(wasmContext, {
                    dataSeries: dsRaw, yAxisId: "LeftAxis", stroke: getClinicalColor('NOM_PULS_OXIM_SAT_O2'), strokeThickness: 1
                }));

                const dsPR = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 50000 });
                dataSeriesRefs.current.overlayPR = dsPR;
                sciChartSurface.renderableSeries.add(new SciChart.FastLineRenderableSeries(wasmContext, {
                    dataSeries: dsPR, yAxisId: "RightAxis", stroke: getClinicalColor('NOM_PLETH_PULS_RATE'), strokeThickness: 2
                }));

                const dsSpo2 = new SciChart.XyDataSeries(wasmContext, { fifoCapacity: 50000 });
                dataSeriesRefs.current.overlaySpo2 = dsSpo2;
                sciChartSurface.renderableSeries.add(new SciChart.FastLineRenderableSeries(wasmContext, {
                    dataSeries: dsSpo2, yAxisId: "RightAxis", stroke: getClinicalColor('NOM_PULS_OXIM_SAT_O2'), strokeThickness: 2
                }));

                // FIX 2
                // @ts-expect-error - Runtime API assignment
                sciChartSurface.verticalGroup = verticalGroup;
                sciChartSurface.chartModifiers.add(
                    new SciChart.ZoomExtentsModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.MouseWheelZoomModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.ZoomPanModifier({ modifierGroup: "GlobalSyncGroup" })
                );

                const observer = new ResizeObserver(() => sciChartSurface?.invalidateElement());
                observer.observe(chart3Div.current);
                observersRef.current.push(observer);
                sciChartSurface.resumeUpdates();
            }

            // --- Chart 4: Spectrogram ---
            if (chart4Div.current && showSpectrogram) {
                const { sciChartSurface, wasmContext } = await SciChart.SciChartSurface.create(chart4Div.current);
                surfacesRef.current.push(sciChartSurface);
                sciChartSurface.suspendUpdates();

                sciChartSurface.xAxes.add(new SciChart.NumericAxis(wasmContext, { axisTitle: "Time (s)" }));
                sciChartSurface.yAxes.add(new SciChart.NumericAxis(wasmContext, { axisTitle: "Frequency (Hz)" }));

                const dataSeries = new SciChart.UniformHeatmapDataSeries(wasmContext, {
                    xStart: 0, xStep: 1, yStart: 0, yStep: 1, zValues: [[0]]
                });
                dataSeriesRefs.current.spectrogram = dataSeries;

                sciChartSurface.renderableSeries.add(new SciChart.UniformHeatmapRenderableSeries(wasmContext, {
                    dataSeries,
                    colorMap: new SciChart.HeatmapColorMap({
                        minimum: 0, maximum: 1,
                        gradientStops: [
                            { offset: 0, color: "DarkBlue" }, { offset: 0.2, color: "Blue" },
                            { offset: 0.4, color: "Cyan" }, { offset: 0.6, color: "Green" },
                            { offset: 0.8, color: "Yellow" }, { offset: 1, color: "Red" }
                        ]
                    })
                }));

                // FIX 2
                // @ts-expect-error - Runtime API assignment
                sciChartSurface.verticalGroup = verticalGroup;
                sciChartSurface.chartModifiers.add(
                    new SciChart.ZoomExtentsModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.MouseWheelZoomModifier({ modifierGroup: "GlobalSyncGroup" }),
                    new SciChart.ZoomPanModifier({ modifierGroup: "GlobalSyncGroup" })
                );

                const observer = new ResizeObserver(() => sciChartSurface?.invalidateElement());
                observer.observe(chart4Div.current);
                observersRef.current.push(observer);
                sciChartSurface.resumeUpdates();
            }
        };

        initCharts();

        return () => {
            isMounted = false;
        }
    }, [showRawPleth, showPpi, showOverlay, showSpectrogram, verticalGroup]);

    // DATA SUBSCRIPTION EFFECT
    useEffect(() => {
        const unsubscribe = subscribeToData((data) => {
            if (data === 'clear') {
                Object.values(dataSeriesRefs.current).forEach(ds => ds?.clear());
                ppiLastPeakRef.current = {time: -1, val: 0};
                return;
            }

            if (state.status === 'Paused') return;

            const plethX: number[] = [];
            const plethY: number[] = [];
            const prX: number[] = [];
            const prY: number[] = [];
            const spo2X: number[] = [];
            const spo2Y: number[] = [];

            data.forEach(rec => {
                if (rec.physio_id === 'NOM_PLETH_WAVE_A') {
                    plethX.push(rec.time);
                    plethY.push(rec.value);
                } else if (rec.physio_id === 'NOM_PLETH_PULS_RATE') {
                    prX.push(rec.time);
                    prY.push(rec.value);
                } else if (rec.physio_id === 'NOM_PULS_OXIM_SAT_O2') {
                    spo2X.push(rec.time);
                    spo2Y.push(rec.value);
                }
            });

            if (plethX.length > 0) {
                const rawPlethDS = dataSeriesRefs.current.rawPleth as SciChart.XyDataSeries;
                if (rawPlethDS) rawPlethDS.appendRange(plethX, plethY);

                const overlayPlethDS = dataSeriesRefs.current.overlayPleth as SciChart.XyDataSeries;
                if (overlayPlethDS) overlayPlethDS.appendRange(plethX, plethY);

                // Peak detection for PPI
                const ppiDS = dataSeriesRefs.current.ppi as SciChart.XyDataSeries;
                if (ppiDS) {
                    const ppiX: number[] = [];
                    const ppiY: number[] = [];
                    
                    for (let i = 1; i < plethY.length - 1; i++) {
                        if (plethY[i] > plethY[i-1] && plethY[i] > plethY[i+1] && plethY[i] > 2500) {
                            if (ppiLastPeakRef.current.time !== -1 && plethX[i] > ppiLastPeakRef.current.time) {
                                const ppi = (plethX[i] - ppiLastPeakRef.current.time) * 1000;
                                ppiX.push(plethX[i]);
                                ppiY.push(ppi);
                            }
                            ppiLastPeakRef.current = { time: plethX[i], val: plethY[i] };
                        }
                    }
                    if (ppiX.length > 0) ppiDS.appendRange(ppiX, ppiY);
                }

                // Spectrogram Simulation
                const spectrogramDS = dataSeriesRefs.current.spectrogram as SciChart.UniformHeatmapDataSeries;
                if (spectrogramDS) {
                    const width = 100;
                    const height = 50;
                    const zValues: number[][] = [];
                    for (let y = 0; y < height; y++) {
                        const row = [];
                        for (let x = 0; x < width; x++) {
                            const dataIndex = (x + y * width) % plethY.length;
                            const realValue = plethY[dataIndex] ? (plethY[dataIndex] - 2000) / 1000 : 0;
                            row.push(Math.sin(x * 0.1 + realValue) * Math.cos(y * 0.1) * 0.5 + 0.5);
                        }
                        zValues.push(row);
                    }
                    spectrogramDS.setZValues(zValues);
                }
            }

            if (prX.length > 0) {
                const overlayPrDS = dataSeriesRefs.current.overlayPR as SciChart.XyDataSeries;
                if (overlayPrDS) overlayPrDS.appendRange(prX, prY);
            }

            if (spo2X.length > 0) {
                const overlaySpo2DS = dataSeriesRefs.current.overlaySpo2 as SciChart.XyDataSeries;
                if (overlaySpo2DS) overlaySpo2DS.appendRange(spo2X, spo2Y);
            }
        });

        return () => unsubscribe();
    }, [state.status, subscribeToData]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2, width: '100%' }}>
            {showRawPleth && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Raw PLETH Waveform</Typography>
                    <div ref={chart1Div} style={{ flexGrow: 1, width: "100%" }} />
                </Paper>
            )}
            {showPpi && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Pulse Rate vs Time (PPI)</Typography>
                    <div ref={chart2Div} style={{ flexGrow: 1, width: "100%" }} />
                </Paper>
            )}
            {showOverlay && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Derived Parameters Overlay</Typography>
                    <div ref={chart3Div} style={{ flexGrow: 1, width: "100%" }} />
                </Paper>
            )}
            {showSpectrogram && (
                <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle1" gutterBottom>Spectrogram</Typography>
                    <div ref={chart4Div} style={{ flexGrow: 1, width: "100%" }} />
                </Paper>
            )}
        </Box>
    );
};

export default AdvancedCharts;