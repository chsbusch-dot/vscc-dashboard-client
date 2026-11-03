// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from './AppLayout';
import { DashboardProvider } from '../data/DashboardContext';
import { SERIES_IDS } from '../data/signalMeta';

vi.mock('mqtt', async () => (await import('../addons/testHarness')).mqttModule);
vi.mock('scichart', () => ({ SciChartVerticalGroup: class {} }));
vi.mock('./ChartContainer', async () => (await import('../addons/testHarness')).chartContainerModule);
// Stands in for the wave charts and lists which of the three it was asked to draw.
vi.mock('./AdvancedCharts', async () => {
    const { createElement } = await import('react');
    return {
        default: ({ showRawPleth, showEcg, showResp }: { showRawPleth: boolean; showEcg: boolean; showResp: boolean }) =>
            createElement('div', {
                'data-wave-charts': [showRawPleth && 'rawPleth', showEcg && 'ecg', showResp && 'resp'].filter(Boolean).join(','),
            }),
    };
});

const EMPTY_STATE = 'No data types selected.';
const ALL_WAVES = 'rawPleth,ecg,resp';
const WAVE_LABELS = ['Raw PLETH Waveform', 'Raw ECG Waveform', 'Respiration Waveform'];

const renderDashboard = () => render(<DashboardProvider><AppLayout /></DashboardProvider>).container;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const coreCharts = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-core-chart]')].flatMap(el => el.getAttribute('data-core-chart')?.split(',') ?? []);
const waveCharts = (root: HTMLElement) => root.querySelector('[data-wave-charts]')?.getAttribute('data-wave-charts') ?? null;

describe('Select All / Deselect All cover the wave charts', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('Deselect All leaves the chart area empty', () => {
        const root = renderDashboard();
        expect(coreCharts(root).length).toBeGreaterThan(0);
        expect(waveCharts(root)).toBe(ALL_WAVES);
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();

        click('Deselect All');

        expect(root.querySelector('[data-core-chart]')).toBeNull();
        expect(root.querySelector('[data-wave-charts]')).toBeNull();
        expect(screen.getByText(EMPTY_STATE)).toBeTruthy();
    });

    it('Select All brings back every series and all three wave charts', () => {
        const root = renderDashboard();
        click('Deselect All');
        click('Select All');

        expect(new Set(coreCharts(root))).toEqual(new Set(SERIES_IDS));
        expect(waveCharts(root)).toBe(ALL_WAVES);
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    });

    it('a wave chart switched off by hand comes back with Select All', () => {
        const root = renderDashboard();
        click('Advanced Charts');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Raw ECG Waveform' }));
        expect(waveCharts(root)).toBe('rawPleth,resp');

        click('Basic Vitals');
        click('Deselect All');
        click('Advanced Charts');
        // The Advanced Charts tab shows the cleared flags.
        for (const label of WAVE_LABELS) {
            expect(screen.getByRole<HTMLInputElement>('checkbox', { name: label }).checked).toBe(false);
        }

        click('Basic Vitals');
        click('Select All');
        expect(waveCharts(root)).toBe(ALL_WAVES);
        click('Advanced Charts');
        for (const label of WAVE_LABELS) {
            expect(screen.getByRole<HTMLInputElement>('checkbox', { name: label }).checked).toBe(true);
        }
    });

    it('shows the empty-state message only while no chart at all renders', () => {
        const root = renderDashboard();
        click('Deselect All');

        // One wave chart alone: no message.
        click('Advanced Charts');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Raw PLETH Waveform' }));
        expect(waveCharts(root)).toBe('rawPleth');
        expect(root.querySelector('[data-core-chart]')).toBeNull();
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();

        // Off again: the area is empty, the message is back.
        fireEvent.click(screen.getByRole('checkbox', { name: 'Raw PLETH Waveform' }));
        expect(screen.getByText(EMPTY_STATE)).toBeTruthy();

        // One series alone: no message.
        click('Basic Vitals');
        const firstSeries = within(screen.getByRole('list', { name: 'Series' })).getAllByRole('listitem')[0];
        fireEvent.click(firstSeries);
        expect(coreCharts(root)).toEqual([SERIES_IDS[0]]);
        expect(root.querySelector('[data-wave-charts]')).toBeNull();
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    });
});
