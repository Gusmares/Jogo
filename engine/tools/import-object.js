// Importa um OBJETO de mapa do GTA San Andreas (DFF + TXD) para o jogo/editor: assets/models/<id>/ com kind "object".
//   node tools/import-object.js --dff "C:/caminho/poste.dff" --txd "C:/caminho/poste.txd" [--id obj_poste] [--name "Poste"]
// Usa o mesmo conversor dos carros/armas (tools/convert-dff.js), sem rodas nem luzes. O editor (NEON ENGINE) chama este script pelo botão "Importar DFF".
'use strict';
const path = require('path'), fs = require('fs');
const { convertVehicle } = require('./convert-dff');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const dff = arg('dff'), txd = arg('txd');
if (!dff || !txd) { console.error('Use: --dff <arquivo.dff> --txd <arquivo.txd> [--id obj_nome] [--name "Nome"]'); process.exit(1); }
for (const f of [dff, txd]) if (!fs.existsSync(f)) { console.error('Arquivo não existe: ' + f); process.exit(1); }
const base = path.basename(dff, path.extname(dff)).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'objeto';
const id = (arg('id') || 'obj_' + base).toLowerCase();
if (!/^[a-z0-9_]+$/.test(id)) { console.error('ID inválido (use letras minúsculas, números e _): ' + id); process.exit(1); }
try {
  convertVehicle({ id, name: arg('name') || path.basename(dff, path.extname(dff)), dff: path.resolve(dff), txd: path.resolve(txd), kind: 'object', emergency: false });
  const man = JSON.parse(fs.readFileSync(path.join(require('./project').root(), 'assets/models', id, 'model.json'), 'utf8'));
  console.log('IMPORTADO ' + JSON.stringify({ id, name: man.name, dims: man.dims }));
} catch (e) { console.error('Falhou: ' + (e && e.stack || e)); process.exit(2); }
