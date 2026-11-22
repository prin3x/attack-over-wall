// Public entry point for the item system.
export { Item } from './Item.js';
export { Status } from './Status.js';
export { Combo } from './Combo.js';
export { Reaction } from './Reaction.js';
export { ITEMS, STATUSES, COMBOS, REACTIONS, BAG_SIZE, DRAFT_SIZE, registerItem, registerStatus, registerCombo, registerReaction, rollDraft, combosCompletedBy, combosInBag } from './registry.js';
import './catalog.js'; // registers the built-in items & statuses
