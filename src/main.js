import './style.css';
import { Game } from './core/game.js';
import { cpuChooseShot, cpuPickDraft, cpuPickItems } from './core/ai.js';
import { ITEMS, STATUSES } from './core/items/index.js';
import { W, H, ANGLE_MIN, ANGLE_MAX, POWER_RATE, NAMES, GROUND_Y } from './core/constants.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { sfx } from './audio/sfx.js';
import { Online } from './net/online.js';

const stage = document.getElementById('stage');
const renderer = new Renderer(document.getElementById('game'));
const hud = new Hud();
hud.setIcons(renderer.icons);

// ---------- state ----------
let mode = null;            // 'cpu' | 'local' | 'online'
let game = null;
let phase = 'menu';         // menu | lobby | banner | draft | aim | cpu | remoteWait | remote | flying | impact | over
let timer = 0;
let charging = false;
let power = 0;
let powerDir = 1;
let flight = null;
let cpu = null;
let cpuSkill = 0;
let lastPower = [null, null];
const held = { up: 0, down: 0 };   // seconds each angle key has been held (0 = not held)

// online
let net = null;             // Online connection
let me = 0;                 // my seat (0 = dog, 1 = cat)
let roomCode = '';
let turnNo = 0;             // turn counter, matches the server's
const turnStates = new Map(); // turn number -> authoritative state from the server
const remoteQueue = [];     // opponent moves waiting to be played back
let remoteDelay = 0;
const aimSent = { t: 0, angle: null };

const isCpuTurn = () => mode === 'cpu' && (game.turn === 1 || window.__demo === true);
const isRemoteTurn = () => mode === 'online' && game && game.turn !== me;
const sendMine = (msg) => { if (mode === 'online' && !isRemoteTurn()) net?.send(msg); };
const nameOf = (i) => {
  if (mode === 'cpu' && i === 1) return `${NAMES[1]} (CPU)`;
  if (mode === 'online' && i === me) return `${NAMES[i]} (YOU)`;
  return NAMES[i];
};

// ---------- screen fit (integer scaling when there's room) ----------
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const scale = s >= 2 ? Math.floor(s) : s;
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${Math.floor((innerWidth - W * scale) / 2)}px`;
  stage.style.top = `${Math.floor((innerHeight - H * scale) / 2)}px`;
}
addEventListener('resize', fit);
fit();

// ---------- flow ----------
function startMatch(m, seed, resumeAt = 1) {
  mode = m;
  game = new Game(seed);
  cpuSkill = 0;
  turnNo = resumeAt - 1;
  remoteQueue.length = 0;
  hud.setRematchVisible(true);
  lastPower = [null, null];
  renderer.reset();
  hud.show(null);
  hud.showHud([nameOf(0), nameOf(1)]);
  beginTurn();
}

function toMenu() {
  if (net) { net.close(); net = null; }
  phase = 'menu';
  charging = false;
  renderer.reset();
  renderer.endProjectile();
  hud.hideAimLabel();
  hud.hideHud();
  hud.hideBanner();
  hud.setActiveItem('');
  renderer.setStatus(0, []);
  renderer.setStatus(1, []);
  hud.show('menu');
}

// ---------- items ----------
function refreshItems() {
  if (!game) return;
  hud.renderBags(game, phase === 'aim' && !charging && !isCpuTurn());
  game.players.forEach((p, i) => {
    hud.setStatus(i, p);
    renderer.setStatus(i, Object.keys(p.status).map((id) => STATUSES[id].visual).filter(Boolean));
  });
}

function startDraft() {
  const t = game.turn;
  const p = game.current;
  if (!game.draft) {
    hud.popup(p.x, GROUND_Y + 40, 'BAG FULL!', 'item');
    enterPlay();
    return;
  }
  if (isCpuTurn()) {
    pickDraft(cpuPickDraft(game, t));
    return;
  }
  if (isRemoteTurn()) {
    phase = 'remoteWait';
    hud.setActiveItem(`${NAMES[t]} IS PICKING...`);
    return;
  }
  phase = 'draft';
  hud.showDraft(game.draft, mode === 'local' ? `${NAMES[t]}: PICK AN ITEM` : 'PICK AN ITEM');
  sfx.turn();
}

function pickDraft(i) {
  if (!game?.draft) return;
  const p = game.current;
  const id = game.pickDraft(i);
  if (!id) return;
  sendMine({ t: 'pick', i });
  hud.show(null);
  hud.popup(p.x, GROUND_Y + 40, `+${ITEMS[id].name}`, 'item');
  sfx.pickup();
  enterPlay();
}

/** After the draft: hand control to the human or the CPU. */
function enterPlay() {
  if (isCpuTurn()) {
    phase = 'cpu';
    cpu = { stage: 'item', wait: 0.7, charging: false, plan: null };
  } else if (isRemoteTurn()) {
    phase = 'remote';
    hud.setActiveItem('');
  } else {
    phase = 'aim';
  }
  drawAim();
  refreshItems();
}

function useItem(slot) {
  if (!(phase === 'aim' || phase === 'cpu' || phase === 'remote') || charging) return false;
  const p = game.current;
  const id = game.useItem(slot);
  if (!id) { sfx.deny(); return false; }
  sendMine({ t: 'use', slot });
  const it = ITEMS[id];
  sfx.use();
  hud.popup(p.x, GROUND_Y + 44, `${it.name}!`, 'item');
  // Items may change the wind; keep the display in sync.
  renderer.setWind(game.wind);
  hud.setWind(game.wind);
  if (it.usePopup) {
    const who = it.usePopup.on === 'foe' ? game.opponent : p;
    hud.popup(who.x, GROUND_Y + 40, it.usePopup.text, 'item');
  }
  if (game.used.length > 1) {
    hud.setActiveItem(`COMBO: ${game.used.map((u) => ITEMS[u].name).join(' + ')}`);
    hud.popup(p.x, GROUND_Y + 54, 'COMBO!', 'boom');
  } else {
    hud.setActiveItem(`${it.name}: ${it.desc}`);
  }
  refreshItems();
  return true;
}

function beginTurn() {
  const t = game.turn;
  turnNo++;
  phase = 'banner';
  timer = 1.0;
  power = 0;
  powerDir = 1;
  charging = false;
  hideAim();
  renderer.setWind(game.wind);
  hud.setWind(game.wind);
  hud.setAngle(game.current.angle);
  hud.setPower(0, lastPower[t]);
  hud.setControlsVisible(!isCpuTurn() && !isRemoteTurn());
  const mine = (mode === 'cpu' && t === 0) || (mode === 'online' && t === me);
  hud.showBanner(mine ? 'YOUR TURN!' : `${NAMES[t]}'S TURN`);
  hud.setActiveItem('');
  sfx.turn();

  const p = game.current;
  const ev = game.startTurn();
  // Status effects at turn start (stink damage, pepper sneeze, ...).
  ev.effects.forEach((fx, k) => {
    const y = GROUND_Y + 34 + k * 10;
    if (fx.damage) {
      hud.setHp(t, p.hp);
      renderer.hurt(t);
      hud.popup(p.x, y, `-${fx.damage} ${fx.text || ''}`.trim(), fx.cls || 'dmg');
    } else if (fx.text) {
      hud.popup(p.x, y, fx.text, fx.cls || 'item');
    }
    if (fx.sound) sfx[fx.sound]?.();
  });
  applyServerState();
  refreshItems();
  if (game.winner !== null) { phase = 'impact'; timer = 1.2; }
}

/** Online: snap to the server's state for this turn (keeps both screens identical). */
function applyServerState() {
  const s = turnStates.get(turnNo);
  if (!s) return;
  turnStates.delete(turnNo);
  game.applySnapshot(s);
  hud.setHp(0, game.players[0].hp);
  hud.setHp(1, game.players[1].hp);
  renderer.setWind(game.wind);
  hud.setWind(game.wind);
  hud.setAngle(game.current.angle);
  refreshItems();
}

function throwShot(pw = power, auto = false) {
  const t = game.turn;
  if (!auto) sendMine({ t: 'throw', angle: game.current.angle, power: pw });
  charging = false;
  lastPower[t] = pw;
  const shot = game.simulate(t, game.current.angle, pw);
  hideAim();
  renderer.throwAnim(t);
  renderer.startProjectile(t, game.shot);
  flight = { shot, f: 0, power: pw, seen: 0 };
  phase = 'flying';
  refreshItems();
  sfx.throw();
}

const LABELS = { boom: 'KABOOM!', crit: 'CRITICAL!', hit: 'HIT!', splash: 'SPLASH!', wall: 'BLOCKED!', ground: 'MISS', out: 'WAY OFF!' };

function impact() {
  const r = flight.shot.result;
  renderer.endProjectile();
  game.applyResult(r);

  const lx = Math.max(24, Math.min(W - 24, r.x));
  switch (r.kind) {
    case 'boom':
      renderer.explode(r.x, r.y);
      hud.flash();
      sfx.boom();
      break;
    case 'crit':
      renderer.burst(r.x, r.y, ['#ffd84a', '#ffffff', '#ff6060'], 20, 90);
      renderer.addShake(4);
      sfx.crit();
      break;
    case 'hit':
      renderer.burst(r.x, r.y, ['#ffffff', '#ffd84a'], 14);
      renderer.addShake(3);
      sfx.hit();
      break;
    case 'wall':
      renderer.burst(r.x, r.y, ['#b5503c', '#e0cdb0', '#9a9aa8'], 12, 60);
      renderer.addShake(2);
      sfx.wall();
      break;
    case 'splash':
    case 'ground':
      renderer.burst(r.x, GROUND_Y + 1, ['#9a6a3e', '#58a83e', '#b88858'], 10, 50);
      r.kind === 'splash' ? sfx.hit() : sfx.ground();
      break;
    default:
      sfx.ground();
  }
  hud.popup(lx, Math.min(H - 30, r.y + 14), LABELS[r.kind], r.kind === 'boom' ? 'boom' : r.kind === 'crit' ? 'crit' : r.damages.length ? '' : 'miss');

  for (const d of r.damages) {
    const p = game.players[d.idx];
    if (d.blockedBy) {
      hud.popup(p.x, GROUND_Y + 40, STATUSES[d.blockedBy].label, 'item');
      renderer.burst(p.x, GROUND_Y + 28, ['#e04848', '#ffffff'], 10, 50);
      sfx.block();
      continue;
    }
    hud.setHp(d.idx, p.hp);
    renderer.hurt(d.idx);
    hud.popup(p.x, GROUND_Y + 34, `-${d.amount}`, 'dmg');
    d.inflicted.forEach((id, k) => hud.popup(p.x, GROUND_Y + 44 + k * 8, STATUSES[id].label, 'stink'));
  }
  refreshItems();
  phase = 'impact';
  timer = 1.2;
}

function afterImpact() {
  if (game.winner !== null) {
    const w = game.winner;
    phase = 'over';
    hud.hideBanner();
    hud.setActiveItem('');
    renderer.setResult(w);
    hud.setControlsVisible(false);
    if (mode === 'cpu') hud.setOverText(w === 0 ? 'YOU WIN!' : 'YOU LOSE', w === 0 ? 'GOOD DOG!' : 'MISO RULES THE YARD');
    else if (mode === 'online') hud.setOverText(w === me ? 'YOU WIN!' : 'YOU LOSE', `${NAMES[w]} WINS!`);
    else hud.setOverText(`${NAMES[w]} WINS!`, w === 0 ? 'WOOF WOOF!' : 'MEOW!');
    hud.show('over');
    sfx.win();
    return;
  }
  if (game.shotsLeft > 0) {
    hud.popup(game.current.x, GROUND_Y + 40, 'AGAIN!', 'item');
    throwShot(flight.power, true);
    return;
  }
  game.endTurn();
  beginTurn();
}

// ---------- aiming ----------
function drawAim() {
  const t = game.turn;
  const a = game.current.angle;
  renderer.showAim(t, a);
  const tip = renderer.aimTip(t, a);
  hud.showAimLabel(tip.x, tip.y, Math.round(a));
}

function hideAim() {
  renderer.hideAim();
  hud.hideAimLabel();
}

function pointerToWorld(e) {
  const r = stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: H - ((e.clientY - r.top) / r.height) * H };
}

/** GunBound-style: the angle follows the pointer, measured from the thrower's hand. */
function aimAtPointer(e) {
  if (phase !== 'aim') return;
  const { x, y } = pointerToWorld(e);
  const o = game.launchPoint(game.turn);
  const f = game.current.facing;
  let a = (Math.atan2(y - o.y, (x - o.x) * f) * 180) / Math.PI;
  if (a > 90) a = ANGLE_MAX;        // pointer behind & above -> steepest
  else if (a < -90) a = ANGLE_MIN;  // pointer behind & below -> flattest
  const p = game.current;
  const next = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, Math.round(a)));
  if (next !== Math.round(p.angle)) {
    p.angle = next;
    hud.setAngle(next);
  }
}

// ---------- per-frame update ----------
function stepAngle(delta) {
  const p = game.current;
  p.angle = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, p.angle + delta));
  hud.setAngle(p.angle);
}

function update(dt) {
  stage.classList.toggle('aiming', phase === 'aim');
  switch (phase) {
    case 'banner':
      timer -= dt;
      if (timer <= 0) {
        hud.hideBanner();
        startDraft();
      }
      break;

    case 'aim': {
      // Tap = 1 degree; hold = continuous after a short delay.
      for (const [k, dir] of [['up', 1], ['down', -1]]) {
        if (!held[k]) continue;
        const before = held[k];
        held[k] += dt;
        if (held[k] > 0.25) stepAngle(dir * 40 * (before > 0.25 ? dt : held[k] - 0.25));
      }
      if (charging) {
        power += powerDir * POWER_RATE * game.powerRate(game.current) * dt;
        if (power >= 100) { power = 100; powerDir = -1; }
        if (power <= 0) { power = 0; powerDir = 1; }
        hud.setPower(power, lastPower[game.turn]);
      }
      drawAim();
      // Online: let the opponent watch me aim (throttled).
      if (mode === 'online') {
        const now = performance.now();
        const a = Math.round(game.current.angle);
        if (now - aimSent.t > 120 && a !== aimSent.angle) {
          net?.send({ t: 'aim', angle: a });
          aimSent.t = now;
          aimSent.angle = a;
        }
      }
      break;
    }

    case 'remoteWait':
    case 'remote':
      playRemote(dt);
      break;

    case 'cpu': {
      if (cpu.wait > 0) { cpu.wait -= dt; break; }
      if (cpu.stage === 'item') {
        cpu.queue = cpuPickItems(game, game.turn);
        cpu.stage = 'items';
      }
      if (cpu.stage === 'items') {
        const id = cpu.queue.shift();
        if (id && useItem(game.current.items.indexOf(id))) { cpu.wait = 0.7; break; }
        if (!cpu.queue.length) cpu.stage = 'plan';
        break;
      }
      if (cpu.stage === 'plan') {
        cpu.plan = cpuChooseShot(game, game.turn, cpuSkill++);
        if (game.powerRate(game.current) > 1) cpu.plan.power = Math.max(5, Math.min(100, cpu.plan.power + (Math.random() - 0.5) * 18));
        cpu.stage = 'aim';
      }
      const p = game.current;
      const diff = cpu.plan.angle - p.angle;
      if (Math.abs(diff) > 0.5) {
        stepAngle(Math.sign(diff) * Math.min(Math.abs(diff), 45 * dt));
        drawAim();
      } else {
        p.angle = cpu.plan.angle;
        if (!cpu.charging) { cpu.charging = true; renderer.windup(game.turn); }
        power = Math.min(cpu.plan.power, power + POWER_RATE * dt);
        hud.setPower(power, lastPower[game.turn]);
        if (power >= cpu.plan.power) throwShot();
      }
      break;
    }

    case 'flying': {
      flight.f += dt * 60;
      const pts = flight.shot.points;
      const i = Math.floor(flight.f);
      for (; flight.seen <= Math.min(i, pts.length - 1); flight.seen++) {
        const q = pts[flight.seen];
        if (q.bounce) {
          sfx.squeak();
          renderer.burst(q.x, q.y + 1, ['#ffd84a', '#ffffff'], 6, 40);
        }
      }
      if (i >= pts.length - 1) { impact(); break; }
      const a = pts[i], b = pts[i + 1], k = flight.f - i;
      renderer.setProjectile(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, flight.f);
      break;
    }

    case 'impact':
      timer -= dt;
      if (timer <= 0) afterImpact();
      break;
  }
}

// ---------- online ----------
/** Play back the opponent's moves one at a time, like the CPU does. */
function playRemote(dt) {
  if (remoteDelay > 0) { remoteDelay -= dt; return; }
  const msg = remoteQueue[0];
  if (!msg) return;
  if (phase === 'remoteWait') {
    // Waiting for their draft pick; drop anything else that arrives early.
    remoteQueue.shift();
    if (msg.t === 'pick') { pickDraft(msg.i); remoteDelay = 0.3; }
    return;
  }
  remoteQueue.shift();
  switch (msg.t) {
    case 'aim':
      game.current.angle = msg.angle;
      hud.setAngle(msg.angle);
      drawAim();
      break;
    case 'charge':
      renderer.windup(game.turn);
      break;
    case 'use':
      useItem(msg.slot);
      remoteDelay = 0.5;
      break;
    case 'throw':
      game.current.angle = msg.angle;
      power = msg.power;
      hud.setPower(msg.power, lastPower[game.turn]);
      throwShot(msg.power, true);
      break;
  }
}

function onNet(msg) {
  switch (msg.t) {
    case 'waiting':
      hud.showLobby('room', roomCode);
      hud.setLobbyMsg('WAITING FOR A FRIEND...');
      break;
    case 'start':
      me = msg.you;
      turnStates.clear();
      turnStates.set(msg.n, msg.state);
      sfx.select();
      startMatch('online', msg.seed, msg.n);
      break;
    case 'turn':
      turnStates.set(msg.n, msg.state);
      if (msg.n === turnNo && ['banner', 'draft', 'remoteWait'].includes(phase)) applyServerState();
      break;
    case 'pick':
    case 'use':
    case 'aim':
    case 'charge':
    case 'throw':
      remoteQueue.push(msg);
      break;
    case 'error':
      console.warn('server rejected move:', msg.msg);
      turnStates.set(msg.n, msg.state);
      if (msg.n === turnNo) applyServerState();
      break;
    case 'rematch':
      if (phase === 'over') hud.setOverText(document.getElementById('overTitle').textContent, 'FRIEND WANTS A REMATCH!');
      break;
    case 'left':
      if (phase === 'menu' || phase === 'lobby') break;
      phase = 'over';
      hideAim();
      hud.hideBanner();
      hud.setControlsVisible(false);
      hud.setActiveItem('');
      hud.setOverText('FRIEND LEFT', 'THEY CAN REJOIN WITH THE LINK');
      hud.setRematchVisible(false);
      hud.show('over');
      break;
    case 'back':
      hud.popup(W / 2, H / 2, 'FRIEND IS BACK!', 'item');
      break;
  }
}

function onNetClosed() {
  net = null;
  if (mode !== 'online' || phase === 'menu') return;
  phase = 'over';
  hud.setControlsVisible(false);
  hud.hideBanner();
  hud.setActiveItem('');
  hud.setOverText('DISCONNECTED', 'CONNECTION TO SERVER LOST');
  hud.setRematchVisible(false);
  hud.show('over');
}

async function joinRoom(code) {
  code = code.trim().toUpperCase();
  if (code.length < 4) { hud.setLobbyMsg('ENTER A ROOM CODE'); return; }
  if (net) net.close();
  roomCode = code;
  hud.setLobbyMsg('CONNECTING...');
  net = new Online();
  net.onMessage = onNet;
  net.onClose = onNetClosed;
  try {
    await net.connect(code);
    history.replaceState(null, '', `?room=${code}`);
  } catch {
    net = null;
    hud.showLobby('home');
    hud.setLobbyMsg('ROOM NOT FOUND OR FULL');
  }
}

async function createRoom() {
  hud.setLobbyMsg('CREATING ROOM...');
  try {
    await joinRoom(await Online.createRoom());
  } catch {
    hud.setLobbyMsg('SERVER OFFLINE - TRY AGAIN');
  }
}

function openLobby() {
  phase = 'lobby';
  hud.showLobby('home');
  hud.setLobbyMsg('');
}

function leaveLobby() {
  if (net) { net.close(); net = null; }
  history.replaceState(null, '', location.pathname);
  toMenu();
}

// ---------- input ----------
function startCharge() {
  if (phase !== 'aim' || charging) return;
  sfx.unlock();
  charging = true;
  power = 0;
  powerDir = 1;
  renderer.windup(game.turn);
  sendMine({ t: 'charge' });
  refreshItems();
}

function releaseCharge() {
  if (phase === 'aim' && charging) throwShot();
}

addEventListener('keydown', (e) => {
  const k = e.key;
  if (e.target instanceof HTMLInputElement) {
    if (k === 'Enter') joinRoom(e.target.value);
    if (k === 'Escape') e.target.blur();
    return;
  }
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  if (k === 'm' || k === 'M') { sfx.toggleMute(); return; }

  if (phase === 'draft') {
    if (e.repeat) return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { hud.navigate(-1); sfx.move(); }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { hud.navigate(1); sfx.move(); }
    if (k === 'Enter' || k === ' ') hud.confirm();
    if (k >= '1' && k <= '3') pickDraft(Number(k) - 1);
    if (k === 'Escape') toMenu();
    return;
  }
  if (phase === 'lobby' && k === 'Escape') { leaveLobby(); return; }
  if (phase === 'menu' || phase === 'over' || phase === 'lobby') {
    if (e.repeat) return;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { hud.navigate(-1); sfx.move(); }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { hud.navigate(1); sfx.move(); }
    if (k === 'Enter' || k === ' ') hud.confirm();
    return;
  }
  if (k === 'Escape') { leaveLobby(); return; }
  if (e.repeat) return;
  if (phase === 'aim') {
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { held.up = 0.0001; stepAngle(1); }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { held.down = 0.0001; stepAngle(-1); }
  }
  if (phase === 'aim' && !isCpuTurn() && k >= '1' && k <= '4') useItem(Number(k) - 1);
  if (k === ' ') startCharge();
});

addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') held.up = 0;
  if (k === 'ArrowDown' || k === 's' || k === 'S') held.down = 0;
  if (k === ' ') releaseCharge();
});

// Mouse / touch: move to aim, press & hold on the field to charge, release to throw.
// Dragging while charging keeps adjusting the angle.
stage.addEventListener('pointermove', (e) => {
  if (e.target.closest('button')) return;
  aimAtPointer(e);
});
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  aimAtPointer(e);
  startCharge();
});
addEventListener('pointerup', releaseCharge);
addEventListener('pointercancel', releaseCharge);
addEventListener('blur', () => { held.up = held.down = 0; releaseCharge(); });

// On-screen angle buttons (hold to repeat).
for (const [id, key] of [['angUp', 'up'], ['angDown', 'down']]) {
  const btn = document.getElementById(id);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (phase !== 'aim') return;
    held[key] = 0.0001;
    stepAngle(key === 'up' ? 1 : -1);
  });
  const stop = () => (held[key] = 0);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
}

// Item UI callbacks.
hud.onDraft = (i) => pickDraft(i);
hud.onSlot = (s) => { if (phase === 'aim' && !isCpuTurn()) useItem(s); };

// Menu buttons.
document.querySelectorAll('#menu button[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    sfx.unlock();
    sfx.select();
    if (b.dataset.mode === 'online') openLobby();
    else startMatch(b.dataset.mode);
  }),
);
document.getElementById('rematch').addEventListener('click', () => {
  sfx.select();
  if (mode === 'online') {
    net?.send({ t: 'rematch' });
    hud.setOverText(document.getElementById('overTitle').textContent, 'WAITING FOR FRIEND...');
  } else {
    startMatch(mode);
  }
});
document.getElementById('toMenu').addEventListener('click', () => { sfx.select(); leaveLobby(); });

// Online lobby buttons.
const $id = (id) => document.getElementById(id);
$id('createRoom').addEventListener('click', () => { sfx.select(); createRoom(); });
$id('joinRoom').addEventListener('click', () => { sfx.select(); joinRoom($id('joinCode').value); });
$id('lobbyBack').addEventListener('click', () => { sfx.select(); leaveLobby(); });
$id('lobbyCancel').addEventListener('click', () => { sfx.select(); leaveLobby(); });
$id('copyLink').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(link);
    hud.setLobbyMsg('LINK COPIED! SEND IT TO A FRIEND');
  } catch {
    hud.setLobbyMsg(link);
  }
});
$id('joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

// ---------- main loop ----------
hud.show('menu');
renderer.setWind(3);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.update(dt);
  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Invite link: ?room=CODE joins that room straight away.
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode) {
  openLobby();
  joinRoom(inviteCode);
}

// Dev helper: ?auto=cpu or ?auto=local jumps straight into a match.
if (import.meta.env.DEV) {
  const auto = new URLSearchParams(location.search).get('auto');
  if (new URLSearchParams(location.search).has('demo')) window.__demo = true;
  if (auto === 'cpu' || auto === 'local') startMatch(auto);
  window.__debug = { get game() { return game; }, get phase() { return phase; }, get me() { return me; }, get turnNo() { return turnNo; }, throw: (pw) => throwShot(pw), useItem: (s) => useItem(s) };
}
