/* NEON COAST — Entrar e sair dos veículos com as animações reais do GTA SA (CAR_getin / CAR_getout, BIKEh_JumpOnL / BIKEh_GetOffL).
   Entrar: o jogador anda até a porta, olha para o veículo e toca o clipe enquanto a pélvis desliza até o banco; ao fim o personagem sentado assume.
   Sair: o clipe toca com a pélvis indo do banco até a porta, e o controle volta quando ele está em pé ao lado do veículo.
   A pélvis é guiada por um caminho (o deslocamento da raiz do clipe é ignorado), então a transição nunca "pula" para o banco.
   Roubo (como no GTA): com motorista no banco, depois de abrir a porta o jogador o puxa (CAR_pullout_LHS) enquanto ele sai com
   CAR_jackedLHS (ped-ai.js). Às vezes a porta está trancada (CAR_doorlocked_LHS) e o motorista arranca. A vítima pode voltar e
   tirar o jogador do carro: ele sai com o mesmo CAR_jackedLHS, cai no chão e levanta (startJackedOut). */
'use strict';

const smooth01 = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const _tv = new THREE.Vector3();

/* altura da pélvis do personagem em pé (em relação aos pés), medida uma vez por ator */
function standPelvisH(a) {
  if (a._standH !== undefined) return a._standH;
  playClip(a, 'IDLE_stance', true, 1); a.ap.update(0.02); a.ap.update(0.02);
  a.group.position.set(0, 0, 0); a.group.rotation.set(0, 0, 0); a.group.updateMatrixWorld(true);
  _tv.setFromMatrixPosition(a.bones[a.index.pelvis].matrixWorld);
  return a._standH = _tv.y + a.footOffset;
}
/* coloca o ator para que a pélvis fique em (x,y,z) do mundo, com a direção h */
function placeByPelvis(a, x, y, z, h, scale) {
  a.group.visible = true; a.group.scale.setScalar(scale || 1); a.group.rotation.y = h; a.group.position.set(0, 0, 0); a.group.updateMatrixWorld(true);
  _tv.setFromMatrixPosition(a.bones[a.index.pelvis].matrixWorld);
  a.group.position.set(x - _tv.x, y - _tv.y, z - _tv.z);
}
const vehSeatWorld = c => { const t = c.mesh.userData.tilt; c.mesh.updateMatrixWorld(true); return t.localToWorld(new THREE.Vector3(...vehicleSeat(c))); };
/* ponto ao lado da porta do motorista (lado esquerdo), no chão */
function doorPoint(c) {
  const bike = isBikeCar(c), seat = vehicleSeat(c), side = bike ? 0.95 : c.cr + 0.5;
  c.mesh.updateMatrixWorld(true);
  const w = c.mesh.localToWorld(new THREE.Vector3(side, 0, seat[2]));
  return { x: w.x, z: w.z, y: Hq(w.x, w.z) };
}
function transClips(c) {
  const t = c.modelId && vehReady[c.modelId], bike = isBikeCar(c);
  if (!bike) return { enter: 'CAR_getin_LHS', exit: 'CAR_getout_LHS', scale: 1 };
  const small = t && t.man.driveClip && /^(wf|bikes)/i.test(t.man.driveClip) || (t && t.man.id === 'honda_biz');
  return small ? { enter: 'BIKEs_JumpOnL', exit: 'BIKEs_GetOffLHS', scale: 0.95 } : { enter: 'BIKEh_JumpOnL', exit: 'BIKEh_GetOffLHS', scale: 0.95 };
}

/* ---------- porta do carro: a própria porta do modelo (door_lf), articulada na dobradiça ---------- */
const DOORS = [];
function doorTo(c, target, rate) {
  const d = c.mesh.userData.door; if (!d) return; d.target = target; d.rate = rate || 3; if (!DOORS.includes(d)) DOORS.push(d);
}
function updateCarDoors(dt) {
  for (let i = DOORS.length - 1; i >= 0; i--) {
    const d = DOORS[i], diff = d.target - d.a; d.a += Math.sign(diff) * Math.min(Math.abs(diff), d.rate * dt);
    d.hinge.rotation.y = d.sign * d.a * 1.05;                       // ~60° aberta (sinal: para fora do carro, conforme o lado da dobradiça)
    if (Math.abs(d.target - d.a) < 1e-4 && d.target === 0) { d.a = 0; d.hinge.rotation.y = 0; DOORS.splice(i, 1); }
  }
}
/* gira o ator para uma direção suavizando, sem passar do alvo */
const turnTo = (cur, goal, k) => cur + wrap(goal - cur) * clamp(k, 0, 1);
const PULL_FACE = -Math.PI / 2;                                       // direção do corpo ao puxar o motorista, em relação ao carro
function plantOnGround(a, y) { if (typeof plantActor === 'function') plantActor(a, y); }

/* ---------- começo ---------- */
function startEnterCar(c) {
  if (c.claimedBy && c.claimedBy.carSeq) return;                       // alguém já está entrando nele
  const victim = c.ai && c.driver && !c.driverGone && !c.cop && !c.ems && !(c.officers > 0) && typeof aiCarjacked === 'function';   // tem motorista: ele é puxado para fora (ped-ai.js)
  const cl = transClips(c), car = !isBikeCar(c);
  if (victim && car && !c.triedLock && Math.random() < 0.15 && findClip('CAR_doorlocked_LHS')) {      // porta trancada: tenta abrir e o motorista arranca
    c.triedLock = true; player.trans = { kind: 'locked', c, phase: 'walk', t: 0, u: 0, cl, clip: 'CAR_doorlocked_LHS' }; player.vx = player.vz = 0; return;
  }
  const wasAI = c.ai; c.ai = false; c.chase = false; c.police = false; c.ems = null; c.torPatrol = false; c.fleeT = 0; c.surrenderT = undefined; c.angryT = undefined;
  if (c.rider) c.rider.group.visible = false;
  if (!victim) { if (c.driver) c.driver.group.visible = false; c.driverGone = true; }
  if (c.cop) crime(3, 'roubo de viatura'); else if (wasAI) crime(1, 'roubo de carro', true);
  const pull = victim && car && findClip('CAR_pullout_LHS') ? 'CAR_pullout_LHS' : null;
  player.trans = { kind: 'in', c, phase: 'walk', t: 0, u: 0, cl, clip: findClip(cl.enter) ? cl.enter : null, open: car && findClip('car_open_lhs') ? 'car_open_lhs' : null, jack: victim, pull };
  player.vx = player.vz = 0;
}
/* a vítima voltou e abriu a porta: o jogador é arrancado do banco (o mesmo clipe que os motoristas usam), cai e levanta */
function startJackedOut(c) {
  const a = player.actor; if (player.car !== c || player.trans || !a || !findClip('CAR_jackedLHS')) return false;
  const seat = vehSeatWorld(c), standH = standPelvisH(a);
  player.trans = { kind: 'jacked', c, phase: 'clip', t: 0, J: { clip: 'CAR_jackedLHS', t: 0, dur: findClip('CAR_jackedLHS').duration, h: c.h, side: 1, seat: { x: seat.x, y: seat.y, z: seat.z }, standH, r0: clipRootAt('CAR_jackedLHS', 0).slice() } };
  player.car = null; player.mesh.visible = true; player.vx = player.vz = 0; player.mv = 0; player.h = c.h;
  c.speed = 0; if (c.physics) { c.physics.vx = c.physics.vz = 0; } doorTo(c, 1, 5);
  a.ap.play('CAR_jackedLHS', { loop: false, fade: 0, restart: true }); a.ap.update(0.001);
  if (typeof hurt === 'function') hurt(4, 'Arrancado do carro');
  if (typeof toast === 'function') toast('O dono voltou e tirou você do carro!', 2200);
  return true;
}
/* anda até a porta (devolve true enquanto ainda está andando) */
function walkToDoor(tr, door, dt, a) {
  tr.t += dt;
  const dx = door.x - player.x, dz = door.z - player.z, d = Math.hypot(dx, dz), sp = Math.min(d / Math.max(dt, 0.001), d > 2.5 ? 8 : 4.8);
  if (d > 0.25 && tr.t < 2.4) {
    const k = Math.min(1, dt * 14); player.vx += (dx / d * sp - player.vx) * k; player.vz += (dz / d * sp - player.vz) * k;
    player.x += player.vx * dt; player.z += player.vz * dt; player.y = Hq(player.x, player.z);
    player.h += wrap(Math.atan2(player.vx, player.vz) - player.h) * Math.min(1, dt * 14);
    player.mesh.position.set(player.x, player.y, player.z); player.mesh.rotation.y = player.h;
    updatePlayerActor(dt, Math.hypot(player.vx, player.vz), true, player.y);
    return true;
  }
  return false;
}
/* parado na porta tocando um clipe, de frente para ela */
function holdAtDoor(a, c, door, dt, face) {
  player.h = turnTo(player.h, face, dt * 12); player.x = door.x; player.z = door.z; player.y = door.y;
  a.group.visible = true; a.group.scale.setScalar(1); a.group.position.set(door.x, door.y + a.footOffset * a.group.scale.x, door.z); a.group.rotation.y = player.h; a.ap.update(dt); plantOnGround(a, door.y);
  player.mesh.position.set(door.x, door.y, door.z); player.mesh.rotation.y = player.h;
}
function startExitCar() {
  const c = player.car, a = player.actor; if (!c) return;
  const cl = transClips(c), clip = findClip(cl.exit) ? cl.exit : null;
  if (!a || !clip) { leaveCar(); return; }                          // sem modelo/animação: saída imediata como antes
  const seat = vehSeatWorld(c), door = doorPoint(c);
  player.trans = { kind: 'out', c, phase: 'clip', t: 0, u: 0, cl, clip, seat, ph: standPelvisH(a) };
  player.car = null; player.mesh.visible = true; player.vx = player.vz = 0; player.h = c.h;
  player.x = door.x; player.z = door.z; player.y = door.y;
  c.speed *= 0.5; doorTo(c, 1, 5);
  playClip(a, clip, false, 1); a.ap.update(0.001);
}

/* ---------- a cada quadro (no lugar do updateFoot enquanto dura) ---------- */
function updateVehicleTransition(dt) {
  const tr = player.trans, c = tr && tr.c, a = player.actor;
  if (!tr) return;
  if (player.dead || !c || cars.indexOf(c) < 0 || !a) { player.trans = null; player.mesh.visible = true; if (c) doorTo(c, 0, 4); return; }
  const door = doorPoint(c);
  if (tr.kind === 'locked') {                                         // porta trancada: puxa a maçaneta, o motorista arranca
    if (tr.phase === 'walk') {
      if (walkToDoor(tr, door, dt, a) && Math.abs(c.speed) < 3) return;
      if (Math.hypot(door.x - player.x, door.z - player.z) > 1.2) { player.trans = null; return; }
      tr.phase = 'try'; tr.t = 0; player.vx = player.vz = 0; a.ap.play(tr.clip, { loop: false, fade: 0.12, restart: true });
      c.fleeT = R2(9, 13); c.fleeFrom = [player.x, player.z]; c.aimedT = 6; if (typeof aiEvent === 'function') aiEvent('carjack', c.x, c.z, { player: true });
      if (typeof toast === 'function') toast('Porta trancada', 1200);
    }
    tr.t += dt; holdAtDoor(a, c, { x: player.x, y: Hq(player.x, player.z), z: player.z }, dt, c.h - Math.PI / 2);
    if (tr.t >= (findClip(tr.clip) || { duration: 1.3 }).duration * 0.95 || Math.hypot(door.x - player.x, door.z - player.z) > 1.6) { player.trans = null; a.group.scale.setScalar(1); }
    return;
  }
  if (tr.kind === 'jacked') {                                         // arrancado do banco: cai ao lado do carro e levanta
    const J = tr.J;
    if (tr.phase === 'clip') {
      J.t += dt; a.ap.update(dt); const P = jackedPelvis(J, J.t, {}); placeByPelvis(a, P.x, P.y, P.z, J.h, 1);
      player.x = P.x; player.z = P.z; player.y = carGroundHeight(P.x, P.z); player.h = J.h; player.mesh.position.set(P.x, player.y, P.z);
      if (J.t >= J.dur) { const m = matchLying(a, J.h, 'getup'); player.x = m.x; player.z = m.z; player.h = m.h; tr.phase = 'getup'; tr.t = 0; }
      return;
    }
    tr.t += dt; const gy = carGroundHeight(player.x, player.z);
    a.group.position.set(player.x, gy + a.footOffset, player.z); a.group.rotation.y = player.h; a.ap.update(dt); plantOnGround(a, gy);
    player.y = gy; player.mesh.position.set(player.x, gy, player.z); player.mesh.rotation.y = player.h;
    if (tr.t >= (findClip('getup') || { duration: 1.37 }).duration * 0.95) { const p = { x: player.x, z: player.z }; pushOut(p, 0.5, nearby(p.x, p.z)); player.x = p.x; player.z = p.z; player.trans = null; player.stun = 0; }
    return;
  }
  if (tr.kind === 'in') {
    if (tr.phase === 'walk') {                                        // anda até a porta
      if (tr.clip && walkToDoor(tr, door, dt, a)) return;
      if (!tr.clip) { if (tr.jack) aiCarjacked(c); finishEnter(c); return; }
      player.vx = player.vz = 0; player.x = door.x; player.z = door.z;
      tr.phase = tr.open ? 'open' : 'clip'; tr.t = 0; tr.u = 0;
      if (tr.open) { playClip(a, tr.open, false, 1); doorTo(c, 1, 3.2); }
      else { if (tr.jack) aiCarjacked(c); tr.ph = standPelvisH(a); tr.from = { x: player.x, y: Hq(player.x, player.z) + tr.ph, z: player.z }; playClip(a, tr.clip, false, 1); }
    }
    if (tr.phase === 'open') {                                        // de frente para a porta: pega a maçaneta e abre
      tr.t += dt; const face = c.h - Math.PI / 2; player.h = turnTo(player.h, face, dt * 12);
      a.group.position.set(door.x, door.y + a.footOffset * a.group.scale.x, door.z); a.group.rotation.y = player.h; a.ap.update(dt); plantOnGround(a, door.y);
      player.mesh.position.set(door.x, door.y, door.z); player.mesh.rotation.y = player.h;
      const od = (findClip(tr.open) || { duration: 0.7 }).duration;
      if (tr.t >= od * 0.92) {
        tr.t = 0; tr.u = 0;
        if (tr.jack && tr.pull) { tr.phase = 'pull'; a.ap.play(tr.pull, { loop: false, fade: 0.1, restart: true }); aiCarjacked(c); }      // puxa o motorista pelo braço
        else { if (tr.jack) aiCarjacked(c); tr.phase = 'clip'; tr.ph = standPelvisH(a); tr.from = { x: door.x, y: door.y + tr.ph, z: door.z }; playClip(a, tr.clip, false, 1); }
      }
      return;
    }
    if (tr.phase === 'pull') {
      tr.t += dt; holdAtDoor(a, c, door, dt, c.h + PULL_FACE);
      if (tr.t >= (findClip(tr.pull) || { duration: 2.3 }).duration * 0.97) { tr.phase = 'clip'; tr.t = 0; tr.u = 0; tr.ph = standPelvisH(a); tr.from = { x: door.x, y: door.y + tr.ph, z: door.z }; playClip(a, tr.clip, false, 1); }
      return;
    }
    if (tr.phase === 'clip' && !tr.from) { tr.ph = standPelvisH(a); tr.from = { x: player.x, y: Hq(player.x, player.z) + tr.ph, z: player.z }; playClip(a, tr.clip, false, 1); }
    const clip = findClip(tr.clip), dur = clip ? clip.duration : 1;
    tr.t += dt; tr.u = clamp(tr.t / dur, 0, 1);
    const seat = vehSeatWorld(c), e = smooth01((tr.u - 0.18) / 0.8), face0 = c.h - Math.PI / 2;
    // entra de frente para o banco: o corpo vai girando de "de lado para a porta" até "olhando para a frente do carro" enquanto senta (sem pulo no fim)
    const hh = face0 + wrap(c.h - face0) * smooth01((tr.u - 0.2) / 0.7); player.h = hh; a.ap.update(dt);
    if (tr.u > 0.7) doorTo(c, 0, 3.4);                                // fecha a porta depois que sentou
    placeByPelvis(a, lerp(tr.from.x, seat.x, e), lerp(tr.from.y, seat.y, e), lerp(tr.from.z, seat.z, e), hh, tr.cl.scale === 1 ? 1 : lerp(1, tr.cl.scale, e));
    player.mesh.position.set(a.group.position.x, player.y, a.group.position.z);
    if (tr.u >= 1) finishEnter(c);
    return;
  }
  // sair: porta abre, o corpo gira da posição de sentado para fora, e a porta fecha atrás
  const clip = findClip(tr.clip), dur = clip ? clip.duration : 1;
  tr.t += dt; tr.u = clamp(tr.t / dur, 0, 1);
  const seat = vehSeatWorld(c), e = smooth01((tr.u - 0.1) / 0.8), face = c.h + Math.PI / 2;
  player.h = c.h + wrap(face - c.h) * smooth01((tr.u - 0.05) / 0.6);
  a.ap.update(dt);
  if (tr.u > 0.55) doorTo(c, 0, 3);
  placeByPelvis(a, lerp(seat.x, door.x, e), lerp(seat.y, door.y + tr.ph, e), lerp(seat.z, door.z, e), player.h, tr.cl.scale === 1 ? 1 : lerp(tr.cl.scale, 1, e));
  player.x = door.x; player.z = door.z; player.y = door.y; player.mesh.position.set(a.group.position.x, door.y, a.group.position.z);
  if (tr.u >= 1) {
    const p = { x: door.x, z: door.z }; pushOut(p, 0.5, nearby(p.x, p.z));
    player.x = p.x; player.z = p.z; player.y = Hq(p.x, p.z); player.vx = player.vz = 0; player.h = face; player.mesh.position.set(player.x, player.y, player.z);
    a.group.scale.setScalar(1); player.trans = null; doorTo(c, 0, 3);
  }
}
function finishEnter(c) {
  player.trans = null; player.car = c; player.mesh.visible = false; cam.a = c.h; doorTo(c, 0, 3.4);
  if (c.vehName) toast(c.vehName, 1600);
  if (player.actor) { player.actor.group.scale.setScalar(1); player.actor.group.visible = false; }
}
