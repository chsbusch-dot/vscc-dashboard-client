// Test-only stand-ins for rendering the dashboard in jsdom: a fake MQTT broker
// connection, a chart stub that lists the ids core would draw, and a probe that
// exposes core's data store. Kept free of AppLayout imports so vi.mock factories
// can load it without an import cycle.
import { createElement, useEffect } from 'react';
import { useDashboard } from '../data/DashboardContext';

type Handler = (...args: unknown[]) => void;

export const fakeBroker = {
    subscribed: [] as string[],
    handlers: new Map<string, Handler>(),
    reset() {
        fakeBroker.subscribed = [];
        fakeBroker.handlers.clear();
    },
    emit(event: string, ...args: unknown[]) {
        fakeBroker.handlers.get(event)?.(...args);
    },
    publish(topic: string, message: unknown) {
        fakeBroker.emit('message', topic, Buffer.from(JSON.stringify(message)));
    },
};

const fakeClient = {
    connected: true,
    on(event: string, handler: Handler) {
        fakeBroker.handlers.set(event, handler);
        return fakeClient;
    },
    subscribe(topic: string, _opts?: unknown, cb?: (err: Error | null) => void) {
        fakeBroker.subscribed.push(topic);
        cb?.(null);
        return fakeClient;
    },
    unsubscribe(_topic: string, cb?: (err?: Error) => void) {
        cb?.();
        return fakeClient;
    },
    end() {
        return fakeClient;
    },
};

export const mqttModule = { default: { connect: () => fakeClient } };

export const chartContainerModule = {
    default: ({ physioIds }: { physioIds: string[] }) =>
        createElement('div', { 'data-core-chart': physioIds.join(',') }),
};

export const dashboardProbe: { dataRef?: ReturnType<typeof useDashboard>['dataRef'] } = {};

export const DataProbe = () => {
    const { dataRef } = useDashboard();
    useEffect(() => { dashboardProbe.dataRef = dataRef; }, [dataRef]);
    return null;
};
