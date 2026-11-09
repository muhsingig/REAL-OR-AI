// Tiny synthesized sounds for the big screen: no audio files to load.
import { store } from './net.js';

let ctx = null;
let muted = store.get('roa:muted') ?? false;

function audio() {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  store.set('roa:muted', value);
}

function tone({ freq, to = freq, dur, gain = 0.2, type = 'sine', delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur, gain = 0.3, cutoff = 900 }) {
  const ac = audio();
  if (!ac) return;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  g.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

export const sfx = {
  unlock: () => audio(),
  stamp() {
    tone({ freq: 150, to: 38, dur: 0.32, gain: 0.7 });
    noise({ dur: 0.12, gain: 0.45, cutoff: 700 });
  },
  pop: () => tone({ freq: 520, to: 880, dur: 0.09, gain: 0.12, type: 'triangle' }),
  tick: () => tone({ freq: 1100, dur: 0.04, gain: 0.06, type: 'square' }),
  lock: () => tone({ freq: 320, to: 260, dur: 0.07, gain: 0.1, type: 'triangle' }),
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.28, gain: 0.14, type: 'triangle', delay: i * 0.12 }));
  },
};
