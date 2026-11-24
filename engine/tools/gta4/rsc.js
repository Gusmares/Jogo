// NEON ENGINE — leitor de RECURSOS do GTA IV (RAGE "RSC", versão 110: .wdr modelo, .wdd dicionário de modelos, .wtd texturas, .wft fragmento).
// Só lê arquivos ABERTOS: os soltos da instalação (ex.: pc/models/plantsmgr.wdd, pc/textures/*.wtd) ou os que o dono do jogo exportou
// dos .img com o OpenIV. Não lida com os .img (o índice deles é criptografado; quem abre é o OpenIV).
// Estrutura: cabeçalho de 12 bytes + dados zlib. Os dados viram dois blocos: "sistema" (estruturas) e "gráfico" (vértices, índices, pixels).
// Ponteiros: 0x5XXXXXXX = deslocamento no bloco de sistema, 0x6XXXXXXX = no bloco gráfico.
'use strict';
const fs = require('fs'), zlib = require('zlib');

function readResource(file) {
  const b = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  if (b.toString('latin1', 0, 3) !== 'RSC') throw new Error('não é um recurso RSC do GTA IV');
  const type = b.readUInt32LE(4), flags = b.readUInt32LE(8);
  const sysSize = (flags & 0x7FF) << (((flags >> 11) & 0xF) + 8), gfxSize = ((flags >> 15) & 0x7FF) << (((flags >> 26) & 0xF) + 8);
  const data = zlib.inflateSync(b.slice(12));
  const sys = data.slice(0, sysSize), gfx = data.slice(sysSize, sysSize + gfxSize);
  const R = {
    type, sys, gfx,
    /* lê no bloco certo conforme o ponteiro */
    seg(p) { return (p >>> 28) === 5 ? sys : (p >>> 28) === 6 ? gfx : null; },
    off(p) { return p & 0x0FFFFFFF; },
    ok(p) { const s = R.seg(p); return !!s && R.off(p) < s.length; },
    u8: (p, o = 0) => R.seg(p).readUInt8(R.off(p) + o),
    u16: (p, o = 0) => R.seg(p).readUInt16LE(R.off(p) + o),
    u32: (p, o = 0) => R.seg(p).readUInt32LE(R.off(p) + o),
    f32: (p, o = 0) => R.seg(p).readFloatLE(R.off(p) + o),
    str(p) { if (!R.ok(p)) return null; const s = R.seg(p), a = R.off(p); let e = a; while (e < s.length && s[e]) e++; return s.toString('latin1', a, e); },
    slice(p, n) { const s = R.seg(p), a = R.off(p); return s.slice(a, a + n); }
  };
  return R;
}
/* coleção de ponteiros (pgPtrCollection / pgObjectArray): [ponteiro, contagem u16, capacidade u16] */
function ptrArray(R, at) {
  const p = R.u32(at), n = R.u16(at, 4), out = [];
  if (!R.ok(p) || n > 4096) return out;
  for (let i = 0; i < n; i++) out.push(R.u32(p, i * 4));
  return out;
}
module.exports = { readResource, ptrArray };
