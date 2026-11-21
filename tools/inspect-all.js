// Resumo de todos os DFF de um diretório: quadros relevantes, triângulos, plugins de esqueleto/pele.
'use strict';
const { fs, T, chunks, child, first, cstr } = require('./rw');
const path = require('path');

function walk(d, out = []) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; }
const files = walk(process.argv[2]).filter(f => /\.dff$/i.test(f));
for (const f of files) {
  try {
    const buf = fs.readFileSync(f), clump = chunks(buf, 0, buf.length).find(c => c.type === T.CLUMP);
    const fl = first(buf, clump, T.FRAMELIST), nf = buf.readUInt32LE(first(buf, fl, T.STRUCT).start);
    const names = [];
    child(buf, fl, T.EXTENSION).forEach(ex => { const fr = first(buf, ex, T.FRAME); names.push(fr ? cstr(buf, fr.start, fr.end) : ''); });
    const geos = child(buf, first(buf, clump, T.GEOMETRYLIST), T.GEOMETRY);
    let tris = 0, verts = 0, skin = 0;
    geos.forEach(g => {
      const s = first(buf, g, T.STRUCT); tris += buf.readUInt32LE(s.start + 4); verts += buf.readUInt32LE(s.start + 8);
      const ex = first(buf, g, T.EXTENSION); if (ex && chunks(buf, ex.start, ex.end).some(c => c.type === 0x116)) skin++;
    });
    const key = names.filter(n => /wheel|rotor|door_|bonnet|boot|chassis|bip01|prop|swingarm|forks|handlebars|steer|^root|siren|light/i.test(n));
    console.log(`\n== ${path.relative(process.argv[2], f)} (${(buf.length / 1048576).toFixed(1)} MB) v0x${clump.version.toString(16)}`);
    console.log(`   quadros=${nf} geometrias=${geos.length} tris~${tris} verts~${verts} geometrias_com_pele=${skin}`);
    console.log('   chave:', [...new Set(key)].slice(0, 40).join(', '));
    if (skin) console.log('   quadros (primeiros 30):', names.slice(0, 30).join(' | '));
  } catch (e) { console.log('\n== ' + f + ' ERRO ' + e.message); }
}
