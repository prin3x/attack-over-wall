import { Pix } from './pixel.js';
import { W, H, GROUND_Y, WALL } from '../core/constants.js';
import { ITEMS, COMBOS } from '../core/items/index.js';
import { CHARACTERS } from '../core/characters/index.js';

const OUTLINE = '#1c1220';
const WHITE = '#ffffff';
export const FRAMES = ['idle0', 'idle1', 'windup', 'throw', 'hurt', 'win', 'dance0', 'dance1', 'dance2'];

// ---------- characters (pixel art lives in core/characters/roster.js) ----------
function characterArt(c) {
  const frames = Object.fromEntries(
    FRAMES.map((f) => {
      const p = new Pix(28, 24, 2, 0);
      if (f.startsWith('dance')) c.drawDance(p, Number(f.slice(5)));
      else c.drawFrame(p, f);
      return [f, p.outline(OUTLINE).toCanvas()];
    }),
  );
  const projectile = Pix.fromStrings(c.projectile.rows, c.projectile.palette).outline(OUTLINE).toCanvas();
  return { frames, projectile };
}

// ---------- small sprites ----------
// 3 flickering frames of a small pixel flame (no outline: fire glows).
const flame = (k) => {
  const p = new Pix(8, 12);
  const sway = [0, 1, -1][k];
  p.ellipse(4, 8.5, 3.4, 3.4, '#e04848');
  p.ellipse(4 + sway * 0.5, 6, 2.2, 3, '#e04848');
  p.set(4 + sway, 1 + k % 2, '#e04848'); p.set(4 + sway, 2, '#e04848');
  p.ellipse(4, 9, 2.4, 2.4, '#ff8a2a');
  p.ellipse(4 + sway * 0.5, 7, 1.4, 2.2, '#ff8a2a');
  p.ellipse(4, 9.6, 1.3, 1.6, '#ffd84a');
  return p;
};

// Ice block drawn around a frozen character.
const iceBlock = () => {
  const p = new Pix(30, 28);
  p.rect(0, 0, 30, 28, '#bfe9ff');
  p.rect(0, 0, 30, 1, '#ffffff'); p.rect(0, 0, 1, 28, '#ffffff');
  p.rect(29, 0, 1, 28, '#7cc4ea'); p.rect(0, 27, 30, 1, '#7cc4ea');
  for (let k = 0; k < 7; k++) { p.set(4 + k, 3 + k, '#ffffff'); p.set(5 + k, 3 + k, '#e6f7ff'); }
  for (let k = 0; k < 4; k++) p.set(20 + k, 5 + k, '#ffffff');
  return p;
};

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
  return {
    characters: Object.fromEntries(Object.values(CHARACTERS).map((c) => [c.id, characterArt(c)])),
    marker: marker().toCanvas(),
    flames: [0, 1, 2].map((k) => flame(k).toCanvas()),
    iceBlock: iceBlock().toCanvas(),
    flag: flag().toCanvas(),
    cloud: cloud().toCanvas(),
    background: drawBackground(),
    icons: Object.fromEntries(Object.values(ITEMS).map((item) => [item.id, itemIcon(item).toCanvas()])),
    // Combos that draw something get a sprite too (e.g. the NUKE warhead).
    comboIcons: Object.fromEntries(
      Object.values(COMBOS)
        .map((c) => [c.id, itemIcon(c)])
        .filter(([, p]) => p.d.some(Boolean))
        .map(([id, p]) => [id, p.toCanvas()]),
    ),
  };
}
