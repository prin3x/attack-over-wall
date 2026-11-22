// Subtle background music: an original little chiptune loop, synthesized with WebAudio.
// Soft triangle bass + quiet arpeggio + a sparse lead, all through a low-pass filter at low volume.

const BPM = 92;
const EIGHTH = 60 / BPM / 2;
const VOLUME = 0.045;

// 8 bars, 8 eighth notes each. Chords: C - Am - F - G, twice.
const CHORDS = [
  [48, [60, 64, 67]], [45, [57, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]],
  [48, [60, 64, 67]], [45, [57, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]],
];
const _ = null;
const MELODY = [
  [72, _, 76, _, 79, 76, _, _],
  [76, _, 72, _, 69, _, _, _],
  [69, _, 72, 74, 72, _, 69, _],
  [67, _, 71, _, 74, _, 71, _],
  [79, _, 77, 76, _, 74, 72, _],
  [72, _, 69, _, 72, _, 76, _],
  [77, _, 76, 74, 72, _, 69, _],
  [74, _, 71, _, 67, _, _, _],
];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

let ctx = null;
let bus = null;
let timer = null;
let step = 0;       // eighth-note counter
let nextTime = 0;   // when the next eighth plays (AudioContext time)
let muted = false;

function note(midi, t, d, type, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz(midi), t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + d + 0.02);
}

function schedule(k, t) {
  const bar = Math.floor(k / 8) % 8;
  const i = k % 8;
  const loop = Math.floor(k / 64);
  const [root, triad] = CHORDS[bar];
  if (i === 0 || i === 4) note(root, t, EIGHTH * 3.5, 'triangle', 0.9);          // bass
  if (i === 6) note(root + 7, t, EIGHTH * 1.5, 'triangle', 0.5);
  note(triad[ARP[i]] + 12, t, EIGHTH * 0.9, 'triangle', 0.18);                   // arpeggio
  const m = MELODY[bar][i];
  if (m !== null && loop % 2 === 0) note(m, t, EIGHTH * 1.8, 'square', 0.12);   // lead (every other loop)
}

function tick() {
  while (nextTime < ctx.currentTime + 0.25) {
    schedule(step++, nextTime);
    nextTime += EIGHTH;
  }
}

export const music = {
  /** Start looping (needs an AudioContext that a user gesture has unlocked). */
  start(audioCtx) {
    if (timer) return;
    ctx = audioCtx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    bus = ctx.createGain();
    bus.gain.value = muted ? 0 : VOLUME;
    bus.connect(filter).connect(ctx.destination);
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(tick, 100);
  },
  setMuted(m) {
    muted = m;
    if (bus) bus.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.05);
  },
};
