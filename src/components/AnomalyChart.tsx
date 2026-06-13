import React, { useEffect, useRef, useState } from 'react';
import { Box, Chip, FormControl, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useDashboard } from '../data/DashboardContext';
import { PHYSIO_META, type PhysioId } from '../data/constants';
import { getClinicalColor } from '../utils/colors';
import { formatChartTime } from '../utils/timeFormat';
import { rollingZScores, anomalyRuns } from '../utils/anomaly';

/** Preferred default channels, in priority order, when several numerics stream. */
const PREFERRED: string[] = [
    'NOM_PLETH_PULS_RATE',
    'NOM_PULS_OXIM_SAT_O2',
    'NOM_ECG_CARD_BEAT_RATE',
    'NOM_RESP_RATE',
];

/**
 * High-frequency waveform channels — excluded from the picker because z-scoring
 * a 125 Hz waveform against a trailing window is meaningless. Everything else in
 * the data buffer is treated as a numeric trend.
 */
const WAVEFORM_IDS = new Set<string>([
    'NOM_PLETH', 'NOM_RESP', 'NOM_PLETH_WAVE_A',
    'NOM_ECG_ELEC_POTL_II', 'NOM_ECG_ELEC_POTL_I', 'NOM_ECG_ELEC_POTL_V',
    'NOM_EEG_ELEC_POTL_CRTX',
]);

const WINDOW_S = 300;      // display the trailing 5 minutes
const STATS_WINDOW = 24;   // trailing samples used to estimate mean/std
const MIN_SAMPLES = 12;    // history needed before any point can be flagged
const THRESHOLD = 3;       // |z| ≥ 3 → anomaly
const REDRAW_MS = 1000;

const PAD = { top: 12, right: 14, bottom: 22, left: 48 };

const labelFor = (id: string): string => (id in PHYSIO_META ? PHYSIO_META[id as PhysioId].name : id);
const unitFor = (id: string): string => (id in PHYSIO_META ? PHYSIO_META[id as PhysioId].unit : '');

/**
 * Rolling z-score anomaly monitor for a numeric trend, drawn on a 2D canvas
 * (no SciChart/WebGL). The channel list is discovered live from whatever
 * numerics are streaming, so it adapts to the monitor's setup (SpO₂, ECG,
 * EEG/BIS…). Each reading is scored against its trailing window; stretches
 * where |z| ≥ 3 are shaded red and the points outlined.
 */
const AnomalyChart: React.FC = () => {
    const { dataRef, state } = useDashboard();
    const [available, setAvailable] = useState<string[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [latest, setLatest] = useState<{ value: number; z: number; anomalies: number } | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const availableRef = useRef<string[]>([]);
    const selectedRef = useRef(selected);
    const timeDisplayRef = useRef(state.timeDisplay);
    useEffect(() => { selectedRef.current = selected; }, [selected]);
    useEffect(() => { timeDisplayRef.current = state.timeDisplay; }, [state.timeDisplay]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let timer = 0;

        const discoverChannels = () => {
            const ids = Object.keys(dataRef.current)
                .filter((id) => !WAVEFORM_IDS.has(id) && (dataRef.current[id]?.x.length ?? 0) > 0)
                .sort();
            if (ids.join('|') !== availableRef.current.join('|')) {
                availableRef.current = ids;
                setAvailable(ids);
            }
            if (ids.length > 0 && !ids.includes(selectedRef.current)) {
                const pick = PREFERRED.find((p) => ids.includes(p)) ?? ids[0];
                selectedRef.current = pick;
                setSelected(pick);
            }
        };

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const cssW = wrap.clientWidth;
            const cssH = wrap.clientHeight;
            if (cssW === 0 || cssH === 0) return;
            if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
                canvas.width = Math.round(cssW * dpr);
                canvas.height = Math.round(cssH * dpr);
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);

            const id = selectedRef.current;
            const series = id ? dataRef.current[id] : undefined;
            const plotW = cssW - PAD.left - PAD.right;
            const plotH = cssH - PAD.top - PAD.bottom;

            // Collect the trailing WINDOW_S of finite samples.
            const raw: { t: number; v: number }[] = [];
            if (series && series.x.length > 0) {
                const tEnd = series.x[series.x.length - 1];
                const tStart = tEnd - WINDOW_S;
                for (let i = 0; i < series.x.length; i++) {
                    const v = series.y[i];
                    if (v === null || v === undefined || Number.isNaN(v)) continue;
                    if (series.x[i] < tStart) continue;
                    raw.push({ t: series.x[i], v });
                }
            }

            if (raw.length < MIN_SAMPLES) {
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.font = '13px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const what = id ? labelFor(id) : 'numeric';
                ctx.fillText(`Waiting for ${what} data…`, cssW / 2, cssH / 2);
                setLatest((p) => (p === null ? p : null));
                return;
            }

            const scored = rollingZScores(raw, { window: STATS_WINDOW, threshold: THRESHOLD, minSamples: MIN_SAMPLES });
            const runs = anomalyRuns(scored);

            // Y range from values and the ±threshold·std envelope, padded 8%.
            let lo = Infinity, hi = -Infinity;
            for (const s of scored) {
                lo = Math.min(lo, s.v, s.std > 0 ? s.mean - THRESHOLD * s.std : s.v);
                hi = Math.max(hi, s.v, s.std > 0 ? s.mean + THRESHOLD * s.std : s.v);
            }
            if (lo === hi) { lo -= 1; hi += 1; }
            const span = hi - lo;
            lo -= span * 0.08; hi += span * 0.08;

            const tEnd = scored[scored.length - 1].t;
            const tStart = tEnd - WINDOW_S;
            const xOf = (t: number) => PAD.left + ((t - tStart) / WINDOW_S) * plotW;
            const yOf = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
            const unit = unitFor(id);
            const decimals = unit === '%' ? 0 : 1;

            // Plot frame + y gridlines/labels.
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1;
            ctx.font = '10px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (let g = 0; g <= 4; g++) {
                const v = lo + ((hi - lo) * g) / 4;
                const y = yOf(v);
                ctx.beginPath();
                ctx.moveTo(PAD.left, y);
                ctx.lineTo(cssW - PAD.right, y);
                ctx.stroke();
                ctx.fillText(v.toFixed(decimals), PAD.left - 6, y);
            }

            // X time labels (left / mid / right edges).
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (const frac of [0, 0.5, 1]) {
                const t = tStart + WINDOW_S * frac;
                const x = PAD.left + plotW * frac;
                ctx.fillText(formatChartTime(t, timeDisplayRef.current), x, cssH - PAD.bottom + 5);
            }

            // Normal-band envelope: mean ± threshold·std as a translucent ribbon.
            ctx.beginPath();
            for (let i = 0; i < scored.length; i++) {
                const s = scored[i];
                const top = s.std > 0 ? s.mean + THRESHOLD * s.std : s.v;
                const x = xOf(s.t), y = yOf(top);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            for (let i = scored.length - 1; i >= 0; i--) {
                const s = scored[i];
                const bot = s.std > 0 ? s.mean - THRESHOLD * s.std : s.v;
                ctx.lineTo(xOf(s.t), yOf(bot));
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(120,144,156,0.14)';
            ctx.fill();

            // Red shading behind each anomalous stretch.
            ctx.fillStyle = 'rgba(211,47,47,0.16)';
            for (const [a, b] of runs) {
                const x1 = xOf(scored[a].t);
                const x2 = xOf(scored[b].t);
                ctx.fillRect(x1 - 1.5, PAD.top, Math.max(3, x2 - x1 + 3), plotH);
            }

            // Trend line.
            ctx.beginPath();
            ctx.lineWidth = 1.75;
            ctx.strokeStyle = getClinicalColor(id);
            for (let i = 0; i < scored.length; i++) {
                const x = xOf(scored[i].t);
                const y = yOf(scored[i].v);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Anomaly point markers.
            ctx.fillStyle = '#d32f2f';
            for (const s of scored) {
                if (!s.anomaly) continue;
                ctx.beginPath();
                ctx.arc(xOf(s.t), yOf(s.v), 3, 0, Math.PI * 2);
                ctx.fill();
            }

            const last = scored[scored.length - 1];
            const anomalyCount = scored.reduce((n, s) => n + (s.anomaly ? 1 : 0), 0);
            setLatest({ value: last.v, z: last.z, anomalies: anomalyCount });
        };

        const tick = () => {
            discoverChannels();
            draw();
            timer = window.setTimeout(tick, REDRAW_MS) as unknown as number;
        };
        tick();

        const ro = new ResizeObserver(() => draw());
        ro.observe(wrap);

        return () => {
            window.clearTimeout(timer);
            ro.disconnect();
        };
    }, [dataRef]);

    const unit = unitFor(selected);
    const decimals = unit === '%' ? 0 : 1;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                    <Select
                        value={available.includes(selected) ? selected : ''}
                        displayEmpty
                        onChange={(e) => { selectedRef.current = e.target.value; setSelected(e.target.value); }}
                        aria-label="Anomaly monitor channel"
                    >
                        {available.length === 0 && (
                            <MenuItem value="" disabled>No numeric channels yet</MenuItem>
                        )}
                        {available.map((id) => (
                            <MenuItem key={id} value={id}>
                                {labelFor(id)}{unitFor(id) ? ` (${unitFor(id)})` : ''}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {latest && (
                    <>
                        <Chip
                            size="small"
                            variant="outlined"
                            label={`now ${latest.value.toFixed(decimals)}${unit ? ` ${unit}` : ''}  ·  z ${latest.z.toFixed(1)}`}
                        />
                        <Chip
                            size="small"
                            color={latest.anomalies > 0 ? 'error' : 'success'}
                            variant={latest.anomalies > 0 ? 'filled' : 'outlined'}
                            label={latest.anomalies > 0 ? `${latest.anomalies} anomalous` : 'in range'}
                        />
                    </>
                )}
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" color="text.secondary">
                    |z| ≥ {THRESHOLD} vs trailing {STATS_WINDOW} samples
                </Typography>
            </Stack>
            <Box ref={wrapRef} sx={{ flexGrow: 1, width: '100%', minHeight: 0, position: 'relative' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </Box>
        </Box>
    );
};

export default AnomalyChart;
