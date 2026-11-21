/* NEON COAST — A cidade: distritos (centro de torres, comércio, residencial, industrial, praças, parques, estádio e shopping),
   fachadas variadas com lojas e letreiros, telhados com detalhes, faixas de pedestre e semáforos nos cruzamentos. */
'use strict';
/* ============================ CIDADE ============================ */
function boxUV(w, h, d, tw, th, y0) {
  tw = tw || TILE; th = th || TILE;
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, sc = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]], ou = rnd(), ov = ((y0 || 0) / th) % 1;
  for (let f = 0; f < 6; f++) { const [a, b] = sc[f]; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * a / tw + (a ? ou : 0), uv.getY(i) * b / th + (b ? ov : 0)); } }
  return g;
}
const palmSpots = [], lampSpots = [], parkSet = new Set(), parkTrees = [], CITY_BLOCKS = [];
const cityBatch = new GeoBatch(310);
/* detalhes (telhados, faixas, letreiros) divididos em células de 150 m: cada uma é culling próprio (antes era uma malha só para a cidade inteira) */
class CellMesher {
  constructor() { this.cells = new Map(); }
  at(x, z) { const k = Math.floor(x / 150) + ',' + Math.floor(z / 150); let m = this.cells.get(k); if (!m) this.cells.set(k, m = new Mesher()); return m; }
  box(x, y, z, ...a) { this.at(x, z).box(x, y, z, ...a); } cyl(x, y, z, ...a) { this.at(x, z).cyl(x, y, z, ...a); } gable(x, y, z, ...a) { this.at(x, z).gable(x, y, z, ...a); }
  quad(p, ...a) { this.at(p[0], p[2]).quad(p, ...a); }
  build(mat, shadows) { for (const m of this.cells.values()) { const mesh = m.build(mat, shadows); scene.add(mesh); } }
}
const cityFlat = new CellMesher(), cityMarks = new CellMesher(), citySigns = new CellMesher();
/* mapa dos distritos: LAYOUT[j][i]  T=centro de torres  M=comércio/misto  R=residencial  I=industrial  P=parque  Z=praça  S=estádio  C=shopping */
const LAYOUT = ['IIRRRMMR', 'IMRRMMTR', 'RMMTTMMR', 'RMTTZTMP', 'PMTTTTMR', 'RMMTTMCR', 'RRMMMMSR', 'IIRRRPRR'];
/* Rio (10 x 6): zona norte residencial perto dos morros, Centro com torres, Maracanã, aterro/parque e a orla com prédios de frente para o mar (A) */
const LAYOUT_RJ = ['RRMRRMRRIR', 'RMMTTMRRZR', 'MTTTZMMSMR', 'PMTTMCMRMP', 'RMMZMRMMRR', 'AAAAAAAAAA'];
const LAYOUTS = { sp: LAYOUT_SP, rj: LAYOUT_RJ };            // SP: mapa de bairros e marcos em sp.js
const TINTS_G = [0xbfd7e6, 0x9fc4d4, 0xa9b9c9, 0x8fb0c0, 0xc9d6dc, 0x9cb7a9], TINTS_C = [0xe9e4da, 0xd8d2c4, 0xcfd4d8, 0xe0d6c8, 0xc9c3b5, 0xd9cdbd], TINTS_B = [0xffffff, 0xf2e2d6, 0xe9cfc0, 0xf5e9dc], TINTS_H = [0xf3e3c6, 0xe8d3d0, 0xd6e4d0, 0xd0dce8, 0xeadfb8, 0xf0efe8, 0xe4c9a8];
const pk2 = arr => arr[Math.floor(rnd() * arr.length)];
const collide = (x, z, w, d, h) => addCollider({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
function wall(mat, x, z, w, d, h, color, y0, th) { y0 = y0 || 0; cityBatch.add(boxUV(w, h, d, TILE, th || TILE, y0), mat, x, y0 + h / 2, z, null, color); }
/* telhado plano com platibanda e equipamentos (ar-condicionado, caixa d'água, antena) */
function roofTop(x, y, z, w, d, big) {
  const c = hexRGB(0x8a8a86); cityFlat.box(x, y - 0.02, z, w + 0.3, 0.35, d + 0.3, c);
  for (const [sx, sz, lw, ld] of [[0, -1, w + 0.3, 0.18], [0, 1, w + 0.3, 0.18], [-1, 0, 0.18, d + 0.3], [1, 0, 0.18, d + 0.3]]) cityFlat.box(x + sx * (w + 0.3) / 2, y + 0.3, z + sz * (d + 0.3) / 2, lw, 0.9, ld, hexRGB(0x9a9a96));
  const n = 1 + Math.floor(rnd() * (big ? 5 : 3));
  for (let k = 0; k < n; k++) { const px = x + rr(-w / 2.6, w / 2.6), pz = z + rr(-d / 2.6, d / 2.6); if (rnd() < 0.45) cityFlat.box(px, y + 0.3, pz, rr(1.2, 2.6), rr(0.8, 1.6), rr(1.2, 2.6), hexRGB(0xb9bcc0)); else if (rnd() < 0.6) { cityFlat.cyl(px, y + 1.4, pz, 1.1, 1.8, hexRGB(0x7d6a58), 8); for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) cityFlat.box(px + lx, y + 0.3, pz + lz, 0.12, 1.2, 0.12, hexRGB(0x55504a)); } else { cityFlat.cyl(px, y + 0.3, pz, 0.06, rr(3, 6), hexRGB(0xaaaaaa), 5); } }
}
/* letreiro de loja na face voltada para a rua: idx escolhe a placa no atlas */
function shopSign(x, z, w, d, face, idx) {
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]][face], sw = Math.min(6.5, (face % 2 ? d : w) * 0.55), sh = sw * 0.3, ny = 3.55;
  const cx = x + dirs[0] * (face % 2 ? w / 2 + 0.07 : 0), cz = z + dirs[1] * (face % 2 ? 0 : d / 2 + 0.07);
  const ux = dirs[1], uz = -dirs[0], c = idx % 4, rw = Math.floor(idx / 4), u0 = c / 4, u1 = (c + 1) / 4, v1 = 1 - rw / 3, v0 = 1 - (rw + 1) / 3;
  citySigns.quad([cx - ux * sw / 2, ny, cz - uz * sw / 2], [cx + ux * sw / 2, ny, cz + uz * sw / 2], [cx + ux * sw / 2, ny + sh, cz + uz * sw / 2], [cx - ux * sw / 2, ny + sh, cz - uz * sw / 2], dirs[0], 0, dirs[1], [1, 1, 1], [u0, v0, u1, v0, u1, v1, u0, v1]);
}
const outFace = (bx, bz) => Math.abs(bx) > Math.abs(bz) ? (bx > 0 ? 1 : 3) : (bz > 0 ? 2 : 0);   // face do prédio voltada para a rua mais próxima do bloco

/* ---- tipos de prédio ---- */
function towerBlock(cx, cz, dc, forceGlass) {
  const pw = 44, ph = 11.2;                                       // pódio de lojas e escritórios ocupando o quarteirão
  wall(FACADE.shop, cx, cz, pw, pw, 4.4, 0xffffff, 0, 4.4); wall(FACADE.concrete, cx, cz, pw, pw, ph - 4.4, pk2(TINTS_C), 4.4); roofTop(cx, ph, cz, pw, pw, true);
  const nT = dc < 0.35 ? 1 + Math.floor(rnd() * 2.4) : 1 + Math.floor(rnd() * 1.4), spots = [[0, 0], [-11, -11], [11, 11], [11, -11], [-11, 11]];
  let top = ph, best = null;
  for (let k = 0; k < nT; k++) {
    const [ox, oz] = nT === 1 ? [rr(-4, 4), rr(-4, 4)] : spots[k + 1], sw = nT === 1 ? rr(22, 30) : rr(14, 19), H = lerp(155, 52, clamp(dc * 1.1, 0, 1)) * rr(0.72, 1.12) * (nT > 1 ? 0.85 : 1), glass = forceGlass || rnd() < 0.62, tint = glass ? pk2(TINTS_G) : pk2(TINTS_C);
    wall(glass ? FACADE.glass : FACADE.concrete, cx + ox, cz + oz, sw, sw * rr(0.85, 1), H, tint, ph);
    const top2 = ph + H, sd = sw * 0.62;                           // coroamento recuado e antena
    wall(glass ? FACADE.glass : FACADE.concrete, cx + ox, cz + oz, sd, sd, 9, tint, top2); roofTop(cx + ox, top2 + 9, cz + oz, sd, sd, false);
    cityFlat.cyl(cx + ox, top2 + 9, cz + oz, 0.18, rr(8, 18), hexRGB(0xc9cdd2), 6); top = Math.max(top, top2 + 20); if (!best || top2 + 9 > best.top) best = { x: cx + ox + sd * 0.25, z: cz + oz + sd * 0.25, top: top2 + 9 };
  }
  collide(cx, cz, pw, pw, top); for (let f = 0; f < 4; f++) shopSign(cx, cz, pw, pw, f, Math.floor(rnd() * 12));
  return best;
}
function midrise(x, z, w, d, floors, bx, bz) {
  const brick = rnd() < 0.35, H = floors * 3.2 + 1.2, tint = brick ? pk2(TINTS_B) : pk2(TINTS_C);
  wall(FACADE.shop, x, z, w, d, 4.4, 0xffffff, 0, 4.4); wall(brick ? FACADE.brick : FACADE.concrete, x, z, w, d, H - 4.4, tint, 4.4); roofTop(x, H, z, w, d, false);
  collide(x, z, w, d, H + 2); if (curCityId === 'sp' && rnd() < 0.5) spWallArt(x, z, w, d, H, 'pixo');
  if (bx === 0 && bz === 0) for (let f = 0; f < 4; f++) shopSign(x, z, w, d, f, Math.floor(rnd() * 12)); else { if (bx) shopSign(x, z, w, d, bx > 0 ? 1 : 3, Math.floor(rnd() * 12)); if (bz) shopSign(x, z, w, d, bz > 0 ? 2 : 0, Math.floor(rnd() * 12)); }
  if (rnd() < 0.18) {                                             // painel publicitário no telhado
    const f = outFace(bx, bz), nx = [0, 1, 0, -1][f], nz = [-1, 0, 1, 0][f], px = x + nx * (w / 2 - 1.2) * (f % 2 ? 1 : 0), pz = z + nz * (d / 2 - 1.2) * (f % 2 ? 0 : 1), ux = nz, uz = -nx, idx = Math.floor(rnd() * 12), c = idx % 4, rw = Math.floor(idx / 4), W = 9, Hh = 3.6;
    cityFlat.box(px - ux * 3, H, pz - uz * 3, 0.3, 3, 0.3, hexRGB(0x555555)); cityFlat.box(px + ux * 3, H, pz + uz * 3, 0.3, 3, 0.3, hexRGB(0x555555));
    citySigns.quad([px - ux * W / 2, H + 2.6, pz - uz * W / 2], [px + ux * W / 2, H + 2.6, pz + uz * W / 2], [px + ux * W / 2, H + 2.6 + Hh, pz + uz * W / 2], [px - ux * W / 2, H + 2.6 + Hh, pz - uz * W / 2], nx, 0, nz, [1, 1, 1], [c / 4, 1 - (rw + 1) / 3, (c + 1) / 4, 1 - (rw + 1) / 3, (c + 1) / 4, 1 - rw / 3, c / 4, 1 - rw / 3]);
  }
}
function apartment(x, z, w, d, floors) {
  const brick = rnd() < 0.5, H = floors * 3.2 + 1, tint = brick ? pk2(TINTS_B) : pk2(TINTS_H);
  wall(brick ? FACADE.brick : FACADE.house, x, z, w, d, H, tint, 0); roofTop(x, H, z, w, d, false); collide(x, z, w, d, H + 2); if (curCityId === 'sp' && rnd() < 0.55) spWallArt(x, z, w, d, H, 'pixo');
}
function houseLot(x, z, s) {                                      // casa de 2 pavimentos com telhado de duas águas, muro baixo e jardim
  const w = rr(7.5, 10), d = rr(7.5, 10), H = 6.6, tint = pk2(TINTS_H), ox = rr(-(s - w) / 2 + 0.6, (s - w) / 2 - 0.6), oz = rr(-(s - d) / 2 + 0.6, (s - d) / 2 - 0.6);
  wall(FACADE.house, x + ox, z + oz, w, d, H, tint, 0); cityFlat.gable(x + ox, H, z + oz, w + 0.9, d + 0.9, 2.4, hexRGB(pk2([0xb4532a, 0xa84a26, 0x8a8f94, 0x6b4a3a])), 0, w < d);
  collide(x + ox, z + oz, w, d, H + 2.4);
  if (curCityId === 'sp' && rnd() < (spMuralBlock ? 0.9 : 0.25)) spWallArt(x + ox, z + oz, w, d, H, rnd() < 0.7 ? 'mural' : 'pixo');
  const wc = hexRGB(0xd9d2c0), t = 0.25, hh = 1.1;                  // muro frontal e laterais
  cityFlat.box(x, 0.3, z - s / 2, s, hh, t, wc); cityFlat.box(x, 0.3, z + s / 2, s, hh, t, wc); cityFlat.box(x - s / 2, 0.3, z, t, hh, s, wc); cityFlat.box(x + s / 2, 0.3, z, t, hh, s, wc);
  collide(x, z - s / 2, s, t + 0.2, 1.2); collide(x, z + s / 2, s, t + 0.2, 1.2); collide(x - s / 2, z, t + 0.2, s, 1.2); collide(x + s / 2, z, t + 0.2, s, 1.2);
  if (rnd() < 0.8) plantTree([x + rr(-s / 2 + 1.5, s / 2 - 1.5), z + rr(-s / 2 + 1.5, s / 2 - 1.5), rr(0.55, 0.8), 0.3]);
}
function warehouse(x, z, w, d) {
  const H = rr(8, 11); wall(FACADE.ware, x, z, w, d, H, pk2([0xd0d6dc, 0xc9d4c8, 0xdcd2c0, 0xc4ccd6]), 0); cityFlat.gable(x, H, z, w + 0.8, d + 0.8, 1.8, hexRGB(0x7c838a), 0, w < d); collide(x, z, w, d, H + 2);
}
function industrialBlock(cx, cz) {
  if (curCityId === 'sp') { cityFlat.cyl(cx + 19, 0.3, cz - 21, 1.5, 32, hexRGB(0xa4553a), 12); cityFlat.cyl(cx + 19, 32.3, cz - 21, 1.75, 1.2, hexRGB(0x8a4430), 12); collide(cx + 19, cz - 21, 3, 3, 33); }
  warehouse(cx - 11, cz - 12, 24, 20); warehouse(cx + 12, cz - 13, 20, 18); warehouse(cx - 2, cz + 14, 38, 14);
  for (let k = 0; k < 7; k++) { const px = cx + rr(-20, 20), pz = cz + rr(2, 5) * (k % 2 ? 1 : -1), col = pk2([0x2e86c1, 0xc0392b, 0x1e8449, 0xd68910, 0x7d3c98]); if (Math.abs(pz - (cz + 14)) < 9) continue; cityFlat.box(px, 0.3, pz, 6, 2.6, 2.4, hexRGB(col)); if (rnd() < 0.5) cityFlat.box(px, 2.9, pz, 6, 2.6, 2.4, hexRGB(pk2([0x2e86c1, 0xc0392b, 0x1e8449]))); collide(px, pz, 6, 2.4, 5.5); }
  for (let k = 0; k < 3; k++) { const px = cx + 20 - k * 3.2, pz = cz + 3; cityFlat.cyl(px, 0.3, pz, 1.4, 8, hexRGB(0xd5d8da), 10); collide(px, pz, 2.8, 2.8, 8); }
}
function plazaBlock(cx, cz) {
  for (let k = 0; k < 3; k++) cityFlat.cyl(cx, 0.3 + k * 0.4, cz, 7 - k * 1.8, 0.4, k === 2 ? hexRGB(0x5da9d6) : hexRGB(0xd9d4c8), 20);       // fonte em três níveis
  cityFlat.cyl(cx, 1.5, cz, 0.35, 5, hexRGB(0xe9e6df), 8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { plantTree([cx + sx * 16, cz + sz * 16, 1.1, 0.3]); cityFlat.cyl(cx + sx * 20, 0.3, cz + sz * 8, 0.07, 9, hexRGB(0xdddddd), 5); }
  collide(cx, cz, 13, 13, 1.2);
}
function stadiumBlock(cx, cz) {
  cityFlat.box(cx, 0.28, cz, 46, 0.06, 46, hexRGB(0x7e8a7a)); cityFlat.box(cx, 0.32, cz, 34, 0.06, 22, hexRGB(0x2f7d46));
  const white = [1, 1, 1]; cityFlat.box(cx, 0.4, cz, 34, 0.03, 0.25, white); cityFlat.box(cx - 17, 0.4, cz, 0.25, 0.03, 22, white); cityFlat.box(cx + 17, 0.4, cz, 0.25, 0.03, 22, white); cityFlat.box(cx, 0.4, cz - 11, 34, 0.03, 0.25, white); cityFlat.box(cx, 0.4, cz + 11, 34, 0.03, 0.25, white); cityFlat.cyl(cx, 0.4, cz, 3.2, 0.03, white, 16);
  for (const sz of [-1, 1]) for (let r = 0; r < 5; r++) { cityFlat.box(cx, 0.3, cz + sz * (14 + r * 1.4), 38, 0.6 + r * 0.6, 1.3, hexRGB(r % 2 ? 0xc0c4c8 : 0xaeb3b8)); }
  collide(cx, cz - 17, 38, 8, 3.5); collide(cx, cz + 17, 38, 8, 3.5);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { cityFlat.cyl(cx + sx * 21, 0.3, cz + sz * 21, 0.18, 16, hexRGB(0x555a60), 6); cityFlat.box(cx + sx * 21, 16, cz + sz * 21, 2.6, 0.8, 1.2, hexRGB(0xf3f3e0)); addRound(cx + sx * 21, cz + sz * 21, 0.3); }
  for (const sx of [-1, 1]) { cityFlat.box(cx + sx * 17.4, 0.3, cz - 1.8, 0.1, 2.2, 0.1, white); cityFlat.box(cx + sx * 17.4, 0.3, cz + 1.8, 0.1, 2.2, 0.1, white); cityFlat.box(cx + sx * 17.4, 2.3, cz, 0.1, 0.1, 3.7, white); }
}
function mallBlock(cx, cz) {
  wall(FACADE.glass, cx, cz - 4, 44, 34, 13, 0xcfe0e8, 0); roofTop(cx, 13, cz - 4, 44, 34, true); collide(cx, cz - 4, 44, 34, 15);
  cityFlat.box(cx, 0.28, cz + 19, 46, 0.05, 10, hexRGB(0x4a4d52));                                  // estacionamento
  for (let k = -9; k <= 9; k++) cityFlat.box(cx + k * 2.4, 0.34, cz + 19, 0.12, 0.02, 8, [1, 1, 1]);
  for (let f = 0; f < 4; f++) shopSign(cx, cz - 4, 44, 34, f, 11);
}
function parkBlock(cx, cz) {
  for (let t = 0; t < 12; t++) plantTree([cx + rr(-22, 22), cz + rr(-22, 22), rr(0.9, 1.3), 0.3]);
  cityFlat.box(cx, 0.31, cz, 2.4, 0.04, 46, hexRGB(0xcdbf9f)); cityFlat.box(cx, 0.31, cz, 46, 0.04, 2.4, hexRGB(0xcdbf9f));        // caminhos de terra batida
  if (rnd() < 0.5) cityFlat.cyl(cx + 12, 0.3, cz - 12, 6, 0.05, hexRGB(0x4f95c4), 18);              // lago
}

/* orla: prédios residenciais altos e estreitos, de frente para o mar (pilotis com lojas, varandas) */
function beachBlock(cx, cz) {
  for (const sx of [-1, 1]) {
    const w = rr(17, 21), d = rr(15, 19), floors = 9 + Math.floor(rnd() * 8), H = floors * 3.1 + 4.4, x = cx + sx * 12.5, z = cz + rr(2, 5), tint = pk2([0xf5f1e8, 0xece4d2, 0xe8eef2, 0xf2e2d0, 0xdfe9e3]);
    wall(FACADE.shop, x, z, w, d, 4.4, 0xffffff, 0, 4.4); wall(FACADE.concrete, x, z, w, d, H - 4.4, tint, 4.4); roofTop(x, H, z, w, d, false);
    for (let k = 1; k < floors; k += 1) cityFlat.box(x, 4.4 + k * 3.1 - 0.15, z + d / 2 + 0.55, w * 0.92, 0.18, 1.1, hexRGB(0xf7f7f2));        // varandas viradas para o mar (sul)
    collide(x, z, w, d, H + 2); shopSign(x, z, w, d, 2, Math.floor(rnd() * 12));
  }
}
/* piso da calçada por bairro: pedra portuguesa no Centro e nas áreas nobres, intertravado na Paulista/Itaim/estádio/shopping, cimentado nos residenciais */
function walkFor(cid, type, lj) {
  if (cid === 'sp') { if (lj === 4 || lj === 5 || (lj >= 6 && type === 'T') || type === 'S' || type === 'C') return WALK.intertravado; return type === 'R' || type === 'I' ? WALK.concreto : WALK.portuguesa; }
  return type === 'R' || type === 'I' ? WALK.concreto : WALK.intertravado;              // o mapa do estado na pedra portuguesa é coisa de SP
}
let spMuralBlock = false;
/* ---- monta a cidade ---- */
for (const C of CITIES) for (let j = C.j0; j < C.j0 + C.nj; j++) for (let i = C.i0; i < C.i0 + C.ni; i++) {
  curCityId = C.id;
  const li = i - C.i0, lj = j - C.j0, lm = C.id === 'sp' ? SP_LM[li + ',' + lj] : null;
  const cx = blockC(i), cz = blockC(j), type = lm ? (SP_PARKS.has(lm) ? 'P' : 'L') : LAYOUTS[C.id][lj][li], dc = clamp(Math.hypot(cx - C.cx, cz - C.cz) / Math.max(C.hx, C.hz), 0, 1);
  CITY_BLOCKS.push({ i, j, cx, cz, type, city: C.id, lm });
  if (type === 'P' || type === 'Z') parkSet.add(i + ',' + j);
  cityBatch.add(worldUV(new THREE.BoxGeometry(B, 0.3, B), cx, cz, 8), walkFor(C.id, type, lj), cx, 0.15, cz);
  if (type === 'P' || type === 'R') { const lw = type === 'P' ? B - 10 : B - 11.5; cityBatch.add(worldUV(new THREE.PlaneGeometry(lw, lw).rotateX(-Math.PI / 2), cx, cz, 6, true), lawnMat, cx, 0.302, cz); }
  { const cc = [0.74, 0.73, 0.7], h = B / 2 - 0.15;                                         // meio-fio
    cityFlat.box(cx, 0, cz - h, B, 0.32, 0.3, cc); cityFlat.box(cx, 0, cz + h, B, 0.32, 0.3, cc); cityFlat.box(cx - h, 0, cz, 0.3, 0.32, B - 0.6, cc); cityFlat.box(cx + h, 0, cz, 0.3, 0.32, B - 0.6, cc);
    const yl = [0.86, 0.72, 0.12], q = (px, pz, w, d) => cityMarks.quad([px - w / 2, 0.308, pz - d / 2], [px - w / 2, 0.308, pz + d / 2], [px + w / 2, 0.308, pz + d / 2], [px + w / 2, 0.308, pz - d / 2], 0, 1, 0, yl);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { q(cx + sx * 26, cz + sz * 27.2, 3.2, 0.7); q(cx + sx * 27.2, cz + sz * 26, 0.7, 3.2); } }   // piso tátil nas esquinas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lampSpots.push([cx + sx * 27, cz + sz * 27]);
  spMuralBlock = C.id === 'sp' && li === 1 && lj === 1;                                   // "Beco do Batman"
  if (lm) SP_BUILD[lm](cx, cz, i, j);
  else if (type === 'P') parkBlock(cx, cz);
  else if (type === 'Z') plazaBlock(cx, cz);
  else if (type === 'S') { stadiumBlock(cx, cz); if (C.id === 'sp') { for (const s of [-1, 1]) cityFlat.box(cx + s * 8.5, 0.3, cz + 25.5, 0.25, 5.6, 0.25, [0.3, 0.3, 0.32]); lmSign(5, cx, 4.2, cz + 25.62, 18, 2, 0, 1); } }
  else if (type === 'C') mallBlock(cx, cz);
  else if (type === 'I') industrialBlock(cx, cz);
  else if (type === 'T') { const t = towerBlock(cx, cz, dc, C.id === 'sp' && lj >= 6); if (C.id === 'sp' && t && SP_ANTENNAS.has(li + ',' + lj)) antenna(t.x, t.top + 0.3, t.z, 52); }
  else if (type === 'A') beachBlock(cx, cz);
  else if (type === 'M') {
    const big = rnd() < 0.3;
    if (big) midrise(cx, cz, rr(34, 42), rr(34, 42), 6 + Math.floor(rnd() * 8), 0, 0);
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) { if (rnd() < 0.08) continue; const w = rr(15, 21), d = rr(15, 21); midrise(cx + sx * 12, cz + sz * 12, w, d, 3 + Math.floor(rnd() * 8), sx * 12, sz * 12); }
  } else if (type === 'R') {
    if (rnd() < 0.3) { apartment(cx - 12, cz - 12, 20, 20, 6 + Math.floor(rnd() * 4)); apartment(cx + 12, cz + 12, 20, 20, 5 + Math.floor(rnd() * 4)); houseLot(cx + 12, cz - 12, 20); houseLot(cx - 12, cz + 12, 20); }
    else for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (rnd() < 0.12) continue; houseLot(cx + a * 15.5, cz + b * 15.5, 14.2); }
  }
  for (let t = 0; t < (C.id === 'sp' ? 5 : 2); t++) {                                        // árvores (SP) / palmeiras (Rio) nas calçadas
    const side = Math.floor(rnd() * 4), u = rr(-24, 24), pos = side === 0 ? [u, -27.4] : side === 1 ? [27.4, u] : side === 2 ? [u, 27.4] : [-27.4, u];
    plantTree([cx + pos[0], cz + pos[1], rr(0.8, 1.1), 0.3]);
  }
}
/* faixas de pedestre (zebra) nos quatro braços de cada cruzamento + faixa de retenção na pista que chega */
{
  const white = [0.93, 0.93, 0.9], y = 0.078;
  const mark = (px, pz, w, d) => cityMarks.quad([px - w / 2, y, pz - d / 2], [px - w / 2, y, pz + d / 2], [px + w / 2, y, pz + d / 2], [px + w / 2, y, pz - d / 2], 0, 1, 0, white);
  for (const C of CITIES) for (let i = C.i0; i <= C.i0 + C.ni; i++) for (let j = C.j0; j <= C.j0 + C.nj; j++) {
    const nx = roadC(i), nz = roadC(j);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!nodeOK(i + dx, j + dz) || isHwyNode(i + dx, j + dz)) continue;
      for (let k = -8; k <= 8; k++) { const px = nx + dx * 11 + (dz ? k : 0), pz = nz + dz * 11 + (dx ? k : 0); mark(px, pz, dx ? 3.2 : 0.55, dx ? 0.55 : 3.2); }
      mark(nx + dx * 13.8 + dz * 4.2, nz + dz * 13.8 - dx * 4.2, dx ? 0.45 : 3.8, dx ? 3.8 : 0.45);
    }
  }
}
buildSPExtras();
cityBatch.flush(true, true);
{
  cityFlat.build(propMat, true); cityMarks.build(propMat, false); citySigns.build(signMat, false);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0), poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.18, 0.5).translate(0, 7.1, 0), lampMat, lampSpots.length), m = new THREE.Matrix4();
  lampSpots.forEach((p, i) => { m.makeTranslation(p[0], 0.3, p[1]); poles.setMatrixAt(i, m); heads.setMatrixAt(i, m); });
  poles.frustumCulled = false; heads.frustumCulled = false; scene.add(poles, heads);
}
