'use strict';
const { loadDFF, worldPoint } = require('./dff');
const d = loadDFF(process.argv[2]);
d.atomics.forEach(a => {
  const g = d.geos[a.geo], f = d.frames[a.frame];
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < g.numVerts; i++) { const w = worldPoint(d.frames, a.frame, [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); } }
  const perMat = {}; g.matIdx.forEach(m => perMat[m] = (perMat[m] || 0) + 1);
  console.log(`[${a.frame}] ${f.name.padEnd(18)} tris=${String(g.indices.length / 3).padStart(6)} bbox x[${mn[0].toFixed(2)},${mx[0].toFixed(2)}] y[${mn[1].toFixed(2)},${mx[1].toFixed(2)}] z[${mn[2].toFixed(2)},${mx[2].toFixed(2)}]`);
  g.materials.forEach((m, i) => console.log(`      mat${i}: ${(m.tex || '(sem textura)').padEnd(18)} cor=${m.color.join(',')} tris=${perMat[i] || 0}`));
});
