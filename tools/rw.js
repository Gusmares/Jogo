// Leitor mínimo de chunks RenderWare (DFF/TXD) — usado pelo conversor de modelos.
'use strict';
const fs = require('fs');

const T = {
  STRUCT: 0x01, STRING: 0x02, EXTENSION: 0x03, TEXTURE: 0x06, MATERIAL: 0x07, MATERIALLIST: 0x08,
  FRAMELIST: 0x0E, GEOMETRY: 0x0F, CLUMP: 0x10, ATOMIC: 0x14, TEXTURENATIVE: 0x15, TEXDICT: 0x16,
  GEOMETRYLIST: 0x1A, BINMESH: 0x50E, FRAME: 0x253F2FE, NIGHTCOLORS: 0x253F2F9, EFFECT2D: 0x253F2F8
};

// Lê os filhos de um intervalo [start,end) como lista de chunks {type,size,version,start,end}
function chunks(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 12 <= end) {
    const type = buf.readUInt32LE(p), version = buf.readUInt32LE(p + 8);
    let size = buf.readUInt32LE(p + 4);
    const s = p + 12;
    // alguns mods "protegem" o arquivo adulterando o byte alto do tamanho; o jogo original ignora isso, então tentamos corrigir
    if (s + size > end) size &= 0xFFFFFF;
    if (s + size > end) size &= 0xFFFF;
    const e = s + size;
    if (e > end) break;
    out.push({ type, size, version, start: s, end: e });
    p = e;
  }
  return out;
}
const child = (buf, c, type) => chunks(buf, c.start, c.end).filter(k => k.type === type);
const first = (buf, c, type) => child(buf, c, type)[0];
const cstr = (buf, s, e) => { let i = s; while (i < e && buf[i] !== 0) i++; return buf.toString('latin1', s, i); };

module.exports = { fs, T, chunks, child, first, cstr };
