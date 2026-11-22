import { Pix } from './pixel.js';
import { W, H, GROUND_Y, WALL } from '../core/constants.js';
import { ITEMS } from '../core/items/index.js';

const OUTLINE = '#1c1220';
const WHITE = '#ffffff';
export const FRAMES = ['idle0', 'idle1', 'windup', 'throw', 'hurt', 'win'];

// ---------- Biscuit the dog (drawn facing right) ----------
function drawDog(f) {
  const p = new Pix(28, 24, 2, 0);
  const B = '#c07a3c', D = '#83502a', L = '#f2d3a0', N = OUTLINE, R = '#dc3c3c', T = '#ef6f8f';
  const bob = f === 'idle1' ? 1 : 0;
  const hy = 9 + bob;

  // tail
  if (f === 'idle1' || f === 'win') p.thick(4, 14 + bob, 1, 10 + bob, B);
  else p.thick(4, 14 + bob, 1, 13 + bob, B);
  // legs (far pair darker)
  p.rect(6, 18, 2, 4, D); p.rect(13, 18, 2, 4, D);
  p.rect(8, 18, 2, 4, B); p.rect(15, 18, 2, 4, B);
  p.rect(8, 21, 2, 1, L); p.rect(15, 21, 2, 1, L);
  // body
  p.ellipse(11, 15.5 + bob, 7, 4.5, B);
  p.ellipse(12, 17.5 + bob, 4, 1.8, L);
  p.ellipse(7, 13.5 + bob, 2, 1.5, L);
  // head
  p.ellipse(16.5, hy, 5, 4.5, B);
  p.ellipse(20.5, hy + 2, 2.5, 2, L);
  p.set(21, hy + 1, N); p.set(22, hy + 1, N);
  if (f === 'throw' || f === 'win') { p.set(20, hy + 4, T); p.set(21, hy + 4, T); }
  // floppy ear
  p.rect(12, hy - 5, 3, 2, D);
  p.rect(11, hy - 3, 3, 5, D);
  // eyes
  if (f === 'hurt') {
    p.set(17, hy - 2, N); p.set(19, hy - 2, N); p.set(18, hy - 1, N); p.set(17, hy, N); p.set(19, hy, N);
  } else if (f === 'win') {
    p.set(18, hy - 2, N); p.set(17, hy - 1, N); p.set(19, hy - 1, N);
  } else {
    p.set(18, hy - 1, N); p.set(18, hy, N);
  }
  // bandana
  p.rect(13, hy + 4, 6, 2, R);
  p.rect(12, hy + 5, 2, 2, R);
  // arms
  if (f === 'windup') {
    p.thick(14, 13, 11, 8, D);
    p.rect(10, 6, 2, 2, L);
    p.rect(8, 5, 4, 1, WHITE); p.set(8, 4, WHITE); p.set(8, 6, WHITE); p.set(11, 4, WHITE); p.set(11, 6, WHITE);
  } else if (f === 'throw') {
    p.line(17, 13, 21, 11, D); p.line(17, 14, 21, 12, D);
    p.rect(22, 11, 1, 2, L);
  } else if (f === 'win') {
    p.thick(13, 12, 12, 7, D); p.thick(18, 12, 19, 7, D);
    p.rect(12, 6, 2, 1, L); p.rect(19, 6, 2, 1, L);
  } else {
    p.rect(16, 14 + bob, 2, 3, D);
    p.rect(16, 17 + bob, 2, 1, L);
  }
  return p.outline(OUTLINE);
}

// ---------- Miso the cat (drawn facing right, flipped in-game) ----------
function drawCat(f) {
  const p = new Pix(28, 24, 2, 0);
  const G = '#9aa0b4', S = '#5f6478', A = '#7a8096', L = '#e6e8ef', E = '#8be04e', N = OUTLINE, P = '#f08aa0', C = '#3a8be0';
  const bob = f === 'idle1' ? 1 : 0;
  const hy = 9 + bob;

  // tail curling up
  p.thick(4, 16 + bob, 2, 13 + bob, G);
  p.thick(2, 13 + bob, 2, 8 + bob, G);
  const tip = f === 'idle1' || f === 'win' ? -1 : 0;
  p.rect(2 + tip, 6 + bob, 2, 2, S);
  // legs
  p.rect(7, 18, 2, 4, A); p.rect(14, 18, 2, 4, A);
  p.rect(9, 18, 2, 4, G); p.rect(16, 18, 2, 4, G);
  p.rect(9, 21, 2, 1, L); p.rect(16, 21, 2, 1, L);
  // body + stripes
  p.ellipse(11.5, 15.5 + bob, 6.5, 4, G);
  p.ellipse(12, 17.5 + bob, 4, 1.6, L);
  p.rect(8, 12 + bob, 1, 3, S); p.rect(11, 12 + bob, 1, 3, S);
  // head
  p.ellipse(16.5, hy + 0.5, 4.8, 4, G);
  // ears
  p.set(13, hy - 6, G); p.rect(13, hy - 5, 2, 1, G); p.rect(12, hy - 4, 4, 1, G);
  p.set(19, hy - 6, G); p.rect(18, hy - 5, 2, 1, G); p.rect(17, hy - 4, 4, 1, G);
  p.set(13, hy - 4, P); p.set(19, hy - 4, P);
  p.set(16, hy - 3, S); p.set(16, hy - 2, S); p.set(15, hy - 3, S);
  // muzzle + nose
  p.ellipse(19.5, hy + 2, 2.2, 1.4, L);
  p.set(21, hy + 1, P);
  if (f === 'throw' || f === 'win') { p.set(20, hy + 3, P); }
  // eyes
  if (f === 'hurt') {
    p.rect(15, hy, 2, 1, N); p.rect(18, hy, 2, 1, N);
  } else if (f === 'win') {
    p.set(16, hy - 1, N); p.set(15, hy, N); p.set(17, hy, N);
    p.set(19, hy - 1, N); p.set(18, hy, N); p.set(20, hy, N);
  } else {
    p.set(16, hy - 1, E); p.set(16, hy, N);
    p.set(19, hy - 1, E); p.set(19, hy, N);
  }
  // scarf
  p.rect(13, hy + 4, 6, 2, C);
  p.rect(12, hy + 6, 2, 2, C);
  // arms
  if (f === 'windup') {
    p.thick(14, 13, 11, 8, A);
    p.rect(10, 6, 2, 2, L);
    p.rect(7, 5, 5, 1, WHITE); p.set(7, 4, WHITE); p.set(7, 6, WHITE); p.set(9, 4, WHITE); p.set(9, 6, WHITE);
  } else if (f === 'throw') {
    p.line(17, 13, 21, 11, A); p.line(17, 14, 21, 12, A);
    p.rect(22, 11, 1, 2, L);
  } else if (f === 'win') {
    p.thick(13, 12, 12, 7, A); p.thick(18, 12, 19, 7, A);
    p.rect(12, 6, 2, 1, L); p.rect(19, 6, 2, 1, L);
  } else {
    p.rect(16, 14 + bob, 2, 3, A);
    p.rect(16, 17 + bob, 2, 1, L);
  }
  return p.outline(OUTLINE);
}

// ---------- small sprites ----------
const bone = () =>
  Pix.fromStrings(['w.....w', 'wwwwwww', 'w.....w'], { w: WHITE }).outline(OUTLINE);

const fishbone = () =>
  Pix.fromStrings(
    ['w.w.w.w.ww.', '.wwwwwwwwkw', 'w.w.w.w.ww.'],
    { w: WHITE, k: OUTLINE },
  ).outline(OUTLINE);

const marker = () =>
  Pix.fromStrings(['..y..', '.yyy.', 'yyyyy'], { y: '#ffd84a' }).outline(OUTLINE);

const flag = () => {
  const p = new Pix(10, 6, 1, 1);
  p.rect(0, 0, 8, 4, '#e04848');
  p.rect(0, 1, 8, 1, '#ffffff');
  return p.outline(OUTLINE);
};

const cloud = () => {
  const p = new Pix(32, 12);
  p.ellipse(8, 7, 6, 4, WHITE);
  p.ellipse(16, 5.5, 7, 5, WHITE);
  p.ellipse(24, 7, 6, 4, WHITE);
  for (let y = 9; y < 12; y++) for (let x = 0; x < 32; x++) if (p.d[y * 32 + x]) p.d[y * 32 + x] = '#d6e6f2';
  return p;
};


// ---------- item icons (10x10 art + outline = 12x12) ----------
function itemIcon(item) {
  const p = new Pix(12, 12, 1, 1);
  item.drawIcon(p);
  p.outline(OUTLINE);
  item.drawIconOverlay(p);
  return p;
}


// ---------- background (sky, hills, ground, fence) ----------
function drawBackground() {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const horizon = H - GROUND_Y;

  // sky bands with dithered seams
  const sky = ['#3d8fd8', '#53a2e2', '#6db6ec', '#8bc9f2', '#acdaf5', '#cdeaf7'];
  const band = Math.ceil(horizon / sky.length);
  sky.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, i * band, W, band);
    if (i > 0) {
      for (let x = 0; x < W; x += 4) px(x, i * band - 2, c);
      for (let x = 1; x < W; x += 2) px(x, i * band - 1, c);
    }
  });

  // sun
  for (let y = -10; y <= 10; y++)
    for (let x = -10; x <= 10; x++) {
      const d = x * x + y * y;
      if (d <= 100) px(262 + x, 30 + y, d <= 56 ? '#ffe066' : '#fff3b0');
    }

  // hills
  for (let x = 0; x < W; x++) {
    const far = Math.round(32 + 10 * Math.sin(x * 0.02) + 6 * Math.sin(x * 0.051 + 1));
    g.fillStyle = '#a3d69c';
    g.fillRect(x, horizon - far, 1, far);
  }
  for (let x = 0; x < W; x++) {
    const near = Math.round(16 + 6 * Math.sin(x * 0.035 + 2) + 4 * Math.sin(x * 0.09));
    g.fillStyle = '#6dbb63';
    g.fillRect(x, horizon - near, 1, near);
    px(x, horizon - near, '#8fd283');
  }

  // a couple of trees
  for (const tx of [96, 226]) {
    g.fillStyle = '#6b4a2e';
    g.fillRect(tx, horizon - 14, 2, 14);
    for (let y = -7; y <= 7; y++)
      for (let x = -7; x <= 7; x++) {
        const d = x * x + y * y;
        if (d <= 42) px(tx + 1 + x, horizon - 20 + y, d > 25 && y > 0 ? '#2f7a34' : '#3f9a44');
      }
  }

  // ground
  g.fillStyle = '#58a83e'; g.fillRect(0, horizon, W, 4);
  g.fillStyle = '#3f8a2e'; g.fillRect(0, horizon + 4, W, 1);
  g.fillStyle = '#9a6a3e'; g.fillRect(0, horizon + 5, W, H - horizon - 5);
  for (let x = 0; x < W; x += 5) if ((x * 7) % 3 === 0) px(x, horizon - 1, '#58a83e');
  let s = 7;
  for (let i = 0; i < 160; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % W;
    const y = horizon + 7 + ((s >> 9) % (H - horizon - 8));
    px(x, y, i % 2 ? '#7a5030' : '#b88858');
  }

  // fence (brick wall with stone cap)
  const top = H - WALL.y1;
  const wx = WALL.x0, ww = WALL.x1 - WALL.x0;
  g.fillStyle = '#e0cdb0'; g.fillRect(wx, top, ww, horizon - top);
  for (let row = 0, y = top + 3; y < horizon; row++, y += 4) {
    for (let x = wx - (row % 2 ? 4 : 0); x < wx + ww; x += 8) {
      const x0 = Math.max(x, wx), x1 = Math.min(x + 7, wx + ww);
      if (x1 <= x0) continue;
      g.fillStyle = '#b5503c'; g.fillRect(x0, y, x1 - x0, 3);
      g.fillStyle = '#8e3a2c'; g.fillRect(x0, y + 2, x1 - x0, 1);
    }
  }
  g.fillStyle = '#9a9aa8'; g.fillRect(wx - 1, top, ww + 2, 3);
  g.fillStyle = '#c8c8d4'; g.fillRect(wx - 1, top, ww + 2, 1);
  g.fillStyle = OUTLINE;
  g.fillRect(wx - 2, top, 1, 3); g.fillRect(wx + ww + 1, top, 1, 3);
  g.fillRect(wx - 1, top + 3, 1, horizon - top - 3); g.fillRect(wx + ww, top + 3, 1, horizon - top - 3);
  g.fillRect(wx - 1, top - 1, ww + 2, 1);
  // flag pole on the fence
  g.fillStyle = '#4a3a2a'; g.fillRect(160, top - 16, 1, 15);

  return cv;
}

export function buildArt() {
  const frames = (fn) => Object.fromEntries(FRAMES.map((f) => [f, fn(f).toCanvas()]));
  return {
    dog: frames(drawDog),
    cat: frames(drawCat),
    bone: bone().toCanvas(),
    fishbone: fishbone().toCanvas(),
    marker: marker().toCanvas(),
    flag: flag().toCanvas(),
    cloud: cloud().toCanvas(),
    background: drawBackground(),
    icons: Object.fromEntries(Object.values(ITEMS).map((item) => [item.id, itemIcon(item).toCanvas()])),
  };
}
