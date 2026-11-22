import { W, H, MAX_HP, MAX_WIND } from '../core/constants.js';
import { ITEMS, STATUSES, BAG_SIZE } from '../core/items/index.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.hud = $('hud');
    this.banner = $('banner');
    this.popups = $('popups');
    this.screens = { menu: $('menu'), over: $('over'), draft: $('draft'), online: $('online') };
    this.iconUrls = {};
    this.activeText = '';
    this.onSlot = () => {};
    this.onDraft = () => {};
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    this.activeScreen = name ? this.screens[name] : null;
    this.sel = 0;
    this.highlight();
  }

  /** Keyboard navigation for whichever menu is open. */
  navigate(delta) {
    const btns = this.buttons();
    if (!btns.length) return;
    this.sel = (this.sel + delta + btns.length) % btns.length;
    this.highlight();
  }

  confirm() { this.buttons()[this.sel]?.click(); }

  buttons() {
    return this.activeScreen ? [...this.activeScreen.querySelectorAll('button:not([disabled])')] : [];
  }

  highlight() {
    this.buttons().forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  }

  showHud(names) {
    this.hud.classList.remove('hidden');
    $('name0').textContent = names[0];
    $('name1').textContent = names[1];
    this.setHp(0, MAX_HP);
    this.setHp(1, MAX_HP);
  }

  hideHud() { this.hud.classList.add('hidden'); }

  setHp(i, hp) {
    const fill = $(`hp${i}`);
    fill.style.width = `${(hp / MAX_HP) * 100}%`;
    fill.className = `fill ${hp > 50 ? 'ok' : hp > 25 ? 'mid' : 'low'}`;
    $(`hpv${i}`).textContent = hp;
  }

  setWind(w) {
    const fill = $('windFill');
    const pct = (Math.abs(w) / MAX_WIND) * 50;
    fill.style.width = `${pct}%`;
    fill.style.left = w < 0 ? `${50 - pct}%` : '50%';
    const arrows = '>'.repeat(Math.ceil(Math.abs(w) / 4));
    $('windVal').textContent = w === 0 ? 'CALM' : w < 0 ? `${arrows.replace(/>/g, '<')} ${-w}` : `${w} ${arrows}`;
  }

  setAngle(a) { $('angle').textContent = `${Math.round(a)}`; }

  setPower(p, last) {
    $('powerFill').style.width = `${p}%`;
    const mark = $('powerLast');
    mark.style.display = last == null ? 'none' : 'block';
    if (last != null) mark.style.left = `${last}%`;
  }

  showAimLabel(x, y, angle) {
    const el = $('aimLabel');
    el.textContent = angle;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(H - y)}px`;
    el.classList.remove('hidden');
  }

  hideAimLabel() { $('aimLabel').classList.add('hidden'); }

  // ---------- items ----------
  setIcons(canvases) {
    for (const [id, cv] of Object.entries(canvases)) this.iconUrls[id] = cv.toDataURL();
  }

  iconImg(id) {
    const img = document.createElement('img');
    img.src = this.iconUrls[id];
    img.alt = ITEMS[id].name;
    img.draggable = false;
    return img;
  }

  /** Draft overlay: 3 cards like a level-up screen. */
  showDraft(offers, title) {
    $('draftTitle').textContent = title;
    const cards = $('cards');
    cards.innerHTML = '';
    offers.forEach((id, i) => {
      const it = ITEMS[id];
      const b = document.createElement('button');
      b.className = 'card';
      b.style.animationDelay = `${i * 0.08}s`;
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = i + 1;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name;
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = it.desc;
      b.append(key, this.iconImg(id), name, desc);
      b.addEventListener('click', () => this.onDraft(i));
      b.addEventListener('mouseenter', () => { this.sel = i; this.highlight(); });
      cards.appendChild(b);
    });
    this.show('draft');
  }

  /** Both bags; only the current player's usable slots are enabled. */
  renderBags(game, interactive) {
    for (let i = 0; i < 2; i++) {
      const bag = $(`bag${i}`);
      bag.innerHTML = '';
      const items = game.players[i].items;
      for (let s = 0; s < BAG_SIZE; s++) {
        const id = items[s];
        const b = document.createElement('button');
        b.className = 'slot';
        if (i === game.turn) b.classList.add('mine');
        if (id) {
          b.append(this.iconImg(id));
          b.addEventListener('mouseenter', () => this.showTip(`${ITEMS[id].name}: ${ITEMS[id].desc}`));
          b.addEventListener('mouseleave', () => this.showTip(this.activeText));
        }
        const usable = interactive && i === game.turn && id && game.canUseItem(s);
        b.disabled = !usable;
        if (usable) {
          const key = document.createElement('span');
          key.className = 'key';
          key.textContent = s + 1;
          b.append(key);
          b.addEventListener('click', () => this.onSlot(s));
        }
        bag.appendChild(b);
      }
    }
  }

  setStatus(i, p) {
    const el = $(`status${i}`);
    el.innerHTML = '';
    const add = (id, text) => {
      const t = document.createElement('span');
      t.className = 'st';
      t.append(this.iconImg(id));
      if (text) t.append(text);
      el.append(t);
    };
    for (const [id, value] of Object.entries(p.status)) {
      const st = STATUSES[id];
      add(st.icon, st.showCount ? `${value}` : '');
    }
  }

  setActiveItem(text) {
    this.activeText = text;
    this.showTip(text);
  }

  showTip(text) {
    const el = $('itemTip');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
  }

  /** Full-screen white flash (bomb). */
  flash() {
    const el = $('flash');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  setControlsVisible(v) { $('controls').classList.toggle('hidden', !v); }

  showBanner(text) {
    this.banner.textContent = text;
    this.banner.classList.remove('hidden');
  }

  hideBanner() { this.banner.classList.add('hidden'); }

  popup(x, y, text, cls = '') {
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.top = `${H - y}px`;
    this.popups.appendChild(el);
    // Keep the text fully on screen.
    const half = el.offsetWidth / 2 + 2;
    el.style.left = `${Math.max(half, Math.min(W - half, x))}px`;
    setTimeout(() => el.remove(), 1200);
  }

  /** Lobby: 'home' (create/join) or 'room' (show code, waiting). */
  showLobby(view, code = '') {
    $('lobbyHome').classList.toggle('hidden', view !== 'home');
    $('lobbyRoom').classList.toggle('hidden', view !== 'room');
    $('roomCode').textContent = code;
    this.show('online');
  }

  setLobbyMsg(text) { $('lobbyMsg').textContent = text; }

  setRematchVisible(v) { $('rematch').classList.toggle('hidden', !v); this.sel = 0; this.highlight(); }

  setOverText(title, sub) {
    $('overTitle').textContent = title;
    $('overSub').textContent = sub;
  }
}
