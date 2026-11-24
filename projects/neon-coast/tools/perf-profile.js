// Perfil de desempenho do NEON COAST (Fase 0 do plano da engine). NÃO altera o jogo: embrulha funções só dentro da página de teste.
// Uso (a partir de projects/neon-coast), um cenário por execução (o runner tem limite de 240 s):
//   npx electron tools/run-game-script.js tools/perf-profile.js --show --test "37,0.3,80,180&perf=a"
//   perf = a (centro de SP parado) | b (avenida dirigindo) | c (favela) | d (praia/RJ) | e (estresse) | v (variantes de GPU, no cenário e)
// (o "&perf=" vai junto do --test porque o runner monta a URL index.html?test=... e este script lê location.search)
// O que cada número significa:
//   SIM (10 s simulados, __run): ms de CPU por quadro. NÃO espera o vsync. Inclui lógica + montagem da cena + envio de comandos à GPU.
//     Se a GPU estiver atrás, o navegador pode bloquear em algum ponto (aparece como tempo "alto" em postRender): trate render como "CPU + possível espera".
//   RT (tempo real, requestAnimationFrame): fps real, limitado pelo vsync (normalmente 60 Hz); intervalo entre quadros.
//   RT+finish: depois de postRender chama gl.finish() e mede quanto tempo ele espera = tempo de GPU que sobrou além da CPU.
//     Distorce um pouco (serializa CPU e GPU), então use só para estimar carga de GPU.
//   timer query (EXT_disjoint_timer_query_webgl2), se existir: tempo de GPU de postRender (sombras + cena + pós).
(async () => {
  const Q = new URLSearchParams(location.search), only = (Q.get('perf') || 'a').toLowerCase();
  const gl = renderer.getContext(), origRAF = window.requestAnimationFrame.bind(window);
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const stat = a => ({ med: +mean(a).toFixed(2), p95: +pct(a, 0.95).toFixed(2), max: +Math.max(0, ...a).toFixed(2), n: a.length });
  const out = { cenario: only, janela: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, canvas: [renderer.domElement.width, renderer.domElement.height] }, gl: {} };
  try { const di = gl.getExtension('WEBGL_debug_renderer_info'); out.gl.renderer = di ? gl.getParameter(di.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); out.gl.versao = gl.getParameter(gl.VERSION); } catch (e) {}
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'); out.gl.timerQuery = !!tq;

  /* ---- desliga a resolução dinâmica (para os números serem repetíveis) e fixa escala 1 ---- */
  POST.warmup = 1e12; if (POST.scale !== 1) { POST.scale = 1; postResize(); }
  renderer.info.autoReset = false;

  /* ---- embrulha as fases do quadro ---- */
  const NAMES = ['updateSky', 'applySwamp', 'updateFoot', 'updateVehicleTransition', 'updateCarDoors', 'updateCars', 'stepCars', 'updateDamageEffects', 'updatePeds', 'updateNpcs', 'manageNpcs', 'updatePedAI', 'updatePigeons',
    'updateGators', 'updatePolice', 'updateOfficers', 'updateEms', 'updatePlayerSeat', 'updateWeapons', 'updateObjective', 'updateCamera', 'updateVegetationCulling', 'updateTrafficLights', 'manageTraffic',
    'drawMinimap', 'updateAudio', 'updateRadio', 'updateMenuPreview', 'updatePhonePreview', 'updateMapGens', 'postRender'];
  const NESTED = new Set(['stepCars', 'updateDamageEffects', 'updateNpcs', 'manageNpcs', 'updatePedAI', 'updatePigeons', 'updateOfficers', 'updateEms']);   // já contados dentro de updateCars/updatePeds/updatePolice
  let cur = null, finishOn = false, queryOn = false, pending = [], gpuQ = [];
  const wrapped = [];
  for (const n of NAMES) {
    const f = window[n]; if (typeof f !== 'function') continue;
    window[n] = function () {
      const t = performance.now(); const r = f.apply(this, arguments); const d = performance.now() - t;
      if (cur) cur[n] = (cur[n] || 0) + d;
      return r;
    };
    wrapped.push(n);
  }
  out.funcoesMedidas = wrapped;
  // postRender: acrescenta gl.finish() e/ou timer query
  const postW = window.postRender;
  window.postRender = function () {
    let q = null;
    if (queryOn && tq) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
    const r = postW.apply(this, arguments);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); pending.push(q); }
    if (finishOn) { const t = performance.now(); gl.finish(); if (cur) cur.finish = performance.now() - t; }
    return r;
  };
  function pollQueries() {
    if (!tq) return; const dis = gl.getParameter(tq.GPU_DISJOINT_EXT);
    while (pending.length) { const q = pending[0]; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; pending.shift(); if (!dis) gpuQ.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
  }
  // draw calls / triângulos da passada de cena (primeiro render do quadro) e total
  const rr = renderer.render.bind(renderer); let firstRender = false;
  renderer.render = function () {
    const shadowFrame = renderer.shadowMap.needsUpdate;
    const r = rr.apply(null, arguments);
    if (firstRender) { firstRender = false; if (cur) { cur.scCalls = renderer.info.render.calls; cur.scTris = renderer.info.render.triangles; cur.shadowFrame = shadowFrame ? 1 : 0; } }
    return r;
  };

  /* ---- gravação por quadro ---- */
  const origFrame = window.frame; let pausedCount = 0, recOn = false, rec = [], lastNow = 0, autopilot = null;
  window.frame = function (now) {
    if (paused) { pausedCount++; paused = false; }   // o jogo pausa sozinho quando a janela perde o foco (blur): força continuar
    if (autopilot) autopilot();
    cur = recOn ? {} : null; renderer.info.reset(); firstRender = true;
    const t0 = performance.now(); origFrame(now); const t1 = performance.now();
    if (cur) {
      cur.total = t1 - t0; cur.interval = lastNow ? now - lastNow : 0; cur.allCalls = renderer.info.render.calls; cur.allTris = renderer.info.render.triangles;
      cur.heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0; rec.push(cur);
    }
    lastNow = now; cur = null;
    if (queryOn) pollQueries();
  };
  // bloqueia o rAF do jogo durante a simulação (senão cada __run empilha callbacks de vsync)
  let rafOn = false; window.requestAnimationFrame = cb => rafOn ? origRAF(cb) : 0;
  await new Promise(r => origRAF(() => origRAF(r)));      // deixa a cadeia antiga do rAF morrer
  last = performance.now();

  /* ---- ferramentas de cenário ---- */
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const rc = i => roadC(i);
  function teleport(x, z, hDeg) {
    if (player.car) { player.car = null; player.mesh.visible = true; }
    player.x = x; player.z = z; player.y = carGroundHeight(x, z); player.vx = player.vz = 0; player.h = (hDeg || 0) * Math.PI / 180; cam.a = player.h; player.hp = 100;
    updateMapGens(0, true);
  }
  const simFrame = () => window.__run(1 / 60);
  function sim(secs, perFrame) { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { if (i % 30 === 0) updateMapGens(0.5); if (perFrame) perFrame(i); simFrame(); } }
  async function realtime(ms, opts) {
    opts = opts || {}; finishOn = !!opts.finish; queryOn = !!opts.query; gpuQ = []; pending = []; rec = []; recOn = true; rafOn = true; last = performance.now(); lastNow = 0;
    await new Promise(res => { origRAF(window.frame); setTimeout(res, ms); });
    recOn = false; rafOn = false; await new Promise(r => origRAF(() => origRAF(r)));   // a cadeia para na próxima chamada
    await new Promise(r => setTimeout(r, 120)); if (queryOn) pollQueries();
    const iv = rec.slice(3).map(f => f.interval).filter(v => v > 0);
    const res = { quadros: rec.length, fps: +(1000 / mean(iv)).toFixed(1), intervaloMs: stat(iv), cpuQuadroMs: stat(rec.slice(3).map(f => f.total)) };
    if (opts.finish) res.finishMs = stat(rec.slice(3).map(f => f.finish || 0));
    if (opts.query && tq) res.gpuTimerMs = stat(gpuQ.slice(3));
    finishOn = queryOn = false; return res;
  }
  function summarize(frames) {
    const o = { quadros: frames.length, quadroTotalMs: stat(frames.map(f => f.total)), fases: {} };
    for (const n of wrapped) { const v = frames.map(f => f[n] || 0); if (mean(v) > 0.005) o.fases[n] = Object.assign(stat(v), { aninhada: NESTED.has(n) || undefined }); }
    const top = n => mean(frames.map(f => f[n] || 0));
    const render = top('postRender'), ui = top('drawMinimap') + top('updateRadio') + top('updateMenuPreview') + top('updatePhonePreview') + top('updateAudio');
    o.resumoMs = { total: +mean(frames.map(f => f.total)).toFixed(2), render_postRender: +render.toFixed(2), ui_minimapa_radio_audio: +ui.toFixed(2), logica_resto: +(mean(frames.map(f => f.total)) - render - ui).toFixed(2) };
    const sf = frames.filter(f => f.shadowFrame === 1), nf = frames.filter(f => f.shadowFrame === 0);
    o.drawCalls = { cenaComSombra: Math.round(mean(sf.map(f => f.scCalls || 0))), cenaSemSombra: Math.round(mean(nf.map(f => f.scCalls || 0))), tudoNoQuadro: Math.round(mean(frames.map(f => f.allCalls))) };
    o.triangulos = { cenaComSombra: Math.round(mean(sf.map(f => f.scTris || 0))), cenaSemSombra: Math.round(mean(nf.map(f => f.scTris || 0))) };
    o.heapMB = { ini: +frames[0].heap.toFixed(0), fim: +frames[frames.length - 1].heap.toFixed(0) };
    o.renderMsComSombra = +mean(sf.map(f => f.postRender || 0)).toFixed(2); o.renderMsSemSombra = +mean(nf.map(f => f.postRender || 0)).toFixed(2);
    return o;
  }
  function census() {
    const c = { meshes: 0, visiveis: 0, skinned: 0, instanced: 0, instancias: 0, luzes: 0, objetosNaCena: 0, materiais: new Set(), shadowCasters: 0 };
    scene.traverse(o => { c.objetosNaCena++; if (o.isLight) c.luzes++; if (o.isMesh) { c.meshes++; if (o.visible) c.visiveis++; if (o.isSkinnedMesh) c.skinned++; if (o.isInstancedMesh) { c.instanced++; c.instancias += o.count; } if (o.castShadow) c.shadowCasters++; if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => c.materiais.add(m.uuid)); } });
    c.materiais = c.materiais.size;
    const i = renderer.info; c.geometrias = i.memory.geometries; c.texturas = i.memory.textures; c.programas = i.programs ? i.programs.length : 0;
    c.peds = peds.length; c.pedsAndando = peds.filter(n => n.mode === 'walker').length; c.carros = cars.length; c.carrosIA = cars.filter(k => k.ai).length; c.carrosEstacionados = cars.filter(k => k.parked).length; c.viaturas = cars.filter(k => k.cop).length;
    c.jacares = typeof gators !== 'undefined' ? gators.length : 0; c.policiaCalor = police.heat; c.hora = +hour.toFixed(2);
    if (typeof pigeons !== 'undefined' && pigeons.length != null) c.pombos = pigeons.length;
    if (performance.memory) c.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(0);
    return c;
  }
  // piloto automático simples: segue de um ponto a outro da avenida (z fixo) com teclas
  function makeAutopilot(zRoad, xA, xB) {
    let tgt = xB, stuck = 0, lastX = 0, lastZ = 0, log = { vmax: 0, vsoma: 0, n: 0, reposicoes: 0 };
    const f = () => {
      const c = player.car; if (!c) return;
      if (Math.abs(c.x - tgt) < 40) tgt = tgt === xB ? xA : xB;
      const want = Math.atan2(tgt - c.x, (zRoad - c.z) * 0.6), diff = wrapA(want - c.h);
      keys.KeyW = true; keys.KeyS = false; keys.KeyA = diff > 0.04; keys.KeyD = diff < -0.04;
      const v = Math.abs(c.speed); log.vmax = Math.max(log.vmax, v); log.vsoma += v; log.n++;
      stuck = v < 1.5 ? stuck + 1 / 60 : 0;
      if (stuck > 3) { c.x = c.x + Math.sign(tgt - c.x) * 20; c.z = zRoad; c.h = Math.sign(tgt - c.x) > 0 ? Math.PI / 2 : -Math.PI / 2; delete c.physics; c.speed = 8; stuck = 0; log.reposicoes++; }
    };
    f.log = log; return f;
  }
  function takeCar(x, z, h) {
    let c = cars.find(k => k.ai && !k.cop && !k.ems && !k.chase && k.kind !== 'bike' && k.kind !== 'prop');
    if (!c) throw new Error('nenhum carro de trânsito disponível');
    c.ai = false; c.chase = false; c.police = false; c.ems = null; c.torPatrol = false; c.parked = false; c.sleep = false; c.driverGone = true; if (c.rider) c.rider.group.visible = false; if (c.driver) c.driver.group.visible = false;
    c.x = x; c.z = z; c.h = h; c.speed = 0; delete c.physics;
    player.x = x; player.z = z; player.car = c; player.mesh.visible = false; cam.a = c.h;
    return c;
  }
  function releaseKeys() { keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false; }
  function fillCrowd() {            // enche pedestres e trânsito até o limite do jogo
    const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z;
    for (let k = 0; k < 300 && peds.length < 140; k++) { try { manageNpcs(1); spawnWalkerNear(px, pz, cam, false); } catch (e) {} if (k % 10 === 0) simFrame(); }
    for (let k = 0; k < 500 && cars.length < 88; k++) { try { spawnTrafficCar(px, pz); if (k % 3 === 0) spawnParkedCar(px, pz); } catch (e) {} }
  }

  /* ---- cenários ---- */
  const cenarios = {
    a: { nome: 'Centro de SP, parado (a pé)', setup() { teleport(rc(4), rc(4) + 9, 90); }, warm: 12 },
    b: { nome: 'Avenida movimentada dirigindo', setup() { teleport(rc(1) + 40, rc(4), 90); sim(6); const c = takeCar(rc(1) + 40, rc(4), Math.PI / 2); autopilot = makeAutopilot(rc(4), rc(1) + 30, rc(7)); this.ap = autopilot; }, warm: 8 },
    c: { nome: 'Favela (Morro da Esperança)', setup() { const F = FAVS[0]; teleport(F.cx - 20, F.cz, 90); }, warm: 14 },
    d: { nome: 'Beira de praia / Rio de Janeiro', setup() { teleport(RJ.cx, RJ.z1 + 14, 0); }, warm: 14 },
    e: { nome: 'Estresse (máximo de gente e carros + polícia)', setup() { teleport(rc(4), rc(4) + 9, 90); sim(4); fillCrowd(); try { crime(5, 'teste de desempenho'); } catch (e) {} }, warm: 12 }
  };
  const key = only === 'v' ? 'e' : only, sc = cenarios[key];
  if (!sc) return { erro: 'perf=' + only + ' desconhecido' };
  out.nome = sc.nome;
  sc.setup(); sim(sc.warm); if (key === 'e') { fillCrowd(); sim(4); }
  releaseKeys();

  if (only !== 'v') {
    recOn = true; rec = []; lastNow = 0;
    sim(10); recOn = false;
    out.sim10s = summarize(rec);
    if (sc.ap) out.pilotoAuto = { vmax_ms: +sc.ap.log.vmax.toFixed(1), vmedia_ms: +(sc.ap.log.vsoma / Math.max(1, sc.ap.log.n)).toFixed(1), reposicoes: sc.ap.log.reposicoes };
    // custo do updateMapGens (rodava por timer de 0,5 s)
    out.censo = census();
    // tempo real: fps de verdade + GPU
    out.tempoReal = await realtime(5000, { query: true });
    out.tempoRealFinish = await realtime(5000, { finish: true });
    out.censoDepois = { peds: peds.length, carros: cars.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null };
  } else {
    // variantes de GPU (cenário de estresse): cada uma 4 s em tempo real com finish
    const V = {};
    const run = async (nome, fn, undo) => { fn(); await realtime(1500);  V[nome] = await realtime(4000, { finish: true, query: true }); if (undo) undo(); };
    await run('base', () => {});
    await run('sem_sombra', () => { sunLight.castShadow = false; renderer.shadowMap.needsUpdate = true; }, () => { sunLight.castShadow = true; });
    await run('escala_0.5', () => { POST.scale = 0.5; postResize(); }, () => { POST.scale = 1; postResize(); });
    await run('sem_bloom', () => { POST.bloom = false; }, () => { POST.bloom = true; });
    await run('sem_pos_processamento', () => { POST.enabled = false; }, () => { POST.enabled = true; });
    await run('so_logica_sem_render', () => { window.__noRender = true; const o = renderer.render; renderer.render = () => {}; window.__restore = () => { renderer.render = o; }; }, () => { window.__restore(); });
    out.variantes = V; out.censo = census();
  }
  autopilot = null; releaseKeys(); out.quadrosDespausados = pausedCount;
  return out;
})()
