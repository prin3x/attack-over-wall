/** id -> Character instance */
export const CHARACTERS = {};

export function registerCharacter(c) {
  if (CHARACTERS[c.id]) throw new Error(`Duplicate character id: ${c.id}`);
  CHARACTERS[c.id] = c;
}

export const DEFAULT_CHARACTERS = ['biscuit', 'miso'];
