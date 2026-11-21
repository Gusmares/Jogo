'use strict';
const { fs, T, chunks, child, first, cstr } = require('./rw');
const buf = fs.readFileSync(process.argv[2]);
const dict = chunks(buf, 0, buf.length).find(c => c.type === T.TEXDICT);
const st = first(buf, dict, T.STRUCT);
console.log('texturas:', buf.readUInt16LE(st.start), 'dispositivo:', buf.readUInt16LE(st.start + 2));
child(buf, dict, T.TEXTURENATIVE).forEach(tn => {
  const s = first(buf, tn, T.STRUCT); let p = s.start;
  const platform = buf.readUInt32LE(p); p += 4; p += 4;
  const name = cstr(buf, p, p + 32); p += 32; const mask = cstr(buf, p, p + 32); p += 32;
  const rf = buf.readUInt32LE(p); p += 4;
  const fourcc = buf.toString('latin1', p, p + 4), d3d = buf.readUInt32LE(p); p += 4;
  const w = buf.readUInt16LE(p), h = buf.readUInt16LE(p + 2), depth = buf[p + 4], levels = buf[p + 5], rtype = buf[p + 6], flags = buf[p + 7];
  console.log(`${name.padEnd(24)} mask=${mask.padEnd(12)} plat=${platform} ${w}x${h} depth=${depth} lv=${levels} rf=0x${rf.toString(16)} d3d=${/^[\x20-\x7e]{4}$/.test(fourcc) ? fourcc : '0x' + d3d.toString(16)} flags=${flags}`);
});
