import * as SciChart from 'scichart';
import type { ColorMode } from './colorMode';

/** The SciChart surface theme that matches the dashboard's colour mode. */
export const sciChartTheme = (mode: ColorMode): SciChart.IThemeProvider =>
    mode === 'dark' ? new SciChart.SciChartJSDarkv2Theme() : new SciChart.SciChartJSLightTheme();
