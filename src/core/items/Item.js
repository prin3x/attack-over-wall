/**
 * Base class for every item. To add an item, extend this class in
 * `catalog.js` (or a new file imported there) and call `registerItem()`.
 * Nothing else in the codebase needs to change: the draft, bag, HUD, icons,
 * game rules and CPU all read from the registry.
 *
 * kind:
 *   'attack'  - changes the throw. The CPU saves these and fires them as combos.
 *   'defense' / 'utility' - the CPU asks `cpuWants()` each turn.
 */
export class Item {
  constructor({ id, name, desc, weight = 8, kind = 'utility', cpuPriority = 5, usePopup = null }) {
    this.id = id;
    this.name = name;             // shown on cards and popups (pixel font: keep it short, caps)
    this.desc = desc;             // one-line effect text
    this.weight = weight;         // draft odds relative to other items
    this.kind = kind;
    this.cpuPriority = cpuPriority; // higher = CPU drafts/uses it first
    this.usePopup = usePopup;     // optional { text, on: 'self' | 'foe' } shown when used
  }

  /** Instant effect when used: change wind, add a status, etc. */
  onUse(game, user, foe) {} // eslint-disable-line no-unused-vars

  /** Change this turn's throw (see core/shot.js). Called once when used. */
  modifyShot(shot) {} // eslint-disable-line no-unused-vars

  /** CPU: how much it wants this card in a draft. */
  cpuDraftScore(game, me) { return this.cpuPriority; } // eslint-disable-line no-unused-vars

  /** CPU: use this non-attack item now? (attack items use the combo logic in ai.js) */
  cpuWants(game, me) { return false; } // eslint-disable-line no-unused-vars

  /** Pixel icon on a 10x10 grid (coords 0..9). An outline is added automatically. */
  drawIcon(p) {} // eslint-disable-line no-unused-vars

  /** Optional pixels drawn on top of the outline (sparks, stink lines...). */
  drawIconOverlay(p) {} // eslint-disable-line no-unused-vars
}
