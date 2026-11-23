// NEON ENGINE — lê o handling.dat do GTA IV (da cópia LOCAL do dono do jogo) e gera a tabela que a física usa no "modo GTA IV".
//   node engine/tools/gta4-handling.js [pasta com handling.dat ...]
// Padrão: research/gta4/{IV,TLAD,TBoGT}/data/handling.dat (copiados da Steam). Saída: <projeto>/assets/physics/gta4-handling.json
// Os arquivos do jogo e a tabela gerada são da Rockstar: ficam só no PC (research/ e assets/ estão fora do git). O que vai para o
// repositório é o modelo de física (car-physics-core.js) e a explicação de cada campo (engine/docs/fisica-gta4.md).
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./project');
const FIELDS = ['mass', 'drag', 'submerged', 'comX', 'comY', 'comZ', 'driveBias', 'gears', 'driveForce', 'driveInertia', 'vmax', 'brake', 'brakeBias', 'handbrake', 'steer',
  'tracMax', 'tracMin', 'tracLat', 'tracSpring', 'tracBias', 'susForce', 'susComp', 'susRebound', 'susUpper', 'susLower', 'susRaise', 'susBias',
  'dmgCollision', 'dmgWeapon', 'dmgDeform', 'dmgEngine', 'seat', 'value', 'mflags', 'hflags', 'anim'];
function parse(file, source) {
  const out = {};
  for (const line of fs.readFileSync(file, 'latin1').split(/\r?\n/)) {
    if (!/^[A-Z0-9_]/i.test(line)) continue;
    const t = line.trim().split(/\s+/); if (t.length < FIELDS.length + 1) continue;      // barcos/aviões/helicópteros têm outro formato: ficam de fora
    const v = { source };
    FIELDS.forEach((k, i) => { const s = t[i + 1]; v[k] = k === 'mflags' || k === 'hflags' ? s : Number(s); });
    if (FIELDS.slice(0, 30).some(k => typeof v[k] === 'number' && isNaN(v[k]))) continue;
    v.bike = (parseInt(v.mflags, 16) & 0x1000) !== 0 || /^(BOBBER|FAGGIO|HELLFURY|NRG900|PCJ|SANCHEZ|ZOMBIE|ANGEL|DAEMON|DIABOLUS|DOUBLE|HAKUCHOU|HEXER|INNOVATION|LYCAN|NIGHTBLADE|REVENANT|WAYFARER|WOLFSBANE|AKUMA|VADER|BATI)/.test(t[0]);
    out[t[0].toLowerCase()] = v;
  }
  return out;
}
const args = process.argv.slice(2), root = P.REPO;
const dirs = args.length ? args : ['IV', 'TLAD', 'TBoGT'].map(d => path.join(root, 'research', 'gta4', d, 'data'));
const table = {};
for (const d of dirs) {
  const f = fs.existsSync(path.join(d, 'handling.dat')) ? path.join(d, 'handling.dat') : d;
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { console.warn('sem handling.dat em', d); continue; }
  const src = path.basename(path.dirname(path.dirname(f))) || 'IV', got = parse(f, src);
  for (const [k, v] of Object.entries(got)) if (!table[k] || src === 'IV') table[k] = v;    // episódios só acrescentam carros novos
  console.log(f, '->', Object.keys(got).length, 'veículos');
}
if (!Object.keys(table).length) { console.error('Nenhum handling.dat encontrado. Copie common/data do GTA IV para research/gta4/IV/data.'); process.exit(1); }
const outDir = path.join(P.projectRoot(), 'assets', 'physics'); fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'gta4-handling.json');
fs.writeFileSync(outFile, JSON.stringify({ format: 'gta4-handling', generated: new Date().toISOString(), vehicles: table }, null, 1));
const cars = Object.values(table).filter(v => !v.bike);
console.log('Gravado', outFile, '—', cars.length, 'carros e', Object.values(table).length - cars.length, 'motos');
