import { ANGLE_MIN, ANGLE_MAX } from './constants.js';
import { ITEMS } from './items/index.js';

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * CPU searches angle/power with the real simulation, then adds aiming error.
 * `skill` grows each CPU turn so it "zeroes in" like a human would.
 */
export function cpuChooseShot(game, idx, skill = 0) {
  const foe = game.players[1 - idx];
  let best = { score: Infinity, angle: 45, power: 70 };

  for (let angle = 25; angle <= 70; angle += 5) {
    for (let power = 20; power <= 100; power += 1) {
      const { result } = game.simulate(idx, angle, power);
      const dmg = result.damages.reduce((s, d) => s + (d.idx === 1 - idx ? d.amount : 0), 0);
      let score;
      if (dmg > 0) score = -dmg;
      else if (result.kind === 'wall') score = 200;
      else if (result.kind === 'out') score = 300;
      else score = Math.abs(result.x - foe.x);
      score += Math.abs(angle - 50) * 0.05 + Math.random() * 0.5;
      if (score < best.score) best = { score, angle, power };
    }
  }

  const err = Math.max(1.2, 6 - skill * 1.1);
  return {
    angle: clamp(best.angle + Math.round(gauss() * err * 0.4), ANGLE_MIN, ANGLE_MAX),
    power: clamp(Math.round(best.power + gauss() * err), 5, 100),
  };
}

// ---------- CPU item decisions (driven by Item.cpuPriority / cpuDraftScore / cpuWants) ----------

/** Which of the offered draft cards the CPU takes. */
export function cpuPickDraft(game, idx) {
  const me = game.players[idx];
  const offers = game.draft;
  // A little randomness so it's not predictable.
  if (Math.random() < 0.25) return Math.floor(Math.random() * offers.length);
  let best = 0;
  offers.forEach((id, i) => {
    if (ITEMS[id].cpuDraftScore(game, me) > ITEMS[offers[best]].cpuDraftScore(game, me)) best = i;
  });
  return best;
}

/**
 * Which items the CPU uses this turn (ids, in order). Defense/utility items
 * decide for themselves; attack items are saved up and fired as a combo.
 */
export function cpuPickItems(game, idx) {
  const me = game.players[idx];
  const bag = [...new Set(me.items)];
  const use = bag.filter((id) => ITEMS[id].kind !== 'attack' && ITEMS[id].cpuWants(game, me));
  const attack = bag
    .filter((id) => ITEMS[id].kind === 'attack')
    .sort((a, b) => ITEMS[b].cpuPriority - ITEMS[a].cpuPriority);
  if (attack.length >= 2 || me.items.length >= 4 || me.hp <= 30) use.push(...attack.slice(0, 3));
  else if (attack.length && Math.random() < 0.35) use.push(attack[0]);
  return use;
}
