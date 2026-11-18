import * as SciChart from 'scichart';
import type { YRangeHint } from '../addons/types';
import { applyYRangeHint } from './yRangeHint';

/**
 * A value axis that autoranges as usual and then applies a series' y-range hint
 * (SignalMeta.yRange): a set bound is fixed, an unset one follows the data.
 */
export class HintedNumericAxis extends SciChart.NumericAxis {
    private readonly hint: YRangeHint | undefined;

    constructor(wasmContext: SciChart.TSciChart, options: SciChart.INumericAxisOptions, hint: YRangeHint | undefined) {
        super(wasmContext, options);
        this.hint = hint;
    }

    public override getMaximumRange(): SciChart.NumberRange {
        const range = super.getMaximumRange();
        if (!this.hint) return range;
        const { min, max } = applyYRangeHint(range.min, range.max, this.hint);
        return min === range.min && max === range.max ? range : new SciChart.NumberRange(min, max);
    }
}
