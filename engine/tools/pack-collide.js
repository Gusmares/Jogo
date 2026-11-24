#!/usr/bin/env node
// NEON ENGINE — calcula o colisor de cada objeto dos packs a partir da MALHA do model.glb e grava em object.json (campo "colisor").
//   node engine/tools/pack-collide.js [--project projects/neon-coast] [--only prefixo,id] [--dry] [--list]
// O jogo (js/world/placements.js, buildVegGroup) lê esse campo em vez de usar a caixa do modelo. Roda em Node puro (lê o GLB direto, sem Electron).
// Formato: "colisor": { "tipo": "tronco|arbusto|rocha|tronco-caido|prop|nenhum", "h": altura(m), "c": [[x, z, r], ...] }
//   c = círculos no plano x,z do modelo (m, escala 1, origem no centro da base). O jogo escala/gira e grava cada círculo com addRound
//   (o mesmo colisor de sempre: caixa quadrada de meio-lado r, collision.js). Documentação: engine/docs/espalhar-packs.md
// Regras:
//   • grama, capim, flores, rasteiras, mudas e arbustos <= 1,5 m: tipo "nenhum" (o jogador atravessa);
//   • arbusto > 1,5 m: um círculo pequeno no centro (tronco), raio 0,12-0,3 m;
//   • árvore (>= 5 m): um círculo só no tronco; raio = largura da malha opaca (casca) cortada a 1 m do chão, limite 0,15-0,8 m; nunca a copa;
//   • rocha / tronco caído / prop: contorno real da base (casco convexo dos vértices baixos) -> círculos ao longo do eixo principal, um pouco menores que a caixa.
'use strict';
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const flag = n => args.includes('--' + n), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT = path.resolve(ROOT, opt('project', process.env.NEON_PROJECT || 'projects/neon-coast'));
const OBJ = path.join(PROJECT, 'assets', 'objects');
const ONLY = opt('only', '').split(',').filter(Boolean);
const WANT = /^(vp_|vf_|sp_|gp_|sa_|sf_)|^orelhao$/;

// ---------- leitor mínimo de GLB: devolve triângulos [x,y,z]*3 em espaço do modelo, com o modo alfa do material ----------
const CT = { 5120: [1, Int8Array], 5121: [1, Uint8Array], 5122: [2, Int16Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readGLB(file) {
  const b = fs.readFileSync(file); if (b.toString('latin1', 0, 4) !== 'glTF') throw new Error('não é GLB');
  let off = 12, json = null, bin = null;
  while (off < b.length) { const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4), data = b.subarray(off + 8, off + 8 + len); if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8')); else if (type === 0x004E4942) bin = data; off += 8 + len; }
  const acc = i => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], [sz, Arr] = CT[a.componentType], n = NC[a.type], stride = bv.byteStride || sz * n;
    const out = new Float64Array(a.count * n), base = (bv.byteOffset || 0) + (a.byteOffset || 0), dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const p = base + k * stride + c * sz; let v;
      switch (a.componentType) { case 5126: v = dv.getFloat32(p, true); break; case 5125: v = dv.getUint32(p, true); break; case 5123: v = dv.getUint16(p, true); break; case 5121: v = dv.getUint8(p); break; case 5122: v = dv.getInt16(p, true); break; default: v = dv.getInt8(p); }
      if (a.normalized) v = Math.max(v / (a.componentType === 5123 ? 65535 : a.componentType === 5121 ? 255 : a.componentType === 5122 ? 32767 : 127), -1);
      out[k * n + c] = v;
    }
    return out;
  };
  const mul = (a, b2) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b2[j * 4 + k]; return o; };
  const nodeM = n => {
    if (n.matrix) return n.matrix.slice();
    const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], [x, y, z, w] = q;
    return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0, 2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
  };
  const tris = [];                                           // { p: [9 números], mode: 'OPAQUE'|'MASK'|'BLEND' }
  const walk = (ni, parent) => {
    const n = json.nodes[ni], M = mul(parent, nodeM(n));
    if (n.mesh !== undefined) for (const pr of json.meshes[n.mesh].primitives) {
      if (pr.mode !== undefined && pr.mode !== 4) continue;
      const P = acc(pr.attributes.POSITION), idx = pr.indices !== undefined ? acc(pr.indices) : null, mat = pr.material !== undefined ? json.materials[pr.material] : null, mode = (mat && mat.alphaMode) || 'OPAQUE';
      const cnt = idx ? idx.length : P.length / 3, V = i => { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; };
      for (let t = 0; t + 2 < cnt; t += 3) { const a = V(idx ? idx[t] : t), b2 = V(idx ? idx[t + 1] : t + 1), c = V(idx ? idx[t + 2] : t + 2); tris.push({ p: [...a, ...b2, ...c], mode }); }
    }
    for (const c of n.children || []) walk(c, M);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const sc = json.scenes[json.scene || 0]; for (const r of sc.nodes) walk(r, I);
  return tris;
}

// ---------- geometria ----------
// pontos do corte da malha no plano y = yc
function slicePoints(tris, yc, filter) {
  const pts = [];
  for (const t of tris) {
    if (filter && !filter(t)) continue; const p = t.p, ys = [p[1], p[4], p[7]]; if (Math.min(...ys) > yc || Math.max(...ys) < yc) continue;
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) { const y0 = ys[i], y1 = ys[j]; if ((y0 - yc) * (y1 - yc) > 0 || y0 === y1) continue; const u = (yc - y0) / (y1 - y0); pts.push([p[i * 3] + (p[j * 3] - p[i * 3]) * u, p[i * 3 + 2] + (p[j * 3 + 2] - p[i * 3 + 2]) * u]); }
  }
  return pts;
}
function hull(pts) {                                         // casco convexo (monotone chain), pontos [x,z]
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
// círculos ao longo do eixo principal do contorno: fatias de comprimento ~ largura; cada círculo = meia largura da fatia * k (fica um pouco menor que a caixa)
function circlesFromFootprint(pts, k, maxN) {
  if (pts.length < 3) return [];
  const H = hull(pts); let mx = 0, mz = 0; for (const p of pts) { mx += p[0]; mz += p[1]; } mx /= pts.length; mz /= pts.length;
  let sxx = 0, szz = 0, sxz = 0; for (const p of H) { const dx = p[0] - mx, dz = p[1] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = [Math.cos(ang), Math.sin(ang)], pe = [-ax[1], ax[0]];
  const u = p => (p[0] - mx) * ax[0] + (p[1] - mz) * ax[1], v = p => (p[0] - mx) * pe[0] + (p[1] - mz) * pe[1];
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of H) { u0 = Math.min(u0, u(p)); u1 = Math.max(u1, u(p)); v0 = Math.min(v0, v(p)); v1 = Math.max(v1, v(p)); }
  const L = u1 - u0, W = v1 - v0; if (L < 1e-3 || W < 1e-3) return [];
  const n = Math.max(1, Math.min(maxN, Math.round(L / Math.max(W * 0.9, 0.15))));
  const out = [];
  for (let i = 0; i < n; i++) {                              // largura do contorno na fatia [a, b]: percorre as arestas do casco
    const a = u0 + L * i / n, b = u0 + L * (i + 1) / n; let lo = 1e9, hi = -1e9;
    const sample = q => { for (let s = 0; s < H.length; s++) { const p = H[s], r = H[(s + 1) % H.length], pu = u(p), ru = u(r), pv = v(p), rv = v(r); const t0 = Math.max(a, Math.min(pu, ru)), t1 = Math.min(b, Math.max(pu, ru)); if (t0 > t1) continue;
      for (const uu of [t0, t1]) { const f = ru === pu ? 0 : (uu - pu) / (ru - pu); const vv = pv + (rv - pv) * f; lo = Math.min(lo, vv); hi = Math.max(hi, vv); } } };
    sample();
    if (lo > hi) continue;
    const cu = (a + b) / 2, cv = (lo + hi) / 2, r = Math.max(0.05, Math.min((hi - lo) / 2, Math.max(b - a, W) / 2) * k);
    out.push([+(mx + ax[0] * cu + pe[0] * cv).toFixed(3), +(mz + ax[1] * cu + pe[1] * cv).toFixed(3), +r.toFixed(3)]);
  }
  return out;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- regras por modelo ----------
function classify(id, j) {
  const H = j.dims.height, fp = Math.max(j.dims.width, j.dims.len);
  if (/tronco_caido/.test(id)) return 'tronco-caido';
  if (/rocha/.test(id)) return 'rocha';
  if (!j.veg) return 'prop';
  if (/^(gp_|sp_)/.test(id) || /muda|chamomile|kangaroo|samambaia|tundra|plantain|bambu|burdock|oregano|broom|spindle|rose_hip/.test(id)) return H > 1.5 ? 'arbusto' : 'nenhum';
  if (H >= 5) return 'tronco';
  return H > 1.5 ? 'arbusto' : 'nenhum';
}
function compute(id, j, tris) {
  const tipo = classify(id, j), H = j.dims.height, res = { tipo, h: +H.toFixed(2), c: [] };
  if (tipo === 'nenhum') return res;
  if (tipo === 'tronco') {                                   // largura da CASCA (malha opaca) a 1 m do chão; sem casca opaca: 'tronco fino'
    let pts = [], yc = Math.min(1.0, H * 0.2);
    for (const f of [t => t.mode === 'OPAQUE']) { pts = slicePoints(tris, yc, f); if (pts.length < 6) pts = slicePoints(tris, yc + 0.5, f); }
    if (pts.length >= 6) {
      let mx = 0, mz = 0; for (const p of pts) { mx += p[0]; mz += p[1]; } mx /= pts.length; mz /= pts.length;
      const d = pts.map(p => Math.hypot(p[0] - mx, p[1] - mz)).sort((a, b) => a - b), r = clamp(d[Math.floor(d.length * 0.75)], 0.15, 0.8);
      res.c.push([+mx.toFixed(3), +mz.toFixed(3), +r.toFixed(3)]); res.medido = 'casca';
    } else { res.c.push([0, 0, 0.2]); res.medido = 'padrao-fino'; }
    return res;
  }
  if (tipo === 'arbusto') { const r = clamp(0.08 * Math.max(j.dims.width, j.dims.len), 0.12, 0.3); res.c.push([0, 0, +r.toFixed(3)]); return res; }
  // rocha / tronco caído / prop: contorno da base = vértices/cortes baixos (até 35% da altura, no mínimo 8 cm)
  const yb = Math.max(0.08, H * (tipo === 'prop' ? 0.3 : 0.35)), pts = [];
  for (const t of tris) for (let i = 0; i < 3; i++) if (t.p[i * 3 + 1] <= yb) pts.push([t.p[i * 3], t.p[i * 3 + 2]]);
  for (const yc of [0.02, yb * 0.5, yb]) for (const p of slicePoints(tris, yc)) pts.push(p);
  const k = tipo === 'prop' ? 0.92 : tipo === 'rocha' ? 0.85 : 0.9, maxN = tipo === 'tronco-caido' ? 6 : tipo === 'prop' ? 5 : 4;
  res.c = circlesFromFootprint(pts, k, maxN);
  if (tipo === 'prop' && H >= 0.5) for (const q of res.c) q[2] = Math.max(q[2], 0.08);          // poste/placa/hidrante fino: pelo menos 8 cm
  if (!res.c.length) res.tipo = 'nenhum';
  return res;
}

// ---------- execução ----------
if (!fs.existsSync(OBJ)) { console.error('Sem assets/objects em ' + OBJ); process.exit(2); }
const sum = {}; let nOk = 0, nErr = 0;
for (const id of fs.readdirSync(OBJ).sort()) {
  if (!WANT.test(id) || (ONLY.length && !ONLY.some(o => id.startsWith(o) || id === o))) continue;
  const jf = path.join(OBJ, id, 'object.json'), gf = path.join(OBJ, id, 'model.glb'); if (!fs.existsSync(jf) || !fs.existsSync(gf)) continue;
  try {
    const j = JSON.parse(fs.readFileSync(jf, 'utf8')), c = compute(id, j, readGLB(gf)); sum[c.tipo] = (sum[c.tipo] || 0) + 1; nOk++;
    if (flag('list') || flag('dry')) console.log(id.padEnd(40), c.tipo.padEnd(13), 'h=' + c.h, JSON.stringify(c.c), c.medido || '');
    if (!flag('dry')) { delete c.medido; j.colisor = c; fs.writeFileSync(jf, JSON.stringify(j, null, 2)); }
  } catch (e) { nErr++; console.log('ERRO', id, e.message); }
}
console.log((flag('dry') ? '[dry] ' : '') + 'modelos:', nOk, 'erros:', nErr, JSON.stringify(sum));
