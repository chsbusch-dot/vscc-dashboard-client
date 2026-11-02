// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../components/AppLayout';
import { DashboardProvider } from '../data/DashboardContext';
import { isCommunitySignal } from '../utils/sessionFormat';
import { DataProbe, dashboardProbe, fakeBroker } from './testHarness';
import { SYNTHETIC_ID, SYNTHETIC_TOPIC, receivedFrames } from './syntheticAddons.fixture';

vi.mock('vscc-addons', () => import('./syntheticAddons.fixture'));
vi.mock('mqtt', async () => (await import('./testHarness')).mqttModule);
vi.mock('scichart', () => ({ SciChartVerticalGroup: class {} }));
vi.mock('../components/ChartContainer', async () => (await import('./testHarness')).chartContainerModule);
vi.mock('../components/AdvancedCharts', () => ({ default: () => null }));

const startLive = () => {
    fireEvent.click(screen.getByRole('button', { name: /play live/i }));
    act(() => fakeBroker.emit('connect'));
};

describe('add-on panel hook with a registered panel', () => {
    beforeEach(() => {
        fakeBroker.reset();
        receivedFrames.length = 0;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('feeds a non-community id to the panel, and core renders nothing for it', () => {
        expect(isCommunitySignal(SYNTHETIC_ID)).toBe(false);
        const { container } = render(<DashboardProvider><AppLayout /><DataProbe /></DashboardProvider>);
        expect(container.querySelector('[data-addon-panel="synthetic-dummy"]')).not.toBeNull();

        startLive();
        expect(fakeBroker.subscribed).toContain(SYNTHETIC_TOPIC);

        act(() => {
            fakeBroker.publish(SYNTHETIC_TOPIC, { time: 1000, physio_id: SYNTHETIC_ID, value: 1.25, device_id: 'synthetic' });
            fakeBroker.publish(SYNTHETIC_TOPIC, [
                { time: 1000.004, physio_id: SYNTHETIC_ID, value: -0.5 },
                { time: 1000.008, physio_id: SYNTHETIC_ID, value: null },
            ]);
            // Positive control: a core id on a core topic still reaches core's store.
            fakeBroker.publish('mp50/VitalSigns', { time: 1000, physio_id: 'NOM_PULS_OXIM_SAT_O2', value: 42 });
        });

        // One frame per message, samples and timestamps exactly as sent.
        expect(receivedFrames).toEqual([
            { topic: SYNTHETIC_TOPIC, samples: [{ time: 1000, physio_id: SYNTHETIC_ID, value: 1.25, device_id: 'synthetic' }] },
            { topic: SYNTHETIC_TOPIC, samples: [
                { time: 1000.004, physio_id: SYNTHETIC_ID, value: -0.5 },
                { time: 1000.008, physio_id: SYNTHETIC_ID, value: null },
            ] },
        ]);
        expect(screen.getByTestId('dummy-panel').textContent).toBe('3 samples');

        const store = dashboardProbe.dataRef?.current ?? {};
        expect(store.NOM_PULS_OXIM_SAT_O2?.y).toEqual([42]);
        expect(store[SYNTHETIC_ID]).toBeUndefined();
        const charted = [...container.querySelectorAll('[data-core-chart]')].map(el => el.getAttribute('data-core-chart'));
        expect(charted.length).toBeGreaterThan(0);
        expect(charted.join(',')).not.toContain(SYNTHETIC_ID);
        expect(container.innerHTML).not.toContain(SYNTHETIC_ID);
    });
});
