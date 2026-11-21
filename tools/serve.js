// Servidor estático mínimo (opcional): node tools/serve.js [porta]
// O jogo também abre com duplo clique em index.html; o servidor só é útil para testes e desenvolvimento.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), port = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
http.createServer(require('../electron/static-server')(root)).listen(port,'127.0.0.1', () => console.log('NEON COAST em http://localhost:' + port));
