// NEON ENGINE — importa modelos do GTA IV (.wdr / .wdd / .wft + texturas .wtd) para a biblioteca do projeto, como GLB.
//   node engine/tools/gta4-import.js <arquivos ou pastas...> [--cat "Vegetação (GTA IV)"] [--prefix iv_] [--only nome1,nome2] [--brasil]
// De onde vêm os arquivos: os .img do GTA IV têm o índice criptografado; exporte os .wdr/.wtd/.wft deles com o OpenIV (Exportar) para uma
// pasta (ex.: research/gta4/export/vegetacao) e rode este comando nela. Arquivos soltos da instalação (pc/models/plantsmgr.wdd,
// pc/textures/*.wtd) funcionam direto. Os nomes dos objetos de dicionários (.wdd) vêm dos .ide do jogo (research/gta4/ide, texto aberto).
// Saída: <projeto>/assets/objects/iv_<nome>/model.glb + object.json (aparecem no editor em "Modelos 3D importados", na categoria escolhida).
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./project');
const { readResource } = require('./gta4/rsc');
const { readTextureDict, toPNG } = require('./gta4/textures');
const { readDrawable, findDrawables, joaat } = require('./gta4/drawable');
const { writeGLB } = require('./gta4/glb');
const { brazilize } = require('./gta4/brasil');

const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const inputs = args.filter((a, i) => !a.startsWith('--') && !['--cat', '--prefix', '--only', '--ide'].includes(args[i - 1]));
const CAT = opt('cat') || 'GTA IV', PREFIX = opt('prefix') || 'iv_', ONLY = opt('only') ? new Set(opt('only').toLowerCase().split(',')) : null, BR = args.includes('--brasil');
const root = P.projectRoot(), out = path.join(root, 'assets', 'objects');
if (!inputs.length) { console.error('Use: gta4-import.js <arquivos/pastas .wdr .wdd .wft .wtd> [--cat nome] [--prefix iv_] [--only a,b] [--brasil]'); process.exit(1); }

/* nomes dos objetos pelo hash (todos os .ide que acharmos) */
const NAMES = new Map(), IDEINFO = new Map();
function loadIde(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name); if (f.isDirectory()) { loadIde(p); continue; } if (!/\.ide$/i.test(f.name)) continue;
    let sec = '';
    for (const line of fs.readFileSync(p, 'latin1').split(/\r?\n/)) {
      const t = line.trim(); if (!t || t[0] === '#') continue; if (/^(objs|tobj|anim|tree|mlo|2dfx|amat|txdp|end)$/i.test(t)) { sec = t.toLowerCase(); continue; }
      const c = t.split(',').map(s => s.trim()); if (c.length < 3 || !/^[a-z0-9_]+$/i.test(c[0])) continue;
      NAMES.set(joaat(c[0]), c[0].toLowerCase()); IDEINFO.set(c[0].toLowerCase(), { txd: (c[1] || '').toLowerCase(), dist: parseFloat(c[2]) || 0, sec, ide: path.basename(f.name, '.ide') });
    }
  }
}
loadIde(opt('ide') || path.join(P.REPO, 'research', 'gta4', 'ide'));

/* arquivos de entrada */
const files = [];
for (const i of inputs) { const p = path.resolve(i); if (!fs.existsSync(p)) { console.warn('não existe:', i); continue; } if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p)) files.push(path.join(p, f)); } else files.push(p); }
const models = files.filter(f => /\.(wdr|wdd|wft)$/i.test(f)), txds = files.filter(f => /\.wtd$/i.test(f));
const TEX = new Map(), byTxd = new Map();
for (const f of txds) { try { const R = readResource(f), m = readTextureDict(R, 0x50000000); byTxd.set(path.basename(f, '.wtd').toLowerCase(), m); for (const [k, v] of m) if (!TEX.has(k)) TEX.set(k, v); } catch (e) { console.warn('textura', path.basename(f), e.message); } }
console.log(models.length + ' modelos, ' + txds.length + ' dicionários de textura (' + TEX.size + ' texturas), ' + NAMES.size + ' nomes de .ide');

const pngCache = new Map();
function findTex(name, local, txdName) {
  if (!name) return null;
  const pools = [local, txdName && byTxd.get(txdName), TEX].filter(Boolean);
  for (const pool of pools) if (pool.has(name)) return pool.get(name);
  for (const pool of pools) { let best = null; for (const k of pool.keys()) if (name.startsWith(k) && (!best || k.length > best.length)) best = k; if (best) return pool.get(best); }   // nome sem terminador no arquivo: casa pelo começo
  return null;
}
let ok = 0, skip = 0;
fs.mkdirSync(out, { recursive: true });
/* --grama: texturas de planta com transparência (ex.: pc/textures/plantsmgr.wtd) viram (1) PNG para a vegetação do jogo (assets/world/gta4)
   e (2) moitas de "cartões cruzados" na biblioteca do editor */
const GRASS_NAMES = { txgrass0_0: ['capim_alto', 0.9], txgrass0_1: ['capim_verde', 0.8], txgrass0_2: ['capim_escuro', 0.85], txgrass0_3: ['mato_florido', 1.3], txgrass1_0: ['tufo_seco', 0.7], txgrass1_1: ['erva_daninha', 0.45], txgrass1_2: ['agave', 0.6], txgrass1_3: ['galhos_secos', 0.7] };
function cardsGLB(t, H) {
  const W = H * t.w / t.h, pos = [], nor = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, cx = Math.cos(a) * W / 2, cz = Math.sin(a) * W / 2, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, H, cz, -cx, H, -cz); for (let i = 0; i < 4; i++) nor.push(0, 1, 0); uv.push(0, 1, 1, 1, 1, 0, 0, 0); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return writeGLB([{ positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv), indices: new Uint32Array(idx), material: { key: t.name, name: t.name, png: toPNG(t), texName: t.name, alphaMode: 'MASK', doubleSided: true, roughness: 1 } }]);
}
if (args.includes('--grama')) {
  const wdir = path.join(root, 'assets', 'world', 'gta4'); fs.mkdirSync(wdir, { recursive: true });
  for (const [k, t] of TEX) {
    if (!t.alpha || Math.max(t.w, t.h) < 64) continue; const g = GRASS_NAMES[k]; if (!g && Math.max(t.w, t.h) < 128) continue;
    const nm = g ? g[0] : k; fs.writeFileSync(path.join(wdir, nm + '.png'), toPNG(t));
    const id = (PREFIX + nm).replace(/[^a-z0-9_]/g, '_'), dir = path.join(out, id); fs.mkdirSync(dir, { recursive: true });
    const H = g ? g[1] : 1; fs.writeFileSync(path.join(dir, 'model.glb'), cardsGLB(t, H));
    fs.writeFileSync(path.join(dir, 'object.json'), JSON.stringify({ id, name: nm.replace(/_/g, ' '), kind: 'object3d', format: 'glb', cat: CAT, source: 'GTA IV: textura ' + k + ' (plantsmgr)', dims: { width: +(H * t.w / t.h).toFixed(2), height: H, len: +(H * t.w / t.h).toFixed(2) }, triangles: 6, veg: true, imported: new Date().toISOString() }, null, 2));
    ok++; console.log('  ' + id.padEnd(30) + ' moita ' + t.w + '×' + t.h + ' -> ' + nm + '.png');
  }
  console.log('GRAMA ' + ok + ' → assets/world/gta4 e biblioteca'); process.exit(0);
}
for (const f of models) {
  let R; try { R = readResource(f); } catch (e) { console.warn('pulei', path.basename(f), e.message); continue; }
  const ext = path.extname(f).slice(1).toLowerCase(), base = path.basename(f, '.' + ext).toLowerCase(), list = findDrawables(R, ext);
  list.slice(0, ext === 'wft' ? 1 : 999).forEach((D, k) => {
    const name = D.hash !== null ? (NAMES.get(D.hash) || base + '_' + D.hash.toString(16)) : base;
    if (ONLY && !ONLY.has(name)) return;
    let dr; try { dr = readDrawable(R, D.at); } catch (e) { console.warn('pulei', name, e.message); skip++; return; }
    if (!dr.meshes.length) { skip++; return; }
    const info = IDEINFO.get(name) || {}, parts = []; let tris = 0;
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const m of dr.meshes) {
      const sh = (m.shader.name + ' ' + m.shader.sps).toLowerCase(), tex = findTex(m.shader.texture, dr.textures, info.txd);
      const foliage = /tree|grass|cutout|alpha|decal|leaf|foliage|wire/.test(sh), glass = /glass/.test(sh);
      let png = null, texName = m.shader.texture;
      if (tex) { let t = tex; if (BR) t = brazilize(name, t); const key = t.name + (BR ? '#br' : ''); if (!pngCache.has(key)) pngCache.set(key, toPNG(t)); png = pngCache.get(key); texName = t.name; }
      const alpha = tex && tex.alpha && (foliage || glass);
      parts.push({ positions: m.positions, normals: m.normals, uvs: m.uvs, indices: m.indices,
        material: { key: (texName || 'sem') + '|' + sh, name: texName || m.shader.name, png, texName, alphaMode: glass ? 'BLEND' : alpha ? 'MASK' : undefined, doubleSided: foliage, color: glass ? [1, 1, 1, 0.35] : [1, 1, 1, 1], roughness: glass ? 0.1 : 0.85 } });
      tris += m.indices.length / 3;
      for (let i = 0; i < m.positions.length; i += 3) for (let a = 0; a < 3; a++) { bb[a] = Math.min(bb[a], m.positions[i + a]); bb[a + 3] = Math.max(bb[a + 3], m.positions[i + a]); }
    }
    const id = (PREFIX + name).replace(/[^a-z0-9_]/g, '_').slice(0, 60), dir = path.join(out, id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model.glb'), writeGLB(parts, { name }));
    const dims = { width: +(bb[3] - bb[0]).toFixed(2), height: +(bb[4] - bb[1]).toFixed(2), len: +(bb[5] - bb[2]).toFixed(2) };
    fs.writeFileSync(path.join(dir, 'object.json'), JSON.stringify({ id, name: name.replace(/_/g, ' '), kind: 'object3d', format: 'glb', cat: CAT, source: 'GTA IV: ' + path.basename(f) + (BR ? ' (adaptado para o Brasil)' : ''), dims, triangles: tris, imported: new Date().toISOString() }, null, 2));
    ok++; console.log('  ' + id.padEnd(34) + String(tris).padStart(6) + ' tri  ' + dims.width + '×' + dims.height + '×' + dims.len + ' m  ' + dr.meshes.length + ' partes' + (parts.some(p => !p.material.png) ? '  (sem alguma textura)' : ''));
  });
}
console.log('IMPORTADOS ' + ok + (skip ? ' · ' + skip + ' sem geometria legível' : '') + ' → ' + out);
