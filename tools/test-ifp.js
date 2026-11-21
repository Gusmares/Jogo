// Testes do leitor de IFP: valida o tamanho dos dados e lista animações. Uso: node tools/test-ifp.js <arquivo.ifp> [filtro]
'use strict';
const fs = require('fs'), vm = require('vm');
global.THREE = require('three'); global.clamp = (v, a, b) => v < a ? a : v > b ? b : v; global.lerp = (a, b, t) => a + (b - a) * t;
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname, '../js/entities/anim.js'), 'utf8').replace("'use strict';", ''));
const buf = fs.readFileSync(process.argv[2]), ifp = parseIfp(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const list = Object.values(ifp.anims), bad = list.filter(a => !a.ok);
console.log(`pacote "${ifp.pack}": ${list.length} animações, ${bad.length} com tamanho de dados inconsistente`);
const f = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
list.filter(a => !f || f.test(a.name)).slice(0, 60).forEach(a => console.log(`  ${a.name.padEnd(28)} ${a.duration.toFixed(2)}s  ossos=${a.nodes.length}  ${a.ok ? '' : '(!)'}`));
module.exports = { ifp };
