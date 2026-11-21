// Leitor de TXD (D3D9/DXT1) + codificador PNG (sem dependências externas).
'use strict';
const zlib = require('zlib');
const { fs, T, chunks, child, first, cstr } = require('./rw');

function decodeDXT1(src, off, w, h) {
  const out = new Uint8Array(w * h * 4); let hasAlpha = false;
  const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
  const c565 = c => [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const p = off + (by * bw + bx) * 8, c0 = src.readUInt16LE(p), c1 = src.readUInt16LE(p + 2), bits = src.readUInt32LE(p + 4);
    const a = c565(c0), b = c565(c1), pal = [a, b];
    if (c0 > c1) { pal.push(a.map((v, i) => (2 * v + b[i]) / 3 | 0), a.map((v, i) => (v + 2 * b[i]) / 3 | 0)); }
    else { pal.push(a.map((v, i) => (v + b[i]) / 2 | 0), [0, 0, 0]); }
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const idx = (bits >> (2 * (py * 4 + px))) & 3, x = bx * 4 + px, y = by * 4 + py;
      if (x >= w || y >= h) continue;
      const o = (y * w + x) * 4, c = pal[idx];
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
      if (c0 <= c1 && idx === 3) { out[o + 3] = 0; hasAlpha = true; } else out[o + 3] = 255;
    }
  }
  return { rgba: out, hasAlpha };
}
function decodeDXT3or5(src, off, w, h, five) {
  const out = new Uint8Array(w * h * 4), bw = w >> 2, bh = h >> 2;
  const c565 = c => [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const p = off + (by * bw + bx) * 16, ap = p, cp = p + 8;
    const c0 = src.readUInt16LE(cp), c1 = src.readUInt16LE(cp + 2), bits = src.readUInt32LE(cp + 4), a = c565(c0), b = c565(c1);
    const pal = [a, b, a.map((v, i) => (2 * v + b[i]) / 3 | 0), a.map((v, i) => (v + 2 * b[i]) / 3 | 0)];
    let alphas;
    if (!five) { alphas = []; for (let i = 0; i < 16; i++) { const byte = src[ap + (i >> 1)]; alphas.push(((i & 1 ? byte >> 4 : byte & 15)) * 17); } }
    else {
      const a0 = src[ap], a1 = src[ap + 1], tbl = [a0, a1];
      if (a0 > a1) for (let i = 1; i < 7; i++) tbl.push(((7 - i) * a0 + i * a1) / 7 | 0); else { for (let i = 1; i < 5; i++) tbl.push(((5 - i) * a0 + i * a1) / 5 | 0); tbl.push(0, 255); }
      let v = 0n; for (let i = 0; i < 6; i++) v |= BigInt(src[ap + 2 + i]) << BigInt(8 * i);
      alphas = []; for (let i = 0; i < 16; i++) alphas.push(tbl[Number((v >> BigInt(3 * i)) & 7n)]);
    }
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const x = bx * 4 + px, y = by * 4 + py, o = (y * w + x) * 4, c = pal[(bits >> (2 * (py * 4 + px))) & 3];
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = alphas[py * 4 + px];
    }
  }
  return { rgba: out, hasAlpha: true };
}
function loadTXD(file) {
  const buf = fs.readFileSync(file), dict = chunks(buf, 0, buf.length).find(c => c.type === T.TEXDICT), out = {};
  child(buf, dict, T.TEXTURENATIVE).forEach(tn => {
    const s = first(buf, tn, T.STRUCT); let p = s.start + 8;
    const name = cstr(buf, p, p + 32); p += 64;
    const rf = buf.readUInt32LE(p); p += 4; const fourcc = buf.toString('latin1', p, p + 4); p += 4;
    const w = buf.readUInt16LE(p), h = buf.readUInt16LE(p + 2), depth = buf[p + 4]; p += 8;
    if (rf & 0x2000) p += 1024; else if (rf & 0x4000) p += 64;
    const size = buf.readUInt32LE(p); p += 4;
    let dec = null;
    if (fourcc === 'DXT1') dec = decodeDXT1(buf, p, w, h);
    else if (fourcc === 'DXT3') dec = decodeDXT3or5(buf, p, w, h, false);
    else if (fourcc === 'DXT5') dec = decodeDXT3or5(buf, p, w, h, true);
    else if (depth === 32 || (rf & 0xf00) === 0x500) { const r = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) { r[i * 4] = buf[p + i * 4 + 2]; r[i * 4 + 1] = buf[p + i * 4 + 1]; r[i * 4 + 2] = buf[p + i * 4]; r[i * 4 + 3] = (rf & 0xf00) === 0x600 ? 255 : buf[p + i * 4 + 3]; } dec = { rgba: r, hasAlpha: (rf & 0xf00) !== 0x600 }; }   // 0x600 = formato 888: o 4º byte não é alfa
    if (dec) out[name] = { w, h, rgba: dec.rgba, hasAlpha: dec.hasAlpha };
  });
  return out;
}
function downscale(img, maxSize) {
  let { w, h, rgba } = img;
  while (Math.max(w, h) > maxSize && w > 1 && h > 1) {
    const nw = w >> 1, nh = h >> 1, o = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 4; c++) {
      const i = ((y * 2) * w + x * 2) * 4 + c;
      o[(y * nw + x) * 4 + c] = (rgba[i] + rgba[i + 4] + rgba[i + w * 4] + rgba[i + w * 4 + 4]) >> 2;
    }
    rgba = o; w = nw; h = nh;
  }
  return { w, h, rgba, hasAlpha: img.hasAlpha };
}
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function encodePNG(img) {
  const { w, h, rgba, hasAlpha } = img, ch = hasAlpha ? 4 : 3, stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 1; // filtro Sub
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
      const v = rgba[(y * w + x) * 4 + c], left = x ? rgba[(y * w + x - 1) * 4 + c] : 0;
      raw[y * (stride + 1) + 1 + x * ch + c] = (v - left) & 255;
    }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = hasAlpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { loadTXD, downscale, encodePNG };
