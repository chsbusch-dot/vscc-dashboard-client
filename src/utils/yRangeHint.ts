import type { YRangeHint } from '../addons/types';

/**
 * The hint for one chart from the hints of the series it draws. A bound counts only
 * when every series sets it: the lowest min and the highest max, so no series is cut.
 * Undefined when no bound is shared, and the axis then follows the data as before.
 */
export const combineYRangeHints = (hints: readonly (YRangeHint | undefined)[]): YRangeHint | undefined => {
    if (hints.length === 0) return undefined;
    const mins = hints.map(h => h?.min);
    const maxs = hints.map(h => h?.max);
    const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
    const out: YRangeHint = {};
    if (mins.every(finite)) out.min = Math.min(...mins);
    if (maxs.every(finite)) out.max = Math.max(...maxs);
    if (out.min !== undefined && out.max !== undefined && out.max <= out.min) return undefined;
    return out.min === undefined && out.max === undefined ? undefined : out;
};

/**
 * The axis range after the hint: a set bound replaces the data's bound and an unset
 * one keeps it. A range the hint would leave empty or inverted (data entirely below
 * a floor, say) keeps the fixed bound and spans one unit, or the hinted width.
 */
export const applyYRangeHint = (min: number, max: number, hint: YRangeHint | undefined): { min: number; max: number } => {
    if (!hint) return { min, max };
    const lo = hint.min ?? min;
    const hi = hint.max ?? max;
    if (hi > lo) return { min: lo, max: hi };
    return hint.min !== undefined ? { min: lo, max: lo + 1 } : { min: hi - 1, max: hi };
};
