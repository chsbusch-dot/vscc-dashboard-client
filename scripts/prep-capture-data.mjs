// Preprocess recorded VSCapture exports for screenshotting: shift timestamps so
// the recording ends "now" (otherwise the waveform charts pin to wall-clock now and
// the 16:32 data scrolls off-screen), and re-space the bunched waveform samples to
// their true rate so they render as smooth traces. Writes into .capture-data/shifted/.
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('.capture-data');
const OUT = path.join(DATA, 'shifted');
fs.mkdirSync(OUT, { recursive: true });

const nowMs = Date.now();
const pad = (n, w = 2) => String(n).padStart(w, '0');
const fmt = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
};

// --- Waveforms: take the last `seconds` of real values, re-space at `hz`, end at now ---
function reWaveform(inFile, outFile, hz, seconds) {
  const raw = fs.readFileSync(path.join(DATA, inFile), 'utf8');
  const lines = raw.split(/\r?\n/);
  const vals = [];
  for (const line of lines) {
    const t = line.replace(/^﻿/, '').trim();
    if (!t) continue;
    const parts = t.split(',');
    if (parts.length < 4) continue;
    const v = parseFloat(parts[3]);
    if (!Number.isNaN(v)) vals.push(v);
  }
  const dt = 1000 / hz;
  const need = Math.min(vals.length, Math.round(hz * seconds));
  const slice = vals.slice(vals.length - need);
  const out = slice.map((v, i) => {
    const ms = Math.round(nowMs - (slice.length - 1 - i) * dt);
    const ts = fmt(ms);
    return `${ts},0,${ts},${v},`;
  });
  fs.writeFileSync(path.join(OUT, outFile), out.join('\n') + '\n');
  console.log(`${outFile}: ${out.length} samples @ ${hz}Hz (from ${vals.length} recorded)`);
}

// --- Synthetic EEG: clean band-sum trace ending now ---
function genEEG(outFile, hz, seconds) {
  const dt = 1000 / hz;
  const n = Math.round(hz * seconds);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ms = Math.round(nowMs - (n - 1 - i) * dt);
    const t = ms / 1000;
    const v = (18 * Math.sin(2 * Math.PI * 2 * t) + 8 * Math.sin(2 * Math.PI * 6 * t) +
      12 * Math.sin(2 * Math.PI * 10 * t) + 5 * Math.sin(2 * Math.PI * 20 * t) +
      (Math.random() - 0.5) * 8).toFixed(2);
    const ts = fmt(ms);
    out.push(`${ts},0,${ts},${v},`);
  }
  fs.writeFileSync(path.join(OUT, outFile), out.join('\n') + '\n');
  console.log(`${outFile}: ${n} synthetic EEG samples @ ${hz}Hz`);
}

// --- Numerics JSON: shift every timestamp by the same offset (last record -> now) ---
function shiftNumerics(inFile, outFile) {
  const raw = fs.readFileSync(path.join(DATA, inFile), 'utf8').replace(/^﻿/, '').trim();
  const records = JSON.parse(`[${raw.replace(/\]\s*\[/g, '],[')}]`).flat();
  const parseTs = (s) => {
    const m = s && s.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!m) return null;
    const [, d, mo, y, h, mi, se, ms] = m;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, ms ? +ms.padEnd(3, '0') : 0);
  };
  let maxTs = 0;
  for (const r of records) { const t = parseTs(r.Timestamp || r.SystemLocalTime); if (t && t > maxTs) maxTs = t; }
  const offset = nowMs - maxTs;
  for (const r of records) {
    for (const key of ['Timestamp', 'SystemLocalTime']) {
      const t = parseTs(r[key]);
      if (t) r[key] = fmt(t + offset);
    }
  }
  fs.writeFileSync(path.join(OUT, outFile), JSON.stringify(records));
  console.log(`${outFile}: ${records.length} numerics shifted by ${(offset / 1000).toFixed(0)}s`);
}

reWaveform('NOM_PLETHWaveExport.csv', 'NOM_PLETHWaveExport.csv', 125, 120);
reWaveform('NOM_RESPWaveExport.csv', 'NOM_RESPWaveExport.csv', 62, 120);
genEEG('NOM_EEG_ELEC_POTL_CRTXWaveExport.csv', 125, 120);
shiftNumerics('DataExportVSC.json', 'DataExportVSC.json');
console.log('done -> ' + OUT);
