/* NEON ENGINE — pincel de vegetação: pinta árvores, palmeiras, arbustos e plantas (prontas ou importadas, ex.: grama do GTA IV) espalhando
   com densidade, giro e tamanho aleatórios; Shift apaga (o que foi pintado e, se quiser, as árvores originais do mapa).
   Cada planta vira um objeto do mapa com "veg": 1 (no jogo elas são desenhadas em lote, com instâncias). */
'use strict';
const VB = { on: false, radius: 8, density: 3, smin: 0.8, smax: 1.25, eraseOrig: true, sel: new Set(['p:arvore']), stroke: null, cursor: null, ring: null, acc: 0 };
const VB_TREE_KINDS = /^(arvore|arvore-rua|palmeira|cipreste|pinheiro|arbusto)$/;
function vbSpecies() {
  const out = [['p:arvore', 'Árvore de rua', { type: 'prefab', ref: 'arvore' }], ['p:pinheiro', 'Pinheiro', { type: 'prefab', ref: 'pinheiro' }], ['p:palmeira', 'Palmeira', { type: 'prefab', ref: 'palmeira' }], ['p:arbusto', 'Arbusto', { type: 'prefab', ref: 'arbusto' }]];
  for (const m of ED.models) if (m.kind === 'object3d' && /veget|planta|grama|árvore|arvore|tree|grass|flora/i.test((m.cat || '') + ' ' + m.name)) out.push(['g:' + m.id, m.name, { type: 'gltf', ref: m.id }]);
  return out;
}
function vbInit() {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(97 * 3), 3));
  VB.ring = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7dff6a, depthTest: false, transparent: true })); VB.ring.renderOrder = 998; VB.ring.visible = false; VB.ring.frustumCulled = false; scene.add(VB.ring);
}
function vbSetOn(v) {
  VB.on = v; if (v) { edCancelPlacing(); edSelect(null); if (TT.on) ttSetOn(false); if (typeof SK !== 'undefined' && SK.on) skSetOn(false); } else VB.stroke = null;
  VB.ring.visible = v && !!VB.cursor; document.body.classList.toggle('ed-veg', v);
  const b = document.getElementById('edVeg'); if (b) b.classList.toggle('on', v);
  edAttach(); edEmit('terrain');
}
function vbRing(erase) {
  const c = VB.cursor; if (!c) { VB.ring.visible = false; return; } const P = VB.ring.geometry.attributes.position.array;
  for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, x = c.x + Math.cos(a) * VB.radius, z = c.z + Math.sin(a) * VB.radius; P[k * 3] = x; P[k * 3 + 1] = carGroundHeight(x, z) + 0.35; P[k * 3 + 2] = z; }
  VB.ring.geometry.attributes.position.needsUpdate = true; VB.ring.visible = VB.on; VB.ring.material.color.setHex(erase ? 0xff6a6a : 0x7dff6a);
}
function vbMove(e) { const t = edGroundT(edMouseRay(e)); VB.cursor = t === null ? null : edRay.ray.at(t, new THREE.Vector3()); vbRing(e.shiftKey || (VB.stroke && VB.stroke.erase)); if (VB.cursor) edEmit('cursor', VB.cursor); }
function vbBegin(e) {
  vbMove(e); if (!VB.cursor) return; edBegin();
  VB.stroke = { erase: e.shiftKey, grid: new Map() }; VB.acc = 0;
  for (const d of ED.map.objects) if (d.veg) vbGridAdd(d);
  if (VB.stroke.erase) vbErase();
}
const vbKey = (x, z) => Math.floor(x / 4) + ',' + Math.floor(z / 4);
function vbGridAdd(d) { const k = vbKey(d.pos[0], d.pos[2]); let l = VB.stroke.grid.get(k); if (!l) VB.stroke.grid.set(k, l = []); l.push(d); }
function vbNear(x, z, r) { const out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = VB.stroke.grid.get((Math.floor(x / 4) + a) + ',' + (Math.floor(z / 4) + b)); if (l) for (const d of l) if (Math.hypot(d.pos[0] - x, d.pos[2] - z) < r) out.push(d); } return out; }
function vbEnd() { if (!VB.stroke) return; VB.stroke = null; edCommit(); edReconcile(); }
function vbFrame(dt) {
  const S = VB.stroke, c = VB.cursor; if (!S || !c) return;
  if (S.erase) { vbErase(); return; }
  const list = vbSpecies().filter(s => VB.sel.has(s[0])); if (!list.length) { edToast('Escolha ao menos uma planta no painel'); VB.stroke = null; return; }
  // densidade = plantas por 100 m² dentro do pincel; o pincel "enche" em ~1 s de passada
  const area = Math.PI * VB.radius * VB.radius, want = area * VB.density / 100, minD = Math.max(0.6, Math.sqrt(100 / Math.max(0.05, VB.density)) * 0.55);
  VB.acc += want * dt * 1.2; let added = 0;
  while (VB.acc >= 1 && added < 40) {
    VB.acc -= 1; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * VB.radius, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (vbNear(x, z, minD).length) continue;
    const y = carGroundHeight(x, z); if (y < WL - 0.05) continue;
    const sp = list[Math.floor(Math.random() * list.length)], s = +(VB.smin + Math.random() * (VB.smax - VB.smin)).toFixed(2);
    const def = Object.assign(JSON.parse(JSON.stringify(sp[2])), { id: edNewId('o'), pos: [r2(x), r2(y), r2(z)], rot: [0, Math.round(Math.random() * 360), 0], scale: [s, s, s], veg: 1 });
    ED.map.objects.push(def); vbGridAdd(def); edPlaceRoot(def.id, def, 'object'); added++;
  }
  if (added) edEmit('scene');
}
function vbErase() {
  const c = VB.cursor; if (!c) return; const R = VB.radius; let n = 0;
  const keep = ED.map.objects.filter(d => !(d.veg && Math.hypot(d.pos[0] - c.x, d.pos[2] - c.z) < R)); n = ED.map.objects.length - keep.length;
  if (n) { const gone = new Set(ED.map.objects.filter(d => !keep.includes(d)).map(d => d.id)); ED.map.objects = keep; for (const id of gone) { const r = ED.roots.get(id); if (r) { edDispose(r); ED.roots.delete(id); } } VB.stroke.grid = new Map(); for (const d of keep) if (d.veg) vbGridAdd(d); }
  if (VB.eraseOrig) for (const e of WENT.list) { if (!VB_TREE_KINDS.test(e.kind)) continue; if (Math.hypot(e.x - c.x, e.z - c.z) > R) continue; if (ED.map.world[e.id] && ED.map.world[e.id].del) continue; ED.map.world[e.id] = { del: 1 }; n++; }
  if (n) { edWorldSync(); edEmit('scene'); }
}
function renderVegPanel(box) {
  box.append(el('div', { class: 'ed-insp-head' }, el('b', {}, 'Pincel de vegetação'), el('small', {}, 'V liga/desliga · Shift apaga · [ ] tamanho')));
  const list = el('div', { class: 'ed-veg-list' });
  for (const [k, name] of vbSpecies()) { const c = el('input', { type: 'checkbox' }); c.checked = VB.sel.has(k); c.addEventListener('change', () => { if (c.checked) VB.sel.add(k); else VB.sel.delete(k); }); list.append(el('label', { class: 'ed-check' }, c, name)); }
  const slider = (label, key, min, max, step, unit) => { const v = el('span', { class: 'ed-sv' }, VB[key] + ' ' + unit), r = el('input', { type: 'range', min, max, step, value: VB[key] });
    r.addEventListener('input', () => { VB[key] = +r.value; v.textContent = VB[key] + ' ' + unit; vbRing(false); }); return el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, label), el('div', { class: 'ed-slider' }, r, v)); };
  const orig = el('input', { type: 'checkbox' }); orig.checked = VB.eraseOrig; orig.addEventListener('change', () => { VB.eraseOrig = orig.checked; });
  const painted = ED.map.objects.filter(d => d.veg).length, removed = Object.entries(ED.map.world).filter(([id, o]) => o.del && WENT.byId.get(id) && VB_TREE_KINDS.test(WENT.byId.get(id).kind)).length;
  box.append(el('h4', {}, 'Plantas'), list, slider('Tamanho', 'radius', 1, 60, 1, 'm'), slider('Densidade', 'density', 0.2, 30, 0.2, '/100m²'), slider('Escala mín.', 'smin', 0.3, 2, 0.05, '×'), slider('Escala máx.', 'smax', 0.3, 3, 0.05, '×'),
    el('div', { class: 'ed-checks' }, el('label', { class: 'ed-check' }, orig, 'Shift também apaga árvores originais do mapa')),
    el('p', { class: 'ed-hint' }, 'Segure o botão esquerdo e passe no terreno. Cada planta pintada vira um objeto do mapa (dá para selecionar e mover depois); no jogo elas são desenhadas em lote, sem pesar. Para trazer árvores e plantas do GTA IV, use Importar → GTA IV.'),
    el('p', { class: 'ed-hint' }, painted + ' plantas pintadas · ' + removed + ' árvores originais apagadas'),
    el('div', { class: 'ed-actions' }, el('button', { class: 'primary', onclick: () => vbSetOn(false) }, 'Concluir')));
}
