import type { LabelProviderBase2D, SciChartSurface } from 'scichart';
import { formatChartTime, type TimeDisplayMode } from './timeFormat';

/**
 * Wires a SciChart label provider so axis labels and cursor labels obey the
 * current time display mode (Local vs UTC). The mode is read through a getter
 * at format time, so toggling the mode requires NO surface/axis re-creation —
 * callers only need to refresh the existing surface (see
 * {@link refreshSurfaceTimeLabels}).
 */
export const applyTimeDisplayToLabelProvider = (
    provider: LabelProviderBase2D,
    getMode: () => TimeDisplayMode
): void => {
    provider.formatLabel = (dataValue: number) => formatChartTime(dataValue, getMode());
    provider.formatCursorLabel = (dataValue: number) =>
        formatChartTime(dataValue, getMode(), { millis: true });
};

/**
 * Re-renders axis labels of an existing surface after the time display mode
 * changed. Clears the providers' tick->text caches (otherwise stale strings
 * are served) and invalidates the surface. Formatting only — the surface is
 * never destroyed or recreated.
 */
export const refreshSurfaceTimeLabels = (surface: SciChartSurface): void => {
    surface.xAxes.asArray().forEach(axis => {
        const provider = axis.labelProvider as Partial<LabelProviderBase2D> | undefined;
        provider?.invalidateCache?.();
    });
    surface.invalidateElement();
};
