/* NEON COAST — Animações editáveis (data/anims/<id>.json): carrega os clipes, registra no MESMO mecanismo do findClip (um clipe com o nome de um .ifp o SUBSTITUI)
   e aplica IK de mãos/pés por clipe (animIkApply). Formato, convenções de espaço e API: engine/docs/animacao.md.
   Carregar DEPOIS de anim.js (e de weapons.js/skins.js se quiser o alvo "weapon"). Sem data/anims/index.json (ou com erro): nada muda no jogo. */
'use strict';
(function () {
  if (AnimPlayer.prototype.update._editHook) return;                 // carga dupla do script: não empilha ganchos nem refaz o registro
  /* >>> VALIDADOR (cópia exata de engine/tools/anim-validate.js entre "const LIM" e "module.exports"; tools/test-anims.js confere) */
const LIM = { bones: 64, frames: 600, ik: 8, events: 64, name: 80, notes: 2000, bytes: 2 * 1024 * 1024, duration: 120, posAbs: 20, ikPos: 10, worldPos: 10000, fpsMin: 1, fpsMax: 240 };
const ID = /^[a-z0-9_-]{1,64}$/, NAME = /^[A-Za-z0-9_.-]{1,64}$/, RESERVED = ['index', '__proto__', 'constructor', 'prototype', 'con', 'prn', 'aux', 'nul', 'com0', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt0', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
const CHAINS = { lhand: ['lupperarm', 'lforearm', 'lhand'], rhand: ['rupperarm', 'rforearm', 'rhand'], lfoot: ['lthigh', 'lcalf', 'lfoot'], rfoot: ['rthigh', 'rcalf', 'rfoot'] };
const SPACES = ['weapon', 'bone', 'actor', 'world'];
/* ids de osso do IFP -> nome do osso do esqueleto de 32 ossos dos fardamentos (skin.json .bones[].id/.name) */
const BONE_NAMES = { 0: 'root', 1: 'pelvis', 2: 'spine', 3: 'spine1', 4: 'neck', 5: 'head', 6: 'lbrow', 7: 'rbrow', 8: 'jaw', 21: 'rclav', 22: 'rupperarm', 23: 'rforearm', 24: 'rhand', 25: 'rfinger', 26: 'rfinger01', 31: 'lclav', 32: 'lupperarm', 33: 'lforearm', 34: 'lhand', 35: 'lfinger', 36: 'lfinger01', 41: 'lthigh', 42: 'lcalf', 43: 'lfoot', 44: 'ltoe', 51: 'rthigh', 52: 'rcalf', 53: 'rfoot', 54: 'rtoe', 201: 'belly', 301: 'rbreast', 302: 'lbreast' };
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k), SPEED_MAX = 15, SPEED_ID = /^(walk_|run_|sprint_|woman_)/;      // clipes de locomoção: o jogo usa a velocidade média da raiz para andar (clipSpeed, teto de SPEED_MAX m/s)
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o), fin = n => typeof n === 'number' && isFinite(n);
function num(v, what, lo, hi) { if (!fin(v)) throw new Error(what + ' não é número finito'); if (v < lo || v > hi) throw new Error(what + ' fora do limite (' + lo + ' a ' + hi + ')'); return v; }
function vec(v, n, max, what) {
  if (!Array.isArray(v) || v.length !== n) throw new Error(what + ' deve ter ' + n + ' números');
  return v.map((x, i) => num(x, what + '[' + i + ']', -max, max));
}
/* trilha [[t, ...n valores], ...]: tempos estritamente crescentes (>= 0), máx. LIM.frames quadros. quat: normaliza (norma tem de ser > 0.5 e < 2: o IFP quantizado vem com 0,94 a 1,16) */
function track(a, n, what, opt) {
  if (!Array.isArray(a)) throw new Error(what + ' deve ser uma lista de quadros');
  if (a.length < 1) throw new Error(what + ' está vazio'); if (a.length > LIM.frames) throw new Error(what + ': quadros demais (máximo ' + LIM.frames + ')');
  const out = []; let last = -1;
  for (let i = 0; i < a.length; i++) {
    const f = a[i]; if (!Array.isArray(f) || f.length !== n + 1) throw new Error(what + '[' + i + '] deve ter ' + (n + 1) + ' números [t' + (n === 4 ? ',x,y,z,w' : ',x,y,z') + ']');
    for (let k = 0; k <= n; k++) if (!fin(f[k])) throw new Error(what + '[' + i + '] tem valor que não é número finito');
    if (f[0] < 0 || f[0] > LIM.duration) throw new Error(what + '[' + i + '] tempo fora de 0 a ' + LIM.duration + ' s');
    if (f[0] <= last) throw new Error(what + ': tempos devem ser estritamente crescentes (quadro ' + i + ')');
    last = f[0];
    if (n === 4) {
      const l = Math.hypot(f[1], f[2], f[3], f[4]); if (!(l > 0.5 && l < 2)) throw new Error(what + '[' + i + '] quaternio não normalizável (norma ' + l.toFixed(3) + ')');
      out.push([f[0], f[1] / l, f[2] / l, f[3] / l, f[4] / l]);
    } else { for (let k = 1; k <= 3; k++) if (Math.abs(f[k]) > opt.max) throw new Error(what + '[' + i + '] posição fora do limite (' + opt.max + ' m)'); out.push([f[0], f[1], f[2], f[3]]); }
  }
  return out;
}
/* devolve { ok, erro, data } — data é a cópia normalizada (só os campos conhecidos; quaternios normalizados; duration = max(duration, último quadro)) */
function animValidate(obj) {
  try {
    if (!isObj(obj)) throw new Error('o conteúdo deve ser um objeto');
    if (obj.version !== 1) throw new Error('versão não suportada (esperado version: 1)');
    if (typeof obj.id !== 'string' || !ID.test(obj.id) || RESERVED.includes(obj.id)) throw new Error('id inválido (use a-z 0-9 _ - de 1 a 64 caracteres; "index" e nomes reservados não valem)');
    const out = { version: 1, id: obj.id };
    out.name = obj.name === undefined || obj.name === null ? obj.id : obj.name; if (typeof out.name !== 'string' || !out.name.length || out.name.length > LIM.name) throw new Error('name deve ser texto de 1 a ' + LIM.name + ' caracteres');
    out.base = obj.base === undefined || obj.base === null ? null : obj.base; if (out.base !== null && (typeof out.base !== 'string' || !NAME.test(out.base))) throw new Error('base deve ser null ou o nome de um clipe .ifp (A-Z a-z 0-9 _ . -)');
    out.fps = obj.fps === undefined ? 30 : num(obj.fps, 'fps', LIM.fpsMin, LIM.fpsMax);
    if (obj.loop !== undefined && typeof obj.loop !== 'boolean') throw new Error('loop deve ser true/false'); out.loop = obj.loop === undefined ? true : obj.loop;
    if (!isObj(obj.bones)) throw new Error('"bones" deve ser um objeto { idDoOsso: {rot, pos?} }');
    const ids = Object.keys(obj.bones); if (!ids.length) throw new Error('o clipe não tem nenhum osso'); if (ids.length > LIM.bones) throw new Error('ossos demais (máximo ' + LIM.bones + ')');
    out.bones = {}; let maxT = 0;
    for (const id of ids) {
      if (!/^\d{1,4}$/.test(id)) throw new Error('id de osso inválido: "' + String(id).slice(0, 20) + '" (use o id numérico do IFP)');
      const b = obj.bones[id]; if (!isObj(b)) throw new Error('osso ' + id + ' deve ser um objeto');
      const o = { rot: track(b.rot, 4, 'bones.' + id + '.rot') }; maxT = Math.max(maxT, o.rot[o.rot.length - 1][0]);
      if (b.pos !== undefined && b.pos !== null) { o.pos = track(b.pos, 3, 'bones.' + id + '.pos', { max: LIM.posAbs }); maxT = Math.max(maxT, o.pos[o.pos.length - 1][0]); }
      out.bones[String(+id)] = o;
    }
    if (Object.keys(out.bones).length !== ids.length) throw new Error('ids de osso repetidos (ex.: "05" e "5")');
    const dur = obj.duration === undefined ? maxT : num(obj.duration, 'duration', 0.001, LIM.duration);
    if (dur < maxT - 1e-4) throw new Error('duration (' + dur + ') menor que o último quadro (' + maxT.toFixed(4) + ')'); out.duration = Math.max(dur, maxT); if (!(out.duration > 0)) throw new Error('duration deve ser maior que 0');
    out.ik = [];
    if (obj.ik !== undefined && obj.ik !== null) {
      if (!Array.isArray(obj.ik)) throw new Error('ik deve ser uma lista'); if (obj.ik.length > LIM.ik) throw new Error('ik: entradas demais (máximo ' + LIM.ik + ')');
      const seen = Object.create(null);
      obj.ik.forEach((e, i) => {
        const w = 'ik[' + i + ']'; if (!isObj(e)) throw new Error(w + ' deve ser um objeto');
        if (typeof e.chain !== 'string' || !hasOwn(CHAINS, e.chain)) throw new Error(w + '.chain inválido (use ' + Object.keys(CHAINS).join(', ') + ')'); if (seen[e.chain]) throw new Error(w + ': cadeia "' + e.chain + '" repetida'); seen[e.chain] = 1;
        const t = e.target; if (!isObj(t)) throw new Error(w + '.target deve ser um objeto'); if (!SPACES.includes(t.space)) throw new Error(w + '.target.space inválido (use ' + SPACES.join(', ') + ')');
        const T = { space: t.space };
        if (t.pos === undefined || t.pos === null) { if (t.space !== 'weapon') throw new Error(w + '.target.pos é obrigatório fora do espaço "weapon"'); T.pos = null; }
        else T.pos = vec(t.pos, 3, t.space === 'world' ? LIM.worldPos : LIM.ikPos, w + '.target.pos');
        if (t.rot !== undefined && t.rot !== null) T.rot = vec(t.rot, 3, 360, w + '.target.rot');
        if (t.space === 'bone') { if (!Number.isInteger(t.bone) || t.bone < 0 || t.bone > 9999) throw new Error(w + '.target.bone deve ser o id (inteiro) do osso de referência'); T.bone = t.bone; }
        const wt = e.weight === undefined ? [[0, 1]] : e.weight; if (!Array.isArray(wt) || !wt.length || wt.length > LIM.frames) throw new Error(w + '.weight deve ser [[t,peso],...] (até ' + LIM.frames + ')');
        let last = -1; const W = wt.map((f, k) => { if (!Array.isArray(f) || f.length !== 2) throw new Error(w + '.weight[' + k + '] deve ser [t, peso]'); const tt = num(f[0], w + '.weight[' + k + '].t', 0, LIM.duration), ww = num(f[1], w + '.weight[' + k + '].peso', 0, 1); if (tt <= last) throw new Error(w + '.weight: tempos devem ser estritamente crescentes'); last = tt; return [tt, ww]; });
        const o = { chain: e.chain, target: T, weight: W };
        if (e.hint !== undefined && e.hint !== null) { o.hint = vec(e.hint, 3, 100, w + '.hint'); if (!(Math.hypot(o.hint[0], o.hint[1], o.hint[2]) > 1e-6)) throw new Error(w + '.hint não pode ser zero'); } else o.hint = null;
        out.ik.push(o);
      });
    }
    out.events = [];
    if (obj.events !== undefined && obj.events !== null) {
      if (!Array.isArray(obj.events)) throw new Error('events deve ser uma lista'); if (obj.events.length > LIM.events) throw new Error('eventos demais (máximo ' + LIM.events + ')');
      obj.events.forEach((e, i) => { if (!isObj(e) || typeof e.name !== 'string' || !NAME.test(e.name)) throw new Error('events[' + i + '] deve ser {t, name} (name: A-Z a-z 0-9 _ . -)'); out.events.push({ t: num(e.t, 'events[' + i + '].t', 0, out.duration), name: e.name }); });
    }
    out.notes = obj.notes === undefined || obj.notes === null ? '' : obj.notes; if (typeof out.notes !== 'string' || out.notes.length > LIM.notes) throw new Error('notes deve ser texto de até ' + LIM.notes + ' caracteres');
    const avisos = []; if (SPEED_ID.test(out.id) && out.bones[0] && out.bones[0].pos) { const p = out.bones[0].pos, span = p[p.length - 1][0] - p[0][0]; if (span > 0) { const v = Math.hypot(p[p.length - 1][1] - p[0][1], p[p.length - 1][3] - p[0][3]) / span; if (v > SPEED_MAX) avisos.push('velocidade média da raiz de ' + v.toFixed(1) + ' m/s (acima de ' + SPEED_MAX + ' m/s: o jogo limita a ' + SPEED_MAX + ' m/s para não lançar NPCs)'); } }
    return { ok: true, erro: null, data: out, avisos };
  } catch (e) { return { ok: false, erro: e.message, data: null }; }
}
/* texto do arquivo: uma linha por quadro (diff do git legível e arquivo pequeno) */
function animStringify(data) { return JSON.stringify(data, null, 1).replace(/\[\n\s*(-?[\d.eE+-]+(?:,\n\s*-?[\d.eE+-]+)*)\n\s*\]/g, (m, inner) => '[' + inner.replace(/\s+/g, '') + ']') + '\n'; }      // só arrays PUROS de números (quebra de linha real: texto de string nunca tem)
  /* <<< VALIDADOR */

  const IK_CHAINS = CHAINS, EDIT = { byId: Object.create(null), rev: 0, ready: null, index: [] };
  const pack = { pack: '__edit', anims: Object.create(null) };
  ifpReady.__edit = pack;                                          // mesmo registro dos pacotes .ifp (quem lista ifpReady enxerga os editáveis)
  /* findClip: o editável (id em minúsculas) vence qualquer .ifp de mesmo nome, em qualquer ordem de carregamento dos pacotes */
  const baseFindClip = findClip;
  findClip = function (name) { const c = typeof name === 'string' ? pack.anims[name.toLowerCase()] : null; return c || baseFindClip(name); };

  /* ---------- JSON (espaço de osso do jogo) -> clipe no formato do parseIfp (espaço do GTA/IFP) ---------- */
  const _s = () => (typeof IFP_CONJ !== 'undefined' && IFP_CONJ) ? -1 : 1;
  function slerpA(a, b, k) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1; if (d < 0) { d = -d; s = -1; }
    let ka, kb; if (d > 0.9995) { ka = 1 - k; kb = k * s; } else { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - k) * th) / sn; kb = Math.sin(k * th) / sn * s; }
    const q = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb], l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }
  function sampleTr(tr, t, n) {
    let i = 0; while (i < tr.length - 1 && tr[i + 1][0] <= t) i++;
    const j = Math.min(i + 1, tr.length - 1), span = tr[j][0] - tr[i][0], k = span > 1e-9 ? Math.min(1, Math.max(0, (t - tr[i][0]) / span)) : 0, a = tr[i].slice(1), b = tr[j].slice(1);
    return n === 4 ? slerpA(a, b, k) : a.map((x, c) => x + (b[c] - x) * k);
  }
  function animEditBuild(d) {
    const s = _s(), nodes = [];
    for (const id in d.bones) {
      const b = d.bones[id], rot = b.rot, pos = b.pos || null; let times, sameT = true;
      if (pos) { sameT = rot.length === pos.length && rot.every((f, i) => Math.abs(f[0] - pos[i][0]) < 1e-7); }
      if (sameT) times = rot.map(f => f[0]);
      else { const u = Array.from(new Set(rot.map(f => f[0]).concat(pos.map(f => f[0])))).sort((x, y) => x - y); times = []; for (const t of u) if (!times.length || t - times[times.length - 1] > 1e-7) times.push(t); }
      const fc = times.length, tm = new Float32Array(fc), quats = new Float32Array(fc * 4), trans = pos ? new Float32Array(fc * 3) : null;
      for (let k = 0; k < fc; k++) {
        const t = times[k], q = sameT ? rot[k].slice(1) : sampleTr(rot, t, 4); tm[k] = t;
        quats[k * 4] = -q[0] * s; quats[k * 4 + 1] = q[2] * s; quats[k * 4 + 2] = q[1] * s; quats[k * 4 + 3] = q[3];      // inverso de ifpQuat: x=-gx*s, y=gz*s, z=gy*s
        if (pos) { const p = sameT ? pos[k].slice(1) : sampleTr(pos, t, 3); trans[k * 3] = -p[0]; trans[k * 3 + 1] = p[2]; trans[k * 3 + 2] = p[1]; }   // inverso de (-x, z, y)
      }
      nodes.push({ bone: +id, times: tm, quats, trans, frames: fc });
    }
    return { name: d.id, duration: d.duration, nodes, ok: true, edit: true, _eid: d.id, loop: d.loop, ik: d.ik, events: d.events, data: d };
  }
  /* clipe do formato parseIfp (ex.: findClip('WALK_player')) -> JSON editável, mantendo os quadros originais (mesma conversão da rota dup-anim, sem redução: > 600 quadros por osso falha — use a rota).
     -> { ok, erro, data } */
  function animEditFromClip(clip, id, opts) {
    opts = opts || {}; const s = _s(), r6 = x => Math.round(x * 1e6) / 1e6, r5 = x => Math.round(x * 1e5) / 1e5, bones = {};
    for (const n of clip.nodes) {
      if (!n.frames || n.bone < 0 || n.bone > 999) continue; const rot = [], pos = n.trans ? [] : null; let last = -1;
      for (let f = 0; f < n.frames; f++) {
        const t = n.times[f]; if (t <= last) continue; last = t; const x = n.quats[f * 4], y = n.quats[f * 4 + 1], z = n.quats[f * 4 + 2], w = n.quats[f * 4 + 3], l = Math.hypot(x, y, z, w) || 1;
        rot.push([r6(t), r6(-x * s / l), r6(z * s / l), r6(y * s / l), r6(w / l)]); if (pos) pos.push([r6(t), r5(-n.trans[f * 3]), r5(n.trans[f * 3 + 2]), r5(n.trans[f * 3 + 1])]);
      }
      bones[n.bone] = pos ? { rot, pos } : { rot };
    }
    return animValidate({ version: 1, id, name: opts.name || id, base: clip.name || null, fps: opts.fps || 30, duration: clip.duration, loop: opts.loop !== false, bones, ik: [], events: [], notes: opts.notes || ('Duplicado de ' + clip.name) });
  }
  /* valida, constrói e registra (ou substitui) um clipe editável. -> { ok, erro, clip } */
  function animEditSet(json) {
    const v = animValidate(json); if (!v.ok) return { ok: false, erro: v.erro, clip: null };
    const clip = animEditBuild(v.data), id = v.data.id; EDIT.byId[id] = clip; pack.anims[id] = clip;
    if (typeof clipSpeedCache !== 'undefined') delete clipSpeedCache[id];
    EDIT.rev++; return { ok: true, erro: null, clip };
  }
  function animEditRemove(id) { if (!EDIT.byId[id]) return false; delete EDIT.byId[id]; delete pack.anims[id]; if (typeof clipSpeedCache !== 'undefined') delete clipSpeedCache[id]; EDIT.rev++; return true; }
  function animEditList() { return Object.keys(EDIT.byId).sort().map(id => { const d = EDIT.byId[id].data; return { id, name: d.name, base: d.base, duration: d.duration }; }); }
  function animEditExport(id) { const c = EDIT.byId[id]; return c ? JSON.parse(JSON.stringify(c.data)) : null; }
  /* nomes dos eventos cujo tempo cai em (t0, t1]; se t1 < t0 (voltou ao início do loop), em (t0, duração] e [0, t1] */
  function animEditEvents(clip, t0, t1) {
    const ev = clip && clip.events; if (!ev || !ev.length) return []; const wrap = t1 < t0;
    return ev.filter(e => wrap ? (e.t > t0 || e.t <= t1) : (e.t > t0 && e.t <= t1)).map(e => e.name);
  }
  /* carga: data/anims/index.json -> um fetch por clipe. Qualquer falha = lista vazia (o jogo segue normal) */
  function animEditReload() {
    const get = u => (typeof fetch === 'function' ? fetch(u, { cache: 'no-store' }) : Promise.reject(new Error('sem fetch'))).then(r => r.ok ? r.json() : null);
    return EDIT.ready = get('data/anims/index.json').then(async j => {
      if (!j) return EDIT.index;                                  // índice ausente/erro de rede: mantém os clipes vivos (não apaga nada)
      const ids = (j && Array.isArray(j.clips) ? j.clips : []).map(c => c && c.id).filter(id => typeof id === 'string' && /^[a-z0-9_-]{1,64}$/.test(id)).slice(0, 500);
      for (const id of Object.keys(EDIT.byId)) if (!ids.includes(id)) animEditRemove(id);
      await Promise.all(ids.map(id => get('data/anims/' + id + '.json').then(d => { if (d) { const r = animEditSet(d); if (!r.ok) console.warn('data/anims/' + id + '.json ignorado:', r.erro); } }).catch(() => { })));
      EDIT.index = animEditList(); return EDIT.index;
    }).catch(() => EDIT.index);
  }

  /* ---------- IK de dois ossos por clipe ----------
     Mesma matemática de leftHandIK (player-model.js), parametrizada pela cadeia (ombro-cotovelo-mão ou coxa-joelho-pé) e pelo alvo. */
  const _V = () => new THREE.Vector3(), _Q = () => new THREE.Quaternion();
  const vS = _V(), vE = _V(), vW = _V(), vT = _V(), vU = _V(), vP = _V(), vE2 = _V(), vA = _V(), vB = _V(), qD = _Q(), qP = _Q(), qS = _Q(), qT = _Q(), qR = _Q(), mW = new THREE.Matrix4(), one3 = new THREE.Vector3(1, 1, 1), eul = new THREE.Euler(), sv = [_Q(), _Q(), _Q()], vSc = _V(), vPos = _V();
  function rotWorld(bone, q) { bone.parent.getWorldQuaternion(qP); bone.quaternion.premultiply(qT.copy(qP).invert().multiply(q).multiply(qP)); }
  function weightAt(w, t) {
    if (t <= w[0][0]) return w[0][1]; const n = w.length; if (t >= w[n - 1][0]) return w[n - 1][1];
    let i = 0; while (i < n - 1 && w[i + 1][0] <= t) i++; const k = (t - w[i][0]) / (w[i + 1][0] - w[i][0]); return w[i][1] + (w[i + 1][1] - w[i][1]) * k;
  }
  /* alvo no mundo: preenche vT (posição) e qS (orientação do espaço do alvo). false = não dá para resolver agora (sem arma, osso inexistente...) */
  function resolveTarget(a, e, ctx) {
    const T = e.target; vT.set(0, 0, 0); qS.set(0, 0, 0, 1);
    if (T.space === 'weapon') {
      let M = ctx.weaponMatrix, p = T.pos || ctx.lhand || null;
      if (!M && typeof weapons !== 'undefined' && weapons.mesh) { const rh = a.bones[a.index.rhand]; if (!rh || weapons.mesh.parent !== rh) return false; M = mW.compose(weapons.mesh.position, weapons.mesh.quaternion, one3).premultiply(rh.matrixWorld); }
      if (!M) return false;
      if (!p && e.chain === 'lhand' && typeof weapons !== 'undefined' && weapons.selected >= 0 && typeof wAnim === 'function') { const A = wAnim(weapons.items[weapons.selected]); p = A && A.lhand; }      // ponto "lhand" da arma (inclui data/sockets.json)
      if (!p) return false;
      vT.set(p[0], p[1], p[2]).applyMatrix4(M); M.decompose(vPos, qS, vSc); return true;
    }
    if (T.space === 'bone') {
      const i = a.ap && a.ap.idToIdx ? a.ap.idToIdx[T.bone] : a.info.findIndex(b => b.id === T.bone); if (i === undefined || i < 0 || !a.bones[i]) return false;
      const b = a.bones[i]; vT.set(T.pos[0], T.pos[1], T.pos[2]).applyMatrix4(b.matrixWorld); b.getWorldQuaternion(qS); return true;
    }
    if (T.space === 'actor') { vT.set(T.pos[0], T.pos[1], T.pos[2]).applyMatrix4(a.group.matrixWorld); a.group.getWorldQuaternion(qS); return true; }
    vT.set(T.pos[0], T.pos[1], T.pos[2]); return true;                                                 // world
  }
  /* aplica as entradas ik do clipe na pose atual do ator (depois de AnimPlayer.update). time = tempo (já dentro do loop) do clipe.
     ctx opcional: { weaponMatrix: Matrix4 do mundo da arma (escala 1), lhand: [x,y,z] no espaço da arma, only: 'lhand'|... }. Devolve [{chain, weight, err}] (err = distância mão/pé-alvo em metros, depois do IK) */
  function animIkApply(a, clip, time, ctx) {
    const list = clip && clip.ik, out = []; if (!list || !list.length || !a || !a.bones || !a.group) return out; ctx = ctx || {};
    a.group.updateMatrixWorld(true);
    for (const e of list) {
      if (ctx.only && ctx.only !== e.chain) continue;
      const w = weightAt(e.weight, time); if (w <= 0.001) continue;
      const nm = IK_CHAINS[e.chain], b1 = a.bones[a.index[nm[0]]], b2 = a.bones[a.index[nm[1]]], b3 = a.bones[a.index[nm[2]]]; if (!b1 || !b2 || !b3) continue;
      if (!resolveTarget(a, e, ctx)) continue;
      sv[0].copy(b1.quaternion); sv[1].copy(b2.quaternion); sv[2].copy(b3.quaternion);
      vS.setFromMatrixPosition(b1.matrixWorld); vE.setFromMatrixPosition(b2.matrixWorld); vW.setFromMatrixPosition(b3.matrixWorld);
      const L1 = vE.distanceTo(vS), L2 = vW.distanceTo(vE); vU.copy(vT).sub(vS); let d = vU.length();
      if (d > 1e-4) {
        vU.divideScalar(d); d = Math.min(Math.max(d, Math.abs(L1 - L2) + 0.02), L1 + L2 - 0.005);
        if (e.hint) { a.group.getWorldQuaternion(qD); vP.set(e.hint[0], e.hint[1], e.hint[2]).applyQuaternion(qD); } else vP.copy(vE).sub(vS);   // cotovelo/joelho: dica explícita, ou continua para o lado em que a animação o deixou
        vP.addScaledVector(vU, -vP.dot(vU)); if (vP.lengthSq() < 1e-6) vP.set(0, -1, 0); vP.normalize();
        const ax = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - ax * ax));
        vE2.copy(vS).addScaledVector(vU, ax).addScaledVector(vP, hh);
        qR.setFromUnitVectors(vA.copy(vE).sub(vS).normalize(), vB.copy(vE2).sub(vS).normalize()); rotWorld(b1, qR);
        a.group.updateMatrixWorld(true); vE.setFromMatrixPosition(b2.matrixWorld); vW.setFromMatrixPosition(b3.matrixWorld);
        qR.setFromUnitVectors(vA.copy(vW).sub(vE).normalize(), vB.copy(vT).sub(vE).normalize()); rotWorld(b2, qR);
      }
      if (e.target.rot) {                                                                              // orientação da mão/pé: espaço do alvo * Euler(graus, XYZ)
        a.group.updateMatrixWorld(true); const k = Math.PI / 180; qR.copy(qS).multiply(qD.setFromEuler(eul.set(e.target.rot[0] * k, e.target.rot[1] * k, e.target.rot[2] * k, 'XYZ')));
        b3.parent.getWorldQuaternion(qP); b3.quaternion.copy(qP.invert().multiply(qR));
      }
      if (w < 0.999) for (let i = 0; i < 3; i++) { const b = i === 0 ? b1 : i === 1 ? b2 : b3; qT.copy(b.quaternion); b.quaternion.copy(sv[i]).slerp(qT, w); }
      a.group.updateMatrixWorld(true); vW.setFromMatrixPosition(b3.matrixWorld); out.push({ chain: e.chain, weight: w, err: vW.distanceTo(vT) });
    }
    return out;
  }
  /* refaz o IK com o último clipe/tempo guardado pelo gancho: chamar DEPOIS de tudo que mexe nos braços/pernas no quadro (alignWeaponArm, leftHandIK...) */
  function animIkFinal(a, ctx) { const L = a && a._ikLast; return L ? animIkApply(a, L.clip, L.t, ctx || { final: true }) : []; }

  /* gancho no laço do ator: AnimPlayer.update = pose do clipe + (se o clipe tem ik) animIkApply. Também troca o clipe em reprodução quando um editável o substitui/é removido (edição ao vivo). */
  const baseUpdate = AnimPlayer.prototype.update;
  AnimPlayer.prototype.update = function (dt) {
    if (this._editRev !== EDIT.rev) {
      this._editRev = EDIT.rev;
      if (this.cur && this.name) { const c = findClip(this.name); if (c && c !== this.cur && (c._eid || this.cur._eid)) this.cur = c; }
      if (this.prev && this.prev._eid) { const c = EDIT.byId[this.prev._eid]; if (c) this.prev = c; else this.prev = null; }
    }
    baseUpdate.call(this, dt);
    const cl = this.cur;
    if (cl && cl.ik && cl.ik.length) { const t = this.wrapT(cl, this.time); this.a._ikLast = { clip: cl, t }; animIkApply(this.a, cl, t); }
    else if (this.a._ikLast) this.a._ikLast = null;
  };
  AnimPlayer.prototype.update._editHook = true;

  globalThis.ANIM_EDIT = EDIT; globalThis.animValidate = animValidate; globalThis.animStringify = animStringify; globalThis.ANIM_BONE_NAMES = BONE_NAMES;
  globalThis.animEditBuild = animEditBuild; globalThis.animEditFromClip = animEditFromClip; globalThis.animEditSet = animEditSet; globalThis.animEditRemove = animEditRemove; globalThis.animEditList = animEditList; globalThis.animEditExport = animEditExport;
  globalThis.animEditEvents = animEditEvents; globalThis.animEditReload = animEditReload; globalThis.animIkApply = animIkApply; globalThis.animIkFinal = animIkFinal;
  animEditReload();
})();
