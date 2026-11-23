/* NEON COAST — Polícia brasileira: unidades, ronda, níveis de procurado, perseguição, policiais a pé e prisão.

   Como cada unidade é usada (baseado em como atuam a PMESP e a Polícia Civil):
   • RP (Radiopatrulha, 190) ........ policiamento ostensivo básico: ronda a cidade e é a primeira a responder.
   • ROCAM (motos) .................. ronda a cidade e chega como reforço rápido às RP.
   • TOR (Tático Ostensivo Rodoviário) ronda a RODOVIA (a estrada do pântano) e reforça em alto risco.
   • FT (Força Tática) .............. força de reação rápida: entra em ocorrência grave (2★).
   • Polícia Civil .................. investigativa: só aparece em crime grave (2★), nunca faz ronda.
   • ROTA ........................... alto risco: só em ocorrência gravíssima (3★). */
'use strict';
const _lv = new THREE.Vector3();

const UNITS = {
  rp:    { label: 'RP',    models: ['palio_rp', 'spin_rp', 'pmsp_viatura_seda_pm_sp', 'pmsp_viatura_seda_2_pm_sp', 'pmsp_viatura_seda_3_pm_sp'], skins: ['rp_lapd', 'rp_lvpd', 'pmsp_policial_pm_sp_280', 'pmsp_policial_pm_sp_281'], cruise: [11, 14], chase: 24 },
  rocam: { label: 'ROCAM', models: ['moto_rocam'],                          skins: ['rocam'],                  cruise: [12, 15], chase: 27, rider: true },
  ft:    { label: 'FT',    models: ['sw4_ft'],                              skins: ['ft'],                     cruise: [11, 13], chase: 25 },
  civil: { label: 'CIVIL', models: ['trailblazer_pc'],                      skins: ['civil'],                  cruise: [11, 13], chase: 24 },
  rota:  { label: 'ROTA',  models: ['hilux_rota', 'trailblazer_rota'],      skins: ['rota_fbi', 'rota_swat'],  cruise: [11, 13], chase: 26 },
  tor:   { label: 'TOR',   models: ['hilux_tor'],                           skins: ['tor'],                    cruise: [13, 16], chase: 26 },
  baep:  { label: 'BAEP',  models: ['baep_baep_toyota', 'baep_baep_trailblazer'], skins: ['baep_baep_farda_1', 'baep_baep_farda_2', 'baep_baep_farda_3'], cruise: [11, 13], chase: 25 },
  // Rio de Janeiro: PMERJ (patrulha), motos da PMERJ e o BOPE com o Caveirão em ocorrência gravíssima
  pmerj: { label: 'PMERJ', models: ['pmerj_viatura_seda_pmerj', 'pmerj_viatura_seda_2_pmerj', 'pmerj_viatura_seda_3_pmerj', 'pmerj_viatura_suv_pmerj', 'pmerj2_audi_a4_pmerj', 'pmerj2_trailblazer_pmerj'], skins: ['pmerj_policial_pmerj_280', 'pmerj_policial_pmerj_281', 'pmerj_policial_pmerj_284', 'pmerj2_recruta_pmerj'], cruise: [11, 14], chase: 24 },
  gtm:   { label: 'PMERJ MOTO', models: ['pmerj_moto_pmerj'], skins: ['pmerj_policial_pmerj_281'], cruise: [12, 15], chase: 27, rider: true },
  bope:  { label: 'BOPE',  models: ['br_fbitruck', 'pmerj_viatura_suv_pmerj'], skins: ['pmerj2_comandante_pmerj', 'rota_swat'], cruise: [10, 12], chase: 23 }
};
/* no Rio as mesmas funções são feitas pelas unidades de lá */
const RJ_UNIT = { rp: 'pmerj', rocam: 'gtm', ft: 'bope', rota: 'bope', tor: 'pmerj', baep: 'bope', civil: 'civil' };
const inRioSide = x => x > (HWY.x0 + HWY.x1) / 2;
function regionWant(want, px) { if (!inRioSide(px)) return want; const out = {}; for (const k in want) { const m = RJ_UNIT[k] || k; out[m] = (out[m] || 0) + want[k]; } return out; }
/* animações reais por unidade (pacotes ped.ifp, bikes.ifp): correr armado, postura de abordagem, parado, sentado na moto */
const UNIT_CLIPS = {
  rp:    { run: 'run_armed', aim: 'ARRESTgun',    idle: 'IDLE_armed' },
  civil: { run: 'run_armed', aim: 'ARRESTgun',    idle: 'IDLE_armed' },
  ft:    { run: 'run_armed', aim: 'Gun_stand',    idle: 'IDLE_armed' },
  rota:  { run: 'swat_run',  aim: 'WEAPON_crouch', idle: 'IDLE_armed' },
  tor:   { run: 'swat_run',  aim: 'Gun_stand',    idle: 'IDLE_armed' },
  rocam: { sit: 'BIKEh_Ride' },
  baep:  { run: 'run_armed', aim: 'Gun_stand',    idle: 'IDLE_armed' },
  pmerj: { run: 'run_armed', aim: 'ARRESTgun',    idle: 'IDLE_armed' },
  bope:  { run: 'swat_run',  aim: 'WEAPON_crouch', idle: 'IDLE_armed' },
  gtm:   { sit: 'BIKEh_Ride' }
};
const PATROL_WANT = { rp: 2, rocam: 2, tor: 1 };                                  // ronda (sem procurado)
const CHASE_WANT = { 1: { rp: 3, rocam: 2 }, 2: { rp: 3, rocam: 2, ft: 2, baep: 1, civil: 1 }, 3: { rp: 3, rocam: 2, ft: 2, baep: 1, civil: 1, rota: 2, tor: 1 } };

const police = { heat: 0, crimeCd: 0, arrestT: 0, lastStars: 0, why: '' };
const wantedStars = () => police.heat >= 5 ? 3 : police.heat >= 3 ? 2 : police.heat >= 1 ? 1 : 0;
const copCars = () => cars.filter(c => c.police && c.ai);
const nodeIdx = v => clamp(Math.round((v - roadC(0)) / P), 0, N);
/* cruzamento existente mais próximo de (x,z) na grade global (cidades + rodovia) */
function snapNode(x, z) { const [ci, cj] = nodeIJ(x, z); if (nodeOK(ci, cj)) return [ci, cj]; let best = null, bd = 1e9; for (let r = 1; r <= 6 && !best; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (!nodeOK(ci + a, cj + b)) continue; const d = Math.hypot(roadC(ci + a) - x, roadC(cj + b) - z); if (d < bd) { bd = d; best = [ci + a, cj + b]; } } if (best) return best; const c = nearestCity(x, z); return [clamp(ci, c.i0, c.i0 + c.ni), clamp(cj, c.j0, c.j0 + c.nj)]; }
const removeCar = c => { if (typeof disposeDeform === 'function') disposeDeform(c); scene.remove(c.mesh); const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); if(c.mesh.userData.ownedMats)c.mesh.userData.ownedMats.forEach(m=>m.dispose());for(const a of [c.driver,c.rider])if(a&&a.mesh.skeleton)a.mesh.skeleton.dispose(); };

/* ---------- carregamento sob demanda ---------- */
const unitModelReady = k => UNITS[k].models.filter(id => vehReady[id]);
const unitSkinReady = k => UNITS[k].skins.filter(id => skinReady[id]);
function prefetchUnit(k) { return Promise.all([...UNITS[k].models.map(loadVehicleType), ...UNITS[k].skins.map(loadSkin)]).catch(e => console.warn('falha ao carregar unidade', k, e)); }
function prefetchTier(s) { const px = player.car ? player.car.x : player.x; Object.keys(regionWant(CHASE_WANT[s] || {}, px)).forEach(prefetchUnit); }

/* ---------- crimes ---------- */
function policeNear(r) {
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
  return cars.some(c => c.cop && c.ai && Math.hypot(c.x - px, c.z - pz) < r);
}
function crime(pts, why, witnessed) {
  if (player.dead) return;
  if (witnessed && !policeNear(70)) return;
  police.heat = Math.min(6, police.heat + pts); police.why = why;
}
function carHitCrime(pc, other) {
  if (police.crimeCd > 0 || Math.abs(pc.speed) < 8) return;
  if (other.cop && other.ai) { police.crimeCd = 2; crime(2, 'colisão com viatura'); }
  else if (other.ai && !other.ems) { police.crimeCd = 2; crime(1, 'colisão com veículo', true); }
}

/* ---------- criação de viaturas ---------- */
function snapToRoad(c) {
  const [i, j] = snapNode(c.x, c.z), nb = neighbors(i, j), b = nb[Math.floor(Math.random() * nb.length)];
  c.from = [i, j]; c.to = b; setTarget(c); c.path = null;
}
function attachRider(c, kind) {
  const ids = unitSkinReady(kind); if (!ids.length) return;
  const a = makeActor(skinReady[ids[0]], true); a.clips = UNIT_CLIPS.rocam;
  const ws = vehReady[c.modelId].man.wheels, zc = ws.reduce((s, w) => s + w.pos[2], 0) / ws.length;
  const tilt = c.mesh.userData.tilt;
  a.group.scale.setScalar(0.95); a.group.position.set(0, 0, 0); tilt.add(a.group);
  animateActor(a, 0.02, "sit", 0); animateActor(a, 0.02, 'sit', 0);              // pose da animação real "BIKEs_Ride"
  // assenta: leva a pélvis do motociclista até o banco da moto (altura e posição calculadas a partir do modelo)
  c.mesh.updateMatrixWorld(true);
  const pel = new THREE.Vector3().setFromMatrixPosition(a.bones[a.index.pelvis].matrixWorld); tilt.worldToLocal(pel);
  a.group.position.set(-pel.x, 0.84 - pel.y, zc - 0.1 - pel.z);
  c.rider = a;
}
function spawnUnit(kind, chasing) {
  const ready = unitModelReady(kind);
  if (!ready.length) { prefetchUnit(kind); return null; }
  const id = ready[Math.floor(Math.random() * ready.length)], type = vehReady[id], U = UNITS[kind];
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
  let x, z, h, from = null, to = null;
  if (kind === 'tor' && !chasing && !inRioSide(px)) { x = -4.2; z = R2(HALF + 40, HALF + SWD - 100); h = 0; }
  else {
    let ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      const [i, j] = nodeNear(px, pz, 5), nb = neighbors(i, j); if (!nb.length) continue; const b = nb[Math.floor(Math.random() * nb.length)];
      const ax = roadC(i), az = roadC(j), bx = roadC(b[0]), bz = roadC(b[1]); let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const t = R2(0.3, 0.7); x = lerp(ax, bx, t) + (-dz) * 4.2; z = lerp(az, bz, t) + dx * 4.2; h = Math.atan2(dx, dz); from = [i, j]; to = b;
      const d = Math.hypot(x - px, z - pz);
      ok = d > 110 && !(chasing && d > 330) && !cars.some(o => Math.hypot(o.x - x, o.z - z) < 9);
    }
    if (!ok) return null;
  }
  const c = new Car(0xffffff, x, z, h, true, () => makeVehicleMesh(type));
  applyVehDims(c, type.man); c.modelId = id;
  c.cop = true; c.police = true; c.unit = kind; c.seed = Math.random() * 8; c.cruise = R2(U.cruise[0], U.cruise[1]); c.chaseSpeed = U.chase; c.speed = c.cruise; c.chase = !!chasing;
  if (from) { c.from = from; c.to = to; setTarget(c); } else { c.torPatrol = true; c.dirZ = 1; }
  if (U.rider) attachRider(c, kind);
  return c;
}

/* ---------- direção até um alvo: segue as ruas (BFS) e parte direto quando está perto ---------- */
function bfsPath(a, b) {
  const key = (i, j) => i * 4096 + j, prev = new Map([[key(a[0], a[1]), null]]), q = [a];
  while (q.length) { const cur = q.shift(); if (cur[0] === b[0] && cur[1] === b[1]) break; for (const n of neighbors(cur[0], cur[1])) { const k = key(n[0], n[1]); if (!prev.has(k)) { prev.set(k, cur); q.push(n); } } }
  const path = []; let cur = b; while (cur) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
  return path;
}
/* as viaturas não se amontoam nem atravessam outros carros: repulsão e freio de quem está à frente */
function avoidCars(c, tx, tz) {
  let rx = 0, rz = 0, brake = 1; const fx = Math.sin(c.h), fz = Math.cos(c.h), look = 2.5 + Math.max(0, c.speed) * 0.35;
  for (const o of cars) {
    if (o === c) continue;
    const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), half = (c.len + o.len) * 0.5, R = half + 3.2; if (d > R + 4 || d < 0.01) continue;
    if (d < R) { const w = (R - d) / R; rx += dx / d * w; rz += dz / d * w; }
    const ahead = (-dx * fx - dz * fz) / d, lat = Math.abs(-dx * fz + dz * fx);
    if (ahead > 0.35 && lat < (c.cr + o.cr) + 0.6 && d < half + look) brake = Math.min(brake, clamp((d - half) / look, 0, 1));
  }
  return { tx: tx + rx * 14, tz: tz + rz * 14, brake };
}
function driveToward(c, dt, tx0, tz0, vmax, stopD, cap) {
  const d = Math.hypot(tx0 - c.x, tz0 - c.z); c.pathT = (c.pathT || 0) - dt;
  let tx = tx0, tz = tz0;
  if (d > 34) {
    if (c.pathT <= 0 || !c.path) { c.pathT = 1; c.path = bfsPath(snapNode(c.x, c.z), snapNode(tx0, tz0)); }
    while (c.path.length > 1 && Math.hypot(roadC(c.path[0][0]) - c.x, roadC(c.path[0][1]) - c.z) < 12) c.path.shift();
    if (c.path.length > 1) { tx = roadC(c.path[1][0]); tz = roadC(c.path[1][1]); }
  }
  const av = avoidCars(c, tx, tz); tx = av.tx; tz = av.tz;
  const diff = wrap(Math.atan2(tx - c.x, tz - c.z) - c.h);
  let target = vmax * (1 - Math.min(0.65, Math.abs(diff) * 0.7)) * av.brake;
  if (d < 14) target = clamp((d - stopD) * 1.3, 0, cap);
  if ((c.pedAhead || 99) < 14 + Math.abs(c.speed) * 0.5) target = Math.min(target, Math.max(0, ((c.pedAhead || 99) - 4) * 1.1));
  if ((c.reverseT || 0) > 0) { c.reverseT -= dt; target = -6; }
  if(usesCarPhysics(c)){
    if(Math.abs(c.speed)<1.5&&d>stopD+2&&!(c.reverseT>0)){c.stuck+=dt;if(c.stuck>1.4){c.reverseT=1.1;c.stuck=0;}}else c.stuck=0;
    driveCarAI(c,dt,target,diff);return;
  }
  c.speed += clamp(target - c.speed, -26 * dt, 9 * dt);
  if (Math.abs(c.speed) > 0.3) c.h += clamp(diff * 3, -2.2, 2.2) * dt;
  c.steer = clamp(diff, -0.5, 0.5);
  if (Math.abs(c.speed) < 1.5 && d > stopD + 2 && !(c.reverseT > 0)) { c.stuck += dt; if (c.stuck > 1.4) { c.reverseT = 1.1; c.stuck = 0; } } else c.stuck = 0;
  driveCar(c, dt);
}
function updatePoliceChase(c, dt) {
  const pc = player.car, px = pc ? pc.x : player.x, pz = pc ? pc.z : player.z;
  if (favelaMask(px, pz) > 0.2 && FAVELA.gate) {                       // morro: ladeira estreita e becos, a viatura não sobe — para na entrada e a equipe segue a pé
    const g = FAVELA.gate; driveToward(c, dt, g.x - 7 - (c.seed % 3) * 4.5, g.z + ((c.seed * 7) % 5 - 2) * 2.2, c.chaseSpeed || 24, 4, 8);
    c.atGate = Math.hypot(c.x - g.x, c.z - g.z) < 26 && Math.abs(c.speed) < 4; return;
  }
  c.atGate = false;
  driveToward(c, dt, px, pz, c.chaseSpeed || 24, 5, Math.abs(pc ? pc.speed : 5) + 6);
}
/* TOR em ronda: vai e volta pela rodovia (estrada elevada até o pântano), sempre na mão certa */
function updateTorPatrol(c, dt) {
  const zmin = HALF + 25, zmax = HALF + SWD - 70;
  if (c.dirZ > 0 && c.z > zmax) c.dirZ = -1; else if (c.dirZ < 0 && c.z < zmin) c.dirZ = 1;
  const laneX = c.dirZ > 0 ? -4.2 : 4.2, diff = wrap(Math.atan2(laneX - c.x, c.z + c.dirZ * 30 - c.z) - c.h);
  if(usesCarPhysics(c)){driveCarAI(c,dt,c.cruise*(1-Math.min(.5,Math.abs(diff)*.5)),diff);return;}
  c.speed += clamp(c.cruise * (1 - Math.min(0.5, Math.abs(diff) * 0.5)) - c.speed, -20 * dt, 6 * dt);
  if (c.speed > 0.3) c.h += clamp(diff * 3, -1.7, 1.7) * dt; c.steer = clamp(diff, -0.5, 0.5);
  driveCar(c, dt);
}

/* ---------- policiais a pé ---------- */
const officers = [];
function spawnOfficer(car) {
  if (officers.length >= 4) return;
  const ids = unitSkinReady(car.unit); if (!ids.length) return;
  const a = makeActor(skinReady[ids[Math.floor(Math.random() * ids.length)]], true); a.clips = UNIT_CLIPS[car.unit] || {};
  const side = officers.length % 2 ? -1 : 1, x = car.x + Math.cos(car.h) * 2.4 * side, z = car.z - Math.sin(car.h) * 2.4 * side;
  scene.add(a.group); officers.push({ a, car, x, z, h: car.h, state: 'run', t: 0 });
  car.officers = (car.officers || 0) + 1;
}
function clearOfficers() { for (const o of officers) { scene.remove(o.a.group); if (o.car) o.car.officers = 0; } officers.length = 0; }
function updateOfficers(dt) {
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z, inFav = favelaMask(px, pz) > 0.2;
  officers.forEach((o, i) => {
    const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz);
    // cada policial mira um ponto diferente ao redor do alvo (cerco), longe usa o alvo mesmo
    const ang = i * 2.4 + (o.car ? o.car.seed : 0), tx = d > 8 ? px : px + Math.cos(ang) * 2.7, tz = d > 8 ? pz : pz + Math.sin(ang) * 2.7;
    let tx2 = tx, tz2 = tz;
    if (inFav && d > 6 && FAVELA.path) {                               // no morro seguem pelo grafo de ladeira + vielas (nada de atravessar casas)
      o.pathT = (o.pathT || 0) - dt;
      if (o.pathT <= 0 || !o.path) { o.pathT = 1.4; o.path = FAVELA.path(o.x, o.z, px, pz); }
      if (o.path) { while (o.path.length > 1 && Math.hypot(o.path[0][0] - o.x, o.path[0][1] - o.z) < 1.2) o.path.shift(); if (o.path.length > 1 || Math.hypot(o.path[0][0] - o.x, o.path[0][1] - o.z) > 1.2) { tx2 = o.path[0][0]; tz2 = o.path[0][1]; } }
    }
    let wx = tx2 - o.x, wz = tz2 - o.z; const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
    o.h += wrap(Math.atan2(dx, dz) - o.h) * Math.min(1, dt * 8);
    let speed = 0;
    if (o.state === 'run') { speed = inFav ? 4.4 : 5.4; if (d < 3.4) o.state = 'aim'; } else if (d > 6.5) o.state = 'run';
    if (speed > 0) {
      // separação: policiais, NPCs e carros mantêm distância
      let sx = 0, sz = 0;
      for (const q of officers) if (q !== o) { const ex = o.x - q.x, ez = o.z - q.z, e = Math.hypot(ex, ez); if (e < 1.5 && e > 1e-3) { sx += ex / e * (1.5 - e); sz += ez / e * (1.5 - e); } }
      if (typeof forNear === 'function') forNear(o.x, o.z, 1.4, q => { if (q === o || q.isOfficer) return; const ex = o.x - q.x, ez = o.z - q.z, e = Math.hypot(ex, ez); if (e < 1.3 && e > 1e-3) { sx += ex / e * (1.3 - e) * 0.6; sz += ez / e * (1.3 - e) * 0.6; } });
      let mx = wx + sx * 0.9, mz = wz + sz * 0.9; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      if (o.sideT > 0) { o.sideT -= dt; mx = o.sx; mz = o.sz; }
      const ox = o.x, oz = o.z, q = { x: o.x + mx * speed * dt, z: o.z + mz * speed * dt };
      pushOut(q, 0.4, nearby(q.x, q.z));
      for (const c of cars) { const ddx = q.x - c.x, ddz = q.z - c.z; if (ddx * ddx + ddz * ddz > (c.len * 0.5 + 1.5) ** 2) continue; for (const [cx, cz] of carCircles(c)) { const ex = q.x - cx, ez = q.z - cz, e = Math.hypot(ex, ez), r = c.cr + 0.4; if (e < r && e > 1e-3) { q.x += ex / e * (r - e); q.z += ez / e * (r - e); } } }
      const step = Math.hypot(q.x - ox, q.z - oz);
      if (Hq(q.x, q.z) > -0.6 && !(Hq(q.x, q.z) - Hq(ox, oz) > 0.95 * step)) { o.x = q.x; o.z = q.z; }
      // preso atrás de parede/casa: anda de lado um instante
      o.prog = (o.prog || 0) * 0.9 + step / (speed * dt || 1) * 0.1;
      if (o.prog < 0.35 && !(o.sideT > 0)) { const sgn = Math.random() < 0.5 ? 1 : -1; o.sx = -mz * sgn; o.sz = mx * sgn; o.sideT = 0.7; o.prog = 0.6; }
    }
    animateActor(o.a, dt, o.state === 'aim' ? 'aim' : 'run', speed);
    o.a.group.position.set(o.x, Hq(o.x, o.z) + o.a.footOffset, o.z); o.a.group.rotation.y = o.h; if (typeof plantActor === 'function') plantActor(o.a, Hq(o.x, o.z));
  });
}

/* ---------- prisão ---------- */
function busted() {
  const fine = Math.min(money, 300); money -= fine;
  police.heat = 0; police.arrestT = 0; clearOfficers();
  if (player.car) { player.car.speed = 0; leaveCar(); }
  player.x = 20; player.z = 0; player.y = Hq(20, 0); player.vx = player.vz = 0; cam.a = Math.PI / 2;
  for (const c of cars) if (c.chase) { c.chase = false; if (!c.torPatrol) snapToRoad(c); }
  toast('PRESO!  Multa de $' + fine, 3000);
}

/* ---------- sirene (áudio) ---------- */
let sirenOsc = null;
function ensureSirenAudio() {
  if (sirenOsc || !audio) return;
  try {
    const o = audio.ac.createOscillator(), g = audio.ac.createGain(), f = audio.ac.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8; g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(audio.ac.destination); o.start(); sirenOsc = { o, g };
  } catch (e) { /* sem áudio */ }
}
const sirenLights = { red: new THREE.PointLight(0xff2020, 0, 32, 2), blue: new THREE.PointLight(0x2a4dff, 0, 32, 2) };
scene.add(sirenLights.red, sirenLights.blue);

/* ---------- atualização ---------- */
let spawnT = 0, policeReady = false;
function updatePolice(dt) {
  if (!policeReady) return;
  const t = performance.now() / 1000, pc = player.car, px = pc ? pc.x : player.x, pz = pc ? pc.z : player.z;
  police.crimeCd = Math.max(0, police.crimeCd - dt);
  vehLampMats.forEach(m => m.emissiveIntensity = 0.1 + nightF * 1.1);

  if (!player.dead) {
    if (pc && Math.abs(pc.speed) > 36 && inCity(px, pz, 10) && policeNear(60) && police.heat < 2.5) { police.heat = Math.min(2.5, police.heat + 0.35 * dt); police.why = 'excesso de velocidade'; }
    const chasing = police.heat > 0, stars = wantedStars();
    for (const c of copCars()) {
      const d = Math.hypot(px - c.x, pz - c.z);
      if (chasing && d < 300 && !c.chase) { c.chase = true; c.path = null; }
      else if (c.chase && (!chasing || d > 420)) { c.chase = false; c.officers = 0; if (!c.torPatrol) snapToRoad(c); }
      if (c.torPatrol && !c.chase && c.z < HALF + 5) removeCar(c);        // TOR que voltou à cidade: some e a ronda renasce na rodovia
    }
    if (chasing) {
      police.heat = Math.max(0, police.heat - (policeNear(100) ? 0.012 : favelaMask(px, pz) > 0.2 ? 0.035 : 0.25) * dt);      // no morro a polícia demora a chegar e o procurado esfria devagar
      if (police.heat <= 0) { toast('Você escapou da polícia', 2200); clearOfficers(); for (const c of cars) if (c.chase) { c.chase = false; if (!c.torPatrol) snapToRoad(c); } }
    }
    /* composição das viaturas: ronda quando tudo calmo; por nível de procurado em ocorrência */
    spawnT -= dt;
    for (const c of copCars()) if (!c.chase && c !== player.car && Math.hypot(c.x - px, c.z - pz) > 650) removeCar(c);      // ronda que ficou na outra cidade some
    const want = regionWant(chasing ? CHASE_WANT[Math.max(1, stars)] : PATROL_WANT, px);
    if (spawnT <= 0) {
      for (const kind of Object.keys(want)) {
        // em ocorrência só contam as viaturas que já estão atendendo (a TOR de ronda na rodovia, longe, não conta)
        if (copCars().filter(c => c.unit === kind && (!chasing || c.chase)).length < want[kind]) { spawnT = chasing ? 2 : 4; spawnUnit(kind, chasing); break; }
      }
    }
    /* policiais descem das viaturas que chegaram perto */
    for (const c of copCars()) if (c.chase && !UNITS[c.unit].rider && (c.officers || 0) < 2 && ((Math.hypot(px - c.x, pz - c.z) < 24 && Math.abs(c.speed) < 5) || c.atGate) && c.offT === undefined) { c.offT = 0; }
    for (const c of copCars()) if (c.offT !== undefined) { c.offT += dt; if (c.offT > 0.8 && (c.officers || 0) < 2) { c.offT = 0; spawnOfficer(c); } if (!c.chase || (Math.hypot(px - c.x, pz - c.z) > 40 && !c.atGate)) c.offT = undefined; }
    /* abordagem: viatura ou policial a menos de alguns metros enquanto você está parado */
    let near = null, nd = 7.5;
    for (const c of cars) if (c.chase) { const d = Math.hypot(px - c.x, pz - c.z); if (d < nd) { nd = d; near = c; } }
    for (const o of officers) if (o.state === 'aim') { const d = Math.hypot(px - o.x, pz - o.z); if (d < 5) near = o.car || near || true; }
    const slow = pc ? Math.abs(pc.speed) < 5 : Math.hypot(player.vx, player.vz) < 3;
    if (near && slow && police.heat > 0) police.arrestT += dt; else police.arrestT = Math.max(0, police.arrestT - dt * 2);
    if (police.arrestT > 2.4) busted();
  }
  const s = wantedStars();
  if (s > police.lastStars) { toast('★'.repeat(s) + ' PROCURADO' + (police.why ? ' — ' + police.why : ''), 2400); prefetchTier(s); }
  police.lastStars = s;
  if (!police.heat && officers.length) { police.offClear = (police.offClear || 0) + dt; if (police.offClear > 3) { clearOfficers(); police.offClear = 0; } } else police.offClear = 0;
  updateOfficers(dt);
  if (typeof updateEms === 'function') updateEms(dt);

  /* nível de detalhe, luzes piscando e sirene */
  let best = null, bd = 1e9;
  for (const c of cars) {
    const u = c.mesh.userData; if (!u.hiList) continue;
    const dcam = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
    { const own = c === player.car || (player.trans && player.trans.c === c) || (u.door && (u.door.a > 0.001 || u.door.target > 0)), near = dcam < (u.lodLevel === 0 ? 17 : 13) && (typeof _vf !== 'undefined') && _vf.intersectsSphere(_vs.set(_lv.set(c.x, Hq(c.x, c.z) + 1, c.z), c.len * 0.6)); setVehLod(u, own || near ? 0 : dcam > (u.lodLevel === 2 ? 46 : 52) ? 2 : 1, own);
      if (u.lodLevel === 1) { const cs = dcam < 30; for (const m of u.loList) if (m.castShadow !== cs) m.castShadow = cs; } }
    c.mesh.visible = dcam < 320;
    if (c.rider) { c.rider.group.visible = dcam < 260 && !(c === player.car) && !c.driverGone; if (dcam < 120 && c.rider.group.visible) animateActor(c.rider, dt, 'sit', 0); }
    else if (c.ai && !(c === player.car)) updateNpcDriver(c, dcam, dt);
    if (!u.lights) continue;
    const on = (c.cop && (c.chase || c.sirenManual)) || (c.ems && c.ems.state !== 'gone'), f = Math.floor((t * 10 + (c.seed || 0)) % 8);
    u.lights.A.visible = on && (f === 0 || f === 2 || f === 5); u.lights.B.visible = on && (f === 4 || f === 6 || f === 1);
    if (on && dcam < bd) { bd = dcam; best = c; }
  }
  if (best) {
    const f = Math.floor((t * 10 + (best.seed || 0)) % 8), y = Hq(best.x, best.z) + 2.2, lx = Math.cos(best.h) * 0.5, lz = -Math.sin(best.h) * 0.5;
    sirenLights.red.position.set(best.x + lx, y, best.z + lz); sirenLights.blue.position.set(best.x - lx, y, best.z - lz);
    const I = 1.2 + nightF * 2.2;
    sirenLights.red.intensity = (f === 0 || f === 2) ? I : 0; sirenLights.blue.intensity = (f === 4 || f === 6) ? I : 0;
  } else { sirenLights.red.intensity = 0; sirenLights.blue.intensity = 0; }
  ensureSirenAudio();
  if (sirenOsc) {
    const tt = audio.ac.currentTime;
    sirenOsc.o.frequency.setTargetAtTime(700 + 450 * (0.5 + 0.5 * Math.sin(t * 6.3)), tt, 0.02);
    sirenOsc.g.gain.setTargetAtTime(best ? 0.05 * clamp(1 - bd / 260, 0, 1) : 0, tt, 0.08);
  }
}
function policeHud() {
  const s = wantedStars(), el = $('wanted');
  el.textContent = s ? '★'.repeat(s) + '☆'.repeat(3 - s) + (police.arrestT > 0.2 ? '  ABORDADO!' : '') : '';
  const kinds = [...new Set(copCars().filter(c => c.chase).map(c => UNITS[c.unit].label))];
  $('units').textContent = kinds.join(' · ');
}

/* ---------- início: carrega a ronda básica e a viatura estacionada ---------- */
Promise.all([...['rp', 'rocam', 'tor'].map(prefetchUnit), loadVehicleType('palio_rp')]).then(() => {
  const ids = unitModelReady('rp'), type = vehReady[ids[0]];
  const pk = new Car(0xffffff, 44, -4.5, Math.PI / 2, false, () => makeVehicleMesh(type));   // viatura estacionada perto do início
  applyVehDims(pk, type.man); pk.modelId = ids[0]; pk.cop = true; pk.unit = 'rp'; pk.seed = Math.random() * 8;
  policeReady = true;
});
