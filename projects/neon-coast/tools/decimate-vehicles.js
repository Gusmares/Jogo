// Gera o nível de detalhe MÉDIO (~38 mil triângulos, mesmos grupos de material) da carroceria de cada veículo: "bodyMid".
// Serve para os carros entre ~14 e ~45 m do jogador (antes eram ~8 mil triângulos achatados e pareciam "zoados" de meia distância).
// Uso: node tools/decimate-vehicles.js [--id vw_gol] [--tris 38000]
'use strict';
const fs = require('fs'), path = require('path');
const { MeshoptSimplifier } = require('meshoptimizer');
const dir = path.resolve(__dirname, '../assets/models');
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const only = arg('--id', null), TARGET = +arg('--tris', 38000);
(async () => {
  await MeshoptSimplifier.ready;
  for (const id of fs.readdirSync(dir)) {
    if (only && id !== only) continue;
    const jf = path.join(dir, id, 'model.json'); if (!fs.existsSync(jf)) continue;
    const man = JSON.parse(fs.readFileSync(jf, 'utf8')), M = man.meshes && man.meshes.body; if (!M || M.indices / 3 < 14000) continue;
    // carroceria + porta do motorista (a porta é uma malha à parte no modelo, mas nos níveis de detalhe menores ela fica fechada e embutida)
    const rd = (m) => { const b = fs.readFileSync(path.join(dir, id, m.file)), a = b.buffer.slice(b.byteOffset, b.byteOffset + b.length), n = m.verts; return { pos: new Float32Array(a, 0, n * 3), nor: new Float32Array(a, n * 12, n * 3), uv: new Float32Array(a, n * 24, n * 2), idx: new Uint32Array(a, n * 32, m.indices), n, groups: m.groups }; };
    const B = rd(M), D = man.meshes.door ? rd(man.meshes.door) : null, v = B.n + (D ? D.n : 0);
    const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), uv = new Float32Array(v * 2); pos.set(B.pos); nor.set(B.nor); uv.set(B.uv);
    if (D) { pos.set(D.pos, B.n * 3); nor.set(D.nor, B.n * 3); uv.set(D.uv, B.n * 2); }
    const byMat = new Map(), add = (S, off) => { for (const [s, c, mat] of S.groups) { let l = byMat.get(mat); if (!l) byMat.set(mat, l = []); for (let k = 0; k < c; k++) l.push(S.idx[s + k] + off); } };
    add(B, 0); if (D) add(D, B.n);
    const idx = new Uint32Array(M.indices + (D ? D.idx.length : 0)), mgroups = []; { let o = 0; for (const [mat, l] of [...byMat].sort((a, b) => a[0] - b[0])) { mgroups.push([o, l.length, mat]); idx.set(l, o); o += l.length; } }
    const attrs = new Float32Array(v * 5); for (let i = 0; i < v; i++) { attrs[i * 5] = nor[i * 3]; attrs[i * 5 + 1] = nor[i * 3 + 1]; attrs[i * 5 + 2] = nor[i * 3 + 2]; attrs[i * 5 + 3] = uv[i * 2]; attrs[i * 5 + 4] = uv[i * 2 + 1]; }
    const total = idx.length / 3, groups = [], outIdx = [];
    for (const [s, c, mat] of mgroups) {
      const tris = c / 3, want = tris <= 220 ? tris : Math.max(160, Math.round(tris * TARGET / total)), sub = idx.slice(s, s + c);
      let res = sub;
      if (want < tris) { const [r] = MeshoptSimplifier.simplifyWithAttributes(sub, pos, 3, attrs, 5, [0.3, 0.3, 0.3, 1.6, 1.6], null, want * 3, 0.5, ['Sparse']); res = r; }
      groups.push([outIdx.length, res.length, mat]); for (let k = 0; k < res.length; k++) outIdx.push(res[k]);
    }
    // compacta os vértices usados
    const remap = new Map(), P = [], N = [], U = [], I = new Uint32Array(outIdx.length);
    for (let k = 0; k < outIdx.length; k++) { const o = outIdx[k]; let n = remap.get(o); if (n === undefined) { n = P.length / 3; remap.set(o, n); P.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]); N.push(nor[o * 3], nor[o * 3 + 1], nor[o * 3 + 2]); U.push(uv[o * 2], uv[o * 2 + 1]); } I[k] = n; }
    const nv = P.length / 3, out = Buffer.alloc(nv * 32 + I.length * 4);
    Buffer.from(new Float32Array(P).buffer).copy(out, 0); Buffer.from(new Float32Array(N).buffer).copy(out, nv * 12); Buffer.from(new Float32Array(U).buffer).copy(out, nv * 24); Buffer.from(I.buffer).copy(out, nv * 32);
    fs.writeFileSync(path.join(dir, id, 'body_mid.bin'), out);
    man.meshes.bodyMid = { file: 'body_mid.bin', verts: nv, indices: I.length, groups };
    fs.writeFileSync(jf, JSON.stringify(man));
    console.log(id.padEnd(18), (total | 0), '->', (I.length / 3 | 0), 'triângulos,', nv, 'vértices');
  }
})();
