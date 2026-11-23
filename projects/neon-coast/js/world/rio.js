/* NEON COAST — Via Dutra (rodovia entre São Paulo e Rio) e o Rio de Janeiro: orla com calçadão de ondas, quiosques e postos de salva-vidas,
   o Cristo Redentor no alto do Corcovado e o bondinho do Pão de Açúcar.
   Os prédios do Rio saem do mesmo construtor da cidade (city.js, LAYOUT_RJ); os morros com favela, de favela.js. */
'use strict';
const RIO_PROPS = new Mesher();
(function buildHighway() {
  const y = x => hwyH(x) + 0.12, x0 = HWY.x0 + RW / 2, x1 = HWY.x1 - RW / 2, step = 6, z = HWY.z;
  /* pista: faixa de asfalto colada ao perfil, com acostamento */
  const strip = (hw, yo, mat, vrep) => {
    const pos = [], uv = [], nor = [], idx = []; let k = 0;
    for (let x = x0; x <= x1 + 0.01; x += step) { for (const sd of [-1, 1]) { pos.push(x, y(x) + yo, z + sd * hw); nor.push(0, 1, 0); uv.push(sd < 0 ? 0 : 1, (x - x0) / vrep); } if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); } k++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
  };
  const am = new THREE.MeshLambertMaterial({ map: roadTexture('assets/world/roadnew4_256.png', 1) }); am.map.repeat.set(2, 1);
  strip(RW / 2 + 1.2, 0, am, 9);
  const dt = dashTex.clone(); dt.needsUpdate = true; dt.repeat.set(1, 1);
  const dashM = new THREE.MeshBasicMaterial({ map: dt, transparent: true }), yel = new THREE.MeshBasicMaterial({ color: 0xe8c93a }), wht = new THREE.MeshBasicMaterial({ color: 0xeeeeea });
  for (const off of [-0.25, 0.25]) { const m = strip(0.09, 0.03, yel, 9); m.position.z = off; }          // faixa dupla amarela no meio
  for (const off of [-8.3, 8.3]) { const m = strip(0.1, 0.03, wht, 9); m.position.z = off; }           // bordas
  /* defensas metálicas dos dois lados, postes de luz e placas */
  const rail = hexRGB(0xb9bec4), post = hexRGB(0x7c8288);
  for (let x = x0; x < x1; x += 4) for (const sd of [-1, 1]) {
    const zz = z + sd * (RW / 2 + 0.9), yy = hwyH(x + 2) + 0.12;
    RIO_PROPS.box(x + 2, yy + 0.45, zz, 4.05, 0.32, 0.12, rail); RIO_PROPS.box(x, yy, zz, 0.14, 0.75, 0.14, post);
  }
  for (const sd of [-1, 1]) for (let x = x0; x < x1; x += 37) addCollider({ x0: x, x1: Math.min(x1, x + 37), z0: z + sd * (RW / 2 + 0.9) - 0.15, z1: z + sd * (RW / 2 + 0.9) + 0.15, h: 1.2 });
  const lamps = []; for (let x = x0 + 30, k = 0; x < x1 - 20; x += 64, k++) lamps.push([x, z + (k % 2 ? 1 : -1) * (RW / 2 + 1.6)]);
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 6).translate(0, 4.5, 0), poleMat, lamps.length), hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.18, 0.5).translate(0, 9.1, 0), lampMat, lamps.length), m4 = new THREE.Matrix4();
  lamps.forEach((p, i) => { m4.makeTranslation(p[0], hwyH(p[0]), p[1]); pm.setMatrixAt(i, m4); hm.setMatrixAt(i, m4); addRound(p[0], p[1], 0.3); });
  pm.frustumCulled = hm.frustumCulled = false; scene.add(pm, hm);
  /* pórticos com placas verdes */
  function gantry(x, lines, facing) {
    const yy = hwyH(x) + 0.12, cv = mkCanvas(512, 160), g = cv.getContext('2d');
    g.fillStyle = '#0b6b3a'; g.fillRect(0, 0, 512, 160); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 144); g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 44px Arial'; g.fillText(lines[0], 256, 70); g.font = 'bold 32px Arial'; g.fillText(lines[1], 256, 122);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshLambertMaterial({ map: toTex(cv, false), side: THREE.DoubleSide }));
    sign.position.set(x, yy + 7.6, z - facing * 4.2); sign.rotation.y = facing > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(sign);
    for (const sd of [-1, 1]) { RIO_PROPS.box(x, yy, z + sd * (RW / 2 + 1.4), 0.4, 9.2, 0.4, hexRGB(0x8a9096)); addRound(x, z + sd * (RW / 2 + 1.4), 0.3); }
    RIO_PROPS.box(x, yy + 9, z, 0.5, 0.5, RW + 3.2, hexRGB(0x8a9096));
  }
  gantry(x0 + 80, ['RIO DE JANEIRO', 'Via Dutra  →  ' + Math.round((HWY.x1 - HWY.x0) / 100) / 10 + ' km'], 1);
  gantry(x1 - 80, ['SÃO PAULO', '←  Via Dutra'], -1);
  /* praça de pedágio no meio do caminho: cabines no canteiro e nos acostamentos, cobertura */
  {
    const xm = Math.round((x0 + x1) / 2), yy = hwyH(xm) + 0.12;
    for (const zz of [z, z - 9.3, z + 9.3]) { RIO_PROPS.box(xm, yy, zz, 4.5, 2.6, 1.6, hexRGB(0xe9e6df)); RIO_PROPS.box(xm, yy + 2.6, zz, 4.8, 0.2, 1.9, hexRGB(0xd23b2e)); addCollider({ x0: xm - 2.25, x1: xm + 2.25, z0: zz - 0.8, z1: zz + 0.8, h: 3 }); }
    RIO_PROPS.box(xm, yy + 6.2, z, 14, 0.6, RW + 4, hexRGB(0xf2c500)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) RIO_PROPS.box(xm + sx * 6, yy, z + sz * (RW / 2 + 1.6), 0.5, 6.2, 0.5, hexRGB(0x9a9a94));
    const cv = mkCanvas(512, 96), g = cv.getContext('2d'); g.fillStyle = '#f2c500'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#1b1d21'; g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.fillText('PEDÁGIO', 256, 70);
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshLambertMaterial({ map: toTex(cv, false) })); p.position.set(xm + sd * 7.05, yy + 6.2, z); p.rotation.y = sd * Math.PI / 2; scene.add(p); }
  }
})();

/* ---------------- orla do Rio ---------------- */
(function buildRioBeach() {
  const z0 = RJ.z1, wCal = 8, xA = RJ.x0 - 10, xB = RJ.x1 + 40;
  /* calçadão com o desenho de ondas (pedra portuguesa preta e branca) */
  const cv = mkCanvas(256, 256), g = cv.getContext('2d'); g.fillStyle = '#efeee8'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#2b2b2e';
  for (let band = 0; band < 2; band++) { g.beginPath(); for (let x = 0; x <= 256; x += 4) { const y = band * 128 + 64 + 34 * Math.sin(x / 256 * Math.PI * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); } for (let x = 256; x >= 0; x -= 4) { const y = band * 128 + 64 + 34 * Math.sin(x / 256 * Math.PI * 2) + 30; g.lineTo(x, y); } g.closePath(); g.fill(); }
  const tex = toTex(cv, true); tex.repeat.set((xB - xA) / 8, 1);
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(xB - xA, wCal).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
  cal.position.set((xA + xB) / 2, 0.1, z0 + wCal / 2); cal.receiveShadow = true; scene.add(cal);
  RIO_PROPS.box((xA + xB) / 2, 0, z0 + wCal + 0.15, xB - xA, 0.3, 0.3, hexRGB(0xd9d2c0));            // mureta entre o calçadão e a areia
  const rs = mulberry32(2016), R = (a, b) => a + (b - a) * rs(), pk = a => a[Math.floor(rs() * a.length)];
  const spot = (t, x, z, h, o) => npcSpots.push(Object.assign({ t, x, z, h, area: 'beach', n: 1 }, o || {}));
  const lamps = [];
  for (let x = xA + 6; x < xB; x += 22) { palmSpots.push([x + R(-2, 2), z0 + wCal + 2.2, R(1.0, 1.35), 0.3]); if (((x - xA) / 22 | 0) % 2) lamps.push([x + 11, z0 + 1]); }
  // quiosques, postos de salva-vidas, guarda-sóis, cadeiras, rede de vôlei e gente na praia
  let posto = 1;
  for (let x = xA + 50; x < xB - 30; x += 95) {
    const sz = RIO.beachZ(x), kz = z0 + wCal + 7;
    RIO_PROPS.box(x, 0, kz, 4.2, 2.8, 3.2, hexRGB(0xf2f0e6)); RIO_PROPS.box(x, 2.8, kz, 5.6, 0.25, 4.6, hexRGB(pk([0x2e7bc4, 0xe0a800, 0xd23b2e, 0x1f8a5a]))); addCollider({ x0: x - 2.1, x1: x + 2.1, z0: kz - 1.6, z1: kz + 1.6, h: 3 });
    for (let k = 0; k < 4; k++) { const tx = x + R(-7, 7), tz = kz + R(3.5, 6); PROP.table(RIO_PROPS, tx, Hq(tx, tz), tz, 0.8, 0.8, hexRGB(0xe9e6df)); PROP.umbrella(RIO_PROPS, tx, Hq(tx, tz), tz, hexRGB(pk([0xe0a800, 0xd23b2e, 0x2e7bc4]))); }
    spot('drink', x, kz + 4.5, Math.PI, { n: 4, spread: 4 }); spot('vendor', x + 2.6, kz - 1.8, Math.PI, { n: 1 });
    // posto de salva-vidas a cada dois quiosques
    if ((posto++ % 2) === 0) { const pz = (kz + sz) / 2 + 4; RIO_PROPS.box(x + 30, Hq(x + 30, pz), pz, 3, 2.6, 3, hexRGB(0xf2f2ee)); RIO_PROPS.box(x + 30, Hq(x + 30, pz) + 2.6, pz, 3.6, 0.3, 3.6, hexRGB(0xd23b2e)); addCollider({ x0: x + 28.5, x1: x + 31.5, z0: pz - 1.5, z1: pz + 1.5, h: 3 }); }
    for (let k = 0; k < 7; k++) {                                   // guarda-sóis com cangas/cadeiras perto da água
      const ux = x + R(-40, 40), uz = R(kz + 12, sz - 8); if (Hq(ux, uz) < WL + 0.2) continue;
      PROP.umbrella(RIO_PROPS, ux, Hq(ux, uz), uz, hexRGB(pk([0xe0a800, 0xd23b2e, 0x2e7bc4, 0xf2f2f2, 0x1f8a5a]))); PROP.lounger(RIO_PROPS, ux + 1.1, Hq(ux, uz), uz + 0.6, R(0, 6.28));
      if (rs() < 0.7) spot('lay', ux + 1.1, uz + 0.6, R(0, 6.28), { y: Hq(ux, uz) });
      if (rs() < 0.4) spot('chat', ux - 1.6, uz + 1.2, R(0, 6.28), { n: 2, y: Hq(ux, uz) });
    }
    if (rs() < 0.45) { const vx = x + 45, vz = (kz + sz) / 2; for (const sd of [-1, 1]) RIO_PROPS.cyl(vx, Hq(vx, vz + sd * 4.5), vz + sd * 4.5, 0.06, 2.45, [0.9, 0.9, 0.9], 6); RIO_PROPS.box(vx, Hq(vx, vz) + 1.5, vz, 0.05, 0.9, 9, [0.95, 0.95, 0.95]); spot('dance', vx + 3, vz, 0, { n: 3, spread: 3 }); }
  }
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6).translate(0, 3.5, 0), poleMat, lamps.length), hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.18, 0.45).translate(0, 7.1, 0), lampMat, lamps.length), m4 = new THREE.Matrix4();
  lamps.forEach((p, i) => { m4.makeTranslation(p[0], 0.1, p[1]); pm.setMatrixAt(i, m4); hm.setMatrixAt(i, m4); addRound(p[0], p[1], 0.25); });
  pm.frustumCulled = hm.frustumCulled = false; scene.add(pm, hm);
})();

/* ---------------- Cristo Redentor no topo do Corcovado ---------------- */
worldEntity('cristo', 'Cristo Redentor', RIO.corcovado.x, RIO.corcovado.z, function buildCristo() {
  const C = RIO.corcovado; let bx = C.x, bz = C.z, by = -1e9;
  for (let a = -40; a <= 40; a += 4) for (let b = -40; b <= 40; b += 4) { const h = Hq(C.x + a, C.z + b); if (h > by) { by = h; bx = C.x + a; bz = C.z + b; } }
  const stone = new THREE.MeshLambertMaterial({ color: 0xd9d5cb }), g = new THREE.Group(), add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, stone); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(14, 3, 14), 0, 1.5, 0); add(new THREE.BoxGeometry(7, 8, 7), 0, 7, 0);                 // mirante e pedestal
  add(new THREE.CylinderGeometry(2.7, 4.0, 19, 12), 0, 20.5, 0);                                                    // túnica
  add(new THREE.BoxGeometry(5.6, 5, 3.4), 0, 31.5, 0);                                                              // peito e ombros
  add(new THREE.BoxGeometry(30, 2.4, 2.6), 0, 32.6, 0);                                                             // braços abertos
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(1.6, 1.9, 1.4), sx * 15.6, 32.4, 0);                          // mãos
  add(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 10), 0, 34.6, 0);                                                   // pescoço
  add(new THREE.SphereGeometry(1.7, 14, 12), 0, 36.6, 0);                                                           // cabeça
  g.position.set(bx, by - 0.5, bz); g.rotation.y = Math.atan2(RJ.cx - bx, RJ.cz - bz) - Math.PI / 2; scene.add(g);     // de braços abertos para a cidade
  addCollider({ x0: bx - 7, x1: bx + 7, z0: bz - 7, z1: bz + 7, h: 40 });
  RIO.cristo = { x: bx, y: by, z: bz };
}, 'cristo');

/* ---------------- bondinho do Pão de Açúcar ---------------- */
worldEntity('bondinho', 'Bondinho do Pão de Açúcar', RIO.paoAcucar.x, RIO.paoAcucar.z, function buildBondinho() {
  const top = R => { let b = -1e9, px = R.x, pz = R.z; for (let a = -12; a <= 12; a += 3) for (let c = -12; c <= 12; c += 3) { const h = Hq(R.x + a, R.z + c); if (h > b) { b = h; px = R.x + a; pz = R.z + c; } } return [px, b, pz]; };
  const U = top(RIO.urca), Pq = top(RIO.paoAcucar), shore = [RJ.x1 - 20, 8, RJ.z1 + 30];
  for (const [p, h] of [[U, 7], [Pq, 7], [shore, 7]]) { RIO_PROPS.box(p[0], p[1] - 0.5, p[2], 6, h + 0.5, 5, hexRGB(0xc9c4b8)); }
  const pts = [], seg = (a, b) => { for (const off of [-0.6, 0.6]) for (let k = 0; k < 12; k++) { const t0 = k / 12, t1 = (k + 1) / 12, s0 = -Math.sin(t0 * Math.PI) * 4, s1 = -Math.sin(t1 * Math.PI) * 4; pts.push(lerp(a[0], b[0], t0), lerp(a[1], b[1], t0) + 6 + s0, lerp(a[2], b[2], t0) + off, lerp(a[0], b[0], t1), lerp(a[1], b[1], t1) + 6 + s1, lerp(a[2], b[2], t1) + off); } };
  seg(shore, U); seg(U, Pq);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x222226 })); lines.frustumCulled = false; scene.add(lines);
  // as duas cabines vão e voltam (anima sozinha antes de desenhar)
  const cabMat = new THREE.MeshLambertMaterial({ color: 0xd8462e });
  [[shore, U, 0], [U, Pq, 0.5]].forEach(([a, b, ph]) => {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.4), cabMat); cab.castShadow = true; scene.add(cab);
    const upd = () => { const t = 0.5 - 0.5 * Math.cos((performance.now() / 1000 / 40 + ph) * Math.PI * 2), s = -Math.sin(t * Math.PI) * 4; cab.position.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t) + 6 + s - 1.6, lerp(a[2], b[2], t)); };
    upd(); cab.onBeforeRender = upd;
  });
}, 'bondinho');

/* placas de boas-vindas nas entradas das cidades */
(function welcomeSigns() {
  const sign = (x, z, yaw, t1, t2, bg) => {
    const cv = mkCanvas(512, 200), g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 512, 200); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 34px Arial'; g.fillText(t1, 256, 70); g.font = 'bold 60px Arial'; g.fillText(t2, 256, 150);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.1), new THREE.MeshLambertMaterial({ map: toTex(cv, false), side: THREE.DoubleSide })); const y = Hq(x, z); m.position.set(x, y + 3.6, z); m.rotation.y = yaw; scene.add(m);
    for (const sd of [-1, 1]) { RIO_PROPS.box(x + Math.cos(yaw) * sd * 3.6, y, z - Math.sin(yaw) * sd * 3.6, 0.25, 3.6, 0.25, hexRGB(0x777777)); addRound(x + Math.cos(yaw) * sd * 3.6, z - Math.sin(yaw) * sd * 3.6, 0.2); }
  };
  sign(RJ.x0 - 40, HWY.z - RW / 2 - 6, Math.PI / 2, 'BEM-VINDO AO', 'RIO DE JANEIRO', '#1a5aa6');
  sign(SP.x1 + 40, HWY.z + RW / 2 + 6, Math.PI / 2, 'BEM-VINDO A', 'SÃO PAULO', '#8a1f2a');
})();
scene.add(RIO_PROPS.build(propMat, true));
