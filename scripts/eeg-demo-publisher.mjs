// Standalone synthetic-EEG publisher -> demo/HF-EEG (never mp50/*, so the worker
// never records it). Run while capturing screenshots, Ctrl-C to stop.
import mqtt from 'mqtt';
const BROKER = process.env.BROKER || 'ws://192.168.1.188:8083/mqtt';
const TOPIC = 'demo/HF-EEG';
const eeg = (t) =>
  +(18*Math.sin(2*Math.PI*2*t) + 8*Math.sin(2*Math.PI*6*t) +
    12*Math.sin(2*Math.PI*10*t) + 5*Math.sin(2*Math.PI*20*t) +
    (Math.random()-0.5)*8).toFixed(2);
const client = mqtt.connect(BROKER, { connectTimeout: 8000 });
client.on('connect', () => {
  console.log('publishing synthetic EEG ->', TOPIC);
  setInterval(() => {
    const now = Date.now() / 1000;
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.008;
      client.publish(TOPIC, JSON.stringify({
        time: t, physio_id: 'NOM_EEG_ELEC_POTL_CRTX', value: eeg(t), device_id: 'demo',
      }));
    }
  }, 48);
});
client.on('error', (e) => console.error('mqtt error', e.message));
