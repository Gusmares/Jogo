// NEON ENGINE — modelos do GTA IV: rmcDrawable (.wdr), dicionário de drawables (.wdd) e fragmento (.wft, objetos que quebram).
// Saída: lista de malhas { shader, texture, positions, normals, uvs, indices } já no sistema do three (Y para cima).
'use strict';
const { ptrArray } = require('./rsc');
const { readTextureDict, cleanName } = require('./textures');
const TYPE_SIZE = [2, 4, 6, 8, 4, 8, 12, 16, 4, 4, 4, 4, 4, 4, 4, 4];
const DIFFUSE = 0x2b5170fd;
function half(h) { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024); }
/* lê um componente conforme o tipo */
function readEl(buf, o, type, n) {
  const out = [];
  if (type === 6 || type === 5 || type === 7 || type === 4) { for (let i = 0; i < n; i++) out.push(buf.readFloatLE(o + i * 4)); }
  else if (type <= 3) { for (let i = 0; i < n; i++) out.push(half(buf.readUInt16LE(o + i * 2))); }
  else if (type === 10) { const v = buf.readUInt32LE(o), c = s => { let x = s & 1023; if (x & 512) x -= 1024; return x / 511; }; out.push(c(v), c(v >> 10), c(v >> 20)); }
  else if (type === 8 || type === 9) { for (let i = 0; i < 4; i++) out.push(buf[o + i] / 255); }
  return out;
}
/* um shader: nome, .sps e a textura difusa */
function readShader(R, s) {
  const out = { name: R.str(R.u32(s, 0x44)) || '', sps: R.str(R.u32(s, 0x48)) || '', texture: null };
  try {
    const n = R.u32(s, 0x1C), offs = R.u32(s, 0x14), types = R.u32(s, 0x24), hashes = R.u32(s, 0x34); let first = null;
    for (let i = 0; i < Math.min(n, 64); i++) {
      if (R.u8(types, i) !== 0) continue; const pd = R.u32(offs, i * 4); if (!R.ok(pd)) continue;
      const name = cleanName(R.str(R.u32(pd, 0x14))); if (!name) continue;
      if (R.u32(hashes, i * 4) === DIFFUSE) { out.texture = name; break; } if (!first) first = name;
    }
    if (!out.texture) out.texture = first;
  } catch (e) { /* shader sem parâmetros legíveis */ }
  return out;
}
/* lê um drawable em d (estrutura rmcDrawable) */
function readDrawable(R, d) {
  const sg = R.u32(d, 0x08), shaders = R.ok(sg) ? ptrArray(R, sg + 0x08).map(s => readShader(R, s)) : [];
  const txdPtr = R.ok(sg) ? R.u32(sg, 0x04) : 0, textures = R.ok(txdPtr) ? readTextureDict(R, txdPtr) : new Map();
  const meshes = [], mc = R.u32(d, 0x40);
  if (!R.ok(mc)) return { shaders, textures, meshes };
  for (const m of ptrArray(R, mc)) {
    const geos = ptrArray(R, m + 0x04), map = R.u32(m, 0x10);
    geos.forEach((g, gi) => {
      try {
        const vb = R.u32(g, 0x0C), ib = R.u32(g, 0x1C), si = R.ok(map) ? R.u16(map, gi * 2) : 0;
        const vc = R.u16(vb, 0x04), vdata = R.u32(vb, 0x08), stride = R.u32(vb, 0x0C), decl = R.u32(vb, 0x10);
        const mask = R.u32(decl, 0), lo = R.u32(decl, 8), hi = R.u32(decl, 12), types = i => i < 8 ? (lo >>> (i * 4)) & 15 : (hi >>> ((i - 8) * 4)) & 15;
        const offs = {}; let o = 0; const order = []; for (let i = 0; i < 16; i++) if (mask & (1 << i)) order.push(i);
        if (R.u8(decl, 6) && order.includes(3)) { order.splice(order.indexOf(3), 1); order.unshift(3); }
        for (const i of order) { offs[i] = o; o += TYPE_SIZE[types(i)]; }
        const V = R.slice(vdata, vc * stride), pos = [], nor = [], uv = [], col = [];
        for (let v = 0; v < vc; v++) {
          const b = v * stride;
          const p = readEl(V, b + offs[0], types(0), 3); pos.push(p[0], p[2], -p[1]);                       // GTA (Z para cima) -> three (Y para cima)
          if (offs[3] !== undefined) { const n = readEl(V, b + offs[3], types(3), 3); nor.push(n[0], n[2], -n[1]); }
          if (offs[6] !== undefined) { const t = readEl(V, b + offs[6], types(6), 2); uv.push(t[0], t[1]); }
          if (offs[4] !== undefined) { const c = readEl(V, b + offs[4], types(4), 4); col.push(c[2], c[1], c[0], c[3]); }
        }
        const ic = R.u32(ib, 0x04), I = R.slice(R.u32(ib, 0x08), ic * 2), idx = new Uint32Array(ic); for (let i = 0; i < ic; i++) idx[i] = I.readUInt16LE(i * 2);
        if (pos.some(x => !isFinite(x))) return;
        meshes.push({ shader: shaders[si] || { name: '', sps: '', texture: null }, positions: new Float32Array(pos), normals: nor.length ? new Float32Array(nor) : null, uvs: uv.length ? new Float32Array(uv) : null, colors: col.length ? new Float32Array(col) : null, indices: idx });
      } catch (e) { /* geometria que não entendemos: pula */ }
    });
  }
  return { shaders, textures, meshes };
}
/* procura drawables num recurso: .wdr (raiz), .wdd (dicionário) ou .wft (varre o bloco de sistema atrás da estrutura) */
function findDrawables(R, ext) {
  if (ext === 'wdr') return [{ at: 0x50000000, hash: null }];
  if (ext === 'wdd') { const hs = ptrArray(R, 0x50000000 + 0x10), vs = ptrArray(R, 0x50000000 + 0x18); return vs.map((v, i) => ({ at: v, hash: hs[i] >>> 0 })); }
  const out = [], seen = new Set();
  for (let o = 0; o + 0x50 < R.sys.length; o += 4) {
    const d = 0x50000000 + o, sg = R.sys.readUInt32LE(o + 8), mc = R.sys.readUInt32LE(o + 0x40);
    if ((sg >>> 28) !== 5 || (mc >>> 28) !== 5 || !R.ok(sg) || !R.ok(mc)) continue;
    try {
      const sh = ptrArray(R, sg + 8); if (!sh.length || sh.length > 64) continue;
      if (!sh.every(s => /\.sps$/i.test(R.str(R.u32(s, 0x48)) || ''))) continue;
      const ms = ptrArray(R, mc); if (!ms.length || ms.length > 32 || seen.has(mc)) continue;
      seen.add(mc); out.push({ at: d, hash: null });
    } catch (e) { /* não é */ }
  }
  return out;
}
/* hash do GTA IV (Jenkins one-at-a-time, minúsculas): liga entradas de dicionário aos nomes do .ide */
function joaat(s) { let h = 0; for (const ch of s.toLowerCase()) { h = (h + ch.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0; } h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h >>> 0; }
module.exports = { readDrawable, findDrawables, joaat };
