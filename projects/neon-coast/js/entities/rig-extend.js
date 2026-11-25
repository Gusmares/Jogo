/* NEON COAST — Esqueleto estendido: dedos (15 ossos por mão) sobre o esqueleto de 32 ossos do SA.
   Os ossos novos e o repeso vêm de assets/rigs/<skinId>.rig.json (gerado por engine/tools/skeleton-extend.js; assets/ não vai para o git).
   Sem o arquivo (ou sem este script), o jogo é idêntico ao de antes. Detalhes: engine/docs/esqueleto.md
   API:  rigExtendActor(a, {force})  -> Promise<boolean>   estende o ator (troca esqueleto e malha, sem pulo visual)
         rigCurl(a, 'l'|'r', 0..1, {digits:[0..4]})         curva a mão (0 = repouso, 1 = punho)
         rigPoseBone(a, 'L_Index2', x, y, z)                rotação Euler (rad, eixos locais do osso: X ao longo do osso, Y palma, Z curva para a palma)
         rigClear(a)  rigApply(a, reset)  rigBoneNames(a)
   Flag RIG_FINGERS: false | 'off' (desligado) · true | 'player' (atores SEM LOD: jogador e visualizações de menu/celular) · 'all' (também NPCs/policiais).
   Convenção dos ossos novos: X = ao longo do osso (para a ponta), Y = direção da palma, Z = eixo de curvatura (rotação positiva em Z curva para a palma). */
'use strict';
(function () {

window.RIG_FINGERS = 'player';
const RIG_BASE = 'assets/rigs/';
let rigIndexPromise = null;
const rigFiles = {};
const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rq3 = new THREE.Quaternion(), _re = new THREE.Euler(), _rId = new THREE.Quaternion();
const RIG_CURL_MAX = [[0.55, 0.65, 0.85], [1.45, 1.7, 1.15], [1.5, 1.75, 1.2], [1.5, 1.75, 1.2], [1.5, 1.8, 1.2]];   // por dedo (polegar..mínimo) e junta, em rad, para curl = 1

/* máximo (rad) de curvatura do dedo `digit` (0 polegar .. 4 mínimo) na junta `joint` (1..3), para curl = 1; fora da tabela = 1,2 */
function rigCurlMax(digit, joint) { const r = RIG_CURL_MAX[digit]; return r && r[joint - 1] !== undefined ? r[joint - 1] : 1.2; }
function rigAvailable(id) {
  if (!rigIndexPromise) rigIndexPromise = fetch(RIG_BASE + 'index.json').then(r => r.ok ? r.json() : null).catch(() => null);
  return rigIndexPromise.then(ix => !!(ix && ix.skins && ix.skins[id]));
}
function rigLoad(id) {
  if (!rigFiles[id]) rigFiles[id] = rigAvailable(id).then(ok => ok ? fetch(RIG_BASE + id + '.rig.json').then(r => r.ok ? r.json() : null) : null).catch(() => null);
  return rigFiles[id];
}
/* chamado no fim de makeActor: estende sozinho conforme RIG_FINGERS (sem erro se não houver rig) */
function rigHook(a, useLod) {
  const F = window.RIG_FINGERS, m = F === true ? 'player' : !F || F === 'off' ? 'off' : F === 'all' ? 'all' : 'player';      // valor desconhecido = 'player' (nunca 'all': estender NPCs custa caro)
  if (m === 'off' || (m === 'player' && useLod)) return;
  rigExtendActor(a).catch(e => console.warn('rig-extend:', e && e.message ? e.message : e));
}
/* geometria com os pesos novos (cache por tipo de skin; compartilha posição/normal/uv/índices com a original) */
function rigPatchedGeo(src, patch) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, src.attributes[k]);
  g.setIndex(src.index); src.groups.forEach(gr => g.addGroup(gr.start, gr.count, gr.materialIndex));
  const si = Uint16Array.from(src.attributes.skinIndex.array), sw = Float32Array.from(src.attributes.skinWeight.array);
  if (patch) for (let n = 0; n < patch.v.length; n++) { const v = patch.v[n]; for (let k = 0; k < 4; k++) { si[v * 4 + k] = patch.i[n * 4 + k]; sw[v * 4 + k] = patch.w[n * 4 + k]; } }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}
async function rigExtendActor(a, opts) {
  opts = opts || {};
  if (!a || !a.type || a.rig) return !!(a && a.rig);
  const rig = await rigLoad(a.type.id); if (!rig || a.rig) return !!(a && a.rig);
  if (rig.baseBones !== a.bones.length) return false;                               // esqueleto não é o do rig
  const type = a.type;
  // valida o rig inteiro ANTES de mexer no ator: rig malformado não pode deixar o ator pela metade
  const bad = rigValidate(rig, a); if (bad) { console.warn('rig-extend: rig "' + type.id + '" ignorado: ' + bad); return false; }
  if (!type.rigGeo) { type.rigGeo = { base: rigPatchedGeo(type.geo, rig.geoms.base), lods: (type.lods || []).map((l, i) => rigPatchedGeo(l, rig.geoms['lod' + (i + 1)])) }; }
  // ossos novos (filhos dos ossos da mão), em repouso; o esqueleto antigo continua valendo até a troca. Qualquer falha daqui em diante desfaz tudo (rollback)
  const snap = { info: a.info, nBones: a.bones.length, nRestW: a.restW.length, nQ: a.ap ? a.ap.restQ.length : 0, nP: a.ap ? a.ap.restP.length : 0, added: [], ids: [], geo: a.mesh.geometry, setLod: a.setLod, wrapped: !!(a.ap && a.ap._rigWrapped), ap: a.ap, upd: a.ap && a.ap.update };
  const old = a.mesh.skeleton; let swapped = false;
  try {
    a.info = a.info.slice();
    const R = { id: type.id, driveSA: !!rig.driveSA && opts.drive !== false, bones: {}, rest: {}, user: {}, hasUser: false, dirty: true, side: { l: [], r: [] } };
    const inverses = old.boneInverses.slice();
    rig.bones.forEach(b => {
      const bone = new THREE.Bone(); bone.name = b.name; new THREE.Matrix4().fromArray(b.local).decompose(bone.position, bone.quaternion, bone.scale);
      const pi = a.index[b.parent], idx = a.bones.length; a.bones[pi].add(bone); snap.added.push({ bone, parent: a.bones[pi], name: b.name, id: b.id });
      a.bones.push(bone); inverses.push(new THREE.Matrix4().fromArray(b.inverse)); a.index[b.name] = idx;
      a.info.push({ id: b.id, name: b.name, parent: pi, local: b.local, inverse: b.inverse });
      a.restW.push(a.restW[pi].clone().multiply(bone.quaternion));
      if (a.ap) { a.ap.idToIdx[b.id] = idx; a.ap.restQ.push(bone.quaternion.clone()); a.ap.restP.push(bone.position.clone()); }
      R.bones[b.name] = idx; R.rest[b.name] = bone.quaternion.clone();
      R.side[b.side].push({ name: b.name, idx, id: b.id, digit: b.digit, joint: b.joint, parent: b.parent, parentIdx: pi });
    });
    // rotações de repouso acumuladas (espaço da mão) dos ossos novos, para repassar a animação dos dedos do SA (lfinger/lfinger01)
    for (const s of ['l', 'r']) {
      const hand = a.index[s + 'hand'], f35 = a.index[s + 'finger'], f36 = a.index[s + 'finger01'], q35 = new THREE.Matrix4().fromArray(a.info[f35].local), q36 = new THREE.Matrix4().fromArray(a.info[f36].local);
      const r35 = new THREE.Quaternion(), r36 = new THREE.Quaternion(), p_ = new THREE.Vector3(), s_ = new THREE.Vector3(); q35.decompose(p_, r35, s_); q36.decompose(p_, r36, s_);
      const HR = {}; R.side[s].forEach(x => { HR[x.name] = x.parentIdx === hand ? R.rest[x.name].clone() : HR[a.bones[x.parentIdx].name].clone().multiply(R.rest[x.name]); x.HR = HR[x.name]; x.parentHR = x.parentIdx === hand ? new THREE.Quaternion() : HR[a.bones[x.parentIdx].name].clone(); });
      R[s] = { hand, f35, f36, r35, r36, restOf35: r35.clone(), dA: new THREE.Quaternion(), dB: new THREE.Quaternion() };
    }
    a.group.updateMatrixWorld(true);
    // troca esqueleto + geometria de uma vez (mesmo quadro): os vértices dos dedos mantêm a pose porque os ossos novos estão em repouso sobre a mão
    const sk = new THREE.Skeleton(a.bones, inverses);
    a.mesh.bind(sk, a.mesh.bindMatrix); swapped = true;
    a.mesh.geometry = a.lodOn ? type.rigGeo.lods[a.lod - 1] : type.rigGeo.base;
    a.setLod = l => { if (!a.lodOn || l === a.lod) return; a.lod = l; a.mesh.geometry = type.rigGeo.lods[l - 1]; };
    a.rig = R;
    if (a.ap && !a.ap._rigWrapped) { const orig = a.ap.update; a.ap.update = function (dt) { orig.call(this, dt); rigApply(a); }; a.ap._rigWrapped = true; }
    rigApply(a, true);
  } catch (e) {
    console.warn('rig-extend: falha ao estender o ator (' + type.id + '), voltando ao esqueleto original:', e && e.message ? e.message : e);
    for (const x of snap.added) { if (x.parent) x.parent.remove(x.bone); delete a.index[x.name]; if (a.ap && a.ap.idToIdx) delete a.ap.idToIdx[x.id]; }
    a.bones.length = snap.nBones; a.restW.length = snap.nRestW; a.info = snap.info;
    if (a.ap) { a.ap.restQ.length = snap.nQ; a.ap.restP.length = snap.nP; if (!snap.wrapped) { a.ap.update = snap.upd; a.ap._rigWrapped = false; } }
    if (swapped) { try { a.mesh.bind(old, a.mesh.bindMatrix); } catch (e2) { /* mantém o que der */ } }
    a.mesh.geometry = snap.geo; a.setLod = snap.setLod; a.rig = null;
    try { a.group.updateMatrixWorld(true); } catch (e3) { /* ignora */ }
    return false;
  }
  old.dispose();
  return true;
}
/* confere o rig contra o ator ANTES de qualquer alteração: devolve a mensagem do primeiro problema, ou null se está tudo certo */
function rigValidate(rig, a) {
  if (!rig || typeof rig !== 'object' || !Array.isArray(rig.bones) || !rig.bones.length || rig.bones.length > 200) return 'lista de ossos ausente ou grande demais';
  if (!rig.geoms || typeof rig.geoms !== 'object') return 'geoms ausente';
  for (const s of ['l', 'r']) for (const n of [s + 'hand', s + 'finger', s + 'finger01']) { const i = a.index[n]; if (i === undefined || !a.bones[i] || !a.info[i] || !Array.isArray(a.info[i].local) || a.info[i].local.length !== 16) return 'o ator não tem o osso "' + n + '"'; }
  const names = new Set(), mat = m => Array.isArray(m) && m.length === 16 && m.every(Number.isFinite);
  for (let i = 0; i < rig.bones.length; i++) {
    const b = rig.bones[i], w = 'bones[' + i + ']';
    if (!b || typeof b !== 'object') return w + ' inválido';
    if (typeof b.name !== 'string' || !b.name || names.has(b.name) || a.index[b.name] !== undefined) return w + ': nome ausente, repetido ou já existente';
    if (!mat(b.local) || !mat(b.inverse)) return w + ': local/inverse devem ter 16 números';
    if (b.side !== 'l' && b.side !== 'r') return w + ': side deve ser "l" ou "r"';
    if (!Number.isInteger(b.digit) || b.digit < 0 || b.digit > 4 || !Number.isInteger(b.joint) || b.joint < 1 || b.joint > 3) return w + ': digit (0-4) ou joint (1-3) inválido';
    if (b.id === undefined || b.id === null) return w + ': falta o id';
    if (typeof b.parent !== 'string' || (a.index[b.parent] === undefined && !names.has(b.parent))) return w + ': pai "' + b.parent + '" não existe';
    names.add(b.name);
  }
  return null;
}
function rigBoneNames(a) { return a && a.rig ? Object.keys(a.rig.bones) : []; }
/* grava a pose dos ossos novos: repouso * usuário, mais (se o modelo tem pesos nos dedos do SA) a animação lfinger/lfinger01 repassada.
   reset = true: grava mesmo sem usuário/animação (depois de poseActor, que zera todos os ossos). Ossos que o clipe atual anima (ids novos no clipe) não são tocados. */
function rigApply(a, reset) {
  const R = a && a.rig; if (!R) return;
  if (!R.driveSA && !R.hasUser && !R.dirty && !reset) return;
  const cur = ap_curClip(a);
  for (const s of ['l', 'r']) {
    const S = R[s]; let dA = null, dB = null;
    if (R.driveSA) {
      const q35 = a.bones[S.f35].quaternion, q36 = a.bones[S.f36].quaternion;
      dA = S.dA.copy(q35).multiply(_rq2.copy(S.r35).invert());                                           // delta do osso 35 no espaço da mão
      const d36 = _rq.copy(q36).multiply(_rq2.copy(S.r36).invert()), r35 = S.r35;
      dB = S.dB.copy(r35).multiply(d36).multiply(_rq3.copy(r35).invert());                               // delta do 36, passado para o espaço da mão
      _rq3.copy(dB); dB.copy(_rId).slerp(_rq3, 0.5);                                                       // metade em cada uma das duas juntas distais
    }
    for (const x of R.side[s]) {
      if (cur && cur.has(x.id)) continue;
      const bone = a.bones[x.idx], u = R.user[x.name];
      const hasDrive = R.driveSA && x.digit > 0;
      if (!hasDrive && !u && !R.dirty && !reset) continue;
      bone.quaternion.copy(R.rest[x.name]);
      if (hasDrive) {
        if (x.joint === 1) bone.quaternion.premultiply(dA);
        else { const ph = x.parentHR; _rq.copy(ph).invert().multiply(dB).multiply(ph); bone.quaternion.premultiply(_rq); }
      }
      if (u) bone.quaternion.multiply(u);
    }
  }
  R.dirty = false;
}
function ap_curClip(a) {
  const c = a.ap && a.ap.cur; if (!c) return null;
  return c._rigIds || (c._rigIds = new Set(c.nodes.map(n => n.bone)));
}
function rigPoseBone(a, name, x, y, z) {
  const R = a && a.rig; if (!R || R.bones[name] === undefined) return false;
  if (x === null || x === undefined) delete R.user[name]; else R.user[name] = new THREE.Quaternion().setFromEuler(_re.set(x, y || 0, z || 0, 'XYZ'));
  R.hasUser = Object.keys(R.user).length > 0; R.dirty = true; rigApply(a, true); return true;
}
function rigCurl(a, side, amount, opts) {
  const R = a && a.rig; if (!R) return false; const digits = (opts && opts.digits) || [0, 1, 2, 3, 4];
  for (const x of R.side[side]) { if (!digits.includes(x.digit)) continue; const k = amount * rigCurlMax(x.digit, x.joint); if (Math.abs(k) < 1e-5) delete R.user[x.name]; else R.user[x.name] = new THREE.Quaternion().setFromEuler(_re.set(0, 0, k, 'XYZ')); }
  R.hasUser = Object.keys(R.user).length > 0; R.dirty = true; rigApply(a, true); return true;
}
function rigClear(a) { const R = a && a.rig; if (!R) return; R.user = {}; R.hasUser = false; R.dirty = true; rigApply(a, true); }
  Object.assign(window, { rigCurlMax, rigHook, rigExtendActor, rigApply, rigPoseBone, rigCurl, rigClear, rigBoneNames, rigLoad });
})();
