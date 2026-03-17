import { useEffect, useState } from 'react';
import * as SciChart from 'scichart';

// Initialize global settings once to avoid reconfiguration overhead
SciChart.SciChartSurface.UseCommunityLicense();
SciChart.SciChartDefaults.performanceWarnings = false;
SciChart.SciChartSurface.configure({ wasmUrl: "/scichart2d.wasm" });

/**
 * Custom hook to initialize a SciChartSurface with robust lifecycle management.
 * Enforces strict cleanup to prevent WebGL context leaks in React 18 Strict Mode.
 */
export const useSciChart = (divElementId: string) => {
    const [chartState, setChartState] = useState<{
        sciChartSurface?: SciChart.SciChartSurface;
        wasmContext?: SciChart.TSciChart;
    }>({});

    useEffect(() => {
        let surface: SciChart.SciChartSurface | undefined;
        let observer: ResizeObserver | undefined;
        let isMounted = true;

        const init = async () => {
            try {
                const container = document.getElementById(divElementId);
                if (!container) return;

                const res = await SciChart.SciChartSurface.create(divElementId, {
                    theme: new SciChart.SciChartJSLightTheme()
                });
                
                // Handle race condition: component unmounted during async creation
                if (!isMounted) {
                    res.sciChartSurface.delete();
                    return;
                }

                surface = res.sciChartSurface;
                
                // Add placeholder axes to prevent "Cannot draw annotations before axes have been configured" error
                surface.xAxes.add(new SciChart.NumericAxis(res.wasmContext));
                surface.yAxes.add(new SciChart.NumericAxis(res.wasmContext));

                // Setup ResizeObserver
                observer = new ResizeObserver(() => {
                    surface?.invalidateElement();
                });
                observer.observe(container);

                setChartState({ sciChartSurface: surface, wasmContext: res.wasmContext });
            } catch (error) {
                console.error("Failed to init SciChart", error);
            }
        };

        init();

        return () => {
            isMounted = false;
            observer?.disconnect();
            surface?.delete();
            setChartState({});
        };
    }, [divElementId]);

    return chartState;
};