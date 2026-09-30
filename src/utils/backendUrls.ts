/** Where the dashboard reaches the vscc-mqtt-server backend. */
export interface BackendUrls {
    /** Prefix for the worker REST API paths (`/api/...`); '' = same origin. */
    apiBase: string;
    /** Streamer raw numerics JSON (URL-polling data source). */
    jsonUrl: string;
    /** Streamer websocket (websocket data source). */
    websocketUrl: string;
    /** EMQX MQTT-over-WebSocket endpoint (default data source). */
    mqttBrokerUrl: string;
}

/** The parts of window.location the URLs are derived from. */
export interface PageLocation {
    protocol: string;
    host: string;
}

/**
 * Resolve the backend endpoints.
 *
 * Same-origin mode sends everything through the origin the page came from, so
 * a reverse proxy in front of the stack routes `/api/*` (worker), `/mqtt`
 * (EMQX websocket) and `/DataExportVSC.json` + `/ws/stream` (streamer). It is
 * forced whenever the page is served over HTTPS: browsers block `http://` and
 * `ws://` requests from an https page (mixed content), and a cookie-based SSO
 * gate in front of the proxy only sees same-origin requests. It can also be
 * asked for explicitly (`sameOrigin`) behind a plain-http proxy.
 *
 * Otherwise the classic single-/two-host install applies: the backend host on
 * its published ports (worker 8001, streamer 8000, EMQX websocket 8083).
 */
export function resolveBackendUrls(page: PageLocation, backendHost: string, sameOrigin = false): BackendUrls {
    if (sameOrigin || page.protocol === 'https:') {
        const ws = page.protocol === 'https:' ? 'wss:' : 'ws:';
        return {
            apiBase: '',
            jsonUrl: '/DataExportVSC.json',
            websocketUrl: `${ws}//${page.host}/ws/stream`,
            mqttBrokerUrl: `${ws}//${page.host}/mqtt`,
        };
    }
    return {
        apiBase: `http://${backendHost}:8001`,
        jsonUrl: `http://${backendHost}:8000/DataExportVSC.json`,
        websocketUrl: `ws://${backendHost}:8000/ws/stream`,
        mqttBrokerUrl: `ws://${backendHost}:8083/mqtt`,
    };
}
