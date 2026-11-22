// All playable animals. Add new ones here.
import { Character } from './Character.js';
import { registerCharacter } from './registry.js';

const N = '#1c1220';   // outline / ink
const WHITE = '#ffffff';

// =====================================================================
// BISCUIT the dog - all-rounder. Passive: drafts show 4 cards.
// =====================================================================
class Biscuit extends Character {
  constructor() {
    super({
      id: 'biscuit', name: 'BISCUIT', animal: 'DOG',
      stats: { hp: 3, power: 4, size: 3, control: 3 },
      passive: { name: 'GOOD BOY', desc: 'DRAFTS SHOW 4 CARDS' },
      projectile: { rows: ['w.....w', 'wwwwwww', 'w.....w'], palette: { w: WHITE } },
      colors: { main: '#c07a3c' },
      taunts: ['WOOF WOOF!', 'GOOD BOY!', 'FETCH THAT!', 'BARK-ED IT!', 'WHO LET THE DOG OUT?'],
      victory: ['WHO IS A GOOD BOY? ME!', 'SIT. STAY. LOSE.', 'BURY THIS LOSS IN THE YARD', 'TREAT TIME FOR ME!', 'YOU GOT SCHOOLED, PUP'],
    });
  }
  get draftSize() { return 4; }
  drawFrame(p, f) {
    const B = '#c07a3c', D = '#83502a', L = '#f2d3a0', R = '#dc3c3c', T = '#ef6f8f';
    const bob = f === 'idle1' ? 1 : 0;
    const hy = 9 + bob;

    // tail
    if (f === 'idle1' || f === 'win') p.thick(4, 14 + bob, 1, 10 + bob, B);
    else p.thick(4, 14 + bob, 1, 13 + bob, B);
    // legs (far pair darker)
    p.rect(6, 18, 2, 4, D); p.rect(13, 18, 2, 4, D);
    p.rect(8, 18, 2, 4, B); p.rect(15, 18, 2, 4, B);
    p.rect(8, 21, 2, 1, L); p.rect(15, 21, 2, 1, L);
    // body
    p.ellipse(11, 15.5 + bob, 7, 4.5, B);
    p.ellipse(12, 17.5 + bob, 4, 1.8, L);
    p.ellipse(7, 13.5 + bob, 2, 1.5, L);
    // head
    p.ellipse(16.5, hy, 5, 4.5, B);
    p.ellipse(20.5, hy + 2, 2.5, 2, L);
    p.set(21, hy + 1, N); p.set(22, hy + 1, N);
    if (f === 'throw' || f === 'win') { p.set(20, hy + 4, T); p.set(21, hy + 4, T); }
    // floppy ear
    p.rect(12, hy - 5, 3, 2, D);
    p.rect(11, hy - 3, 3, 5, D);
    // eyes
    if (f === 'hurt') {
      p.set(17, hy - 2, N); p.set(19, hy - 2, N); p.set(18, hy - 1, N); p.set(17, hy, N); p.set(19, hy, N);
    } else if (f === 'win') {
      p.set(18, hy - 2, N); p.set(17, hy - 1, N); p.set(19, hy - 1, N);
    } else {
      p.set(18, hy - 1, N); p.set(18, hy, N);
    }
    // bandana
    p.rect(13, hy + 4, 6, 2, R);
    p.rect(12, hy + 5, 2, 2, R);
    // arms
    if (f === 'windup') {
      p.thick(14, 13, 11, 8, D);
      p.rect(10, 6, 2, 2, L);
      p.rect(8, 5, 4, 1, WHITE); p.set(8, 4, WHITE); p.set(8, 6, WHITE); p.set(11, 4, WHITE); p.set(11, 6, WHITE);
    } else if (f === 'throw') {
      p.line(17, 13, 21, 11, D); p.line(17, 14, 21, 12, D);
      p.rect(22, 11, 1, 2, L);
    } else if (f === 'win') {
      p.thick(13, 12, 12, 7, D); p.thick(18, 12, 19, 7, D);
      p.rect(12, 6, 2, 1, L); p.rect(19, 6, 2, 1, L);
    } else {
      p.rect(16, 14 + bob, 2, 3, D);
      p.rect(16, 17 + bob, 2, 1, L);
    }
  }
}

// =====================================================================
// MISO the cat - small, slippery. Passive: survives one knockout.
// =====================================================================
class Miso extends Character {
  constructor() {
    super({
      id: 'miso', name: 'MISO', animal: 'CAT',
      stats: { hp: 1, power: 3, size: 2, control: 4 },
      passive: { name: 'NINE LIVES', desc: 'SURVIVES ONE KO WITH 1 HP' },
      projectile: { rows: ['w.w.w.w.ww.', '.wwwwwwwwkw', 'w.w.w.w.ww.'], palette: { w: WHITE, k: N } },
      colors: { main: '#9aa0b4' },
      taunts: ['MEOW-HAHA!', 'TOO SLOW!', 'PURR-FECT!', 'CAT-ASTROPHE!', 'NAP TIME FOR YOU'],
      victory: ['I HAD 8 LIVES TO SPARE', 'YOU ARE NOT EVEN A SNACK', 'BOW TO YOUR CAT OVERLORD', 'THAT WAS A HAIRBALL', 'PURR-FECT VICTORY'],
    });
  }
  onLethal(game, me) {
    if (me.flags.nineLives) return false;
    me.flags.nineLives = true;
    return true;
  }
  drawFrame(p, f) {
    const G = '#9aa0b4', S = '#5f6478', A = '#7a8096', L = '#e6e8ef', E = '#8be04e', P = '#f08aa0', C = '#3a8be0';
    const bob = f === 'idle1' ? 1 : 0;
    const hy = 9 + bob;

    // tail curling up
    p.thick(4, 16 + bob, 2, 13 + bob, G);
    p.thick(2, 13 + bob, 2, 8 + bob, G);
    const tip = f === 'idle1' || f === 'win' ? -1 : 0;
    p.rect(2 + tip, 6 + bob, 2, 2, S);
    // legs
    p.rect(7, 18, 2, 4, A); p.rect(14, 18, 2, 4, A);
    p.rect(9, 18, 2, 4, G); p.rect(16, 18, 2, 4, G);
    p.rect(9, 21, 2, 1, L); p.rect(16, 21, 2, 1, L);
    // body + stripes
    p.ellipse(11.5, 15.5 + bob, 6.5, 4, G);
    p.ellipse(12, 17.5 + bob, 4, 1.6, L);
    p.rect(8, 12 + bob, 1, 3, S); p.rect(11, 12 + bob, 1, 3, S);
    // head
    p.ellipse(16.5, hy + 0.5, 4.8, 4, G);
    // ears
    p.set(13, hy - 6, G); p.rect(13, hy - 5, 2, 1, G); p.rect(12, hy - 4, 4, 1, G);
    p.set(19, hy - 6, G); p.rect(18, hy - 5, 2, 1, G); p.rect(17, hy - 4, 4, 1, G);
    p.set(13, hy - 4, P); p.set(19, hy - 4, P);
    p.set(16, hy - 3, S); p.set(16, hy - 2, S); p.set(15, hy - 3, S);
    // muzzle + nose
    p.ellipse(19.5, hy + 2, 2.2, 1.4, L);
    p.set(21, hy + 1, P);
    if (f === 'throw' || f === 'win') { p.set(20, hy + 3, P); }
    // eyes
    if (f === 'hurt') {
      p.rect(15, hy, 2, 1, N); p.rect(18, hy, 2, 1, N);
    } else if (f === 'win') {
      p.set(16, hy - 1, N); p.set(15, hy, N); p.set(17, hy, N);
      p.set(19, hy - 1, N); p.set(18, hy, N); p.set(20, hy, N);
    } else {
      p.set(16, hy - 1, E); p.set(16, hy, N);
      p.set(19, hy - 1, E); p.set(19, hy, N);
    }
    // scarf
    p.rect(13, hy + 4, 6, 2, C);
    p.rect(12, hy + 6, 2, 2, C);
    // arms
    if (f === 'windup') {
      p.thick(14, 13, 11, 8, A);
      p.rect(10, 6, 2, 2, L);
      p.rect(7, 5, 5, 1, WHITE); p.set(7, 4, WHITE); p.set(7, 6, WHITE); p.set(9, 4, WHITE); p.set(9, 6, WHITE);
    } else if (f === 'throw') {
      p.line(17, 13, 21, 11, A); p.line(17, 14, 21, 12, A);
      p.rect(22, 11, 1, 2, L);
    } else if (f === 'win') {
      p.thick(13, 12, 12, 7, A); p.thick(18, 12, 19, 7, A);
      p.rect(12, 6, 2, 1, L); p.rect(19, 6, 2, 1, L);
    } else {
      p.rect(16, 14 + bob, 2, 3, A);
      p.rect(16, 17 + bob, 2, 1, L);
    }
  }
}

// =====================================================================
// SHELLY the turtle - tank. Passive: half damage from splash (near misses).
// =====================================================================
class Shelly extends Character {
  constructor() {
    super({
      id: 'shelly', name: 'SHELLY', animal: 'TURTLE',
      stats: { hp: 4, power: 4, size: 4, control: 3 },
      passive: { name: 'SHELL', desc: 'HALF DAMAGE FROM SPLASH (NEAR MISSES)' },
      projectile: { rows: ['.ggg.', 'gGggg', 'ggggg', '.ggg.'], palette: { g: '#9a9aa8', G: '#d6d6e0' } },
      colors: { main: '#4f8a3c' },
      taunts: ['SHELL YEAH!', 'SLOW AND STEADY!', 'TURTLE POWER!', 'YAWN...', 'HARD SHELL, SOFT YOU'],
      victory: ['SLOW AND STEADY WINS!', 'I AM 150 YEARS OLD AND STILL WON', 'GET SHELL-SHOCKED', 'NAP? I WAS WINNING', 'COME BACK STRONGER, KID'],
    });
  }
  // Only near misses: bombs and combos still hit a turtle at full strength.
  modifyIncoming(game, me, d) {
    return d.type === 'splash' ? Math.ceil(d.amount / 2) : d.amount;
  }
  drawFrame(p, f) {
    const S = '#4f8a3c', D = '#3a6b2c', H = '#8fbf5a', K = '#9cc76a', Y = '#e8d48a';
    const bob = f === 'idle1' ? 1 : 0;
    const hy = 10 + bob;
    // stubby legs + tail
    p.rect(4, 19, 3, 3, K); p.rect(13, 19, 3, 3, K);
    p.rect(7, 19, 3, 3, K); p.rect(16, 19, 3, 3, K);
    p.set(2, 17 + bob, K); p.set(1, 18 + bob, K);
    // shell: dome with plates and a light rim
    p.ellipse(10.5, 15 + bob, 8.5, 6, S);
    p.rect(3, 18 + bob, 16, 2, Y);
    p.rect(2, 17 + bob, 18, 1, H);
    for (const [x, y] of [[7, 12], [11, 11], [14, 13], [9, 15], [5, 15], [13, 16]]) {
      p.rect(x, y + bob, 2, 2, D);
    }
    // neck + head
    p.rect(17, hy + 3, 3, 3, K);
    p.ellipse(19.5, hy + 1, 3.6, 3.2, K);
    if (f === 'hurt') { p.set(20, hy, N); p.set(21, hy, N); }
    else if (f === 'win') { p.set(20, hy - 1, N); p.set(19, hy, N); p.set(21, hy, N); }
    else { p.set(20, hy, N); p.set(20, hy - 1, N); }
    p.set(22, hy + 2, N);                       // smile
    if (f === 'throw' || f === 'win') p.set(21, hy + 3, '#ef6f8f');
    // arms
    if (f === 'windup') {
      p.thick(15, 15, 13, 9, K);
      p.rect(11, 6, 3, 3, '#9a9aa8');            // pebble in hand
    } else if (f === 'throw') {
      p.line(17, 15, 22, 13, K); p.line(17, 16, 22, 14, K);
    } else if (f === 'win') {
      p.thick(13, 13, 12, 7, K); p.thick(16, 13, 17, 7, K);
    }
  }
}

// =====================================================================
// BANDIT the raccoon - trickster. Passive: hits steal an item.
// =====================================================================
class Bandit extends Character {
  constructor() {
    super({
      id: 'bandit', name: 'BANDIT', animal: 'RACCOON',
      stats: { hp: 2, power: 3, size: 2, control: 3 },
      passive: { name: 'STICKY PAWS', desc: 'HITS STEAL A RANDOM ITEM' },
      projectile: { rows: ['..b..', '.rrr.', '..y..', '..y..', '.rrr.'], palette: { b: '#6b4a2e', r: '#e04848', y: '#f2e6b0' } },
      colors: { main: '#8a8f9a' },
      taunts: ['THANKS FOR THE LOOT!', 'SNEAKY!', 'TRASH TALK!', 'CATCH YA LATER!', 'FINDERS KEEPERS!'],
      victory: ['YOUR STUFF IS MY STUFF NOW', 'I STOLE YOUR DIGNITY TOO', 'BACK TO THE TRASH BIN!', 'EZ LOOT', 'NO REFUNDS!'],
    });
  }
  onVolleyHit(game, me, foe) {
    if (!foe.items.length || me.items.length >= 4) return null;
    const k = Math.floor(game.rng() * foe.items.length);
    const id = foe.items.splice(k, 1)[0];
    me.items.push(id);
    return { type: 'steal', item: id };
  }
  drawFrame(p, f) {
    const G = '#8a8f9a', D = '#5a5e68', L = '#d4d6de', M = '#2e3038', A = '#6e7380';
    const bob = f === 'idle1' ? 1 : 0;
    const hy = 9 + bob;
    // ringed tail
    const tip = f === 'idle1' || f === 'win' ? -1 : 0;
    p.thick(5, 16 + bob, 2 + tip, 9 + bob, G);
    p.rect(3 + tip, 12 + bob, 2, 1, M); p.rect(2 + tip, 10 + bob, 2, 1, M);
    // legs
    p.rect(7, 18, 2, 4, D); p.rect(14, 18, 2, 4, D);
    p.rect(9, 18, 2, 4, G); p.rect(16, 18, 2, 4, G);
    p.rect(9, 21, 2, 1, M); p.rect(16, 21, 2, 1, M);
    // body
    p.ellipse(11.5, 15.5 + bob, 6.5, 4.2, G);
    p.ellipse(12, 17.5 + bob, 4, 1.6, L);
    // head + ears
    p.ellipse(16.5, hy + 0.5, 5, 4.2, G);
    p.rect(13, hy - 5, 2, 2, G); p.rect(18, hy - 5, 2, 2, G);
    p.set(13, hy - 4, L); p.set(19, hy - 4, L);
    // the mask
    p.rect(14, hy - 1, 7, 2, M);
    p.set(14, hy + 1, M);
    // eyes (white shine in the mask)
    if (f === 'hurt') { p.rect(15, hy, 2, 1, L); p.rect(18, hy, 2, 1, L); }
    else if (f === 'win') { p.set(16, hy - 1, L); p.set(19, hy - 1, L); }
    else { p.set(16, hy - 1, WHITE); p.set(19, hy - 1, WHITE); }
    // snout + nose
    p.ellipse(20.5, hy + 2, 2.3, 1.5, L);
    p.set(22, hy + 1, M);
    if (f === 'throw' || f === 'win') p.set(21, hy + 3, '#ef6f8f');
    // arms
    if (f === 'windup') {
      p.thick(14, 13, 11, 8, A);
      p.rect(10, 6, 2, 2, M);
      p.rect(8, 4, 3, 3, '#e04848');              // apple core
    } else if (f === 'throw') {
      p.line(17, 13, 21, 11, A); p.line(17, 14, 21, 12, A);
      p.rect(22, 11, 1, 2, M);
    } else if (f === 'win') {
      p.thick(13, 12, 12, 7, A); p.thick(18, 12, 19, 7, A);
      p.rect(12, 6, 2, 1, M); p.rect(19, 6, 2, 1, M);
    } else {
      p.rect(16, 14 + bob, 2, 3, A);
      p.rect(16, 17 + bob, 2, 1, M);
    }
  }
}

[Biscuit, Miso, Shelly, Bandit].forEach((C) => registerCharacter(new C()));
