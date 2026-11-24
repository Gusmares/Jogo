/* NEON ENGINE — esculpir o terreno (pincéis: subir, descer, suavizar, nivelar, ruído).
   Mexe na grade de alturas do projeto (HG, terrain.js) e na malha ao vivo; guarda só a DIFERENÇA para o relevo original,
   que vai para maps/world.json -> terrain (uma linha base64 por faixa da grade que mudou) e é somada pelo jogo ao abrir.
   O mar continua no nível de sempre: baixar o chão abaixo dele cria água (lagos, baías, canais); subir cria terra nova. */
'use strict';
const TT = { on: false, brush: 'raise', radius: 24, strength: 8, delta: null, stroke: null, cursor: null, flatH: 0, ring: null, unit: 0.05 };
const TT_BRUSHES = { raise: 'Subir', lower: 'Descer', smooth: 'Suavizar', flatten: 'Nivelar', noise: 'Irregular' };
function ttInit() {
  TT.delta = typeof TERRAIN_DELTA !== 'undefined' && TERRAIN_DELTA ? Float32Array.from(TERRAIN_DELTA) : new Float32Array(HG.length);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
  TT.ring = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x40e0ff, depthTest: false, transparent: true, opacity: 0.95 })); TT.ring.renderOrder = 998; TT.ring.visible = false; TT.ring.frustumCulled = false; scene.add(TT.ring);
}
function ttSetOn(v) {
  TT.on = v; if (v) { edCancelPlacing(); edSelect(null); if (typeof VB !== 'undefined' && VB.on) vbSetOn(false); } else { TT.stroke = null; }
  TT.ring.visible = v && !!TT.cursor; document.body.classList.toggle('ed-terrain', v);
  const b = document.getElementById('edTerrain'); if (b) b.classList.toggle('on', v);
  edAttach(); edEmit('terrain');
}
function ttRing() {
  const c = TT.cursor; if (!c) { TT.ring.visible = false; return; }
  const P = TT.ring.geometry.attributes.position.array;
  for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, x = c.x + Math.cos(a) * TT.radius, z = c.z + Math.sin(a) * TT.radius; P[k * 3] = x; P[k * 3 + 1] = Math.max(Hq(x, z), WL) + 0.4; P[k * 3 + 2] = z; }
  TT.ring.geometry.attributes.position.needsUpdate = true; TT.ring.visible = TT.on;
}
function ttMove(e) { const t = edGroundT(edMouseRay(e)); TT.cursor = t === null ? null : edRay.ray.at(t, new THREE.Vector3()); ttRing(); if (TT.cursor) edEmit('cursor', TT.cursor); }
function ttStrokeBegin(e) { ttMove(e); if (!TT.cursor) return; TT.stroke = { before: new Map(), invert: e.shiftKey }; TT.flatH = Hq(TT.cursor.x, TT.cursor.z); }
function ttStrokeEnd() {
  const S = TT.stroke; TT.stroke = null; if (!S || !S.before.size) return;
  const idx = Int32Array.from(S.before.keys()), before = Float32Array.from(S.before.values()), after = Float32Array.from(idx, i => HG[i]);
  ED.undo.push({ terrain: { idx, before, after } }); if (ED.undo.length > 300) ED.undo.shift(); ED.redo.length = 0; setDirty(true); edEmit('history');
}
/* aplica o pincel em volta do cursor (chamado a cada quadro enquanto o botão está apertado) */
function ttApply(dt) {
  const c = TT.cursor, S = TT.stroke; if (!c || !S) return;
  const r = TT.radius, ix0 = Math.max(1, Math.floor((c.x - r - X0) / CS)), ix1 = Math.min(NX - 1, Math.ceil((c.x + r - X0) / CS)), iz0 = Math.max(1, Math.floor((c.z - r - Z0) / CS)), iz1 = Math.min(NZ - 1, Math.ceil((c.z + r - Z0) / CS));
  if (ix0 > ix1 || iz0 > iz1) return;
  let brush = TT.brush; if (S.invert && brush === 'raise') brush = 'lower'; else if (S.invert && brush === 'lower') brush = 'raise';
  const st = TT.strength * dt, src = brush === 'smooth' ? HG.slice((iz0 - 1) * W1, (iz1 + 2) * W1) : null, so = (iz0 - 1) * W1;
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const x = X0 + ix * CS, z = Z0 + iz * CS, d = Math.hypot(x - c.x, z - c.z); if (d > r) continue;
    const f = 0.5 + 0.5 * Math.cos(Math.PI * d / r), i = iz * W1 + ix, h = HG[i]; let dh = 0;
    if (brush === 'raise') dh = st * f; else if (brush === 'lower') dh = -st * f;
    else if (brush === 'flatten') dh = (TT.flatH - h) * Math.min(1, f * st * 0.35);
    else if (brush === 'smooth') { const j = i - so, avg = (src[j - 1] + src[j + 1] + src[j - W1] + src[j + W1] + src[j - W1 - 1] + src[j - W1 + 1] + src[j + W1 - 1] + src[j + W1 + 1]) / 8; dh = (avg - h) * Math.min(1, f * st * 0.4); }
    else if (brush === 'noise') dh = (vnoise(x * 0.09, z * 0.09) - 0.5) * 2 * st * f;
    if (!dh) continue;
    if (!S.before.has(i)) S.before.set(i, h);
    HG[i] = h + dh; TT.delta[i] += dh;
  }
  ttRefresh(ix0 - 1, ix1 + 1, iz0 - 1, iz1 + 1);
}
/* atualiza malha (altura, normal, cor) e as esferas de recorte dos ladrilhos na região */
function ttRefresh(ix0, ix1, iz0, iz1) {
  ix0 = Math.max(0, ix0); iz0 = Math.max(0, iz0); ix1 = Math.min(NX, ix1); iz1 = Math.min(NZ, iz1);
  const g = TERRAIN.geo, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, h = (ix, iz) => HG[Math.min(NZ, Math.max(0, iz)) * W1 + Math.min(NX, Math.max(0, ix))];
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const i = iz * W1 + ix; P.array[i * 3 + 1] = HG[i];
    const nx = -(h(ix + 1, iz) - h(ix - 1, iz)) / (2 * CS), nz = -(h(ix, iz + 1) - h(ix, iz - 1)) / (2 * CS), l = Math.hypot(nx, 1, nz);
    N.array[i * 3] = nx / l; N.array[i * 3 + 1] = 1 / l; N.array[i * 3 + 2] = nz / l;
    if (TERRAIN.color) TERRAIN.color(i, C.array);
  }
  const range = { offset: iz0 * W1 * 3, count: (iz1 - iz0 + 1) * W1 * 3 };
  for (const a of [P, N, C]) { a.updateRange = Object.assign({}, range); a.needsUpdate = true; }
  for (const t of TERRAIN.tiles) {
    const tx0 = t.bx * TERRAIN.tw, tx1 = Math.min(NX, (t.bx + 1) * TERRAIN.tw), tz0 = t.bz * TERRAIN.th, tz1 = Math.min(NZ, (t.bz + 1) * TERRAIN.th);
    if (tx1 < ix0 || tx0 > ix1 || tz1 < iz0 || tz0 > iz1) continue;
    let lo = 1e9, hi = -1e9; for (let iz = tz0; iz <= tz1; iz += 2) for (let ix = tx0; ix <= tx1; ix += 2) { const v = HG[iz * W1 + ix]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const x0 = X0 + tx0 * CS, x1 = X0 + tx1 * CS, z0 = Z0 + tz0 * CS, z1 = Z0 + tz1 * CS, sp = t.mesh.geometry.boundingSphere;
    sp.center.set((x0 + x1) / 2, (lo + hi) / 2, (z0 + z1) / 2); sp.radius = Math.hypot((x1 - x0) / 2, (z1 - z0) / 2, (hi - lo) / 2) + 4;
  }
}
/* desfazer/refazer de uma pincelada */
function ttUndoEntry(t, back) {
  const v = back ? t.before : t.after; let a = 1e9, b = -1, c = 1e9, d = -1;
  for (let k = 0; k < t.idx.length; k++) { const i = t.idx[k], dh = v[k] - HG[i]; HG[i] = v[k]; TT.delta[i] += dh; const ix = i % W1, iz = (i - ix) / W1; a = Math.min(a, ix); b = Math.max(b, ix); c = Math.min(c, iz); d = Math.max(d, iz); }
  if (b >= 0) ttRefresh(a - 1, b + 1, c - 1, d + 1);
}
/* para salvar: só as linhas da grade que mudaram */
function ttEncode() {
  if (!TT.delta) return null; const rows = {}, u = TT.unit;
  for (let iz = 0; iz <= NZ; iz++) {
    const a = new Int16Array(W1); let any = false;
    for (let ix = 0; ix < W1; ix++) { const q = Math.max(-32767, Math.min(32767, Math.round(TT.delta[iz * W1 + ix] / u))); a[ix] = q; if (q) any = true; }
    if (!any) continue;
    const by = new Uint8Array(a.buffer); let s = ''; for (let k = 0; k < by.length; k += 4096) s += String.fromCharCode.apply(null, by.subarray(k, k + 4096));
    rows[iz] = btoa(s);
  }
  return Object.keys(rows).length ? { unit: u, rows } : null;
}
function ttResetAll() {
  if (!confirm('Voltar todo o relevo para o original do jogo? (dá para desfazer só até salvar)')) return;
  const idx = [], before = [], after = [];
  for (let i = 0; i < HG.length; i++) if (TT.delta[i]) { idx.push(i); before.push(HG[i]); after.push(HG[i] - TT.delta[i]); }
  if (!idx.length) return;
  const t = { idx: Int32Array.from(idx), before: Float32Array.from(before), after: Float32Array.from(after) };
  ttUndoEntry(t, false); ED.undo.push({ terrain: t }); ED.redo.length = 0; setDirty(true); edEmit('history'); edToast('Relevo original restaurado');
}
