// Tiny pixel-canvas helper: draw with rects/ellipses/lines, auto-outline, export to <canvas>.
export class Pix {
  constructor(w, h, ox = 0, oy = 0) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.d = new Array(w * h).fill(null);
  }

  set(x, y, c) {
    x = Math.round(x) + this.ox;
    y = Math.round(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  thick(x0, y0, x1, y1, c) {
    this.line(x0, y0, x1, y1, c);
    this.line(x0 + 1, y0, x1 + 1, y1, c);
  }

  outline(c) {
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? null : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.d[y * this.w + x] = c;
      }
    }
    return this;
  }

  static fromStrings(rows, palette, pad = 1) {
    const p = new Pix(rows[0].length + pad * 2, rows.length + pad * 2, pad, pad);
    rows.forEach((row, y) => [...row].forEach((ch, x) => palette[ch] && p.set(x, y, palette[ch])));
    return p;
  }

  /** Canvas with even dimensions (keeps centered sprites pixel-aligned), bottom-aligned. */
  toCanvas() {
    const cw = this.w + (this.w % 2);
    const ch = this.h + (this.h % 2);
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cw, ch);
    const offY = ch - this.h;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.d[y * this.w + x];
        if (!c) continue;
        const i = ((y + offY) * cw + x) * 4;
        img.data[i] = parseInt(c.slice(1, 3), 16);
        img.data[i + 1] = parseInt(c.slice(3, 5), 16);
        img.data[i + 2] = parseInt(c.slice(5, 7), 16);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}
