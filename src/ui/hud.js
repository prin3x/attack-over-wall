import { W, H, MAX_WIND } from '../core/constants.js';
import { ITEMS, STATUSES, COMBOS, REACTIONS, BAG_SIZE } from '../core/items/index.js';
import { CHARACTERS } from '../core/characters/index.js';

const $ = (id) => document.getElementById(id);

/** Whose bag a side of the screen shows: the current player, or that team's next one up. */
function bagOwner(game, side) {
  if (game.current.team === side) return game.turn;
  const n = game.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (game.lastOf[side] + k) % n;
    if (game.players[i].team === side && game.players[i].hp > 0) return i;
  }
  return side;
}

export class Hud {
  constructor() {
    this.hud = $('hud');
    this.banner = $('banner');
    this.popups = $('popups');
    this.screens = { menu: $('menu'), over: $('over'), draft: $('draft'), online: $('online'), book: $('book'), select: $('select'), teams: $('teams') };
    this.onSeat = () => {};
    this.onSelect = () => {};
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

  /** HP panels: 2 (1v1) or 4 compact ones (2v2: team 0 on the left, team 1 on the right). */
  showHud(names, maxHps) {
    this.hud.classList.remove('hidden');
    const teams = names.length > 2;
    this.hud.classList.toggle('teams', teams);
    this.maxHp = maxHps;
    // Extra panels for players 3 and 4 (created once, hidden in 1v1).
    for (const i of [2, 3]) {
      if (!$(`panel${i}`)) {
        const side = i % 2 ? 'right' : 'left';
        const el = document.createElement('div');
        el.id = `panel${i}`;
        el.className = `hp ${side} row2`;
        el.innerHTML = side === 'left'
          ? `<div class="label"><span id="name${i}"></span> <span id="hpv${i}" class="num"></span></div><div class="bar"><div id="hp${i}" class="fill ok"></div></div>`
          : `<div class="label"><span id="hpv${i}" class="num"></span> <span id="name${i}"></span></div><div class="bar"><div id="hp${i}" class="fill ok"></div></div>`;
        $('panel1').after(el);
        const st = document.createElement('div');
        st.id = `status${i}`;
        st.className = `status ${side}`;
        $('status1').after(st);
      }
      $(`panel${i}`).classList.toggle('hidden', !teams);
      $(`status${i}`).classList.toggle('hidden', !teams);
    }
    // 2v2: statuses sit on the name line instead of under the bar.
    for (let i = 0; i < 4; i++) {
      const st = $(`status${i}`);
      const label = $(`panel${i}`).querySelector('.label');
      if (teams && st.parentElement !== label) label.append(st);
      if (!teams && st.parentElement === label) this.hud.insertBefore(st, $('bag0'));
    }
    names.forEach((n, i) => {
      $(`name${i}`).textContent = n;
      this.setHp(i, maxHps[i]);
    });
    this.setActive(null);
  }

  /** Highlight whose turn it is; grey out knocked-out animals (2v2). */
  setActive(turn, players = []) {
    for (let i = 0; i < 4; i++) {
      const el = $(`panel${i}`);
      if (!el) continue;
      el.classList.toggle('active', i === turn);
      el.classList.toggle('ko', players[i]?.hp === 0 && players.length > 2);
    }
  }

  hideHud() { this.hud.classList.add('hidden'); }

  setName(i, name) { const el = $(`name${i}`); if (el) el.textContent = name; }

  setHp(i, hp) {
    const fill = $(`hp${i}`);
    const pct = (hp / (this.maxHp?.[i] || 100)) * 100;
    fill.style.width = `${pct}%`;
    fill.className = `fill ${pct > 50 ? 'ok' : pct > 25 ? 'mid' : 'low'}`;
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
  showDraft(offers, title, hints = []) {
    $('draftTitle').textContent = title;
    const cards = $('cards');
    cards.innerHTML = '';
    cards.classList.toggle('four', offers.length > 3);
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
      if (hints[i]) {
        const h = document.createElement('span');
        h.className = 'combo-hint';
        h.textContent = hints[i];
        b.classList.add('has-combo');
        b.append(h);
      }
      b.addEventListener('click', () => this.onDraft(i));
      b.addEventListener('mouseenter', () => { this.sel = i; this.highlight(); });
      cards.appendChild(b);
    });
    this.show('draft');
  }

  /**
   * One bag per side; only the current player's usable slots are enabled.
   * 2v2: each side shows the bag of whoever plays (or plays next) for that team.
   */
  renderBags(game, interactive) {
    for (let side = 0; side < 2; side++) {
      const bag = $(`bag${side}`);
      const i = bagOwner(game, side);
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
      add(st.icon, st.showCount && value > 0 ? `${value}` : '');
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
  flash(long = false) {
    const el = $('flash');
    el.classList.remove('on', 'long');
    void el.offsetWidth;
    el.classList.add(long ? 'long' : 'on');
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

  /** Character select: one card per animal with sprite, 4 stat bars and the passive. */
  showSelect(title, art, { locked = false, msg = 'CLICK OR ARROWS + ENTER' } = {}) {
    $('selectTitle').textContent = title;
    $('selectMsg').textContent = msg;
    const wrap = $('charCards');
    wrap.innerHTML = '';
    for (const c of Object.values(CHARACTERS)) {
      const b = document.createElement('button');
      b.className = 'char-card';
      b.disabled = locked;
      b.style.setProperty('--accent', c.colors.main);
      const img = document.createElement('img');
      img.src = art[c.id].frames.idle0.toDataURL();
      img.alt = c.name;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = c.name;
      const animal = document.createElement('span');
      animal.className = 'animal';
      animal.textContent = c.animal;
      const stats = document.createElement('span');
      stats.className = 'stats';
      for (const [label, key] of [['HP', 'hp'], ['POW', 'power'], ['SIZE', 'size'], ['CTRL', 'control']]) {
        const row = document.createElement('span');
        row.className = 'stat';
        const l = document.createElement('i');
        l.textContent = label;
        const pips = document.createElement('span');
        pips.className = 'pips';
        for (let k = 1; k <= 5; k++) {
          const pip = document.createElement('b');
          if (k <= c.stats[key]) pip.className = 'on';
          pips.append(pip);
        }
        row.append(l, pips);
        stats.append(row);
      }
      const pas = document.createElement('span');
      pas.className = 'passive';
      const pn = document.createElement('b');
      pn.textContent = c.passive.name;
      const pd = document.createElement('small');
      pd.textContent = c.passive.desc;
      pas.append(pn, pd);
      b.append(img, name, animal, stats, pas);
      b.addEventListener('click', () => this.onSelect(c.id));
      b.addEventListener('mouseenter', () => { this.sel = [...wrap.children].indexOf(b); this.highlight(); });
      wrap.append(b);
    }
    this.show('select');
  }

  /** COMBO BOOK: every recipe -> result. */
  showBook() {
    const list = $('bookList');
    list.innerHTML = '';
    const heading = (text) => {
      const h = document.createElement('div');
      h.className = 'book-heading';
      h.textContent = text;
      list.append(h);
    };
    heading('COMBOS - USE IN THE SAME TURN');
    const entries = [
      ...Object.values(COMBOS).map((c) => ({ ...c, icons: c.recipe, sep: '+' })),
      null,
      ...Object.values(REACTIONS).map((r) => ({ name: r.name, desc: r.desc, icons: r.icons, sep: '>' })),
    ];
    for (const c of entries) {
      if (!c) { heading('REACTIONS - SET UP NOW, CASH IN LATER'); continue; }
      const row = document.createElement('div');
      row.className = 'book-row';
      const recipe = document.createElement('span');
      recipe.className = 'recipe';
      c.icons.forEach((id, k) => {
        if (k) recipe.append(c.sep);
        recipe.append(this.iconImg(id));
      });
      const text = document.createElement('span');
      text.className = 'book-text';
      const name = document.createElement('b');
      name.textContent = c.name;
      const desc = document.createElement('small');
      desc.textContent = c.desc;
      text.append(name, desc);
      row.append(recipe, text);
      list.append(row);
    }
    this.show('book');
  }

  /** Lobby: 'home' (create/join) or 'room' (show code, waiting). */
  showLobby(view, code = '') {
    $('lobbyHome').classList.toggle('hidden', view !== 'home');
    $('lobbyRoom').classList.toggle('hidden', view !== 'room');
    $('roomCode').textContent = code;
    this.show('online');
  }

  setLobbyMsg(text) { $('lobbyMsg').textContent = text; }

  /**
   * 2v2 seat grid (local setup and online team lobby). seats[i] = { label, sub, cls, click }.
   * Team = seat % 2: seats 0 and 2 on the left (ORANGE), 1 and 3 on the right (BLUE).
   */
  showTeams({ title, code = '', seats, start = 'START', canStart = true, msg = '' }) {
    $('teamsTitle').textContent = title;
    $('teamsCode').textContent = code;
    $('teamsCode').classList.toggle('hidden', !code);
    for (const side of [0, 1]) {
      const col = $(`seatCol${side}`);
      col.innerHTML = '';
      for (const i of [side, side + 2]) {
        const s = seats[i];
        const b = document.createElement('button');
        b.className = `seat ${s.cls || ''}`;
        b.innerHTML = `<span class="p">P${i + 1}</span> <span class="who"></span>`;
        b.querySelector('.who').textContent = s.label;
        b.disabled = !s.click;
        b.addEventListener('click', () => this.onSeat(i));
        col.append(b);
      }
    }
    const st = $('teamsStart');
    st.textContent = start;
    st.disabled = !canStart;
    st.classList.toggle('hidden', !start);
    $('teamsMsg').textContent = msg;
    const keep = this.activeScreen === this.screens.teams ? this.sel : 0;
    this.show('teams');
    this.sel = Math.min(keep, this.buttons().length - 1);
    this.highlight();
  }

  setRematchVisible(v) { $('rematch').classList.toggle('hidden', !v); this.sel = 0; this.highlight(); }

  /** Speech bubble above a character (x, y in game pixels, y = bubble bottom). */
  bubble(x, y, text) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    el.style.top = `${H - y}px`;
    this.popups.appendChild(el);
    const half = el.offsetWidth / 2 + 2;
    el.style.left = `${Math.max(half, Math.min(W - half, x))}px`;
    el.style.setProperty('--tail', `${Math.round(x - Math.max(half, Math.min(W - half, x)))}px`);
    setTimeout(() => el.remove(), 1700);
  }

  setOverText(title, sub) {
    $('overTitle').textContent = title;
    $('overSub').textContent = sub;
  }
}
