/* NEON COAST — Dano dos veículos: deformação REAL da lataria, vidros, faróis, rodas e destroços.

   Cada batida deforma os vértices da própria malha do carro (todas as versões: completa, média, longe e a porta), a partir de:
   • ponto e ALTURA do impacto (para-choque de carro, para-choque alto de caminhão/ônibus, parede inteira, poste/árvore estreito,
     teto quando o carro cai capotado, assoalho quando cai de pé);
   • direção (para dentro do carro) e quanto o carro RASPOU de lado (o amassado se alonga e vira um risco comprido);
   • força (velocidade de aproximação × peso do outro lado): zona de deformação que encolhe (a frente encurta numa batida forte),
     amassado local, dobras/rugas (ruído), capô que estufa para cima, teto que cede numa batida lateral forte.
   Cada batida tem formato/ruído próprios: nunca sai igual. O metal amassado ganha sombreado facetado (normais pelas derivadas da tela),
   arranhões com o metal aparecendo; vidros trincam e quebram (o vão fica aberto só onde bateu); faróis/lanternas atingidos apagam;
   roda atingida entorta (cambagem) e o carro puxa; em batida muito forte a roda pode soltar. Saem faíscas, cacos e pedaços.
   Também guarda dano por região (frente, trás, esquerda, direita) que tira potência, desalinha e limita o esterço (car-physics-core). */
'use strict';

const wheelDebris = [], smokePuffs = [];
const clampD = (v, a, b) => Math.max(a, Math.min(b, v));
const vehDamage = c => c.dmg || (c.dmg = { front: 0, rear: 0, left: 0, right: 0, total: 0, lost: 0, smokeT: 0 });
const MAX_DEFORMED = 12;                               // carros com malha própria deformada ao mesmo tempo (os mais antigos voltam a compartilhar)
const deformedCars = [];

/* ---------- material: metal amassado facetado, arranhões, vidro trincado/quebrado, farol apagado ---------- */
function dmgPatch(shader) {
  const glass = !!(this.userData && this.userData.dmgGlass);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aDmg; varying float vDmg; varying vec3 vDmgP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n vDmg = aDmg; vDmgP = position;');
  let fs = shader.fragmentShader.replace('#include <common>', `#include <common>
varying float vDmg; varying vec3 vDmgP;
float dmgN(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float dmgNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dmgN(i), dmgN(i + vec3(1,0,0)), f.x), mix(dmgN(i + vec3(0,1,0)), dmgN(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dmgN(i + vec3(0,0,1)), dmgN(i + vec3(1,0,1)), f.x), mix(dmgN(i + vec3(0,1,1)), dmgN(i + vec3(1,1,1)), f.x), f.y), f.z); }`);
  if (glass) fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
  if (vDmg > 0.01) { float n = dmgNoise(vDmgP * 9.0) * 0.6 + dmgNoise(vDmgP * 23.0) * 0.4;
    if (vDmg > 0.3 + 0.25 * n) discard;                                                   // vidro estourado: o vão fica aberto
    float crack = smoothstep(0.02, 0.3, vDmg) * (0.55 + 0.45 * step(0.62, fract(n * 7.0)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.92), crack * 0.75); diffuseColor.a = mix(diffuseColor.a, 0.82, crack); }`);
  else fs = fs.replace('#include <map_fragment>', `#include <map_fragment>
  if (vDmg > 0.01) { float n = dmgNoise(vDmgP * 14.0), s = dmgNoise(vDmgP * vec3(3.0, 40.0, 3.0));
    diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.05, 0.8, vDmg) * (0.6 + 0.4 * n);                         // tinta suja/sombreada
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.56, 0.58) * (0.7 + 0.5 * n), smoothstep(0.35, 0.95, vDmg) * step(0.55, s) * 0.85); }`)   // arranhão: metal aparecendo
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  if (vDmg > 0.04) { vec3 fdx = dFdx(vViewPosition), fdy = dFdy(vViewPosition); vec3 fn = normalize(cross(fdx, fdy));
    normal = normalize(mix(normal, fn, clamp(vDmg * 1.8, 0.0, 0.9))); }`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= 1.0 - smoothstep(0.08, 0.3, vDmg);');      // farol/lanterna quebrado apaga
  shader.fragmentShader = fs;
}
function patchMat(m, glass) {
  const cm = m.clone(); cm.userData = { dmgGlass: glass }; cm.onBeforeCompile = dmgPatch; cm.customProgramCacheKey = () => 'dmg' + (glass ? 'G' : '') + (cm.isMeshLambertMaterial ? 'L' : '');
  if (typeof vehLampMats !== 'undefined' && vehLampMats.includes(m)) { vehLampMats.push(cm); cm.addEventListener('dispose', () => { const i = vehLampMats.indexOf(cm); if (i >= 0) vehLampMats.splice(i, 1); }); }
  return cm;
}

/* ---------- geometria própria do carro (posições + dano por vértice), compartilhando índices/normais/UV com o tipo ---------- */
function glassMask(type, geo, offset) {                // vértices de vidro (para trincar/estourar e não "amassar" como lata)
  if (geo.userData.glassMask) return geo.userData.glassMask;
  const n = geo.attributes.position.count, mask = new Uint8Array(n), idx = geo.index.array, man = type.man;
  for (const g of geo.groups) { const mi = g.materialIndex - offset, m = man.materials[mi], tm = type.mats[mi];
    if (!m || !(m.glass || (tm && tm.transparent && tm.opacity < 0.5))) continue;
    for (let k = g.start; k < g.start + g.count; k++) mask[idx[k]] = 1; }
  return geo.userData.glassMask = mask;
}
/* grade espacial dos vértices (uma vez por geometria do tipo): a batida só percorre as células da região atingida */
const VG_CELL = 0.35;
function vertexGrid(src) {
  if (src.userData.vgrid) return src.userData.vgrid;
  const P = src.attributes.position.array, n = src.attributes.position.count;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / VG_CELL) + 1), ny = Math.max(1, Math.ceil((y1 - y0) / VG_CELL) + 1), nz = Math.max(1, Math.ceil((z1 - z0) / VG_CELL) + 1);
  const cellOf = new Int32Array(n), count = new Int32Array(nx * ny * nz + 1);
  for (let i = 0; i < n; i++) { const c = (Math.floor((P[i * 3 + 2] - z0) / VG_CELL) * ny + Math.floor((P[i * 3 + 1] - y0) / VG_CELL)) * nx + Math.floor((P[i * 3] - x0) / VG_CELL); cellOf[i] = c; count[c + 1]++; }
  for (let c = 1; c < count.length; c++) count[c] += count[c - 1];
  const order = new Int32Array(n), fill = count.slice(0, -1); for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;
  return src.userData.vgrid = { x0, y0, z0, nx, ny, nz, start: count, order };
}
function ownGeo(src, type, offset) {
  const g = new THREE.BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.setIndex(src.index); g.groups = src.groups.map(x => ({ ...x }));
  const pos = src.attributes.position.clone(); g.setAttribute('position', pos);
  const n = pos.count; g.setAttribute('aDmg', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (src.boundingSphere) g.boundingSphere = src.boundingSphere.clone(); if (src.boundingBox) g.boundingBox = src.boundingBox.clone();
  return { g, base: src.attributes.position.array, P: pos.array, A: g.attributes.aDmg.array, n, glass: glassMask(type, src, offset), grid: vertexGrid(src) };
}
function ensureDeform(c) {
  const u = c.mesh.userData; if (u.def) return u.def;
  const type = vehReady[c.modelId]; if (!type || !u.hiList || !u.hiList[0] || !u.loList || !u.loList[0]) return null;
  // limite de carros deformados: o mais antigo (que não é o do jogador) volta para a malha original
  while (deformedCars.length >= MAX_DEFORMED) { const o = deformedCars.find(x => x !== player.car) || deformedCars[0]; releaseDeform(o); }
  const geo = type.geo, def = { list: [], hits: 0 };
  const hi = u.hiList[0], lo = u.loList[0], far = u.farM, door = u.door && u.door.mesh;
  const srcMats = hi.material, mats = srcMats.map((m, i) => patchMat(m, !!(type.man.materials[i] && type.man.materials[i].glass) || (m.transparent && m.opacity < 0.5)));
  const loMats = Array.isArray(lo.material) && lo.material.length === mats.length + 1 ? [patchMat(lo.material[0], false)].concat(mats) : mats;
  const attach = (mesh, mm, off) => { if (!mesh) return; const d = ownGeo(mesh.geometry, type, off); d.mesh = mesh; d.orig = mesh.geometry; mesh.geometry = d.g; mesh.material = mm; def.list.push(d); };
  attach(hi, mats, 0); attach(lo, loMats, loMats === mats ? 0 : 1); if (far) attach(far, loMats, loMats === mats ? 0 : 1); if (door) attach(door, mats, 0);
  def.mats = loMats === mats ? mats : loMats;
  u.ownedMats = (u.ownedMats || []).concat(def.mats); u.def = def; c.deformed = true; deformedCars.push(c);
  const bb = (geo.body.boundingBox || (geo.body.computeBoundingBox(), geo.body.boundingBox)); def.box = bb;
  return def;
}
function releaseDeform(c) {
  const i = deformedCars.indexOf(c); if (i >= 0) deformedCars.splice(i, 1);
  const u = c.mesh && c.mesh.userData, def = u && u.def; if (!def) return;
  const type = vehReady[c.modelId];
  for (const d of def.list) { d.mesh.geometry = d.orig; d.g.dispose(); }
  if (type) { u.hiList[0].material = type.mats.slice(); if (u.door) u.door.mesh.material = u.hiList[0].material; }
  u.def = null; c.deformed = false;
}

/* ---------- a deformação ---------- */
// imp: I (ponto local), N (para dentro), T (tangente do raspão), depth, R (raio lateral), vy (escala vertical), elong (alongamento no raspão), up (estufar capô), seed
function deformList(def, imp) {
  const { I, N, T, depth, R, vy, elong, seed } = imp, R2r = (R * 2.4) ** 2, dz = depth * 2.6, s1 = seed * 17.3, s2 = seed * 7.1;
  const bx = (N[1] * T[2] - N[2] * T[1]), by = (N[2] * T[0] - N[0] * T[2]), bz = (N[0] * T[1] - N[1] * T[0]);   // binormal (vertical da batida)
  let touched = 0;
  const ext = Math.max(R * 2.4 * elong, R * 2.4 * vy, dz, 0.9) + 0.05;        // caixa de influência
  for (const d of def.list) {
    const P = d.P, Bs = d.base, A = d.A, G = d.glass, vg = d.grid;
    const cx0 = Math.max(0, Math.floor((I[0] - ext - vg.x0) / VG_CELL)), cx1 = Math.min(vg.nx - 1, Math.floor((I[0] + ext - vg.x0) / VG_CELL));
    const cy0 = Math.max(0, Math.floor((I[1] - ext - vg.y0) / VG_CELL)), cy1 = Math.min(vg.ny - 1, Math.floor((I[1] + ext - vg.y0) / VG_CELL));
    const cz0 = Math.max(0, Math.floor((I[2] - ext - vg.z0) / VG_CELL)), cz1 = Math.min(vg.nz - 1, Math.floor((I[2] + ext - vg.z0) / VG_CELL));
    for (let gz = cz0; gz <= cz1; gz++) for (let gy = cy0; gy <= cy1; gy++) { const row = (gz * vg.ny + gy) * vg.nx;
    for (let k = vg.start[row + cx0], kEnd = vg.start[row + cx1 + 1]; k < kEnd; k++) {
      const i = vg.order[k], o = i * 3, x = Bs[o], y = Bs[o + 1], z = Bs[o + 2];
      const rx = x - I[0], ry = y - I[1], rz = z - I[2];
      const s = rx * N[0] + ry * N[1] + rz * N[2];                      // profundidade a partir da superfície atingida (para dentro > 0)
      if (s > dz || s < -0.9) continue;
      const ux = rx - N[0] * s, uy = ry - N[1] * s, uz = rz - N[2] * s;  // deslocamento lateral
      const t = (ux * T[0] + uy * T[1] + uz * T[2]) / elong, v = (ux * bx + uy * by + uz * bz) / vy;
      const q2 = t * t + v * v; if (q2 > R2r) continue;
      const wl = Math.exp(-q2 / (R * R) * 2.0);
      const crush = s <= 0 ? 1 : Math.pow(Math.max(0, 1 - s / dz), 1.6);
      const nz = 0.5 + 0.5 * Math.sin(x * 9.1 + s1) * Math.sin(y * 11.7 + z * 6.3 + s2);                 // dobras da lata
      const fold = Math.sin(t * 7.0 + s2) * Math.sin(v * 5.0 + s1);
      let push = depth * wl * crush * (0.72 + 0.56 * nz);
      if (push < 0.002) continue;
      if (G[i]) { A[i] = Math.min(1, A[i] + wl * crush * (0.35 + depth * 1.4)); push *= 0.5; }          // vidro: trinca/estoura mais do que amassa
      else A[i] = Math.min(1, A[i] + Math.min(1, push * 2.6 + wl * crush * 0.15));
      // deslocamento: para dentro, rugas para os lados, capô/porta-malas estufa (impacto de frente/trás) ou teto cede (lateral)
      const side = Math.abs(N[0]) > 0.6, up = (!side && y > I[1] + 0.15) ? push * imp.up * Math.min(1, (y - I[1]) / 0.6) : side && y > I[1] + 0.5 ? -push * 0.18 : 0;
      let dx = N[0] * push + T[0] * fold * push * 0.22, dy = N[1] * push + up + fold * push * 0.1, dz2 = N[2] * push + T[2] * fold * push * 0.22;
      const cx = P[o] + dx - x, cy = P[o + 1] + dy - y, cz = P[o + 2] + dz2 - z, cl = Math.hypot(cx, cy, cz);
      if (cl > 1.25) { const k = 1.25 / cl; dx = cx * k - (P[o] - x); dy = cy * k - (P[o + 1] - y); dz2 = cz * k - (P[o + 2] - z); }   // limite de amassado acumulado
      P[o] += dx; P[o + 1] += dy; P[o + 2] += dz2; touched++;
    } }
    d.g.attributes.position.needsUpdate = true; d.g.attributes.aDmg.needsUpdate = true;
  }
  return touched;
}

/* ---------- destroços: faíscas, cacos de vidro, pedaços de plástico/tinta ---------- */
const DEBRIS_MAX = 90, debris = [], debrisGeo = new THREE.BoxGeometry(1, 1, 1);
const debrisMats = { glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.75 }), plastic: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.7 }) };
const SPARK_N = 240, sparkPos = new Float32Array(SPARK_N * 3), sparkVel = new Float32Array(SPARK_N * 3), sparkLife = new Float32Array(SPARK_N); let sparkHead = 0;
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparkTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(cv); })();
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: sparkTex, color: 0xffffff, size: 0.12, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
sparks.frustumCulled = false; scene.add(sparks); for (let i = 0; i < SPARK_N; i++) sparkPos[i * 3 + 1] = -1000;
function spawnSparks(x, y, z, vx, vz, n) { for (let k = 0; k < n; k++) { const i = sparkHead = (sparkHead + 1) % SPARK_N; sparkPos.set([x, y, z], i * 3); sparkVel.set([vx * 0.5 + R2(-3, 3), R2(1, 4.5), vz * 0.5 + R2(-3, 3)], i * 3); sparkLife[i] = R2(0.25, 0.6); } }
function spawnDebris(x, y, z, vx, vz, n, kind, color) {
  for (let k = 0; k < n; k++) {
    let mat = debrisMats[kind]; if (kind === 'paint') { mat = new THREE.MeshStandardMaterial({ color: color || 0x777777, roughness: 0.4, metalness: 0.4 }); }
    const m = new THREE.Mesh(debrisGeo, mat), s = kind === 'glass' ? R2(0.03, 0.07) : R2(0.05, 0.16); m.scale.set(s * R2(0.6, 1.6), s * 0.25, s * R2(0.6, 1.4));
    m.position.set(x + R2(-0.3, 0.3), y + R2(-0.1, 0.2), z + R2(-0.3, 0.3)); m.castShadow = false; scene.add(m);
    debris.push({ m, vx: vx * 0.6 + R2(-2.5, 2.5), vy: R2(1, 4), vz: vz * 0.6 + R2(-2.5, 2.5), wx: R2(-12, 12), wz: R2(-12, 12), life: R2(6, 12), own: kind === 'paint' });
    while (debris.length > DEBRIS_MAX) { const o = debris.shift(); scene.remove(o.m); if (o.own) o.m.material.dispose(); }
  }
}

/* ---------- batida ----------
   impact = velocidade de aproximação (m/s) no ponto (px, pz); other = o outro veículo (ou null); nx,nz = normal no mundo (empurra ESTE carro para fora);
   info.kind: 'wall' | 'pole' | 'land' (queda) */
function applyVehicleDamage(c, impact, other, px, pz, nx, nz, info) {
  if (!c.physics) return;
  const p = c.physics, kind = info && info.kind || (other ? 'car' : 'wall');
  // velocidade de raspão (tangente ao contato)
  let vt = 0, tx = 0, tz = 0;
  if (nx !== undefined) { const ovx = other && other.physics ? other.physics.vx : 0, ovz = other && other.physics ? other.physics.vz : 0, rvx = p.vx - ovx, rvz = p.vz - ovz; tx = -nz; tz = nx; vt = rvx * tx + rvz * tz; }
  const scrape = Math.abs(vt) > 7 && impact < 3.5 && kind !== 'land';
  if (impact < 3.5 && !scrape) return;
  if (scrape) { if ((c.scrapeCd || 0) > 0) return; c.scrapeCd = 0.18; }
  else { if ((c.dmgCd || 0) > 0 && impact <= (c.lastImpact || 0) * 1.25) return; c.lastImpact = impact; c.dmgCd = 0.45; }
  const mass = p.cfg.mass, om = other && other.physics ? other.physics.cfg.mass : kind === 'pole' ? 2500 : 14000;
  const sev = scrape ? 0.05 : clampD((impact - 3.5) / 26, 0, 1.2) * clampD(Math.sqrt(om / mass), 0.4, 1.7);
  const d = vehDamage(c), ddx = px - c.x, ddz = pz - c.z, sh = Math.sin(c.h), ch = Math.cos(c.h);
  const lz = ddx * sh + ddz * ch, lx = ddx * ch - ddz * sh;                       // local: +z frente, +x esquerda
  const front = Math.abs(lz) >= Math.abs(lx) * 0.8;
  if (!scrape) {
    if (front) d[lz > 0 ? 'front' : 'rear'] = clampD(d[lz > 0 ? 'front' : 'rear'] + sev * 0.8, 0, 1);
    d[lx > 0 ? 'left' : 'right'] = clampD(d[lx > 0 ? 'left' : 'right'] + sev * (front ? 0.25 : 0.8), 0, 1);
    d.total = clampD(d.total + sev * 0.45, 0, 1);
  }
  /* geometria da batida no espaço do modelo */
  const far = c !== player.car && Math.hypot(c.x - camera.position.x, c.z - camera.position.z) > 75;
  const def = far ? c.mesh.userData.def || null : ensureDeform(c);
  const gy = p.y - p.cfg.cg, wy = Math.max(0.2, gy);
  let N, I, depth, R, vy, elong = 1, up = 0.3;
  if (def) {
    const b = def.box, cz0 = p.centerZ;
    if (kind === 'land') {
      const upside = Math.cos(p.roll) * Math.cos(p.pitch) < 0.2;                   // capotado: o teto amassa
      N = upside ? [0, -1, 0] : [0, 1, 0];
      I = [lx * 0.5, upside ? b.max.y : b.min.y + 0.15, cz0 + R2(-0.6, 0.6)];
      depth = clampD((impact - 6) * (upside ? 0.045 : 0.012), 0, upside ? 0.55 : 0.12); R = upside ? 1.0 + depth : 1.4; vy = upside ? 1.3 : 1.2; up = 0;
      if (upside) d.total = clampD(d.total + 0.25, 0, 1);
    } else {
      // normal para dentro, em coordenadas do carro
      // nx,nz empurram o carro para FORA do obstáculo = do ponto de contato para dentro da lataria; passa para o espaço do carro
      let lnx = nx !== undefined ? nx * ch - nz * sh : -Math.sign(lx || 1) * (front ? 0.2 : 1), lnz = nx !== undefined ? nx * sh + nz * ch : -Math.sign(lz || 1) * (front ? 1 : 0.2);
      const ln = Math.hypot(lnx, lnz) || 1; lnx /= ln; lnz /= ln;
      // ponto de entrada: do centro local, sai na direção oposta à normal até a caixa do modelo
      const ox = clampD(lx, b.min.x, b.max.x), oz = clampD(lz + cz0, b.min.z, b.max.z);
      let tmax = 1e9; if (lnx > 1e-3) tmax = Math.min(tmax, (ox - b.min.x) / lnx); if (lnx < -1e-3) tmax = Math.min(tmax, (ox - b.max.x) / lnx);
      if (lnz > 1e-3) tmax = Math.min(tmax, (oz - b.min.z) / lnz); if (lnz < -1e-3) tmax = Math.min(tmax, (oz - b.max.z) / lnz);
      tmax = Math.max(0, Math.min(tmax, 6));
      // altura: para-choque do outro veículo (caminhão/ônibus bate alto), parede pega a frente inteira, poste é estreito e alto
      const oh = other && other.dims ? other.dims.height : other ? 1.5 : 1.0;
      const hitY = kind === 'car' ? clampD(0.28 + oh * 0.2 + (other && other.physics && other.physics.cfg ? (other.physics.y - (other.physics.cfg.cg || 0.5)) - wy : 0), 0.3, 1.5) : kind === 'pole' ? R2(0.5, 0.9) : R2(0.45, 0.7);
      I = [ox - lnx * tmax, b.min.y + hitY, oz - lnz * tmax]; N = [lnx, 0, lnz];
      const k = scrape ? 0.02 + Math.min(0.08, Math.abs(vt) * 0.004) : clampD(0.012 * Math.pow(impact, 1.35) * clampD(Math.sqrt(om / mass), 0.45, 1.9), 0, 0.95);
      depth = k * R2(0.85, 1.15);
      R = kind === 'pole' ? 0.26 + depth * 0.18 : kind === 'wall' ? 0.85 + depth * 0.8 : 0.7 + depth * 0.65;
      vy = kind === 'pole' ? 4 : kind === 'wall' ? 0.9 : 0.55 + oh * 0.12;
      if (scrape || Math.abs(vt) > 4) elong = 1 + Math.min(3.5, Math.abs(vt) / 5);
      up = Math.abs(lnz) > 0.6 ? R2(0.2, 0.45) : 0;
    }
    const T = [tx ? (tx * ch - tz * sh) : -N[2], 0, tx ? (tx * sh + tz * ch) : N[0]], tl = Math.hypot(T[0], T[2]) || 1; T[0] /= tl; T[2] /= tl;
    if (Math.abs(N[1]) > 0.5) { T[0] = 1; T[1] = 0; T[2] = 0; }
    if (![...I, ...N, depth, R, vy, elong].every(Number.isFinite)) return;      // dados de colisão inválidos: não amassa
    def.hits++; deformList(def, { I, N, T, depth, R, vy, elong, up, seed: Math.random() * 100 });
    // roda perto da batida entorta (cambagem); muito perto + muito forte: pode soltar
    if (!scrape && kind !== 'land') {
      // as rodas perto da zona amassada são empurradas junto (visual; a física continua com o entre-eixos original)
      const u = c.mesh.userData;
      p.wheels.forEach((w, i) => { const wv = u.wheels[i]; if (!wv || w.lost) return; const rx = w.x - I[0], ry = w.y - I[1], rz = w.z - I[2], s = rx * N[0] + ry * N[1] + rz * N[2];
        const ux = rx - N[0] * s, uz = rz - N[2] * s, q2 = ux * ux + uz * uz, dz = depth * 2.6; if (s > dz || q2 > (R * 2.4) ** 2) return;
        const push = Math.min(0.45, depth * Math.exp(-q2 / (R * R) * 1.2) * (s <= 0 ? 1 : Math.pow(1 - s / dz, 1.6)) * 0.8);
        if (!wv.home) wv.home = wv.pivot.position.clone(); wv.pivot.position.x += N[0] * push; wv.pivot.position.z += N[2] * push;
        const off = Math.hypot(wv.pivot.position.x - wv.home.x, wv.pivot.position.z - wv.home.z); if (off > 0.5) { wv.pivot.position.x = wv.home.x + (wv.pivot.position.x - wv.home.x) * 0.5 / off; wv.pivot.position.z = wv.home.z + (wv.pivot.position.z - wv.home.z) * 0.5 / off; } });
      let best = -1, bd = 1e9;
      p.wheels.forEach((w, i) => { if (w.lost) return; const dd = Math.hypot(w.x - I[0], w.z - I[2]); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0 && bd < 1.2 && depth > 0.18 && u.wheels[best]) { const wv = u.wheels[best]; wv.camber = clampD((wv.camber || 0) + Math.sign(p.wheels[best].x || 1) * depth * R2(0.25, 0.5), -0.4, 0.4); wv.pivot.rotation.z = wv.camber; d[p.wheels[best].x > 0 ? 'left' : 'right'] = clampD(d[p.wheels[best].x > 0 ? 'left' : 'right'] + 0.15, 0, 1); }
      if (impact > 20 && sev > 0.6 && best >= 0 && bd < 1.6 && Math.random() < clampD((impact - 20) / 20, 0, 1) * 0.25) detachWheel(c, best, impact);
    }
  }
  /* faíscas e pedaços */
  const wyHit = wy + (I ? I[1] : 0.5), vx0 = p.vx, vz0 = p.vz;
  if (kind !== 'land') spawnSparks(px, wyHit, pz, vx0, vz0, scrape ? 10 : Math.round(8 + sev * 30));
  if (!scrape && sev > 0.12 && Math.hypot(px - camera.position.x, pz - camera.position.z) < 80) {
    spawnDebris(px, wyHit, pz, vx0, vz0, Math.round(2 + sev * 8), 'plastic');
    if (sev > 0.3) spawnDebris(px, wyHit + 0.3, pz, vx0, vz0, Math.round(4 + sev * 14), 'glass');
    if (sev > 0.25) { spawnDebris(px, wyHit, pz, vx0, vz0, Math.round(1 + sev * 4), 'paint', paintHex(c, def)); }
  }
  if (c === player.car && sev > 0.35) toast(d.total > 0.7 ? 'Veículo muito danificado!' : 'Veículo danificado', 1300);
}

function paintHex(c, def) {                            // cor da pintura do carro (material marcado como pintura no modelo)
  const type = vehReady[c.modelId], u = c.mesh.userData; if (!type) return 0x777777;
  const i = type.man.materials.findIndex(m => m.paint); const mm = i >= 0 && u.hiList && u.hiList[0] && u.hiList[0].material[i];
  return mm && mm.color ? mm.color.getHex() : 0x777777;
}
/* carro removido/trocado: devolve a memória da malha deformada */
function disposeDeform(c) { if (c && c.mesh && c.mesh.userData.def) { for (const d of c.mesh.userData.def.list) d.g.dispose(); c.mesh.userData.def = null; } const i = deformedCars.indexOf(c); if (i >= 0) deformedCars.splice(i, 1); }
function detachWheel(c, i, impact) {
  const p = c.physics, u = c.mesh.userData, w = p.wheels[i], d = vehDamage(c);
  w.lost = true; d.lost++; if (u.wheels[i]) u.wheels[i].pivot.visible = false;
  const q = CarPhysics.point(c, w), type = vehReady[c.modelId], set = (type && type.man.wheels[i]) ? type.man.wheels[i].set : 0;
  let mesh;
  if (type && type.geo['wheel' + set]) mesh = new THREE.Mesh(type.geo['wheel' + set], type.mats);
  else mesh = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, 0.25, 14).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x151515 }));
  const holder = new THREE.Group(); holder.add(mesh); holder.position.set(q.x, q.y, q.z); holder.rotation.y = c.h + (w.x < 0 ? 0 : Math.PI); scene.add(holder);
  const side = w.x > 0 ? 1 : -1;
  wheelDebris.push({ g: holder, spinMesh: mesh, x: q.x, y: q.y, z: q.z, vx: p.vx * 0.8 + Math.cos(c.h) * side * R2(2, 6), vy: R2(3, 7), vz: p.vz * 0.8 - Math.sin(c.h) * side * R2(2, 6), r: w.r, ang: 0, life: 30 });
  while (wheelDebris.length > 8) { const o = wheelDebris.shift(); scene.remove(o.g); }
  if (c === player.car) { toast('A RODA SOLTOU!', 1800); shake = Math.max(shake, 1); }
  p.impact = 0;
}

/* a cada quadro: rodas soltas, faíscas, destroços e fumaça de veículos muito danificados */
const smokeMat = new THREE.SpriteMaterial({ map: typeof glowTex !== 'undefined' ? glowTex : null, color: 0x555555, transparent: true, depthWrite: false, opacity: 0.5, fog: true });
function updateDamageEffects(dt) {
  for (const c of cars) { if (c.dmgCd > 0) c.dmgCd -= dt; if (c.scrapeCd > 0) c.scrapeCd -= dt; }
  for (let i = deformedCars.length - 1; i >= 0; i--) if (!cars.includes(deformedCars[i])) deformedCars.splice(i, 1);
  for (let i = wheelDebris.length - 1; i >= 0; i--) {
    const o = wheelDebris[i]; o.life -= dt;
    o.vy -= 9.81 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
    const gh = Hq(o.x, o.z) + o.r;
    if (o.y < gh) { o.y = gh; if (o.vy < 0) o.vy = -o.vy * 0.38; if (Math.abs(o.vy) < 0.8) o.vy = 0; const f = Math.exp(-dt * 0.55); o.vx *= f; o.vz *= f; }
    if (o.y <= gh + 0.01) { const sp = Math.hypot(o.vx, o.vz); o.ang += sp * dt / o.r; }
    o.g.position.set(o.x, o.y, o.z); o.spinMesh.rotation.x = o.ang;
    if (o.life <= 0 || o.y < -3) { scene.remove(o.g); wheelDebris.splice(i, 1); }
  }
  let anySpark = false;
  for (let i = 0; i < SPARK_N; i++) { if (sparkLife[i] <= 0) continue; anySpark = true; sparkLife[i] -= dt; const o = i * 3;
    sparkVel[o + 1] -= 9.81 * dt; sparkPos[o] += sparkVel[o] * dt; sparkPos[o + 1] += sparkVel[o + 1] * dt; sparkPos[o + 2] += sparkVel[o + 2] * dt;
    if (sparkLife[i] <= 0) sparkPos[o + 1] = -1000; }
  if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
  for (let i = debris.length - 1; i >= 0; i--) {
    const o = debris[i], m = o.m; o.life -= dt;
    if (o.vy !== 0 || m.position.y > 0) { o.vy -= 9.81 * dt; m.position.x += o.vx * dt; m.position.y += o.vy * dt; m.position.z += o.vz * dt; m.rotation.x += o.wx * dt; m.rotation.z += o.wz * dt;
      const gh = (typeof carGroundHeight === 'function' ? carGroundHeight(m.position.x, m.position.z) : Hq(m.position.x, m.position.z)) + 0.01;
      if (m.position.y < gh) { m.position.y = gh; o.vy = Math.abs(o.vy) > 1.2 ? -o.vy * 0.3 : 0; o.vx *= 0.5; o.vz *= 0.5; o.wx *= 0.4; o.wz *= 0.4; if (o.vy === 0) { o.vx = o.vz = 0; m.rotation.x = 0; m.rotation.z = 0; } } }
    if (o.life <= 0) { scene.remove(m); if (o.own) m.material.dispose(); debris.splice(i, 1); }
  }
  for (let i = smokePuffs.length - 1; i >= 0; i--) {
    const s = smokePuffs[i]; s.life -= dt; s.sp.position.y += dt * 1.6; s.sp.position.x += s.dx * dt; s.sp.position.z += s.dz * dt;
    const t = 1 - s.life / s.max; s.sp.scale.setScalar(0.8 + t * 3.2); s.sp.material.opacity = 0.45 * (1 - t);
    if (s.life <= 0) { scene.remove(s.sp); s.sp.material.dispose(); smokePuffs.splice(i, 1); }
  }
  for (const c of cars) {                              // fumaça saindo do capô quando a frente está muito destruída (só perto da câmera)
    const d = c.dmg; if (!d || d.front < 0.45 && d.total < 0.7) continue;
    d.smokeT -= dt; if (d.smokeT > 0 || smokePuffs.length > 40) continue;
    if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) > 90) continue;
    d.smokeT = 0.12 + (1 - Math.max(d.front, d.total)) * 0.35;
    const m = smokeMat.clone(), sp = new THREE.Sprite(m), fx = Math.sin(c.h), fz = Math.cos(c.h), len = c.len * 0.32, y = (c.physics ? c.physics.y - c.physics.cfg.cg : Hq(c.x, c.z)) + 1.1;
    sp.position.set(c.x + fx * len, y, c.z + fz * len); scene.add(sp);
    smokePuffs.push({ sp, life: 1.8, max: 1.8, dx: R2(-0.4, 0.4), dz: R2(-0.4, 0.4) });
  }
}

/* o conserto (reposicionar o carro) desamassa, devolve vidros, faróis e rodas e zera o dano */
function repairVehicle(c) {
  const u = c.mesh.userData; c.dmg = null;
  if (u.def) for (const d of u.def.list) { d.P.set(d.base); d.A.fill(0); d.g.attributes.position.needsUpdate = true; d.g.attributes.aDmg.needsUpdate = true; }
  if (u.wheels) u.wheels.forEach(w => { w.pivot.visible = true; w.camber = 0; w.pivot.rotation.z = 0; if (w.home) { w.pivot.position.x = w.home.x; w.pivot.position.z = w.home.z; } });
}
