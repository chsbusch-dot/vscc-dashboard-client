import type { ComponentType } from 'react';
import type { MqttTelemetryMessage } from '../utils/dataParser';

/** One sample exactly as the live stream carried it: no resampling, no merging. */
export type WaveformSample = MqttTelemetryMessage;

/** One received live-stream message: its topic and its samples, in arrival order. */
export interface WaveformFrame {
    topic: string;
    samples: WaveformSample[];
}

export type WaveformListener = (frame: WaveformFrame) => void;

/** Receive the samples of `ids` as frames arrive. Returns the unsubscribe function. */
export type SubscribeWaveform = (ids: readonly string[], listener: WaveformListener) => () => void;

export interface AddonPanelProps {
    subscribeWaveform: SubscribeWaveform;
}

export interface AddonPanel {
    /** Stable key, also set as the panel wrapper's data-addon-panel attribute. */
    id: string;
    component: ComponentType<AddonPanelProps>;
}

/** What the module behind the `vscc-addons` entry point default-exports. */
export interface DashboardAddons {
    /** Extra live topics to subscribe on connect. Core drops their samples, add-ons read them. */
    topics?: readonly string[];
    /** Panels mounted in the slot under the core charts, in this order. */
    panels?: readonly AddonPanel[];
}
