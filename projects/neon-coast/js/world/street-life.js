/* NEON COAST — vida de rua: objetos brasileiros de calçada (saco de lixo, caçamba de entulho, hidrante, placa de rua azul de SP,
   poste de concreto, entulho, palete, papelão), lixo miúdo no chão (papel, copo, lata, PET, bituca, folhas) e POMBOS andando e voando.
   • Os objetos entram na biblioteca do editor (MAP_PREFABS) e são espalhados pela cidade; cada peça espalhada é uma entidade
     editável do mapa (mover/apagar no NEON ENGINE). O lixo miúdo é desenhado em lote (instâncias) e não é editável peça a peça.
   • Pombos: bandos em praças, parques e calçadas perto do jogador; ciscam, se assustam com gente correndo, carro, tiro ou explosão
     (eventos do ped-ai.js), levantam voo batendo asa e pousam mais adiante. Tudo em 3 chamadas de desenho (instâncias). */
'use strict';
/* ---------- objetos (todos em coordenadas locais, y = chão) ---------- */
const SL_STREETS = {
  sp: ['R. Augusta', 'Av. Paulista', 'R. da Consolação', 'R. Oscar Freire', 'Al. Santos', 'R. Haddock Lobo', 'R. Frei Caneca', 'R. Bela Cintra', 'Av. Rebouças', 'R. Teodoro Sampaio', 'R. Vergueiro', 'R. 25 de Março', 'R. Direita', 'R. XV de Novembro', 'Av. São João', 'R. Barão de Itapetininga', 'Av. Ipiranga', 'R. da Mooca', 'R. Galvão Bueno', 'Av. Brig. Faria Lima'],
  rj: ['R. Visc. de Pirajá', 'Av. Atlântica', 'R. Barata Ribeiro', 'Av. N. Sra. de Copacabana', 'R. do Ouvidor', 'Av. Rio Branco', 'R. da Carioca', 'R. Farme de Amoedo', 'R. Jardim Botânico', 'Av. Pres. Vargas', 'R. Voluntários da Pátria', 'R. São Clemente']
};
const slSignTex = new Map();
function slStreetSign(line1, line2) {
  const k = line1 + '|' + line2; if (slSignTex.has(k)) return slSignTex.get(k);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#123f8c'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(4, 4, 248, 56);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 24px Arial, sans-serif'; g.fillText(line1, 128, 32, 236);
  g.font = '12px Arial, sans-serif'; g.fillText(line2, 128, 51, 236);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; const m = new THREE.MeshLambertMaterial({ map: t }); slSignTex.set(k, m); return m;
}
const SLP = {
  bag(m, x, y, z, s, col) { s = s || 1; col = col || [0.07, 0.07, 0.08]; m.dome(x, y, z, 0.33 * s, 0.42 * s, col, 9); m.cone(x, y + 0.38 * s, z, 0.08 * s, 0.16 * s, col.map(v => v * 1.2), 6); },
  pile(m, x, y, z, yaw, n) { const s = Math.sin(yaw), c = Math.cos(yaw); n = n || 4;
    for (let k = 0; k < n; k++) { const ox = (k % 3 - 1) * 0.5 + (Math.random() - 0.5) * 0.2, oz = (k > 2 ? 0.45 : 0) + (Math.random() - 0.5) * 0.15, col = Math.random() < 0.25 ? [0.12, 0.25, 0.55] : Math.random() < 0.2 ? [0.85, 0.85, 0.82] : [0.06, 0.06, 0.07];
      SLP.bag(m, x + ox * c + oz * s, y + (k > 3 ? 0.3 : 0), z - ox * s + oz * c, 0.8 + Math.random() * 0.45, col); }
    if (Math.random() < 0.6) m.box(x + 0.8 * c, y, z - 0.8 * s, 0.5, 0.35, 0.45, [0.62, 0.48, 0.3], { yaw: yaw + 0.3 }); },
  cacamba(m, x, y, z, yaw, col) {                                        // caçamba de entulho (estacionária) com entulho dentro
    col = col || [0.92, 0.5, 0.08]; const s = Math.sin(yaw), c = Math.cos(yaw), P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    m.box(x, y, z, 1.6, 0.12, 3.0, col.map(v => v * 0.7), { yaw });
    const wall = (ax, az, bx, bz, h) => { const A = P(ax, 0.12, az), B2 = P(bx, 0.12, bz), C = P(bx * 1.18, h, bz * 1.14), D = P(ax * 1.18, h, az * 1.14);
      const ux = B2[0] - A[0], uy = B2[1] - A[1], uz = B2[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      m.quad(A, B2, C, D, nx, ny, nz, col); m.quad(B2, A, D, C, -nx, -ny, -nz, col.map(v => v * 0.75)); };
    wall(-0.8, -1.5, 0.8, -1.5, 1.1); wall(0.8, 1.5, -0.8, 1.5, 1.1); wall(-0.8, 1.5, -0.8, -1.5, 1.1); wall(0.8, -1.5, 0.8, 1.5, 1.1);
    for (let k = 0; k < 9; k++) { const lx = (Math.random() - 0.5) * 1.3, lz = (Math.random() - 0.5) * 2.5; m.box(x + lx * c + lz * s, y + 0.15, z - lx * s + lz * c, 0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.55, 0.3 + Math.random() * 0.4, Math.random() < 0.5 ? [0.6, 0.58, 0.55] : [0.55, 0.38, 0.3], { yaw: Math.random() * 3 }); }
  },
  hidrante(m, x, y, z) { const r = [0.78, 0.08, 0.06]; m.cyl(x, y, z, 0.13, 0.62, r, 10); m.dome(x, y + 0.62, z, 0.13, 0.1, r, 8); m.cyl(x - 0.2, y + 0.38, z, 0.06, 0.1, r, 6); m.cyl(x + 0.14, y + 0.38, z, 0.06, 0.1, r, 6); m.box(x, y, z, 0.32, 0.06, 0.32, [0.5, 0.5, 0.5]); },
  poste(m, x, y, z, yaw) { const g = [0.68, 0.67, 0.64], s = Math.sin(yaw), c = Math.cos(yaw);   // poste de concreto (seção) com cruzeta e transformador
    m.box(x, y, z, 0.28, 9.5, 0.22, g); m.box(x, y + 8.6, z, 2.2, 0.12, 0.12, [0.35, 0.33, 0.3], { yaw });
    for (const k of [-0.9, 0, 0.9]) m.cyl(x + k * c, y + 8.72, z - k * s, 0.04, 0.12, [0.85, 0.85, 0.8], 5);
    m.cyl(x + 0.42 * s, y + 6.6, z + 0.42 * c, 0.3, 0.9, [0.45, 0.47, 0.48], 10); },
  entulho(m, x, y, z) { for (let k = 0; k < 14; k++) { const a = Math.random() * 6.28, d = Math.random() * 0.8; m.box(x + Math.cos(a) * d, y, z + Math.sin(a) * d, 0.2 + Math.random() * 0.35, 0.15 + Math.random() * 0.3 * (1 - d), 0.2 + Math.random() * 0.3, Math.random() < 0.6 ? [0.62, 0.6, 0.57] : [0.62, 0.36, 0.27], { yaw: Math.random() * 3 }); } },
  palete(m, x, y, z, yaw) { const w = [0.6, 0.47, 0.32]; for (const k of [-0.45, 0, 0.45]) m.box(x, y, z, 1.2, 0.1, 0.1, w, { yaw: yaw + Math.PI / 2 * 0 }); for (let k = -2; k <= 2; k++) { const s = Math.sin(yaw), c = Math.cos(yaw); m.box(x + k * 0.24 * c, y + 0.1, z - k * 0.24 * s, 0.14, 0.03, 1.0, w, { yaw }); } },
  papelao(m, x, y, z, yaw) { m.box(x, y, z, 0.55, 0.4, 0.45, [0.66, 0.52, 0.34], { yaw }); m.box(x, y + 0.4, z, 0.57, 0.02, 0.47, [0.6, 0.46, 0.3], { yaw }); }
};
const slMesh = fn => p => { const m = new Mesher(); fn(m, p); const o = m.build(propMat); o.castShadow = true; return o; };
if (typeof MAP_PREFABS !== 'undefined') Object.assign(MAP_PREFABS, {
  saco_lixo:  { name: 'Saco de lixo', cat: 'Rua (Brasil)', params: {}, solid: false, make: slMesh(m => SLP.bag(m, 0, 0, 0)) },
  pilha_lixo: { name: 'Pilha de lixo', cat: 'Rua (Brasil)', params: {}, make: slMesh(m => SLP.pile(m, 0, 0, 0, 0, 5)) },
  cacamba:    { name: 'Caçamba de entulho', cat: 'Rua (Brasil)', params: { color: '#eb8014' }, surface: 'box', make: slMesh((m, p) => SLP.cacamba(m, 0, 0, 0, 0, col3(p.color))) },
  hidrante:   { name: 'Hidrante', cat: 'Rua (Brasil)', params: {}, col: 0.2, make: slMesh(m => SLP.hidrante(m, 0, 0, 0)) },
  poste_conc: { name: 'Poste de concreto', cat: 'Rua (Brasil)', params: {}, col: 0.2, make: slMesh(m => SLP.poste(m, 0, 0, 0, 0)) },
  entulho:    { name: 'Entulho', cat: 'Rua (Brasil)', params: {}, solid: false, make: slMesh(m => SLP.entulho(m, 0, 0, 0)) },
  palete:     { name: 'Palete', cat: 'Rua (Brasil)', params: {}, solid: false, make: slMesh(m => SLP.palete(m, 0, 0, 0, 0)) },
  papelao:    { name: 'Caixa de papelão', cat: 'Rua (Brasil)', params: {}, solid: false, make: slMesh(m => SLP.papelao(m, 0, 0, 0, 0)) },
  placa_rua:  { name: 'Placa de rua (SP)', cat: 'Rua (Brasil)', params: { color: '#123f8c' }, col: 0.1,
    make: p => { const G = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.9, 8).translate(0, 1.45, 0), new THREE.MeshLambertMaterial({ color: 0x5d6166 })); G.add(pole);
      const names = SL_STREETS.sp, a = names[Math.floor(Math.random() * names.length)], b = names[Math.floor(Math.random() * names.length)];
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), slStreetSign(a, 'BELA VISTA')); s1.position.set(0, 2.75, 0.03); const s1b = s1.clone(); s1b.rotation.y = Math.PI; s1b.position.z = -0.03; G.add(s1, s1b);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), slStreetSign(b, 'BELA VISTA')); s2.rotation.y = Math.PI / 2; s2.position.set(0.03, 2.48, 0); const s2b = s2.clone(); s2b.rotation.y = -Math.PI / 2; s2b.position.x = -0.03; G.add(s2, s2b);
      return G; } }
});

/* ---------- espalha pela cidade (cada peça é uma entidade editável) ---------- */
const SL_BATCH = new (class { constructor() { this.cells = new Map(); } at(x, z) { const k = Math.floor(x / 150) + ',' + Math.floor(z / 150); let m = this.cells.get(k); if (!m) this.cells.set(k, m = new Mesher()); return m; }
  build() { for (const m of this.cells.values()) if (m.v) { const o = m.build(propMat); o.castShadow = true; o.receiveShadow = true; scene.add(o); } } })();
const slRnd = mulberry32(777);
const slR = (a, b) => a + (b - a) * slRnd();
/* ponto na calçada do quarteirão (lado 0..3, posição u ao longo, d = distância do centro) */
function slSidewalk(b, side, u, d) { return side === 0 ? [b.cx + u, b.cz - d] : side === 1 ? [b.cx + d, b.cz + u] : side === 2 ? [b.cx - u, b.cz + d] : [b.cx - d, b.cz - u]; }
const slYawOut = side => [Math.PI, Math.PI / 2, 0, -Math.PI / 2][side];
const SL_LITTER = { paper: [], cup: [], can: [], pet: [], butt: [], leaf: [] };
{
  const roadName = (C, axis, idx) => { const L = SL_STREETS[C] || SL_STREETS.sp; return L[(idx * 7 + (axis === 'x' ? 3 : 0)) % L.length]; };
  for (const b of CITY_BLOCKS) {
    const busy = b.type === 'T' || b.type === 'M' || b.type === 'C' || b.type === 'L', res = b.type === 'R', park = b.type === 'P' || b.type === 'Z';
    const at = (side, u, d) => slSidewalk(b, side, u, d), y = 0.3;
    // placa de rua numa esquina (nomes pelas ruas que se cruzam ali)
    if (slRnd() < 0.85) { const sx = slRnd() < 0.5 ? -1 : 1, sz = slRnd() < 0.5 ? -1 : 1, x = b.cx + sx * 26.9, z = b.cz + sz * 26.9;
      worldEntity('placa-rua', 'Placa de rua', x, z, () => { const G = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.9, 8).translate(0, 1.45, 0), new THREE.MeshLambertMaterial({ color: 0x5d6166 })); G.add(pole);
        const n1 = roadName(b.city, 'x', b.i + (sx > 0 ? 1 : 0)), n2 = roadName(b.city, 'z', b.j + (sz > 0 ? 1 : 0)), bairro = (typeof zoneName === 'function' ? zoneName(b.cx, b.cz) : '').toUpperCase().slice(0, 28);
        const s1 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), slStreetSign(n2, bairro)); s1.position.set(0, 2.75, 0); s1.material.side = THREE.DoubleSide;
        const s2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), slStreetSign(n1, bairro)); s2.rotation.y = Math.PI / 2; s2.position.set(0, 2.48, 0); s2.material.side = THREE.DoubleSide;
        G.add(s1, s2); G.position.set(x, y, z); scene.add(G); addRound(x, z, 0.1); }); }
    // hidrante
    if (slRnd() < 0.55) { const side = Math.floor(slRnd() * 4), p = at(side, slR(-20, 20), 27.2); worldEntity('hidrante', 'Hidrante', p[0], p[1], () => { SLP.hidrante(SL_BATCH.at(p[0], p[1]), p[0], y, p[1]); addRound(p[0], p[1], 0.2); }); }
    // sacos de lixo encostados nos prédios (mais em área comercial)
    const piles = park ? 0 : busy ? 2 + Math.floor(slRnd() * 3) : 1 + Math.floor(slRnd() * 2);
    for (let k = 0; k < piles; k++) { const side = Math.floor(slRnd() * 4), p = at(side, slR(-22, 22), 26.6 - slR(0, 0.6)); worldEntity('lixo', 'Pilha de lixo', p[0], p[1], () => { SLP.pile(SL_BATCH.at(p[0], p[1]), p[0], y, p[1], slYawOut(side), 2 + Math.floor(slRnd() * 4)); }); }
    // caçamba de entulho (obra/reforma), entulho e palete
    if ((res || b.type === 'M') && slRnd() < 0.22) { const side = Math.floor(slRnd() * 4), p = at(side, slR(-18, 18), 26.4), col = [[0.92, 0.5, 0.08], [0.95, 0.78, 0.1], [0.2, 0.45, 0.75], [0.35, 0.55, 0.25]][Math.floor(slRnd() * 4)];
      worldEntity('cacamba', 'Caçamba de entulho', p[0], p[1], () => { SLP.cacamba(SL_BATCH.at(p[0], p[1]), p[0], y, p[1], slYawOut(side) + Math.PI / 2, col); addCollider({ x0: p[0] - 1.6, x1: p[0] + 1.6, z0: p[1] - 1.6, z1: p[1] + 1.6, h: 1.4 }); });
      if (slRnd() < 0.6) { const q = at(side, slR(-22, 22), 25.8); worldEntity('entulho', 'Entulho', q[0], q[1], () => SLP.entulho(SL_BATCH.at(q[0], q[1]), q[0], y, q[1])); } }
    if (busy && slRnd() < 0.3) { const side = Math.floor(slRnd() * 4), p = at(side, slR(-20, 20), 26.2); worldEntity('papelao', 'Papelão e palete', p[0], p[1], () => { SLP.palete(SL_BATCH.at(p[0], p[1]), p[0], y, p[1], slR(0, 3)); SLP.papelao(SL_BATCH.at(p[0], p[1]), p[0] + 0.3, y + 0.12, p[1] + 0.2, slR(0, 3)); }); }
    // lixo miúdo na calçada e na sarjeta
    const litter = park ? 18 : busy ? 70 : 34;
    for (let k = 0; k < litter; k++) {
      const side = Math.floor(slRnd() * 4), gutter = slRnd() < 0.35, p = gutter ? at(side, slR(-27, 27), 28.2 + slR(0, 0.5)) : at(side, slR(-26, 26), slR(22, 27.6)), yy = gutter ? 0.06 : y, r = slRnd();
      const kind = r < 0.32 ? 'paper' : r < 0.44 ? 'cup' : r < 0.56 ? 'can' : r < 0.64 ? 'pet' : r < 0.8 ? 'butt' : 'leaf';
      SL_LITTER[kind].push([p[0], yy, p[1], slR(0, 6.28), slRnd()]);
    }
  }
  SL_BATCH.build();
  /* lixo miúdo: uma malha instanciada por tipo */
  const dum = new THREE.Object3D(), colOf = { paper: () => [0.92, 0.91, 0.86], cup: () => slRnd() < 0.5 ? [0.95, 0.95, 0.95] : [0.85, 0.15, 0.12], can: () => [[0.75, 0.1, 0.1], [0.1, 0.3, 0.75], [0.7, 0.7, 0.72], [0.1, 0.55, 0.2]][Math.floor(slRnd() * 4)], pet: () => [0.55, 0.75, 0.6], butt: () => [0.9, 0.75, 0.5], leaf: () => [0.55 + slRnd() * 0.2, 0.42, 0.2] };
  const geoOf = { paper: new THREE.PlaneGeometry(0.22, 0.28).rotateX(-Math.PI / 2).translate(0, 0.012, 0), cup: new THREE.CylinderGeometry(0.04, 0.03, 0.1, 7).rotateZ(Math.PI / 2).translate(0, 0.04, 0),
    can: new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8).rotateZ(Math.PI / 2).translate(0, 0.033, 0), pet: new THREE.CylinderGeometry(0.045, 0.045, 0.26, 8).rotateZ(Math.PI / 2).translate(0, 0.045, 0),
    butt: new THREE.CylinderGeometry(0.006, 0.006, 0.035, 4).rotateZ(Math.PI / 2).translate(0, 0.006, 0), leaf: new THREE.CircleGeometry(0.06, 5).rotateX(-Math.PI / 2).translate(0, 0.01, 0) };
  for (const [k, list] of Object.entries(SL_LITTER)) {
    if (!list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ side: k === 'paper' || k === 'leaf' ? THREE.DoubleSide : THREE.FrontSide, transparent: k === 'pet', opacity: k === 'pet' ? 0.75 : 1 }), im = new THREE.InstancedMesh(geoOf[k], mat, list.length), c = new THREE.Color();
    list.forEach(([x, y, z, a, r], i) => { dum.position.set(x, y + (k === 'paper' ? r * 0.01 : 0), z); dum.rotation.set(k === 'paper' ? (r - 0.5) * 0.3 : 0, a, 0); dum.scale.setScalar(0.85 + r * 0.4); dum.updateMatrix(); im.setMatrixAt(i, dum.matrix); const cc = colOf[k](); im.setColorAt(i, c.setRGB(cc[0], cc[1], cc[2])); });
    im.frustumCulled = false; im.receiveShadow = true; scene.add(im);
  }
}

/* ---------- pombos ---------- */
const PIG = { max: 72, birds: [], flocks: [], t: 0, ready: false };
(function buildPigeons() {
  // corpo (com cabeça e rabo) e asa (uma malha, espelhada na esquerda)
  const m = new Mesher(), g = [0.52, 0.53, 0.58], dark = [0.3, 0.31, 0.36], neck = [0.36, 0.45, 0.42];
  m.dome(0, 0.06, 0, 0.09, 0.11, g, 8); m.dome(0, 0.06, 0, 0.09, -0.05, g.map(v => v * 0.9), 8);
  m.box(0, 0.08, -0.13, 0.08, 0.02, 0.12, dark); m.cyl(0, 0.13, 0.07, 0.035, 0.06, neck, 6); m.dome(0, 0.19, 0.08, 0.035, 0.04, dark, 6); m.dome(0, 0.19, 0.08, 0.035, -0.025, dark, 6);
  m.cone(0, 0.185, 0.115, 0.012, 0.03, [0.2, 0.2, 0.2], 4); m.cyl(-0.03, 0, 0.0, 0.006, 0.05, [0.75, 0.35, 0.35], 4); m.cyl(0.03, 0, 0.0, 0.006, 0.05, [0.75, 0.35, 0.35], 4);
  const bodyGeo = m.build(propMat).geometry;
  const wing = new THREE.BufferGeometry(), wp = new Float32Array([0, 0, 0.05, 0.2, 0, 0.0, 0.18, 0, -0.08, 0, 0, -0.07]);
  wing.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wing.setIndex([0, 1, 2, 0, 2, 3]); wing.computeVertexNormals();
  const wmat = new THREE.MeshLambertMaterial({ color: 0x7a7e88, side: THREE.DoubleSide });
  PIG.body = new THREE.InstancedMesh(bodyGeo, propMat, PIG.max); PIG.wl = new THREE.InstancedMesh(wing, wmat, PIG.max); PIG.wr = new THREE.InstancedMesh(wing, wmat, PIG.max);
  for (const im of [PIG.body, PIG.wl, PIG.wr]) { im.count = 0; im.frustumCulled = false; im.castShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
  PIG.ready = true;
})();
const _pgM = new THREE.Matrix4(), _pgQ = new THREE.Quaternion(), _pgE = new THREE.Euler(0, 0, 0, 'YXZ'), _pgS = new THREE.Vector3(1, 1, 1), _pgP = new THREE.Vector3(), _pgW = new THREE.Matrix4();
/* lugares bons para pombo: praças, parques, marcos e calçadas movimentadas */
function pigSpot(px, pz) {
  for (let t = 0; t < 14; t++) {
    const a = Math.random() * 6.28, d = 25 + Math.random() * 60, x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
    if (!inCity(x, z, 0)) continue;
    const bi = Math.floor((x + HALF) / P), bj = Math.floor((z + HALF) / P), blk = CITY_BLOCKS.find(b => b.i === bi && b.j === bj);
    const inBlock = blk && Math.abs(x - blk.cx) < B / 2 - 1 && Math.abs(z - blk.cz) < B / 2 - 1;
    const good = blk && (blk.type === 'Z' || blk.type === 'P' || blk.type === 'L' || blk.lm) ? inBlock : inBlock && (Math.abs(x - blk.cx) > 22 || Math.abs(z - blk.cz) > 22);
    if (!good) continue; const q = { x, z }; if (pushOut(q, 0.5, nearby(x, z))) continue;
    return [x, z];
  }
  return null;
}
function pigFlock(x, z) {
  const n = 5 + Math.floor(Math.random() * 9), F = { x, z, birds: [] };
  for (let i = 0; i < n && PIG.birds.length < PIG.max; i++) {
    const a = Math.random() * 6.28, r = Math.random() * 3, b = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r, y: 0, h: Math.random() * 6.28, st: 'walk', t: Math.random() * 5, vx: 0, vz: 0, vy: 0, flap: 0, peck: 0, flock: F, tint: 0.8 + Math.random() * 0.35, s: 0.9 + Math.random() * 0.25 };
    b.y = carGroundHeight(b.x, b.z); F.birds.push(b); PIG.birds.push(b);
  }
  PIG.flocks.push(F); return F;
}
/* bando inteiro levanta voo e vai pousar em outro lugar */
function pigScare(F, fx, fz) {
  if (F.flying) return; F.flying = true; const away = Math.atan2(F.x - fx, F.z - fz) + (Math.random() - 0.5);
  const d = 25 + Math.random() * 30; let tx = F.x + Math.sin(away) * d, tz = F.z + Math.cos(away) * d; const sp = pigSpot(tx, tz); if (sp) { tx = sp[0]; tz = sp[1]; }
  F.tx = tx; F.tz = tz;
  for (const b of F.birds) { b.st = 'fly'; b.t = 0; b.delay = Math.random() * 0.35; b.tx = tx + (Math.random() - 0.5) * 5; b.tz = tz + (Math.random() - 0.5) * 5; b.vy = 3 + Math.random() * 1.5; }
}
function updatePigeons(dt) {
  if (!PIG.ready || (typeof paused !== 'undefined' && paused)) return;
  PIG.t += dt; const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z, nearCity = inCity(px, pz, 40);
  // bandos aparecem perto do jogador (cidade) e somem longe
  for (let i = PIG.flocks.length - 1; i >= 0; i--) { const F = PIG.flocks[i]; if (Math.hypot(F.x - px, F.z - pz) > 150 && !F.flying) { PIG.birds = PIG.birds.filter(b => b.flock !== F); PIG.flocks.splice(i, 1); } }
  if (nearCity && PIG.flocks.length < 6 && PIG.birds.length < PIG.max - 6 && Math.random() < dt * 0.8) { const s = pigSpot(px, pz); if (s) pigFlock(s[0], s[1]); }
  // sustos: gente correndo perto, carro passando, tiro/explosão (eventos do ped-ai)
  for (const F of PIG.flocks) {
    if (F.flying) continue; const d = Math.hypot(F.x - px, F.z - pz), pspd = player.car ? Math.abs(player.car.speed) : Math.hypot(player.vx, player.vz);
    let scare = (d < 4.5 && pspd > 1.2) || d < 2.2 || (player.car && d < 9 && pspd > 3);
    if (!scare) for (const c of cars) if (Math.abs(c.speed) > 4 && Math.hypot(c.x - F.x, c.z - F.z) < 7) { scare = true; break; }
    if (!scare && typeof aiEvents !== 'undefined') for (const e of aiEvents) if ((e.type === 'gunshot' || e.type === 'explosion' || e.type === 'fight') && Math.hypot(e.x - F.x, e.z - F.z) < (e.type === 'fight' ? 12 : 70)) { scare = true; break; }
    if (scare) pigScare(F, d < 20 ? px : F.x + 1, d < 20 ? pz : F.z);
  }
  let n = 0; const cam = camera.position;
  for (const b of PIG.birds) {
    b.t += dt;
    if (b.st === 'walk') {
      b.peck -= dt; if (b.peck < -2.5 - Math.random() * 3) b.peck = 0.6;                                // cisca de vez em quando
      if (Math.random() < dt * 0.5) b.h += (Math.random() - 0.5) * 2;
      const sp = b.peck > 0 ? 0 : 0.25, nx = b.x + Math.sin(b.h) * sp * dt, nz = b.z + Math.cos(b.h) * sp * dt, F = b.flock;
      if (Math.hypot(nx - F.x, nz - F.z) < 4.5) { b.x = nx; b.z = nz; } else b.h += Math.PI * dt * 2;
      b.y = carGroundHeight(b.x, b.z); b.flap = 0;
    } else {
      if (b.delay > 0) { b.delay -= dt; } else {
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz), gy = carGroundHeight(b.x, b.z);
        const sp = Math.min(9, 2 + b.t * 6); b.h += wrap(Math.atan2(dx, dz) - b.h) * Math.min(1, dt * 4);
        b.x += Math.sin(b.h) * sp * dt; b.z += Math.cos(b.h) * sp * dt;
        const cruise = gy + Math.min(9, 3 + d * 0.25); b.vy += ((d < 6 ? gy + 0.1 : cruise) - b.y) * dt * 2.5 - b.vy * dt * 1.5; b.y += b.vy * dt;
        b.flap += dt * (d < 6 || b.t < 1.2 ? 26 : 16);
        if (d < 0.8 || (d < 4 && b.y < gy + 0.25)) { b.st = 'walk'; b.y = gy; b.vy = 0; }
      }
    }
    if (n >= PIG.max) break;
    const far = Math.hypot(b.x - cam.x, b.z - cam.z) > 110; if (far) continue;
    const pitch = b.st === 'walk' ? (b.peck > 0 ? 0.45 * Math.abs(Math.sin(b.peck * 9)) : Math.sin(b.t * 7) * 0.05) : -0.15;
    _pgE.set(pitch, b.h, 0); _pgQ.setFromEuler(_pgE); _pgS.setScalar(b.s); _pgP.set(b.x, b.y, b.z); _pgM.compose(_pgP, _pgQ, _pgS); PIG.body.setMatrixAt(n, _pgM);
    PIG.body.setColorAt(n, new THREE.Color(b.tint, b.tint, b.tint * 1.04));
    const fl = b.st === 'walk' ? 0.05 : Math.sin(b.flap) * 1.0 + 0.2;
    for (const [im, side] of [[PIG.wr, 1], [PIG.wl, -1]]) { _pgW.makeRotationZ(side * fl); if (side < 0) _pgW.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1)); _pgW.premultiply(new THREE.Matrix4().makeTranslation(side * 0.04, 0.12, 0.02)); im.setMatrixAt(n, _pgM.clone().multiply(_pgW)); }
    n++;
  }
  for (const im of [PIG.body, PIG.wl, PIG.wr]) { im.count = n; im.instanceMatrix.needsUpdate = true; } if (PIG.body.instanceColor) PIG.body.instanceColor.needsUpdate = true;
}
