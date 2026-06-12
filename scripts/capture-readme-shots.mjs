// One-off tooling: drives a real Chrome against the live dashboard to capture
// README screenshots. Publishes a SYNTHETIC EEG trace to a separate `demo/HF-EEG`
// topic (never `mp50/*`) so the made-up data is never recorded into TimescaleDB
// by the worker. Not part of the app build. Run from vscc-dashboard-client/:
//   node scripts/capture-readme-shots.mjs
import puppeteer from 'puppeteer-core';
import mqtt from 'mqtt';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const BROKER = process.env.BROKER || 'ws://192.168.1.188:8083/mqtt';
const EEG_TOPIC = 'demo/HF-EEG';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'docs/screenshots';

// --- Synthetic EEG generator: sum of physiological bands + jitter, in microvolts ---
function eegSample(t) {
  const delta = 18 * Math.sin(2 * Math.PI * 2 * t);
  const theta = 8 * Math.sin(2 * Math.PI * 6 * t);
  const alpha = 12 * Math.sin(2 * Math.PI * 10 * t);
  const beta = 5 * Math.sin(2 * Math.PI * 20 * t);
  const noise = (Math.random() - 0.5) * 8;
  return +(delta + theta + alpha + beta + noise).toFixed(2);
}

const client = mqtt.connect(BROKER, { connectTimeout: 8000 });
let pub;
client.on('connect', () => {
  console.log('[eeg] publishing synthetic EEG ->', EEG_TOPIC);
  // ~125 Hz: burst of ~6 samples every 48 ms
  pub = setInterval(() => {
    const now = Date.now() / 1000;
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.008;
      client.publish(EEG_TOPIC, JSON.stringify({
        time: t,
        physio_id: 'NOM_EEG_ELEC_POTL_CRTX',
        value: eegSample(t),
        device_id: 'demo',
      }));
    }
  }, 48);
});
client.on('error', (e) => console.error('[eeg] mqtt error', e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setReactInput(page, selector, value) {
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('input not found: ' + sel);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

// click a button found by visible text
async function clickByText(page, text, tag = 'button') {
  const handle = await page.evaluateHandle((t, tg) => {
    const els = [...document.querySelectorAll(tg)];
    return els.find((e) => e.textContent.trim().toUpperCase().includes(t.toUpperCase())) || null;
  }, text, tag);
  const el = handle.asElement();
  if (!el) throw new Error('no element with text: ' + text);
  await el.click();
  return el;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1680,1050'],
    defaultViewport: { width: 1680, height: 1050, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') console.log('[page error]', t);
    else if (t.includes('subscrib') || t.includes('EEG')) console.log('[page]', t);
  });
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);

  // 1) Open the data-source modal and turn on the HF EEG toggle. The EEG channel
  // already defaults to the demo/HF-EEG topic (see DashboardContext), so no topic
  // edit is needed here.
  await clickByText(page, 'CONFIGURE DATA SOURCE');
  await sleep(700);
  await page.evaluate(() => {
    const switches = [...document.querySelectorAll('.MuiAccordion-root input[type="checkbox"]')];
    const eeg = switches[2]; // order: VitalSigns, ECG, EEG, Pleth, Resp
    if (eeg && !eeg.checked) eeg.click();
  });
  await sleep(500);
  await clickByText(page, 'APPLY CONFIGURATION');
  await sleep(800);

  // 2) Select the EEG waveform channel so it gets its own chart.
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('li')];
    const eegWave = items.find((li) => li.textContent.includes('MMS EEG Wave'));
    const cb = eegWave && eegWave.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
  });
  await sleep(400);

  // 3) Start streaming.
  await clickByText(page, 'PLAY LIVE');
  console.log('[shot] streaming... letting buffers fill');
  await sleep(9000);

  // Full dashboard
  await page.screenshot({ path: `${OUT}/dashboard-full.png`, fullPage: false });

  // Chart grid only (the <main> region)
  const main = await page.$('main');
  if (main) await main.screenshot({ path: `${OUT}/chart-grid.png` });

  console.log('[done] screenshots written to', OUT);
  await browser.close();
  clearInterval(pub);
  client.end(true);
  process.exit(0);
})().catch((e) => { console.error(e); clearInterval(pub); client.end(true); process.exit(1); });
