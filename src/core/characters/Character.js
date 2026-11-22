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

  // ----- dancing on two legs (taunts + victory) -----
  // A shared upright body; each animal adds its head (danceHead) and tail/shell (danceBack).
  // `dancePalette` = { body, belly, limb, paw }.

  /** Dance pose k (0-2): 0 = raise the roof, 1 = disco squat, 2 = leg kick. */
  drawDance(p, k) {
    const c = this.dancePalette;
    if (!c) { this.drawFrame(p, 'win'); return; }
    const pose = DANCE_POSES[k];
    const dy = pose.dy;
    this.danceBack(p, k, dy);
    for (const leg of pose.legs) {
      for (let i = 0; i < leg.length - 2; i += 2) p.thick(leg[i], leg[i + 1], leg[i + 2], leg[i + 3], c.limb);
      p.rect(leg[leg.length - 2] - 1, leg[leg.length - 1], 3, 1, c.paw);
    }
    p.ellipse(12, 13 + dy, 4, 4.5, c.body);
    p.ellipse(12.5, 14 + dy, 2.5, 3, c.belly);
    this.danceBody(p, k, dy);
    for (const [x0, y0, x1, y1] of pose.arms) {
      p.thick(x0, y0 + dy, x1, y1 + dy, c.limb);
      p.rect(x1, y1 + dy, 2, 1, c.paw);
    }
    this.danceHead(p, k, dy, 5 + dy);
  }

  /** Behind the body: tail, shell... */
  danceBack(p, k, dy) {} // eslint-disable-line no-unused-vars
  /** On top of the body: stripes, markings... */
  danceBody(p, k, dy) {} // eslint-disable-line no-unused-vars
  /** The head, centered around (13, hy). */
  danceHead(p, k, dy, hy) {} // eslint-disable-line no-unused-vars
}

// Legs: polylines [x0,y0, x1,y1, ...] ending at the foot; arms: [shoulder x,y, hand x,y]. Facing right.
const DANCE_POSES = [
  { dy: 0, legs: [[10, 17, 9, 21], [13, 17, 17, 19]], arms: [[8, 11, 6, 3], [15, 11, 17, 3]] },
  { dy: 1, legs: [[10, 17, 7, 19, 8, 21], [13, 17, 16, 19, 15, 21]], arms: [[8, 11, 4, 14], [15, 11, 19, 4]] },
  { dy: 0, legs: [[10, 17, 6, 19], [13, 17, 14, 21]], arms: [[8, 11, 5, 3], [15, 11, 19, 14]] },
];
