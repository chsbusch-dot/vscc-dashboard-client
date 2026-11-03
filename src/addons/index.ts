import addons from 'vscc-addons';

const waveTopics = addons.waveTopics ?? {};
const registered = new Set(Object.keys(addons.signals ?? {}));

/** Every add-on topic to subscribe on connect: the tap-only ones and the wave topics. */
export const addonTopics: readonly string[] = [...new Set([...(addons.topics ?? []), ...Object.keys(waveTopics)])];
export const addonPanels = addons.panels ?? [];
/** Per declared wave topic, the ids core charts from it: those also registered in `signals`. */
export const addonWaveIds: ReadonlyMap<string, ReadonlySet<string>> = new Map(
    Object.entries(waveTopics).map(([topic, ids]) => [topic, new Set(ids.filter(id => registered.has(id)))]),
);

export { subscribeWaveform, tapLiveMessage } from './liveTap';
export type * from './types';
