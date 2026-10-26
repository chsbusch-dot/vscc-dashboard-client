/**
 * Pure math for the mouse-wheel zoom step, kept apart from the SciChart modifier
 * (symmetricWheelZoomModifier.ts) so it can be unit-tested without a WebGL context.
 *
 * SciChart grows the axis width by (1 + fraction), with fraction = growFactor *
 * wheel delta. That step is linear, so zoom-in and zoom-out don't cancel, and a
 * large delta (a fast trackpad flick reaches 1000) drives the factor to zero or
 * below: the range collapses to microseconds and zoom-out then barely moves it.
 */

/**
 * Converts SciChart's linear zoom fraction into one that scales the width by
 * e^fraction. A step in and the same step out multiply to exactly 1, and the
 * factor stays positive however large the wheel delta.
 */
export const symmetricZoomFraction = (fraction: number): number => Math.expm1(fraction);
