// Gera o executável do editor de mapa: node tools/build-editor.js  ->  dist/NEON ENGINE-win32-x64/NEON ENGINE.exe
// O editor NÃO leva o jogo dentro: ele abre a pasta deste projeto (gravada em project.json), porque é nela que salva
// o mapa (maps/world.json) e importa modelos. Se mover a pasta do projeto, gere o editor de novo (ou use NEON_PROJECT).
'use strict';
const path = require('path'), fs = require('fs');
const mod = require('@electron/packager');
const packager = typeof mod === 'function' ? mod : (mod.packager || mod.default);
const root = path.resolve(__dirname, '..'), app = path.join(root, 'editor', 'app');
fs.writeFileSync(path.join(app, 'project.json'), JSON.stringify({ root }, null, 2));
packager({
  dir: app, out: path.join(root, 'dist'), name: 'NEON ENGINE', platform: 'win32', arch: 'x64', overwrite: true, asar: true,
  electronVersion: require('electron/package.json').version
}).then(p => console.log('Pronto:', p.join('\n'), '\nProjeto:', root))
  .catch(err => { console.error('Falha ao gerar o editor:', err); process.exit(1); });
