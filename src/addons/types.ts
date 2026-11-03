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

/** Display metadata of one series: the shape of a PHYSIO_META entry. */
export interface SignalMeta {
    /** Label in the live menu, the session legend and the chart's stats box and tooltip. */
    name: string;
    /** Y-axis title and tooltip unit, '' for none. */
    unit: string;
    /** Selected series with the same group share one chart. */
    group: string;
    /** CSS colour of the line, the checkbox and the stats box. */
    color: string;
}

/** What the module behind the `vscc-addons` entry point default-exports. */
export interface DashboardAddons {
    /** Extra live topics to subscribe on connect. Core drops their samples, add-ons read them. */
    topics?: readonly string[];
    /**
     * Live topics whose samples core charts, each mapped to the `signals` ids it takes
     * from that topic. Core subscribes them on connect and buffers those samples like
     * its own HF waves (a sample or an array of samples per message, flushed into the
     * live store every 100 ms), so a selected id charts live. Other ids on the topic,
     * ids not registered in `signals` and topics not listed here only reach the tap.
     * A topic core maps itself keeps its core mapping.
     */
    waveTopics?: Readonly<Record<string, readonly string[]>>;
    /** Panels mounted in the slot under the core charts, in this order. */
    panels?: readonly AddonPanel[];
    /**
     * Extra series keyed by physio_id, listed after the core ones in the live menu
     * and shown in the session legend. A core id keeps its core metadata.
     */
    signals?: Readonly<Record<string, SignalMeta>>;
}
