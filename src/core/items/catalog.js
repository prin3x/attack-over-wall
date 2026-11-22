// All items and statuses in the game. Add new ones here (or in their own file imported here).
import { Item } from './Item.js';
import { Status } from './Status.js';
import { Combo } from './Combo.js';
import { registerItem, registerStatus, registerCombo } from './registry.js';

const OUTLINE = '#1c1220';
const WHITE = '#ffffff';
const headwind = (game, me) => game.wind * me.facing <= -5;

// =====================================================================
// Statuses
// =====================================================================

class ShieldStatus extends Status {
  constructor() { super({ id: 'shield', icon: 'shield', label: 'UMBRELLA!', visual: 'umbrella' }); }
  blocksHit(game, p) {
    game.removeStatus(p, this.id);
    return true;
  }
}

class StinkStatus extends Status {
  constructor() { super({ id: 'stink', icon: 'sock', label: 'STINKY!', visual: 'stink', showCount: true }); }
  onTurnStart(game, p) {
    const left = p.status.stink - 1;
    if (left > 0) p.status.stink = left;
    else game.removeStatus(p, this.id);
    return { damage: 4, text: 'STINKY!', cls: 'stink' };
  }
}

class BurnStatus extends Status {
  constructor() { super({ id: 'burn', icon: 'pepper', label: 'ON FIRE!', visual: 'burn', showCount: true }); }
  onTurnStart(game, p) {
    const left = p.status.burn - 1;
    if (left > 0) p.status.burn = left;
    else game.removeStatus(p, this.id);
    return { damage: 7, text: 'BURN!', cls: 'dmg' };
  }
}

class PepperStatus extends Status {
  constructor() { super({ id: 'pepper', icon: 'pepper', label: 'PEPPERED!' }); }
  onTurnStart() { return { text: 'ACHOO!', cls: 'item', sound: 'sneeze' }; }
  onTurnEnd(game, p) { game.removeStatus(p, this.id); }
  powerRate() { return 2.2; }
}

// =====================================================================
// Attack items (change the throw, stack into combos)
// =====================================================================

class BombItem extends Item {
  constructor() { super({ id: 'bomb', name: 'BOMB', desc: 'BIG BLAST, HEAVY SPLASH', kind: 'attack', cpuPriority: 10 }); }
  modifyShot(shot) {
    shot.explosion = { radius: 44, max: 32, min: 6 };
    shot.setLook('bomb', 3);
    shot.trails.push('fuse');
  }
  drawIcon(p) {
    p.ellipse(4.5, 6, 4, 3.6, '#2a2a3a');
    p.set(3, 4, '#7a7a90'); p.set(2, 5, '#55556a'); p.set(3, 5, '#55556a');
    p.rect(4, 2, 2, 1, '#55556a');
    p.set(6, 1, '#c8a060'); p.set(7, 0, '#c8a060');
  }
  drawIconOverlay(p) { p.set(9, 0, '#ffd84a'); p.set(10, 1, '#ff8a2a'); p.set(9, 1, WHITE); p.set(8, 0, '#ff8a2a'); }
}

class DoubleItem extends Item {
  constructor() { super({ id: 'double', name: 'DOUBLE', desc: 'THROW TWICE', kind: 'attack', cpuPriority: 8 }); }
  modifyShot(shot) { shot.shots = 2; }
  drawIcon(p) {
    for (const y of [1, 6]) {
      p.rect(1, y + 1, 8, 1, WHITE);
      p.set(0, y, WHITE); p.set(0, y + 2, WHITE); p.set(9, y, WHITE); p.set(9, y + 2, WHITE);
    }
  }
}

class GiantItem extends Item {
  constructor() { super({ id: 'giant', name: 'GIANT', desc: 'HUGE THROW, BIG SPLASH', weight: 7, kind: 'attack', cpuPriority: 7 }); }
  modifyShot(shot) { shot.size = 2; }
  drawIcon(p) {
    p.rect(2, 3, 6, 4, WHITE);
    for (const [x, y] of [[1.5, 2.5], [1.5, 7.5], [8.5, 2.5], [8.5, 7.5]]) p.ellipse(x, y, 1.6, 1.6, WHITE);
    p.rect(3, 4, 4, 1, '#d6dae4');
  }
}

class SockItem extends Item {
  constructor() { super({ id: 'sock', name: 'STINKY SOCK', desc: 'STINK: -4 HP X3 TURNS', weight: 7, kind: 'attack', cpuPriority: 5 }); }
  modifyShot(shot) {
    shot.capDamage(12, 18);
    shot.inflicts.push({ status: 'stink', value: 3 });
    shot.setLook('sock', 1);
    shot.trails.push('stink');
  }
  drawIcon(p) {
    p.rect(3, 0, 3, 7, '#e6e8ef'); p.rect(3, 6, 6, 3, '#e6e8ef');
    p.rect(3, 1, 3, 1, '#e04848'); p.rect(7, 6, 2, 3, '#c8c0a0');
  }
  drawIconOverlay(p) { p.set(9, 1, '#7fd35a'); p.set(10, 2, '#7fd35a'); p.set(9, 3, '#7fd35a'); p.set(10, 4, '#7fd35a'); }
}

class DuckItem extends Item {
  constructor() { super({ id: 'duck', name: 'RUBBER DUCK', desc: 'BOUNCES TWICE', weight: 7, kind: 'attack', cpuPriority: 3 }); }
  modifyShot(shot) {
    shot.bounces = 2;
    shot.capDamage(15, 22);
    shot.setLook('duck', 2);
    shot.spin = 'wobble';
  }
  drawIcon(p) {
    p.ellipse(4.5, 7, 4, 2.5, '#ffd84a'); p.ellipse(6.5, 3.5, 2.2, 2.2, '#ffd84a');
    p.set(9, 4, '#ff8a2a'); p.set(7, 3, OUTLINE); p.set(2, 6, '#f0b030'); p.set(3, 6, '#f0b030');
  }
}

class PepperItem extends Item {
  constructor() { super({ id: 'pepper', name: 'PEPPER', desc: 'HIT FOE SNEEZES: FAST BAR', weight: 6, kind: 'attack', cpuPriority: 2 }); }
  // Thrown: the pepper flies instead of the bone, and the sneeze only lands if it hits.
  modifyShot(shot) {
    shot.inflicts.push({ status: 'pepper', value: true });
    shot.setLook('pepper', 1);
  }
  drawIcon(p) {
    const R = '#e0302a';
    p.rect(4, 3, 3, 3, R); p.rect(3, 5, 3, 3, R); p.rect(2, 7, 2, 2, R); p.set(1, 9, R);
    p.set(5, 4, '#ff8a7a'); p.rect(5, 1, 2, 2, '#3f9a44'); p.set(7, 0, '#3f9a44');
  }
}

// =====================================================================
// Defense / utility items
// =====================================================================

class ShieldItem extends Item {
  constructor() { super({ id: 'shield', name: 'UMBRELLA', desc: 'BLOCKS NEXT HIT', kind: 'defense', cpuPriority: 9 }); }
  onUse(game, user) { game.addStatus(user, 'shield', true); }
  cpuDraftScore(game, me) { return me.hp <= 50 ? 100 : this.cpuPriority; }
  cpuWants(game, me) { return !me.status.shield && me.hp <= 50; }
  drawIcon(p) {
    for (let y = 1; y <= 4; y++)
      for (let x = 0; x < 10; x++) {
        const dx = (x + 0.5 - 5) / 5, dy = (y + 0.5 - 5) / 4;
        if (dx * dx + dy * dy <= 1) p.set(x, y, x % 4 < 2 ? '#e04848' : WHITE);
      }
    p.line(5, 5, 5, 8, '#4a3a2a'); p.set(4, 9, '#4a3a2a'); p.set(3, 8, '#4a3a2a');
  }
}

class CalmItem extends Item {
  constructor() { super({ id: 'calm', name: 'CALM', desc: 'NO WIND THIS TURN', weight: 10, cpuPriority: 6 }); }
  onUse(game) { game.wind = 0; }
  cpuWants(game, me) { return headwind(game, me) && !me.items.includes('fan'); }
  drawIcon(p) {
    p.ellipse(3, 6.5, 2.5, 2, WHITE); p.ellipse(6, 5.5, 3, 2.5, WHITE); p.ellipse(8.2, 6.8, 1.8, 1.6, WHITE);
    p.set(4, 6, '#5f6478'); p.set(7, 6, '#5f6478');
  }
  drawIconOverlay(p) { for (const [x, y] of [[9, 1], [10, 1], [10, 2], [9, 3], [10, 3]]) p.set(x, y, '#8fd8ff'); }
}

class FanItem extends Item {
  constructor() { super({ id: 'fan', name: 'BIG FAN', desc: 'STRONG TAILWIND', weight: 7, cpuPriority: 4 }); }
  onUse(game, user) { game.wind = 8 * user.facing; }
  cpuWants(game, me) { return headwind(game, me); }
  drawIcon(p) {
    p.rect(4, 0, 2, 4, '#8fd8ff'); p.rect(6, 4, 4, 2, '#3a8be0');
    p.rect(4, 6, 2, 4, '#8fd8ff'); p.rect(0, 4, 4, 2, '#3a8be0');
    p.rect(4, 4, 2, 2, '#ffd84a');
  }
}

// =====================================================================
// Combos (all recipe items used in the same turn)
// =====================================================================

class NukeCombo extends Combo {
  constructor() { super({ id: 'nuke', name: 'NUKE!', desc: 'MASSIVE BLAST - DONT HIT YOURSELF', recipe: ['bomb', 'giant'], cpuPriority: 10 }); }
  modifyShot(shot) {
    shot.explosion = { radius: 80, max: 45, min: 10, self: true, style: 'nuke', fixed: true };
    shot.setLook('nuke', 10);
    shot.trails.push('nuke');
  }
  // Fat yellow warhead with a radiation sign and fins.
  drawIcon(p) {
    p.ellipse(4.5, 4.5, 4.2, 4.2, '#ffd84a');
    p.set(4, 4, OUTLINE); p.set(5, 4, OUTLINE);                      // center
    p.rect(3, 1, 4, 2, OUTLINE); p.set(4, 2, '#ffd84a'); p.set(5, 2, '#ffd84a');
    p.rect(1, 5, 2, 3, OUTLINE); p.rect(7, 5, 2, 3, OUTLINE);
    p.set(2, 6, '#ffd84a'); p.set(7, 6, '#ffd84a');
    p.rect(3, 9, 4, 1, '#9a9aa8');
  }
}

class QuackBombCombo extends Combo {
  constructor() { super({ id: 'quackbomb', name: 'QUACK BOMB!', desc: 'EXPLODES ON EVERY BOUNCE', recipe: ['bomb', 'duck'], cpuPriority: 8 }); }
  modifyShot(shot) {
    shot.bounceBlast = true;
    shot.bounces = 3;
    shot.setLook('duck', 4);   // a duck... with a fuse
  }
}

class DuckStormCombo extends Combo {
  constructor() { super({ id: 'duckstorm', name: 'DUCK STORM!', desc: '5 DUCKS AT ONCE', recipe: ['duck', 'double'], cpuPriority: 7 }); }
  modifyShot(shot) {
    shot.spread = [-10, -5, 0, 5, 10];
    shot.shots = 1;            // DOUBLE is spent on the storm instead
  }
}

class SpicyStinkCombo extends Combo {
  constructor() { super({ id: 'spicystink', name: 'SPICY STINK!', desc: 'STINK 5 TURNS + SNEEZE', recipe: ['sock', 'pepper'], cpuPriority: 5 }); }
  modifyShot(shot) {
    for (const inf of shot.inflicts) if (inf.status === 'stink') inf.value = 5;
    shot.trails.push('fuse');
  }
}

class DuckzillaCombo extends Combo {
  constructor() { super({ id: 'duckzilla', name: 'DUCKZILLA!', desc: 'GIANT DUCK, 4 BOUNCES, 30 DMG', recipe: ['giant', 'duck'], cpuPriority: 6 }); }
  modifyShot(shot) {
    shot.size = 3;
    shot.bounces = 4;
    shot.damage = { hit: 30, crit: 40 };
    shot.spin = 'wobble';
  }
}

class HomingCombo extends Combo {
  constructor() { super({ id: 'homing', name: 'HOMING MISSILE!', desc: 'LOCKS ON WHEN IT GETS CLOSE', recipe: ['fan', 'bomb'], cpuPriority: 9 }); }
  modifyShot(shot) {
    shot.homing = { range: 110, turn: 0.12, speed: 240 };
    shot.windScale = 0;          // fins: wind can't push it
    shot.gravityScale = 0.75;    // a bit of thrust before lock-on
    shot.setLook('homing', 8);
    shot.spin = 'point';         // nose follows the flight path
    shot.trails = shot.trails.filter((t) => t !== 'fuse');
    shot.trails.push('fire');
  }
  // Grey missile pointing right: red nose, fins at the back.
  drawIcon(p) {
    p.rect(1, 4, 7, 2, '#c8ccd6');
    p.rect(2, 5, 5, 1, '#8a8f9e');
    p.rect(8, 4, 1, 2, '#e04848'); p.set(9, 4, '#e04848'); p.set(9, 5, '#e04848');
    p.set(0, 3, '#e04848'); p.set(1, 3, '#e04848'); p.set(0, 6, '#e04848'); p.set(1, 6, '#e04848');
  }
}

class ParachuteCombo extends Combo {
  constructor() { super({ id: 'parachute', name: 'PARACHUTE BOMB!', desc: 'FLOATS DOWN, WIND X3', recipe: ['shield', 'bomb'], cpuPriority: 3 }); }
  // Your umbrella becomes the parachute, so you don't keep it.
  onTrigger(game, user) { game.removeStatus(user, 'shield'); }
  modifyShot(shot) {
    shot.gravityScale = 0.35;
    shot.windScale = 3;
    shot.setLook('parachute', 6);
    shot.spin = 'wobble';
  }
  drawIcon(p) {
    for (let y = 0; y <= 3; y++)
      for (let x = 0; x < 10; x++) {
        const dx = (x + 0.5 - 5) / 5, dy = (y + 0.5 - 4) / 4;
        if (dx * dx + dy * dy <= 1) p.set(x, y, x % 4 < 2 ? '#e04848' : WHITE);
      }
    p.line(1, 4, 4, 7, '#4a3a2a'); p.line(8, 4, 5, 7, '#4a3a2a');
    p.ellipse(4.5, 8, 2, 1.8, '#2a2a3a');
  }
}

class TornadoCombo extends Combo {
  constructor() { super({ id: 'tornado', name: 'TORNADO!', desc: 'WIND GOES CRAZY MID-FLIGHT', recipe: ['calm', 'fan'], cpuPriority: 1 }); }
  modifyShot(shot) { shot.windWave = { amp: 14, freq: 0.09 }; }
}

class FireBombCombo extends Combo {
  constructor() { super({ id: 'firebomb', name: 'FIRE BOMB!', desc: 'BLAST + BURN 7 DMG X2 TURNS', recipe: ['bomb', 'pepper'], cpuPriority: 8 }); }
  modifyShot(shot) {
    shot.inflicts = shot.inflicts.filter((i) => i.status !== 'pepper');
    shot.inflicts.push({ status: 'burn', value: 2 });
    shot.trails.push('fire');
  }
}

class FlappyDuckCombo extends Combo {
  constructor() { super({ id: 'flappy', name: 'FLAPPY DUCK!', desc: 'THE DUCK FLAPS UP AND DOWN', recipe: ['fan', 'duck'], cpuPriority: 2 }); }
  modifyShot(shot) { shot.flutter = { amp: 1800, freq: 0.22 }; }
}

// ---------------------------------------------------------------------
[ShieldStatus, StinkStatus, PepperStatus, BurnStatus].forEach((S) => registerStatus(new S()));
[DoubleItem, BombItem, CalmItem, ShieldItem, FanItem, GiantItem, DuckItem, SockItem, PepperItem].forEach((I) => registerItem(new I()));
[NukeCombo, QuackBombCombo, DuckStormCombo, SpicyStinkCombo, DuckzillaCombo, HomingCombo, ParachuteCombo, TornadoCombo, FireBombCombo, FlappyDuckCombo].forEach((C) => registerCombo(new C()));
