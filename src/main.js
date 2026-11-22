import './style.css';
import { Game } from './core/game.js';
import { cpuChooseShot, cpuPickDraft, cpuPickItems } from './core/ai.js';
import { ITEMS, STATUSES, COMBOS, combosCompletedBy } from './core/items/index.js';
import { W, H, ANGLE_MIN, ANGLE_MAX, POWER_RATE, GROUND_Y } from './core/constants.js';
import { CHARACTERS, DEFAULT_CHARACTERS } from './core/characters/index.js';
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
let afterThrow = false;     // impact phase came from a throw (online: wait for the server's verdict)

const isCpuTurn = () => mode === 'cpu' && (game.turn === 1 || window.__demo === true);
const isRemoteTurn = () => mode === 'online' && game && game.turn !== me;
const sendMine = (msg) => { if (mode === 'online' && !isRemoteTurn()) net?.send(msg); };
let lastChars = DEFAULT_CHARACTERS;   // characters of the current/last match (rematch keeps them)
let picks = [];                       // character select in progress

/** Character name for side i; mirror matches add P1/P2. */
const charName = (i) => {
  const c = CHARACTERS[game.players[i].char];
  return game.players[0].char === game.players[1].char ? `${c.name} P${i + 1}` : c.name;
};
const nameOf = (i) => {
  if (mode === 'cpu' && i === 1) return `${charName(1)} (CPU)`;
  if (mode === 'online' && i === me) return `${charName(i)} (YOU)`;
  return charName(i);
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
function startMatch(m, seed, resumeAt = 1, chars = lastChars) {
  stopGloating();
  mode = m;
  lastChars = chars;
  game = new Game(seed, chars);
  renderer.setCharacters(chars);
  cpuSkill = 0;
  turnNo = resumeAt - 1;
  remoteQueue.length = 0;
  hud.setRematchVisible(true);
  lastPower = [null, null];
  renderer.reset();
  hud.show(null);
  hud.showHud([nameOf(0), nameOf(1)], game.players.map((p) => p.maxHp));
  beginTurn();
}

function toMenu() {
  stopGloating();
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
  renderer.setHazards([]);
  hud.show('menu');
}

// ---------- items ----------
function refreshItems() {
  if (!game) return;
  renderer.setHazards(game.hazards);
  hud.renderBags(game, phase === 'aim' && !charging && !isCpuTurn());
  game.players.forEach((p, i) => {
    hud.setStatus(i, p);
    const visuals = Object.keys(p.status).map((id) => STATUSES[id].visual).filter(Boolean);
    if (game.hazards.some((h) => h.type === 'fire' && game.inHazard(p, h))) visuals.push('burn');
    renderer.setStatus(i, visuals);
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
    hud.setActiveItem(`${charName(t)} IS PICKING...`);
    return;
  }
  phase = 'draft';
  // Cards that would complete a combo with what's already in the bag get a hint.
  const hints = game.draft.map((id) => {
    const c = combosCompletedBy(id, p.items)[0];
    return c ? `MAKES ${c.name}` : '';
  });
  hud.showDraft(game.draft, mode === 'local' ? `${charName(t)}: PICK AN ITEM` : 'PICK AN ITEM', hints);
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
  for (const cid of game.newCombos) {
    hud.popup(Math.max(70, Math.min(W - 70, p.x + p.facing * 60)), GROUND_Y + 70, COMBOS[cid].name, 'combo');
    renderer.addShake(3);
    sfx.combo();
  }
  const active = game.shot.combos.map((c) => COMBOS[c]);
  if (active.length) hud.setActiveItem(active.map((c) => `${c.name} ${c.desc}`).join(' + '));
  else if (game.used.length > 1) hud.setActiveItem(`COMBO: ${game.used.map((u) => ITEMS[u].name).join(' + ')}`);
  else hud.setActiveItem(`${it.name}: ${it.desc}`);
  // Hint: a recipe you've started and can finish with what's in your bag.
  if (!isCpuTurn() && !isRemoteTurn()) {
    for (const c of Object.values(COMBOS)) {
      if (game.shot.combos.includes(c.id) || !c.recipe.some((r) => game.used.includes(r))) continue;
      const need = c.recipe.filter((r) => !game.used.includes(r));
      if (need.every((r) => p.items.includes(r))) {
        hud.setActiveItem(`TRY +${need.map((r) => ITEMS[r].name).join(' +')} = ${c.name}`);
        break;
      }
    }
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
  hud.showBanner(mine ? 'YOUR TURN!' : `${charName(t)}'S TURN`);
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
  showPassiveEvents();
  applyServerState();
  refreshItems();
  if (game.winner !== null) { phase = 'impact'; timer = 1.2; afterThrow = false; return; }
  // FROZEN: this player loses the turn. Show it, shatter the ice, move on.
  if (ev.skipped) {
    phase = 'skipped';
    timer = 1.6;
    hud.showBanner(`${charName(t)} IS FROZEN!`);
    hud.setControlsVisible(false);
    renderer.shatter(t);
    hud.popup(p.x, GROUND_Y + 54, 'TURN SKIPPED!', 'combo');
  }
}

// ---------- game over: the winner won't stop gloating ----------
const LOSER_LINES = ['NOT FAIR...', 'REMATCH!!', 'LAG!!', 'MY PAW SLIPPED', '...', 'I LET YOU WIN'];
let gloatTimer = null;

function stopGloating() {
  clearTimeout(gloatTimer);
  gloatTimer = null;
}

/** Winner cycles smug victory lines (shuffled); the loser mumbles back now and then. */
function startGloating(w) {
  stopGloating();
  const winner = game.players[w];
  const loser = game.players[1 - w];
  const lines = [...CHARACTERS[winner.char].victory].sort(() => Math.random() - 0.5);
  let k = 0;
  const next = () => {
    if (phase !== 'over') return;
    if (k % 3 === 2) {
      hud.bubble(loser.x, GROUND_Y + 30, LOSER_LINES[Math.floor(Math.random() * LOSER_LINES.length)]);
    } else {
      hud.bubble(winner.x, GROUND_Y + 28, lines[k % lines.length]);
      sfx.taunt();
    }
    k++;
    gloatTimer = setTimeout(next, 1900);
  };
  gloatTimer = setTimeout(next, 600);
}

/** Character i dances and says something rude (a random line from its Character.taunts). */
function taunt(i, line) {
  const p = game.players[i];
  if (p.hp <= 0) return;
  const lines = CHARACTERS[p.char].taunts;
  renderer.taunt(i);
  setTimeout(() => {
    if (phase === 'menu') return;
    hud.bubble(p.x, GROUND_Y + 30, line || lines[Math.floor(Math.random() * lines.length)]);
    sfx.taunt();
  }, 250);
}

/** Popups for character passives that just triggered (NINE LIVES, STICKY PAWS...). */
function showPassiveEvents() {
  for (const ev of game.drainEvents()) {
    const p = game.players[ev.idx];
    if (ev.type === 'survive') {
      hud.popup(p.x, GROUND_Y + 64, `${ev.text}!`, 'combo');
      hud.setHp(ev.idx, p.hp);
      renderer.burst(p.x, GROUND_Y + 12, ['#ffffff', '#ffd84a', '#8fd8ff'], 24, 70, -40);
      sfx.heal?.() || sfx.combo();
    } else if (ev.type === 'steal') {
      hud.popup(p.x, GROUND_Y + 64, `STOLE ${ITEMS[ev.item].name}!`, 'item');
      sfx.pickup();
    } else if (ev.type === 'reaction') {
      hud.popup(p.x, GROUND_Y + 74, ev.text, 'react');
      sfx.combo();
      if (ev.id === 'shatter') renderer.shatter(ev.idx);
      if (ev.id === 'shocked') { renderer.lightning(ev.idx); renderer.burst(p.x, GROUND_Y + 12, ['#8fd8ff', '#ffffff'], 20, 60); hud.flash(); }
      if (ev.id === 'gas') { renderer.explode(p.x, GROUND_Y + 10, 'small'); renderer.burst(p.x, GROUND_Y + 10, ['#7fd35a', '#ff6a2a', '#ffd84a'], 24, 90); }
      if (ev.id === 'fizzle') { renderer.steam(p.x); sfx.sizzle(); }
      if (ev.id === 'deepfreeze') renderer.burst(p.x, GROUND_Y + 14, ['#bfe9ff', '#ffffff'], 16, 40, -30);
    } else if (ev.type === 'doused') {
      renderer.steam(ev.x);
      hud.popup(ev.x, GROUND_Y + 40, 'FIRE OUT!', 'item');
      sfx.sizzle();
    }
    if (p) hud.setHp(ev.idx, p.hp);
  }
  refreshItems();
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
  const flights = game.volley(t, game.current.angle, pw);
  hideAim();
  renderer.throwAnim(t);
  renderer.startProjectile(t, game.shot, flights.length);
  flight = { flights, f: 0, power: pw, seen: flights.map(() => 0), landed: flights.map(() => false) };
  phase = 'flying';
  refreshItems();
  sfx.throw();
}

const LABELS = { boom: 'KABOOM!', crit: 'CRITICAL!', hit: 'HIT!', splash: 'SPLASH!', wall: 'BLOCKED!', ground: 'MISS', out: 'WAY OFF!' };

/** Visuals + sound when one projectile lands (damage is applied in impact()). */
function landEffect(r) {
  const lx = Math.max(24, Math.min(W - 24, r.x));
  switch (r.kind) {
    case 'boom':
      renderer.explode(r.x, r.y, r.style);
      hud.flash(r.style === 'nuke');
      r.style === 'nuke' ? sfx.nuke() : sfx.boom();
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
  // Element landings: water splashes, lightning strikes from the sky.
  if (r.element === 'water' && r.kind !== 'out') {
    renderer.burst(r.x, Math.max(r.y, GROUND_Y + 2), ['#3a8be0', '#8fd8ff', '#ffffff'], 26, 90);
    sfx.splash();
  }
  if (r.element === 'shock' && r.kind !== 'out') {
    renderer.boltAt(r.x, Math.max(r.y, GROUND_Y + 1));
    hud.flash();
    sfx.zap();
  }
  const twister = r.lift?.length > 0;
  const label = r.kind === 'boom' && r.style === 'nuke' ? 'NUKED!!' : twister && r.kind !== 'hit' && r.kind !== 'crit' ? 'TWISTER!' : LABELS[r.kind];
  const cls = r.kind === 'boom' || twister ? 'boom' : r.kind === 'crit' ? 'crit' : r.damages.length ? '' : 'miss';
  hud.popup(lx, Math.min(H - 30, r.y + 14), label, cls);
}

/** Every projectile has landed: apply the volley and show the damage per player. */
function impact() {
  const flights = flight.flights;
  renderer.setWind(game.wind);
  renderer.endProjectile();
  renderer.setLanding(game.turn, flights[Math.floor(flights.length / 2)].result.x);
  game.applyVolley(flights);

  const total = [0, 0];
  const blocked = [null, null];
  const inflicted = [new Set(), new Set()];
  for (const { result } of flights) {
    for (const d of result.damages) {
      if (d.blockedBy) { blocked[d.idx] = d.blockedBy; continue; }
      total[d.idx] += d.amount;
      d.inflicted?.forEach((id) => inflicted[d.idx].add(id));
    }
  }
  game.players.forEach((p, i) => {
    if (blocked[i]) {
      hud.popup(p.x, GROUND_Y + 40, STATUSES[blocked[i]].label, 'item');
      renderer.burst(p.x, GROUND_Y + 28, ['#e04848', '#ffffff'], 10, 50);
      sfx.block();
    }
    if (total[i] > 0) {
      hud.setHp(i, p.hp);
      if (!flights.some((f) => f.result.lift?.includes(i))) renderer.hurt(i);
      hud.popup(p.x, GROUND_Y + 34, `-${total[i]}`, 'dmg');
      [...inflicted[i]].forEach((id, k) => hud.popup(p.x, GROUND_Y + 44 + k * 8, STATUSES[id].label, 'stink'));
    }
  });
  // TORNADO: twister at the landing spot; anyone caught goes for a ride.
  let lifted = false;
  for (const { result } of flights) {
    if (!result.lift) continue;
    if (game.shot.tornado && result.kind !== 'out') {
      renderer.vortex(result.x - 10, result.x + 10, GROUND_Y + 30, GROUND_Y + 100, 1.7);
      sfx.whoosh();
    }
    for (const i of result.lift) {
      renderer.lift(i);
      hud.popup(game.players[i].x, GROUND_Y + 64, 'WHEEEE!', 'item');
      lifted = true;
    }
  }
  if (total[game.turn] > 0) hud.popup(game.current.x, GROUND_Y + 54, 'OOPS!', 'item');
  // Trash talk: the hitter dances and mocks. Hurt yourself? The other side laughs instead.
  const foe = 1 - game.turn;
  if (total[foe] > 0) taunt(game.turn);
  else if (total[game.turn] > 0) taunt(foe, 'HAHAHA!');
  else if (blocked[foe]) taunt(foe, 'NOPE!');
  showPassiveEvents();
  refreshItems();
  phase = 'impact';
  afterThrow = true;
  timer = flights.some((f) => f.result.style === 'nuke' && f.result.kind === 'boom') ? 2.4 : lifted ? 2.0 : 1.2;
}

function afterImpact() {
  // Online: the server decides how the throw ended. Wait for its verdict.
  if (mode === 'online' && afterThrow && !(game.shotsLeft > 0 && game.winner === null)) {
    const final = turnStates.get(turnNo);      // same turn number + winner = game over
    const next = turnStates.get(turnNo + 1);   // next turn's state = game goes on
    if (final && final.winner !== null) {
      turnStates.delete(turnNo);
      game.applySnapshot(final);
      hud.setHp(0, game.players[0].hp);
      hud.setHp(1, game.players[1].hp);
    } else if (next) {
      game.winner = null;
    } else {
      timer = 0.1;   // not here yet: check again shortly
      return;
    }
  }
  if (game.winner !== null) {
    const w = game.winner;
    phase = 'over';
    hud.hideBanner();
    hud.setActiveItem('');
    renderer.setResult(w);
    startGloating(w);
    hud.setControlsVisible(false);
    const wc = CHARACTERS[game.players[w].char];
    if (mode === 'cpu') hud.setOverText(w === 0 ? 'YOU WIN!' : 'YOU LOSE', w === 0 ? `GOOD ${wc.animal}!` : `${charName(w)} RULES THE YARD`);
    else if (mode === 'online') hud.setOverText(w === me ? 'YOU WIN!' : 'YOU LOSE', `${charName(w)} WINS!`);
    else hud.setOverText(`${charName(w)} WINS!`, `${wc.animal} POWER!`);
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
  renderer.showLanding(t);
  const a = game.current.angle;
  renderer.showAim(t, a);
  const tip = renderer.aimTip(t, a);
  hud.showAimLabel(tip.x, tip.y, Math.round(a));
}

function hideAim() {
  renderer.hideAim();
  renderer.showLanding(null);
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
      const i = Math.floor(flight.f);
      let flying = false;
      // TORNADO: show the wind swinging on the flag/clouds while it flies.
      const ww = game.shot.windWave;
      if (ww) renderer.setWind(game.wind + ww.amp * Math.sin(flight.f * ww.freq));
      // TORNADO: the flag thrashes while the throw is in the vortex.
      const vo = game.shot.vortex;
      if (vo) renderer.setWind(flight.f >= vo.start && flight.f < vo.start + vo.loops * vo.period ? 10 * Math.sin(flight.f * 0.6) : game.wind);
      flight.flights.forEach(({ points: pts, result }, k) => {
        for (; flight.seen[k] <= Math.min(i, pts.length - 1); flight.seen[k]++) {
          const q = pts[flight.seen[k]];
          if (q.vortex && game.shot.vortex) {
            // Funnel around the whole looping part of this flight.
            const vo = game.shot.vortex;
            const start = flight.seen[k];
            const loop = pts.slice(start, start + vo.loops * vo.period);
            const xs = loop.map((pt) => pt.x), ys = loop.map((pt) => pt.y);
            renderer.vortex(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), (vo.loops * vo.period) / 60 + 0.3);
            sfx.whoosh?.();
          }
          if (q.lock) {
            const foe = 1 - game.turn;
            renderer.lockOn(foe);
            hud.popup(game.players[foe].x, GROUND_Y + 44, 'LOCKED!', 'boom');
            sfx.lock();
          }
          if (!q.bounce) continue;
          if (q.blast) {
            renderer.explode(q.x, q.y, 'small');
            hud.flash();
            sfx.boom();
            sfx.quack();
          } else {
            sfx.squeak();
            renderer.burst(q.x, q.y + 1, ['#ffd84a', '#ffffff'], 6, 40);
          }
        }
        if (i >= pts.length - 1) {
          if (!flight.landed[k]) {
            flight.landed[k] = true;
            renderer.setProjectile(null, 0, 0, k);
            landEffect(result);
          }
          return;
        }
        flying = true;
        const a = pts[i], b = pts[i + 1], t = flight.f - i;
        renderer.setProjectile(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, flight.f, k, Math.atan2(b.y - a.y, b.x - a.x));
      });
      if (!flying) impact();
      break;
    }

    case 'impact':
      timer -= dt;
      if (timer <= 0) afterImpact();
      break;

    case 'skipped':
      timer -= dt;
      if (timer <= 0) {
        hud.hideBanner();
        game.endTurn();
        beginTurn();
      }
      break;
  }
}

// ---------- character select ----------
const randomChar = () => {
  const ids = Object.keys(CHARACTERS);
  return ids[Math.floor(Math.random() * ids.length)];
};

/** Local / CPU: pick characters, then start. */
function openSelect(m) {
  mode = m;
  phase = 'select';
  picks = [];
  hud.showSelect(m === 'local' ? 'P1: CHOOSE YOUR ANIMAL' : 'CHOOSE YOUR ANIMAL', renderer.charArt);
}

function onCharPicked(id) {
  sfx.select();
  if (mode === 'online') {
    net?.send({ t: 'char', id });
    hud.showSelect(`YOU PICKED ${CHARACTERS[id].name}`, renderer.charArt, { locked: true, msg: 'WAITING FOR FRIEND...' });
    return;
  }
  picks.push(id);
  if (mode === 'local' && picks.length === 1) {
    hud.showSelect('P2: CHOOSE YOUR ANIMAL', renderer.charArt);
    return;
  }
  if (mode === 'cpu') picks.push(randomChar());
  startMatch(mode, undefined, 1, picks);
}
hud.onSelect = onCharPicked;

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
    case 'select':
      me = msg.you;
      mode = 'online';
      phase = 'select';
      if (msg.picked) hud.showSelect(`YOU PICKED ${CHARACTERS[msg.picked].name}`, renderer.charArt, { locked: true, msg: 'WAITING FOR FRIEND...' });
      else hud.showSelect('CHOOSE YOUR ANIMAL', renderer.charArt, { msg: 'YOUR FRIEND IS CHOOSING TOO' });
      break;
    case 'picked':
      if (phase === 'select') hud.setLobbyMsg?.('');
      document.getElementById('selectMsg').textContent = 'FRIEND IS READY!';
      break;
    case 'start':
      me = msg.you;
      turnStates.clear();
      turnStates.set(msg.n, msg.state);
      sfx.select();
      startMatch('online', msg.seed, msg.n, msg.chars || DEFAULT_CHARACTERS);
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
    if (k >= '1' && k <= '4') pickDraft(Number(k) - 1);
    if (k === 'Escape') toMenu();
    return;
  }
  if (phase === 'lobby' && k === 'Escape') { leaveLobby(); return; }
  if (phase === 'book') { if (k === 'Escape' || k === 'Enter' || k === ' ') toMenu(); return; }
  if (phase === 'select') {
    if (e.repeat) return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { hud.navigate(-1); sfx.move(); }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { hud.navigate(1); sfx.move(); }
    if (k === 'Enter' || k === ' ') hud.confirm();
    if (k === 'Escape') leaveLobby();
    return;
  }
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
    else openSelect(b.dataset.mode);
  }),
);
document.getElementById('rematch').addEventListener('click', () => {
  sfx.select();
  if (mode === 'online') {
    net?.send({ t: 'rematch' });
    hud.setOverText(document.getElementById('overTitle').textContent, 'WAITING FOR FRIEND...');
  } else {
    startMatch(mode, undefined, 1, lastChars);
  }
});
document.getElementById('toMenu').addEventListener('click', () => { sfx.select(); leaveLobby(); });

// Combo book.
document.getElementById('openBook').addEventListener('click', () => { sfx.select(); phase = 'book'; hud.showBook(); });
document.getElementById('closeBook').addEventListener('click', () => { sfx.select(); toMenu(); });

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
  const chars = new URLSearchParams(location.search).get('chars')?.split(',').filter((c) => CHARACTERS[c]);
  if (auto === 'cpu' || auto === 'local') startMatch(auto, undefined, 1, chars?.length === 2 ? chars : DEFAULT_CHARACTERS);
  window.__debug = { renderer, get game() { return game; }, get phase() { return phase; }, get me() { return me; }, get turnNo() { return turnNo; }, throw: (pw) => throwShot(pw), useItem: (s) => useItem(s), redraft: (offers, bag) => { game.current.items = bag; game.draft = offers; hud.hideBanner(); startDraft(); } };
}
