# MP50 Vital Sign Dashboard

> ⚠️ **Research and education use only — not a medical device.** This software is not
> FDA/CE cleared and must not be used for clinical diagnosis, monitoring, or treatment decisions.

Real-time physiological telemetry dashboard for the **Philips MP50** patient monitor.
Captured waveforms and numerics (ECG, SpO₂, Pleth, Respiration, EEG, NIBP) are streamed
into a React + [SciChart.js](https://www.scichart.com/) WebGL canvas and rendered at 60 FPS.

This is the **frontend** of the [VSCapture-Charts](https://github.com/chsbusch-dot/vscc-dashboard-client)
system. It consumes data published by the .NET capture service and Python MQTT/TimescaleDB
backend (see the `vscc-mqtt-server` repository).

![MP50 Vital Sign Dashboard](docs/screenshots/dashboard-full.png)

---

## Features

- **Live MQTT streaming** over WebSocket (`mqtt` client) with per-channel topic mapping
- **High-frequency waveforms** — Pleth and Respiration rendered as continuous traces, plus ECG/EEG channels
- **Numeric vitals** — SpO₂, pulse rate, NIBP (systolic/diastolic/mean), respiration rate, heart rate
- **Multiple data sources** — live MQTT broker, URL polling, and local file upload / replay of recorded exports
- **Synchronized zoom & pan** across all charts (`GlobalSyncGroup`)
- **FIFO-bounded series** so long sessions don't leak memory
- **Auto-scroll / follow-live** toggle, adjustable time window, and per-channel selection

### Waveforms & numerics

![Waveform and numeric charts](docs/screenshots/chart-grid.png)

> The screenshots above show SpO₂ and pulse trends, a raw plethysmograph pulse waveform, and a
> respiration trace from recorded MP50 data, alongside an EEG channel. (The MP50 in this setup does
> not output EEG, so the EEG trace is a generated demo signal.)

---

## Getting started

**Prerequisites:** Node.js 20+ and npm.

```bash
npm install        # install dependencies
npm run dev        # Vite dev server with HMR (binds --host for LAN access)
```

The dashboard defaults to the MQTT broker at `ws://192.168.1.188:8083/mqtt`. Open
**Configure Data Source** in the sidebar to point it at your broker, switch providers
(MQTT / URL / WebSocket / File Upload), and map each waveform to its topic or file.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) + production build — **the authoritative CI gate** |
| `npm run lint` | ESLint with type-aware rules |
| `npm run test` | Vitest unit tests |
| `npm run preview` | Serve the production build locally |

---

## Data sources

| Provider | How it works |
| --- | --- |
| **MQTT Broker** | Subscribes to per-channel topics (e.g. `mp50/VitalSigns`, `mp50/HF-PLETH`) over WebSocket. High-frequency channels are buffered and flushed in batches. |
| **URL (Polling)** | Periodically fetches a JSON export (e.g. `DataExportVSC.json`) over HTTP. |
| **WebSocket** | Direct WS stream (reserved/experimental). |
| **File Upload** | Replays recorded exports — JSON numerics and chunk-streamed `*WaveExport.csv` waveform files — entirely in the browser. |

Each channel is mapped independently, so you can mix sources (e.g. live MQTT vitals while replaying a recorded waveform).

---

## Architecture

| File | Responsibility |
| --- | --- |
| `src/data/DashboardContext.tsx` | Central state (`useReducer` + Context); default endpoints, channel mappings, toggles |
| `src/data/constants.ts` | `PHYSIO_META` — metadata (label, unit, group, color) for every physiological ID |
| `src/components/Sidebar.tsx` | Data-source controls, channel selection, MQTT/upload connection lifecycle |
| `src/components/DataSourceModal.tsx` | Provider + per-channel topic/file mapping UI |
| `src/components/AppLayout.tsx` | Layout and chart grouping |
| `src/components/ChartContainer.tsx` | Primary waveform rendering (gold-standard SciChart lifecycle) |
| `src/components/AdvancedCharts.tsx` | Raw Pleth / Respiration waveform charts |
| `src/hooks/useSciChart.ts` | SciChart surface lifecycle hook |
| `src/utils/dataParser.ts` | JSON export → `TelemetryRecord[]` parsing |

**Stack:** React 19 · TypeScript 5.9 · Vite 7 · SciChart.js 5 · MUI 7 · mqtt.js 5.

---

## ⚠️ The imperative chart boundary

`ChartContainer.tsx`, `AdvancedCharts.tsx`, and `useSciChart.ts` form an **imperative WebGL boundary**
and are intentionally exempt from some React/ESLint rules. When working in these files:

- **Do not** put chart data in `useState` or add chart variables to `useEffect` dependency arrays.
- **Do not** remove the intentional ESLint overrides (`react-hooks/exhaustive-deps`, `react-hooks/purity`,
  `@typescript-eslint/no-floating-promises`) — they protect the chart lifecycle.
- **Do not** enable React `StrictMode` — SciChart WebGL contexts are limited (~8–16 per browser) and
  double-mounting destroys the app.
- **Do** use `appendRange()` for streaming, set `fifoCapacity` on real-time series, and normalize the
  X-axis to Unix epoch **seconds** (`Date.getTime() / 1000`).

---

## SciChart license

SciChart Community Edition expires every **6 months** and charts will show a license error after expiry. Refresh with:

```bash
npm install scichart@latest && npm install
```

---

## PHI awareness

This system processes medical telemetry that may be HIPAA/HITRUST classified. **Do not** add
`console.log()` statements that emit patient data or raw physiological payloads.
