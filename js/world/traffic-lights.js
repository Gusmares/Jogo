/* NEON COAST — Semáforos e gerenciamento do tráfego.
   • Cada cruzamento tem um semáforo (verde → amarelo → vermelho geral → outro sentido), com defasagem diferente por cruzamento; carros param na faixa de retenção
     e pedestres esperam o vermelho dos carros para atravessar na faixa.
   • O tráfego "mora" em volta do jogador: carros nascem nas ruas a 130–330 m, somem longe, e há carros estacionados nos meios-fios (dormem quando longe). */
'use strict';
const TL = { clock: 0, G: 12, Y: 2.4, AR: 1.6, heads: [], t: 0 };
TL.half = TL.G + TL.Y + TL.AR; TL.cycle = TL.half * 2;
/* estado do semáforo do cruzamento (i,j) para quem anda ao longo do eixo 'x' ou 'z': 0 verde, 1 amarelo, 2 vermelho */
function lightState(i, j, axis) {
  if (isHwyNode(i, j)) return 0;                                    // rodovia: sem semáforo
  const t = (TL.clock + ((i * 7 + j * 13) % 9) * 3.3) % TL.cycle, inZ = t < TL.half, u = inZ ? t : t - TL.half, mine = (axis === 'z') === inZ;
  if (!mine) return 2;
  return u < TL.G ? 0 : u < TL.G + TL.Y ? 1 : 2;
}
/* postes e cabeças dos semáforos (instanciados): 4 cantos por cruzamento, 2 cabeças por poste (uma para cada eixo) */
{
  const heads = [];
  for (const C of CITIES) for (let i = C.i0; i <= C.i0 + C.ni; i++) for (let j = C.j0; j <= C.j0 + C.nj; j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = roadC(i) + sx * 9.7, pz = roadC(j) + sz * 9.7;
    heads.push({ i, j, axis: 'z', x: px, z: pz, fx: 0, fz: sz, last: -1 }, { i, j, axis: 'x', x: px, z: pz, fx: sx, fz: 0, last: -1 });
  }
  TL.heads = heads;
  const poles = [], seen = new Set(); heads.forEach(h => { const k = h.x + ',' + h.z; if (!seen.has(k)) { seen.add(k); poles.push(h); addRound(h.x, h.z, 0.22); } });
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6).translate(0, 2.8, 0), poleMat, poles.length), bodyM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 1.15, 0.36), new THREE.MeshLambertMaterial({ color: 0x1b1d21 }), heads.length),
    lens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.27, 0.27, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff }), heads.length * 3), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  poles.forEach((p, k) => { m.makeTranslation(p.x, 0.3, p.z); pm.setMatrixAt(k, m); });
  heads.forEach((h, k) => {
    const yaw = Math.atan2(h.fx, h.fz); q.setFromEuler(e.set(0, yaw, 0));
    v.set(h.x + h.fx * 0.33, 5.0, h.z + h.fz * 0.33); m.compose(v, q, one); bodyM.setMatrixAt(k, m);
    for (let l = 0; l < 3; l++) { v.set(h.x + h.fx * 0.53, 5.38 - l * 0.36, h.z + h.fz * 0.53); m.compose(v, q, one); lens.setMatrixAt(k * 3 + l, m); lens.setColorAt(k * 3 + l, new THREE.Color(0x222222)); }
  });
  pm.frustumCulled = bodyM.frustumCulled = lens.frustumCulled = false; scene.add(pm, bodyM, lens); TL.lens = lens;
}
const TL_ON = [new THREE.Color(1, 0.12, 0.08), new THREE.Color(1, 0.8, 0.1), new THREE.Color(0.1, 1, 0.3)], TL_OFF = [new THREE.Color(0.22, 0.03, 0.02), new THREE.Color(0.22, 0.17, 0.02), new THREE.Color(0.02, 0.2, 0.06)];
function updateTrafficLights(dt) {
  TL.clock += dt; TL.t -= dt; if (TL.t > 0) return; TL.t = 0.2;
  let dirty = false;
  TL.heads.forEach((h, k) => {
    const st = lightState(h.i, h.j, h.axis); if (st === h.last) return; h.last = st; dirty = true;
    // st 0 verde, 1 amarelo, 2 vermelho -> lente (0 vermelha, 1 amarela, 2 verde)
    const on = st === 0 ? 2 : st === 1 ? 1 : 0; for (let l = 0; l < 3; l++) TL.lens.setColorAt(k * 3 + l, l === on ? TL_ON[l] : TL_OFF[l]);
  });
  if (dirty) TL.lens.instanceColor.needsUpdate = true;
}

/* ---------- tráfego em volta do jogador ---------- */
let trafficSpawnT = 0;
const isTrafficCar = c => c.ai && !c.cop && !c.ems && !c.chase;
function roadSpot(px, pz, minD, maxD) {
  for (let tries = 0; tries < 40; tries++) {
    const [i, j] = nodeNear(px, pz, 4), nb = neighbors(i, j); if (!nb.length) continue; const b = nb[Math.floor(Math.random() * nb.length)];
    const ax = roadC(i), az = roadC(j), bx = roadC(b[0]), bz = roadC(b[1]); let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const t = R2(0.28, 0.72), x = lerp(ax, bx, t), z = lerp(az, bz, t), d = Math.hypot(x - px, z - pz); if (d < minD || d > maxD) continue;
    return { i, j, b, dx, dz, x, z, d };
  }
  return null;
}
function inCamView(x, z) { camera.getWorldDirection(_tdir); const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1; return (dx * _tdir.x + dz * _tdir.z) / d > 0.35; }
const _tdir = new THREE.Vector3();
function spawnTrafficCar(px, pz) {
  const s = roadSpot(px, pz, 120, 330); if (!s) return null;
  const x = s.x + (-s.dz) * 4.2, z = s.z + s.dx * 4.2;
  if (s.d < 190 && inCamView(x, z)) return null;
  if (cars.some(o => Math.hypot(o.x - x, o.z - z) < 11)) return null;
  const c = new Car(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], x, z, Math.atan2(s.dx, s.dz), true);
  if (window.upgradeTrafficCar) window.upgradeTrafficCar(c);
  c.from = [s.i, s.j]; c.to = s.b; setTarget(c); c.speed = c.cruise; return c;
}
function spawnParkedCar(px, pz) {
  const s = roadSpot(px, pz, 40, 260); if (!s) return null;
  const side = Math.random() < 0.5 ? 1 : -1, x = s.x + (-s.dz) * 7.5 * side, z = s.z + s.dx * 7.5 * side;
  if (s.d < 150 && inCamView(x, z)) return null;
  if (cars.some(o => Math.hypot(o.x - x, o.z - z) < 6.5)) return null;
  const c = new Car(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], x, z, Math.atan2(s.dx, s.dz) + (Math.random() < 0.5 ? 0 : Math.PI) + R2(-0.03, 0.03), false);
  if (window.upgradeTrafficCar) window.upgradeTrafficCar(c);
  c.parked = true; c.speed = 0; return c;
}
function manageTraffic(dt) {
  trafficSpawnT -= dt; if (trafficSpawnT > 0) return; trafficSpawnT = 0.35;
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z, night = typeof nightF === 'number' ? nightF : 0;
  let ai = 0, parked = 0;
  for (const c of cars.slice()) {
    const d = Math.hypot(c.x - px, c.z - pz);
    if (isTrafficCar(c) && c !== player.car) { ai++; if (d > 400) { removeCar(c); ai--; } }
    else if (c.parked && !c.cop) { parked++; c.sleep = d > 85 && Math.abs(c.speed) < 0.2; if (d > 340 && c !== player.car) { removeCar(c); parked--; } }
  }
  if (ai < Math.round(30 * (1 - 0.45 * night)) && cars.length < 90) spawnTrafficCar(px, pz);
  if (parked < 26 && cars.length < 90) spawnParkedCar(px, pz);
}
/* carro entra/sai como "estacionado" quando o jogador o rouba e larga depois */
