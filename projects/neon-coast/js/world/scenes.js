/* NEON COAST — Cenas do dia a dia na cidade e nas praias (no estilo do mod Urbanize): bancos, orelhões, barracas, rodinhas de conversa,
   gente encostada nas paredes, fumando, tomando sol. Cada cena é só um ponto no mapa; as pessoas aparecem quando o jogador chega perto. */
'use strict';
(function cityScenes() {
  const rs = mulberry32(31337), R = (a, b) => a + (b - a) * rs(), pk = arr => arr[Math.floor(rs() * arr.length)];
  const props = new Mesher(), SLAB = 0.3, RING = 26;
  const spot = (t, x, z, h, o) => npcSpots.push(Object.assign({ t, x, z, h, area: 'city', n: 1 }, o || {}));
  const inBox = (x, z) => { for (const b of nearby(x, z)) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true; return false; };
  const wallDist = (x, z, nx, nz) => { for (let d = 0.3; d < 7; d += 0.3) if (inBox(x - nx * d, z - nz * d)) return d; return -1; };
  const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];                     // normais para fora do quarteirão
  const ringPoint = (cx, cz, s, u) => [s === 1 ? cx + RING : s === 3 ? cx - RING : cx + u, s === 0 ? cz - RING : s === 2 ? cz + RING : cz + u];
  const yawOut = (nx, nz) => Math.atan2(nx, nz);

  for (const C of CITIES) for (let i = C.i0; i < C.i0 + C.ni; i++) for (let j = C.j0; j < C.j0 + C.nj; j++) {
    const cx = blockC(i), cz = blockC(j);
    if (parkSet.has(i + ',' + j)) {
      // praça: bancos em volta do centro virados para ele, gente sentada, conversando e tomando sol
      const nb = 4 + Math.floor(rs() * 2);
      for (let k = 0; k < nb; k++) {
        const a = k / nb * Math.PI * 2 + R(-0.2, 0.2), rad = R(11, 15), x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad, yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
        PROP.bench(props, x, SLAB, z, yaw); if (rs() < 0.75) spot('sit', x, z, yaw, { seatY: SLAB + 0.46, bench: true });
      }
      spot('chat', cx + R(-6, 6), cz + R(-6, 6), R(0, 6.28), { n: 3 });
      if (rs() < 0.6) spot('chat', cx + R(-8, 8), cz + R(-8, 8), R(0, 6.28), { n: 2 });
      if (rs() < 0.5) spot('lay', cx + R(-5, 5), cz + R(-5, 5), R(0, 6.28), { y: SLAB });
      if (rs() < 0.35) { PROP.speaker(props, cx, SLAB, cz, 0); spot('dance', cx + 1.5, cz + 1.5, 0, { n: 3, spread: 2.4 }); }
      continue;
    }
    // gente encostada na parede
    for (let k = 0; k < 2; k++) {
      const s = Math.floor(rs() * 4), [nx, nz] = SIDES[s], p = ringPoint(cx, cz, s, R(-20, 20)), d = wallDist(p[0], p[1], nx, nz);
      if (d < 0.9 || d > 5) continue; const t = pk(['lean', 'lean', 'smoker', 'beggar']);
      spot(t, p[0] - nx * (d - 0.5), p[1] - nz * (d - 0.5), yawOut(nx, nz), { y: SLAB });
    }
    // rodinha de conversa na esquina
    if (rs() < 0.5) { const sx = rs() < 0.5 ? -1 : 1, sz = rs() < 0.5 ? -1 : 1; spot('chat', cx + sx * (RING - 0.5), cz + sz * (RING - 0.5), R(0, 6.28), { n: 2 + Math.floor(rs() * 2), y: SLAB }); }
    // banco de calçada
    if (rs() < 0.3) { const s = Math.floor(rs() * 4), [nx, nz] = SIDES[s], p = ringPoint(cx, cz, s, R(-14, 14)), yaw = yawOut(nx, nz); PROP.bench(props, p[0] + nx * 0.5, SLAB, p[1] + nz * 0.5, yaw); if (rs() < 0.7) spot('sit', p[0] + nx * 0.5, p[1] + nz * 0.5, yaw, { seatY: SLAB + 0.46, bench: true }); }
    // orelhão
    if (rs() < 0.25) { const s = Math.floor(rs() * 4), [nx, nz] = SIDES[s], p = ringPoint(cx, cz, s, R(-18, 18)); PROP.payphone(props, p[0], SLAB, p[1], yawOut(nx, nz)); spot('phone', p[0] + nx * 0.75, p[1] + nz * 0.75, yawOut(-nx, -nz), { y: SLAB }); }
    // barraquinha de rua (guarda-sol, isopor, vendedor)
    if (rs() < 0.2) { const s = Math.floor(rs() * 4), [nx, nz] = SIDES[s], p = ringPoint(cx, cz, s, R(-16, 16)), yaw = yawOut(nx, nz); PROP.stand(props, p[0] + nx * 0.4, SLAB, p[1] + nz * 0.4, yaw, hexRGB(pk([0xe0a800, 0xd23b2e, 0x2e7bc4, 0x2f9e5b])));
      spot('vendor', p[0] - nx * 0.5, p[1] - nz * 0.5, yaw, { y: SLAB }); }
    if (rs() < 0.35) { const s = Math.floor(rs() * 4), [nx, nz] = SIDES[s], p = ringPoint(cx, cz, s, R(-20, 20)); PROP.bin(props, p[0] + nx * 1.2, SLAB, p[1] + nz * 1.2); }
  }
  // praias: espreguiçadeira, guarda-sol e gente tomando sol
  let beach = 0;
  for (let t = 0; t < 9000 && beach < 10; t++) {
    const x = R(-520, 520), z = R(-540, HALF - 40), h = Hq(x, z);
    if (inCity(x, z, 20) || spWestBusy(x, z) || h < WL + 0.25 || h > WL + 1.2 || favelaMask(x, z) > 0 || gridWD(x, z) < 4 || gridWD(x, z) > 14) continue;
    const [wx, wz] = nearestWater(x, z), yaw = Math.atan2(wx - x, wz - z); PROP.lounger(props, x, h, z, yaw); PROP.umbrella(props, x + 1.0, h, z, hexRGB(pk([0xe0a800, 0xd23b2e, 0x2e7bc4, 0xf2f2f2]))); spot('lay', x, z, yaw, { y: h + 0.3, lounger: true, area: 'beach' }); beach++;
  }
  scene.add(props.build(propMat));
  console.info('Cenas:', npcSpots.length, '(' + npcSpots.filter(s => s.area === 'city').length + ' na cidade,', beach, 'em praias)');
})();
