/* NEON COAST — Dano dos veículos: batidas estragam o carro/moto/ônibus e, raramente, soltam uma roda.
   Cada veículo guarda dano por região (frente, trás, esquerda, direita). O dano tira potência (frente), faz o carro puxar para um lado
   e limita o esterço. Em batida muito forte a roda mais próxima do impacto pode soltar: o canto cai, o veículo raspa e a roda sai rolando. */
'use strict';

const wheelDebris = [], smokePuffs = [];
const clampD = (v, a, b) => Math.max(a, Math.min(b, v));
const vehDamage = c => c.dmg || (c.dmg = { front: 0, rear: 0, left: 0, right: 0, total: 0, lost: 0, smokeT: 0 });

/* ---------- amassados visíveis na lataria ----------
   Cada carro batido ganha cópias dos próprios materiais (só quando é batido pela 1ª vez) com um deslocamento de vértices:
   até 6 amassados locais (posição, direção para dentro, profundidade, raio) empurram a malha para dentro e escurecem a tinta.
   Funciona igual na malha completa e na simplificada, sem recalcular geometria. */
const MAX_DENTS = 6;
function dentPatch(shader) {
  shader.uniforms.uDentP = this.userData.dentU.uDentP; shader.uniforms.uDentD = this.userData.dentU.uDentD; shader.uniforms.uDentN = this.userData.dentU.uDentN;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
uniform vec4 uDentP[6]; uniform vec4 uDentD[6]; uniform float uDentN; varying float vDent;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      float dm = 0.0;
      for (int i = 0; i < 6; i++) {
        if (float(i) >= uDentN) break;
        vec3 dd = position - uDentP[i].xyz; dd.y *= 1.35;
        float fall = 1.0 - smoothstep(0.0, 1.0, length(dd) / uDentD[i].w);
        float nz = 0.62 + 0.38 * sin(position.x * 17.0 + position.y * 9.0) * sin(position.z * 13.0 + position.y * 7.0);
        transformed += uDentD[i].xyz * uDentP[i].w * fall * nz;
        dm = max(dm, fall * min(1.0, uDentP[i].w * 3.5));
      }
      vDent = dm;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vDent;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= 1.0 - 0.4 * vDent;`);
}
function ensureDents(c) {
  const u = c.mesh.userData; if (u.dent) return u.dent;
  const type = vehReady[c.modelId]; if (!type || !u.hiList || !u.hiList[0] || !u.loList[0]) return null;
  const geo = type.geo.body; if (!geo.boundingBox) geo.computeBoundingBox();
  const dent = { n: 0, list: [], box: geo.boundingBox, uP: [], uD: [] };
  for (let i = 0; i < MAX_DENTS; i++) { dent.uP.push(new THREE.Vector4()); dent.uD.push(new THREE.Vector4(0, 0, -1, 1)); }
  const dentU = { uDentP: { value: dent.uP }, uDentD: { value: dent.uD }, uDentN: { value: 0 } }; dent.u = dentU;
  const src = u.hiList[0].material, clones = src.map(m => {
    const cm = m.clone(); cm.userData = { dentU }; cm.onBeforeCompile = dentPatch; cm.customProgramCacheKey = () => 'dent';
    if (vehLampMats.includes(m)) { vehLampMats.push(cm); cm.addEventListener('dispose', () => { const i = vehLampMats.indexOf(cm); if (i >= 0) vehLampMats.splice(i, 1); }); }
    return cm;
  });
  const loSrc = u.loList[0].material;
  if (Array.isArray(loSrc) && loSrc.length === clones.length + 1) { const rc = loSrc[0].clone(); rc.userData = { dentU }; rc.onBeforeCompile = dentPatch; rc.customProgramCacheKey = () => 'dentL'; u.loList[0].material = [rc].concat(clones); if (u.farM) u.farM.material = [rc].concat(clones); clones.push(rc); }
  else u.loList[0].material = clones;
  u.hiList[0].material = clones.slice(0, src.length); if (u.door) u.door.mesh.material = u.hiList[0].material; u.ownedMats = (u.ownedMats || []).concat(clones);
  return u.dent = dent;
}
function addDent(c, lx, lz, sev) {
  const dent = ensureDents(c); if (!dent) return;
  const b = dent.box, sx = Math.max(0.3, b.max.x), sizeF = clampD((b.max.z - b.min.z) / 4.4, 0.45, 1.6);
  // o ponto de contato vem do círculo de colisão: encosta na superfície da malha
  const ex = clampD(lx, b.min.x * 0.96, b.max.x * 0.96), ez = clampD(lz, b.min.z * 0.96, b.max.z * 0.96);
  const alongZ = Math.abs(lz) / Math.max(0.5, (b.max.z - b.min.z) / 2) > Math.abs(lx) / sx;
  const px = alongZ ? ex * 0.8 : Math.sign(lx || 1) * b.max.x * 0.92, pz = alongZ ? Math.sign(lz || 1) * (lz > 0 ? b.max.z : -b.min.z) * 0.95 : ez;
  const py = b.min.y + (b.max.y - b.min.y) * (c.kind === 'bike' ? 0.45 : 0.36);
  const dirx = alongZ ? -Math.sign(px) * 0.25 * Math.abs(px) / sx : -Math.sign(px), dirz = alongZ ? -Math.sign(pz) : -Math.sign(pz) * 0.25;
  const dl = Math.hypot(dirx, -0.12, dirz), depth = clampD(sev * 0.34 * clampD(sizeF, 0.5, 1.3), 0.03, 0.5), radius = (0.65 + sev * 0.9) * sizeF;
  // amassado no mesmo lugar: só aprofunda
  let slot = dent.list.findIndex(d => Math.hypot(d.px - px, d.py - py, d.pz - pz) < 0.55 * sizeF);
  if (slot < 0) { if (dent.list.length < MAX_DENTS) slot = dent.list.length; else { let m = 1e9; dent.list.forEach((d, i) => { if (d.depth < m) { m = d.depth; slot = i; } }); } }
  const prev = dent.list[slot] && Math.hypot(dent.list[slot].px - px, dent.list[slot].py - py, dent.list[slot].pz - pz) < 0.55 * sizeF ? dent.list[slot] : null;
  dent.list[slot] = { px, py, pz, depth: Math.min(0.5, (prev ? prev.depth : 0) + depth), radius: Math.max(prev ? prev.radius : 0, radius), dx: dirx / dl, dy: -0.12 / dl, dz: dirz / dl };
  dent.list.forEach((d, i) => { dent.uP[i].set(d.px, d.py, d.pz, d.depth); dent.uD[i].set(d.dx, d.dy, d.dz, d.radius); });
  dent.u.uDentN.value = dent.list.length;
}
function clearDents(c) { const d = c.mesh.userData.dent; if (d) { d.list.length = 0; d.u.uDentN.value = 0; } }

/* chamado a cada colisão: impact = velocidade de aproximação (m/s) no ponto (px, pz); other = o outro veículo (ou null = parede) */
function applyVehicleDamage(c, impact, other, px, pz) {
  if (!c.physics || impact < 3.5) return;
  // uma batida dura vários quadros: só conta de novo se o impacto for maior que o já registrado (e só sorteia a roda uma vez por batida)
  if ((c.dmgCd || 0) > 0 && impact <= (c.lastImpact || 0) * 1.25) return;
  const firstHit = !((c.dmgCd || 0) > 0); c.lastImpact = impact; c.dmgCd = 0.5;
  const p = c.physics, mass = p.cfg.mass, om = other && other.physics ? other.physics.cfg.mass : 12000;
  // gravidade da batida: cresce com a velocidade e com o peso do outro lado (bater num muro ou num ônibus dói mais que num Fusca)
  const sev = clampD((impact - 3.5) / 26, 0, 1.2) * clampD(Math.sqrt(om / mass), 0.4, 1.7);
  const d = vehDamage(c), dx = px - c.x, dz = pz - c.z;
  const lz = dx * Math.sin(c.h) + dz * Math.cos(c.h), lx = dx * Math.cos(c.h) - dz * Math.sin(c.h);   // +z frente, +x esquerda
  const front = Math.abs(lz) >= Math.abs(lx) * 0.8;
  if (front) d[lz > 0 ? 'front' : 'rear'] = clampD(d[lz > 0 ? 'front' : 'rear'] + sev * 0.8, 0, 1);
  d[lx > 0 ? 'left' : 'right'] = clampD(d[lx > 0 ? 'left' : 'right'] + sev * (front ? 0.25 : 0.8), 0, 1);
  d.total = clampD(d.total + sev * 0.45, 0, 1);
  if (sev > 0.08) addDent(c, lx, lz, clampD(sev, 0, 1.2));
  // perder a roda é RARO: só em batida muito violenta (> ~50 km/h) e mesmo assim com chance baixa
  // (acima de ~72 km/h; a 100 km/h ~10%, a 130 km/h ~20%)
  if (firstHit && impact > 20 && sev > 0.6) {
    const chance = clampD((impact - 20) / 20, 0, 1) * 0.25;
    if (Math.random() < chance) {
      let best = -1, bd = 1e9;
      p.wheels.forEach((w, i) => { if (w.lost) return; const q = CarPhysics.point(c, w), dd = Math.hypot(q.x - px, q.z - pz); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0 && bd < 3.2) detachWheel(c, best, impact);
    }
  }
  if (c === player.car && sev > 0.35) toast(d.total > 0.7 ? 'Veículo muito danificado!' : 'Veículo danificado', 1300);
}

function detachWheel(c, i, impact) {
  const p = c.physics, u = c.mesh.userData, w = p.wheels[i], d = vehDamage(c);
  w.lost = true; d.lost++; if (u.wheels[i]) u.wheels[i].pivot.visible = false;
  const q = CarPhysics.point(c, w), type = vehReady[c.modelId], set = (type && type.man.wheels[i]) ? type.man.wheels[i].set : 0;
  let mesh;
  if (type && type.geo['wheel' + set]) mesh = new THREE.Mesh(type.geo['wheel' + set], type.mats);
  else mesh = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, 0.25, 14).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x151515 }));
  const holder = new THREE.Group(); holder.add(mesh); holder.position.set(q.x, q.y, q.z); holder.rotation.y = c.h + (w.x < 0 ? 0 : Math.PI); scene.add(holder);
  const side = w.x > 0 ? 1 : -1;
  wheelDebris.push({ g: holder, spinMesh: mesh, x: q.x, y: q.y, z: q.z, vx: p.vx * 0.8 + Math.cos(c.h) * side * R2(2, 6), vy: R2(3, 7), vz: p.vz * 0.8 - Math.sin(c.h) * side * R2(2, 6), r: w.r, ang: 0, life: 30 });
  while (wheelDebris.length > 8) { const o = wheelDebris.shift(); scene.remove(o.g); }
  if (c === player.car) { toast('A RODA SOLTOU!', 1800); shake = Math.max(shake, 1); }
  p.impact = 0;
}

/* a cada quadro: rodas soltas rolando e quicando, fumaça de veículos muito danificados */
const smokeMat = new THREE.SpriteMaterial({ map: typeof glowTex !== 'undefined' ? glowTex : null, color: 0x555555, transparent: true, depthWrite: false, opacity: 0.5, fog: true });
function updateDamageEffects(dt) {
  for (const c of cars) if (c.dmgCd > 0) c.dmgCd -= dt;
  for (let i = wheelDebris.length - 1; i >= 0; i--) {
    const o = wheelDebris[i]; o.life -= dt;
    o.vy -= 9.81 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
    const gh = Hq(o.x, o.z) + o.r;
    if (o.y < gh) { o.y = gh; if (o.vy < 0) o.vy = -o.vy * 0.38; if (Math.abs(o.vy) < 0.8) o.vy = 0; const f = Math.exp(-dt * 0.55); o.vx *= f; o.vz *= f; }
    if (o.y <= gh + 0.01) { const sp = Math.hypot(o.vx, o.vz); o.ang += sp * dt / o.r; }
    o.g.position.set(o.x, o.y, o.z); o.spinMesh.rotation.x = o.ang;
    if (o.life <= 0 || o.y < -3) { scene.remove(o.g); wheelDebris.splice(i, 1); }
  }
  for (let i = smokePuffs.length - 1; i >= 0; i--) {
    const s = smokePuffs[i]; s.life -= dt; s.sp.position.y += dt * 1.6; s.sp.position.x += s.dx * dt; s.sp.position.z += s.dz * dt;
    const t = 1 - s.life / s.max; s.sp.scale.setScalar(0.8 + t * 3.2); s.sp.material.opacity = 0.45 * (1 - t);
    if (s.life <= 0) { scene.remove(s.sp); s.sp.material.dispose(); smokePuffs.splice(i, 1); }
  }
  // fumaça saindo do capô quando a frente está muito destruída (só perto da câmera)
  for (const c of cars) {
    const d = c.dmg; if (!d || d.front < 0.45 && d.total < 0.7) continue;
    d.smokeT -= dt; if (d.smokeT > 0 || smokePuffs.length > 40) continue;
    if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) > 90) continue;
    d.smokeT = 0.12 + (1 - Math.max(d.front, d.total)) * 0.35;
    const m = smokeMat.clone(), sp = new THREE.Sprite(m), fx = Math.sin(c.h), fz = Math.cos(c.h), len = c.len * 0.32, y = (c.physics ? c.physics.y - c.physics.cfg.cg : Hq(c.x, c.z)) + 1.1;
    sp.position.set(c.x + fx * len, y, c.z + fz * len); scene.add(sp);
    smokePuffs.push({ sp, life: 1.8, max: 1.8, dx: R2(-0.4, 0.4), dz: R2(-0.4, 0.4) });
  }
}

/* o conserto (reposicionar o carro) devolve as rodas e zera o dano */
function repairVehicle(c) {
  const u = c.mesh.userData; c.dmg = null; clearDents(c);
  if (u.wheels) u.wheels.forEach(w => { w.pivot.visible = true; });
}
