import type { DashboardAddons } from './types';

// Default target of the `vscc-addons` entry point: no topics, no panels.
// An external build sets VSCC_ADDONS to its own module of the same shape.
const addons: DashboardAddons = {};

export default addons;
