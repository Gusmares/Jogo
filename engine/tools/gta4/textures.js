// NEON ENGINE — texturas do GTA IV (.wtd ou dicionário embutido no modelo) -> RGBA -> PNG.
// Formatos: DXT1, DXT3, DXT5, A8R8G8B8 (21), X8R8G8B8 (22), L8 (50).
'use strict';
const { PNG } = require('pngjs');
const { ptrArray } = require('./rsc');

function c565(c) { return [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0]; }
function decodeDXT(src, w, h, kind) {
  const out = Buffer.alloc(w * h * 4), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), bs = kind === 1 ? 8 : 16;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * bs; if (o + bs > src.length) break;
    const co = kind === 1 ? o : o + 8, c0 = src.readUInt16LE(co), c1 = src.readUInt16LE(co + 2), bits = src.readUInt32LE(co + 4);
    const a = c565(c0), b = c565(c1), pal = [a.concat(255), b.concat(255)];
    if (kind !== 1 || c0 > c1) { pal.push([(2 * a[0] + b[0]) / 3 | 0, (2 * a[1] + b[1]) / 3 | 0, (2 * a[2] + b[2]) / 3 | 0, 255], [(a[0] + 2 * b[0]) / 3 | 0, (a[1] + 2 * b[1]) / 3 | 0, (a[2] + 2 * b[2]) / 3 | 0, 255]); }
    else pal.push([(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1, 255], [0, 0, 0, 0]);
    let alpha = null;
    if (kind === 3) { alpha = []; for (let i = 0; i < 16; i++) alpha.push(((src[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17); }
    else if (kind === 5) {
      const a0 = src[o], a1 = src[o + 1], ap = [a0, a1]; if (a0 > a1) for (let i = 1; i < 7; i++) ap.push(((7 - i) * a0 + i * a1) / 7 | 0); else { for (let i = 1; i < 5; i++) ap.push(((5 - i) * a0 + i * a1) / 5 | 0); ap.push(0, 255); }
      let ab = 0n; for (let i = 0; i < 6; i++) ab |= BigInt(src[o + 2 + i]) << BigInt(8 * i);
      alpha = []; for (let i = 0; i < 16; i++) alpha.push(ap[Number((ab >> BigInt(3 * i)) & 7n)]);
    }
    for (let i = 0; i < 16; i++) {
      const px = bx * 4 + (i & 3), py = by * 4 + (i >> 2); if (px >= w || py >= h) continue;
      const p = pal[(bits >> (2 * i)) & 3], d = (py * w + px) * 4; out[d] = p[0]; out[d + 1] = p[1]; out[d + 2] = p[2]; out[d + 3] = alpha ? alpha[i] : p[3];
    }
  }
  return out;
}
const cleanName = s => (s || '').replace(/^pack:\//i, '').replace(/\.dds$/i, '').toLowerCase();
/* lê todas as texturas de um dicionário (no recurso R, estrutura em "at") */
function readTextureDict(R, at) {
  const out = new Map();
  for (const t of ptrArray(R, at + 0x18)) {
    try {
      const name = cleanName(R.str(R.u32(t, 0x14))), w = R.u16(t, 0x1C), h = R.u16(t, 0x1E), fmt = R.u32(t, 0x20), data = R.u32(t, 0x48);
      if (!w || !h || !R.ok(data)) continue;
      const four = Buffer.alloc(4); four.writeUInt32LE(fmt); const f = four.toString('latin1');
      let rgba;
      if (f === 'DXT1') rgba = decodeDXT(R.slice(data, (Math.max(1, w >> 2)) * Math.max(1, h >> 2) * 8), w, h, 1);
      else if (f === 'DXT3' || f === 'DXT5') rgba = decodeDXT(R.slice(data, Math.max(1, w >> 2) * Math.max(1, h >> 2) * 16), w, h, f === 'DXT3' ? 3 : 5);
      else if (fmt === 21 || fmt === 22) { const s = R.slice(data, w * h * 4); rgba = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { rgba[i * 4] = s[i * 4 + 2]; rgba[i * 4 + 1] = s[i * 4 + 1]; rgba[i * 4 + 2] = s[i * 4]; rgba[i * 4 + 3] = fmt === 22 ? 255 : s[i * 4 + 3]; } }
      else if (fmt === 50) { const s = R.slice(data, w * h); rgba = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = s[i]; rgba[i * 4 + 3] = 255; } }
      else continue;
      let alpha = false; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) { alpha = true; break; }
      out.set(name, { name, w, h, rgba, alpha });
    } catch (e) { /* textura estranha: pula */ }
  }
  return out;
}
function toPNG(tex) { const p = new PNG({ width: tex.w, height: tex.h }); tex.rgba.copy(p.data); return PNG.sync.write(p); }
module.exports = { readTextureDict, toPNG, cleanName, decodeDXT };
