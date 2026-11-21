// Gera o executável do jogo: node tools/build-exe.js   (saída em dist/NEON COAST-win32-x64/NEON COAST.exe)
'use strict';
const path = require('path');
const mod = require('@electron/packager');
const packager = typeof mod === 'function' ? mod : (mod.packager || mod.default);
const root = path.resolve(__dirname, '..');
const outputArg = process.argv.indexOf('--output');
if (outputArg >= 0 && !process.argv[outputArg+1]) throw new Error('Informe a pasta após --output');
const output = path.resolve(root, outputArg >= 0 ? process.argv[outputArg+1] : 'dist');
const relativeOutput = path.relative(path.join(root,'dist'),output);
if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('A saída deve ficar dentro da pasta dist do projeto');

packager({
  dir: root,
  out: output,
  name: 'NEON COAST',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  prune: true,
  asar: true,
  // não entram no executável: mods originais (24 MB), ferramentas, saídas anteriores e documentação
  ignore: [/^\/assets\/(?!models(?:\/|$)|anims(?:\/|$)|radio(?:\/|$)|world(?:\/|$)|catalog\.json$)/, /^\/dist($|\/)/, /^\/tools($|\/)/, /^\/\.claude($|\/)/, /^\/README\.md$/]
}).then(paths => console.log('Pronto:', paths.join('\n')))
  .catch(err => { console.error('Falha ao gerar o executável:', err); process.exit(1); });
