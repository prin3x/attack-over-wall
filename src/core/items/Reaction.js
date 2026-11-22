/**
 * Element reactions: what happens when a hit meets a status already on the
 * target (WET + lightning = SHOCKED, FROZEN + any hit = SHATTER...).
 * They make combos work across turns: set up a status now, cash it in later.
 *
 * Damage entries carry `type` ('direct' | 'splash' | 'blast' | 'fall' | 'burn' | 'shock')
 * and `element` ('fire' | 'ice' | 'wine' | 'shock' | undefined).
 * Add one by extending this class in catalog.js and calling `registerReaction()`.
 */
export class Reaction {
  constructor({ id, name, desc, icons }) {
    this.id = id;
    this.name = name;     // popup text, e.g. 'SHOCKED!'
    this.desc = desc;     // one line for the COMBO BOOK
    this.icons = icons;   // item ids shown in the COMBO BOOK, e.g. ['wine', 'lightning']
  }

  /** A hit `d` is about to land on `target`. Change d.amount / statuses; return true if it triggered. */
  onHit(game, target, d) { return false; } // eslint-disable-line no-unused-vars

  /** A status is about to be applied. Return a new value (or the same); set this.triggered to show a popup. */
  onInflict(game, target, status, value) { return value; } // eslint-disable-line no-unused-vars
}
