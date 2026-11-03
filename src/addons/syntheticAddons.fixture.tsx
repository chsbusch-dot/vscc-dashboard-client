/* eslint-disable react-refresh/only-export-components -- test module, never hot-reloaded */
// A stand-in add-on module for tests, shaped like what VSCC_ADDONS points at.
// The ids and topic are synthetic: no device sends them.
import { useEffect, useState } from 'react';
import type { AddonPanelProps, DashboardAddons, WaveformFrame } from './types';

export const SYNTHETIC_ID = 'SYN_ADDON_WAVE';
export const SYNTHETIC_TOPIC = 'synthetic/HF-ADDON';
/** A series the add-on registers in `signals`; SYNTHETIC_ID stays unregistered. */
export const SYNTHETIC_SIGNAL_ID = 'SYN_ADDON_INDEX';
/** A registered wave that core charts from the add-on's declared wave topic. */
export const SYNTHETIC_WAVE_ID = 'SYN_CHART_WAVE';
export const SYNTHETIC_WAVE_TOPIC = 'synthetic/HF-CHART';

/** Every frame the dummy panel received, in order. */
export const receivedFrames: WaveformFrame[] = [];

const DummyPanel = ({ subscribeWaveform }: AddonPanelProps) => {
    const [count, setCount] = useState(0);
    useEffect(() => subscribeWaveform([SYNTHETIC_ID], (frame) => {
        receivedFrames.push(frame);
        setCount(n => n + frame.samples.length);
    }), [subscribeWaveform]);
    return <div data-testid="dummy-panel">{count} samples</div>;
};

const addons: DashboardAddons = {
    topics: [SYNTHETIC_TOPIC],
    // SYN_UNREGISTERED is declared but not in `signals`, so core leaves it to the tap.
    waveTopics: { [SYNTHETIC_WAVE_TOPIC]: [SYNTHETIC_WAVE_ID, 'SYN_UNREGISTERED'] },
    panels: [{ id: 'synthetic-dummy', component: DummyPanel }],
    signals: {
        [SYNTHETIC_SIGNAL_ID]: { name: 'Synthetic Index', unit: 'syn', group: 'Synthetic Group', color: '#123456' },
        [SYNTHETIC_WAVE_ID]: { name: 'Synthetic Wave', unit: 'syn', group: 'Synthetic Wave Group', color: '#654321' },
    },
};

export default addons;
