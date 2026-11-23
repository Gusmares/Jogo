/* NEON COAST — Armas: mira por cima do ombro, andar mirando (GunMove_*), tiro com dispersão e recuo, recarga animada, tracer e impactos.
   O raio do tiro é analítico (NPCs, carros, paredes e relevo) — nada de varrer a cena inteira nem testar malhas de centenas de milhares de triângulos. */
'use strict';
const weapons = { items: [], selected: -1, mesh: null, actor: null, cooldown: 0, reloading: 0, trigger: false, effects: [], aim: 0, aimT: 0, sinceShot: 9, recoilAcc: 0, pitch: 0, spread: 0, kick: 0, flash: 0, swap: 0, held: false };
/* animações reais por arma: tiro (recuo), recarga e pose de mira; "auto" = segura o botão e continua atirando */
const WEAPON_ANIM = {
  taurus_247: { fire: 'colt45_fire', reload: 'colt45_reload', pose: 0.12, oneHand: true, holdFire: true, auto: false, spread: 0.012, kick: 0.024, dmg: 34, muzzle: 0.2, range: 140, snd: 'pistol' },
  fn_fal:     { fire: 'RIFLE_fire',  reload: 'RIFLE_load',    pose: 0.32, lhand: [-0.27, -0.08, 0.02], holdFire: true, twoHand: true, auto: true,  spread: 0.016, kick: 0.017, dmg: 60, muzzle: 0.82, range: 200, snd: 'rifle' }
};
/* estilos das armas do pack: cada arma do catálogo diz o estilo (style) e ganha animação, dano, dispersão e recuo daqui */
const RIFLE_BASE = { fire: 'RIFLE_fire', reload: 'RIFLE_load', pose: 0.32, holdFire: true, twoHand: true, snd: 'rifle' };
const PISTOL_BASE = { fire: 'colt45_fire', reload: 'colt45_reload', pose: 0.12, oneHand: true, holdFire: true, snd: 'pistol' };
const WSTYLE = {
  pistol:  { ...PISTOL_BASE, auto: false, spread: 0.012, kick: 0.024, dmg: 30, range: 140 },
  taser:   { ...PISTOL_BASE, auto: false, spread: 0.006, kick: 0.01, dmg: 4, range: 14, stun: true },
  deagle:  { ...PISTOL_BASE, fire: 'python_fire', reload: 'python_reload', auto: false, spread: 0.01, kick: 0.06, dmg: 75, range: 160 },
  smg:     { ...PISTOL_BASE, fire: 'UZI_fire', reload: 'UZI_reload', pose: 0.1, auto: true, spread: 0.03, kick: 0.011, dmg: 20, range: 110 },
  sawnoff: { ...PISTOL_BASE, auto: false, spread: 0.01, pellets: 7, pspread: 0.085, kick: 0.055, dmg: 12, range: 40 },
  smg2:    { ...RIFLE_BASE, auto: true, spread: 0.02, kick: 0.012, dmg: 26, range: 150 },
  rifle:   { ...RIFLE_BASE, auto: true, spread: 0.017, kick: 0.018, dmg: 48, range: 210 },
  sniper:  { ...RIFLE_BASE, auto: false, spread: 0.002, kick: 0.07, dmg: 160, range: 340, zoom: true },
  shotgun: { ...RIFLE_BASE, fire: 'shotgun_fire', pose: 0.1, auto: false, spread: 0.01, pellets: 8, pspread: 0.055, kick: 0.05, dmg: 15, range: 60 },
  spas:    { ...RIFLE_BASE, fire: 'buddy_fire', reload: 'buddy_reload', pose: 0.1, auto: false, spread: 0.01, pellets: 7, pspread: 0.06, kick: 0.04, dmg: 14, range: 60 },
  knife:   { melee: true, fire: 'knife_1', combo: ['knife_1', 'knife_2', 'knife_3'], dmg: 45, reach: 1.9, range: 2, snd: null, spread: 0, kick: 0 },
  katana:  { melee: true, fire: 'sword_1', combo: ['sword_1', 'sword_2', 'sword_3'], dmg: 85, reach: 2.4, range: 2.5, snd: null, spread: 0, kick: 0 }
};
const WORDER = ['pistol', 'taser', 'deagle', 'smg', 'sawnoff', 'smg2', 'rifle', 'sniper', 'shotgun', 'spas', 'knife', 'katana'];
const wAnim = w => WEAPON_ANIM[w && w.id] || WEAPON_ANIM.taurus_247;
const weaponReady = assetCatalogReady.then(async catalog => {
  const results = await Promise.allSettled(catalog.weapons.map(async w => ({ ...w, type: await loadVehicleType(w.id), ammo: w.capacity })));
  weapons.items = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  for (const w of weapons.items) if (w.style && WSTYLE[w.style] && !WEAPON_ANIM[w.id]) {            // armas do pack: estilo + cano medido no modelo
    const g = w.type.geo.body; if (!g.boundingBox) g.computeBoundingBox(); const muzzle = Math.max(0.15, -g.boundingBox.min.x);
    WEAPON_ANIM[w.id] = Object.assign({}, WSTYLE[w.style], { muzzle }, WSTYLE[w.style].twoHand ? { lhand: [-muzzle * 0.36, -0.08, 0.02] } : {});
  }
  const rank = w => w.id === 'taurus_247' ? -2 : w.id === 'fn_fal' ? 5.5 : WORDER.indexOf(w.style);
  weapons.items.sort((a, b) => rank(a) - rank(b));
  results.filter(r => r.status === 'rejected').forEach(r => console.warn('Arma:', r.reason));
  return weapons.items;
}).catch(e => { console.warn(e); return []; });
/* "empunhadura": posição/rotação da arma relativas ao osso da mão, calibradas na pose de mira de cada arma (cano para a frente) */
const _gp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _fwd = new THREE.Vector3(0, 0, 1);
function calibrateGrip(item) {
  const a = player.actor; if (!a || !a.ap) return null; const A = wAnim(item), sy = a.group.rotation.y, sp = a.group.position.clone(), ss = a.group.scale.x;
  a.group.scale.setScalar(1); a.group.rotation.y = 0; a.group.position.set(0, a.footOffset, 0);
  // o clipe da pistola só tem o braço direito: calibra sobre a pose parada (IDLE) com o braço do clipe por cima, a mesma composição usada no jogo
  if (A.oneHand || A.twoHand) { a.ap.play('IDLE_stance', { loop: false, fade: 0, restart: true }); a.ap.time = 0; a.ap.speed = 0.0001; a.ap.setOverlay(A.fire, UPPER_BONE_IDS); a.ap.overlay.time = A.pose || 0; }
  else { a.ap.play(A.fire, { loop: false, fade: 0, restart: true }); a.ap.time = A.pose || 0; a.ap.speed = 0.0001; }
  a.ap.update(0.0001); a.ap.prev = null; a.ap.fade = 1; a.ap.setOverlay(null);
  a.group.updateMatrixWorld(true);
  const hand = a.bones[a.index.rhand], hw = hand.matrixWorld.clone(); _gp.setFromMatrixPosition(hw); _gq.setFromUnitVectors(_ax, _fwd);
  item.grip = hw.clone().invert().multiply(new THREE.Matrix4().compose(_gp, _gq, _one));
  a.group.rotation.y = sy; a.group.position.copy(sp); a.group.scale.setScalar(ss); a.ap.name = ''; return item.grip;
}
function attachWeapon() {
  const w = weapons.items[weapons.selected], a = player.actor; if (!w || !a || !weapons.mesh) return;
  if (!w.grip) calibrateGrip(w); if (!w.grip) return;
  const hand = a.bones[a.index.rhand]; if (weapons.mesh.parent !== hand) hand.add(weapons.mesh);
  w.grip.decompose(weapons.mesh.position, weapons.mesh.quaternion, weapons.mesh.scale); weapons.gripPos = weapons.mesh.position.clone(); weapons.gripQ = weapons.mesh.quaternion.clone();
}
function equipWeapon(i) {
  if (player.dead || player.car) return;
  if (weapons.mesh) { if (weapons.mesh.parent) weapons.mesh.parent.remove(weapons.mesh); weapons.mesh = null; }
  weapons.selected = i >= 0 && i < weapons.items.length ? i : -1; weapons.reloading = 0; weapons.swap = 0.35;
  const item = weapons.items[weapons.selected];
  if (item) { weapons.mesh = new THREE.Mesh(item.type.geo.body, item.type.mats); weapons.mesh.castShadow = false; weapons.mesh.frustumCulled = false; weapons.gripPos = null; attachWeapon(); toast(item.name + (wAnim(item).melee ? ' · Clique golpeia' : ' · Botão direito mirar · Clique atirar · T recarregar'), 3000); }
  else toast('Desarmado', 1000);
}
/* orientação da arma em descanso, em coordenadas de mundo, mantendo o cabo na mão (o "cano" da arma é o eixo -X do modelo) */
const _rq1 = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rv1 = new THREE.Vector3(), _rv2 = new THREE.Vector3(), _rvx = new THREE.Vector3(-1, 0, 0);
function restWeaponPose(a, A, k) {
  const hand = a.bones[a.index.rhand]; if (!hand) return;
  a.group.updateMatrixWorld(true); hand.getWorldQuaternion(_rq1);
  const h = player.h, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);            // frente e esquerda do personagem
  if (A.twoHand) _rv2.set(fx * 0.6 + lx * 0.66, -0.52, fz * 0.6 + lz * 0.66).normalize();             // "pronto-baixo": atravessado no peito
  else _rv2.set(fx * 0.32, -1, fz * 0.32).normalize();                                                  // pistola/SMG apontando para o chão, à frente do pé
  _rv1.copy(_rvx).applyQuaternion(weapons.gripQ).applyQuaternion(_rq1).normalize();                    // cano atual (pose de mira) no mundo
  _rq2.setFromUnitVectors(_rv1, _rv2);
  const local = _rq1.clone().invert().multiply(_rq2).multiply(_rq1).multiply(weapons.gripQ);            // de volta para o espaço da mão
  weapons.mesh.quaternion.slerp(local, k);
}
/* mirando: botão direito, ou logo depois de atirar (a pose de mira se mantém por um instante) */
function weaponAim() { return weapons.selected >= 0 && !player.car && !player.dead && !paused && !(typeof selectionWheel !== 'undefined' && selectionWheel.open) && !player.trans && (!!keys.MouseRight || weapons.trigger || weapons.aimT > 0); }
function reloadWeapon() { const w = weapons.items[weapons.selected]; if (w && !weapons.reloading && w.ammo < w.capacity && !player.car) { weapons.reloading = w.reload; weapons.aimT = Math.max(weapons.aimT, w.reload); } }

/* ---------- raio analítico ---------- */
const _rv = new THREE.Vector3(), _rq = new THREE.Quaternion(), _ax = new THREE.Vector3(-1, 0, 0);
function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, maxT) {
  const a = dx * dx + dz * dz; if (a < 1e-9) return -1;
  const fx = ox - cx, fz = oz - cz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r, disc = b * b - 4 * a * c; if (disc < 0) return -1;
  const s = Math.sqrt(disc); let t = (-b - s) / (2 * a); if (t < 0) { t = (-b + s) / (2 * a); if (t < 0) return -1; }
  if (t > maxT) return -1; const y = oy + dy * t; return (y >= y0 && y <= y1) ? t : -1;
}
function shootRay(ox, oy, oz, dx, dy, dz, maxT) {
  const res = { t: maxT, kind: 'air', npc: null, car: null };
  const consider = (t, kind, npc, car) => { if (t >= 0 && t < res.t) { res.t = t; res.kind = kind; res.npc = npc || null; res.car = car || null; } };
  for (const n of peds) {                                           // pessoas (em pé: cilindro de 1,8 m; caídas: baixo e largo)
    const lying = n.ph === 'down' || n.ph === 'dead' || (n.ph === 'hit' && !n.air) || n.sitH && false; const gy = n.y;
    if (Math.abs(n.x - ox) > maxT || Math.abs(n.z - oz) > maxT) continue;
    consider(lying ? rayCyl(ox, oy, oz, dx, dy, dz, n.x, n.z, 0.8, gy, gy + 0.5, res.t) : rayCyl(ox, oy, oz, dx, dy, dz, n.x, n.z, 0.34, gy, gy + 1.78, res.t), 'npc', n);
  }
  if (typeof officers !== 'undefined') for (const o of officers) consider(rayCyl(ox, oy, oz, dx, dy, dz, o.x, o.z, 0.36, Hq(o.x, o.z), Hq(o.x, o.z) + 1.78, res.t), 'officer', null);
  for (const c of cars) {                                           // carros: círculos de colisão com 1,7 m de altura
    if (c === player.car) continue; const gy = c.physics ? c.physics.y - c.physics.cfg.cg : Hq(c.x, c.z);
    if (Math.hypot(c.x - ox, c.z - oz) > maxT + c.len) continue;
    for (const [cx, cz] of carCircles(c)) consider(rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, c.cr, gy, gy + 1.7, res.t), 'car', null, c);
  }
  // paredes e objetos (caixas 2D com altura) e relevo, caminhando ao longo do raio
  const hz = Math.hypot(dx, dz);
  for (let t = 0.6; t < res.t; t += (t < 50 ? 0.5 : 1.5)) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    let g; if (inCity(x, z, 0)) g = 0.3; else g = Hq(x, z);
    if (y < g) { consider(t, y < WL + 0.05 && Hq(x, z) < WL ? 'water' : 'ground'); break; }
    if (hz < 1e-4) continue;
    for (const b of nearby(x, z)) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < (b.h || 10) + g) { consider(t, 'wall'); t = res.t; break; }
  }
  res.x = ox + dx * res.t; res.y = oy + dy * res.t; res.z = oz + dz * res.t; return res;
}

/* ---------- efeitos reaproveitados (pool) ---------- */
const FX = { tracers: [], puffs: [], flash: null, ti: 0, pi: 0 };
const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, 0.5), tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(tracerGeo, tracerMat.clone()); m.visible = false; m.frustumCulled = false; scene.add(m); FX.tracers.push({ m, ttl: 0, max: 0.07 }); }
for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcccccc, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); FX.puffs.push({ s, ttl: 0, max: 0.4, vy: 0, r: 0.4 }); }
FX.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); FX.flash.visible = false; scene.add(FX.flash);
function puff(x, y, z, color, size, life) { const p = FX.puffs[FX.pi++ % FX.puffs.length]; p.s.position.set(x, y, z); p.s.material.color.setHex(color); p.ttl = p.max = life || 0.4; p.r = size; p.vy = 0.8; p.s.visible = true; p.s.scale.setScalar(size); }
function tracer(sx, sy, sz, ex, ey, ez) { const t = FX.tracers[FX.ti++ % FX.tracers.length]; _rv.set(ex - sx, ey - sy, ez - sz); const len = _rv.length(); if (len < 0.2) return; t.m.position.set(sx, sy, sz); t.m.lookAt(ex, ey, ez); t.m.scale.set(1, 1, len); t.ttl = t.max; t.m.visible = true; t.m.material.opacity = 0.9; }

/* ---------- som (ruído filtrado + estampido grave) ---------- */
let noiseBuf = null;
function gunSound(kind) {
  if (!audio) return;
  try {
    const ac = audio.ac, t = ac.currentTime; if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); }
    const n = ac.createBufferSource(); n.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'rifle' ? 2400 : 3600; const g = ac.createGain(); g.gain.setValueAtTime(kind === 'rifle' ? 0.34 : 0.26, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'rifle' ? 0.32 : 0.22));
    n.connect(f); f.connect(g); g.connect(ac.destination); n.start(t);
    const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'rifle' ? 120 : 170, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); og.gain.setValueAtTime(0.28, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14); o.connect(og); og.connect(ac.destination); o.start(t); o.stop(t + 0.16);
  } catch (e) { /* sem áudio */ }
}

/* ---------- tiro ---------- */
function muzzlePos(out) {
  const w = weapons.items[weapons.selected], A = wAnim(w);
  if (weapons.mesh && player.actor) { player.actor.group.updateMatrixWorld(true); return out.set(-A.muzzle, 0.03, 0).applyMatrix4(weapons.mesh.matrixWorld); }
  return out.set(player.x, player.y + 1.4, player.z);
}
const _wmz = new THREE.Vector3(), _wd = new THREE.Vector3();
function fireWeapon() {
  const w = weapons.items[weapons.selected];
  if (!w || !started || paused || (typeof selectionWheel !== 'undefined' && selectionWheel.open) || player.dead || player.car || player.trans || player.stun > 0 || weapons.cooldown > 0 || weapons.reloading || weapons.swap > 0) return false;
  const A = wAnim(w);
  if (A.melee) return meleeAttack(w, A);
  if (w.ammo <= 0) { reloadWeapon(); return false; }
  w.ammo--; weapons.cooldown = w.interval; weapons.sinceShot = 0; weapons.aimT = 0.9; weapons.shotId = (weapons.shotId || 0) + 1;
  // direção: centro da tela + dispersão (maior andando, correndo e atirando sem mirar; some ao segurar o botão direito parado)
  camera.getWorldDirection(_wd);
  const moving = Math.hypot(player.vx, player.vz), sp = A.spread * (1 + moving * 0.55) * (1.8 - 0.8 * weapons.aim) + weapons.spread;
  _wd.x += (Math.random() - 0.5) * 2 * sp; _wd.y += (Math.random() - 0.5) * 2 * sp; _wd.z += (Math.random() - 0.5) * 2 * sp; _wd.normalize();
  muzzlePos(_wmz);
  const cp = camera.position, base = _wd.clone();
  for (let p = 1; p < (A.pellets || 1); p++) {                     // escopeta: os outros bagos (o primeiro segue abaixo com tracer e efeitos completos)
    const d = base.clone(); d.x += (Math.random() - 0.5) * 2 * A.pspread; d.y += (Math.random() - 0.5) * 2 * A.pspread; d.z += (Math.random() - 0.5) * 2 * A.pspread; d.normalize();
    const hp = shootRay(cp.x, cp.y, cp.z, d.x, d.y, d.z, A.range); if (p % 2) tracer(_wmz.x, _wmz.y, _wmz.z, hp.x, hp.y, hp.z);
    if (hp.kind === 'npc') { npcShot(hp.npc, A.dmg); puff(hp.x, hp.y, hp.z, 0xaa2222, 0.4, 0.3); hitMarker(false); } else if (hp.kind !== 'air') puff(hp.x, hp.y, hp.z, 0x9a9488, 0.4, 0.4);
  }
  const hit = shootRay(cp.x, cp.y, cp.z, _wd.x, _wd.y, _wd.z, A.range);
  // o projétil sai do cano e vai ao ponto atingido; se o ponto está atrás do cano (mira colada na parede) sai do próprio cano
  tracer(_wmz.x, _wmz.y, _wmz.z, hit.x, hit.y, hit.z);
  weapons.flash = 0.06; FX.flash.position.copy(_wmz); FX.flash.scale.setScalar(A.snd === 'rifle' ? 0.9 : 0.6); FX.flash.visible = true; FX.flash.material.rotation = Math.random() * 6;
  if (hit.kind === 'npc' && A.stun) { knock(hit.npc, Math.sin(player.h) * 1.5, Math.cos(player.h) * 1.5, 1.5, null, 0); hitMarker(false); }
  else if (hit.kind === 'npc') { npcShot(hit.npc, hit.y > hit.npc.y + 1.5 ? 200 : A.dmg); puff(hit.x, hit.y, hit.z, 0xaa2222, 0.5, 0.35); hitMarker(hit.y > hit.npc.y + 1.5); }
  else if (hit.kind === 'officer') { puff(hit.x, hit.y, hit.z, 0xaa2222, 0.5, 0.35); crime(2, 'tiro em policial', true); hitMarker(false); }
  else if (hit.kind === 'car') { puff(hit.x, hit.y, hit.z, 0xffd88a, 0.35, 0.18); puff(hit.x, hit.y, hit.z, 0x888888, 0.6, 0.5); }
  else if (hit.kind === 'water') puff(hit.x, hit.y + 0.1, hit.z, 0xcfe8ff, 1.0, 0.5);
  else if (hit.kind !== 'air') { puff(hit.x, hit.y, hit.z, 0xffd88a, 0.3, 0.14); puff(hit.x, hit.y, hit.z, 0x9a9488, 0.7, 0.6); }
  if (typeof npcPanic === 'function') npcPanic(player.x, player.z, 52);
  // recuo: a mira sobe, a câmera treme, a dispersão cresce e a arma "chuta"
  { const dp = Math.min(A.kick * (0.65 + 0.35 * (1 - weapons.aim)), Math.max(0, 0.16 - weapons.recoilAcc)); cam.p = Math.max(-0.35, cam.p - dp); weapons.recoilAcc += dp; }   // o recuo é devolvido aos poucos (updateWeapons): a mira não vai subindo a cada tiro weapons.kick += A.kick; weapons.spread = Math.min(0.05, weapons.spread + A.spread * 0.45); shake = Math.max(shake, A.snd === 'rifle' ? 0.14 : 0.1);
  gunSound(A.snd);
  crime(1, 'disparo de arma', true); return true;
}
/* faca e katana: golpe com animação real (knife_1..3 / sword_1..3); atinge quem estiver à frente, ao alcance */
function meleeAttack(w, A) {
  weapons.cooldown = w.interval; weapons.combo = ((weapons.combo || 0) + 1) % A.combo.length; weapons.meleeClip = A.combo[weapons.combo]; weapons.meleeT = (findClip(weapons.meleeClip) || { duration: 0.6 }).duration; weapons.meleeId = (weapons.meleeId || 0) + 1;
  const fx = Math.sin(player.h), fz = Math.cos(player.h); let any = false;
  for (const n of peds) { if (n.ph === 'dead') continue; const dx = n.x - player.x, dz = n.z - player.z, d = Math.hypot(dx, dz); if (d < A.reach + 0.4 && (dx * fx + dz * fz) / (d || 1) > 0.45) { npcShot(n, A.dmg); puff(n.x, (n.y || player.y) + 1.2, n.z, 0xaa2222, 0.4, 0.3); any = true; } }
  if (any) { hitMarker(false); crime(1, 'agressão', true); }
  if (typeof npcPanic === 'function') npcPanic(player.x, player.z, 14);
  return true;
}
let hitT = 0;
function hitMarker(head) { hitT = 0.18; const el = $('hitmark'); if (el) { el.className = head ? 'head' : ''; el.style.opacity = 1; } }

/* ---------- a cada quadro ---------- */
const _aimq = new THREE.Quaternion(), _aimv = new THREE.Vector3(), _aimt = new THREE.Vector3();
function updateWeapons(dt) {
  weapons.cooldown = Math.max(0, weapons.cooldown - dt); weapons.sinceShot += dt; weapons.swap = Math.max(0, weapons.swap - dt); weapons.meleeT = Math.max(0, (weapons.meleeT || 0) - dt);
  { const ws = weapons.items[weapons.selected], zoom = ws && wAnim(ws).zoom && weaponAim() && keys.MouseRight; if (!weapons.baseFov) weapons.baseFov = camera.fov; const tf = zoom ? 20 : weapons.baseFov; if (Math.abs(camera.fov - tf) > 0.05) { camera.fov += (tf - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); } }
  if (weapons.recoilAcc > 0) { const back = weapons.recoilAcc * Math.min(1, dt * (weapons.trigger ? 3 : 6)); weapons.recoilAcc -= back; cam.p += back; if (weapons.recoilAcc < 0.0005) weapons.recoilAcc = 0; }
  weapons.spread = Math.max(0, weapons.spread - dt * 0.09); weapons.kick = Math.max(0, weapons.kick - dt * 0.12);
  if (weapons.aimT > 0 && !weapons.trigger && !keys.MouseRight) weapons.aimT -= dt;
  if (weapons.reloading > 0) { weapons.reloading -= dt; if (weapons.reloading <= 0) { const w = weapons.items[weapons.selected]; if (w) w.ammo = w.capacity; } }
  const aiming = weaponAim(); weapons.aim += ((aiming ? 1 : 0) - weapons.aim) * Math.min(1, dt * 9);
  if (weapons.flash > 0) { weapons.flash -= dt; if (weapons.flash <= 0) FX.flash.visible = false; }
  for (const t of FX.tracers) if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.m.visible = false; else t.m.material.opacity = 0.9 * t.ttl / t.max; }
  for (const p of FX.puffs) if (p.ttl > 0) { p.ttl -= dt; if (p.ttl <= 0) p.s.visible = false; else { const k = 1 - p.ttl / p.max; p.s.material.opacity = 0.55 * (1 - k); p.s.scale.setScalar(p.r * (1 + k * 1.6)); p.s.position.y += p.vy * dt; } }
  const w = weapons.items[weapons.selected], active = !!w && !player.car && !player.dead;
  if (aiming) { camera.getWorldDirection(_aimv); weapons.pitch += (Math.asin(clamp(_aimv.y, -0.9, 0.9)) * 0.9 - weapons.pitch) * Math.min(1, dt * 12); } else weapons.pitch *= Math.max(0, 1 - dt * 10);
  if (weapons.mesh) {
    weapons.mesh.visible = active && !!player.actor && weapons.swap < 0.2;
    const pa = player.actor; if (pa && weapons.mesh.parent !== pa.bones[pa.index.rhand]) attachWeapon();
    if (weapons.mesh.visible && weapons.gripPos) {                    // coice: a arma recua e o cano sobe um pouco e volta
      const A = wAnim(w), back = weapons.sinceShot < 0.12 ? 0.05 * (1 - weapons.sinceShot / 0.12) : 0, up = weapons.sinceShot < 0.16 ? (A.holdFire ? 0.13 : 0.05) * (1 - weapons.sinceShot / 0.16) : 0;
      weapons.mesh.position.set(weapons.gripPos.x + back, weapons.gripPos.y, weapons.gripPos.z); weapons.mesh.quaternion.copy(weapons.gripQ); weapons.mesh.rotateZ(-up);
      // arma em descanso (sem mirar): cano para baixo ao lado do corpo (uma mão) ou atravessada na frente do peito (duas mãos); transição suave para a mira
      const rest = !aiming && weapons.reloading <= 0 && !A.melee ? 1 : 0; weapons.restK = (weapons.restK || 0) + (rest - (weapons.restK || 0)) * Math.min(1, dt * 10);
      if (weapons.restK > 0.01 && pa) restWeaponPose(pa, A, weapons.restK);
    }
  }
  if (active && weapons.trigger) { if (wAnim(w).auto || !weapons.fired) fireWeapon(); weapons.fired = true; }
  // interface: mira que abre com a dispersão, marcador de acerto, munição
  const ch = $('crosshair'); ch.hidden = !(aiming || weapons.aim > 0.15) || !active;
  if (!ch.hidden) { const A = wAnim(w), moving = Math.hypot(player.vx, player.vz), gap = 5 + 230 * (A.spread * (1 + moving * 0.55) * (1.8 - 0.8 * weapons.aim) + weapons.spread); ch.style.setProperty('--g', gap.toFixed(1) + 'px'); ch.style.opacity = clamp(weapons.aim * 1.4, 0.35, 1); }
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) { const el = $('hitmark'); if (el) el.style.opacity = 0; } }
  $('weaponHud').hidden = !active;
  if (active) {
    const A=wAnim(w),progress=weapons.reloading>0?1-weapons.reloading/w.reload:(w.capacity?w.ammo/w.capacity:1);
    $('weaponType').textContent=A.melee?'Corpo a corpo':A.auto?'Automática':'Semiautomática';
    $('weaponName').textContent=w.name;
    $('weaponAmmo').textContent=A.melee?'PRONTO':weapons.reloading>0?'RECARREGANDO':String(w.ammo).padStart(2,'0')+' / '+w.capacity;
    $('weaponAmmo').style.fontSize=A.melee||weapons.reloading>0?'17px':'34px';
    $('weaponAmmoBar').style.width=clamp(progress*100,0,100)+'%';
    $('weaponHint').textContent=A.melee?'TAB Equipamento · Clique Golpear':'TAB Equipamento · T Recarregar';
  }
}
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousedown', e => { if (paused || !started) return; if (e.button === 2) keys.MouseRight = true; if (e.button === 0 && locked) { weapons.trigger = true; weapons.fired = false; } });
addEventListener('mouseup', e => { if (e.button === 2) keys.MouseRight = false; if (e.button === 0) { weapons.trigger = false; weapons.fired = false; } });
addEventListener('blur', () => { weapons.trigger = false; keys.MouseRight = false; });
document.addEventListener('pointerlockchange', () => { if (!locked) { weapons.trigger = false; keys.MouseRight = false; } });
addEventListener('keydown', e => { if (e.repeat || paused || !started) return; const m = /^Digit(\d)$/.exec(e.code); if (m) { const k = +m[1]; equipWeapon(k === 1 ? -1 : k === 0 ? 8 : k - 2); } if (e.code === 'KeyT') reloadWeapon(); });
addEventListener('wheel', e => { if (paused || !started || player.car || !weapons.items.length) return; const n = weapons.items.length + 1, cur = weapons.selected + 1; equipWeapon(((cur + (e.deltaY > 0 ? 1 : -1)) % n + n) % n - 1); }, { passive: true });

