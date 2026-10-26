import * as SciChart from 'scichart';
import { symmetricZoomFraction } from './wheelZoom';

/**
 * MouseWheelZoomModifier whose zoom-in and zoom-out steps are inverses, so a
 * deep zoom can always be wheeled back out. See wheelZoom.ts for why SciChart's
 * own linear step can leave the view stuck at a sub-second window.
 */
export class SymmetricWheelZoomModifier extends SciChart.MouseWheelZoomModifier {
    protected override growBy(mousePoint: SciChart.Point, axis: SciChart.AxisBase2D, fraction: number): void {
        super.growBy(mousePoint, axis, symmetricZoomFraction(fraction));
    }
}
