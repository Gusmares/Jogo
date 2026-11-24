/* NEON COAST — Favela "Morro da Esperança": comunidade brasileira no morro a leste da cidade.
   • Uma ladeira estreita em zigue-zague sobe do portão até a quadra no meio do morro (só ali chega carro).
   • Daí para cima e para os lados, só VIELAS: becos de ~2 m que serpenteiam pela encosta, com ESCADARIAS nos trechos íngremes, fios de luz e postes.
   • Casas de tijolo, laje e telhado empilhadas e coladas, giradas conforme as curvas de nível, com gente na rua (cenas Urbanize-like).
   A polícia tem dificuldade: a ladeira é estreita, as viaturas param no portão e o resto é a pé por becos e escadas. */
'use strict';
const FAVELAS = [];
function buildFavela(F) {
  const FAVELA = { houses: [], alleys: [], name: F.name, walk: [], graph: null, F, city: F.city };
  const FAV_ROAD = F.road, FAV_FLATS = F.flats, favRoadNear = (x, z) => favRoadNearF(F, x, z), favelaMask = (x, z) => favMask1(F, x, z);
  const fr = mulberry32(F.seed), R = (a, b) => a + (b - a) * fr(), pickOf = arr => arr[Math.floor(fr() * arr.length)];
  const AHW = 0.95;                                              // meia-largura da viela
  /* --- texturas das paredes (concreto pintado e tijolo aparente), com janela gradeada --- */
  function wallTex(brick) {
    const cv = mkCanvas(256, 256), g = cv.getContext('2d'), r = mulberry32(brick ? 11 : 12);
    g.fillStyle = brick ? '#b3593b' : '#ececE6'; g.fillRect(0, 0, 256, 256);
    if (brick) {
      for (let y = 0; y < 256; y += 8) for (let x = -((y / 8) % 2) * 16; x < 256; x += 32) { const k = 0.82 + r() * 0.3; g.fillStyle = `rgb(${180 * k | 0},${88 * k | 0},${58 * k | 0})`; g.fillRect(x + 1, y + 1, 30, 6); }
      g.fillStyle = 'rgba(210,190,170,.35)'; for (let y = 0; y < 256; y += 8) g.fillRect(0, y, 256, 1);
    } else {
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.05})`; g.beginPath(); g.arc(r() * 256, r() * 256, 2 + r() * 14, 0, 7); g.fill(); }
      for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(70,55,40,${0.05 + r() * 0.07})`; g.fillRect(r() * 256, 0, 2 + r() * 5, 80 + r() * 176); }
    }
    g.fillStyle = '#4b4f55'; g.fillRect(34, 52, 94, 108); g.fillStyle = '#26384a'; g.fillRect(40, 58, 82, 96);
    g.fillStyle = 'rgba(180,210,235,.28)'; g.fillRect(40, 58, 82, 24);
    g.strokeStyle = '#c9ccd0'; g.lineWidth = 3; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(40 + k * 20.5, 58); g.lineTo(40 + k * 20.5, 154); g.stroke(); }
    g.beginPath(); g.moveTo(40, 106); g.lineTo(122, 106); g.stroke();
    g.fillStyle = '#4b4f55'; g.fillRect(190, 56, 26, 22); g.fillStyle = '#1e2a36'; g.fillRect(193, 59, 20, 16);
    return toTex(cv, true);
  }
  const wallMats = [false, true].map(b => new THREE.MeshLambertMaterial({ map: wallTex(b), vertexColors: true }));
  const walls = [new Mesher(), new Mesher()], flat = new Mesher(), paving = new Mesher();
  const grad = (x, z) => { const e = 1.5; return [(Hq(x + e, z) - Hq(x - e, z)) / (2 * e), (Hq(x, z + e) - Hq(x, z - e)) / (2 * e)]; };
  const roadD = (x, z) => favRoadNear(x, z).d;
  const ring = [];                                                // pontos da ladeira com normal e comprimento acumulado

  /* --- ladeira: asfalto + faixa central, colada ao terreno --- */
  {
    const P = FAV_ROAD; let s = 0;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      ring.push({ c: [P[i][0], P[i][1]], s, nx: -dz / l, nz: dx / l, tx: dx / l, tz: dz / l });
    }
    const geo = (w, vscale) => {
      const pos = [], uv = [], idx = [], nor = [];
      ring.forEach((q, i) => {
        for (const sd of [-1, 1]) { const x = q.c[0] + q.nx * sd * w, z = q.c[1] + q.nz * sd * w; pos.push(x, Hq(x, z) + 0.1, z); nor.push(0, 1, 0); uv.push(sd < 0 ? 0 : 1, q.s / vscale); }
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k + 1, k - 2, k + 1, k); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
    };
    const rm = new THREE.MeshLambertMaterial({ map: roadTexture('assets/world/roadnew4_256.png', 1) });
    const road = new THREE.Mesh(geo(FAV_ROAD_HW, 7), rm); road.receiveShadow = true; scene.add(road); farCullAdd(road);
    const tx = dashTex.clone(); tx.needsUpdate = true; tx.repeat.set(1, 1);
    const line = new THREE.Mesh(geo(0.14, 4), new THREE.MeshBasicMaterial({ map: tx, transparent: true })); line.position.y = 0.03; scene.add(line); farCullAdd(line);
    FAVELA.road = ring;
    // postes ao longo da ladeira
    const poles = []; let acc = 0;
    for (let i = 1; i < ring.length; i++) { acc += ring[i].s - ring[i - 1].s; if (acc > 30) { acc = 0; const q = ring[i], side = poles.length % 2 ? 1 : -1; poles.push([q.c[0] + q.nx * side * (FAV_ROAD_HW + 0.7), q.c[1] + q.nz * side * (FAV_ROAD_HW + 0.7)]); } }
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6).translate(0, 3.5, 0), poleMat, poles.length), hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.18, 0.45).translate(0, 7.1, 0), lampMat, poles.length), mm = new THREE.Matrix4();
    poles.forEach((p, i) => { mm.makeTranslation(p[0], Hq(p[0], p[1]), p[1]); pm.setMatrixAt(i, mm); hm.setMatrixAt(i, mm); addRound(p[0], p[1], 0.3); });
    pm.frustumCulled = hm.frustumCulled = false; scene.add(pm, hm); farCullAdd(pm); farCullAdd(hm);
    // arco de entrada com o nome da comunidade
    const q = ring[9], hh = Hq(q.c[0], q.c[1]);
    const ac = mkCanvas(1024, 160), g = ac.getContext('2d'); g.fillStyle = '#1f6b3a'; g.fillRect(0, 0, 1024, 160); g.fillStyle = '#f2c500'; g.fillRect(0, 0, 1024, 12); g.fillRect(0, 148, 1024, 12);
    g.fillStyle = '#fff'; g.font = 'bold 74px Arial'; g.textAlign = 'center'; g.font = 'bold ' + Math.min(74, Math.floor(1700 / Math.max(10, F.label.length))) + 'px Arial'; g.fillText(F.label, 512, 100); g.font = 'bold 26px Arial'; g.fillStyle = '#f2c500'; g.fillText('COMUNIDADE', 512, 140);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, FAV_ROAD_HW * 2 + 2.4), new THREE.MeshLambertMaterial({ map: toTex(ac, false) })); banner.position.set(q.c[0], hh + 6.4, q.c[1]); banner.rotation.y = Math.atan2(-q.tz, q.tx); banner.castShadow = true; scene.add(banner);
    for (const sd of [-1, 1]) { const px = q.c[0] + q.nx * sd * (FAV_ROAD_HW + 0.9), pz = q.c[1] + q.nz * sd * (FAV_ROAD_HW + 0.9); flat.box(px, Hq(px, pz) - 0.3, pz, 0.7, 7.5, 0.7, hexRGB(0xd9d2c0)); addRound(px, pz, 0.45); }
    FAVELA.gate = { x: q.c[0], z: q.c[1] };
  }

  /* --- vielas: caminhos de ~2 m que serpenteiam pela encosta (sobem e cortam o morro na horizontal) --- */
  const aHash = new Map(), ak = (x, z) => Math.floor(x / 4) + ',' + Math.floor(z / 4);
  const addAPt = (x, z, id) => { const k = ak(x, z); let l = aHash.get(k); if (!l) aHash.set(k, l = []); l.push([x, z, id]); };
  function nearAlley(x, z, r, notId) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = aHash.get(ak(x + a * 4, z + b * 4)); if (l) for (const p of l) if (p[2] !== notId && Math.hypot(p[0] - x, p[1] - z) < r) return p; } return null; }
  const dAng = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  function traceAlley(sx, sz, mode, maxLen) {
    const id = FAVELA.alleys.length, pts = [[sx, sz]]; let x = sx, z = sz;
    const g0 = grad(x, z), up = Math.atan2(g0[1], g0[0]), cont = up + (fr() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    let ang = mode === 'up' ? up + R(-0.7, 0.7) : cont + R(-0.25, 0.25);
    const wob = R(0.12, 0.3);
    for (let st = 0; st < maxLen / 2.4; st++) {
      const g = grad(x, z), gm = Math.hypot(g[0], g[1]), upA = Math.atan2(g[1], g[0]), contA = upA + (Math.cos(ang - (upA + Math.PI / 2)) >= 0 ? Math.PI / 2 : -Math.PI / 2);
      ang += R(-wob, wob);
      { const o = nearAlley(x, z, 9, id); if (o) { const away = Math.atan2(z - o[1], x - o[0]), d = dAng(ang, away); if (Math.abs(d) < 1.9) ang += d * (Math.abs(d) < 1.2 ? 0.14 : 0.07); } }
      if (mode === 'up') ang += dAng(ang, upA) * 0.06; else ang += dAng(ang, contA) * 0.12;
      const along = gm * Math.cos(ang - upA); if (Math.abs(along) > 0.5) ang += dAng(ang, contA) * 0.35;     // íngreme demais: vira para a curva de nível
      const nx = x + Math.cos(ang) * 2.4, nz = z + Math.sin(ang) * 2.4;
      if (favelaMask(nx, nz) < 0.16 || Hq(nx, nz) < WL + 0.8 || cityAt(nx, nz, 22) || FAV_FLATS.some(F => Math.hypot((nx - F.x) / (F.rx * 1.15), (nz - F.z) / (F.rz * 1.15)) < 1)) break;
      if (st > 2 && roadD(nx, nz) < FAV_ROAD_HW + 1.5) { pts.push([nx, nz]); break; }          // desemboca na ladeira
      if (st > 3 && nearAlley(nx, nz, 2.3, id)) { pts.push([nx, nz]); break; }                   // encontra outra viela
      x = nx; z = nz; pts.push([x, z]);
    }
    if (pts.length < 6) return null;
    FAVELA.alleys.push(pts); pts.forEach(p => addAPt(p[0], p[1], id)); return pts;
  }
  // sementes na ladeira (a cada ~15 m, dos dois lados)
  for (let i = 8; i < ring.length - 2; i += 7) {
    const q = ring[i], side = (i / 7 | 0) % 2 ? 1 : -1;
    traceAlley(q.c[0] + q.nx * side * (FAV_ROAD_HW + 1.0), q.c[1] + q.nz * side * (FAV_ROAD_HW + 1.0), fr() < 0.6 ? 'up' : 'across', R(50, 120));
    if (fr() < 0.35) traceAlley(q.c[0] - q.nx * side * (FAV_ROAD_HW + 1.0), q.c[1] - q.nz * side * (FAV_ROAD_HW + 1.0), fr() < 0.5 ? 'up' : 'across', R(40, 90));
  }
  // vielas transversais saindo das que já existem
  for (let round = 0; round < 2; round++) {
    const base = FAVELA.alleys.slice();
    for (const al of base) for (let k = 4; k < al.length - 2; k += R(5, 10) | 0) if (fr() < 0.32 && !nearAlley(al[k][0], al[k][1], 7, -1) === false) { const p = al[k]; if (!nearAlley(p[0] + 4.5, p[1], 3.5, al === al ? -1 : -1) || true) traceAlley(p[0], p[1], fr() < 0.5 ? 'up' : 'across', R(30, 80)); }
  }
  const PL = FAV_FLATS[0], plaza = { x: PL.x, z: PL.z, y: PL.h, rx: PL.rx, rz: PL.rz };
  FAVELA.plaza = plaza;

  /* --- casas: sorteio com recuo mínimo, giradas conforme as curvas de nível; as sobras formam as vielas --- */
  const gridH = new Map(), hk = (x, z) => Math.floor(x / 10) + ',' + Math.floor(z / 10);
  const rot = (h, lx, lz) => [h.x + lx * h.cy + lz * h.sy, h.z - lx * h.sy + lz * h.cy];
  const inObb = (h, x, z, m) => { const dx = x - h.x, dz = z - h.z, lx = dx * h.cy - dz * h.sy, lz = dx * h.sy + dz * h.cy; return Math.abs(lx) < h.w / 2 + m && Math.abs(lz) < h.d / 2 + m; };
  const addH = h => { const r = Math.hypot(h.w, h.d) / 2; for (let ix = Math.floor((h.x - r) / 10); ix <= Math.floor((h.x + r) / 10); ix++) for (let iz = Math.floor((h.z - r) / 10); iz <= Math.floor((h.z + r) / 10); iz++) { const k = ix + ',' + iz; (gridH.get(k) || gridH.set(k, []).get(k)).push(h); } };
  function housesNear(x, z) { const out = new Set(); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = gridH.get(hk(x + a * 10, z + b * 10)); if (l) l.forEach(h => out.add(h)); } return [...out]; }
  function obbOverlap(A, B, m) {                                    // SAT em 2D com margem
    const dx = B.x - A.x, dz = B.z - A.z;
    for (const [ux, uz] of [[A.cy, -A.sy], [A.sy, A.cy], [B.cy, -B.sy], [B.sy, B.cy]]) {
      const rA = Math.abs(ux * A.cy - uz * A.sy) * A.w / 2 + Math.abs(ux * A.sy + uz * A.cy) * A.d / 2, rB = Math.abs(ux * B.cy - uz * B.sy) * B.w / 2 + Math.abs(ux * B.sy + uz * B.cy) * B.d / 2;
      if (Math.abs(dx * ux + dz * uz) > rA + rB + m) return false;
    }
    return true;
  }
  const PAINT = [0xe3c27a, 0x8fb8cf, 0xd99a9a, 0xa4c590, 0xe8e1d2, 0xcf7f4a, 0xb7b2a8, 0x9a8fc0, 0xdcdcd6, 0xe9d36b], TERRA = [0xb4532a, 0xa84a26, 0xc0603a], ZINC = [0x8a8f94, 0xa7a29a, 0x7b8085];
  const tanks = [], dishes = [], placed = FAVELA.houses;
  const rbox = (h, lx, lz, y0, w, hh, d, col) => { const p = rot(h, lx, lz); flat.box(p[0], y0, p[1], w, hh, d, col, { yaw: h.yaw }); };
  const ST = FAVELA.stats = { tries: 0, mask: 0, flat: 0, steep: 0, alley: 0, overlap: 0, road: 0, ok: 0 };
  const MAXH = Math.round(640 * (F.a * F.b) / (100 * 125) * (F.city === 'rj' ? 1.15 : 1));
  for (let tries = 0; tries < 140000 && placed.length < MAXH; tries++) {
    ST.tries++;
    const [x, z] = favWorld(F, R(-F.a * 1.1, F.a * 1.1), R(-F.b * 1.05, F.b * 1.05)), m = favelaMask(x, z);
    if (cityAt(x, z, 24) || fr() > m * 1.1 || Hq(x, z) < WL + 0.9) { ST.mask++; continue; }
    const g = grad(x, z), gm = Math.hypot(g[0], g[1]);
    // eixo longo da casa ao longo da curva de nível (tangente = perpendicular ao gradiente); no plano, acompanha a ladeira
    let yaw; if (gm > 0.07) yaw = Math.atan2(-g[0], -g[1]); else { const q = favRoadNear(x, z), tt = ring[Math.min(ring.length - 1, Math.floor(q.i))]; yaw = Math.atan2(-tt.tz, tt.tx); }
    yaw += R(-0.28, 0.28) + (fr() < 0.22 ? Math.PI / 2 : 0);
    const W = R(3.4, 7.2), D = R(3.4, 6.4), cy = Math.cos(yaw), sy = Math.sin(yaw), H = { x, z, w: W, d: D, yaw, cy, sy };
    if (FAV_FLATS.some(F => Math.hypot((x - F.x) / (F.rx * 1.3), (z - F.z) / (F.rz * 1.3)) < 1)) continue;
    const cs = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [0, 0]].map(([lx, lz]) => rot(H, lx, lz)), hs = cs.map(c => Hq(c[0], c[1])), hMin = Math.min(...hs), hMax = Math.max(...hs);
    if (hMin < WL + 0.5 || hMax - hMin > 5.6) { ST.steep++; continue; }
    let bad = false;                                                // vielas: nenhuma casa em cima do caminho (margem = meia-largura)
    for (let a = -1; a <= 1 && !bad; a++) for (let b = -1; b <= 1 && !bad; b++) { const l = aHash.get(ak(x + a * 4, z + b * 4)); if (l) for (const p of l) if (inObb(H, p[0], p[1], AHW + 0.12)) { bad = true; break; } }
    if (bad) { ST.alley++; continue; }
    const gap = R(0.3, 0.95); for (const o of housesNear(x, z)) if (obbOverlap(H, o, gap)) { bad = true; break; }
    if (bad) { ST.overlap++; continue; }
    if (cs.some(c => roadD(c[0], c[1]) < FAV_ROAD_HW + 1.3)) { ST.road++; continue; }
    ST.ok++;
    const hf = clamp((Hq(x, z) - 2) / 40, 0, 1), floors = clamp(1 + Math.floor(R(0, 1.25) + hf * 1.0 + m * m * (F.city === 'rj' ? 1.1 : 0.55)), 1, F.city === 'rj' ? 5 : 4), brick = fr() < 0.45, yTop = hMax + 0.12 + floors * 2.8;
    Object.assign(H, { y0: hMin, top: yTop, floors, flat: false });
    placed.push(H); addH(H); entBegin('casa-favela', 'Casa (favela)', x, z);   // cada casa é uma entidade editável
    const col = brick ? hexRGB(pickOf([0xffffff, 0xf2e2d6, 0xe9cfc0])) : hexRGB(pickOf(PAINT));
    // pavimento de cima recuado e deslocado (puxadinho): silhueta irregular, não um cubo
    let uW = W, uD = D, uOX = 0, uOZ = 0, yLow = yTop;
    if (floors >= 2 && fr() < 0.55) { yLow = yTop - 2.8; uW = W * R(0.55, 0.92); uD = D * R(0.55, 0.92); uOX = R(-(W - uW) / 2, (W - uW) / 2); uOZ = R(-(D - uD) / 2, (D - uD) / 2); }
    walls[brick ? 1 : 0].box(x, hMin - 0.5, z, W, yLow - hMin + 0.5, D, col, { tile: [3.2, 2.8], u0: fr(), top: false, yaw });
    if (yLow < yTop) { const up = rot(H, uOX, uOZ); const bk2 = fr() < 0.5; walls[bk2 ? 1 : 0].box(up[0], yLow, up[1], uW, yTop - yLow, uD, bk2 ? hexRGB(pickOf([0xffffff, 0xf2e2d6])) : hexRGB(pickOf(PAINT)), { tile: [3.2, 2.8], u0: fr(), top: false, yaw });
      rbox(H, 0, 0, yLow - 0.02, W + 0.3, 0.2, D + 0.3, hexRGB(0x9a9a94)); }
    { const sq = Math.min(W, D) * 0.98, nl = Math.max(1, Math.ceil(Math.max(W, D) / sq)), longX = W >= D; for (let k = 0; k < nl; k++) { const off = (k + 0.5 - nl / 2) * (Math.max(W, D) / nl), p = longX ? rot(H, off, 0) : rot(H, 0, off), r = sq / 2; addCollider({ x0: p[0] - r, x1: p[0] + r, z0: p[1] - r, z1: p[1] + r, h: yTop - hMin + 0.6 }); } }   // colisão: fileira de quadrados ao longo do lado maior
    const RH = yLow < yTop ? { x: rot(H, uOX, uOZ)[0], z: rot(H, uOX, uOZ)[1], yaw, cy, sy, w: uW, d: uD } : H, RW = uW, RD = uD;
    if (fr() < 0.55) {                                              // laje com platibanda, caixa d'água e antena
      H.flat = true; H.top = yTop; rbox(RH, 0, 0, yTop - 0.02, RW + 0.3, 0.26, RD + 0.3, hexRGB(0x9a9a94));
      for (const [sx, sz, lw, ld] of [[0, -1, RW + 0.3, 0.14], [0, 1, RW + 0.3, 0.14], [-1, 0, 0.14, RD + 0.3], [1, 0, 0.14, RD + 0.3]]) rbox(RH, sx * (RW + 0.3) / 2, sz * (RD + 0.3) / 2, yTop + 0.24, lw, 0.3, ld, hexRGB(0xa8a8a2));
      if (fr() < 0.5) { const p = rot(RH, R(-RW / 3, RW / 3), R(-RD / 3, RD / 3)); tanks.push([p[0], yTop + 0.24, p[1]]); }
      if (fr() < 0.35) { const p = rot(RH, R(-RW / 3, RW / 3), R(-RD / 3, RD / 3)); dishes.push([p[0], yTop + 0.24, p[1]]); }
      if (fr() < 0.2) rbox(RH, R(-RW / 5, RW / 5), R(-RD / 5, RD / 5), yTop + 0.24, RW * 0.5, 2.3, RD * 0.5, hexRGB(pickOf(PAINT)));
      if (fr() < 0.16) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rbox(RH, sx * (RW / 2 - 0.2), sz * (RD / 2 - 0.2), yTop + 0.24, 0.12, 1.4, 0.12, hexRGB(0x5a4a3a));     // vergalhões da próxima laje
    } else flat.gable(RH.x, yTop, RH.z, RW + 0.5, RD + 0.5, R(0.9, 1.6), hexRGB(fr() < 0.5 ? pickOf(TERRA) : pickOf(ZINC)), yaw, RW < RD ? false : true);
    entEnd();
  }
  FAVELA.houseAt = (x, z, m) => { for (const h of housesNear(x, z)) if (inObb(h, x, z, m || 0)) return h; return null; };
  walls.forEach((w, i) => scene.add(farCullAdd(w.build(wallMats[i]))));

  /* --- piso das vielas (concreto) e escadarias nos trechos íngremes --- */
  {
    const conc = hexRGB(0x8d8b84), concD = hexRGB(0x77756f);
    for (const al of FAVELA.alleys) {
      const n = al.length, L = [], Rr = [];
      for (let i = 0; i < n; i++) {
        const a = al[Math.max(0, i - 1)], b = al[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        L.push([al[i][0] + nx * AHW * 0.92, al[i][1] + nz * AHW * 0.92]); Rr.push([al[i][0] - nx * AHW * 0.92, al[i][1] - nz * AHW * 0.92]);
      }
      for (let i = 0; i < n - 1; i++) {
        const hq = p => Hq(p[0], p[1]) + 0.06, a = [L[i][0], hq(L[i]), L[i][1]], b = [L[i + 1][0], hq(L[i + 1]), L[i + 1][1]], c = [Rr[i + 1][0], hq(Rr[i + 1]), Rr[i + 1][1]], d = [Rr[i][0], hq(Rr[i]), Rr[i][1]];
        paving.quad(a, d, c, b, 0, 1, 0, i % 2 ? conc : concD);
      }
      for (let i = 0; i < n - 1; i++) {                             // escadas: onde a inclinação ao longo da viela passa de ~20%
        const p = al[i], q = al[i + 1], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz), sl = Math.abs(Hq(q[0], q[1]) - Hq(p[0], p[1])) / len;
        if (sl < 0.2) continue;
        const yaw = Math.atan2(-dz, dx), steps = Math.ceil(len / 0.36);
        for (let k = 0; k < steps; k++) { const t = (k + 0.5) / steps, x = p[0] + dx * t, z = p[1] + dz * t, top = Math.round(Hq(x, z) / 0.18) * 0.18 + 0.05; paving.box(x, top - 0.5, z, 0.4, 0.5, AHW * 1.8, k % 2 ? hexRGB(0xa09d95) : hexRGB(0x93908a), { yaw }); }
      }
    }
    scene.add(farCullAdd(paving.build(propMat, false)));
  }
  scene.add(farCullAdd(flat.build(propMat)));
  {                                                                 // caixas d'água azuis e antenas
    const m = new THREE.Matrix4();
    const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 1.05, 10).translate(0, 0.52, 0), new THREE.MeshLambertMaterial({ color: 0x2e7bc4 }), Math.max(1, tanks.length));
    tanks.forEach((t, i) => { m.makeTranslation(t[0], t[1], t[2]); tm.setMatrixAt(i, m); }); tm.count = tanks.length; tm.castShadow = true; tm.frustumCulled = false; scene.add(tm); farCullAdd(tm);
    const dm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.45, 0.22, 12).rotateX(-1.1).translate(0, 1.0, 0), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }), Math.max(1, dishes.length));
    dishes.forEach((t, i) => { m.makeTranslation(t[0], t[1], t[2]); dm.setMatrixAt(i, m); }); dm.count = dishes.length; dm.frustumCulled = false; scene.add(dm); farCullAdd(dm);
  }
  {                                                                 // postes de madeira nas vielas e fios (entre postes e entre lajes)
    const props0 = new Mesher(), pts = [], poles = [];
    FAVELA.alleys.forEach((al, ai) => { for (let i = 3; i < al.length - 1; i += 5) { const a = al[i - 1], b = al[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l, s = (ai + i) % 2 ? 1 : -1, x = al[i][0] + nx * s * (AHW - 0.25), z = al[i][1] + nz * s * (AHW - 0.25); poles.push({ x, z, y: Hq(x, z), al: ai, i }); } });
    poles.forEach(p => { props0.cyl(p.x, p.y, p.z, 0.1, 6.6, hexRGB(0x5b4a3a), 6); props0.box(p.x, p.y + 6.0, p.z, 1.1, 0.08, 0.08, hexRGB(0x5b4a3a)); addRound(p.x, p.z, 0.14); });
    const sag = d => -Math.sin(d * Math.PI) * 0.45;
    for (let a = 0; a < poles.length; a++) for (let b = a + 1; b < poles.length; b++) { const p = poles[a], q = poles[b]; if (p.al !== q.al || q.i - p.i !== 5) continue; for (let w = -1; w <= 1; w++) for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4; pts.push(lerp(p.x, q.x, t0), lerp(p.y + 6.0, q.y + 6.0, t0) + sag(t0), lerp(p.z, q.z, t0) + w * 0.12, lerp(p.x, q.x, t1), lerp(p.y + 6.0, q.y + 6.0, t1) + sag(t1), lerp(p.z, q.z, t1) + w * 0.12); } }
    const hs = placed.filter(h => h.flat);
    for (let k = 0; k < 360 && hs.length > 3; k++) {
      const a = pickOf(hs), cands = housesNear(a.x, a.z).filter(b => b !== a && b.flat && Math.hypot(b.x - a.x, b.z - a.z) > 5 && Math.hypot(b.x - a.x, b.z - a.z) < 20); if (!cands.length) continue;
      const b = pickOf(cands), ax = a.x + R(-1, 1), az = a.z + R(-1, 1), bx = b.x + R(-1, 1), bz = b.z + R(-1, 1), ay = a.top + 0.9, by = b.top + 0.9, sg = d => -Math.sin(d * Math.PI) * 0.9;
      for (let q = 0; q < 4; q++) { const t0 = q / 4, t1 = (q + 1) / 4; pts.push(lerp(ax, bx, t0), lerp(ay, by, t0) + sg(t0), lerp(az, bz, t0), lerp(ax, bx, t1), lerp(ay, by, t1) + sg(t1), lerp(az, bz, t1)); }
    }
    scene.add(farCullAdd(props0.build(propMat)));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x15151a })); lines.frustumCulled = false; scene.add(lines); farCullAdd(lines);
  }

  /* --- quadra de futebol/praça no fim da ladeira --- */
  const props = new Mesher();
  {
    const cv = mkCanvas(512, 320), g = cv.getContext('2d'); g.fillStyle = '#2f6f58'; g.fillRect(0, 0, 512, 320); g.strokeStyle = '#f2f2f2'; g.lineWidth = 5; g.strokeRect(14, 14, 484, 292); g.beginPath(); g.moveTo(256, 14); g.lineTo(256, 306); g.stroke(); g.beginPath(); g.arc(256, 160, 46, 0, 7); g.stroke(); g.strokeRect(14, 100, 70, 120); g.strokeRect(428, 100, 70, 120);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(22, 13.8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: toTex(cv, false) })); court.position.set(plaza.x, plaza.y + 0.1, plaza.z); court.receiveShadow = true; scene.add(court);
    props.box(plaza.x, plaza.y - 0.4, plaza.z, 28, 0.5, 20, hexRGB(0x9b988f));
    for (const sx of [-1, 1]) { const gx = plaza.x + sx * 11; props.box(gx, plaza.y, plaza.z - 1.8, 0.1, 2.2, 0.1, [1, 1, 1]); props.box(gx, plaza.y, plaza.z + 1.8, 0.1, 2.2, 0.1, [1, 1, 1]); props.box(gx, plaza.y + 2.1, plaza.z, 0.1, 0.1, 3.7, [1, 1, 1]); }
    for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) PROP.bench(props, plaza.x - 6 + k * 6, plaza.y + 0.1, plaza.z + sz * 9.2, sz > 0 ? Math.PI : 0);
  }

  /* --- pessoas e cenas (viram NPCs perto do jogador) --- */
  const spot = (t, x, z, h, o) => npcSpots.push(Object.assign({ t, x, z, h, area: 'fav', n: 1 }, o || {}));
  const alleyFrame = (al, i) => { const a = al[Math.max(0, i - 1)], b = al[Math.min(al.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, nx: -(b[1] - a[1]) / l, nz: (b[0] - a[0]) / l }; };
  {                                                                 // boteco: a casa mais próxima da quadra vira bar, com mesas e cadeiras
    let bar = null, bd = 1e9; for (const h of placed) { const d = Math.hypot(h.x - plaza.x, h.z - plaza.z); if (d > plaza.rx * 1.3 && d < bd) { bd = d; bar = h; } }
    if (bar) {
      const dx = plaza.x - bar.x, dz = plaza.z - bar.z, dl = Math.hypot(dx, dz) || 1, fx = dx / dl, fz = dz / dl, seats = [], big = Math.max(bar.w, bar.d) / 2, ox = bar.x + fx * (big + 1.6), oz = bar.z + fz * (big + 1.6);
      for (let k = 0; k < 2; k++) { const tx = ox - fz * (k - 0.5) * 2.6, tz = oz + fx * (k - 0.5) * 2.6, gy = Hq(tx, tz); PROP.table(props, tx, gy, tz, 0.8, 0.8, hexRGB(0xc7312a)); for (const sg of [1, -1]) { const cx = tx + fx * 0.78 * sg, cz = tz + fz * 0.78 * sg, yaw = Math.atan2(-fx * sg, -fz * sg); PROP.chair(props, cx, gy, cz, yaw); seats.push({ x: cx, z: cz, h: yaw, y: gy }); } }
      PROP.cooler(props, bar.x + fx * (big + 0.5), Hq(bar.x, bar.z), bar.z + fz * (big + 0.5), 0, [0.95, 0.95, 0.98]);
      spot('drink', ox, oz, Math.atan2(-fx, -fz), { n: 4, spread: 2.6, seats });
    }
  }
  {                                                                 // quadra: dança, dominó, conversa
    const gy = plaza.y; PROP.speaker(props, plaza.x + 8, gy, plaza.z - 8.6, 0.4); PROP.speaker(props, plaza.x + 9.2, gy, plaza.z - 8.2, -0.3); PROP.cooler(props, plaza.x + 7, gy, plaza.z - 9, 0.3);
    spot('dance', plaza.x + 6, plaza.z - 6.5, 0, { n: 5, spread: 2.8, y: gy });
    for (let k = 0; k < 2; k++) { const px = plaza.x - 9 + k * 4.5, pz = plaza.z + 7.6, seats = []; PROP.table(props, px, gy, pz, 0.9, 0.9); for (const [dx, dz] of [[0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]]) { PROP.stool(props, px + dx, gy, pz + dz, hexRGB(0x3a6ea5)); seats.push({ x: px + dx, z: pz + dz, h: Math.atan2(-dx, -dz), y: gy }); } spot('domino', px, pz, 0, { n: 4, seats }); }
    spot('chat', plaza.x - 8, plaza.z - 7, 1, { n: 3, y: gy }); spot('chat', plaza.x + 2, plaza.z + 5, 3, { n: 2, y: gy });
  }
  {                                                                 // vigias nas curvas fechadas da ladeira
    const hair = []; for (let i = 6; i < ring.length - 6; i++) { const a = ring[i - 5], b = ring[i + 5]; if (a.tx * b.tx + a.tz * b.tz < -0.2) hair.push(i); }
    let lastI = -99, cnt = 0; for (const i of hair) if (i - lastI > 24 && cnt < 4) { lastI = i; const q = ring[i], px = q.c[0] + q.nx * (FAV_ROAD_HW + 1.8), pz = q.c[1] + q.nz * (FAV_ROAD_HW + 1.8); if (!FAVELA.houseAt(px, pz, 0.6)) { spot('watch', px, pz, 0, { n: 1 }); cnt++; } }
  }
  for (let k = 0; k < 3; k++) {                                     // barraquinhas de rua na ladeira
    const idx = 14 + k * 33, q = ring[idx]; if (!q) continue; const off = (k % 2 ? -1 : 1) * (FAV_ROAD_HW + 2.3), px = q.c[0] + q.nx * off, pz = q.c[1] + q.nz * off;
    if (FAVELA.houseAt(px, pz, 1.2)) continue; PROP.stand(props, px, Hq(px, pz), pz, Math.atan2(q.nx, q.nz), hexRGB(pickOf([0xe0a800, 0xd23b2e, 0x2e7bc4]))); spot('vendor', px, pz, 0, { n: 1 });
  }
  const alleyPts = []; FAVELA.alleys.forEach((al, ai) => al.forEach((p, i) => { if (i > 1 && i < al.length - 1) alleyPts.push([ai, i]); }));
  for (const [t, cnt] of [['lean', 14], ['smoker', 6], ['sit', 8], ['chat', 12], ['beggar', 1]]) for (let k = 0, tries = 0; k < cnt && tries < cnt * 30 && alleyPts.length; tries++) {   // gente nas vielas
    const [ai, i] = pickOf(alleyPts), al = FAVELA.alleys[ai], p = al[i], f = alleyFrame(al, i);
    if (t === 'chat') { const q = al[Math.min(al.length - 1, i + 1)]; if (Math.abs(Hq(q[0], q[1]) - Hq(p[0], p[1])) > 0.5) continue; spot('chat', p[0], p[1], R(0, 6.28), { n: 2 + (fr() < 0.4 ? 1 : 0), spread: 0.62 }); k++; continue; }
    for (const sg of [1, -1]) {
      const wx = p[0] + f.nx * sg * (AHW + 0.22), wz = p[1] + f.nz * sg * (AHW + 0.22); if (!FAVELA.houseAt(wx, wz, 0)) continue;
      const ox = p[0] + f.nx * sg * (AHW - 0.5), oz = p[1] + f.nz * sg * (AHW - 0.5), face = Math.atan2(-f.nx * sg, -f.nz * sg);
      if (t === 'sit') { const gy = Hq(ox, oz); if (fr() < 0.5) PROP.stool(props, ox, gy, oz, hexRGB(pickOf([0xd23b2e, 0x2e7bc4, 0xe0a800]))); else PROP.chair(props, ox, gy, oz, face); spot('sit', ox, oz, face, { n: 1 }); }
      else spot(t, ox, oz, face, { n: 1 });
      k++; break;
    }
  }
  scene.add(farCullAdd(props.build(propMat)));

  /* --- grafo de caminhos (ladeira + vielas): policiais e moradores andam por ele sem atravessar casas --- */
  {
    const nodes = [], polyOf = [], hash = new Map(), hkey = (x, z) => Math.floor(x / 5) + ',' + Math.floor(z / 5);
    const add = (x, z, poly) => { const id = nodes.length; nodes.push({ x, z, nb: [] }); polyOf.push(poly); const k = hkey(x, z); (hash.get(k) || hash.set(k, []).get(k)).push(id); return id; };
    const link = (a, b) => { if (a !== b && !nodes[a].nb.includes(b)) { nodes[a].nb.push(b); nodes[b].nb.push(a); } };
    let prev = -1; FAV_ROAD.forEach((p, i) => { if (i % 2) return; const id = add(p[0], p[1], -1); if (prev >= 0) link(prev, id); prev = id; });
    FAVELA.alleys.forEach((al, ai) => { let pv = -1; al.forEach(p => { const id = add(p[0], p[1], ai); if (pv >= 0) link(pv, id); pv = id; }); });
    for (let a = 0; a < nodes.length; a++) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { const l = hash.get(hkey(nodes[a].x + ox * 5, nodes[a].z + oz * 5)); if (l) for (const b of l) if (b > a && polyOf[a] !== polyOf[b] && Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) < 3.4) link(a, b); }
    const nearest = (x, z) => { let best = -1, bd = 1e9; for (let ox = -3; ox <= 3; ox++) for (let oz = -3; oz <= 3; oz++) { const l = hash.get(hkey(x + ox * 5, z + oz * 5)); if (l) for (const id of l) { const d = Math.hypot(nodes[id].x - x, nodes[id].z - z); if (d < bd) { bd = d; best = id; } } } return best; };
    FAVELA.graph = { nodes, nearest };
    FAVELA.walk = nodes.filter((n, i) => i % 3 === 0).map(n => [n.x, n.z]);
    FAVELA.path = function (sx, sz, tx, tz) {                       // BFS entre dois pontos do mundo: devolve os pontos a seguir (ou null)
      const a = nearest(sx, sz), b = nearest(tx, tz); if (a < 0 || b < 0) return null;
      const prevN = new Int32Array(nodes.length).fill(-2); prevN[a] = -1; const q = [a]; let qi = 0;
      while (qi < q.length) { const c = q[qi++]; if (c === b) break; for (const n of nodes[c].nb) if (prevN[n] === -2) { prevN[n] = c; q.push(n); } }
      if (prevN[b] === -2) return null; const path = []; for (let c = b; c !== -1; c = prevN[c]) path.push([nodes[c].x, nodes[c].z]); return path.reverse();
    };
  }
  FAVELAS.push(FAVELA);
  console.info('Favela', F.name + ':', placed.length, 'casas,', FAVELA.alleys.length, 'vielas,', tanks.length, "caixas d'agua,", npcSpots.filter(s => s.area === 'fav').length, 'cenas');
  return FAVELA;
}
for (const F of FAVS) buildFavela(F);
const FAVELA = FAVELAS[0];
/* favela mais próxima de um ponto (para polícia e NPCs) */
const favelaAt = (x, z) => { const F = favAt(x, z); return FAVELAS.find(v => v.F === F) || FAVELA; };
/* a ladeira também é asfalto para os pneus */
function onFavelaRoad(x, z) { for (const F of FAVS) if (favDist(F, x, z) < F.R * 1.9 && favRoadNearF(F, x, z).d < FAV_ROAD_HW + 0.6) return true; return false; }
