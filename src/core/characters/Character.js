import { DRAFT_SIZE } from '../items/registry.js';

// Stat (1-5) -> game numbers. 3 = the baseline everything was tuned around.
const HP = [0, 70, 85, 100, 115, 130];
const POWER = [0, 0.8, 0.9, 1, 1.1, 1.2];        // damage multiplier on your throws
const SIZE = [0, 0.8, 0.9, 1, 1.15, 1.3];        // hitbox scale (bigger = easier to hit)
const CONTROL = [0, 1.3, 1.15, 1, 0.85, 0.7];    // power-bar speed (lower = easier timing)

/**
 * Base class for a playable animal. Add one by extending this class in
 * roster.js and calling `registerCharacter()`: the select screen, HUD,
 * sprites, game rules, CPU and online server all read from the registry.
 */
export class Character {
  constructor({ id, name, animal, stats, passive, projectile, colors, taunts = ['HAHA!'], victory = ['TOO EASY!'] }) {
    this.id = id;
    this.name = name;            // shown everywhere, caps (pixel font)
    this.animal = animal;        // e.g. 'DOG'
    this.stats = stats;          // { hp, power, size, control } each 1..5
    this.passive = passive;      // { name, desc }
    this.projectile = projectile; // { rows: [...], palette: {...} } default throw sprite
    this.colors = colors;        // { main } used for UI accents
    this.taunts = taunts;        // trash talk shown in a bubble while dancing after a hit
    this.victory = victory;      // extra-smug lines cycled while dancing on the game-over screen
  }

  get maxHp() { return HP[this.stats.hp]; }
  get damageMult() { return POWER[this.stats.power]; }
  get sizeScale() { return SIZE[this.stats.size]; }
  get controlRate() { return CONTROL[this.stats.control]; }

  // ----- passive hooks (all optional) -----

  /** Cards offered in this character's draft. */
  get draftSize() { return DRAFT_SIZE; }

  /** Change incoming damage d = { amount, type: 'direct'|'splash'|'blast' }. Return the new amount. */
  modifyIncoming(game, me, d) { return d.amount; } // eslint-disable-line no-unused-vars

  /** About to be knocked out. Return true to survive with 1 HP. */
  onLethal(game, me) { return false; } // eslint-disable-line no-unused-vars

  /** After my volley damaged the foe. Return an event for the UI, or null. */
  onVolleyHit(game, me, foe) { return null; } // eslint-disable-line no-unused-vars

  /** Pixel art on a 24x24 canvas (drawn facing right). frame: idle0|idle1|windup|throw|hurt|win */
  drawFrame(p, frame) {} // eslint-disable-line no-unused-vars
}
