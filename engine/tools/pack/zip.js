// Leitor de .zip mínimo (sem dependências): lista e extrai com zlib. Aceita zip64 simples e nomes UTF-8/CP437.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
function list(file) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size, tailLen = Math.min(size, 66000), tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) { fs.closeSync(fd); throw new Error('não é um zip válido: ' + file); }
  let n = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
  if (cdOff === 0xffffffff || n === 0xffff) {                          // zip64
    const l = tail.readUInt32LE(e - 20) === 0x07064b50 ? Number(tail.readBigUInt64LE(e - 12)) : -1, b = Buffer.alloc(56); fs.readSync(fd, b, 0, 56, l);
    n = Number(b.readBigUInt64LE(32)); cdSize = Number(b.readBigUInt64LE(40)); cdOff = Number(b.readBigUInt64LE(48));
  }
  const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff); fs.closeSync(fd);
  const out = []; let p = 0;
  for (let i = 0; i < n && p + 46 <= cd.length; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42), cs = csize, us = usize;
    const name = cd.toString((flags & 0x800) ? 'utf8' : 'latin1', p + 46, p + 46 + nl);
    if (cs === 0xffffffff || us === 0xffffffff || off === 0xffffffff) {   // extra zip64
      let q = p + 46 + nl; const end = q + el; while (q + 4 <= end) { const id = cd.readUInt16LE(q), sz = cd.readUInt16LE(q + 2); if (id === 1) { let r = q + 4; if (us === 0xffffffff) { us = Number(cd.readBigUInt64LE(r)); r += 8; } if (cs === 0xffffffff) { cs = Number(cd.readBigUInt64LE(r)); r += 8; } if (off === 0xffffffff) off = Number(cd.readBigUInt64LE(r)); } q += 4 + sz; }
    }
    out.push({ name, method, csize: cs, usize: us, off, dir: name.endsWith('/') });
    p += 46 + nl + el + cl;
  }
  return out;
}
function read(file, ent) {
  const fd = fs.openSync(file, 'r'), h = Buffer.alloc(30); fs.readSync(fd, h, 0, 30, ent.off);
  const start = ent.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), raw = Buffer.alloc(ent.csize); fs.readSync(fd, raw, 0, ent.csize, start); fs.closeSync(fd);
  if (ent.method === 0) return raw; if (ent.method === 8) return zlib.inflateRawSync(raw);
  throw new Error('método de compressão ' + ent.method + ' não suportado em ' + ent.name);
}
/* extrai para dest SEM sobrescrever arquivos existentes; bloqueia caminhos fora de dest (zip slip). Devolve {written, skipped} */
function extract(file, dest) {
  const root = path.resolve(dest); let written = 0, skipped = 0;
  for (const ent of list(file)) {
    if (ent.dir) continue; const rel = ent.name.split('\\').join('/'); if (/^[a-z]:|^\/|(^|\/)\.\.(\/|$)/i.test(rel)) { skipped++; continue; }
    const out = path.resolve(root, rel); if (!out.startsWith(root + path.sep)) { skipped++; continue; }
    if (fs.existsSync(out)) { skipped++; continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, read(file, ent)); written++;
  }
  return { written, skipped };
}
module.exports = { list, read, extract };
