// Teste no jogo real (Electron): clipe editável substitui WALK_player e muda a pose do jogador; IK de mão esquerda em GunMove_FWD com fuzil leva a mão ao alvo.
//   npx electron projects/neon-coast/tools/run-game-script.js projects/neon-coast/tools/test-anims-game.js
// (anim-edit.js é injetado aqui; no jogo final ele entra por <script> em index.html, logo depois de anim.js)
(async () => {
  if (typeof animEditSet !== 'function') await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'js/entities/anim-edit.js'; s.onload = ok; s.onerror = () => no(new Error('anim-edit.js não carregou')); document.head.appendChild(s); });
  const out = {}, a = player.actor, ap = a.ap, angle = (p, q) => +(2 * Math.acos(Math.min(1, Math.abs(p.dot(q)))) * 180 / Math.PI).toFixed(2);
  // 1) substituição de WALK_player
  const orig = findClip('WALK_player'); out.origEditavel = !!orig._eid;
  ap.play('WALK_player', { fade: 0, restart: true }); ap.update(0.4); const bone = a.bones[a.index.lupperarm], q0 = bone.quaternion.clone();
  const r = animEditFromClip(orig, 'walk_player'); if (!r.ok) return { erro: r.erro };
  for (const f of r.data.bones[32].rot) { const x = f[1], y = f[2] + 0.5, z = f[3], w = f[4], l = Math.hypot(x, y, z, w); f[1] = x / l; f[2] = y / l; f[3] = z / l; f[4] = w / l; }
  const s = animEditSet(r.data); out.set = s.ok; out.substituiu = findClip('WALK_player')._eid === 'walk_player';
  ap.update(0.0001); const q1 = bone.quaternion.clone(); out.lupperarmMudouGraus = angle(q0, q1);
  const ok2 = playClip(a, 'WALK_player', true, 1); out.playClipOk = ok2 && ap.cur._eid === 'walk_player';           // o código do jogo que toca por nome
  __run(1); out.rodouQuadros = true;
  animEditRemove('walk_player'); out.voltouAoIfp = findClip('WALK_player') === orig;
  // 2) IK da mão esquerda com fuzil: ponto no espaço da arma (aqui 60% do caminho até o ponto lhand do fuzil, dentro do alcance do braço)
  const wi = weapons.items.findIndex(w => wAnim(w).twoHand && wAnim(w).lhand); out.fuzil = wi >= 0 ? weapons.items[wi].id : null;
  if (wi >= 0) {
    equipWeapon(wi); __run(0.3); const A = wAnim(weapons.items[weapons.selected]), P = [A.lhand[0] * 0.6, A.lhand[1], A.lhand[2]];
    const rh = a.bones[a.index.rhand], lh = a.bones[a.index.lhand], one = new THREE.Vector3(1, 1, 1);
    const handToTarget = pt => { a.group.updateMatrixWorld(true); const M = new THREE.Matrix4().compose(weapons.mesh.position, weapons.mesh.quaternion, one).premultiply(rh.matrixWorld); return +(new THREE.Vector3().setFromMatrixPosition(lh.matrixWorld).distanceTo(new THREE.Vector3(pt[0], pt[1], pt[2]).applyMatrix4(M)) * 100).toFixed(2); };
    const pose = () => { ap.play('GunMove_FWD', { fade: 0, restart: true }); ap.setOverlay(A.fire, UPPER_BONE_IDS); ap.overlay.time = A.pose || 0; ap.update(0.35); };      // como o updatePlayerActor monta andar-mirando
    pose(); out.semIk_distanciaCm = handToTarget(P);
    const g = animEditFromClip(findClip('GunMove_FWD'), 'gunmove_fwd'); g.data.ik = [{ chain: 'lhand', target: { space: 'weapon', pos: P }, weight: [[0, 1]], hint: [0, -1, 0] }]; out.setIk = animEditSet(g.data).ok;
    pose(); out.comIk_gancho_distanciaCm = handToTarget(P);                                                                                     // gancho de AnimPlayer.update (sem editar o player-model.js)
    alignWeaponArm(a, A); out.depoisDeAlignWeaponArm_distanciaCm = handToTarget(P);                                                             // o jogo hoje: leftHandIK puxa a mão para A.lhand
    const rr = animIkFinal(a); out.depoisDeAnimIkFinal_distanciaCm = handToTarget(P); out.ikFinal = rr.map(x => ({ chain: x.chain, errCm: +(x.err * 100).toFixed(2) }));   // patch sugerido: animIkFinal(a) depois do alignWeaponArm
    animEditRemove('gunmove_fwd'); out.volta = !findClip('GunMove_FWD')._eid;
  }
  out.erros = [];
  return out;
})()
