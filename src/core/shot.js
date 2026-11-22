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
    this.explosion = null;     // { radius, max, min } -> explodes on contact
    this.size = 1;             // 2 = GIANT (bigger sprite, hitbox, splash, blast)
    this.shots = 1;            // throws this turn
    this.inflicts = [];        // statuses applied to whoever takes damage: [{ status, value }]
    this.look = 'normal';      // sprite: 'normal' | 'bomb' | 'duck' | 'sock' ...
    this.lookRank = 0;
    this.trails = [];          // particle trails while flying: 'fuse' | 'stink'
    this.spin = 'spin';        // in-flight motion: 'spin' | 'wobble'
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
    if (!this.explosion) return null;
    const { radius, max, min } = this.explosion;
    return { radius: radius * (1 + (this.size - 1) * 0.4), max: max + (this.size - 1) * 6, min };
  }
}
