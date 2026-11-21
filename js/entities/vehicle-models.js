/* NEON COAST — Carregador genérico de veículos convertidos (assets/models/<id>/): malha completa + LOD, rodas, luzes de emergência */
'use strict';

const VEH_BASE = 'assets/models/';
const vehTypes = {};            // id -> Promise do tipo carregado
const vehReady = {};            // id -> tipo já pronto (síncrono)
const vehLampMats = [];         // materiais de lanternas/faróis (emissão à noite)

/* brilho das luzes de emergência: pontos aditivos coloridos (poucas chamadas de desenho por carro) */
const glowTex = (() => {
  const cv = mkCanvas(64, 64), g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return toTex(cv);
})();
const lightPtsMat = new THREE.PointsMaterial({ size: 0.6, map: glowTex, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

async function buildBinGeo(base, m) {
  const ab = await (await fetch(base + m.file)).arrayBuffer(), v = m.verts, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ab, 0, v * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ab, v * 12, v * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ab, v * 24, v * 2), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(ab, v * 32, m.indices), 1));
  m.groups.forEach(([s, c, mat]) => g.addGroup(s, c, mat));
  g.computeBoundingSphere();
  return g;
}
/* texturas: cache por URL (as genéricas do vehicle.txd, em _generic/, são as mesmas para todos os carros) */
const VEH_TEX = new Map();
function vehTexture(url) {
  let t = VEH_TEX.get(url); if (t) return t;
  t = new THREE.TextureLoader().load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  VEH_TEX.set(url, t); return t;
}
/* placa Mercosul desenhada em canvas: um lote de placas aleatórias, sorteadas por carro */
const PLATE_POOL = [];
function plateTexture(k) {
  const n = 28; if (k === undefined) k = (Math.random() * n) | 0; k = ((k % n) + n) % n;
  if (PLATE_POOL[k]) return PLATE_POOL[k];
  const W = 512, H = 168, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', r = (s) => s[(Math.random() * s.length) | 0], D = '0123456789';
  const txt = r(L) + r(L) + r(L) + r(D) + r(L) + r(D) + r(D);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fbfbf8'); g.addColorStop(1, '#e4e4de'); x.fillStyle = '#2a2a2c'; x.fillRect(0, 0, W, H);
  x.fillStyle = g; x.beginPath(); x.roundRect ? x.roundRect(5, 5, W - 10, H - 10, 14) : x.rect(5, 5, W - 10, H - 10); x.fill();
  x.fillStyle = '#0a3a9c'; x.fillRect(5, 5, W - 10, 38);                                     // faixa azul
  x.fillStyle = '#fff'; x.font = 'bold 28px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BRASIL', W / 2, 25);
  x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc(32, 24, 12, 0, 6.3); x.stroke();          // símbolo Mercosul
  for (let i = 0; i < 4; i++) { x.fillStyle = '#fff'; x.fillRect(27 + (i % 2) * 7, 18 + (i >> 1) * 8, 3, 3); }
  x.fillStyle = '#1f9a3a'; x.fillRect(W - 58, 12, 40, 26); x.fillStyle = '#f7d21c'; x.beginPath(); x.moveTo(W - 38, 14); x.lineTo(W - 21, 25); x.lineTo(W - 38, 36); x.lineTo(W - 55, 25); x.closePath(); x.fill();
  x.fillStyle = '#123f9a'; x.beginPath(); x.arc(W - 38, 25, 6.5, 0, 6.3); x.fill();          // bandeira
  x.fillStyle = '#111'; x.font = 'bold 104px "Arial Narrow", "Roboto Condensed", Arial, sans-serif';
  x.save(); x.translate(W / 2, 108); x.scale(0.86, 1); x.fillText(txt, 0, 0); x.restore();
  x.fillStyle = '#1b1b1b'; x.font = 'bold 15px Arial, sans-serif'; x.textAlign = 'left'; x.fillText('BR', 16, H - 22);
  x.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 160; i++) x.fillRect(Math.random() * W, 44 + Math.random() * (H - 50), 2 + Math.random() * 6, 1);   // sujeira leve
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; PLATE_POOL[k] = t; return t;
}
function makeTexMaterial(m, base, man, extra) {
  const mat = new THREE.MeshStandardMaterial(Object.assign({
    color: new THREE.Color(m.color[0] / 255, m.color[1] / 255, m.color[2] / 255),
    roughness: m.glass ? 0.08 : 0.55, metalness: m.glass ? 0.6 : 0.25,
    side: (m.glass || m.opacity < 1) ? THREE.DoubleSide : THREE.FrontSide
  }, extra || {}));
  if (m.tex) {
    const t = vehTexture(base + man.textures[m.tex]); mat.map = t;
    if (m.lamp) { mat.emissiveMap = t; mat.emissive = new THREE.Color(1, 1, 1); vehLampMats.push(mat); }
    if (m.alpha) { mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; }
  }
  if (m.plate) { mat.map = plateTexture(0); mat.roughness = 0.45; mat.metalness = 0.1; }
  // faróis/lanternas sem textura (cores "mágicas" do SA): brilho próprio leve
  if (m.lamp && !m.tex) { mat.emissive = mat.color.clone().multiplyScalar(m.lamp === 'tail' ? 1.4 : 1); vehLampMats.push(mat); mat.roughness = 0.2; }
  if (m.glass || /^(vidro|vidros|glass|windscreen|windshield)/i.test(m.tex || '') || (!m.tex && m.opacity>0 && m.opacity<0.82 && m.color.every(v=>v<=60))) {
    mat.color.setRGB(0.55, 0.67, 0.74); mat.transparent = true; mat.opacity = 0.22; mat.depthWrite = false;
    mat.side = THREE.DoubleSide; mat.metalness = 0.1; return mat;
  }
  if (m.opacity < 1) { mat.transparent = true; mat.opacity = Math.max(0.35, m.opacity); mat.depthWrite = false; }
  return mat;
}
/* LODs de longe com poucas chamadas de desenho: tudo que não é pintura, vidro ou recorte vira UMA malha com cor por vértice (cor do material × média da textura).
   • "fast" (médio): mantém lanternas; as rodas continuam separadas (giram e esterçam).
   • "far" (longe): lanternas achatadas e as 4 rodas "assadas" na própria malha — 3 a 6 chamadas de desenho por carro em vez de ~25.
   A pintura/vidro continuam com os materiais de sempre (a livery da viatura continua visível). */
function composeLod(type, flatLamps, bakeWheels, avg, srcKey, keepBig) {
  const src = type.geo[srcKey || 'bodyLod'], man = type.man;
  const cls = i => man.materials[i].paint ? 1 : (type.mats[i].transparent ? 2 : (man.materials[i].alpha ? 4 : (man.materials[i].lamp && !flatLamps ? 3 : 0)));
  const sIdx = src.index.array, nSrc = src.attributes.position.count, rest = [], keep = new Map(), extra = [];
  const bigThr = keepBig ? sIdx.length * 0.045 : Infinity;                          // grupos grandes (painéis visíveis) mantêm a textura; só os pequenos viram cor por vértice
  for (const g of src.groups) { const t = sIdx.subarray(g.start, g.start + g.count); if (cls(g.materialIndex) === 0 && g.count < bigThr) rest.push({ mi: g.materialIndex, t }); else { let l = keep.get(g.materialIndex); if (!l) keep.set(g.materialIndex, l = []); l.push(t); } }
  let nv = nSrc;
  if (bakeWheels) for (const w of man.wheels) { const wg = type.geo['wheel' + w.set + 'Lod'] || type.geo['wheel' + w.set]; if (wg) { extra.push({ w, wg, base: nv }); nv += wg.attributes.position.count; } }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), color = new Float32Array(nv * 3).fill(0.5);
  P.set(src.attributes.position.array); N.set(src.attributes.normal.array); U.set(src.attributes.uv.array);
  const restIdx = rest.map(r => r.t);
  for (const e of extra) {
    const pa = e.wg.attributes.position.array, na = e.wg.attributes.normal.array, f = e.w.flip ? -1 : 1, cnt = e.wg.attributes.position.count;
    for (let i = 0; i < cnt; i++) { const o = (e.base + i) * 3; P[o] = pa[i * 3] * f + e.w.pos[0]; P[o + 1] = pa[i * 3 + 1] + e.w.pos[1]; P[o + 2] = pa[i * 3 + 2] * f + e.w.pos[2]; N[o] = na[i * 3] * f; N[o + 1] = na[i * 3 + 1]; N[o + 2] = na[i * 3 + 2] * f; }
    const wi = e.wg.index.array; for (const g of e.wg.groups) { const t = new Uint32Array(g.count); for (let k = 0; k < g.count; k++) t[k] = wi[g.start + k] + e.base; rest.push({ mi: g.materialIndex, t }); }
  }
  let total = 0; rest.forEach(r => total += r.t.length); keep.forEach(l => l.forEach(t => total += t.length));
  const nidx = new Uint32Array(total); let o = 0; const groups = [];
  rest.forEach(r => { nidx.set(r.t, o); o += r.t.length; }); groups.push([0, o, 0]);
  for (const [mi, lists] of keep) { const st = o; lists.forEach(t => { nidx.set(t, o); o += t.length; }); groups.push([st, o - st, mi + 1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setIndex(new THREE.BufferAttribute(nidx, 1)); groups.forEach(([st, c, m]) => g.addGroup(st, c, m)); g.computeBoundingSphere();
  const bake = () => { for (const r of rest) { const m = man.materials[r.mi], a = avg[r.mi], cr = m.color[0] / 255 * a[0], cg = m.color[1] / 255 * a[1], cb = m.color[2] / 255 * a[2]; for (let k = 0; k < r.t.length; k++) { const v = r.t[k] * 3; color[v] = cr; color[v + 1] = cg; color[v + 2] = cb; } } g.attributes.color.needsUpdate = true; };
  bake(); return { g, bake, restMats: rest.map(r => r.mi) };
}
function buildFastLod(type, base) {
  const src = type.geo.bodyLod, man = type.man; if (!src || !src.groups.length) return;
  const avg = man.materials.map(m => m.tex ? [0.5, 0.5, 0.5] : [1, 1, 1]);
  const fast = composeLod(type, false, false, avg, type.geo.bodyMid ? 'bodyMid' : 'bodyLod', !!type.geo.bodyMid); if (fast.restMats.length < 2 && !type.geo.bodyMid) return;          // nada a economizar
  const far = composeLod(type, true, true, avg);
  type.geo.bodyFast = fast.g; type.geo.bodyFar = far.g; type.restMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bakers = [fast.bake, far.bake], seen = new Set();
  for (const mi of [...fast.restMats, ...far.restMats]) {
    const m = man.materials[mi]; if (seen.has(mi) || !m.tex || !man.textures[m.tex]) continue; seen.add(mi);
    const im = new Image(); im.onload = () => { try { const c = mkCanvas(8, 8), x = c.getContext('2d'); x.drawImage(im, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let R = 0, G = 0, B = 0, W = 0; for (let i = 0; i < 64; i++) { const w = d[i * 4 + 3] / 255; R += d[i * 4] * w; G += d[i * 4 + 1] * w; B += d[i * 4 + 2] * w; W += w; } if (W > 2) { avg[mi] = [R / W / 255, G / W / 255, B / W / 255]; bakers.forEach(f => f()); } } catch (e) { /* mantém a cor padrão */ } };
    im.src = base + man.textures[m.tex];
  }
}
function loadVehicleType(id) {
  if (!vehTypes[id]) vehTypes[id] = (async () => {
    const base = VEH_BASE + id + '/', man = await (await fetch(base + 'model.json')).json(), geo = {};
    await Promise.all(Object.entries(man.meshes).map(async ([k, m]) => { geo[k] = await buildBinGeo(base, m); }));
    const type = { id, man, geo, mats: man.materials.map(m => makeTexMaterial(m, base, man)) };
    buildFastLod(type, base);
    vehReady[id] = type; return type;
  })();
  return vehTypes[id];
}

/* luzes: dois grupos (esquerda/direita) que piscam em fases opostas */
function buildLightPoints(man) {
  const P = { A: [], B: [] }, C = { A: [], B: [] };
  for (const l of man.lights) { const k = l.s > 0 ? 'A' : 'B', c = new THREE.Color('#' + l.c); P[k].push(...l.p); C[k].push(c.r, c.g, c.b); }
  const mk = k => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P[k], 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C[k], 3)); const p = new THREE.Points(g, lightPtsMat); p.frustumCulled = false; p.visible = false; return p; };
  return { A: mk('A'), B: mk('B') };
}
function makeVehicleMesh(type, color) {
  const { man, geo } = type, mats = type.mats.map((m,i) => { if (man.materials[i].plate) { const copy = m.clone(); copy.map = plateTexture(); return copy; } if (color === undefined || !man.materials[i].paint) return m; const copy = m.clone(); copy.color.setHex(color); return copy; });
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const hiList = [], loList = [];
  const fast = !!geo.bodyFast, fmats = fast ? [type.restMat].concat(mats) : mats, hi = new THREE.Mesh(geo.body, mats), lo = new THREE.Mesh(fast ? geo.bodyFast : geo.bodyLod, fmats), farM = fast ? new THREE.Mesh(geo.bodyFar, fmats) : null; tilt.add(hi, lo); hiList.push(hi); loList.push(lo); if (farM) tilt.add(farM);
  // porta do motorista: malha própria do modelo (door.bin), articulada na dobradiça; só existe no nível de detalhe 0 (nos outros ela fica fechada e embutida na carroceria)
  let door = null;
  if (man.door && geo.door) {
    const p = man.door.pivot, hinge = new THREE.Group(), dm = new THREE.Mesh(geo.door, mats); hinge.position.set(p[0], p[1], p[2]); dm.position.set(-p[0], -p[1], -p[2]); hinge.add(dm); tilt.add(hinge); hiList.push(dm);
    door = { hinge, mesh: dm, a: 0, target: 0, rate: 3, sign: man.door.sign, len: man.door.len };
  }
  const wheels = [];
  for (const w of man.wheels) {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.set(w.pos[0], w.pos[1], w.pos[2]);
    const wh = new THREE.Mesh(geo['wheel' + w.set], mats), wl = new THREE.Mesh(geo['wheel' + w.set + 'Lod'], mats);
    spin.add(wh, wl); hiList.push(wh); loList.push(wl);
    if (w.flip) spin.rotation.y = Math.PI;           // face externa do pneu para o lado esquerdo
    pivot.add(spin); root.add(pivot); wheels.push({ pivot, w: spin, front: w.front, radius:w.r });
  }
  const L = buildLightPoints(man); tilt.add(L.A, L.B);
  root.userData = { door, tilt, wheels, lights: L, hiList, loList, farM, lodLevel: -1, lodHi: null, typeId: man.id, kind: man.kind, ownedMats: mats.filter((m,i)=>m!==type.mats[i]) };
  setVehLod(root.userData, true);
  return root;
}
/* nível de detalhe: malha completa de perto, simplificada de longe */
/* nível: 0 = detalhe total (perto), 1 = médio, 2 = longe (true/false = 0/1 por compatibilidade) */
function setVehLod(u, lvl, own) {
  lvl = lvl === true ? 0 : lvl === false ? 1 : lvl; if (lvl === 2 && !u.farM) lvl = 1;
  if (u.lodLevel === lvl) return; u.lodLevel = lvl; u.lodHi = lvl === 0;
  u.hiList.forEach(m => { m.visible = lvl === 0; m.castShadow = lvl === 0 && !!own; });         // só o carro do jogador projeta sombra com o modelo completo (centenas de milhares de triângulos)
  u.loList.forEach(m => { m.visible = lvl === 1; m.castShadow = lvl === 1; });
  if (u.farM) { u.farM.visible = lvl === 2; u.farM.castShadow = lvl === 2; }
}
/* dimensões de colisão a partir do modelo */
function applyVehDims(c, man) {
  const d = man.dims, cr = clamp(d.width / 2 * 0.95, 0.4, 1.6);
  c.cr = cr; c.hl = Math.max(0, d.len / 2 - cr); c.len = d.len; c.wr = d.wheelRadius; c.kind = man.kind;
  c.handling = man.handling || {}; c.modelId = man.id; c.physicsCfg = man.physics || null; c.dims = man.dims; c.service = man.service || (man.physics && man.physics.service) || null; c.vehName = man.name;
  if (c.handling.cruise) c.cruise = R2(...c.handling.cruise);
}
