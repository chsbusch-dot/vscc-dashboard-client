/**
 * The one lookup for series display metadata: core PHYSIO_META plus the
 * `signals` an add-on registers. Menu, grouping, charts, colours and the
 * session legend all read through here.
 */

// Read straight from the entry point, not '../addons': this module stays a leaf,
// while '../addons' pulls in the live tap and with it the parser.
import addons from 'vscc-addons';
import type { SignalMeta } from '../addons/types';
import { PHYSIO_META } from './constants';

export type { SignalMeta };

const META = new Map<string, SignalMeta>(Object.entries(PHYSIO_META));
for (const [id, meta] of Object.entries(addons.signals ?? {})) {
    // A core id wins, so an add-on cannot rename or recolour an MMS series.
    if (!META.has(id)) META.set(id, meta);
}

/** Every series the live menu offers, in menu order: core first, then add-on ids. */
export const SERIES_IDS: readonly string[] = [...META.keys()];

/** Metadata of a series, or undefined for an id neither core nor an add-on registered. */
export const signalMeta = (id: string): SignalMeta | undefined => META.get(id);
