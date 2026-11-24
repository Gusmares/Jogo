/* NEON COAST — Objetos do mapa (NEON ENGINE)
   O que o editor coloca no mundo, lido de maps/world.json (MAPDATA, em util.js). Equivale ao par IDE/IPL do GTA SA:
   • definições (o "IDE"): objetos prontos (MAP_PREFABS: primitivas, prédio, mobiliário de rua, árvores) e modelos convertidos de mods (assets/models/<id>);
   • instâncias (o "IPL"): MAPDATA.objects = [{ id, type:'prefab'|'model', ref, pos:[x,y,z], rot:[x,y,z] (graus), scale:[x,y,z], p:{parâmetros}, solid, walk }];
   • geradores de carro: MAPDATA.vehicles = [{ id, model, pos, h (graus), color }] — o carro aparece estacionado quando o jogador chega perto (como os "car generators" do SA);
   • ponto de partida: MAPDATA.spawn = { pos, h }.
   O mesmo código monta os objetos no jogo e no editor (editor/*.js), então o que se vê no editor é o que aparece no jogo. */
'use strict';
const DEG = Math.PI / 180;
const MAP_MAT_CACHE = new Map();
/* materiais das primitivas: cor lisa, pisos da cidade (8 m por repetição) ou fachadas (andares de 3,2 m) */
const MAP_SURFACES = {
  cor: { name: 'Cor lisa' }, concreto: { name: 'Concreto', tex: 'concreto' }, asfalto: { name: 'Asfalto', tex: 'asphalt' }, portuguesa: { name: 'Pedra portuguesa', tex: 'portuguesa' },
  intertravado: { name: 'Intertravado', tex: 'intertravado' }, grama: { name: 'Grama', tex: 'grass' },
  vidro: { name: 'Fachada de vidro', facade: 'glass' }, fconcreto: { name: 'Fachada de concreto', facade: 'concrete' }, tijolo: { name: 'Fachada de tijolo', facade: 'brick' },
  loja: { name: 'Fachada de loja', facade: 'shop' }, galpao: { name: 'Fachada de galpão', facade: 'ware' }, casa: { name: 'Fachada de casa', facade: 'house' }, brise: { name: 'Brise', facade: 'brise' }, pedra: { name: 'Pedra', facade: 'stone' }
};
function mapMaterial(kind, color) {
  const S = MAP_SURFACES[kind] || MAP_SURFACES.cor, key = kind + '|' + (S.facade ? '' : color);
  let m = MAP_MAT_CACHE.get(key); if (m) return m;
  if (S.facade && typeof FACADE !== 'undefined' && FACADE[S.facade]) m = FACADE[S.facade];        // fachadas: cor vai nos vértices (acendem à noite com as da cidade)
  else { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#c8c8c4'), roughness: 0.86, metalness: 0.04 });
    if (S.tex && typeof PAVE !== 'undefined' && PAVE[S.tex]) { const t = PAVE[S.tex].clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; m.map = t; } }
  MAP_MAT_CACHE.set(key, m); return m;
}
/* UVs em metros (rep metros por repetição) para qualquer geometria, pela normal de cada vértice */
function mapMeterUV(g, rep, repY) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; repY = repY || rep;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.6) uv.setXY(i, x / rep, -z / rep); else uv.setXY(i, (ax > 0.5 ? z : x) / rep, y / repY); }
  uv.needsUpdate = true; return g;
}
function mapPrimitive(g, p) {
  const S = MAP_SURFACES[p.mat] || MAP_SURFACES.cor;
  if (S.facade) { mapMeterUV(g, 25.6); const c = new THREE.Color(p.color || '#ffffff'), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  else if (S.tex) mapMeterUV(g, 8);
  const m = new THREE.Mesh(g, mapMaterial(p.mat, p.color)); m.castShadow = m.receiveShadow = true; return m;
}
/* rampa: cunha que sobe ao longo de +z, de 0 (z = -d/2) até h (z = +d/2) */
function rampGeometry(w, h, d) {
  const x = w / 2, z = d / 2, A = [-x, 0, -z], B = [x, 0, -z], C = [x, 0, z], D = [-x, 0, z], E = [-x, h, z], F = [x, h, z];
  // faces no sentido anti-horário vistas de fora: rampa, fundo, traseira (parede alta) e as duas laterais
  const faces = [[A, E, F, B], [A, B, C, D], [D, C, F, E], [A, D, E], [B, F, C]], pos = [];
  for (const f of faces) for (let k = 1; k < f.length - 1; k++) pos.push(...f[0], ...f[k], ...f[k + 1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return g;
}
/* objetos do mobiliário (props.js / sp.js) desenhados num Mesher na origem */
const meshProp = (fn) => p => { const m = new Mesher(); fn(m, p); const o = m.build(propMat); o.castShadow = true; return o; };
const col3 = (hex, def) => hexRGB(parseInt(String(hex || def).replace('#', ''), 16));
/* parâmetros editáveis: [padrão, mín, máx, passo] (números) ou lista de opções */
const MAP_PREFABS = {
  cubo:      { name: 'Cubo / bloco', cat: 'Primitivas', params: { w: [4, 0.1, 200, 0.1], h: [2, 0.05, 200, 0.05], d: [4, 0.1, 200, 0.1], mat: 'cor', color: '#c8c8c4' }, surface: 'box',
    make: p => { const g = new THREE.BoxGeometry(p.w, p.h, p.d); g.translate(0, p.h / 2, 0); return mapPrimitive(g, p); } },
  plataforma:{ name: 'Plataforma / piso', cat: 'Primitivas', params: { w: [10, 0.5, 300, 0.5], h: [0.3, 0.02, 3, 0.02], d: [10, 0.5, 300, 0.5], mat: 'concreto', color: '#d8d6d0' }, surface: 'box',
    make: p => MAP_PREFABS.cubo.make(p) },
  rampa:     { name: 'Rampa', cat: 'Primitivas', params: { w: [5, 0.5, 60, 0.1], h: [1.6, 0.1, 30, 0.05], d: [8, 0.5, 120, 0.1], mat: 'asfalto', color: '#bdbdbd' }, surface: 'ramp',
    make: p => mapPrimitive(rampGeometry(p.w, p.h, p.d), p) },
  cilindro:  { name: 'Cilindro / coluna', cat: 'Primitivas', params: { r: [0.6, 0.05, 60, 0.05], h: [4, 0.05, 200, 0.05], lados: [16, 3, 48, 1], mat: 'cor', color: '#d0d0cc' }, surface: 'box',
    make: p => { const g = new THREE.CylinderGeometry(p.r, p.r, p.h, p.lados | 0); g.translate(0, p.h / 2, 0); return mapPrimitive(g, p); } },
  muro:      { name: 'Muro', cat: 'Primitivas', params: { w: [8, 0.5, 200, 0.1], h: [2.2, 0.2, 12, 0.05], d: [0.25, 0.05, 3, 0.05], mat: 'concreto', color: '#d9d2c0' }, surface: 'box',
    make: p => MAP_PREFABS.cubo.make(p) },
  predio:    { name: 'Prédio', cat: 'Construção', params: { w: [20, 4, 120, 0.5], d: [18, 4, 120, 0.5], andares: [8, 1, 80, 1], mat: 'fconcreto', color: '#e9e4da', telhado: '#8a8a86' }, surface: 'box',
    make: p => { const H = p.andares * 3.2 + 1.2, G = new THREE.Group(), g = new THREE.BoxGeometry(p.w, H, p.d); g.translate(0, H / 2, 0); G.add(mapPrimitive(g, p));
      const r = new THREE.BoxGeometry(p.w + 0.3, 0.35, p.d + 0.3); r.translate(0, H + 0.15, 0); G.add(mapPrimitive(r, { mat: 'cor', color: p.telhado })); G.userData.h = H; return G; } },
  casa:      { name: 'Casa', cat: 'Construção', params: { w: [8.5, 4, 30, 0.5], d: [9, 4, 30, 0.5], andares: [2, 1, 3, 1], color: '#f3e3c6', telhado: '#a5523a' }, surface: 'box',
    make: p => { const H = p.andares * 3.2 + 0.2, G = new THREE.Group(), g = new THREE.BoxGeometry(p.w, H, p.d); g.translate(0, H / 2, 0); G.add(mapPrimitive(g, { mat: 'casa', color: p.color }));
      const m = new Mesher(); m.gable(0, H, 0, p.w + 0.8, p.d + 0.8, Math.min(p.w, p.d) * 0.28, col3(p.telhado), 0, p.w > p.d); const roof = m.build(propMat); roof.castShadow = true; G.add(roof); return G; } },
  galpao:    { name: 'Galpão', cat: 'Construção', params: { w: [24, 8, 80, 0.5], d: [16, 6, 60, 0.5], h: [9, 4, 20, 0.5], color: '#d0d6dc', telhado: '#7c838a' }, surface: 'box',
    make: p => { const G = new THREE.Group(), g = new THREE.BoxGeometry(p.w, p.h, p.d); g.translate(0, p.h / 2, 0); G.add(mapPrimitive(g, { mat: 'galpao', color: p.color }));
      const m = new Mesher(); m.gable(0, p.h, 0, p.w + 0.8, p.d + 0.8, 1.8, col3(p.telhado), 0, p.w < p.d); const roof = m.build(propMat); roof.castShadow = true; G.add(roof); return G; } },
  poste:     { name: 'Poste de luz', cat: 'Rua', params: { h: [7.5, 3, 14, 0.1] }, col: 0.2,
    make: meshProp((m, p) => { const g = [0.42, 0.43, 0.45]; m.cyl(0, 0, 0, 0.12, p.h, g, 8); m.box(0, p.h - 0.1, 0.8, 0.1, 0.1, 1.6, g); m.box(0, p.h - 0.22, 1.5, 0.35, 0.14, 0.6, [0.95, 0.92, 0.8]); }) },
  orelhao:   { name: 'Orelhão', cat: 'Rua', params: { color: '#e8762c' }, col: 0.3, make: meshProp((m, p) => PROP.orelhao(m, 0, 0, 0, 0, col3(p.color))) },
  banca:     { name: 'Banca de jornal', cat: 'Rua', params: {}, surface: 'box', make: meshProp(m => PROP.banca(m, 0, 0, 0, 0)) },
  ponto:     { name: 'Ponto de ônibus', cat: 'Rua', params: {}, make: meshProp(m => PROP.busStop(m, 0, 0, 0, 0)) },
  lixeira:   { name: 'Lixeira laranja', cat: 'Rua', params: {}, make: meshProp(m => PROP.lixeira(m, 0, 0, 0)) },
  lixo:      { name: 'Latão de lixo', cat: 'Rua', params: { color: '#3a6e48' }, make: meshProp((m, p) => PROP.bin(m, 0, 0, 0, col3(p.color))) },
  banco:     { name: 'Banco de praça', cat: 'Rua', params: {}, make: meshProp(m => PROP.bench(m, 0, 0, 0, 0)) },
  cone:      { name: 'Cone de trânsito', cat: 'Rua', params: {}, solid: false,
    make: meshProp(m => { m.box(0, 0, 0, 0.42, 0.04, 0.42, [0.12, 0.12, 0.12]); m.cone(0, 0.04, 0, 0.17, 0.66, hexRGB(0xff6a13), 12); m.cyl(0, 0.3, 0, 0.105, 0.09, [0.96, 0.96, 0.96], 12); }) },
  barreira:  { name: 'Barreira de concreto', cat: 'Rua', params: { w: [3, 1, 12, 0.5] }, surface: 'box',
    make: meshProp((m, p) => { const c = [0.8, 0.79, 0.76]; m.box(0, 0, 0, p.w, 0.3, 0.6, c); m.box(0, 0.3, 0, p.w, 0.55, 0.22, c); }) },
  arvore:    { name: 'Árvore de rua', cat: 'Natureza', params: { h: [7, 2, 20, 0.1], copa: '#3f7a35' }, col: 0.3,
    make: meshProp((m, p) => { const t = [0.38, 0.29, 0.21], c = col3(p.copa), h = p.h, k = h / 7; m.cyl(0, 0, 0, 0.17 * k, h * 0.62, t, 7);
      m.beam([0, h * 0.45, 0], [0.9 * k, h * 0.68, 0.3 * k], 0.16 * k, t); m.beam([0, h * 0.5, 0], [-0.8 * k, h * 0.7, -0.4 * k], 0.14 * k, t);
      for (const [x, y, z, r] of [[0, 0.62, 0, 2.3], [1.3, 0.6, 0.5, 1.6], [-1.2, 0.62, -0.6, 1.7], [0.3, 0.74, -1.1, 1.5], [-0.4, 0.72, 1.1, 1.5]])
        m.dome(x * k, h * y, z * k, r * k, r * k * 0.8, c.map(v => v * (0.82 + y * 0.3)), 10); }) },
  pinheiro:  { name: 'Pinheiro', cat: 'Natureza', params: { h: [9, 2, 24, 0.1], copa: '#2f5f33' }, col: 0.3,
    make: meshProp((m, p) => { const t = [0.38, 0.29, 0.21], c = col3(p.copa), h = p.h; m.cyl(0, 0, 0, 0.17 * h / 7, h * 0.5, t, 7);
      for (const [y, r] of [[0.32, 0.3], [0.5, 0.25], [0.66, 0.17]]) m.cone(0, h * y, 0, h * r, h * 0.36, c.map(v => v * (0.9 + y * 0.2)), 9); }) },
  palmeira:  { name: 'Palmeira', cat: 'Natureza', params: { h: [9, 3, 18, 0.1] }, col: 0.3,
    make: meshProp((m, p) => { const h = p.h, t = [0.55, 0.47, 0.36], g = [0.26, 0.5, 0.2]; m.cyl(0, 0, 0, 0.2, h, t, 7);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); m.beam([0, h, 0], [s * 3.2, h - 1.3, c * 3.2], 0.5, g); } }) },
  arbusto:   { name: 'Arbusto', cat: 'Natureza', params: { r: [1, 0.3, 4, 0.1], color: '#4c7f3a' }, solid: false,
    make: meshProp((m, p) => m.dome(0, 0, 0, p.r, p.r * 0.95, col3(p.color), 10)) },
  mesa:      { name: 'Mesa', cat: 'Lazer', params: {}, make: meshProp(m => PROP.table(m, 0, 0, 0, 1.2, 0.8, null, 0)) },
  cadeira:   { name: 'Cadeira', cat: 'Lazer', params: {}, solid: false, make: meshProp(m => PROP.chair(m, 0, 0, 0, 0)) },
  banquinho: { name: 'Banquinho', cat: 'Lazer', params: {}, solid: false, make: meshProp(m => PROP.stool(m, 0, 0, 0)) },
  guardasol: { name: 'Guarda-sol', cat: 'Lazer', params: { color: '#e0a800' }, solid: false, make: meshProp((m, p) => PROP.umbrella(m, 0, 0, 0, col3(p.color))) },
  isopor:    { name: 'Caixa térmica', cat: 'Lazer', params: {}, solid: false, make: meshProp(m => PROP.cooler(m, 0, 0, 0, 0)) },
  espreg:    { name: 'Espreguiçadeira', cat: 'Lazer', params: {}, solid: false, make: meshProp(m => PROP.lounger(m, 0, 0, 0, 0)) },
  som:       { name: 'Caixa de som', cat: 'Lazer', params: {}, make: meshProp(m => PROP.speaker(m, 0, 0, 0, 0)) },
  caixote:   { name: 'Caixote', cat: 'Lazer', params: {}, solid: false, make: meshProp(m => PROP.crate(m, 0, 0, 0, 0)) },
  barraca:   { name: 'Barraca de rua', cat: 'Lazer', params: { color: '#e0a800' }, make: meshProp((m, p) => PROP.stand(m, 0, 0, 0, 0, col3(p.color))) }
};
/* parâmetros completos de uma instância (padrões + o que foi salvo) */
function mapParams(def) {
  const P = (MAP_PREFABS[def.ref] || {}).params || {}, out = {};
  for (const [k, v] of Object.entries(P)) out[k] = Array.isArray(v) ? v[0] : v;
  return Object.assign(out, def.p || {});
}
/* monta UMA instância (grupo na posição/rotação/escala do arquivo). Modelos chegam depois (carregam em segundo plano). */
/* modelos 3D importados (FBX/OBJ/DAE/… convertidos para GLB pelo editor): assets/objects/<id>/model.glb */
const MAP_GLB = new Map();
function mapNeedGLTF() {
  if (THREE.GLTFLoader) return Promise.resolve();
  if (!mapNeedGLTF.p) mapNeedGLTF.p = new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/GLTFLoader.js'; s.onload = ok; s.onerror = () => fail(new Error('vendor/GLTFLoader.js')); document.head.appendChild(s); });
  return mapNeedGLTF.p;
}
function mapLoadGLB(id) {
  if (!MAP_GLB.has(id)) MAP_GLB.set(id, mapNeedGLTF().then(() => new Promise((ok, fail) => new THREE.GLTFLoader().load('assets/objects/' + id + '/model.glb', g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.map) { m.map.anisotropy = 4; m.map.encoding = THREE.LinearEncoding; m.map.needsUpdate = true; } } });   // o jogo desenha em espaço linear (sem outputEncoding sRGB): textura de pack decodificada como sRGB saía escura demais (copas pretas)
    ok(g.scene); }, undefined, fail))));
  return MAP_GLB.get(id);
}
function mapBuildObject(def) {
  const root = new THREE.Group(); root.userData.def = def; mapApplyTransform(root, def);
  if (def.type === 'gltf') {
    root.userData.ready = mapLoadGLB(def.ref).then(src => { const v = src.clone(true); root.add(v); root.userData.visual = v; return root; })
      .catch(e => { if (window.NEON_EDITOR) { console.warn('Mapa: modelo 3D', def.ref, e); const v = mapMissing(); root.add(v); root.userData.visual = v; } else mapNoteMissing(def.ref); return root; });   // no jogo, modelo que não existe (assets não commitados) é só ignorado; o editor mostra a caixa magenta
    return root;
  }
  if (def.type === 'model') {
    root.userData.ready = loadVehicleType(def.ref).then(type => {
      const lod = new THREE.LOD(), hi = new THREE.Mesh(type.geo.body, type.mats); hi.castShadow = hi.receiveShadow = true; lod.addLevel(hi, 0);
      if (type.geo.bodyLod && type.geo.bodyLod !== type.geo.body) { const lo = new THREE.Mesh(type.geo.bodyLod, type.mats); lo.castShadow = true; lod.addLevel(lo, 90); }
      root.add(lod); root.userData.visual = lod; return root;
    }).catch(e => { console.warn('Mapa: modelo', def.ref, e); root.add(mapMissing()); return root; });
  } else {
    const F = MAP_PREFABS[def.ref]; let v;
    try { v = F ? F.make(mapParams(def)) : mapMissing(); } catch (e) { console.warn('Mapa: objeto', def.ref, e); v = mapMissing(); }
    root.add(v); root.userData.visual = v; root.userData.ready = Promise.resolve(root);
  }
  return root;
}
function mapMissing() { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true })); return m; }
function mapApplyTransform(o, def) {
  const p = def.pos || [0, 0, 0], r = def.rot || [0, 0, 0], s = def.scale || [1, 1, 1];
  o.position.set(p[0], p[1], p[2]); o.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ'); o.scale.set(s[0], s[1], s[2]);
}
/* colide? pisável? — padrões por tipo de objeto; o editor pode forçar com def.solid / def.walk */
function mapFlags(def) {
  const F = def.type === 'prefab' ? MAP_PREFABS[def.ref] || {} : {}, p = mapParams(def), s = def.scale || [1, 1, 1];
  const surf = F.surface || null, low = surf === 'box' && (p.h !== undefined ? p.h * s[1] : 99) <= 1.0;
  return { solid: def.solid !== undefined ? !!def.solid : surf === 'ramp' ? false : low ? false : F.solid !== false,
    walk: def.walk !== undefined ? !!def.walk && !!surf : surf === 'ramp' || low, surf };
}

/* ---------------- no jogo: colisão e superfícies pisáveis ---------------- */
const MAP_SURF = new Map(), MAP_SC = 32;              // grade de superfícies (rampas e pisos baixos) para o chão do carro e do jogador
function mapAddSurface(root, def, flags) {
  root.updateMatrixWorld(true);
  const p = mapParams(def), s = def.scale || [1, 1, 1], yaw = (def.rot || [0, 0, 0])[1] * DEG, bb = new THREE.Box3().setFromObject(root);
  const S = { kind: flags.surf, x: root.position.x, y: root.position.y, z: root.position.z, c: Math.cos(yaw), s: Math.sin(yaw),
    hw: (p.w !== undefined ? p.w : (p.r || 1) * 2) * s[0] / 2, hd: (p.d !== undefined ? p.d : (p.r || 1) * 2) * s[2] / 2, h: (root.userData.visual.userData.h || p.h || 1) * s[1] };
  for (let gx = Math.floor(bb.min.x / MAP_SC); gx <= Math.floor(bb.max.x / MAP_SC); gx++) for (let gz = Math.floor(bb.min.z / MAP_SC); gz <= Math.floor(bb.max.z / MAP_SC); gz++) {
    const k = gx + ',' + gz; let l = MAP_SURF.get(k); if (!l) MAP_SURF.set(k, l = []); l.push(S); }
}
/* altura da superfície colocada em (x,z), ou -Infinity — chamada por carGroundHeight */
function mapGroundAt(x, z) {
  const l = MAP_SURF.get(Math.floor(x / MAP_SC) + ',' + Math.floor(z / MAP_SC)); if (!l) return -Infinity;
  let best = -Infinity;
  for (const S of l) { const dx = x - S.x, dz = z - S.z, lx = dx * S.c - dz * S.s, lz = dx * S.s + dz * S.c;
    if (Math.abs(lx) > S.hw || Math.abs(lz) > S.hd) continue;
    const y = S.kind === 'ramp' ? S.y + S.h * (lz + S.hd) / (2 * S.hd) : S.y + S.h; if (y > best) best = y; }
  return best;
}
function mapAddCollider(root, def) {
  root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(root); if (bb.isEmpty()) return;
  const F = def && def.type === 'prefab' ? MAP_PREFABS[def.ref] : null;
  if (F && F.col) {                                    // árvore/poste/orelhão: só o tronco (a copa não pode virar parede)
    const s = def.scale || [1, 1, 1], r = F.col * Math.max(s[0], s[2]), p = root.position;
    addCollider({ x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, h: bb.max.y, y0: bb.min.y, map: true }); return;
  }
  if (bb.max.x - bb.min.x < 0.25 && bb.max.z - bb.min.z < 0.25) return;
  addCollider({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, h: bb.max.y, y0: bb.min.y, map: true });
}
const mapObjects = [];
/* ---------------- objetos 3D repetidos em LOTE (instâncias) ----------------
   Qualquer objeto do mapa com "veg": 1 (vegetação, pincel do editor) ou "batch": 1 (props: lixeira, banco, rocha…) é desenhado assim:
   o mesmo modelo repetido vira InstancedMesh (um por submalha/material do GLB), agrupado por célula de MAP_INST_CELL m, com corte por distância
   (o alcance cresce com o tamanho do modelo) e por frustum (VEG_CHUNKS / updateVegetationCulling, foliage-lib.js). Nunca um Mesh clonado por objeto.
   O objeto continua uma def normal em maps/world.json: o editor move/gira/apaga/desfaz a def (cada uma vira um grupo próprio no editor) e o jogo reconstrói o lote ao abrir o mapa.
   Se o GLB não existir (outro PC, assets/ não vai para o git) o lote inteiro é ignorado em silêncio (só um aviso no console, uma vez por modelo). */
const MAP_INST_CELL = 200, MAP_MISSING = new Set();
function mapNoteMissing(ref) { if (!MAP_MISSING.has(ref)) { MAP_MISSING.add(ref); console.info('Mapa: modelo 3D "' + ref + '" não encontrado — objetos ignorados'); } }
/* material do lote: sem normal map (folhagem de pack vem com escala 1,5-4, forte demais sem envMap); um clone por material (cache). */
const MAP_INST_MATS = new Map(), MAP_FOLIAGE = [];
function mapInstMat(m) {
  if (Array.isArray(m)) return m.map(mapInstMat); if (!m.normalMap && !(m.alphaTest > 0)) return m;
  let c = MAP_INST_MATS.get(m); if (c) return c; c = m.clone(); c.normalMap = null;
  if (m.alphaTest > 0 && m.map) { c.emissiveMap = m.map; c.emissive.setScalar(1); c.emissiveIntensity = 0.25; MAP_FOLIAGE.push(c); }   // cartões de folha: o lado na sombra ficava quase preto (ambiente fraco); a cor da própria folha emite um pouco, só de dia
  c.needsUpdate = true; MAP_INST_MATS.set(m, c); return c;
}
if (!window.NEON_EDITOR) setInterval(() => { if (!MAP_FOLIAGE.length) return; const k = 0.02 + 0.28 * (typeof dayF === 'number' ? dayF : 1); for (const c of MAP_FOLIAGE) c.emissiveIntensity = k; }, 500);
/* ---------------- colisão dos modelos 3D em lote (packs) ----------------
   Cada modelo tem "colisor" em assets/objects/<id>/object.json (engine/tools/pack-collide.js): círculos [x,z,r] no plano do modelo, medidos da malha.
   O jogo usa o MESMO colisor de sempre (addRound = caixa quadrada de meio-lado r, collision.js): o círculo é movido/girado/escalado pela instância.
   • folhagem rasteira (grama, capim, flor, muda, arbusto <= 1,5 m): NÃO colide; arbusto > 1,5 m: círculo pequeno só no centro (0,12-0,3 m);
   • árvore (>= 5 m): círculo só no tronco (raio da casca a 1 m do chão, limite 0,15-0,8 m depois da escala), nunca a copa;
   • rocha, tronco caído e prop: círculos ao longo da pegada real da base (menor que a caixa do modelo);
   • sem o campo no object.json: folhagem = sem colisor; árvore alta = tronco fino (0,2 m); prop/rocha >= 0,8 m = um círculo central de 35% do menor lado (nunca a caixa). */
const MAP_META = new Map();
function mapLoadMeta(id) {
  if (!MAP_META.has(id)) MAP_META.set(id, new Promise(ok => new THREE.FileLoader().load('assets/objects/' + id + '/object.json', t => { try { ok(JSON.parse(t)); } catch (e) { ok(null); } }, undefined, () => ok(null))));
  return MAP_META.get(id);
}
function mapBatchColliders(defs, d0, bs, fp, meta) {
  const col = meta && meta.colisor, tree = !!d0.veg, tipo = col ? col.tipo : null;
  if (tipo === 'nenhum') return;
  for (const d of defs) {
    if (d.solid === false) continue; const s = d.scale || [1, 1, 1], p = d.pos, yaw = ((d.rot || [0, 0, 0])[1]) * DEG, sxz = Math.max(s[0], s[2]), H = bs.y * s[1];
    let circ = null, lo = 0, hi = 1e9;
    if (col) {
      if (tipo === 'tronco') { circ = col.c; lo = 0.15; hi = 0.8; }
      else if (tipo === 'arbusto') { if (H > 1.5) { circ = col.c; lo = 0.12; hi = 0.3; } }
      else circ = col.c;
    } else if (tree) { if (H >= 5) { circ = [[0, 0, 0.2 / sxz]]; lo = 0.15; hi = 0.4; } }
    else if (H >= 0.8 && fp >= 0.3) circ = [[0, 0, 0.35 * Math.min(bs.x, bs.z)]];
    if (!circ || !circ.length) continue;
    const cs = Math.cos(yaw), sn = Math.sin(yaw), hTop = p[1] + (col ? col.h : bs.y) * s[1];
    for (const c of circ) {
      const r = clamp(c[2] * sxz, lo, hi), lx = c[0] * s[0], lz = c[1] * s[2], x = p[0] + lx * cs + lz * sn, z = p[2] - lx * sn + lz * cs;
      addCollider({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, h: hTop, y0: p[1], map: true });
    }
  }
}
function buildVegGroup(defs) {
  const d0 = defs[0], isG = d0.type === 'gltf';
  const tmplP = isG ? mapLoadGLB(d0.ref) : (() => { const t = mapBuildObject({ type: d0.type, ref: d0.ref, p: d0.p }); return t.userData.ready.then(() => t); })();
  const onMissing = e => { if (isG) mapNoteMissing(d0.ref); else console.warn('Mapa: lote', d0.ref, e); };
  tmplP.then(tmpl => {
    tmpl.updateMatrixWorld(true); const meshes = []; tmpl.traverse(o => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) return;
    const bb = new THREE.Box3().setFromObject(tmpl), bs = bb.getSize(new THREE.Vector3()), sY = defs.reduce((a, d) => a + (d.scale ? d.scale[1] : 1), 0) / defs.length;
    const H = bs.y * sY, fp = Math.max(bs.x, bs.z) * sY;                              // altura e maior lado típicos (m) já na escala do mapa
    const range = d0.range || clamp(50 + Math.max(H, fp * 0.6) * 28, 80, 240);        // modelo maior aparece de mais longe: capim e props ~80 m, arbusto ~95 m, árvore de 7 m+ ~240 m (teto: cada lote visível custa chamadas de desenho)
    const castBig = isG ? H >= 8 : true;                                              // só árvore grande projeta sombra (e só de perto: 80 m, foliage-lib.js); capim, flores, arbustos e props pequenos não
    const cells = new Map(); for (const d of defs) { const k = Math.floor(d.pos[0] / MAP_INST_CELL) + ',' + Math.floor(d.pos[2] / MAP_INST_CELL); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(d); }
    const R = new THREE.Object3D(), m = new THREE.Matrix4();
    for (const l of cells.values()) {
      let cx = 0, cz = 0; l.forEach(d => { cx += d.pos[0]; cz += d.pos[2]; }); cx /= l.length; cz /= l.length; let r = 0; l.forEach(d => { r = Math.max(r, Math.hypot(d.pos[0] - cx, d.pos[2] - cz)); });
      for (const ms of meshes) {
        const im = new THREE.InstancedMesh(ms.geometry, mapInstMat(ms.material), l.length);
        l.forEach((d, i) => { mapApplyTransform(R, d); R.updateMatrix(); im.setMatrixAt(i, m.multiplyMatrices(R.matrix, ms.matrixWorld)); });
        im.instanceMatrix.setUsage(THREE.StaticDrawUsage); im.matrixAutoUpdate = false;
        const cast = castBig; const leaf = (Array.isArray(ms.material) ? ms.material : [ms.material]).some(x => x.alphaTest > 0);   // folhagem com alpha não recebe sombra (evita acne em folha dupla face); trunco e props recebem
        im.castShadow = cast; im.receiveShadow = !leaf; im.frustumCulled = false; scene.add(im);   // folhagem com alpha: a sombra usa o mesmo corte (alphaTest) do material
        if (typeof VEG_CHUNKS !== 'undefined') VEG_CHUNKS.push({ ref: d0.ref, n: l.length, mesh: im, cx, cz, r: r + Math.max(6, fp * 0.5), range: isG ? range : 520, cast });
      }
    }
    const F = d0.type === 'prefab' ? MAP_PREFABS[d0.ref] : null;
    if (F && F.col) for (const d of defs) { const s = d.scale ? Math.max(d.scale[0], d.scale[2]) : 1, rr_ = F.col * s; if (d.solid !== false) addCollider({ x0: d.pos[0] - rr_, x1: d.pos[0] + rr_, z0: d.pos[2] - rr_, z1: d.pos[2] + rr_, h: d.pos[1] + 8, y0: d.pos[1], map: true }); }
    else if (isG) mapLoadMeta(d0.ref).then(meta => mapBatchColliders(defs, d0, bs, fp, meta));   // colisão de modelo 3D em lote (ver mapBatchColliders)
  }, onMissing).catch(e => console.warn('Mapa: lote', d0.ref, e));
}
function buildMapObjects() {
  const list = Array.isArray(MAPDATA.objects) ? MAPDATA.objects : [], veg = new Map();
  for (const def of list) {
    if ((def.veg || def.batch) && (def.type === 'gltf' || def.type === 'prefab')) { const k = def.type + '|' + def.ref + '|' + JSON.stringify(def.p || null); let l = veg.get(k); if (!l) veg.set(k, l = []); l.push(def); continue; }
    const root = mapBuildObject(def); scene.add(root); mapObjects.push(root);
    root.userData.ready.then(() => { const f = mapFlags(def); if (f.solid) mapAddCollider(root, def); if (f.walk) mapAddSurface(root, def, f); });
  }
  for (const defs of veg.values()) buildVegGroup(defs);
}
/* ---------------- capim, tufos e samambaias dos packs no lugar da procedural (vegetation.js: PACK_VEG, VEGREC_G) ----------------
   Cada tufo/mancha procedural vira UM modelo dos packs (dois, se a mancha tinha 5+ tufos) na mesma posição; sem arquivo no mapa (não é editável, como já não era).
   Grupos de plantas com paleta por célula de 200 m (poucas espécies por célula = poucas chamadas de desenho); modelos leves (< 2 mil triângulos). */
const PACK_GRASS = {   // [modelo, escala mín, máx, peso] — as texturas dos packs são escuras; os modelos mais verdes pesam mais
  ground: [['sp_grama_blades', 2.2, 3.4, 1.6], ['gp_green_tall_patch', 1.5, 2.4, 1], ['gp_green_alpha_tall_grama_6', 3.0, 5.0, 1], ['vp_tundra_grama_var_g', 1.5, 2.4, 0.7], ['sp_5_folha_ground_planta', 1.2, 2.0, 0.8], ['gp_mid_tall_patch', 1.5, 2.4, 0.3], ['gp_green_alpha_tall_grama_4', 3.0, 5.0, 0.3]],
  park: [['sp_grama_blades', 1.6, 2.6, 1.6], ['sp_5_folha_ground_planta', 1.0, 1.6, 1], ['gp_green_tall_patch', 1.0, 1.7, 1], ['vp_tundra_grama_var_g', 1.0, 1.7, 0.5]],
  dry: [['gp_yellow_tall_patch', 1.4, 2.2, 1.2], ['sp_grama_blades', 2.0, 3.0, 1], ['gp_mid_tall_patch', 1.4, 2.2, 0.8], ['vp_tundra_grama_var_e', 1.4, 2.2, 0.4]],
  fern: [['sp_5_folha_ground_planta', 1.4, 2.4, 1.4], ['vp_silvery_glade_samambaia_var_e', 2.0, 3.2, 0.6], ['vp_silvery_glade_samambaia_var_g', 2.0, 3.0, 0.6]],
  flower: [['sp_dandelion', 1.0, 1.8, 1.2], ['sp_dandelion_2', 1.0, 1.8, 1.2], ['vp_chamomile_var_d', 1.0, 1.6, 0.8], ['vp_chamomile_var_e', 1.0, 1.6, 0.8]]
};
const PACK_GRASS_KIND = { grass: 'ground', tall: 'ground', dark: 'ground', park: 'park', dry: 'dry', twigs: 'dry', agave: 'dry', fern: 'fern', weeds: 'flower', parkweed: 'flower' };   // categoria da procedural -> grupo
const PACK_GRASS_NPAL = { ground: 2, park: 2, dry: 1, fern: 1, flower: 1 };
function buildPackGrass() {
  const rec = typeof VEGREC_G !== 'undefined' ? VEGREC_G : []; if (!rec.length) return;
  const seedBase = 20261124, pal = new Map(), groups = new Map(), stat = {};
  const paletteOf = (grp, cx, cz) => {
    const key = grp + '|' + cx + ',' + cz; let p = pal.get(key); if (p) return p;
    const g = mulberry32(Math.floor(hash2(cx * 7 + grp.length * 131, cz * 13 + seedBase % 997) * 4294967296)), pool = PACK_GRASS[grp].slice(); p = [];
    for (let k = 0; k < Math.min(PACK_GRASS_NPAL[grp], pool.length); k++) { const tot = pool.reduce((a, q) => a + q[3], 0); let r = g() * tot, i = 0; for (; i < pool.length - 1; i++) { r -= pool[i][3]; if (r <= 0) break; } p.push(pool[i]); pool.splice(i, 1); }
    pal.set(key, p); return p;
  };
  for (let i = 0; i < rec.length; i++) {
    const [kind, x0, z0, h0, n, , rad] = rec[i], grp = PACK_GRASS_KIND[kind]; if (!grp) continue;
    const cx = Math.floor(x0 / MAP_INST_CELL), cz = Math.floor(z0 / MAP_INST_CELL), p = paletteOf(grp, cx, cz), gr = mulberry32(Math.floor(hash2(i, Math.floor(x0 * 3 + z0)) * 4294967296));
    const m = n >= 5 ? 2 : 1;
    for (let k = 0; k < m; k++) {
      const e = p[Math.floor(gr() * p.length)], a = gr() * Math.PI * 2, d = k ? 1.1 + gr() * 0.9 : 0, x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
      const s = (e[1] + (e[2] - e[1]) * gr()) * (grp === 'park' || grp === 'flower' ? 1 : (0.8 + 0.2 * Math.min(1.5, n / 4))), y = typeof carGroundHeight === 'function' && kind !== 'park' && kind !== 'parkweed' ? Math.min(h0, carGroundHeight(x, z)) : h0;
      let l = groups.get(e[0]); if (!l) groups.set(e[0], l = []);
      l.push({ type: 'gltf', ref: e[0], veg: 1, pos: [x, y - 0.03, z], rot: [0, gr() * 360, 0], scale: [s, s * (0.85 + 0.3 * gr()), s] }); stat[grp] = (stat[grp] || 0) + 1;
    }
  }
  for (const defs of groups.values()) buildVegGroup(defs);
  window.PACK_GRASS_STAT = { registros: rec.length, modelos: groups.size, instancias: Object.values(stat).reduce((a, v) => a + v, 0), porGrupo: stat };
}
/* ---------------- geradores de carro ---------------- */
const mapGens = (Array.isArray(MAPDATA.vehicles) ? MAPDATA.vehicles : []).map(g => ({ def: g, car: null, cd: 0 }));
function mapSpawnGen(G) {
  const d = G.def; G.cd = 4;
  return loadVehicleType(d.model).then(type => {
    if (G.car && cars.includes(G.car)) return G.car;
    const color = d.color ? parseInt(String(d.color).replace('#', ''), 16) : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const c = new Car(color, d.pos[0], d.pos[2], (d.h || 0) * DEG, false, () => makeVehicleMesh(type, color));
    applyVehDims(c, type.man); c.parked = true; c.speed = 0; c.mapGen = G; G.car = c; return c;
  }).catch(e => console.warn('Mapa: carro', d.model, e));
}
function updateMapGens(dt, force) {
  if (!mapGens.length) return;
  const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
  for (const G of mapGens) {
    G.cd -= dt; if (G.car && !cars.includes(G.car)) G.car = null;               // o trânsito removeu (longe) — pode nascer de novo
    if (G.car || G.cd > 0) continue;
    const d = Math.hypot(G.def.pos[0] - px, G.def.pos[2] - pz);
    if (d < 220 && (force || d > 70 || !inCamView(G.def.pos[0], G.def.pos[2]))) mapSpawnGen(G);
  }
}
/* ---------------- alterações na cidade original (entidades do mundo, collision.js: WENT) ----------------
   MAPDATA.world = { "<id da entidade>": { d: [dx, dy, dz], r: graus (em torno de Y), s: escala } | { del: 1 } }.
   Mexe só nos vértices da entidade dentro das malhas juntadas, nas colisões dela e nos objetos soltos que ela criou. */
const _ev = new THREE.Vector3(), _em = new THREE.Matrix4(), _en = new THREE.Matrix3();
function entInit(e) {
  if (e.orig) return e;
  e.parts = [];
  for (const s of e.segs) if (s.m.__mesh) e.parts.push({ mesh: s.m.__mesh, start: s.start, end: s.end });
  for (const s of e.gsegs) e.parts.push({ mesh: s.mesh, start: s.start, end: s.end });
  e.orig = e.parts.map(p => { const g = p.mesh.geometry, P = g.attributes.position, N = g.attributes.normal; return { p: P.array.slice(p.start * 3, p.end * 3), n: N ? N.array.slice(p.start * 3, p.end * 3) : null }; });
  e.objOrig = e.objs.map(o => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible }));
  e.colsNow = e.cols.slice(); e.colOrig = e.cols.map(b => Object.assign({}, b));
  e.instOrig = (e.inst || []).map(([I, i]) => I.m[i].clone());                                   // árvores: matrizes originais das instâncias
  const bb = new THREE.Box3();
  for (const o of e.orig) for (let i = 0; i < o.p.length; i += 3) bb.expandByPoint(_ev.set(o.p[i], o.p[i + 1], o.p[i + 2]));
  for (const o of e.objs) { o.updateMatrixWorld(true); bb.union(new THREE.Box3().setFromObject(o)); }
  (e.inst || []).forEach(([I], k) => { if (!I.geo.boundingBox) I.geo.computeBoundingBox(); bb.union(I.geo.boundingBox.clone().applyMatrix4(e.instOrig[k])); });
  if (bb.isEmpty()) bb.setFromCenterAndSize(new THREE.Vector3(e.x, 0, e.z), new THREE.Vector3(1, 1, 1));
  e.box = bb; e.pivot = bb.getCenter(new THREE.Vector3()); e.pivot.y = bb.min.y;
  if (e.inst && e.inst.length && !e.parts.length) { e.pivot.x = e.instOrig[0].elements[12]; e.pivot.z = e.instOrig[0].elements[14]; e.pivot.y = e.instOrig[0].elements[13]; }
  return e;
}
/* matriz da alteração (em volta do pé do centro da entidade) */
function entMatrix(e, ov) {
  entInit(e); const m = new THREE.Matrix4(), d = (ov && ov.d) || [0, 0, 0], s = ov && ov.del ? 1e-4 : (ov && ov.s) || 1;
  m.makeTranslation(e.pivot.x + d[0], e.pivot.y + d[1], e.pivot.z + d[2]).multiply(_em.makeRotationY(((ov && ov.r) || 0) * DEG)).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-e.pivot.x, -e.pivot.y, -e.pivot.z));
  return m;
}
function entApply(e, ov) {
  entInit(e); const M = entMatrix(e, ov), touched = new Set(); _en.getNormalMatrix(M);
  e.parts.forEach((pt, k) => {
    const g = pt.mesh.geometry, P = g.attributes.position.array, N = g.attributes.normal && g.attributes.normal.array, o = e.orig[k], b = pt.start * 3;
    for (let i = 0; i < o.p.length; i += 3) { _ev.set(o.p[i], o.p[i + 1], o.p[i + 2]).applyMatrix4(M); P[b + i] = _ev.x; P[b + i + 1] = _ev.y; P[b + i + 2] = _ev.z; }
    if (N && o.n && !(ov && ov.del)) for (let i = 0; i < o.n.length; i += 3) { _ev.set(o.n[i], o.n[i + 1], o.n[i + 2]).applyMatrix3(_en).normalize(); N[b + i] = _ev.x; N[b + i + 1] = _ev.y; N[b + i + 2] = _ev.z; }
    g.attributes.position.needsUpdate = true; if (N) g.attributes.normal.needsUpdate = true; touched.add(g);
  });
  for (const g of touched) g.computeBoundingSphere();
  (e.inst || []).forEach(([I, i], k) => { const w = I.where && I.where[i]; if (!w) return; w[0].setMatrixAt(w[1], _em.multiplyMatrices(M, e.instOrig[k])); w[0].instanceMatrix.needsUpdate = true; });
  e.objs.forEach((o, k) => { const O = e.objOrig[k]; _em.compose(O.p, O.q, O.s).premultiply(M); _em.decompose(o.position, o.quaternion, o.scale); o.visible = O.v && !(ov && ov.del); });
  for (const b of e.colsNow) removeCollider(b);
  e.colsNow = [];
  if (!(ov && ov.del)) for (const c of e.colOrig) {
    const bb = new THREE.Box3(new THREE.Vector3(c.x0, c.y0 !== undefined ? c.y0 : 0, c.z0), new THREE.Vector3(c.x1, c.h !== undefined ? c.h : 10, c.z1)).applyMatrix4(M);
    const nb = Object.assign({}, c, { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z }); if (c.h !== undefined) nb.h = bb.max.y; if (c.y0 !== undefined) nb.y0 = bb.min.y;
    addCollider(nb); e.colsNow.push(nb);
  }
  e.applied = ov ? JSON.stringify(ov) : null;
}
/* caixa atual da entidade (com a alteração) */
function entBox(e, ov) { entInit(e); return e.box.clone().applyMatrix4(entMatrix(e, ov)); }
function applyWorldEdits() {
  const W = MAPDATA.world && typeof MAPDATA.world === 'object' ? MAPDATA.world : {}; let miss = 0;
  for (const [id, ov] of Object.entries(W)) { const e = WENT.byId.get(id); if (e) entApply(e, ov); else if (!(typeof PACK_VEG !== 'undefined' && PACK_VEG && VEGREP_IDS.has(id))) miss++; }   // árvore/arbusto procedural trocado pelos packs: a alteração já foi aplicada pelo gerador (scatter-packs.js)
  if (miss) console.warn('Mapa: ' + miss + ' alteração(ões) da cidade original não acharam o prédio (a planta mudou?)');
}

if (typeof PACK_VEG !== 'undefined' && PACK_VEG) buildPackGrass();   // jogo e editor: o capim dos packs substitui o procedural
/* ---------------- partida no jogo ---------------- */
if (!window.NEON_EDITOR) {
  addEventListener('DOMContentLoaded', applyWorldEdits);              // depois de todos os scripts: vale também para o que é criado depois deste arquivo (vida de rua)
  buildMapObjects();
  if (MAPDATA.spawn && Array.isArray(MAPDATA.spawn.pos)) { player.x = MAPDATA.spawn.pos[0]; player.z = MAPDATA.spawn.pos[2]; player.y = carGroundHeight(player.x, player.z); player.h = (MAPDATA.spawn.h || 0) * DEG; }
  setInterval(() => { if (typeof started !== 'undefined' && started && !paused) updateMapGens(0.5); }, 500);
  /* "Testar no jogo" do editor: index.html?test=x,y,z,graus[&car=modelo] começa direto naquele ponto */
  const q = new URLSearchParams(location.search), t = q.get('test');
  if (t) {
    const [x, , z, h] = t.split(',').map(Number), carId = q.get('car');
    addEventListener('load', () => setTimeout(async () => {
      player.x = x; player.z = z; player.y = carGroundHeight(x, z); player.h = (h || 0) * DEG; if (typeof cam !== 'undefined') cam.a = player.h;
      startGame(); updateMapGens(0, true);
      if (carId) { try { const type = await loadVehicleType(carId), c = new Car(0x2a6fdb, x + Math.sin(player.h) * 3, z + Math.cos(player.h) * 3, player.h, false, () => makeVehicleMesh(type, 0x2a6fdb)); applyVehDims(c, type.man); c.parked = true; } catch (e) { console.warn(e); } }
      if (typeof toast === 'function') toast('TESTE DO EDITOR — Esc para o menu', 2600);
    }, 600));
  }
}
