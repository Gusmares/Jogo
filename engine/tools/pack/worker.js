/* NEON ENGINE - pack-import: parte que roda DENTRO da janela Electron oculta (precisa de DOM/WebGL/three r128).
   Quem chama é engine/tools/pack-import.js (window.packRun). Aqui: ler FBX/GLB/DAE/OBJ..., achar os modelos soltos dentro do arquivo,
   inspecionar (triangulos, caixa, materiais, alpha) e exportar um GLB por modelo (so com o que ele usa). */
'use strict';
const MISSING = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PX = { texIndex: null, used: new Set(), log: (...a) => console.log(...a) };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (v, n = 2) => +(+v).toFixed(n);
const post = (p, body, type) => fetch('/out?path=' + encodeURIComponent(p), { method: 'POST', body, headers: { 'Content-Type': type || 'application/octet-stream', 'X-Pack-Token': window.__tok || '' } }).then(async r => { if (!r.ok) throw new Error('gravar ' + p + ': ' + (await r.text())); });

/* ================= nomes ================= */
const GENERIC = /^(mesh|object|obj|cube|sphere|cylinder|plane|cone|torus|circle|group|node|default|scene|rootnode|root|model|geometry|geo|shape|polysurface|pcube|pcylinder|psphere|material|mat|atlas|sketchfab_model|untitled|collection|empty|text|default_material|lambert\d*|phong\d*|standardsurface\d*|blinn\d*)$/i;
const QUALITY = /^(mid|low|high|ultra|lod\d*|\d+k|basecolor|base|color|colour|albedo|diffuse|diff|normal|nor|nrm|roughness|rough|metallic|metalness|metal|ao|opacity|alpha|emissive|specular|gl|dx|jpg|jpeg|png|tga|v\d+)$/i;
const SPECIES = { apple: 'Macieira', ash: 'Freixo', cherry: 'Cerejeira', plum: 'Ameixeira', fir: 'Abeto', 'noble fir': 'Abeto-nobre', pine: 'Pinheiro', birch: 'Bétula', maple: 'Bordo', oak: 'Carvalho', holly: 'Azevinho', palm: 'Palmeira', willow: 'Salgueiro', spruce: 'Abeto', cedar: 'Cedro', elm: 'Olmo', beech: 'Faia', poplar: 'Choupo', cypress: 'Cipreste', acacia: 'Acácia', banana: 'Bananeira', coconut: 'Coqueiro', mango: 'Mangueira' };
const WORDS = { orelhao: 'Orelhão', tree: 'árvore', trees: 'árvores', shrub: 'arbusto', bush: 'arbusto', grass: 'grama', fern: 'samambaia', flower: 'flor', flowers: 'flores', plant: 'planta', plants: 'plantas', weed: 'erva daninha', moss: 'musgo', mossy: 'com musgo', log: 'tronco caído', stump: 'toco', trunk: 'tronco', branch: 'galho', leaf: 'folha', leaves: 'folhas', sapling: 'muda', bamboo: 'bambu', creeper: 'trepadeira', clover: 'trevo', mushroom: 'cogumelo', rock: 'pedra', rocks: 'pedras', boulder: 'rocha', outcrop: 'afloramento', stone: 'pedra', dead: 'morta', dry: 'seca', large: 'grande', medium: 'média', small: 'pequena', big: 'grande', plain: 'lisa', orange: 'laranja', coniferous: 'conífera', deciduous: 'caducifólia', raspberry: 'framboeseira', bench: 'banco', bin: 'lixeira', trash: 'lixo', garbage: 'lixo', dumpster: 'caçamba', hydrant: 'hidrante', fire: 'incêndio', mailbox: 'caixa de correio', sign: 'placa', signs: 'placas', barrel: 'barril', cone: 'cone', lamp: 'luminária', pole: 'poste', post: 'poste', fence: 'cerca', barrier: 'barreira', bus: 'ônibus', stop: 'ponto', busstop: 'ponto de ônibus', parking: 'estacionamento', meter: 'parquímetro', parkingmeter: 'parquímetro', phone: 'telefone', payphone: 'telefone público', traffic: 'trânsito', light: 'luz', crate: 'caixote', box: 'caixa', pallet: 'palete', road: 'rua', roads: 'ruas', sidewalk: 'calçada', street: 'rua', crosswalk: 'faixa de pedestres', intersection: 'cruzamento', curb: 'meio-fio', manhole: 'bueiro', speed: 'velocidade', limit: 'limite', electric: 'elétrico', electricsign: 'letreiro elétrico', sidewalks: 'calçadas', corner: 'esquina', straight: 'reta', turn: 'curva', curve: 'curva', lot: 'terreno' };
const UPPER1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function rawWords(name) {
  let s = String(name || '').replace(/\.(fbx|obj|glb|gltf|dae|3ds|blend)$/i, '').replace(/^_[a-z0-9]{3,5}_(?=[A-Za-z])/, '').replace(/\.\d{3}$/, '');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/[_\-.\s@=]+/g, ' ').trim();
  return s ? s.split(' ') : [];
}
/* nome de arquivo de textura -> nome da planta/objeto ("Silvery_Glade_Fern_xf5lebcqx_Mid_2K_BaseColor..." -> "Silvery Glade Fern") */
function nameFromTexture(fn) {
  const t = String(fn).split('/').pop().replace(/\.[a-z0-9]+$/i, '').split(/[_\-\s.@=()]+/).filter(Boolean);
  let i = t.findIndex(w => QUALITY.test(w)); if (i < 0) i = t.length; let w = t.slice(0, i);
  if (w.length > 1 && /^[a-z0-9]{4,10}$/.test(w[w.length - 1]) && (/\d/.test(w[w.length - 1]) || i < t.length)) w = w.slice(0, -1);   // o código aleatório do site de origem
  return w.filter(x => !/^\d+$/.test(x)).flatMap(x => rawWords(x));
}
function parseName(raw0) {                                   // -> { words, variant, lod }
  const raw = String(raw0 || '').replace(/^_[a-z0-9]{3,5}_(?=[A-Za-z])/, '');           // prefixo aleatório do exportador ("_9268_VarA_LOD1")
  const m = /(?:^|[_\s.\-])lod[_\s.\-]?(\d+)(?=$|[_\s.\-])/i.exec(raw), lod = m ? +m[1] : null;
  const vm = /(?:^|[_\s.\-])var[_\s\-]?([a-z0-9])(?=$|[_\s.\-])/i.exec(raw), variant = vm ? vm[1].toUpperCase() : null;
  let words = rawWords(String(raw).replace(/(?:^|[_\s.\-])lod[_\s.\-]?\d+(?=$|[_\s.\-])/ig, ' ').replace(/(?:^|[_\s.\-])var[_\s\-]?[a-z0-9](?=$|[_\s.\-])/ig, ' '));
  words = words.filter(w => !/^\d+k$/i.test(w));
  const keep = []; let skipNum = false;                         // "pCylinder2 Telephone_Poll": tira p/Cylinder/2 e fica "Telephone Poll"
  for (const x of words) { if (/^p$/i.test(x) || /^(cube|sphere|cylinder|plane|cone|torus|mesh|object|group|node)$/i.test(x)) { skipNum = true; continue; } if (skipNum && /^\d+$/.test(x)) { skipNum = false; continue; } skipNum = false; keep.push(x); }
  if (keep.length && keep.length < words.length) words = keep;
  return { words, variant, lod };
}
const allGeneric = words => !words.length || words.every(w => GENERIC.test(w) || /^\d+$/.test(w));
function ptName(words) {                                      // tradução leve: espécies e substantivos comuns; o resto fica como está
  let w = words.map(x => x.toLowerCase()); const out = [];
  const iTree = w.indexOf('tree');
  if (iTree >= 0) { for (let n = 2; n >= 1; n--) for (let i = 0; i + n <= w.length; i++) { const k = w.slice(i, i + n).join(' '); if (SPECIES[k] && i + n === iTree) { const r = w.slice(); r.splice(i, n + 1, '\u0001' + SPECIES[k]); w = r; n = 0; break; } } }
  for (const x of w) out.push(x[0] === '\u0001' ? x.slice(1) : (WORDS[x] || (SPECIES[x] && x !== 'ash' ? SPECIES[x].toLowerCase() : x)));
  return UPPER1(out.join(' ').trim());
}
const slugOf = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const T_ROAD = new Set('road roads sidewalk sidewalks crosswalk asphalt intersection curb pavement rua calcada'.split(' ')), T_NAT = new Set('rock rocks boulder boulders stone stones stump log logs pebble cliff trunk'.split(' '));
const T_VEG = new Set('tree trees plant plants grass fern bush shrub leaf leaves flower flowers weed moss palm branch sapling bamboo creeper clover herb vine ivy reed cattail foliage hedge conifer coniferous fir pine birch oak maple cherry plum ash holly raspberry plantain chamomile oregano burdock spindle rose kangaroo broom tundra capim mato arvore grama deciduous thistle nettle dandelion daisy lavender sage mint clump'.split(' '));
const L_VEG = ['bamboo', 'creeper', 'foliage', 'plantain', 'chamomile', 'oregano', 'burdock', 'spindle', 'kangaroo', 'sapling', 'conifer', 'deciduous', 'dandelion', 'lavender', 'raspberry', 'tundra', 'shrub', 'flower', 'grass'];
const T_URB = new Set('bench bin bins trash dumpster hydrant sign signs mailbox phone telephone payphone barrel cone lamp pole poll post fence barrier bus parking meter traffic crate pallet manhole drain garbage container electric orelhao bollard cart box vent antenna light streetlamp barricade'.split(' ')), L_URB = ['dumpster', 'hydrant', 'mailbox', 'parking', 'barrier', 'lamp', 'bench', 'telephone', 'trash', 'garbage', 'barrel', 'bollard', 'sign'];
function classify(text, alphaMask) {
  const toks = rawWords(text.replace(/[\\/]/g, ' ')).map(x => x.toLowerCase()).filter(x => x.length > 1);
  if (toks.some(t => T_ROAD.has(t))) return 'estrada';
  if (toks.some(t => T_NAT.has(t)) && !toks.some(t => T_VEG.has(t) && t !== 'dead')) return 'natureza';
  if (toks.some(t => T_VEG.has(t) || (t.length >= 5 && L_VEG.some(l => t.includes(l) && !/^street/.test(t))))) return 'vegetação';
  if (toks.some(t => T_URB.has(t) || (t.length >= 5 && L_URB.some(l => t.includes(l))))) return 'urbano';
  return alphaMask ? 'vegetação' : 'outro';
}

/* ================= leitura ================= */
function pickTex(cands, dir) {
  if (!cands || !cands.length) return null; if (cands.length === 1) return cands[0];
  let best = cands[0], bs = -1; for (const c of cands) { let k = 0; while (k < c.length && k < dir.length && c[k] === dir[k]) k++; if (k > bs) { bs = k; best = c; } } return best;
}
function findTex(base, dir) {
  const lb = base.toLowerCase(), stem = lb.replace(/\.[a-z0-9]+$/, '');
  const hit = pickTex(PX.texIndex.names[lb], dir) || pickTex(PX.texIndex.stems[stem], dir) || pickTex(PX.texIndex.stems[stem.replace(/[^a-z0-9]+/g, '')], dir);
  if (hit) return hit;
  // nomes de arquivo truncados pelo exportador (ex.: "..._BaseColo.png", "..._Dama.png"): o arquivo existente é prefixo do pedido
  if (stem.length > 20) { let best = null, bl = 0; for (const k of Object.keys(PX.texIndex.stems)) { if (k.length < 20 || k.length >= stem.length || k.length <= bl || !stem.startsWith(k)) continue; const tail = stem.slice(k.length); if (tail.length <= 3 || /basecolor|albedo|diffuse/.test(stem)) { best = k; bl = k.length; } } if (best) return pickTex(PX.texIndex.stems[best], dir); }
  return null;
}
const imgPath = im => { const s = im && im.src; if (typeof s !== 'string') return null; if (s.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')) return { missing: decodeURIComponent(s.split('#')[1] || '?') }; const i = s.indexOf('/p/'); return i >= 0 ? { rel: decodeURIComponent(s.slice(i + 3).split('?')[0]) } : null; };

/* nomes das imagens de cada material do glTF (o carregador entrega só o bitmap, sem o nome do arquivo) */
function glbTexNames(d) {
  let j; try { if (typeof d === 'string') j = JSON.parse(d); else { const dv = new DataView(d); j = JSON.parse(new TextDecoder().decode(new Uint8Array(d, 20, dv.getUint32(12, true)))); } } catch (e) { return {}; }
  const img = t => { const tx = t && j.textures && j.textures[t.index], im = tx && j.images && j.images[tx.source]; return im ? (im.name || im.uri || null) : null; }, out = {};
  for (const m of j.materials || []) { const p = m.pbrMetallicRoughness || {}; out[m.name || ''] = { map: img(p.baseColorTexture), normalMap: img(m.normalTexture), roughnessMap: img(p.metallicRoughnessTexture), metalnessMap: img(p.metallicRoughnessTexture), emissiveMap: img(m.emissiveTexture), aoMap: img(m.occlusionTexture) }; }
  return out;
}
async function loadFile(rel) {
  const ext = rel.split('.').pop().toLowerCase(), dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '', info = { missing: new Set(), used: new Set(), upAxis: null, unitMeters: null, ext };
  PX.cur = info; const manager = new THREE.LoadingManager(); let pending = 0; const is = manager.itemStart.bind(manager), ie = manager.itemEnd.bind(manager);
  manager.itemStart = u => { pending++; is(u); }; manager.itemEnd = u => { pending--; ie(u); };
  manager.setURLModifier(u => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return u;
    const clean = decodeURIComponent(u.split('?')[0]), base = clean.split(/[\\/]/).pop();
    if (/\.(bin)$/i.test(base)) { const h = findTex(base, dir) || (dir + base); return '/p/' + encodeURI(h); }
    const hit = findTex(base, dir); if (hit) { info.used.add(hit); PX.used.add(hit); return '/p/' + encodeURI(hit); }
    info.missing.add(base); return MISSING + '#' + encodeURIComponent(base);
  });
  if (THREE.TGALoader) manager.addHandler(/\.tga$/i, new THREE.TGALoader(manager));
  if (THREE.DDSLoader) manager.addHandler(/\.dds$/i, new THREE.DDSLoader(manager));
  const res = await fetch('/p/' + encodeURI(rel)); if (!res.ok) throw new Error('não abriu ' + rel);
  let obj;
  if (ext === 'fbx') obj = new THREE.FBXLoader(manager).parse(await res.arrayBuffer(), '/p/' + dir);
  else if (ext === 'glb' || ext === 'gltf') obj = (await new Promise(async (ok, fail) => { try { const d = ext === 'glb' ? await res.arrayBuffer() : await res.text(); info.glbTex = glbTexNames(d); new THREE.GLTFLoader(manager).parse(d, '/p/' + dir, ok, fail); } catch (e) { fail(e); } })).scene;
  else if (ext === 'dae') { const txt = await res.text(); const m = /<up_axis>\s*([XYZ])_UP/i.exec(txt), u = /<unit[^>]*meter="([\d.eE+-]+)"/i.exec(txt); info.upAxis = m ? m[1].toUpperCase() + '_UP' : null; info.unitMeters = u ? +u[1] : null; obj = new THREE.ColladaLoader(manager).parse(txt, '/p/' + dir).scene; }
  else if (ext === '3ds') obj = new THREE.TDSLoader(manager).parse(await res.arrayBuffer(), '/p/' + dir);
  else if (ext === 'obj') {
    const L = new THREE.OBJLoader(manager), stem = rel.replace(/\.[^.]+$/, ''), mtlRel = (PX.texIndex.mtl || []).find(m => m.replace(/\.[^.]+$/, '') === stem) || (PX.texIndex.mtl || []).find(m => m.startsWith(dir));
    if (mtlRel) { const mc = new THREE.MTLLoader(manager).parse(await (await fetch('/p/' + encodeURI(mtlRel))).text(), '/p/' + mtlRel.slice(0, mtlRel.lastIndexOf('/') + 1)); mc.preload(); L.setMaterials(mc); info.mtl = mtlRel; }
    obj = L.parse(await res.text());
  } else if (ext === 'stl' || ext === 'ply') {
    const g = (ext === 'stl' ? new THREE.STLLoader(manager) : new THREE.PLYLoader(manager)).parse(await res.arrayBuffer()); if (!g.attributes.normal) g.computeVertexNormals();
    obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.8, vertexColors: !!g.attributes.color }));
  } else throw new Error('formato .' + ext + ' não suportado');
  obj.updateMatrixWorld(true);
  autoTextures(obj, info, manager, dir);
  await sleep(60); for (let k = 0; k < 600 && pending > 0; k++) await sleep(100);
  await waitTextures(obj);
  return { root: obj, info };
}
/* pack sem referência de textura dentro do modelo (DAE sem library_images, OBJ sem MTL): casa por nome
   (material ou malha + albedo/basecolor/alpha/normal/roughness/metallic/emissive) com os arquivos da pasta */
function chanOf(stem) {                                                  // "Grass_Cloves_alpha_(256)" -> { slot: 'map', body: 'grasscloves' }
  let s = stem.toLowerCase().replace(/[\s_\-]*\(?\d{2,4}\)?$/, '').replace(/[\s_\-]*(1k|2k|4k|8k)$/, '');
  const m = /(?:[_\-\s](n|nor|col|diff|alpha)|(basecolor|base_color|albedo|diffuse|color|colour|alpha|normalgl|normaldx|normal|nrm|norm|roughness|rough|metallic|metalness|metal|emissive|emission|emit|opacity|ao))$/.exec(s);
  const norm = x => x.replace(/[^a-z0-9]+/g, '');
  if (!m) return { slot: 'map', body: norm(s) };                          // sem sufixo: é a cor
  const w = m[1] || m[2], body = norm(s.slice(0, s.length - m[0].length));
  const slot = /^(n|nor|normalgl|normaldx|normal|nrm|norm)$/.test(w) ? 'normalMap' : /^rough/.test(w) ? 'roughnessMap' : /^metal/.test(w) ? 'metalnessMap' : /^emi/.test(w) ? 'emissiveMap' : /^(ao|opacity)$/.test(w) ? null : 'map';
  return { slot, body };
}
function autoTextures(root, info, manager, dir) {
  const stems = Object.keys(PX.texIndex.stems), tl = new THREE.TextureLoader(manager); let n = 0;
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ''), chans = stems.map(st => Object.assign({ st }, chanOf(st))).filter(c => c.slot && c.body.length >= 3);
  const mats = new Map(); root.traverse(o => { if (o.isMesh) meshMats(o).forEach(m => { if (m && !mats.has(m)) mats.set(m, o.name); }); });
  for (const [m, meshName] of mats) {
    if (m.map) continue;
    const keys = [m.name, meshName].filter(k => k && !GENERIC.test(String(k).replace(/\.\d+$/, ''))).map(k => norm(String(k).replace(/\.\d+$/, ''))).filter(k => k.length >= 3); if (!keys.length) continue;
    for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
      let best = null;
      for (const c of chans) if (c.slot === slot && keys.some(k => c.body === k || c.body.endsWith(k) || c.body === k + 'material')) { if (!best || c.body.length < best.body.length) best = c; }
      if (!best) continue; const rel = pickTex(PX.texIndex.stems[best.st], dir); if (!rel) continue;
      m[slot] = tl.load('/p/' + encodeURI(rel)); info.used.add(rel); PX.used.add(rel); n++; m.__auto = true;
    }
  }
  info.autoTex = n;
}
async function waitTextures(root) {
  const K = ['map', 'normalMap', 'emissiveMap', 'aoMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'specularMap'], ok = t => { const i = t && t.image; return !!(i && (i.width || i.videoWidth || i.naturalWidth) && (i.complete === undefined || i.complete)); };
  const mats = new Set(); root.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); });
  for (let k = 0; k < 300; k++) { let wait = false; for (const m of mats) for (const key of K) if (m[key] && !m[key].isCompressedTexture && m[key].image && !ok(m[key])) wait = true; if (!wait) break; await sleep(100); }
}

/* ================= imagens ================= */
const imgCache = new WeakMap();
function drawable(im) {
  if (!im) return null;
  if (im.data && im.width && im.height) {                                  // TGA etc.: pixels crus
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const n = im.width * im.height, d = new Uint8ClampedArray(n * 4);
    if (im.data.length === n * 4) d.set(im.data); else if (im.data.length === n * 3) for (let i = 0, j = 0; i < n; i++, j += 3) { d[i * 4] = im.data[j]; d[i * 4 + 1] = im.data[j + 1]; d[i * 4 + 2] = im.data[j + 2]; d[i * 4 + 3] = 255; } else return null;
    c.getContext('2d').putImageData(new ImageData(d, im.width, im.height), 0, 0); return { src: c, w: c.width, h: c.height };
  }
  const w = im.naturalWidth || im.videoWidth || im.width, h = im.naturalHeight || im.videoHeight || im.height; if (!w || !h) return null;
  if (typeof im.src === 'string' && im.src.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')) return null;
  return { src: im, w, h };
}
/* textura -> canvas reduzido (aspecto mantido) + fração de pixels transparentes. role: 'color' (mede alpha) ou 'data' */
function procTex(tex, role, maxTex) {
  const im = tex && tex.image, d = drawable(im); if (!d) return null;
  const key = role + ':' + maxTex; let slot = imgCache.get(im); if (!slot) imgCache.set(im, slot = {}); if (slot[key]) return slot[key];
  const s = Math.min(1, maxTex / Math.max(d.w, d.h)), w = Math.max(1, Math.round(d.w * s)), h = Math.max(1, Math.round(d.h * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(d.src, 0, 0, w, h);
  let alpha = 0, opaqueNonWhite = 0;
  if (role === 'color') { const px = g.getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] < 250) n++; alpha = n / (w * h); }
  const t = new THREE.Texture(c); t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.repeat.copy(tex.repeat); t.offset.copy(tex.offset); t.rotation = tex.rotation; t.name = tex.name || '';
  t.format = alpha > 0.002 ? THREE.RGBAFormat : THREE.RGBFormat;
  return slot[key] = { tex: t, alpha, w: d.w, h: d.h, ow: w, oh: h, name: imgPath(im) };
}
/* metalness + roughness em arquivos separados -> um só (G = rugosidade, B = metal), como o glTF pede */
function packORM(rough, metal, rVal, mVal, maxTex) {
  const a = rough && drawable(rough.image), b = metal && drawable(metal.image), W = Math.max(a ? a.w : 1, b ? b.w : 1), H = Math.max(a ? a.h : 1, b ? b.h : 1), s = Math.min(1, maxTex / Math.max(W, H)), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const px = (dr) => { if (!dr) return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(dr.src, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
  const A = px(a), B = px(b), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), out = g.createImageData(w, h);
  for (let i = 0; i < w * h * 4; i += 4) { out.data[i] = 255; out.data[i + 1] = A ? A[i + 1] : Math.round(rVal * 255); out.data[i + 2] = B ? B[i + 1] : Math.round(mVal * 255); out.data[i + 3] = 255; }
  g.putImageData(out, 0, 0); const t = new THREE.Texture(c); t.flipY = (rough || metal).flipY; t.format = THREE.RGBFormat; return t;
}

/* ================= unidades (modelos soltos dentro do arquivo) ================= */
const isJunkName = n => /^(text|label|labels|caption|camera|cam|light|lamp light|sun|world|floor_label)[\s._-]?\d*$/i.test(n || '');
const meshMats = m => Array.isArray(m.material) ? m.material : [m.material];
function triOf(m) { const g = m.geometry; return g ? (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3 : 0; }
function boxOf(n) { n.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(n); }
function hasMesh(n) { let f = false; n.traverse(o => { if (o.isMesh && o.visible !== false) f = true; }); return f; }
function isJunk(n) {
  if (isJunkName(n.name) || n.isLight || n.isCamera) return true;
  if (n.isMesh && !n.children.length && meshMats(n).every(m => /^text/i.test(m && m.name || ''))) return true;
  return false;
}
function boxesJoin(a, b, eps) {
  for (let i = 0; i < 3; i++) { const lo = Math.max(a.min.getComponent(i), b.min.getComponent(i)), hi = Math.min(a.max.getComponent(i), b.max.getComponent(i)); if (hi - lo < -eps) return false; }
  return true;
}
function cluster(pieces, eps) {
  const p = pieces.map((_, i) => i), f = i => { while (p[i] !== i) i = p[i] = p[p[i]]; return i; };
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) if (boxesJoin(pieces[i].box, pieces[j].box, eps)) p[f(i)] = f(j);
  const g = new Map(); pieces.forEach((x, i) => { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(x); }); return [...g.values()];
}
function sceneEps(root) { const b = boxOf(root), d = b.getSize(new THREE.Vector3()); return Math.max(d.x, d.y, d.z) * 0.0005; }
/* irmãos com nome próprio e que não se sobrepõem de verdade = modelos separados (cada um com seu nome); partes de um mesmo modelo
   (tronco/folhas, esfera/cubo/cilindro do orelhão) têm nomes genéricos e/ou se sobrepõem muito */
function volOverlap(a, b) {
  let inter = 1, va = 1, vb = 1; for (let i = 0; i < 3; i++) { const sa = Math.max(a.max.getComponent(i) - a.min.getComponent(i), 1e-4), sb = Math.max(b.max.getComponent(i) - b.min.getComponent(i), 1e-4), lo = Math.max(a.min.getComponent(i), b.min.getComponent(i)), hi = Math.min(a.max.getComponent(i), b.max.getComponent(i)); inter *= Math.max(0, hi - lo); va *= sa; vb *= sb; }
  return inter / Math.min(va, vb);
}
const PART = new Set('trunk leaves leaf bark branch branches body door doors wheel wheels glass lid leg legs seat base top bottom frame handle handles screw bolt part parts detail details window windows light lights cap cover panel panels pipe pipes rim tire tyre foliage crown stem root roots'.split(' '));
function groupByName(pcs) {                                             // irmãos com o mesmo nome-base (partes "Telephone_Poll pCube2") viram um modelo só
  const m = new Map(); let n = 0;
  for (const p of pcs) { const q = parseName(p.node.name || ''), k = q.words.length && !allGeneric(q.words) ? q.words.join(' ').toLowerCase() + '|' + (q.variant || '') : '#' + (n++); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  return [...m.values()].flatMap(g => g.length > 1 ? cluster(g, 0) : [g]);
}
function separateByName(pcs) {
  if (pcs.length < 2) return false;
  const pn = pcs.map(p => parseName(p.node.name || '')), ws = pn.map(q => q.words), named = pn.filter(q => !allGeneric(q.words) || q.variant || q.lod !== null).length; if (named / pcs.length < 0.6) return false;
  if (ws.filter(w => w.some(x => PART.has(x.toLowerCase()))).length / pcs.length >= 0.4) return false;
  let deep = 0; for (let i = 0; i < pcs.length; i++) if (pcs.some((q, j) => j !== i && volOverlap(pcs[i].box, q.box) > 0.6)) deep++;
  return deep / pcs.length < 0.85;
}
const triNode = n => { let t = 0; n.traverse(o => { if (o.isMesh) t += triOf(o); }); return t; };
/* chão do mostruário: peça plana e grande que encosta em várias outras */
function dropGround(pieces, eps, ignored) {
  if (pieces.length < 4) return pieces;
  const medMax = (() => { const a = pieces.map(p => p.box.getSize(new THREE.Vector3()).length()).sort((x, y) => x - y); return a[Math.floor(a.length / 2)] || 0; })();
  const areas = pieces.map(p => { const s = p.box.getSize(new THREE.Vector3()), a = [s.x * s.y, s.x * s.z, s.y * s.z]; return Math.max(...a); }).sort((a, b) => a - b), med = areas[Math.floor(areas.length / 2)] || 0;
  return pieces.filter(p => {
    const s = p.box.getSize(new THREE.Vector3()), mx = Math.max(s.x, s.y, s.z), mn = Math.min(s.x, s.y, s.z), area = Math.max(s.x * s.y, s.x * s.z, s.y * s.z);
    const bigCard = triNode(p.node) <= 12 && mx > 3 * medMax;
    if (!bigCard && (mn > mx * 0.02 || area < med * 4)) return true;
    let n = 0; for (const q of pieces) if (q !== p && boxesJoin(p.box, q.box, eps)) n++;
    if (n >= 3) { ignored.push({ nome: p.node.name || '(sem nome)', motivo: 'chão/base do mostruário' }); return false; } return true;
  });
}
const isLeaf = n => { let c = 0; n.traverse(o => { if (o !== n && o.isMesh) c++; }); return n.isMesh && c === 0; };
function nodeMeshes(n) { const l = []; n.traverse(o => { if (o.isMesh && o.visible !== false && !isJunk(o) && o.geometry && o.geometry.attributes.position) l.push(o); }); return l; }

function findUnits(root, mode, eps, ignored) {
  const units = [];
  const pathOf = o => { const c = []; for (let p = o; p; p = p.parent) if (p.name) c.unshift(p.name); return c; };
  const mk = (pieces, chain) => ({ pieces, chain: chain.slice(), meshes: pieces.flatMap(p => nodeMeshes(p.node)) });
  const piece = n => ({ node: n, box: boxOf(n) });
  if (mode === 'whole') { units.push(mk([{ node: root, box: boxOf(root) }], [])); return units; }
  if (mode === 'meshes') { root.traverse(o => { if (o.isMesh && o.visible !== false && !isJunk(o)) units.push(mk([piece(o)], pathOf(o))); }); return units; }
  const visit = (node, depth) => {
    const kids = node.children.filter(c => c.visible !== false && hasMesh(c) && !isJunk(c));
    if (mode === 'roots' && depth === 0) { // cada filho direto vira um modelo (depois de atravessar invólucros de um filho só)
      let n = node; while (n.children.filter(c => hasMesh(c) && !isJunk(c)).length === 1 && !n.isMesh) n = n.children.find(c => hasMesh(c) && !isJunk(c));
      const ks = n.children.filter(c => c.visible !== false && hasMesh(c) && !isJunk(c)); if (!ks.length) { units.push(mk([piece(n)], pathOf(n))); return; }
      for (const k of dropGround(ks.map(piece), eps, ignored)) units.push(mk([k], pathOf(k.node))); return;
    }
    if (!kids.length) { if (node.isMesh && !isJunk(node)) units.push(mk([piece(node)], pathOf(node))); return; }
    if (kids.length === 1 && !node.isMesh) { visit(kids[0], depth + 1); return; }
    if (node.isMesh) { units.push(mk([piece(node)], pathOf(node))); return; }
    const pcs = dropGround(kids.map(piece), eps, ignored), cl = separateByName(pcs) ? groupByName(pcs) : cluster(pcs, eps);
    for (const c of cl) {
      if (c.length === 1) { const n = c[0].node; if (isLeaf(n) || n.isMesh) units.push(mk(c, pathOf(n))); else visit(n, depth + 1); }
      else units.push(mk(c, cl.length === 1 ? pathOf(node) : pathOf(c.slice().sort((a, b) => b.box.getSize(new THREE.Vector3()).length() - a.box.getSize(new THREE.Vector3()).length())[0].node)));
    }
  };
  visit(root, 0);
  return units.filter(u => u.meshes.length);
}

/* LOD: dentro de uma unidade (níveis empilhados) e entre unidades (cada nível em um lugar) */
function splitInnerLods(u) {
  const lv = new Map(); for (const m of u.meshes) { let l = null; for (let o = m; o && l === null; o = o.parent) { const p = parseName(o.name || '').lod; if (p !== null) l = p; if (u.pieces.some(pc => pc.node === o)) break; } lv.set(m, l); }
  const nums = [...new Set([...lv.values()].filter(x => x !== null))].sort((a, b) => a - b);
  if (nums.length < 2) return [];
  const keep = nums[0]; const dropped = u.meshes.filter(m => lv.get(m) !== null && lv.get(m) > keep); u.meshes = u.meshes.filter(m => !dropped.includes(m));
  const by = new Map(); for (const m of dropped) { const l = lv.get(m); by.set(l, (by.get(l) || 0) + triOf(m)); } return [...by].map(([lod, tris]) => ({ lod, tris: Math.round(tris) }));
}

/* ================= estatísticas / materiais ================= */
function texLabel(tex, mat, slot) { const p = tex && imgPath(tex.image); if (p && p.rel) return p.rel.split('/').pop(); if (p && p.missing) return null; const g = PX.cur && PX.cur.glbTex && mat && PX.cur.glbTex[mat.name]; if (g && g[slot]) return g[slot]; return (tex && tex.name) || (mat && mat.name ? mat.name + ':' + slot : 'embutida:' + slot); }
const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'];
function describeMat(m, scanMax) {
  const o = { nome: m.name || '(sem nome)', transparente: !!m.transparent, alphaTest: m.alphaTest || 0, dupla: m.side === THREE.DoubleSide, opacidade: m.opacity === undefined ? 1 : round(m.opacity), cor: m.color ? '#' + m.color.getHexString() : null, texturas: [], faltando: [] };
  for (const s of SLOTS) { const t = m[s]; if (!t || !t.image) continue; const p = imgPath(t.image); if (p && p.missing) { o.faltando.push(p.missing); continue; }
    const pr = procTex(t, s === 'map' ? 'color' : 'data', scanMax), e = { slot: s, arquivo: texLabel(t, m, s), w: pr ? pr.w : null, h: pr ? pr.h : null }; if (s === 'map' && pr) e.alfa = round(pr.alpha, 3); o.texturas.push(e); }
  o.temAlfa = o.texturas.some(t => t.alfa > 0.002); return o;
}
/* caixa exata pelos vértices (Box3.setFromObject do r128 usa a caixa girada da malha e infla objetos rotacionados) */
function exactBox(m, box) {
  const A = m.geometry.attributes.position, e = m.matrixWorld.elements, n = A.count; m.updateWorldMatrix(true, false);
  for (let i = 0; i < n; i++) { const x = A.getX(i), y = A.getY(i), z = A.getZ(i), X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; if (X < box.min.x) box.min.x = X; if (X > box.max.x) box.max.x = X; if (Y < box.min.y) box.min.y = Y; if (Y > box.max.y) box.max.y = Y; if (Z < box.min.z) box.min.z = Z; if (Z > box.max.z) box.max.z = Z; }
}
function unitStats(u, scanMax) {
  const box = new THREE.Box3(), mats = new Map(); let tris = 0, verts = 0;
  for (const m of u.meshes) { exactBox(m, box); tris += triOf(m); verts += m.geometry.attributes.position.count; for (const mt of meshMats(m)) if (mt && !mats.has(mt)) mats.set(mt, describeMat(mt, scanMax)); }
  u.box = box; u.size = box.getSize(new THREE.Vector3()); u.tris = Math.round(tris); u.verts = verts; u.matList = [...mats.keys()]; u.matInfo = [...mats.values()];
}

/* ================= inspect ================= */
async function inspectFile(rel, opt) {
  const t0 = performance.now(), { root, info } = await loadFile(rel), stem = rel.split('/').pop().replace(/\.[^.]+$/, ''), ign = [], warn = [];
  if (opt.mode === 'tree') { const L = []; const dump = (n, d) => { if (d > (opt.depth || 4)) return; if (!hasMesh(n)) return; const b = boxOf(n), s = b.getSize(new THREE.Vector3()); L.push('  '.repeat(d) + (n.name || '(sem nome)') + ' [' + n.type + '] ' + s.x.toFixed(2) + 'x' + s.y.toFixed(2) + 'x' + s.z.toFixed(2) + ' @' + b.min.x.toFixed(1) + ',' + b.min.y.toFixed(1) + ',' + b.min.z.toFixed(1) + (n.isMesh ? ' ' + triOf(n) + ' tri' : '')); n.children.forEach(c => dump(c, d + 1)); }; dump(root, 0); return { arquivo: rel, formato: info.ext, modo: 'tree', unidades: [], ignorados: [], texturasFaltando: [...info.missing], avisos: [], zUp: false, zUpMotivo: '', escalaSugerida: 1, ms: 0, arvore: L.join(String.fromCharCode(10)) }; }
  const eps = sceneEps(root), units = findUnits(root, opt.mode || 'auto', eps, ign);
  for (const u of units) { u.lods = splitInnerLods(u); unitStats(u, 256); }
  const auto = fileFrame(units, info, opt, warn);
  const res = unitsToEntries(units, stem, auto, opt, info);
  const orphan = [...PX.texIndex.all].filter(r => r.startsWith(rel.slice(0, rel.lastIndexOf('/') + 1) || '') && !PX.used.has(r)).length;
  return { arquivo: rel, formato: info.ext, upAxisArquivo: info.upAxis, unidadeArquivo: info.unitMeters, zUp: auto.zUp, zUpMotivo: auto.zUpWhy, escalaSugerida: auto.scale, medianaMaiorLado: auto.median, modo: opt.mode || 'auto',
    texturasFaltando: [...info.missing], ignorados: ign, avisos: warn.concat(auto.avisos), unidades: res, ms: Math.round(performance.now() - t0), _texturasNaoUsadasNaPasta: orphan };
}
/* eixo/escala do arquivo inteiro (a escala é do arquivo: os modelos mantêm o tamanho relativo entre si) */
function fileFrame(units, info, opt, warn) {
  const avisos = []; let zUp = false, why = '';
  const arr = units.filter(u => u.size.length() > 0);
  if (opt.zup === true) { zUp = true; why = 'pedido (--zup)'; } else if (opt.zup === false) { why = 'pedido (--no-zup)'; }
  else if (['fbx', 'obj', '3ds', 'stl', 'ply'].includes(info.ext)) {
    let z = 0, y = 0; for (const u of arr) { const s = [u.size.x, u.size.y, u.size.z], mx = Math.max(...s), mn = Math.min(...s), ti = s.indexOf(mn), ma = s.indexOf(mx);
      if (mn < mx * 0.25) { if (ti === 2) z++; else if (ti === 1) y++; } else if (ma === 2 && s[1] < s[2] * 0.7) z++; else if (ma === 1) y++; }
    if (z >= 2 && z > 2 * y) { zUp = true; why = 'automático: ' + z + ' modelos "em pé" no eixo Z contra ' + y + ' no Y'; } else why = z + ' modelos no eixo Z contra ' + y + ' no Y';
  } else why = info.ext === 'dae' ? 'o carregador já corrige (up_axis ' + (info.upAxis || '?') + ')' : 'glTF é sempre Y para cima';
  const maxes = arr.map(u => { const s = [u.size.x, u.size.y, u.size.z]; if (zUp) return Math.max(s[0], s[2], s[1]); return Math.max(...s); }).sort((a, b) => a - b), med = maxes.length ? maxes[Math.floor(maxes.length / 2)] : 1;
  let scale = 1, why2 = '';
  if (typeof opt.scale === 'number') { scale = opt.scale; why2 = 'pedido (--scale)'; }
  else if (med > 0 && (med < 0.15 || med > 60)) { scale = Math.pow(10, Math.round(Math.log10(2 / med))); scale = Math.min(1000, Math.max(0.001, scale)); why2 = 'automático: mediana do maior lado ' + round(med, 4) + ' fora de 0,15–60 m'; avisos.push('escala suspeita: mediana ' + round(med, 4) + ' -> multiplicar por ' + scale); }
  else why2 = 'automático: mediana ' + round(med, 3) + ' m plausível';
  return { zUp, zUpWhy: why, scale, scaleWhy: why2, median: round(med, 4), avisos };
}
function unitsToEntries(units, stem, frame, opt, info) {
  const out = [];
  units.forEach((u, idx) => {
    const text = [...u.chain, ...u.matInfo.map(m => m.nome), ...u.matInfo.flatMap(m => m.texturas.map(t => t.arquivo || ''))].join(' '), alphaMask = u.matInfo.some(m => m.temAlfa || m.alphaTest > 0);
    // nome: nó (sem LOD/Var) > textura > material > arquivo
    let words = null, variant = null, lod = null;
    for (const c of u.chain.slice().reverse()) { const p = parseName(c); if (p.lod !== null && lod === null) lod = p.lod; if (p.variant && !variant) variant = p.variant; if (!allGeneric(p.words) && !words) words = p.words; }
    let fromWhere = 'nó';
    if (!words) { const tx = u.matInfo.flatMap(m => m.texturas.filter(t => t.slot === 'map' && t.arquivo).map(t => t.arquivo)); for (const f of tx) { const w = nameFromTexture(f); if (w.length && !allGeneric(w)) { words = w; fromWhere = 'textura'; break; } } }
    if (!words) { for (const m of u.matInfo) { const w = parseName(m.nome).words; if (!allGeneric(w)) { words = w; fromWhere = 'material'; break; } } }
    if (!words) { words = units.length === 1 ? [stem] : [stem, String(idx + 1)]; fromWhere = 'arquivo'; }
    const base = ptName(words) + (variant ? ' var. ' + variant : ''); let tipo = classify(text + ' ' + stem, alphaMask); const size = u.size; if (tipo === 'outro' || (tipo === 'vegetação' && !alphaMask && false)) { const h = classify(opt.hint || '', false); if (h !== 'outro') tipo = h; }
    const key = u.chain.join('/') + '#' + idx;
    const rotated = frame.zUp ? { x: size.x, y: size.z, z: size.y } : { x: size.x, y: size.y, z: size.z };
    const sc = frame.scale, dimsM = { width: round(rotated.x * sc), height: round(rotated.y * sc), len: round(rotated.z * sc) }, av = [];
    const mxm = Math.max(dimsM.width, dimsM.height, dimsM.len);
    if (mxm < 0.03) av.push('minúsculo (' + mxm + ' m): escala suspeita'); if (mxm > 80) av.push('gigante (' + mxm + ' m): escala suspeita');
    if (u.tris > 200000) av.push('muito pesado: ' + u.tris + ' triângulos'); if (u.matInfo.some(m => m.faltando.length)) av.push('textura faltando: ' + [...new Set(u.matInfo.flatMap(m => m.faltando))].join(', '));
    if (u.matInfo.some(m => m.texturas.some(t => Math.max(t.w, t.h) > 2048))) av.push('textura maior que 2K');
    if (u.matInfo.some(m => !m.texturas.length && !m.faltando.length)) av.push('material sem textura (só cor)');
    out.push({ chave: key, no: u.chain.join('/'), nome: base, nomeOrigem: fromWhere, slug: slugOf(base) || 'modelo', tipo, veg: tipo === 'vegetação', lodNivel: lod, lods: u.lods || [], variante: variant, tris: u.tris, malhas: u.meshes.length,
      caixaArquivo: { x: round(size.x, 3), y: round(size.y, 3), z: round(size.z, 3) }, min: [round(u.box.min.x, 2), round(u.box.min.y, 2), round(u.box.min.z, 2)], max: [round(u.box.max.x, 2), round(u.box.max.y, 2), round(u.box.max.z, 2)], dims: dimsM, materiais: u.matInfo, avisos: av, _u: u });
  });
  /* LOD entre unidades: mesmo nome/variante -> fica o de menor nível */
  const groups = new Map(); for (const e of out) { const k = e.slug; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  for (const [k, arr] of groups) { if (arr.length < 2 || !arr.some(e => e.lodNivel !== null)) continue;
    arr.sort((a, b) => (a.lodNivel === null ? -1 : a.lodNivel) - (b.lodNivel === null ? -1 : b.lodNivel)); let main = arr[0]; const heavy = arr.reduce((m, e) => e.tris > m.tris ? e : m, arr[0]);
    if (heavy !== main && heavy.tris > main.tris * 1.5) { main = heavy; main.avisos.push('numeração de LOD invertida: LOD ' + main.lodNivel + ' tem mais triângulos que o de menor número'); }
    for (const o of arr) { if (o === main || o.lodNivel === null) continue; main.lods.push({ lod: o.lodNivel, tris: o.tris, no: o.no }); o._lodDe = main.chave; } }
  return out;
}
const strip = e => { const c = Object.assign({}, e); delete c._u; return c; };

/* ================= export (split) ================= */
function attrF32(A) {                                                   // atributo qualquer -> Float32Array (desnormaliza inteiros, abre intercalados)
  const sz = A.itemSize, n = A.count, out = new Float32Array(n * sz), arr = A.array, div = !A.normalized ? 1 : arr instanceof Uint8Array ? 255 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : arr instanceof Int16Array ? 32767 : 1;
  if (A.isInterleavedBufferAttribute) { for (let i = 0; i < n; i++) for (let j = 0; j < sz; j++) out[i * sz + j] = [A.getX, A.getY, A.getZ, A.getW][j].call(A, i); } else for (let i = 0; i < n * sz; i++) out[i] = arr[i] / div;
  return out;
}
function subGeo(geo, start, count) {                                      // só os vértices que o grupo usa
  const idx = geo.index ? geo.index.array : null, map = new Map(), ni = []; let n = 0;
  for (let k = start; k < start + count; k++) { const v = idx ? idx[k] : k; let m = map.get(v); if (m === undefined) { m = n++; map.set(v, m); } ni.push(m); }
  const g = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv', 'color']) { const A = geo.attributes[key]; if (!A) continue; const sz = A.itemSize, src = attrF32(A), arr = new Float32Array(n * sz); for (const [v, m] of map) for (let j = 0; j < sz; j++) arr[m * sz + j] = src[v * sz + j]; g.setAttribute(key, new THREE.BufferAttribute(arr, sz)); }
  g.setIndex(ni); return g;
}
function bakeGeo(geo, M, start, count) {
  let g;
  if (start === undefined) { g = new THREE.BufferGeometry(); for (const key of ['position', 'normal', 'uv', 'color']) { const A = geo.attributes[key]; if (!A) continue; g.setAttribute(key, new THREE.BufferAttribute(attrF32(A), A.itemSize)); }
    if (geo.index) g.setIndex(Array.from(geo.index.array)); else { const n = geo.attributes.position.count, ix = new Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(ix); } }
  else g = subGeo(geo, start, count);
  if (!g.attributes.position || !g.index) return null;
  g.applyMatrix4(M);
  if (M.determinant() < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
function mergeGeos(list) {
  const hasUv = list.some(g => g.attributes.uv), hasCol = list.every(g => g.attributes.color); let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = hasUv ? new Float32Array(nv * 2) : null, C = hasCol ? new Float32Array(nv * (list[0].attributes.color.itemSize)) : null, I = new Uint32Array(ni); let vo = 0, io = 0;
  for (const g of list) { const n = g.attributes.position.count; P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); if (U && g.attributes.uv) U.set(g.attributes.uv.array, vo * 2); if (C) C.set(g.attributes.color.array, vo * g.attributes.color.itemSize); const ia = g.index.array; for (let i = 0; i < ia.length; i++) I[io + i] = ia[i] + vo; vo += n; io += ia.length; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (U) m.setAttribute('uv', new THREE.BufferAttribute(U, 2)); if (C) m.setAttribute('color', new THREE.BufferAttribute(C, list[0].attributes.color.itemSize));
  m.setIndex(new THREE.BufferAttribute(nv > 65535 ? I : new Uint16Array(I), 1)); return m;
}
let SIMP = null;
async function simplify(geo, ratio) {
  if (!SIMP) { SIMP = (await import('/v/meshopt/meshopt_simplifier.js')).MeshoptSimplifier; await SIMP.ready; }
  const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, uv = geo.attributes.uv ? geo.attributes.uv.array : null, n = pos.length / 3, attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) { attrs[i * 5] = nrm[i * 3]; attrs[i * 5 + 1] = nrm[i * 3 + 1]; attrs[i * 5 + 2] = nrm[i * 3 + 2]; if (uv) { attrs[i * 5 + 3] = uv[i * 2]; attrs[i * 5 + 4] = uv[i * 2 + 1]; } }
  const idx = Uint32Array.from(geo.index.array), want = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
  const [r] = SIMP.simplifyWithAttributes(idx, pos, 3, attrs, 5, [0.3, 0.3, 0.3, 1.6, 1.6], null, want, 0.5, ['Sparse', 'Prune']);
  const map = new Map(), keep = []; for (const v of r) if (!map.has(v)) { map.set(v, keep.length); keep.push(v); }
  const g = new THREE.BufferGeometry(); for (const key of ['position', 'normal', 'uv', 'color']) { const A = geo.attributes[key]; if (!A) continue; const sz = A.itemSize, arr = new Float32Array(keep.length * sz); keep.forEach((v, i) => { for (let j = 0; j < sz; j++) arr[i * sz + j] = A.array[v * sz + j]; }); g.setAttribute(key, new THREE.BufferAttribute(arr, sz)); }
  g.setIndex(new THREE.BufferAttribute(keep.length > 65535 ? Uint32Array.from(r, v => map.get(v)) : Uint16Array.from(r, v => map.get(v)), 1)); return g;
}
/* material qualquer -> PBR com texturas reduzidas; alphaMode certo (mask p/ folhagem, blend p/ vidro) */
function toStd(m, o) {
  const s = new THREE.MeshStandardMaterial({ name: m.name || '' }), rep = { alpha: 0, maps: [] };
  s.color = m.color ? m.color.clone() : new THREE.Color(1, 1, 1); if (m.map && s.color.r + s.color.g + s.color.b < 0.03) s.color.setRGB(1, 1, 1);   // Collada/FBX: cor preta + textura = só a textura
  s.roughness = m.roughness !== undefined ? m.roughness : m.shininess !== undefined ? Math.min(1, Math.max(0.35, 1 - m.shininess / 120)) : 0.85; s.metalness = m.metalness !== undefined ? m.metalness : 0;
  if (m.emissive) { s.emissive = m.emissive.clone(); if (m.emissiveIntensity !== undefined) s.emissiveIntensity = m.emissiveIntensity; }
  s.vertexColors = !!m.vertexColors && o.vertexColors;
  const note = (slot, pr) => { if (pr) rep.maps.push({ slot, de: pr.w + 'x' + pr.h, para: pr.ow + 'x' + pr.oh }); };
  if (m.map) { const pr = procTex(m.map, 'color', o.maxTex); if (pr) { s.map = pr.tex; rep.alpha = pr.alpha; note('map', pr); } }
  if (m.normalMap) { const pr = procTex(m.normalMap, 'data', o.maxTex); if (pr) { s.normalMap = pr.tex; if (m.normalScale) s.normalScale.copy(m.normalScale); note('normalMap', pr); } }
  if (m.emissiveMap) { const pr = procTex(m.emissiveMap, 'color', o.maxTex); if (pr) { pr.tex.format = THREE.RGBFormat; s.emissiveMap = pr.tex; note('emissiveMap', pr); } }
  if (m.alphaMap) { const pr = procTex(m.alphaMap, 'data', o.maxTex); if (pr) { s.alphaMap = pr.tex; note('alphaMap', pr); } }
  if (m.roughnessMap || m.metalnessMap) {
    if (m.roughnessMap === m.metalnessMap) { const pr = procTex(m.roughnessMap, 'data', o.maxTex); if (pr) { s.roughnessMap = s.metalnessMap = pr.tex; note('metalRough', pr); } }
    else { const t = packORM(m.roughnessMap, m.metalnessMap, s.roughness, s.metalness, o.maxTex); s.roughnessMap = s.metalnessMap = t; s.roughness = 1; s.metalness = 1; rep.maps.push({ slot: 'metalRough', de: 'separadas', para: t.image.width + 'x' + t.image.height }); }
  }
  let op = m.opacity === undefined ? 1 : m.opacity; if (op < 0.05) op = 1;                       // opacidade 0 vinda do Collada (transparência A_ONE mal lida) deixaria o modelo invisível
  if (rep.alpha > 0.002 || (m.alphaTest > 0 && s.map && m.map)) { s.alphaTest = m.alphaTest > 0 ? m.alphaTest : 0.5; s.transparent = false; s.side = THREE.DoubleSide; rep.mode = 'MASK'; }
  else if (m.alphaMap) { s.alphaTest = 0.5; s.side = THREE.DoubleSide; rep.mode = 'MASK'; }
  else if (m.transparent && op < 0.98) { s.transparent = true; s.opacity = op; s.depthWrite = false; s.side = m.side; rep.mode = 'BLEND'; }
  else { rep.mode = 'OPACO'; if (m.side === THREE.DoubleSide) s.side = THREE.DoubleSide; }
  if (o.veg && rep.mode === 'MASK') s.side = THREE.DoubleSide;
  if (s.metalness > 0.3) { s.metalness = 0.3; rep.metalCap = true; }   // o jogo não tem envMap: metal cheio renderiza preto; limita a 0,3 (o mapa de metal modula abaixo disso)
  return { mat: s, rep };
}

async function buildUnit(e, frame, o) {
  const u = e._u, M0 = new THREE.Matrix4();
  if (frame.zUp) M0.makeRotationX(-Math.PI / 2); M0.premultiply(new THREE.Matrix4().makeScale(frame.scale, frame.scale, frame.scale));
  const buckets = new Map(), reps = [];
  for (const m of u.meshes) {
    m.updateWorldMatrix(true, false); const M = M0.clone().multiply(m.matrixWorld), mats = meshMats(m), g = m.geometry;
    if (m.isSkinnedMesh) o.warn.push('malha com esqueleto ' + (m.name || '') + ': usada na pose de ligação');
    const parts = Array.isArray(m.material) && g.groups.length ? g.groups.map(gr => ({ gr, mat: mats[gr.materialIndex] })) : [{ gr: null, mat: mats[0] }];
    for (const pt of parts) { if (!pt.mat || (pt.gr && !pt.gr.count)) continue; const bg = pt.gr ? bakeGeo(g, M, pt.gr.start, pt.gr.count) : bakeGeo(g, M); if (!bg) continue; if (!buckets.has(pt.mat)) buckets.set(pt.mat, []); buckets.get(pt.mat).push(bg); }
  }
  if (!buckets.size) throw new Error('sem geometria');
  const box = new THREE.Box3(); let list = [];
  for (const [mat, geos] of buckets) { const g = mergeGeos(geos); g.computeBoundingBox(); box.union(g.boundingBox); list.push({ mat, g }); }
  if (o.target) { const sz0 = box.getSize(new THREE.Vector3()), t = o.target, f = t.h ? t.h / sz0.y : t.max ? t.max / Math.max(sz0.x, sz0.y, sz0.z) : t.len ? t.len / Math.max(sz0.x, sz0.z) : 1; if (f > 0 && isFinite(f)) { const S = new THREE.Matrix4().makeScale(f, f, f); box.makeEmpty(); for (const x of list) { x.g.applyMatrix4(S); x.g.computeBoundingBox(); box.union(x.g.boundingBox); } o.warn.push('alvo aplicado: ×' + round(f, 4) + ' sobre a escala do arquivo'); } }
  let tris = list.reduce((s, x) => s + x.g.index.count / 3, 0), decimated = null;
  if (o.maxTris && tris > o.maxTris) {
    if (o.decimate) { const r = o.maxTris / tris; const nl = []; for (const x of list) nl.push({ mat: x.mat, g: x.g.index.count / 3 > 30 ? await simplify(x.g, r) : x.g }); list = nl; const t2 = list.reduce((s, x) => s + x.g.index.count / 3, 0); decimated = { de: Math.round(tris), para: Math.round(t2) }; tris = t2; box.makeEmpty(); for (const x of list) { x.g.computeBoundingBox(); box.union(x.g.boundingBox); } }
    else return { skip: 'acima de --max-tris (' + Math.round(tris) + ' > ' + o.maxTris + '); use --decimate para reduzir' };
  }
  const c = box.getCenter(new THREE.Vector3()), dx = -c.x, dy = -box.min.y, dz = -c.z, grp = new THREE.Group(); grp.name = e.nome;
  const texInfo = []; let i = 0;
  for (const x of list) { x.g.translate(dx, dy, dz); x.g.computeBoundingSphere(); const { mat, rep } = toStd(x.mat, { maxTex: o.maxTex, veg: o.veg, vertexColors: o.vertexColors }); if (o.colors && !mat.map) { const k = Object.keys(o.colors).find(c => (mat.name || '').toLowerCase().includes(c.toLowerCase())); if (k) { mat.color.set(o.colors[k]); rep.cor = o.colors[k] + ' (' + (mat.name || '?') + ')'; o.warn.push('cor ' + o.colors[k] + ' no material ' + (mat.name || '?')); } } reps.push(rep); const mesh = new THREE.Mesh(x.g, mat); mesh.name = (mat.name || 'malha') + '_' + (i++); grp.add(mesh); }
  const size = box.getSize(new THREE.Vector3());
  return { group: grp, tris: Math.round(tris), dims: { width: round(size.x), height: round(size.y), len: round(size.z) }, reps, decimated };
}
function exportGLB(group) { return new Promise((ok, fail) => { try { new THREE.GLTFExporter().parse(group, ok, { binary: true, onlyVisible: true, maxTextureSize: Infinity }); } catch (e) { fail(e); } }); }

async function splitFile(rel, opt) {
  const { root, info } = await loadFile(rel), stem = rel.split('/').pop().replace(/\.[^.]+$/, ''), ign = [], warn = [];
  const eps = sceneEps(root), units = findUnits(root, opt.mode || 'auto', eps, ign);
  for (const u of units) { u.lods = splitInnerLods(u); unitStats(u, 256); }
  const frame = fileFrame(units, info, opt, warn), entries = unitsToEntries(units, stem, frame, opt, info), made = [], skipped = [], taken = new Set(opt.existingIds);
  const usedNames = new Set(opt.existingNames || []), only = opt.only && opt.only.length ? opt.only.map(s => s.toLowerCase()) : null;
  for (const e of entries) {
    if (e._lodDe) { skipped.push({ nome: e.nome, motivo: 'LOD ' + e.lodNivel + ' de outro modelo (registrado em "lods")' }); continue; }
    if (only && !only.some(k => e.slug.includes(slugOf(k)) || e.no.toLowerCase().includes(k) || e.nome.toLowerCase().includes(k))) continue;
    const T = opt.tune || {}, hit = tbl => { if (!tbl) return null; const k = Object.keys(tbl).find(x => slugOf(x) === e.slug || x.toLowerCase() === e.no.toLowerCase()); return k === undefined ? null : tbl[k]; };
    e._target = hit(T.targets); e._ocolors = T.colors || null;   // chaves = slug/nó ORIGINAL (antes de renomear)
    { const nn = hit(T.names); if (nn) { e.nome = nn; e.slug = slugOf(nn) || e.slug; } }
    const own = opt.owned[rel + '|' + e.chave]; { let n = 2, nm = e.nome; while (usedNames.has(nm.toLowerCase())) nm = e.nome + ' ' + n++; usedNames.add(nm.toLowerCase()); e.nome = nm; }
    let id;
    if (own && !opt.redo) { skipped.push({ nome: e.nome, id: own, motivo: 'já importado antes (use --redo para refazer)' }); continue; }
    if (own) id = own; else { const base = (opt.prefix + e.slug).slice(0, 56).replace(/_+$/, ''); id = base; let n = 2; while (taken.has(id) || id.length < 2) id = base + '_' + n++; }
    taken.add(id);
    const w = []; const o = { target: e._target, colors: e._ocolors, maxTex: opt.maxTex, maxTris: opt.maxTris, decimate: opt.decimate, veg: opt.veg || e.veg, vertexColors: true, warn: w };
    try {
      const r = await buildUnit(e, frame, o);
      if (r.skip) { skipped.push({ nome: e.nome, id, motivo: r.skip }); continue; }
      const mxm = Math.max(r.dims.width, r.dims.height, r.dims.len); if (mxm < 0.03 || mxm > 80) w.push('tamanho suspeito: ' + mxm + ' m (use --scale)');
      const bytes = opt.dry ? null : await exportGLB(r.group);
      const meta = { id, name: e.nome, kind: 'object3d', format: 'glb', cat: opt.cat, source: 'Pack ' + opt.pack + ': ' + rel.split('/').pop() + (e.no ? ' / ' + e.no : ''), dims: r.dims, triangles: r.tris };
      if (e.veg || opt.veg) meta.veg = true;
      meta.pack = opt.pack; meta.packFile = rel; meta.sourceNode = e.chave; meta.tipo = e.tipo; if (e.lods.length) meta.lods = e.lods.sort((a, b) => a.lod - b.lod).map(l => ({ lod: l.lod, tris: l.tris })); if (r.decimated) meta.decimated = r.decimated;
      meta.escala = frame.scale; meta.zUp = frame.zUp; meta.maxTex = opt.maxTex; meta.imported = new Date().toISOString();
      if (!opt.dry) { await post('objects/' + id + '/model.glb', bytes, 'model/gltf-binary'); await post('objects/' + id + '/object.json', JSON.stringify(meta, null, 2), 'application/json'); }
      made.push({ id, nome: e.nome, tipo: e.tipo, tris: r.tris, dims: r.dims, mb: bytes ? round(bytes.byteLength / 1048576, 2) : null, texturas: r.reps.map(x => x.mode + (x.maps.length ? '[' + x.maps.map(m => m.slot + ' ' + m.para).join(', ') + ']' : '')).join(' ; '), lods: e.lods.length, avisos: w.concat(e.avisos.filter(a => !/^muito pesado|^textura maior/.test(a))), decimated: r.decimated || undefined });
    } catch (err) { skipped.push({ nome: e.nome, id, motivo: 'erro: ' + err.message }); console.error('erro em ' + e.nome + ': ' + err.stack); }
    await sleep(0);
  }
  return { arquivo: rel, zUp: frame.zUp, zUpMotivo: frame.zUpWhy, escala: frame.scale, escalaMotivo: frame.scaleWhy, detectados: entries.length, ignorados: ign, avisos: warn.concat(frame.avisos), texturasFaltando: [...info.missing], feitos: made, pulados: skipped };
}

/* ================= verificação + folha de contato ================= */
async function verifyGLB(id) {
  const res = await fetch('/o/objects/' + id + '/model.glb'); if (!res.ok) throw new Error('não abriu ' + id);
  const buf = await res.arrayBuffer(), gltf = await new Promise((ok, fail) => new THREE.GLTFLoader().parse(buf, '', ok, fail)); gltf.scene.updateMatrixWorld(true);
  let invis = 0, meshes = 0, tris = 0, nan = false, texs = [], mats = new Set(), alpha = 0; const box = new THREE.Box3();
  gltf.scene.traverse(o => { if (!o.isMesh) return; meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; box.expandByObject(o);
    const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 97) if (!isFinite(a[i])) nan = true; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (mats.has(m)) return; mats.add(m); if (m.alphaTest > 0) alpha++; if (m.transparent && m.opacity < 0.05) invis++; for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k] && m[k].image) texs.push((m[k].image.width || '?') + 'x' + (m[k].image.height || '?')); }); });
  const s = box.getSize(new THREE.Vector3());
  return { id, mb: round(buf.byteLength / 1048576, 2), meshes, tris: Math.round(tris), dims: { width: round(s.x), height: round(s.y), len: round(s.z) }, baseY: round(box.min.y, 3), centroX: round((box.min.x + box.max.x) / 2, 3), centroZ: round((box.min.z + box.max.z) / 2, 3), materiais: mats.size, mascaras: alpha, invisiveis: invis, texturas: [...new Set(texs)].join(' '), nan, _scene: gltf.scene };
}
async function sheet(ids, outName, cols, ref) {
  cols = Math.min(cols, ids.length); const W = 400 * cols, cell = 400, rows = Math.ceil(ids.length / cols), H = rows * cell;
  const rr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false }); rr.setSize(W, H); rr.setScissorTest(true); rr.outputEncoding = THREE.sRGBEncoding; rr.setClearColor(0x2a3140, 1);
  const lines = [], dl2 = []; let i = 0;
  for (const id of ids) {
    let v; try { v = await verifyGLB(id); } catch (e) { lines.push(id + ': ' + e.message); dl2.push(null); i++; continue; }
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x3a4256); sc.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(3, 6, 4); sc.add(dl);
    const obj = v._scene; sc.add(obj); const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x586070, roughness: 1 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.002; sc.add(g);
    const bb0 = new THREE.Box3().setFromObject(obj); const fig = new THREE.Group(); fig.name = 'ref175';   // figura de referência: pessoa de 1,75 m ao lado do modelo
    { const fm = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: .8 }); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 1.45, 14), fm); body.position.y = 0.725; const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), fm); head.position.y = 1.6; fig.add(body, head); const cx0 = (bb0.min.x + bb0.max.x) / 2, w0 = bb0.max.x - bb0.min.x; fig.position.set(bb0.max.x + 0.45 + 0.2, 0, (bb0.min.z + bb0.max.z) / 2); void cx0; void w0; }
    if (ref !== false) sc.add(fig);
    const bb = new THREE.Box3().setFromObject(ref !== false ? new THREE.Group().add(obj.clone(), fig.clone()) : obj); if (ref !== false) { bb.min.y = 0; } const sz = bb.getSize(new THREE.Vector3()), r = Math.max(sz.length() * 0.5, 0.05), cam = new THREE.PerspectiveCamera(32, 1, r * 0.05, r * 40), cx = (i % cols) * cell, cy = (rows - 1 - Math.floor(i / cols)) * cell;
    const ctr = bb.getCenter(new THREE.Vector3()); cam.position.set(ctr.x + r * 2.1, ctr.y + r * 1.1, ctr.z + r * 2.6); cam.lookAt(ctr);
    rr.setViewport(cx, cy, cell, cell); rr.setScissor(cx, cy, cell, cell); rr.render(sc, cam); i++;
    dl2.push(v.dims); lines.push(id + ' ' + v.tris + ' tri ' + v.dims.width + 'x' + v.dims.height + 'x' + v.dims.len + ' m ' + v.mb + ' MB');
  }
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const g2 = c2.getContext('2d'); g2.drawImage(rr.domElement, 0, 0); g2.font = '14px sans-serif';
  ids.forEach((id, k) => { const x = (k % cols) * cell + 6, y = Math.floor(k / cols) * cell + 18; g2.fillStyle = 'rgba(0,0,0,.55)'; g2.fillRect(x - 4, y - 14, Math.min(cell - 8, g2.measureText(id).width + 10), 20); g2.fillStyle = '#fff'; g2.fillText(id, x, y); const d = dl2[k]; if (d) { g2.fillStyle = 'rgba(0,0,0,.55)'; g2.fillRect(x - 4, y + 8, 250, 20); g2.fillStyle = '#ffd37a'; g2.fillText(d.width + ' x ' + d.height + ' x ' + d.len + ' m (L x A x C)', x, y + 23); } });
  const blob = await new Promise(r => c2.toBlob(r, 'image/png')); await post('_inventario/' + outName, blob, 'image/png'); rr.dispose(); return lines;
}

/* ================= entrada ================= */
window.packRun = async (cmd, a) => {
  try {
    if (cmd === 'setup') { PX.texIndex = a.texIndex; PX.used = new Set(); return { ok: true }; }
    if (cmd === 'inspect') return { ok: true, r: await inspectFile(a.file, a.opt || {}).then(r => { r.unidades = r.unidades.map(strip); return r; }) };
    if (cmd === 'split') return { ok: true, r: await splitFile(a.file, a.opt) };
    if (cmd === 'verify') { const out = []; for (const id of a.ids) { try { const v = await verifyGLB(id); delete v._scene; out.push(v); } catch (e) { out.push({ id, erro: e.message }); } } return { ok: true, r: out }; }
    if (cmd === 'sheet') return { ok: true, r: await sheet(a.ids, a.out, a.cols || 4, a.ref) };
    return { ok: false, erro: 'comando desconhecido ' + cmd };
  } catch (e) { return { ok: false, erro: e.message, stack: e.stack }; }
};
window.__packReady = true;
