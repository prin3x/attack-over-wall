import {
  W, GROUND_Y, DT, GRAVITY, MAX_SPEED, WIND_ACCEL, MAX_WIND, MAX_HP,
  WALL, PLAYER_X, LAUNCH, HEAD, BODY,
} from './constants.js';
import { mulberry32 } from './rng.js';
import { Shot } from './shot.js';
import { ITEMS, STATUSES, BAG_SIZE, rollDraft } from './items/index.js';

/**
 * Pure game state + rules. No rendering, no input, and no item-specific code:
 * items act through Item hooks (core/items) and the Shot they modify.
 *
 * Everything random comes from the seeded RNG, and every player decision is a
 * small value (draft pick, item slot, angle, power), so online play can just
 * exchange those decisions and both sides stay in sync.
 */
export class Game {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.players = [0, 1].map((i) => ({
      x: PLAYER_X[i],
      facing: i === 0 ? 1 : -1,
      hp: MAX_HP,
      angle: 45,
      items: [],
      status: {},   // status id -> value (turns left or true)
    }));
    this.turn = 0;
    this.winner = null;
    this.wind = 0;
    this.shot = new Shot();
    this.used = [];       // item ids used this turn (each type once per turn)
    this.shotsLeft = 1;
    this.draft = null;
    this.rollWind();
  }

  get current() { return this.players[this.turn]; }
  get opponent() { return this.players[1 - this.turn]; }

  rollWind() {
    this.wind = Math.round(this.rng() * MAX_WIND * 2 - MAX_WIND);
  }

  // ---------- online sync ----------
  /** Plain-data copy of everything that matters between turns (sent by the server). */
  snapshot() {
    return {
      turn: this.turn,
      wind: this.wind,
      winner: this.winner,
      draft: this.draft ? [...this.draft] : null,
      players: this.players.map((p) => ({ hp: p.hp, angle: p.angle, items: [...p.items], status: { ...p.status } })),
    };
  }

  /** Overwrite local state with the server's (keeps both screens identical). */
  applySnapshot(s) {
    this.turn = s.turn;
    this.wind = s.wind;
    this.winner = s.winner;
    this.draft = s.draft ? [...s.draft] : null;
    s.players.forEach((sp, i) => {
      const p = this.players[i];
      p.hp = sp.hp;
      p.angle = sp.angle;
      p.items = [...sp.items];
      p.status = { ...sp.status };
    });
  }

  // ---------- statuses ----------
  addStatus(p, id, value) { p.status[id] = value; }
  removeStatus(p, id) { delete p.status[id]; }

  /** Power-bar speed multiplier from statuses (e.g. pepper). */
  powerRate(p) {
    return Object.keys(p.status).reduce((m, id) => m * STATUSES[id].powerRate(this, p), 1);
  }

  damage(idx, amount) {
    const p = this.players[idx];
    const dealt = Math.min(amount, p.hp);
    p.hp -= dealt;
    if (p.hp === 0) this.winner = 1 - idx;
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
    for (const id of Object.keys(p.status)) {
      const fx = STATUSES[id].onTurnStart(this, p);
      if (!fx) continue;
      if (fx.damage) fx.damage = this.damage(this.turn, fx.damage);
      effects.push(fx);
    }
    this.draft = p.items.length < BAG_SIZE ? rollDraft(this.rng) : null;
    return { effects, draft: this.draft };
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
    this.shotsLeft = this.shot.shots;
    return id;
  }

  endTurn() {
    const p = this.current;
    for (const id of Object.keys(p.status)) STATUSES[id].onTurnEnd(this, p);
    this.turn = 1 - this.turn;
    this.rollWind();
  }

  // ---------- physics ----------
  launchPoint(idx) {
    const p = this.players[idx];
    return { x: p.x + LAUNCH.dx * p.facing, y: GROUND_Y + LAUNCH.dy };
  }

  /** Runs the whole flight. Returns every frame's position and what it hit. */
  simulate(idx, angleDeg, power, shot = this.shot) {
    const p = this.players[idx];
    const grow = shot.hitGrow;
    let bouncesLeft = shot.bounces;

    const rad = (angleDeg * Math.PI) / 180;
    const speed = (power / 100) * MAX_SPEED;
    let { x, y } = this.launchPoint(idx);
    let vx = Math.cos(rad) * speed * p.facing;
    let vy = Math.sin(rad) * speed;
    const ax = this.wind * WIND_ACCEL;
    const points = [{ x, y }];
    const done = (kind, damages = []) => {
      points.push({ x, y });
      if (shot.explosion) {
        kind = 'boom';
        damages = this.blast(idx, x, y, shot.blast);
      }
      return { points, result: { kind, x, y, damages, inflicts: shot.inflicts } };
    };

    for (let step = 0; step < 1200; step++) {
      vx += ax * DT;
      vy -= GRAVITY * DT;
      x += vx * DT;
      y += vy * DT;

      for (let i = 0; i < 2; i++) {
        if (i === idx && step < 30) continue;
        const kind = hitTest(this.players[i], x, y, grow);
        if (kind) return done(kind, [{ idx: i, amount: shot.damage[kind] }]);
      }

      if (x >= WALL.x0 - grow / 2 && x <= WALL.x1 + grow / 2 && y <= WALL.y1 + grow / 2) return done('wall');

      if (y <= GROUND_Y) {
        y = GROUND_Y;
        if (bouncesLeft > 0) {
          bouncesLeft--;
          vy = -vy * 0.6;
          vx *= 0.75;
          points.push({ x, y, bounce: true });
          continue;
        }
        const damages = [];
        const t = this.players[1 - idx];
        const d = Math.abs(x - (t.x + BODY.dx * t.facing));
        const r = shot.splashRadius;
        if (d < r) damages.push({ idx: 1 - idx, amount: Math.max(1, Math.round(shot.splashMax * (1 - d / r))) });
        return done(damages.length ? 'splash' : 'ground', damages);
      }

      if (x < -40 || x > W + 40) return done('out');
      points.push({ x, y });
    }
    return done('out');
  }

  /** Explosion: damage falls off with distance from the blast to the target's body. */
  blast(idx, x, y, { radius, max, min }) {
    const t = this.players[1 - idx];
    const bx = t.x + BODY.dx * t.facing;
    const by = GROUND_Y + BODY.dy;
    const d = Math.max(0, Math.hypot(x - bx, y - by) - BODY.r);
    if (d >= radius) return [];
    return [{ idx: 1 - idx, amount: Math.round(min + (max - min) * (1 - d / radius)) }];
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
      this.damage(d.idx, d.amount);
      d.inflicted = [];
      for (const { status, value } of result.inflicts) {
        this.addStatus(p, status, value);
        d.inflicted.push(status);
      }
    }
    this.shotsLeft--;
  }
}

function hitTest(p, x, y, grow = 0) {
  const hx = p.x + HEAD.dx * p.facing;
  const hy = GROUND_Y + HEAD.dy;
  if ((x - hx) ** 2 + (y - hy) ** 2 <= (HEAD.r + grow * 0.6) ** 2) return 'crit';
  const bx = p.x + BODY.dx * p.facing;
  const by = GROUND_Y + BODY.dy;
  if ((x - bx) ** 2 + (y - by) ** 2 <= (BODY.r + grow) ** 2) return 'hit';
  return null;
}
