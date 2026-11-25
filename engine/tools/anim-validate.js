// NEON ENGINE — validação do clipe de animação editável (data/anims/<id>.json). Mesmas regras de js/entities/anim-edit.js do jogo.
// Formato e convenções: engine/docs/animacao.md. Quaternios e posições ficam no espaço de OSSO DO JOGO (o que AnimPlayer grava em bone.quaternion / bone.position).
'use strict';
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
module.exports = { animValidate, animStringify, LIM, ID, RESERVED, CHAINS, SPACES, BONE_NAMES };
