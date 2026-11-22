export const BAG_SIZE = 4;
export const DRAFT_SIZE = 3;

/** id -> Item instance */
export const ITEMS = {};
/** id -> Status instance */
export const STATUSES = {};
/** id -> Combo instance */
export const COMBOS = {};

export function registerItem(item) {
  if (ITEMS[item.id]) throw new Error(`Duplicate item id: ${item.id}`);
  ITEMS[item.id] = item;
}

export function registerCombo(combo) {
  if (COMBOS[combo.id]) throw new Error(`Duplicate combo id: ${combo.id}`);
  COMBOS[combo.id] = combo;
}

export function registerStatus(status) {
  if (STATUSES[status.id]) throw new Error(`Duplicate status id: ${status.id}`);
  STATUSES[status.id] = status;
}

/**
 * Combos that `itemId` would complete, given the items already in `bag`
 * (and optionally items already used this turn).
 */
export function combosCompletedBy(itemId, bag, used = []) {
  const have = new Set([...bag, ...used, itemId]);
  return Object.values(COMBOS).filter((c) => c.recipe.includes(itemId) && c.recipe.every((r) => have.has(r)));
}

/** Combos whose whole recipe is sitting in `bag` right now. */
export function combosInBag(bag) {
  return Object.values(COMBOS).filter((c) => c.recipe.every((r) => bag.includes(r)));
}

/** Pick `n` distinct items, weighted, using the game's seeded RNG. */
export function rollDraft(rng, n = DRAFT_SIZE) {
  const pool = Object.keys(ITEMS);
  const out = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, id) => s + ITEMS[id].weight, 0);
    let r = rng() * total;
    let i = 0;
    while (r >= ITEMS[pool[i]].weight) r -= ITEMS[pool[i++]].weight;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
