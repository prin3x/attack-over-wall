import { ANGLE_MIN, ANGLE_MAX } from './constants.js';
import { ITEMS, combosCompletedBy, combosInBag } from './items/index.js';

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * CPU searches angle/power with the real simulation, then adds aiming error.
 * `skill` grows each CPU turn so it "zeroes in" like a human would.
 */
export function cpuChooseShot(game, idx, skill = 0) {
  const me = game.players[idx];
  const foes = game.enemiesOf(idx);
  let best = { score: Infinity, angle: 45, power: 70 };

  for (let angle = 25; angle <= 70; angle += 5) {
    for (let power = 20; power <= 100; power += 1) {
      const flights = game.volley(idx, angle, power);
      const result = flights[Math.floor(flights.length / 2)].result;
      let dmg = 0;
      // Damage to enemies is good; hurting myself or a teammate is bad.
      for (const f of flights) for (const d of f.result.damages) dmg += game.players[d.idx].team !== me.team ? d.amount : -1.5 * d.amount;
      let score;
      if (dmg !== 0) score = -dmg;
      else if (result.kind === 'wall') score = 200;
      else if (result.kind === 'out') score = 300;
      else score = Math.min(...foes.map((f) => Math.abs(result.x - f.x)));
      score += Math.abs(angle - 50) * 0.05 + Math.random() * 0.5;
      if (score < best.score) best = { score, angle, power };
    }
  }

  // Aiming error in power points: shrinks as the match goes on, and a faster power bar
  // (low CONTROL stat) makes the CPU sloppier just like it would a human.
  const err = Math.max(4.5, 9 - skill * 1.3) * game.charOf(game.players[idx]).controlRate;
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
  // Cards that complete a combo with the bag are worth a lot more.
  const score = (id) => ITEMS[id].cpuDraftScore(game, me) + Math.max(0, ...combosCompletedBy(id, me.items).map((c) => 5 + c.cpuPriority));
  offers.forEach((id, i) => {
    if (score(id) > score(offers[best])) best = i;
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
  // A full combo recipe in the bag? Fire the best one (plus anything urgent above).
  const combos = combosInBag(me.items).sort((a, b) => b.cpuPriority - a.cpuPriority);
  if (combos.length && Math.random() < 0.85) {
    for (const id of combos[0].recipe) if (!use.includes(id)) use.push(id);
    // Stack DOUBLE on top if we have it (two nukes, why not).
    if (bag.includes('double') && !use.includes('double')) use.push('double');
    return use;
  }
  const attack = bag
    .filter((id) => ITEMS[id].kind === 'attack')
    .sort((a, b) => ITEMS[b].cpuPriority - ITEMS[a].cpuPriority);
  if (attack.length >= 2 || me.items.length >= 4 || me.hp <= 30) use.push(...attack.slice(0, 3));
  else if (attack.length && Math.random() < 0.35) use.push(attack[0]);
  return use;
}
