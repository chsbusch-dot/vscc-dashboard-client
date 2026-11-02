import { isMqttTelemetryMessage } from '../utils/dataParser';
import type { SubscribeWaveform, WaveformListener } from './types';

interface Subscription {
    ids: ReadonlySet<string>;
    listener: WaveformListener;
}

const subscriptions = new Set<Subscription>();

export const subscribeWaveform: SubscribeWaveform = (ids, listener) => {
    const sub: Subscription = { ids: new Set(ids), listener };
    subscriptions.add(sub);
    return () => { subscriptions.delete(sub); };
};

/**
 * Hand one parsed live-stream message to the add-on subscribers, before core's
 * topic mapping drops anything. The message is one frame (a sample object or an
 * array of them); each subscriber gets its own copies of the samples whose id it
 * asked for. Returns at once when nobody subscribed.
 */
export const tapLiveMessage = (topic: string, message: unknown): void => {
    if (subscriptions.size === 0) return;
    const samples = (Array.isArray(message) ? message as unknown[] : [message]).filter(isMqttTelemetryMessage);
    if (samples.length === 0) return;
    for (const sub of subscriptions) {
        const wanted = samples.filter(s => sub.ids.has(s.physio_id)).map(s => ({ ...s }));
        if (wanted.length === 0) continue;
        try {
            sub.listener({ topic, samples: wanted });
        } catch (error) {
            console.error('Add-on waveform listener failed:', error);
        }
    }
};
