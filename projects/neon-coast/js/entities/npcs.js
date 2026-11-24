/* NEON COAST — Multidão: NPCs com física e vida própria (lógica inspirada no mod Urbanize).
   • Cenas fixas (rodinhas de conversa, gente encostada, sentada, fumando, no orelhão, vendendo, dançando, bebendo, tomando sol) nascem perto do jogador.
   • Caminhantes seguem as calçadas, atravessam a rua, desviam uns dos outros e dos carros; nos becos da favela perambulam entre pontos.
   • Física: dois NPCs nunca ocupam o mesmo lugar (espaço pessoal + colisão), não atravessam paredes, carros nem o jogador.
   • Carro em velocidade atropela: o NPC é arremessado (animações reais KO_skid), cai, levanta ou morre; testemunhas fogem; tiros assustam. */
'use strict';
const NPC_R = 0.34, GRID_C = 2.5, NPC_MAX = 150;
const peds = [];                              // NPCs ativos (nome mantido por compatibilidade)
const npcGrid = new Map(), npcPool = [];
let npcsReady = false, npcSpawnT = 0, npcSpotT = 0, npcFrame = 0;
pedestriansReady.then(() => { npcsReady = pedestrianTypes.length > 0; });
const TINTS = [[1, 1, 1], [0.86, 0.9, 1], [1, 0.9, 0.82], [0.82, 0.88, 0.82], [1, 0.96, 0.76], [0.92, 0.82, 0.92], [0.78, 0.78, 0.84], [1, 0.82, 0.82], [0.7, 0.76, 0.9]];
const GAITS = [['WALK_player', 1.8], ['WALK_civi', 1.7], ['WALK_player', 1.8], ['WALK_gang1', 1.7], ['WALK_old', 1.15], ['WALK_shuffle', 1.3], ['WALK_civi', 1.7]];
const hasClipCache = {};
const hasClip = n => (n in hasClipCache) ? hasClipCache[n] : (hasClipCache[n] = !!findClip(n));
const pickClip = list => { const ok = list.filter(hasClip); return ok.length ? ok[Math.floor(Math.random() * ok.length)] : 'IDLE_stance'; };
/* o que cada tipo de cena faz (listas de animações reais: GTA SA + Urbanize) */
const ACT = {
  chat:   { list: ['urb_talk_1', 'urb_street_chat', 'Idle_Chat_02', 'urb_worr_chat', 'urb_calm_argue', 'urb_cocky_talk', 'urb_girl_talk', 'prtial_gngtlkG', 'urb_talk_3', 'urb_suspic_talk', 'IDLE_chat', 'urb_listening', 'urb_talk_offen'], swap: 9 },
  lean:   { list: ['urb_lean_bs', 'urb_lean_b_ma', 'urb_lean_b_fnc', 'urb_lean_check', 'urb_lean_gheto', 'urb_lean_read_1'], swap: 20 },
  smoker: { list: ['urb_smoke_loop', 'urb_smoke_f', 'urb_quick_smk'], swap: 14 },
  phone:  { list: ['urb_payphone', 'urb_use_phone_1', 'urb_step_phone', 'phone_talk'], swap: 25 },
  vendor: { list: ['urb_wait_1', 'urb_waiting', 'urb_waiting2', 'urb_job_stance', 'urb_worker', 'urb_wait_impa'], swap: 18 },
  watch:  { list: ['urb_secur_loop', 'urb_crossarms', 'urb_gang_loop_1', 'Idle_Gang1', 'urb_job_stance'], swap: 20 },
  beggar: { list: ['urb_sit_sick_1', 'urb_sit_sick_2', 'urb_defeated_1', 'urb_sit_drunk'], swap: 16, sit: 0.26 },
  sit:    { list: ['urb_sit_2b', 'urb_sit_3', 'urb_sit_laugh_1', 'urb_sit_smk_1', 'urb_sit_read_1', 'urb_sit_nwsp_1', 'urb_sit_eat_1', 'urb_sit_6', 'Seat_talk_01', 'SEAT_watch'], swap: 14, sit: 0.46 },
  drink:  { list: ['urb_sit_drink_1', 'urb_sit_laugh_1', 'urb_sit_laugh_2', 'urb_sit_eat_1', 'Seat_talk_02', 'urb_sit_2b'], swap: 8, sit: 0.46 },
  domino: { list: ['urb_sit_laugh_2', 'Seat_talk_01', 'urb_sit_3', 'urb_sit_2b', 'urb_sit_eat'], swap: 8, sit: 0.46 },
  dance:  { list: ['urb_dance_1', 'dnce_M_a', 'dnce_M_b', 'dnce_M_c', 'dnce_M_d', 'dnce_M_e', 'Crazed_bdance', 'DAN_Loop_A', 'urb_go_high', 'urb_cheers_1'], swap: 12 },
  lay:    { list: ['urb_lay_lounger', 'LOU_Loop', 'Lay_Bac_Loop'], swap: 30, lay: 0.22 }
};
const SIT_PELVIS = 0.13;
const npcGround = (n) => n.fixedY !== undefined ? n.fixedY : carGroundHeight(n.x, n.z);
const ringPoint = (bi, bj, s) => { const q = perimPoint(s, 26); return [blockC(bi) + q[0], blockC(bj) + q[1]]; };
const RING_L = 4 * 52;

/* ---------- atores (reaproveitados) ---------- */
function acquireActor(type) {
  let a = null;
  if (type) { const i = npcPool.findIndex(x => x.type === type); if (i >= 0) a = npcPool.splice(i, 1)[0]; } else a = npcPool.pop();
  if (!a) {
    const t = type || pedestrianTypes[Math.floor(Math.random() * pedestrianTypes.length)];
    a = makeActor(t, true); a.clips = {}; a.baseMats = [t.atlasMat || t.mats[0]];
    a.mesh.material = a.baseMats[0].clone(); a.mesh.material.skinning = true;
    scene.add(a.group);
  }
  const tn = type ? TINTS[0] : TINTS[Math.floor(Math.random() * TINTS.length)];
  { const m = a.mesh.material; m.color.setRGB(tn[0], tn[1], tn[2]); }
  a.group.visible = true; a.group.scale.setScalar(R2(0.94, 1.06)); a.group.rotation.set(0, 0, 0); a.ap.name = ''; a.ap.cur = null; a.ap.prev = null; a.ap.overlay = null; a.ap.fade = 1;
  return a;
}
function releaseActor(a) {
  a.group.visible = false; if (a.group.userData) a.group.userData.npc = null;
  if (npcPool.length > 24 || Math.random() < 0.3) { scene.remove(a.group); a.mesh.material.dispose(); if (a.mesh.skeleton) a.mesh.skeleton.dispose(); return; }   // deixa entrar roupas novas do rodízio
  npcPool.push(a);
}

function npcPlay(n, name, loop, speed, fade) {
  const a = n.actor; if (!a.ap) return;
  if (n.clip === name && !n.clipRestart) { a.ap.speed = speed || 1; return; }
  n.clip = name; n.clipRestart = false; n.clipMove = false;
  a.ap.play(hasClip(name) ? name : 'IDLE_stance', { loop: loop !== false, fade: fade === undefined ? 0.25 : fade, restart: true }); a.ap.speed = speed || 1;
  if (loop !== false) a.ap.time = Math.random() * 3;                // desencontra os ciclos para a multidão não andar sincronizada
}
/* locomoção como no SA: o clipe toca na razão velocidade real / velocidade gravada na animação (o pé não desliza) e, ao trocar
   andar <-> correr <-> disparar, o novo ciclo entra na mesma fase do passo. Depois do arranque (WALK_start) o andar começa do zero. */
function npcMove(n, name, spd, fade) {
  const a = n.actor; if (!a.ap) return;
  if (!hasClip(name)) name = 'WALK_civi';
  const nat = clipSpeed(name) || 1.5, rate = clamp(spd / nat, 0.4, 1.7);
  if (n.clip === name && !n.clipRestart) { a.ap.speed = rate; return; }
  const sync = !!n.clipMove, fromStart = n.clip === 'WALK_start';
  n.clip = name; n.clipRestart = false; n.clipMove = true;
  a.ap.play(name, { loop: true, fade: fade === undefined ? 0.25 : fade, restart: true, sync }); a.ap.speed = rate;
  if (!sync) a.ap.time = fromStart ? 0 : Math.random() * 3;
}
const clipDur = (name, def) => { const c = findClip(name); return c ? c.duration : (def || 1); };

/* ---------- criação ---------- */
function makeNpc(o) {
  const a = acquireActor(o && o.skin), n = Object.assign({ x: 0, z: 0, y: 0, h: Math.random() * 6.28, vx: 0, vz: 0, vy: 0, hp: 100, ph: 'normal', mode: 'walker', t: 0, wait: 0, clip: '', animAcc: 0, gait: GAITS[Math.floor(Math.random() * GAITS.length)],
    speed: R2(1.25, 1.85), noDodge: Math.random() < 0.08, actor: a, nav: null, anchored: false, panicT: 0, cluck: 0, stuck: 0, lx: 0, lz: 0, id: Math.random() }, o);
  n.y = npcGround(n); a.group.userData.npc = n; a.group.position.set(n.x, n.y + a.footOffset * a.group.scale.x, n.z); a.group.rotation.y = n.h;
  if (typeof pedInit === 'function') pedInit(n);                     // personalidade e jeito de andar (ped-ai.js)
  peds.push(n); return n;
}
function removeNpc(n) {
  const i = peds.indexOf(n); if (i >= 0) peds.splice(i, 1);
  if (n.spot && n.spot.live) { const k = n.spot.live.indexOf(n); if (k >= 0) n.spot.live.splice(k, 1); if (!n.spot.live.length) n.spot.live = null; }
  releaseActor(n.actor);
}
/* cena fixa: cria as pessoas de um ponto do mapa */
function spawnSpot(sp) {
  const cfg = ACT[sp.t]; if (!cfg || !npcsReady) return;
  sp.live = [];
  const cnt = sp.n || 1;
  for (let k = 0; k < cnt; k++) {
    let x = sp.x, z = sp.z, h = sp.h, seat = null;
    if (sp.seats && sp.seats[k]) { seat = sp.seats[k]; x = seat.x; z = seat.z; h = seat.h; }
    else if (cnt > 1) { const a = k / cnt * Math.PI * 2 + sp.h, r = sp.spread || (cnt === 2 ? 0.55 : 0.8); x = sp.x + Math.cos(a) * r; z = sp.z + Math.sin(a) * r; h = a + Math.PI; if (sp.t === 'dance') h = Math.random() * 6.28; }
    const n = makeNpc({ x, z, h, mode: 'scene', spot: sp, act: sp.t, anchored: true, fixedY: sp.y !== undefined ? sp.y : (seat && seat.y !== undefined ? seat.y : undefined), speed: R2(1.3, 1.7), actT: Math.random() * (cfg.swap || 10) });
    if (sp.t === 'sit' && sp.seatY !== undefined) n.seatY = sp.seatY;
    if (seat) n.seatY = seat.y + 0.46;
    if (cfg.sit && n.seatY === undefined) n.seatY = npcGround(n) + cfg.sit;
    n.sitH = cfg.sit !== undefined; n.layH = cfg.lay !== undefined; if (sp.t === 'phone' || sp.t === 'lay' || sp.t === 'beggar') n.noDodge = true;
    sceneClip(n, cfg, true); sp.live.push(n);
  }
}
function sceneClip(n, cfg, first) {
  let name;
  if (n.act === 'sit' && !first) name = n.clip; else name = pickClip(cfg.list);
  npcPlay(n, name, true, 1, first ? 0 : 0.5); n.actT = cfg.swap * R2(0.7, 1.4);
}

/* ---------- grade espacial ---------- */
function gridKey(x, z) { return Math.floor(x / GRID_C) * 4096 + Math.floor(z / GRID_C); }
function buildNpcGrid() {
  npcGrid.clear();
  const put = (o) => { const k = gridKey(o.x, o.z); let l = npcGrid.get(k); if (!l) { l = []; npcGrid.set(k, l); } l.push(o); };
  for (const n of peds) put(n);
  if (typeof officers !== 'undefined') for (const o of officers) { o.r = 0.4; o.fixed = true; o.isOfficer = true; put(o); }
}
function forNear(x, z, r, fn) {
  const c = Math.ceil(r / GRID_C), cx = Math.floor(x / GRID_C), cz = Math.floor(z / GRID_C);
  for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) { const l = npcGrid.get((cx + a) * 4096 + (cz + b)); if (l) for (const o of l) fn(o); }
}

/* ---------- reações ---------- */
function npcPanic(x, z, r) {
  for (const n of peds) {
    if (n.ph === 'hit' || n.ph === 'down' || n.ph === 'getup' || n.ph === 'dead') continue;
    const d = Math.hypot(n.x - x, n.z - z); if (d > r) continue;
    releaseNpc(n); n.ph = 'panic'; n.panicT = R2(5, 10); n.t = 0; n.fx = x; n.fz = z; n.cower = Math.random() < 0.28 && d > 6;
  }
}
function releaseNpc(n) { if (n.anchored) { n.anchored = false; n.mode = 'walker'; n.nav = null; n.sitH = n.layH = false; n.y = npcGround(n); n.clip = ''; } }
/* baleado (estilo GTA): ferido, o corpo acusa o tiro pelo lado de onde veio (HIT_front/back/L/R) e a pessoa foge; morto, cai com a
   animação de queda certa (de frente, de costas ou pelo tiro na cabeça) em vez de ser arremessado */
function npcShot(n, dmg) {
  if (n.ph === 'dead') return;
  n.hp -= dmg; if (typeof aiEvent === 'function') aiEvent(n.hp <= 0 ? 'dead' : 'shot', n.x, n.z, { src: n }); else npcPanic(n.x, n.z, 30);
  const rel = wrap(Math.atan2(player.x - n.x, player.z - n.z) - n.h);                // de onde veio o tiro, em relação ao corpo
  if (n.hp <= 0) { npcKillShot(n, dmg, rel); crime(2, 'homicídio', true); return; }
  if (n.ph === 'hit' || n.ph === 'down' || n.ph === 'getup' || n.busy) return;
  releaseNpc(n); n.ev = null;
  const clip = Math.abs(rel) < 0.8 ? 'HIT_front' : Math.abs(rel) > 2.3 ? 'HIT_back' : rel > 0 ? 'HIT_L' : 'HIT_R';
  n.ph = 'flinch'; n.t = 0; n.flinchT = clipDur(clip, 0.6) * 0.9; n.vx = n.vz = 0; n.wounded = true; n.clipRestart = true; npcPlay(n, clip, false, 1, 0.06);
}
function npcKillShot(n, dmg, rel) {
  releaseNpc(n); n.busy = false; n.pelvisAt = null; n.carSeq = null; n.jack = null;
  const back = Math.abs(rel) > 2.3, clip = dmg >= 150 ? 'KO_shot_face' : back ? 'KO_skid_front' : pickClip(['KO_shot_front', 'KO_shot_stom']);
  n.dead = true; n.deadT = 0; n.ph = 'dead'; n.t = 0; n.vx = n.vz = 0; n.clipRestart = true; npcPlay(n, clip, false, 1, 0.08); n.stillAfter = clipDur(clip, 2) + 0.3;
  npcPanic(n.x, n.z, 28);
}
/* atingido por um carro (ou tiro letal): arremessado, cai e levanta ou morre */
function knock(n, vx, vz, speed, car, dmg) {
  releaseNpc(n);
  n.hp -= dmg; n.ph = 'hit'; n.t = 0; n.air = true; n.vy = Math.min(6, 1.6 + speed * 0.3); n.vx = vx * 0.9 + R2(-0.4, 0.4); n.vz = vz * 0.9 + R2(-0.4, 0.4);
  const fromFront = (Math.sin(n.h) * vx + Math.cos(n.h) * vz) < 0;
  n.skid = fromFront ? 'KO_skid_back' : 'KO_skid_front'; n.getupClip = fromFront ? 'getup' : 'getup_front';
  const sl = Math.hypot(vx, vz) || 1; n.h = Math.atan2(fromFront ? -vx / sl : vx / sl, fromFront ? -vz / sl : vz / sl);
  n.clipRestart = true; npcPlay(n, n.skid, false, 1.15, 0.05);
  if (n.hp <= 0) { n.dead = true; n.deadT = 0; }
  if (car === (player.car || null) && car) {
    crime(n.dead ? 3 : 1, n.dead ? 'atropelamento fatal' : 'atropelamento', true); if (typeof emsCall === 'function') emsCall(n.x, n.z, n.dead ? 22 : 9);
    shake = Math.max(shake, 0.4); car.speed *= 0.985;
  }
  npcPanic(n.x, n.z, 28);                                           // testemunhas
}

/* ---------- navegação ---------- */
const blockIJ = (x, z) => { const C = nearestCity(x, z); return [clamp(Math.floor((x + HALF) / P), C.i0, C.i0 + C.ni - 1), clamp(Math.floor((z + HALF) / P), C.j0, C.j0 + C.nj - 1), C]; };
function nearestRing(n) {
  const [bi, bj] = blockIJ(n.x, n.z);
  let bs = 0, bd = 1e9; for (let s = 0; s < RING_L; s += 3) { const q = ringPoint(bi, bj, s), d = Math.hypot(q[0] - n.x, q[1] - n.z); if (d < bd) { bd = d; bs = s; } }
  return { kind: 'ring', bi, bj, s: bs, dir: Math.random() < 0.5 ? 1 : -1, cross: bd > 4 };
}
function pickWaypoint(n) {
  const FV = favelaAt(n.x, n.z), fav = favelaMask(n.x, n.z) > 0.1 && FV.walk;
  if (fav) { for (let k = 0; k < 6; k++) { const p = FV.walk[Math.floor(Math.random() * FV.walk.length)], d = Math.hypot(p[0] - n.x, p[1] - n.z); if (d > 6 && d < 70) { const path = FV.path(n.x, n.z, p[0], p[1]); if (path && path.length > 1 && path.length < 60) return { kind: 'wp', tx: p[0], tz: p[1], path }; } } }
  for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, d = R2(6, 22), tx = n.x + Math.sin(a) * d, tz = n.z + Math.cos(a) * d; if (Hq(tx, tz) > WL + 0.3) return { kind: 'wp', tx, tz }; }
  return { kind: 'wp', tx: n.x, tz: n.z };
}
function steerWalker(n, dt) {
  if (!n.nav) n.nav = inCity(n.x, n.z, 2) && favelaMask(n.x, n.z) < 0.05 ? nearestRing(n) : pickWaypoint(n);
  const nv = n.nav; let tx, tz;
  if (nv.kind === 'ring') {
    if (nv.crossWait && nv.cross) { if (lightState(nv.crossWait.i, nv.crossWait.j, nv.crossWait.axis) !== 2) { n.wait = 0; return [0, 0]; } nv.crossWait = null; }       // espera o sinal dos carros fechar
    const q = ringPoint(nv.bi, nv.bj, nv.s), d = Math.hypot(q[0] - n.x, q[1] - n.z);
    if (d < 3.2 || nv.cross) {
      if (nv.cross && d < 1.6) nv.cross = false;
      if (!nv.cross) {
        const before = Math.floor(nv.s / 52); nv.s = (nv.s + nv.dir * n.speed * dt + RING_L) % RING_L;
        if (Math.floor(nv.s / 52) !== before && Math.random() < 0.4) {                    // esquina: às vezes atravessa a rua
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(o => !!blockOK(nv.bi + o[0], nv.bj + o[1]));
          const o = opts[Math.floor(Math.random() * opts.length)]; if (o) {
            const along = o[0] !== 0, rIdx = along ? (o[0] > 0 ? nv.bi + 1 : nv.bi) : (o[1] > 0 ? nv.bj + 1 : nv.bj), oi = along ? rIdx : Math.round((n.x - roadC(0)) / P), oj = along ? Math.round((n.z - roadC(0)) / P) : rIdx;
            nv.crossWait = { i: oi, j: oj, axis: along ? 'z' : 'x' };
            nv.bi += o[0]; nv.bj += o[1]; let bs = 0, bd = 1e9; for (let s = 0; s < RING_L; s += 2) { const p = ringPoint(nv.bi, nv.bj, s), dd = Math.hypot(p[0] - n.x, p[1] - n.z); if (dd < bd) { bd = dd; bs = s; } } nv.s = bs; nv.cross = true; }
        }
      }
    }
    const q2 = ringPoint(nv.bi, nv.bj, nv.cross ? nv.s : nv.s + nv.dir * 1.4); tx = q2[0]; tz = q2[1];
    if (!nv.cross && Math.random() < dt * 0.012) { n.wait = R2(2, 7); n.waitClip = pickClip(['IDLE_stance', 'IDLE_HBHB', 'IDLE_tired', 'urb_waiting2', 'urb_wait_1', 'IDLE_taxi']); }
  } else {
    if (nv.path && nv.path.length) { while (nv.path.length > 1 && Math.hypot(nv.path[0][0] - n.x, nv.path[0][1] - n.z) < 1.3) nv.path.shift(); tx = nv.path[0][0]; tz = nv.path[0][1]; } else { tx = nv.tx; tz = nv.tz; }
    const d = Math.hypot(nv.tx - n.x, nv.tz - n.z);
    if (d < 1.4) { n.wait = R2(1.5, 6); n.waitClip = pickClip(['IDLE_stance', 'IDLE_HBHB', 'urb_waiting', 'urb_wait_1', 'urb_look_1', 'IDLE_chat']); n.nav = null; return [0, 0]; }
    n.stuck += dt; if (n.stuck > 2.5) { if (Math.hypot(n.x - n.lx, n.z - n.lz) < 0.6) { n.nav = null; n.stuck = 0; return [0, 0]; } n.lx = n.x; n.lz = n.z; n.stuck = 0; }
  }
  const dx = tx - n.x, dz = tz - n.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
}

/* ---------- movimento com física: separação, paredes, carros, água ---------- */
const _nbr = [];
function moveNpc(n, wx, wz, speed, dt) {
  const k = Math.min(1, dt * 9);
  n.vx += (wx * speed - n.vx) * k; n.vz += (wz * speed - n.vz) * k;
  let nx = n.x + n.vx * dt, nz = n.z + n.vz * dt;
  // espaço pessoal: ninguém fica colado em ninguém (nem no jogador)
  const MIN = NPC_R * 2 + 0.22;
  forNear(nx, nz, MIN, o => {
    if (o === n) return;
    const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz), min = (o.r || NPC_R) + NPC_R + 0.22;
    if (d < min && d > 1e-4) { const pen = (min - d), w = o.fixed || o.anchored ? 1 : 0.5; nx += dx / d * pen * w; nz += dz / d * pen * w; }
    else if (d <= 1e-4) { nx += (Math.random() - 0.5) * 0.1; nz += (Math.random() - 0.5) * 0.1; }
  });
  if (!player.car && !player.dead) { const dx = nx - player.x, dz = nz - player.z, d = Math.hypot(dx, dz), min = 0.5 + NPC_R; if (d < min && d > 1e-4) { nx += dx / d * (min - d); nz += dz / d * (min - d); } }
  // paredes e objetos
  const q = { x: nx, z: nz }; pushOut(q, NPC_R, nearby(nx, nz)); nx = q.x; nz = q.z;
  // carros parados ou lentos empurram para o lado; rápidos atropelam (tratado em npcCarHits)
  const ox = n.x, oz = n.z, gy0 = Hq(ox, oz), step = Math.hypot(nx - ox, nz - oz);
  if (Hq(nx, nz) < WL - 0.15 || (step > 1e-5 && Hq(nx, nz) - gy0 > 0.95 * step && n.fixedY === undefined && !inCity(nx, nz, 0))) { nx = ox; nz = oz; n.vx = n.vz = 0; n.nav = null; }
  n.x = nx; n.z = nz;
}
function npcCarHits(n) {
  for (const c of cars) {
    const dx = n.x - c.x, dz = n.z - c.z, reach = c.len * 0.5 + 2.2; if (dx * dx + dz * dz > reach * reach) continue;
    if (n.fixedY !== undefined && n.fixedY > (c.physics ? c.physics.y : 0) + 2.2) continue;
    const circ = carCircles(c), cvx = c.physics ? c.physics.vx : Math.sin(c.h) * c.speed, cvz = c.physics ? c.physics.vz : Math.cos(c.h) * c.speed, sp = Math.hypot(cvx, cvz);
    for (const [cx, cz] of circ) {
      const ddx = n.x - cx, ddz = n.z - cz, d = Math.hypot(ddx, ddz), rr = c.cr + NPC_R * 0.9; if (d >= rr || d < 1e-4) continue;
      const nx = ddx / d, nz = ddz / d, rel = cvx * nx + cvz * nz - (n.vx * nx + n.vz * nz);
      if (sp > 3.4 && rel > 2.6 && n.ph !== 'hit') { knock(n, cvx, cvz, sp, c, Math.max(0, (sp - 3) * 8)); return true; }
      n.x += nx * (rr - d); n.z += nz * (rr - d);
      if (sp > 0.8 && n.ph === 'normal') { n.ph = 'panic'; n.panicT = 2; n.fx = c.x; n.fz = c.z; n.cower = false; }
    }
  }
  return false;
}
/* carro vindo na direção do NPC: ele pula para o lado */
function dodgeCars(n, dt) {
  if (n.dodgeT > 0) { n.dodgeT -= dt; return true; }
  if (n.noDodge) return false;                                          // distraído (celular, dormindo, bêbado) não desvia
  for (const c of cars) {
    const cvx = c.physics ? c.physics.vx : Math.sin(c.h) * c.speed, cvz = c.physics ? c.physics.vz : Math.cos(c.h) * c.speed, sp = Math.hypot(cvx, cvz); if (sp < 5) continue;
    const rx = n.x - c.x, rz = n.z - c.z, vx = cvx / sp, vz = cvz / sp, along = rx * vx + rz * vz;
    if (along < -c.len * 0.3 || along > sp * 1.9 + 5) continue;
    const lat = rx * -vz + rz * vx; if (Math.abs(lat) > c.cr + 1.3) continue;
    const side = lat >= 0 ? 1 : -1; n.dodgeX = -vz * side; n.dodgeZ = vx * side; n.dodgeT = 0.7; n.ph = 'panic'; n.panicT = R2(3, 6); n.fx = c.x; n.fz = c.z; n.cower = false; releaseNpc(n); return true;
  }
  return false;
}

/* ---------- um NPC por quadro ---------- */
function updateNpc(n, dt, cam) {
  n.t += dt;
  const a = n.actor;
  switch (n.ph) {
    case 'hit': {                                                    // arremessado: balística + escorregão
      n.vy -= 9.8 * dt; n.x += n.vx * dt; n.z += n.vz * dt;
      const q = { x: n.x, z: n.z }; if (pushOut(q, NPC_R, nearby(n.x, n.z))) { n.vx *= -0.3; n.vz *= -0.3; } n.x = q.x; n.z = q.z;
      const gy = npcGround(n); n.air = n.y > gy + 0.02 || n.vy > 0; n.y += n.vy * dt;
      if (n.y <= gy) { n.y = gy; if (n.vy < -2) { n.vy = -n.vy * 0.2; } else n.vy = 0; const f = Math.exp(-dt * 3.2); n.vx *= f; n.vz *= f; }
      if (n.t > 0.4 && Math.hypot(n.vx, n.vz) < 0.5 && n.y <= gy + 0.03) { n.ph = n.dead ? 'dead' : 'down'; n.t = 0; n.downT = R2(2.5, 5); }
      break;
    }
    case 'down': n.downT -= dt; if (n.downT <= 0) { n.ph = 'getup'; n.t = 0; n.clipRestart = true; npcPlay(n, n.getupClip, false, 1, 0.1); } break;
    case 'getup': if (n.t > ((findClip(n.getupClip) || { duration: 1.2 }).duration / 1) * 0.95 + 0.1) { n.ph = 'panic'; n.panicT = R2(4, 8); n.fx = n.x - Math.sin(n.h) * 3; n.fz = n.z - Math.cos(n.h) * 3; n.cower = false; n.clip = ''; } break;
    case 'dead': n.deadT += dt; break;
    case 'flinch': n.vx *= 0.8; n.vz *= 0.8;                         // acusou o tiro: depois foge (o valente da facção parte para cima)
      if (n.t > n.flinchT) { n.clip = ''; if (n.pers && n.pers.gang && n.pers.brave >= 5 && typeof pedReact === 'function') pedReact(n, { id: -3, type: 'fight', x: player.x, z: player.z, pri: 3, player: true }, 'confront'); else { n.ph = 'panic'; n.panicT = R2(8, 14); n.fx = player.x; n.fz = player.z; n.cower = false; n.evPri = 3; } }
      break;
    default: behave(n, dt);
  }
  n.y = n.ph === 'hit' ? n.y : lerp(n.y, npcGround(n), Math.min(1, dt * 12));
}
const _awd = new THREE.Vector3();
function aimedAt(n) {                                              // arma apontada de perto: levanta as mãos ou foge
  if (typeof weapons === 'undefined' || weapons.aim < 0.6 || n.aimedT > 0) return false;
  const dx = n.x - player.x, dz = n.z - player.z, d = Math.hypot(dx, dz); if (d > 16 || d < 0.5) return false;
  camera.getWorldDirection(_awd); if ((dx * _awd.x + dz * _awd.z) / d < 0.94) return false;
  releaseNpc(n); n.aimedT = 12; n.ph = 'panic'; n.panicT = R2(5, 9); n.fx = player.x; n.fz = player.z; n.cower = Math.random() < 0.6; n.cowerClip = pickClip(['handsup', 'cower']); n.clip = ''; return true;
}
function behave(n, dt) {
  if (n.aimedT > 0) n.aimedT -= dt;
  if (typeof pedReactBehave === 'function' && pedReactBehave(n, dt)) return;     // reagindo a um evento (ped-ai.js)
  if (n.anchored) {                                                  // cena fixa: só troca de animação de vez em quando e reage ao jogador
    n.actT -= dt; const cfg = ACT[n.act]; if (n.actT <= 0 && cfg) sceneClip(n, cfg, false);
    if (!player.dead && !n.sitH && !n.layH) { const dx = player.x - n.x, dz = player.z - n.z; if (dx * dx + dz * dz < 9 && n.act !== 'dance') n.h += wrap(Math.atan2(dx, dz) - n.h) * Math.min(1, dt * 1.5); }
    // carro em disparada ou jogador empurrando de perto: acorda a cena
    if (dodgeCars(n, dt)) releaseNpc(n);
    else if (aimedAt(n)) { /* já virou pânico */ }
    else if (!player.car && Math.hypot(player.vx, player.vz) > 5.5 && Math.hypot(player.x - n.x, player.z - n.z) < 0.95) { releaseNpc(n); n.ph = 'panic'; n.panicT = 3; n.fx = player.x; n.fz = player.z; n.cower = false; }
    return;
  }
  if (n.ph === 'panic') {
    n.panicT -= dt;
    if (n.panicT <= 0) {
      if (!n.cower && !(n.stopT > 0) && !n.stopDone && Math.hypot(n.vx, n.vz) > 3 && hasClip('Run_stop')) { n.stopT = clipDur('Run_stop', 0.9) * 0.85; n.stopDone = true; n.clipRestart = true; npcPlay(n, 'Run_stop', false, 1, 0.12); }
      if (n.stopT > 0) { n.stopT -= dt; const v = Math.max(0, Math.hypot(n.vx, n.vz) - dt * 5.5); moveNpc(n, Math.sin(n.h), Math.cos(n.h), v, dt); return; }   // freada: escorrega até parar
      n.stopDone = false; n.ph = 'normal'; n.nav = null; n.clip = '';
      if (n.afterPanic && typeof pedReact === 'function') { const ev = n.afterPanic; n.afterPanic = null; pedReact(n, ev, 'call'); }
      return;
    }
    if (n.cower) { n.vx *= 0.8; n.vz *= 0.8; npcPlay(n, pickCower(n), true, 1, 0.2); return; }
    let dx = n.x - n.fx, dz = n.z - n.fz, l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (n.dodgeT > 0) { dx = n.dodgeX; dz = n.dodgeZ; }
    const av = avoid(n); dx += av[0] * 0.8; dz += av[1] * 0.8; const m = Math.hypot(dx, dz) || 1;
    n.h += wrap(Math.atan2(dx, dz) - n.h) * Math.min(1, dt * 12);
    const run = n.panicRun || (n.panicRun = Math.random() < 0.5 ? 'sprint_panic' : 'run_civi');
    const runSp = (clipSpeed(run) || 4.6) * (n.pers ? 0.86 + n.pers.agile * 0.05 : 1) * (n.wounded ? 0.8 : 1);
    moveNpc(n, dx / m, dz / m, n.dodgeT > 0 ? Math.max(5.6, runSp) : runSp, dt); if (n.dodgeT > 0) n.dodgeT -= dt;
    npcMove(n, run, Math.hypot(n.vx, n.vz) || runSp, 0.15);
    if (npcCarHits(n)) return;
    return;
  }
  if (dodgeCars(n, dt)) return;
  if (aimedAt(n)) return;
  if (n.wait > 0) {                                                  // parado: espera, olha em volta
    n.wait -= dt; n.vx *= 0.8; n.vz *= 0.8; moveNpc(n, 0, 0, 0, dt); npcPlay(n, n.waitClip === 'IDLE_stance' ? (n.idleClip || 'IDLE_stance') : (n.waitClip || n.idleClip || 'IDLE_stance'), true, 1, 0.3);
    if (n.wait <= 0 && hasClip('WALK_start') && !(n.pers && /velh|gord/.test(n.pers.style))) n.startT = clipDur('WALK_start', 0.27);   // arranque antes de andar
    if (npcCarHits(n)) return; return;
  }
  const dir = steerWalker(n, dt), av = avoid(n);
  let dx = dir[0] + av[0] * 1.2, dz = dir[1] + av[1] * 1.2; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
  const crowd = Math.min(1, m);                                      // gente à frente: desacelera
  let sp = n.speed * (n.nav && n.nav.kind === 'wp' && favelaMask(n.x, n.z) > 0.2 ? 0.85 : 1) * clamp(0.45 + crowd * 0.55, 0.45, 1) * (n.phone ? 0.85 : 1);
  n.h += wrap(Math.atan2(dx, dz) - n.h) * Math.min(1, dt * 7);
  if (n.startT > 0) { n.startT -= dt; sp *= 0.55; moveNpc(n, dx, dz, sp, dt); if (n.clip !== 'WALK_start') { n.clipRestart = true; npcPlay(n, 'WALK_start', false, 1, 0.15); } npcCarHits(n); return; }
  moveNpc(n, dx, dz, sp, dt);
  const spd = Math.hypot(n.vx, n.vz);
  if (spd > 0.35) npcMove(n, n.gait[0], spd, 0.25); else npcPlay(n, n.nav && n.nav.crossWait && n.crossClip ? n.crossClip : (n.idleClip || 'IDLE_stance'), true, 1, 0.3);   // esperando o sinal: olha para os dois lados
  npcCarHits(n);
}
const pickCower = n => n.cowerClip || (n.cowerClip = pickClip(['cower', 'handscower', 'DUCK_cower']));
/* vetor que afasta de quem está perto à frente (espaço pessoal) */
function avoid(n) {
  let ax = 0, az = 0;
  forNear(n.x, n.z, 2.0, o => {
    if (o === n) return; const dx = n.x - o.x, dz = n.z - o.z, d = Math.hypot(dx, dz), r = 1.9; if (d > r || d < 1e-3) return;
    // só importa se está na direção em que vou (frente) ou muito perto
    const f = (Math.sin(n.h) * -dx + Math.cos(n.h) * -dz) / d; if (f < -0.2 && d > 0.9) return;
    const w = (r - d) / r; ax += dx / d * w; az += dz / d * w;
  });
  return [ax, az];
}

/* ---------- apresentação: posição, animação (com nível de detalhe) ---------- */
function drawNpc(n, dt, dcam) {
  const a = n.actor, vis = dcam < 175; a.group.visible = vis; if (!vis) return;
  a.mesh.castShadow = dcam < 30; a.setLod(dcam < 24 ? 1 : 2);
  n.animAcc += dt; const interval = dcam < 28 ? 0 : dcam < 65 ? 1 / 30 : dcam < 115 ? 1 / 15 : 1 / 8;
  const sc = a.group.scale.x, stuck = n.ph === 'down' || n.ph === 'dead';
  let updated = false;
  if (n.pelvisAt) n.animAcc = Math.max(n.animAcc, interval);         // sequência de carro: anima todo quadro, para o corpo seguir o caminho
  if (typeof pedOverlay === 'function') pedOverlay(n, a);
  if (n.animAcc >= interval && !(stuck && n.animStopped)) { a.ap.update(Math.min(n.animAcc, 0.25)); n.animAcc = 0; updated = true; if (stuck && n.t > (n.stillAfter || 3)) n.animStopped = true; } else if (stuck) { /* deitado: não precisa animar */ }
  if (!stuck) n.animStopped = false;
  a.group.rotation.y = n.h;
  if (typeof pedPose === 'function' && dcam < 60) pedPose(n, a, dt, updated);   // cabeça olhando + inclinação nas curvas
  if (n.pelvisAt) { const P = n.pelvisAt; placeByPelvis(a, P.x, P.y, P.z, n.h, sc); }
  else if (n.anchored && (n.sitH || n.layH)) {
    placeByPelvis(a, n.x, (n.sitH ? n.seatY + SIT_PELVIS : npcGround(n) + (n.fixedY !== undefined ? 0 : 0) + 0.2), n.z, n.h, sc);
  } else {
    a.group.position.set(n.x, n.y + a.footOffset * sc, n.z);
    if ((updated || n.plantD === undefined) && dcam < 90 && !(n.ph === 'hit' && n.air)) { n.plantD = plantActor(a, n.y); a.group.position.x = n.x; a.group.position.z = n.z; }       // agachado/deitado/inclinado: o corpo encosta no chão
    else a.group.position.y += (n.ph === 'hit' && n.air) ? 0 : (n.plantD || 0);
  }
}

/* ---------- gerenciador: aparece perto do jogador, some longe ---------- */
function npcInView(x, z, camPos, dir) { const dx = x - camPos.x, dz = z - camPos.z, d = Math.hypot(dx, dz) || 1; return (dx * dir.x + dz * dir.z) / d > 0.45; }
const _dir = new THREE.Vector3();
function manageNpcs(dt) {
  npcSpawnT -= dt; npcSpotT -= dt;
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z, cam = camera.position;
  camera.getWorldDirection(_dir);
  // cenas fixas
  if (npcSpotT <= 0) {
    npcSpotT = 0.45;
    for (const sp of npcSpots) {
      const d = Math.hypot(sp.x - px, sp.z - pz);
      if (sp.live) { if (d > 150) { for (const n of sp.live.slice()) removeNpc(n); sp.live = null; } }
      else if (d < 100 && peds.length < NPC_MAX - 26 && (d > 38 || !npcInView(sp.x, sp.z, cam, _dir)) && (sp.area !== 'beach' || d < 90)) spawnSpot(sp);
    }
  }
  // caminhantes
  if (npcSpawnT <= 0) {
    npcSpawnT = 0.3;
    const night = typeof nightF === 'number' ? nightF : 0, inFav = favDist(favAt(px, pz), px, pz) < favAt(px, pz).R + 50, inTown = inCity(px, pz, 80);
    const want = inFav ? 20 : inTown ? Math.round((cityAt(px, pz, 80) === SP ? 54 : 40) * (1 - 0.6 * night)) : 5;   // SP é mais cheia
    let have = 0; for (const n of peds) if (n.mode === 'walker') have++;
    if (have < want && peds.length < NPC_MAX) spawnWalkerNear(px, pz, cam, inFav);
    for (const n of peds.slice()) {                                  // some quem ficou para trás
      const d = Math.hypot(n.x - px, n.z - pz);
      if (n.mode === 'walker' && (d > 185 || (d > 120 && !npcInView(n.x, n.z, cam, _dir) && have > want))) removeNpc(n);
      else if (n.ph === 'dead' && n.deadT > 60 && d > 25) removeNpc(n);
    }
  }
}
function spawnWalkerNear(px, pz, cam, inFav) {
  for (let t = 0; t < 12; t++) {
    let x, z, nav = null;
    const FV = favelaAt(px, pz);
    if (inFav && FV.walk && FV.walk.length) { const p = FV.walk[Math.floor(Math.random() * FV.walk.length)]; x = p[0]; z = p[1]; }
    else if (inCity(px, pz, 80)) {
      const [bi0, bj0, C] = blockIJ(px, pz), bi = clamp(bi0 + Math.floor(R2(-3, 4)), C.i0, C.i0 + C.ni - 1), bj = clamp(bj0 + Math.floor(R2(-3, 4)), C.j0, C.j0 + C.nj - 1);
      if (parkSet.has(bi + ',' + bj) && Math.random() < 0.5) continue;
      const s = Math.random() * RING_L, q = ringPoint(bi, bj, s); x = q[0]; z = q[1]; nav = { kind: 'ring', bi, bj, s, dir: Math.random() < 0.5 ? 1 : -1, cross: false };
    } else { const a = Math.random() * 6.28, d = R2(60, 120); x = px + Math.sin(a) * d; z = pz + Math.cos(a) * d; if (Hq(x, z) < WL + 0.4 || !inCity(x, z, 200)) continue; }
    const d = Math.hypot(x - px, z - pz); if (d < 40 || d > 150) continue;
    if (d < 110 && npcInView(x, z, cam, _dir)) continue;
    let crowded = false; forNear(x, z, 1.2, () => { crowded = true; }); if (crowded) continue;
    const n = makeNpc({ x, z, mode: 'walker', nav }); n.h = Math.random() * 6.28; return n;
  }
  return null;
}

/* carros freiam para quem está na frente (gente na pista) */
function markPedsAhead() {
  for (const c of cars) {
    if (!c.ai) { c.pedAhead = 99; continue; }
    const fx = Math.sin(c.h), fz = Math.cos(c.h), spd = Math.max(0, c.speed), look = c.len * 0.5 + 4 + Math.min(spd * 0.9, 22); let best = 99;
    for (let d = 1.5; d <= look && best === 99; d += 1.8) for (const off of [0, 1.1, -1.1]) {
      const sx = c.x + fx * (c.len * 0.5 + d) + fz * off, sz = c.z + fz * (c.len * 0.5 + d) - fx * off;
      forNear(sx, sz, 1.0, o => { if (o.fixedY !== undefined && !o.isOfficer) return; if (Math.hypot(o.x - sx, o.z - sz) < 1.05 + c.cr * 0.45 && d < best) best = d; });
    }
    c.pedAhead = best;
  }
}

/* ---------- laço principal ---------- */
function updateNpcs(dt) {
  if (!npcsReady || paused) return;
  npcFrame++; const cam = camera.position;
  manageNpcs(dt); buildNpcGrid(); markPedsAhead(); if (typeof updatePedAI === 'function') updatePedAI(dt);
  for (const n of peds.slice()) {
    updateNpc(n, dt, cam);
    drawNpc(n, dt, Math.hypot(n.x - cam.x, n.z - cam.z));
  }
}
window.__npcApi = { get peds() { return peds; }, npcPanic, knock, spawnSpot, npcSpots };
