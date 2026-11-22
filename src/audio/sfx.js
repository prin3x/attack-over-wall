// Retro bleeps generated with WebAudio (no audio files needed).
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2 = null, d = 0.1, type = 'square', v = 0.12, delay = 0 }) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + d + 0.02);
}

function noise({ d = 0.15, v = 0.2, cutoff = 1500 }) {
  if (muted) return;
  const a = ac();
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = v;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  unlock() { ac(); },
  toggleMute() { muted = !muted; return muted; },
  select() { tone({ f: 660, d: 0.05, v: 0.08 }); },
  move() { tone({ f: 440, d: 0.03, v: 0.05 }); },
  throw() { tone({ f: 220, f2: 900, d: 0.15, v: 0.07 }); },
  hit() { noise({ d: 0.15 }); tone({ f: 180, f2: 60, d: 0.2, v: 0.14 }); },
  crit() { this.hit(); tone({ f: 880, d: 0.08, v: 0.08, delay: 0.08 }); tone({ f: 1320, d: 0.12, v: 0.08, delay: 0.16 }); },
  wall() { tone({ f: 130, f2: 50, d: 0.18, type: 'triangle', v: 0.35 }); noise({ d: 0.08, cutoff: 600 }); },
  ground() { noise({ d: 0.12, v: 0.12, cutoff: 800 }); },
  turn() { tone({ f: 523, d: 0.06, v: 0.06 }); tone({ f: 784, d: 0.08, v: 0.06, delay: 0.07 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, d: 0.16, v: 0.09, delay: i * 0.13 })); },
};

Object.assign(sfx, {
  pickup() { [660, 880, 1320].forEach((f, i) => tone({ f, d: 0.08, v: 0.07, delay: i * 0.06 })); },
  use() { tone({ f: 330, f2: 990, d: 0.12, type: 'triangle', v: 0.15 }); },
  squeak() { tone({ f: 1400, f2: 900, d: 0.1, type: 'sine', v: 0.15 }); tone({ f: 1500, d: 0.05, type: 'sine', v: 0.1, delay: 0.08 }); },
  sneeze() { tone({ f: 500, f2: 900, d: 0.15, type: 'sawtooth', v: 0.05 }); noise({ d: 0.25, v: 0.25, cutoff: 4000 }); },
  block() { tone({ f: 900, f2: 300, d: 0.15, type: 'square', v: 0.08 }); },
  boom() {
    noise({ d: 0.9, v: 0.6, cutoff: 900 });
    noise({ d: 0.25, v: 0.35, cutoff: 3000 });
    tone({ f: 120, f2: 30, d: 0.7, type: 'sawtooth', v: 0.25 });
    tone({ f: 60, f2: 25, d: 0.9, type: 'sine', v: 0.4 });
  },
  nuke() {
    noise({ d: 2.2, v: 0.8, cutoff: 500 });
    noise({ d: 0.5, v: 0.5, cutoff: 4000 });
    tone({ f: 90, f2: 20, d: 2.0, type: 'sawtooth', v: 0.3 });
    tone({ f: 45, f2: 18, d: 2.4, type: 'sine', v: 0.5 });
  },
  combo() { [523, 784, 1047, 1568].forEach((f, i) => tone({ f, d: 0.1, v: 0.09, delay: i * 0.05 })); },
  quack() { tone({ f: 700, f2: 400, d: 0.12, type: 'sawtooth', v: 0.08 }); tone({ f: 650, f2: 380, d: 0.1, type: 'sawtooth', v: 0.06, delay: 0.1 }); },
  whoosh() { noise({ d: 1.2, v: 0.25, cutoff: 900 }); tone({ f: 200, f2: 600, d: 0.6, type: 'sawtooth', v: 0.04 }); tone({ f: 600, f2: 180, d: 0.6, type: 'sawtooth', v: 0.04, delay: 0.6 }); },
  taunt() { [784, 659, 880, 659].forEach((f, i) => tone({ f, d: 0.11, type: 'triangle', v: 0.1, delay: i * 0.12 })); },
  freeze() { [1568, 1319, 1047, 1568].forEach((f, i) => tone({ f, d: 0.08, type: 'triangle', v: 0.08, delay: i * 0.05 })); noise({ d: 0.3, v: 0.12, cutoff: 6000 }); },
  zap() { noise({ d: 0.35, v: 0.45, cutoff: 7000 }); tone({ f: 1800, f2: 120, d: 0.3, type: 'sawtooth', v: 0.12 }); },
  splash() { noise({ d: 0.3, v: 0.3, cutoff: 1800 }); tone({ f: 500, f2: 200, d: 0.15, type: 'sine', v: 0.1 }); },
  sizzle() { noise({ d: 0.6, v: 0.2, cutoff: 5000 }); },
  lock() { [0, 0.09, 0.18].forEach((d) => tone({ f: 1760, d: 0.06, type: 'square', v: 0.07, delay: d })); },
  deny() { tone({ f: 150, d: 0.08, v: 0.08 }); },
});
