import { createContext, useContext } from 'react';

/**
 * The viewer's light/dark choice. It only changes how the dashboard is drawn
 * (MUI palette and SciChart surface theme), never the data.
 */
export type ColorMode = 'light' | 'dark';

/** localStorage key used to persist the viewer's colour mode. */
export const COLOR_MODE_STORAGE_KEY = 'vscc.colorMode';

/** The stored colour mode, light when unset, unreadable or not a known mode. */
export const readColorMode = (): ColorMode => {
    try {
        return localStorage.getItem(COLOR_MODE_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
        return 'light';
    }
};

/** Stores the colour mode; a blocked or full storage keeps it for this page only. */
export const writeColorMode = (mode: ColorMode): void => {
    try {
        localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
        /* storage unavailable: the choice lasts until reload */
    }
};

export interface ColorModeState {
    mode: ColorMode;
    toggle: () => void;
}

export const ColorModeContext = createContext<ColorModeState>({ mode: 'light', toggle: () => {} });

export const useColorMode = (): ColorModeState => useContext(ColorModeContext);
