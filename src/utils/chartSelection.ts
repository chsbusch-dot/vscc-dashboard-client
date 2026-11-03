import type { DashboardState } from '../data/DashboardContext';
import { SERIES_IDS } from '../data/signalMeta';

/** True when at least one series in the menu is selected. Only menu ids count, so a
 *  stale id from a layout saved by another build cannot mark the Basic Vitals tab. */
export const anySeriesSelected = (selected: DashboardState['selectedPhysioIds']): boolean =>
    SERIES_IDS.some(id => selected[id] === true);

/** True when at least one of the three wave charts is switched on. */
export const anyWaveChart = (charts: DashboardState['advancedCharts']): boolean =>
    charts.rawPleth || charts.ecg || charts.resp;
