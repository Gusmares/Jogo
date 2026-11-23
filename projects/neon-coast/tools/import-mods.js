// Converte TUDO do catálogo automático (tools/auto-catalog.json, gerado por mods-catalog.js) e atualiza assets/catalog.json.
//   node tools/import-mods.js            converte só o que ainda não existe
//   node tools/import-mods.js --force    reconverte tudo        --only vehicles|skins|weapons     --id <id>
// Depois de converter: gera o detalhe médio dos carros pesados (decimate-vehicles) e o atlas/LOD das skins (atlas-skins).
'use strict';
const fs = require('fs'), path = require('path');
const { convertVehicle } = require('../../../engine/tools/convert-dff');
const { convertSkin } = require('../../../engine/tools/convert-skin');
const root = path.resolve(__dirname, '..'), A = require('./auto-catalog.json');
const force = process.argv.includes('--force'), only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null, idArg = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null, prefix = process.argv.includes('--prefix') ? process.argv[process.argv.indexOf('--prefix') + 1] : null;
const done = (dir, file) => !force && fs.existsSync(path.join(root, dir, file));
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

/* física a partir do handling original do SA (massa, velocidade máxima, aceleração, tração, freio) */
function physicsFrom(v, man) {
  const H = v.sa_handling, len = man ? man.dims.len : 4.4, height = man ? man.dims.height : 1.5, bike = v.kind === 'bike';
  const mass = H ? clampN(H.mass, 120, 16000) : bike ? 300 : 1200;
  let cat = bike ? (mass < 220 ? 'scooter' : 'bike') : (/bus|coach|onibus|ônibus/i.test(v.sa + ' ' + v.name) || len > 10.5) ? 'bus' : (mass > 5000 || len > 8) ? 'truck' : (mass > 2600 || len > 5.6) ? 'van' : (height > 1.85 || mass > 1750) ? 'suv' : 'compact';
  const vmax = H ? H.vmax : 160, acc = H ? H.accel : 15;
  const hp = Math.round(clampN(mass * acc * 0.0055 * (vmax / 180), bike ? 12 : 55, bike ? 200 : 700));
  const out = { cat, mass: Math.round(cat === 'bus' || cat === 'truck' ? Math.max(mass, 6000) : mass), hp };
  if (H) { out.drive = { F: 'front', R: 'rear', 4: 'all' }[H.drive] || undefined; out.grip = +clampN(1.05 + (H.traction - 0.7) * 1.4, 0.95, 1.6).toFixed(2); }
  return out;
}
function handlingFrom(v) {
  const H = v.sa_handling, bike = v.kind === 'bike';
  const maxSpeed = H ? clampN(H.vmax * 0.66 / 3.6, 14, 75) : bike ? 30 : 38;
  return { maxSpeed: +maxSpeed.toFixed(1), acceleration: H ? +clampN(H.accel * 0.6, 4, 24).toFixed(1) : 11, brake: H ? +clampN(H.brake * 3.8, 14, 36).toFixed(1) : 25, cruise: [+(maxSpeed * 0.24).toFixed(1), +(maxSpeed * 0.36).toFixed(1)] };
}

const results = { ok: [], fail: [] };
if (!only || only === 'vehicles') for (const v of A.vehicles) {
  if (idArg && v.id !== idArg) continue; if (prefix && !v.id.startsWith(prefix)) continue; if (done('assets/models/' + v.id, 'model.json')) { results.ok.push(v.id); continue; }
  const emergency = ['policia', 'choque', 'pf', 'caveirao', 'samu', 'bombeiros', 'exercito'].includes(v.service);
  const cfg = { id: v.id, name: v.name, kind: v.kind, dff: v.dff, txd: v.txd, emergency, trafficWeight: v.trafficWeight, handling: handlingFrom(v), lodTris: 6000,
    extra: { service: v.service || null, unit: v.unit || null, source: v.source, physics: physicsFrom(v, null) } };
  try { convertVehicle(cfg);
    const mf = path.join(root, 'assets/models', v.id, 'model.json'), man = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (!(man.dims.len > 0.8 && man.dims.len < 25 && man.dims.height > 0.5 && man.dims.height < 8 && man.wheels.length >= (v.kind === 'bike' ? 2 : 3))) throw new Error('dimensões/rodas fora do normal: ' + JSON.stringify(man.dims) + ' rodas ' + man.wheels.length);
    man.physics = Object.assign(physicsFrom(v, man), { service: v.service || null }, v.sa_handling ? { sa: v.sa_handling } : {});   // sa: handling original → perfil de física (car-physics-core.js) fs.writeFileSync(mf, JSON.stringify(man)); results.ok.push(v.id);
  } catch (e) { results.fail.push(v.id + ': ' + e.message.split('\n')[0].slice(0, 120)); fs.rmSync(path.join(root, 'assets/models', v.id), { recursive: true, force: true }); }
}
if (!only || only === 'skins') for (const s of A.skins) {
  if (idArg && s.id !== idArg) continue; if (done('assets/models/skins/' + s.id, 'skin.json')) { results.ok.push(s.id); continue; }
  try { convertSkin({ id: s.id, name: s.name, unit: s.unit, role: s.role, dff: s.dff, txd: s.txd });
    const m = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/skins', s.id, 'skin.json'), 'utf8')), h = m.maxY - m.minY;
    if (!(h > 1.4 && h < 2.3) || m.bones.length < 20) throw new Error('altura/ossos estranhos: ' + h.toFixed(2) + ' m, ' + m.bones.length + ' ossos');
    results.ok.push(s.id);
  } catch (e) { results.fail.push(s.id + ': ' + e.message.split('\n')[0].slice(0, 120)); fs.rmSync(path.join(root, 'assets/models/skins', s.id), { recursive: true, force: true }); }
}
if (!only || only === 'weapons') for (const w of A.weapons) {
  if (idArg && w.id !== idArg) continue; if (done('assets/models/' + w.id, 'model.json')) { results.ok.push(w.id); continue; }
  try { convertVehicle({ id: w.id, name: w.name, dff: w.dff, txd: w.txd, kind: 'prop', emergency: false }); results.ok.push(w.id); }
  catch (e) { results.fail.push(w.id + ': ' + e.message.split('\n')[0].slice(0, 120)); }
}
console.log('\nOK:', results.ok.length, ' FALHAS:', results.fail.length); results.fail.forEach(f => console.log('  ✗', f));
require('./catalog').writeCatalog();
