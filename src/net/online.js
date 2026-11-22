// Thin WebSocket client for online rooms (same origin: /api/...).
export class Online {
  constructor() {
    this.ws = null;
    this.onMessage = () => {};
    this.onClose = () => {};
  }

  static async createRoom(size = 2) {
    const res = await fetch(size === 4 ? '/api/new?size=4' : '/api/new');
    if (!res.ok) throw new Error('server error');
    return (await res.json()).code;
  }

  connect(code) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/room/${encodeURIComponent(code)}`);
      let opened = false;
      ws.onopen = () => { opened = true; resolve(); };
      ws.onerror = () => { if (!opened) reject(new Error('could not connect')); };
      ws.onclose = () => { if (opened) this.onClose(); else reject(new Error('could not connect')); };
      ws.onmessage = (e) => {
        try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); }
      };
      this.ws = ws;
    });
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    if (!this.ws) return;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }
}
