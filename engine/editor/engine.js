/* NEON ENGINE — núcleo do editor: estado do mapa, câmera livre, seleção, gizmo, colocar objetos, desfazer/refazer, salvar e testar.
   A parte visual dos painéis fica em editor/ui.js. Os objetos são montados pelas MESMAS funções do jogo (js/world/placements.js). */
'use strict';
const ED = {
  file: MAPDATA.__file || 'maps/world.json', project: window.NEON_PROJECT_INFO || null, map: null, dirty: false, api: false, desktop: false,
  roots: new Map(),            // id -> THREE.Group na cena
  sel: null, tool: 'translate', snap: true, snapMove: 0.5, snapRot: 15, space: 'world', top: false,
  undo: [], redo: [], pending: null, placing: null, models: [], catalog: null, planDirty: false, listeners: {}
};
const edRoot = new THREE.Group(); edRoot.name = 'neon-engine'; scene.add(edRoot);
const edRay = new THREE.Raycaster(), edNdc = new THREE.Vector2();
const fly = { x: 0, y: 60, z: 0, yaw: 0, pitch: -0.5, speed: 40, rmb: false, mmb: false, keys: {}, lx: 0, ly: 0, moved: 0 };
const edOn = (ev, fn) => (ED.listeners[ev] = ED.listeners[ev] || []).push(fn);
const edEmit = (ev, a) => (ED.listeners[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } });
const r2 = v => Math.round(v * 100) / 100;

/* ---------------- dados do mapa ---------------- */
function edNormalize(m) {
  m = m && typeof m === 'object' ? m : {}; delete m.__file;
  m.format = 'neon-map'; m.version = 1; if (!Array.isArray(m.objects)) m.objects = []; if (!Array.isArray(m.vehicles)) m.vehicles = [];
  return m;
}
function edNewId(prefix) { const used = new Set([...ED.map.objects, ...ED.map.vehicles].map(o => o.id)); let n = used.size + 1, id; do id = prefix + (n++).toString(36); while (used.has(id)); return id; }
const edAll = () => ED.map.objects.concat(ED.map.vehicles);
const edDef = id => id === 'spawn' ? ED.map.spawn : edAll().find(o => o.id === id) || null;
const edKind = id => id === 'spawn' ? 'spawn' : ED.map.vehicles.some(v => v.id === id) ? 'vehicle' : 'object';
function edLabel(def) {
  if (!def) return '';
  if (def === ED.map.spawn) return 'Ponto de partida';
  if (def.name) return def.name;
  if (def.model) { const m = ED.models.find(x => x.id === def.model); return (m ? m.name : def.model); }
  if (def.type === 'model') { const m = ED.models.find(x => x.id === def.ref); return m ? m.name : def.ref; }
  return (MAP_PREFABS[def.ref] || { name: def.ref }).name;
}
/* JSON legível e bom para o git: um objeto por linha */
function edStringify(m) {
  const head = {}; for (const [k, v] of Object.entries(m)) if (k !== 'objects' && k !== 'vehicles') head[k] = v;
  const body = JSON.stringify(head, null, 2).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (m, a) => '[' + a.trim().split(/,\s*/).join(', ') + ']').replace(/\n}$/, '');
  const arr = (k) => '  "' + k + '": [' + (m[k].length ? '\n' + m[k].map(o => '    ' + JSON.stringify(o)).join(',\n') + '\n  ' : '') + ']';
  return body + (Object.keys(head).length ? ',\n' : '\n') + arr('objects') + ',\n' + arr('vehicles') + '\n}\n';
}
function setDirty(v) { ED.dirty = v; document.getElementById('edDirty').classList.toggle('on', v); document.title = (v ? '● ' : '') + 'NEON ENGINE — ' + ED.file; }
window.__engineDirty = () => ED.dirty;

/* ---------------- desfazer / refazer (fotografias do mapa inteiro: simples e à prova de erro) ---------------- */
const edSnap = () => JSON.stringify(ED.map);
function edBegin() { if (ED.pending === null) ED.pending = edSnap(); }
function edCommit() { if (ED.pending === null) return; const now = edSnap(); if (now !== ED.pending) { ED.undo.push(ED.pending); if (ED.undo.length > 300) ED.undo.shift(); ED.redo.length = 0; setDirty(true); } ED.pending = null; edEmit('history'); }
function edChange(fn) { edBegin(); fn(); edCommit(); }
function edUndo() { if (!ED.undo.length) return; ED.redo.push(edSnap()); ED.map = JSON.parse(ED.undo.pop()); setDirty(true); edReconcile(); edToast('Desfeito'); }
function edRedo() { if (!ED.redo.length) return; ED.undo.push(edSnap()); ED.map = JSON.parse(ED.redo.pop()); setDirty(true); edReconcile(); edToast('Refeito'); }

/* ---------------- cena: monta/atualiza o que está no mapa ---------------- */
const edVehMat = new THREE.MeshBasicMaterial({ color: 0x40c4ff, wireframe: true });
function edBuildVehicle(def) {
  const root = new THREE.Group(); root.userData.def = def;
  const ph = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4.2).translate(0, 0.7, 0), edVehMat); root.add(ph);
  root.userData.ready = loadVehicleType(def.model).then(type => {
    const color = def.color ? parseInt(String(def.color).replace('#', ''), 16) : 0x9aa4ae, mesh = makeVehicleMesh(type, color);
    root.remove(ph); root.add(mesh); root.userData.visual = mesh; return root;
  }).catch(e => { console.warn('veículo', def.model, e); return root; });
  return root;
}
function edBuildSpawn() {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x39ff88 }), b = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.25, depthWrite: false });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 12).translate(0, 0.9, 0), m));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10).rotateX(Math.PI / 2).translate(0, 0.2, 1.1), m); g.add(arrow);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.06, 32), b));
  g.userData.ready = Promise.resolve(g); return g;
}
function edPlaceRoot(id, def, kind) {
  const root = kind === 'vehicle' ? edBuildVehicle(def) : kind === 'spawn' ? edBuildSpawn() : mapBuildObject(def);
  root.userData.edId = id; root.userData.kind = kind; root.userData.json = JSON.stringify(def);
  edApply(root, def, kind); edRoot.add(root); ED.roots.set(id, root); return root;
}
function edApply(root, def, kind) {
  if (kind === 'object') mapApplyTransform(root, def);
  else { const p = def.pos || [0, 0, 0]; root.position.set(p[0], p[1], p[2]); root.rotation.set(0, (def.h || 0) * DEG, 0); root.scale.set(1, 1, 1); }
}
const edShape = (def, kind) => kind === 'object' ? JSON.stringify([def.type, def.ref, def.p || null]) : kind === 'vehicle' ? JSON.stringify([def.model, def.color || null]) : 'spawn';
function edDispose(root) { edRoot.remove(root); root.traverse(o => { if (o.isMesh && o.userData.ownGeo) o.geometry.dispose(); }); }
/* compara o mapa com a cena e corrige só o que mudou */
function edReconcile() {
  const want = new Map();
  for (const d of ED.map.objects) want.set(d.id, [d, 'object']);
  for (const d of ED.map.vehicles) want.set(d.id, [d, 'vehicle']);
  if (ED.map.spawn) want.set('spawn', [ED.map.spawn, 'spawn']);
  for (const [id, root] of [...ED.roots]) if (!want.has(id)) { edDispose(root); ED.roots.delete(id); }
  for (const [id, [def, kind]] of want) {
    const root = ED.roots.get(id), js = JSON.stringify(def);
    if (!root) { edPlaceRoot(id, def, kind); continue; }
    if (root.userData.json === js) { root.userData.def = def; continue; }
    if (edShape(JSON.parse(root.userData.json), kind) !== edShape(def, kind)) { const keep = ED.sel === id; edDispose(root); ED.roots.delete(id); edPlaceRoot(id, def, kind); if (keep) edAttach(); }
    else { root.userData.def = def; root.userData.json = js; edApply(root, def, kind); }
  }
  if (ED.sel && !ED.roots.has(ED.sel)) ED.sel = null;
  edAttach(); edEmit('scene'); edEmit('select');
}
/* algo mudou nos dados de um objeto (painel de propriedades) */
function edUpdated(id) { edReconcile(); }

/* ---------------- câmera livre ---------------- */
function edCamApply() {
  camera.position.set(fly.x, fly.y, fly.z); camera.rotation.set(fly.pitch, fly.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
}
function edFlyUpdate(dt) {
  const k = fly.keys, fast = k.ShiftLeft || k.ShiftRight ? 4 : 1, sp = fly.speed * fast * dt;
  if (fly.rmb) {
    const fx = -Math.sin(fly.yaw) * Math.cos(fly.pitch), fy = Math.sin(fly.pitch), fz = -Math.cos(fly.yaw) * Math.cos(fly.pitch), rx = Math.cos(fly.yaw), rz = -Math.sin(fly.yaw);
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), u = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    fly.x += (fx * f + rx * s) * sp; fly.y += (fy * f + u) * sp; fly.z += (fz * f + rz * s) * sp;
  }
  const g = carGroundHeight(fly.x, fly.z); if (fly.y < g + 0.6) fly.y = g + 0.6;
  edCamApply();
}
function edLookAtPoint(x, y, z, dist) {
  dist = dist || 18; const dir = new THREE.Vector3(-Math.sin(fly.yaw) * Math.cos(fly.pitch), Math.sin(fly.pitch), -Math.cos(fly.yaw) * Math.cos(fly.pitch));
  if (fly.pitch > -0.25) { fly.pitch = -0.45; dir.set(-Math.sin(fly.yaw) * Math.cos(fly.pitch), Math.sin(fly.pitch), -Math.cos(fly.yaw) * Math.cos(fly.pitch)); }
  fly.x = x - dir.x * dist; fly.y = y - dir.y * dist; fly.z = z - dir.z * dist; edCamApply();
}
function edFocus() {
  const r = ED.sel && ED.roots.get(ED.sel); if (!r) return;
  const bb = new THREE.Box3().setFromObject(r), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()).length();
  edLookAtPoint(c.x, c.y, c.z, Math.max(6, s * 1.4));
}
function edSetTop(on) {
  ED.top = on; document.getElementById('edTopView').classList.toggle('on', on);
  if (on) { fly.__prev = { y: fly.y, pitch: fly.pitch }; fly.pitch = -Math.PI / 2 + 0.001; fly.y = Math.max(fly.y, 180); fly.yaw = 0; }
  else if (fly.__prev) { fly.pitch = fly.__prev.pitch; fly.y = Math.min(fly.y, Math.max(fly.__prev.y, 40)); }
  edCamApply();
}

/* ---------------- raios: chão (relevo + calçadas) e objetos ---------------- */
function edMouseRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  edNdc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); edRay.setFromCamera(edNdc, camera); return edRay.ray;
}
function edGroundT(ray, maxD) {
  const o = ray.origin, d = ray.direction, f = t => o.y + d.y * t - carGroundHeight(o.x + d.x * t, o.z + d.z * t);
  let prev = 0, t = 0.25; if (f(0) < 0) return null;
  while (t < (maxD || 4000)) { if (f(t) <= 0) { let a = prev, b = t; for (let i = 0; i < 22; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; } return b; } prev = t; t += Math.max(0.25, t * 0.015); }
  return null;
}
/* ponto onde o mouse aponta: o mais perto entre o chão e os objetos colocados (para empilhar) */
function edHitPoint(ray, skip) {
  let best = null; const tg = edGroundT(ray); if (tg !== null) best = { t: tg, p: ray.at(tg, new THREE.Vector3()), obj: null };
  const targets = [...ED.roots.values()].filter(r => r !== skip && r.userData.kind === 'object');
  edRay.ray.copy(ray); const hits = edRay.intersectObjects(targets, true).filter(h => h.object.visible);
  if (hits.length && (!best || hits[0].distance < best.t)) best = { t: hits[0].distance, p: hits[0].point.clone(), obj: hits[0].object, n: hits[0].face && hits[0].face.normal };
  return best;
}
function edPick(e) {
  const ray = edMouseRay(e); edRay.ray.copy(ray);
  const hits = edRay.intersectObjects([...ED.roots.values()], true);
  for (const h of hits) { let o = h.object; while (o && !o.userData.edId) o = o.parent; if (o && o.visible) return o.userData.edId; }
  return null;
}
/* chão logo abaixo de um ponto (relevo, calçada ou topo de outro objeto) */
function edGroundBelow(x, y, z, skip) {
  let g = carGroundHeight(x, z);
  const targets = [...ED.roots.values()].filter(r => r !== skip && r.userData.kind === 'object');
  edRay.set(new THREE.Vector3(x, y + 0.05, z), new THREE.Vector3(0, -1, 0));
  const h = edRay.intersectObjects(targets, true)[0]; if (h && h.point.y > g) g = h.point.y;
  return g;
}

/* ---------------- seleção e gizmo ---------------- */
const tc = new THREE.TransformControls(camera, renderer.domElement); tc.setSize(0.9); scene.add(tc);
const selBox = new THREE.BoxHelper(undefined, 0xffc400); selBox.visible = false; selBox.material.depthTest = false; selBox.renderOrder = 999; scene.add(selBox);
function edSelect(id) { ED.sel = id && ED.roots.has(id) ? id : null; edAttach(); edEmit('select'); }
function edAttach() {
  const r = ED.sel && ED.roots.get(ED.sel);
  if (!r || ED.tool === 'select' || ED.placing) { tc.detach(); } else {
    const kind = r.userData.kind, mode = kind !== 'object' && ED.tool === 'scale' ? 'translate' : ED.tool;
    tc.attach(r); tc.setMode(mode); tc.setSpace(kind !== 'object' ? 'local' : ED.space);
    tc.showX = tc.showZ = !(mode === 'rotate' && kind !== 'object'); tc.showY = true;
    tc.setTranslationSnap(ED.snap ? ED.snapMove : null); tc.setRotationSnap(ED.snap ? ED.snapRot * DEG : null); tc.setScaleSnap(ED.snap ? 0.1 : null);
  }
  selBox.visible = !!r; if (r) selBox.setFromObject(r);
}
function edSetTool(t) { ED.tool = t; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); edAttach(); }
tc.addEventListener('dragging-changed', e => { if (e.value) edBegin(); else { edCommit(); edEmit('select'); } });
tc.addEventListener('objectChange', () => {                     // gizmo mexeu: grava de volta nos dados (graus, 2 casas)
  const r = tc.object; if (!r) return; const def = r.userData.def, kind = r.userData.kind;
  def.pos = [r2(r.position.x), r2(r.position.y), r2(r.position.z)];
  if (kind === 'object') { const e = new THREE.Euler().setFromQuaternion(r.quaternion, 'YXZ'); def.rot = [r2(e.x / DEG), r2(e.y / DEG), r2(e.z / DEG)]; def.scale = [r2(r.scale.x), r2(r.scale.y), r2(r.scale.z)];
    if (def.rot.every(v => v === 0)) delete def.rot; if (def.scale.every(v => v === 1)) delete def.scale; }
  else { const e = new THREE.Euler().setFromQuaternion(r.quaternion, 'YXZ'); def.h = r2(((e.y / DEG) % 360 + 360) % 360); }
  r.userData.json = JSON.stringify(def); edEmit('transform');
});

/* ---------------- colocar objetos da biblioteca ---------------- */
function edStartPlacing(tpl) {
  edCancelPlacing(); edSelect(null);
  const kind = tpl.model ? 'vehicle' : 'object', def = JSON.parse(JSON.stringify(tpl, (k, v) => k.startsWith('__') ? undefined : v)); def.pos = [0, -500, 0];
  const ghost = kind === 'vehicle' ? edBuildVehicle(def) : mapBuildObject(def); ghost.userData.kind = 'ghost'; edRoot.add(ghost);
  ED.placing = { tpl, def, kind, ghost, yaw: tpl.__yaw || 0 }; document.body.classList.add('ed-placing'); edEmit('placing');
}
function edCancelPlacing() { if (!ED.placing) return; edDispose(ED.placing.ghost); ED.placing = null; document.body.classList.remove('ed-placing'); edEmit('placing'); }
function edMovePlacing(e) {
  const P = ED.placing; if (!P) return;
  const hit = edHitPoint(edMouseRay(e), P.ghost); if (!hit) { P.ghost.visible = false; return; }
  P.ghost.visible = true; const s = ED.snap ? ED.snapMove : 0.01, q = v => Math.round(v / s) * s;
  let y = hit.p.y; if (P.kind === 'object' && P.def.type === 'model') { P.ghost.updateMatrixWorld(true); }
  P.def.pos = [r2(q(hit.p.x)), r2(y), r2(q(hit.p.z))];
  if (P.kind === 'vehicle') P.def.h = P.yaw; else { P.def.rot = P.yaw ? [0, P.yaw, 0] : undefined; if (!P.def.rot) delete P.def.rot; }
  edApply(P.ghost, P.def, P.kind);
  if (P.kind === 'object') { P.ghost.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(P.ghost); if (!bb.isEmpty() && Math.abs(bb.min.y - P.def.pos[1]) > 0.02 && P.def.type === 'model') { P.def.pos[1] = r2(P.def.pos[1] + (P.def.pos[1] - bb.min.y)); edApply(P.ghost, P.def, P.kind); } }
  edEmit('cursor', hit.p);
}
function edCommitPlacing(keep) {
  const P = ED.placing; if (!P || !P.ghost.visible) return;
  const def = JSON.parse(JSON.stringify(P.def)); def.id = edNewId(P.kind === 'vehicle' ? 'v' : 'o');
  edChange(() => { (P.kind === 'vehicle' ? ED.map.vehicles : ED.map.objects).push(def); });
  P.tpl.__yaw = P.yaw;
  if (!keep) { edCancelPlacing(); edReconcile(); edSelect(def.id); } else { edReconcile(); }
}
function edRotatePlacing(deg) { if (ED.placing) { ED.placing.yaw = ((ED.placing.yaw + deg) % 360 + 360) % 360; } }

/* ---------------- ações ---------------- */
function edDelete() {
  const id = ED.sel; if (!id) return; if (id === 'spawn') { edChange(() => { delete ED.map.spawn; }); }
  else edChange(() => { ED.map.objects = ED.map.objects.filter(o => o.id !== id); ED.map.vehicles = ED.map.vehicles.filter(o => o.id !== id); });
  ED.sel = null; edReconcile(); edToast('Apagado');
}
function edDuplicate() {
  const id = ED.sel, def = id && id !== 'spawn' && edDef(id); if (!def) return;
  const copy = JSON.parse(JSON.stringify(def)), kind = edKind(id); copy.id = edNewId(kind === 'vehicle' ? 'v' : 'o');
  const r = ED.roots.get(id), bb = new THREE.Box3().setFromObject(r), w = Math.max(1, bb.max.x - bb.min.x);
  copy.pos = [r2(copy.pos[0] + w + (ED.snap ? ED.snapMove : 0.5)), copy.pos[1], copy.pos[2]];
  edChange(() => (kind === 'vehicle' ? ED.map.vehicles : ED.map.objects).push(copy)); edReconcile(); edSelect(copy.id); edToast('Duplicado');
}
/* G: assenta no chão (relevo, calçada ou objeto embaixo) */
function edDrop() {
  const id = ED.sel, r = id && ED.roots.get(id), def = id && edDef(id); if (!r || !def) return;
  r.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(r), c = bb.getCenter(new THREE.Vector3());
  const g = edGroundBelow(c.x, bb.max.y + 0.5, c.z, r), off = r.userData.kind === 'object' ? (r.position.y - bb.min.y) : 0;
  edChange(() => { def.pos = [def.pos[0], r2(g + off), def.pos[2]]; }); edReconcile();
}
function edSetSpawnHere() {
  const hit = edHitPoint(edCenterRay()); if (!hit) return;
  edChange(() => { ED.map.spawn = { pos: [r2(hit.p.x), r2(hit.p.y), r2(hit.p.z)], h: r2(((fly.yaw / DEG + 180) % 360 + 360) % 360) }; }); edReconcile(); edSelect('spawn');
}
function edCenterRay() { edRay.setFromCamera(new THREE.Vector2(0, 0), camera); return edRay.ray.clone(); }

/* ---------------- servidor local (salvar, importar, testar, gerar .exe) ---------------- */
async function edApi(route, data) {
  const r = await fetch('__engine/' + route, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({ ok: false, error: 'resposta inválida (' + r.status + ')' })); if (!j.ok) throw new Error(j.error || 'falhou'); return j;
}
async function edSave() {
  const text = edStringify(ED.map);
  if (!ED.api) {            // sem servidor do editor: baixa o arquivo
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = ED.file.split('/').pop(); a.click();
    edToast('Sem o servidor do editor: arquivo baixado. Coloque-o em ' + ED.file, 5000); return false;
  }
  try { await edApi('save', { file: ED.file, text }); setDirty(false); edToast('Mapa salvo — ' + ED.file); return true; }
  catch (e) { edToast('Não salvou: ' + e.message, 5000); return false; }
}
async function edPlay() {
  if (ED.dirty && !(await edSave())) return;
  const hit = edHitPoint(edCenterRay()), p = hit ? hit.p : new THREE.Vector3(fly.x, carGroundHeight(fly.x, fly.z), fly.z);
  const h = ((fly.yaw / DEG + 180) % 360 + 360) % 360, b = { x: p.x, y: p.y, z: p.z, h };
  if (ED.desktop) { try { await edApi('play', b); } catch (e) { edToast(e.message); } }
  else window.open(((ED.project && ED.project.manifest && ED.project.manifest.entry) || 'index.html') + '?test=' + [b.x, b.y, b.z, b.h].map(v => v.toFixed(2)).join(','), '_blank');
}
/* acompanha uma tarefa demorada (importar, gerar .exe) e devolve o resultado */
async function edJob(id, onLog) {
  for (;;) { const { job } = await edApi('job', { id }); if (onLog) onLog(job.log); if (job.done) return job; await new Promise(r => setTimeout(r, 700)); }
}
async function edLoadModels() {
  try { ED.models = (await edApi('models')).models; }
  catch (e) { try { const c = await assetCatalogReady; ED.models = c.vehicles.map(v => ({ id: v.id, name: v.name || v.id, kind: v.kind || 'car' })).concat(c.weapons.map(w => ({ id: w.id, name: w.name || w.id, kind: 'prop' }))); } catch (e2) { ED.models = []; } }
  edEmit('models');
}
let edToastT = 0;
function edToast(t, ms) { const el = document.getElementById('edToast'); el.textContent = t; el.classList.add('on'); clearTimeout(edToastT); edToastT = setTimeout(() => el.classList.remove('on'), ms || 1800); }

/* ---------------- entrada (o editor captura o teclado/mouse antes do jogo) ---------------- */
const edTyping = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
function edKeyDown(e) {
  if (!document.getElementById('edModal').hidden) {                  // janela aberta: Esc fecha; o resto é dela (campos de texto)
    if (e.code === 'Escape' && typeof closeModal === 'function') closeModal();
    if (!edTyping(e) && (e.target === document.body || e.target === renderer.domElement)) e.stopImmediatePropagation();
    return;
  }
  if (edTyping(e)) return;
  e.stopImmediatePropagation();
  fly.keys[e.code] = true; const c = e.ctrlKey || e.metaKey;
  if (c && e.code === 'KeyS') { e.preventDefault(); edSave(); return; }
  if (c && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? edRedo() : edUndo(); return; }
  if (c && e.code === 'KeyY') { e.preventDefault(); edRedo(); return; }
  if (c && e.code === 'KeyD') { e.preventDefault(); edDuplicate(); return; }
  if (e.code === 'F5') { e.preventDefault(); edPlay(); return; }
  if (e.code === 'Escape') { if (ED.placing) edCancelPlacing(); else edSelect(null); return; }
  if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); edDelete(); return; }
  if (fly.rmb || c) return;                                          // voando: WASD/QE são da câmera
  if (ED.placing && e.code === 'KeyR') { edRotatePlacing(e.shiftKey ? -15 : 15); edMovePlacing(edLastMouse); return; }
  const tools = { KeyQ: 'select', KeyW: 'translate', KeyE: 'rotate', KeyR: 'scale' };
  if (tools[e.code]) { edSetTool(tools[e.code]); return; }
  if (e.code === 'KeyF') edFocus();
  if (e.code === 'KeyG') edDrop();
  if (e.code === 'KeyT') edSetTop(!ED.top);
  if (e.code === 'KeyX') edSetSnap(!ED.snap);
  if (e.code === 'KeyL') edSetSpace(ED.space === 'world' ? 'local' : 'world');
}
function edSetSnap(v) { ED.snap = v; document.getElementById('edSnap').classList.toggle('on', v); edAttach(); }
function edSetSpace(v) { ED.space = v; const b = document.getElementById('edSpace'); b.textContent = v === 'world' ? 'Mundo' : 'Local'; b.classList.toggle('on', v === 'local'); edAttach(); }
let edLastMouse = { clientX: 0, clientY: 0 };
function edInstallInput() {
  const cv = renderer.domElement;
  addEventListener('keydown', edKeyDown, true);
  addEventListener('keyup', e => { fly.keys[e.code] = false; if (!edTyping(e)) e.stopImmediatePropagation(); }, true);
  addEventListener('blur', () => { fly.keys = {}; fly.rmb = fly.mmb = false; });
  for (const t of ['mousedown', 'mouseup', 'mousemove', 'wheel', 'click', 'contextmenu']) addEventListener(t, e => { if (e.target === cv) { e.stopImmediatePropagation(); if (t === 'contextmenu') e.preventDefault(); } }, true);
  cv.addEventListener('pointerdown', e => {
    cv.focus(); fly.lx = e.clientX; fly.ly = e.clientY; fly.moved = 0;
    if (e.button === 2) { fly.rmb = true; cv.setPointerCapture(e.pointerId); if (ED.placing) { /* botão direito também cancela a colocação se não arrastar */ } }
    if (e.button === 1) { fly.mmb = true; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  cv.addEventListener('pointermove', e => {
    edLastMouse = { clientX: e.clientX, clientY: e.clientY };
    const dx = e.clientX - fly.lx, dy = e.clientY - fly.ly; fly.lx = e.clientX; fly.ly = e.clientY; fly.moved += Math.abs(dx) + Math.abs(dy);
    if (fly.rmb && !ED.top) { fly.yaw -= dx * 0.0042; fly.pitch = Math.max(-1.55, Math.min(1.55, fly.pitch - dy * 0.0042)); edCamApply(); }
    else if (fly.rmb && ED.top || fly.mmb) { const k = Math.max(0.05, (fly.y - carGroundHeight(fly.x, fly.z)) * 0.0016); const c = Math.cos(fly.yaw), s = Math.sin(fly.yaw);
      fly.x -= (dx * c + dy * s) * k; fly.z -= (-dx * s + dy * c) * k; edCamApply(); }
    if (ED.placing) edMovePlacing(e);
    else if (!fly.rmb && !fly.mmb) { const t = edGroundT(edMouseRay(e)); if (t !== null) edEmit('cursor', edRay.ray.at(t, new THREE.Vector3())); }
  });
  cv.addEventListener('pointerup', e => {
    if (e.button === 2) { fly.rmb = false; if (ED.placing && fly.moved < 4) edCancelPlacing(); }
    if (e.button === 1) fly.mmb = false;
    if (e.button === 0 && fly.moved < 5 && !tc.dragging) {
      if (ED.placing) edCommitPlacing(e.shiftKey);
      else if (!tc.axis) edSelect(edPick(e));
    }
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (fly.rmb) { fly.speed = Math.max(2, Math.min(600, fly.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); edToast('Velocidade da câmera: ' + Math.round(fly.speed) + ' m/s', 900); return; }
    const ray = edMouseRay(e), t = edGroundT(ray), d = (t || 60) * (e.deltaY < 0 ? 0.18 : -0.22);
    fly.x += ray.direction.x * d; fly.y += ray.direction.y * d; fly.z += ray.direction.z * d; edCamApply();
  }, { passive: false });
  cv.tabIndex = 0;
}

/* ---------------- laço de desenho do editor (no lugar do js/main.js) ---------------- */
let edLast = performance.now(), edFps = 0, edFpsT = 0, edFrames = 0;
function edResize() {
  const vp = document.getElementById('viewport'), w = vp.clientWidth, h = vp.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (typeof postResize === 'function') postResize();
}
function edFrame(now) {
  requestAnimationFrame(edFrame);
  const dt = Math.min(0.05, (now - edLast) / 1000); if (typeof adaptResolution === 'function') adaptResolution(now - edLast); edLast = now;
  edFlyUpdate(dt);
  windU.value = now / 1000;
  const look = new THREE.Vector3(); camera.getWorldDirection(look); const t = ED.top ? fly.y - carGroundHeight(fly.x, fly.z) : 60;
  camTarget.set(fly.x + look.x * t, 0, fly.z + look.z * t);
  sunLight.target.position.set(camTarget.x, 0, camTarget.z); sunLight.position.set(camTarget.x + sunDir.x * 160, Math.max(sunDir.y, 0.15) * 160, camTarget.z + sunDir.z * 160);
  sunMesh.position.copy(camera.position).addScaledVector(sunDir, 2000); moonMesh.position.copy(camera.position).addScaledVector(sunDir, -2000); stars.position.copy(camera.position);
  water.position.x = camera.position.x; water.position.z = camera.position.z;
  waterNormal.offset.set(WREP * camera.position.x / 6000 + now * 0.000004 * 60, -WREP * camera.position.z / 6000 + now * 0.0000025 * 60);
  if (typeof lhBeam !== 'undefined') lhBeam.rotation.y = now / 1500;
  updateVegetationCulling();
  if (selBox.visible && ED.sel && ED.roots.get(ED.sel)) selBox.setFromObject(ED.roots.get(ED.sel));
  postRender(false);
  edFrames++; edFpsT += dt; if (edFpsT > 0.5) { edFps = edFrames / edFpsT; edFrames = 0; edFpsT = 0; edEmit('fps', edFps); }
}

/* ---------------- partida ---------------- */
async function edStart() {
  removeEventListener('resize', resize);                         // o jogo dimensiona pela janela; o editor, pela área do viewport
  new ResizeObserver(edResize).observe(document.getElementById('viewport')); edResize();
  ED.map = edNormalize(JSON.parse(JSON.stringify(MAPDATA)));
  try { const p = await edApi('ping'); ED.api = true; ED.desktop = !!p.desktop; } catch (e) { ED.api = false; }
  // câmera: volta onde estava (recarregar a planta), senão no ponto de partida, senão no centro de SP
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem('neonEngineCam') || 'null'); } catch (e) { /* sem armazenamento */ }
  if (saved) Object.assign(fly, saved);
  else { const s = ED.map.spawn && ED.map.spawn.pos, x = s ? s[0] : blockC(4), z = s ? s[2] : blockC(4); fly.x = x; fly.z = z + 70; fly.y = carGroundHeight(x, z) + 55; fly.yaw = 0; fly.pitch = -0.62; }
  addEventListener('beforeunload', () => { try { sessionStorage.setItem('neonEngineCam', JSON.stringify({ x: fly.x, y: fly.y, z: fly.z, yaw: fly.yaw, pitch: fly.pitch, speed: fly.speed })); } catch (e) { /* ignora */ } });
  hour = 13.5; updateSky(0); edCamApply();
  edInstallInput(); edReconcile(); edSetTool('translate'); edSetSnap(true); setDirty(false);
  await edLoadModels();
  if (typeof edUiStart === 'function') edUiStart();
  requestAnimationFrame(edFrame);
  if (!ED.api) edToast('Editor aberto sem o servidor do NEON ENGINE: "Salvar" vai baixar o arquivo. Use npm run editor.', 6000);
}
