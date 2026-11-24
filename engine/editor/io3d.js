/* NEON ENGINE — importar e exportar modelos 3D.
   IMPORTAR: FBX, glTF/GLB, OBJ(+MTL), DAE (Collada), STL, PLY e 3DS, com texturas (PNG, JPG, TGA, DDS, BMP…) escolhidas junto ou a pasta inteira.
     O editor lê o arquivo aqui mesmo, acerta unidade (cm da Unreal/Unity → m), eixo (Z para cima → Y), põe a base no chão e o centro na origem,
     troca os materiais por PBR e grava um GLB em <projeto>/assets/objects/<id>/model.glb (texturas dentro). O jogo só precisa ler GLB.
   EXPORTAR: o objeto selecionado (colocado, carro ou prédio da cidade original), todos os objetos colocados, ou uma região inteira do mapa
     (terreno + cidade + objetos) em GLB (abre na Unreal 5, Blender e na Unity com glTFast) ou OBJ (abre em qualquer programa). */
'use strict';
const IO_FMT = ['fbx', 'glb', 'gltf', 'obj', 'dae', '3ds', 'ply', 'stl'];
const ioExt = n => (n.split('.').pop() || '').toLowerCase();
/* ---------------- leitura ---------------- */
async function ioLoadFiles(files) {
  files = [...files]; const byName = new Map(), urls = new Map(), made = new Set(), missing = new Set();
  for (const f of files) byName.set(f.name.toLowerCase(), f);
  const main = IO_FMT.map(x => files.find(f => ioExt(f.name) === x)).find(Boolean);
  if (!main) throw new Error('Nenhum modelo 3D entre os arquivos (aceita ' + IO_FMT.join(', ').toUpperCase() + ').');
  const urlOf = f => { if (!urls.has(f)) { const u = URL.createObjectURL(f); urls.set(f, u); made.add(u); } return urls.get(f); };
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(u => {
    if (made.has(u) || u.startsWith('data:')) return u;
    const base = decodeURIComponent(u.split('?')[0].split(/[\\/]/).pop()).toLowerCase(), f = byName.get(base) || byName.get(base.replace(/\.[^.]+$/, '.png')) || byName.get(base.replace(/\.[^.]+$/, '.jpg'));
    if (f) return urlOf(f); missing.add(base); return u;
  });
  if (THREE.TGALoader) manager.addHandler(/\.tga$/i, new THREE.TGALoader(manager));
  if (THREE.DDSLoader) manager.addHandler(/\.dds$/i, new THREE.DDSLoader(manager));
  const ext = ioExt(main.name), url = urlOf(main), load = (L, u) => new Promise((ok, fail) => L.load(u, ok, undefined, e => fail(e && e.message ? e : new Error('não consegui ler ' + main.name))));
  let obj;
  if (ext === 'fbx') obj = await load(new THREE.FBXLoader(manager), url);
  else if (ext === 'glb' || ext === 'gltf') obj = (await load(new THREE.GLTFLoader(manager), url)).scene;
  else if (ext === 'dae') obj = (await load(new THREE.ColladaLoader(manager), url)).scene;
  else if (ext === '3ds') obj = await load(new THREE.TDSLoader(manager), url);
  else if (ext === 'obj') {
    const L = new THREE.OBJLoader(manager), mtl = files.find(f => ioExt(f.name) === 'mtl');
    if (mtl) { const m = await load(new THREE.MTLLoader(manager), urlOf(mtl)); m.preload(); L.setMaterials(m); }
    obj = await load(L, url);
  } else {                                                          // STL e PLY: só geometria
    const g = await load(ext === 'stl' ? new THREE.STLLoader(manager) : new THREE.PLYLoader(manager), url); if (!g.attributes.normal) g.computeVertexNormals();
    obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.7, vertexColors: !!g.attributes.color }));
  }
  await new Promise(r => setTimeout(r, 400));                       // texturas terminam de chegar
  return { obj, main, missing: [...missing].filter(n => !/\.(fbx|obj|gltf|glb|dae)$/.test(n)), release: () => urls.forEach(u => URL.revokeObjectURL(u)) };
}
/* material qualquer -> PBR (o que o GLB e as engines entendem) */
function ioStd(m) {
  if (!m || m.isMeshStandardMaterial) return m;
  const s = new THREE.MeshStandardMaterial({ name: m.name || '', color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1), map: m.map || null, normalMap: m.normalMap || null, aoMap: m.aoMap || null,
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0, 0, 0), emissiveMap: m.emissiveMap || null, alphaMap: m.alphaMap || null, transparent: !!m.transparent, opacity: m.opacity === undefined ? 1 : m.opacity,
    alphaTest: m.alphaTest || 0, side: m.side, vertexColors: !!m.vertexColors, metalness: 0, roughness: m.shininess !== undefined ? Math.min(1, Math.max(0.15, 1 - m.shininess / 120)) : 0.85 });
  return s;
}
/* deixa o objeto pronto: estático, PBR, na escala/eixo certos, base no chão e centro na origem */
function ioPrepare(src, opt) {
  const obj = src; obj.updateMatrixWorld(true);
  const swaps = []; obj.traverse(o => { if (o.isSkinnedMesh) swaps.push(o); });
  for (const o of swaps) {                                          // personagem com esqueleto: fica parado na pose de ligação
    const g = o.geometry.clone(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
    const m = new THREE.Mesh(g, o.material); m.name = o.name; m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale); const par = o.parent; par.add(m); par.remove(o);
  }
  let tris = 0, mats = new Set();
  obj.traverse(o => {
    if (o.isLight || o.isCamera) { o.visible = false; return; }
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(ioStd) : ioStd(o.material);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { mats.add(m); for (const k of ['map', 'normalMap', 'emissiveMap', 'aoMap', 'alphaMap']) if (m[k] && m[k].isCompressedTexture) m[k] = null; });
    const g = o.geometry; if (!g.attributes.normal) g.computeVertexNormals(); tris += (g.index ? g.index.count : g.attributes.position.count) / 3; o.castShadow = o.receiveShadow = true;
  });
  const wrap = new THREE.Group(), inner = new THREE.Group(); wrap.add(inner); inner.add(obj);
  if (opt.zUp) inner.rotation.x = -Math.PI / 2;
  inner.updateMatrixWorld(true); let bb = new THREE.Box3().setFromObject(inner);
  const size = bb.getSize(new THREE.Vector3()), big = Math.max(size.x, size.y, size.z);
  const unit = opt.unit === 'auto' ? (big > (opt.ext === 'fbx' ? 150 : 400) ? 0.01 : big > 0 && big < 0.05 ? 100 : 1) : +opt.unit || 1;
  inner.scale.multiplyScalar(unit); inner.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(inner);
  if (opt.center !== false) { const c = bb.getCenter(new THREE.Vector3()); inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= bb.min.y; }
  wrap.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(wrap); const d = bb.getSize(new THREE.Vector3());
  return { root: wrap, unit, tris: Math.round(tris), materials: mats.size, dims: { width: +d.x.toFixed(2), height: +d.y.toFixed(2), len: +d.z.toFixed(2) } };
}
/* ---------------- GLB / OBJ ---------------- */
/* espera as texturas terminarem de carregar; as que não existem (ou são comprimidas, DDS) saem do material para o exportador não quebrar */
async function ioReadyTextures(obj) {
  const K = ['map', 'normalMap', 'emissiveMap', 'aoMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'specularMap', 'lightMap'], ok = t => { const i = t && t.image; return !!(i && (i.width || i.videoWidth) && (i.complete === undefined || i.complete)); };
  const mats = new Set(); obj.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); });
  for (let k = 0; k < 40; k++) { let wait = false; for (const m of mats) for (const key of K) if (m[key] && !m[key].isCompressedTexture && !ok(m[key])) wait = true; if (!wait) break; await new Promise(r => setTimeout(r, 100)); }
  const off = []; for (const m of mats) for (const key of K) if (m[key] && (m[key].isCompressedTexture || !ok(m[key]))) { off.push([m, key, m[key]]); m[key] = null; }
  return () => off.forEach(([m, key, t]) => { m[key] = t; });          // devolve (os materiais podem ser os do próprio mundo)
}
/* malha com vários materiais -> uma malha por material, só com os vértices que ela usa
   (o exportador do three r128 repete a malha inteira para cada material: um carro de 12 MB virava 230 MB) */
function ioSplit(root) {
  const out = new THREE.Group(), list = []; out.add(root.clone(true));
  // userData vai para o arquivo como texto: no jogo ele guarda referências às malhas (carros, LOD) e virava centenas de MB de JSON
  out.traverse(o => { o.userData = {}; if (o.isMesh && Array.isArray(o.material) && o.geometry.groups.length) list.push(o); });
  for (const o of list) {
    const g = o.geometry, idx = g.index ? g.index.array : null, names = Object.keys(g.attributes).filter(k => k !== 'skinIndex' && k !== 'skinWeight'), grp = new THREE.Group();
    grp.name = o.name; grp.position.copy(o.position); grp.quaternion.copy(o.quaternion); grp.scale.copy(o.scale); grp.visible = o.visible;
    for (const gr of g.groups) {
      const mat = o.material[gr.materialIndex]; if (!mat || !gr.count) continue;
      const map = new Map(), ni = []; let n = 0;
      for (let k = gr.start; k < gr.start + gr.count; k++) { const v = idx ? idx[k] : k; let m = map.get(v); if (m === undefined) { m = n++; map.set(v, m); } ni.push(m); }
      const ng = new THREE.BufferGeometry();
      for (const key of names) { const A = g.attributes[key], sz = A.itemSize, arr = new Float32Array(n * sz); for (const [v, m] of map) for (let j = 0; j < sz; j++) arr[m * sz + j] = A.array[v * sz + j]; ng.setAttribute(key, new THREE.BufferAttribute(arr, sz, A.normalized)); }
      ng.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(ni, 1) : new THREE.Uint16BufferAttribute(ni, 1));
      const sub = new THREE.Mesh(ng, mat); sub.userData = {}; sub.name = (o.name || 'malha') + '_' + (mat.name || gr.materialIndex); grp.add(sub);
    }
    const p = o.parent; if (p) { p.add(grp); p.remove(o); }
  }
  return out;
}
async function ioGLB(obj) { obj = ioSplit(obj); const restore = await ioReadyTextures(obj); try { return await new Promise((ok, fail) => { try { new THREE.GLTFExporter().parse(obj, r => ok(r), { binary: true, onlyVisible: true, maxTextureSize: 2048 }); } catch (e) { fail(e); } }); } finally { restore(); } }
function ioB64(buf) { const by = new Uint8Array(buf); let s = ''; for (let i = 0; i < by.length; i += 32768) s += String.fromCharCode.apply(null, by.subarray(i, i + 32768)); return btoa(s); }
function ioDownload(data, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
const ioSafe = s => String(s || 'objeto').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'objeto';
async function ioExport(obj, name, fmt) {
  obj.updateMatrixWorld(true);
  if (fmt === 'obj') ioDownload(new THREE.OBJExporter().parse(obj), name + '.obj', 'text/plain');
  else ioDownload(await ioGLB(obj), name + '.glb', 'model/gltf-binary');
}
/* ---------------- montar o que exportar ---------------- */
/* um pedaço de malha juntada (só os triângulos dentro de [s0, s1) ou de uma região) como geometria própria, já no mundo */
function ioSubGeo(mesh, keepTri) {
  const g = mesh.geometry, idx = g.index ? g.index.array : null, n = idx ? idx.length : g.attributes.position.count, names = ['position', 'normal', 'uv', 'color'].filter(k => g.attributes[k]);
  const out = {}; names.forEach(k => out[k] = []);
  mesh.updateMatrixWorld(true); const M = mesh.matrixWorld, ident = M.equals(new THREE.Matrix4()), NM = new THREE.Matrix3().getNormalMatrix(M), v = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2; if (!keepTri(a, b, c)) continue;
    for (const i of [a, b, c]) for (const k of names) {
      const A = g.attributes[k], sz = A.itemSize;
      if (k === 'position' && !ident) { v.fromBufferAttribute(A, i).applyMatrix4(M); out[k].push(v.x, v.y, v.z); }
      else if (k === 'normal' && !ident) { v.fromBufferAttribute(A, i).applyMatrix3(NM).normalize(); out[k].push(v.x, v.y, v.z); }
      else for (let j = 0; j < sz; j++) out[k].push(A.array[i * sz + j]);
    }
  }
  if (!out.position.length) return null;
  const ng = new THREE.BufferGeometry(); for (const k of names) ng.setAttribute(k, new THREE.Float32BufferAttribute(out[k], g.attributes[k].itemSize));
  return new THREE.Mesh(ng, Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
}
/* prédio/marco da cidade original como objeto próprio (com a alteração do editor, centrado no pé) */
function ioWorldEntity(e) {
  entInit(e); const grp = new THREE.Group();
  for (const p of e.parts) { const m = ioSubGeo(p.mesh, (a, b, c) => a >= p.start && a < p.end && b >= p.start && b < p.end); if (m) grp.add(m); }
  for (const o of e.objs) if (o.visible) { o.updateMatrixWorld(true); const c = o.clone(true); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); grp.add(c); }
  const ov = ED.map.world[e.id] || {}, d = ov.d || [0, 0, 0]; grp.position.set(-(e.pivot.x + d[0]), -(e.pivot.y + d[1]), -(e.pivot.z + d[2]));
  const out = new THREE.Group(); out.add(grp); return out;
}
/* objeto colocado/carro: cópia sem a posição no mapa; LOD vira só o nível de perto */
function ioPlaced(root) {
  const c = root.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.copy(root.scale);
  c.traverse(o => { if (o.isLOD && o.levels.length) { const hi = o.levels[0].object; o.levels.slice(1).forEach(l => o.remove(l.object)); o.levels.length = 1; hi.visible = true; } });
  return c;
}
function ioSelection() {
  const id = ED.sel; if (!id) return null;
  if (id.startsWith('w:')) { const e = WENT.byId.get(id.slice(2)); return e ? { obj: ioWorldEntity(e), name: ioSafe(e.name) } : null; }
  const r = ED.roots.get(id); if (!r) return null;
  if (r.userData.kind === 'vehicle' && r.userData.visual) { const v = r.userData.visual, u = v.userData; setVehLod(u, true); const c = v.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); return { obj: c, name: ioSafe(edLabel(r.userData.def)) }; }
  return { obj: ioPlaced(r), name: ioSafe(edLabel(r.userData.def)) };
}
/* terreno de uma região como malha com as cores do bioma */
function ioTerrainPatch(cx, cz, R) {
  const ix0 = Math.max(0, Math.floor((cx - R - X0) / CS)), ix1 = Math.min(NX, Math.ceil((cx + R - X0) / CS)), iz0 = Math.max(0, Math.floor((cz - R - Z0) / CS)), iz1 = Math.min(NZ, Math.ceil((cz + R - Z0) / CS));
  const w = ix1 - ix0 + 1, h = iz1 - iz0 + 1, P = [], C = [], U = [], I = [], col = TERRAIN.geo.attributes.color.array;
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) { const i = iz * W1 + ix; P.push(X0 + ix * CS, HG[i], Z0 + iz * CS); C.push(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]); U.push((X0 + ix * CS) * 0.1, (Z0 + iz * CS) * 0.1); }
  for (let z = 0; z < h - 1; z++) for (let x = 0; x < w - 1; x++) { const a = z * w + x, b = a + 1, c = a + w, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); m.name = 'terreno'; return m;
}
/* região do mapa em volta de (cx, cz): terreno, cidade (recortada), árvores/postes (instâncias) e objetos colocados */
function ioRegion(cx, cz, R, opt) {
  const out = new THREE.Group(), inside = (x, z) => Math.abs(x - cx) <= R && Math.abs(z - cz) <= R;
  const skip = new Set([tc, selBox, selWBox, edWProxy, TT.ring, typeof water !== 'undefined' ? water : null, typeof sunMesh !== 'undefined' ? sunMesh : null, typeof moonMesh !== 'undefined' ? moonMesh : null,
    typeof stars !== 'undefined' ? stars : null, player.mesh, player.actor && player.actor.group].concat(cars.map(c => c.mesh), (typeof peds !== 'undefined' ? peds : []).map(p => p.mesh), TERRAIN.tiles.map(t => t.mesh)).filter(Boolean));
  if (opt.terrain) out.add(ioTerrainPatch(cx, cz, R));
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const walk = o => {
    if (skip.has(o) || !o.visible) return;
    if (o === edRoot && !opt.objects) return;
    if (o.isInstancedMesh) {
      if (!opt.city) return;
      const parts = []; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); v.setFromMatrixPosition(m4); if (!inside(v.x, v.z)) continue; const g = o.geometry.clone(); g.applyMatrix4(m4); parts.push(g.index ? g.toNonIndexed() : g); }
      if (parts.length) { const names = ['position', 'normal', 'uv'].filter(k => parts[0].attributes[k]), ng = new THREE.BufferGeometry();
        for (const k of names) { const arr = []; for (const g of parts) arr.push(...g.attributes[k].array); ng.setAttribute(k, new THREE.Float32BufferAttribute(arr, parts[0].attributes[k].itemSize)); }
        out.add(new THREE.Mesh(ng, Array.isArray(o.material) ? o.material[0] : o.material)); }
      return;
    }
    if (o.isMesh && !o.isSkinnedMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(m => m.isShaderMaterial || m.isRawShaderMaterial)) return;
      const inEd = (() => { let p = o; while (p) { if (p === edRoot) return true; p = p.parent; } return false; })();
      if (!inEd && !opt.city) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.updateMatrixWorld(true);
      const s = o.geometry.boundingSphere, c = v.copy(s.center).applyMatrix4(o.matrixWorld), rad = s.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (Math.abs(c.x - cx) > R + rad || Math.abs(c.z - cz) > R + rad) return;
      const pos = o.geometry.attributes.position; if (!pos) return;
      const T = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3(), keep = (a, b, cc) => { T.fromBufferAttribute(pos, a); q.fromBufferAttribute(pos, b); r.fromBufferAttribute(pos, cc); T.add(q).add(r).multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld); return inside(T.x, T.z); };
      if (o.geometry.groups && o.geometry.groups.length > 1) { const cpy = o.clone(); cpy.geometry = o.geometry; o.matrixWorld.decompose(cpy.position, cpy.quaternion, cpy.scale); out.add(cpy); return; }
      const sub = ioSubGeo(o, keep); if (sub) out.add(sub);
    }
    for (const ch of o.children) walk(ch);
  };
  for (const ch of scene.children) walk(ch);
  const g = new THREE.Group(); g.add(out); if (opt.center) out.position.set(-cx, -carGroundHeight(cx, cz), -cz); return g;
}

/* ---------------- janelas ---------------- */
function openImport3D() {
  const fileIn = el('input', { type: 'file', multiple: true, accept: '.fbx,.glb,.gltf,.bin,.obj,.mtl,.dae,.stl,.ply,.3ds,.png,.jpg,.jpeg,.tga,.dds,.bmp,.webp,.gif' });
  const dirIn = el('input', { type: 'file', webkitdirectory: true, multiple: true });
  const name = el('input', { type: 'text', placeholder: 'nome na biblioteca' }), id = el('input', { type: 'text', placeholder: 'automático' });
  const unit = el('select', {}, [['auto', 'Automático'], ['1', 'Metros (Blender, Unity, glTF)'], ['0.01', 'Centímetros (Unreal, 3ds Max, Maya)'], ['0.0254', 'Polegadas'], ['0.1', 'Decímetros']].map(([v, t]) => el('option', { value: v }, t)));
  const zUp = el('input', { type: 'checkbox' }), center = el('input', { type: 'checkbox' }); center.checked = true;
  const prev = el('div', { class: 'ed-imp-prev' }, el('p', { class: 'ed-hint' }, 'Escolha o arquivo do modelo e as texturas dele (ou a pasta inteira).')), go = el('button', { class: 'primary', disabled: true }, 'Importar para a biblioteca');
  let files = null, loaded = null, prepared = null;
  const build = async () => {
    if (!files) return; go.disabled = true; prev.textContent = 'Lendo…';
    try {
      if (!loaded) { loaded = await ioLoadFiles(files); if (!name.value) name.value = loaded.main.name.replace(/\.[^.]+$/, ''); }
      const src = loaded.obj.clone(true); prepared = ioPrepare(src, { ext: ioExt(loaded.main.name), unit: unit.value, zUp: zUp.checked, center: center.checked });
      const url = await thumbOf('imp:' + Math.random(), () => prepared.root);
      prev.textContent = ''; prev.append(el('img', { src: url, alt: '' }), el('div', {},
        el('b', {}, loaded.main.name), el('div', {}, prepared.dims.width + ' × ' + prepared.dims.height + ' × ' + prepared.dims.len + ' m (L × A × C)'),
        el('div', {}, prepared.tris.toLocaleString('pt-BR') + ' triângulos · ' + prepared.materials + ' materiais · escala ' + prepared.unit),
        loaded.missing.length ? el('div', { class: 'ed-warn' }, 'Texturas que faltaram: ' + loaded.missing.slice(0, 6).join(', ') + (loaded.missing.length > 6 ? '…' : '') + ' — escolha a pasta inteira ou inclua as imagens.') : null));
      go.disabled = false;
    } catch (e) { prev.textContent = 'Não deu para ler: ' + e.message; console.error(e); }
  };
  const pickFiles = f => { files = f && f.length ? [...f] : null; if (loaded) loaded.release(); loaded = null; build(); };
  fileIn.addEventListener('change', () => pickFiles(fileIn.files)); dirIn.addEventListener('change', () => pickFiles(dirIn.files));
  for (const x of [unit, zUp, center]) x.addEventListener('change', build);
  go.addEventListener('click', async () => {
    if (!prepared) return; if (!ED.api) { edToast('Precisa do servidor do editor para gravar no projeto.'); return; }
    go.disabled = true; const old = go.textContent; go.textContent = 'Convertendo para GLB…';
    try {
      const glb = await ioGLB(prepared.root), oid = ioSafe(id.value || name.value || loaded.main.name).replace(/^(\d)/, 'm_$1');
      await edApi('save-object', { id: oid, name: name.value || oid, glb: ioB64(glb), dims: prepared.dims, triangles: prepared.tris, source: loaded.main.name });
      MAP_GLB.delete(oid); await edLoadModels(); setLibTab('model'); closeModal(); edToast('Importado: ' + (name.value || oid) + ' (' + (glb.byteLength / 1048576).toFixed(1) + ' MB)');
      edStartPlacing({ type: 'gltf', ref: oid, __key: 'g:' + oid });
    } catch (e) { edToast('Falhou: ' + e.message, 5000); console.error(e); }
    go.textContent = old; go.disabled = false;
  });
  modal('Importar modelo 3D', el('div', { class: 'ed-imp' },
    el('p', { class: 'ed-hint' }, 'FBX, glTF/GLB, OBJ (+MTL), DAE, STL, PLY e 3DS — os formatos que a Unity, a Unreal, o Blender e o SketchUp exportam. Texturas: PNG, JPG, TGA, DDS, BMP.'),
    field('Arquivos', fileIn), field('ou a pasta', dirIn), field('Nome', name), field('ID', id), field('Unidade do arquivo', unit),
    el('div', { class: 'ed-checks' }, el('label', { class: 'ed-check' }, zUp, 'Z para cima (3ds Max, SketchUp, STL)'), el('label', { class: 'ed-check' }, center, 'Base no chão e centro na origem')),
    prev, el('div', { class: 'ed-actions' }, el('button', { onclick: openImport }, 'GTA SA (DFF + TXD)…'), el('button', { onclick: openImportIV }, 'GTA IV (OpenIV)…'), el('span', { class: 'ed-spacer' }), go)), true);
}
function openExport() {
  const sel = ED.sel ? ioSelection() : null, fmt = el('select', {}, el('option', { value: 'glb' }, 'GLB (glTF binário, com texturas)'), el('option', { value: 'obj' }, 'OBJ (só geometria)'));
  const radius = el('input', { type: 'range', min: 40, max: 800, step: 10, value: 200 }), rv = el('span', { class: 'ed-sv' }, '200 m');
  radius.addEventListener('input', () => { rv.textContent = radius.value + ' m'; });
  const opt = { terrain: el('input', { type: 'checkbox', checked: true }), city: el('input', { type: 'checkbox', checked: true }), objects: el('input', { type: 'checkbox', checked: true }), center: el('input', { type: 'checkbox', checked: true }) };
  const status = el('p', { class: 'ed-hint' });
  const run = async (what) => {
    status.textContent = 'Montando…'; await new Promise(r => setTimeout(r, 30));
    try {
      let obj, name;
      if (what === 'sel') { obj = sel.obj; name = sel.name; }
      else if (what === 'placed') { obj = new THREE.Group(); for (const r of ED.roots.values()) if (r.userData.kind === 'object' || r.userData.kind === 'vehicle') { const c = r.userData.kind === 'vehicle' && r.userData.visual ? r.userData.visual.clone(true) : ioPlaced(r); c.position.copy(r.position); c.quaternion.copy(r.quaternion); obj.add(c); } name = 'objetos_do_mapa'; }
      else { const hit = edHitPoint(edCenterRay()), p = hit ? hit.p : new THREE.Vector3(fly.x, 0, fly.z); obj = ioRegion(p.x, p.z, +radius.value, { terrain: opt.terrain.checked, city: opt.city.checked, objects: opt.objects.checked, center: opt.center.checked });
        name = 'regiao_' + Math.round(p.x) + '_' + Math.round(p.z) + '_' + radius.value + 'm'; }
      let n = 0; obj.traverse(o => { if (o.isMesh) n++; }); if (!n) { status.textContent = 'Nada para exportar aí.'; return; }
      status.textContent = 'Gerando ' + fmt.value.toUpperCase() + ' (' + n + ' malhas)…'; await new Promise(r => setTimeout(r, 30));
      await ioExport(obj, name, fmt.value); status.textContent = 'Pronto: ' + name + '.' + fmt.value;
    } catch (e) { status.textContent = 'Falhou: ' + e.message; console.error(e); }
  };
  const chk = (k, t) => el('label', { class: 'ed-check' }, opt[k], t);
  modal('Exportar modelo 3D', el('div', {},
    el('p', { class: 'ed-hint' }, 'GLB abre na Unreal Engine 5 (importação nativa), no Blender e na Unity (pacote glTFast). OBJ abre em qualquer programa, sem texturas. Unidade: metros, Y para cima.'),
    field('Formato', fmt),
    el('h4', {}, 'Selecionado'), sel ? el('div', { class: 'ed-actions' }, el('span', {}, edLabel(edDef(ED.sel), ED.sel)), el('span', { class: 'ed-spacer' }), el('button', { onclick: () => run('sel') }, 'Exportar seleção')) : el('p', { class: 'ed-empty' }, 'Nada selecionado (selecione um objeto, carro ou prédio da cidade).'),
    el('h4', {}, 'Objetos colocados'), el('div', { class: 'ed-actions' }, el('span', {}, ED.map.objects.length + ' objetos e ' + ED.map.vehicles.length + ' carros, nas posições do mapa'), el('span', { class: 'ed-spacer' }), el('button', { onclick: () => run('placed') }, 'Exportar todos')),
    el('h4', {}, 'Região do mapa (em volta de onde a câmera aponta)'), el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, 'Raio'), el('div', { class: 'ed-slider' }, radius, rv)),
    el('div', { class: 'ed-checks' }, chk('terrain', 'Terreno'), chk('city', 'Cidade (prédios, ruas, árvores)'), chk('objects', 'Objetos colocados'), chk('center', 'Centralizar na origem')),
    el('div', { class: 'ed-actions' }, el('span', { class: 'ed-spacer' }), el('button', { class: 'primary', onclick: () => run('region') }, 'Exportar região')), status), true);
}

/* ---------- GTA IV: pasta com .wdr/.wdd/.wft + .wtd exportados com o OpenIV ---------- */
function openImportIV() {
  const dir = el('input', { type: 'text', placeholder: 'C:\\...\\export\\vegetacao' }), cat = el('input', { type: 'text', value: 'Vegetação (GTA IV)' });
  const br = el('input', { type: 'checkbox' }), grass = el('input', { type: 'checkbox' }), log = el('pre', { class: 'ed-log' }), go = el('button', { class: 'primary' }, 'Converter para a biblioteca');
  const pick = async () => { try { const r = await edApi('pick', { title: 'Pasta com os arquivos do GTA IV', dir: true }); if (r.files && r.files[0]) dir.value = r.files[0]; } catch (e) { edToast(e.message); } };
  go.addEventListener('click', async () => {
    go.disabled = true; log.textContent = 'Convertendo…';
    try { const { job } = await edApi('gta4-import', { dir: dir.value.trim(), cat: cat.value.trim(), brasil: br.checked, grama: grass.checked });
      const j = await edJob(job, t => { log.textContent = t; log.scrollTop = log.scrollHeight; });
      if (j.code === 0) { await edLoadModels(); setLibTab('model'); log.textContent += '\nPronto: os objetos estão na aba Modelos, categoria "' + cat.value + '".'; } else log.textContent += '\nNão deu certo (código ' + j.code + ').';
    } catch (e) { log.textContent = 'Erro: ' + e.message; }
    go.disabled = false;
  });
  modal('Importar do GTA IV', el('div', {},
    el('p', { class: 'ed-hint' }, 'Os .img do GTA IV têm o índice criptografado: abra-os no OpenIV, selecione os objetos (ou tudo) e use Exportar para uma pasta. Traga também os .wtd (texturas) — às vezes ficam em outro .img com o mesmo nome do .ide. Boas fontes: pc/data/maps/props/vegetation/ext_veg.img (árvores e plantas), props/roadside/ (lixeiras, lixo, postes, placas, semáforos, cercas), props/street/ (bancos, hidrantes, caixas elétricas).'),
    field('Pasta', el('div', { class: 'ed-pick' }, dir, ED.desktop ? el('button', { onclick: pick }, 'Procurar…') : null)), field('Categoria', cat),
    el('div', { class: 'ed-checks' }, el('label', { class: 'ed-check' }, br, 'Adaptar para o Brasil (cores de lixeira, hidrante, poste, placas)'), el('label', { class: 'ed-check' }, grass, 'Texturas de planta viram moitas (ex.: plantsmgr.wtd)')),
    el('div', { class: 'ed-actions' }, el('span', { class: 'ed-spacer' }), go), log));
}
