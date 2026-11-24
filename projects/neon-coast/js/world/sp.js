/* NEON COAST — São Paulo reconstruída.
   Bairros (Vila Madalena, Luz, Centro, Sé, 25 de Março, Liberdade, Mooca, Av. Paulista, Ibirapuera, Itaim, Pacaembu) e marcos:
   Estação da Luz, Mercadão, Edifício Itália, Copan, Catedral da Sé, Banespa e Martinelli, Theatro Municipal, Liberdade com torii e
   lanternas, MASP, FIESP, Conjunto Nacional, antenas da Paulista, Parque Trianon, Ibirapuera (Obelisco, Oca, marquise, lago),
   Rio Pinheiros canalizado com a Ponte Estaiada e o Morumbi do outro lado.
   Também: fiação nos postes, orelhões, bancas, pontos de ônibus, ciclovia da Paulista, pichações e grafites, bueiros/remendos no asfalto.
   Carregado ANTES de city.js: a cidade chama SP_BUILD (por quadra) e, no fim, buildSPExtras(). */
'use strict';
/* mapa de distritos de SP: T torres  M comércio  R residencial  I industrial  P parque  Z praça  S estádio  C shopping  L marco (SP_LM) */
const LAYOUT_SP = ['RRRRIMMI', 'RRRMLLLI', 'RRMLLLLI', 'RRMMLLLM', 'MTTLLLTM', 'MTTLTTCM', 'RLLTTTSR', 'ILLTTZRR'];
const SP_LM = { '4,1': 'luz', '5,1': 'mercadao', '6,1': 'rua25', '3,2': 'italia', '4,2': 'copan', '5,2': 'se', '6,2': 'banespa', '4,3': 'municipal', '5,3': 'liberdade', '6,3': 'liberdade',
  '3,4': 'trianon', '4,4': 'conjunto', '5,4': 'fiesp', '3,5': 'masp', '1,6': 'obelisco', '2,6': 'marquise', '1,7': 'lago', '2,7': 'oca' };
const SP_PARKS = new Set(['trianon', 'obelisco', 'marquise', 'lago', 'oca']);
const SP_ANTENNAS = new Set(['1,4', '6,4', '5,5']);
const SP_BAIRROS = [['Liberdade', 5, 6, 3, 3], ['Sé', 5, 5, 2, 2], ['25 de Março', 6, 6, 1, 1], ['Luz', 4, 5, 0, 1], ['Mooca', 7, 7, 0, 3], ['Centro', 3, 6, 1, 3],
  ['Av. Paulista', 0, 7, 4, 5], ['Ibirapuera', 0, 2, 6, 7], ['Itaim Bibi', 3, 5, 6, 7], ['Pacaembu', 6, 7, 6, 7], ['Vila Madalena', 0, 2, 0, 3], ['Bom Retiro', 3, 6, 0, 0]];
function spBairro(x, z) {
  if (inPinh(x, z, 14)) return Math.abs(z - PINH.bz) < 16 ? 'Ponte Estaiada' : 'Marginal Pinheiros';
  if (nearMorumbi(x, z, 50) || onMorumbiRoad(x, z, 20)) return 'Morumbi';
  if (cityAt(x, z, 0) !== SP) return null;
  const i = Math.floor((x + HALF) / P), j = Math.floor((z + HALF) / P);
  for (const [n, i0, i1, j0, j1] of SP_BAIRROS) if (i >= i0 && i <= i1 && j >= j0 && j <= j1) return n;
  return null;
}
const spTrees = [];                                   // árvores de rua de SP (sibipirunas/tipuanas); vegetation.js desenha
let curCityId = 'sp';
function plantTree(p) { (curCityId === 'sp' ? spTrees : palmSpots).push(p); }

/* ---------- malhas próprias (células de 150 m) ---------- */
class SPCells {
  constructor() { this.cells = new Map(); }
  at(x, z) { const k = Math.floor(x / 150) + ',' + Math.floor(z / 150); let m = this.cells.get(k); if (!m) this.cells.set(k, m = new Mesher()); return m; }
  box(x, y, z, ...a) { this.at(x, z).box(x, y, z, ...a); } cyl(x, y, z, ...a) { this.at(x, z).cyl(x, y, z, ...a); } cone(x, y, z, ...a) { this.at(x, z).cone(x, y, z, ...a); }
  dome(x, y, z, ...a) { this.at(x, z).dome(x, y, z, ...a); } gable(x, y, z, ...a) { this.at(x, z).gable(x, y, z, ...a); }
  quad(p, ...a) { this.at(p[0], p[2]).quad(p, ...a); } tri(p, ...a) { this.at(p[0], p[2]).tri(p, ...a); } beam(a, ...r) { this.at(a[0], a[2]).beam(a, ...r); }
  build(mat, shadows) { for (const m of this.cells.values()) if (m.v) { const mesh = m.build(mat, shadows); scene.add(mesh); farCullAdd(mesh); } }
}
/* cúpula (calota elipsoidal); p0..p1 = faixa de ângulo (deixa a frente aberta, p. ex. no orelhão); inner = desenha por dentro */
Mesher.prototype.dome = function (cx, y0, cz, r, h, col, seg, p0, p1, inner) {
  seg = seg || 14; p0 = p0 || 0; p1 = p1 === undefined ? Math.PI * 2 : p1; const rings = 6;
  const P = (t, p) => [cx + Math.cos(p) * Math.cos(t) * r, y0 + Math.sin(t) * h, cz + Math.sin(p) * Math.cos(t) * r];
  for (let a = 0; a < rings; a++) { const t0 = a / rings * Math.PI / 2, t1 = (a + 1) / rings * Math.PI / 2, tm = (t0 + t1) / 2;
    for (let k = 0; k < seg; k++) { const q0 = p0 + (p1 - p0) * k / seg, q1 = p0 + (p1 - p0) * (k + 1) / seg, pm = (q0 + q1) / 2;
      let nx = Math.cos(pm) * Math.cos(tm) / r, ny = Math.sin(tm) / h, nz = Math.sin(pm) * Math.cos(tm) / r; const nl = Math.hypot(nx, ny, nz), c = col.map(v => v * (0.86 + 0.14 * Math.sin(tm)));
      if (inner) this.quad(P(t0, q0), P(t0, q1), P(t1, q1), P(t1, q0), -nx / nl, -ny / nl, -nz / nl, c.map(v => v * 0.7));
      else this.quad(P(t0, q1), P(t0, q0), P(t1, q0), P(t1, q1), nx / nl, ny / nl, nz / nl, c); } }
};
/* viga de seção quadrada entre dois pontos 3D (pernas inclinadas do mastro, treliças) */
Mesher.prototype.beam = function (a, b, w, col) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), f = d.map(v => v / L), up = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const s = nrm(cr(f, up)), t = cr(s, f), hw = w / 2, C = (p, i, j) => [p[0] + (s[0] * i + t[0] * j) * hw, p[1] + (s[1] * i + t[1] * j) * hw, p[2] + (s[2] * i + t[2] * j) * hw];
  const sides = [[1, 1, 1, -1, s], [1, -1, -1, -1, t.map(v => -v)], [-1, -1, -1, 1, s.map(v => -v)], [-1, 1, 1, 1, t]];
  sides.forEach(([i0, j0, i1, j1, n], k) => this.quad(C(a, i0, j0), C(a, i1, j1), C(b, i1, j1), C(b, i0, j0), n[0], n[1], n[2], col.map(v => v * (k % 2 ? 0.86 : 1))));
};
const LM = new SPCells();                              // detalhes dos marcos (cor por vértice)
const LMS = new Mesher(), LMPIX = new Mesher(), LMMUR = new Mesher(), LMDEC = new Mesher();   // letreiros, pichações, grafites, decalques de rua
const spSpot = (t, x, z, h, o) => npcSpots.push(Object.assign({ t, x, z, h, area: 'city', n: 1, y: 0.3 }, o || {}));

/* ---------- texturas: letreiros dos marcos, pichações, grafites ---------- */
const LM_TXT = [['ESTAÇÃO DA LUZ', '#7a1f1a', '#f3e6c8'], ['MERCADO MUNICIPAL', '#3b2a1a', '#f1d79a'], ['THEATRO MUNICIPAL', '#2b2b2b', '#e8d9a8'], ['CONJUNTO NACIONAL', '#b3121b', '#ffffff'],
  ['MASP', '#c8151d', '#ffffff'], ['ESTÁDIO DO PACAEMBU', '#1c2c4c', '#ffffff'], ['ESTÁDIO DO MORUMBI', '#c8151d', '#ffffff'], ['CATEDRAL DA SÉ', '#2f3a33', '#efe6cf'],
  ['LIBERDADE', '#b3121b', '#fff2c0'], ['AV. PAULISTA', '#1d4fa0', '#ffffff'], ['PARQUE IBIRAPUERA', '#215c2f', '#ffffff'], ['MARGINAL PINHEIROS', '#1d4fa0', '#ffffff'],
  ['25 DE MARÇO', '#e0a800', '#1a1a1a'], ['FIESP', '#111820', '#9fd3ff'], ['EDIFÍCIO ITÁLIA', '#2b2b2b', '#f3e6c8'], ['BEM-VINDO A SÃO PAULO', '#1d4fa0', '#ffffff']];
const lmSignMat = (() => {
  const cv = mkCanvas(1024, 2048), g = cv.getContext('2d');
  LM_TXT.forEach(([t, bg, fg], i) => { const y = i * 128; g.fillStyle = bg; g.fillRect(0, y, 1024, 128); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(10, y + 10, 1004, 108); g.fillStyle = fg; g.font = 'bold 76px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 512, y + 68, 960); });
  const m = new THREE.MeshLambertMaterial({ map: toTex(cv, false), emissive: 0x333333 }); return m;
})();
function lmSign(idx, x, y, z, w, h, nx, nz) {
  const rx = nz, rz = -nx, v0 = 1 - (idx + 1) / 16, v1 = 1 - idx / 16;
  LMS.quad([x - rx * w / 2, y, z - rz * w / 2], [x + rx * w / 2, y, z + rz * w / 2], [x + rx * w / 2, y + h, z + rz * w / 2], [x - rx * w / 2, y + h, z - rz * w / 2], nx, 0, nz, [1, 1, 1], [0, v0, 1, v0, 1, v1, 0, v1]);
}
const pixoMat = (() => {                                // pichação "reta" paulistana: letras altas e angulosas, preto de spray
  const cv = mkCanvas(1024, 512), g = cv.getContext('2d'), r = mulberry32(1532);
  for (let c = 0; c < 8; c++) { const ox = (c % 4) * 256, oy = Math.floor(c / 4) * 256, rows = 1 + Math.floor(r() * 2);
    g.strokeStyle = r() < 0.85 ? 'rgba(14,14,16,0.92)' : 'rgba(150,20,20,0.9)'; g.lineWidth = 5 + r() * 3; g.lineCap = 'square';
    for (let row = 0; row < rows; row++) { const y0 = oy + 30 + row * 110, hh = rows === 1 ? 190 : 90, n = 4 + Math.floor(r() * 4), lw = 220 / n;
      for (let k = 0; k < n; k++) { const x0 = ox + 18 + k * lw, x1 = x0 + lw * 0.7; g.beginPath(); g.moveTo(x0, y0 + hh); g.lineTo(x0, y0 + hh * 0.15); g.lineTo(x0 + lw * 0.3, y0); const kind = r();
        if (kind < 0.3) { g.lineTo(x1, y0 + hh * 0.2); g.lineTo(x1, y0 + hh); } else if (kind < 0.6) { g.moveTo(x0, y0 + hh * 0.5); g.lineTo(x1, y0 + hh * 0.35); g.lineTo(x1, y0 + hh); } else { g.moveTo(x1, y0); g.lineTo(x1, y0 + hh); g.moveTo(x0, y0 + hh * 0.55); g.lineTo(x1, y0 + hh * 0.55); }
        g.stroke(); if (r() < 0.3) { g.fillStyle = g.strokeStyle; g.fillRect(x0 - 2, y0 + hh, 3, 8 + r() * 18); } } } }
  return new THREE.MeshLambertMaterial({ map: toTex(cv, false), transparent: true, alphaTest: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
})();
const muralMat = (() => {                               // grafites coloridos (Beco do Batman)
  const cv = mkCanvas(1024, 512), g = cv.getContext('2d'), r = mulberry32(2718), pal = ['#ff4f81', '#ffd23f', '#3bceac', '#0ead69', '#540d6e', '#ee4266', '#1b98e0', '#f86624', '#ffffff', '#111111'];
  const pk = () => pal[Math.floor(r() * pal.length)];
  for (let c = 0; c < 8; c++) { const ox = (c % 4) * 256, oy = Math.floor(c / 4) * 256, gr = g.createLinearGradient(ox, oy, ox + 256, oy + 256); gr.addColorStop(0, pk()); gr.addColorStop(1, pk()); g.fillStyle = gr; g.fillRect(ox, oy, 256, 256);
    for (let k = 0; k < 7; k++) { g.fillStyle = pk(); g.beginPath(); g.arc(ox + r() * 256, oy + r() * 256, 18 + r() * 60, 0, 6.3); g.fill(); }
    g.lineWidth = 8; g.strokeStyle = '#111'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(ox, oy + r() * 256); for (let s = 1; s <= 8; s++) g.lineTo(ox + s * 32, oy + 128 + Math.sin(s + r() * 3) * 80); g.stroke(); }
    if (r() < 0.6) { const fx = ox + 128, fy = oy + 128; g.fillStyle = pk(); g.beginPath(); g.ellipse(fx, fy, 70, 85, 0, 0, 6.3); g.fill(); g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * 26, fy - 14, 15, 0, 6.3); g.fill(); } g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * 26, fy - 12, 7, 0, 6.3); g.fill(); } g.lineWidth = 6; g.beginPath(); g.arc(fx, fy + 18, 28, 0.2, Math.PI - 0.2); g.stroke(); }
    else { g.font = 'bold 90px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.lineWidth = 10; g.strokeStyle = '#111'; const t = ['SP', 'ZN', 'ZL', 'VIDA', 'ARTE', 'PAZ'][Math.floor(r() * 6)]; g.strokeText(t, ox + 128, oy + 160); g.fillStyle = pk(); g.fillText(t, ox + 128, oy + 160); } }
  return new THREE.MeshLambertMaterial({ map: toTex(cv, false), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
})();
/* decalque numa face do prédio (0:-z 1:+x 2:+z 3:-x); kind 'pixo' (perto do topo) ou 'mural' (térreo) */
function spWallArt(x, z, w, d, H, kind, face) {
  const f = face === undefined ? Math.floor(rnd() * 4) : face, n = [[0, -1], [1, 0], [0, 1], [-1, 0]][f], half = f % 2 ? d : w, along = f % 2 ? w / 2 : d / 2;
  const cell = Math.floor(rnd() * 8), u0 = (cell % 4) / 4, u1 = u0 + 0.25, v1 = 1 - Math.floor(cell / 4) / 2, v0 = v1 - 0.5;
  const ww = kind === 'pixo' ? Math.min(half * 0.8, rr(5, 9)) : Math.min(half * 0.85, rr(4.5, 7)), hh = kind === 'pixo' ? ww * 0.55 : ww * 0.62;
  const y = kind === 'pixo' ? Math.max(0.6, H - hh - rr(0.4, 1.6)) : 0.45, off = rr(-(half - ww) / 2, (half - ww) / 2);
  const cx = x + n[0] * (along + 0.05) + (f % 2 ? 0 : off), cz = z + n[1] * (along + 0.05) + (f % 2 ? off : 0), rx = n[1], rz = -n[0];
  (kind === 'pixo' ? LMPIX : LMMUR).quad([cx - rx * ww / 2, y, cz - rz * ww / 2], [cx + rx * ww / 2, y, cz + rz * ww / 2], [cx + rx * ww / 2, y + hh, cz + rz * ww / 2], [cx - rx * ww / 2, y + hh, cz - rz * ww / 2], n[0], 0, n[1], [1, 1, 1], [u0, v0, u1, v0, u1, v1, u0, v1]);
}

/* ---------- prisma de base poligonal com fachada texturizada (Copan, Edifício Itália...) ---------- */
function prismWall(mat, pts, y0, h, color, roofCol) {
  let A = 0; for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? 1 : -1, Pp = [], Nn = [], Uu = [], Ii = []; let v = 0, run = 0, cx = 0, cz = 0;
  const ov = (y0 / TILE) % 1;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4) continue;
    const nx = sg * (b[1] - a[1]) / len, nz = -sg * (b[0] - a[0]) / len, u0 = run / TILE, u1 = (run + len) / TILE; run += len; cx += a[0]; cz += a[1];
    const [p, q] = sg > 0 ? [b, a] : [a, b], [up, uq] = sg > 0 ? [u1, u0] : [u0, u1];
    Pp.push(p[0], y0, p[1], q[0], y0, q[1], q[0], y0 + h, q[1], p[0], y0 + h, p[1]); for (let i = 0; i < 4; i++) Nn.push(nx, 0, nz);
    Uu.push(up, ov, uq, ov, uq, ov + h / TILE, up, ov + h / TILE); Ii.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Uu, 2)); g.setIndex(Ii);
  cx /= pts.length; cz /= pts.length; cityBatch.add(g, mat, cx, 0, cz, new THREE.Matrix4(), color);
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []), rc = roofCol || hexRGB(0x8a8a86), Y = y0 + h;
  for (const [i0, i1, i2] of tris) { let a = pts[i0], b = pts[i1], c = pts[i2]; const cy = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]); if (cy < 0) { const t = b; b = c; c = t; } LM.tri([a[0], Y, a[1]], [b[0], Y, b[1]], [c[0], Y, c[1]], 0, 1, 0, rc); }
}
const ringPts = (cx, cz, rf, n) => { const o = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, r = rf(a); o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };
function antenna(x, y, z, H) {                         // torre de TV treliçada, vermelha e branca
  const n = 9, red = hexRGB(0xd0342c), white = [0.95, 0.95, 0.95];
  for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, w0 = lerp(4.4, 0.9, t0), w1 = lerp(4.4, 0.9, t1), ya = y + t0 * H, yb = y + t1 * H, c = k % 2 ? white : red;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) LM.beam([x + sx * w0 / 2, ya, z + sz * w0 / 2], [x + sx * w1 / 2, yb, z + sz * w1 / 2], 0.22, c);
    for (const [sx, sz, ex, ez] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) LM.beam([x + sx * w0 / 2, ya, z + sz * w0 / 2], [x + ex * w1 / 2, yb, z + ez * w1 / 2], 0.1, c);
    LM.box(x, yb - 0.15, z, w1 + 0.4, 0.15, w1 + 0.4, c); }
  LM.cyl(x, y + H, z, 0.2, H * 0.3, red, 6); LM.cyl(x, y + H * 1.3, z, 0.35, 0.4, [1, 0.2, 0.15], 6);
}
const STONE = 0xcfc5ad, COPPER = hexRGB(0x5d9077), SLATE = hexRGB(0x4c5257), CONC = hexRGB(0xb9b6ae), RED = hexRGB(0xe0261c);

/* ---------- construtores das quadras-marco (cx, cz = centro da quadra; laje a 0,3 m; área útil ±23 m) ---------- */
const SP_BUILD = {
  luz(cx, cz) {                                        // Estação da Luz: tijolo vermelho, torre do relógio, gare de ferro atrás
    const brick = 0xc77a55; wall(FACADE.brick, cx, cz - 6, 46, 14, 12, brick); cityFlat.gable(cx, 12, cz - 6, 15, 47, 3.2, SLATE, Math.PI / 2, false);
    for (const s of [-1, 1]) { wall(FACADE.brick, cx + s * 21, cz - 6, 8, 18, 15, brick); cityFlat.gable(cx + s * 21, 15, cz - 6, 9, 19, 3, SLATE, 0, false); }
    wall(FACADE.brick, cx, cz - 6, 8, 8, 34, brick); LM.box(cx, 34, cz - 6, 9, 1.2, 9, hexRGB(0xe9dcc4)); LM.cone(cx, 35.2, cz - 6, 6.4, 12, SLATE, 4);
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const px = cx + nx * 4.05, pz = cz - 6 + nz * 4.05; LM.box(px, 27, pz, nx ? 0.1 : 3.2, 3.2, nx ? 3.2 : 0.1, [0.97, 0.96, 0.9]); LM.box(px + nx * 0.06, 28.5, pz + nz * 0.06, nx ? 0.08 : 0.14, 1.3, nx ? 0.14 : 0.08, [0.1, 0.1, 0.1]); LM.box(px + nx * 0.07, 28.5, pz + nz * 0.07, nx ? 0.08 : 1.0, 0.14, nx ? 1.0 : 0.08, [0.1, 0.1, 0.1]); }
    collide(cx, cz - 6, 50, 18, 36); lmSign(0, cx, 9, cz + 1.06, 16, 2, 0, 1);
    for (let k = -4; k <= 4; k++) LM.box(cx + k * 5.5, 0.3, cz + 12, 0.35, 7, 0.35, hexRGB(0x2f4a3a));   // gare: colunas de ferro e cobertura
    LM.box(cx, 7.3, cz + 12, 48, 0.3, 10, hexRGB(0x3d5a4a)); cityFlat.gable(cx, 7.6, cz + 12, 10, 48, 1.6, hexRGB(0x9fb3b8), Math.PI / 2, false);
    for (const s of [-1, 1]) LM.box(cx, 0.32, cz + 12 + s * 1.2, 48, 0.08, 0.12, [0.35, 0.33, 0.3]);
    spSpot('chat', cx - 8, cz + 3, 0, { n: 3 }); spSpot('lean', cx + 6, cz + 1.5, 0); spSpot('vendor', cx + 14, cz + 4, 3.14);
  },
  mercadao(cx, cz) {                                   // Mercado Municipal: salão com vitrais, abóbadas e torres nos cantos
    wall(FACADE.stone, cx, cz, 44, 38, 13, 0xe0b97e); for (let k = -2; k <= 2; k++) cityFlat.gable(cx + k * 8.6, 13, cz, 8.4, 38, 3, hexRGB(k % 2 ? 0x8a6a4a : 0x9bb3b5), 0, false);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { wall(FACADE.stone, cx + sx * 21, cz + sz * 18, 6, 6, 18, 0xd8ae72); LM.dome(cx + sx * 21, 18, cz + sz * 18, 3.3, 3.2, COPPER, 12); }
    collide(cx, cz, 46, 40, 19); for (const nz of [1, -1]) lmSign(1, cx, 10.3, cz + nz * 19.06, 18, 2, 0, nz);
    for (let k = 0; k < 4; k++) { spSpot('vendor', cx - 15 + k * 10, cz + 21.5, 0); spSpot('chat', cx - 12 + k * 9, cz + 24, rr(0, 6), { n: 2 }); }
  },
  rua25(cx, cz) {                                      // 25 de Março: lojinhas coladas, letreiros, camelôs na calçada inteira
    for (let a = -1; a <= 1; a++) for (const b of [-1, 1]) { const x = cx + a * 15, z = cz + b * 11.5, H = 4.4 + 3.2 * (1 + Math.floor(rnd() * 3));
      wall(FACADE.shop, x, z, 14.6, 21, 4.4, 0xffffff, 0, 4.4); wall(rnd() < 0.5 ? FACADE.brick : FACADE.concrete, x, z, 14.6, 21, H - 4.4, pk2(TINTS_C), 4.4); roofTop(x, H, z, 14.6, 21, false); collide(x, z, 14.6, 21, H + 2);
      shopSign(x, z, 14.6, 21, b > 0 ? 2 : 0, Math.floor(rnd() * 12)); if (a !== 0) shopSign(x, z, 14.6, 21, a > 0 ? 1 : 3, Math.floor(rnd() * 12)); if (rnd() < 0.6) spWallArt(x, z, 14.6, 21, H, 'pixo', b > 0 ? 2 : 0); }
    const cols = [0xe0a800, 0xd23b2e, 0x2e7bc4, 0x2f9e5b, 0xf07c1e];
    for (let s = 0; s < 4; s++) for (let u = -22; u <= 22; u += 5.5) {      // barracas dos dois lados da calçada
      const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][s], px = cx + (s % 2 ? n[0] * 25.2 : u), pz = cz + (s % 2 ? u : n[1] * 25.2), yaw = Math.atan2(n[0], n[1]);
      PROP.stand(LM.at(px, pz), px, 0.3, pz, yaw, hexRGB(cols[(s * 7 + Math.round(u)) % cols.length & 3 | 0] || 0xe0a800));
      spSpot('vendor', px - n[0] * 0.9, pz - n[1] * 0.9, yaw); if (rnd() < 0.55) spSpot('chat', px + n[0] * 1.6, pz + n[1] * 1.6, rr(0, 6.28), { n: 2 + Math.floor(rnd() * 2) });
    }
    lmSign(12, cx - 27.2, 4.6, cz - 24, 7, 1.1, -1, 0);
  },
  italia(cx, cz) {                                     // Edifício Itália: pódio + torre de concreto em triângulo arredondado, terraço no topo
    wall(FACADE.shop, cx, cz, 46, 40, 4.4, 0xffffff, 0, 4.4); wall(FACADE.concrete, cx, cz, 46, 40, 5, 0xd8d0c0, 4.4); roofTop(cx, 9.4, cz, 46, 40, true);
    const H = 150, pts = ringPts(cx, cz, a => 17 * (1 + 0.13 * Math.cos(3 * a + 0.5)), 24); prismWall(FACADE.concrete, pts, 9.4, H, 0xd9d1c2);
    prismWall(FACADE.glass, ringPts(cx, cz, a => 13 * (1 + 0.13 * Math.cos(3 * a + 0.5)), 24), 9.4 + H, 5, 0x9fb7c6); LM.cyl(cx, 14.4 + H, cz, 0.3, 14, [0.8, 0.8, 0.8], 6);
    collide(cx, cz, 46, 40, 10); collide(cx, cz, 28, 28, 9.4 + H + 5); lmSign(14, cx, 5.6, cz + 20.06, 14, 1.6, 0, 1);
    spSpot('lean', cx - 10, cz + 20.8, 0); spSpot('smoker', cx + 8, cz + 20.8, 0);
  },
  copan(cx, cz) {                                      // Copan: lâmina em "S" com brises horizontais
    wall(FACADE.shop, cx, cz + 13, 46, 18, 6, 0xffffff, 0, 4.4); roofTop(cx, 6, cz + 13, 46, 18, false);
    const n = 22, cl = [], out = [], inn = [];
    for (let k = 0; k <= n; k++) { const t = k / n, x = cx - 23 + 46 * t, z = cz - 6 + 9 * Math.sin(Math.PI * (2 * t - 1)), dz = 9 * Math.PI * 2 / 46 * Math.cos(Math.PI * (2 * t - 1)), l = Math.hypot(1, dz); cl.push([x, z, -dz / l, 1 / l]); }
    for (const [x, z, nx, nz] of cl) { out.push([x + nx * 6, z + nz * 6]); inn.push([x - nx * 6, z - nz * 6]); }
    prismWall(FACADE.brise, out.concat(inn.reverse()), 0.3, 104, 0xf4f2ec);
    for (const [x, z] of cl.filter((_, k) => k % 4 === 2)) collide(x, z, 9, 12, 105);
    spSpot('chat', cx, cz + 23.5, 0, { n: 3 }); spSpot('beggar', cx - 14, cz + 22.4, 0);
  },
  se(cx, cz) {                                         // Praça da Sé + catedral neogótica (torres pontudas e cúpula verde)
    wall(FACADE.stone, cx, cz - 8, 18, 30, 22, 0xb4ad9f); cityFlat.gable(cx, 22, cz - 8, 18.5, 30.5, 7, SLATE, 0, false);
    wall(FACADE.stone, cx, cz - 12, 32, 10, 20, 0xb4ad9f); cityFlat.gable(cx, 20, cz - 12, 10.5, 32.5, 6, SLATE, Math.PI / 2, false);
    LM.cyl(cx, 22, cz - 12, 6, 8, hexRGB(0xb4ad9f), 16); LM.dome(cx, 30, cz - 12, 6.6, 9, COPPER, 16); LM.cyl(cx, 38.6, cz - 12, 0.9, 3, COPPER, 8); LM.box(cx, 41.6, cz - 12, 0.25, 3, 0.25, [0.9, 0.85, 0.6]); LM.box(cx, 42.6, cz - 12, 1.4, 0.25, 0.25, [0.9, 0.85, 0.6]);
    for (const s of [-1, 1]) { wall(FACADE.stone, cx + s * 8, cz + 6, 7, 7, 46, 0xb4ad9f); LM.cone(cx + s * 8, 46, cz + 6, 4.6, 24, SLATE, 8); for (const [ox, oz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) LM.cone(cx + s * 8 + ox, 46, cz + 6 + oz, 0.7, 5, SLATE, 6); }
    collide(cx, cz - 8, 34, 32, 30); collide(cx, cz + 6, 24, 8, 46); lmSign(7, cx, 9.5, cz + 9.56, 10, 1.3, 0, 1);
    for (let k = -2; k <= 2; k++) for (const sz of [14, 21]) palmSpots.push([cx + k * 9, cz + sz, rr(1.05, 1.3), 0.3]);   // palmeiras imperiais da praça
    LM.cyl(cx, 0.3, cz + 17.5, 0.6, 1.2, hexRGB(0x9a9384), 6);                                                        // marco zero
    for (let k = 0; k < 4; k++) spSpot('chat', cx + rr(-18, 18), cz + rr(12, 22), rr(0, 6.28), { n: 2 + Math.floor(rnd() * 3) });
    spSpot('beggar', cx - 5, cz + 10.4, 0); spSpot('smoker', cx + 12, cz + 11, 0.4); spSpot('vendor', cx + 18, cz + 23, 3.14); spSpot('dance', cx - 14, cz + 18, 0, { n: 3, spread: 2.4 });
  },
  banespa(cx, cz) {                                    // Edifício Altino Arantes (Banespa), escalonado com mastro, e o Martinelli rosado ao lado
    const steps = [[30, 0.3, 60], [24, 60.3, 30], [18, 90.3, 22], [12, 112.3, 14], [7, 126.3, 9]], bx = cx - 9, bz = cz - 8;
    for (const [w, y0, h] of steps) { wall(FACADE.stone, bx, bz, w, w, h, 0xe6dcc6, y0); LM.box(bx, y0 + h - 0.1, bz, w + 0.6, 0.6, w + 0.6, hexRGB(0xd8ccb2)); }
    LM.cyl(bx, 135.3, bz, 0.35, 24, [0.85, 0.85, 0.85], 6); LM.cyl(bx, 159.3, bz, 0.5, 0.6, [1, 0.2, 0.15], 6);
    collide(bx, bz, 30, 30, 135);
    wall(FACADE.stone, cx + 14, cz + 13, 18, 18, 92, 0xe8c3b0); roofTop(cx + 14, 92.3, cz + 13, 18, 18, false); collide(cx + 14, cz + 13, 18, 18, 94);
    spSpot('lean', cx + 3, cz + 23.6, 0); spSpot('chat', cx - 12, cz + 22, 0, { n: 2 });
  },
  municipal(cx, cz) {                                  // Theatro Municipal: pedra clara, pórtico com colunas, cúpulas verdes
    wall(FACADE.stone, cx, cz - 3, 32, 38, 17, STONE); cityFlat.gable(cx, 17, cz - 3, 32.5, 38.5, 4, SLATE, 0, false);
    LM.cyl(cx, 17, cz - 12, 7, 5, hexRGB(STONE), 16); LM.dome(cx, 22, cz - 12, 7.5, 8, COPPER, 16); LM.cyl(cx, 29.6, cz - 12, 1, 2.5, COPPER, 8);
    for (const s of [-1, 1]) { wall(FACADE.stone, cx + s * 13.5, cz + 14, 6, 6, 21, STONE); LM.dome(cx + s * 13.5, 21, cz + 14, 3.2, 4, COPPER, 12); }
    for (let k = -3; k <= 3; k++) LM.cyl(cx + k * 2.8, 0.3, cz + 17.6, 0.55, 11, hexRGB(0xe3dac6), 10);
    LM.box(cx, 11.3, cz + 17.6, 21, 1.4, 2.2, hexRGB(0xd8cfb8)); for (let k = 0; k < 4; k++) LM.box(cx, 0.3, cz + 18 + k * 0.9, 22, 0.25 + k * 0, 0.9, hexRGB(0xcfc5ad));
    collide(cx, cz - 3, 34, 40, 22); lmSign(2, cx, 12.9, cz + 18.75, 16, 1.6, 0, 1);
    spSpot('chat', cx - 6, cz + 22.5, 0, { n: 3 }); spSpot('sit', cx + 6, cz + 21.5, 0, { seatY: 0.75 }); spSpot('smoker', cx + 12, cz + 22.5, 3);
  },
  liberdade(cx, cz, i, j) {                            // Liberdade: sobradinhos com lojas orientais, lanternas suzuran vermelhas e torii sobre a rua
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = cx + sx * 12, z = cz + sz * 12, H = 4.4 + 3.2 * (1 + Math.floor(rnd() * 3));
      wall(FACADE.shop, x, z, 19, 19, 4.4, 0xffffff, 0, 4.4); wall(FACADE.house, x, z, 19, 19, H - 4.4, pk2([0xf2e3d0, 0xe8d6c8, 0xd9c7b8, 0xf3efe6]), 4.4); roofTop(x, H, z, 19, 19, false); collide(x, z, 19, 19, H + 2);
      shopSign(x, z, 19, 19, sz > 0 ? 2 : 0, Math.floor(rnd() * 12)); shopSign(x, z, 19, 19, sx > 0 ? 1 : 3, Math.floor(rnd() * 12));
      LM.box(x, 4.4, z + sz * 9.6, 18, 0.25, 1.4, RED); }                                     // marquises vermelhas
    for (let s = 0; s < 4; s++) for (let u = -20; u <= 20; u += 10) {               // postes com 3 lanternas
      const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][s], px = cx + (s % 2 ? n[0] * 26.8 : u), pz = cz + (s % 2 ? u : n[1] * 26.8);
      LM.box(px, 0.3, pz, 0.18, 4.4, 0.18, hexRGB(0x7a1c16)); LM.box(px, 4.5, pz, s % 2 ? 0.14 : 1.8, 0.14, s % 2 ? 1.8 : 0.14, hexRGB(0x7a1c16));
      for (const k of [-0.8, 0, 0.8]) { const lx = px + (s % 2 ? 0 : k), lz = pz + (s % 2 ? k : 0); LM.cyl(lx, 3.95, lz, 0.24, 0.5, hexRGB(0xd8261e), 10); LM.cyl(lx, 4.18, lz, 0.25, 0.06, [1, 0.95, 0.85], 10); }
      addRound(px, pz, 0.2); }
    if (i === SP.i0 + 5) {                             // torii sobre a rua entre as duas quadras da Liberdade
      const rx = roadC(i + 1), rz = cz - 18; for (const s of [-1, 1]) { LM.cyl(rx + s * 10.7, 0.3, rz, 0.5, 8.6, RED, 12); addRound(rx + s * 10.7, rz, 0.55); }
      LM.box(rx, 7.2, rz, 22.4, 0.6, 0.6, RED); LM.box(rx, 8.9, rz, 26, 0.7, 1.1, RED); LM.box(rx, 9.6, rz, 27.4, 0.4, 1.4, [0.12, 0.12, 0.12]); LM.box(rx, 7.8, rz, 0.5, 1.1, 0.5, RED);
      lmSign(8, rx, 7.85, rz + 0.33, 5, 0.9, 0, 1); lmSign(8, rx, 7.85, rz - 0.33, 5, 0.9, 0, -1);
    }
    spSpot('chat', cx + 20, cz - 25, 0, { n: 3 }); spSpot('vendor', cx - 18, cz + 25.5, 3.14); spSpot('lean', cx + 5, cz + 22.3, 0);
  },
  trianon(cx, cz) { for (let k = 0; k < 26; k++) spTrees.push([cx + rr(-21, 21), cz + rr(-21, 21), rr(1.2, 1.7), 0.3, 1]); cityFlat.box(cx, 0.31, cz, 2.2, 0.04, 44, hexRGB(0xb9a88a)); spSpot('chat', cx + 3, cz + 10, 0, { n: 2 }); spSpot('lay', cx - 8, cz - 6, 1, { y: 0.32 }); },
  conjunto(cx, cz) {                                   // Conjunto Nacional: pódio de lojas + lâmina horizontal, letreiro no topo
    wall(FACADE.shop, cx, cz + 4, 46, 36, 4.4, 0xffffff, 0, 4.4); wall(FACADE.concrete, cx, cz + 4, 46, 36, 5, 0xe8e6e0, 4.4); roofTop(cx, 9.4, cz + 4, 46, 36, true);
    wall(FACADE.brise, cx, cz - 2, 40, 13, 62, 0xf6f5f0, 9.4); roofTop(cx, 71.4, cz - 2, 40, 13, false); collide(cx, cz + 4, 46, 36, 10); collide(cx, cz - 2, 40, 13, 72);
    for (const s of [-1, 1]) LM.box(cx + s * 12, 71.4, cz - 2, 0.4, 7, 0.4, [0.3, 0.3, 0.3]);
    lmSign(3, cx, 73.4, cz - 2.2, 30, 4.6, 0, 1); lmSign(3, cx, 73.4, cz - 1.8, 30, 4.6, 0, -1);
    spSpot('chat', cx - 10, cz + 24, 0, { n: 3 }); spSpot('lean', cx + 15, cz + 22.5, 0);
  },
  fiesp(cx, cz) {                                      // FIESP: tronco de pirâmide de vidro escuro
    const n = 16, H = 92; for (let k = 0; k < n; k++) { const t = k / n, d = lerp(34, 13, t); wall(FACADE.glass, cx, cz, 40, d, H / n, 0x55657a, 0.3 + k * H / n); }
    roofTop(cx, 0.3 + H, cz, 40, 13, false); collide(cx, cz, 40, 34, 30); collide(cx, cz, 40, 22, H); lmSign(13, cx, 2, cz + 17.08, 10, 1.6, 0, 1);
    spSpot('smoker', cx - 15, cz + 18.5, 0); spSpot('chat', cx + 10, cz + 21, 0, { n: 2 });
  },
  masp(cx, cz) {                                       // MASP: caixa de vidro suspensa em dois pórticos vermelhos, vão livre embaixo
    const L = 52, Dp = 22, y0 = 8.6, yt = 18.4, z0 = cz - 4;
    wall(FACADE.glass, cx, z0, L - 2, Dp - 2, yt - y0, 0x6a7784, y0); LM.box(cx, yt, z0, L - 1.6, 0.4, Dp - 1.6, CONC);
    for (const sz of [-1, 1]) { for (const sx of [-1, 1]) { LM.box(cx + sx * (L / 2 + 1.1), 0.3, z0 + sz * (Dp / 2 - 1), 2.4, 21.3, 2.4, RED); collide(cx + sx * (L / 2 + 1.1), z0 + sz * (Dp / 2 - 1), 2.5, 2.5, 22); }
      LM.box(cx, yt + 0.4, z0 + sz * (Dp / 2 - 1), L + 4.6, 3, 2.4, RED); LM.box(cx, y0 - 1.6, z0 + sz * (Dp / 2 - 1), L + 4.6, 1.6, 2.4, RED); }
    lmSign(4, cx + L / 2 + 1.1, 15, z0 - Dp / 2 - 0.24 + 1, 2.2, 1.0, 0, -1);
    spSpot('dance', cx - 8, z0, 0, { n: 4, spread: 3 }); spSpot('chat', cx + 8, z0 - 3, 0, { n: 3 }); spSpot('chat', cx + 14, z0 + 5, 0, { n: 2 }); spSpot('vendor', cx - 20, z0 - 9, 0); spSpot('beggar', cx + 20, z0 - 10, 0); spSpot('smoker', cx, z0 + 9, 3.14);
    wall(FACADE.concrete, cx, cz + 17, 46, 8, 4, 0xc9c4b8); roofTop(cx, 4, cz + 17, 46, 8, false); collide(cx, cz + 17, 46, 8, 5);   // anexo baixo ao fundo
  },
  obelisco(cx, cz) {                                   // Obelisco do Ibirapuera (Mausoléu ao Soldado Constitucionalista)
    LM.box(cx, 0.3, cz, 18, 0.6, 18, hexRGB(0xcfc4ac)); LM.box(cx, 0.9, cz, 12, 2.4, 12, hexRGB(0xd8cdb4)); collide(cx, cz, 12, 12, 3.3);
    for (let k = 0; k < 12; k++) { const t0 = k / 12, t1 = (k + 1) / 12, w = lerp(6.4, 3.4, t0); LM.box(cx, 3.3 + t0 * 68, cz, w, 68 / 12, w, hexRGB(k % 3 ? 0xd9cfb6 : 0xd2c7ad)); }
    LM.cone(cx, 71.3, cz, 2.4, 6, hexRGB(0xd9cfb6), 4); collide(cx, cz, 6.6, 6.6, 77); lmSign(10, cx, 1.4, cz + 9.06, 10, 1.2, 0, 1);
    for (let k = 0; k < 16; k++) spTrees.push([cx + rr(-22, 22), cz + rr(-22, 22), rr(1.0, 1.4), 0.3, 1]);
    spSpot('chat', cx + 9, cz + 13, 0, { n: 2 });
  },
  marquise(cx, cz) {                                   // marquise do Ibirapuera: laje branca sinuosa sobre pilotis finos
    const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12, x = cx - 22 + 44 * t, z = cz - 4 + 7 * Math.sin(t * Math.PI * 1.5); pts.push([x, z]); }
    for (let k = 0; k < pts.length - 1; k++) { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], yaw = Math.atan2(-(z1 - z0), x1 - x0), len = Math.hypot(x1 - x0, z1 - z0) + 0.3;
      LM.box((x0 + x1) / 2, 4.6, (z0 + z1) / 2, len, 0.5, 9, [0.95, 0.95, 0.93], { yaw }); if (k % 2 === 0) { LM.cyl(x0, 0.3, z0, 0.22, 4.3, [0.9, 0.9, 0.88], 8); addRound(x0, z0, 0.25); } }
    LM.dome(cx + 12, 0.3, cz + 14, 9, 7, [0.96, 0.96, 0.94], 16); collide(cx + 12, cz + 14, 12, 12, 7);  // planetário/oca menor
    for (let k = 0; k < 10; k++) spTrees.push([cx + rr(-22, 22), cz + rr(8, 22) * (rnd() < 0.5 ? 1 : -1), rr(1.0, 1.4), 0.3, 1]);
    spSpot('chat', cx - 8, cz - 4, 0, { n: 3 }); spSpot('dance', cx + 4, cz - 2, 0, { n: 3, spread: 2.5 });
  },
  lago(cx, cz) {                                       // lago com chafariz
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f7f8f, roughness: 0.1, metalness: 0.2 }));
    m.scale.set(19, 1, 14); m.position.set(cx, 0.34, cz - 2); scene.add(m);
    for (let k = 0; k < 5; k++) LM.cyl(cx - 8 + k * 4, 0.3, cz - 2, 0.25 + (k === 2 ? 0.2 : 0), k === 2 ? 7 : 3.5, [0.85, 0.92, 0.98], 6);
    for (let k = 0; k < 14; k++) { const a = rr(0, 6.28); spTrees.push([cx + Math.cos(a) * rr(20, 24), cz + Math.sin(a) * rr(18, 23), rr(1.0, 1.4), 0.3, 1]); }
    collide(cx, cz - 2, 30, 20, 0.5); spSpot('chat', cx + 12, cz + 15, 0, { n: 2 }); spSpot('sit', cx - 14, cz + 13, 0, { seatY: 0.75 });
  },
  oca(cx, cz) {                                        // Oca: cúpula branca baixa
    LM.dome(cx, 0.3, cz, 17, 9.5, [0.97, 0.97, 0.95], 24); collide(cx, cz, 26, 26, 9.5);
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; LM.cyl(cx + Math.cos(a) * 14.6, 3.2, cz + Math.sin(a) * 14.6, 1.1, 0.08, [0.2, 0.25, 0.3], 10); }
    for (let k = 0; k < 10; k++) { const a = rr(0, 6.28); spTrees.push([cx + Math.cos(a) * rr(21, 24), cz + Math.sin(a) * rr(21, 24), rr(1.0, 1.4), 0.3, 1]); }
    spSpot('chat', cx + 19, cz + 4, 0, { n: 2 });
  }
};

/* ---------- mobiliário urbano ---------- */
PROP.orelhao = (m, x, y, z, yaw, col) => {             // orelhão: concha de fibra aberta na frente, sobre um poste
  col = col || hexRGB(0xe8762c); m.cyl(x, y, z, 0.05, 1.3, [0.3, 0.3, 0.32], 6); const f = yaw + Math.PI / 2;
  m.dome(x, y + 1.25, z, 0.52, 0.95, col, 10, f + 0.9, f + Math.PI * 2 - 0.9); m.dome(x, y + 1.25, z, 0.5, 0.92, col, 10, f + 0.9, f + Math.PI * 2 - 0.9, true);
  m.box(x - Math.sin(yaw) * 0.18, y + 1.45, z - Math.cos(yaw) * 0.18, 0.26, 0.42, 0.12, [0.25, 0.27, 0.3], { yaw });
};
PROP.payphone = (m, x, y, z, yaw) => PROP.orelhao(m, x, y, z, yaw, hexRGB([0xe8762c, 0x2f6db5][Math.floor(rnd() * 2)]));
PROP.banca = (m, x, y, z, yaw) => {                    // banca de jornal verde com toldo e revistas
  const s = Math.sin(yaw), c = Math.cos(yaw); m.box(x, y, z, 3.4, 2.5, 2.2, hexRGB(0x2f6b45), { yaw }); m.box(x + s * 1.25, y + 2.5, z + c * 1.25, 3.6, 0.1, 0.9, hexRGB(0x2a5d3c), { yaw });
  for (let k = 0; k < 6; k++) m.box(x + s * 1.12 + c * (-1.3 + k * 0.52), y + 0.9 + (k % 2) * 0.55, z + c * 1.12 - s * (-1.3 + k * 0.52), 0.42, 0.5, 0.04, hexRGB([0xe63946, 0xf1c40f, 0x2e86c1, 0xffffff, 0x8e44ad, 0x27ae60][k]), { yaw });
};
PROP.busStop = (m, x, y, z, yaw) => {                  // ponto de ônibus: cobertura, painel de vidro, banco
  const s = Math.sin(yaw), c = Math.cos(yaw); m.box(x, y + 2.55, z, 4.2, 0.12, 1.7, hexRGB(0x2c3e50), { yaw }); m.box(x - s * 0.75, y, z - c * 0.75, 4, 2.5, 0.06, [0.62, 0.78, 0.86], { yaw });
  for (const k of [-1.95, 1.95]) m.box(x + c * k - s * 0.75, y, z - s * k - c * 0.75, 0.1, 2.55, 0.1, [0.3, 0.32, 0.35]);
  m.box(x - s * 0.45, y + 0.44, z - c * 0.45, 3, 0.07, 0.4, hexRGB(0x7a5232), { yaw }); m.box(x + c * 2.4, y, z - s * 2.4, 0.09, 2.6, 0.09, [0.3, 0.32, 0.35]); m.box(x + c * 2.4, y + 2.2, z - s * 2.4, 0.5, 0.5, 0.05, hexRGB(0x1d4fa0), { yaw });
};
PROP.lixeira = (m, x, y, z) => { m.box(x, y, z, 0.07, 0.9, 0.07, [0.35, 0.35, 0.37]); m.cyl(x, y + 0.55, z + 0.18, 0.2, 0.5, hexRGB(0xf07c1e), 8); };

/* ---------- depois da cidade: rio, ponte, Morumbi, fiação, mobiliário, decalques, montagem ---------- */
function buildSPExtras() {
  const W = PINH, zA = W.z0 - 1, zB = W.z1 - 1, gapA = W.deck[0], gapB = W.deck[1];
  /* Rio Pinheiros: água própria (abaixo da rua), paredes de concreto, gradil com colisão, margens com calçada, ciclovia e árvores */
  { const wm = waterMat.clone(); wm.color.setHex(0x51603f); wm.opacity = 0.93; wm.normalScale.set(0.35, 0.35); wm.onBeforeCompile = () => {}; wm.customProgramCacheKey = () => 'rio-pinheiros';
    const river = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, zB - zA).rotateX(-Math.PI / 2), wm); river.position.set((W.x0 + W.x1) / 2, W.water, (zA + zB) / 2); scene.add(river); }
  const segs = [[zA, gapA - 0.5], [gapB + 0.5, zB]];
  for (const [a, b] of segs) for (const wx of [W.x1 - 0.4, W.x0 + 0.4]) {
    LM.box(wx, -4.3, (a + b) / 2, 0.8, 4.62, b - a, CONC);
    const rx = wx + (wx > -333 ? 0.25 : -0.25); for (let z = a + 1; z < b; z += 3) LM.box(rx, 0.32, z, 0.08, 1.05, 0.08, [0.45, 0.47, 0.5]);
    LM.box(rx, 1.28, (a + b) / 2, 0.08, 0.08, b - a, [0.55, 0.57, 0.6]); LM.box(rx, 0.82, (a + b) / 2, 0.06, 0.06, b - a, [0.55, 0.57, 0.6]); collide(rx, (a + b) / 2, 0.5, b - a, 1.2);
  }
  for (const z of [zA - 0.5, zB + 0.5]) { LM.box((W.x0 + W.x1) / 2, -4.3, z, W.x1 - W.x0, 4.62, 1, CONC); collide((W.x0 + W.x1) / 2, z, W.x1 - W.x0, 1.2, 1.2); }
  const bankMat = WALK.concreto;
  const slab = (x0, x1, z0, z1) => { const g = new THREE.BoxGeometry(x1 - x0, 1.0, z1 - z0); worldUV(g, (x0 + x1) / 2, (z0 + z1) / 2, 8); cityBatch.add(g, bankMat, (x0 + x1) / 2, -0.2, (z0 + z1) / 2); };
  for (const [a, b] of segs) { slab(W.x1, -305, a, b); slab(-367, W.x0, a, b); }
  for (const [x0, x1] of [[W.x1 + 1, W.x1 + 3.4], [-366, -363.6]]) for (const [a, b] of segs) LM.box((x0 + x1) / 2, 0.3, (a + b) / 2, x1 - x0, 0.02, b - a, hexRGB(0xb0322a));   // ciclovia vermelha nas margens
  for (let z = zA + 8; z < zB - 4; z += 14) { if (Math.abs(z - W.bz) < 16) continue; spTrees.push([-308.5, z + rr(-2, 2), rr(0.95, 1.25), 0.3]); spTrees.push([-361, z + rr(-2, 2), rr(0.95, 1.25), 0.3]); }
  for (let z = zA + 30; z < zB; z += 120) lmSign(11, -306.0, 3.2, z, 6, 0.9, 1, 0);
  for (let z = zA + 40; z < zB; z += 70) { spSpot('lean', W.x1 + 0.9, z, -Math.PI / 2, { y: 0.3 }); }
  /* Ponte Estaiada: tabuleiro sobre o aterro, pista de asfalto, guarda-corpo, mastro em X e cabos */
  const bx0 = -367, bx1 = -305, bzc = W.bz, bw = gapB - gapA;
  LM.box((bx0 + bx1) / 2, -1.56, bzc, bx1 - bx0, 1.6, bw, CONC); for (const z of [gapA + 0.3, gapB - 0.3]) LM.box((W.x0 + W.x1) / 2, -4.3, z, W.x1 - W.x0, 3.2, 0.6, CONC);
  { const rm = asphaltMat.clone(); rm.map = asphaltMat.map.clone(); rm.map.needsUpdate = true; rm.map.repeat.set((bx1 - bx0) / 8, (bw - 4) / 8); addMacro(rm, 1 / 41, 1 / 173, 0.2, 0.16);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, bw - 4).rotateX(-Math.PI / 2), rm); road.position.set((bx0 + bx1) / 2, 0.075, bzc); road.receiveShadow = true; scene.add(road); }
  for (const s of [-1, 1]) { LM.box((bx0 + bx1) / 2, 0.04, bzc + s * (bw / 2 - 1), bx1 - bx0, 0.3, 2, hexRGB(0xc4c1b8)); LM.box((bx0 + bx1) / 2, 0.34, bzc + s * (bw / 2 - 0.15), bx1 - bx0, 1.0, 0.3, hexRGB(0xdedbd2)); collide((bx0 + bx1) / 2, bzc + s * (bw / 2 - 0.15), bx1 - bx0, 0.5, 1.5); }
  for (let x = bx0 + 2; x < bx1; x += 6) cityMarks.quad([x, 0.085, bzc - 0.12], [x, 0.085, bzc + 0.12], [x + 3, 0.085, bzc + 0.12], [x + 3, 0.085, bzc - 0.12], 0, 1, 0, [0.9, 0.75, 0.15]);
  const mx = (W.x0 + W.x1) / 2, mastCol = [0.96, 0.96, 0.95], top = 128, cross = 79.4, foot = [gapA - 4, gapB + 4];
  const legA = [[mx, W.water, foot[0]], [mx, top, gapB - 2]], legB = [[mx, W.water, foot[1]], [mx, top, gapA + 2]];
  for (const [a, b] of [legA, legB]) { LM.beam(a, b, 3.4, mastCol); addRound(a[0], a[2], 1.8); }
  LM.box(mx, cross - 2, bzc, 3.6, 4, 4, mastCol);
  { const P = [], legAt = (L, y) => { const t = (y - L[0][1]) / (L[1][1] - L[0][1]); return [L[0][0], y, L[0][2] + (L[1][2] - L[0][2]) * t]; };
    for (const [side, L] of [[gapA + 1.5, legB], [gapB - 1.5, legA]]) for (const dir of [-1, 1]) for (let k = 0; k < 11; k++) {
      const p = legAt(L, 78 + k * 4.6), dx = dir * (7 + k * 2.3); P.push(p[0], p[1], p[2], mx + dx, 1.3, side); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe8e8e8 }))); }
  /* avenida até o Morumbi + esplanada + estádio */
  { const x0 = MORUMBI.x + MORUMBI.rx * 0.6, x1 = bx0, rm = asphaltMat.clone(); rm.map = asphaltMat.map.clone(); rm.map.needsUpdate = true; rm.map.repeat.set((x1 - x0) / 8, RW / 8); addMacro(rm, 1 / 41, 1 / 173, 0.2, 0.16);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, RW).rotateX(-Math.PI / 2), rm); road.position.set((x0 + x1) / 2, 0.075, W.bz); road.receiveShadow = true; scene.add(road);
    for (let x = x0 + 2; x < x1; x += 6) cityMarks.quad([x, 0.085, W.bz - 0.12], [x, 0.085, W.bz + 0.12], [x + 3, 0.085, W.bz + 0.12], [x + 3, 0.085, W.bz - 0.12], 0, 1, 0, [0.9, 0.75, 0.15]); }
  { const M = MORUMBI, pg = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2); pg.scale(M.rx + 12, 1, M.rz + 12); worldUV(pg, M.x, M.z, 8, true); cityBatch.add(pg, WALK.intertravado, M.x, 0.085, M.z);
    const n = 40, ring = (rx, rz, k) => [M.x + Math.cos(k / n * 6.2832) * rx, M.z + Math.sin(k / n * 6.2832) * rz], wallC = hexRGB(0xc9c6bd);
    for (let k = 0; k < n; k++) { const a = ring(M.rx, M.rz, k), b = ring(M.rx, M.rz, k + 1), am = (k + 0.5) / n * 6.2832, nx = Math.cos(am), nz = Math.sin(am);
      LM.quad([b[0], 0.0, b[1]], [a[0], 0.0, a[1]], [a[0], 24, a[1]], [b[0], 24, b[1]], nx, 0, nz, wallC.map(v => v * (k % 2 ? 0.92 : 1)));
      LM.quad([a[0], 0.0, a[1]], [b[0], 0.0, b[1]], [b[0], 24, b[1]], [a[0], 24, a[1]], -nx, 0, -nz, wallC.map(v => v * 0.7));
      if (k % 2 === 0) LM.box(a[0] + nx * 0.6, 0.0, a[1] + nz * 0.6, 1.2, 24.4, 1.2, wallC.map(v => v * 0.85));
      const tiers = [[M.rx - 2, M.rz - 2, 23.5], [M.rx - 13, M.rz - 11, 12], [M.rx - 22, M.rz - 19, 2.2]];
      for (let t = 0; t < 2; t++) { const [ra, za, ya] = tiers[t], [rb, zb, yb] = tiers[t + 1], p0 = ring(ra, za, k), p1 = ring(ra, za, k + 1), q0 = ring(rb, zb, k), q1 = ring(rb, zb, k + 1), col = [[0.78, 0.12, 0.12], [0.95, 0.95, 0.95], [0.1, 0.1, 0.1]][(k + t * 2) % 3];
        LM.quad([p1[0], ya, p1[1]], [p0[0], ya, p0[1]], [q0[0], yb, q0[1]], [q1[0], yb, q1[1]], -nx * 0.6, 0.8, -nz * 0.6, col); }
      if (k % 4 === 0) collide(a[0], a[1], 7, 7, 24); }
    LM.box(M.x, 0.06, M.z, 36, 0.06, 30, hexRGB(0x2f7d46)); LM.box(M.x, 0.13, M.z, 0.25, 0.02, 28, [1, 1, 1]); LM.cyl(M.x, 0.13, M.z, 4, 0.02, [1, 1, 1], 18);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = M.x + sx * (M.rx + 6), pz = M.z + sz * (M.rz + 4); LM.box(px, 0.0, pz, 0.8, 36, 0.8, [0.4, 0.42, 0.45]); LM.box(px, 36, pz, 5, 2.4, 0.6, [0.95, 0.95, 0.88], { yaw: Math.atan2(-sx, -sz) }); addRound(px, pz, 0.5); }
    lmSign(6, M.x + M.rx + 0.06, 15, M.z, 26, 3.4, 1, 0); LM.box(bx0 + 3, 0.34, bzc - bw / 2 + 0.6, 0.12, 4, 0.12, [0.35, 0.35, 0.37]); lmSign(15, bx0 + 2.9, 4, bzc - bw / 2 + 0.6, 10, 1.2, -1, 0);
    for (let k = 0; k < 6; k++) { const a = rr(-1.2, 1.2); spSpot('chat', M.x + Math.cos(a) * (M.rx + 6), M.z + Math.sin(a) * (M.rz + 6), rr(0, 6.28), { n: 2 + Math.floor(rnd() * 2), y: 0.08 }); }
    spSpot('vendor', M.x + M.rx + 8, M.z + 6, -Math.PI / 2, { y: 0.08 }); spSpot('vendor', M.x + M.rx + 8, M.z - 7, -Math.PI / 2, { y: 0.08 }); }

  /* Av. Paulista: ciclovia vermelha no canteiro, placas azuis de rua, pontos de ônibus; antenas */
  { const z = roadC(SP.j0 + 5); for (let i = SP.i0; i < SP.i0 + SP.ni; i++) { const x0 = roadC(i) + RW / 2, x1 = roadC(i + 1) - RW / 2;
      cityMarks.quad([x0, 0.1, z - 1.3], [x0, 0.1, z + 1.3], [x1, 0.1, z + 1.3], [x1, 0.1, z - 1.3], 0, 1, 0, [0.69, 0.2, 0.17]);
      for (const s of [-1, 1]) cityMarks.quad([x0, 0.105, z + s * 1.3 - 0.07], [x0, 0.105, z + s * 1.3 + 0.07], [x1, 0.105, z + s * 1.3 + 0.07], [x1, 0.105, z + s * 1.3 - 0.07], 0, 1, 0, [0.95, 0.95, 0.92]);
      for (const s of [-1, 1]) { const bx = blockC(i) + rr(-12, 12), bz = z + s * (RW / 2 + 1.6); PROP.busStop(LM.at(bx, bz), bx, 0.3, bz, s > 0 ? Math.PI : 0); spSpot('sit', bx - s * 0, bz + s * 0.45, s > 0 ? Math.PI : 0, { seatY: 0.74, bench: true }); spSpot('lean', bx + 1.2, bz + s * 0.2, s > 0 ? Math.PI : 0); }
      const px = roadC(i) + RW / 2 + 0.8, pz = z - RW / 2 - 0.8; LM.box(px, 0.3, pz, 0.08, 3, 0.08, [0.35, 0.35, 0.37]); lmSign(9, px + 0.9, 3.0, pz, 1.8, 0.4, 0, -1); lmSign(9, px + 0.9, 3.0, pz + 0.02, 1.8, 0.4, 0, 1); } }
  /* fiação: postes de concreto na calçada e fios caídos (bairros residenciais e de comércio das duas cidades) */
  { const L = [], sag = (a, b, h, s) => { const n = 5; for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, f = t => h - s * 4 * t * (1 - t); L.push(a[0] + (b[0] - a[0]) * t0, f(t0), a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, f(t1), a[1] + (b[1] - a[1]) * t1); } };
    for (const blk of CITY_BLOCKS) { if (!'RMI'.includes(blk.type)) continue;
      for (let s = 0; s < 4; s++) { const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][s], pts = [-24, -8, 8, 24].map(u => [blk.cx + (s % 2 ? n[0] * 27.3 : u), blk.cz + (s % 2 ? u : n[1] * 27.3)]);
        pts.forEach(([x, z], k) => { LM.box(x, 0.3, z, 0.26, 9.2, 0.26, hexRGB(0xa9a7a0)); LM.box(x, 8.5, z, s % 2 ? 0.12 : 1.7, 0.12, s % 2 ? 1.7 : 0.12, hexRGB(0x8d8b85)); if ((k + s) % 3 === 0) LM.cyl(x + n[0] * 0.45, 6.4, z + n[1] * 0.45, 0.32, 1.1, [0.42, 0.44, 0.46], 8); addRound(x, z, 0.2); });
        for (let k = 0; k < 3; k++) for (const [o, h, sg] of [[-0.7, 9.3, 0.45], [0.7, 9.3, 0.5], [0, 8.1, 0.6]]) { const a = pts[k], b = pts[k + 1], ox = s % 2 ? 0 : o, oz = s % 2 ? o : 0; sag([a[0] + ox, a[1] + oz], [b[0] + ox, b[1] + oz], h, sg); } } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(L, 3)); const wires = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x15161a })); scene.add(wires); }
  /* bancas de jornal e lixeiras laranjas em SP */
  for (const blk of CITY_BLOCKS) { if (blk.city !== 'sp' || 'PS'.includes(blk.type)) continue;
    if (rnd() < 0.4) { const sx = rnd() < 0.5 ? -1 : 1, sz = rnd() < 0.5 ? -1 : 1, x = blk.cx + sx * 22, z = blk.cz + sz * 26.4; PROP.banca(LM.at(x, z), x, 0.3, z, sz > 0 ? 0 : Math.PI); collide(x, z, 3.4, 2.2, 2.6); spSpot('vendor', x - 2.1, z, 0); }
    for (let k = 0; k < 3; k++) { const s = Math.floor(rnd() * 4), n = [[0, -1], [1, 0], [0, 1], [-1, 0]][s], u = rr(-22, 22), x = blk.cx + (s % 2 ? n[0] * 27.2 : u), z = blk.cz + (s % 2 ? u : n[1] * 27.2); PROP.lixeira(LM.at(x, z), x, 0.3, z); } }
  /* decalques no asfalto: bocas de lobo junto ao meio-fio, tampas, remendos e óleo (todas as cidades) */
  { const uvOf = c => { const u0 = (c % 2) / 2, v1 = 1 - Math.floor(c / 2) / 2; return [u0, v1 - 0.5, u0 + 0.5, v1 - 0.5, u0 + 0.5, v1, u0, v1]; };
    const dec = (x, z, w, d, c, along) => { const hw = w / 2, hd = d / 2, ax = along ? hw : hd, az = along ? hd : hw; LMDEC.quad([x - ax, 0.074, z - az], [x - ax, 0.074, z + az], [x + ax, 0.074, z + az], [x + ax, 0.074, z - az], 0, 1, 0, [1, 1, 1], uvOf(c)); };
    for (const C of CITIES) {
      for (let j = C.j0; j <= C.j0 + C.nj; j++) for (let i = C.i0; i < C.i0 + C.ni; i++) { if (isHwyNode(i, j) && isHwyNode(i + 1, j)) continue; const z = roadC(j), xc = blockC(i);
        for (const s of [-1, 1]) dec(xc + rr(-20, 20), z + s * 8.3, 1.3, 0.62, 1, true);
        if (rnd() < 0.55) dec(xc + rr(-20, 20), z + rr(-5, 5), 0.95, 0.95, 0, true); if (rnd() < 0.35) dec(xc + rr(-18, 18), z + rr(-6, 6), rr(2, 4), rr(1.5, 3), 2, true); if (rnd() < 0.6) dec(roadC(i + 1) - rr(13, 16), z + 4.5, 1.6, 1.2, 3, true); }
      for (let i = C.i0; i <= C.i0 + C.ni; i++) for (let j = C.j0; j < C.j0 + C.nj; j++) { const x = roadC(i), zc = blockC(j);
        for (const s of [-1, 1]) dec(x + s * 8.3, zc + rr(-20, 20), 1.3, 0.62, 1, false);
        if (rnd() < 0.55) dec(x + rr(-5, 5), zc + rr(-20, 20), 0.95, 0.95, 0, false); if (rnd() < 0.35) dec(x + rr(-6, 6), zc + rr(-18, 18), rr(1.5, 3), rr(2, 4), 2, true); if (rnd() < 0.6) dec(x - 4.5, roadC(j + 1) - rr(13, 16), 1.2, 1.6, 3, true); } } }
  /* monta tudo */
  LM.build(propMat, true);
  if (LMS.v) scene.add(LMS.build(lmSignMat, false)); if (LMPIX.v) scene.add(LMPIX.build(pixoMat, false)); if (LMMUR.v) scene.add(LMMUR.build(muralMat, false)); if (LMDEC.v) { const d = LMDEC.build(PAVE.decalMat, false); d.receiveShadow = true; scene.add(d); }
}
/* UV de mundo para pisos (1 repetição = rep metros) — a calçada continua entre as quadras e não repete igual em cada uma */
function worldUV(g, ox, oz, rep, flatOnly) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + ox, y = p.getY(i), z = p.getZ(i) + oz, ny = Math.abs(n.getY(i));
    if (ny > 0.5 || flatOnly) uv.setXY(i, x / rep, -z / rep); else uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? z : x) / rep, y / rep); }
  uv.needsUpdate = true; return g;
}
