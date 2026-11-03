// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { SciChartVerticalGroup } from 'scichart';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartContainer from '../components/ChartContainer';
import { PHYSIO_META } from '../data/constants';
import type { PhysioId } from '../data/constants';
import { DashboardProvider, useDashboard } from '../data/DashboardContext';
import { SYNTHETIC_SIGNAL_ID, SYNTHETIC_WAVE_ID } from './syntheticAddons.fixture';

// The real ChartContainer on a recording stand-in for SciChart: every object
// it builds keeps its constructor options, so the test reads axis titles,
// strokes and the tooltip template off the fake surface.
const sci = vi.hoisted(() => {
    class Collection {
        items: Record<string, unknown>[] = [];
        add = (...added: Record<string, unknown>[]) => { this.items.push(...added); };
        clear = () => { this.items = []; };
        get = (i: number) => this.items[i];
    }
    class NumberRange {
        min: number;
        max: number;
        constructor(min: number, max: number) {
            this.min = min;
            this.max = max;
        }
        get diff() { return this.max - this.min; }
    }
    const recorder = (kind: string) => class {
        kind = kind;
        constructor(...args: unknown[]) {
            Object.assign(this, args[args.length - 1]);
        }
        appended: unknown[][] = [];
        clear() {}
        appendRange(...args: unknown[]) { this.appended.push(args); }
        count() { return 0; }
    };
    const surface = {
        xAxes: new Collection(),
        yAxes: new Collection(),
        renderableSeries: new Collection(),
        chartModifiers: new Collection(),
        annotations: new Collection(),
        suspendUpdates() {},
        resumeUpdates() {},
    };
    const module = {
        NumberRange,
        SciChartVerticalGroup: class {},
        SmartDateLabelProvider: recorder('SmartDateLabelProvider'),
        DateTimeNumericAxis: recorder('DateTimeNumericAxis'),
        NumericAxis: recorder('NumericAxis'),
        XyDataSeries: recorder('XyDataSeries'),
        FastLineRenderableSeries: recorder('FastLineRenderableSeries'),
        BoxAnnotation: recorder('BoxAnnotation'),
        ZoomPanModifier: recorder('ZoomPanModifier'),
        ZoomExtentsModifier: recorder('ZoomExtentsModifier'),
        RolloverModifier: recorder('RolloverModifier'),
        ENumericFormat: { Date_HHMMSS: 'Date_HHMMSS' },
        EAutoRange: { Always: 'Always' },
        ECoordinateMode: { Relative: 'Relative' },
        EAnnotationLayer: { Background: 'Background' },
    };
    return { surface, module, chart: { sciChartSurface: surface, wasmContext: {} } };
});

vi.mock('vscc-addons', () => import('./syntheticAddons.fixture'));
vi.mock('scichart', () => sci.module);
vi.mock('../hooks/useSciChart', () => ({ useSciChart: () => sci.chart }));
vi.mock('../utils/symmetricWheelZoomModifier', () => ({ SymmetricWheelZoomModifier: class {} }));
vi.mock('../utils/chartTimeAxis', () => ({ applyTimeDisplayToLabelProvider: () => {}, refreshSurfaceTimeLabels: () => {} }));

type TooltipTemplate = (info: { xValue: number; yValue: number; seriesName: string }) => string[];

const probe: { actions?: ReturnType<typeof useDashboard>['actions'] } = {};
const ActionsProbe = () => {
    const { actions } = useDashboard();
    useEffect(() => { probe.actions = actions; }, [actions]);
    return null;
};

describe('ChartContainer with an add-on series', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('labels, colours and titles the series from the add-on metadata', () => {
        render(
            <DashboardProvider>
                <ChartContainer groupName="Synthetic Group" physioIds={[SYNTHETIC_SIGNAL_ID]} verticalGroup={{} as SciChartVerticalGroup} />
            </DashboardProvider>,
        );

        expect(screen.getByText('Synthetic Index')).toBeTruthy();
        expect(sci.surface.yAxes.items.map(axis => axis.axisTitle)).toEqual(['syn']);
        expect(sci.surface.renderableSeries.items.map(series => series.stroke)).toEqual(['#123456']);

        const rollover = sci.surface.chartModifiers.items.find(modifier => modifier.kind === 'RolloverModifier');
        const template = rollover?.tooltipDataTemplate as TooltipTemplate;
        expect(template({ xValue: 1000, yValue: 2, seriesName: SYNTHETIC_SIGNAL_ID })[1]).toBe('Synthetic Index: 2.00 syn');
        // Positive control: a core id still reads its core unit through the same template.
        const core = PHYSIO_META.NOM_PULS_OXIM_SAT_O2;
        expect(template({ xValue: 1000, yValue: 2, seriesName: 'NOM_PULS_OXIM_SAT_O2' })[1]).toBe(`${core.name}: 2.00 ${core.unit}`);
    });

    it('draws live samples of an add-on wave, a null sample as a gap', () => {
        render(
            <DashboardProvider>
                <ActionsProbe />
                <ChartContainer groupName="Synthetic Wave Group" physioIds={[SYNTHETIC_WAVE_ID]} verticalGroup={{} as SciChartVerticalGroup} />
            </DashboardProvider>,
        );
        const wave = sci.surface.renderableSeries.items.find(series => series.stroke === '#654321');
        const appended = (wave?.dataSeries as { appended: unknown[][] } | undefined)?.appended;
        expect(appended).toEqual([]);

        const physio_id = SYNTHETIC_WAVE_ID as PhysioId;
        act(() => probe.actions?.appendData([
            { time: 1000, physio_id, value: 0.5, device_id: 'synthetic' },
            { time: 1000.004, physio_id, value: null, device_id: 'synthetic' },
            { time: 1000.008, physio_id, value: -0.25, device_id: 'synthetic' },
        ]));
        expect(appended).toEqual([[[1000, 1000.004, 1000.008], [0.5, Number.NaN, -0.25]]]);
    });
});
