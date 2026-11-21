// Lista o conteúdo de um .pak do Unreal Engine (versão 3). Uso: node tools/pak-list.js <arquivo.pak> [filtro]
'use strict';
const fs = require('fs');
const file = process.argv[2], filter = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
const foot = Buffer.alloc(44); fs.readSync(fd, foot, 0, 44, size - 44);
if (foot.readUInt32LE(0) !== 0x5A6F12E1) throw new Error('rodapé de .pak não encontrado');
const version = foot.readUInt32LE(4), idxOff = Number(foot.readBigUInt64LE(8)), idxSize = Number(foot.readBigUInt64LE(16));
const idx = Buffer.alloc(idxSize); fs.readSync(fd, idx, 0, idxSize, idxOff);
let p = 0;
const str = () => { const n = idx.readInt32LE(p); p += 4; if (n === 0) return ''; if (n < 0) { const s = idx.toString('utf16le', p, p + (-n - 1) * 2); p += -n * 2; return s; } const s = idx.toString('latin1', p, p + n - 1); p += n; return s; };
const mount = str(), num = idx.readInt32LE(p); p += 4;
console.log(`pak v${version} | montagem "${mount}" | ${num} arquivos`);
const entries = [];
for (let i = 0; i < num; i++) {
  const name = str(), offset = Number(idx.readBigInt64LE(p)), csize = Number(idx.readBigInt64LE(p + 8)), usize = Number(idx.readBigInt64LE(p + 16)), method = idx.readInt32LE(p + 24); p += 28 + 20;
  let blocks = [];
  if (method !== 0) { const bc = idx.readInt32LE(p); p += 4; for (let b = 0; b < bc; b++) { blocks.push([Number(idx.readBigInt64LE(p)), Number(idx.readBigInt64LE(p + 8))]); p += 16; } }
  const enc = idx[p]; p += 1; const bs = idx.readInt32LE(p); p += 4;
  entries.push({ name, offset, csize, usize, method, blocks, enc, bs });
}
const sel = entries.filter(e => !filter || filter.test(e.name));
const byExt = {}; entries.forEach(e => { const x = e.name.split('.').pop(); byExt[x] = (byExt[x] || 0) + 1; });
console.log('por extensão:', JSON.stringify(byExt), '| compressão:', [...new Set(entries.map(e => e.method))].join(','), '| criptografado:', entries.some(e => e.enc));
sel.slice(0, 200).forEach(e => console.log(`${String(e.usize).padStart(9)}  ${e.name}`));
if (sel.length > 200) console.log('... +' + (sel.length - 200));
module.exports = { entries, fd };
