// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../components/AppLayout';
import { DashboardProvider } from '../data/DashboardContext';
import { addonPanels, addonTopics } from './index';
import { DataProbe, dashboardProbe, fakeBroker } from './testHarness';

// No vi.mock('vscc-addons'): the entry point resolves to the no-op src/addons/none.ts.
vi.mock('mqtt', async () => (await import('./testHarness')).mqttModule);
vi.mock('scichart', () => ({ SciChartVerticalGroup: class {} }));
vi.mock('../components/ChartContainer', async () => (await import('./testHarness')).chartContainerModule);
vi.mock('../components/AdvancedCharts', () => ({ default: () => null }));

const CORE_TOPICS = ['mp50/VitalSigns', 'mp50/HF-ECG', 'mp50/HF-PLETH', 'mp50/HF-RESP'];

describe('add-on panel hook with the no-op default', () => {
    beforeEach(() => {
        fakeBroker.reset();
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('leaves the render and the live subscriptions as they were', () => {
        expect(addonPanels).toEqual([]);
        expect(addonTopics).toEqual([]);

        const { container } = render(<DashboardProvider><AppLayout /><DataProbe /></DashboardProvider>);
        const main = container.querySelector('main');
        expect(main?.querySelector('[data-addon-slot]')).toBeNull();
        // The main area still ends with core's charts: the slot added nothing after them.
        expect(main?.querySelectorAll('[data-core-chart]').length).toBeGreaterThan(0);
        expect(main?.lastElementChild?.hasAttribute('data-core-chart')).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /play live/i }));
        act(() => fakeBroker.emit('connect'));
        expect(new Set(fakeBroker.subscribed)).toEqual(new Set(CORE_TOPICS));

        const before = main?.innerHTML;
        act(() => {
            fakeBroker.publish('synthetic/HF-ADDON', { time: 1000, physio_id: 'SYN_ADDON_WAVE', value: 1 });
        });
        expect(main?.innerHTML).toBe(before);
        expect(dashboardProbe.dataRef?.current.SYN_ADDON_WAVE).toBeUndefined();
    });
});
