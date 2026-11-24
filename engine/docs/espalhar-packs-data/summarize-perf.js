// resume as saídas do perf-profile.js: node summarize-perf.js <pasta com a-antes-1.txt, a-depois-1.txt, ...>
const fs = require('fs'), path = require('path'), dir = process.argv[2] || '.';
const get = f => { const t = fs.readFileSync(f, 'utf8'), i = t.indexOf('RESULTADO '); if (i < 0) return null; try { return JSON.parse(t.slice(i + 10)); } catch (e) { return null; } };
const rows = {};
for (const f of fs.readdirSync(dir).filter(n => /^[a-e]-(antes|depois)-\d+\.txt$/.test(n))) {
  const [sc, mode] = f.split('-'), j = get(path.join(dir, f)); if (!j || !j.sim10s) continue;
  const s = j.sim10s, c = j.censo || {};
  (rows[sc + ' ' + mode] = rows[sc + ' ' + mode] || []).push({
    drawComSombra: s.drawCalls.cenaComSombra, drawSemSombra: s.drawCalls.cenaSemSombra, triComSombra: s.triangulos.cenaComSombra, triSemSombra: s.triangulos.cenaSemSombra,
    renderMs: s.resumoMs.render_postRender, renderComSombraMs: s.renderMsComSombra, quadroMs: s.resumoMs.total, materiais: c.materiais, geometrias: c.geometrias, texturas: c.texturas, instancias: c.instancias, malhasInst: c.instanced, casters: c.shadowCasters,
    fps: j.tempoReal && j.tempoReal.fps, p95: j.tempoReal && j.tempoReal.intervaloMs && j.tempoReal.intervaloMs.p95, maxInt: j.tempoReal && j.tempoReal.intervaloMs && j.tempoReal.intervaloMs.max, gpuMs: j.tempoReal && j.tempoReal.gpuTimerMs && j.tempoReal.gpuTimerMs.med, heap: j.censoDepois && j.censoDepois.heapMB });
}
const avg = (a, k) => { const v = a.map(r => r[k]).filter(x => x != null); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2) : null; };
const keys = ['drawComSombra', 'drawSemSombra', 'triComSombra', 'materiais', 'texturas', 'instancias', 'malhasInst', 'casters', 'renderMs', 'renderComSombraMs', 'quadroMs', 'gpuMs', 'fps', 'p95', 'maxInt', 'heap'];
console.log('cenário/modo'.padEnd(14) + 'n  ' + keys.map(k => k.padStart(12)).join(''));
for (const r of Object.keys(rows).sort()) console.log(r.padEnd(14) + String(rows[r].length).padEnd(3) + keys.map(k => String(avg(rows[r], k)).padStart(12)).join(''));
console.log('\npor execução:'); for (const r of Object.keys(rows).sort()) rows[r].forEach((x, i) => console.log(r, i + 1, 'draw ' + x.drawComSombra + '/' + x.drawSemSombra, 'render ' + x.renderMs + ' (c/ sombra ' + x.renderComSombraMs + ')', 'fps ' + x.fps));
