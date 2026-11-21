// Rebuild the complete outfit list and accurate offline radio timings.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const catalog = require('../assets/catalog.json');
const legacy = require('./skins.json');
const skins = fs.readdirSync(path.join(root, 'assets/models/skins')).filter(id => fs.existsSync(path.join(root, 'assets/models/skins', id, 'skin.json'))).map(id => {
  const meta = catalog.skins.find(s => s.id === id) || legacy.find(s => s.id === id) || {};
  let man = {}, available = true;
  try { man = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/skins', id, 'skin.json'), 'utf8')); } catch { available = false; console.warn('Skin com arquivo inválido:', id); }
  return { id, name: meta.name || man.name || id, role: meta.role || (meta.unit && meta.unit !== 'player' ? 'policia' : 'civil'), available };
}).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
fs.writeFileSync(path.join(root, 'assets/models/skins/catalog.json'), JSON.stringify(skins, null, 2) + '\n');
const radioPath = path.join(root, 'assets/radio/stations.json');
const radio = JSON.parse(fs.readFileSync(radioPath, 'utf8'));
for (const track of [...radio.stations.flatMap(s => s.tracks), ...(radio.ads || [])]) {
  if (track.duration > 0) continue;
  track.duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path.join(root, track.url)], { encoding: 'utf8', windowsHide: true }).trim());
  if (!(track.duration > 0)) throw new Error('Duração inválida: ' + track.url);
}
fs.writeFileSync(radioPath, JSON.stringify(radio, null, 2) + '\n');
console.log(skins.length + ' skins; durações de todas as músicas e intervalos atualizadas.');
