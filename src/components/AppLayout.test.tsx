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
const BASIC = 'Basic Vitals';
const ADVANCED = 'Advanced Charts';

const renderDashboard = () => render(<DashboardProvider><AppLayout /></DashboardProvider>).container;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
// A tab's accessible name gains ", items selected" while it is marked, so match on the start.
const clickTab = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
const toggleWave = (label: string) => fireEvent.click(screen.getByRole('checkbox', { name: label }));
const toggleFirstSeries = () =>
    fireEvent.click(within(screen.getByRole('list', { name: 'Series' })).getAllByRole('listitem')[0]);
const coreCharts = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-core-chart]')].flatMap(el => el.getAttribute('data-core-chart')?.split(',') ?? []);
const waveCharts = (root: HTMLElement) => root.querySelector('[data-wave-charts]')?.getAttribute('data-wave-charts') ?? null;

/** Whether a tab carries its "items selected" mark. The accessible name and the dot must agree. */
const tabMarked = (label: string) => {
    const marked = screen.queryByRole('button', { name: `${label}, items selected` });
    const plain = screen.queryByRole('button', { name: label });
    expect((marked === null) !== (plain === null)).toBe(true);
    const button = marked ?? plain;
    expect(button?.querySelector('[data-selected-dot]') != null).toBe(marked !== null);
    return marked !== null;
};

describe('sidebar tabs mark a selection, Select All / Deselect All stay per tab', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('marks Basic Vitals with one series selected and clears the mark with none', () => {
        const root = renderDashboard();
        expect(tabMarked(BASIC)).toBe(true);

        click('Deselect All');
        expect(tabMarked(BASIC)).toBe(false);

        toggleFirstSeries();
        expect(coreCharts(root)).toEqual([SERIES_IDS[0]]);
        expect(tabMarked(BASIC)).toBe(true);

        toggleFirstSeries();
        expect(tabMarked(BASIC)).toBe(false);
    });

    it('marks Advanced Charts with one wave chart on and clears the mark with none', () => {
        const root = renderDashboard();
        expect(tabMarked(ADVANCED)).toBe(true);

        clickTab(ADVANCED);
        WAVE_LABELS.forEach(toggleWave);
        expect(waveCharts(root)).toBeNull();
        expect(tabMarked(ADVANCED)).toBe(false);

        toggleWave('Raw ECG Waveform');
        expect(waveCharts(root)).toBe('ecg');
        expect(tabMarked(ADVANCED)).toBe(true);

        toggleWave('Raw ECG Waveform');
        expect(tabMarked(ADVANCED)).toBe(false);
    });

    it('Deselect All leaves the Advanced Charts mark and the wave charts as they were', () => {
        const root = renderDashboard();
        clickTab(ADVANCED);
        toggleWave('Raw ECG Waveform');
        expect(waveCharts(root)).toBe('rawPleth,resp');

        clickTab(BASIC);
        click('Deselect All');

        expect(root.querySelector('[data-core-chart]')).toBeNull();
        expect(tabMarked(BASIC)).toBe(false);
        expect(tabMarked(ADVANCED)).toBe(true);
        expect(waveCharts(root)).toBe('rawPleth,resp');
        clickTab(ADVANCED);
        expect(WAVE_LABELS.map(label => screen.getByRole<HTMLInputElement>('checkbox', { name: label }).checked))
            .toEqual([true, false, true]);
    });

    it('Select All marks Basic Vitals only and leaves wave charts switched off', () => {
        const root = renderDashboard();
        clickTab(ADVANCED);
        WAVE_LABELS.forEach(toggleWave);
        clickTab(BASIC);
        click('Deselect All');
        expect(tabMarked(BASIC)).toBe(false);
        expect(tabMarked(ADVANCED)).toBe(false);

        click('Select All');

        expect(new Set(coreCharts(root))).toEqual(new Set(SERIES_IDS));
        expect(tabMarked(BASIC)).toBe(true);
        expect(tabMarked(ADVANCED)).toBe(false);
        expect(waveCharts(root)).toBeNull();
    });

    it('shows the empty-state message only while no chart at all renders', () => {
        const root = renderDashboard();
        click('Deselect All');

        // Wave charts alone: no message.
        expect(waveCharts(root)).toBe(ALL_WAVES);
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();

        // All three off as well: the area is empty, the message shows.
        clickTab(ADVANCED);
        WAVE_LABELS.forEach(toggleWave);
        expect(waveCharts(root)).toBeNull();
        expect(screen.getByText(EMPTY_STATE)).toBeTruthy();

        // One wave chart alone: no message.
        toggleWave('Raw PLETH Waveform');
        expect(waveCharts(root)).toBe('rawPleth');
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();
        toggleWave('Raw PLETH Waveform');
        expect(screen.getByText(EMPTY_STATE)).toBeTruthy();

        // One series alone: no message.
        clickTab(BASIC);
        toggleFirstSeries();
        expect(coreCharts(root)).toEqual([SERIES_IDS[0]]);
        expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    });
});
