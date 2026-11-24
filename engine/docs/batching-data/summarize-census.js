// resume census-{a,b}-{off,on}.txt (saída de run-attr.js + attr3.js) em tabelas markdown
const fs = require('fs');
const load = f => { const t = fs.readFileSync(__dirname + '/' + f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{', t.indexOf('RESULTADO')))); };
for (const p of ['a', 'b']) for (const m of ['off', 'on']) {
  const j = load(`census-${p}-${m}.txt`);
  console.log(`\n### ${p === 'a' ? 'Centro de SP' : 'Avenida'} — ${m === 'off' ? 'ANTES (nobatch=1)' : 'DEPOIS'}: chamadas de desenho da cena (estimadas)=${j.tot.calls}, total do quadro (cena+sombra+pós)=${j.real.callsTotal}, objetos na cena=${j.totalObjetosNaCena}, materiais=${j.materiaisNaCena}, sombra (estim.)=${j.tot.sombra}`);
  console.log('| # | Origem | Objetos | Materiais | Calls | Calls de sombra | kTri |\n|---|---|---|---|---|---|---|');
  j.cats.slice(0, 15).forEach((c, i) => console.log(`| ${i + 1} | ${c[0]} | ${c[1]} | ${c[2]} | ${c[3]} | ${c[4]} | ${c[5]} |`));
}
