# Fence Feud — Dog vs Cat

A turn-based, retro pixel-art artillery game built with **Three.js + Vite**.
Biscuit the dog and Miso the cat lob bones and fish bones over the backyard fence.

## Run

```bash
npm install
npm run dev          # game at http://localhost:5173 (CPU / same-PC modes)
npm run dev:server   # online server at :8787 (run alongside `npm run dev` for online play)
npm run build        # static build in dist/
npm run deploy       # build + deploy game and online server to Cloudflare
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
- **2P online**: CREATE ROOM gives a 5-letter code and an invite link (`?room=CODE`); your friend
  joins with the code or the link. You can watch each other aim live. Refreshing the page rejoins the match.

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
  net/online.js  online room client
  main.js     turn flow + input
server/       Cloudflare Worker + Room Durable Object (online play)
```

## Online (Cloudflare)

One Cloudflare Worker serves both the game (static files from `dist/`) and the rooms:

```
server/index.js   Worker: /api/new (create room), /api/room/:code (WebSocket), everything else = game files
                  Room Durable Object: one per room, holds both players' connections
server/match.js   runs the real rules from src/core and validates every move (turn order, items, angle/power)
src/net/online.js browser WebSocket client
```

- The server is authoritative: it simulates every throw itself and sends the resulting state each turn,
  so both screens always agree and moves can't be faked.
- Rooms use WebSocket hibernation (free plan friendly). A match is stored as seed + move log and
  replayed when a room wakes up.
- Live aiming is relayed (throttled) but not stored.

### Deploy

```bash
npx wrangler login   # once, opens the browser
npm run deploy       # -> https://fence-feud.<your-subdomain>.workers.dev
```

Everything fits in Cloudflare's free Workers plan (SQLite-backed Durable Objects).
Wrangler 3 is used because it runs on Node 20 (Wrangler 4 needs Node 22+).
