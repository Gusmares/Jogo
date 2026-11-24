// resume os perf-*-{off,on}-{1,2}.txt (saída de tools/perf-profile.js) em uma tabela
const fs = require('fs');
const rows = [];
for (const f of fs.readdirSync(__dirname).filter(f => /^perf-[a-z]-(off|on)-\d\.txt$/.test(f)).sort()) {
  const t = fs.readFileSync(__dirname + '/' + f, 'utf8'), i = t.indexOf('{', t.indexOf('RESULTADO'));
  let j; try { j = JSON.parse(t.slice(i)); } catch (e) { rows.push([f, 'JSON inválido']); continue; }
  const s = j.sim10s, c = j.censo, rt = j.tempoReal;
  rows.push([f.replace('perf-', '').replace('.txt', ''), 'quadro ' + s.quadroTotalMs.med + ' (p95 ' + s.quadroTotalMs.p95 + ')', 'postRender ' + s.resumoMs.render_postRender + ' (c/sombra ' + s.renderMsComSombra + ' s/sombra ' + s.renderMsSemSombra + ')', 'calls c/sombra ' + s.drawCalls.cenaComSombra + ' s/sombra ' + s.drawCalls.cenaSemSombra, 'tri ' + s.triangulos.cenaComSombra, 'mat ' + c.materiais, 'objs ' + c.objetosNaCena, 'fps ' + rt.fps, 'cpuRT ' + rt.cpuQuadroMs.med, 'gpu ' + (rt.gpuTimerMs ? rt.gpuTimerMs.med : '-'), 'peds ' + c.peds + ' carros ' + c.carros]);
}
for (const r of rows) console.log(r.join(' | '));
