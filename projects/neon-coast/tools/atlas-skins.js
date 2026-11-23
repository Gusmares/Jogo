// Otimiza os fardamentos (skins) para a multidão: junta todas as texturas num atlas (1 material = 1 chamada de desenho) e gera 2 níveis de detalhe
// simplificados (malha com pele preservada) com o simplificador do meshoptimizer.  Uso: node tools/atlas-skins.js [--id player_argentina]
// Saída em assets/models/skins/<id>/: atlas.png, skin_lod1.bin, skin_lod2.bin e o skin.json ganha "atlas" e "lods".
'use strict';
const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const { MeshoptSimplifier } = require('meshoptimizer');
const root = path.resolve(__dirname, '..'), skinsDir = path.join(root, 'assets/models/skins');
const LODS = [{ name: 'skin_lod1.bin', tris: 6500 }, { name: 'skin_lod2.bin', tris: 1700 }];
const ATLAS_SIZES = [1024];

function readSkin(dir) {
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8')), buf = fs.readFileSync(path.join(dir, 'skin.bin')), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), v = man.verts;
  return { man, v, pos: new Float32Array(ab, 0, v * 3), nor: new Float32Array(ab, v * 12, v * 3), uv: new Float32Array(ab, v * 24, v * 2), sidx: new Uint16Array(ab, v * 32, v * 4), sw: new Float32Array(ab, v * 40, v * 4), idx: new Uint32Array(ab, v * 56, man.indices) };
}
function bilinear(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const fx = (x + 0.5) * sw / dw - 0.5, fy = (y + 0.5) * sh / dh - 0.5, x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    for (let c = 0; c < 4; c++) { const a = src[(y0 * sw + x0) * 4 + c], b = src[(y0 * sw + x1) * 4 + c], d = src[(y1 * sw + x0) * 4 + c], e = src[(y1 * sw + x1) * 4 + c]; out[(y * dw + x) * 4 + c] = Math.round((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty); }
  }
  return out;
}
/* empacotamento em prateleiras; devolve null se não couber */
function pack(items, size, scale) {
  const G = 2, placed = []; let x = G, y = G, rowH = 0;
  for (const it of items) {
    const w = Math.max(4, Math.round(it.w * scale)), h = Math.max(4, Math.round(it.h * scale));
    if (x + w + G > size) { x = G; y += rowH + G * 2; rowH = 0; }
    if (y + h + G > size) return null;
    placed.push({ it, x, y, w, h }); x += w + G * 2; rowH = Math.max(rowH, h);
  }
  return placed;
}

async function processSkin(id) {
  const dir = path.join(skinsDir, id), S = readSkin(dir), man = S.man;
  // 1) material de cada grupo -> item do atlas (textura × cor, ou só a cor)
  const items = new Map(), groupItem = [];
  let anyAlpha = false;
  for (const [start, count, mi] of man.groups) {
    const m = man.materials[mi], key = (m.tex || 'solid') + '|' + m.color.join(',');
    if (!items.has(key)) {
      let w = 4, h = 4, data = null;
      if (m.tex && man.textures[m.tex]) { const png = PNG.sync.read(fs.readFileSync(path.join(dir, man.textures[m.tex]))); w = png.width; h = png.height; data = Buffer.from(png.data); }
      else { data = Buffer.alloc(16 * 4); for (let i = 0; i < 16; i++) { data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; } }
      // a cor do material multiplica a textura: já fica "cozida" no atlas
      for (let i = 0; i < w * h; i++) { data[i * 4] = Math.min(255, data[i * 4] * m.color[0] / 255); data[i * 4 + 1] = Math.min(255, data[i * 4 + 1] * m.color[1] / 255); data[i * 4 + 2] = Math.min(255, data[i * 4 + 2] * m.color[2] / 255); }
      if (m.alpha) anyAlpha = true;
      items.set(key, { key, w, h, data });
    }
    groupItem.push(items.get(key));
  }
  const list = [...items.values()].sort((a, b) => b.h - a.h || b.w - a.w);
  let size = 0, placed = null, scale = 1;
  for (const sz of ATLAS_SIZES) { for (scale = 1; scale > 0.08; scale *= 0.92) { placed = pack(list, sz, scale); if (placed) break; } if (placed) { size = sz; break; } }
  if (!placed) throw new Error('atlas não coube: ' + id);
  // 2) desenha o atlas (com borda estendida para não vazar cor entre ilhas)
  const atlas = new PNG({ width: size, height: size }); atlas.data.fill(0);
  for (const p of placed) {
    const d = (p.it.w === p.w && p.it.h === p.h) ? p.it.data : bilinear(p.it.data, p.it.w, p.it.h, p.w, p.h), G = 2;
    for (let yy = -G; yy < p.h + G; yy++) for (let xx = -G; xx < p.w + G; xx++) {
      const sx = Math.min(p.w - 1, Math.max(0, xx)), sy = Math.min(p.h - 1, Math.max(0, yy)), di = ((p.y + yy) * size + (p.x + xx)) * 4, si = (sy * p.w + sx) * 4;
      atlas.data[di] = d[si]; atlas.data[di + 1] = d[si + 1]; atlas.data[di + 2] = d[si + 2]; atlas.data[di + 3] = d[si + 3];
    }
    p.it.rect = p;
  }
  fs.writeFileSync(path.join(dir, 'atlas.png'), PNG.sync.write(atlas));
  // 3) vértices por grupo (um vértice usado em dois materiais é duplicado), UV remapeada para o atlas
  const vmap = new Map(), pos = [], nor = [], uv = [], sidx = [], sw = [], idx = [];
  let outOfRange = 0;
  man.groups.forEach(([start, count, mi], gi) => {
    const r = groupItem[gi].rect;
    for (let k = start; k < start + count; k += 3) {
      const tri = [S.idx[k], S.idx[k + 1], S.idx[k + 2]];
      // textura que repete: cada triângulo usa o "ladrilho" inteiro onde está a maior parte dele
      const us = tri.map(o => S.uv[o * 2]), vs = tri.map(o => S.uv[o * 2 + 1]), iu = Math.floor(Math.min(...us) + 1e-4), iv = Math.floor(Math.min(...vs) + 1e-4);
      if (Math.min(...us) < -0.02 || Math.max(...us) > 1.02 || Math.min(...vs) < -0.02 || Math.max(...vs) > 1.02) outOfRange++;
      for (const ov of tri) {
        const key = ov * 4096 + gi * 64 + ((iu + 8) & 7) * 8 + ((iv + 8) & 7); let nv = vmap.get(key);
        if (nv === undefined) {
          nv = pos.length / 3; vmap.set(key, nv);
          pos.push(S.pos[ov * 3], S.pos[ov * 3 + 1], S.pos[ov * 3 + 2]); nor.push(S.nor[ov * 3], S.nor[ov * 3 + 1], S.nor[ov * 3 + 2]);
          const u = Math.min(1, Math.max(0, S.uv[ov * 2] - iu)), vv = Math.min(1, Math.max(0, S.uv[ov * 2 + 1] - iv));
          const px = r.x + Math.min(r.w - 0.5, Math.max(0.5, u * r.w)), py = r.y + Math.min(r.h - 0.5, Math.max(0.5, (1 - vv) * r.h));
          uv.push(px / size, 1 - py / size);
          for (let b = 0; b < 4; b++) { sidx.push(S.sidx[ov * 4 + b]); sw.push(S.sw[ov * 4 + b]); }
        }
        idx.push(nv);
      }
    }
  });
  const nverts = pos.length / 3, posF = new Float32Array(pos), norF = new Float32Array(nor), uvF = new Float32Array(uv), swF = new Float32Array(sw), sidxU = new Uint16Array(sidx);
  const attrs = new Float32Array(nverts * 9); for (let i = 0; i < nverts; i++) { attrs.set(norF.subarray(i * 3, i * 3 + 3), i * 9); attrs.set(uvF.subarray(i * 2, i * 2 + 2), i * 9 + 3); attrs.set(swF.subarray(i * 4, i * 4 + 4), i * 9 + 5); }
  const weights = [0.25, 0.25, 0.25, 2.0, 2.0, 1.2, 1.2, 1.2, 1.2];
  const lods = [];
  await MeshoptSimplifier.ready;
  for (const L of LODS) {
    const target = Math.min(idx.length, L.tris * 3);
    const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(idx), posF, 3, attrs, 9, weights, null, target, 0.35, ['Prune']);
    // compacta os vértices realmente usados
    const remap = new Map(), P = [], N = [], U = [], SI = [], SW = [], I = new Uint32Array(simp.length);
    for (let k = 0; k < simp.length; k++) {
      const o = simp[k]; let n = remap.get(o);
      if (n === undefined) { n = P.length / 3; remap.set(o, n); P.push(posF[o * 3], posF[o * 3 + 1], posF[o * 3 + 2]); N.push(norF[o * 3], norF[o * 3 + 1], norF[o * 3 + 2]); U.push(uvF[o * 2], uvF[o * 2 + 1]); for (let b = 0; b < 4; b++) { SI.push(sidxU[o * 4 + b]); SW.push(swF[o * 4 + b]); } }
      I[k] = n;
    }
    const v = P.length / 3, out = Buffer.alloc(v * 56 + I.length * 4);
    Buffer.from(new Float32Array(P).buffer).copy(out, 0); Buffer.from(new Float32Array(N).buffer).copy(out, v * 12); Buffer.from(new Float32Array(U).buffer).copy(out, v * 24);
    Buffer.from(new Uint16Array(SI).buffer).copy(out, v * 32); Buffer.from(new Float32Array(SW).buffer).copy(out, v * 40); Buffer.from(I.buffer).copy(out, v * 56);
    fs.writeFileSync(path.join(dir, L.name), out);
    lods.push({ file: L.name, verts: v, indices: I.length, err: +err.toFixed(4) });
  }
  man.atlas = { file: 'atlas.png', size, alpha: anyAlpha }; man.lods = lods;
  fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify(man));
  console.log(id.padEnd(18), 'tris', man.indices / 3 | 0, '->', lods.map(l => (l.indices / 3 | 0) + ' (err ' + l.err + ')').join(', '), '| atlas', size, 'escala', scale.toFixed(2), '| uv fora', outOfRange, '| alpha', anyAlpha);
}
(async () => {
  const only = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null;
  for (const id of fs.readdirSync(skinsDir)) { if (only && id !== only) continue; try { await processSkin(id); } catch (e) { console.error(id, e.message); } }
})();
