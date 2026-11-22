import { DMG_HIT, DMG_CRIT, SPLASH_RADIUS, SPLASH_MAX } from './constants.js';

/**
 * Everything about this turn's throw. Starts as a plain bone/fishbone and
 * each used item tweaks it in `Item.modifyShot()`. Every field is designed so
 * items stack in any order, which is what makes combos work
 * (e.g. BOMB + DUCK = a bomb that bounces before exploding).
 */
export class Shot {
  constructor() {
    this.damage = { hit: DMG_HIT, crit: DMG_CRIT }; // direct-hit damage
    this.bounces = 0;          // ground bounces before stopping
    this.explosion = null;     // { radius, max, min, self?, style?, fixed? } -> explodes on contact
                               //   self: also hurts the thrower; fixed: ignore GIANT scaling; style: visual
    this.size = 1;             // 2 = GIANT (bigger sprite, hitbox, splash, blast)
    this.shots = 1;            // throws this turn
    this.inflicts = [];        // statuses applied to whoever takes damage: [{ status, value, direct? }]
                               //   direct: only on a direct hit (not splash / blast)
    this.element = null;       // 'fire' | 'ice' | 'water' | 'shock': tags every hit for reactions
    this.look = 'normal';      // sprite: 'normal' | 'bomb' | 'duck' | 'sock' ...
    this.lookRank = 0;
    this.trails = [];          // particle trails while flying: 'fuse' | 'stink'
    this.spin = 'spin';        // in-flight motion: 'spin' | 'wobble'
    this.spread = [0];         // projectiles per throw, as power offsets (e.g. [-10, -5, 0, 5, 10])
    this.bounceBlast = false;  // explode on every bounce, not just at the end
    this.combos = [];          // combo ids active this turn
    // Flight physics knobs (all deterministic, so online stays in sync)
    this.gravityScale = 1;     // 0.35 = floaty (parachute)
    this.windScale = 1;        // 0 = ignores wind, 3 = blown around
    this.speedScale = 1;       // launch speed multiplier
    this.windWave = null;      // { amp, freq }: wind swings back and forth during flight
    this.tornado = null;       // { radius, damage }: a twister touches down where it lands; anyone within
                               //   `radius` px is lifted up and dropped for `damage` (type 'fall')
    this.slide = null;         // { friction }: on landing it slides along the ground instead of stopping
    this.vortex = null;        // { start, loops, period, drift }: after `start` steps the throw does
                               //   `loops` loop-de-loops (`period` steps each), drifting `drift` px/s forward
    this.flutter = null;       // { amp, freq }: flaps up and down
    this.hazard = null;        // { type, radius, rounds, damage }: leaves something on the floor where it lands
                               //   (e.g. FIRE BOMB fire). Hurts whoever stands in it at their turn start.
    this.homing = null;        // { range, turn, speed }: locks on when within `range` px of the foe,
                               //   then steers (max `turn` radians/step) at `speed`, ignoring gravity & wind
  }

  /** Several items may want to change the sprite; the highest rank wins. */
  setLook(look, rank) {
    if (rank > this.lookRank) {
      this.look = look;
      this.lookRank = rank;
    }
  }

  /** Lower direct-hit damage (keeps the lowest when several items cap it). */
  capDamage(hit, crit) {
    this.damage = { hit: Math.min(this.damage.hit, hit), crit: Math.min(this.damage.crit, crit) };
  }

  // Size-derived numbers (order independent).
  get hitGrow() { return (this.size - 1) * 4; }
  get splashRadius() { return SPLASH_RADIUS * (1 + (this.size - 1) * 0.6); }
  get splashMax() { return SPLASH_MAX * (1 + (this.size - 1) * 0.4); }
  get blast() {
    const e = this.explosion;
    if (!e) return null;
    if (e.fixed) return { ...e };
    return { ...e, radius: e.radius * (1 + (this.size - 1) * 0.4), max: e.max + (this.size - 1) * 6 };
  }
}
