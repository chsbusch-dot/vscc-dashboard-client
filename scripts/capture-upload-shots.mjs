// Drives the dashboard's file-UPLOAD mode against recorded VSCapture exports to
// produce README screenshots — no live feed needed. Vitals/PLETH/RESP are the
// real recorded files; EEG is a synthetic WaveExport (the monitor records no EEG).
// Run from vscc-dashboard-client/:  APP_URL=http://localhost:5199 node scripts/capture-upload-shots.mjs
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const APP_URL = process.env.APP_URL || 'http://localhost:5199';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DATA = path.resolve('.capture-data/shifted');
const OUT = 'docs/screenshots';

// Files keyed by accordion index: 0 VitalSigns, 1 ECG, 2 EEG, 3 Pleth, 4 Resp
const FILES = {
  0: path.join(DATA, 'DataExportVSC.json'),
  2: path.join(DATA, 'NOM_EEG_ELEC_POTL_CRTXWaveExport.csv'),
  3: path.join(DATA, 'NOM_PLETHWaveExport.csv'),
  4: path.join(DATA, 'NOM_RESPWaveExport.csv'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text, tag = 'button') {
  const h = await page.evaluateHandle((t, tg) => {
    return [...document.querySelectorAll(tg)].find((e) => e.textContent.trim().toUpperCase().includes(t.toUpperCase())) || null;
  }, text, tag);
  const el = h.asElement();
  if (!el) throw new Error('no element with text: ' + text);
  await el.click();
  return el;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1680,1300'],
    defaultViewport: { width: 1680, height: 1300, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text()); });
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);

  // Open config, switch provider to Local File Upload.
  await clickByText(page, 'CONFIGURE DATA SOURCE');
  await sleep(600);
  await page.evaluate(() => {
    const combo = document.querySelector('[role="combobox"]');
    combo && combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // MUI opens on mousedown
  });
  await sleep(400);
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('li[role="option"], .MuiMenuItem-root')]
      .find((li) => li.textContent.includes('Local File Upload'));
    item && item.click();
  });
  await sleep(500);

  // Turn HF EEG on (switch index 2) so its upload row appears.
  await page.evaluate(() => {
    const sw = [...document.querySelectorAll('.MuiAccordion-root input[type="checkbox"]')];
    if (sw[2] && !sw[2].checked) sw[2].click();
  });
  await sleep(600);

  // Attach files: one hidden file input per expanded accordion.
  for (const [idx, file] of Object.entries(FILES)) {
    const handle = await page.evaluateHandle((i) => {
      const acc = [...document.querySelectorAll('.MuiAccordion-root')][i];
      return acc ? acc.querySelector('input[type="file"]') : null;
    }, Number(idx));
    const input = handle.asElement();
    if (!input) { console.warn('[warn] no file input for accordion', idx); continue; }
    await input.uploadFile(file);
    console.log('[file] accordion', idx, '<-', path.basename(file));
    await sleep(150);
  }
  await sleep(400);

  // Apply -> switches dataSource to upload and kicks off processing.
  // In upload mode the primary button reads "Upload Data".
  await clickByText(page, 'UPLOAD DATA');
  console.log('[load] processing uploads...');
  await sleep(1200);

  // Select the EEG waveform channel so it gets a chart.
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find((x) => x.textContent.includes('MMS EEG Wave'));
    const cb = li && li.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
  });

  // Give the chunked CSV loader time to stream the files in.
  await sleep(9000);

  await page.screenshot({ path: `${OUT}/dashboard-full.png`, fullPage: false });
  const main = await page.$('main');
  if (main) await main.screenshot({ path: `${OUT}/chart-grid.png` });
  console.log('[done] screenshots written to', OUT);

  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
