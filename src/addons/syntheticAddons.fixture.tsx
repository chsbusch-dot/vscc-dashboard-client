/* eslint-disable react-refresh/only-export-components -- test module, never hot-reloaded */
// A stand-in add-on module for tests, shaped like what VSCC_ADDONS points at.
// The id and topic are synthetic: no device sends them.
import { useEffect, useState } from 'react';
import type { AddonPanelProps, DashboardAddons, WaveformFrame } from './types';

export const SYNTHETIC_ID = 'SYN_ADDON_WAVE';
export const SYNTHETIC_TOPIC = 'synthetic/HF-ADDON';

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
    panels: [{ id: 'synthetic-dummy', component: DummyPanel }],
};

export default addons;
