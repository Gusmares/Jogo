// NEON ENGINE — gera o executável de um projeto: node engine/tools/build-game.js [pasta-do-projeto] [--output dist]
// Lê o neon.project.json do projeto: build.name (nome do .exe) e build.include (o que entra; o resto — mods originais,
// ferramentas, cópias do mapa — fica de fora). Saída em dist/<nome>-win32-x64/<nome>.exe na pasta do repositório.
'use strict';
const path = require('path'), fs = require('fs');
const mod = require('@electron/packager');
const packager = typeof mod === 'function' ? mod : (mod.packager || mod.default);
const P = require('./project');
const args = process.argv.slice(2), outI = args.indexOf('--output');
const dirArg = args.find((a, i) => !a.startsWith('--') && i !== outI + 1);
const root = dirArg ? path.resolve(dirArg) : P.projectRoot();
const man = P.readManifest(root);
if (!man) { console.error('Não é um projeto do NEON ENGINE (falta neon.project.json): ' + root); process.exit(1); }
if (!fs.existsSync(path.join(root, 'package.json'))) { console.error('O projeto precisa de um package.json com "main" (o app Electron do jogo).'); process.exit(1); }
const output = path.resolve(P.REPO, outI >= 0 ? args[outI + 1] : 'dist');
const name = (man.build && man.build.name) || man.name || path.basename(root);
const include = ((man.build && man.build.include) || ['index.html', 'package.json', 'neon.project.json', 'css', 'js', 'vendor', 'electron', 'maps', 'assets']).map(p => '/' + p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
/* entra: o que está em build.include (e as pastas no caminho até lá); fica de fora: o resto e as cópias de segurança do mapa */
const keep = rel => {
  if (rel === '') return false;
  if (/^\/maps\/\.?backup(\/|$)/.test(rel) || /^\/data\/\.backup(\/|$)/.test(rel) || /^\/data\/.*\.(bak|tmp)$/.test(rel)) return true;      // cópias de segurança e temporários dos editores (mapa, sockets) não vão no executável
  return !include.some(inc => rel === inc || rel.startsWith(inc + '/') || inc.startsWith(rel + '/'));
};
console.log('Projeto: ' + man.name + ' (' + root + ')');
packager({
  dir: root, out: output, name, platform: 'win32', arch: 'x64', overwrite: true, prune: false, asar: true,
  electronVersion: require('electron/package.json').version,
  ignore: keep
}).then(paths => console.log('Pronto:', paths.join('\n')))
  .catch(err => { console.error('Falha ao gerar o executável:', err); process.exit(1); });
