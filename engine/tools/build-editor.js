// NEON ENGINE — gera o executável da engine: node engine/tools/build-editor.js  ->  dist/NEON ENGINE-win32-x64/NEON ENGINE.exe
// O .exe é o app de engine/app; a interface do editor e as ferramentas continuam em engine/ (o caminho vai gravado em engine.json),
// assim dá para melhorar o editor sem gerar o .exe de novo. Se mover a pasta do repositório, gere de novo.
'use strict';
const path = require('path'), fs = require('fs');
const mod = require('@electron/packager');
const packager = typeof mod === 'function' ? mod : (mod.packager || mod.default);
const P = require('./project'), app = path.join(P.ENGINE, 'app');
fs.writeFileSync(path.join(app, 'engine.json'), JSON.stringify({ root: P.ENGINE }, null, 2));
packager({
  dir: app, out: path.join(P.REPO, 'dist'), name: 'NEON ENGINE', platform: 'win32', arch: 'x64', overwrite: true, asar: true,
  electronVersion: require('electron/package.json').version
}).then(p => console.log('Pronto:', p.join('\n'), '\nEngine:', P.ENGINE))
  .catch(err => { console.error('Falha ao gerar o editor:', err); process.exit(1); });
