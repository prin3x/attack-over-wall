// All items and statuses in the game. Add new ones here (or in their own file imported here).
import { Item } from './Item.js';
import { Status } from './Status.js';
import { registerItem, registerStatus } from './registry.js';

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

// ---------------------------------------------------------------------
[ShieldStatus, StinkStatus, PepperStatus].forEach((S) => registerStatus(new S()));
[DoubleItem, BombItem, CalmItem, ShieldItem, FanItem, GiantItem, DuckItem, SockItem, PepperItem].forEach((I) => registerItem(new I()));
