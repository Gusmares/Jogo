// Classifica cada DFF de uma pasta de mods: veículo (carro/moto/barco/avião), skin (personagem) ou arma/objeto.
// Uso: node tools/scan-mods.js [pasta=assets/mods/0-NOVOS] [--json saida.json]
// Para cada DFF acha o TXD (mesmo nome na pasta, ou o único TXD da pasta) e, em recursos do MTA, o ID que o script substitui.
'use strict';
const fs = require('fs'), path = require('path');
const { loadDFF } = require('./dff');
const root = path.resolve(__dirname, '..');
const dirArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'assets/mods/0-NOVOS';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk(path.resolve(root, dirArg));

/* IDs substituídos por scripts do MTA (engineReplaceModel / engineImportTXD com número) */
const luaIds = new Map();                  // caminho do dff (minúsculo) -> id
for (const f of files.filter(f => /\.(lua|xml)$/i.test(f))) {
  const txt = fs.readFileSync(f, 'latin1'), dir = path.dirname(f);
  for (const m of txt.matchAll(/engineLoadDFF\s*\(\s*["']([^"']+)["'][^)]*\)\s*,?\s*(\d+)?/gi)) if (m[2]) luaIds.set(path.join(dir, m[1]).toLowerCase(), +m[2]);
  for (const m of txt.matchAll(/["']([^"']+\.dff)["']\s*,\s*(\d{2,5})/gi)) luaIds.set(path.join(dir, m[1]).toLowerCase(), +m[2]);
  for (const m of txt.matchAll(/(\d{2,5})\s*,\s*["']([^"']+\.dff)["']/gi)) luaIds.set(path.join(dir, m[2]).toLowerCase(), +m[1]);
  // padrão comum: dff = engineLoadDFF("arquivo.dff"); engineReplaceModel(dff, 596)
  const vars = {}; for (const m of txt.matchAll(/(\w+)\s*=\s*engineLoadDFF\s*\(\s*["']([^"']+)["']/gi)) vars[m[1]] = m[2];
  for (const m of txt.matchAll(/engineReplaceModel\s*\(\s*(\w+)\s*,\s*(\d+)/gi)) if (vars[m[1]]) luaIds.set(path.join(dir, vars[m[1]]).toLowerCase(), +m[2]);
}

const out = [];
for (const f of files.filter(f => /\.dff$/i.test(f))) {
  const rel = path.relative(root, f).replace(/\\/g, '/'), dir = path.dirname(f), base = path.basename(f, path.extname(f)).toLowerCase();
  const txds = fs.readdirSync(dir).filter(n => /\.txd$/i.test(n));
  const txd = txds.find(n => path.basename(n, path.extname(n)).toLowerCase() === base) || (txds.length === 1 ? txds[0] : null);
  let info = { file: rel, txd: txd ? path.relative(root, path.join(dir, txd)).replace(/\\/g, '/') : null, id: luaIds.get(f.toLowerCase()) || null };
  try {
    const d = loadDFF(f), names = d.frames.map(x => x.name.toLowerCase());
    const tris = d.geos.reduce((s, g) => s + (g.indices ? g.indices.length / 3 : 0), 0);
    const skin = d.geos.some(g => g.skin), wheels = names.filter(n => /^wheel_(lf|rf|lb|rb)_dummy$/.test(n)).length;
    const bike = names.includes('wheel_front') || names.includes('forks_front') || names.includes('handlebars');
    const boat = names.some(n => /^(boat_moving|static_prop|moving_prop)/.test(n)) && !wheels;
    const plane = names.some(n => /^(rudder|elevators|aileron|prop_\d|misc_[a-c])/.test(n)) || names.some(n => /moving_rotor|static_rotor/.test(n));
    let pmin = [1e9, 1e9, 1e9], pmax = [-1e9, -1e9, -1e9];
    for (const g of d.geos) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { pmin[k] = Math.min(pmin[k], g.pos[i + k]); pmax[k] = Math.max(pmax[k], g.pos[i + k]); }
    const size = pmax.map((v, k) => +(v - pmin[k]).toFixed(2));
    const kind = skin ? 'skin' : plane ? 'aereo' : boat ? 'barco' : bike ? 'moto' : wheels >= 2 ? 'carro' : (Math.max(...size) < 2.2 ? 'arma' : 'objeto');
    Object.assign(info, { kind, tris: Math.round(tris), frames: d.frames.length, size, doors: names.filter(n => /^door_..?_dummy$/.test(n)).length });
  } catch (e) { info.kind = 'erro'; info.err = e.message.slice(0, 80); }
  out.push(info);
}
const cnt = {}; out.forEach(o => cnt[o.kind] = (cnt[o.kind] || 0) + 1);
console.log(out.length, 'DFF:', JSON.stringify(cnt));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
else for (const o of out) console.log(o.kind.padEnd(6), String(o.id || '').padEnd(5), (o.tris || 0).toString().padStart(7), o.txd ? ' ' : '!', o.file);
