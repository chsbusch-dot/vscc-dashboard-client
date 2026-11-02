import addons from 'vscc-addons';

export const addonTopics: readonly string[] = addons.topics ?? [];
export const addonPanels = addons.panels ?? [];

export { subscribeWaveform, tapLiveMessage } from './liveTap';
export type * from './types';
