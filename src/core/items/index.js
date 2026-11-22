// Public entry point for the item system.
export { Item } from './Item.js';
export { Status } from './Status.js';
export { ITEMS, STATUSES, BAG_SIZE, DRAFT_SIZE, registerItem, registerStatus, rollDraft } from './registry.js';
import './catalog.js'; // registers the built-in items & statuses
