// NEON ENGINE — escreve GLB (glTF 2.0 binário) em Node, sem dependências: malhas com posição/normal/UV/índices e materiais PBR com textura PNG.
'use strict';
function writeGLB(parts, opts) {
  opts = opts || {};
  const json = { asset: { version: '2.0', generator: 'NEON ENGINE (GTA IV)' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: opts.name || 'modelo' }],
    meshes: [{ primitives: [] }], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
  const chunks = []; let len = 0;
  const view = (buf, target) => { const pad = (4 - (len % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; } json.bufferViews.push(Object.assign({ buffer: 0, byteOffset: len, byteLength: buf.length }, target ? { target } : {})); chunks.push(buf); len += buf.length; return json.bufferViews.length - 1; };
  const acc = (arr, type, comp, target, minmax) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), v = view(buf, target), n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const a = { bufferView: v, componentType: comp, count: arr.length / n, type };
    if (minmax) { const mn = [], mx = []; for (let k = 0; k < n; k++) { mn.push(Infinity); mx.push(-Infinity); } for (let i = 0; i < arr.length; i++) { const k = i % n; if (arr[i] < mn[k]) mn[k] = arr[i]; if (arr[i] > mx[k]) mx[k] = arr[i]; } a.min = mn; a.max = mx; }
    json.accessors.push(a); return json.accessors.length - 1;
  };
  const matIdx = new Map(), imgIdx = new Map();
  for (const p of parts) {
    const mk = p.material.key;
    if (!matIdx.has(mk)) {
      const M = p.material, mat = { name: M.name || 'material', pbrMetallicRoughness: { baseColorFactor: M.color || [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: M.roughness === undefined ? 0.85 : M.roughness } };
      if (M.png) {
        if (!imgIdx.has(M.png)) { json.images.push({ bufferView: view(M.png), mimeType: 'image/png', name: M.texName || '' }); json.textures.push({ sampler: 0, source: json.images.length - 1 }); imgIdx.set(M.png, json.textures.length - 1); }
        mat.pbrMetallicRoughness.baseColorTexture = { index: imgIdx.get(M.png) };
      }
      if (M.alphaMode) { mat.alphaMode = M.alphaMode; if (M.alphaMode === 'MASK') mat.alphaCutoff = 0.5; }
      if (M.doubleSided) mat.doubleSided = true;
      json.materials.push(mat); matIdx.set(mk, json.materials.length - 1);
    }
    const attributes = { POSITION: acc(p.positions, 'VEC3', 5126, 34962, true) };
    if (p.normals) attributes.NORMAL = acc(p.normals, 'VEC3', 5126, 34962);
    if (p.uvs) attributes.TEXCOORD_0 = acc(p.uvs, 'VEC2', 5126, 34962);
    json.meshes[0].primitives.push({ attributes, indices: acc(p.indices, 'SCALAR', 5125, 34963), material: matIdx.get(mk), mode: 4 });
  }
  if (!json.images.length) { delete json.images; delete json.textures; delete json.samplers; }
  const bin = Buffer.concat(chunks.concat([Buffer.alloc((4 - (len % 4)) % 4)])); json.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(json), 'utf8'); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write('glTF', 0, 'latin1'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.write('JSON', 4, 'latin1');
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([head, c1, js, c2, bin]);
}
module.exports = { writeGLB };
