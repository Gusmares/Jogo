/* NEON COAST — Personagem do jogador: skin com esqueleto de 32 ossos e animações reais do GTA San Andreas (arquivos .ifp) */
'use strict';

const PLAYER_SKINS = ['player_argentina', 'player_bbthin', 'player_emmet'];
const IFP_FILES = ['ped', 'urbanize', 'colt45', 'silenced', 'shotgun', 'rifle', 'uzi', 'bikes', 'bikeh', 'dancing', 'misc', 'swim', 'fight_e', 'fight_b', 'int_house', 'buddy',
  'baseball', 'beach', 'knife', 'muscular', 'rob_bank', 'shop', 'wayfarer', 'sword', 'python', 'grenade', 'chainsaw', 'parachute', 'quad', 'sex_car'];
const ifpLoaded = Promise.all(IFP_FILES.map(f => loadIfp(f, 'assets/anims/' + f + '.ifp').then(p => { ifpReady[f] = p; })));

/* gestos (tecla G): animações reais de vários pacotes */
const EMOTES = [
  ['handsup', 'Mãos ao alto'], ['cower', 'Agachado, com medo'], ['IDLE_chat', 'Conversando'], ['Idle_Gang1', 'Pose de gangue'], ['phone_talk', 'No celular'],
  ['bd_clap', 'Aplaudindo'], ['dance_loop', 'Dançando'], ['dnce_M_a', 'Dança A'], ['dnce_M_b', 'Dança B'], ['dnce_M_c', 'Dança C'], ['dnce_M_d', 'Dança D'],
  ['DAN_Loop_A', 'Dança de rua'], ['Plyrlean_loop', 'Encostado'], ['XPRESSscratch', 'Coçando'], ['IDLE_HBHB', 'Esperando'], ['IDLE_tired', 'Cansado'], ['Tap_hand', 'Batendo na mão']
];
let emoteIdx = -1, emoteOn = null;
player.actor = null; player.outfit = 0;
let outfitRequest = 0;

function loadPlayerOutfit(i, announce) {
  const request = ++outfitRequest;
  const id = PLAYER_SKINS[((i % PLAYER_SKINS.length) + PLAYER_SKINS.length) % PLAYER_SKINS.length];
  return Promise.all([loadSkin(id), ifpLoaded]).then(([type]) => {
    if (request !== outfitRequest) return false;
    const a = makeActor(type); a.clips = {}; scene.add(a.group);
    if (player.actor) scene.remove(player.actor.group);
    player.actor = a; player.outfit = i;
    player.mesh.traverse(o => { if (o.isMesh) o.visible = false; });         // o boneco de blocos some; a posição continua vindo dele
    if (announce) toast('Roupa ' + (((i % PLAYER_SKINS.length) + PLAYER_SKINS.length) % PLAYER_SKINS.length + 1) + '/' + PLAYER_SKINS.length + ': ' + type.man.name, 1600);
    return true;
  }).catch(e => { console.warn('skin do jogador não carregou', e); return false; });
}
/* todas as roupas civis do catálogo (packs de skins) entram na troca de roupa (O = próxima, Shift+O = anterior) */
const outfitCatalogReady = fetch('assets/models/skins/catalog.json').then(r => { if (!r.ok) throw Error('Catálogo de skins ausente'); return r.json(); }).then(list => {
  for (const sk of list) if (sk.available !== false && !PLAYER_SKINS.includes(sk.id)) PLAYER_SKINS.push(sk.id);
  return list;
});
function cycleOutfit(back) { loadPlayerOutfit(player.outfit + (back ? -1 : 1), true); }
function cycleEmote() {
  if (player.dead || player.car || player.trans) return;
  emoteIdx = (emoteIdx + 1) % EMOTES.length; emoteOn = EMOTES[emoteIdx][0];
  toast('Gesto: ' + EMOTES[emoteIdx][1], 1400);
}

/* chamado a cada quadro com o jogador a pé: posiciona o ator e escolhe a animação */
let lastShotSeen = -1, lastMeleeSeen = -1;
/* inclina o tronco (coluna) em torno do eixo lateral do personagem: a arma, presa à mão, sobe e desce junto com a mira */
const _pq = new THREE.Quaternion(), _pr = new THREE.Quaternion(), _pl = new THREE.Vector3();
function applyAimPitch(a, ang) {
  // a animação nem sempre reescreve os ossos da coluna: desfaz a inclinação do quadro anterior (se o osso ainda está como deixamos) antes de aplicar a nova
  for (const name of ['spine', 'spine1']) {
    const bone = a.bones[a.index[name]]; if (!bone) continue; const st = bone.userData.pitchSt;
    if (st && bone.quaternion.equals(st.after)) bone.quaternion.copy(st.before); bone.userData.pitchSt = null;
  }
  if (Math.abs(ang) < 0.004) return;
  _pl.set(Math.cos(player.h), 0, -Math.sin(player.h));
  for (const [name, f] of [['spine', 0.45], ['spine1', 0.55]]) {
    const b = a.bones[a.index[name]]; if (!b || !b.parent) continue;
    a.group.updateMatrixWorld(true); b.parent.getWorldQuaternion(_pq); _pr.setFromAxisAngle(_pl, -ang * f);
    const before = b.quaternion.clone(), t = _pq.clone().invert().multiply(_pr).multiply(_pq); b.quaternion.premultiply(t); b.userData.pitchSt = { before, after: b.quaternion.clone() };
  }
}
const hasClipP = n => !!findClip(n);
/* arma de uma mão (braço) ou de duas (tronco): o clipe da pistola só define o braço direito, então a direção do cano depende do resto do corpo (andar, correr, inclinar a coluna).
   Depois da pose, gira o braço (ombro) o mínimo necessário para o cano apontar para onde o personagem mira — para a frente, ou para onde a câmera olha ao mirar. */
const _ah = new THREE.Quaternion(), _ab = new THREE.Vector3(), _at = new THREE.Vector3(), _ad = new THREE.Quaternion(), _am = new THREE.Vector3(-1, 0, 0);
/* mão esquerda no guarda-mão do fuzil: IK de dois ossos (ombro-cotovelo-mão) até um ponto fixo da arma (A.lhand, no espaço da arma) */
const _is = new THREE.Vector3(), _ie = new THREE.Vector3(), _iw = new THREE.Vector3(), _it = new THREE.Vector3(), _iu = new THREE.Vector3(), _ip = new THREE.Vector3(), _ie2 = new THREE.Vector3(), _iq = new THREE.Quaternion(), _im = new THREE.Matrix4(), _one3 = new THREE.Vector3(1, 1, 1);
function rotateBoneWorld(bone, q) { bone.parent.getWorldQuaternion(_pq); const t = _pq.clone().invert().multiply(q).multiply(_pq); bone.quaternion.premultiply(t); }
function leftHandIK(a, A) {
  const us = a.bones[a.index.lupperarm], fo = a.bones[a.index.lforearm], lh = a.bones[a.index.lhand], rh = a.bones[a.index.rhand]; if (!us || !fo || !lh || !rh || !weapons.gripPos) return;
  a.group.updateMatrixWorld(true);
  _im.compose(weapons.gripPos, weapons.gripQ, _one3).premultiply(rh.matrixWorld); _it.set(A.lhand[0], A.lhand[1], A.lhand[2]).applyMatrix4(_im);
  _is.setFromMatrixPosition(us.matrixWorld); _ie.setFromMatrixPosition(fo.matrixWorld); _iw.setFromMatrixPosition(lh.matrixWorld);
  const L1 = _ie.distanceTo(_is), L2 = _iw.distanceTo(_ie); _iu.copy(_it).sub(_is); let d = _iu.length(); if (d < 1e-4) return; _iu.divideScalar(d); d = clamp(d, Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.005);
  _ip.copy(_ie).sub(_is); _ip.addScaledVector(_iu, -_ip.dot(_iu)); if (_ip.lengthSq() < 1e-6) _ip.set(0, -1, 0); _ip.normalize();      // cotovelo continua para o mesmo lado em que a animação o deixou
  const ax = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - ax * ax));
  _ie2.copy(_is).addScaledVector(_iu, ax).addScaledVector(_ip, hh);
  _iq.setFromUnitVectors(_ie.clone().sub(_is).normalize(), _ie2.clone().sub(_is).normalize()); rotateBoneWorld(us, _iq);
  a.group.updateMatrixWorld(true); _ie.setFromMatrixPosition(fo.matrixWorld); _iw.setFromMatrixPosition(lh.matrixWorld);
  _iq.setFromUnitVectors(_iw.clone().sub(_ie).normalize(), _it.clone().sub(_ie).normalize()); rotateBoneWorld(fo, _iq);
}
function alignWeaponArm(a, A) {
  const ua = a.bones[a.index[A.oneHand ? 'rupperarm' : 'spine1']], hand = a.bones[a.index.rhand]; if (!ua || !hand || !ua.parent || !weapons.gripQ) return;
  a.group.updateMatrixWorld(true); hand.getWorldQuaternion(_ah); _ab.copy(_am).applyQuaternion(weapons.gripQ).applyQuaternion(_ah).normalize();
  if (weapons.aim > 0.5) camera.getWorldDirection(_at); else _at.set(Math.sin(player.h), 0, Math.cos(player.h));
  _ad.setFromUnitVectors(_ab, _at); const ang = 2 * Math.acos(clamp(_ad.w, -1, 1)); if (ang >= 0.004 && ang <= 1.4) { ua.parent.getWorldQuaternion(_pq); const t = _pq.clone().invert().multiply(_ad).multiply(_pq); ua.quaternion.premultiply(t); }
  if (A.lhand) leftHandIK(a, A);
}
function updatePlayerActor(dt, spd, onGround, gy) {
  const a = player.actor; if (!a) return;
  a.group.visible = player.mesh.visible && !player.car;
  const p = player.mesh.position;
  a.group.position.set(p.x, (player.dead ? player.y : p.y) + a.footOffset, p.z); a.group.rotation.y = player.mesh.rotation.y;
  const air = player.y > gy + 0.2;
  if (spd > 0.5 || air || player.stun > 0 || player.dead) emoteOn = null;
  let clip, loop = true, rate = 1, restart = false, overlay = null, ovT = 0, hold = false;
  const ws = (typeof weapons !== 'undefined' && weapons.selected >= 0) ? weapons.items[weapons.selected] : null, armed = !!ws && !player.dead && player.stun <= 0 && !air;
  if (player.dead) { clip = 'KO_shot_front'; loop = false; }
  else if (player.stun > 0) { clip = 'HIT_front'; }
  else if (air) { clip = player.vy > 0 ? 'JUMP_launch' : 'FALL_fall'; loop = false; }
  else if (emoteOn && findClip(emoteOn)) { clip = emoteOn; }
  else if (armed && wAnim(ws).melee && weapons.meleeT > 0 && weapons.meleeClip) {          // golpe de faca/katana: clipe inteiro
    clip = weapons.meleeClip; loop = false; if (weapons.meleeId !== lastMeleeSeen) { lastMeleeSeen = weapons.meleeId; restart = true; }
    player.h += wrap(cam.a - player.h) * Math.min(1, dt * 14); a.group.rotation.y = player.h; player.mesh.rotation.y = player.h;
  }
  else if (armed && !wAnim(ws).melee) {
    // armado (mirando ou não): a pose é sempre a da empunhadura em que a arma foi calibrada. Mirando, o corpo acompanha a câmera; andar de lado/de costas usa GunMove_*; o tiro dá o recuo (parado: clipe inteiro; andando: só nos braços)
    const A = wAnim(ws); if (weaponAim()) { player.h += wrap(cam.a - player.h) * Math.min(1, dt * 18); a.group.rotation.y = player.h; player.mesh.rotation.y = player.h; }
    const fwd = player.vx * Math.sin(player.h) + player.vz * Math.cos(player.h), side = player.vx * Math.cos(player.h) - player.vz * Math.sin(player.h);
    const oh = !!(A.oneHand || A.twoHand); let ovc = A.fire, ovt = A.pose || 0;
    if (oh && weapons.reloading > 0) { const cl = findClip(A.reload); ovc = A.reload; ovt = cl ? clamp((1 - weapons.reloading / Math.max(0.3, ws.reload)) * cl.duration, 0, cl.duration) : 0; }
    if (weapons.reloading > 0 && !oh) { clip = A.reload; loop = false; const cl = findClip(A.reload); rate = cl ? clamp(cl.duration / Math.max(0.3, ws.reload), 0.6, 2) : 1; }
    else if (spd < 0.4 && oh) { clip = 'IDLE_stance'; overlay = ovc; ovT = ovt; }
    else if (spd < 0.4) {
      const justShot = weapons.sinceShot < 0.45;
      if (weapons.shotId !== lastShotSeen) { lastShotSeen = weapons.shotId; restart = !A.holdFire; }
      clip = A.fire; loop = false; if (justShot && !A.holdFire) rate = 1.7; else hold = true;                 // pose de mira = primeiro quadro do clipe de tiro (arma no ombro / mãos juntas)
    } else {
      clip = Math.abs(fwd) >= Math.abs(side) ? (fwd >= 0 ? 'GunMove_FWD' : 'GunMove_BWD') : (side >= 0 ? 'GunMove_L' : 'GunMove_R'); rate = clamp(spd / 2.2, 0.5, 1.6);
      overlay = ovc; ovT = (weapons.sinceShot < 0.4 && !A.holdFire) ? weapons.sinceShot * 1.8 : ovt;            // pernas andando; braços na pose de mira (e no recuo)
    }
  }
  else if (spd > 6.5) { clip = 'sprint_civi'; rate = clamp(spd / 7.5, 0.6, 1.5); }
  else if (spd > 2.8) { clip = 'run_player'; rate = clamp(spd / 4.8, 0.6, 1.5); }
  else if (spd > 0.5) { clip = 'WALK_player'; rate = clamp(spd / 1.8, 0.6, 1.6); }
  else clip = 'IDLE_stance';
  if (!hasClipP(clip)) clip = 'IDLE_stance';
  let ok;
  if (restart && a.ap) { ok = !!findClip(clip); if (ok) { a.ap.play(clip, { loop, fade: 0.05, restart: true }); a.ap.speed = rate; } } else ok = playClip(a, clip, loop, rate);
  if (hold && a.ap && a.ap.name === clip) { a.ap.time = (ws && wAnim(ws).pose) || 0; a.ap.speed = 0.0001; }
  if (a.ap) { if (overlay && findClip(overlay)) { a.ap.setOverlay(overlay, overlay === "Drive_L" ? ARM_BONE_IDS : UPPER_BONE_IDS); a.ap.overlay.time = Math.min(ovT, findClip(overlay).duration); } else if (a.ap.overlay) a.ap.setOverlay(null); }
  if (!ok) animateProcedural(a, dt, spd > 2.8 ? 'run' : spd > 0.5 ? 'walk' : 'idle', spd);
  else a.ap.update(dt);
  if (ok) applyAimPitch(a, (armed && typeof weapons !== 'undefined' && !wAnim(ws).melee) ? weapons.pitch : 0);
  if (ok && armed && ws && weapons.reloading <= 0 && !wAnim(ws).melee) alignWeaponArm(a, wAnim(ws));
  if (ok) plantActor(a, player.dead ? player.y : p.y);
}
loadPlayerOutfit(0, false);
