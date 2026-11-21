/* NEON COAST — Montador de malhas e objetos de rua (bancos, banquinhos, mesas, guarda-sóis, caixas térmicas, orelhões...).
   Tudo é somado em uma só malha por material (poucas chamadas de desenho), com cor por vértice. */
'use strict';

class Mesher {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.v = 0; }
  /* quad com 4 cantos (sentido anti-horário visto de fora) */
  quad(a, b, c, d, nx, ny, nz, col, uvs) {
    const u = uvs || [0, 0, 1, 0, 1, 1, 0, 1];
    for (const [k, q] of [a, b, c, d].entries()) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.uv.push(u[k * 2], u[k * 2 + 1]); this.c.push(col[0], col[1], col[2]); }
    this.i.push(this.v, this.v + 1, this.v + 2, this.v, this.v + 2, this.v + 3); this.v += 4;
  }
  tri(a, b, c, nx, ny, nz, col) {
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.uv.push(0, 0); this.c.push(col[0], col[1], col[2]); }
    this.i.push(this.v, this.v + 1, this.v + 2); this.v += 3;
  }
  /* caixa com base em y0 e altura h, girada em yaw; tile = [metros por repetição em u, em v] para texturizar as laterais */
  box(cx, y0, cz, w, h, d, col, o) {
    o = o || {}; const yaw = o.yaw || 0, s = Math.sin(yaw), co = Math.cos(yaw), hw = w / 2, hd = d / 2, y1 = y0 + h, tu = o.tile ? o.tile[0] : 0, tv = o.tile ? o.tile[1] : 0;
    const R = (x, z) => [cx + x * co + z * s, cz - x * s + z * co];
    const c00 = R(-hw, -hd), c10 = R(hw, -hd), c11 = R(hw, hd), c01 = R(-hw, hd);
    const P = (c, y) => [c[0], y, c[1]];
    const nf = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]].map(([x, , z]) => [x * co + z * s, 0, -x * s + z * co]);
    const faces = [[c00, c10, nf[0], w], [c10, c11, nf[1], d], [c11, c01, nf[2], w], [c01, c00, nf[3], d]];
    const wu = (len, ox) => tu ? [ox, 0, ox + len / tu, 0, ox + len / tu, h / tv, ox, h / tv] : null;
    faces.forEach(([a, b, nn, len], k) => this.quad(P(b, y0), P(a, y0), P(a, y1), P(b, y1), -nn[0] * 0 + nn[0], 0, nn[2], col.map(v => v * (k % 2 ? 0.88 : 1)), wu(len, o.u0 || 0)));
    if (o.top !== false) this.quad(P(c00, y1), P(c01, y1), P(c11, y1), P(c10, y1), 0, 1, 0, col.map(v => v * 1.08));
  }
  /* telhado de duas águas (cumeeira ao longo de z, depois girado em yaw) */
  gable(cx, y0, cz, w, d, rise, col, yaw, ridgeAlongX) {
    yaw = yaw || 0; if (ridgeAlongX) { yaw += Math.PI / 2; const t = w; w = d; d = t; }   // gira em vez de espelhar (espelhar invertia as faces e o telhado sumia visto de cima)
    const s = Math.sin(yaw), co = Math.cos(yaw), W = w, D = d, hw = W / 2, hd = D / 2;
    const R = (x, z) => [cx + x * co + z * s, cz - x * s + z * co];
    const E1 = R(-hw, -hd), E2 = R(hw, -hd), E3 = R(hw, hd), E4 = R(-hw, hd), R1 = R(0, -hd), R2 = R(0, hd), y1 = y0 + rise;
    const P = (c, y) => [c[0], y, c[1]], k = rise / (hw || 1), nl = Math.hypot(k, 1);
    const sh = col.map(v => v * 0.85);
    const n1 = [-k / nl * co, 1 / nl, k / nl * s], n2 = [k / nl * co, 1 / nl, -k / nl * s];
    this.quad(P(E1, y0), P(E4, y0), P(R2, y1), P(R1, y1), n1[0], n1[1], n1[2], col);
    this.quad(P(R1, y1), P(R2, y1), P(E3, y0), P(E2, y0), n2[0], n2[1], n2[2], sh);
    this.tri(P(E1, y0), P(R1, y1), P(E2, y0), 0, 0, -1, sh); this.tri(P(E3, y0), P(R2, y1), P(E4, y0), 0, 0, 1, sh);
  }
  cyl(cx, y0, cz, r, h, col, sides) {
    sides = sides || 8;
    for (let k = 0; k < sides; k++) {
      const a0 = k / sides * Math.PI * 2, a1 = (k + 1) / sides * Math.PI * 2, x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1), am = (a0 + a1) / 2;
      this.quad([cx + x1 * r, y0, cz + z1 * r], [cx + x0 * r, y0, cz + z0 * r], [cx + x0 * r, y0 + h, cz + z0 * r], [cx + x1 * r, y0 + h, cz + z1 * r], Math.cos(am), 0, Math.sin(am), col);
      this.tri([cx, y0 + h, cz], [cx + x1 * r, y0 + h, cz + z1 * r], [cx + x0 * r, y0 + h, cz + z0 * r], 0, 1, 0, col.map(v => v * 1.08));
    }
  }
  cone(cx, y0, cz, r, h, col, sides) {
    sides = sides || 10;
    for (let k = 0; k < sides; k++) {
      const a0 = k / sides * Math.PI * 2, a1 = (k + 1) / sides * Math.PI * 2, am = (a0 + a1) / 2, nl = Math.hypot(h, r), ny = r / nl, nh = h / nl;
      this.tri([cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], [cx, y0 + h, cz], Math.cos(am) * nh, ny, Math.sin(am) * nh, k % 2 ? col : col.map(v => v * 0.82));
    }
  }
  build(material, shadows) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.v > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material); m.castShadow = shadows !== false; m.receiveShadow = true; return m;
  }
}
const hexRGB = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });

/* ---------- objetos (todos em coordenadas de mundo; y = chão) ---------- */
const PROP = {
  stool(m, x, y, z, col) { col = col || hexRGB(0xd23b2e); m.cyl(x, y + 0.42, z, 0.19, 0.05, col, 8); for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) m.box(x + dx, y, z + dz, 0.035, 0.42, 0.035, [0.25, 0.25, 0.27]); },
  chair(m, x, y, z, yaw, col) { col = col || hexRGB(0xe9e6df); const s = Math.sin(yaw), c = Math.cos(yaw); m.box(x, y + 0.42, z, 0.44, 0.04, 0.44, col, { yaw }); m.box(x - s * 0.2, y + 0.46, z - c * 0.2, 0.44, 0.42, 0.04, col, { yaw });
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [0.18, 0.18], [-0.18, 0.18]]) m.box(x + dx * c + dz * s, y, z - dx * s + dz * c, 0.035, 0.42, 0.035, col.map(v => v * 0.9)); },
  table(m, x, y, z, w, d, col, yaw) { col = col || hexRGB(0xd9d4c7); m.box(x, y + 0.72, z, w, 0.04, d, col, { yaw }); const s = Math.sin(yaw || 0), c = Math.cos(yaw || 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) m.box(x + (dx * (w / 2 - 0.05)) * c + (dz * (d / 2 - 0.05)) * s, y, z - (dx * (w / 2 - 0.05)) * s + (dz * (d / 2 - 0.05)) * c, 0.04, 0.72, 0.04, col.map(v => v * 0.85)); },
  bench(m, x, y, z, yaw) { const wood = hexRGB(0x7a5232), iron = [0.2, 0.22, 0.24], s = Math.sin(yaw), c = Math.cos(yaw);
    m.box(x, y + 0.44, z, 1.7, 0.07, 0.45, wood, { yaw }); m.box(x - s * 0.2, y + 0.62, z - c * 0.2, 1.7, 0.4, 0.06, wood, { yaw });
    for (const k of [-0.7, 0.7]) m.box(x + k * c, y, z - k * s, 0.07, 0.44, 0.4, iron, { yaw }); },
  umbrella(m, x, y, z, col) { col = col || hexRGB(0xe0a800); m.cyl(x, y, z, 0.03, 2.3, [0.85, 0.85, 0.85], 6); m.cone(x, y + 2.05, z, 1.5, 0.45, col, 12); },
  cooler(m, x, y, z, yaw, col) { col = col || [0.92, 0.92, 0.95]; m.box(x, y, z, 0.7, 0.42, 0.42, col, { yaw }); m.box(x, y + 0.42, z, 0.72, 0.05, 0.44, hexRGB(0xc7312a), { yaw }); },
  payphone(m, x, y, z, yaw) { m.cyl(x, y, z, 0.05, 1.2, [0.3, 0.3, 0.32], 6); m.box(x, y + 1.2, z, 0.5, 0.7, 0.35, hexRGB(0xe0b020), { yaw }); m.box(x, y + 1.88, z, 0.6, 0.09, 0.45, hexRGB(0xe0b020), { yaw }); },
  bin(m, x, y, z, col) { m.cyl(x, y, z, 0.3, 0.85, col || hexRGB(0x3a6e48), 8); },
  lounger(m, x, y, z, yaw, col) { col = col || hexRGB(0xf2f2f2); m.box(x, y + 0.28, z, 0.62, 0.06, 1.5, col, { yaw }); const s = Math.sin(yaw), c = Math.cos(yaw);
    m.box(x - s * 0.7, y + 0.5, z - c * 0.7, 0.62, 0.05, 0.55, col, { yaw }); for (const [dx, dz] of [[-0.25, -0.65], [0.25, -0.65], [0.25, 0.65], [-0.25, 0.65]]) m.box(x + dx * c + dz * s, y, z - dx * s + dz * c, 0.04, 0.28, 0.04, [0.6, 0.6, 0.6]); },
  speaker(m, x, y, z, yaw) { m.box(x, y, z, 0.6, 1.1, 0.5, [0.1, 0.1, 0.11], { yaw }); m.cyl(x, y + 0.2, z, 0.18, 0.02, [0.3, 0.3, 0.32], 8); },
  crate(m, x, y, z, yaw) { m.box(x, y, z, 0.5, 0.35, 0.35, hexRGB(0xc8a65b), { yaw }); },
  /* banca de rua: balcão, guarda-sol, caixa térmica e banquinho */
  stand(m, x, y, z, yaw, col) { const s = Math.sin(yaw), c = Math.cos(yaw); m.box(x, y, z, 1.6, 0.9, 0.7, hexRGB(0xb9854a), { yaw }); m.box(x, y + 0.9, z, 1.7, 0.06, 0.8, hexRGB(0xe8dcc0), { yaw });
    PROP.umbrella(m, x - s * 0.1, y, z - c * 0.1, col); PROP.cooler(m, x + c * 1.3, y, z - s * 1.3, yaw); PROP.stool(m, x - c * 0.8 + s * 0.9, y, z + s * 0.8 + c * 0.9); }
};

/* pontos de cena para NPCs (estilo Urbanize): {t: tipo, x, z, h: direção (rad), y: altura absoluta opcional, n: quantidade}; ativados perto do jogador */
const npcSpots = [];
