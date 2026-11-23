// Conversão reproduzível dos mods locais. Não executa plugins CLEO/ASI.
'use strict';
const fs = require('fs'), path = require('path');
const { convertVehicle } = require('../../../engine/tools/convert-dff');
const { loadTXD, encodePNG } = require('../../../engine/tools/txd');
const { modFile } = require('../../../engine/tools/mods');
const root = path.resolve(__dirname, '..'), cfg = require('./assets.json');
const writeJSON = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); };
function importModels() {
  for (const v of cfg.vehicles) convertVehicle(v);
  for (const w of cfg.weapons) convertVehicle({ ...w, kind: 'prop', emergency: false });
  writeJSON(path.join(root, 'assets/catalog.json'), {
    vehicles: cfg.vehicles.map(v => ({ id: v.id, weight: v.trafficWeight })),
    weapons: cfg.weapons.map(({ dff, txd, ...w }) => w), disabled: cfg.disabled
  });
}
function importRadio() {
  const durationByUrl = new Map();
  try { const previous = JSON.parse(fs.readFileSync(path.join(root, 'assets/radio/stations.json'), 'utf8')); for (const t of [...previous.stations.flatMap(s=>s.tracks), ...(previous.ads||[])]) if(t.duration>0)durationByUrl.set(t.url,t.duration); } catch {}
  const base = path.join(modFile('mods/Radios Brasileiras GTA Brasil'), 'GTA Brasil/RADIO');
  const streams = path.join(base, 'audio/streams_atp'), out = path.join(root, 'assets/radio');
  const labels = Object.fromEntries(fs.readFileSync(path.join(base, 'cleo/cleo_text/ATP.fxt'), 'utf8').split(/\r?\n/).map(l => l.match(/^(\S+)\s+(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));
  const channels = [...fs.readFileSync(path.join(streams, 'channels.ini'), 'utf8').matchAll(/^\d+\s*=\s*(\w+)/gm)].map(m => m[1]);
  const stations = channels.map(id => {
    const dir = path.join(streams, id), dest = path.join(out, id); fs.mkdirSync(dest, { recursive: true });
    const tracks = fs.readdirSync(dir).filter(f => /^Track_\d+\.(atp|mp3|ogg|wav)$/i.test(f)).sort((a,b) => a.localeCompare(b, undefined, {numeric:true})).map(f => {
      const source = path.join(dir, f), header = Buffer.alloc(12), fd = fs.openSync(source, 'r'); fs.readSync(fd, header, 0, 12, 0); fs.closeSync(fd);
      const magic = header.toString('ascii', 0, 4);
      const ext = magic === 'OggS' ? '.ogg' : magic === 'RIFF' ? '.wav' : header.toString('ascii',0,3) === 'ID3' || (header[0] === 255 && (header[1] & 224) === 224) ? '.mp3' : null;
      if (!ext) throw new Error('Áudio não reconhecido: ' + source);
      const n = Number(f.match(/\d+/)[0]), name = 'track_' + n + ext;
      fs.copyFileSync(source, path.join(dest, name));
      return { title: labels[id + n] || 'Faixa ' + (n + 1), url: 'assets/radio/' + id + '/' + name };
    });
    return { id, name: labels[id + 'T'] || id, tracks };
  });
  const adsDir=path.join(out,'ADS');fs.mkdirSync(adsDir,{recursive:true});
  const ads=fs.readdirSync(path.join(streams,'ADS')).filter(f=>f.endsWith('.ogg')).sort().map(f=>{
    fs.copyFileSync(path.join(streams,'ADS',f),path.join(adsDir,f));return {title:'Intervalo · GTA Brasil',url:'assets/radio/ADS/'+f};
  });
  for (const track of [...stations.flatMap(s=>s.tracks),...ads]) if(durationByUrl.has(track.url))track.duration=durationByUrl.get(track.url);
  writeJSON(path.join(out, 'stations.json'), { stations, ads });
  console.log('Rádio:', stations.length, 'estações,', stations.reduce((n,s)=>n+s.tracks.length,0), 'faixas (áudio original, sem recompressão).');
}
function importRoads() {
  const base = path.join(modFile('mods/Ruas_Brasileiras___40_MixMods__41_'), 'Ruas Brasileiras - MixMods');
  const txd = loadTXD(path.join(base, 'roadslahills.txd')), out = path.join(root, 'assets/world');
  fs.mkdirSync(out, { recursive: true });
  for (const name of ['roadnew4_256', 'pavebsand256']) {
    if (!txd[name]) throw new Error('Textura ausente: ' + name);
    let img=txd[name];
    if(name==='roadnew4_256'){
      // Remove a faixa lateral do tile; a cidade já desenha sua própria sinalização.
      const size=384,rgba=Buffer.alloc(size*size*4);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<4;c++)rgba[(y*size+x)*4+c]=img.rgba[((y+64)*img.w+x+32)*4+c];
      img={w:size,h:size,rgba,hasAlpha:false};
    }
    fs.writeFileSync(path.join(out, name + '.png'), encodePNG(img));
  }
  console.log('Ruas brasileiras: asfalto e calçada convertidos.');
}
try {
  const only = process.argv[2];
  if (!only || only === '--models') importModels();
  if (!only || only === '--radio') importRadio();
  if (!only || only === '--roads') importRoads();
  if (only && !['--models','--radio','--roads'].includes(only)) throw new Error('Opção desconhecida: ' + only);
} catch (e) { console.error(e); process.exitCode = 1; }
