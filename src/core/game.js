import {
  W, GROUND_Y, DT, GRAVITY, MAX_SPEED, WIND_ACCEL, MAX_WIND,
  WALL, spawnX, LAUNCH, HEAD, BODY,
} from './constants.js';
import { mulberry32 } from './rng.js';
import { Shot } from './shot.js';
import { ITEMS, STATUSES, COMBOS, REACTIONS, BAG_SIZE, rollDraft } from './items/index.js';
import { CHARACTERS, DEFAULT_CHARACTERS } from './characters/index.js';

/**
 * Pure game state + rules. No rendering, no input, and no item- or
 * character-specific code: items act through Item hooks (core/items) and the
 * Shot they modify; animals act through Character stats + passive hooks.
 *
 * Everything random comes from the seeded RNG, and every player decision is a
 * small value (draft pick, item slot, angle, power), so online play can just
 * exchange those decisions and both sides stay in sync.
 */
export class Game {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0, chars = DEFAULT_CHARACTERS) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    // 2 players = 1v1, 4 players = 2v2. Team = index % 2 (left = 0), so turns go A1, B1, A2, B2.
    const xs = spawnX(chars.length === 4 ? 4 : 2);
    this.players = xs.map((x, i) => {
      const c = CHARACTERS[chars[i]] || CHARACTERS[DEFAULT_CHARACTERS[i % 2]];
      return {
        char: c.id,
        team: i % 2,
        x,
        facing: i % 2 === 0 ? 1 : -1,
        hp: c.maxHp,
        maxHp: c.maxHp,
        angle: 45,
        items: [],
        status: {},   // status id -> value (turns left or true)
        flags: {},    // one-off passive state (e.g. nine lives used)
      };
    });
    this.events = [];     // passive triggers for the UI (nine lives, steals...)
    this.hazards = [];    // things burning/lying on the floor: { type, x, radius, damage, left }
    this.turn = 0;
    this.lastOf = [0, this.players.length - 1];   // per team: who played last (teams take turns, members rotate)
    this.winner = null;             // winning TEAM (in 1v1 that's also the player index)
    this.wind = 0;
    this.shot = new Shot();
    this.used = [];       // item ids used this turn (each type once per turn)
    this.shotsLeft = 1;
    this.draft = null;
    this.rollWind();
  }

  get current() { return this.players[this.turn]; }
  charOf(p) { return CHARACTERS[p.char]; }

  /** UI events since the last call (passives that triggered). */
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  /** The first enemy still standing (in 1v1: simply the other player). */
  get opponent() { return this.enemiesOf(this.turn)[0] || this.players[1 - this.current.team]; }
  get teams() { return this.players.length > 2; }
  isEnemy(a, b) { return this.players[a].team !== this.players[b].team; }
  /** Alive enemies of player idx. */
  enemiesOf(idx) { return this.players.filter((p) => p.team !== this.players[idx].team && p.hp > 0); }
  teamAlive(t) { return this.players.some((p) => p.team === t && p.hp > 0); }

  /** Next player: the other team's next member still standing (falls back to my own team). */
  nextPlayer() {
    const n = this.players.length;
    const team = 1 - this.current.team;
    for (const t of [team, 1 - team]) {
      for (let k = 1; k <= n; k++) {
        const i = (this.lastOf[t] + k) % n;
        if (this.players[i].team === t && this.players[i].hp > 0) return i;
      }
    }
    return this.turn;
  }

  rollWind() {
    this.wind = Math.round(this.rng() * MAX_WIND * 2 - MAX_WIND);
  }

  // ---------- online sync ----------
  /** Plain-data copy of everything that matters between turns (sent by the server). */
  snapshot() {
    return {
      turn: this.turn,
      lastOf: [...this.lastOf],
      wind: this.wind,
      winner: this.winner,
      draft: this.draft ? [...this.draft] : null,
      hazards: this.hazards.map((h) => ({ ...h })),
      players: this.players.map((p) => ({ hp: p.hp, angle: p.angle, items: [...p.items], status: { ...p.status }, flags: { ...p.flags } })),
    };
  }

  /** Overwrite local state with the server's (keeps both screens identical). */
  applySnapshot(s) {
    this.turn = s.turn;
    if (s.lastOf) this.lastOf = [...s.lastOf];
    this.wind = s.wind;
    this.winner = s.winner;
    this.draft = s.draft ? [...s.draft] : null;
    this.hazards = (s.hazards || []).map((h) => ({ ...h }));
    s.players.forEach((sp, i) => {
      const p = this.players[i];
      p.hp = sp.hp;
      p.angle = sp.angle;
      p.items = [...sp.items];
      p.status = { ...sp.status };
      p.flags = { ...(sp.flags || {}) };
    });
  }

  // ---------- statuses ----------
  addStatus(p, id, value) { p.status[id] = value; }
  removeStatus(p, id) { delete p.status[id]; }

  /** Power-bar speed multiplier: the character's CONTROL stat x statuses (e.g. pepper). */
  powerRate(p) {
    return Object.keys(p.status).reduce((m, id) => m * STATUSES[id].powerRate(this, p), this.charOf(p).controlRate);
  }

  /** How much p's power bar stutters, e.g. ZAPPED. */
  powerStagger(p) {
    return Math.max(0, ...Object.keys(p.status).map((id) => STATUSES[id].powerStagger(this, p)));
  }

  /** How far (degrees) p's aim drifts by itself, e.g. DRUNK. */
  aimSway(p) {
    return Math.max(0, ...Object.keys(p.status).map((id) => STATUSES[id].aimSway(this, p)));
  }

  /** Is player p standing inside floor hazard h? */
  inHazard(p, h) {
    const bx = p.x + BODY.dx * p.facing;
    return Math.abs(bx - h.x) <= h.radius + BODY.r * this.charOf(p).sizeScale * 0.5;
  }

  /** Run element reactions on a hit about to land (may change d.amount and statuses). */
  react(p, d) {
    for (const r of Object.values(REACTIONS)) {
      if (r.onHit(this, p, d)) this.events.push({ type: 'reaction', idx: this.players.indexOf(p), text: r.name, id: r.id });
    }
  }

  damage(idx, amount) {
    const p = this.players[idx];
    let dealt = Math.min(amount, p.hp);
    if (dealt > 0 && dealt === p.hp && this.charOf(p).onLethal(this, p)) {
      dealt = p.hp - 1;   // survived with 1 HP (e.g. NINE LIVES)
      this.events.push({ type: 'survive', idx, text: this.charOf(p).passive.name });
    }
    p.hp -= dealt;
    if (p.hp === 0 && this.winner === null && !this.teamAlive(p.team)) this.winner = 1 - p.team;
    return dealt;
  }

  // ---------- turn flow ----------
  /**
   * Start-of-turn upkeep: status effects (stink, pepper...), then a 3-item
   * draft unless the bag is full. Returns { effects: [...], draft }.
   */
  startTurn() {
    const p = this.current;
    this.shot = new Shot();
    this.used = [];
    this.shotsLeft = 1;
    const effects = [];
    let skipped = false;
    for (const id of Object.keys(p.status)) {
      const fx = STATUSES[id].onTurnStart(this, p);
      if (!fx) continue;
      if (fx.damage) fx.damage = this.damage(this.turn, fx.damage);
      if (fx.skip) skipped = true;   // e.g. FROZEN: this turn is lost
      effects.push(fx);
    }
    // Floor hazards: hurt you if you're standing in one, then tick down (each lasts `rounds` x 2 turns).
    for (const h of this.hazards) {
      if (this.inHazard(p, h)) {
        const d = { idx: this.turn, amount: h.damage, type: 'burn', element: 'fire' };
        this.react(p, d);
        effects.push(d.amount > 0
          ? { damage: this.damage(this.turn, d.amount), text: 'BURN!', cls: 'dmg', hazard: h.type }
          : { text: 'FIZZLE!', cls: 'item', hazard: h.type });
      }
      h.left--;
    }
    this.hazards = this.hazards.filter((h) => h.left > 0);
    // Knocked out at the start of your own turn (stink, fire) with a teammate still up: turn passes.
    if (p.hp === 0) skipped = true;
    // A skipped turn gets no draft (keeps the RNG in step on every machine).
    this.draft = !skipped && p.items.length < BAG_SIZE ? rollDraft(this.rng, this.charOf(p).draftSize) : null;
    return { effects, draft: this.draft, skipped };
  }

  pickDraft(choice) {
    if (!this.draft || choice < 0 || choice >= this.draft.length) return null;
    if (this.current.items.length >= BAG_SIZE) { this.draft = null; return null; }
    const id = this.draft[choice];
    this.current.items.push(id);
    this.draft = null;
    return id;
  }

  /** Any number of items per turn, but each item type only once. */
  canUseItem(slot) {
    const id = this.current.items[slot];
    return !!id && !this.used.includes(id);
  }

  /** Uses an item from the current player's bag. Returns the item id or null. */
  useItem(slot) {
    if (!this.canUseItem(slot)) return null;
    const id = this.current.items.splice(slot, 1)[0];
    const item = ITEMS[id];
    this.used.push(id);
    item.onUse(this, this.current, this.opponent);
    item.modifyShot(this.shot);
    // Combos: any recipe completed by this item kicks in now.
    this.newCombos = [];
    for (const combo of Object.values(COMBOS)) {
      if (!this.shot.combos.includes(combo.id) && combo.matches(this.used)) {
        combo.onTrigger(this, this.current, this.opponent);
        combo.modifyShot(this.shot);
        this.shot.combos.push(combo.id);
        this.newCombos.push(combo.id);
      }
    }
    // Re-apply combos already active so later items can't undo them (e.g. DOUBLE after DUCK STORM).
    for (const id of this.shot.combos) if (!this.newCombos.includes(id)) COMBOS[id].modifyShot(this.shot);
    this.shotsLeft = this.shot.shots;
    return id;
  }

  endTurn() {
    const p = this.current;
    for (const id of Object.keys(p.status)) STATUSES[id].onTurnEnd(this, p);
    this.turn = this.nextPlayer();
    this.lastOf[this.current.team] = this.turn;
    this.rollWind();
  }

  // ---------- physics ----------
  launchPoint(idx) {
    const p = this.players[idx];
    return { x: p.x + LAUNCH.dx * p.facing, y: GROUND_Y + LAUNCH.dy };
  }

  /** One throw = one projectile per `shot.spread` entry, all flying at once. */
  volley(idx, angleDeg, power, shot = this.shot) {
    return shot.spread.map((off) => this.simulate(idx, angleDeg, Math.max(1, Math.min(100, power + off)), shot));
  }

  /** Apply every projectile of a volley, then count it as one shot. */
  applyVolley(flights) {
    const me = this.current;
    const before = this.players.map((p) => p.hp);
    for (const f of flights) {
      this.applyResult(f.result);
      if (f.result.hazard) this.hazards.push({ ...f.result.hazard });
      if (f.result.element === 'water' && f.result.kind !== 'out') {
        const before = this.hazards.length;
        this.hazards = this.hazards.filter((h) => !(h.type === 'fire' && Math.abs(h.x - f.result.x) <= h.radius + 24));
        if (this.hazards.length < before) this.events.push({ type: 'doused', x: f.result.x });
      }
    }
    // Passive: something that triggers when my volley actually hurt the foe (e.g. STICKY PAWS).
    let foe = null;
    this.players.forEach((p, i) => {
      if (p.team !== me.team && before[i] - p.hp > 0 && (!foe || before[i] - p.hp > before[this.players.indexOf(foe)] - foe.hp)) foe = p;
    });
    if (foe) {
      const ev = this.charOf(me).onVolleyHit(this, me, foe);
      if (ev) this.events.push({ ...ev, idx: this.turn });
    }
    this.shotsLeft--;
  }

  /** Runs the whole flight. Returns every frame's position and what it hit. */
  simulate(idx, angleDeg, power, shot = this.shot) {
    const p = this.players[idx];
    const grow = shot.hitGrow;
    let bouncesLeft = shot.bounces;

    const rad = (angleDeg * Math.PI) / 180;
    const speed = (power / 100) * MAX_SPEED;
    let { x, y } = this.launchPoint(idx);
    let vx = Math.cos(rad) * speed * shot.speedScale * p.facing;
    let vy = Math.sin(rad) * speed * shot.speedScale;
    const ww = shot.windWave;
    const fl = shot.flutter;
    const hm = shot.homing;
    const vx0 = shot.vortex;
    const vortexEnd = vx0 ? vx0.start + vx0.loops * vx0.period : -1;
    let sliding = false;
    // Homing target: whichever enemy the missile gets close to first.
    const targets = this.players
      .map((t, i) => ({ i, x: t.x + BODY.dx * t.facing, y: GROUND_Y + BODY.dy, t }))
      .filter((o) => o.t.team !== p.team && o.t.hp > 0);
    let foeX = 0, foeY = 0;
    const mult = this.charOf(p).damageMult;   // POWER stat
    const dmg = (n) => Math.max(1, Math.round(n * mult));
    const element = shot.element || undefined;
    let locked = false;
    const points = [{ x, y }];
    const blasts = [];   // extra explosions along the way (QUACK BOMB bounces)
    const done = (kind, damages = []) => {
      points.push({ x, y });
      if (shot.explosion) {
        kind = 'boom';
        damages = this.blast(idx, x, y, shot.blast, mult).map((d) => ({ ...d, element }));
      }
      for (const b of blasts) damages = damages.concat(b.damages);
      // TORNADO: lift whoever stands close to the landing spot and drop them.
      const lift = [];
      if (shot.tornado && kind !== 'out') {
        damages = damages.slice();
        for (let i = 0; i < this.players.length; i++) {
          if (i === idx) continue;
          const t = this.players[i];
          if (t.hp <= 0) continue;
          const bx = t.x + BODY.dx * t.facing;
          if (Math.abs(x - bx) <= shot.tornado.radius + BODY.r * this.charOf(t).sizeScale) {
            damages.push({ idx: i, amount: dmg(shot.tornado.damage), type: 'fall' });
            lift.push(i);
          }
        }
      }
      // Leave a floor hazard where it landed (not if it flew off screen).
      const hazard = shot.hazard && kind !== 'out' && x > 0 && x < W
        ? { type: shot.hazard.type, x: Math.round(x), radius: shot.hazard.radius, damage: shot.hazard.damage, left: shot.hazard.rounds * this.players.length }
        : null;
      return { points, result: { kind, x, y, damages, inflicts: shot.inflicts, style: shot.explosion?.style || 'bomb', blasts, hazard, lift, element } };
    };

    for (let step = 0; step < 1200; step++) {
      if (hm && !locked) {
        const tg = targets.find((o) => Math.hypot(x - o.x, y - o.y) < hm.range);
        if (tg) {
          locked = true;
          foeX = tg.x;
          foeY = tg.y;
          points.push({ x, y, lock: true, target: tg.i });
        }
      }
      const inVortex = vx0 && step >= vx0.start && step < vortexEnd;
      if (sliding) {
        // On the ice: glide along the ground, slowing down.
        vy = 0;
        y = GROUND_Y;
        const slow = shot.slide.friction * DT;
        vx = Math.abs(vx) <= slow ? 0 : vx - Math.sign(vx) * slow;
      } else if (inVortex) {
        // Spin the velocity (loops curl upward whichever way you throw), no gravity, drift forward.
        const a = ((2 * Math.PI) / vx0.period) * p.facing;
        const c = Math.cos(a), s = Math.sin(a);
        [vx, vy] = [vx * c - vy * s, vx * s + vy * c];
        x += vx0.drift * p.facing * DT;
        if (step === vx0.start) points.push({ x, y, vortex: true });
      } else if (locked) {
        // Steer toward the target: rotate velocity by at most `turn` per step, fixed speed.
        const cur = Math.atan2(vy, vx);
        let diff = Math.atan2(foeY - y, foeX - x) - cur;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const dir = cur + Math.max(-hm.turn, Math.min(hm.turn, diff));
        vx = Math.cos(dir) * hm.speed;
        vy = Math.sin(dir) * hm.speed;
      } else {
        const wind = this.wind + (ww ? ww.amp * Math.sin(step * ww.freq) : 0);
        vx += wind * WIND_ACCEL * shot.windScale * DT;
        vy -= GRAVITY * shot.gravityScale * DT;
        if (fl) vy += fl.amp * Math.sin(step * fl.freq) * DT;
      }
      x += vx * DT;
      y += vy * DT;

      for (let i = 0; i < this.players.length; i++) {
        if (i === idx && step < 30) continue;
        const t = this.players[i];
        if (t.hp <= 0 || (i !== idx && t.team === p.team)) continue;   // throws fly through teammates and KO'd animals
        const kind = hitTest(this.players[i], this.charOf(this.players[i]).sizeScale, x, y, grow);
        if (kind) return done(kind, [{ idx: i, amount: dmg(shot.damage[kind]), type: 'direct', element }]);
      }

      if (x >= WALL.x0 - grow / 2 && x <= WALL.x1 + grow / 2 && y <= WALL.y1 + grow / 2) return done('wall');

      if (sliding && Math.abs(vx) < 12) {
        // stopped sliding: settle like a normal landing (splash may still reach)
        y = GROUND_Y - 0.001;
      }
      if (y <= GROUND_Y && !(sliding && Math.abs(vx) >= 12)) {
        y = GROUND_Y;
        if (shot.slide && !sliding) {
          sliding = true;
          vx *= 0.9;
          points.push({ x, y, bounce: true });
          continue;
        }
        if (bouncesLeft > 0) {
          bouncesLeft--;
          vy = -vy * 0.6;
          vx *= 0.75;
          const blast = shot.bounceBlast && shot.explosion;
          if (blast) blasts.push({ x, y, damages: this.blast(idx, x, y, shot.blast, mult) });
          points.push({ x, y, bounce: true, blast: !!blast });
          continue;
        }
        // Near miss: splash hurts everyone close by except the thrower (yes, teammates too).
        const damages = [];
        this.players.forEach((t, i) => {
          if (i === idx || t.hp <= 0) return;
          const d = Math.abs(x - (t.x + BODY.dx * t.facing));
          const r = shot.splashRadius + BODY.r * (this.charOf(t).sizeScale - 1);   // bigger animals get splashed more
          if (d < r) damages.push({ idx: i, amount: dmg(shot.splashMax * (1 - d / r)), type: 'splash', element });
        });
        return done(damages.length ? 'splash' : 'ground', damages);
      }

      if (!locked && (x < -40 || x > W + 40)) return done('out');   // a locked missile turns back
      points.push({ x, y });
    }
    return done('out');
  }

  /**
   * Explosion: damage falls off with distance from the blast to each body.
   * Normally only the opponent is hurt; `self` blasts (NUKE) hurt the thrower too.
   */
  blast(idx, x, y, { radius, max, min, self = false }, mult = 1) {
    const out = [];
    for (let i = 0; i < this.players.length; i++) {
      if (i === idx && !self) continue;
      const t = this.players[i];
      if (t.hp <= 0) continue;
      const bx = t.x + BODY.dx * t.facing;
      const by = GROUND_Y + BODY.dy;
      const d = Math.max(0, Math.hypot(x - bx, y - by) - BODY.r * this.charOf(t).sizeScale);
      if (d < radius) out.push({ idx: i, amount: Math.round((min + (max - min) * (1 - d / radius)) * mult), type: 'blast' });
    }
    return out;
  }

  /**
   * Applies a throw's result. Statuses may block a hit (d.blockedBy = status id);
   * otherwise damage lands and the shot's statuses are inflicted (d.inflicted = [ids]).
   */
  applyResult(result) {
    for (const d of result.damages) {
      const p = this.players[d.idx];
      const blocker = Object.keys(p.status).find((id) => STATUSES[id].blocksHit(this, p));
      if (blocker) {
        d.blockedBy = blocker;
        continue;
      }
      // Element reactions (SHOCKED, SHATTER, GAS EXPLOSION...), then the defender's passive.
      this.react(p, d);
      d.amount = this.charOf(p).modifyIncoming(this, p, d);
      this.damage(d.idx, d.amount);
      d.inflicted = [];
      if (d.idx === this.turn) continue;   // your own nuke doesn't stink you (friendly fire does)
      for (const { status, value, direct } of result.inflicts) {
        if (direct && d.type !== 'direct') continue;   // e.g. ICE CUBE only freezes on a direct hit
        let v = value;
        for (const r of Object.values(REACTIONS)) {
          r.triggered = false;
          v = r.onInflict(this, p, status, v);
          if (r.triggered) this.events.push({ type: 'reaction', idx: d.idx, text: r.name, id: r.id });
        }
        this.addStatus(p, status, Math.max(v, p.status[status] || 0));
        d.inflicted.push(status);
      }
    }
    // Double knockout (e.g. a NUKE that wipes out both teams): the thrower's team loses.
    if (!this.teamAlive(0) && !this.teamAlive(1)) this.winner = 1 - this.current.team;
  }
}

function hitTest(p, scale, x, y, grow = 0) {
  const hx = p.x + HEAD.dx * p.facing;
  const hy = GROUND_Y + HEAD.dy;
  if ((x - hx) ** 2 + (y - hy) ** 2 <= (HEAD.r * scale + grow * 0.6) ** 2) return 'crit';
  const bx = p.x + BODY.dx * p.facing;
  const by = GROUND_Y + BODY.dy;
  if ((x - bx) ** 2 + (y - by) ** 2 <= (BODY.r * scale + grow) ** 2) return 'hit';
  return null;
}
