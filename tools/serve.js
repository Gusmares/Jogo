// Servidor de desenvolvimento: node tools/serve.js [porta]
//   jogo:   http://localhost:8080          editor de mapa (NEON ENGINE no navegador): http://localhost:8080/editor.html
// O editor no navegador salva o mapa por aqui (rotas /__engine/*); "Testar no jogo" abre uma aba nova.
'use strict';
const http = require('http'), path = require('path');
const root = path.resolve(__dirname, '..'), port = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const statics = require('../electron/static-server')(root), api = require('../editor/app/engine-api')({ root, desktop: false });
http.createServer((req, res) => { if (!api(req, res)) statics(req, res); }).listen(port, '127.0.0.1', () => console.log('NEON COAST em http://localhost:' + port + '   (editor: /editor.html)'));
