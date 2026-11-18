/* eslint-disable react-refresh/only-export-components -- test module, never hot-reloaded */
// A stand-in add-on module that registers one family (WOR-1328), its members
// interleaved with a series and a panel outside it. The ids are synthetic: no device
// sends them.
import type { DashboardAddons } from './types';

export const FAMILY = 'Synthetic Family';
export const FAM_ONE = 'SYN_FAM_ONE';
export const FAM_TWO = 'SYN_FAM_TWO';
/** Registered between the two family members, but in no family. */
export const PLAIN = 'SYN_PLAIN';

const Panel = () => null;

const addons: DashboardAddons = {
    signals: {
        [FAM_ONE]: { name: 'Family One', unit: '', group: 'Family One', color: '#111111', family: FAMILY },
        [PLAIN]: { name: 'Plain', unit: '', group: 'Plain', color: '#222222' },
        [FAM_TWO]: { name: 'Family Two', unit: '', group: 'Family Two', color: '#333333', family: FAMILY },
    },
    // The plain panel is listed first: it still mounts after the family block.
    panels: [
        { id: 'plain-panel', component: Panel },
        { id: 'family-panel', component: Panel, family: FAMILY },
    ],
};

export default addons;
