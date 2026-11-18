// @vitest-environment jsdom
// WOR-1328: an add-on family lists as one block in the menu and charts as one block,
// its panels right after its charts, while everything outside it keeps its order.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../components/AppLayout';
import { PHYSIO_META } from '../data/constants';
import { DashboardProvider } from '../data/DashboardContext';
import { SERIES_IDS } from '../data/signalMeta';
import { FAM_ONE, FAM_TWO, PLAIN } from './familyAddons.fixture';

vi.mock('vscc-addons', () => import('./familyAddons.fixture'));
vi.mock('mqtt', async () => (await import('./testHarness')).mqttModule);
vi.mock('scichart', () => ({ SciChartVerticalGroup: class {} }));
vi.mock('../components/ChartContainer', async () => (await import('./testHarness')).chartContainerModule);
vi.mock('../components/AdvancedCharts', async () => {
    const { createElement } = await import('react');
    return { default: () => createElement('div', { 'data-wave-charts': '' }) };
});

const CORE_IDS = Object.keys(PHYSIO_META);
const WAVES = 'waves';

const renderDashboard = () => render(<DashboardProvider><AppLayout /></DashboardProvider>).container;

/** The main area top to bottom: each chart by its ids, the wave block, each panel by id. */
const mainOrder = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-core-chart], [data-wave-charts], [data-addon-panel]')].map(el =>
        el.getAttribute('data-core-chart') ?? el.getAttribute('data-addon-panel') ?? WAVES);

const menuNames = () =>
    within(screen.getByRole('list', { name: 'Series' })).getAllByRole('listitem').map(li => li.textContent);

/** An in-memory localStorage: the test runner's global one is not a full Storage. */
const memoryStorage = () => {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, value); },
        removeItem: (key: string) => { items.delete(key); },
    };
};

describe('add-on families (WOR-1328)', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', memoryStorage());
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('lists the family as one block in the menu, the rest in registration order', () => {
        expect(SERIES_IDS).toEqual([...CORE_IDS, FAM_ONE, FAM_TWO, PLAIN]);
        renderDashboard();
        expect(menuNames().slice(-3)).toEqual(['Family One', 'Family Two', 'Plain']);
    });

    it('charts the family under the waves, its panel right after, everything else in place', () => {
        const root = renderDashboard();
        fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
        const order = mainOrder(root);
        const waves = order.indexOf(WAVES);
        // Above the waves: the core charts, then the plain add-on series, as before.
        expect(order.slice(0, waves).flatMap(c => c.split(','))).toEqual([...CORE_IDS, PLAIN]);
        // Under them: the family's charts and its panel, then the panel outside it.
        expect(order.slice(waves + 1)).toEqual([FAM_ONE, FAM_TWO, 'family-panel', 'plain-panel']);
    });

    it('keeps the family panel next to the waves when no family series is selected', () => {
        const root = renderDashboard();
        expect(mainOrder(root).slice(-3)).toEqual([WAVES, 'family-panel', 'plain-panel']);
    });

    it('applies a saved layout by id, whatever order its ids were stored in', () => {
        const selected = Object.fromEntries([PLAIN, FAM_TWO, FAM_ONE, ...CORE_IDS].map(id => [id, false]));
        Object.assign(selected, { [FAM_TWO]: true, [PLAIN]: true, [FAM_ONE]: true, NOM_RESP_RATE: true });
        localStorage.setItem('vscc.layouts', JSON.stringify({ Saved: { selectedPhysioIds: selected } }));

        const root = renderDashboard();
        fireEvent.click(screen.getByRole('button', { name: 'Saved layouts' }));
        fireEvent.click(screen.getByText('Saved'));

        expect(mainOrder(root)).toEqual(['NOM_RESP_RATE', PLAIN, WAVES, FAM_ONE, FAM_TWO, 'family-panel', 'plain-panel']);
    });
});
