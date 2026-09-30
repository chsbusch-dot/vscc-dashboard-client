import { describe, it, expect } from 'vitest';
import { resolveBackendUrls } from './backendUrls';

describe('resolveBackendUrls', () => {
    it('keeps the classic host:port endpoints for a plain-http page', () => {
        expect(resolveBackendUrls({ protocol: 'http:', host: '192.168.1.50' }, '192.168.1.50')).toEqual({
            apiBase: 'http://192.168.1.50:8001',
            jsonUrl: 'http://192.168.1.50:8000/DataExportVSC.json',
            websocketUrl: 'ws://192.168.1.50:8000/ws/stream',
            mqttBrokerUrl: 'ws://192.168.1.50:8083/mqtt',
        });
    });

    it('targets a separate backend host on plain http (two-host install)', () => {
        const urls = resolveBackendUrls({ protocol: 'http:', host: 'dash.local' }, '10.0.0.7');
        expect(urls.apiBase).toBe('http://10.0.0.7:8001');
        expect(urls.mqttBrokerUrl).toBe('ws://10.0.0.7:8083/mqtt');
    });

    it('goes same-origin with wss on an https page, whatever the backend host says', () => {
        expect(resolveBackendUrls({ protocol: 'https:', host: 'vscc.lan.example.com' }, '10.0.0.7')).toEqual({
            apiBase: '',
            jsonUrl: '/DataExportVSC.json',
            websocketUrl: 'wss://vscc.lan.example.com/ws/stream',
            mqttBrokerUrl: 'wss://vscc.lan.example.com/mqtt',
        });
    });

    it('keeps a non-default port in the same-origin websocket URLs', () => {
        const urls = resolveBackendUrls({ protocol: 'https:', host: 'proxy.example.com:8443' }, 'x');
        expect(urls.mqttBrokerUrl).toBe('wss://proxy.example.com:8443/mqtt');
    });

    it('can be asked for same-origin behind a plain-http proxy (ws, not wss)', () => {
        const urls = resolveBackendUrls({ protocol: 'http:', host: 'localhost:8080' }, 'localhost', true);
        expect(urls.apiBase).toBe('');
        expect(urls.mqttBrokerUrl).toBe('ws://localhost:8080/mqtt');
        expect(urls.websocketUrl).toBe('ws://localhost:8080/ws/stream');
    });
});
