// Cloudflare Worker: serves the built game (static assets) and the online rooms.
//   GET /api/new          -> { code }  creates a room
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
      await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room/init', { method: 'POST' });
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
    for (const ws of this.sockets()) {
      this.send(ws, { t: 'start', seed: this.match.seed, chars, you: ws.deserializeAttachment().seat, ...this.match.state });
    }
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
      return new Response('ok');
    }
    if (!(await this.ctx.storage.get('created'))) return new Response('No such room', { status: 404 });

    const taken = new Set(this.sockets().map((ws) => ws.deserializeAttachment()?.seat));
    const seat = [0, 1].find((s) => !taken.has(s));
    if (seat === undefined) return new Response('Room is full', { status: 409 });

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat });

    const match = await this.loadMatch();
    if (match) {
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

  async webSocketMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const { seat } = ws.deserializeAttachment();
    const match = await this.loadMatch();

    if (msg.t === 'char') {
      if (match || !CHARACTERS[msg.id]) return;
      const picks = (await this.ctx.storage.get('picks')) || {};
      picks[seat] = msg.id;
      await this.ctx.storage.put('picks', picks);
      if (picks[0] && picks[1]) await this.startNewMatch([picks[0], picks[1]]);
      else this.sendOther(seat, { t: 'picked' });
      return;
    }

    if (msg.t === 'rematch') {
      const votes = new Set((await this.ctx.storage.get('rematch')) || []);
      votes.add(seat);
      if (votes.size >= 2) await this.startNewMatch(match.chars);
      else {
        await this.ctx.storage.put('rematch', [...votes]);
        this.sendOther(seat, { t: 'rematch' });
      }
      return;
    }
    if (!match) return;

    // Live aiming is just relayed (not saved).
    if (msg.t === 'aim' || msg.t === 'charge') {
      if (seat === match.game.turn) this.sendOther(seat, { t: msg.t, angle: Number(msg.angle) || 0 });
      return;
    }

    const res = match.apply(seat, msg);
    if (res.error) {
      this.send(ws, { t: 'error', msg: res.error, ...match.state });
      return;
    }
    await this.saveMatch();
    this.sendOther(seat, res.relay);
    if (res.turn) for (const s of this.sockets()) this.send(s, { t: 'turn', ...res.turn });
  }

  async webSocketClose(ws) {
    const { seat } = ws.deserializeAttachment() || {};
    this.sendOther(seat, { t: 'left' });
    if (this.sockets(ws).length === 0) {
      // Everyone left: forget the room.
      await this.ctx.storage.deleteAll();
      this.match = null;
    }
  }
}
