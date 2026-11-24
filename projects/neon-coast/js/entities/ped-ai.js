/* NEON COAST — IA de pedestres e motoristas no estilo do GTA IV (estudo em engine/docs/ia-gta4.md).
   • Personalidade por pessoa (pedpersonality do IV): coragem 1-5 (a maioria é medrosa), agilidade, sexo, idade e um JEITO DE ANDAR
     próprio (andar + correr do SA: comum, apressada, de compras, gangue, velho, gordo, arrastado…), em vez de sortear clipes soltos.
   • "Eventos chocantes" (ShockingEvents do IV): tiro, pessoa baleada, atropelamento, batida, arma à mostra, roubo de carro, briga, explosão.
     Cada evento tem prioridade, duração, alcance de visão e de som; cada pessoa que percebe sorteia UMA reação conforme o evento e a coragem:
     olhar, ir ver de perto, sair apressado, fugir, se encolher, ligar para a polícia ou tirar satisfação (e até partir para a briga).
   • Motoristas: fogem acelerando de tiroteio; com arma apontada, os medrosos param e largam o carro, os corajosos arrancam;
     no roubo do carro a vítima é puxada para fora e foge ou parte para cima; depois de uma batida causada pelo jogador alguns descem irritados.
   • Cabeça: as pessoas olham para o que chamou a atenção (e para o jogador quando ele chega perto). */
'use strict';
const PED_STYLE = {
  m: [['comum', 'WALK_civi', 'run_civi', 1.55, 5], ['jogador', 'WALK_player', 'run_player', 1.65, 3], ['gangue', 'WALK_gang1', 'run_gang1', 1.5, 2], ['gangue2', 'WALK_gang2', 'run_gang1', 1.45, 1],
    ['velho', 'WALK_old', 'run_old', 1.05, 1], ['gordo', 'WALK_fat', 'run_fat', 1.2, 1], ['arrastado', 'WALK_shuffle', 'run_civi', 1.25, 1]],
  f: [['comum', 'WOMAN_walknorm', 'woman_run', 1.45, 5], ['apressada', 'WOMAN_walkbusy', 'WOMAN_runbusy', 1.7, 3], ['compras', 'WOMAN_walkshop', 'woman_run', 1.3, 2],
    ['sensual', 'WOMAN_walksexy', 'WOMAN_runsexy', 1.4, 2], ['velha', 'WOMAN_walkold', 'WOMAN_runfatold', 1.0, 1], ['gorda', 'WOMAN_walkfatold', 'WOMAN_runfatold', 1.1, 1]]
};
const BRAVERY_W = [36, 24, 15, 5, 20];                          // proporção de coragem 1..5 entre os pedestres comuns do IV (a maioria é medrosa)
const isFemaleSkin = id => /mulher|girl|woman|fem_|_bf|_wf|_hf|_of|bfori|wfyst|bfyst|wfost|bmost_mulher/i.test(id || '');
const pickW = list => { let s = 0; for (const x of list) s += x[x.length - 1]; let r = Math.random() * s; for (const x of list) { r -= x[x.length - 1]; if (r <= 0) return x; } return list[0]; };
function pedInit(n) {
  const t = n.actor && n.actor.type, id = (t && t.id) || '', female = isFemaleSkin(id), gang = t && t.role === 'faccao';
  let st = pickW(PED_STYLE[female ? 'f' : 'm']);
  if (gang && !female && Math.random() < 0.7) st = PED_STYLE.m[Math.random() < 0.6 ? 2 : 3];
  const walk = hasClip(st[1]) ? st[1] : 'WALK_civi', run = hasClip(st[2]) ? st[2] : 'run_civi';
  let b = 1, r = Math.random() * 100; for (let i = 0; i < 5; i++) { r -= BRAVERY_W[i]; if (r <= 0) { b = i + 1; break; } }
  if (gang) b = Math.min(5, b + 2); if (/velh|gord/.test(st[0])) b = Math.max(1, b - 1);
  const old = /velh/.test(st[0]);
  n.pers = { female, gang, style: st[0], brave: b, agile: old ? 1 : 1 + Math.floor(Math.random() * 5), softjack: b <= 2 };
  n.gait = [walk, st[3] * 1.1]; n.runClip = run; n.speed = st[3] * R2(0.88, 1.08);
  n.panicRun = old ? (hasClip(run) ? run : 'run_civi') : female ? (hasClip('woman_runpanic') ? 'woman_runpanic' : run) : (Math.random() < 0.6 && hasClip('sprint_panic') ? 'sprint_panic' : run);
  n.crossClip = pickClip(female ? ['roadcross_female'] : old ? ['roadcross_old'] : gang ? ['roadcross_gang'] : ['roadcross']);
  n.lean = 0; n.hPrev = n.h; n.lookW = 0;
}

/* ---------- eventos chocantes ---------- */
/* pri: prioridade (só troca de reação por algo mais grave) · life: s · vis/aud: alcance (m) · w: peso de cada reação para quem está a pé · car: chance de motorista fugir */
const AI_EV = {
  gunshot:  { pri: 3, life: 5, vis: 45, aud: 100, w: { flee: 6, cower: 3, hurry: 1 }, car: 0.6, pts: 1, why: 'disparo de arma' },
  shot:     { pri: 3, life: 8, vis: 35, aud: 35, w: { flee: 6, cower: 2, call: 2 }, car: 0.5, pts: 2, why: 'pessoa baleada' },
  dead:     { pri: 3, life: 25, vis: 18, aud: 0, w: { flee: 3, watch: 2, call: 3, gather: 1 }, pts: 2, why: 'homicídio' },
  runover:  { pri: 2, life: 10, vis: 22, aud: 12, w: { watch: 3, gather: 3, flee: 2, call: 2 }, car: 0.1, pts: 1, why: 'atropelamento' },
  crash:    { pri: 2, life: 6, vis: 25, aud: 18, w: { watch: 6, hurry: 1, call: 1 }, car: 0, pts: 1, why: 'colisão' },
  weapon:   { pri: 1, life: 1, vis: 11, aud: 0, w: { hurry: 4, watch: 2, flee: 2, call: 1 }, car: 0, pts: 0 },
  carjack:  { pri: 2, life: 6, vis: 25, aud: 18, w: { watch: 5, hurry: 3, call: 3, flee: 1 }, car: 0.1, pts: 1, why: 'roubo de carro' },
  fight:    { pri: 2, life: 4, vis: 20, aud: 10, w: { gather: 5, watch: 2, hurry: 2, flee: 1, call: 1 }, car: 0, pts: 1, why: 'agressão' },
  explosion:{ pri: 3, life: 6, vis: 100, aud: 120, w: { flee: 6, cower: 4 }, car: 0.8, pts: 2, why: 'explosão' }
};
const aiEvents = []; let aiEvSeq = 0, aiTick = 0, aiWeaponT = 0;
function aiEvent(type, x, z, o) {
  const E = AI_EV[type]; if (!E) return;
  o = o || {};
  for (const e of aiEvents) if (e.type === type && Math.hypot(e.x - x, e.z - z) < 6 && e.t < 1.5) { e.t = 0; return e; }   // mesmo lugar: renova
  const e = { id: ++aiEvSeq, type, x, z, t: 0, life: E.life, pri: E.pri, player: o.player !== false, src: o.src || null };
  aiEvents.push(e); if (aiEvents.length > 24) aiEvents.shift();
  if (E.car) for (const c of cars) if (c.ai && !c.cop && !c.ems && c !== player.car && Math.hypot(c.x - x, c.z - z) < E.aud * 0.7 && Math.random() < E.car) c.fleeT = Math.max(c.fleeT || 0, R2(8, 14)), c.fleeFrom = [x, z];
  return e;
}
/* compatibilidade: quem chamava "pânico em volta de x,z" agora gera o evento equivalente */
npcPanic = function (x, z, r) { aiEvent(r >= 40 ? 'gunshot' : r >= 24 ? 'runover' : 'fight', x, z); };

/* escolhe a reação de uma pessoa a um evento (pesos do evento × coragem × distância) */
function pedChoose(n, e, d) {
  const E = AI_EV[e.type], b = n.pers ? n.pers.brave : 2, w = Object.assign({}, E.w);
  const near = d < 12;
  if (w.flee) w.flee *= (1.5 - (b - 1) * 0.25) * (near ? 1.4 : 0.8);
  if (w.cower) w.cower *= b <= 2 ? 1.6 : 0.25;
  if (w.watch) w.watch *= 0.6 + (b - 1) * 0.25;
  if (w.gather) w.gather *= b >= 3 ? 1.3 : 0.4;
  if (w.call) w.call *= e.player ? 1 : 0.3;
  if (b >= 4 && e.player && (e.type === 'crash' || e.type === 'fight') && !player.car && d < 14) w.confront = b === 5 ? 3 : 1.5;
  const list = Object.entries(w).filter(x => x[1] > 0); let s = 0; for (const x of list) s += x[1];
  let r = Math.random() * s; for (const [k, v] of list) { r -= v; if (r <= 0) return k; }
  return 'watch';
}
const WATCH_CLIPS = ['urb_shakehead_1', 'urb_crossarms', 'IDLE_stance', 'flee_lkaround_01', 'urb_listening', 'IDLE_HBHB'];
const ANGRY_CLIPS = ['urb_angry_1', 'urb_angry_2', 'fucku', 'urb_angry_1'];
const PHONE_CLIPS = ['phone_talk', 'urb_use_phone_1'];
function pedReact(n, e, kind) {
  releaseNpc(n); n.lastEv = e.id; n.evPri = e.pri; n.evX = e.x; n.evZ = e.z; n.clip = '';
  if (kind === 'flee' || kind === 'cower') { n.ph = 'panic'; n.panicT = R2(6, 12); n.fx = e.x; n.fz = e.z; n.cower = kind === 'cower'; n.t = 0; return; }
  n.ph = 'react'; n.rk = kind; n.t = 0; n.ev = e;
  n.rT = kind === 'watch' ? R2(4, 10) : kind === 'gather' ? R2(10, 18) : kind === 'hurry' ? R2(5, 9) : kind === 'call' ? R2(5, 7) : kind === 'confront' ? R2(9, 15) : 6;
  n.rClip = kind === 'watch' || kind === 'gather' ? pickClip(WATCH_CLIPS) : kind === 'call' ? pickClip(PHONE_CLIPS) : null;
  n.gatherD = R2(3.5, 6.5); n.punchCd = R2(1, 2.5);
}
/* comportamento de quem está reagindo (fase 'react'); devolve true se cuidou do quadro */
function pedReactBehave(n, dt) {
  if (n.ph !== 'react') return false;
  if (n.rk === 'jacked') {                                          // vítima do roubo caindo do carro: depois decide
    n.rT -= dt; n.vx = n.vz = 0; n.lookX = player.x; n.lookZ = player.z;
    if (n.rT <= 0) { if (n.after === 'confront') pedReact(n, { id: -2, type: 'carjack', x: player.x, z: player.z, pri: 2, player: true }, 'confront'); else { n.ph = 'panic'; n.panicT = R2(8, 14); n.fx = player.x; n.fz = player.z; n.cower = false; n.clip = ''; } }
    return true;
  }
  if (dodgeCars(n, dt)) { n.ph = 'panic'; return true; }
  if (aimedAt(n)) return true;
  n.rT -= dt; const k = n.rk, toS = Math.atan2(n.evX - n.x, n.evZ - n.z), dS = Math.hypot(n.evX - n.x, n.evZ - n.z);
  n.lookX = n.evX; n.lookZ = n.evZ;
  if (n.rT <= 0) {
    if (k === 'call' && n.ev && n.ev.player && !n.ev.called && typeof crime === 'function') { const E = AI_EV[n.ev.type]; n.ev.called = true; if (E && E.pts && police.heat < E.pts + 0.5) { crime(E.pts, (E.why || 'denúncia') + ' (denunciado por testemunha)', false); if (typeof toast === 'function' && Math.hypot(n.x - player.x, n.z - player.z) < 60) toast('Uma testemunha ligou para a polícia', 1800); } }
    if (k === 'call' || k === 'confront') { n.rk = 'hurry'; n.rT = R2(4, 7); n.clip = ''; return true; }
    n.ph = 'normal'; n.nav = null; n.clip = ''; n.ev = null; n.lookX = undefined; return true;
  }
  const face = (h, r) => { n.h += wrap(h - n.h) * Math.min(1, dt * r); };
  if (k === 'watch' || (k === 'gather' && dS < n.gatherD)) {
    n.vx *= 0.8; n.vz *= 0.8; moveNpc(n, 0, 0, 0, dt); face(toS, 3); npcPlay(n, n.rClip || 'IDLE_stance', true, 1, 0.35);
  } else if (k === 'gather') {
    face(toS, 6); moveNpc(n, Math.sin(n.h), Math.cos(n.h), n.speed * 1.05, dt); npcPlay(n, n.gait[0], true, clamp(n.speed / n.gait[1], 0.6, 1.4), 0.25);
  } else if (k === 'hurry') {
    let dx = n.x - n.evX, dz = n.z - n.evZ; const l = Math.hypot(dx, dz) || 1, av = avoid(n); dx = dx / l + av[0]; dz = dz / l + av[1]; const m = Math.hypot(dx, dz) || 1;
    face(Math.atan2(dx, dz), 7); const sp = n.speed * 1.75; moveNpc(n, dx / m, dz / m, sp, dt);
    npcPlay(n, sp > 2.6 ? n.runClip : n.gait[0], true, sp > 2.6 ? clamp(sp / 4.2, 0.6, 1.2) : clamp(sp / n.gait[1], 0.8, 1.6), 0.25); n.lookX = undefined;
  } else if (k === 'call') {
    n.vx *= 0.8; n.vz *= 0.8; moveNpc(n, 0, 0, 0, dt); face(toS + Math.PI * 0.6, 2); npcPlay(n, n.rClip, true, 1, 0.4);
  } else if (k === 'confront') {
    const tx = player.car ? player.car.x : player.x, tz = player.car ? player.car.z : player.z, d = Math.hypot(tx - n.x, tz - n.z), to = Math.atan2(tx - n.x, tz - n.z);
    n.lookX = tx; n.lookZ = tz; face(to, 6); n.punchCd -= dt;
    if (player.dead) { n.rT = 0; return true; }
    if (n.punching > 0) { n.punching -= dt; moveNpc(n, 0, 0, 0, dt); if (!n.punchHit && n.punching < 0.32) { n.punchHit = true; if (!player.car && d < 1.6) { hurt(R2(4, 8), 'Briga com pedestre'); player.stun = Math.max(player.stun || 0, 0.25); if (typeof shake !== 'undefined') shake = Math.max(shake, 0.25); } } return true; }
    if (d > 1.5 && (!player.car || d > 3.2)) { moveNpc(n, Math.sin(n.h), Math.cos(n.h), d > 6 ? n.speed * 1.9 : n.speed * 1.1, dt); npcPlay(n, d > 6 ? n.runClip : n.gait[0], true, 1, 0.25); }
    else {
      moveNpc(n, 0, 0, 0, dt);
      const angry = n.pers && n.pers.brave >= 5 && !player.car && n.punchCd <= 0 && (n.provoked || Math.random() < dt * 0.6);
      if (angry) { n.punchCd = R2(1.4, 2.6); n.punching = 0.6; n.punchHit = false; n.clipRestart = true; npcPlay(n, pickClip(['FightA_1', 'FightA_2', 'FightA_3']), false, 1.1, 0.1); aiEvent('fight', n.x, n.z, { player: false }); }
      else if (!n.angryT || n.angryT <= 0) { n.angryT = R2(1.8, 3); n.clipRestart = true; npcPlay(n, pickClip(ANGRY_CLIPS), true, 1, 0.3); }
      n.angryT -= dt;
    }
  }
  if (k !== 'confront') npcCarHits(n);
  return true;
}
/* percepção: cada pessoa olha os eventos ativos algumas vezes por segundo */
function pedPerceive(n) {
  if (n.ph === 'hit' || n.ph === 'down' || n.ph === 'getup' || n.ph === 'dead') return;
  if (n.mode === 'scene' && n.sitH && Math.random() < 0.5) return;           // sentado demora mais a se mexer
  for (const e of aiEvents) {
    if (e.id === n.lastEv || e.pri < (n.ph === 'normal' ? 0 : n.evPri || 0) || (n.ph === 'panic' && e.pri <= (n.evPri || 0))) continue;
    if (e.src === n) continue;
    const E = AI_EV[e.type], d = Math.hypot(n.x - e.x, n.z - e.z);
    const heard = d < E.aud, seen = d < E.vis && (Math.sin(n.h) * (e.x - n.x) + Math.cos(n.h) * (e.z - n.z)) > -d * 0.3;   // vê pela frente (≈ 145°)
    if (!heard && !seen) continue;
    n.lastEv = e.id;
    if (Math.random() > (n.mode === 'scene' ? 0.75 : 0.95)) continue;          // alguns nem ligam
    pedReact(n, e, pedChoose(n, e, d)); return;
  }
  // jogador encostado: olha para ele
  if (n.ph === 'normal' && !player.car) { const d = Math.hypot(player.x - n.x, player.z - n.z); if (d < 5.5 && Math.random() < 0.5) { n.lookX = player.x; n.lookZ = player.z; n.lookT = R2(1.5, 3.5); } }
}

/* ---------- motoristas ---------- */
/* entra no carro de alguém: a vítima é puxada para fora; foge ou tira satisfação */
function aiCarjacked(c) {
  if (!c || !c.driver || c.cop || c.ems || !npcsReady) return;
  const dp = doorPoint(c), n = makeNpc({ x: dp.x, z: dp.z, mode: 'walker' }); pedInit(n);
  n.h = Math.atan2(dp.x - c.x, dp.z - c.z); n.ph = 'react'; n.rk = 'jacked'; n.t = 0;
  n.clipRestart = true; npcPlay(n, pickClip(['CAR_jackedLHS', 'CAR_fallout_LHS']), false, 1, 0.05);
  const brave = n.pers.brave >= 4 && !n.pers.softjack;
  n.after = brave ? 'confront' : 'flee'; n.rT = 1.6; n.evX = c.x; n.evZ = c.z; n.provoked = brave && n.pers.brave >= 5;
  aiEvent('carjack', c.x, c.z, { src: n });
  return n;
}
/* batida causada pelo jogador: alguns motoristas descem irritados */
function aiCarHit(pc, other) {
  aiEvent('crash', other.x, other.z);
  if (!other.ai || other.cop || other.ems || !other.driver || other.driverGone || Math.random() > 0.35) return;
  other.angryT = R2(1.2, 2.2);                                     // para o carro e desce depois de um instante
}
function aiDriverExit(c, kind) {
  if (!npcsReady || c.driverGone) return null;
  const dp = doorPoint(c), n = makeNpc({ x: dp.x, z: dp.z, mode: 'walker' }); pedInit(n);
  c.driverGone = true; c.ai = false; c.parked = true; c.fleeT = 0; if (c.driver) c.driver.group.visible = false;
  n.h = Math.atan2(dp.x - c.x, dp.z - c.z);
  if (kind === 'confront') { n.pers.brave = Math.max(n.pers.brave, 4); pedReact(n, { id: -1, type: 'crash', x: player.x, z: player.z, pri: 2, player: true }, 'confront'); }
  else { n.ph = 'panic'; n.panicT = R2(8, 14); n.fx = player.x; n.fz = player.z; n.cower = false; }
  return n;
}
/* arma apontada para um motorista */
const _adir = new THREE.Vector3();
function aiAimAtCars() {
  if (player.car || typeof weapons === 'undefined' || weapons.aim < 0.6) return;
  camera.getWorldDirection(_adir);
  for (const c of cars) {
    if (!c.ai || c.cop || c.ems || c.driverGone || c.aimedT > 0) continue;
    const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz); if (d > 16 || d < 1) continue;
    if ((dx * _adir.x + dz * _adir.z) / d < 0.93) continue;
    c.aimedT = 8; const brave = Math.random() < 0.35;
    if (brave) { c.fleeT = R2(8, 12); c.fleeFrom = [player.x, player.z]; }
    else c.surrenderT = R2(0.8, 1.6);                                 // para e larga o carro
  }
}
/* chamado pelo trânsito (update.js) a cada passo: devolve [alvo de velocidade, ignora semáforo] ou null */
function aiDriverMood(c, dt, target) {
  if (c.aimedT > 0) c.aimedT -= dt;
  if (c.surrenderT !== undefined) { c.surrenderT -= dt; if (c.surrenderT <= 0 && Math.abs(c.speed) < 1.5) { c.surrenderT = undefined; aiDriverExit(c, 'flee'); } return [0, true]; }
  if (c.angryT !== undefined) { c.angryT -= dt; if (c.angryT <= 0 && Math.abs(c.speed) < 1.5) { c.angryT = undefined; aiDriverExit(c, 'confront'); } return [0, true]; }
  if (c.fleeT > 0) {
    c.fleeT -= dt;
    if (c.stuck > 2 && Math.random() < 0.02) { aiDriverExit(c, 'flee'); return [0, true]; }      // preso fugindo: larga o carro
    return [Math.max(target, c.cruise * 1.8 + 4), true];
  }
  return null;
}

/* ---------- cabeça olhando para algo ---------- */
const _lp = new THREE.Quaternion(), _lq = new THREE.Quaternion(), _lyA = new THREE.Vector3(0, 1, 0);
/* gira pescoço e cabeça em torno do eixo vertical (desfaz a rotação do quadro anterior se a animação não reescreveu o osso) */
function headLook(a, rel) {
  for (const [name, f] of [['neck', 0.35], ['head', 0.65]]) {
    const b = a.bones[a.index[name]]; if (!b || !b.parent) continue; const st = b.userData.lookSt;
    if (st && b.quaternion.equals(st.after)) b.quaternion.copy(st.before); b.userData.lookSt = null;
    if (Math.abs(rel) < 0.01) continue;
    b.parent.getWorldQuaternion(_lp); _lq.setFromAxisAngle(_lyA, rel * f);
    const before = b.quaternion.clone(), t = _lp.clone().invert().multiply(_lq).multiply(_lp); b.quaternion.premultiply(t); b.userData.lookSt = { before, after: b.quaternion.clone() };
  }
}
/* depois de animar o NPC: cabeça para o alvo e corpo inclinado na curva */
function pedPose(n, a, dt, updated) {
  if (n.lookT > 0) n.lookT -= dt; else if (n.ph === 'normal') n.lookX = undefined;
  const want = n.lookX !== undefined && n.ph !== 'hit' && n.ph !== 'down' && n.ph !== 'dead' && !n.layH ? 1 : 0;
  n.lookW += (want - n.lookW) * Math.min(1, dt * 3);
  if (updated && n.lookW > 0.02 && n.lookX !== undefined) headLook(a, clamp(wrap(Math.atan2(n.lookX - n.x, n.lookZ - n.z) - n.h), -1.25, 1.25) * n.lookW);
  else if (updated) headLook(a, 0);
  // inclinação lateral nas curvas (proporcional a giro × velocidade), como o "lean" dos grupos de movimento do IV
  const turn = dt > 0 ? wrap(n.h - (n.hPrev === undefined ? n.h : n.hPrev)) / dt : 0, spd = Math.hypot(n.vx, n.vz); n.hPrev = n.h;
  const lean = (n.ph === 'hit' || n.ph === 'down' || n.ph === 'dead' || n.anchored) ? 0 : clamp(-turn * spd * 0.05, -0.16, 0.16);
  n.lean = (n.lean || 0) + (lean - (n.lean || 0)) * Math.min(1, dt * 6);
  a.group.rotation.order = 'YXZ'; a.group.rotation.z = n.lean;
}

/* ---------- laço ---------- */
function updatePedAI(dt) {
  for (let i = aiEvents.length - 1; i >= 0; i--) { aiEvents[i].t += dt; if (aiEvents[i].t > aiEvents[i].life) aiEvents.splice(i, 1); }
  // arma à mostra (a pé, sem mirar): quem está perto e vê fica incomodado
  aiWeaponT -= dt;
  if (aiWeaponT <= 0) { aiWeaponT = 0.5; if (!player.car && !player.dead && typeof weapons !== 'undefined' && weapons.selected >= 0) { const w = weapons.items[weapons.selected]; if (w && !(wAnim(w).melee)) aiEvent('weapon', player.x, player.z); } }
  aiAimAtCars();
  aiTick++;
  for (const n of peds) if ((n.id * 1000 + aiTick) % 6 < 1) pedPerceive(n);       // cada pessoa percebe ~10x por segundo, espalhado entre os quadros
}
