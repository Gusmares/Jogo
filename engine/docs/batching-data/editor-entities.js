// roda dentro do editor (npx electron engine/app --selftest --script este-arquivo): confere entidades do mundo e edita 1 de cada tipo
(() => {
  const kinds = {}; for (const e of WENT.list) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const res = { total: WENT.list.length, kinds, edits: {} };
  const bounds = e => { entInit(e); const bb = new THREE.Box3(); e.parts.forEach((pt, k) => { const P = pt.mesh.geometry.attributes.position.array; for (let i = pt.start * 3; i < pt.end * 3; i += 3) bb.expandByPoint(new THREE.Vector3(P[i], P[i + 1], P[i + 2])); }); return bb.isEmpty() ? null : [bb.min.x, bb.min.y, bb.min.z].map(v => +v.toFixed(2)); };
  for (const kind of ['placa-rua', 'predio', 'casa', 'torres', 'hidrante', 'lixo', 'arvore-rua', 'palmeira', 'marco-masp']) {
    const e = WENT.list.find(x => x.kind === kind || x.kind.startsWith(kind)); if (!e) { res.edits[kind] = 'sem entidade'; continue; }
    entInit(e); const b0 = bounds(e); const nParts = e.parts.length, nObj = e.objs.length, nInst = (e.inst || []).length, nCols = e.cols.length;
    entApply(e, { d: [7, 0, 3], r: 0 }); const b1 = bounds(e); const instM = e.inst && e.inst.length ? (() => { const w = e.inst[0][0].where[e.inst[0][1]]; return w ? +w[0].instanceMatrix.array[w[1] * 16 + 12].toFixed(2) : null; })() : null;
    const objX = e.objs.length ? +e.objs[0].position.x.toFixed(2) : null;
    entApply(e, null); const b2 = bounds(e);
    res.edits[kind] = { id: e.id, partes: nParts, objs: nObj, inst: nInst, cols: nCols, moveuX: b0 && b1 ? +(b1[0] - b0[0]).toFixed(2) : null, volta: b0 && b2 ? +(b2[0] - b0[0]).toFixed(3) : null, objX, instX: instM };
  }
  return res;
})()
