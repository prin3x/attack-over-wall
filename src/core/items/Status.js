/**
 * Base class for lasting effects on a player (umbrella, stink, pepper...).
 * Stored on `player.status[id] = value` (a turn counter or `true`).
 * Add one by extending this class and calling `registerStatus()`.
 */
export class Status {
  constructor({ id, icon, label, visual = null, showCount = false }) {
    this.id = id;
    this.icon = icon;           // item id whose icon represents it in the HUD
    this.label = label;         // popup text when it triggers
    this.visual = visual;       // renderer effect: 'umbrella' | 'stink' | null
    this.showCount = showCount; // show the counter next to the HUD icon
  }

  /** Start of the owner's turn. Return { damage?, text?, cls?, sound? } to show feedback. */
  onTurnStart(game, player) { return null; } // eslint-disable-line no-unused-vars

  /** End of the owner's turn. */
  onTurnEnd(game, player) {} // eslint-disable-line no-unused-vars

  /** Return true to cancel incoming damage. */
  blocksHit(game, player) { return false; } // eslint-disable-line no-unused-vars

  /** Multiplier for the owner's power-bar speed. */
  powerRate(game, player) { return 1; } // eslint-disable-line no-unused-vars

  /** Degrees the owner's aim sways by itself while aiming (0 = steady). */
  aimSway(game, player) { return 0; } // eslint-disable-line no-unused-vars

  /** How badly the owner's power bar stutters while charging (0 = smooth, 1 = ZAPPED). */
  powerStagger(game, player) { return 0; } // eslint-disable-line no-unused-vars
}
