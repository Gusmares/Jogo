/* NEON COAST — Sockets e anexos de arma: dados editáveis por arma e por animação (data/sockets.json).
   Formato: { version:1, weapons:{ <id>:{ grip:{pos,rot}, lhand:[x,y,z]|null, muzzle:número|null, byAnim:{ <clipe>:{pos,rot} } } } }
   pos em metros, rot em GRAUS (Euler XYZ): DELTA em cima da empunhadura calibrada (espaço do osso da mão direita). Delta 0 / ausente = comportamento antigo.
   Posição da malha = grip.pos + delta.pos; rotação = gripQuat(calibrado) * Euler(delta.rot) (no eixo da própria arma). byAnim[clipe] SUBSTITUI o grip (não soma); chaves de byAnim em minúsculas (a validação normaliza).
   Carregar depois de weapons.js. Sem arquivo ou com arquivo inválido: tudo vazio, o jogo segue normal. */
'use strict';
var SOCKETS = { data: { version: 1, weapons: {} }, rev: 0, ready: null };
(function () {
  const LIM = { weapons: 200, clips: 100, name: 64, pos: 2, rot: 360, muzzle: 5 }, NAME = /^[A-Za-z0-9_.-]+$/, RESERVED = ['__proto__', 'constructor', 'prototype'];       // mesmas regras de engine/tools/sockets-validate.js
  const okName = s => typeof s === 'string' && s.length >= 1 && s.length <= LIM.name && NAME.test(s) && !RESERVED.includes(s.toLowerCase()), isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function vec(v, max, what) {
    if (!Array.isArray(v) || v.length !== 3) throw new Error(what + ' deve ter 3 números');
    for (const n of v) { if (typeof n !== 'number' || !isFinite(n)) throw new Error(what + ' tem valor que não é número finito'); if (Math.abs(n) > max) throw new Error(what + ' fora do limite (máximo ' + max + ')'); }
    return [v[0], v[1], v[2]];
  }
  function xform(t, what) { if (!isObj(t)) throw new Error(what + ' deve ser um objeto {pos, rot}'); return { pos: t.pos === undefined ? [0, 0, 0] : vec(t.pos, LIM.pos, what + '.pos'), rot: t.rot === undefined ? [0, 0, 0] : vec(t.rot, LIM.rot, what + '.rot') }; }
  /* -> { ok, erro, data } (data = cópia normalizada) */
  globalThis.socketsValidate = function (obj) {
    try {
      if (!isObj(obj)) throw new Error('o conteúdo deve ser um objeto');
      if (obj.version !== 1) throw new Error('versão não suportada (esperado version: 1)');
      if (!isObj(obj.weapons)) throw new Error('"weapons" deve ser um objeto');
      const ids = Object.keys(obj.weapons); if (ids.length > LIM.weapons) throw new Error('armas demais (máximo ' + LIM.weapons + ')');
      const out = { version: 1, weapons: {} };
      for (const id of ids) {
        if (!okName(id)) throw new Error('id de arma inválido: "' + String(id).slice(0, 40) + '" (use A-Z a-z 0-9 _ . - até ' + LIM.name + ' caracteres)');
        const w = obj.weapons[id]; if (!isObj(w)) throw new Error('arma "' + id + '" deve ser um objeto');
        const o = {};
        if (w.grip !== undefined && w.grip !== null) o.grip = xform(w.grip, id + '.grip');
        if (w.lhand !== undefined) o.lhand = w.lhand === null ? null : vec(w.lhand, LIM.pos, id + '.lhand');
        if (w.muzzle !== undefined) { if (w.muzzle !== null && (typeof w.muzzle !== 'number' || !isFinite(w.muzzle) || w.muzzle <= 0 || w.muzzle > LIM.muzzle)) throw new Error(id + '.muzzle deve ser um número finito maior que 0 e até ' + LIM.muzzle + ', ou null'); o.muzzle = w.muzzle; }
        if (w.byAnim !== undefined && w.byAnim !== null) {
          if (!isObj(w.byAnim)) throw new Error(id + '.byAnim deve ser um objeto');
          const clips = Object.keys(w.byAnim); if (clips.length > LIM.clips) throw new Error(id + ': clipes demais (máximo ' + LIM.clips + ')');
          o.byAnim = {};
          for (const c of clips) { if (!okName(c)) throw new Error('nome de clipe inválido em ' + id + ': "' + String(c).slice(0, 40) + '"'); if (Object.prototype.hasOwnProperty.call(o.byAnim, c.toLowerCase())) throw new Error('clipe duplicado em ' + id + ' (maiúsculas/minúsculas): "' + String(c).slice(0, 40) + '"'); o.byAnim[c.toLowerCase()] = xform(w.byAnim[c], id + '.byAnim.' + c); }
        }
        out.weapons[id] = o;
      }
      return { ok: true, erro: null, data: out };
    } catch (e) { return { ok: false, erro: e.message, data: null }; }
  };
  /* delta efetivo: byAnim[clipe em minúsculas] SUBSTITUI o grip; sem entrada para o clipe vale o grip; sem nada, zero -> { pos:[3], rot:[3 graus] } */
  globalThis.socketDelta = function (weaponId, clipName) {
    const w = SOCKETS.data.weapons[weaponId], k = typeof clipName === 'string' ? clipName.toLowerCase() : '';
    const t = w && ((k && w.byAnim && Object.prototype.hasOwnProperty.call(w.byAnim, k) && w.byAnim[k]) || w.grip);
    return t ? { pos: t.pos.slice(), rot: t.rot.slice() } : { pos: [0, 0, 0], rot: [0, 0, 0] };
  };
  /* sobrescritas de lhand/muzzle da arma: { lhand, muzzle } (null quando não há) */
  globalThis.socketOverride = function (weaponId) { const w = SOCKETS.data.weapons[weaponId]; return w ? { lhand: w.lhand || null, muzzle: typeof w.muzzle === 'number' ? w.muzzle : null } : { lhand: null, muzzle: null }; };
  globalThis.socketsExport = function () { return JSON.parse(JSON.stringify(SOCKETS.data)); };
  /* troca ao vivo: valida, substitui e reaplica na arma equipada */
  globalThis.socketsSet = function (data) {
    const v = socketsValidate(data); if (!v.ok) return { ok: false, erro: v.erro };
    SOCKETS.data = v.data; SOCKETS.rev++;
    try { if (typeof weapons !== 'undefined' && weapons.mesh && typeof attachWeapon === 'function') attachWeapon(); } catch (e) { console.warn('Sockets:', e); }
    return { ok: true, erro: null };
  };
  /* carregamento: falha (sem arquivo, rede, JSON ruim) = vazio */
  SOCKETS.ready = (typeof fetch === 'function' ? fetch('data/sockets.json', { cache: 'no-store' }) : Promise.reject(new Error('sem fetch')))
    .then(r => r.ok ? r.json() : null).then(j => { if (j) { const r = socketsSet(j); if (!r.ok) console.warn('data/sockets.json ignorado:', r.erro); } return SOCKETS.data; })
    .catch(() => SOCKETS.data);
})();
