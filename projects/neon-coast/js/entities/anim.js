/* NEON COAST — Animações reais do GTA San Andreas (arquivos .ifp, formato ANP3): leitor, amostragem e aplicação nos ossos */
'use strict';

/* ---------- leitura do ANP3 ----------
   Cabeçalho: 'ANP3', tamanho, nome do pacote[24], nº de animações.
   Animação: nome[24], nº de nós, bytes de quadros, desconhecido. Nó (osso): nome[24], tipo (3 = rotação, 4 = rotação + translação),
   nº de quadros, id do osso. Quadro: quaternion int16×4 (/4096), tempo int16 (/60 s) e, no tipo 4, translação int16×3 (/1024). */
function parseIfp(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n && u8[o + i]; i++) s += String.fromCharCode(u8[o + i]); return s; };
  if (str(0, 4) !== 'ANP3') throw new Error('arquivo IFP não é ANP3');
  const pack = str(8, 24), count = dv.getInt32(32, true), anims = Object.create(null); let p = 36;
  for (let a = 0; a < count; a++) {
    const name = str(p, 24); p += 24;
    const numNodes = dv.getInt32(p, true), dataSize = dv.getInt32(p + 4, true); p += 12;
    const nodes = []; let duration = 0, bytes = 0;
    for (let k = 0; k < numNodes; k++) {
      p += 24;                                   // nome do osso (usamos o id)
      const type = dv.getInt32(p, true), fc = dv.getInt32(p + 4, true), bone = dv.getInt32(p + 8, true); p += 12;
      const times = new Float32Array(fc), quats = new Float32Array(fc * 4), trans = type === 4 ? new Float32Array(fc * 3) : null;
      for (let f = 0; f < fc; f++) {
        quats[f * 4] = dv.getInt16(p, true) / 4096; quats[f * 4 + 1] = dv.getInt16(p + 2, true) / 4096; quats[f * 4 + 2] = dv.getInt16(p + 4, true) / 4096; quats[f * 4 + 3] = dv.getInt16(p + 6, true) / 4096;
        times[f] = dv.getUint16(p + 8, true) / 60; p += 10; bytes += 10;
        if (trans) { trans[f * 3] = dv.getInt16(p, true) / 1024; trans[f * 3 + 1] = dv.getInt16(p + 2, true) / 1024; trans[f * 3 + 2] = dv.getInt16(p + 4, true) / 1024; p += 6; bytes += 6; }
      }
      if (fc) duration = Math.max(duration, times[fc - 1]);
      nodes.push({ bone, times, quats, trans, frames: fc });
    }
    anims[name.toLowerCase()] = { name, duration, nodes, ok: bytes === dataSize };
  }
  return { pack, anims };
}
const ifpPacks = {};
async function loadIfp(id, url) {
  if (!ifpPacks[id]) ifpPacks[id] = fetch(url).then(r => r.arrayBuffer()).then(parseIfp).catch(e => { console.warn('IFP', id, e); return { pack: id, anims: {} }; });
  return ifpPacks[id];
}
function findClip(name) {                    // procura o clipe pelo nome em todos os pacotes já carregados
  const key = name.toLowerCase();
  for (const id in ifpReady) { const c = ifpReady[id].anims[key]; if (c) return c; }
  return null;
}
const ifpReady = {};
/* velocidade natural de um clipe de locomoção: quanto a raiz anda por segundo na própria animação (o SA usa esse valor para casar
   passo e deslocamento). Tocar o clipe na razão velocidade real / natural tira o "pé deslizando". */
const clipSpeedCache = Object.create(null), CLIP_SPEED_MAX = 15;      // teto (m/s) para clipes editáveis: um clipe com a raiz mal gravada não pode lançar NPCs (ped-ai/npcs usam clipSpeed como velocidade)
function clipSpeed(name) {
  const k = name.toLowerCase(); if (k in clipSpeedCache) return clipSpeedCache[k];
  const c = findClip(name); if (!c) return 0;
  let v = 0; const r = c.nodes.find(n => n.bone === 0 && n.trans && n.frames > 1);
  if (r) { const f = r.frames - 1, span = r.times[f] - r.times[0]; if (span > 0) v = Math.hypot(r.trans[f * 3] - r.trans[0], r.trans[f * 3 + 1] - r.trans[1]) / span; }
  if (c._eid && v > CLIP_SPEED_MAX) v = CLIP_SPEED_MAX;
  return clipSpeedCache[k] = v;
}
/* deslocamento da raiz do clipe no tempo t, nos eixos do GTA (x direita, y frente, z cima). Os clipes de carro (puxar, ser puxado, entrar)
   são gravados a partir do ponto da porta, então esse caminho leva o corpo do banco ao chão exatamente como no jogo original. */
function clipRootAt(name, t, out) {
  out = out || [0, 0, 0]; out[0] = out[1] = out[2] = 0;
  const c = findClip(name); if (!c) return out;
  const r = c.nodes.find(n => n.bone === 0 && n.trans); if (!r) return out;
  const ts = r.times, n = r.frames; t = clamp(t, 0, ts[n - 1]);
  let i = 0; while (i < n - 1 && ts[i + 1] <= t) i++;
  const j = Math.min(i + 1, n - 1), span = ts[j] - ts[i], k = span > 1e-6 ? clamp((t - ts[i]) / span, 0, 1) : 0;
  for (let q = 0; q < 3; q++) out[q] = lerp(r.trans[i * 3 + q], r.trans[j * 3 + q], k);
  return out;
}

/* ---------- amostragem ---------- */
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _aq1 = new THREE.Quaternion(), _aq2 = new THREE.Quaternion();
function sampleNode(node, t, out) {
  const n = node.frames, ts = node.times;
  let i = 0; while (i < n - 1 && ts[i + 1] <= t) i++;
  const j = Math.min(i + 1, n - 1), span = ts[j] - ts[i], k = span > 1e-6 ? clamp((t - ts[i]) / span, 0, 1) : 0;
  _qa.set(node.quats[i * 4], node.quats[i * 4 + 1], node.quats[i * 4 + 2], node.quats[i * 4 + 3]);
  _qb.set(node.quats[j * 4], node.quats[j * 4 + 1], node.quats[j * 4 + 2], node.quats[j * 4 + 3]);
  if (_qa.dot(_qb) < 0) { _qb.x = -_qb.x; _qb.y = -_qb.y; _qb.z = -_qb.z; _qb.w = -_qb.w; }
  out.q.copy(_qa).slerp(_qb, k);
  if (node.trans) { out.t = out.t || [0, 0, 0]; for (let c = 0; c < 3; c++) out.t[c] = lerp(node.trans[i * 3 + c], node.trans[j * 3 + c], k); } else out.t = null;
}

/* ---------- conversão do espaço do GTA para o do jogo ----------
   Eixos do GTA (x direita, y frente, z cima) -> (x esquerda, y cima, z frente): v' = (-x, z, y). Uma rotação em torno do eixo (x,y,z)
   passa a ser em torno de (-x, z, y), com o mesmo ângulo. */
const IFP_CONJ = false;    // convenção validada por tools/test-ifp-pose.js: sem conjugar, o corpo fica em pé
function ifpQuat(q, out) {
  const s = IFP_CONJ ? -1 : 1;
  return out.set(-q.x * s, q.z * s, q.y * s, q.w);
}

/* ---------- player de animação para um ator (esqueleto) ---------- */
class AnimPlayer {
  constructor(actor) {
    this.a = actor; this.cur = null; this.prev = null; this.time = 0; this.prevTime = 0; this.fade = 1; this.fadeT = 0.2; this.loop = true; this.name = '';
    this.idToIdx = {}; actor.info.forEach((b, i) => { this.idToIdx[b.id] = i; });
    this.restQ = actor.bones.map(b => b.quaternion.clone()); this.restP = actor.bones.map(b => b.position.clone());
    this._s = { q: new THREE.Quaternion(), t: null }; this._p = { q: new THREE.Quaternion(), t: null };
  }
  play(name, opts) {
    opts = opts || {};
    if (name === this.name && !opts.restart) return true;
    const clip = findClip(name); if (!clip) return false;
    let start = opts.start || 0;
    // sincronia de passo (como o "move group" do SA): andar -> correr -> disparar começa na mesma fase do ciclo, o pé não troca no meio
    if (opts.sync && this.cur && this.loop && this.cur.duration > 0 && clip.duration > 0) start = (this.time % this.cur.duration) / this.cur.duration * clip.duration;
    this.prev = this.cur; this.prevTime = this.time; this.cur = clip; this.time = start; this.fade = 0; this.fadeT = opts.fade === undefined ? 0.2 : opts.fade;
    this.loop = opts.loop !== false; this.name = name; this.speed = opts.speed || 1; return true;
  }
  wrapT(clip, t) { return clip.duration > 0 ? (this.loop ? t % clip.duration : Math.min(t, clip.duration)) : 0; }
  update(dt) {
    if (!this.cur) return;
    const adv = dt * (this.speed || 1);
    this.time += adv; this.prevTime += adv;
    this.fade = this.fadeT > 0 ? Math.min(1, this.fade + dt / this.fadeT) : 1;
    const a = this.a, cur = this.cur, prev = this.prev, tc = this.wrapT(cur, this.time), blend = prev && this.fade < 1, tp = blend ? this.wrapT(prev, this.prevTime) : 0, s = this._s, p = this._p;
    if (blend && !prev._map) { prev._map = {}; for (const n of prev.nodes) prev._map[n.bone] = n; }       // índice osso -> nó (evita busca linear por osso a cada quadro)
    for (const node of cur.nodes) {
      const i = this.idToIdx[node.bone]; if (i === undefined) continue;
      sampleNode(node, tc, s); ifpQuat(s.q, _aq1);
      let hasT = !!s.t, tx = 0, ty = 0, tz = 0; if (hasT) { tx = -s.t[0]; ty = s.t[2]; tz = s.t[1]; }
      if (blend) {                                                       // mistura com o clipe anterior
        const pn = prev._map[node.bone];
        if (pn) {
          sampleNode(pn, tp, p); ifpQuat(p.q, _aq2); _aq2.slerp(_aq1, this.fade); _aq1.copy(_aq2);
          if (hasT && p.t) { const f = this.fade; tx = lerp(-p.t[0], tx, f); ty = lerp(p.t[2], ty, f); tz = lerp(p.t[1], tz, f); }
        }
      }
      const bone = a.bones[i]; bone.quaternion.copy(_aq1);
      if (hasT && node.bone !== 0) bone.position.set(tx, ty, tz);       // o osso raiz (id 0) carrega deslocamento do movimento: ignorado
    }
    // camada extra (ex.: braços no volante por cima da pose sentada): só os ossos escolhidos, sem mistura
    if (this.overlay) {
      const ov = this.overlay, clip = findClip(ov.name); if (!clip) return;
      const t0 = ov.time === undefined ? (clip.duration > 0 ? (this.time % clip.duration) : 0) : ov.time;
      for (const node of clip.nodes) {
        if (!ov.ids.has(node.bone)) continue;
        const i = this.idToIdx[node.bone]; if (i === undefined) continue;
        sampleNode(node, t0, s); ifpQuat(s.q, _aq1); a.bones[i].quaternion.copy(_aq1);
      }
    }
  }
  setOverlay(name, ids) { this.overlay = name ? { name, ids: new Set(ids) } : null; }
}
const ARM_BONE_IDS = [21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36];
/* tronco inteiro (coluna, pescoço, cabeça e braços): usado para segurar a arma com a mesma pose da mira enquanto as pernas andam */
const UPPER_BONE_IDS = [2, 3, 4, 5, 201, 301, 302].concat(ARM_BONE_IDS);
