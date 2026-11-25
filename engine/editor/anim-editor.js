/* NEON ENGINE — editor de animação (esqueleto inteiro, linha do tempo tipo dopesheet, IK de mãos/pés, clipes editáveis em data/anims/<id>.json).
   Edita o clipe JSON descrito em engine/docs/animacao.md: a rotação/posição de cada osso fica no espaço de OSSO DO JOGO (o mesmo que AnimPlayer grava em bone.quaternion / bone.position;
   "rot" substitui a rotação de repouso do osso, não é delta). O preview usa o ator do jogo e o próprio AnimPlayer (o clipe editado é registrado ao vivo com animEditSet a cada mudança).
   Prefixo AE/ae em tudo (escopo global compartilhado com o resto do editor). Padrão de modo copiado de socket-tool.js (câmera orbital, TransformControls, desfazer, Ctrl+S, restauração ao sair). */
'use strict';
const AE = {
  on: false, loading: false, ready: false, tok: 0, saving: false, doc: null, savedStr: '', dirty: false, undo: [], redo: [], pend: null, syncDirty: false, err: '', preview: null,
  anims: [], ifp: [], edited: [], ifpMap: {}, listLoaded: false, filter: '', onlyEdited: false, pick: null, notice: {}, apiOk: true,
  sel: -1, selKeys: new Set(), t: 0, playing: true, speed: 1, loopPlay: true, autoKey: true, snap: true, sym: false, gizmo: 'rotate', space: 'world', target: 'bone', ikSel: 'lhand',
  compose: 'none', baseName: 'IDLE_stance', topName: '', gameArm: true, wi: -1, skin: '', showSkel: true, hideMesh: false, scope: 'bone', pasteMirror: false, smooth: 0.5, clip: null,
  tc: null, skel: null, ikMarker: null, drag: false, o: { yaw: -0.6, pitch: -0.12, dist: 3.2, target: new THREE.Vector3() }, saved: null, createdActor: null, origActor: null, actorTok: 0,
  tl: { x0: 0, pps: 200, sy: 0, onlyKeys: true, coll: new Set(['fingL', 'fingR']), rows: [], dirty: true, drag: null, w: 0, h: 0, lw: 176 }, collapsed: new Set(), ui: {}, panel: null, left: null, bar: null, acc: 0, tAcc: 0, ikErr: {}, apKey: '', actor: null, mirIdx: null, groups: null
};
const AE_RAD = Math.PI / 180, AE_R6 = v => Math.round(v * 1e6) / 1e6, AE_R4 = v => Math.round(v * 1e4) / 1e4, AE_R2 = v => Math.round(v * 100) / 100, AE_EPS = 0.002;
const AE_HAS = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const AE_GROUPS = [['body', 'Corpo'], ['head', 'Cabeça'], ['armL', 'Braço E'], ['armR', 'Braço D'], ['fingL', 'Dedos E'], ['fingR', 'Dedos D'], ['legL', 'Perna E'], ['legR', 'Perna D']];
const AE_CHAINS = { lhand: ['lupperarm', 'lforearm', 'lhand'], rhand: ['rupperarm', 'rforearm', 'rhand'], lfoot: ['lthigh', 'lcalf', 'lfoot'], rfoot: ['rthigh', 'rcalf', 'rfoot'] };
const AE_CH_PT = { lhand: 'mão esquerda', rhand: 'mão direita', lfoot: 'pé esquerdo', rfoot: 'pé direito' };
const AE_PT = { root: 'Raiz', pelvis: 'Pélvis', spine: 'Coluna', spine1: 'Tórax', neck: 'Pescoço', head: 'Cabeça', brow: 'Sobrancelha', jaw: 'Mandíbula', clav: 'Clavícula', upperarm: 'Braço', forearm: 'Antebraço', hand: 'Mão', finger: 'Dedo',
  thumb: 'Polegar', index: 'Indicador', middle: 'Médio', ring: 'Anelar', pinky: 'Mindinho', thigh: 'Coxa', calf: 'Panturrilha', foot: 'Pé', toe: 'Ponta do pé', belly: 'Barriga', breast: 'Peito' };
const _aeQ = new THREE.Quaternion(), _aeQ2 = new THREE.Quaternion(), _aeQ3 = new THREE.Quaternion(), _aeE = new THREE.Euler(), _aeV = new THREE.Vector3(), _aeV2 = new THREE.Vector3(), _aeM = new THREE.Matrix4(), _aeM2 = new THREE.Matrix4(), _aeOne = new THREE.Vector3(1, 1, 1);

/* ---------------- ator, ossos, nomes ---------------- */
const aeA = () => (AE.on ? AE.actor : null);
function aeLabel(name) {
  name = name.replace('_', '').toLowerCase(); const m = /^([lr])(.*)$/.exec(name); let side = '', base = name;
  if (m && AE_PT[m[2].replace(/\d+$/, '')]) { side = m[1] === 'l' ? ' E' : ' D'; base = m[2]; }
  const num = /(\d+)$/.exec(base), core = base.replace(/\d+$/, '');
  return (AE_PT[core] || core) + (num ? ' ' + num[1] : '') + side;
}
function aeBoneGroups(a) {                                   // grupo de cada osso, calculado pela hierarquia (dedos novos entram sozinhos em "Dedos E/D")
  const names = a.info.map(b => b.name), out = [];
  for (let i = 0; i < names.length; i++) {
    const ch = []; for (let k = i, n = 0; k >= 0 && n < 64; k = a.info[k].parent, n++) ch.push(names[k]);
    out.push(ch.includes('lhand') && names[i] !== 'lhand' ? 'fingL' : ch.includes('rhand') && names[i] !== 'rhand' ? 'fingR' : ch.includes('lclav') ? 'armL' : ch.includes('rclav') ? 'armR'
      : ch.includes('lthigh') ? 'legL' : ch.includes('rthigh') ? 'legR' : ch.includes('neck') ? 'head' : 'body');
  }
  return out;
}
function aeMirrorIdx(a) {                                    // osso espelho (l<->r); osso central espelha a si mesmo
  return a.info.map((b, i) => { const n = b.name, m = /^([lrLR])(.+)$/.exec(n); if (!m) return i; const o = ({ l: 'r', r: 'l', L: 'R', R: 'L' })[m[1]] + m[2]; return AE_HAS(a.index, o) ? a.index[o] : i; });
}
const aeBid = i => { const a = aeA(); return a && a.info[i] ? a.info[i].id : -1; };
const aeIdx = bid => { const a = aeA(); return a && a.ap && a.ap.idToIdx[bid] !== undefined ? a.ap.idToIdx[bid] : -1; };
function aeScopeIdx(scope) {                                 // ossos de cada escopo de copiar/colar
  const a = aeA(); if (!a) return []; const g = AE.groups, all = a.info.map((b, i) => i);
  if (scope === 'bone') return AE.sel >= 0 ? [AE.sel] : [];
  if (scope === 'armL') return all.filter(i => g[i] === 'armL' || g[i] === 'fingL'); if (scope === 'armR') return all.filter(i => g[i] === 'armR' || g[i] === 'fingR');
  if (scope === 'legs') return all.filter(i => g[i] === 'legL' || g[i] === 'legR'); if (scope === 'head') return all.filter(i => g[i] === 'head');
  return all;
}

/* ---------------- trilhas ---------------- */
function aeSampleTr(tr, t, n) {                              // igual ao runtime: slerp (com correção de sinal) na rotação, linear na posição
  let i = 0; while (i < tr.length - 1 && tr[i + 1][0] <= t) i++;
  const j = Math.min(i + 1, tr.length - 1), span = tr[j][0] - tr[i][0], k = span > 1e-9 ? Math.min(1, Math.max(0, (t - tr[i][0]) / span)) : 0, a = tr[i], b = tr[j];
  if (n === 4) { _aeQ.set(a[1], a[2], a[3], a[4]); _aeQ2.set(b[1], b[2], b[3], b[4]); if (_aeQ.dot(_aeQ2) < 0) _aeQ2.set(-b[1], -b[2], -b[3], -b[4]); return _aeQ.slerp(_aeQ2, k); }
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}
const aeKeyIdx = (tr, t, eps) => { if (!tr) return -1; for (let i = 0; i < tr.length; i++) if (Math.abs(tr[i][0] - t) <= (eps === undefined ? AE_EPS : eps)) return i; return -1; };
function aeInsert(tr, key) {                                 // insere/substitui mantendo a ordem (tempo existente dentro de AE_EPS é substituído)
  const i = aeKeyIdx(tr, key[0]); if (i >= 0) { key[0] = tr[i][0]; tr[i] = key; return; }
  let k = 0; while (k < tr.length && tr[k][0] < key[0]) k++; tr.splice(k, 0, key);
}
function aeHasBoneKeys(doc, bid) { return !!(doc && AE_HAS(doc.bones, String(bid))); }
function aeEnsureBone(bid, t) {                              // cria a trilha do osso (com a pose de repouso em t=0) se ainda não existe
  const doc = AE.doc, id = String(bid); if (AE_HAS(doc.bones, id)) return doc.bones[id];
  if (Object.keys(doc.bones).length >= 64) { edToast('O clipe já tem 64 ossos (limite do formato).', 3500); return null; }
  const i = aeIdx(bid), a = aeA(), rq = i >= 0 ? a.ap.restQ[i] : _aeQ3.set(0, 0, 0, 1), b = doc.bones[id] = { rot: [] };
  if (t > AE_EPS) b.rot.push([0, AE_R6(rq.x), AE_R6(rq.y), AE_R6(rq.z), AE_R6(rq.w)]); return b;
}
function aeSetRot(bid, t, q) {
  const b = aeEnsureBone(bid, t); if (!b) return false; t = AE_R6(Math.max(0, Math.min(AE.doc.duration, t)));
  _aeQ3.copy(q).normalize(); const i = aeKeyIdx(b.rot, t), ref = i > 0 ? b.rot[i - 1] : (i < 0 ? b.rot.filter(k => k[0] < t).pop() : null);
  if (ref && ref[1] * _aeQ3.x + ref[2] * _aeQ3.y + ref[3] * _aeQ3.z + ref[4] * _aeQ3.w < 0) _aeQ3.set(-_aeQ3.x, -_aeQ3.y, -_aeQ3.z, -_aeQ3.w);   // mesmo hemisfério do quadro anterior (visual igual, números contínuos)
  aeInsert(b.rot, [t, AE_R6(_aeQ3.x), AE_R6(_aeQ3.y), AE_R6(_aeQ3.z), AE_R6(_aeQ3.w)]); return true;
}
function aeSetPos(bid, t, p) {
  const b = aeEnsureBone(bid, t); if (!b) return false; t = AE_R6(Math.max(0, Math.min(AE.doc.duration, t)));
  if (!b.pos) { b.pos = []; const i = aeIdx(bid), rp = i >= 0 ? aeA().ap.restP[i] : _aeV.set(0, 0, 0); if (t > AE_EPS) b.pos.push([0, AE_R6(rp.x), AE_R6(rp.y), AE_R6(rp.z)]); }
  aeInsert(b.pos, [t, AE_R6(p[0]), AE_R6(p[1]), AE_R6(p[2])]); return true;
}
function aeDelKeyAt(bid, t, rotToo, posToo) {
  const b = AE.doc.bones[String(bid)]; if (!b) return;
  if (rotToo) { const i = aeKeyIdx(b.rot, t); if (i >= 0) b.rot.splice(i, 1); }
  if (posToo && b.pos) { const i = aeKeyIdx(b.pos, t); if (i >= 0) b.pos.splice(i, 1); if (!b.pos.length) delete b.pos; }
  if (!b.rot.length) delete AE.doc.bones[String(bid)];
}
function aeBoneQ(i, t, out) {                                // valor guardado do osso em t (o clipe); osso fora do clipe: o que está na tela agora
  const a = aeA(), bid = aeBid(i), b = AE.doc && AE.doc.bones[String(bid)];
  if (b) return out.copy(aeSampleTr(b.rot, t, 4)); return out.copy(a.bones[i].quaternion);
}
function aeBoneP(i, t) { const a = aeA(), b = AE.doc && AE.doc.bones[String(aeBid(i))]; if (b && b.pos) return aeSampleTr(b.pos, t, 3); const p = a.bones[i].position; return [p.x, p.y, p.z]; }
function aeLocalPose(t) {                                    // quaternios locais de TODOS os ossos do ator no tempo t (do clipe; fora dele, o que está na tela)
  const a = aeA(); return a.bones.map((b, i) => aeBoneQ(i, t, new THREE.Quaternion()));
}

/* espelho L<->R pelo mundo: D = deformação do osso em relação ao repouso (mundo); D' = S·D(espelho)·S com S = (x,-y,-z,w); local' = mundo'(pai)^-1 · mundo'. Não depende de como os eixos locais dos ossos foram desenhados. */
function aeMirrorPose(P) {
  const a = aeA(), n = a.bones.length, M = AE.mirIdx, W = [], D = [], Wm = [], out = [];
  for (let i = 0; i < n; i++) { const p = a.info[i].parent; W[i] = (p >= 0 ? W[p].clone().multiply(P[i]) : P[i].clone()); D[i] = W[i].clone().multiply(a.restW[i].clone().invert()); }
  for (let i = 0; i < n; i++) {
    const d = D[M[i]]; _aeQ.set(d.x, -d.y, -d.z, d.w); Wm[i] = _aeQ.clone().multiply(a.restW[i]);
    const p = a.info[i].parent; out[i] = p >= 0 ? Wm[p].clone().invert().multiply(Wm[i]) : Wm[i].clone();
  }
  return out;
}

/* ---------------- desfazer / refazer / mudanças ---------------- */
function aeBegin() { if (AE.pend === null && AE.doc) AE.pend = JSON.stringify(AE.doc); }
const AE_HIST_BYTES = 64 * 1024 * 1024, AE_HIST_MIN = 20;       // histórico limitado por tamanho total (descarta os mais antigos), sempre guardando pelo menos 20 níveis
function aeTrimHist() {
  let tot = 0; for (const s of AE.undo) tot += s.length; for (const s of AE.redo) tot += s.length;
  while (AE.undo.length > 200 || (tot > AE_HIST_BYTES && AE.undo.length > AE_HIST_MIN)) tot -= AE.undo.shift().length;
  while (tot > AE_HIST_BYTES && AE.redo.length > AE_HIST_MIN) tot -= AE.redo.shift().length;
}
function aeEnd() {
  if (AE.pend === null) return; const now = JSON.stringify(AE.doc);
  if (now !== AE.pend) { AE.undo.push(AE.pend); AE.redo.length = 0; aeTrimHist(); AE.syncDirty = true; }
  AE.pend = null; aeChanged(); aeRefreshAll();
}
function aeChange(fn) { if (!AE.doc) { edToast('Escolha ou duplique um clipe editável primeiro.', 2500); return false; } aeBegin(); let r; try { r = fn(); } catch (e) { console.error(e); edToast('Erro: ' + e.message, 4000); } aeEnd(); return r === undefined ? true : r; }
function aeChanged() { AE.dirty = !!AE.doc && JSON.stringify(AE.doc) !== AE.savedStr; aeRefreshStatus(); }
function aeRestore(str) { AE.doc = JSON.parse(str); AE.syncDirty = true; AE.selKeys.clear(); aeChanged(); aeRefreshAll(); }
function aeUndo() { if (AE.drag || !AE.undo.length) return; AE.redo.push(JSON.stringify(AE.doc)); aeTrimHist(); aeRestore(AE.undo.pop()); }
function aeRedo() { if (AE.drag || !AE.redo.length) return; AE.undo.push(JSON.stringify(AE.doc)); aeTrimHist(); aeRestore(AE.redo.pop()); }
function aeSync() {                                          // registra o clipe editado no jogo (ao vivo): o AnimPlayer passa a tocar a versão nova
  if (!AE.syncDirty || !AE.doc) return; AE.syncDirty = false;
  const r = typeof animEditSet === 'function' ? animEditSet(AE.doc) : { ok: false, erro: 'anim-edit.js não carregado' };
  AE.err = r.ok ? '' : String(r.erro); if (AE.ui.err) { AE.ui.err.textContent = AE.err ? '⚠ ' + AE.err : ''; AE.ui.err.hidden = !AE.err; }
}

/* ---------------- pose no ator ---------------- */
const AE_TOP_IDS = () => (typeof UPPER_BONE_IDS !== 'undefined' ? UPPER_BONE_IDS : [2, 3, 4, 5, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36]);
const aeW = () => (typeof weapons !== 'undefined' && AE.wi >= 0 ? weapons.items[AE.wi] : null);
const aeWA = () => { const w = aeW(); return w && typeof wAnim === 'function' ? wAnim(w) : {}; };
function aePoseAt(t, noGame) {                               // pose completa do ator no tempo t (clipe + composição + IK do clipe + (opcional) o que o jogo faz por cima do braço)
  const a = aeA(); if (!a || !a.ap) return; const ap = a.ap, name = AE.doc ? AE.doc.id : (AE.preview ? AE.preview.name : '');
  if (!name || !findClip(name)) return;
  const A = aeWA(), key = [name, AE.compose, AE.baseName, AE.topName, AE.doc ? 1 : 0].join('|');
  for (let i = 0; i < a.bones.length; i++) { a.bones[i].quaternion.copy(ap.restQ[i]); a.bones[i].position.copy(ap.restP[i]); }       // sem restos de outro clipe: osso fora do clipe = repouso
  const dur = findClip(name).duration, tt = Math.max(0, Math.min(t, dur)), comp = AE.doc ? AE.compose : 'none';
  if (key !== AE.apKey || !ap.cur) { AE.apKey = key; ap.prev = null; ap.setOverlay(null); ap.play(comp === 'under' && findClip(AE.baseName) ? AE.baseName : name, { loop: false, fade: 0, restart: true }); ap.speed = 1; ap.fade = 1; }
  ap.loop = false; ap.speed = 1; ap.fade = 1; ap.fadeT = 0; ap.prev = null;
  if (comp === 'under' && findClip(AE.baseName)) { const bd = findClip(AE.baseName).duration || 1; ap.time = bd > 0 ? tt % bd : 0; ap.setOverlay(name, Object.keys(AE.doc.bones).map(Number)); ap.overlay.time = tt; }
  else if (comp === 'over' && AE.topName && findClip(AE.topName)) { ap.time = tt; ap.setOverlay(AE.topName, AE_TOP_IDS()); ap.overlay.time = Math.min((A && A.pose) || 0, findClip(AE.topName).duration); }
  else { ap.time = tt; ap.setOverlay(null); }
  a.group.updateMatrixWorld(true); ap.update(0); a.group.updateMatrixWorld(true);
  const dc = AE.doc ? findClip(name) : null;
  if (dc && comp === 'under' && dc.ik && dc.ik.length && typeof animIkApply === 'function') { animIkApply(a, dc, tt); a._ikLast = { clip: dc, t: tt }; }       // sobre uma base o gancho do AnimPlayer olha o clipe da base: aplica o IK do clipe editado à mão
  if (typeof weapons !== 'undefined' && weapons.mesh && aeW() && typeof weaponGripApply === 'function') { try { weaponGripApply(aeW(), typeof socketClipKey === 'function' ? socketClipKey(ap) : ''); } catch (e) { /* ignora */ } }
  if (AE.gameArm && !noGame && weapons.mesh && A) {          // o que o jogo faz por cima da pose: alinhar o braço ao cano (mirando) e a mão esquerda
    try {
      player.h = a.group.rotation.y; weapons.aim = 0; const id = name.toLowerCase(), aiming = id.startsWith('gunmove_') || (comp === 'over' && AE.topName && AE.topName.toLowerCase() === (A.fire || '').toLowerCase());
      if (aiming && !A.melee && (A.oneHand || A.twoHand)) alignWeaponArm(a, A); else if (A.twoHand && A.lhand) leftHandIK(a, A);
      if (typeof animIkFinal === 'function') animIkFinal(a);
    } catch (e) { /* IK do jogo indisponível */ }
  }
  a.group.updateMatrixWorld(true);
}

/* ---------------- partida e saída do modo ---------------- */
function aeInit() {
  AE.tc = new THREE.TransformControls(camera, renderer.domElement); AE.tc.setSize(0.55); AE.tc.visible = false; scene.add(AE.tc);
  AE.tc.addEventListener('dragging-changed', e => { AE.drag = e.value; if (e.value) { AE.playing = false; aeBegin(); aeRefreshTransport(); } else { aeEnd(); } });
  AE.tc.addEventListener('objectChange', aeFromGizmo);
  AE.bar = document.createElement('div'); AE.bar.id = 'edAeBar'; AE.bar.hidden = true; document.getElementById('viewport').append(AE.bar);
  const b = document.getElementById('edAnim'); if (b) b.addEventListener('click', () => aeSetOn(!AE.on));
  window.addEventListener('beforeunload', e => { if (AE.on && AE.dirty) { e.preventDefault(); e.returnValue = ''; } });
}
function aeConfirmDiscard(msg) {
  if (!AE.dirty) return true; let yes = false;
  try { yes = confirm(msg || 'O clipe tem alterações não salvas.\nDescartar e continuar?'); } catch (e) { yes = false; }
  return yes;
}
function aeAsk(msg) { let yes = false; try { yes = confirm(msg); } catch (e) { yes = false; } return yes; }
AE.replOk = new Set();                                       // ids cuja substituição de .ifp já foi confirmada nesta sessão
function aeSetOn(v, force) {                                 // devolve true se o modo ficou como pedido (false = o usuário cancelou a saída)
  if (v === AE.on) return true;
  if (v) {
    edCancelPlacing(); edSelect(null); if (TT.on) ttSetOn(false); if (VB.on) vbSetOn(false); if (SK.on) skSetOn(false); if (ED.top) edSetTop(false);
    AE.on = true; AE.ready = false; AE.loading = true; AE.tok++; document.body.classList.add('ed-ae'); const b = document.getElementById('edAnim'); if (b) b.classList.add('on');
    AE.saved = { fly: Object.assign({}, fly), near: camera.near, sel: typeof weapons !== 'undefined' ? weapons.selected : -1, h: player.h, aim: typeof weapons !== 'undefined' ? weapons.aim : 0, gripPos: weapons.gripPos, gripQ: weapons.gripQ,
      help: document.getElementById('edStHelp').textContent, orig: player.actor, origVis: player.actor ? player.actor.group.visible : false };
    aeMountLeft(); aeRender(); aeStart(); aeResizeTl(); return true;
  }
  if (!force && !aeConfirmDiscard('O clipe "' + (AE.doc ? AE.doc.id : '') + '" tem alterações não salvas.\nSair do editor de animação e descartá-las?')) return false;
  AE.on = false; AE.loading = false; AE.ready = false; AE.tok++; AE.drag = false; AE.pend = null; AE.playing = false; document.body.classList.remove('ed-ae'); const b = document.getElementById('edAnim'); if (b) { b.classList.remove('on'); b.classList.remove('dirty'); }
  AE.tc.detach(); AE.tc.visible = false; AE.bar.hidden = true; aeDropHelpers();
  const S = AE.saved; if (S) {
    Object.assign(fly, S.fly); camera.near = S.near; camera.updateProjectionMatrix(); edCamApply(); player.h = S.h; weapons.aim = S.aim;
    try { equipWeapon(-1); } catch (e) { /* sem arma */ }
    const mine = AE.actor; AE.actor = null; if (mine && mine !== S.orig) { scene.remove(mine.group); try { mine.mesh.skeleton.dispose(); } catch (e) { /* ignora */ } }
    player.actor = S.orig || null; if (S.orig) { S.orig.group.visible = S.origVis; if (S.orig.ap) { S.orig.ap.setOverlay(null); S.orig.ap.prev = null; } }
    if (S.sel >= 0) { try { equipWeapon(S.sel); } catch (e) { /* ignora */ } }
    if (weapons.selected !== S.sel) weapons.selected = S.sel; if (!weapons.gripPos) { weapons.gripPos = S.gripPos; weapons.gripQ = S.gripQ; } weapons.gripKey = null;
    document.getElementById('edStHelp').textContent = S.help;
  }
  AE.doc = null; AE.preview = null; AE.undo = []; AE.redo = []; AE.dirty = false; AE.savedStr = ''; AE.selKeys.clear(); AE.sel = -1; AE.apKey = ''; AE.wi = -1;
  if (typeof animEditReload === 'function') animEditReload().catch(() => { });          // volta o jogo ao que está no disco (descarta o clipe ao vivo)
  if (AE.left && AE.left.parentNode) AE.left.parentNode.removeChild(AE.left);
  edAttach(); aeRender(); return true;
}
function aeDropHelpers() {
  if (AE.skel) { if (AE.skel.floor) { scene.remove(AE.skel.floor); AE.skel.floor.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } scene.remove(AE.skel.group); AE.skel.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); AE.skel = null; }
  if (AE.ikMarker) { scene.remove(AE.ikMarker); AE.ikMarker.geometry.dispose(); AE.ikMarker.material.dispose(); AE.ikMarker = null; }
}
async function aeBuildActor(skin) {                          // ator só do editor: loadSkin + makeActor (NÃO loadPlayerOutfit: ele grava o save de carreira)
  if (typeof weaponReady !== 'undefined') await weaponReady; if (typeof ifpLoaded !== 'undefined') await ifpLoaded;
  let type; try { type = await loadSkin(skin); } catch (e) { type = await loadSkin(PLAYER_SKINS[0]); }
  const a = makeActor(type); a.clips = {};
  if (typeof rigExtendActor === 'function' && !a.rig) { try { await rigExtendActor(a); } catch (e) { /* sem rig de dedos: segue com 32 ossos */ } }       // dedos (rig-extend.js): 62 ossos, listados dinamicamente
  return a;
}
async function aeStart() {
  const tok = AE.tok, live = () => AE.on && tok === AE.tok;
  try {
    const want = AE.skin || (typeof economy !== 'undefined' && PLAYER_SKINS.includes(economy.equipped) ? economy.equipped : PLAYER_SKINS[0]); AE.skin = want;
    const a = await aeBuildActor(want); if (!live()) { try { a.mesh.skeleton.dispose(); } catch (e) { /* ignora */ } return; }
    if (AE.saved.orig) AE.saved.orig.group.visible = false;
    const fx = -Math.sin(fly.yaw), fz = -Math.cos(fly.yaw), x = fly.x + fx * 6, z = fly.z + fz * 6;
    a.group.rotation.set(0, 0, 0); a.group.position.set(x, Math.max(carGroundHeight(x, z), 0) + 400 + a.footOffset, z); scene.add(a.group); player.actor = AE.actor = a; a.group.updateMatrixWorld(true);
    AE.groups = aeBoneGroups(a); AE.mirIdx = aeMirrorIdx(a); AE.nBones = a.bones.length; AE.collapsed = new Set(); aeCollapseHands(a); AE.sel = -1; AE.apKey = ''; aeBuildSkel(a);
    if (camera.near > 0.05) { camera.near = 0.05; camera.updateProjectionMatrix(); }
    await aeLoadLists(); if (!live()) return;
    if (!AE.preview && !AE.doc) AE.preview = { name: 'IDLE_stance' };
    AE.o.target.copy(aeBodyCenter()); AE.loading = false; AE.ready = true; AE.t = 0; AE.playing = true;
    if (AE.wi >= 0) aeEquip(AE.wi); aeRender(); aeRefreshAll(); AE.tl.dirty = true;
    document.getElementById('edStHelp').textContent = 'Botão do meio/direito (ou arrastar no vazio) gira a câmera · roda = zoom · clique numa articulação seleciona · E gira · W move · Espaço toca · I insere quadro · Ctrl+S salva · Esc sai';
  } catch (e) { console.error(e); if (!live()) return; AE.loading = false; edToast('Editor de animação: ' + e.message, 5000); aeRefreshAll(); }
}
function aeCollapseHands(a) { for (const n of ['lhand', 'rhand']) if (AE_HAS(a.index, n) && a.info.some(b => b.parent === a.index[n])) AE.collapsed.add(a.index[n]); }
function aeRigSync() {                                       // o rig de dedos carrega depois do ator: recalcula grupos/espelho/esqueleto de ajuda e recria as listas
  const a = aeA(); if (!a) return; AE.groups = aeBoneGroups(a); AE.mirIdx = aeMirrorIdx(a); AE.nBones = a.bones.length; AE.collapsed = new Set(); aeCollapseHands(a); AE.apKey = '';
  aeDropHelpers(); aeBuildSkel(a); aeAttachGizmo(); aeRefreshAll();
}
function aeBodyCenter() { const a = aeA(); const b = a && a.bones[a.index.spine1 !== undefined ? a.index.spine1 : 0]; return b ? _aeV.setFromMatrixPosition(b.matrixWorld).clone() : new THREE.Vector3(); }
async function aeSetSkin(id) {
  if (!AE.on || !AE.ready) return; const old = AE.actor, tok = AE.tok; AE.skin = id;
  const a = await aeBuildActor(id); if (!AE.on || tok !== AE.tok) { try { a.mesh.skeleton.dispose(); } catch (e) { /* ignora */ } return; }
  a.group.position.copy(old.group.position); a.group.position.y += a.footOffset - old.footOffset; a.group.rotation.copy(old.group.rotation); scene.add(a.group);
  try { equipWeapon(-1); } catch (e) { /* ignora */ } scene.remove(old.group); try { old.mesh.skeleton.dispose(); } catch (e) { /* ignora */ }
  player.actor = AE.actor = a; AE.groups = aeBoneGroups(a); AE.mirIdx = aeMirrorIdx(a); AE.nBones = a.bones.length; AE.sel = -1; AE.collapsed = new Set(); aeCollapseHands(a); AE.apKey = ''; aeDropHelpers(); aeBuildSkel(a); a.mesh.visible = !AE.hideMesh;
  if (AE.wi >= 0) aeEquip(AE.wi); aeAttachGizmo(); aeRefreshAll();
}
function aeEquip(i) {
  AE.wi = typeof weapons !== 'undefined' && i >= 0 && i < weapons.items.length ? i : -1;
  try { equipWeapon(AE.wi); } catch (e) { console.warn(e); }
  if (AE.wi >= 0 && weapons.mesh && weapons.items[AE.wi].grip) { const g = weapons.items[AE.wi].grip; g.decompose(_aeV, _aeQ, _aeV2); weapons.gripPos = _aeV.clone(); weapons.gripQ = _aeQ.clone(); weapons.mesh.visible = true; }
  weapons.gripKey = null; AE.apKey = ''; aeAttachGizmo(); aeRefreshAll();
}
async function aeLoadLists() {
  try {
    const c = await edApi('anim-clips'); AE.ifp = c.clips || []; AE.ifpMap = {}; for (const k of AE.ifp) if (!AE_HAS(AE.ifpMap, k.name.toLowerCase())) AE.ifpMap[k.name.toLowerCase()] = k;
    const l = await edApi('anims'); AE.anims = l.anims || []; AE.edited = c.edited || []; AE.apiOk = true; AE.listLoaded = true;
  } catch (e) { AE.apiOk = false; AE.listLoaded = true; AE.ifp = []; AE.anims = []; edToast('Sem o servidor do NEON ENGINE: a lista de animações não carregou (' + e.message + ').', 5000); }
}

/* ---------------- esqueleto de ajuda, gizmo, câmera ---------------- */
function aeBuildSkel(a) {
  const g = new THREE.Group(), n = a.bones.length, joints = [];
  const geo = new THREE.SphereGeometry(0.012, 10, 8);
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: 0x8ab4ff, depthTest: false, transparent: true, opacity: 0.95 })); m.renderOrder = 990; m.frustumCulled = false; g.add(m); joints.push(m); }
  const pos = new Float32Array(n * 6), lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x6fd3ff, depthTest: false, transparent: true, opacity: 0.7 })); lines.renderOrder = 989; lines.frustumCulled = false; g.add(lines);
  scene.add(g); AE.skel = { group: g, joints, lines, pos };
  const fl = new THREE.Group(), disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0x1b2028 })), grid = new THREE.GridHelper(5.2, 26, 0x4a5563, 0x2a313b);   // palco: o personagem fica no alto, longe da cidade (nada na frente da câmera)
  disc.rotation.x = -Math.PI / 2; fl.add(disc, grid); grid.position.y = 0.002; fl.position.copy(a.group.position); fl.position.y -= a.footOffset; fl.position.y -= 0.01; scene.add(fl); AE.skel.floor = fl; AE.skel.group.userData.floor = fl;
  const mk = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 10), new THREE.MeshBasicMaterial({ color: 0x40a0ff, depthTest: false, transparent: true, opacity: 0.95 })); mk.renderOrder = 997; mk.frustumCulled = false; mk.visible = false; scene.add(mk); AE.ikMarker = mk;
}
function aeSkelUpdate() {
  const S = AE.skel, a = aeA(); if (!S || !a) return; S.group.visible = AE.showSkel && AE.ready; if (!S.group.visible) return;
  const keyed = i => !!(AE.doc && AE_HAS(AE.doc.bones, String(aeBid(i))));
  for (let i = 0; i < a.bones.length; i++) {
    const j = S.joints[i], p = _aeV.setFromMatrixPosition(a.bones[i].matrixWorld); j.position.copy(p);
    const sel = i === AE.sel; j.material.color.setHex(sel ? 0xffc400 : keyed(i) ? 0xff5fa8 : 0x8ab4ff); j.scale.setScalar(sel ? 1.8 : 1);
    const par = a.info[i].parent, o = i * 6; if (par >= 0) { _aeV2.setFromMatrixPosition(a.bones[par].matrixWorld); S.pos[o] = _aeV2.x; S.pos[o + 1] = _aeV2.y; S.pos[o + 2] = _aeV2.z; } else { S.pos[o] = p.x; S.pos[o + 1] = p.y; S.pos[o + 2] = p.z; }
    S.pos[o + 3] = p.x; S.pos[o + 4] = p.y; S.pos[o + 5] = p.z;
  }
  S.lines.geometry.attributes.position.needsUpdate = true; S.lines.geometry.computeBoundingSphere();
}
function aePick(e) {                                         // clique no corpo: articulação mais próxima do cursor (até 16 px)
  const a = aeA(), S = AE.skel; if (!a || !S || !AE.ready) return; const r = renderer.domElement.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = -1, bd = 16 * 16, bz = 1e9;
  for (let i = 0; i < a.bones.length; i++) {
    _aeV.copy(S.joints[i].position).project(camera); if (_aeV.z > 1) continue; const x = (_aeV.x * 0.5 + 0.5) * r.width, y = (-_aeV.y * 0.5 + 0.5) * r.height, d = (x - mx) * (x - mx) + (y - my) * (y - my);
    if (d < bd - 4 || (d < bd + 4 && _aeV.z < bz)) { bd = Math.min(bd, d); best = i; bz = _aeV.z; }
  }
  if (best >= 0) aeSelectBone(best);
}
function aeSelectBone(i) { AE.sel = i; AE.target = 'bone'; aeAttachGizmo(); aeRefreshAll(); AE.tl.dirty = true; }
function aeCanTranslate(i) { const b = AE.doc && AE.doc.bones[String(aeBid(i))]; return i > 0 && !!b && (!!b.pos || aeA().info[i].name === 'pelvis'); }
function aeAttachGizmo() {
  const tc = AE.tc, a = aeA(); if (!tc) return; if (!AE.on || !a || !AE.ready) { tc.detach(); tc.visible = false; return; }
  if (AE.target === 'ik') { const e = aeIkEntry(AE.ikSel); if (!e || !AE.ikMarker.visible) { tc.detach(); tc.visible = false; return; } tc.visible = true; tc.attach(AE.ikMarker); tc.setMode('translate'); tc.setSpace(AE.space === 'local' ? 'local' : 'world'); tc.showX = tc.showY = tc.showZ = true; return; }
  if (AE.sel < 0 || !AE.doc) { tc.detach(); tc.visible = false; return; }
  const mode = AE.gizmo === 'translate' && aeCanTranslate(AE.sel) ? 'translate' : 'rotate'; if (AE.gizmo === 'translate' && mode === 'rotate') AE.gizmo = 'rotate';
  tc.visible = true; tc.attach(a.bones[AE.sel]); tc.setMode(mode); tc.setSpace(AE.space); tc.showX = tc.showY = tc.showZ = true;
}
function aeFromGizmo() {                                     // o gizmo mexeu: grava o quadro-chave do tempo atual
  const a = aeA(); if (!a || !AE.doc || !AE.on) return;
  if (AE.target === 'ik') { aeIkFromMarker(); return; }
  const i = AE.sel; if (i < 0) return; const bone = a.bones[i], bid = aeBid(i), t = AE.t, b = AE.doc.bones[String(bid)], mode = AE.tc.getMode();
  const has = b && (mode === 'translate' ? aeKeyIdx(b.pos, t) >= 0 : aeKeyIdx(b.rot, t) >= 0);
  if (!AE.autoKey && !has) { if (!AE.warnedAuto) { AE.warnedAuto = true; edToast('Auto-key desligado: crie o quadro-chave (I) neste tempo antes de mexer no gizmo.', 3500); } return; }
  AE.warnedAuto = false;
  if (mode === 'translate') aeSetPos(bid, t, [bone.position.x, bone.position.y, bone.position.z]); else { aeSetRot(bid, t, bone.quaternion); if (AE.sym) aeSymFrom(i, t); }
  AE.syncDirty = true; AE.dirty = true; AE.tl.dirty = true;
}
function aeSymFrom(i, t) {                                   // simetria: o osso espelho recebe o espelho da pose do osso mexido (mundo)
  const a = aeA(), j = AE.mirIdx[i]; if (j === i) return; a.group.updateMatrixWorld(true);
  const P = aeLocalPose(t); P[i].copy(a.bones[i].quaternion); const M = aeMirrorPose(P); aeSetRot(aeBid(j), t, M[j]);
}
function aeOrbit(dx, dy) { const o = AE.o; o.yaw -= dx * 0.006; o.pitch = Math.max(-1.45, Math.min(1.45, o.pitch - dy * 0.006)); }
function aeZoom(dy) { const o = AE.o; o.dist = Math.max(0.2, Math.min(12, o.dist * (dy < 0 ? 1 / 1.12 : 1.12))); }
function aeFocus() { const a = aeA(); if (!a) return; if (AE.sel >= 0) { AE.o.target.setFromMatrixPosition(a.bones[AE.sel].matrixWorld); AE.o.dist = Math.min(AE.o.dist, 1.1); } else { AE.o.target.copy(aeBodyCenter()); AE.o.dist = 3.2; } }

/* ---------------- laço ---------------- */
function aeFrame(dt) {
  if (!AE.on) return;
  if (AE.ready) {
    const dur = aeDur();
    if (AE.playing && dur > 0 && !AE.drag) { AE.t += dt * AE.speed; if (AE.t >= dur) { if (AE.loopPlay) AE.t = AE.t % dur; else { AE.t = dur; AE.playing = false; aeRefreshTransport(); } } AE.tl.dirty = true; }
    if (player.actor !== AE.actor) {                         // o jogo carregou o ator dele no meio (loadPlayerOutfit): esconde o dele e mantém o do editor como player.actor
      const g = player.actor; if (g) { g.group.visible = false; AE.saved.orig = g; AE.saved.origVis = true; } player.actor = AE.actor; if (!AE.actor.group.parent) scene.add(AE.actor.group);
    }
    if (aeA().bones.length !== AE.nBones) aeRigSync();
    aeSync(); aePoseAt(AE.t); aeSkelUpdate(); aeIkMarkerUpdate();
    if (AE.tc && AE.tc.object) AE.tc.updateMatrixWorld(true);
    if ((AE.tAcc += dt) > 0.08) { AE.tAcc = 0; aeRefreshLive(); }
  }
  if (AE.tl.dirty) aeTlDraw();
  const o = AE.o, cp = Math.cos(o.pitch), dx = -Math.sin(o.yaw) * cp, dy = Math.sin(o.pitch), dz = -Math.cos(o.yaw) * cp;
  fly.x = o.target.x - dx * o.dist; fly.y = o.target.y - dy * o.dist; fly.z = o.target.z - dz * o.dist; fly.yaw = o.yaw; fly.pitch = o.pitch; edCamApply();
}
function aeDur() { if (AE.doc) return AE.doc.duration; if (AE.preview) { const c = findClip(AE.preview.name); return c ? c.duration : 0; } return 0; }
const aeFps = () => (AE.doc ? AE.doc.fps : 30);
function aeSetTime(t, keepPlay) { const d = aeDur(); AE.t = Math.max(0, Math.min(d, t)); if (!keepPlay) AE.playing = false; AE.tl.dirty = true; aeRefreshTransport(); aeRefreshFields(); }
function aeSnapT(t) { return AE.snap && AE.doc ? Math.round(t * AE.doc.fps) / AE.doc.fps : t; }
function aeStep(n) { const fps = aeFps(); AE.playing = false; let t = (Math.round(AE.t * fps) + n) / fps; const d = aeDur(); if (t < 0) t = d; if (t > d + 1e-9) t = 0; aeSetTime(t); }
function aeJumpKey(dir) {                                    // próximo/anterior quadro-chave (do osso selecionado, senão de qualquer osso)
  if (!AE.doc) return; const ts = new Set(); const ids = AE.sel >= 0 ? [String(aeBid(AE.sel))] : Object.keys(AE.doc.bones);
  for (const id of ids) { const b = AE.doc.bones[id]; if (!b) continue; b.rot.forEach(k => ts.add(k[0])); if (b.pos) b.pos.forEach(k => ts.add(k[0])); }
  const l = [...ts].sort((x, y) => x - y); const t = AE.t; const n = dir > 0 ? l.find(x => x > t + 1e-4) : l.filter(x => x < t - 1e-4).pop(); if (n !== undefined) aeSetTime(n);
}

/* ---------------- teclado ---------------- */
function aeKey(e) {
  const c = e.ctrlKey || e.metaKey, typing = edTyping(e);
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (typing && e.target.blur) e.target.blur(); aeEnd(); aeSetOn(false); return true; }
  if (c && AE.drag && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.stopImmediatePropagation(); return true; }
  if (c && e.code === 'KeyZ' && !typing) { e.preventDefault(); e.stopImmediatePropagation(); aeEnd(); e.shiftKey ? aeRedo() : aeUndo(); return true; }
  if (c && e.code === 'KeyY') { e.preventDefault(); e.stopImmediatePropagation(); aeEnd(); aeRedo(); return true; }
  if (c && e.code === 'KeyS') { e.preventDefault(); e.stopImmediatePropagation(); aeSave(); return true; }
  if (typing) return false;
  e.stopImmediatePropagation();
  if (c && e.code === 'KeyC') { e.preventDefault(); aeCopyPose(); return true; }
  if (c && e.code === 'KeyV') { e.preventDefault(); aePastePose(); return true; }
  if (c) return true;
  const act = { KeyW: () => aeSetGizmo('translate'), KeyE: () => aeSetGizmo('rotate'), KeyL: () => aeSetSpace(AE.space === 'local' ? 'world' : 'local'), KeyY: () => aeSetOn(false), Space: () => aeTogglePlay(),
    KeyF: aeFocus, KeyI: () => (e.shiftKey ? aeInsertAll(false) : aeInsertKey()), KeyM: aeMirrorPoseOp, Delete: () => (e.shiftKey ? aeDeleteAllAt() : aeDeleteKeys()), Backspace: () => aeDeleteKeys(),
    ArrowLeft: () => (e.shiftKey ? aeJumpKey(-1) : aeStep(-1)), ArrowRight: () => (e.shiftKey ? aeJumpKey(1) : aeStep(1)), Home: () => aeSetTime(0), End: () => aeSetTime(aeDur()), KeyA: () => { AE.autoKey = !AE.autoKey; aeRefreshTransport(); } }[e.code];
  if (act) { e.preventDefault(); act(); }
  return true;
}
function aeTogglePlay() { if (AE.playing) AE.playing = false; else { if (AE.t >= aeDur() - 1e-6) AE.t = 0; AE.playing = true; } aeRefreshTransport(); }
function aeSetGizmo(g) { AE.gizmo = g; AE.target = 'bone'; aeAttachGizmo(); aeRefreshAll(); }
function aeSetSpace(s) { AE.space = s; aeAttachGizmo(); aeRefreshAll(); }

/* ---------------- dados: carregar, duplicar, excluir, salvar ---------------- */
function aeUseDoc(data, notice) {
  AE.doc = JSON.parse(JSON.stringify(data)); AE.preview = null; AE.savedStr = JSON.stringify(AE.doc); AE.dirty = false; AE.undo = []; AE.redo = []; AE.pend = null; AE.selKeys.clear(); AE.err = ''; AE.syncDirty = true;
  AE.t = 0; AE.apKey = ''; if (notice) AE.notice[AE.doc.id] = notice; aeAutoCompose(); aeSync(); aeFitTl(); aeAttachGizmo(); aeRefreshAll(); AE.tl.dirty = true;
}
function aeAutoCompose() {                                   // como o jogo compõe: clipe parcial = camada sobre uma base; GunMove_* = pernas + pose de mira por cima
  const d = AE.doc; AE.compose = 'none'; if (!d) return; const A = aeWA(), id = d.id.toLowerCase(), partial = Object.keys(d.bones).length <= 14 && !id.startsWith('idle');
  if (partial) { AE.compose = 'under'; AE.baseName = 'IDLE_stance'; } else if (id.startsWith('gunmove_') && A && A.fire && (A.oneHand || A.twoHand)) { AE.compose = 'over'; AE.topName = A.fire; }
}
async function aeOpenEditable(id) {
  if (!aeConfirmDiscard()) return; AE.pick = null;
  try { const j = await edApi('anim?id=' + encodeURIComponent(id)); aeUseDoc(j.anim); } catch (e) { edToast('Não abriu o clipe: ' + e.message, 5000); }
}
function aePreviewClip(name) { if (!aeConfirmDiscard()) return; AE.doc = null; AE.dirty = false; AE.undo = []; AE.redo = []; AE.selKeys.clear(); AE.preview = { name }; AE.apKey = ''; AE.t = 0; AE.playing = true; AE.compose = 'none'; aeAttachGizmo(); aeFitTl(); aeRefreshAll(); AE.tl.dirty = true; }
async function aeDuplicate(from, to, name, source, pack) {
  if (!/^[a-z0-9_-]{1,64}$/.test(to)) { edToast('Id inválido: use a-z 0-9 _ - (1 a 64 caracteres, sem maiúsculas).', 4000); return; }
  const repl = aeIsRepl(to); if (repl && !AE.replOk.has(to) && !aeAsk('O id "' + to + '" tem o mesmo nome do clipe original ' + repl + '.\nA cópia vai SUBSTITUIR o original em todo o jogo (jogador, NPCs, polícia).\nContinuar?')) return; if (repl) AE.replOk.add(to);
  if (!aeConfirmDiscard()) return;
  try {
    const body = { from, to, name: name || undefined }; if (source) body.source = source; if (source === 'ifp' && typeof pack === 'string' && /^[\w.-]{1,40}$/.test(pack)) body.pack = pack;      // o clipe certo quando o mesmo nome existe em mais de um .ifp
    const r = await edApi('dup-anim', body); await aeLoadLists(); const j = await edApi('anim?id=' + encodeURIComponent(r.id || to));
    let note = ''; if (r.reduced) note = 'Atenção: este clipe tinha trilhas com mais de 600 quadros; o bake removeu quadros redundantes (erro máximo ' + (r.maxErrDeg !== undefined ? r.maxErrDeg : '?') + '°). O movimento pode diferir do original.';
    aeUseDoc(j.anim, note); if (typeof animEditSet === 'function') animEditSet(j.anim); edToast('Duplicado: ' + (r.id || to) + (r.reduced ? ' (com perda de quadros)' : '')); AE.pick = null;
  } catch (e) { edToast('Não duplicou: ' + e.message, 5000); }
}
async function aeDeleteClip(id) {
  let yes = false; try { yes = confirm('Excluir o clipe editável "' + id + '"?\nO arquivo vai para data/.backup/anims/ (recuperável) e o jogo volta a usar o .ifp original de mesmo nome, se houver.'); } catch (e) { /* ignora */ }
  if (!yes) return;
  try { await edApi('delete-anim', { id }); if (AE.doc && AE.doc.id === id) { AE.doc = null; AE.dirty = false; AE.preview = { name: 'IDLE_stance' }; AE.apKey = ''; AE.undo = []; AE.redo = []; AE.selKeys.clear(); } if (typeof animEditRemove === 'function') animEditRemove(id); await aeLoadLists(); edToast('Clipe excluído: ' + id); aeAttachGizmo(); aeRefreshAll(); AE.tl.dirty = true; }
  catch (e) { edToast('Não excluiu: ' + e.message, 5000); }
}
async function aeReloadDisk() {
  if (!AE.doc) return; if (!aeConfirmDiscard('Descartar as alterações e recarregar o clipe do disco?')) return;
  const id = AE.doc.id; try { const j = await edApi('anim?id=' + encodeURIComponent(id)); aeUseDoc(j.anim); edToast('Recarregado do disco'); } catch (e) { edToast('Não recarregou: ' + e.message, 4000); }
}
async function aeSave() {
  if (AE.saving || !AE.doc) { if (!AE.doc) edToast('Nada para salvar: abra um clipe editável.'); return false; }
  aeEnd(); const v = typeof animValidate === 'function' ? animValidate(AE.doc) : { ok: true, data: AE.doc };
  if (!v.ok) { edToast('Clipe inválido, não salvou: ' + v.erro, 7000); AE.err = v.erro; aeRefreshStatus(); return false; }
  if (!ED.api) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([typeof animStringify === 'function' ? animStringify(v.data) : JSON.stringify(v.data)], { type: 'application/json' })); a.download = v.data.id + '.json'; a.click(); edToast('Sem o servidor do editor: arquivo baixado. Coloque-o em data/anims/.', 5000); return false; }
  const rp = aeIsRepl(v.data.id); if (rp && !AE.replOk.has(v.data.id)) { if (!aeAsk('O clipe "' + v.data.id + '" SUBSTITUI o original ' + rp + ' em todo o jogo (jogador, NPCs, polícia).\nSalvar mesmo assim?')) return false; AE.replOk.add(v.data.id); }
  const snap = JSON.stringify(AE.doc); AE.saving = true;
  try {
    const r = await edApi('save-anim', { anim: v.data, overwrite: true }); AE.saving = false; if (AE.doc && AE.doc.id === v.data.id) { AE.savedStr = snap; aeChanged(); }
    if (typeof animEditSet === 'function' && AE.doc && JSON.stringify(AE.doc) === snap) animEditSet(v.data);      // o jogo passa a tocar a versão salva (AnimPlayer troca o clipe sozinho); se o clipe mudou durante o await, o aeSync cuida da versão nova
    edToast('Salvo: ' + r.id + ' (' + Math.round(r.bytes / 1024) + ' KB)' + (r.avisos && r.avisos.length ? ' · Aviso: ' + r.avisos.join('; ') : ''), r.avisos && r.avisos.length ? 8000 : undefined); aeLoadLists().then(aeRefreshAll); return true;
  } catch (e) { AE.saving = false; edToast('Não salvou: ' + e.message, 6000); return false; }
}
async function aePlayTest() {
  if (AE.doc && AE.dirty && !AE.testWarned) {                // 'Testar no jogo' grava o clipe de verdade: avisa uma vez por sessão
    const rp = aeIsRepl(AE.doc.id);
    if (!aeAsk('"Testar no jogo" SALVA o clipe em data/anims/' + AE.doc.id + '.json, por cima do arquivo atual (a versão anterior vai para data/.backup/anims e dá para voltar em "Restaurar versão anterior").' + (rp ? '\n\nAtenção: este clipe SUBSTITUI o original ' + rp + ' em todo o jogo.' : '') + '\n\nContinuar?')) return;
    AE.testWarned = true; if (rp) AE.replOk.add(AE.doc.id);
  }
  if (AE.dirty && !(await aeSave())) return; if (typeof edPlay === 'function') edPlay();
}
async function aeRestorePrev(id, openIt) {              // volta a versão guardada em data/.backup/anims (a atual também vai para o backup: dá para desfazer)
  if (!id) return; if (openIt && !aeConfirmDiscard('Descartar as alterações não salvas e restaurar a versão anterior?')) return;
  if (!aeAsk('Restaurar a versão anterior de "' + id + '"?\nA versão atual também fica guardada em data/.backup/anims.')) return;
  try {
    const r = await edApi('restore-anim', { id }); if (typeof animEditSet === 'function') animEditSet(r.anim);
    if (openIt) { aeUseDoc(r.anim); } await aeLoadLists(); edToast('Restaurado: ' + id + ' (' + r.restored + ')'); aeRefreshAll();
  } catch (e) { edToast('Não restaurou: ' + e.message, 5000); }
}

/* ---------------- operações de quadros-chave ---------------- */
const aeTk = t => t.toFixed(5);
function aeNeedDoc() { if (AE.doc) return true; edToast('Duplique o clipe (painel à esquerda) para poder editar.', 3000); return false; }
function aeInsertKey() {
  if (!aeNeedDoc()) return; if (AE.sel < 0) { edToast('Selecione um osso (lista, linha do tempo ou clique no corpo).', 2500); return; }
  aeChange(() => { const i = AE.sel, bid = aeBid(i), t = AE.t; aeBoneQ(i, t, _aeQ); const p = aeBoneP(i, t), has = AE.doc.bones[String(bid)] && AE.doc.bones[String(bid)].pos; if (!aeSetRot(bid, t, _aeQ)) return false; if (has) aeSetPos(bid, t, p); });
}
function aeInsertAll(everyBone) {                            // quadro-chave em todos os ossos do clipe (ou em todos os ossos do ator) no tempo atual
  if (!aeNeedDoc()) return; const a = aeA();
  aeChange(() => {
    const ids = everyBone ? a.info.map(b => b.id) : Object.keys(AE.doc.bones).map(Number);
    for (const bid of ids) { const i = aeIdx(bid); if (i < 0) continue; aeBoneQ(i, AE.t, _aeQ); const q = _aeQ.clone(), b = AE.doc.bones[String(bid)], p = b && b.pos ? aeBoneP(i, AE.t) : null; if (!aeSetRot(bid, AE.t, q)) return false; if (p) aeSetPos(bid, AE.t, p); }
  });
}
function aeSelList() { return [...AE.selKeys].map(s => { const [r, tk] = s.split('|'); return { k: r[0], id: r.slice(1), t: parseFloat(tk) }; }); }
function aeDeleteKeys() {
  if (!aeNeedDoc()) return;
  aeChange(() => {
    const d = AE.doc;
    if (AE.selKeys.size) {
      for (const s of aeSelList()) {
        if (s.k === 'b') aeDelKeyAt(s.id, s.t, true, true);
        else if (s.k === 'i') { const e = d.ik.find(x => x.chain === s.id); if (e && e.weight.length > 1) { const i = aeKeyIdx(e.weight, s.t); if (i >= 0) e.weight.splice(i, 1); } }
        else if (s.k === 'e') d.events = d.events.filter(ev => Math.abs(ev.t - s.t) > AE_EPS);
      } AE.selKeys.clear();
    } else if (AE.sel >= 0) aeDelKeyAt(aeBid(AE.sel), AE.t, true, true);
  });
}
function aeDeleteAllAt() { if (!aeNeedDoc()) return; aeChange(() => { for (const id of Object.keys(AE.doc.bones)) aeDelKeyAt(id, AE.t, true, true); }); }
function aeCopyPose() {
  if (!AE.doc) return; const a = aeA(), idxs = aeScopeIdx(AE.scope); if (!idxs.length) { edToast('Nada para copiar: selecione um osso ou escolha outro escopo.', 2500); return; }
  const bones = {}; for (const i of idxs) { const b = AE.doc.bones[String(aeBid(i))]; aeBoneQ(i, AE.t, _aeQ); bones[a.info[i].name] = { q: [_aeQ.x, _aeQ.y, _aeQ.z, _aeQ.w], p: b && b.pos ? aeBoneP(i, AE.t) : null }; }
  AE.clip = { scope: AE.scope, t: AE.t, bones }; edToast('Pose copiada (' + idxs.length + ' ossos)'); aeRefreshAll();
}
function aePastePose() {
  if (!aeNeedDoc()) return; if (!AE.clip) { edToast('Copie uma pose primeiro (Ctrl+C).', 2500); return; } const a = aeA(), C = AE.clip;
  aeChange(() => {
    const t = AE.t, ent = Object.keys(C.bones).filter(n => AE_HAS(a.index, n)).map(n => [a.index[n], C.bones[n]]);
    if (AE.pasteMirror) {
      const P = aeLocalPose(t); for (const [i, v] of ent) P[i].set(v.q[0], v.q[1], v.q[2], v.q[3]); const M = aeMirrorPose(P);
      for (const [i] of ent) { const j = AE.mirIdx[i]; if (!aeSetRot(aeBid(j), t, M[j])) return false; }
    } else for (const [i, v] of ent) { if (!aeSetRot(aeBid(i), t, _aeQ.set(v.q[0], v.q[1], v.q[2], v.q[3]))) return false; if (v.p && aeBid(i) !== 0) aeSetPos(aeBid(i), t, v.p); }
  });
}
function aeMirrorPoseOp() {                                  // espelha o corpo inteiro (troca E/D) no tempo atual e grava quadros nos ossos envolvidos
  if (!aeNeedDoc()) return; const a = aeA();
  aeChange(() => {
    const t = AE.t, P = aeLocalPose(t), M = aeMirrorPose(P);
    for (let i = 0; i < a.bones.length; i++) { const j = AE.mirIdx[i]; if (!aeHasBoneKeys(AE.doc, aeBid(i)) && !aeHasBoneKeys(AE.doc, aeBid(j))) continue; if (!aeSetRot(aeBid(i), t, M[i])) return false; }
  });
}
function aeSmooth() {                                        // suaviza as rotações: cada quadro vai em direção à média (slerp) dos vizinhos; quadros selecionados, ou a trilha do osso selecionado
  if (!aeNeedDoc()) return; const k = AE.smooth, sel = aeSelList().filter(s => s.k === 'b');
  aeChange(() => {
    const jobs = []; if (sel.length) { const by = {}; for (const s of sel) (by[s.id] = by[s.id] || []).push(s.t); for (const id in by) jobs.push([id, by[id]]); } else if (AE.sel >= 0) jobs.push([String(aeBid(AE.sel)), null]);
    if (!jobs.length) { edToast('Selecione um osso ou quadros-chave para suavizar.', 2500); return false; }
    for (const [id, ts] of jobs) {
      const b = AE.doc.bones[id]; if (!b || b.rot.length < 3) continue; const src = b.rot.map(r => r.slice());
      for (let i = 1; i < src.length - 1; i++) {
        if (ts && !ts.some(t => Math.abs(t - src[i][0]) <= AE_EPS)) continue;
        const A = new THREE.Quaternion(src[i - 1][1], src[i - 1][2], src[i - 1][3], src[i - 1][4]), B = new THREE.Quaternion(src[i + 1][1], src[i + 1][2], src[i + 1][3], src[i + 1][4]), C = new THREE.Quaternion(src[i][1], src[i][2], src[i][3], src[i][4]);
        if (A.dot(B) < 0) B.set(-B.x, -B.y, -B.z, -B.w); const mid = A.clone().slerp(B, 0.5); if (mid.dot(C) < 0) mid.set(-mid.x, -mid.y, -mid.z, -mid.w); C.slerp(mid, k);
        b.rot[i] = [src[i][0], AE_R6(C.x), AE_R6(C.y), AE_R6(C.z), AE_R6(C.w)];
      }
    }
  });
}
function aeCloseLoop() {                                     // o último quadro (em "duração") passa a repetir o primeiro: loop sem pulo. A posição da raiz (movimento) fica como está
  if (!aeNeedDoc()) return;
  aeChange(() => {
    const d = AE.doc;
    for (const id of Object.keys(d.bones)) {
      const b = d.bones[id], q = aeSampleTr(b.rot, 0, 4); aeInsert(b.rot, [AE_R6(d.duration), AE_R6(q.x), AE_R6(q.y), AE_R6(q.z), AE_R6(q.w)]);
      if (b.pos && id !== '0') { const p = aeSampleTr(b.pos, 0, 3); aeInsert(b.pos, [AE_R6(d.duration), AE_R6(p[0]), AE_R6(p[1]), AE_R6(p[2])]); }
    }
  }); edToast('Loop fechado: último quadro = primeiro');
}
function aeResample() {
  if (!aeNeedDoc()) return; const d = AE.doc, fps = d.fps, n = Math.floor(d.duration * fps + 1e-6) + 1; if (n > 600) { edToast('Muitos quadros (' + n + '): máximo 600 por trilha. Diminua o fps ou a duração.', 4000); return; }
  aeChange(() => {
    const ts = []; for (let i = 0; i < n; i++) ts.push(AE_R6(i / fps)); if (d.duration - ts[ts.length - 1] > 1e-4 && ts.length < 600) ts.push(AE_R6(d.duration));
    for (const id of Object.keys(d.bones)) { const b = d.bones[id], r = b.rot, p = b.pos;
      b.rot = ts.map(t => { const q = aeSampleTr(r, t, 4); return [t, AE_R6(q.x), AE_R6(q.y), AE_R6(q.z), AE_R6(q.w)]; });
      if (p) b.pos = ts.map(t => { const v = aeSampleTr(p, t, 3); return [t, AE_R6(v[0]), AE_R6(v[1]), AE_R6(v[2])]; }); }
  }); edToast('Reamostrado a ' + fps + ' quadros/s');
}
function aeStretch(nd) {
  if (!aeNeedDoc()) return; nd = +nd; if (!(nd >= 0.05 && nd <= 120)) { edToast('Duração deve ficar entre 0,05 e 120 s.', 3000); return; }
  aeChange(() => {
    const d = AE.doc, f = nd / d.duration, sc = a => a.forEach(k => { k[0] = AE_R6(k[0] * f); });
    for (const id in d.bones) { sc(d.bones[id].rot); if (d.bones[id].pos) sc(d.bones[id].pos); } for (const e of d.ik) sc(e.weight); for (const ev of d.events) ev.t = AE_R6(ev.t * f); d.duration = AE_R6(nd);
  }); AE.t = Math.min(AE.t, AE.doc.duration); aeFitTl();
}
function aeCutExtend(nd) {
  if (!aeNeedDoc()) return; nd = +nd; if (!(nd >= 0.05 && nd <= 120)) { edToast('Duração deve ficar entre 0,05 e 120 s.', 3000); return; }
  aeChange(() => {
    const d = AE.doc;
    if (nd < d.duration - 1e-6) {
      const cut = (tr, n) => { if (tr[tr.length - 1][0] <= nd + 1e-6) return tr; const v = aeSampleTr(tr, nd, n), arr = n === 4 ? [v.x, v.y, v.z, v.w] : v; const keep = tr.filter(k => k[0] < nd - AE_EPS); keep.push([AE_R6(nd)].concat(arr.map(AE_R6))); return keep; };
      for (const id in d.bones) { const b = d.bones[id]; b.rot = cut(b.rot, 4); if (b.pos) b.pos = cut(b.pos, 3); }
      for (const e of d.ik) { const w = e.weight, v = aeWeightAt(w, nd); e.weight = w.filter(k => k[0] < nd - AE_EPS); e.weight.push([AE_R6(nd), v]); } d.events = d.events.filter(ev => ev.t <= nd + 1e-6);
    }
    d.duration = AE_R6(nd);
  }); AE.t = Math.min(AE.t, AE.doc.duration); aeFitTl();
}
function aeWeightAt(w, t) { if (t <= w[0][0]) return w[0][1]; const n = w.length; if (t >= w[n - 1][0]) return w[n - 1][1]; let i = 0; while (i < n - 1 && w[i + 1][0] <= t) i++; return w[i][1] + (w[i + 1][1] - w[i][1]) * (t - w[i][0]) / (w[i + 1][0] - w[i][0]); }

/* mover / duplicar / escalar no tempo os quadros selecionados: parte sempre da fotografia do início do gesto (snap), então dá para ir e voltar */
function aeXformKeys(snap, list, fn, dup) {
  AE.doc = JSON.parse(snap); const d = AE.doc, items = [];
  for (const s of list) {
    if (s.k === 'b') { const b = d.bones[s.id]; if (!b) continue; const ri = aeKeyIdx(b.rot, s.t), pi = b.pos ? aeKeyIdx(b.pos, s.t) : -1; items.push({ k: 'b', id: s.id, rot: ri >= 0 ? b.rot[ri].slice() : null, pos: pi >= 0 ? b.pos[pi].slice() : null, t0: s.t }); }
    else if (s.k === 'i') { const e = d.ik.find(x => x.chain === s.id); if (!e) continue; const wi = aeKeyIdx(e.weight, s.t); if (wi >= 0) items.push({ k: 'i', id: s.id, w: e.weight[wi].slice(), t0: s.t }); }
    else if (s.k === 'e') for (const ev of d.events) if (Math.abs(ev.t - s.t) <= AE_EPS) items.push({ k: 'e', ev: Object.assign({}, ev), t0: s.t });
  }
  if (!dup) for (const it of items) {
    if (it.k === 'b') { const b = d.bones[it.id]; if (it.rot) b.rot = b.rot.filter(k => Math.abs(k[0] - it.t0) > AE_EPS); if (it.pos && b.pos) b.pos = b.pos.filter(k => Math.abs(k[0] - it.t0) > AE_EPS); }
    else if (it.k === 'i') { const e = d.ik.find(x => x.chain === it.id); e.weight = e.weight.filter(k => Math.abs(k[0] - it.t0) > AE_EPS); }
    else d.events = d.events.filter(ev => Math.abs(ev.t - it.t0) > AE_EPS || ev.name !== it.ev.name);
  }
  const sel = new Set(), cl = t => AE_R6(Math.max(0, Math.min(d.duration, fn(t))));
  for (const it of items) {
    const t1 = cl(it.t0);
    if (it.k === 'b') { const b = d.bones[it.id] || (d.bones[it.id] = { rot: [] }); if (it.rot) aeInsert(b.rot, [t1].concat(it.rot.slice(1))); if (it.pos) { b.pos = b.pos || []; aeInsert(b.pos, [t1].concat(it.pos.slice(1))); } sel.add('b' + it.id + '|' + aeTk(t1)); }
    else if (it.k === 'i') { const e = d.ik.find(x => x.chain === it.id); aeInsert(e.weight, [t1, it.w[1]]); sel.add('i' + it.id + '|' + aeTk(t1)); }
    else { d.events.push({ t: t1, name: it.ev.name }); sel.add('e|' + aeTk(t1)); }
  }
  for (const id of Object.keys(d.bones)) { const b = d.bones[id]; if (b.pos && !b.pos.length) delete b.pos; if (!b.rot.length) { if (b.pos) b.rot.push([0, 0, 0, 0, 1]); else delete d.bones[id]; } }
  d.events.sort((x, y) => x.t - y.t); AE.selKeys = sel; AE.syncDirty = true; AE.tl.dirty = true;
}
function aeScaleSel(f) { if (!aeNeedDoc() || !AE.selKeys.size) { edToast('Selecione quadros-chave na linha do tempo.', 2500); return; } const piv = AE.t, snap = JSON.stringify(AE.doc), list = aeSelList(); aeChange(() => aeXformKeys(snap, list, t => piv + (t - piv) * f, false)); }

/* ---------------- eventos ---------------- */
function aeAddEvent(t, name) {
  if (!aeNeedDoc()) return; if (AE.doc.events.length >= 64) { edToast('Máximo de 64 eventos.', 2500); return; }
  aeChange(() => { AE.doc.events.push({ t: AE_R6(Math.max(0, Math.min(AE.doc.duration, t === undefined ? AE.t : t))), name: name || 'evento' }); AE.doc.events.sort((x, y) => x.t - y.t); });
}

/* ---------------- dedos: curvar a mão (grava quadros-chave em todos os ossos de dedo do rig) ---------------- */
function aeFingerBones(side) {                               // [{idx,id,digit,joint}] da mão 'l'|'r' (rig-extend.js: a.rig.side)
  const a = aeA(); return a && a.rig && a.rig.side && a.rig.side[side] ? a.rig.side[side].filter(x => x.idx !== undefined && x.id !== undefined) : [];
}
function aeCurl(side, v) {                                   // rotação local = repouso * Rz(v * máximo da junta): Z positivo curva o dedo para a palma
  if (!aeNeedDoc()) return; const a = aeA(), list = aeFingerBones(side); if (!list.length) { edToast('Este personagem não tem o rig de dedos (assets/rigs).', 3500); return; }
  const mxf = typeof rigCurlMax === 'function' ? rigCurlMax : null;                 // máximo por dedo/junta (rig-extend.js), o mesmo do rigCurl do jogo
  for (const x of list) { const k = v * (mxf ? mxf(x.digit, x.joint) : 1.2); _aeE.set(0, 0, k, 'XYZ'); _aeQ2.copy(a.ap.restQ[x.idx]).multiply(_aeQ3.setFromEuler(_aeE)); if (!aeSetRot(x.id, AE.t, _aeQ2)) return false; }
}
function aeCurlSet(side, v) { aeChange(() => aeCurl(side, v)); }

/* ---------------- IK ---------------- */
const aeIkEntry = chain => (AE.doc ? AE.doc.ik.find(e => e.chain === chain) || null : null);
function aeIkFrame(e) {                                      // matriz de mundo do espaço do alvo (null = ainda não dá: sem arma etc.)
  const a = aeA(), T = e.target; if (!a) return null;
  if (T.space === 'weapon') { if (typeof weapons === 'undefined' || !weapons.mesh) return null; const rh = a.bones[a.index.rhand]; if (!rh || weapons.mesh.parent !== rh) return null; return _aeM.compose(weapons.mesh.position, weapons.mesh.quaternion, _aeOne).premultiply(rh.matrixWorld); }
  if (T.space === 'bone') { const i = a.ap.idToIdx[T.bone]; return i === undefined ? null : _aeM.copy(a.bones[i].matrixWorld); }
  if (T.space === 'actor') return _aeM.copy(a.group.matrixWorld); return _aeM.identity();
}
function aeIkPos(e) { if (e.target.pos) return e.target.pos; if (e.chain === 'lhand' && e.target.space === 'weapon') { const A = aeWA(); return A && A.lhand ? A.lhand : null; } return null; }
function aeIkWorld(e, out) { const F = aeIkFrame(e), p = aeIkPos(e); if (!F || !p) return null; return out.set(p[0], p[1], p[2]).applyMatrix4(F); }
function aeIkMarkerUpdate() {
  const m = AE.ikMarker, e = AE.doc ? aeIkEntry(AE.ikSel) : null; if (!m) return;
  const w = e && AE.ready ? aeIkWorld(e, new THREE.Vector3()) : null; m.visible = !!w && AE.showSkel !== false;
  if (m.visible && !AE.drag) { m.position.copy(w); const F = aeIkFrame(e); F.decompose(_aeV, m.quaternion, _aeV2); m.material.color.setHex(AE.target === 'ik' ? 0xffc400 : 0x40a0ff); }
}
function aeIkFromMarker() {                                  // o gizmo moveu a esfera: grava a posição no espaço do alvo
  const e = aeIkEntry(AE.ikSel); if (!e) return; const F = aeIkFrame(e); if (!F) return; _aeM2.copy(F).invert(); const p = _aeV.copy(AE.ikMarker.position).applyMatrix4(_aeM2);
  e.target.pos = [AE_R4(p.x), AE_R4(p.y), AE_R4(p.z)]; AE.syncDirty = true; AE.dirty = true; AE.tl.dirty = true; AE.ikFieldsDirty = true;
}
function aeIkHandPos(chain, out) { const a = aeA(), b = a.bones[a.index[AE_CHAINS[chain][2]]]; return b ? out.setFromMatrixPosition(b.matrixWorld) : null; }
function aeIkSnapToHand(chain) {                             // alvo = onde a mão/pé está agora (com o IK deste instante)
  const e = aeIkEntry(chain); if (!e) return; const h = aeIkHandPos(chain, new THREE.Vector3()), F = aeIkFrame(e); if (!h || !F) { edToast('Este espaço do alvo ainda não está disponível (equipe uma arma?).', 3000); return; }
  aeChange(() => { const p = h.applyMatrix4(_aeM2.copy(F).invert()); e.target.pos = [AE_R4(p.x), AE_R4(p.y), AE_R4(p.z)]; });
}
function aeIkToggle(chain, on) {
  if (!aeNeedDoc()) return;
  aeChange(() => {
    const d = AE.doc, e = aeIkEntry(chain);
    if (!on) { d.ik = d.ik.filter(x => x.chain !== chain); return; }
    if (e) return; const a = aeA(); a.group.updateMatrixWorld(true);
    let T; if (chain === 'lhand' && weapons.mesh && aeW() && (aeWA().lhand)) T = { space: 'weapon', pos: null }; else { const h = aeIkHandPos(chain, new THREE.Vector3()); const p = a.group.worldToLocal(h); T = { space: 'actor', pos: [AE_R4(p.x), AE_R4(p.y), AE_R4(p.z)] }; }
    d.ik.push({ chain, target: T, weight: [[0, 1]], hint: chain === 'lhand' || chain === 'rhand' ? [0, -1, 0] : null });
  });
  AE.ikSel = chain; aeAttachGizmo(); aeRefreshAll();
}
function aeIkSetSpace(chain, space) {
  const e = aeIkEntry(chain); if (!e) return;
  aeChange(() => {
    const a = aeA(); a.group.updateMatrixWorld(true); const wp = aeIkWorld(e, new THREE.Vector3()) || aeIkHandPos(chain, new THREE.Vector3());      // mantém o alvo onde está no mundo ao trocar de espaço
    e.target = { space, pos: null }; if (space === 'bone') e.target.bone = 5; if (e.target.rot) delete e.target.rot;
    const F = aeIkFrame(e); if (space === 'weapon' && chain === 'lhand' && !F) return; if (F) { const p = wp.clone().applyMatrix4(_aeM2.copy(F).invert()); e.target.pos = [AE_R4(p.x), AE_R4(p.y), AE_R4(p.z)]; } else e.target.pos = [0, 0, 0];
  });
}
function aeIkWeightHere(chain, w) { const e = aeIkEntry(chain); if (!e) return; aeChange(() => { aeInsert(e.weight, [AE_R6(AE.t), Math.max(0, Math.min(1, w))]); }); }
function aeBakeIk(chain) {                                   // lê a pose resultante (com IK) em toda a duração e grava como rotações FK dos 3 ossos da cadeia; remove a entrada de IK
  if (!aeNeedDoc()) return; const e = aeIkEntry(chain); if (!e) return; const a = aeA(), names = AE_CHAINS[chain], idxs = names.map(n => a.index[n]), bids = idxs.map(i => a.info[i].id);
  const d = AE.doc, step = Math.max(1 / d.fps, d.duration / 590), ts = []; for (let t = 0; t < d.duration - 1e-6; t += step) ts.push(AE_R6(t)); ts.push(AE_R6(d.duration));
  const t0 = AE.t, gameArm = AE.gameArm; AE.syncDirty = true; aeSync(); const tracks = idxs.map(() => []);
  const prevGame = AE.gameArm; AE.gameArm = false;
  try { for (const t of ts) { aePoseAt(t, true); idxs.forEach((i, k) => { const q = a.bones[i].quaternion; tracks[k].push([t, AE_R6(q.x), AE_R6(q.y), AE_R6(q.z), AE_R6(q.w)]); }); } } finally { AE.gameArm = prevGame; }
  aeChange(() => {
    for (let k = 0; k < idxs.length; k++) { if (!AE_HAS(d.bones, String(bids[k])) && Object.keys(d.bones).length >= 64) { edToast('Limite de 64 ossos.', 3000); return false; } const b = d.bones[String(bids[k])] || (d.bones[String(bids[k])] = { rot: [] }); b.rot = tracks[k]; }
    d.ik = d.ik.filter(x => x.chain !== chain);
  }); AE.t = t0; AE.gameArm = gameArm; aeAttachGizmo(); edToast('IK gravado em quadros-chave (' + ts.length + ' quadros por osso da cadeia)');
}

/* ---------------- linha do tempo (dopesheet em canvas) ---------------- */
const AE_RH = 18, AE_RULER = 22, AE_EVH = 16, AE_KX = 10;
const aeTX = t => AE.tl.lw + AE_KX + (t - AE.tl.x0) * AE.tl.pps, aeXT = x => (x - AE.tl.lw - AE_KX) / AE.tl.pps + AE.tl.x0;
function aeBuildTimeline() {
  const T = AE.tl, root = document.getElementById('aeTime'); if (!root || T.cv) return;
  T.head = document.getElementById('aeTlHead'); T.cv = document.getElementById('aeTlCv'); T.ctx = T.cv.getContext('2d'); const U = AE.ui;
  const b = (txt, fn, tip) => el('button', { onclick: fn, title: tip || '' }, txt), chk = (txt, key, tip, fn) => { const i = el('input', { type: 'checkbox' }); i.checked = !!AE[key]; i.addEventListener('change', () => { AE[key] = i.checked; if (fn) fn(); aeRefreshTransport(); }); U['c_' + key] = i; return el('label', { class: 'ed-check', title: tip }, i, txt); };
  U.tPlay = b('Tocar', aeTogglePlay, 'Espaço'); U.tTime = el('input', { type: 'number', step: 0.01, min: 0, class: 'ae-time', title: 'Tempo atual (s)' });
  U.tTime.addEventListener('change', () => aeSetTime(parseFloat(U.tTime.value) || 0)); U.tTime.addEventListener('keydown', e => { if (e.key === 'Enter') U.tTime.blur(); });
  U.tFrame = el('span', { class: 'ae-fr' }); U.tDur = el('span', { class: 'ae-fr' });
  U.tSpeed = el('select', { title: 'Velocidade de reprodução' }, [0.1, 0.25, 0.5, 1, 1.5, 2].map(v => el('option', { value: v, selected: v === 1 }, String(v).replace('.', ',') + '×'))); U.tSpeed.addEventListener('change', () => { AE.speed = +U.tSpeed.value; });
  T.head.append(b('⏮', () => aeSetTime(0), 'Início (Home)'), b('◀', () => aeStep(-1), 'Quadro anterior (←) · Shift+← quadro-chave anterior'), U.tPlay, b('▶', () => aeStep(1), 'Próximo quadro (→) · Shift+→ próximo quadro-chave'), b('⏭', () => aeSetTime(aeDur()), 'Fim (End)'),
    U.tTime, el('span', { class: 'ae-fr' }, 's /'), U.tDur, U.tFrame, U.tSpeed, chk('Repetir', 'loopPlay', 'Volta ao início ao chegar no fim'),
    el('span', { class: 'ed-spacer' }), chk('Auto-key', 'autoKey', 'Ligado: mexer no gizmo cria o quadro-chave no tempo atual. Desligado: só altera quadros que já existem (A)'), chk('Grade', 'snap', 'Tempos encaixam na grade de quadros (fps do clipe)'),
    U.cOnlyKeys = el('label', { class: 'ed-check', title: 'Esconde ossos sem quadros-chave' }, el('input', { type: 'checkbox' }), 'Só ossos animados'), b('Inserir (I)', () => aeInsertKey(), 'Quadro-chave do osso selecionado no tempo atual (Shift+I: todos os ossos do clipe)'), b('Apagar (Del)', () => aeDeleteKeys(), 'Apaga os quadros selecionados (ou o do osso no tempo atual). Shift+Del: todos os ossos neste tempo'),
    b('−', () => aeZoomTl(1 / 1.3), 'Menos zoom (Ctrl+roda)'), b('+', () => aeZoomTl(1.3), 'Mais zoom'), b('Ajustar', aeFitTl, 'Cabe a duração toda'));
  const onlyKeys = U.cOnlyKeys.firstChild; onlyKeys.checked = T.onlyKeys; onlyKeys.addEventListener('change', () => { T.onlyKeys = onlyKeys.checked; T.dirty = true; });
  const rz = document.getElementById('aeTlResize'); rz.addEventListener('pointerdown', e => { rz.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = root.offsetHeight; const mv = ev => { const h = Math.max(120, Math.min(innerHeight * 0.65, h0 + (y0 - ev.clientY))); document.getElementById('edApp').style.setProperty('--ae-h', h + 'px'); }; const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); aeResizeTl(); }; rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); });
  new ResizeObserver(aeResizeTl).observe(document.getElementById('aeTlWrap')); aeTlEvents(T.cv);
}
function aeResizeTl() {
  const T = AE.tl, wrap = document.getElementById('aeTlWrap'); if (!T.cv || !wrap) return; const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return; const d = window.devicePixelRatio || 1;
  T.w = w; T.h = h; T.cv.width = Math.round(w * d); T.cv.height = Math.round(h * d); T.cv.style.width = w + 'px'; T.cv.style.height = h + 'px'; T.ctx.setTransform(d, 0, 0, d, 0, 0); T.dirty = true;
}
function aeFitTl() { const T = AE.tl, d = aeDur() || 1; T.x0 = 0; T.pps = Math.max(20, Math.min(4000, (T.w - T.lw - AE_KX * 2 - 6) / d)); T.dirty = true; }
function aeZoomTl(f, cx) { const T = AE.tl, x = cx === undefined ? T.lw + (T.w - T.lw) / 2 : cx, t = aeXT(x); T.pps = Math.max(10, Math.min(6000, T.pps * f)); T.x0 = t - (x - T.lw - AE_KX) / T.pps; T.dirty = true; }
function aeRowTimes(row) {
  const doc = AE.doc, set = new Set();
  const addBone = id => { const b = doc.bones[id]; if (!b) return; b.rot.forEach(k => set.add(k[0])); if (b.pos) b.pos.forEach(k => set.add(k[0])); };
  if (row.k === 'bone') addBone(String(row.bid)); else if (row.k === 'group') row.idxs.forEach(i => addBone(String(aeBid(i))));
  else if (row.k === 'ik') { const e = aeIkEntry(row.chain); if (e) e.weight.forEach(k => set.add(k[0])); }
  return [...set].sort((a, b) => a - b);
}
function aeTlBuildRows() {
  const rows = [], a = aeA(), doc = AE.doc, T = AE.tl; if (!a || !doc) { T.rows = rows; return rows; }
  for (const e of doc.ik) rows.push({ k: 'ik', chain: e.chain, label: 'IK · ' + AE_CH_PT[e.chain] + ' (peso)', rk: 'i' + e.chain });
  for (const [g, name] of AE_GROUPS) {
    const idxs = a.info.map((b, i) => i).filter(i => AE.groups[i] === g && (!T.onlyKeys || AE_HAS(doc.bones, String(aeBid(i))) || i === AE.sel)); if (!idxs.length) continue;
    const coll = T.coll.has(g); rows.push({ k: 'group', g, label: name + ' (' + idxs.length + ')', idxs, coll });
    if (!coll) for (const i of idxs) rows.push({ k: 'bone', idx: i, bid: aeBid(i), label: aeLabel(a.info[i].name), rk: 'b' + aeBid(i) });
  }
  T.rows = rows; return rows;
}
function aeTlDraw() {
  const T = AE.tl; if (!T.cv || !T.ctx || !T.w) return; T.dirty = false; const c = T.ctx, W = T.w, H = T.h, top = AE_RULER + AE_EVH, dur = aeDur();
  c.fillStyle = '#12161c'; c.fillRect(0, 0, W, H); c.font = '11px "Segoe UI", sans-serif'; c.textBaseline = 'middle';
  const rows = aeTlBuildRows(), maxSy = Math.max(0, rows.length * AE_RH - (H - top)); T.sy = Math.max(0, Math.min(maxSy, T.sy));
  c.save(); c.beginPath(); c.rect(0, top, W, H - top); c.clip();
  rows.forEach((row, n) => {
    const y = top + n * AE_RH - T.sy; if (y > H || y + AE_RH < top) return; row.y = y; row.times = AE.doc ? aeRowTimes(row) : [];
    const selBone = row.k === 'bone' && row.idx === AE.sel;
    c.fillStyle = selBone ? 'rgba(255,196,0,0.16)' : row.k === 'group' ? '#1d242d' : n % 2 ? '#141920' : '#161b22'; c.fillRect(0, y, W, AE_RH);
    c.fillStyle = row.k === 'group' ? '#9fb0c4' : selBone ? '#fff' : row.k === 'ik' ? '#8fd6ff' : '#c8d0da'; c.font = (row.k === 'group' ? 'bold ' : '') + '11px "Segoe UI", sans-serif';
    c.fillText((row.k === 'group' ? (row.coll ? '▸ ' : '▾ ') : row.k === 'bone' ? '   ' : '') + row.label, 8, y + AE_RH / 2, T.lw - 12);
    for (const t of row.times) {
      const x = aeTX(t); if (x < T.lw - 6 || x > W + 6) continue; let sel = false;
      if (row.k === 'group') { const ks = aeKeysOfGroupAt(row, t); sel = ks.length > 0 && ks.every(k => AE.selKeys.has(k)); }
      else sel = AE.selKeys.has(row.rk + '|' + aeTk(t));
      aeDiamond(c, x, y + AE_RH / 2, row.k === 'group' ? 4 : 5, sel ? '#ffc400' : row.k === 'group' ? '#7f8a99' : row.k === 'ik' ? '#6fd3ff' : '#ff5fa8', sel);
    }
  });
  c.restore();
  c.fillStyle = '#10141a'; c.fillRect(0, 0, W, top); c.strokeStyle = '#2a313b'; c.beginPath(); c.moveTo(0, top + 0.5); c.lineTo(W, top + 0.5); c.moveTo(T.lw + 0.5, 0); c.lineTo(T.lw + 0.5, H); c.stroke();
  c.fillStyle = '#7f8a99'; c.font = '10px "Segoe UI", sans-serif'; c.fillText(AE.doc ? 'Ossos (' + Object.keys(AE.doc.bones).length + ' no clipe)' : AE.preview ? 'Só visualização: duplique para editar' : '', 8, AE_RULER / 2, T.lw - 12); c.fillText('Eventos', 8, AE_RULER + AE_EVH / 2);
  const fps = aeFps(), steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10], st = steps.find(s => s * T.pps >= 56) || 10, t0 = Math.floor(aeXT(T.lw) / st) * st;
  c.save(); c.beginPath(); c.rect(T.lw + 1, 0, W, top); c.clip();
  if (T.pps / fps >= 5 && AE.doc) { c.strokeStyle = '#1f2630'; for (let f = Math.floor(aeXT(T.lw) * fps); aeTX(f / fps) < W; f++) { const x = Math.round(aeTX(f / fps)) + 0.5; c.beginPath(); c.moveTo(x, AE_RULER - 5); c.lineTo(x, AE_RULER); c.stroke(); } }
  for (let t = t0; aeTX(t) < W; t += st) { const x = Math.round(aeTX(t)) + 0.5; c.strokeStyle = '#3a4350'; c.beginPath(); c.moveTo(x, AE_RULER - 9); c.lineTo(x, AE_RULER); c.stroke(); c.fillStyle = '#9aa6b5'; c.fillText(AE_R2(t * 1000) / 1000 + 's', x + 3, 9); }
  if (AE.doc) for (const ev of AE.doc.events) { const x = aeTX(ev.t), sel = AE.selKeys.has('e|' + aeTk(ev.t)); c.fillStyle = sel ? '#ffc400' : '#ffb02e'; c.beginPath(); c.moveTo(x - 5, AE_RULER + 2); c.lineTo(x + 5, AE_RULER + 2); c.lineTo(x, AE_RULER + AE_EVH - 2); c.fill(); c.fillStyle = '#d8c28a'; c.fillText(ev.name, x + 8, AE_RULER + AE_EVH / 2); }
  c.restore();
  c.save(); c.beginPath(); c.rect(T.lw + 1, 0, W, H); c.clip(); const ex = aeTX(dur); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(ex, top, W, H); c.strokeStyle = '#555f6d'; c.beginPath(); c.moveTo(Math.round(ex) + 0.5, 0); c.lineTo(Math.round(ex) + 0.5, H); c.stroke();
  const px = Math.round(aeTX(AE.t)) + 0.5; c.strokeStyle = '#ff2e88'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke(); c.fillStyle = '#ff2e88'; c.beginPath(); c.moveTo(px - 6, 0); c.lineTo(px + 6, 0); c.lineTo(px, 9); c.fill();
  const D = T.drag; if (D && D.type === 'box' && D.moved) { c.strokeStyle = '#ffc400'; c.fillStyle = 'rgba(255,196,0,0.08)'; const x = Math.min(D.x0, D.x1), y = Math.min(D.y0, D.y1); c.fillRect(x, y, Math.abs(D.x1 - D.x0), Math.abs(D.y1 - D.y0)); c.strokeRect(x + 0.5, y + 0.5, Math.abs(D.x1 - D.x0), Math.abs(D.y1 - D.y0)); }
  c.restore();
}
function aeKeyTimeIn(i, t) { const b = AE.doc.bones[String(aeBid(i))]; return !!b && (aeKeyIdx(b.rot, t) >= 0 || (b.pos && aeKeyIdx(b.pos, t) >= 0)); }
function aeDiamond(c, x, y, r, col, sel) { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); c.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke(); }
function aeTlHit(x, y) {
  const T = AE.tl, top = AE_RULER + AE_EVH;
  if (y < AE_RULER) return { type: 'ruler' };
  if (y < top) { if (AE.doc && x > T.lw) for (const ev of AE.doc.events) if (Math.abs(aeTX(ev.t) - x) <= 7) return { type: 'key', rk: 'e', t: ev.t, ev }; return { type: 'evrow', t: aeXT(x) }; }
  const row = T.rows.find(r => r.y !== undefined && y >= r.y && y < r.y + AE_RH); if (!row) return { type: 'empty' };
  if (x < T.lw) return { type: 'label', row };
  for (const t of row.times || []) if (Math.abs(aeTX(t) - x) <= 7) return { type: 'key', row, rk: row.rk || 'g', t };
  return { type: 'empty', row };
}
function aeKeysOfGroupAt(row, t) { return row.idxs.filter(i => aeKeyTimeIn(i, t)).map(i => 'b' + aeBid(i) + '|' + aeTk(t)); }
function aeTlEvents(cv) {
  const T = AE.tl; cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, h = aeTlHit(x, y); T.drag = null; cv.focus();
    if (e.button === 1 || e.button === 2) { T.drag = { type: 'pan', x0: x, ox: T.x0, y0: y, oy: T.sy }; return; }
    if (h.type === 'ruler') { T.drag = { type: 'scrub' }; aeSetTime(aeSnapT(aeXT(x))); return; }
    if (!AE.doc && h.type !== 'label') { T.drag = { type: 'scrub' }; aeSetTime(aeXT(x)); return; }
    if (h.type === 'label') {
      const row = h.row; if (row.k === 'group') { if (T.coll.has(row.g)) T.coll.delete(row.g); else T.coll.add(row.g); T.dirty = true; } else if (row.k === 'bone') aeSelectBone(row.idx);
      else if (row.k === 'ik') { AE.ikSel = row.chain; AE.target = 'ik'; aeAttachGizmo(); aeRefreshAll(); T.dirty = true; } return;
    }
    if (h.type === 'key') {
      const rks = h.rk === 'g' ? aeKeysOfGroupAt(h.row, h.t) : [h.rk + '|' + aeTk(h.t)], already = rks.every(k => AE.selKeys.has(k));
      if (e.shiftKey) { if (already) rks.forEach(k => AE.selKeys.delete(k)); else rks.forEach(k => AE.selKeys.add(k)); } else if (!already) { AE.selKeys = new Set(rks); }
      if (h.row && h.row.k === 'bone' && !e.shiftKey) { AE.sel = h.row.idx; AE.target = 'bone'; aeAttachGizmo(); } if (!e.shiftKey) { AE.playing = false; aeSetTime(h.t); }
      if (AE.selKeys.size) T.drag = { type: 'keys', x0: x, anchor: h.t, snap: JSON.stringify(AE.doc), list: aeSelList(), dup: e.ctrlKey || e.altKey, moved: false, rest: !already && !e.shiftKey }; T.dirty = true; aeRefreshAll(); return;
    }
    if (h.type === 'evrow') { T.drag = { type: 'scrub' }; aeSetTime(aeSnapT(aeXT(x))); return; }
    T.drag = { type: 'box', x0: x, y0: y, x1: x, y1: y, moved: false, add: e.shiftKey, base: new Set(AE.selKeys), t0: aeXT(x) };
  });
  cv.addEventListener('pointermove', e => {
    const D = T.drag; if (!D) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (D.type === 'scrub') aeSetTime(aeSnapT(aeXT(x)));
    else if (D.type === 'pan') { T.x0 = D.ox - (x - D.x0) / T.pps; T.sy = D.oy - (y - D.y0); T.dirty = true; }
    else if (D.type === 'keys') {
      if (!D.moved && Math.abs(x - D.x0) < 4) return; if (!D.moved) { D.moved = true; AE.playing = false; aeBegin(); }
      let mn = 1e9, mx = -1e9; for (const s of D.list) { mn = Math.min(mn, s.t); mx = Math.max(mx, s.t); }
      let delta = aeSnapT(D.anchor + (x - D.x0) / T.pps) - D.anchor; delta = Math.max(-mn, Math.min(AE.doc.duration - mx, delta)); if (D.dup && !D.dupDone) D.dupDone = true;
      if (D.delta === delta) return;                                                   // mesma posição (grade): não refaz o JSON.parse do snapshot
      aeXformKeys(D.snap, D.list, t => t + delta, D.dup); D.delta = delta; aeRefreshStatusFast();
    } else if (D.type === 'box') { D.x1 = x; D.y1 = y; if (Math.abs(x - D.x0) + Math.abs(y - D.y0) > 4) D.moved = true; if (D.moved) aeTlBoxSelect(D); T.dirty = true; }
  });
  const end = e => {
    const D = T.drag; T.drag = null; if (!D) return;
    if (D.type === 'keys') { if (D.moved) aeEnd(); else if (D.rest) { /* clique simples: já selecionado */ } }
    else if (D.type === 'box') { if (!D.moved) { AE.selKeys.clear(); const r = cv.getBoundingClientRect(); aeSetTime(aeSnapT(aeXT(D.x0))); } aeRefreshAll(); }
    T.dirty = true;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', e => { const r = cv.getBoundingClientRect(), h = aeTlHit(e.clientX - r.left, e.clientY - r.top); if (h.type === 'evrow' && AE.doc) aeAddEvent(aeSnapT(h.t), 'evento'); });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    if (e.ctrlKey) aeZoomTl(e.deltaY < 0 ? 1.2 : 1 / 1.2, x); else if (e.shiftKey) { T.x0 += e.deltaY / T.pps; T.dirty = true; } else { T.sy += e.deltaY; T.dirty = true; }
  }, { passive: false });
}
function aeTlBoxSelect(D) {
  const T = AE.tl, sel = D.add ? new Set(D.base) : new Set(), xa = Math.min(D.x0, D.x1), xb = Math.max(D.x0, D.x1), ya = Math.min(D.y0, D.y1), yb = Math.max(D.y0, D.y1);
  for (const row of T.rows) { if (row.y === undefined || row.y + AE_RH < ya || row.y > yb) continue; for (const t of row.times || []) { const x = aeTX(t); if (x < xa || x > xb || x < T.lw) continue; if (row.k === 'group') aeKeysOfGroupAt(row, t).forEach(k => sel.add(k)); else sel.add(row.rk + '|' + aeTk(t)); } }
  AE.selKeys = sel;
}

/* ---------------- painel esquerdo: clipes e ossos ---------------- */
function aeMountLeft() {
  const host = document.getElementById('edLeft'); if (!AE.left) {
    const U = AE.ui; U.cSearch = el('input', { type: 'search', placeholder: 'Buscar clipe…', 'aria-label': 'Buscar clipe' }); U.cSearch.addEventListener('input', () => { AE.filter = U.cSearch.value; aeRefreshClips(); });
    const oe = el('input', { type: 'checkbox' }); oe.addEventListener('change', () => { AE.onlyEdited = oe.checked; aeRefreshClips(); });
    U.cList = el('div', { class: 'ae-list' }); U.cForm = el('div', { class: 'ae-form' });
    U.bSearch = el('input', { type: 'search', placeholder: 'Buscar osso…', 'aria-label': 'Buscar osso' }); U.bSearch.addEventListener('input', () => { AE.boneFilter = U.bSearch.value; aeRefreshBones(); }); U.bList = el('div', { class: 'ae-list ae-bones' });
    AE.left = el('div', { id: 'aeLeft' }, el('section', { class: 'ae-s1' }, el('h4', {}, 'Clipes'), U.cSearch, el('label', { class: 'ed-check' }, oe, 'Só editáveis'), U.cList, U.cForm),
      el('section', { class: 'ae-s2' }, el('h4', {}, 'Ossos'), U.bSearch, U.bList));
  }
  host.append(AE.left); AE.collapsed = new Set(); if (player.actor) aeCollapseHands(player.actor);
}
function aeIsRepl(id) { return AE_HAS(AE.ifpMap, id.toLowerCase()) ? AE.ifpMap[id.toLowerCase()].name : null; }
function aeRefreshClips() {
  const U = AE.ui; if (!U.cList) return; const q = AE.filter.trim().toLowerCase(), L = U.cList; L.textContent = '';
  const open = AE.doc ? AE.doc.id : null;
  const eds = AE.anims.filter(x => !q || x.id.toLowerCase().includes(q) || (x.name || '').toLowerCase().includes(q));
  if (eds.length || !q) L.append(el('div', { class: 'ae-sec-t' }, 'Editáveis (' + AE.anims.length + ')'));
  if (!AE.anims.length && !q) L.append(el('div', { class: 'ae-none' }, AE.apiOk ? 'Nenhum ainda. Escolha um clipe original abaixo e duplique.' : 'Servidor do editor indisponível.'));
  for (const x of eds) {
    const repl = x.invalid ? null : aeIsRepl(x.id), b = el('button', { class: 'ae-item' + (open === x.id ? ' on' : ''), title: x.invalid ? x.erro : (x.name || x.id), onclick: () => { if (!x.invalid) aeOpenEditable(x.id); } }, x.id,
      repl ? el('i', { class: 'ae-badge sub', title: 'Substitui o clipe original ' + repl + ' em todo o jogo' }, 'substitui') : null, x.invalid ? el('i', { class: 'ae-badge bad', title: x.erro }, 'inválido') : null, !x.invalid ? el('small', {}, AE_R2(x.duration) + ' s') : null);
    L.append(b);
    if (x.invalid) L.append(el('div', { class: 'ed-sk-row' }, el('button', { class: 'danger', onclick: () => aeDeleteClip(x.id), title: 'Move o arquivo inválido para data/.backup/anims (recuperável)' }, 'Excluir ' + x.id), el('button', { onclick: () => aeRestorePrev(x.id, false), title: 'Volta a última versão guardada em data/.backup/anims' }, 'Restaurar anterior')));
  }
  if (!AE.onlyEdited) {
    const all = AE.ifp.filter(k => k.bones > 0 && (!q || k.name.toLowerCase().includes(q) || k.pack.toLowerCase().includes(q)));
    L.append(el('div', { class: 'ae-sec-t' }, 'Originais .ifp (' + all.length + ')'));
    for (const k of all.slice(0, 160)) { const hasEd = AE.edited.includes(k.name.toLowerCase()); L.append(el('button', { class: 'ae-item' + (AE.pick && AE.pick.name === k.name && AE.pick.pack === k.pack ? ' on' : ''), title: k.pack + '.ifp · ' + k.bones + ' ossos' + (hasEd ? ' · já substituído por um editável' : ''), onclick: () => aePickIfp(k) }, k.name, hasEd ? el('i', { class: 'ae-badge sub' }, 'editado') : null, el('small', {}, k.pack))); }
    if (all.length > 160) L.append(el('div', { class: 'ae-none' }, '+' + (all.length - 160) + ' — refine a busca.'));
  }
  aeRefreshForm();
}
function aePickIfp(k) { if (AE.doc && AE.dirty && !aeConfirmDiscard()) return; AE.dirty = false; AE.doc = null; AE.pick = k; AE.preview = { name: k.name }; AE.apKey = ''; AE.t = 0; AE.playing = true; AE.undo = []; AE.redo = []; AE.selKeys.clear(); AE.compose = 'none'; aeAttachGizmo(); aeFitTl(); aeRefreshAll(); }
function aeRefreshForm() {
  const U = AE.ui, F = U.cForm; if (!F) return; F.textContent = ''; const src = AE.pick ? 'ifp' : AE.doc ? 'edit' : null; if (!src) { F.append(el('p', { class: 'ed-hint' }, 'Clique num clipe: original (.ifp) só visualiza; para editar, duplique. Editáveis abrem direto.')); return; }
  const from = src === 'ifp' ? AE.pick.name : AE.doc.id, def = src === 'ifp' ? from.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_2' : AE.doc.id.slice(0, 60) + '_2', id = el('input', { type: 'text', value: def, 'aria-label': 'Id do novo clipe' }), nm = el('input', { type: 'text', value: src === 'ifp' ? from + ' (editado)' : (AE.doc.name || '') + ' (cópia)', 'aria-label': 'Nome do novo clipe' });
  F.append(el('div', { class: 'ae-fhead' }, el('b', {}, from), el('small', {}, src === 'ifp' ? AE.pick.pack + '.ifp · ' + AE_R2(AE.pick.duration) + ' s · ' + AE.pick.bones + ' ossos' : 'clipe aberto' + (AE.dirty ? ' (não salvo)' : ''))));
  if (src === 'ifp' && AE.pick.maxFrames > 600) F.append(el('div', { class: 'ed-sk-warn' }, 'Atenção: este clipe tem trilhas com ' + AE.pick.maxFrames + ' quadros (limite 600). Ao duplicar, quadros redundantes são removidos com tolerância (perda pequena, mostrada depois).'));
  if (src === 'edit' && AE.notice[AE.doc.id]) F.append(el('div', { class: 'ed-sk-warn' }, AE.notice[AE.doc.id]));
  if (src === 'edit') { const r = aeIsRepl(AE.doc.id); if (r) F.append(el('div', { class: 'ae-sub' }, 'Este clipe SUBSTITUI o original ' + r + ' em todo o jogo (jogador, NPCs, polícia).')); }
  F.append(el('label', { class: 'ae-lab' }, 'Id novo (a-z 0-9 _ -)'), id, el('label', { class: 'ae-lab' }, 'Nome'), nm,
    el('div', { class: 'ed-sk-row' }, el('button', { class: 'primary', onclick: async () => { if (src === 'edit' && AE.dirty) { if (!(await aeSave())) return; } aeDuplicate(from, id.value.trim(), nm.value.trim(), src, src === 'ifp' && AE.pick ? AE.pick.pack : undefined); }, title: 'Cria uma cópia editável; o original não é alterado' }, 'Duplicar para editar'),
      src === 'ifp' ? el('button', { onclick: () => { id.value = from.toLowerCase(); edToast('Mesmo nome do original: ao duplicar, a cópia o SUBSTITUI em todo o jogo (será pedida confirmação).', 4500); }, title: 'Usa o mesmo nome do original: a cópia o substitui em todo o jogo' }, 'Mesmo nome') : null));
  if (src === 'edit') F.append(el('div', { class: 'ed-sk-row' }, el('button', { class: 'danger', onclick: () => aeDeleteClip(AE.doc.id), title: 'Move para data/.backup/anims (recuperável)' }, 'Excluir'), el('button', { onclick: aeReloadDisk, title: 'Descarta as alterações e lê o arquivo de novo' }, 'Recarregar do disco'), el('button', { onclick: () => aeRestorePrev(AE.doc.id, true), title: 'Volta a versão guardada antes da última gravação (data/.backup/anims)' }, 'Restaurar versão anterior')));
}
function aeRefreshBones() {
  const U = AE.ui, a = aeA(), L = U.bList; if (!L) return; L.textContent = ''; if (!a) return; const q = (AE.boneFilter || '').trim().toLowerCase(), n = a.info.length;
  const kids = a.info.map(() => []); a.info.forEach((b, i) => { if (b.parent >= 0) kids[b.parent].push(i); }); const roots = a.info.map((b, i) => i).filter(i => a.info[i].parent < 0);
  const row = (i, depth) => {
    const name = a.info[i].name, lab = aeLabel(name), keyed = AE.doc && AE_HAS(AE.doc.bones, String(aeBid(i))), has = kids[i].length;
    if (q && !(lab.toLowerCase().includes(q) || name.toLowerCase().includes(q))) return;
    const arrow = has && !q ? el('span', { class: 'ae-arrow', onclick: ev => { ev.stopPropagation(); if (AE.collapsed.has(i)) AE.collapsed.delete(i); else AE.collapsed.add(i); aeRefreshBones(); } }, AE.collapsed.has(i) ? '▸' : '▾') : el('span', { class: 'ae-arrow' }, '');
    L.append(el('div', { class: 'ae-bone' + (i === AE.sel ? ' on' : ''), style: 'padding-left:' + (q ? 6 : 4 + depth * 11) + 'px', onclick: () => aeSelectBone(i), title: name + ' · id ' + aeBid(i) }, arrow, el('span', { class: 'ae-bn' }, lab), el('small', {}, name), keyed ? el('i', { class: 'ae-key', title: 'Tem quadros-chave neste clipe' }, '◆') : null));
  };
  const walk = (i, d) => { row(i, d); if (!q && AE.collapsed.has(i)) return; for (const k of kids[i]) walk(k, d + 1); };
  roots.forEach(r => walk(r, 0)); if (q && !L.children.length) L.append(el('div', { class: 'ae-none' }, 'Nenhum osso com esse nome.'));
}

/* ---------------- painel direito ---------------- */
function aeRender() { const box = document.getElementById('edInspector'); if (typeof renderInspector === 'function') renderInspector(); else if (box) box.textContent = ''; }
function renderAnimPanel(box) { if (!AE.panel) aeBuildPanel(); aeBuildTimeline(); box.append(AE.panel); aeRefreshAll(); aeResizeTl(); }
function aeNum(label, step, get, set, opts) {                // campo numérico com arraste no rótulo; set grava (cria/atualiza o quadro-chave no tempo atual)
  opts = opts || {}; const inp = el('input', { type: 'number', step }), lab = el('label', { class: 'drag', title: 'Arraste para ajustar (Shift = x10)' }, label);
  inp.addEventListener('focus', aeBegin); inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v) && AE.doc) { aeBegin(); set(v); AE.syncDirty = true; AE.dirty = true; AE.tl.dirty = true; } });
  inp.addEventListener('change', aeEnd); inp.addEventListener('blur', aeEnd); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  lab.addEventListener('pointerdown', e => {
    if (!AE.doc) return; e.preventDefault(); aeBegin(); const x0 = e.clientX, v0 = get(); lab.setPointerCapture(e.pointerId); AE.playing = false;
    const mv = ev => { const v = AE_R4(v0 + Math.round((ev.clientX - x0) / 4) * step * (ev.shiftKey ? 10 : 1)); set(v); inp.value = v; AE.syncDirty = true; AE.dirty = true; AE.tl.dirty = true; };
    const up = () => { for (const n of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) lab.removeEventListener(n, n === 'pointermove' ? mv : up); aeEnd(); };
    lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); lab.addEventListener('pointercancel', up); lab.addEventListener('lostpointercapture', up);
  });
  const n = { node: el('div', { class: 'ed-num' }, lab, inp), inp, get }; (AE.liveNums = AE.liveNums || []).push(n); return n;
}
function aeVec(title, nums) { const row = el('div', { class: 'ed-vec' }); nums.forEach(n => row.append(n.node)); return el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, title), row); }
function aeEulerFields() {
  const ax = ['x', 'y', 'z'], q = () => { aeBoneQ(AE.sel, AE.t, _aeQ); return _aeE.setFromQuaternion(_aeQ, 'XYZ'); };
  return ax.map(k => aeNum('R' + k.toUpperCase(), 0.5, () => AE_R2(q()[k] / AE_RAD), v => { if (AE.sel < 0) return; const e = q().clone(); e[k] = v * AE_RAD; _aeQ2.setFromEuler(e); aeSetRot(aeBid(AE.sel), AE.t, _aeQ2); if (AE.sym) aeSymFrom(AE.sel, AE.t); }));
}
function aePosFields() { return [0, 1, 2].map(k => aeNum('PXYZ'[k + 1], 0.005, () => AE_R4(aeBoneP(AE.sel, AE.t)[k]), v => { if (AE.sel < 0) return; const p = aeBoneP(AE.sel, AE.t).slice(); p[k] = v; aeSetPos(aeBid(AE.sel), AE.t, p); })); }
function aeSecEl(title, open, ...kids) { return el('details', { class: 'ae-det', open: open ? true : undefined }, el('summary', {}, title), el('div', { class: 'ae-body' }, ...kids)); }
function aeBuildPanel() {
  const U = AE.ui, P = AE.panel = el('div', { class: 'ae-panel' });
  const btn = (txt, fn, tip, cls) => el('button', { class: cls || '', onclick: fn, title: tip || '' }, txt);
  const chk = (txt, get, set, tip) => { const i = el('input', { type: 'checkbox' }); i.addEventListener('change', () => set(i.checked)); const l = el('label', { class: 'ed-check', title: tip || '' }, i, txt); l.input = i; l.sync = () => { i.checked = !!get(); }; U.syncs.push(l.sync); return l; };
  U.syncs = [];
  U.head = el('div', { class: 'ed-insp-head' }, el('b', {}, 'Editor de animação'), el('small', {}, 'Y liga/desliga · Esc sai · Ctrl+S salva'));
  U.load = el('p', { class: 'ed-hint' }); U.err = el('div', { class: 'ed-sk-warn', hidden: true });
  U.undo = btn('Desfazer', () => { aeEnd(); aeUndo(); }, 'Ctrl+Z (200 níveis)'); U.redo = btn('Refazer', () => { aeEnd(); aeRedo(); }, 'Ctrl+Y'); U.save = btn('Salvar', aeSave, 'Ctrl+S: valida e grava data/anims/<id>.json', 'primary');
  U.test = btn('Testar no jogo', aePlayTest, 'Salva o clipe e abre o jogo (como o botão Testar)'); U.status = el('span', { class: 'ed-sk-status' });
  U.clipInfo = el('div', { class: 'ae-info' });
  U.name = el('input', { type: 'text', maxlength: 80, 'aria-label': 'Nome do clipe' }); U.name.addEventListener('change', () => aeChange(() => { AE.doc.name = U.name.value.trim() || AE.doc.id; }));
  U.fps = el('input', { type: 'number', min: 1, max: 240, step: 1, 'aria-label': 'Quadros por segundo' }); U.fps.addEventListener('change', () => aeChange(() => { AE.doc.fps = Math.max(1, Math.min(240, Math.round(+U.fps.value) || 30)); }));
  U.dur = el('input', { type: 'number', min: 0.05, max: 120, step: 0.01, 'aria-label': 'Duração (s)' });
  U.notes = el('textarea', { rows: 2, maxlength: 2000, 'aria-label': 'Notas' }); U.notes.addEventListener('change', () => aeChange(() => { AE.doc.notes = U.notes.value; }));
  const loopC = chk('Loop (metadado)', () => AE.doc && AE.doc.loop, v => aeChange(() => { AE.doc.loop = v; }), 'Só informa o editor/chamador; em jogo quem chama decide');
  U.boneName = el('div', { class: 'ae-bonehead' });
  U.bGizR = btn('Girar (E)', () => aeSetGizmo('rotate'), 'Gizmo de rotação'); U.bGizT = btn('Mover (W)', () => aeSetGizmo('translate'), 'Gizmo de posição: só ossos com trilha de posição (ex.: pélvis)'); U.bSpace = btn('', () => aeSetSpace(AE.space === 'local' ? 'world' : 'local'), 'Eixos do gizmo (L)');
  U.eulerBox = el('div', {}); U.posBox = el('div', {}); U.ikWarn = el('div', { class: 'ed-sk-warn', hidden: true });
  U.scope = el('select', { 'aria-label': 'Escopo' }, [['bone', 'Osso selecionado'], ['armL', 'Braço esquerdo (+ dedos)'], ['armR', 'Braço direito (+ dedos)'], ['legs', 'Pernas'], ['head', 'Cabeça e pescoço'], ['all', 'Corpo inteiro']].map(([v, t]) => el('option', { value: v }, t))); U.scope.addEventListener('change', () => { AE.scope = U.scope.value; });
  U.smooth = el('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: AE.smooth, 'aria-label': 'Força da suavização' }); U.smooth.addEventListener('input', () => { AE.smooth = +U.smooth.value; });
  U.ikBox = el('div', {}); U.evBox = el('div', {});
  U.skin = el('select', { 'aria-label': 'Roupa' }); U.skin.addEventListener('change', () => aeSetSkin(U.skin.value));
  U.weapon = el('select', { 'aria-label': 'Arma' }); U.weapon.addEventListener('change', () => aeEquip(+U.weapon.value));
  U.comp = el('select', { 'aria-label': 'Composição' }, [['none', 'Só este clipe'], ['under', 'Sobre uma base (clipe parcial)'], ['over', 'Com a pose de outro clipe por cima']].map(([v, t]) => el('option', { value: v }, t))); U.comp.addEventListener('change', () => { AE.compose = U.comp.value; AE.apKey = ''; aeRefreshAll(); });
  U.baseSel = el('input', { type: 'text', list: 'aeClipNames', 'aria-label': 'Clipe base' }); U.baseSel.addEventListener('change', () => { if (findClip(U.baseSel.value)) { AE.baseName = U.baseSel.value; AE.apKey = ''; } else U.baseSel.value = AE.baseName; });
  U.topSel = el('input', { type: 'text', list: 'aeClipNames', 'aria-label': 'Clipe por cima' }); U.topSel.addEventListener('change', () => { if (!U.topSel.value || findClip(U.topSel.value)) { AE.topName = U.topSel.value; AE.apKey = ''; } else U.topSel.value = AE.topName; });
  U.dl = el('datalist', { id: 'aeClipNames' });
  P.append(U.head, U.load, U.err, el('div', { class: 'ed-actions ae-act0' }, U.undo, U.redo, U.save, U.test), U.status,
    aeSecEl('Clipe', true, U.clipInfo, el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Nome'), U.name), el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Quadros/s'), U.fps),
      el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Duração (s)'), el('div', { class: 'ae-inl' }, U.dur, btn('Esticar', () => aeStretch(U.dur.value), 'Muda a duração escalando todos os tempos (o movimento fica mais lento/rápido)'), btn('Cortar/estender', () => aeCutExtend(U.dur.value), 'Corta (mantém o formato até o corte) ou estende (o último quadro é mantido)'))),
      el('div', { class: 'ed-checks' }, loopC), el('div', { class: 'ed-actions' }, btn('Fechar loop', aeCloseLoop, 'Último quadro = primeiro quadro, em todos os ossos'), btn('Reamostrar', aeResample, 'Um quadro por 1/fps em todos os ossos (ao reamostrar, os tempos livres viram a grade)')), U.notes),
    aeSecEl('Osso selecionado', true, U.boneName, el('div', { class: 'ed-sk-row' }, U.bGizR, U.bGizT, U.bSpace), U.eulerBox, U.posBox, U.ikWarn,
      el('div', { class: 'ed-checks' }, chk('Simetria L↔R ao editar', () => AE.sym, v => { AE.sym = v; }, 'O osso espelho recebe o espelho da pose (feito pelo mundo, vale para qualquer esqueleto simétrico)')),
      el('div', { class: 'ed-sk-row' }, btn('Inserir quadro (I)', aeInsertKey, 'Quadro-chave deste osso no tempo atual, com o valor que ele tem agora'), btn('Apagar (Del)', aeDeleteKeys, 'Apaga os quadros selecionados na linha do tempo, ou o deste osso no tempo atual')),
      el('div', { class: 'ed-sk-row' }, btn('Todos os ossos do clipe (⇧I)', () => aeInsertAll(false), 'Quadro-chave em todos os ossos que o clipe já anima'), btn('Todos do ator', () => aeInsertAll(true), 'Cria trilha em todos os ossos do ator (máx. 64 ossos)'))),
    aeSecEl('Pose', false, U.scope, el('div', { class: 'ed-sk-row' }, btn('Copiar (Ctrl+C)', aeCopyPose), btn('Colar (Ctrl+V)', aePastePose)), el('div', { class: 'ed-checks' }, chk('Colar espelhado (E↔D)', () => AE.pasteMirror, v => { AE.pasteMirror = v; }, 'Cola a pose no lado oposto do corpo')),
      el('div', { class: 'ed-sk-row' }, btn('Espelhar pose (M)', aeMirrorPoseOp, 'Troca esquerda e direita da pose neste tempo')), U.clipHint = el('p', { class: 'ed-hint' })),
    aeSecEl('Quadros', false, el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Suavizar'), el('div', { class: 'ae-inl' }, U.smooth, btn('Aplicar', aeSmooth, 'Aproxima cada quadro da média dos vizinhos (osso selecionado ou quadros selecionados). A interpolação em jogo é sempre slerp/linear.'))),
      el('div', { class: 'ed-sk-row' }, btn('Seleção ×0,5', () => aeScaleSel(0.5), 'Escala no tempo os quadros selecionados em torno do tempo atual'), btn('Seleção ×2', () => aeScaleSel(2)), btn('Seleção ×0,8', () => aeScaleSel(0.8)), btn('×1,25', () => aeScaleSel(1.25))),
      el('p', { class: 'ed-hint' }, 'Na linha do tempo: arraste os losangos para mover; Ctrl/Alt+arrastar duplica; Shift soma à seleção; arraste no vazio para selecionar por caixa; Ctrl+roda zoom; roda rola; botão do meio arrasta.')),
    aeSecEl('Dedos (curvar a mão)', false, U.fingBox = el('div', {})),
    aeSecEl('IK de mãos e pés', true, U.ikBox),
    aeSecEl('Eventos', false, U.evBox),
    aeSecEl('Visualização', false, el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Roupa'), U.skin), el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Arma'), U.weapon), el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Composição'), U.comp),
      el('div', { class: 'ed-field ae-baserow' }, el('span', { class: 'ed-lab' }, 'Clipe base'), U.baseSel), el('div', { class: 'ed-field ae-toprow' }, el('span', { class: 'ed-lab' }, 'Clipe por cima'), U.topSel), U.dl,
      el('div', { class: 'ed-checks' }, chk('Esqueleto de ajuda', () => AE.showSkel, v => { AE.showSkel = v; }), chk('Ocultar malha', () => AE.hideMesh, v => { AE.hideMesh = v; if (aeA()) aeA().mesh.visible = !v; }),
        chk('Braço/mão como no jogo', () => AE.gameArm, v => { AE.gameArm = v; }, 'Com arma: aplica o alinhamento do braço ao cano e o IK da mão esquerda do jogo por cima da pose')),
      el('p', { class: 'ed-hint' }, 'Clipe parcial (só alguns ossos, como tiro/mira): "Sobre uma base" toca o clipe como camada em cima de outro (ex.: IDLE_stance), igual ao jogo. GunMove_*: "pose por cima" usa o clipe de tiro da arma nos braços.')),
    el('div', { class: 'ed-actions' }, el('button', { class: 'primary', onclick: () => aeSetOn(false) }, 'Concluir')));
}
function aeRefreshAll() {
  const U = AE.ui; if (!U.syncs || !AE.panel) return; U.syncs.forEach(f => f());
  U.load.textContent = AE.loading ? 'Carregando personagem, armas e lista de clipes…' : ''; U.load.hidden = !U.load.textContent;
  const d = AE.doc, A = aeA(); [U.name, U.fps, U.dur, U.notes].forEach(x => { x.disabled = !d; });
  if (document.activeElement !== U.name) U.name.value = d ? d.name : ''; if (document.activeElement !== U.fps) U.fps.value = d ? d.fps : ''; if (document.activeElement !== U.dur) U.dur.value = d ? d.duration : ''; if (document.activeElement !== U.notes) U.notes.value = d ? d.notes : '';
  U.clipInfo.textContent = ''; U.clipInfo.append(d ? el('span', {}, el('b', {}, d.id), ' · base ' + (d.base || '—') + ' · ' + Object.keys(d.bones).length + ' ossos · ' + d.ik.length + ' IK · ' + d.events.length + ' eventos') : el('span', { class: 'ed-hint' }, AE.preview ? 'Visualizando ' + AE.preview.name + ' (original, somente leitura)' : 'Nenhum clipe aberto'));
  const i = AE.sel; U.boneName.textContent = ''; U.eulerBox.textContent = ''; U.posBox.textContent = ''; AE.liveNums = [];
  if (A && i >= 0) {
    U.boneName.append(el('b', {}, aeLabel(A.info[i].name)), el('small', {}, ' ' + A.info[i].name + ' · id ' + A.info[i].id + (d && AE_HAS(d.bones, String(A.info[i].id)) ? ' · animado' : ' · fora do clipe (repouso)')));
    U.eulerBox.append(aeVec('Rotação (°)', aeEulerFields()));
    if (d && (AE.doc.bones[String(A.info[i].id)] || {}).pos) { const pf = aePosFields(); U.posBox.append(aeVec('Posição (m)', pf)); if (A.info[i].id === 0) U.posBox.append(el('p', { class: 'ed-hint' }, 'A posição da raiz é o movimento do clipe (root motion): não aparece na pose, mas define a velocidade natural do passo.')); }
  } else U.boneName.append(el('span', { class: 'ed-hint' }, 'Clique numa articulação no corpo, numa linha da linha do tempo ou na lista de ossos.'));
  U.bGizR.classList.toggle('on', AE.gizmo === 'rotate' && AE.target === 'bone'); U.bGizT.classList.toggle('on', AE.gizmo === 'translate' && AE.target === 'bone'); U.bGizT.disabled = !(d && i >= 0 && aeCanTranslate(i)); U.bSpace.textContent = 'Eixos: ' + (AE.space === 'local' ? 'do osso' : 'do mundo');
  U.scope.value = AE.scope; U.clipHint.textContent = AE.clip ? 'Copiado: ' + Object.keys(AE.clip.bones).length + ' ossos de t=' + AE_R2(AE.clip.t) + ' s (' + AE.clip.scope + ')' : 'Nada copiado.';
  aeRefreshFingers(); aeRefreshIk(); aeRefreshEvents(); aeRefreshViz(); aeRefreshClips(); aeRefreshBones(); aeRefreshTransport(); aeRefreshStatus(); aeRefreshFields(); AE.tl.dirty = true;
  const ik = AE.doc && i >= 0 ? AE.doc.ik.find(e => AE_CHAINS[e.chain].includes(A.info[i].name)) : null; U.ikWarn.hidden = !ik; U.ikWarn.textContent = ik ? 'Este osso faz parte do IK da ' + AE_CH_PT[ik.chain] + ': o IK refaz a pose da cadeia por cima do quadro-chave. Use "Bake IK" para virar rotações ou ajuste o IK.' : '';
}
function aeRefreshViz() {
  const U = AE.ui; if (U.skin.options.length !== PLAYER_SKINS.length) { U.skin.textContent = ''; PLAYER_SKINS.forEach(s => U.skin.append(el('option', { value: s }, s.replace(/^player_/, '')))); } U.skin.value = AE.skin;
  const n = typeof weapons !== 'undefined' ? weapons.items.length : 0; if (U.weapon.options.length !== n + 1) { U.weapon.textContent = ''; U.weapon.append(el('option', { value: -1 }, 'Nenhuma')); weapons.items.forEach((w, k) => U.weapon.append(el('option', { value: k }, w.name || w.id))); } U.weapon.value = AE.wi;
  U.comp.value = AE.compose; U.baseSel.value = AE.baseName; U.topSel.value = AE.topName; const show = (sel, on) => { U.comp.parentNode.parentNode.querySelectorAll(sel).forEach(x => { x.hidden = !on; }); }; show('.ae-baserow', AE.compose === 'under'); show('.ae-toprow', AE.compose === 'over');
  if (!U.dl.children.length && AE.ifp.length) AE.ifp.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(k => U.dl.append(el('option', { value: k.name }))); U.skin.disabled = U.weapon.disabled = !AE.ready;
}
function aeRefreshIk() {
  const U = AE.ui, box = U.ikBox; box.textContent = ''; U.ikLive = {}; if (!AE.doc) { box.append(el('p', { class: 'ed-hint' }, 'Abra um clipe editável para usar IK.')); return; }
  for (const chain of ['lhand', 'rhand', 'lfoot', 'rfoot']) {
    const e = aeIkEntry(chain), c = el('div', { class: 'ae-ik' + (AE.ikSel === chain ? ' on' : '') }), en = el('input', { type: 'checkbox' }); en.checked = !!e; en.addEventListener('change', () => aeIkToggle(chain, en.checked));
    const dist = el('span', { class: 'ae-dist' }); U.ikLive[chain] = dist;
    c.append(el('div', { class: 'ae-ikh' }, el('label', { class: 'ed-check' }, en, AE_CH_PT[chain][0].toUpperCase() + AE_CH_PT[chain].slice(1)), dist, e ? el('button', { class: AE.target === 'ik' && AE.ikSel === chain ? 'on' : '', onclick: () => { const was = AE.target === 'ik' && AE.ikSel === chain; AE.ikSel = chain; AE.target = was ? 'bone' : 'ik'; aeAttachGizmo(); aeRefreshAll(); }, title: 'Mover o alvo (esfera azul) com o gizmo' }, 'Gizmo no alvo') : null));
    if (e) {
      const sp = el('select', { 'aria-label': 'Espaço do alvo' }, [['weapon', 'Arma'], ['bone', 'Osso'], ['actor', 'Corpo'], ['world', 'Mundo']].map(([v, t]) => el('option', { value: v, selected: v === e.target.space }, t))); sp.addEventListener('change', () => { AE.ikSel = chain; aeIkSetSpace(chain, sp.value); });
      c.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Alvo no espaço'), sp));
      if (e.target.space === 'bone') { const bi = el('input', { type: 'number', min: 0, max: 9999, step: 1, value: e.target.bone }); bi.addEventListener('change', () => aeChange(() => { e.target.bone = Math.max(0, Math.round(+bi.value || 0)); })); c.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Osso (id)'), bi)); }
      const P = () => aeIkPos(e) || [0, 0, 0], setP = k => v => { const p = P().slice(); p[k] = v; e.target.pos = p.map(AE_R4); };
      const pf = [0, 1, 2].map(k => aeNum('XYZ'[k], 0.005, () => AE_R4(P()[k]), setP(k))); c.append(aeVec('Alvo (m)', pf));
      c.append(el('div', { class: 'ed-sk-row' }, el('button', { onclick: () => { AE.ikSel = chain; aeIkSnapToHand(chain); }, title: 'Grava a posição atual da mão/pé como alvo' }, 'Alvo = posição atual'),
        chain === 'lhand' && e.target.space === 'weapon' ? el('button', { onclick: () => aeChange(() => { e.target.pos = null; }), title: 'Volta a seguir o ponto lhand da arma (sockets)' }, 'Ponto da arma') : null));
      const hasRot = !!e.target.rot, rc = el('input', { type: 'checkbox' }); rc.checked = hasRot; rc.addEventListener('change', () => aeChange(() => { if (rc.checked) e.target.rot = [0, 0, 0]; else delete e.target.rot; })); c.append(el('div', { class: 'ed-checks' }, el('label', { class: 'ed-check', title: 'Orientação final da mão/pé = espaço do alvo × Euler' }, rc, 'Orientar mão/pé')));
      if (hasRot) c.append(aeVec('Giro (°)', [0, 1, 2].map(k => aeNum('R' + 'XYZ'[k], 0.5, () => AE_R2(e.target.rot[k]), v => { e.target.rot[k] = v; }))));
      const hc = el('input', { type: 'checkbox' }); hc.checked = !!e.hint; hc.addEventListener('change', () => aeChange(() => { e.hint = hc.checked ? [0, -1, 0] : null; }));
      c.append(el('div', { class: 'ed-checks' }, el('label', { class: 'ed-check', title: 'Direção (espaço do corpo: x esquerda, y cima, z frente) para onde o cotovelo/joelho aponta' }, hc, 'Dica do cotovelo/joelho')));
      if (e.hint) { c.append(aeVec('Direção', [0, 1, 2].map(k => aeNum('XYZ'[k], 0.1, () => AE_R2(e.hint[k]), v => { const h = e.hint.slice(); h[k] = v; if (Math.hypot(h[0], h[1], h[2]) > 1e-3) e.hint = h; })))); c.append(el('div', { class: 'ed-sk-row' }, [['Baixo', [0, -1, 0]], ['Fora', [chain[0] === 'l' ? 1 : -1, 0, 0]], ['Trás', [0, 0, -1]], ['Frente', [0, 0, 1]], ['Cima', [0, 1, 0]]].map(([n, v]) => el('button', { onclick: () => aeChange(() => { e.hint = v.slice(); }) }, n)))); }
      const wv = aeWeightAt(e.weight, AE.t), sl = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: wv }), wl = el('span', { class: 'ed-sv' }, AE_R2(wv));
      sl.addEventListener('input', () => { aeBegin(); aeInsert(e.weight, [AE_R6(AE.t), +sl.value]); wl.textContent = AE_R2(+sl.value); AE.syncDirty = true; AE.dirty = true; AE.tl.dirty = true; }); sl.addEventListener('change', aeEnd);
      c.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab', title: 'Cria/atualiza um quadro de peso no tempo atual (losangos azuis na linha do tempo)' }, 'Peso em t'), el('div', { class: 'ed-slider' }, sl, wl)),
        el('div', { class: 'ed-sk-row' }, el('button', { onclick: () => aeChange(() => { e.weight = [[0, 1]]; }) }, 'Peso 1 sempre'), el('button', { onclick: () => aeChange(() => { const D = AE.doc.duration; e.weight = [[0, 0], [AE_R6(D * 0.15), 1], [AE_R6(D * 0.85), 1], [AE_R6(D), 0]]; }), title: 'Entra e sai suave nas pontas' }, 'Entrar/sair'), el('button', { class: 'danger', onclick: () => aeBakeIk(chain), title: 'Lê a pose com IK em toda a duração, grava como rotações dos 3 ossos da cadeia (substitui as trilhas deles) e remove o IK' }, 'Bake IK → quadros')));
    }
    box.append(c);
  }
}
function aeRefreshFingers() {
  const U = AE.ui, box = U.fingBox; if (!box) return; box.textContent = ''; const n = [aeFingerBones('l').length, aeFingerBones('r').length];
  if (!AE.doc) { box.append(el('p', { class: 'ed-hint' }, 'Abra um clipe editável.')); return; }
  if (!n[0] && !n[1]) { box.append(el('p', { class: 'ed-hint' }, 'Sem ossos de dedo neste personagem (o rig estendido não carregou). Os ossos aparecem sozinhos na lista quando existem.')); return; }
  [['l', 'Mão esquerda'], ['r', 'Mão direita']].forEach(([s, nm], k) => {
    if (!n[k]) return; const sl = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0, 'aria-label': 'Curvar ' + nm }), lv = el('span', { class: 'ed-sv' }, '0');
    sl.addEventListener('input', () => { if (!AE.doc) return; aeBegin(); aeCurl(s, +sl.value); lv.textContent = AE_R2(+sl.value); AE.syncDirty = true; AE.dirty = true; AE.tl.dirty = true; }); sl.addEventListener('change', aeEnd);
    box.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab', title: 'Grava quadro-chave no tempo atual em todos os ' + n[k] + ' ossos de dedo' }, nm), el('div', { class: 'ed-slider' }, sl, lv)),
      el('div', { class: 'ed-sk-row' }, [['Aberta', 0], ['Relaxada', 0.35], ['Meio', 0.6], ['Punho', 1]].map(([t, v]) => el('button', { onclick: () => aeCurlSet(s, v) }, t))));
  });
  box.append(el('p', { class: 'ed-hint' }, 'Grava rotações em Z (curvatura) de todos os dedos da mão no tempo atual; refine cada dedo na lista de ossos (grupo Dedos, colapsado por mão).'));
}
function aeRefreshEvents() {
  const U = AE.ui, box = U.evBox; box.textContent = ''; if (!AE.doc) { box.append(el('p', { class: 'ed-hint' }, 'Abra um clipe editável.')); return; }
  AE.doc.events.forEach((ev, i) => {
    const t = el('input', { type: 'number', step: 0.01, min: 0, value: ev.t, 'aria-label': 'Tempo do evento' }), n = el('input', { type: 'text', value: ev.name, maxlength: 64, 'aria-label': 'Nome do evento' });
    t.addEventListener('change', () => aeChange(() => { ev.t = AE_R6(Math.max(0, Math.min(AE.doc.duration, +t.value || 0))); AE.doc.events.sort((a, b) => a.t - b.t); }));
    n.addEventListener('change', () => aeChange(() => { if (/^[A-Za-z0-9_.-]{1,64}$/.test(n.value)) ev.name = n.value; else edToast('Nome do evento: A-Z a-z 0-9 _ . - (sem espaços).', 3500); }));
    box.append(el('div', { class: 'ae-ev' }, t, n, el('button', { class: 'danger', title: 'Apagar evento', onclick: () => aeChange(() => { AE.doc.events.splice(i, 1); }) }, '×')));
  });
  box.append(el('div', { class: 'ed-sk-row' }, el('button', { onclick: () => aeAddEvent(AE.t, 'evento') }, 'Adicionar no tempo atual'), el('span', { class: 'ed-hint' }, '(ou duplo clique na linha "Eventos")')));
}
function aeRefreshTransport() {
  const U = AE.ui; if (!U.tPlay) return; U.tPlay.textContent = AE.playing ? 'Pausar' : 'Tocar'; U.tDur.textContent = AE_R2(aeDur()); if (document.activeElement !== U.tTime) U.tTime.value = Math.round(AE.t * 1000) / 1000;
  U.tFrame.textContent = '(q ' + Math.round(AE.t * aeFps()) + ')'; ['loopPlay', 'autoKey', 'snap'].forEach(k => { if (U['c_' + k]) U['c_' + k].checked = !!AE[k]; }); AE.tl.dirty = true;
}
function aeRefreshStatus() {
  const U = AE.ui; if (!U.status) return; U.status.textContent = AE.err ? '⚠ clipe inválido (veja acima)' : !AE.doc ? '' : AE.dirty ? '● Alterações não salvas' : 'Tudo salvo'; U.status.className = 'ed-sk-status' + (AE.dirty || AE.err ? ' dirty' : '');
  U.undo.disabled = !AE.undo.length; U.redo.disabled = !AE.redo.length; U.save.disabled = !AE.doc; U.test.disabled = !AE.doc;
  const b = document.getElementById('edAnim'); if (b) b.classList.toggle('dirty', AE.dirty);
  if (AE.bar) { AE.bar.hidden = !AE.ready; AE.bar.textContent = (AE.doc ? AE.doc.id : AE.preview ? AE.preview.name + ' (original)' : '') + ' · ' + AE_R2(AE.t) + ' / ' + AE_R2(aeDur()) + ' s' + (AE.dirty ? ' · ● não salvo' : '') + (AE.sel >= 0 && aeA() ? ' · ' + aeLabel(aeA().info[AE.sel].name) : ''); }
}
function aeRefreshStatusFast() { AE.dirty = true; AE.tl.dirty = true; }
function aeRefreshFields() { const act = document.activeElement; for (const n of AE.liveNums || []) if (n.inp !== act) { try { n.inp.value = n.get(); } catch (e) { /* osso mudou */ } } }
function aeRefreshLive() {                                   // a cada ~80 ms: relógio, números e distância do IK (sem recriar o painel)
  const U = AE.ui; if (document.activeElement !== U.tTime) U.tTime.value = Math.round(AE.t * 1000) / 1000; U.tFrame.textContent = '(q ' + Math.round(AE.t * aeFps()) + ')';
  if (AE.bar && !AE.bar.hidden) aeRefreshStatus();
  aeRefreshFields();
  if (AE.doc && U.ikLive) for (const chain in U.ikLive) {
    const e = aeIkEntry(chain), s = U.ikLive[chain]; if (!e) { s.textContent = ''; continue; }
    const w = aeIkWorld(e, _aeV2.clone()), h = aeIkHandPos(chain, _aeV.clone()), wt = aeWeightAt(e.weight, AE.t);
    s.textContent = w && h ? 'distância mão-alvo: ' + AE_R2(w.distanceTo(h) * 100) + ' cm · peso ' + AE_R2(wt) : 'alvo indisponível' + (e.target.space === 'weapon' ? ' (equipe uma arma)' : ''); s.className = 'ae-dist' + (w && h && w.distanceTo(h) > 0.03 && wt > 0.5 ? ' bad' : '');
  }
}
