import * as SciChart from 'scichart';
import { ELabelPlacement } from 'scichart/types/LabelPlacement';

/**
 * Marks a loaded session's extent on a chart: grey shading outside it and a
 * labelled line at its start and end, so a view that strays past the recording
 * shows why it is empty. Wrapped in try/catch: the bounds must never break a trace.
 */

const OUTSIDE_FILL = 'rgba(128, 128, 128, 0.18)';
const EDGE_STROKE = 'rgba(128, 128, 128, 0.9)';
// Far enough that the shading reaches past any view a user can zoom out to.
const SHADE_SPAN_SEC = 365 * 24 * 3600;

export type SessionBoundsAnnotations = SciChart.IAnnotation[];

export const addSessionBounds = (
    surface: SciChart.SciChartSurface,
    start: number,
    end: number,
    fmt: (epochSec: number) => string,
): SessionBoundsAnnotations => {
    const added: SessionBoundsAnnotations = [];
    try {
        for (const [x1, x2] of [[start - SHADE_SPAN_SEC, start], [end, end + SHADE_SPAN_SEC]]) {
            added.push(new SciChart.BoxAnnotation({
                x1, x2,
                y1: 0, y2: 1,
                yCoordinateMode: SciChart.ECoordinateMode.Relative,
                fill: OUTSIDE_FILL,
                strokeThickness: 0,
                annotationLayer: SciChart.EAnnotationLayer.Background,
                isEditable: false,
            }));
        }
        for (const [x1, label] of [[start, `Start ${fmt(start)}`], [end, `End ${fmt(end)}`]] as const) {
            added.push(new SciChart.VerticalLineAnnotation({
                x1,
                stroke: EDGE_STROKE,
                strokeThickness: 1,
                strokeDashArray: [4, 4],
                showLabel: true,
                labelPlacement: ELabelPlacement.TopRight,
                labelValue: label,
                axisLabelFill: EDGE_STROKE,
                axisFontSize: 11,
                isEditable: false,
            }));
        }
        for (const a of added) surface.annotations.add(a);
    } catch {
        // Annotation API guard.
    }
    return added;
};

export const removeSessionBounds = (
    surface: SciChart.SciChartSurface,
    annotations: SessionBoundsAnnotations,
) => {
    for (const a of annotations) {
        try {
            if (surface.annotations.contains(a)) surface.annotations.remove(a);
        } catch {
            // Surface already deleted.
        }
    }
};
