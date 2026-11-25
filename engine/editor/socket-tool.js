/* NEON ENGINE — editor de sockets e anexos de arma.
   Mostra o personagem do jogo no preview tocando uma animação em loop, com a arma presa ao osso da mão direita. O gizmo (TransformControls) move/gira a arma
   enquanto a animação roda; também edita a mão esquerda (lhand) e a ponta do cano (muzzle). O resultado vai para o JSON de sockets do projeto:
     { version:1, weapons:{ id:{ grip:{pos:[3],rot:[3 graus]}, lhand:[3]|null, muzzle:número|null, byAnim:{ clipe_em_minúsculas:{pos,rot} } } } }
   Convenção do DELTA (sobre a empunhadura calibrada w.grip, delta 0 = como hoje):
     posição da malha (espaço do osso da mão) = grip.pos + delta.pos          rotação da malha = grip.quat * Euler(delta.rot em graus, ordem XYZ)  (girada no eixo da própria arma)
   Escopos: "Todas as animações" grava em grip; "Só nesta animação" grava em byAnim[clipe] (substitui o grip nessa animação, não soma). */
'use strict';
const SK = {
  on: false, loading: false, ready: false, data: { version: 1, weapons: {} }, loaded: false, savedStr: '', dirty: false, undo: [], redo: [], pend: null,
  wi: -1, clip: '', key: '', mode: 'direct', scope: 'all', target: 'weapon', gizmo: 'translate', space: 'local', playing: true, speed: 1, t: 0, dur: 0, follow: true, gameArm: true, filter: '',
  gp: new THREE.Vector3(), gq: new THREE.Quaternion(), wgp: new THREE.Vector3(), wgq: new THREE.Quaternion(), tok: 0, ensureP: null, createdActor: false, blockSave: '', saving: false, tc: null, marks: null, panel: null, ui: {}, bar: null, saved: null, drag: false,
  o: { yaw: -0.6, pitch: -0.18, dist: 1.5, target: new THREE.Vector3() }, clipNames: null, tAcc: 0
};
const SK_RAD = Math.PI / 180, SK_R3 = v => Math.round(v * 1000) / 1000, SK_R2 = v => Math.round(v * 100) / 100;
const SK_RESERVED = ['__proto__', 'constructor', 'prototype'], SK_HAS = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const SK_Z = () => ({ pos: [0, 0, 0], rot: [0, 0, 0] });
const SK_TIPS = { fire: ' (tiro)', reload: ' (recarga)' };
const _skE = new THREE.Euler(), _skQ = new THREE.Quaternion(), _skQ2 = new THREE.Quaternion(), _skV = new THREE.Vector3();

/* ---------------- partida ---------------- */
function skInit() {
  SK.tc = new THREE.TransformControls(camera, renderer.domElement); SK.tc.setSize(0.8); SK.tc.visible = false; scene.add(SK.tc);
  SK.tc.addEventListener('dragging-changed', e => { SK.drag = e.value; if (e.value) skBegin(); else { skFromObject(); skEnd(); } });
  SK.tc.addEventListener('objectChange', skFromObject);
  const mk = (col, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.9 })); m.renderOrder = 997; m.frustumCulled = false; return m; };
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffa030, depthTest: false, transparent: true })); line.renderOrder = 996; line.frustumCulled = false;
  SK.marks = { lh: mk(0x40a0ff, 0.022), mz: mk(0xffa030, 0.018), line };
  SK.bar = document.createElement('div'); SK.bar.id = 'edSkBar'; SK.bar.hidden = true; document.getElementById('viewport').append(SK.bar);
  const b = document.getElementById('edSocket'); if (b) b.addEventListener('click', () => skSetOn(!SK.on));
}
const skW = () => (typeof weapons !== 'undefined' ? weapons.items[SK.wi] : null);
const skA = () => { const w = skW(); return w && typeof wAnim === 'function' ? wAnim(w) : {}; };

function skEnsure() { return SK.ensureP || (SK.ensureP = skEnsure0().finally(() => { SK.ensureP = null; })); }        // um só por vez (dois skStart concorrentes não criam dois atores)
async function skEnsure0() {
  if (typeof weaponReady !== 'undefined') await weaponReady;
  if (typeof ifpLoaded !== 'undefined') await ifpLoaded;
  if (!player.actor) {
    // cria o ator só com loadSkin/makeActor (NÃO loadPlayerOutfit: ele grava o save de carreira do jogador, economy.equipped + saveCareer)
    const want = typeof economy !== 'undefined' && PLAYER_SKINS.includes(economy.equipped) ? economy.equipped : PLAYER_SKINS[0];
    let type; try { type = await loadSkin(want); } catch (e) { type = await loadSkin(PLAYER_SKINS[0]); }
    if (!player.actor) { const a = makeActor(type); a.clips = {}; scene.add(a.group); player.actor = a; SK.createdActor = true; }
  }
  return player.actor;
}
function skSetOn(v) {
  if (v === SK.on) return;
  if (v && typeof AE !== 'undefined' && AE.on && !aeSetOn(false)) return;           // editor de animação aberto: sai dele antes (pergunta se há alterações não salvas)
  if (v) {
    edCancelPlacing(); edSelect(null); if (TT.on) ttSetOn(false); if (VB.on) vbSetOn(false); if (ED.top) edSetTop(false);
    SK.on = true; SK.ready = false; SK.loading = true; SK.createdActor = false; SK.tok++; document.body.classList.add('ed-sk'); const b = document.getElementById('edSocket'); if (b) b.classList.add('on');
    SK.saved = { fly: Object.assign({}, fly), near: camera.near, sel: weapons.selected, h: player.h, aim: weapons.aim, gripPos: weapons.gripPos, gripQ: weapons.gripQ, help: document.getElementById('edStHelp').textContent };
    edAttach(); skRender(); skStart();
  } else {
    SK.on = false; SK.loading = false; SK.ready = false; SK.tok++; SK.drag = false; SK.pend = null; document.body.classList.remove('ed-sk'); const b = document.getElementById('edSocket'); if (b) b.classList.remove('on');
    SK.tc.detach(); SK.tc.visible = false; SK.bar.hidden = true;
    for (const m of [SK.marks.lh, SK.marks.mz, SK.marks.line]) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }      // recriados na GPU sozinhos se o modo abrir de novo
    const S = SK.saved; if (S) {
      Object.assign(fly, S.fly); camera.near = S.near; camera.updateProjectionMatrix(); edCamApply(); player.h = S.h; weapons.aim = S.aim;
      const a = player.actor; if (a) { a.ap && a.ap.setOverlay(null); if (S.actor) { a.group.visible = S.actor.vis; a.group.position.copy(S.actor.pos); a.group.rotation.y = S.actor.rot; } else a.group.visible = false; }
      try { equipWeapon(-1); } catch (e) { /* sem arma */ }
      if (SK.createdActor && a) { scene.remove(a.group); try { a.mesh.skeleton.dispose(); } catch (e) { /* ignora */ } if (player.actor === a) player.actor = null; SK.createdActor = false; }       // o ator era só do editor de sockets: sai da cena
      else if (S.sel >= 0) { try { equipWeapon(S.sel); } catch (e) { /* ignora */ } }                                                                                                  // devolve a arma que estava equipada
      if (weapons.selected !== S.sel) weapons.selected = S.sel;
      if (!weapons.gripPos) { weapons.gripPos = S.gripPos; weapons.gripQ = S.gripQ; } weapons.gripKey = null;
      document.getElementById('edStHelp').textContent = S.help;
    }
    if (SK.dirty) edToast('Sockets com alterações não salvas (voltam ao reabrir o editor de sockets neste projeto, mas só vão para o arquivo ao salvar).', 4500);
    edAttach(); skRender();
  }
}
function skDropCreated() {                                              // modo fechado antes do ator ficar pronto: não deixa o ator do editor na cena
  const a = player.actor; if (!SK.on && SK.createdActor && a) { scene.remove(a.group); try { a.mesh.skeleton.dispose(); } catch (e) { /* ignora */ } player.actor = null; SK.createdActor = false; }
}
async function skStart() {
  const tok = SK.tok, live = () => SK.on && tok === SK.tok;              // um skStart por abertura: se fechou (ou fechou e reabriu) no meio, este aqui desiste
  try {
    const a = await skEnsure(); if (!live()) { skDropCreated(); return; }
    const S = SK.saved; S.actor = { vis: a.group.visible, pos: a.group.position.clone(), rot: a.group.rotation.y }; if (SK.createdActor) S.actor = null;
    // põe o personagem na frente da câmera de edição, no chão, olhando para +Z (a câmera orbital começa do lado direito dele)
    const fx = -Math.sin(fly.yaw), fz = -Math.cos(fly.yaw), x = fly.x + fx * 7, z = fly.z + fz * 7;
    a.group.visible = true; a.group.rotation.set(0, 0, 0); a.group.scale.setScalar(1); a.group.position.set(x, carGroundHeight(x, z) + a.footOffset, z); a.group.updateMatrixWorld(true);
    if (!SK.loaded) await skLoad(); if (!live()) return;
    if (!weapons.items.length) { SK.loading = false; edToast('Nenhuma arma carregada no jogo.'); skRender(); return; }
    if (camera.near > 0.05) { camera.near = 0.05; camera.updateProjectionMatrix(); }
    skEquip(SK.wi >= 0 && SK.wi < weapons.items.length ? SK.wi : 0, true);
    const o = SK.o; skHandPos(o.target); SK.loading = false; SK.ready = true; skRender(); skApplyMesh();
    document.getElementById('edStHelp').textContent = 'Botão do meio/direito gira a câmera · roda = zoom · W mover · E girar · Espaço pausa · Ctrl+Z desfaz · Esc sai';
  } catch (e) { console.error(e); if (!live()) { skDropCreated(); return; } SK.loading = false; edToast('Editor de sockets: ' + e.message, 5000); skRender(); }
}
function skHandPos(out) {
  const a = player.actor; if (!a) return out; a.group.updateMatrixWorld(true);
  const h = a.bones[a.index.rhand]; return out.setFromMatrixPosition((weapons.mesh || h).matrixWorld);
}

/* ---------------- dados ---------------- */
function skNormalize(d) {
  const out = { version: 1, weapons: {} }; if (!d || typeof d !== 'object' || !d.weapons || typeof d.weapons !== 'object') return out;
  const v3 = (a, f) => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(x => typeof x === 'number' && isFinite(x)) ? a.slice(0, 3).map(Number) : f;
  const bad = k => SK_RESERVED.includes(String(k).toLowerCase());            // ids/clipes que brigam com o protótipo do objeto
  for (const [id, e] of Object.entries(d.weapons)) {
    if (bad(id) || !e || typeof e !== 'object') continue;
    const r = { grip: { pos: v3(e.grip && e.grip.pos, [0, 0, 0]), rot: v3(e.grip && e.grip.rot, [0, 0, 0]) }, lhand: v3(e.lhand, null), muzzle: typeof e.muzzle === 'number' && e.muzzle > 0 && e.muzzle <= 5 ? e.muzzle : null, byAnim: {} };
    if (e.byAnim && typeof e.byAnim === 'object') for (const [k, o] of Object.entries(e.byAnim)) if (!bad(k) && o && typeof o === 'object') r.byAnim[k.toLowerCase()] = { pos: v3(o.pos, [0, 0, 0]), rot: v3(o.rot, [0, 0, 0]) };
    out.weapons[id] = r;
  }
  return out;
}
async function skLoad() {
  let d = null, bad = '';
  try {
    const j = await edApi('sockets');                                  // { ok, exists, invalid, erro, data } (aceita também o formato antigo: o próprio arquivo { version, weapons })
    if (j.invalid) bad = String(j.erro || 'conteúdo inválido'); else d = j.data || j.sockets || (j.weapons ? j : null);
  } catch (e) { /* sem servidor do editor: tenta o que o jogo já carregou */ }
  if (!d && !bad && typeof socketsExport === 'function') { try { if (typeof SOCKETS !== 'undefined' && SOCKETS.ready) await SOCKETS.ready; d = socketsExport(); } catch (e) { /* ignora */ } }
  SK.data = skNormalize(d); SK.savedStr = JSON.stringify(SK.data); SK.dirty = false; SK.undo = []; SK.redo = []; SK.loaded = true; SK.blockSave = bad;
  if (bad) edToast('data/sockets.json existe mas é inválido (' + bad + '). O editor abriu vazio e o Salvar vai pedir confirmação, pois sobrescreve o arquivo (a cópia anterior fica em data/.backup).', 9000);
  if (typeof socketsSet === 'function') try { socketsSet(JSON.parse(SK.savedStr)); } catch (e) { /* ignora */ }
}
function skEntry(create) {
  const w = skW(); if (!w || SK_RESERVED.includes(String(w.id).toLowerCase())) return null; let e = SK_HAS(SK.data.weapons, w.id) ? SK.data.weapons[w.id] : null;
  if (!e && create) e = SK.data.weapons[w.id] = { grip: SK_Z(), lhand: null, muzzle: null, byAnim: {} };
  if (e && !e.byAnim) e.byAnim = {}; return e;
}
function skCur() {
  const e = skEntry(false); if (!e) return SK_Z();
  if (SK.scope === 'anim' && SK_HAS(e.byAnim, SK.key)) return e.byAnim[SK.key];
  return e.grip || SK_Z();
}
function skHasOverride() { const e = skEntry(false); return !!(e && SK_HAS(e.byAnim, SK.key)); }
function skSetCur(pos, rot) {
  const e = skEntry(true), v = { pos: pos.map(SK_R3), rot: rot.map(SK_R2) };
  if (SK.scope === 'anim') e.byAnim[SK.key] = v; else e.grip = v;
}
const skLhand = () => { const e = skEntry(false), A = skA(); return (e && e.lhand) || A.lhand || null; };
const skMuzzle = () => { const e = skEntry(false), A = skA(); return e && e.muzzle !== null && e.muzzle !== undefined ? e.muzzle : (A.muzzle || 0.3); };

/* ---------------- desfazer / refazer / salvar ---------------- */
function skBegin() { if (SK.pend === null) SK.pend = JSON.stringify(SK.data); }
function skEnd() {
  if (SK.pend === null) return; const now = JSON.stringify(SK.data);
  if (now !== SK.pend) { SK.undo.push(SK.pend); if (SK.undo.length > 200) SK.undo.shift(); SK.redo.length = 0; if (typeof socketsSet === 'function') try { socketsSet(JSON.parse(now)); } catch (e) { /* ignora */ } skApplyMesh(); }
  SK.pend = null; skChanged();
}
function skChange(fn) { skBegin(); fn(); skEnd(); }
function skChanged() { SK.dirty = JSON.stringify(SK.data) !== SK.savedStr; skRefreshStatus(); }
function skRestore(str) {
  SK.data = JSON.parse(str); if (typeof socketsSet === 'function') try { socketsSet(JSON.parse(str)); } catch (e) { /* ignora */ }
  skApplyMesh(); skAttachGizmo(); skChanged(); skRefreshFields(); skRefreshBanner();
}
function skUndo() { if (SK.drag || !SK.undo.length) return; SK.redo.push(JSON.stringify(SK.data)); skRestore(SK.undo.pop()); }      // durante o arrasto do gizmo não desfaz (não comita no meio do gesto)
function skRedo() { if (SK.drag || !SK.redo.length) return; SK.undo.push(JSON.stringify(SK.data)); skRestore(SK.redo.pop()); }
function skClean() {                                              // tira do arquivo o que não muda nada
  const out = { version: 1, weapons: {} };
  for (const [id, e] of Object.entries(SK.data.weapons)) {
    const z = a => a.every(v => v === 0), r = { grip: e.grip, lhand: e.lhand || null, muzzle: e.muzzle === undefined ? null : e.muzzle, byAnim: e.byAnim || {} };
    if (z(r.grip.pos) && z(r.grip.rot) && !r.lhand && r.muzzle === null && !Object.keys(r.byAnim).length) continue; out.weapons[id] = r;
  }
  return out;
}
async function skSave() {
  if (SK.saving) return false;
  const data = skClean();
  if (typeof socketsValidate === 'function') {
    let r; try { r = socketsValidate(data); } catch (e) { r = String(e.message || e); }
    const bad = r === false || typeof r === 'string' || (Array.isArray(r) && r.length) || (r && typeof r === 'object' && (r.ok === false || (Array.isArray(r.errors) && r.errors.length)));
    if (bad) { edToast('Sockets inválidos: ' + (typeof r === 'string' ? r : Array.isArray(r) ? r.join('; ') : (r && (r.erro || r.error || (r.errors || []).join('; '))) || 'veja o console'), 6000); console.warn('socketsValidate', r); return false; }
  }
  if (SK.blockSave) {                                                    // o arquivo existente estava inválido: salvar o sobrescreve (a cópia vai para data/.backup)
    let yes = false; try { yes = confirm('O data/sockets.json atual é inválido (' + SK.blockSave + ').\nSalvar vai SUBSTITUIR esse arquivo pelo que está no editor (uma cópia do antigo fica em data/.backup/).\n\nSalvar mesmo assim?'); } catch (e) { /* sem diálogo: continua bloqueado */ }
    if (!yes) { edToast('Salvar cancelado: o sockets.json existente é inválido e não foi sobrescrito.', 5000); return false; }
    SK.blockSave = ''; skRefreshStatus();
  }
  if (!ED.api) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'sockets.json'; a.click();
    edToast('Sem o servidor do editor: sockets.json baixado.', 5000); return false;
  }
  const snap = JSON.stringify(SK.data);                                  // o que está sendo salvo AGORA: edições feitas durante a requisição continuam "não salvas"
  SK.saving = true;
  try { await edApi('save-sockets', data); SK.savedStr = snap; SK.saving = false; skChanged(); if (typeof socketsSet === 'function') socketsSet(JSON.parse(JSON.stringify(SK.data))); edToast('Sockets salvos'); return true; }
  catch (e) { SK.saving = false; edToast('Não salvou os sockets: ' + e.message, 5000); return false; }
}

/* ---------------- arma, animação e malha ---------------- */
function skEquip(i, keepClip) {
  const old = SK.wi; SK.wi = i; SK.tc.detach();
  equipWeapon(i); const w = weapons.items[i];
  if (!weapons.mesh || !w || !w.grip) { edToast('Não consegui montar a arma na mão.'); return; }
  w.grip.decompose(SK.gp, SK.gq, _skV); weapons.gripPos = SK.gp.clone(); weapons.gripQ = SK.gq.clone();
  for (const m of [SK.marks.lh, SK.marks.mz, SK.marks.line]) weapons.mesh.add(m);
  weapons.mesh.visible = true;
  const A = skA(); if (!keepClip || old !== i || !SK.clip) skSetClip(A.fire || 'IDLE_stance', true); else skSetClip(SK.clip, true);
  skApplyMesh(); skAttachGizmo(); skRefreshAll();
}
function skMode(name) {
  const A = skA(), oh = !!(A.oneHand || A.twoHand), n = name.toLowerCase();
  if (oh && A.fire && (n === A.fire.toLowerCase() || (A.reload && n === A.reload.toLowerCase()))) return 'ovfire';
  if (oh && n.startsWith('gunmove_')) return 'gunmove';
  return 'direct';
}
/* SK.key (a chave de byAnim gravada) = nome do clipe de OVERLAY quando a arma usa overlay parado (tiro/recarga de uma ou duas mãos: modo 'ovfire'), senão o clipe base (inclui GunMove_*).
   O jogo calcula a mesma chave em socketClipKey() (weapons.js) a partir de player.actor.ap (name + overlay.name). Mudou aqui, mude lá. */
function skSetClip(name, silent) {
  const a = player.actor, clip = findClip(name); if (!a || !a.ap || !clip) { if (!silent) edToast('Animação não encontrada: ' + name); return; }
  SK.clip = clip.name; SK.key = clip.name.toLowerCase(); SK.mode = skMode(SK.key); SK.t = 0; SK.dur = clip.duration; const ap = a.ap, A = skA();
  ap.prev = null;
  if (SK.mode === 'ovfire') { ap.play('IDLE_stance', { loop: true, fade: 0, restart: true }); ap.setOverlay(clip.name, UPPER_BONE_IDS); }
  else if (SK.mode === 'gunmove') { ap.play(clip.name, { loop: true, fade: 0, restart: true }); ap.setOverlay(A.fire, UPPER_BONE_IDS); ap.overlay.time = A.pose || 0; }
  else { ap.play(clip.name, { loop: true, fade: 0, restart: true }); ap.setOverlay(null); }
  ap.speed = 1; ap.fade = 1; if (!silent) { skApplyMesh(); skRefreshAll(); }
}
function skPose() {
  const a = player.actor; if (!a || !a.ap || !a.ap.cur) return; const ap = a.ap, A = skA(), t = SK.t;
  if (SK.mode === 'ovfire') { ap.time = 0; if (ap.overlay) ap.overlay.time = t; } else ap.time = t;
  ap.update(0); a.group.updateMatrixWorld(true);
  if (SK.gameArm && weapons.mesh) {                                  // o que o jogo faz por cima da pose: alinhar o braço ao cano (mirando) e a mão esquerda (IK)
    try {
      player.h = a.group.rotation.y; weapons.aim = 0; weapons.gripPos = SK.wgp.copy(SK.gp); weapons.gripQ = SK.wgq.copy(SK.gq);      // CÓPIAS: o jogo (weaponGripApply) nunca pode mutar SK.gp/SK.gq (o delta seria somado duas vezes)
      const lh = skLhand(), A2 = lh ? Object.assign({}, A, { lhand: lh }) : A, aiming = SK.mode === 'gunmove' || (SK.mode === 'ovfire' && SK.key === (A.fire || '').toLowerCase());
      if (aiming && !A.melee) alignWeaponArm(a, A2); else if (SK.mode === 'direct' && A2.twoHand && A2.lhand) leftHandIK(a, A2);
    } catch (e) { /* IK do jogo indisponível */ }
  }
  a.group.updateMatrixWorld(true);
}
/* a malha da arma = empunhadura calibrada + delta do escopo atual; marcadores no espaço da arma */
function skApplyMesh() {
  const m = weapons.mesh; if (!m || !SK.on) return; const c = skCur();
  m.position.set(SK.gp.x + c.pos[0], SK.gp.y + c.pos[1], SK.gp.z + c.pos[2]);
  _skE.set(c.rot[0] * SK_RAD, c.rot[1] * SK_RAD, c.rot[2] * SK_RAD, 'XYZ'); m.quaternion.copy(SK.gq).multiply(_skQ.setFromEuler(_skE));
  const lh = skLhand(), mz = skMuzzle(), mk = SK.marks;
  mk.lh.visible = !!lh; if (lh) mk.lh.position.set(lh[0], lh[1], lh[2]);
  mk.mz.position.set(-mz, 0.03, 0); mk.mz.visible = mk.line.visible = true;
  const P = mk.line.geometry.attributes.position.array; P[0] = 0; P[1] = 0.03; P[2] = 0; P[3] = -mz; P[4] = 0.03; P[5] = 0; mk.line.geometry.attributes.position.needsUpdate = true; mk.line.geometry.computeBoundingSphere();
}
function skFromObject() {                                                // o gizmo mexeu: grava de volta nos dados
  const m = weapons.mesh; if (!m || !SK.on) return;
  if (SK.target === 'weapon') {
    _skQ.copy(SK.gq).invert().multiply(m.quaternion); _skE.setFromQuaternion(_skQ, 'XYZ');
    skSetCur([m.position.x - SK.gp.x, m.position.y - SK.gp.y, m.position.z - SK.gp.z], [_skE.x / SK_RAD, _skE.y / SK_RAD, _skE.z / SK_RAD]);
  } else if (SK.target === 'lhand') { const e = skEntry(true), p = SK.marks.lh.position; e.lhand = [SK_R3(p.x), SK_R3(p.y), SK_R3(p.z)]; }
  else if (SK.target === 'muzzle') { const e = skEntry(true), p = SK.marks.mz.position, x = Math.max(0.02, -p.x); e.muzzle = SK_R3(x); p.set(-x, 0.03, 0); const P = SK.marks.line.geometry.attributes.position.array; P[3] = -x; SK.marks.line.geometry.attributes.position.needsUpdate = true; }
  skChanged(); skRefreshFields();
}
function skAttachGizmo() {
  const tc = SK.tc, w = weapons.mesh; if (!w) { tc.detach(); return; }
  const obj = SK.target === 'weapon' ? w : SK.target === 'lhand' ? SK.marks.lh : SK.marks.mz;
  if (SK.target === 'lhand' && !skLhand()) { tc.detach(); tc.visible = false; return; }
  tc.visible = true; tc.attach(obj);
  const rot = SK.target === 'weapon' && SK.gizmo === 'rotate';
  tc.setMode(SK.target === 'weapon' ? SK.gizmo : 'translate'); tc.setSpace(SK.target === 'weapon' ? SK.space : 'local');
  tc.showX = true; tc.showY = tc.showZ = SK.target !== 'muzzle'; if (rot) tc.showX = tc.showY = tc.showZ = true;
}

/* ---------------- laço e câmera orbital ---------------- */
function skFrame(dt) {
  if (!SK.on) return;
  if (SK.ready) {
    if (SK.playing && SK.dur > 0) SK.t = (SK.t + dt * SK.speed) % SK.dur;
    skPose();
    const m = SK.o.target, tgt = skHandPos(_skV); if (SK.follow) m.lerp(tgt, 1 - Math.exp(-dt * 14));
    if (SK.ui.time && (SK.tAcc += dt) > 0.05) { SK.tAcc = 0; skRefreshTime(); }
  }
  const o = SK.o, cp = Math.cos(o.pitch), dx = -Math.sin(o.yaw) * cp, dy = Math.sin(o.pitch), dz = -Math.cos(o.yaw) * cp;
  fly.x = o.target.x - dx * o.dist; fly.y = o.target.y - dy * o.dist; fly.z = o.target.z - dz * o.dist; fly.yaw = o.yaw; fly.pitch = o.pitch; edCamApply();
}
function skOrbit(dx, dy) { const o = SK.o; o.yaw -= dx * 0.006; o.pitch = Math.max(-1.45, Math.min(1.45, o.pitch - dy * 0.006)); }
function skZoom(dy) { const o = SK.o; o.dist = Math.max(0.25, Math.min(10, o.dist * (dy < 0 ? 1 / 1.12 : 1.12))); }

/* ---------------- teclado ---------------- */
function skKey(e) {
  const c = e.ctrlKey || e.metaKey, typing = edTyping(e);
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (typing && e.target.blur) e.target.blur(); skEnd(); skSetOn(false); return true; }
  if (c && (e.code === 'KeyZ' || e.code === 'KeyY') && SK.drag) { e.preventDefault(); e.stopImmediatePropagation(); return true; }       // arrastando o gizmo: ignora (não comita no meio do gesto)
  if (c && e.code === 'KeyZ') { e.preventDefault(); e.stopImmediatePropagation(); skEnd(); e.shiftKey ? skRedo() : skUndo(); return true; }
  if (c && e.code === 'KeyY') { e.preventDefault(); e.stopImmediatePropagation(); skEnd(); skRedo(); return true; }
  if (c && e.code === 'KeyS') { e.preventDefault(); e.stopImmediatePropagation(); skSave(); return true; }
  if (typing) return false;
  e.stopImmediatePropagation();
  const act = { KeyW: () => skSetGizmo('translate'), KeyE: () => skSetGizmo('rotate'), KeyL: () => skSetSpace(SK.space === 'local' ? 'world' : 'local'), KeyK: () => skSetOn(false), Space: () => skSetPlaying(!SK.playing),
    Digit1: () => skSetTarget('weapon'), Digit2: () => skSetTarget('lhand'), Digit3: () => skSetTarget('muzzle'), ArrowLeft: () => skStep(-1), ArrowRight: () => skStep(1) }[e.code];
  if (act) { e.preventDefault(); act(); }
  return true;
}
function skSetGizmo(g) { SK.gizmo = g; if (SK.target !== 'weapon') SK.target = 'weapon'; skAttachGizmo(); skRefreshAll(); }
function skSetSpace(s) { SK.space = s; skAttachGizmo(); skRefreshAll(); }
function skSetTarget(t) { SK.target = t; skAttachGizmo(); skRefreshAll(); }
function skSetScope(s) { SK.scope = s; skApplyMesh(); skAttachGizmo(); skRefreshAll(); }
function skSetPlaying(p) { SK.playing = p; skRefreshAll(); }
function skStep(n) { SK.playing = false; SK.t = SK.dur > 0 ? ((SK.t + n / 30) % SK.dur + SK.dur) % SK.dur : 0; skRefreshAll(); }

/* ---------------- painel ---------------- */
function skClipList() {
  if (!SK.clipNames) { const seen = new Map(); for (const id in ifpReady) for (const k in ifpReady[id].anims) if (!seen.has(k)) seen.set(k, ifpReady[id].anims[k].name); SK.clipNames = [...seen.values()].sort((a, b) => a.localeCompare(b)); }
  return SK.clipNames;
}
function skSuggested() {
  const A = skA(), out = []; const add = (n, tip) => { if (n && findClip(n) && !out.some(o => o[0].toLowerCase() === n.toLowerCase())) out.push([n, tip || '']); };
  add(A.fire, SK_TIPS.fire); add(A.reload, SK_TIPS.reload); (A.combo || []).forEach(n => add(n, ' (golpe)'));
  add('IDLE_stance', ' (parado)'); add('WALK_player', ' (andar)'); add('run_player', ' (correr)'); add('GunMove_FWD', ' (andar mirando)');
  if (A.twoHand) { add('IDLE_armed', ' (parado armado)'); add('WALK_armed'); add('run_armed'); }
  add('GunMove_BWD'); add('GunMove_L'); add('GunMove_R'); return out;
}
function skNum(label, step, get, set) {
  const inp = el('input', { type: 'number', step }), lab = el('label', { class: 'drag', title: 'Arraste para ajustar (Shift = x10)' }, label);
  inp.addEventListener('focus', skBegin); inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) { skBegin(); set(v); skApplyMesh(); skChanged(); } });
  inp.addEventListener('change', skEnd); inp.addEventListener('blur', skEnd); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  lab.addEventListener('pointerdown', e => {
    e.preventDefault(); skBegin(); const x0 = e.clientX, v0 = get(); lab.setPointerCapture(e.pointerId);
    const mv = ev => { const v = SK_R3(v0 + Math.round((ev.clientX - x0) / 4) * step * (ev.shiftKey ? 10 : 1)); set(v); inp.value = v; skApplyMesh(); skChanged(); };
    const up = () => { for (const n of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) lab.removeEventListener(n, n === 'pointermove' ? mv : up); skEnd(); };       // pointercancel/lostpointercapture também encerram o arrasto
    lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); lab.addEventListener('pointercancel', up); lab.addEventListener('lostpointercapture', up);
  });
  return { node: el('div', { class: 'ed-num' }, lab, inp), inp, get };
}
function skRender() { const box = document.getElementById('edInspector'); if (typeof renderInspector === 'function') renderInspector(); else if (box) box.textContent = ''; }
function renderSocketPanel(box) {
  if (!SK.panel) skBuildPanel();
  box.append(SK.panel); skRefreshAll();
}
function skBuildPanel() {
  const U = SK.ui = {}, P = SK.panel = el('div', { class: 'ed-sk-panel' });
  U.head = el('div', { class: 'ed-insp-head' }, el('b', {}, 'Sockets de arma'), el('small', {}, 'K liga/desliga · Esc sai'));
  U.load = el('p', { class: 'ed-hint' });
  U.scopeBox = el('div', { class: 'ed-sk-scope' }); U.warn = el('div', { class: 'ed-sk-warn' });
  U.weapon = el('select', {}); U.weapon.addEventListener('change', () => skEquip(+U.weapon.value, true));
  U.btnAll = el('button', { onclick: () => skSetScope('all') }, 'Todas as animações'); U.btnAnim = el('button', { onclick: () => skSetScope('anim') }, 'Só nesta animação');
  U.bTgt = ['weapon', 'lhand', 'muzzle'].map((k, i) => el('button', { onclick: () => skSetTarget(k), title: 'Tecla ' + (i + 1) }, ['Arma', 'Mão esq.', 'Cano'][i]));
  U.bMode = [['translate', 'Mover (W)'], ['rotate', 'Girar (E)']].map(([k, n]) => el('button', { onclick: () => skSetGizmo(k) }, n));
  U.bSpace = el('button', { onclick: () => skSetSpace(SK.space === 'local' ? 'world' : 'local'), title: 'Eixos do gizmo (L)' });
  U.fields = el('div', { class: 'ed-sk-fields' });
  U.reset = el('button', { onclick: skResetTarget }, 'Zerar'); U.drop = el('button', { class: 'danger', onclick: skDropOverride, title: 'Apaga o ajuste só desta animação (volta a valer o geral)' }, 'Remover ajuste da animação');
  U.clipName = el('div', { class: 'ed-sk-clipname' }); U.search = el('input', { type: 'search', placeholder: 'Buscar animação…', 'aria-label': 'Buscar animação' }); U.search.addEventListener('input', () => { SK.filter = U.search.value; skRefreshClips(); });
  U.clips = el('div', { class: 'ed-veg-list ed-sk-clips' });
  U.play = el('button', { onclick: () => skSetPlaying(!SK.playing), title: 'Espaço' }); U.prev = el('button', { onclick: () => skStep(-1), title: 'Quadro anterior (←)' }, '◀'); U.next = el('button', { onclick: () => skStep(1), title: 'Próximo quadro (→)' }, '▶');
  U.time = el('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0 }); U.time.addEventListener('input', () => { SK.playing = false; SK.t = +U.time.value; U.play.textContent = 'Tocar'; U.tv.textContent = SK_R2(SK.t) + ' s'; });
  U.tv = el('span', { class: 'ed-sv' }, '0 s');
  U.speed = el('select', {}, [0.1, 0.25, 0.5, 1, 1.5, 2].map(v => el('option', { value: v, selected: v === 1 }, v + '×'))); U.speed.addEventListener('change', () => { SK.speed = +U.speed.value; });
  const chk = (txt, key, tip) => { const i = el('input', { type: 'checkbox' }); i.checked = SK[key]; i.addEventListener('change', () => { SK[key] = i.checked; }); return el('label', { class: 'ed-check', title: tip }, i, txt); };
  U.undo = el('button', { onclick: () => { skEnd(); skUndo(); }, title: 'Ctrl+Z' }, 'Desfazer'); U.redo = el('button', { onclick: () => { skEnd(); skRedo(); }, title: 'Ctrl+Y' }, 'Refazer');
  U.save = el('button', { class: 'primary', onclick: skSave, title: 'Ctrl+S' }, 'Salvar sockets'); U.status = el('span', { class: 'ed-sk-status' });
  P.append(U.head, U.load, U.scopeBox, U.warn,
    el('h4', {}, 'Arma'), U.weapon,
    el('h4', {}, 'Editar em'), el('div', { class: 'ed-sk-row' }, U.btnAll, U.btnAnim),
    el('h4', {}, 'Alvo e gizmo'), el('div', { class: 'ed-sk-row' }, U.bTgt), el('div', { class: 'ed-sk-row' }, U.bMode, U.bSpace),
    U.fields, el('div', { class: 'ed-actions' }, U.reset, U.drop),
    el('h4', {}, 'Animação'), U.clipName, U.search, U.clips,
    el('h4', {}, 'Reprodução'), el('div', { class: 'ed-sk-row' }, U.prev, U.play, U.next, U.speed), el('div', { class: 'ed-slider' }, U.time, U.tv),
    el('div', { class: 'ed-checks' }, chk('Seguir a mão', 'follow', 'A câmera acompanha a mão durante a animação'), chk('Braço e mão esquerda como no jogo', 'gameArm', 'Aplica o alinhamento do braço e o IK da mão esquerda do jogo por cima da pose')),
    el('div', { class: 'ed-actions' }, U.undo, U.redo, U.save), U.status,
    el('p', { class: 'ed-hint' }, 'Arraste o gizmo na arma com a animação rodando. Botão do meio ou direito gira a câmera, roda dá zoom. 1/2/3 escolhe arma, mão esquerda ou cano. Setas avançam um quadro (pausa). Mão esquerda e cano valem para a arma toda (todas as animações).'),
    el('div', { class: 'ed-actions' }, el('button', { class: 'primary', onclick: () => skSetOn(false) }, 'Concluir')));
}
function skRefreshAll() { if (!SK.panel) return; skRefreshWeapons(); skRefreshBanner(); skRefreshClips(); skRefreshFields(); skRefreshTime(); skRefreshStatus(); }
function skRefreshWeapons() {
  const U = SK.ui; U.load.textContent = SK.loading ? 'Carregando personagem, armas e sockets…' : (!SK.ready && SK.on ? 'Nada para editar.' : ''); U.load.hidden = !U.load.textContent;
  if (U.weapon.options.length !== weapons.items.length) { U.weapon.textContent = ''; weapons.items.forEach((w, i) => U.weapon.append(el('option', { value: i }, w.name || w.id))); }
  U.weapon.value = SK.wi; U.weapon.disabled = !SK.ready;
}
function skRefreshBanner() {
  const U = SK.ui, w = skW(), has = skHasOverride(), anim = SK.scope === 'anim';
  U.btnAll.classList.toggle('on', !anim); U.btnAnim.classList.toggle('on', anim);
  U.scopeBox.className = 'ed-sk-scope ' + (anim ? 'anim' : 'all'); U.scopeBox.textContent = !SK.ready ? '' : anim ? 'SÓ NESTA ANIMAÇÃO — ' + SK.clip + (has ? '' : ' (ainda sem ajuste próprio: nasce ao editar)') : 'TODAS AS ANIMAÇÕES — empunhadura geral';
  U.warn.hidden = !(SK.ready && has && !anim); U.warn.textContent = 'Atenção: esta animação tem ajuste próprio, que ignora o geral. O que você mexer aqui não muda ' + SK.clip + '.';
  U.drop.disabled = !has; U.clipName.textContent = SK.clip ? SK.clip + ' · ' + SK_R2(SK.dur) + ' s' + (has ? ' · com ajuste' : '') : '';
  SK.bar.hidden = !SK.ready; SK.bar.className = anim ? 'anim' : '';
  SK.bar.textContent = (w ? (w.name || w.id) : '') + ' · ' + (anim ? 'só ' + SK.clip : 'todas as animações') + (has && !anim ? ' · ⚠ animação com ajuste próprio' : '') + (SK.dirty ? ' · ● não salvo' : '');
  U.bTgt.forEach((b, i) => b.classList.toggle('on', ['weapon', 'lhand', 'muzzle'][i] === SK.target));
  U.bMode.forEach((b, i) => { b.classList.toggle('on', SK.target === 'weapon' && ['translate', 'rotate'][i] === SK.gizmo); b.disabled = SK.target !== 'weapon'; });
  U.bSpace.textContent = 'Eixos: ' + (SK.space === 'local' ? 'da arma' : 'do mundo'); U.bSpace.disabled = SK.target !== 'weapon';
  U.undo.disabled = !SK.undo.length; U.redo.disabled = !SK.redo.length;
}
function skRefreshClips() {
  const U = SK.ui, q = SK.filter.trim().toLowerCase(), list = U.clips; list.textContent = '';
  const item = (n, tip) => { const b = el('button', { class: 'ed-sk-clip' + (n.toLowerCase() === SK.key ? ' on' : ''), onclick: () => skSetClip(n) }, n, el('small', {}, tip || ''));
    if (SK.ready && skEntry(false) && SK_HAS(skEntry(false).byAnim, n.toLowerCase())) b.append(el('i', { title: 'tem ajuste próprio' }, '●')); return b; };
  if (!q) { list.append(el('div', { class: 'ed-sk-sec' }, 'Sugeridas para esta arma')); skSuggested().forEach(([n, t]) => list.append(item(n, t))); list.append(el('div', { class: 'ed-sk-sec' }, 'Digite acima para buscar entre as ' + skClipList().length + ' animações.')); return; }
  const found = skClipList().filter(n => n.toLowerCase().includes(q)); found.slice(0, 120).forEach(n => list.append(item(n)));
  if (!found.length) list.append(el('div', { class: 'ed-sk-sec' }, 'Nenhuma animação com esse nome.')); else if (found.length > 120) list.append(el('div', { class: 'ed-sk-sec' }, '+' + (found.length - 120) + ' — refine a busca.'));
}
function skRefreshFields() {
  const U = SK.ui; if (!SK.ready) { U.fields.textContent = ''; U.fields._k = ''; return; }
  const key = SK.target + '|' + (SK.target === 'lhand' ? !!skLhand() : ''), has = skLhand();
  if (U.fields._k !== key) {                                       // estrutura nova
    U.fields._k = key; U.fields.textContent = ''; U.nums = [];
    const c = () => skCur(), add = (title, defs) => { const row = el('div', { class: 'ed-vec' }); defs.forEach(d => { const n = skNum(d[0], d[1], d[2], d[3]); U.nums.push(n); row.append(n.node); }); U.fields.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, title), row)); };
    if (SK.target === 'weapon') {
      const set = (k, i) => v => { const cu = c(), p = cu.pos.slice(), r = cu.rot.slice(); (k ? r : p)[i] = v; skSetCur(p, r); };
      add('Posição (m)', ['X', 'Y', 'Z'].map((n, i) => [n, 0.005, () => c().pos[i], set(0, i)]));
      add('Rotação (°)', ['RX', 'RY', 'RZ'].map((n, i) => [n, 0.5, () => c().rot[i], set(1, i)]));
    } else if (SK.target === 'lhand') {
      if (!has) { U.fields.append(el('p', { class: 'ed-hint' }, 'Esta arma não tem ponto de mão esquerda (uma mão só).'), el('button', { onclick: () => { skChange(() => { skEntry(true).lhand = [SK_R3(-skMuzzle() * 0.36), -0.08, 0.02]; }); skApplyMesh(); skAttachGizmo(); skRefreshAll(); } }, 'Adicionar mão esquerda')); }
      else add('Mão esq. (m)', ['X', 'Y', 'Z'].map((n, i) => [n, 0.005, () => skLhand()[i], v => { const e = skEntry(true), l = (e.lhand || skLhand()).slice(); l[i] = SK_R3(v); e.lhand = l; }]));
    } else {
      U.fields.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Cano (m)'), (() => { const n = skNum('C', 0.005, () => skMuzzle(), v => { skEntry(true).muzzle = Math.max(0.02, SK_R3(v)); }); U.nums.push(n); return n.node; })()));
      U.fields.append(el('p', { class: 'ed-hint' }, 'Distância da origem da arma até a boca do cano (eixo -X do modelo): de onde saem o tiro e o clarão.'));
    }
  }
  for (const n of U.nums || []) if (document.activeElement !== n.inp) n.inp.value = SK_R3(n.get());
  U.reset.textContent = SK.target === 'weapon' ? 'Zerar' : 'Restaurar padrão';
}
function skRefreshTime() {
  const U = SK.ui; if (!U.time) return; U.play.textContent = SK.playing ? 'Pausar' : 'Tocar'; U.time.max = SK.dur || 1; U.time.disabled = !(SK.dur > 0);
  if (document.activeElement !== U.time) U.time.value = SK.t; U.tv.textContent = SK_R2(SK.t) + ' / ' + SK_R2(SK.dur) + ' s';
}
function skRefreshStatus() {
  const U = SK.ui; if (!U.status) return; U.status.textContent = SK.blockSave ? '⚠ sockets.json inválido: salvar pede confirmação' : SK.dirty ? '● Alterações não salvas' : 'Tudo salvo'; U.status.className = 'ed-sk-status' + (SK.dirty || SK.blockSave ? ' dirty' : '');
  const b = document.getElementById('edSocket'); if (b) b.classList.toggle('dirty', SK.dirty);
  U.undo.disabled = !SK.undo.length; U.redo.disabled = !SK.redo.length; if (SK.on) skRefreshBannerText();
}
function skRefreshBannerText() { const w = skW(); if (!w || !SK.ready) return; const anim = SK.scope === 'anim', has = skHasOverride(); SK.bar.textContent = (w.name || w.id) + ' · ' + (anim ? 'só ' + SK.clip : 'todas as animações') + (has && !anim ? ' · ⚠ animação com ajuste próprio' : '') + (SK.dirty ? ' · ● não salvo' : ''); }
function skResetTarget() {
  skChange(() => {
    if (SK.target === 'weapon') skSetCur([0, 0, 0], [0, 0, 0]);
    else { const e = skEntry(false); if (e) { if (SK.target === 'lhand') e.lhand = null; else e.muzzle = null; } }
  });
  skApplyMesh(); skAttachGizmo(); skRefreshAll();
}
function skDropOverride() { const e = skEntry(false); if (!e || !SK_HAS(e.byAnim, SK.key)) return; skChange(() => { delete e.byAnim[SK.key]; }); skApplyMesh(); skRefreshAll(); }
