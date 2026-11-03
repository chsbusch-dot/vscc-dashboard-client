// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../components/AppLayout';
import { DashboardProvider } from '../data/DashboardContext';
import { DataProbe, dashboardProbe, fakeBroker } from './testHarness';
import { SYNTHETIC_ID, SYNTHETIC_TOPIC, SYNTHETIC_WAVE_ID, SYNTHETIC_WAVE_TOPIC, receivedFrames } from './syntheticAddons.fixture';

vi.mock('vscc-addons', () => import('./syntheticAddons.fixture'));
vi.mock('mqtt', async () => (await import('./testHarness')).mqttModule);
vi.mock('scichart', () => ({ SciChartVerticalGroup: class {} }));
vi.mock('../components/ChartContainer', async () => (await import('./testHarness')).chartContainerModule);
vi.mock('../components/AdvancedCharts', () => ({ default: () => null }));

describe('add-on wave topics', () => {
    beforeEach(() => {
        fakeBroker.reset();
        receivedFrames.length = 0;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('charts a declared wave id from its topic and leaves everything else to the tap', async () => {
        const { container } = render(<DashboardProvider><AppLayout /><DataProbe /></DashboardProvider>);
        fireEvent.click(screen.getByText('Synthetic Wave'));
        const charted = [...container.querySelectorAll('[data-core-chart]')].map(el => el.getAttribute('data-core-chart'));
        expect(charted).toContain(SYNTHETIC_WAVE_ID);

        fireEvent.click(screen.getByRole('button', { name: /play live/i }));
        act(() => fakeBroker.emit('connect'));
        expect(fakeBroker.subscribed.filter(t => t === SYNTHETIC_WAVE_TOPIC)).toHaveLength(1);
        expect(fakeBroker.subscribed).toContain(SYNTHETIC_TOPIC);

        act(() => {
            fakeBroker.publish(SYNTHETIC_WAVE_TOPIC, [
                { time: 1000, physio_id: SYNTHETIC_WAVE_ID, value: 0.5 },
                { time: 1000.004, physio_id: SYNTHETIC_WAVE_ID, value: null },
                { time: 1000.004, physio_id: 'SYN_UNREGISTERED', value: 9 },
                { time: 1000.004, physio_id: SYNTHETIC_ID, value: 3 },
            ]);
            fakeBroker.publish(SYNTHETIC_WAVE_TOPIC, { time: 1000.008, physio_id: SYNTHETIC_WAVE_ID, value: -0.25, device_id: 'synthetic' });
            // The same registered id on an undeclared topic: core drops it, the tap sees the frame.
            fakeBroker.publish(SYNTHETIC_TOPIC, [
                { time: 1000.012, physio_id: SYNTHETIC_WAVE_ID, value: 7 },
                { time: 1000.012, physio_id: SYNTHETIC_ID, value: 4 },
            ]);
            // Positive control: a core HF wave goes through the same 100 ms flush.
            fakeBroker.publish('mp50/HF-ECG', { time: 1000, physio_id: 'NOM_ECG_ELEC_POTL_II', value: 0.1 });
        });

        const store = () => dashboardProbe.dataRef?.current ?? {};
        await waitFor(() => expect(store().NOM_ECG_ELEC_POTL_II?.y).toEqual([0.1]));
        expect(store()[SYNTHETIC_WAVE_ID]).toEqual({ x: [1000, 1000.004, 1000.008], y: [0.5, null, -0.25] });
        expect(store().SYN_UNREGISTERED).toBeUndefined();
        expect(store()[SYNTHETIC_ID]).toBeUndefined();

        expect(receivedFrames).toEqual([
            { topic: SYNTHETIC_WAVE_TOPIC, samples: [{ time: 1000.004, physio_id: SYNTHETIC_ID, value: 3 }] },
            { topic: SYNTHETIC_TOPIC, samples: [{ time: 1000.012, physio_id: SYNTHETIC_ID, value: 4 }] },
        ]);
    });
});
