(async () => {
  await new Promise(r => setTimeout(r, 12000));              // GLB + object.json dos lotes carregam de forma assíncrona
  const out = [], objs = MAPDATA.objects || [];
  const boxesNear = (x, z, R) => { const s = new Set(); for (let dx = -R; dx <= R; dx += 24) for (let dz = -R; dz <= R; dz += 24) for (const b of nearby(x + dx, z + dz)) if (b.x1 > x - R && b.x0 < x + R && b.z1 > z - R && b.z0 < z + R) s.add(b); return [...s]; };
  const pickT = (re, n) => {
    const c = objs.filter(o => re.test(o.ref) && o.pos), res = [];
    for (const o of c) {
      const [x, y, z] = o.pos; if (carGroundHeight(x, z) < WL + 0.3) continue;
      for (const ang of [0, 90, 180, 270]) {
        const dx = Math.sin(ang * Math.PI / 180), dz = Math.cos(ang * Math.PI / 180); let ok = true;
        for (let t = -6; t <= 3 && ok; t += 0.5) { const px = x + dx * t, pz = z + dz * t; if (Math.abs(carGroundHeight(px, pz) - y) > 0.5) ok = false;
          for (const b of boxesNear(px, pz, 2)) { const own = b.x1 > x - 4 && b.x0 < x + 4 && b.z1 > z - 4 && b.z0 < z + 4 && b.map; if (!own && px > b.x0 - 1.1 && px < b.x1 + 1.1 && pz > b.z0 - 1.1 && pz < b.z1 + 1.1) ok = false; } }
        for (const o2 of objs) if (o2 !== o && o2.pos && Math.hypot(o2.pos[0] - x, o2.pos[2] - z) < 5 && o2.veg === undefined) ok = false;
        if (ok) { res.push({ o, ang, dx, dz }); break; }
      }
      if (res.length >= n) break;
    }
    return res;
  };
  const walk = (t) => {
    const [x, , z] = t.o.pos, boxes = boxesNear(x, z, 4).filter(b => b.map && b.x1 > x - 4 && b.x0 < x + 4 && b.z1 > z - 4 && b.z0 < z + 4);
    player.x = x - t.dx * 4; player.z = z - t.dz * 4; player.y = carGroundHeight(player.x, player.z); player.h = Math.atan2(t.dx, t.dz); cam.a = player.h; player.mv = 0; player.vx = player.vz = 0;
    keys.KeyW = true; let minD = 1e9, passed = false;
    for (let i = 0; i < 40; i++) { __run(0.1); const along = (player.x - x) * t.dx + (player.z - z) * t.dz; minD = Math.min(minD, Math.hypot(player.x - x, player.z - z)); if (along > 0.3) passed = true; }
    keys.KeyW = false; __run(0.2);
    const along = (player.x - x) * t.dx + (player.z - z) * t.dz;
    return { ref: t.o.ref, esc: t.o.scale && +t.o.scale[1].toFixed(2), pos: [x, z].map(v => +v.toFixed(1)), colisores: boxes.map(b => +((b.x1 - b.x0) / 2).toFixed(2) + 'x' + +((b.z1 - b.z0) / 2).toFixed(2)), alturaCol: boxes.length ? +(boxes[0].h - boxes[0].y0).toFixed(1) : null, paradoAMetros: +(-along).toFixed(2), passou: passed || along > 0.3, menorDist: +minD.toFixed(2) };
  };
  const cases = [['arvore', /^vf_(betula|carvalho|freixo|pinheiro)/, 2], ['arbusto-alto(>1,5m)', /^vf_(conifera_arbusto|caducifolia_muda_2|azevinho)/, 3], ['arbusto/muda baixo', /^vf_(conifera_muda|caducifolia_muda$)|^vp_rose/, 2], ['tufo/capim', /^gp_|^sp_grama/, 2], ['lixeira', /^sf_lixeira|^sa_lixeira/, 2], ['banco', /^sf_banco/, 1], ['rocha', /^vf_rocha/, 2], ['tronco caido', /tronco_caido/, 1]];
  for (const [nome, re, n] of cases) { const ts = pickT(re, n); if (!ts.length) out.push({ caso: nome, erro: 'nenhum candidato com caminho livre' }); for (const t of ts) out.push(Object.assign({ caso: nome }, walk(t))); }
  return out;
})()
