// Ferramenta de planejamento do morro/favela: roda o relevo fora do jogo e imprime o perfil do morro e da ladeira de acesso.
// Uso: node tools/plan-favela.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const util = fs.readFileSync(path.join(root, 'js/core/util.js'), 'utf8');
const terr = fs.readFileSync(path.join(root, 'js/world/terrain.js'), 'utf8');
// só a parte "pura" do terreno (até a definição de rawH), sem malha nem THREE
const cut = terr.indexOf('for(let iz=0;iz<=NZ;iz++)for(let ix=0;ix<=NX;ix++){');
const code = util + '\n' + terr.slice(0, cut).replace("const HG=new Float32Array(W1*(NZ+1)),LDG=new Float32Array(HG.length),SWG=new Float32Array(HG.length),WCG=new Float32Array(HG.length),HFG=new Float32Array(HG.length);", 'const HG=[],LDG=[],SWG=[],WCG=[],HFG=[];') + `
;({ rawBase, rawH, FAV, FAV_ROAD, favelaMask, morroH, ridgeX, FAV_FLATS, HALF, WL });`;
const api = vm.runInNewContext(code, { document: { getElementById() { return null; } }, THREE: {}, window: {}, console });
const { rawH, FAV, FAV_ROAD, morroH, favelaMask } = api;
console.log('centro', FAV.x, FAV.z, 'pico', rawH(FAV.x, FAV.z).toFixed(1));
let out = '';
for (let z = -230; z <= 50; z += 14) { let r = String(z).padStart(5) + ' '; for (let x = 300; x <= 560; x += 6) { const h = rawH(x, z); r += h < -0.05 ? '~' : h < 2 ? '.' : h < 8 ? '1' : h < 16 ? '2' : h < 24 ? '3' : h < 32 ? '4' : h < 40 ? '5' : '6'; } out += r + '\n'; }
console.log(out);
if (FAV_ROAD && FAV_ROAD.length) {
  let L = 0, maxG = 0, bad = 0; for (let i = 1; i < FAV_ROAD.length; i++) { const a = FAV_ROAD[i - 1], b = FAV_ROAD[i], d = Math.hypot(a[0] - b[0], a[1] - b[1]); L += d; const g = Math.abs(rawH(a[0], a[1]) - rawH(b[0], b[1])) / d; if (g > maxG) maxG = g; if (g > 0.16) bad++; }
  console.log('ladeira: pontos', FAV_ROAD.length, 'comprimento', L.toFixed(0), 'm, grade máx', maxG.toFixed(2), 'trechos > 16%:', bad, 'altura final', FAV_ROAD[FAV_ROAD.length - 1][2].toFixed(1));
}
if (FAV_ROAD && FAV_ROAD.length) {
  let maxG = 0, row = []; for (let i = 1; i < FAV_ROAD.length; i++) { const a = FAV_ROAD[i - 1], b = FAV_ROAD[i], d = Math.hypot(a[0] - b[0], a[1] - b[1]), g = (b[2] - a[2]) / d; if (Math.abs(g) > maxG) maxG = Math.abs(g); if (i % 10 === 0) row.push(`${i}:${a[0].toFixed(0)},${a[1].toFixed(0)} h${a[2].toFixed(0)} g${(g * 100).toFixed(0)}%`); }
  console.log('suavizado: grade máx', (maxG * 100).toFixed(0) + '%'); console.log(row.join('\n'));
}
