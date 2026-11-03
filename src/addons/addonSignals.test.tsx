// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../components/AppLayout';
import SessionsDrawer from '../components/SessionsDrawer';
import { PHYSIO_META } from '../data/constants';
import { DashboardProvider } from '../data/DashboardContext';
import { SERIES_IDS, signalMeta } from '../data/signalMeta';
import { getClinicalColor } from '../utils/colors';
import { isCommunitySignal, signalDisplayLabel } from '../utils/sessionFormat';
import { DataProbe, dashboardProbe, fakeBroker } from './testHarness';
import { SYNTHETIC_ID, SYNTHETIC_SIGNAL_ID, SYNTHETIC_WAVE_ID } from './syntheticAddons.fixture';

vi.mock('vscc-addons', () => import('./syntheticAddons.fixture'));
vi.mock('mqtt', async () => (await import('./testHarness')).mqttModule);
vi.mock('scichart', () => ({ SciChartVerticalGroup: class {} }));
vi.mock('../components/ChartContainer', async () => (await import('./testHarness')).chartContainerModule);
vi.mock('../components/AdvancedCharts', () => ({ default: () => null }));
vi.mock('../data/sessionsApi', async (importOriginal) => ({
    ...await importOriginal<typeof import('../data/sessionsApi')>(),
    fetchSessions: vi.fn(() => Promise.resolve([
        { id: 1, label: 'Synthetic', subject_code: null, notes: null, started_at: 1000, ended_at: 1060, recording: false },
    ])),
    fetchSessionSignals: vi.fn(() => Promise.resolve({
        numerics: ['NOM_PULS_OXIM_SAT_O2', SYNTHETIC_SIGNAL_ID, 'SYN_UNREGISTERED'],
        waveforms: [SYNTHETIC_ID],
    })),
}));

const CORE_IDS = Object.keys(PHYSIO_META) as (keyof typeof PHYSIO_META)[];

const menuNames = () =>
    within(screen.getByRole('list', { name: 'Series' })).getAllByRole('listitem').map(li => li.textContent);

describe('add-on signals', () => {
    beforeEach(() => {
        fakeBroker.reset();
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('merges the registered series after the core ones, a core id keeping its core metadata', () => {
        expect(SERIES_IDS).toEqual([...CORE_IDS, SYNTHETIC_SIGNAL_ID, SYNTHETIC_WAVE_ID]);
        expect(signalMeta(SYNTHETIC_SIGNAL_ID)).toEqual({ name: 'Synthetic Index', unit: 'syn', group: 'Synthetic Group', color: '#123456' });
        expect(signalMeta('NOM_PULS_OXIM_SAT_O2')).toBe(PHYSIO_META.NOM_PULS_OXIM_SAT_O2);
        expect(getClinicalColor(SYNTHETIC_SIGNAL_ID)).toBe('#123456');
        expect(signalDisplayLabel(SYNTHETIC_SIGNAL_ID)).toBe('Synthetic Index');
        expect(isCommunitySignal(SYNTHETIC_SIGNAL_ID)).toBe(true);
        // A panel's waveform id is still not a series: only `signals` registers one.
        expect(isCommunitySignal(SYNTHETIC_ID)).toBe(false);
        expect(signalMeta('SYN_UNREGISTERED')).toBeUndefined();
    });

    it('lists the series in the live menu and charts it from a core topic', () => {
        const { container } = render(<DashboardProvider><AppLayout /><DataProbe /></DashboardProvider>);
        expect(menuNames()).toEqual([...CORE_IDS.map(id => PHYSIO_META[id].name), 'Synthetic Index', 'Synthetic Wave']);
        const charted = () => [...container.querySelectorAll('[data-core-chart]')].map(el => el.getAttribute('data-core-chart'));
        expect(charted()).not.toContain(SYNTHETIC_SIGNAL_ID);

        fireEvent.click(screen.getByText('Synthetic Index'));
        expect(charted()).toContain(SYNTHETIC_SIGNAL_ID);

        fireEvent.click(screen.getByRole('button', { name: /play live/i }));
        act(() => fakeBroker.emit('connect'));
        act(() => {
            fakeBroker.publish('mp50/VitalSigns', { time: 1000, physio_id: SYNTHETIC_SIGNAL_ID, value: 7 });
        });
        expect(dashboardProbe.dataRef?.current[SYNTHETIC_SIGNAL_ID]?.y).toEqual([7]);
    });

    it('shows the series in the session legend and still hides unregistered ids', async () => {
        render(<DashboardProvider><SessionsDrawer open onClose={() => {}} /></DashboardProvider>);
        expect(await screen.findByText('Synthetic Index')).toBeTruthy();
        await waitFor(() => expect(screen.getByText(PHYSIO_META.NOM_PULS_OXIM_SAT_O2.name)).toBeTruthy());
        expect(screen.queryByText('SYN_UNREGISTERED')).toBeNull();
        expect(screen.queryByText(SYNTHETIC_ID)).toBeNull();
    });
});
