import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLOR_MODE_STORAGE_KEY, readColorMode, writeColorMode } from './colorMode';

/** An in-memory localStorage: the node test environment has none. */
const memoryStorage = () => {
    const m = new Map<string, string>();
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
        removeItem: (k: string) => { m.delete(k); },
        clear: () => m.clear(),
    };
};

describe('colour mode storage', () => {
    beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('defaults to light', () => {
        expect(readColorMode()).toBe('light');
    });

    it('round-trips dark and light', () => {
        writeColorMode('dark');
        expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark');
        expect(readColorMode()).toBe('dark');
        writeColorMode('light');
        expect(readColorMode()).toBe('light');
    });

    it('reads an unknown value as light', () => {
        localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'sepia');
        expect(readColorMode()).toBe('light');
    });

    it('survives storage that throws', () => {
        const blocked = () => { throw new Error('blocked'); };
        vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
        expect(() => writeColorMode('dark')).not.toThrow();
        expect(readColorMode()).toBe('light');
    });

    it('survives a missing localStorage', () => {
        vi.stubGlobal('localStorage', undefined);
        expect(() => writeColorMode('dark')).not.toThrow();
        expect(readColorMode()).toBe('light');
    });
});
