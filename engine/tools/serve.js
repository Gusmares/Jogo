// NEON ENGINE — servidor de desenvolvimento: node engine/tools/serve.js [pasta-do-projeto] [porta]
//   jogo:   http://localhost:8080            editor (no navegador): http://localhost:8080/__ed/editor.html
// Sem pasta, usa o projeto padrão (projects/neon-coast). "Testar" no editor abre uma aba nova.
'use strict';
const http = require('http'), path = require('path'), fs = require('fs');
const P = require('./project');
const args = process.argv.slice(2), dirArg = args.find(a => isNaN(+a)), port = parseInt(args.find(a => !isNaN(+a)) || process.env.PORT || '8080', 10);
const root = dirArg ? path.resolve(dirArg) : P.projectRoot();
if (!P.isProject(root)) { console.error('Não é um projeto do NEON ENGINE (falta neon.project.json): ' + root); process.exit(1); }
const statics = require('./static-server')(root, { '/__ed/': path.join(P.ENGINE, 'editor') });
const api = require('../app/engine-api')({ root, engine: P.ENGINE, desktop: false });
const name = (P.readManifest(root) || {}).name || path.basename(root);
http.createServer((req, res) => { if (!api(req, res)) statics(req, res); }).listen(port, '127.0.0.1', () => console.log(name + ' em http://localhost:' + port + '   (editor: /__ed/editor.html)'));
