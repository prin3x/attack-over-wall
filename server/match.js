// Server-side match: runs the real game rules (src/core) and validates every move.
// Pure module (no Cloudflare APIs) so it can be tested in Node.
import { Game } from '../src/core/game.js';
import { ANGLE_MIN, ANGLE_MAX } from '../src/core/constants.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Match {
  constructor(seed, chars) {
    this.seed = seed >>> 0;
    this.chars = chars;
    this.game = new Game(this.seed, chars);
    this.n = 0;          // turn number (matches the client's counter)
    this.log = [];       // accepted moves: [seat, msg], used to rebuild after hibernation
    this.nextTurn();
  }

  /** Rebuild a match by replaying its move log (deterministic). */
  static replay(seed, log, chars) {
    const m = new Match(seed, chars);
    for (const [seat, msg] of log) m.apply(seat, msg);
    return m;
  }

  nextTurn() {
    this.game.startTurn();
    this.n++;
  }

  get state() {
    return { n: this.n, state: this.game.snapshot() };
  }

  /**
   * Apply a move from `seat`. Returns { error } or
   * { relay: message for the opponent, turn?: new turn state for both }.
   */
  apply(seat, msg) {
    const g = this.game;
    if (g.winner !== null) return { error: 'game over' };
    if (seat !== g.turn) return { error: 'not your turn' };

    switch (msg.t) {
      case 'pick': {
        const i = msg.i | 0;
        if (!g.draft || !g.pickDraft(i)) return { error: 'bad pick' };
        this.log.push([seat, { t: 'pick', i }]);
        return { relay: { t: 'pick', i } };
      }
      case 'use': {
        const slot = msg.slot | 0;
        if (g.draft) return { error: 'pick an item first' };
        if (!g.useItem(slot)) return { error: 'cannot use that item' };
        this.log.push([seat, { t: 'use', slot }]);
        return { relay: { t: 'use', slot } };
      }
      case 'throw': {
        const angle = Number(msg.angle);
        const power = Number(msg.power);
        if (!Number.isFinite(angle) || !Number.isFinite(power)) return { error: 'bad throw' };
        if (g.draft) return { error: 'pick an item first' };
        const a = clamp(angle, ANGLE_MIN, ANGLE_MAX);
        const pw = clamp(power, 0, 100);
        g.players[seat].angle = a;
        // DOUBLE etc: keep throwing with the same angle/power while shots remain.
        do {
          g.applyVolley(g.volley(seat, a, pw));
        } while (g.shotsLeft > 0 && g.winner === null);
        if (g.winner === null) {
          g.endTurn();
          this.nextTurn();
        }
        this.log.push([seat, { t: 'throw', angle: a, power: pw }]);
        return { relay: { t: 'throw', angle: a, power: pw }, turn: this.state };
      }
      default:
        return { error: 'unknown move' };
    }
  }
}
