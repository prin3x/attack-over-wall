import * as THREE from 'three';
import { W, H, GROUND_Y, WALL, PLAYER_X, MAX_WIND, LAUNCH, spawnX } from '../core/constants.js';
import { DEFAULT_CHARACTERS } from '../core/characters/index.js';
import { buildArt } from './art.js';

function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Plane whose anchor (ax, ay in 0..1) sits at the mesh origin. */
function quad(w, h, ax = 0.5, ay = 0.5) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate((0.5 - ax) * w, (0.5 - ay) * h, 0);
  return g;
}

function sprite(map, ax, ay, order) {
  const { width, height } = map.image;
  const m = new THREE.Mesh(
    quad(width, height, ax, ay),
    new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.5, depthTest: false }),
  );
  m.renderOrder = order;
  return m;
}

export class Renderer {
  constructor(canvas) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.gl.setPixelRatio(1);
    this.gl.setSize(W, H, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);
    this.time = 0;
    this.shake = 0;
    this.wind = 0;

    const art = buildArt();
    // Oversized sky/dirt backdrop so camera shake never reveals the clear color.
    for (const [y, h, c] of [[GROUND_Y, H, 0x3d8fd8], [-20, GROUND_Y + 20, 0x9a6a3e]]) {
      const m = new THREE.Mesh(quad(W + 40, h + 20, 0.5, 0), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
      m.position.set(W / 2, y, 0);
      m.renderOrder = -1;
      this.scene.add(m);
    }
    this.scene.add(sprite(tex(art.background), 0, 0, 0));

    // clouds
    const cloudTex = tex(art.cloud);
    this.clouds = [[30, 150], [140, 162], [230, 140], [300, 158]].map(([x, y]) => {
      const m = sprite(cloudTex, 0.5, 0.5, 1);
      m.position.set(x, y, 0);
      this.scene.add(m);
      return m;
    });

    // wind flag on the fence
    this.flag = sprite(tex(art.flag), 0, 1, 2);
    this.flag.position.set(161, WALL.y1 + 16, 0);
    this.scene.add(this.flag);

    // players: textures for every character, swapped in per match
    this.charArt = art.characters;   // canvases (also used by the select screen)
    this.charTex = Object.fromEntries(
      Object.entries(art.characters).map(([id, a]) => [
        id,
        { frames: Object.fromEntries(Object.entries(a.frames).map(([k, v]) => [k, tex(v)])), projectile: tex(a.projectile) },
      ]),
    );
    // Up to 4 animals (2v2); setCharacters() decides how many are on the field.
    this.players = [0, 1, 2, 3].map((i) => {
      const frames = this.charTex[DEFAULT_CHARACTERS[i % 2]].frames;
      const mesh = sprite(frames.idle0, 0.5, 0, 5);
      mesh.scale.x = i % 2 === 0 ? 1 : -1;
      mesh.visible = i < 2;
      this.scene.add(mesh);
      return { frames, mesh, state: 'idle', t: 0, facing: i % 2 === 0 ? 1 : -1, x: spawnX(4)[i], active: i < 2, ko: false };
    });
    PLAYER_X.forEach((x, i) => (this.players[i].x = x));

    // umbrella shown above a shielded player
    const umbrellaTex = tex(art.icons.shield);
    this.umbrellas = this.players.map((p) => {
      const m = sprite(umbrellaTex, 0.5, 0, 6);
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.status = [[], [], [], []];

    // frozen: a see-through ice block around the character
    const iceTex = tex(art.iceBlock);
    this.iceBlocks = this.players.map(() => {
      const m = new THREE.Mesh(quad(30, 28, 0.5, 0), new THREE.MeshBasicMaterial({ map: iceTex, transparent: true, opacity: 0.55, depthTest: false }));
      m.renderOrder = 5.2;
      m.visible = false;
      this.scene.add(m);
      return m;
    });   // per player: list of status visuals ('umbrella', 'stink')

    // projectile + off-screen marker
    this.icons = art.icons;
    // Default throws per player; any item can fly using its own icon (shot.look = item id).
    this.projTex = { normal: [0, 1, 2, 3].map((i) => this.charTex[DEFAULT_CHARACTERS[i % 2]].projectile) };
    for (const [id, cv] of Object.entries({ ...art.icons, ...art.comboIcons })) this.projTex[id] = tex(cv);
    this.effects = [];
    // Several projectiles can fly at once (DUCK STORM), each with its own off-screen marker.
    const markerTex = tex(art.marker);
    this.projs = Array.from({ length: 6 }, () => {
      const mesh = sprite(this.projTex.normal[0], 0.5, 0.5, 6);
      const marker = sprite(markerTex, 0.5, 1, 9);
      mesh.visible = false;
      marker.visible = false;
      this.scene.add(mesh, marker);
      return { mesh, marker };
    });
    this.marker = this.projs[0].marker;

    // Lock-on crosshair (HOMING MISSILE): a red ring + 4 ticks around the target.
    this.reticle = new THREE.Group();
    const red = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, depthTest: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 10, 24), red);
    this.reticle.add(ring);
    for (const [dx, dy, w, h] of [[0, 13, 1, 5], [0, -13, 1, 5], [13, 0, 5, 1], [-13, 0, 5, 1]]) {
      const tick = new THREE.Mesh(quad(w, h), red);
      tick.position.set(dx, dy, 0);
      this.reticle.add(tick);
    }
    this.reticle.children.forEach((c) => (c.renderOrder = 9));
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    // Where each player's previous throw landed (arrow pointing down at the ground).
    this.landings = [0xffb060, 0x8fd8ff, 0xffb060, 0x8fd8ff].map((color) => {
      const m = sprite(markerTex, 0.5, 1, 4);
      m.rotation.z = Math.PI;
      m.material.color.set(color);
      m.visible = false;
      this.scene.add(m);
      return { mesh: m, x: null };
    });

    // 2v2: a bouncing arrow over whoever's turn it is.
    this.turnArrow = sprite(markerTex, 0.5, 1, 9);
    this.turnArrow.rotation.z = Math.PI;
    this.turnArrow.material.color.set(0xffd84a);
    this.turnArrow.visible = false;
    this.turnArrowFor = null;
    this.scene.add(this.turnArrow);

    // aim: a faint 0-90 degree dial around the thrower + a bright aim line
    const dot = (size, color, opacity, order) => {
      const m = new THREE.Mesh(
        quad(size, size),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
      );
      m.renderOrder = order;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.dial = Array.from({ length: 10 }, (_, k) => dot(k % 3 === 0 ? 2 : 1, 0xffffff, 0.45, 6));
    this.aim = Array.from({ length: 8 }, (_, k) => dot(2, k === 7 ? 0xffd84a : 0xffffff, 1 - k * 0.07, 7));
    // Touch slingshot: rubber band from where the finger went down to where it is now.
    this.band = Array.from({ length: 10 }, (_, k) => dot(k === 0 ? 4 : 2, k === 0 ? 0xffd84a : 0xffffff, k === 0 ? 0.9 : 0.6, 9));

    // particle pool
    // Floor hazards (FIRE BOMB): a scorch mark + glow per patch, a row of animated flames, embers.
    this.hazards = [];
    this.flameTex = art.flames.map(tex);
    this.flames = [];   // pool of flame sprites, assigned to hazards in setHazards()
    this.hazardMeshes = Array.from({ length: 6 }, () => {
      const scorch = new THREE.Mesh(quad(1, 3, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x2a1a14, transparent: true, opacity: 0.75, depthTest: false }));
      const glow = new THREE.Mesh(quad(1, 2, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, depthTest: false }));
      scorch.renderOrder = 3;
      glow.renderOrder = 3.1;
      scorch.visible = glow.visible = false;
      this.scene.add(scorch, glow);
      return { scorch, glow };
    });

    this.particles = Array.from({ length: 260 }, () => {
      const m = new THREE.Mesh(quad(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      m.renderOrder = 8;
      m.visible = false;
      this.scene.add(m);
      return { m, vx: 0, vy: 0, life: 0 };
    });
  }

  /** Which animal stands on each side this match. */
  setCharacters(ids) {
    const xs = spawnX(ids.length);
    this.players.forEach((p, i) => {
      p.active = i < ids.length;
      p.mesh.visible = p.active;
      this.status[i] = [];
      if (!p.active) { this.iceBlocks[i].visible = this.umbrellas[i].visible = false; return; }
      const id = ids[i];
      p.x = xs[i];
      p.frames = this.charTex[id].frames;
      p.mesh.material.map = this.charTex[id].frames.idle0;
      this.projTex.normal[i] = this.charTex[id].projectile;
    });
  }

  /** 2v2: knocked out for the rest of the match (stays upside down). */
  ko(i) {
    const p = this.players[i];
    if (p.ko) return;
    this.setState(p, 'lose');
    p.ko = true;
  }

  /** Arrow over the player whose turn it is (null = hide). */
  setTurnArrow(i) { this.turnArrowFor = i; }

  reset() {
    this.players.forEach((p) => { p.ko = false; p.slapTarget = null; p.slapT = undefined; this.setState(p, 'idle'); });
    this.turnArrowFor = null;
    this.landings.forEach((l) => { l.x = null; l.mesh.visible = false; });
    this.hideAim();
    this.endProjectile();
  }

  setState(p, state) {
    if (p.ko && state !== 'lose') return;   // knocked out animals stay down
    p.state = state;
    p.t = 0;
    p.mesh.material.color.set(0xffffff);
  }

  windup(i) { this.setState(this.players[i], 'windup'); }
  throwAnim(i) { this.setState(this.players[i], 'throw'); }
  hurt(i) { this.setState(this.players[i], 'hurt'); }
  /** TORNADO: player i is sucked up, spun around and dropped. */
  lift(i) { this.setState(this.players[i], 'lifted'); }

  /** Victory dance + mocking wiggle after landing a hit. */
  taunt(i) { this.setState(this.players[i], 'dance'); }
  /** Game over: the winning team dances, everyone else is flattened. Team = index % 2. */
  setResult(winner) {
    this.turnArrowFor = null;
    this.players.forEach((p, i) => { if (p.active) this.setState(p, i % 2 === winner ? 'win' : 'lose'); });
    // Each winner still standing picks a loser to go slap (2v2: one each).
    const winners = this.players.filter((p) => p.state === 'win');
    const losers = this.players.filter((p, i) => p.active && i % 2 !== winner);
    winners.forEach((p, k) => {
      const target = losers[k % losers.length];
      p.slapTarget = target;
      p.slapX = target.x - 17 * p.facing - (k >= losers.length ? 12 * p.facing : 0);
      p.slaps = 0;
    });
  }

  /** Where player i is actually drawn right now (winners walk over to slap). */
  drawnX(i) { return this.players[i].mesh.position.x; }

  setWind(w) { this.wind = w; }

  showAim(i, angle) {
    const p = this.players[i];
    const ox = p.x + LAUNCH.dx * p.facing;
    const oy = GROUND_Y + LAUNCH.dy;
    const place = (m, deg, d) => {
      const r = (deg * Math.PI) / 180;
      m.position.set(Math.round(ox + Math.cos(r) * d * p.facing), Math.round(oy + Math.sin(r) * d), 0);
      m.visible = true;
    };
    this.dial.forEach((m, k) => place(m, k * 10, 14));
    this.aim.forEach((m, k) => place(m, angle, 8 + k * 6));
  }

  /** Where the end of the aim line is, in world pixels (used for the angle label). */
  aimTip(i, angle, extra = 10) {
    const p = this.players[i];
    const r = (angle * Math.PI) / 180;
    const d = 8 + 7 * 6 + extra;
    return {
      x: p.x + LAUNCH.dx * p.facing + Math.cos(r) * d * p.facing,
      y: GROUND_Y + LAUNCH.dy + Math.sin(r) * d,
    };
  }

  /** Remember where player i's throw landed. */
  setLanding(i, x) {
    this.landings[i].x = Math.round(Math.max(3, Math.min(W - 3, x)));
  }

  /** Show only player i's last landing spot (or none with i = null). */
  showLanding(i) {
    this.landings.forEach((l, k) => {
      l.mesh.visible = k === i && l.x !== null;
      if (l.mesh.visible) l.mesh.position.set(l.x, GROUND_Y + 1, 0);
    });
  }

  /** Slingshot band from the anchor (a) to the finger (f), world coords; null hides it. */
  showPull(a, f) {
    this.band.forEach((m, k) => {
      m.visible = !!a;
      if (!a) return;
      const t = k / (this.band.length - 1);
      m.position.set(Math.round(a.x + (f.x - a.x) * t), Math.round(a.y + (f.y - a.y) * t), 0);
    });
  }

  hideAim() {
    this.aim.forEach((m) => (m.visible = false));
    this.dial.forEach((m) => (m.visible = false));
  }

  /** Start `count` projectiles for player i using this turn's shot (look, size, trails). */
  startProjectile(i, shot, count = 1) {
    const type = this.projTex[shot.look] ? shot.look : 'normal';
    this.projShot = shot;
    this.projDir = this.players[i].facing;
    const map = type === 'normal' ? this.projTex.normal[i] : this.projTex[type];
    const { width, height } = map.image;
    this.projs.forEach(({ mesh }, k) => {
      mesh.visible = k < count;
      if (!mesh.visible) return;
      mesh.material.map = map;
      mesh.material.needsUpdate = true;
      // Swap geometry so the sprite keeps its own size, then scale for GIANT.
      if (mesh.geometry.parameters.width !== width || mesh.geometry.parameters.height !== height) {
        mesh.geometry.dispose();
        mesh.geometry = quad(width, height);
      }
      mesh.scale.setScalar(shot.size);
      mesh.scale.x *= type === 'normal' ? 1 : this.projDir;
    });
  }

  /** visuals = status visual names for player i, e.g. ['umbrella', 'stink'] */
  setStatus(i, visuals) { this.status[i] = visuals; }

  /** Move projectile k (default 0). Pass `null` x to hide it (it has landed). */
  setProjectile(x, y, f, k = 0, dir = 0) {
    const { mesh, marker } = this.projs[k];
    if (x === null) { mesh.visible = false; marker.visible = false; return; }
    mesh.visible = true;
    mesh.position.set(Math.round(x), Math.round(y), 0);
    // The duck wobbles upright; everything else spins.
    const shot = this.projShot;
    if (shot.spin === 'point') {
      mesh.scale.x = Math.abs(mesh.scale.x);   // sprite faces right; rotation does the rest
      mesh.rotation.z = dir;
    } else {
      mesh.rotation.z = shot.spin === 'wobble' ? Math.sin(f * 0.3 + k) * 0.4 : -this.projDir * f * 0.22;
    }
    const frame = Math.floor(f);
    for (const trail of shot.trails) {
      if (trail === 'fuse' && frame % 3 === 0) this.burst(x, y + 4, ['#ffd84a', '#ff8a2a'], 1, 25, 60);
      if (trail === 'stink' && frame % 4 === 0) this.burst(x, y, ['#7fd35a', '#a6e07a'], 1, 8, -20);
      if (trail === 'nuke' && frame % 2 === 0) this.burst(x, y, ['#ffd84a', '#7fd35a', '#ffffff'], 1, 15, -10);
      if (trail === 'fire') this.burst(x - this.projDir * 4, y, ['#ff6a2a', '#ffd84a', '#e04848'], 1, 20, 30);
      if (trail === 'spark' && frame % 2 === 0) this.burst(x, y, ['#ffd84a', '#ffffff'], 2, 40, 0);
      if (trail === 'drip' && frame % 3 === 0) this.burst(x, y - 3, ['#3a8be0', '#8fd8ff'], 1, 6, 160);
      if (trail === 'wine' && frame % 3 === 0) this.burst(x, y - 3, ['#7a1f45', '#a8325e'], 1, 6, 160);
      if (trail === 'frost' && frame % 2 === 0) this.burst(x, y, ['#bfe9ff', '#ffffff', '#8fd8ff'], 1, 15, 40);
      if (trail === 'swirl' && frame % 2 === 0) {
        const r = 7, a = f * 0.5;
        this.burst(x + Math.cos(a) * r, y + Math.sin(a) * r, ['#e6e8ef', '#b8bccb', '#ffffff'], 1, 12, -15);
      }
    }
    marker.visible = y > H + 2 && x > 0 && x < W;
    if (marker.visible) marker.position.set(Math.round(x), H - 1, 0);
  }

  /** Floor hazards to draw: [{ type, x, radius }]. */
  setHazards(list) {
    this.hazards = list.map((h) => ({ ...h }));
    this.hazardMeshes.forEach(({ scorch, glow }, k) => {
      const h = this.hazards[k];
      scorch.visible = glow.visible = !!h;
      if (!h) return;
      scorch.scale.x = h.radius * 2;
      glow.scale.x = h.radius * 2 - 4;
      scorch.position.set(h.x, GROUND_Y - 2, 0);
      glow.position.set(h.x, GROUND_Y, 0);
    });
    // One flame every ~7px along each patch, with random phase/height so it flickers naturally.
    const wanted = [];
    for (const h of this.hazards) {
      const n = Math.max(3, Math.floor((h.radius * 2) / 7));
      for (let k = 0; k < n; k++) wanted.push({ x: Math.round(h.x - h.radius + (k + 0.5) * ((h.radius * 2) / n)), phase: Math.random() * 3, h: 0.7 + Math.random() * 0.6 });
    }
    while (this.flames.length < wanted.length) {
      const m = sprite(this.flameTex[0], 0.5, 0, 4.5);
      this.scene.add(m);
      this.flames.push({ mesh: m });
    }
    this.flames.forEach((f, k) => {
      const w = wanted[k];
      f.mesh.visible = !!w;
      if (w) Object.assign(f, w);
    });
  }

  /**
   * TORNADO funnel around the loops: stacked wobbling rings, narrow at the
   * bottom and wide at the top, covering the box (x0..x1, y0..y1) for `dur` seconds.
   */
  vortex(x0, x1, y0, y1, dur) {
    const cx = (x0 + x1) / 2;
    const w = Math.max(24, x1 - x0 + 16);
    const bottom = GROUND_Y + 2;   // a tornado touches the ground
    const top = y1 + 14;
    const n = 9;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);                       // 0 = bottom, 1 = top
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1, 20),
        new THREE.MeshBasicMaterial({ color: k % 2 ? 0xc8ccd6 : 0x9aa0b4, transparent: true, depthTest: false }),
      );
      m.renderOrder = 5.5;
      this.scene.add(m);
      const rx = 4 + u * u * (w / 2);
      const ry = 2 + u * 4;
      const y = bottom + (top - bottom) * u;
      this.effects.push({
        mesh: m, dur, t: 0,
        fn: (mesh, kk) => {
          const t = kk * dur;
          const grow = Math.min(1, t * 6);
          mesh.scale.set(rx * grow, ry * grow, 1);
          mesh.position.set(Math.round(cx + Math.sin(t * 9 + u * 4) * (3 + u * 5)), Math.round(y), 0);
          mesh.rotation.z = Math.sin(t * 14 + k) * 0.15;
          mesh.material.opacity = (kk < 0.85 ? 0.75 : (1 - kk) / 0.15 * 0.75);
        },
      });
    }
    // dust kicked up at the base
    for (let k = 0; k < 4; k++) setTimeout(() => this.burst(cx, bottom, ['#b88858', '#9a6a3e', '#c8ccd6'], 6, 40, 80), k * 200);
  }

  /** A jagged bolt from the top of the screen onto player i. */
  lightning(i) {
    const p = this.players[i];
    this.boltAt(p.x, GROUND_Y + 12);
  }

  /** A jagged lightning bolt from the sky down to (tx, ty). */
  boltAt(tx, ty) {
    const p = { x: tx };
    const x0 = tx + (Math.random() * 30 - 15);
    let x = x0, y = H + 4;
    const pts = [[x, y]];
    while (y > ty + 2) {
      y -= 12 + Math.random() * 10;
      x += Math.random() * 18 - 9;
      pts.push([x, Math.max(y, ty + 2)]);
    }
    pts.push([p.x, ty]);
    for (const [w, color, order] of [[5, 0xffd84a, 8.4], [2, 0xffffff, 8.5]]) {
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        const len = Math.hypot(bx - ax, by - ay);
        const m = new THREE.Mesh(quad(w, len), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
        m.position.set((ax + bx) / 2, (ay + by) / 2, 0);
        m.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
        m.renderOrder = order;
        this.scene.add(m);
        this.effects.push({ mesh: m, dur: 0.45, t: 0, fn: (mesh, kk) => { mesh.material.opacity = kk < 0.5 ? (Math.floor(kk * 20) % 2 ? 1 : 0.4) : (1 - kk) * 2; } });
      }
    }
    this.burst(p.x, ty, ['#ffd84a', '#ffffff', '#8fd8ff'], 20, 90);
    this.addShake(6);
  }

  /** Puff of steam (fire put out / fizzle). */
  steam(x, y = GROUND_Y + 2) {
    this.burst(x, y, ['#ffffff', '#e6e8ef', '#c8ccd6'], 16, 25, -45);
  }

  /** Ice block bursts into shards (frozen turn is over). */
  shatter(i) {
    const p = this.players[i];
    this.burst(p.x, GROUND_Y + 12, ['#bfe9ff', '#ffffff', '#8fd8ff', '#7cc4ea'], 26, 110);
    this.addShake(3);
  }

  /** Show the lock-on crosshair on player i. */
  lockOn(i) {
    this.reticleT = 0;
    this.reticleTarget = this.players[i];
    this.reticle.visible = true;
  }

  endProjectile() {
    this.reticle.visible = false;
    for (const { mesh, marker } of this.projs) {
      mesh.visible = false;
      marker.visible = false;
    }
  }

  burst(x, y, colors, n = 14, speed = 70, gravity = 220) {
    let made = 0;
    for (const p of this.particles) {
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = 0.5 + Math.random() * 0.4;
      p.g = gravity;
      p.x = x;
      p.y = y;
      p.m.material.color.set(colors[made % colors.length]);
      p.m.visible = true;
      if (++made >= n) break;
    }
  }

  /** Big bang: white core, fireball, shockwave ring, debris and smoke. style: 'bomb' | 'nuke' | 'small' */
  explode(x, y, style = 'bomb') {
    if (style === 'nuke') return this.nuke(x, y);
    const k0 = style === 'small' ? 0.55 : 1;
    const circle = (r, color, order, ring = false) => {
      const g = ring ? new THREE.RingGeometry(0.82, 1, 28) : new THREE.CircleGeometry(1, 20);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
      m.position.set(Math.round(x), Math.round(Math.max(y, GROUND_Y + 4)), 0);
      m.renderOrder = order;
      m.scale.setScalar(r);
      this.scene.add(m);
      return m;
    };
    const add = (mesh, dur, fn) => this.effects.push({ mesh, dur, t: 0, fn });
    const ease = (k) => 1 - (1 - k) ** 3;
    add(circle(1, 0xff6a2a, 8), 0.55, (m, k) => { m.scale.setScalar((4 + ease(Math.min(1, k * 2)) * 30) * k0); m.material.opacity = 1 - k; });
    add(circle(1, 0xffd84a, 8.1), 0.4, (m, k) => { m.scale.setScalar((3 + ease(Math.min(1, k * 2)) * 20) * k0); m.material.opacity = 1 - k; });
    add(circle(1, 0xffffff, 8.2), 0.18, (m, k) => { m.scale.setScalar((4 + k * 12) * k0); m.material.opacity = 1 - k; });
    add(circle(1, 0xffffff, 8.3, true), 0.5, (m, k) => { m.scale.setScalar((6 + ease(k) * 70) * k0); m.material.opacity = 0.9 * (1 - k); });
    this.burst(x, y + 2, ['#ff6a2a', '#ffd84a', '#ffffff', '#e04848'], Math.round(36 * k0), 170 * k0);
    this.burst(x, y + 2, ['#9a6a3e', '#58a83e', '#3a2a2a'], Math.round(16 * k0), 120 * k0);
    setTimeout(() => this.burst(x, y + 6, ['#6a6a7a', '#8a8a9a', '#4a4a5a'], Math.round(18 * k0), 30, -35), 120);
    this.addShake(8 * k0);
  }

  /** NUKE: blinding flash, huge fireball, double shockwave, rising mushroom cloud. */
  nuke(x, y) {
    const gy = GROUND_Y + 2;
    const add = (geo, color, order, dur, fn, px = x, py = gy) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
      m.position.set(Math.round(px), Math.round(py), 0);
      m.renderOrder = order;
      this.scene.add(m);
      this.effects.push({ mesh: m, dur, t: 0, fn });
      return m;
    };
    const ease = (k) => 1 - (1 - k) ** 3;
    const circle = () => new THREE.CircleGeometry(1, 24);
    const ring = () => new THREE.RingGeometry(0.86, 1, 40);
    // ground fireball
    add(circle(), 0xff6a2a, 8, 1.6, (m, k) => { m.scale.set(10 + ease(Math.min(1, k * 3)) * 70, 8 + ease(Math.min(1, k * 3)) * 40, 1); m.material.opacity = 1 - k; });
    add(circle(), 0xffd84a, 8.1, 1.1, (m, k) => { m.scale.set(6 + ease(Math.min(1, k * 3)) * 50, 5 + ease(Math.min(1, k * 3)) * 28, 1); m.material.opacity = 1 - k; });
    add(circle(), 0xffffff, 8.2, 0.4, (m, k) => { m.scale.setScalar(10 + k * 40); m.material.opacity = 1 - k; });
    // two shockwaves
    add(ring(), 0xffffff, 8.3, 0.9, (m, k) => { m.scale.setScalar(8 + ease(k) * 190); m.material.opacity = 0.95 * (1 - k); });
    add(ring(), 0xffd84a, 8.3, 1.3, (m, k) => { m.scale.setScalar(6 + ease(k) * 130); m.material.opacity = 0.8 * (1 - k); });
    // mushroom: stem + cap rise, then turn to smoke
    const stem = new THREE.PlaneGeometry(1, 1);
    stem.translate(0, 0.5, 0);
    add(stem, 0xff8a2a, 7.9, 2.6, (m, k) => {
      const h = ease(Math.min(1, k * 1.6)) * 70;
      m.scale.set(12 + k * 6, h, 1);
      m.material.color.set(k < 0.4 ? 0xff8a2a : 0x8a7a7a);
      m.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
    });
    const cap = add(circle(), 0xffb03a, 8, 2.6, (m, k) => {
      const h = ease(Math.min(1, k * 1.6)) * 70;
      m.position.y = gy + h;
      m.scale.set(16 + ease(Math.min(1, k * 2)) * 30, 10 + ease(Math.min(1, k * 2)) * 16, 1);
      m.material.color.set(k < 0.35 ? 0xffb03a : k < 0.6 ? 0xc06a3a : 0x7a6a6a);
      m.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
    });
    cap.renderOrder = 8.05;
    this.burst(x, gy + 4, ['#ff6a2a', '#ffd84a', '#ffffff', '#e04848'], 60, 240);
    this.burst(x, gy + 4, ['#9a6a3e', '#58a83e', '#3a2a2a'], 30, 170);
    for (let k = 1; k <= 4; k++) setTimeout(() => this.burst(x + (Math.random() * 40 - 20), gy + 20 + k * 12, ['#6a6a7a', '#8a8a9a', '#4a4a5a'], 10, 20, -25), k * 250);
    this.addShake(16);
  }

  addShake(v) { this.shake = Math.max(this.shake, v); }

  /**
   * Two-legged dance moves (taunts + victory): poses on the beat, squash on the squat,
   * hop between, turn around for a butt wiggle every other bar, music notes.
   */
  dance(p, bpm) {
    const beat = p.t * bpm;
    const b = Math.floor(beat);
    const frame = ['dance0', 'dance1', 'dance2', 'dance1'][b % 4];
    const squat = frame === 'dance1';
    const phase = beat - b;
    const wiggle = Math.floor(b / 8) % 2 === 1;   // every other bar: turn around and shake it
    p.note = (p.note || 0) - 1 / 60;
    if (p.note <= 0) {
      p.note = 0.3;
      this.burst(p.x + (Math.random() * 16 - 8), GROUND_Y + 30, ['#ffd84a', '#ff8ad8', '#8fd8ff', '#5fd35a'], 1, 15, -40);
    }
    return {
      frame,
      oy: squat ? 0 : Math.round(Math.sin(phase * Math.PI) * 4),
      sy: squat ? 0.88 : 1 + Math.sin(phase * Math.PI) * 0.08,
      flip: wiggle ? -1 : 1,
      ox: wiggle ? Math.round(Math.sin(p.t * 30) * 2) : Math.round(Math.sin(p.t * 4) * 3),
    };
  }

  update(dt) {
    this.time += dt;

    // characters
    this.players.forEach((p, i) => {
      if (!p.active) return;
      p.t += dt;
      let frame = Math.floor(this.time * 2.5 + i * 0.5) % 2 ? 'idle1' : 'idle0';
      let ox = 0, oy = 0, flip = 1, rot = 0, sy = 1;
      switch (p.state) {
        case 'windup': frame = 'windup'; break;
        case 'throw':
          frame = 'throw';
          if (p.t > 0.35) this.setState(p, 'idle');
          break;
        case 'hurt':
          frame = 'hurt';
          ox = -p.facing * (p.t < 0.15 ? 3 : p.t < 0.3 ? 1 : 0);
          p.mesh.material.color.set(Math.floor(p.t * 14) % 2 ? 0xff7070 : 0xffffff);
          if (p.t > 0.7) this.setState(p, 'idle');
          break;
        case 'win': {
          // 1) leap over the fence to a loser, 2) slap them silly, 3) dance on two legs, repeat the slaps
          const dx = p.slapTarget ? p.slapX - p.x : 0;
          const LEAP = 0.5, LAND = 1.5;
          if (p.t < LEAP) {
            const d = this.dance(p, 8);
            frame = d.frame; oy = d.oy; sy = d.sy;
          } else if (p.t < LAND) {
            const k = (p.t - LEAP) / (LAND - LEAP);
            ox = Math.round(dx * k);
            oy = Math.round(Math.sin(k * Math.PI) * 74);
            rot = k * Math.PI * 2 * -p.facing;
            frame = 'dance0';
          } else {
            ox = dx;
            const ct = (p.t - LAND) % 5;
            const round = Math.floor((p.t - LAND) / 5);
            if (p.slapTarget && ct < 2.4) {
              // slap combo: wind up, SMACK, backhand...
              const n = Math.floor(ct / 0.4);
              const st = ct % 0.4;
              const backhand = n % 2 === 1;
              frame = st < 0.14 ? 'throw' : 'windup';
              flip = 1;
              ox += st < 0.14 ? 2 : -1;
              if (st < 0.14 && p.slaps !== round * 100 + n + 1) {
                p.slaps = round * 100 + n + 1;
                p.slapTarget.slapT = 0;
                p.slapTarget.slapDir = p.facing * (backhand ? -1 : 1);
                this.burst(p.slapTarget.x, GROUND_Y + 10, ['#ffffff', '#ffd84a', '#ff8ad8'], 8, 60);
                this.addShake(2);
                this.onSlap?.(this.players.indexOf(p.slapTarget), p.slapTarget.x);
              }
            } else {
              const d = this.dance(p, 8);
              frame = d.frame; oy = d.oy; sy = d.sy; flip = d.flip; ox = dx + d.ox;
            }
          }
          p.confetti = (p.confetti || 0) - dt;
          if (p.confetti <= 0) {
            p.confetti = 0.35;
            this.burst(p.mesh.position.x + (Math.random() * 40 - 20), GROUND_Y + 40 + Math.random() * 20, ['#ffd84a', '#e04848', '#5fd35a', '#8fd8ff', '#ff8ad8'], 6, 60, 80);
          }
          break;
        }
        case 'lifted': {
          frame = 'hurt';
          const t = p.t;
          if (t < 1.1) {
            const k = t / 1.1;
            oy = Math.round((1 - (1 - k) ** 2) * 72);
            ox = Math.round(Math.sin(t * 14) * (4 + k * 6));
            rot = t * 16;
          } else if (t < 1.45) {
            const k = (t - 1.1) / 0.35;
            oy = Math.round(72 * (1 - k * k));
            rot = 0;
          } else {
            this.setState(p, 'hurt');
            this.addShake(7);
            this.burst(p.x, GROUND_Y + 1, ['#b88858', '#9a6a3e', '#58a83e'], 18, 80);
            this.onLand?.(this.players.indexOf(p));
          }
          break;
        }
        case 'dance': {
          // stands up on two legs and busts a move at the foe
          const d = this.dance(p, 9);
          frame = d.frame; oy = d.oy; sy = d.sy; flip = d.flip; ox = d.ox;
          if (p.t > 2.0) this.setState(p, 'idle');
          break;
        }
        case 'lose':
          // knocked out: upside down, legs in the air, stars spinning above
          frame = 'hurt';
          p.mesh.material.color.set(0x9a9aa8);
          rot = Math.PI;
          oy = 21;
          // getting slapped: head snaps sideways, the whole body spins a bit
          if (p.slapT !== undefined && p.slapT < 0.3) {
            p.slapT += dt;
            const k = 1 - p.slapT / 0.3;
            ox = Math.round(p.slapDir * 5 * k);
            rot = Math.PI + p.slapDir * 0.5 * k;
            frame = 'hurt';
          }
          p.stars = (p.stars || 0) - dt;
          if (p.stars <= 0) {
            p.stars = 0.12;
            const a = this.time * 6;
            this.burst(p.x + Math.cos(a) * 8, GROUND_Y + 24 + Math.sin(a) * 2, ['#ffd84a', '#ffffff'], 1, 4, 0);
          }
          break;
      }
      if (p.mesh.material.map !== p.frames[frame]) p.mesh.material.map = p.frames[frame];
      p.mesh.position.set(Math.round(p.x + ox), GROUND_Y - 1 + oy, 0);
      p.mesh.scale.x = p.facing * flip;
      p.mesh.scale.y = sy;
      p.mesh.rotation.z = rot;
    });

    // burning floor: flickering glow + rising flames along each patch
    this.hazards.forEach((h, k) => {
      const m = this.hazardMeshes[k];
      if (!m) return;
      m.glow.material.opacity = 0.6 + Math.sin(this.time * 18 + k) * 0.25;
      h.acc = (h.acc || 0) + dt * h.radius * 0.5;
      while (h.acc >= 1) {
        h.acc -= 1;
        const fx = h.x + (Math.random() * 2 - 1) * h.radius;
        this.burst(fx, GROUND_Y + 1, ['#ff6a2a', '#ffd84a', '#e04848', '#ff9a2a'], 1, 10, -70);
      }
    });

    for (const f of this.flames) {
      if (!f.mesh.visible) continue;
      const t = this.time * 10 + f.phase * 3;
      f.mesh.material.map = this.flameTex[Math.floor(t) % 3];
      f.mesh.scale.set(1, f.h * (0.85 + 0.25 * Math.abs(Math.sin(t * 0.7))), 1);
      f.mesh.position.set(f.x, GROUND_Y - 1, 0);
    }

    // lock-on crosshair: snaps in, then pulses
    if (this.reticle.visible) {
      this.reticleT += dt;
      const p = this.reticleTarget;
      const s = Math.max(1, 2.2 - this.reticleT * 6) * (1 + Math.sin(this.time * 20) * 0.06);
      this.reticle.scale.setScalar(s);
      this.reticle.rotation.z = this.reticleT < 0.2 ? this.reticleT * 8 : 0;
      this.reticle.position.set(p.mesh.position.x - p.facing, GROUND_Y + 9, 0);
    }

    // whose turn: arrow bobbing over their head
    const ta = this.turnArrowFor === null ? null : this.players[this.turnArrowFor];
    this.turnArrow.visible = !!ta;
    if (ta) this.turnArrow.position.set(ta.x - ta.facing, GROUND_Y + 40 + Math.round(Math.abs(Math.sin(this.time * 5)) * 3), 0);

    // landing marker bobs gently
    for (const l of this.landings) {
      if (l.mesh.visible) l.mesh.position.y = GROUND_Y + 8 + Math.round(Math.abs(Math.sin(this.time * 4)) * 2);
    }

    // statuses: umbrella above head, green stink puffs
    this.players.forEach((p, i) => {
      if (!p.active) return;
      const st = this.status[i];
      const ice = this.iceBlocks[i];
      ice.visible = st.includes('ice');
      if (ice.visible) {
        ice.position.set(p.mesh.position.x, GROUND_Y - 1, 0);
        p.mesh.material.color.set(0xa8dcff);
        if (Math.random() < 0.05) this.burst(p.x + (Math.random() * 24 - 12), GROUND_Y + 28, ['#ffffff', '#e6f7ff'], 1, 5, 20);
      } else if (p.state === 'idle') {
        p.mesh.material.color.set(0xffffff);
      }
      const u = this.umbrellas[i];
      u.visible = st.includes('umbrella');
      if (u.visible) u.position.set(p.mesh.position.x, GROUND_Y + 25 + Math.round(Math.sin(this.time * 3) * 1), 0);
      if (st.includes('zapped')) {
        p.zapT = (p.zapT || 0) - dt;
        if (p.zapT <= 0) {
          p.zapT = 0.12 + Math.random() * 0.25;
          this.burst(p.x + (Math.random() * 16 - 8), GROUND_Y + 6 + Math.random() * 16, ['#ffd84a', '#ffffff', '#8fd8ff'], 2, 25);
        }
      }
      if (st.includes('drunk')) {
        // tipsy: sways on the spot, little pink hiccup bubbles
        if (p.state === 'idle' || p.state === 'windup') p.mesh.rotation.z = Math.sin(this.time * 2.1 + i) * 0.12;
        p.hicT = (p.hicT || 0) - dt;
        if (p.hicT <= 0) {
          p.hicT = 0.35 + Math.random() * 0.4;
          this.burst(p.x + p.facing * 5, GROUND_Y + 20, ['#ff8ad8', '#ffc0e8'], 1, 6, -30);
        }
      }
      if (st.includes('wet')) {
        p.wetT = (p.wetT || 0) - dt;
        if (p.wetT <= 0) {
          p.wetT = 0.16;
          this.burst(p.x + (Math.random() * 18 - 9), GROUND_Y + 8 + Math.random() * 12, ['#3a8be0', '#8fd8ff'], 1, 4, 140);
        }
      }
      if (st.includes('burn')) {
        p.burnT = (p.burnT || 0) - dt;
        if (p.burnT <= 0) {
          p.burnT = 0.07;
          this.burst(p.x + (Math.random() * 14 - 7), GROUND_Y + 4 + Math.random() * 14, ['#ff6a2a', '#ffd84a', '#e04848'], 1, 18, -60);
        }
      }
      if (st.includes('stink')) {
        p.stinkT = (p.stinkT || 0) - dt;
        if (p.stinkT <= 0) {
          p.stinkT = 0.18;
          this.burst(p.x + (Math.random() * 16 - 8), GROUND_Y + 10 + Math.random() * 8, ['#7fd35a', '#a6e07a', '#5fae3a'], 1, 12, -25);
        }
      }
    });

    // clouds drift with the wind
    for (const c of this.clouds) {
      c.position.x += (this.wind * 2 + 1) * dt;
      if (c.position.x > W + 20) c.position.x = -20;
      if (c.position.x < -20) c.position.x = W + 20;
      c.position.x = Math.round(c.position.x * 4) / 4;
    }

    // flag
    const strength = Math.abs(this.wind) / MAX_WIND;
    const dir = this.wind === 0 ? 1 : Math.sign(this.wind);
    this.flag.scale.x = dir * (0.3 + 0.7 * strength);
    this.flag.scale.y = this.wind === 0 ? 0.6 : 1 + Math.sin(this.time * (4 + strength * 10)) * 0.15 * strength;

    // particles
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y < GROUND_Y) { p.y = GROUND_Y; p.vx *= 0.6; p.vy *= -0.3; }
      p.m.position.set(Math.round(p.x), Math.round(p.y), 0);
      if (p.life <= 0) p.m.visible = false;
    }

    // explosion effects
    this.effects = this.effects.filter((e) => {
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      e.fn(e.mesh, k);
      if (k >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        return false;
      }
      return true;
    });

    // camera shake
    this.shake = Math.max(0, this.shake - dt * 20);
    const s = Math.round(this.shake);
    this.camera.position.set(s ? Math.round((Math.random() * 2 - 1) * s) : 0, s ? Math.round((Math.random() * 2 - 1) * s) : 0, 5);
  }

  render() {
    this.gl.render(this.scene, this.camera);
  }
}
