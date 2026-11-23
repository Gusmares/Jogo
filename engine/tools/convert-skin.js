// Conversor de FARDAMENTOS (skins de ped do GTA San Andreas) -> assets/models/skins/<id>/
// Lê esqueleto (HAnim), pesos de pele (plugin Skin), materiais e texturas. Uso: node tools/convert-skin.js --all
'use strict';
const { fs } = require('./rw');
const path = require('path');
const { loadDFF } = require('./dff');
const { loadTXD, downscale, encodePNG } = require('./txd');
const { modFile } = require('./mods');
const root = require('./project').root();                 // pasta do projeto (assets/models fica lá)

/* matrizes 4x4 (linha-maior, convenção de vetor-coluna) */
const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j]; return o; };
function inv(m) {   // inversa geral (Gauss-Jordan)
  const a = m.slice(), b = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(a[r * 4 + c]) > Math.abs(a[p * 4 + c])) p = r;
    for (let k = 0; k < 4; k++) { [a[c * 4 + k], a[p * 4 + k]] = [a[p * 4 + k], a[c * 4 + k]]; [b[c * 4 + k], b[p * 4 + k]] = [b[p * 4 + k], b[c * 4 + k]]; }
    const d = a[c * 4 + c]; for (let k = 0; k < 4; k++) { a[c * 4 + k] /= d; b[c * 4 + k] /= d; }
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r * 4 + c]; for (let k = 0; k < 4; k++) { a[r * 4 + k] -= f * a[c * 4 + k]; b[r * 4 + k] -= f * b[c * 4 + k]; } }
  }
  return b;
}
const fromFrame = m => [m[0], m[3], m[6], m[9], m[1], m[4], m[7], m[10], m[2], m[5], m[8], m[11], 0, 0, 0, 1];   // colunas: right, up, at, pos
const C = [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1];          // GTA (x,y,z) -> three (-x, z, y); simétrica e ortogonal (C^-1 = C)
const toThree = w => mul(mul(C, w), C);
const colMajor = m => [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];   // para Matrix4.fromArray do three

const NAMES = { 0: 'root', 1: 'pelvis', 2: 'spine', 3: 'spine1', 4: 'neck', 5: 'head', 6: 'lbrow', 7: 'rbrow', 8: 'jaw', 21: 'rclav', 22: 'rupperarm', 23: 'rforearm', 24: 'rhand', 25: 'rfinger', 26: 'rfinger01',
  31: 'lclav', 32: 'lupperarm', 33: 'lforearm', 34: 'lhand', 35: 'lfinger', 36: 'lfinger01', 41: 'lthigh', 42: 'lcalf', 43: 'lfoot', 44: 'ltoe', 51: 'rthigh', 52: 'rcalf', 53: 'rfoot', 54: 'rtoe', 201: 'belly', 301: 'rbreast', 302: 'lbreast' };

function convertSkin(cfg) {
  const dff = loadDFF(modFile(cfg.dff)), txd = loadTXD(modFile(cfg.txd)), g = dff.geos.find(x => x.skin);
  const txdLower = {}; Object.keys(txd).forEach(k => txdLower[k.toLowerCase()] = k);
  const outDir = path.join(root, 'assets/models/skins', cfg.id), texDir = path.join(outDir, 'textures');
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(texDir, { recursive: true });

  /* --- esqueleto: ossos na ordem da hierarquia HAnim (é a ordem usada pelos índices da pele) --- */
  const rootFrame = dff.frames.find(f => f.hanim && f.hanim.nodes.length), nodes = rootFrame.hanim.nodes;
  const frameOfId = {}; dff.frames.forEach((f, i) => { if (f.hanim) frameOfId[f.hanim.id] = i; });
  const world = i => { let w = fromFrame(dff.frames[i].m); for (let p = dff.frames[i].parent; p >= 0; p = dff.frames[p].parent) w = mul(fromFrame(dff.frames[p].m), w); return w; };
  const boneFrames = nodes.map(n => frameOfId[n.id]), boneOf = new Map(boneFrames.map((f, i) => [f, i]));
  const bones = boneFrames.map((fi, i) => {
    let p = dff.frames[fi].parent; while (p >= 0 && !boneOf.has(p)) p = dff.frames[p].parent;
    return { id: nodes[i].id, name: NAMES[nodes[i].id] || ('bone' + nodes[i].id), parent: p >= 0 ? boneOf.get(p) : -1, fi };
  });
  // No GTA SA a malha é modelada "deitada" (pose de bind nas matrizes inversas da pele) e os quadros do esqueleto a levantam.
  // Pose de repouso = mundo dos quadros; inversas = as gravadas no arquivo (ambas convertidas para o espaço do three).
  const fromSkinMat = m => fromFrame([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]]);
  const Wc = bones.map(b => toThree(world(b.fi))), Ic = g.skin.inverse.map(m => toThree(fromSkinMat(m)));
  // Alguns arquivos ficam deitados na pose dos quadros (no jogo a animação os levanta). Calcula a rotação que põe o corpo em pé
  // (cabeça em +Y), virado para +Z, com a esquerda em +X, e a grava no osso raiz.
  const bi = id => bones.findIndex(b => b.id === id), tpos = i => [Wc[i][3], Wc[i][7], Wc[i][11]];
  const sub = (a, b) => a.map((v, k) => v - b[k]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const up = nrm(sub(tpos(bi(5)), tpos(bi(1)))), left0 = sub(tpos(bi(32)), tpos(bi(22)));
  const left = nrm(left0.map((v, k) => v - up[k] * dot(left0, up))), fwd = cross(left, up);
  const Q = [...left, 0, ...up, 0, ...fwd, 0, 0, 0, 0, 1];
  const outBones = bones.map((b, i) => {
    let local = b.parent >= 0 ? mul(inv(Wc[b.parent]), Wc[i]) : mul(Q, Wc[i]);
    return { id: b.id, name: b.name, parent: b.parent, local: colMajor(local).map(v => +v.toFixed(6)), inverse: colMajor(Ic[i]).map(v => +v.toFixed(6)) };
  });
  const skinM = Wc.map((w, i) => mul(Q, mul(w, Ic[i])));   // matriz de pele final de cada osso (usada aqui só para medir a altura)

  /* --- geometria em espaço three --- */
  const atom = dff.atomics.find(a => dff.geos[a.geo] === g), aw = toThree(world(atom.frame));
  const n = g.numVerts, P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = g.pos[i * 3], y = g.pos[i * 3 + 1], z = g.pos[i * 3 + 2], nx = g.nrm ? g.nrm[i * 3] : 0, ny = g.nrm ? g.nrm[i * 3 + 1] : 0, nz = g.nrm ? g.nrm[i * 3 + 2] : 1;
    // vértices não usados podem vir com NaN: zera para não contaminar limites nem a GPU
    P.set(isFinite(x + y + z) ? [-x, z, y] : [0, 0, 0], i * 3); N.set(isFinite(nx + ny + nz) ? [-nx, nz, ny] : [0, 1, 0], i * 3); U.set([g.uv ? g.uv[i * 2] : 0.5, g.uv ? 1 - g.uv[i * 2 + 1] : 0.5], i * 2);
  }
  /* --- materiais/grupos --- */
  const matList = g.materials.map(m => {
    const tex = m.tex ? txdLower[m.tex.toLowerCase()] || null : null;
    return { tex, color: m.color.slice(0, 3), opacity: +(m.color[3] / 255).toFixed(2), alpha: !!(tex && txd[tex].hasAlpha) };
  });
  const buckets = new Map();
  for (let t = 0; t < g.matIdx.length; t++) { const m = g.matIdx[t]; if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(g.indices[t * 3], g.indices[t * 3 + 1], g.indices[t * 3 + 2]); }
  const idx = [], groups = []; [...buckets.keys()].sort((a, b) => a - b).forEach(m => { const l = buckets.get(m); groups.push([idx.length, l.length, m]); idx.push(...l); });
  const used = new Set(matList.filter(m => m.tex).map(m => m.tex)), textures = {};
  used.forEach(name => { const file = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png'; fs.writeFileSync(path.join(texDir, file), encodePNG(downscale(txd[name], 2048))); textures[name] = 'textures/' + file; });

  const SI = Uint16Array.from(g.skin.boneIdx), SW = Float32Array.from(g.skin.weights);
  fs.writeFileSync(path.join(outDir, 'skin.bin'), Buffer.concat([P, N, U, SI, SW, Uint32Array.from(idx)].map(a => Buffer.from(a.buffer))));
  // altura do modelo (para dimensionar e posicionar os pés no chão)
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (let i = 0; i < n; i++) {   // pele aplicada na CPU: onde cada vértice fica em pé
    let y = 0, x = 0; for (let k = 0; k < 4; k++) { const w = g.skin.weights[i * 4 + k]; if (!w) continue; const m = skinM[g.skin.boneIdx[i * 4 + k]]; x += w * (m[0] * P[i * 3] + m[1] * P[i * 3 + 1] + m[2] * P[i * 3 + 2] + m[3]); y += w * (m[4] * P[i * 3] + m[5] * P[i * 3 + 1] + m[6] * P[i * 3 + 2] + m[7]); }
    minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  }
  fs.writeFileSync(path.join(outDir, 'skin.json'), JSON.stringify({ id: cfg.id, name: cfg.name, unit: cfg.unit, role: cfg.role || null, verts: n, indices: idx.length, groups, materials: matList, textures, bones: outBones, minY: +minY.toFixed(3), maxY: +maxY.toFixed(3) }));
  console.log(`${cfg.id.padEnd(12)} ${(idx.length / 3 / 1000).toFixed(1)}k tris | ${bones.length} ossos | em pé: altura ${(maxY - minY).toFixed(2)} m, largura ${(maxX - minX).toFixed(2)} m, pés em y=${minY.toFixed(2)} | materiais ${matList.length}`);
}
if (require.main === module) {
const cfgs = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'skins.json'), 'utf8'));
const idArg = process.argv.indexOf('--id') > 0 ? process.argv[process.argv.indexOf('--id') + 1] : null;
for (const c of cfgs) if (process.argv.includes('--all') || c.id === idArg) { try { convertSkin(c); } catch (e) { console.log(c.id, 'FALHOU:', e.stack); } }
}
module.exports = { convertSkin };
