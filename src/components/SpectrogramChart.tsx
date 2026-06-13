import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Stack, Typography, Chip, Tooltip } from '@mui/material';
import { useDashboard } from '../data/DashboardContext';
import { hann, powerSpectrum, bandPowers, spectralEdge, EEG_BANDS } from '../utils/stft';

const EEG_ID = 'NOM_EEG_ELEC_POTL_CRTX';
const FS = 128;          // EEG sample rate (Hz)
const FFT = 256;         // window length → 0.5 Hz resolution, 2 s window
const HOP_MS = 1000;     // one spectrogram column per second
const F_MAX = 30;        // display 0–30 Hz (δ/θ/α/β)
const COLS = 180;        // ~3 min of history
const DYN_DB = 4;        // colour dynamic range, decades of power

const BAND_COLORS: Record<string, string> = {
    delta: '#1976D2', theta: '#2E7D32', alpha: '#F57C00', beta: '#D32F2F',
};

interface Column { power: Float64Array; sef: number; bands: Record<string, number>; }

/** Perceptual blue→cyan→green→yellow→red ramp for the heatmap. */
function colormap(t: number): [number, number, number] {
    const stops: Array<[number, [number, number, number]]> = [
        [0.0, [25, 25, 80]], [0.35, [20, 130, 170]], [0.6, [60, 190, 90]],
        [0.8, [240, 210, 50]], [1.0, [210, 50, 40]],
    ];
    for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
            const [t0, c0] = stops[i - 1];
            const [t1, c1] = stops[i];
            const f = (t - t0) / (t1 - t0 || 1);
            return [
                Math.round(c0[0] + f * (c1[0] - c0[0])),
                Math.round(c0[1] + f * (c1[1] - c0[1])),
                Math.round(c0[2] + f * (c1[2] - c0[2])),
            ];
        }
    }
    return stops[stops.length - 1][1];
}

/**
 * Live EEG spectrogram: STFT of the EEG channel rendered as a scrolling heatmap
 * (time × frequency, colour = log power), with the 95% spectral-edge frequency
 * overlaid and a δ/θ/α/β band-power strip beneath. Pure canvas — no SciChart.
 * Research/education only.
 */
const SpectrogramChart: React.FC = () => {
    const { subscribeToData, state, actions } = useDashboard();

    // The dashboard only subscribes to a channel's MQTT topic when its waveform
    // toggle is on, so enable EEG while the spectrogram is shown and restore the
    // prior state on unmount (don't clobber a user who already had it on).
    useEffect(() => {
        const wasOn = state.globalWaveformToggles.EEG;
        if (!wasOn) actions.setGlobalWaveformToggle('EEG', true);
        return () => { if (!wasOn) actions.setGlobalWaveformToggle('EEG', false); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const samplesRef = useRef<number[]>([]);
    const colsRef = useRef<Column[]>([]);
    const winRef = useRef<Float64Array>(hann(FFT));
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [live, setLive] = useState(false);
    const [latest, setLatest] = useState<Column | null>(null);

    // Accumulate live EEG samples (in arrival = acquisition order).
    useEffect(() => {
        const unsub = subscribeToData((records) => {
            if (records === 'clear') { samplesRef.current = []; colsRef.current = []; return; }
            for (const r of records) {
                if (r.physio_id === EEG_ID && r.value !== null && r.value !== undefined) {
                    samplesRef.current.push(r.value);
                }
            }
            const cap = FFT * 8;
            if (samplesRef.current.length > cap) {
                samplesRef.current.splice(0, samplesRef.current.length - cap);
            }
        });
        return unsub;
    }, [subscribeToData]);

    // Compute one STFT column per HOP_MS and redraw.
    useEffect(() => {
        const kMax = Math.floor((F_MAX * FFT) / FS);
        const tick = () => {
            if (samplesRef.current.length < FFT) { setLive(false); return; }
            setLive(true);
            const power = powerSpectrum(samplesRef.current, FFT, winRef.current);
            const col: Column = { power, sef: spectralEdge(power, FFT, FS), bands: bandPowers(power, FFT, FS) };
            colsRef.current.push(col);
            if (colsRef.current.length > COLS) colsRef.current.shift();
            setLatest(col);
            draw(kMax);
        };
        const id = window.setInterval(tick, HOP_MS);
        const onResize = () => draw(kMax);
        window.addEventListener('resize', onResize);
        return () => { window.clearInterval(id); window.removeEventListener('resize', onResize); };
    }, []);

    function draw(kMax: number) {
        const canvas = canvasRef.current;
        const cols = colsRef.current;
        if (!canvas || !cols.length) return;
        const W = canvas.clientWidth, H = canvas.clientHeight;
        if (!W || !H) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const padL = 26, padB = 14, bandH = 46;
        const hx = padL, hy = 0, hw = W - padL, hh = Math.max(20, H - padB - bandH);
        const freqBins = kMax + 1;

        // Normalise log-power across the visible window.
        let maxLP = -Infinity;
        for (const c of cols) for (let k = 0; k <= kMax; k++) {
            const lp = Math.log10(c.power[k] + 1e-9);
            if (lp > maxLP) maxLP = lp;
        }
        const minLP = maxLP - DYN_DB;
        const span = maxLP - minLP || 1;

        // Heatmap → ImageData(cols × freqBins), low freq at the bottom.
        const img = ctx.createImageData(cols.length, freqBins);
        for (let c = 0; c < cols.length; c++) {
            for (let b = 0; b <= kMax; b++) {
                const t = Math.max(0, Math.min(1, (Math.log10(cols[c].power[b] + 1e-9) - minLP) / span));
                const [r, g, bl] = colormap(t);
                const idx = ((freqBins - 1 - b) * cols.length + c) * 4;
                img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = bl; img.data[idx + 3] = 255;
            }
        }
        const off = document.createElement('canvas');
        off.width = cols.length; off.height = freqBins;
        off.getContext('2d')?.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, hx, hy, hw, hh);

        // Spectral-edge line.
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        cols.forEach((c, i) => {
            const x = hx + ((i + 0.5) / cols.length) * hw;
            const y = hy + hh * (1 - Math.min(c.sef, F_MAX) / F_MAX);
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();

        // Frequency axis.
        ctx.fillStyle = '#555'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        for (const f of [0, 10, 20, 30]) {
            const y = hy + hh * (1 - f / F_MAX);
            ctx.fillText(String(f), padL - 4, Math.min(hh - 1, Math.max(8, y + 3)));
        }

        // Band-power strip beneath (δ/θ/α/β, normalised together).
        const sy = hy + hh + padB;
        let bmax = 1e-9;
        for (const c of cols) for (const [n] of EEG_BANDS) bmax = Math.max(bmax, c.bands[n]);
        for (const [n] of EEG_BANDS) {
            ctx.strokeStyle = BAND_COLORS[n];
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            cols.forEach((c, i) => {
                const x = hx + ((i + 0.5) / cols.length) * hw;
                const y = sy + bandH * (1 - c.bands[n] / bmax);
                if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            });
            ctx.stroke();
        }
        ctx.fillStyle = '#888'; ctx.textAlign = 'left';
        ctx.fillText('band power', hx + 2, sy + 10);
    }

    const totalBand = latest ? EEG_BANDS.reduce((s, [n]) => s + latest.bands[n], 0) || 1 : 1;

    return (
        <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle1">EEG Spectrogram</Typography>
                {latest && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Tooltip title="95% spectral edge frequency">
                            <Chip size="small" variant="outlined" label={`SEF95 ${latest.sef.toFixed(1)} Hz`} />
                        </Tooltip>
                        {EEG_BANDS.map(([n]) => (
                            <Tooltip key={n} title={`${n} (${(100 * latest.bands[n] / totalBand).toFixed(0)}%)`}>
                                <Chip size="small" label={n[0].toUpperCase()}
                                    sx={{ bgcolor: BAND_COLORS[n], color: '#fff', fontWeight: 600, width: 26 }} />
                            </Tooltip>
                        ))}
                    </Stack>
                )}
            </Stack>
            <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                {!live && (
                    <Typography variant="body2" color="text.secondary"
                        sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        Waiting for EEG signal…
                    </Typography>
                )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                STFT of {EEG_ID} · {FFT}-pt Hann @ {FS} Hz · research/education only
            </Typography>
        </Paper>
    );
};

export default SpectrogramChart;
