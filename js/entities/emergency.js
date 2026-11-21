/* NEON COAST — Serviços de emergência: SAMU (192) e Bombeiros (193).
   Em acidente com vítima os dois atuam juntos: a ambulância vem em qualquer batida séria; o caminhão dos
   Bombeiros (resgate/salvamento) vem em batida grave. Chegam com sirene, ficam no local e depois vão embora. */
'use strict';

const EMS = { cd: 0, queue: [] };

function emsCall(x, z, sev) {
  if (EMS.cd > 0 || sev < 8) return;
  EMS.cd = 80;
  loadVehicleType('ambulancia'); loadVehicleType('bombeiros');
  EMS.queue.push({ kind: 'ambulancia', x, z, delay: 0 });
  toast('SAMU (192) a caminho', 2200);
  if (sev >= 20) { EMS.queue.push({ kind: 'bombeiros', x, z, delay: 4 }); setTimeout(() => toast('Bombeiros (193) a caminho', 2200), 1800); }
}
function spawnEms(job) {
  const type = vehReady[job.kind]; if (!type) return false;
  for (let tries = 0; tries < 40; tries++) {
    const [i, j] = nodeNear(job.x, job.z, 5), nb = neighbors(i, j); if (!nb.length) continue; const b = nb[Math.floor(Math.random() * nb.length)];
    const ax = roadC(i), az = roadC(j), bx = roadC(b[0]), bz = roadC(b[1]); let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const t = R2(0.3, 0.7), x = lerp(ax, bx, t) + (-dz) * 4.2, z = lerp(az, bz, t) + dx * 4.2, d = Math.hypot(x - job.x, z - job.z);
    if (d < 120 || d > 360 || cars.some(o => Math.hypot(o.x - x, o.z - z) < 10)) continue;
    const c = new Car(0xffffff, x, z, Math.atan2(dx, dz), true, () => makeVehicleMesh(type));
    applyVehDims(c, type.man); c.modelId = job.kind; c.seed = Math.random() * 8; c.speed = 12;
    c.ems = { state: 'enroute', tx: job.x, tz: job.z, timer: 0, lx: 0, lz: 0 }; c.from = [i, j]; c.to = b; setTarget(c);
    return true;
  }
  return false;
}
function updateEmsCar(c, dt) {
  const e = c.ems, d = Math.hypot(e.tx - c.x, e.tz - c.z), pc = player.car, px = pc ? pc.x : player.x, pz = pc ? pc.z : player.z;
  if (e.state === 'enroute') { driveToward(c, dt, e.tx, e.tz, 20, 7, 20); if (d < 10 && Math.abs(c.speed) < 2) { e.state = 'onscene'; e.timer = c.modelId === 'bombeiros' ? 45 : 35; } }
  else if (e.state === 'onscene') {
    driveToward(c, dt, e.tx, e.tz, 6, 7, 6); e.timer -= dt;
    if (e.timer <= 0) { e.state = 'leaving'; e.timer = 70; const C = nearestCity(c.x, c.z), far = [Math.random() < 0.5 ? C.i0 : C.i0 + C.ni, Math.random() < 0.5 ? C.j0 : C.j0 + C.nj]; e.lx = roadC(far[0]); e.lz = roadC(far[1]); }
  } else if (e.state === 'leaving') {
    driveToward(c, dt, e.lx, e.lz, 18, 4, 18); e.timer -= dt;
    if (e.timer <= 0 || Math.hypot(px - c.x, pz - c.z) > 330) { e.state = 'gone'; removeCar(c); }
  }
}
function updateEms(dt) {
  EMS.cd = Math.max(0, EMS.cd - dt);
  for (const j of EMS.queue) j.delay -= dt;
  EMS.queue = EMS.queue.filter(j => !(j.delay <= 0 && spawnEms(j)));
}
