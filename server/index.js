// Cloudflare Worker: serves the built game (static assets) and the online rooms.
//   GET /api/new[?size=4] -> { code }  creates a room (2 = 1v1, 4 = 2v2 teams)
//   GET /api/room/:code   -> WebSocket into that room (Durable Object)
import { DurableObject } from 'cloudflare:workers';
import { Match } from './match.js';
import { CHARACTERS } from '../src/core/characters/index.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1 to avoid typos
const CODE_LEN = 5;

const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(CODE_LEN)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/api/new') {
      const code = newCode();
      const size = url.searchParams.get('size') === '4' ? 4 : 2;
      await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(`https://room/init?size=${size}`, { method: 'POST' });
      return Response.json({ code });
    }

    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]{4,8})$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase())).fetch(req);
    }

    return env.ASSETS.fetch(req);
  },
};

const randomChar = () => {
  const ids = Object.keys(CHARACTERS);
  return ids[crypto.getRandomValues(new Uint32Array(1))[0] % ids.length];
};

/**
 * One Durable Object per room. Uses WebSocket hibernation (cheap on the free
 * plan): in-memory state may be dropped while players think, so the match is
 * saved as (seed + move log) and replayed when the room wakes up.
 */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.match = null;
  }

  async loadMatch() {
    if (!this.match) {
      const saved = await this.ctx.storage.get('match');
      if (saved) this.match = Match.replay(saved.seed, saved.log, saved.chars);
    }
    return this.match;
  }

  async saveMatch() {
    await this.ctx.storage.put('match', { seed: this.match.seed, log: this.match.log, chars: this.match.chars });
  }

  sockets(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }

  sendOther(seat, msg) {
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.seat !== seat) this.send(ws, msg);
  }

  async startNewMatch(chars) {
    this.match = new Match(crypto.getRandomValues(new Uint32Array(1))[0], chars);
    await this.saveMatch();
    await this.ctx.storage.delete('rematch');
    const bots = await this.bots();
    const host = this.host(bots);
    for (const ws of this.sockets()) {
      this.send(ws, { t: 'start', seed: this.match.seed, chars, you: ws.deserializeAttachment().seat, bots, host, ...this.match.state });
    }
  }

  // ---------- 2v2 rooms ----------
  async size() { return (await this.ctx.storage.get('size')) || 2; }
  async bots() { return (await this.ctx.storage.get('bots')) || []; }

  /** The browser that runs the CPU seats: lowest connected seat that isn't a CPU itself. */
  host(bots, except) {
    const seats = this.sockets(except).map((ws) => ws.deserializeAttachment().seat).filter((s) => !bots.includes(s));
    return seats.length ? Math.min(...seats) : 0;
  }

  /** Team lobby: who sits where (seat % 2 = team). */
  broadcastRoom(except) {
    const taken = [false, false, false, false];
    for (const ws of this.sockets(except)) taken[ws.deserializeAttachment().seat] = true;
    const host = this.host([], except);
    for (const ws of this.sockets(except)) this.send(ws, { t: 'room', seats: taken, you: ws.deserializeAttachment().seat, host });
  }

  /** CPU seats changed (someone left or came back): tell everyone who drives what now. */
  async broadcastSeats(extra = {}, except) {
    const bots = await this.bots();
    const host = this.host(bots, except);
    for (const ws of this.sockets(except)) this.send(ws, { t: 'seats', bots, host, ...extra });
  }

  /** Both players connected: each picks a character (kept secret until both are in). */
  async beginSelect() {
    const picks = (await this.ctx.storage.get('picks')) || {};
    for (const ws of this.sockets()) {
      const seat = ws.deserializeAttachment().seat;
      this.send(ws, { t: 'select', you: seat, picked: picks[seat] || null });
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      await this.ctx.storage.put('created', true);
      await this.ctx.storage.put('size', url.searchParams.get('size') === '4' ? 4 : 2);
      return new Response('ok');
    }
    if (!(await this.ctx.storage.get('created'))) return new Response('No such room', { status: 404 });

    const size = await this.size();
    const taken = new Set(this.sockets().map((ws) => ws.deserializeAttachment()?.seat));
    const started = size === 4 && (await this.ctx.storage.get('started'));
    // 2v2 after START: only players who dropped out can come back (their seat is a CPU meanwhile).
    const away = started ? (await this.ctx.storage.get('away')) || [] : null;
    const seat = started
      ? away.find((s) => !taken.has(s))
      : Array.from({ length: size }, (_, i) => i).find((s) => !taken.has(s));
    if (seat === undefined) return new Response('Room is full', { status: 409 });

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat });

    const match = await this.loadMatch();
    if (size === 4) {
      await this.joinTeams(server, seat, started, match);
    } else if (match) {
      // Re-joining a match in progress (e.g. page refresh).
      this.send(server, { t: 'start', seed: match.seed, chars: match.chars, you: seat, resume: true, ...match.state });
      this.sendOther(seat, { t: 'back' });
    } else if (taken.size === 1) {
      await this.beginSelect();
    } else {
      this.send(server, { t: 'waiting' });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 2v2: someone connected (lobby seat, or coming back to a seat a CPU kept warm). */
  async joinTeams(ws, seat, started, match) {
    if (!started) { this.broadcastRoom(); return; }
    const away = ((await this.ctx.storage.get('away')) || []).filter((s) => s !== seat);
    await this.ctx.storage.put('away', away);
    let bots = await this.bots();
    // Mid-turn on their own seat? The CPU finishes this turn; they take over from the next one.
    const returning = match && match.game.winner === null && match.game.turn === seat;
    if (returning) {
      await this.ctx.storage.put('returning', [...new Set([...((await this.ctx.storage.get('returning')) || []), seat])]);
    } else {
      bots = bots.filter((s) => s !== seat);
      await this.ctx.storage.put('bots', bots);
    }
    if (match) {
      this.send(ws, { t: 'start', seed: match.seed, chars: match.chars, you: seat, resume: true, bots, host: this.host(bots), ...match.state });
    } else {
      const picks = (await this.ctx.storage.get('picks')) || {};
      this.send(ws, { t: 'select', you: seat, picked: picks[seat] || null, size: 4 });
    }
    await this.broadcastSeats({ back: seat });
  }

  /** At each new turn, players who came back get their seat back from the CPU. */
  async releaseReturning() {
    const returning = (await this.ctx.storage.get('returning')) || [];
    if (!returning.length) return;
    await this.ctx.storage.put('bots', (await this.bots()).filter((s) => !returning.includes(s)));
    await this.ctx.storage.delete('returning');
    await this.broadcastSeats();
  }

  async webSocketMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const { seat } = ws.deserializeAttachment();
    const match = await this.loadMatch();
    const size = await this.size();

    // 2v2 lobby: move to an empty seat / the host starts (empty seats become CPUs).
    if (msg.t === 'seat' && size === 4 && !(await this.ctx.storage.get('started'))) {
      const to = msg.seat | 0;
      const taken = new Set(this.sockets().map((s) => s.deserializeAttachment().seat));
      if (to >= 0 && to < 4 && !taken.has(to)) ws.serializeAttachment({ seat: to });
      this.broadcastRoom();
      return;
    }
    if (msg.t === 'go' && size === 4 && !(await this.ctx.storage.get('started'))) {
      if (seat !== this.host([]) || this.sockets().length < 2) return;
      const taken = new Set(this.sockets().map((s) => s.deserializeAttachment().seat));
      const bots = [0, 1, 2, 3].filter((s) => !taken.has(s));
      const picks = Object.fromEntries(bots.map((s) => [s, randomChar()]));
      await this.ctx.storage.put({ started: true, bots, picks, away: [] });
      for (const s of this.sockets()) this.send(s, { t: 'select', you: s.deserializeAttachment().seat, picked: null, size: 4 });
      return;
    }

    if (msg.t === 'char') {
      if (match || !CHARACTERS[msg.id]) return;
      const picks = (await this.ctx.storage.get('picks')) || {};
      picks[seat] = msg.id;
      await this.ctx.storage.put('picks', picks);
      const seats = Array.from({ length: size }, (_, i) => i);
      if (seats.every((s) => picks[s])) await this.startNewMatch(seats.map((s) => picks[s]));
      else this.sendOther(seat, { t: 'picked' });
      return;
    }

    if (msg.t === 'rematch') {
      const votes = new Set((await this.ctx.storage.get('rematch')) || []);
      votes.add(seat);
      const bots = await this.bots();
      const need = size === 4 ? this.sockets().filter((s) => !bots.includes(s.deserializeAttachment().seat)).length : 2;
      if (votes.size >= need) await this.startNewMatch(match.chars);
      else {
        await this.ctx.storage.put('rematch', [...votes]);
        this.sendOther(seat, { t: 'rematch' });
      }
      return;
    }
    if (!match) return;

    // Which seat this move is for: your own, or (2v2 host only) a CPU seat.
    let actor = seat;
    if (size === 4) {
      const bots = await this.bots();
      const target = Number.isInteger(msg.seat) ? msg.seat : seat;
      if (bots.includes(target) ? seat !== this.host(bots) : target !== seat) return;
      actor = target;
    }

    // Live aiming is just relayed (not saved).
    if (msg.t === 'aim' || msg.t === 'charge') {
      if (actor === match.game.turn) for (const s of this.sockets(ws)) this.send(s, { t: msg.t, angle: Number(msg.angle) || 0 });
      return;
    }

    const res = match.apply(actor, msg);
    if (res.error) {
      this.send(ws, { t: 'error', msg: res.error, ...match.state });
      return;
    }
    await this.saveMatch();
    for (const s of this.sockets(ws)) this.send(s, res.relay);
    if (res.turn) {
      for (const s of this.sockets()) this.send(s, { t: 'turn', ...res.turn });
      if (size === 4) await this.releaseReturning();
    }
  }

  async webSocketClose(ws) {
    const { seat } = ws.deserializeAttachment() || {};
    if ((await this.size()) === 4) {
      if (!(await this.ctx.storage.get('started'))) {
        this.broadcastRoom(ws);
      } else {
        // A CPU keeps their seat warm until they come back.
        const bots = [...new Set([...(await this.bots()), seat])];
        const away = [...new Set([...((await this.ctx.storage.get('away')) || []), seat])];
        await this.ctx.storage.put({ bots, away });
        const picks = (await this.ctx.storage.get('picks')) || {};
        const match = await this.loadMatch();
        if (!match && !picks[seat]) {
          picks[seat] = randomChar();
          await this.ctx.storage.put('picks', picks);
        }
        await this.broadcastSeats({ left: seat }, ws);
        if (!match && this.sockets(ws).length && [0, 1, 2, 3].every((s) => picks[s])) await this.startNewMatch([0, 1, 2, 3].map((s) => picks[s]));
      }
    } else {
      this.sendOther(seat, { t: 'left' });
    }
    if (this.sockets(ws).length === 0) {
      // Everyone left: forget the room.
      await this.ctx.storage.deleteAll();
      this.match = null;
    }
  }
}
