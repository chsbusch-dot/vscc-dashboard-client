import { describe, expect, it } from 'vitest';
import { SERIES_IDS } from '../data/signalMeta';
import { anySeriesSelected, anyWaveChart } from './chartSelection';

describe('anySeriesSelected', () => {
    it('is true with one menu series selected', () => {
        expect(anySeriesSelected({ [SERIES_IDS[0]]: true })).toBe(true);
    });

    it('is false with none selected', () => {
        expect(anySeriesSelected({})).toBe(false);
        expect(anySeriesSelected(Object.fromEntries(SERIES_IDS.map(id => [id, false])))).toBe(false);
    });

    it('ignores a stale id that is not in the menu', () => {
        expect(anySeriesSelected({ SYN_STALE_LAYOUT_ID: true })).toBe(false);
    });
});

describe('anyWaveChart', () => {
    it('is true with any one wave chart on', () => {
        expect(anyWaveChart({ rawPleth: false, ecg: false, resp: true })).toBe(true);
        expect(anyWaveChart({ rawPleth: true, ecg: false, resp: false })).toBe(true);
    });

    it('is false with all three off', () => {
        expect(anyWaveChart({ rawPleth: false, ecg: false, resp: false })).toBe(false);
    });
});
