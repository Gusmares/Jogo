// Gera o catálogo AUTOMÁTICO dos packs de mods (veículos, skins e armas) -> tools/auto-catalog.json
// Uso: node tools/mods-catalog.js        (depois: node tools/import-mods.js para converter tudo)
// Regras:
//  • Pack "GTA Brasil v4.1" (185 veículos): nome brasileiro de vehiclenames.fxt (chave GXT do vehicle.dat em cada .txt), handling original do SA.
//  • Packs de polícia (PM-SP, PMERJ, BAEP): viaturas, motos e fardamentos; o ID que o script do MTA substitui identifica o tipo.
//  • Skins soltas: todos os packs de personagens viram roupas do jogador e gente da rua.
//  • Armas: pack [Armas] (AK-47, M4/sniper, MP5, Uzi, Tec-9, Desert Eagle, escopetas, faca, katana, taser).
'use strict';
const fs = require('fs'), path = require('path');
const { loadDFF } = require('../../../engine/tools/dff');
const { MODS, findMod } = require('../../../engine/tools/mods');
const root = path.resolve(__dirname, '..');
const rel = p => 'mods/' + path.relative(MODS, p).replace(/\\/g, '/').split('/').slice(1).join('/');        // sem o balde
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28);
const txdFor = f => { const dir = path.dirname(f), base = path.basename(f, path.extname(f)).toLowerCase(), t = fs.readdirSync(dir).filter(n => /\.txd$/i.test(n)); const m = t.find(n => path.basename(n, path.extname(n)).toLowerCase() === base) || (t.length === 1 ? t[0] : null); return m ? path.join(dir, m) : null; };
const out = { vehicles: [], skins: [], weapons: [] };
const ids = new Set(); const uid = id => { let k = id, n = 2; while (ids.has(k)) k = id + '_' + n++; ids.add(k); return k; };

/* ---------------- 1) GTA Brasil v4.1 ---------------- */
const BR = findMod('Pack_185_vehicles_Extras_-_GTA_Brasil_v4.1_-_ImVehSys');
if (BR) {
  const base = path.join(BR, 'Pack 185 vehicles Extras - GTA Brasil v4.1 - ImVehSys'), V = path.join(base, 'VEHICLES');
  const GXT = { 0x98: 'á', 0x99: 'â', 0x9a: 'ã', 0x9c: 'ç', 0x9e: 'é', 0x9f: 'ê', 0xa2: 'í', 0xa6: 'ó', 0xa7: 'ô', 0xa8: 'õ', 0xaa: 'ú' };   // acentos na tabela da fonte do GTA SA
  const fxt = [...fs.readFileSync(path.join(base, '_CFG/CLEO/cleo_text/vehiclenames.fxt'))].map(b => b < 128 ? String.fromCharCode(b) : (GXT[b] || '')).join('');
  const names = {}; for (const l of fxt.split(/\r?\n/)) { const m = /^(\w+)\s+(.+?)\s*$/.exec(l); if (m && !l.startsWith('#')) names[m[1].toUpperCase()] = m[2]; }
  // tipos que não dá para dirigir no jogo (ainda): aviões, helicópteros, barcos, trens, reboques, controle remoto
  const SKIP = /^(at400|cargobob|maverick|polmav|raindanc|sparrow|vcnmav|launch|predator|reefer|bike$|bmx|mtbike|rc|tram|freight|streak|freiflat|artict|petrotr|utiltr|farmtr|bagbox|tugstair|frbox|sktbd|baggage|tug$|forklift|mower|combine|kart)/;
  const SERVICE = { copcarla: 'policia', copcarru: 'policia', copcarsf: 'policia', copcarvg: 'policia', copbike: 'policia', enforcer: 'choque', fbiranch: 'pf', fbitruck: 'caveirao', swatvan: 'exercito',
    barracks: 'exercito', patriot: 'exercito', rhino: 'exercito', ambulan: 'samu', firetruk: 'bombeiros', firela: 'bombeiros', securica: 'forte', hpv1000: 'policia', monster: 'policia', newsvan: 'imprensa', romero: 'funeraria', dozer: 'obra', cement: 'obra', dumper: 'obra', tractor: 'rural', duneride: 'carga' };
  for (const f of fs.readdirSync(V).filter(n => /\.dff$/i.test(n))) {
    const model = path.basename(f, '.dff').toLowerCase(); if (SKIP.test(model)) continue;
    const txt = fs.existsSync(path.join(V, model + '.txt')) ? fs.readFileSync(path.join(V, model + '.txt'), 'latin1') : '';
    const ide = new RegExp('^\\s*(\\d+)\\s*,\\s*' + model + '\\s*,\\s*\\w+\\s*,\\s*(\\w+)\\s*,\\s*(\\w+)\\s*,\\s*(\\w+)', 'im').exec(txt);
    const type = ide ? ide[2].toLowerCase() : 'car'; if (!['car', 'mtruck', 'quad', 'bike'].includes(type)) continue;
    const hl = ide && new RegExp('^\\s*' + ide[3] + '\\s+([\\d.\\-\\sA-Z]+)$', 'im').exec(txt), h = hl ? hl[1].trim().split(/\s+/) : null;
    const gxt = ide ? ide[4].toUpperCase() : model.toUpperCase(), name = names[gxt] || names[model.toUpperCase().slice(0, 7)] || model;
    const svc = SERVICE[model] || null, bike = type === 'bike';
    const H = h ? { mass: +h[0], turnMass: +h[1], drag: +h[2], com: [+h[3], +h[4], +h[5]], traction: +h[7], tractionLoss: +h[8], tractionBias: +h[9], gears: +h[10], vmax: +h[11], accel: +h[12], inertia: +h[13], drive: h[14], engine: h[15], brake: +h[16], brakeBias: +h[17], abs: +h[18], steer: +h[19], susForce: +h[20], susDamp: +h[21], susUpper: +h[23], susLower: +h[24], susBias: +h[25], antiDive: +h[26], hflags: h[31] || '0' } : null;   // handling.cfg completo do SA (dá a personalidade de cada carro)
    out.vehicles.push({ id: uid('br_' + model), name, kind: bike ? 'bike' : 'car', dff: rel(path.join(V, f)), txd: rel(path.join(V, model + '.txd')), source: 'GTA Brasil v4.1', sa: model, service: svc, sa_handling: H, trafficWeight: svc ? 0 : bike ? 2 : 3 });
  }
}

/* ---------------- 2) packs de viaturas/fardamentos ---------------- */
const SAID = { 596: 'Viatura (sedã)', 597: 'Viatura (sedã 2)', 598: 'Viatura (sedã 3)', 599: 'Viatura (SUV)', 523: 'Moto', 497: 'Helicóptero', 431: 'Ônibus', 414: 'Caminhão', 427: 'Blindado', 490: 'SUV descaracterizada', 426: 'Sedã', 445: 'Sedã', 547: 'Sedã', 587: 'Cupê', 546: 'Sedã', 467: 'Sedã', 402: 'Hatch', 516: 'Sedã', 600: 'Picape', 462: 'Scooter', 463: 'Moto custom', 468: 'Moto trilha', 521: 'Moto esportiva', 522: 'Moto esportiva 2' };
function scanPack(folder, opts) {
  const dir = findMod(folder); if (!dir) return;
  for (const f of walk(dir).filter(p => /\.dff$/i.test(p))) {
    const t = txdFor(f); if (!t) continue;
    let d; try { d = loadDFF(f); } catch (e) { continue; }
    const names = d.frames.map(x => x.name.toLowerCase()), skin = d.geos.some(g => g.skin), wheels = names.filter(n => /^wheel_(lf|rf|lb|rb)_dummy$/.test(n)).length;
    const bike = names.includes('wheel_front') || names.includes('forks_front'), air = names.some(n => /rotor|rudder|elevator|aileron/.test(n));
    const relDir = path.relative(dir, path.dirname(f)).replace(/\\/g, '/'), base = path.basename(f, path.extname(f));
    const num = +((/(\d{2,3})/.exec(base) || [])[1] || 0); if (num === 497 || air) continue;      // helicópteros: ainda sem voo
    const label = opts.label(relDir, base, num);
    if (skin) out.skins.push({ id: uid(opts.prefix + '_' + slug(label)), name: label.replace(/[_\[\]]+/g, ' ').replace(/\s+/g, ' ').trim(), dff: rel(f), txd: rel(t), source: folder, role: opts.role ? opts.role(relDir, base, num) : 'civil', unit: opts.unit || null });
    else if (wheels >= 2 || bike) out.vehicles.push({ id: uid(opts.prefix + '_' + slug(label)), name: label, kind: bike ? 'bike' : 'car', dff: rel(f), txd: rel(t), source: folder, service: opts.service || null, unit: opts.unit || null, trafficWeight: opts.service ? 0 : (bike ? 2 : 3) });
    else if (air) { /* helicópteros: ainda sem voo */ }
  }
}
const skinLabel = (prefix) => (dirr, base, num) => {
  const last = dirr.split('/').pop() || '', clean = last.replace(/\[[^\]]*\]/g, ' ').replace(/^skin[-_ ]*/i, '').replace(/[-_]+/g, ' ').trim();
  const generic = !clean || /^\d+$|pack|^skins?$|diferenciad|^s$|^skin\s*\w*$|^f\d+$|mulher$|^fem$|^flam$/i.test(clean);
  const fem = /mulher|fem|^f\d+$/i.test(clean) || /mulher|fem/i.test(last);
  return generic ? prefix + ' ' + (/^\d+$/.test(base) ? base : base.replace(/[-_]+/g, ' ')) + (fem ? ' (mulher)' : '') : clean;
};
scanPack('Pack-PM', { prefix: 'pmsp', service: 'policia', unit: 'pmsp', label: (d, b, n) => /skin/i.test(d) ? 'Policial PM-SP ' + n : (SAID[n] || 'Viatura') + ' PM-SP', role: () => 'policia' });
scanPack('Pack-PMERJ', { prefix: 'pmerj', service: 'policia', unit: 'pmerj', label: (d, b, n) => (/skin/i.test(d) ? 'Policial PMERJ ' + n : (SAID[n] || 'Viatura') + ' PMERJ'), role: () => 'policia' });
scanPack('pack_pmerj_obs_tem_um_audi_bymosquitin_br_store', { prefix: 'pmerj2', service: 'policia', unit: 'pmerj', label: (d) => /AUDI/i.test(d) ? 'Audi A4 PMERJ' : /TRAIL/i.test(d) ? 'Trailblazer PMERJ' : /CMD/i.test(d) ? 'Comandante PMERJ' : 'Recruta PMERJ', role: () => 'policia' });
scanPack('c_policia_militar_baep_pack', { prefix: 'baep', service: 'policia', unit: 'baep', label: (d, b) => /farda/i.test(b) ? 'BAEP ' + b.replace(/farda/i, 'Farda ') : 'BAEP ' + b, role: () => 'policia' });
scanPack('pack_de_carros_baixos_doug3d', { prefix: 'baixo', label: (d) => (d.split('/').pop() || 'Carro').replace(/[_-]+/g, ' ').replace(/F!XA/gi, 'Fixa').replace(/\b\w/g, c => c.toUpperCase()).replace(/Baixo$/i, 'Rebaixado') });
scanPack('Pack_de_MOTOS', { prefix: 'moto', label: (d, b, n) => SAID[n] || 'Moto ' + n });
scanPack('Skin&CarroDoFlamengo', { prefix: 'fla', label: (d, b) => /carro/i.test(d) ? 'Carro do Flamengo' : 'Torcedor do Flamengo' });
scanPack('pack_cv_chave', { prefix: 'com', label: (d, b) => /carro/i.test(d) ? 'Picape da comunidade' : 'Morador do morro', role: () => 'faccao' });
scanPack('pack_fdn_bvo', { prefix: 'bvo', label: skinLabel('Morador'), role: () => 'faccao' });
for (const [folder, prefix, role] of [['Bandpackv', 'band', 'faccao'], ['1597994850_brasileiro', 'br', 'civil'], ['New-Pack-Skins-Gta-V', 'gtav', 'civil'], ['NOVOPackDeSkinZICO', 'zico', 'civil'], ['pack-de-skins-funckeiros', 'funk', 'civil'],
  ['Pack-De-Skinv7-ZICO', 'zico7', 'civil'], ['PackDeSkinGmZico', 'gmz', 'civil'], ['PackDeSkinGTAV', 'dias', 'civil'], ['skins-diferenciados', 'dif', 'civil'], ['skins_femininas', 'fem', 'civil'], ['[SkinsZIO]', 'zio', 'civil'], ['[skins]', 'sk', 'civil']])
  scanPack(folder, { prefix, label: skinLabel(prefix === 'fem' ? 'Mulher' : 'Pessoa'), role: (d, b) => /assalt|ladra|bandit|traf|terror|gang|crim/i.test(d) ? 'faccao' : role });

/* ---------------- 3) armas ---------------- */
const ARMAS = findMod('[Armas]PACK-DE-ARMAS');
if (ARMAS) {
  const W = [
    ['ak47', 'AK-47', 'rifle', 30, 0.1, 2.4], ['m4', 'M4A1', 'rifle', 30, 0.09, 2.3], ['sniper', 'Fuzil de precisão', 'sniper', 5, 1.1, 2.8], ['mp5lng', 'MP5', 'smg2', 30, 0.075, 2.0],
    ['micro_uzi', 'Uzi', 'smg', 32, 0.06, 1.8], ['tec9', 'Tec-9', 'smg', 32, 0.07, 1.8], ['desert_eagle', 'Desert Eagle', 'deagle', 7, 0.45, 1.8], ['colt45', 'Pistola .40', 'pistol', 15, 0.22, 1.5],
    ['chromegun', 'Escopeta calibre 12', 'shotgun', 6, 0.95, 3.2], ['shotgspa', 'Escopeta de combate', 'spas', 7, 0.35, 3.0], ['sawnoff', 'Escopeta de cano serrado', 'sawnoff', 2, 0.35, 1.8],
    ['taser', 'Taser', 'taser', 1, 1.0, 2.2], ['knifecur', 'Faca', 'knife', 0, 0.55, 0], ['katana', 'Katana', 'katana', 0, 0.7, 0]
  ];
  const all = walk(ARMAS).filter(p => /\.dff$/i.test(p));
  for (const [file, name, style, cap, interval, reload] of W) {
    const f = all.find(p => path.basename(p, '.dff').toLowerCase() === file); if (!f) continue; const t = txdFor(f); if (!t) continue;
    out.weapons.push({ id: uid('w_' + file), name, style, dff: rel(f), txd: rel(t), capacity: cap, interval, reload });
  }
}
fs.writeFileSync(path.join(__dirname, 'auto-catalog.json'), JSON.stringify(out, null, 1));
console.log('veículos', out.vehicles.length, '(serviço', out.vehicles.filter(v => v.service).length + ')', '| skins', out.skins.length, '(polícia', out.skins.filter(s => s.role === 'policia').length + ', facção', out.skins.filter(s => s.role === 'faccao').length + ')', '| armas', out.weapons.length);
