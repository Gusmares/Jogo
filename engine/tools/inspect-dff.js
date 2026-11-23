'use strict';
const { fs, T, chunks, child, first, cstr } = require('./rw');
const file = process.argv[2];
const buf = fs.readFileSync(file);
const top = chunks(buf, 0, buf.length);
const clump = top.find(c => c.type === T.CLUMP);
console.log('chunks topo:', top.map(c => '0x' + c.type.toString(16) + ' v0x' + c.version.toString(16)).join(', '));
const st = first(buf, clump, T.STRUCT);
console.log('atomics/luzes/cameras:', buf.readUInt32LE(st.start), buf.readUInt32LE(st.start + 4));

// frames
const fl = first(buf, clump, T.FRAMELIST), fst = first(buf, fl, T.STRUCT), nf = buf.readUInt32LE(fst.start);
const frames = [];
let p = fst.start + 4;
for (let i = 0; i < nf; i++) {
  const m = []; for (let k = 0; k < 12; k++) m.push(buf.readFloatLE(p + k * 4));
  frames.push({ m, parent: buf.readInt32LE(p + 48) }); p += 56;
}
const exts = child(buf, fl, T.EXTENSION);
exts.forEach((ex, i) => {
  const fr = first(buf, ex, T.FRAME);
  if (fr && frames[i]) frames[i].name = cstr(buf, fr.start, fr.end);
});
console.log('frames:', nf);
frames.forEach((f, i) => console.log(' ', i, f.name, 'pai', f.parent, 'pos', f.m.slice(9).map(v => v.toFixed(2)).join(',')));

// geometrias
const gl = first(buf, clump, T.GEOMETRYLIST), gst = first(buf, gl, T.STRUCT), ng = buf.readUInt32LE(gst.start);
console.log('geometrias:', ng);
const geos = child(buf, gl, T.GEOMETRY);
geos.forEach((g, i) => {
  const s = first(buf, g, T.STRUCT);
  const flags = buf.readUInt32LE(s.start), tri = buf.readUInt32LE(s.start + 4), vtx = buf.readUInt32LE(s.start + 8);
  const ml = first(buf, g, T.MATERIALLIST);
  const mats = ml ? child(buf, ml, T.MATERIAL).length : 0;
  const ext = first(buf, g, T.EXTENSION), bm = ext && first(buf, ext, T.BINMESH);
  console.log(`  geo ${i}: flags 0x${flags.toString(16)} tris ${tri} verts ${vtx} mats ${mats} binmesh ${!!bm} ver 0x${g.version.toString(16)}`);
});
// atomics
child(buf, clump, T.ATOMIC).forEach(a => {
  const s = first(buf, a, T.STRUCT);
  console.log('  atomic frame', buf.readUInt32LE(s.start), '-> geo', buf.readUInt32LE(s.start + 4), 'flags', buf.readUInt32LE(s.start + 8));
});
