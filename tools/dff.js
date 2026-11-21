// Leitor de DFF (RenderWare / GTA San Andreas): quadros, geometrias, materiais e atomics.
'use strict';
const { fs, T, chunks, child, first, cstr } = require('./rw');

function readFrames(buf, clump) {
  const fl = first(buf, clump, T.FRAMELIST), fst = first(buf, fl, T.STRUCT), n = buf.readUInt32LE(fst.start);
  const frames = []; let p = fst.start + 4;
  for (let i = 0; i < n; i++) {
    const m = []; for (let k = 0; k < 12; k++) m.push(buf.readFloatLE(p + k * 4));
    frames.push({ m, parent: buf.readInt32LE(p + 48), name: '' }); p += 56;
  }
  child(buf, fl, T.EXTENSION).forEach((ex, i) => {
    const f = first(buf, ex, T.FRAME); if (f && frames[i]) frames[i].name = cstr(buf, f.start, f.end);
    const h = first(buf, ex, 0x11E);    // plugin HAnim: identifica o osso e (no raiz) lista a hierarquia
    if (h && frames[i]) {
      const id = buf.readInt32LE(h.start + 4), num = buf.readUInt32LE(h.start + 8), nodes = [];
      for (let k = 0; k < num; k++) { const q = h.start + 20 + k * 12; nodes.push({ id: buf.readInt32LE(q), index: buf.readUInt32LE(q + 4), flags: buf.readUInt32LE(q + 8) }); }
      frames[i].hanim = { id, nodes };
    }
  });
  return frames;
}
// aplica matriz de um quadro (linhas: right, up, at, pos) a um ponto
const xf = (m, x, y, z) => [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
const xfDir = (m, x, y, z) => [x * m[0] + y * m[3] + z * m[6], x * m[1] + y * m[4] + z * m[7], x * m[2] + y * m[5] + z * m[8]];
function worldPoint(frames, idx, p) {
  let q = p;
  for (let f = idx; f >= 0; f = frames[f].parent) q = xf(frames[f].m, q[0], q[1], q[2]);
  return q;
}
function worldDir(frames, idx, p) {
  let q = p;
  for (let f = idx; f >= 0; f = frames[f].parent) q = xfDir(frames[f].m, q[0], q[1], q[2]);
  return q;
}

function readGeometry(buf, g) {
  const s = first(buf, g, T.STRUCT); let p = s.start;
  const flags = buf.readUInt32LE(p), numTris = buf.readUInt32LE(p + 4), numVerts = buf.readUInt32LE(p + 8), numMorph = buf.readUInt32LE(p + 12); p += 16;
  if (g.version < 0x34000) p += 12; // ambient/diffuse/specular (versões antigas)
  const hasPos = flags & 2, hasNormals = flags & 0x10, prelit = flags & 8;
  let nUV = (flags >> 16) & 0xff; if (!nUV) nUV = (flags & 4) ? 1 : (flags & 0x80) ? 2 : 0;
  if (prelit) p += numVerts * 4;
  const uvs = [];
  for (let k = 0; k < nUV; k++) { const a = new Float32Array(numVerts * 2); for (let i = 0; i < numVerts * 2; i++) a[i] = buf.readFloatLE(p + i * 4); p += numVerts * 8; uvs.push(a); }
  const tris = new Uint16Array(numTris * 4);   // [v2, v1, mat, v3]
  for (let i = 0; i < numTris * 4; i++) tris[i] = buf.readUInt16LE(p + i * 2); p += numTris * 8;
  let pos = null, nrm = null;
  for (let mt = 0; mt < numMorph; mt++) {
    p += 16; const hv = buf.readInt32LE(p), hn = buf.readInt32LE(p + 4); p += 8;
    if (mt === 0) {
      if (hv) { pos = new Float32Array(numVerts * 3); for (let i = 0; i < numVerts * 3; i++) pos[i] = buf.readFloatLE(p + i * 4); }
      if (hn) { nrm = new Float32Array(numVerts * 3); const o = p + (hv ? numVerts * 12 : 0); for (let i = 0; i < numVerts * 3; i++) nrm[i] = buf.readFloatLE(o + i * 4); }
    }
    p += (hv ? numVerts * 12 : 0) + (hn ? numVerts * 12 : 0);
  }
  // materiais
  const ml = first(buf, g, T.MATERIALLIST), materials = [];
  if (ml) child(buf, ml, T.MATERIAL).forEach(mc => {
    const ms = first(buf, mc, T.STRUCT); let q = ms.start;
    q += 4; const color = [buf[q], buf[q + 1], buf[q + 2], buf[q + 3]]; q += 8; // flags(4) + cor(4) + unused(4)
    const textured = buf.readInt32LE(q); 
    let tex = null; const tc = first(buf, mc, T.TEXTURE);
    if (tc) { const str = child(buf, tc, T.STRING); if (str[0]) tex = cstr(buf, str[0].start, str[0].end); }
    materials.push({ color, tex: textured ? tex : null });
  });
  // BinMesh: lista de índices (tira de triângulos ou lista)
  const ext = first(buf, g, T.EXTENSION), bm = ext && first(buf, ext, T.BINMESH);
  let indices = [], matIdx = [];
  const addTri = (a, b, c, m) => { if (a !== b && b !== c && a !== c) { indices.push(a, b, c); matIdx.push(m); } };
  if (bm) {
    const strip = buf.readUInt32LE(bm.start), nm = buf.readUInt32LE(bm.start + 4); let q = bm.start + 12;
    for (let m = 0; m < nm; m++) {
      const n = buf.readUInt32LE(q), mat = buf.readUInt32LE(q + 4); q += 8;
      const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = buf.readUInt32LE(q + i * 4); q += n * 4;
      if (strip === 1) { for (let i = 0; i + 2 < n; i++) { if (i & 1) addTri(ix[i + 1], ix[i], ix[i + 2], mat); else addTri(ix[i], ix[i + 1], ix[i + 2], mat); } }
      else for (let i = 0; i + 2 < n; i += 3) addTri(ix[i], ix[i + 1], ix[i + 2], mat);
    }
  } else {
    for (let i = 0; i < numTris; i++) addTri(tris[i * 4 + 1], tris[i * 4], tris[i * 4 + 3], tris[i * 4 + 2]);
  }
  // plugin Skin (0x116): índices/pesos de ossos por vértice e matrizes inversas (usado pelos fardamentos)
  let skin = null;
  const sk = ext && first(buf, ext, 0x116);
  if (sk) {
    let q = sk.start; const numBones = buf[q], used = buf[q + 1]; q += 4 + used;
    const bi = new Uint8Array(numVerts * 4), bw = new Float32Array(numVerts * 4);
    for (let i = 0; i < numVerts * 4; i++) bi[i] = buf[q + i]; q += numVerts * 4;
    for (let i = 0; i < numVerts * 4; i++) bw[i] = buf.readFloatLE(q + i * 4); q += numVerts * 16;
    const inv = []; for (let b = 0; b < numBones; b++) { const m = []; for (let k = 0; k < 16; k++) m.push(buf.readFloatLE(q + (b * 16 + k) * 4)); inv.push(m); }
    skin = { numBones, boneIdx: bi, weights: bw, inverse: inv, leftover: sk.end - (q + numBones * 64) };
  }
  return { numVerts, pos, nrm, uv: uvs[0] || null, materials, indices, matIdx, skin };
}

function loadDFF(file) {
  const buf = fs.readFileSync(file);
  const clump = chunks(buf, 0, buf.length).find(c => c.type === T.CLUMP);
  const frames = readFrames(buf, clump);
  const geos = child(buf, first(buf, clump, T.GEOMETRYLIST), T.GEOMETRY).map(g => readGeometry(buf, g));
  const atomics = child(buf, clump, T.ATOMIC).map(a => { const s = first(buf, a, T.STRUCT); return { frame: buf.readUInt32LE(s.start), geo: buf.readUInt32LE(s.start + 4), flags: buf.readUInt32LE(s.start + 8) }; });
  return { frames, geos, atomics };
}
module.exports = { loadDFF, worldPoint, worldDir };
