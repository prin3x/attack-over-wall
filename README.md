# Fence Feud — Dog vs Cat

A turn-based, retro pixel-art artillery game built with **Three.js + Vite**.
Biscuit the dog and Miso the cat lob bones and fish bones over the backyard fence.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## How to play

| Action | Keyboard | Mouse / touch |
| --- | --- | --- |
| Aim | `↑` `↓` or `W` `S` (tap = 1°, hold = fast) | Move the mouse: the angle follows the pointer from your character. Also `+` / `-` buttons |
| Throw | Hold `Space` to charge, release to throw | Press and hold on the field, release (you can keep dragging to adjust the angle while charging) |
| Back to menu | `Esc` | |
| Mute | `M` | |

- The power bar bounces 0 → 100 → 0, so release at the right moment.
- The white tick on the power bar marks your previous throw.
- **Wind** changes every turn (see the meter and the flag on the fence).
- Damage: head hit 30 (CRITICAL), body hit 20, near miss up to 12 (splash).

## Items

At the start of every turn you **draft 1 of 3 random item cards** (skipped if your bag is full).
Your bag holds 4 items. While aiming, click a slot or press `1`-`4`.

**Combos:** use as many items as you like in one turn (each item type once per turn).
Throw items stack, e.g. BOMB + DOUBLE = two bombs, BOMB + RUBBER DUCK = a bouncing bomb,
BOMB + STINKY SOCK + GIANT = a huge stinky blast.

| Item | Effect |
| --- | --- |
| BOMB | Explodes on contact: big blast radius, up to 32 splash damage |
| DOUBLE | Throw twice (same angle & power) |
| GIANT | 2x size: bigger hitbox, splash and blast |
| RUBBER DUCK | Bounces twice (15 dmg / 22 crit) |
| STINKY SOCK | 12 dmg + stink: -4 HP at the start of the target's next 3 turns |
| PEPPER | Thrown: if it hits, the target sneezes next turn (power bar 2.2x faster) |
| UMBRELLA | Blocks the next hit |
| CALM | Wind becomes 0 |
| BIG FAN | Strong tailwind toward the enemy |

## Adding a new item

Items are self-contained classes. Add one class to `src/core/items/catalog.js` and register it;
the draft, bag, icons, HUD, game rules and CPU all pick it up automatically.

```js
class BananaItem extends Item {
  constructor() {
    super({ id: 'banana', name: 'BANANA', desc: 'BOUNCES 4 TIMES', weight: 6, kind: 'attack', cpuPriority: 4 });
  }
  modifyShot(shot) {          // change this turn's throw (see src/core/shot.js)
    shot.bounces = 4;
    shot.setLook('banana', 2);  // fly using this item's icon
  }
  drawIcon(p) {               // 10x10 pixel icon; outline is added for you
    p.ellipse(5, 5, 4, 2, '#ffe066');
  }
}
registerItem(new BananaItem());
```

Hooks on `Item` (all optional):

| Hook | Use it for |
| --- | --- |
| `onUse(game, user, foe)` | Instant effects: change `game.wind`, `game.addStatus(...)` |
| `modifyShot(shot)` | Change the throw: `damage`/`capDamage`, `bounces`, `explosion`, `size`, `shots`, `inflicts`, `setLook`, `trails`, `spin` |
| `cpuDraftScore(game, me)` / `cpuWants(game, me)` | CPU behaviour (attack items are combo'd automatically by `cpuPriority`) |
| `drawIcon(p)` / `drawIconOverlay(p)` | Pixel icon (also used as the projectile sprite) |

Lasting effects are `Status` classes (`src/core/items/Status.js`) with `onTurnStart`, `onTurnEnd`,
`blocksHit` and `powerRate` hooks. Register them with `registerStatus()`, and have an item apply one with
`shot.inflicts.push({ status, value })` (on hit) or `game.addStatus(player, id, value)` (on use).

## Modes

- **1P vs CPU**: the CPU starts sloppy and gets more accurate each turn.
- **2P same PC**: hot-seat, same controls for both players.
- **2P online**: planned (see below).

## Project layout

```
src/
  core/       pure game rules: no DOM, no Three.js (shared by every mode)
    constants.js  tuning: gravity, wind, damage, hitboxes
    game.js       Game state + deterministic simulate(angle, power)
    shot.js       Shot: this turn's throw, modified by items (stacks for combos)
    items/        Item + Status base classes, registry, catalog of all items
    ai.js         CPU shot search + draft/item choices
    rng.js        seeded PRNG
  render/     Three.js scene, procedural pixel art
  ui/hud.js   HTML overlay (HP, wind, power, menus)
  audio/sfx.js  WebAudio bleeps
  main.js     turn flow + input
```

## Online plan

The simulation is deterministic: a turn is just `{ angle, power }`, and wind comes from a seeded RNG.
For online play, a small WebSocket relay server only has to pair two players in a room,
share the seed, and forward each turn's `{ angle, power }`. Both browsers then replay the same throw.
