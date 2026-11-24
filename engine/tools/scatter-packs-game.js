// NEON ENGINE — espalhador de packs, parte que roda DENTRO do jogo (chamado por engine/tools/scatter-packs.js via run-game-script.js).
// Não use direto: o CLI injeta window.__SCATTER = { seed, vegMax, propsMax, avail } antes deste texto.
// Usa a geometria REAL do jogo (alturas carGroundHeight, CITY_BLOCKS, colisores dos prédios, entidades do street-life.js, favelas, rodovia...)
// e devolve a lista de objetos { id, type:'gltf', ref, name, pos, rot, scale, veg|batch, tag } e estatísticas. Não grava nada.
// PRM.mode: 'full' (espalha tudo e troca a procedural) ou 'rep' (só a troca das árvores/arbustos procedurais pelos modelos dos packs, mesmas posições, campo "rep").
(() => {
  const PRM = window.__SCATTER, A = PRM.avail, TAG = PRM.tag || 'packs-auto';
  const R = mulberry32((PRM.seed >>> 0) || 1), rnd = () => R(), rr = (a, b) => a + (b - a) * R(), ri = (a, b) => Math.floor(rr(a, b + 1));
  const has = id => !!A[id];
  const stats = { rejeitado: {}, fixos: 0 };
  const rej = k => { stats.rejeitado[k] = (stats.rejeitado[k] || 0) + 1; };

  /* ------------------------------------------------------------------ obstáculos fixos (para não sobrepor) ------------------------------------------------------------------ */
  const FIX = new Map(), FC = 12, fk = (x, z) => Math.floor(x / FC) + ',' + Math.floor(z / FC);
  const addFixed = (x, z, k) => { const key = fk(x, z); let l = FIX.get(key); if (!l) FIX.set(key, l = []); l.push({ x, z, k }); stats.fixos++; };
  const KEEP_ENT = /^(placa-rua|hidrante|lixo|cacamba|entulho|papelao)$/;
  for (const e of WENT.list) if (KEEP_ENT.test(e.kind)) addFixed(e.x, e.z, 'ent');
  for (const t of spTrees) addFixed(t[0], t[1], 'tree');
  for (const t of palmSpots) addFixed(t[0], t[1], 'tree');
  for (const p of lampSpots) addFixed(p[0], p[1], 'lamp');
  for (const o of (MAPDATA.objects || [])) if (o.tag !== TAG && o.pos) addFixed(o.pos[0], o.pos[2], 'user');
  for (const v of (MAPDATA.vehicles || [])) if (v.pos) addFixed(v.pos[0], v.pos[2], 'veh');
  if (MAPDATA.spawn && MAPDATA.spawn.pos) addFixed(MAPDATA.spawn.pos[0], MAPDATA.spawn.pos[2], 'veh');
  const fixedConflict = (x, z, it) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = FIX.get(fk(x + a * FC, z + b * FC)); if (!l) continue;
      for (const f of l) { const d = Math.hypot(f.x - x, f.z - z);
        const need = f.k === 'tree' ? (it.layer === 'tree' ? 4.5 : it.kind === 'prop' ? 1.4 : 1.0) : f.k === 'ent' ? (it.kind === 'prop' || it.layer === 'tree' || it.layer === 'shrub' ? 3.0 : 1.2)
          : f.k === 'lamp' ? (it.layer === 'ground' ? 0.6 : 1.5) : f.k === 'veh' ? 3.5 : 2.5;
        if (d < need) return true; } }
    return false;
  };
  const hitBox = (x, z, m) => { for (const b of nearby(x, z)) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return b; return null; };

  /* ------------------------------------------------------------------ itens colocados ------------------------------------------------------------------ */
  const items = [], HASH = new Map(), count = { veg: 0, prop: 0 }, cat = {};
  const caps = { veg: PRM.vegMax, prop: PRM.propsMax };
  const catCap = {};   // limite por categoria (fração do teto): evita que um bairro "coma" o orçamento todo
  const setCap = (c, frac, kind) => { catCap[c] = Math.round(caps[kind] * frac); };
  const catN = {};
  function conflictItems(x, z, it) {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = HASH.get(fk(x + a * FC, z + b * FC)); if (!l) continue;
      for (const o of l) { const d = Math.hypot(o.x - x, o.z - z); const need = o.layer === it.layer ? o.rad + it.rad : o.trunk + it.trunk; if (d < need) return true; } }
    return false;
  }
  /* tenta colocar; o: { layer: tree|shrub|ground|prop|rock, rad, trunk, kind: veg|prop, cat, wet, clear, reject(x,z) } */
  function place(ref, x, z, yaw, s, o) {
    const kind = o.kind;
    if (count[kind] >= caps[kind]) { rej('teto'); return null; }
    if ((catN[o.cat] || 0) >= (catCap[o.cat] || 1e9)) { rej('teto-cat'); return null; }
    if (x < X0 + 60 || x > X1 - 60 || z < Z0 + 60 || z > Z1 - 60) { rej('borda'); return null; }
    const h = carGroundHeight(x, z);
    if (h < WL + (o.wet ? -0.2 : 0.25)) { rej('agua'); return null; }
    if (o.reject && o.reject(x, z, h)) { rej('zona'); return null; }
    if (hitBox(x, z, o.clear !== undefined ? o.clear : 0.5)) { rej('predio'); return null; }
    if (fixedConflict(x, z, o)) { rej('fixo'); return null; }
    const it = { ref, x, z, yaw, s, layer: o.layer, rad: o.rad, trunk: o.trunk, kind, cat: o.cat };
    if (conflictItems(x, z, it)) { rej('vizinho'); return null; }
    // pé do objeto: o ponto mais baixo em volta (nada flutuando em encosta), afundando um pouco (raiz/base)
    const w = (A[ref].w || 1) * s * (o.footprint || 0.2); let y = h;
    if (w > 0.15) for (const [dx, dz] of [[w, 0], [-w, 0], [0, w], [0, -w]]) y = Math.min(y, carGroundHeight(x + dx, z + dz));
    it.y = y - (o.sink !== undefined ? o.sink : (layerSink[o.layer] || 0) * (A[ref].h * s));
    items.push(it); count[kind]++; catN[o.cat] = (catN[o.cat] || 0) + 1;
    const key = fk(x, z); let l = HASH.get(key); if (!l) HASH.set(key, l = []); l.push(it);
    return it;
  }
  const layerSink = { tree: 0.012, shrub: 0.05, ground: 0.12, prop: 0, rock: 0.12 };

  /* ------------------------------------------------------------------ paletas por célula de 200 m (poucas espécies por célula = poucas chamadas de desenho) ------------------------------------------------------------------ */
  // [id, altura-alvo mín, máx] (m) para árvores/arbustos; [id, escala mín, máx] para o resto
  const T = (id, a, b, w) => ({ id, a, b, w: w || 1 });
  const LIB = {
    urbanTrees: [T('vf_betula_1', 9, 12), T('vf_betula_2', 9, 13), T('vf_betula_3', 9, 12), T('vf_carvalho', 9, 12), T('vf_freixo', 7, 10), T('vf_caducifolia_arbusto_2', 7, 10), T('vf_macieira', 5, 7, 0.8), T('vf_ameixeira', 6, 8, 0.7)],
    wildTrees: [T('vf_pinheiro', 9, 14), T('vf_abeto', 9, 13), T('vf_carvalho', 8, 12), T('vf_betula_2', 8, 12), T('vf_freixo', 7, 10), T('vf_arvore_024', 8, 11, 0.5), T('vf_conifera_morta_arvore_2', 6, 9, 0.4), T('vf_caducifolia_morta_2', 7, 10, 0.4)],
    urbanShrubs: [T('vf_azevinho_arbusto', 1.0, 1.6), T('vf_caducifolia_arbusto', 1.1, 1.8), T('vf_conifera_arbusto', 1.3, 2.2), T('vp_rose_hip_var_b', 0.9, 1.4, 0.8), T('vp_rose_hip_var_h', 0.9, 1.4, 0.8)],
    wildShrubs: [T('vf_conifera_arbusto', 1.2, 2.2), T('vf_caducifolia_arbusto', 1.0, 1.9), T('vf_azevinho_arbusto', 1.0, 1.7), T('vp_rose_hip_var_a', 0.9, 1.5), T('vf_conifera_muda', 0.9, 1.6, 0.7), T('vf_caducifolia_muda_2', 1.0, 1.8, 0.7)],
    flowers: [T('vp_chamomile_var_a', 0.7, 1.1), T('vp_chamomile_var_c', 0.7, 1.1), T('vp_kangaroo_paw_var_a', 0.8, 1.2), T('vp_kangaroo_paw_var_b', 0.8, 1.2), T('vp_kangaroo_paw_var_c', 0.6, 0.9), T('sp_dandelion', 0.5, 0.8), T('sp_dandelion_2', 0.5, 0.8), T('vp_chamomile_var_d', 0.8, 1.2)],
    urbanGround: [T('vp_silvery_glade_samambaia_var_e', 2.0, 3.2), T('vp_silvery_glade_samambaia_var_f', 2.0, 3.2), T('vp_silvery_glade_samambaia_var_h', 2.0, 3.0), T('vp_tundra_grama_var_c', 1.6, 2.4), T('vp_tundra_grama_var_f', 1.6, 2.4),
      T('vp_narrowleaf_plantain_var_b', 2.0, 3.0), T('vp_lucky_bambu_var_h', 1.3, 2.0), T('sp_5_folha_ground_planta', 1.2, 2.0), T('gp_green_tall_patch', 1.6, 2.6), T('sp_grama_blades', 2.2, 3.4), T('gp_green_alpha_tall_grama_2', 3.0, 5.0), T('sp_ground_cloves', 4, 7)],
    wildGround: [T('gp_mid_tall_patch', 1.8, 3.2), T('gp_yellow_tall_patch', 1.8, 3.2), T('gp_green_tall_patch', 1.8, 3.2), T('gp_green_alpha_tall_grama_4', 3.5, 6), T('gp_green_alpha_tall_grama_6', 3.5, 6), T('sp_grama_blades', 2.4, 4), T('vp_tundra_grama_var_d', 1.8, 3), T('vp_tundra_grama_var_g', 1.6, 2.6),
      T('vp_silvery_glade_samambaia_var_g', 2.0, 3.2), T('vp_narrowleaf_plantain_var_a', 2.2, 3.4)],
    // troca da vegetação procedural (mesmas posições): espécies por contexto
    hillTrees: [T('vf_carvalho', 8, 11.5), T('vf_freixo', 7, 10), T('vf_betula_2', 8, 11), T('vf_betula_3', 8, 11), T('vf_macieira', 5, 7, 0.4)],
    pines: [T('vf_pinheiro', 9, 14), T('vf_abeto', 9, 13, 0.7)],
    swampTrees: [T('vf_pinheiro', 9, 13), T('vf_conifera_morta_arvore_2', 7, 10, 0.8), T('vf_caducifolia_morta_2', 8, 11, 0.6), T('vf_abeto', 9, 13, 0.5)],
    repShrubs: [T('vf_caducifolia_muda_2', 1.1, 2.0, 2), T('vf_caducifolia_muda', 1.0, 1.8, 1.5), T('vf_conifera_muda', 1.0, 1.7, 1.5), T('vp_rose_hip_var_h', 1.0, 1.7, 0.4), T('vp_rose_hip_var_b', 1.0, 1.6, 0.4), T('vf_caducifolia_arbusto', 1.2, 2.0, 0.6), T('vf_conifera_arbusto', 1.2, 2.0, 0.5), T('vf_azevinho_arbusto', 1.1, 1.8, 0.4)],
    rocks: [T('vf_rocha_lisa_grande', 0.8, 1.7), T('vf_rocha_com_musgo_grande', 0.8, 1.7), T('vf_rocha_afloramento_lisa_media', 0.5, 1.0, 0.25), T('vf_rocha_afloramento_com_musgo_media', 0.5, 1.0, 0.25)],
    logs: [T('vf_caducifolia_tronco_caido', 0.9, 1.3), T('vf_conifera_morta_tronco_caido', 0.9, 1.3)]
  };
  const PAL = new Map(), cellKey = (x, z) => Math.floor(x / 200) + ',' + Math.floor(z / 200);
  const NPAL = { hillTrees: 2, pines: 2, swampTrees: 2, repShrubs: 2, urbanTrees: 2, wildTrees: 2, urbanShrubs: 1, wildShrubs: 1, flowers: 1, urbanGround: 2, wildGround: 2, rocks: 1, logs: 1 };
  function palette(lib, x, z) {
    const ck = lib + '|' + cellKey(x, z); let p = PAL.get(ck); if (p) return p;
    const cand = LIB[lib].filter(e => has(e.id)), hs = hash2(Math.floor(x / 200) * 7 + lib.length * 131, Math.floor(z / 200) * 13 + (PRM.seed | 0)), g = mulberry32(Math.floor(hs * 4294967296));
    // sorteia sem repetição; modelos com menos primitivas (menos chamadas de desenho) e menos triângulos pesam mais
    const pool = cand.map(e => ({ e, w: e.w / (Math.max(1, A[e.id].prims || 1) * Math.max(1, (A[e.id].tris || 0) / 2500)) })); p = [];
    for (let k = 0; k < Math.min(NPAL[lib], pool.length); k++) { const tot = pool.reduce((a, q) => a + q.w, 0); let r = g() * tot, i = 0; for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; } p.push(pool[i].e); pool.splice(i, 1); }
    PAL.set(ck, p); return p;
  }
  const pickE = list => list[Math.floor(rnd() * list.length)];

  /* colocadores por tipo de planta */
  function putTree(lib, x, z, o) {
    const pl = palette(lib, x, z); if (!pl.length) return null; const e = pickE(pl), a = A[e.id], th = rr(e.a, e.b), s = th / a.h, cw = a.w * s;
    return place(e.id, x, z, rr(0, 360), s, Object.assign({ layer: 'tree', rad: Math.max(1.6, cw * 0.27), trunk: 0.45, kind: 'veg', footprint: 0.05, cat: 'arvore' }, o));
  }
  function putShrub(lib, x, z, o) {
    const pl = palette(lib, x, z); if (!pl.length) return null; const e = pickE(pl), a = A[e.id], th = rr(e.a, e.b), s = th / a.h, cw = Math.max(a.w, a.l) * s;
    return place(e.id, x, z, rr(0, 360), s, Object.assign({ layer: 'shrub', rad: Math.max(0.4, cw * 0.32), trunk: Math.max(0.3, cw * 0.25), kind: 'veg', footprint: 0.3, cat: 'arbusto' }, o));
  }
  function putGround(lib, x, z, o) {
    const pl = palette(lib, x, z); if (!pl.length) return null; const e = pickE(pl), a = A[e.id], s = rr(e.a, e.b), cw = Math.max(a.w, a.l) * s;
    return place(e.id, x, z, rr(0, 360), s, Object.assign({ layer: 'ground', rad: Math.max(0.18, cw * 0.3), trunk: Math.max(0.1, cw * 0.15), kind: 'veg', footprint: 0.25, cat: 'chao' }, o));
  }
  function putRock(x, z, o) {
    const pl = palette('rocks', x, z); if (!pl.length) return null; const e = pickE(pl), a = A[e.id], s = rr(e.a, e.b), cw = Math.max(a.w, a.l) * s;
    const it = place(e.id, x, z, rr(0, 360), s, Object.assign({ layer: 'rock', rad: cw * 0.4, trunk: cw * 0.4, kind: 'veg', footprint: 0.3, clear: 1.0, cat: 'rocha' }, o));
    return it;
  }
  function putLog(x, z, o) {
    const pl = palette('logs', x, z); if (!pl.length) return null; const e = pickE(pl), a = A[e.id], s = rr(e.a, e.b);
    return place(e.id, x, z, rr(0, 360), s, Object.assign({ layer: 'rock', rad: 1.2, trunk: 1.2, kind: 'veg', footprint: 0.25, clear: 0.8, cat: 'tronco' }, o));
  }
  function putProp(ref, x, z, yaw, o) {
    if (!has(ref)) return null; const a = A[ref], fp = Math.max(a.w, a.l);
    return place(ref, x, z, yaw, 1, Object.assign({ layer: 'prop', rad: fp * 0.5 + 0.3, trunk: fp * 0.5, kind: 'prop', footprint: 0, cat: 'prop' }, o));
  }
  const dirDeg = (dx, dz) => Math.atan2(dx, dz) * 180 / Math.PI;   // yaw (graus) para o +z do modelo apontar para (dx, dz)

  /* ------------------------------------------------------------------ cidade ------------------------------------------------------------------ */
  const SIDE = [[0, -1], [1, 0], [0, 1], [-1, 0]];                         // direção para fora de cada lado (0 N, 1 L, 2 S, 3 O)
  const sw = (b, side, u, d) => side === 0 ? [b.cx + u, b.cz - d] : side === 1 ? [b.cx + d, b.cz + u] : side === 2 ? [b.cx - u, b.cz + d] : [b.cx - d, b.cz - u];
  const sideYawAlong = side => side % 2 ? 0 : 90;                          // yaw para o eixo longo (z local) do modelo seguir o meio-fio
  const isPark = b => b.type === 'P' && !b.lm, isPlaza = b => b.type === 'Z';
  const cityKeep = {}; // caps por categoria
  setCap('arvore', 0.62, 'veg'); setCap('arbusto', 0.2, 'veg'); setCap('chao', 0.5, 'veg'); setCap('rocha', 0.08, 'veg'); setCap('tronco', 0.03, 'veg');
  setCap('prop', 1.0, 'prop');

  const treeChance = { R: 0.62, M: 0.5, T: 0.32, I: 0.3, C: 0.3, S: 0.3, A: 0.35, L: 0.3, P: 0.3, Z: 0.3 };
  const regionCity = []; for (const b of CITY_BLOCKS) regionCity.push(b);

  // --- parques e praças: manchas naturais por ruído
  function genPark(b) {
    const half = 22.5, ox = rr(0, 100), oz = rr(0, 100);
    const onPath = (x, z) => Math.abs(x - b.cx) < 2.9 || Math.abs(z - b.cz) < 2.9;
    const lake = (x, z) => Math.hypot(x - (b.cx + 12), z - (b.cz - 12)) < 8.6;
    const rejectP = (x, z) => onPath(x, z) || lake(x, z) || Math.abs(x - b.cx) > half || Math.abs(z - b.cz) > half;
    const n = (x, z, sc) => fbm((x + ox) * sc, (z + oz) * sc, 2);
    for (let t = 0; t < 110; t++) {                                       // árvores: onde o ruído de baixa frequência é alto
      const x = b.cx + rr(-half, half), z = b.cz + rr(-half, half); if (n(x, z, 0.055) < 0.5 || rnd() > 0.55) continue;
      putTree('urbanTrees', x, z, { reject: rejectP, cat: 'arvore', clear: 1.2 });
    }
    for (let t = 0; t < 110; t++) {                                       // arbustos e flores em manchas diferentes
      const x = b.cx + rr(-half, half), z = b.cz + rr(-half, half); if (n(x, z, 0.09) < 0.54) continue;
      (rnd() < 0.35 ? putShrub('urbanShrubs', x, z, { reject: rejectP, clear: 1.0 }) : putShrub('flowers', x, z, { reject: rejectP, clear: 1.0, layer: 'ground', rad: 0.5, trunk: 0.3, cat: 'chao' }));
    }
    for (let t = 0; t < 260; t++) {                                       // capim e plantas rasteiras
      const x = b.cx + rr(-half, half), z = b.cz + rr(-half, half); if (n(x, z, 0.12) < 0.46) continue;
      putGround('urbanGround', x, z, { reject: rejectP, clear: 0.8 });
    }
    // bancos junto aos caminhos (de frente para o caminho) e lixeiras
    const bench = has('sf_banco_de_praca') ? 'sf_banco_de_praca' : null, bins = ['sf_lixeira_de_rua', 'sf_lixeira_azul'].filter(has);
    if (bench) for (let k = 0; k < 6; k++) {
      const sgn = k % 2 ? 1 : -1, alongX = k < 3, t = rr(5, 20) * (k % 3 ? -1 : 1) * (rnd() < 0.5 ? 1 : -1), off = 3.7 * sgn;
      const x = alongX ? b.cx + t : b.cx + off, z = alongX ? b.cz + off : b.cz + t;           // alongX: caminho em z=cz; o banco fica ao lado dele
      const f = alongX ? [0, -sgn] : [-sgn, 0];
      putProp(bench, x, z, dirDeg(f[0], f[1]), { reject: (xx, zz) => lake(xx, zz) || Math.hypot(xx - b.cx, zz - b.cz) < 4.5, cat: 'prop' });
    }
    if (bins.length) for (let k = 0; k < 3; k++) putProp(pickE(bins), b.cx + (k % 2 ? 3.8 : -3.8), b.cz + rr(-18, 18) * (k < 2 ? 1 : 0.4) + (k === 2 ? 8 : 0), rr(0, 360), { reject: lake });
  }
  function genPlaza(b) {
    const ox = rr(0, 100), bench = has('sf_banco_de_praca') ? 'sf_banco_de_praca' : null;
    if (bench) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2, rd = 11.5, x = b.cx + Math.cos(a) * rd, z = b.cz + Math.sin(a) * rd; putProp(bench, x, z, dirDeg(b.cx - x, b.cz - z), { cat: 'prop' }); }
    for (let k = 0; k < 7; k++) { const a = rr(0, 6.28), rd = rr(17, 23); putTree('urbanTrees', b.cx + Math.cos(a) * rd, b.cz + Math.sin(a) * rd, { reject: (x, z) => Math.abs(x - b.cx) > 24 || Math.abs(z - b.cz) > 24, clear: 1.2 }); }
    for (let k = 0; k < 14; k++) { const a = rr(0, 6.28), rd = rr(14, 21); putShrub(rnd() < 0.5 ? 'urbanShrubs' : 'flowers', b.cx + Math.cos(a) * rd, b.cz + Math.sin(a) * rd, { reject: (x, z) => Math.abs(x - b.cx) > 24 || Math.abs(z - b.cz) > 24, clear: 1.0 }); }
    for (let t = 0; t < 40; t++) { const x = b.cx + rr(-23, 23), z = b.cz + rr(-23, 23); if (fbm((x + ox) * 0.1, z * 0.1, 2) < 0.55 || Math.hypot(x - b.cx, z - b.cz) < 9) continue; putGround('urbanGround', x, z, { clear: 0.8 }); }
    const bins = ['sf_lixeira_de_rua', 'sf_lixeira_azul'].filter(has); if (bins.length) for (let k = 0; k < 2; k++) putProp(pickE(bins), b.cx + rr(-14, 14), b.cz + (k ? 15 : -15), rr(0, 360), {});
  }
  // --- calçadas
  const props = {
    bin: ['sf_lixeira_de_rua', 'sf_lixeira_azul'].filter(has), hyd: has('sf_hidrante') ? 'sf_hidrante' : null, cone: has('sa_cone_de_transito') ? 'sa_cone_de_transito' : null,
    barrier: has('sa_barreira_de_concreto') ? 'sa_barreira_de_concreto' : null, drum: has('sa_tambor_de_obra') ? 'sa_tambor_de_obra' : null, skip: has('sf_cacamba') ? 'sf_cacamba' : null,
    phone: has('orelhao') ? 'orelhao' : null, bus: has('sf_ponto_de_onibus') ? 'sf_ponto_de_onibus' : null, mail: has('sf_caixa_de_correio_azul') ? 'sf_caixa_de_correio_azul' : null,
    litter: ['sa_garrafa_deitada', 'sa_copo_de_papel_caido', 'sa_caixa_de_papelao_2'].filter(has)
  };
  const binFor = (x, z) => props.bin.length ? props.bin[(Math.floor(hash2(Math.floor(x / 200), Math.floor(z / 200)) * 10)) % props.bin.length] : null;   // 1 tipo de lixeira por célula
  function genSidewalk(b) {
    const busy = b.type === 'T' || b.type === 'M' || b.type === 'C' || b.type === 'L', res = b.type === 'R';
    const pTree = treeChance[b.type] || 0.3;
    for (let side = 0; side < 4; side++) {
      // árvores de rua: de ~18 a 25 m uma da outra, alternando espécies da paleta; longe dos cantos (poste, placa e faixa de pedestre)
      let u = -20 + rr(0, 6), k = 0;
      while (u < 20) {
        if (rnd() < pTree) { const p = sw(b, side, u, 26.1 + rr(-0.2, 0.2)); const pl = palette('urbanTrees', p[0], p[1]); if (pl.length) { const e = pl[(k + side) % pl.length], a = A[e.id], th = rr(e.a, e.b) * 0.92, s = th / a.h;
          place(e.id, p[0], p[1], rr(0, 360), s, { layer: 'tree', rad: 2.2, trunk: 0.45, kind: 'veg', footprint: 0.05, cat: 'arvore', clear: 0.9 }); } }
        u += rr(18, 25); k++;
      }
      // arbustos e vasos junto aos prédios
      if (rnd() < (res ? 0.5 : 0.28)) for (let t = 0; t < 2; t++) {
        const u2 = rr(-20, 20), p = sw(b, side, u2, 25.2 + rr(-0.4, 0.4));
        place_near_building(p, 'urbanShrubs');
      }
    }
    // lixeiras: uma por esquina (algumas) e uma a cada ~35 m de calçada
    if (props.bin.length) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (rnd() < 0.34) putProp(binFor(b.cx, b.cz), b.cx + sx * 25.4, b.cz + sz * 21.5, rr(0, 360), { clear: 0.4 });
      for (let side = 0; side < 4; side++) if (rnd() < (busy ? 0.34 : 0.14)) { const p = sw(b, side, rr(-10, 10), 26.8); putProp(binFor(b.cx, b.cz), p[0], p[1], rr(0, 360), { clear: 0.4 }); }
    }
    if (props.hyd && rnd() < 0.22) { const p = sw(b, Math.floor(rnd() * 4), rr(-16, 16), 27.3); putProp(props.hyd, p[0], p[1], rr(0, 360), { clear: 0.3 }); }
    if (props.phone && busy && rnd() < 0.26) { const sx = rnd() < 0.5 ? -1 : 1, sz = rnd() < 0.5 ? -1 : 1; putProp(props.phone, b.cx + sx * 23.4, b.cz + sz * 17.5, dirDeg(sx, sz) + 180 + rr(-20, 20), { clear: 0.3 }); }
    if (props.bus && (b.type === 'M' || b.type === 'T') && rnd() < 0.1) { const side = Math.floor(rnd() * 4), p = sw(b, side, rr(-10, 10), 26.0); putProp(props.bus, p[0], p[1], sideYawAlong(side), { clear: 0.3 }); }
    if (props.mail && busy && rnd() < 0.12) { const p = sw(b, Math.floor(rnd() * 4), rr(-14, 14), 26.9); putProp(props.mail, p[0], p[1], rr(0, 360), { clear: 0.3 }); }
    // obra: cones, tambores e barreira perto do cruzamento (ocasional)
    if (rnd() < 0.09) {
      const sx = rnd() < 0.5 ? -1 : 1, sz = rnd() < 0.5 ? -1 : 1, side = Math.floor(rnd() * 4);
      const base = sw(b, side, sx * 15, 27.0), al = side % 2 ? [0, 1] : [1, 0];
      if (props.barrier) putProp(props.barrier, base[0], base[1], sideYawAlong(side), { clear: 0.3 });
      for (let k = 0; k < 3; k++) if (props.cone) putProp(props.cone, base[0] + al[0] * (2.2 + k * 1.1) * sx, base[1] + al[1] * (2.2 + k * 1.1) * sx, 0, { clear: 0.3 });
      if (props.drum && rnd() < 0.6) putProp(props.drum, base[0] - al[0] * 2.4 * sx, base[1] - al[1] * 2.4 * sx, 0, { clear: 0.3 });
    }
    // caçamba em rua lateral (quadra residencial)
    if (props.skip && res && rnd() < 0.1) { const side = Math.floor(rnd() * 4), p = sw(b, side, rr(-14, 14), 26.3); putProp(props.skip, p[0], p[1], sideYawAlong(side), { clear: 0.3 }); }
    // lixo miúdo no chão onde há pouca densidade (garrafas, copos, caixa)
    if (props.litter.length && rnd() < (busy ? 0.4 : 0.55)) for (let t = 0; t < 2; t++) { const p = sw(b, Math.floor(rnd() * 4), rr(-18, 18), rr(23.5, 27.4)); putProp(pickE(props.litter), p[0], p[1], rr(0, 360), { clear: 0.2, rad: 0.3, trunk: 0.1 }); }
  }
  // arbusto/vaso encostado na fachada: só onde há um prédio logo atrás (colisor a < 3 m) e a calçada fica livre
  function place_near_building(p, lib) {
    if (hitBox(p[0], p[1], 0.7) || !hitBox(p[0], p[1], 2.6)) return null;
    return putShrub(lib, p[0], p[1], { clear: 0.6, cat: 'arbusto' });
  }

  /* ------------------------------------------------------------------ fora da cidade ------------------------------------------------------------------ */
  const causeway = (x, z, m) => Math.abs(x) < 6 + m && z > HALF - 4 && z < HALF + SWD - 20;
  const roadish = (x, z, m) => onHighway(x, z, m) || onMorumbiRoad(x, z, m + 2) || causeway(x, z, m) || (favelaMask(x, z) > 0.02 && onFavelaRoad(x, z)) || inPinh(x, z, m + 4);
  const wildOK = (x, z, h) => !(inCity(x, z, 7) || roadish(x, z, 5) || spWestBusy(x, z, 4) || nearMorumbi(x, z, 20)) && h > WL + 0.3 && gridAt(SWG, x, z) < 0.25 && favelaMask(x, z) < 0.04;
  const wildReject = (x, z, h) => !wildOK(x, z, h);
  setCap('arvore', 0.62, 'veg');

  function patch(x, z, kind) {
    // grupo natural em volta de (x,z): capim denso + arbustos + (às vezes) árvores/rochas/troncos
    const rad = kind === 'verge' ? rr(10, 18) : rr(9, 22), ox = rr(0, 90);
    const n = kind === 'verge' ? ri(12, 22) : ri(14, 30);
    for (let t = 0; t < n; t++) { const a = rr(0, 6.28), d = Math.sqrt(rnd()) * rad; putGround('wildGround', x + Math.cos(a) * d, z + Math.sin(a) * d, { reject: wildReject, clear: 0.6, cat: 'chao' }); }
    for (let t = 0, m = ri(2, 6); t < m; t++) { const a = rr(0, 6.28), d = Math.sqrt(rnd()) * rad * 0.9; putShrub('wildShrubs', x + Math.cos(a) * d, z + Math.sin(a) * d, { reject: wildReject, clear: 0.8, cat: 'arbusto' }); }
    if (kind !== 'verge' && rnd() < 0.55) for (let t = 0, m = ri(1, 3); t < m; t++) { const a = rr(0, 6.28), d = rr(2, rad); putTree('wildTrees', x + Math.cos(a) * d, z + Math.sin(a) * d, { reject: wildReject, clear: 1.4, cat: 'arvore' }); }
    if (rnd() < (kind === 'hill' ? 0.9 : 0.5)) for (let t = 0, m = ri(1, kind === 'hill' ? 4 : 3); t < m; t++) { const a = rr(0, 6.28), d = rr(1, rad * 0.7); putRock(x + Math.cos(a) * d, z + Math.sin(a) * d, { reject: wildReject }); }
    if (kind !== 'verge' && rnd() < 0.35) { const a = rr(0, 6.28), d = rr(3, rad); putLog(x + Math.cos(a) * d, z + Math.sin(a) * d, { reject: wildReject }); }
  }
  const distCity = (x, z) => { let d = 1e9; for (const c of CITIES) d = Math.min(d, cityDist(c, x, z)); return d; };

  /* ------------------------------------------------------------------ favelas ------------------------------------------------------------------ */
  function genFavela(F) {
    const trash = ['sa_saco_de_lixo', 'sa_saco_de_lixo_2', 'sa_caixa_de_papelao', 'sa_caixa_de_papelao_2'].filter(has), drums = ['sa_tambor_de_obra'].filter(has), skip = props.skip;
    const R0 = F.road; if (!R0.length) return;
    for (let i = 0; i < R0.length - 1; i += 2) {                         // ao longo da ladeira: sacos de lixo, papelão, caçambas e tambores nas margens
      const a = R0[i], b = R0[Math.min(i + 1, R0.length - 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, sg = rnd() < 0.5 ? 1 : -1, off = FAV_ROAD_HW + rr(0.9, 1.8);
      const x = a[0] + nx * sg * off, z = a[1] + nz * sg * off, r = rnd();
      const reject = (xx, zz) => favRoadNearF(F, xx, zz).d < FAV_ROAD_HW + 0.5;
      if (r < 0.1 && skip) putProp(skip, x, z, dirDeg(dx, dz), { reject, clear: 0.6 });
      else if (r < 0.45 && trash.length) { for (let k = 0; k < ri(1, 3); k++) putProp(pickE(trash), x + rr(-0.8, 0.8), z + rr(-0.8, 0.8), rr(0, 360), { reject, clear: 0.4, rad: 0.5, trunk: 0.3 }); }
      else if (r < 0.52 && drums.length) putProp(drums[0], x, z, 0, { reject, clear: 0.4 });
    }
    // franja do morro (máscara baixa): mato ralo, capim e uma ou outra árvore seca
    for (let t = 0; t < 130; t++) {
      const a = rr(0, 6.28), d = rr(F.R * 0.55, F.R * 1.1), p = favWorld(F, Math.cos(a) * d * 0.8, Math.sin(a) * d);
      const m = favelaMask(p[0], p[1]); if (m > 0.55 || m < 0.0) continue;
      const rj = (x, z, h) => roadish(x, z, 4) || inCity(x, z, 6) || h < WL + 0.3 || favRoadNearF(F, x, z).d < FAV_ROAD_HW + 1;
      const r = rnd();
      if (r < 0.5) putGround('wildGround', p[0], p[1], { reject: rj, clear: 0.7 });
      else if (r < 0.75) putShrub('wildShrubs', p[0], p[1], { reject: rj, clear: 0.9 });
      else if (r < 0.88) putRock(p[0], p[1], { reject: rj });
      else putTree('wildTrees', p[0], p[1], { reject: rj, clear: 1.5, cat: 'arvore' });
    }
  }

  /* ------------------------------------------------------------------ troca da vegetação procedural ------------------------------------------------------------------
     vegetation.js anota em VEGREC cada árvore/arbusto procedural (mesmas posições, mesma semente do mundo). Aqui cada uma vira um modelo dos packs com o campo "rep" = id da entidade
     (placements.js liga PACK_VEG quando existe algum objeto com "rep"). Respeita o que o usuário editou: entidade com "del" em world não é trocada; "d/r/s" (mover, girar, escalar)
     são aplicados; objeto "rep" que o usuário já tem no mapa (sem a tag) não é duplicado. */
  const REP = { por: {}, apagadas: 0, doUsuario: 0, semModelo: 0, movidas: 0 };
  function genReplacements() {
    const W = MAPDATA.world || {}, own = new Set(); for (const o of (MAPDATA.objects || [])) if (o.rep && o.tag !== TAG) own.add(o.rep);
    const LIBFOR = { 'arvore-rua': 'urbanTrees', arvore: 'hillTrees', pinheiro: 'pines', cipreste: 'swampTrees', arbusto: 'repShrubs' };
    const out = [];
    for (const r of VEGREC) {
      const ov = W[r.id]; if (ov && ov.del) { REP.apagadas++; continue; } if (own.has(r.id)) { REP.doUsuario++; continue; }
      const lib = LIBFOR[r.k], pl = palette(lib, r.x, r.z); if (!pl.length) { REP.semModelo++; continue; }
      const e = r.k === 'arvore-rua' ? pl[Math.floor(rnd() * pl.length)] : pickE(pl), a = A[e.id];
      let x = r.x, z = r.z, yaw = rr(0, 360), s0 = 1, dy = 0;
      const th = r.k === 'arvore-rua' ? rr(e.a, e.b) * 0.92 * Math.min(1.12, 0.9 + r.s * 0.1) : rr(e.a, e.b), s = th / a.h;
      if (ov) { const d = ov.d || [0, 0, 0]; x += d[0]; z += d[2]; dy = d[1]; yaw += ov.r || 0; s0 = ov.s || 1; REP.movidas++; }
      const sc = s * s0, cw = Math.max(a.w, a.l) * sc, h = carGroundHeight(x, z);
      let y = r.k === 'arvore-rua' && Math.abs(h - r.y) < 0.35 ? r.y : h; const w = cw * (r.k === 'arbusto' ? 0.18 : 0.04);
      if (w > 0.1) for (const [ax, az] of [[w, 0], [-w, 0], [0, w], [0, -w]]) y = Math.min(y, carGroundHeight(x + ax, z + az));
      y = y - (r.k === 'arbusto' ? 0.04 : 0.012) * th * s0 + dy;
      out.push({ id: 'pr' + out.length.toString(36), type: 'gltf', ref: e.id, name: a.name, pos: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], rot: [0, Math.round(yaw % 360), 0], scale: [+sc.toFixed(2), +sc.toFixed(2), +sc.toFixed(2)], veg: 1, tag: TAG, rep: r.id });
      REP.por[r.k] = (REP.por[r.k] || 0) + 1;
    }
    return out;
  }

  /* ------------------------------------------------------------------ execução ------------------------------------------------------------------ */
  const t0 = performance.now();
  const FULL = PRM.mode !== 'rep';
  // 1) cidades
  if (FULL) for (const b of CITY_BLOCKS) {
    if (isPark(b)) genPark(b); else if (isPlaza(b)) genPlaza(b);
    genSidewalk(b);
  }
  const nCity = count.veg + count.prop;
  // 2) favelas (primeiro: o raio de ação deles é pequeno e o orçamento fora da cidade é grande)
  if (FULL) for (const F of FAVS) genFavela(F);
  // 3) fora da cidade: verges da Dutra, baldios na borda das cidades, encostas e orla
  const outCap = Math.floor(caps.veg * 0.97);
  let tries = 0, patches = { verge: 0, edge: 0, hill: 0, coast: 0 };
  const want = { verge: 34, edge: 40, hill: 26, coast: 26 };
  while (FULL && tries++ < 60000 && count.veg < outCap && (patches.verge < want.verge || patches.edge < want.edge || patches.hill < want.hill || patches.coast < want.coast)) {
    const kindRoll = rnd(); let x, z, kind;
    if (kindRoll < 0.25 && patches.verge < want.verge) { x = rr(HWY.x0 - 40, HWY.x1 + 40); z = HWY.z + (rnd() < 0.5 ? -1 : 1) * rr(RW / 2 + 5, RW / 2 + 36); kind = 'verge'; }
    else if (kindRoll < 0.6 && patches.edge < want.edge) { const c = pickE(CITIES); x = rr(c.cx - c.hx - 160, c.cx + c.hx + 160); z = rr(c.cz - c.hz - 160, c.cz + c.hz + 160); kind = 'edge'; }
    else if (kindRoll < 0.82 && patches.hill < want.hill) { const c = pickE(CITIES); x = rr(c.cx - c.hx - 420, c.cx + c.hx + 420); z = rr(c.cz - c.hz - 360, c.cz + c.hz + 360); kind = 'hill'; }
    else if (patches.coast < want.coast) { const c = pickE(CITIES); x = rr(c.cx - c.hx - 300, c.cx + c.hx + 300); z = rr(c.cz - c.hz - 320, c.cz + c.hz + 320); kind = 'coast'; }
    else continue;
    const h = Hq(x, z); if (!wildOK(x, z, h)) continue;
    const sl = slopeAt(x, z), dc = distCity(x, z);
    if (kind === 'verge' && (!onHighway(x, z, 40) || onHighway(x, z, 5) || sl > 0.5)) continue;
    if (kind === 'edge' && (dc < 8 || dc > 150 || sl > 0.45 || h > 14)) continue;
    if (kind === 'hill' && (!(h > 7 && sl > 0.12) || dc > 420 || sl > 0.9)) continue;
    if (kind === 'coast' && !(h < WL + 2.4 && h > WL + 0.35 && dc < 380)) continue;
    patches[kind]++; patch(x, z, kind);
  }
  stats.patches = patches; stats.tentativas = tries;

  // ------------------------------------------------------------------ saída ------------------------------------------------------------------
  const out = [], byRef = {};
  items.forEach((it, i) => {
    const a = A[it.ref], veg = it.kind === 'veg' && a.veg;                       // vegetação de verdade = veg:1; rocha/tronco/props = batch:1
    const def = { id: 'pk' + (i + 1).toString(36), type: 'gltf', ref: it.ref, name: a.name, pos: [+it.x.toFixed(2), +it.y.toFixed(2), +it.z.toFixed(2)], rot: [0, Math.round(it.yaw % 360), 0], scale: [+it.s.toFixed(2), +it.s.toFixed(2), +it.s.toFixed(2)] };
    if (veg) def.veg = 1; else def.batch = 1;
    def.tag = TAG; out.push(def); byRef[it.ref] = (byRef[it.ref] || 0) + 1;
  });
  const reps = genReplacements(); for (const d of reps) { out.push(d); byRef[d.ref] = (byRef[d.ref] || 0) + 1; }
  stats.troca = REP; stats.trocaTotal = reps.length;
  stats.contagem = { veg: count.veg, prop: count.prop, cidade: nCity };
  stats.porCategoria = catN; stats.porModelo = byRef; stats.ms = Math.round(performance.now() - t0);
  // chunks (InstancedMesh por modelo x célula de 200 m) e primitivas: estimativa de custo de desenho
  const chunks = new Map(); for (const it of items) { const k = it.ref + '|' + cellKey(it.x, it.z); chunks.set(k, A[it.ref].prims || 1); } for (const d of reps) chunks.set(d.ref + '|' + cellKey(d.pos[0], d.pos[2]), A[d.ref].prims || 1);
  stats.chunks = chunks.size; stats.primitivasNasCelulas = [...chunks.values()].reduce((a, v) => a + v, 0);
  // checagens finais: nada abaixo da água, nada longe do chão
  let bad = 0; for (const it of items) { const g = carGroundHeight(it.x, it.z); if (it.y > g + 0.6 || it.y < g - 1.0) bad++; } stats.alturaSuspeita = bad;
  return { defs: out, stats };
})()
