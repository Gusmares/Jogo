/* NEON COAST — Ocupantes dos veículos: policial dirigindo as viaturas e o personagem do jogador sentado ao entrar em qualquer carro ou moto.
   Usa a pose real "CAR_sit" do ped.ifp (sentado) com os braços de "Drive_L" por cima (mãos no volante) e "BIKEh_Ride" nas motos. */
'use strict';

const GENERIC_DRIVER_SEAT = [0.45, 0.74, 0.0];      // carros procedurais (sem modelo do mod): banco do motorista, lado esquerdo

/* onde fica a pélvis do motorista (no espaço do carro) */
function vehicleSeat(c) {
  const t = c.modelId && vehReady[c.modelId];
  if (t && t.man.kind === 'bike') {
    // o piloto senta em cima do banco, perto do eixo traseiro, não no meio da moto
    const rear = Math.min(...t.man.wheels.map(w => w.pos[2])), s = t.man.seats && t.man.seats.driver;
    return s ? [s[0], s[1], s[2] - (window.__seatShift === undefined ? 0.3 : window.__seatShift)] : [0, 0.8, rear + 0.55];
  }
  if (t && t.man.seats && t.man.seats.driver) return t.man.seats.driver;
  if (t && t.man.seats) return t.man.seats.driver;
  return GENERIC_DRIVER_SEAT;
}
const isBikeCar = c => !!(c.modelId && vehReady[c.modelId] && vehReady[c.modelId].man.kind === 'bike');

/* senta um ator num veículo: aplica a pose e leva a pélvis até o banco */
function seatActor(a, parent, anchor, scale) {
  a.group.scale.setScalar(scale || 1); a.group.position.set(0, 0, 0); a.group.rotation.set(0, 0, 0);
  parent.add(a.group);
  a.clips = a.clips || {};
  animateActor(a, 0.02, 'sit', 0); animateActor(a, 0.02, 'sit', 0);
  parent.updateMatrixWorld(true);
  const pel = new THREE.Vector3().setFromMatrixPosition(a.bones[a.index.pelvis].matrixWorld); parent.worldToLocal(pel);
  a.group.position.set(anchor[0] - pel.x, anchor[1] - pel.y, anchor[2] - pel.z);
}
function makeSeatedActor(skinType, bike) {
  const a = makeActor(skinType, true);
  a.clips = { sit: bike ? 'BIKEh_Ride' : 'CAR_sit' };
  if (!bike && a.ap) a.ap.setOverlay('Drive_L', ARM_BONE_IDS);          // mãos no volante
  return a;
}
function animateSeatedActor(a, c, dt) {
  const type = c.modelId && vehReady[c.modelId];
  a.clips.sit = isBikeCar(c) ? ((type.man.driveClip && findClip(type.man.driveClip)) ? type.man.driveClip : 'BIKEh_Ride') : 'CAR_sit';
  if (!isBikeCar(c) && a.ap) {
    const clip = c.steer < -0.05 ? 'Drive_R' : 'Drive_L';
    a.ap.setOverlay(clip, ARM_BONE_IDS);
    // A posição no clipe acompanha o volante, sem repetir uma curva parado.
    a.ap.overlay.time = clamp(Math.abs(c.steer) / 0.5, 0, 1) * ((findClip(clip) || {}).duration || 0);
  }
  animateActor(a, dt, 'sit', 0);
  const parent = a.group.parent; if (!parent) return;
  // Recalcula depois da animação para impedir deslocamento da pélvis durante o ciclo.
  a.group.position.set(0,0,0); parent.updateWorldMatrix(true,true);
  const pelvis = new THREE.Vector3().setFromMatrixPosition(a.bones[a.index.pelvis].matrixWorld);
  parent.worldToLocal(pelvis); const anchor = vehicleSeat(c);
  a.group.position.set(anchor[0]-pelvis.x,anchor[1]-pelvis.y,anchor[2]-pelvis.z);
}

/* ---------- policial dentro da viatura (só perto da câmera, para não pesar) ---------- */
function updateNpcDriver(c, dcam, dt) {
  const near = dcam < 75 && !(c.officers > 0) && !c.driverGone && c !== player.car;
  if (near && !c.driver) {
    const ids = c.unit ? unitSkinReady(c.unit) : PLAYER_SKINS.filter(id => skinReady[id]); if (!ids.length) return;
    const a = makeSeatedActor(skinReady[ids[Math.floor(Math.random() * ids.length)]], isBikeCar(c));
    seatActor(a, c.mesh.userData.tilt, vehicleSeat(c), 1);
    c.driver = a;
  }
  if (c.driver) {
    c.driver.group.visible = near;
    if (near) { c.driver.setLod(dcam < 28 ? 1 : 2); animateSeatedActor(c.driver, c, dt); }
  }
}

/* ---------- jogador sentado enquanto dirige ---------- */
function updatePlayerSeat(dt) {
  const c = player.car;
  if (!c) {
    if (player.seat && player.seat.group.parent) player.seat.group.parent.remove(player.seat.group);
    player.seat = null; player.seatCar = null; return;
  }
  if (!player.actor) return;
  const bike = isBikeCar(c);
  if (player.seatCar !== c || !player.seat || player.seat.type !== player.actor.type) {      // entrou agora (ou trocou de roupa)
    if (player.seat && player.seat.group.parent) player.seat.group.parent.remove(player.seat.group);
    const a = makeSeatedActor(player.actor.type, bike);
    seatActor(a, c.mesh.userData.tilt, vehicleSeat(c), bike ? 0.95 : 1);
    player.seat = a; player.seatCar = c;
    if (c.driver) c.driver.group.visible = false; c.driverGone = true;                      // o policial da viatura sai de cena
    if (c.rider) c.rider.group.visible = false;
  }
  player.seat.group.visible = true;
  animateSeatedActor(player.seat, c, dt);
}
