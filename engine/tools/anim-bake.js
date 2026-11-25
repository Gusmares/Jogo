// NEON ENGINE — leitura dos .ifp (ANP3) do projeto e "bake" para o JSON editável (data/anims/<id>.json). Sem dependências (nem three.js).
// Convenção (igual a js/entities/anim.js com IFP_CONJ=false): quaternio do IFP (x,y,z,w) -> osso do jogo (-x, z, y, w); translação (x,y,z) -> (-x, z, y).
'use strict';
const fs = require('fs'), path = require('path');
const { animValidate, animStringify, LIM } = require('./anim-validate.js');

/* mesmo parser de parseIfp (js/entities/anim.js), em Node. Devolve { pack, anims:{ nomeMinusculo: {name, duration, nodes:[{bone, times, quats, trans, frames}]} } } */
function parseIfp(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n && u8[o + i]; i++) s += String.fromCharCode(u8[o + i]); return s; };
  if (str(0, 4) !== 'ANP3') throw new Error('arquivo IFP não é ANP3');
  const count = dv.getInt32(32, true), anims = Object.create(null); let p = 36;
  for (let a = 0; a < count; a++) {
    const name = str(p, 24); p += 24; const numNodes = dv.getInt32(p, true); p += 12; const nodes = []; let duration = 0;
    for (let k = 0; k < numNodes; k++) {
      p += 24; const type = dv.getInt32(p, true), fc = dv.getInt32(p + 4, true), bone = dv.getInt32(p + 8, true); p += 12;
      const times = new Float32Array(fc), quats = new Float32Array(fc * 4), trans = type === 4 ? new Float32Array(fc * 3) : null;
      for (let f = 0; f < fc; f++) {
        for (let c = 0; c < 4; c++) quats[f * 4 + c] = dv.getInt16(p + c * 2, true) / 4096;
        times[f] = dv.getUint16(p + 8, true) / 60; p += 10;
        if (trans) { for (let c = 0; c < 3; c++) trans[f * 3 + c] = dv.getInt16(p + c * 2, true) / 1024; p += 6; }
      }
      if (fc) duration = Math.max(duration, times[fc - 1]);
      nodes.push({ bone, times, quats, trans, frames: fc });
    }
    anims[name.toLowerCase()] = { name, duration, nodes };
  }
  return { anims };
}
/* pacotes em <root>/assets/anims/*.ifp, com cache por data de modificação. Ordem: ped.ifp primeiro, depois alfabética (como o jogo procura um nome repetido) */
const cache = new Map();
function packs(root) {
  const dir = path.join(root, 'assets', 'anims'); if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => /^[\w.-]+\.ifp$/i.test(f)).sort((a, b) => (a === 'ped.ifp' ? -1 : b === 'ped.ifp' ? 1 : a.localeCompare(b)));
  const out = [];
  for (const f of files) {
    const file = path.join(dir, f), st = fs.statSync(file), c = cache.get(file);
    if (c && c.mtime === st.mtimeMs && c.size === st.size) { out.push({ id: f.replace(/\.ifp$/i, ''), anims: c.p.anims }); continue; }
    try { const p = parseIfp(fs.readFileSync(file)); cache.set(file, { mtime: st.mtimeMs, size: st.size, p }); out.push({ id: f.replace(/\.ifp$/i, ''), anims: p.anims }); } catch (e) { /* arquivo que não é ANP3: ignora */ }
  }
  return out;
}
const validNode = n => n.frames > 0 && n.bone >= 0 && n.bone <= 999;      // nós sem osso de personagem (id -1/lixo: portas, aviões) não são usados pelo AnimPlayer
function listClips(root) {
  const out = [];
  for (const pk of packs(root)) for (const k in pk.anims) { const c = pk.anims[k]; out.push({ name: c.name, pack: pk.id, duration: +c.duration.toFixed(4), bones: c.nodes.filter(validNode).length, maxFrames: c.nodes.reduce((m, n) => Math.max(m, n.frames), 0) }); }
  return out;
}
function findIfp(root, name, pack) {
  const key = String(name).toLowerCase();
  for (const pk of packs(root)) { if (pack && pk.id !== pack) continue; const c = Object.prototype.hasOwnProperty.call(pk.anims, key) ? pk.anims[key] : null; if (c) return { clip: c, pack: pk.id }; }
  return null;
}

/* ---- amostragem (no espaço do osso do jogo) ---- */
function slerp(a, b, k) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1; if (d < 0) { d = -d; s = -1; }
  let ka, kb; if (d > 0.9995) { ka = 1 - k; kb = k * s; } else { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - k) * th) / sn; kb = Math.sin(k * th) / sn * s; }
  const q = [0, 1, 2, 3].map(i => a[i] * ka + b[i] * kb), l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map(x => x / l);
}
function sampleTrack(tr, t, n) {                                  // tr = [[t, v...], ...]; devolve n valores
  let i = 0; while (i < tr.length - 1 && tr[i + 1][0] <= t) i++;
  const j = Math.min(i + 1, tr.length - 1), span = tr[j][0] - tr[i][0], k = span > 1e-9 ? Math.min(1, Math.max(0, (t - tr[i][0]) / span)) : 0;
  const a = tr[i].slice(1), b = tr[j].slice(1); if (n === 4) return slerp(a, b, k); return a.map((x, c) => x + (b[c] - x) * k);
}
/* reduz uma trilha com mais de LIM.frames quadros tirando os quadros que a interpolação dos vizinhos reproduz dentro de uma tolerância (graus no quaternio, metros na posição);
   a tolerância sobe aos poucos, só nessa trilha, até caber. Devolve { tr, tol } */
function reduceTrack(tr, n, max) {
  const dev = (a, b, k, o) => { if (n === 4) { const v = slerp(a, b, k), d = Math.abs(v[0] * o[0] + v[1] * o[1] + v[2] * o[2] + v[3] * o[3]) / (Math.hypot(o[0], o[1], o[2], o[3]) || 1); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; } return Math.hypot(a[0] + (b[0] - a[0]) * k - o[0], a[1] + (b[1] - a[1]) * k - o[1], a[2] + (b[2] - a[2]) * k - o[2]); };
  for (let tol = n === 4 ? 0.05 : 0.0005, guard = 0; guard < 40; tol *= 1.4, guard++) {
    const keep = new Uint8Array(tr.length); keep[0] = keep[tr.length - 1] = 1; const st = [[0, tr.length - 1]];
    while (st.length) {
      const [i, j] = st.pop(); if (j - i < 2) continue; let worst = -1, wk = 0; const a = tr[i].slice(1), b = tr[j].slice(1), span = tr[j][0] - tr[i][0];
      for (let k = i + 1; k < j; k++) { const e = dev(a, b, (tr[k][0] - tr[i][0]) / span, tr[k].slice(1)); if (e > worst) { worst = e; wk = k; } }
      if (worst > tol) { keep[wk] = 1; st.push([i, wk], [wk, j]); }
    }
    const out = tr.filter((_, i) => keep[i]); if (out.length <= max) return { tr: out, tol };
  }
  throw new Error('não foi possível reduzir a trilha para ' + max + ' quadros');
}
const r5 = x => Math.round(x * 1e5) / 1e5, r6 = x => Math.round(x * 1e6) / 1e6;
/* clipe parseado do IFP -> JSON editável. opts: { id, name, fps=30, resample=false }. Mantém os quadros originais; se algum osso passar de LIM.frames, reamostra no fps (e reduz o fps até caber) */
function bakeIfp(ifp, opts) {
  opts = opts || {}; let stats = { rotTol: 0, posTol: 0 }; const fps0 = opts.fps || 30, mk = (resample, fps) => {
    const bones = {}, dur = ifp.duration; stats = { rotTol: 0, posTol: 0 };
    for (const n of ifp.nodes) {
      if (!validNode(n)) continue;           // alguns .ifp têm nós sem osso (id -1 ou lixo): o jogo já os ignora
      let rot = [], pos = n.trans ? [] : null, last = -1;
      for (let f = 0; f < n.frames; f++) {
        const t = n.times[f]; if (t <= last) continue; last = t;           // tempos repetidos no IFP: fica o primeiro
        const x = n.quats[f * 4], y = n.quats[f * 4 + 1], z = n.quats[f * 4 + 2], w = n.quats[f * 4 + 3], l = Math.hypot(x, y, z, w) || 1;
        rot.push([t, -x / l, z / l, y / l, w / l]); if (pos) pos.push([t, -n.trans[f * 3], n.trans[f * 3 + 2], n.trans[f * 3 + 1]]);
      }
      let reducedTol = 0;
      if (!resample) { if (rot.length > LIM.frames) { const x = reduceTrack(rot, 4, LIM.frames); rot = x.tr; reducedTol = Math.max(reducedTol, x.tol); } if (pos && pos.length > LIM.frames) { const x = reduceTrack(pos, 3, LIM.frames); pos = x.tr; stats.posTol = Math.max(stats.posTol, x.tol); } stats.rotTol = Math.max(stats.rotTol, reducedTol); }
      if (resample && rot.length > 1) {
        const steps = Math.max(1, Math.ceil(dur * fps - 1e-9)), rr = [], pp = pos ? [] : null;
        for (let s = 0; s <= steps; s++) { const t = Math.min(dur, s / fps); if (rr.length && t <= rr[rr.length - 1][0] + 1e-9) continue; rr.push([t].concat(sampleTrack(rot, t, 4))); if (pp) pp.push([t].concat(sampleTrack(pos, t, 3))); }
        rot = rr; pos = pp;
      }
      bones[n.bone] = { rot: rot.map(f => [r6(f[0]), r6(f[1]), r6(f[2]), r6(f[3]), r6(f[4])]) };
      if (pos) bones[n.bone].pos = pos.map(f => [r6(f[0]), r5(f[1]), r5(f[2]), r5(f[3])]);
    }
    return { version: 1, id: opts.id, name: opts.name || opts.id, base: ifp.name, fps, duration: r6(dur), loop: opts.loop === undefined ? true : opts.loop, bones, ik: [], events: [], notes: opts.notes || ('Duplicado de ' + ifp.name) };
  };
  if (!ifp.nodes.some(validNode)) throw new Error('clipe sem ossos de personagem (animação de porta/objeto): não dá para editar');
  const maxF = ifp.nodes.reduce((m, n) => Math.max(m, n.frames), 0);
  let resample = !!opts.resample, fps = fps0, tries = 0;
  for (;;) {
    const data = mk(resample, fps), v = animValidate(data);
    if (v.ok && Buffer.byteLength(animStringify(v.data)) <= LIM.bytes) return { data: v.data, resampled: resample, fps, reduced: !resample && stats.rotTol > 0, maxErrDeg: stats.rotTol || undefined };
    if (!resample) { resample = true; continue; }
    if (fps <= 5 || ++tries > 8) throw new Error(v.ok ? 'clipe grande demais para o limite de ' + (LIM.bytes >> 20) + ' MB' : 'bake inválido: ' + v.erro);
    fps = Math.max(5, Math.floor(fps * 0.8));
  }
}
module.exports = { parseIfp, packs, listClips, findIfp, bakeIfp, sampleTrack, slerp };
