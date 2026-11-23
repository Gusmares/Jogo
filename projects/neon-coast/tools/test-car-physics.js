// Bancada de testes da física de veículos (fora do jogo), com carros REAIS (assets/models/<id>/model.json).
//   node tools/test-car-physics.js                  carros de referência
//   node tools/test-car-physics.js br_sultan vw_gol    só esses
//   node tools/test-car-physics.js --all            todos (tabela resumida)
'use strict';
const fs = require('fs'), path = require('path');
const CP = require('../js/entities/car-physics-core.js');
const root = path.resolve(__dirname, '..');
// modo da física: --modo gta4 (padrão) ou --modo neon; a tabela do GTA IV vem de assets/physics/gta4-handling.json (gerada por engine/tools/gta4-handling.js)
{ const mi = process.argv.indexOf('--modo'); CP.setMode(mi > 0 ? process.argv[mi + 1] : 'gta4'); const tf = path.join(root, 'assets/physics/gta4-handling.json'); if (fs.existsSync(tf)) CP.setGTA4(JSON.parse(fs.readFileSync(tf, 'utf8'))); }
const flat = (grip = 1, name = 'asfalto') => () => ({ height: 0.06, name, grip, rolling: name === 'asfalto' ? 0 : 0.45, gx: 0, gz: 0 });
const slope = deg => { const t = Math.tan(deg * Math.PI / 180); return (x, z) => ({ height: 0.06 + z * t, name: 'asfalto', grip: 1, rolling: 0, gx: 0, gz: t }); };

function load(id) {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/models', id, 'model.json'), 'utf8'));
  return { id, name: man.name, kind: man.kind, len: man.dims.len, dims: man.dims, physicsCfg: man.physics || null, service: man.service || (man.physics && man.physics.service),
    wheels: man.wheels.map(w => ({ x: w.pos[0], y: w.pos[1], z: w.pos[2], r: w.r, front: w.front })) };
}
function make(M, sample, speed = 0, h = 0) {
  const c = { x: 0, z: 0, h, speed, steer: 0, kind: M.kind, len: M.len, modelId: M.id, dims: M.dims, physicsCfg: M.physicsCfg, service: M.service, wr: M.wheels[0].r };
  CP.create(c, M.wheels.map(w => ({ ...w })), {}, sample); return c;
}
function run(c, secs, inputFn, sample, onStep) { const dt = CP.STEP; for (let t = 0; t < secs; t += dt) { CP.step(c, inputFn(t, c), dt, sample); if (onStep) onStep(t, c); } }
const f = (v, n = 1) => (+v).toFixed(n), kmh = v => (v * 3.6).toFixed(0), deg = r => (r * 57.3).toFixed(0);
const hold = (c, v) => c.speed < v ? 0.6 : 0.1;       // mantém velocidade

function bench(M) {
  const S = flat(), r = {};
  let c = make(M, S), t100 = null;
  run(c, 40, () => ({ throttle: 1 }), S, (t, cc) => { if (t100 === null && cc.speed * 3.6 >= 100) t100 = t; });
  r.t100 = t100; r.vtop = c.speed;
  c = make(M, S, 100 / 3.6); let dist = 0, stop = null;
  run(c, 12, () => ({ brake: 1 }), S, (t, cc) => { if (stop === null) { dist += cc.speed * CP.STEP; if (cc.speed < 0.3) stop = t; } }); r.brake100 = dist;
  // aderência em regime (volante cheio, mantendo a velocidade): g laterais e quanto o carro "anda de lado"
  for (const v of [60, 100]) { c = make(M, S, v / 3.6); let g = 0, b = 0, cnt = 0;
    run(c, 4, (t, cc) => ({ throttle: hold(cc, v / 3.6), steer: 1 }), S, (t, cc) => { if (t > 2) { g += Math.abs(cc.physics.yawV * cc.speed) / 9.81; b = Math.max(b, Math.abs(cc.physics.beta)); cnt++; } });
    r['g' + v] = g / cnt; r['b' + v] = b; r['v' + v] = c.speed * 3.6; }
  // raio de giro a 15 km/h
  c = make(M, S, 15 / 3.6); let yaw = 0, k = 0; run(c, 4, (t, cc) => ({ throttle: hold(cc, 15 / 3.6), steer: 1 }), S, (t, cc) => { if (t > 2) { yaw += Math.abs(cc.physics.yawV); k++; } }); r.radius = (15 / 3.6) / (yaw / k);
  // resposta da direção a 80 km/h: tempo até 63% do giro final
  c = make(M, S, 80 / 3.6); let tr = null; const yawF = (() => { const cc = make(M, S, 80 / 3.6); run(cc, 2.5, (t, q) => ({ throttle: hold(q, 80 / 3.6), steer: 0.5 }), S); return Math.abs(cc.physics.yawV); })();
  run(c, 2.5, (t, cc) => ({ throttle: hold(cc, 80 / 3.6), steer: 0.5 }), S, (t, cc) => { if (tr === null && Math.abs(cc.physics.yawV) > yawF * 0.63) tr = t; }); r.resp = tr;
  // curva rápida soltando o acelerador (tendência de rodar): deriva máxima
  c = make(M, S, 110 / 3.6); let bmax = 0; run(c, 3, (t) => ({ throttle: t < 1 ? 0.5 : 0, steer: 1 }), S, (t, cc) => { bmax = Math.max(bmax, Math.abs(cc.physics.beta)); }); r.liftBeta = bmax;
  // freio de mão a 60 km/h com volante: quanto gira em 1,2 s
  c = make(M, S, 60 / 3.6); const h0 = c.h; run(c, 1.2, (t) => ({ steer: 1, handbrake: t < 0.6 }), S); r.hb = Math.abs(c.h - h0);
  // saída de traseira no acelerador (30 km/h, pé embaixo, volante cheio)
  c = make(M, S, 30 / 3.6); let pb = 0; run(c, 2.5, () => ({ throttle: 1, steer: 1 }), S, (t, cc) => { pb = Math.max(pb, Math.abs(cc.physics.beta)); }); r.powerBeta = pb;
  // slalom a 90 km/h
  c = make(M, S, 90 / 3.6); let sb = 0, roll = 0; run(c, 6, (t, cc) => ({ throttle: hold(cc, 25), steer: Math.sin(t * 2.4) }), S, (t, cc) => { sb = Math.max(sb, Math.abs(cc.physics.beta)); roll = Math.max(roll, Math.abs(cc.physics.roll)); }); r.slalomBeta = sb; r.roll = roll;
  // rampa 20°
  { const SL = slope(20); c = make(M, SL); run(c, 10, () => ({ throttle: 1 }), SL); r.ramp = c.z; }
  // terra
  { const T = flat(0.7, 'terra'); c = make(M, T, 60 / 3.6); let g = 0, cnt = 0; run(c, 4, (t, cc) => ({ throttle: hold(cc, 60 / 3.6), steer: 1 }), T, (t, cc) => { if (t > 2) { g += Math.abs(cc.physics.yawV * cc.speed) / 9.81; cnt++; } }); r.gDirt = g / cnt; }
  r.cfg = c.physics.cfg; return r;
}
function benchBike(M) {
  const S = flat(), r = {}; let c = make(M, S), t100 = null;
  run(c, 40, () => ({ throttle: 1 }), S, (t, cc) => { if (t100 === null && cc.speed * 3.6 >= 100) t100 = t; }); r.t100 = t100; r.vtop = c.speed;
  c = make(M, S, 100 / 3.6); let dist = 0, stop = null; run(c, 12, () => ({ brake: 1 }), S, (t, cc) => { if (stop === null) { dist += cc.speed * CP.STEP; if (cc.speed < 0.3) stop = t; } }); r.brake100 = dist;
  for (const v of [25, 60]) { c = make(M, S, v / 3.6); let y = 0, n = 0; run(c, 4, (t, cc) => ({ throttle: hold(cc, v / 3.6), steer: 1 }), S, (t, cc) => { if (t > 2) { y += Math.abs(cc.physics.yawV); n++; } }); r['r' + v] = c.speed / (y / n); r['g' + v] = (y / n) * c.speed / 9.81; r['lean' + v] = Math.abs(c.physics.roll); }
  r.cfg = c.physics.cfg; return r;
}
const ids = process.argv.slice(2).filter((a, i, A) => !a.startsWith('--') && A[i - 1] !== '--modo');
const all = process.argv.includes('--all');
const REF = ['honda_biz', 'moto_rocam', 'moto_moto_esportiva', 'br_pcj600', 'br_faggio', 'br_sanchez', 'moto_moto_custom', 'pmsp_moto_pm_sp', 'vw_gol', 'vw_fusca', 'palio_rp', 'br_sultan', 'br_voodoo', 'br_admiral', 'br_infernus', 'br_sentinel', 'hilux_tor', 'br_sadler', 'br_bus', 'br_linerun'];
const list = all ? fs.readdirSync(path.join(root, 'assets/models')).filter(id => { try { const m = JSON.parse(fs.readFileSync(path.join(root, 'assets/models', id, 'model.json'))); return m.kind !== 'prop' && m.wheels && m.wheels.length >= 2; } catch (e) { return false; } }) : (ids.length ? ids : REF).filter(id => fs.existsSync(path.join(root, 'assets/models', id, 'model.json')));
const bad = [];
console.log('id'.padEnd(26) + 'cat     kg   tr  0-100  máx  fr100  g60  g100 β100  raio  resp  βsolta βpé  freioMão slalomβ terra rolagem');
for (const id of list) {
  const M = load(id); if (M.kind === 'bike') { const r = benchBike(M), k = r.cfg; console.log(id.slice(0, 25).padEnd(26) + ('moto/' + k.bikeType).padEnd(14) + String(Math.round(k.mass)).padStart(5) + 'kg ' + Math.round(k.hp) + 'cv  0-100 ' + (r.t100 ? f(r.t100) + 's' : '--') + '  máx ' + kmh(r.vtop) + '  freio100 ' + f(r.brake100, 0) + 'm  raio@25 ' + f(r.r25, 1) + 'm  g@60 ' + f(r.g60, 2) + '  inclinação@60 ' + deg(r.lean60) + '°'); continue; }
  const r = bench(M), k = r.cfg;
  console.log(id.slice(0, 25).padEnd(26) + String(k.iv ? k.iv.slice(0, 9) : k.category).padEnd(10) + String(Math.round(k.mass)).padStart(6) + ' ' + k.drive[0] + '  ' + (r.t100 ? f(r.t100).padStart(5) : '  -- ') + kmh(r.vtop).padStart(6) + f(r.brake100, 0).padStart(6) + 'm' + f(r.g60, 2).padStart(6) + f(r.g100, 2).padStart(6) + (deg(r.b100) + '°').padStart(5) + (f(r.radius, 1) + 'm').padStart(7) + (r.resp ? f(r.resp, 2) : '--').padStart(6) + (deg(r.liftBeta) + '°').padStart(7) + (deg(r.powerBeta) + '°').padStart(5) + (deg(r.hb) + '°').padStart(9) + (deg(r.slalomBeta) + '°').padStart(8) + f(r.gDirt, 2).padStart(6) + (deg(r.roll) + '°').padStart(7));
  if (r.liftBeta > 0.6 || r.slalomBeta > 0.5 || r.g60 < 0.5 || r.radius > 14 || !(r.vtop > 15)) bad.push(id);
}
if (bad.length) console.log('\nATENÇÃO (rodou, não vira ou não anda):', bad.join(', '));
