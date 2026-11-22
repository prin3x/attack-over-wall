import * as THREE from 'three';
import { W, H, GROUND_Y, WALL, PLAYER_X, MAX_WIND, LAUNCH } from '../core/constants.js';
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

    // players
    this.players = ['dog', 'cat'].map((kind, i) => {
      const frames = Object.fromEntries(Object.entries(art[kind]).map(([k, v]) => [k, tex(v)]));
      const mesh = sprite(frames.idle0, 0.5, 0, 5);
      mesh.scale.x = i === 0 ? 1 : -1;
      this.scene.add(mesh);
      return { frames, mesh, state: 'idle', t: 0, facing: i === 0 ? 1 : -1, x: PLAYER_X[i] };
    });

    // umbrella shown above a shielded player
    const umbrellaTex = tex(art.icons.shield);
    this.umbrellas = this.players.map((p) => {
      const m = sprite(umbrellaTex, 0.5, 0, 6);
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.status = [[], []];   // per player: list of status visuals ('umbrella', 'stink')

    // projectile + off-screen marker
    this.icons = art.icons;
    // Default throws per player; any item can fly using its own icon (shot.look = item id).
    this.projTex = { normal: [tex(art.bone), tex(art.fishbone)] };
    for (const [id, cv] of Object.entries(art.icons)) this.projTex[id] = tex(cv);
    this.effects = [];
    this.proj = sprite(this.projTex.normal[0], 0.5, 0.5, 6);
    this.proj.visible = false;
    this.scene.add(this.proj);
    this.marker = sprite(tex(art.marker), 0.5, 1, 9);
    this.marker.visible = false;
    this.scene.add(this.marker);

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

    // particle pool
    this.particles = Array.from({ length: 160 }, () => {
      const m = new THREE.Mesh(quad(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      m.renderOrder = 8;
      m.visible = false;
      this.scene.add(m);
      return { m, vx: 0, vy: 0, life: 0 };
    });
  }

  reset() {
    this.players.forEach((p) => this.setState(p, 'idle'));
    this.hideAim();
    this.proj.visible = false;
    this.marker.visible = false;
  }

  setState(p, state) {
    p.state = state;
    p.t = 0;
    p.mesh.material.color.set(0xffffff);
  }

  windup(i) { this.setState(this.players[i], 'windup'); }
  throwAnim(i) { this.setState(this.players[i], 'throw'); }
  hurt(i) { this.setState(this.players[i], 'hurt'); }
  setResult(winner) {
    this.setState(this.players[winner], 'win');
    this.setState(this.players[1 - winner], 'lose');
  }

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

  hideAim() {
    this.aim.forEach((m) => (m.visible = false));
    this.dial.forEach((m) => (m.visible = false));
  }

  startProjectile(i, shot) {
    const type = this.projTex[shot.look] ? shot.look : 'normal';
    this.projShot = shot;
    this.projDir = this.players[i].facing;
    const map = type === 'normal' ? this.projTex.normal[i] : this.projTex[type];
    this.proj.material.map = map;
    this.proj.material.needsUpdate = true;
    // Swap geometry so the sprite keeps its own size, then scale for GIANT.
    const { width, height } = map.image;
    if (this.proj.geometry.parameters.width !== width || this.proj.geometry.parameters.height !== height) {
      this.proj.geometry.dispose();
      this.proj.geometry = quad(width, height);
    }
    this.proj.scale.setScalar(shot.size);
    this.proj.scale.x *= type === 'normal' ? 1 : this.projDir;
    this.proj.visible = true;
  }

  /** visuals = status visual names for player i, e.g. ['umbrella', 'stink'] */
  setStatus(i, visuals) { this.status[i] = visuals; }

  setProjectile(x, y, f) {
    this.proj.position.set(Math.round(x), Math.round(y), 0);
    // The duck wobbles upright; everything else spins.
    const shot = this.projShot;
    this.proj.rotation.z = shot.spin === 'wobble' ? Math.sin(f * 0.3) * 0.4 : -this.projDir * f * 0.22;
    const frame = Math.floor(f);
    for (const trail of shot.trails) {
      if (trail === 'fuse' && frame % 3 === 0) this.burst(x, y + 4, ['#ffd84a', '#ff8a2a'], 1, 25, 60);
      if (trail === 'stink' && frame % 4 === 0) this.burst(x, y, ['#7fd35a', '#a6e07a'], 1, 8, -20);
    }
    this.marker.visible = y > H + 2 && x > 0 && x < W;
    if (this.marker.visible) this.marker.position.set(Math.round(x), H - 1, 0);
  }

  endProjectile() {
    this.proj.visible = false;
    this.marker.visible = false;
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

  /** Big bang: white core, fireball, shockwave ring, debris and smoke. */
  explode(x, y) {
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
    add(circle(1, 0xff6a2a, 8), 0.55, (m, k) => { m.scale.setScalar(4 + ease(Math.min(1, k * 2)) * 30); m.material.opacity = 1 - k; });
    add(circle(1, 0xffd84a, 8.1), 0.4, (m, k) => { m.scale.setScalar(3 + ease(Math.min(1, k * 2)) * 20); m.material.opacity = 1 - k; });
    add(circle(1, 0xffffff, 8.2), 0.18, (m, k) => { m.scale.setScalar(4 + k * 12); m.material.opacity = 1 - k; });
    add(circle(1, 0xffffff, 8.3, true), 0.5, (m, k) => { m.scale.setScalar(6 + ease(k) * 70); m.material.opacity = 0.9 * (1 - k); });
    this.burst(x, y + 2, ['#ff6a2a', '#ffd84a', '#ffffff', '#e04848'], 36, 170);
    this.burst(x, y + 2, ['#9a6a3e', '#58a83e', '#3a2a2a'], 16, 120);
    setTimeout(() => this.burst(x, y + 6, ['#6a6a7a', '#8a8a9a', '#4a4a5a'], 18, 30, -35), 120);
    this.addShake(8);
  }

  addShake(v) { this.shake = Math.max(this.shake, v); }

  update(dt) {
    this.time += dt;

    // characters
    this.players.forEach((p, i) => {
      p.t += dt;
      let frame = Math.floor(this.time * 2.5 + i * 0.5) % 2 ? 'idle1' : 'idle0';
      let ox = 0, oy = 0;
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
        case 'win':
          frame = 'win';
          oy = Math.floor(Math.abs(Math.sin(p.t * 6)) * 6);
          break;
        case 'lose':
          frame = 'hurt';
          p.mesh.material.color.set(0x9a9aa8);
          break;
      }
      if (p.mesh.material.map !== p.frames[frame]) p.mesh.material.map = p.frames[frame];
      p.mesh.position.set(Math.round(p.x + ox), GROUND_Y - 1 + oy, 0);
    });

    // statuses: umbrella above head, green stink puffs
    this.players.forEach((p, i) => {
      const st = this.status[i];
      const u = this.umbrellas[i];
      u.visible = st.includes('umbrella');
      if (u.visible) u.position.set(p.mesh.position.x, GROUND_Y + 25 + Math.round(Math.sin(this.time * 3) * 1), 0);
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
