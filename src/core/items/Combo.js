/**
 * A combo triggers when every item in `recipe` has been used in the same turn.
 * It runs after the items' own `modifyShot`, so it can override or extend them.
 * Combos stack: BOMB + GIANT + DOUBLE = NUKE, thrown twice.
 *
 * Add one by extending this class in catalog.js and calling `registerCombo()`.
 */
export class Combo {
  constructor({ id, name, desc, recipe, cpuPriority = 5 }) {
    this.id = id;
    this.name = name;       // big popup text, e.g. 'NUKE!'
    this.desc = desc;       // one-line effect text
    this.recipe = recipe;   // item ids, e.g. ['bomb', 'giant']
    this.cpuPriority = cpuPriority; // higher = CPU goes for this combo first
  }

  /** Instant effect the moment the combo completes (e.g. consume a status). */
  onTrigger(game, user, foe) {} // eslint-disable-line no-unused-vars

  /** True when all recipe items have been used this turn. */
  matches(used) {
    return this.recipe.every((id) => used.includes(id));
  }

  /** Change this turn's throw (see core/shot.js). */
  modifyShot(shot) {} // eslint-disable-line no-unused-vars

  /** Optional pixel icon (10x10). If drawn, `shot.setLook(this.id, ...)` can fly it as the projectile. */
  drawIcon(p) {} // eslint-disable-line no-unused-vars
  drawIconOverlay(p) {} // eslint-disable-line no-unused-vars
}
