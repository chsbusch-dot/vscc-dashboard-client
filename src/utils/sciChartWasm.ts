import type { TSciChartConfig } from 'scichart';
// SciChart 6 ships one modular 2D/3D core (`scichart.wasm`) plus a no-SIMD fallback
// in `scichart/_wasm/`; the 5.x `scichart2d.wasm` is gone. Vite emits both as hashed
// assets from the installed package, so the served wasm always matches the JS.
// wasm64 stays off (SciChartDefaults.useWasm64 is Never), so its file is not needed.
import wasmUrl from 'scichart/_wasm/scichart.wasm?url';
import wasmNoSimdUrl from 'scichart/_wasm/scichart-nosimd.wasm?url';

export const sciChartWasmConfig: TSciChartConfig = { wasmUrl, wasmNoSimdUrl };
