#!/usr/bin/env node
// NEON ENGINE — espalha os modelos dos packs (vegetação e props de rua) pelo mapa, gravando-os em maps/world.json (campo "objects").
//   node engine/tools/scatter-packs.js [--dry] [--seed N] [--veg-max 2500] [--props-max 800] [--clean] [--project projects/neon-coast] [--tag packs-auto] [--show] [--summary]
// Cada item gerado leva "tag":"packs-auto". Rodar de novo REMOVE só os itens com a tag e recoloca (itens do usuário ficam intactos); --clean só remove.
// Antes de gravar faz backup em maps/backup/ e confere que nada além de "objects" mudou no arquivo. --dry mostra o resumo sem gravar nada.
// Como funciona: abre o jogo de verdade (Electron, janela oculta, via projects/neon-coast/tools/run-game-script.js) com o mapa SEM os itens da tag,
// roda engine/tools/scatter-packs-game.js dentro dele (que enxerga relevo, calçadas, quadras, colisores, favelas, rodovia) e recebe as posições de volta.
// Documentação: engine/docs/espalhar-packs.md
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const args = process.argv.slice(2);
const flag = n => args.includes('--' + n), opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT = path.resolve(ROOT, opt('project', process.env.NEON_PROJECT || 'projects/neon-coast'));
const TAG = opt('tag', 'packs-auto'), SEED = parseInt(opt('seed', '20261124'), 10), VEG_MAX = parseInt(opt('veg-max', '2500'), 10), PROPS_MAX = parseInt(opt('props-max', '800'), 10);
const DRY = flag('dry'), CLEAN = flag('clean');
const MAP = path.join(PROJECT, opt('map', 'maps/world.json')), OBJ = path.join(PROJECT, 'assets', 'objects');
const say = (...a) => console.log(...a);

// ---------- modelos disponíveis (object.json + model.glb existentes neste PC) ----------
const WANT = /^(vp_|vf_|sp_|gp_|sa_|sf_)|^orelhao$/;
function glbPrims(file) {                                   // primitivas (= chamadas de desenho por instância) lidas do JSON do GLB, sem carregar three
  try {
    const b = fs.readFileSync(file); if (b.toString('latin1', 0, 4) !== 'glTF') return 1;
    const len = b.readUInt32LE(12), j = JSON.parse(b.toString('utf8', 20, 20 + len)), mp = (j.meshes || []).map(m => (m.primitives || []).length);
    let n = 0; for (const nd of j.nodes || []) if (nd.mesh !== undefined) n += mp[nd.mesh] || 0; return n || mp.reduce((a, v) => a + v, 0) || 1;
  } catch (e) { return 1; }
}
function loadAvail() {
  const avail = {}; if (!fs.existsSync(OBJ)) return avail;
  for (const id of fs.readdirSync(OBJ)) {
    if (!WANT.test(id)) continue; const dir = path.join(OBJ, id), jf = path.join(dir, 'object.json'), gf = path.join(dir, 'model.glb');
    if (!fs.existsSync(jf) || !fs.existsSync(gf)) continue;
    try { const j = JSON.parse(fs.readFileSync(jf, 'utf8')); avail[id] = { name: j.name || id, cat: j.cat || '', h: j.dims.height, w: j.dims.width, l: j.dims.len, tris: j.triangles || 0, veg: !!j.veg, prims: glbPrims(gf) }; } catch (e) { /* object.json inválido: ignora */ }
  }
  return avail;
}

// ---------- mapa ----------
if (!fs.existsSync(MAP)) { console.error('Mapa não encontrado: ' + MAP); process.exit(2); }
const mapText = fs.readFileSync(MAP, 'utf8'), mapJson = JSON.parse(mapText);
const objects0 = Array.isArray(mapJson.objects) ? mapJson.objects : [];
const userObjs = objects0.filter(o => o.tag !== TAG), oldTagged = objects0.length - userObjs.length;
say('Mapa: ' + path.relative(ROOT, MAP) + ' · objetos do usuário: ' + userObjs.length + ' · itens antigos com a tag "' + TAG + '": ' + oldTagged);

// substitui só o bloco "objects" do texto (todo o resto do arquivo — carro, relevo, world — fica byte a byte igual)
function withObjects(text, list) {
  const a = text.indexOf('\n  "objects": ['), b = text.indexOf('\n  "vehicles": [', a + 1);
  if (a < 0 || b < 0) throw new Error('formato inesperado de world.json (esperava "objects" seguido de "vehicles")');
  const body = list.length ? '\n' + list.map(o => '    ' + JSON.stringify(o)).join(',\n') + '\n  ' : '';
  return text.slice(0, a) + '\n  "objects": [' + body + '],' + text.slice(b);
}

async function generate(avail) {
  const tmpMapRel = 'maps/_scatter_tmp.json', tmpMap = path.join(PROJECT, tmpMapRel), tmpScript = path.join(os.tmpdir(), 'neon-scatter-run-' + process.pid + '.js');
  const clean = Object.assign({}, mapJson, { objects: userObjs });
  fs.writeFileSync(tmpMap, JSON.stringify(clean));
  const prm = { seed: SEED, vegMax: VEG_MAX, propsMax: PROPS_MAX, tag: TAG, avail };
  fs.writeFileSync(tmpScript, 'window.__SCATTER = ' + JSON.stringify(prm) + ';\n' + fs.readFileSync(path.join(__dirname, 'scatter-packs-game.js'), 'utf8'));
  const electron = require(require.resolve('electron', { paths: [ROOT] }));
  const runner = path.join(PROJECT, 'tools', 'run-game-script.js');
  try {
    return await new Promise((ok, fail) => {
      const argv = [runner, tmpScript, '--test', '37,0.3,80,180&map=' + tmpMapRel].concat(flag('show') ? ['--show'] : []);
      const p = cp.spawn(electron, argv, { cwd: PROJECT, windowsHide: true }); let out = '', err = '';
      p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
      p.on('close', code => {
        const i = out.indexOf('RESULTADO ');
        if (i < 0) return fail(new Error('o jogo não devolveu resultado (código ' + code + ')\n' + out.slice(-1500) + '\n' + err.slice(-500)));
        try { ok(JSON.parse(out.slice(i + 10).replace(/\nIMAGEM[\s\S]*$/, ''))); } catch (e) { fail(new Error('resultado ilegível: ' + e.message)); }
      });
    });
  } finally { try { fs.unlinkSync(tmpMap); } catch (e) { /* já removido */ } try { fs.unlinkSync(tmpScript); } catch (e) { /* idem */ } }
}

function summarize(defs, stats, avail) {
  const by = {}; for (const d of defs) { const c = avail[d.ref] ? avail[d.ref].cat : '?'; (by[c] = by[c] || {}); by[c][d.ref] = (by[c][d.ref] || 0) + 1; }
  const veg = defs.filter(d => d.veg).length, bat = defs.length - veg;
  say('\n== Resumo ==\nsemente ' + SEED + ' · vegetação (veg:1) ' + veg + '/' + VEG_MAX + ' · props e rochas (batch:1) ' + bat + ' (props ' + (stats.contagem ? stats.contagem.prop : '?') + '/' + PROPS_MAX + ')');
  say('modelos distintos usados: ' + new Set(defs.map(d => d.ref)).size + ' · lotes InstancedMesh (modelo x célula 200 m): ' + stats.chunks + ' · primitivas nesses lotes: ' + stats.primitivasNasCelulas);
  say('patches fora da cidade: ' + JSON.stringify(stats.patches) + ' · altura suspeita: ' + stats.alturaSuspeita + ' · tempo no jogo: ' + stats.ms + ' ms');
  say('por categoria de colocação: ' + JSON.stringify(stats.porCategoria));
  say('rejeições (motivo -> tentativas): ' + JSON.stringify(stats.rejeitado));
  if (!flag('summary')) { say('\nPor modelo:'); for (const c of Object.keys(by)) { say(' ' + c); for (const [r, n] of Object.entries(by[c]).sort((a, b) => b[1] - a[1])) say('   ' + String(n).padStart(4) + '  ' + r + '  (' + avail[r].name + ', ' + avail[r].tris + ' tri, ' + avail[r].prims + ' prim)'); } }
}

function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()); }
function write(newObjs) {
  const text = withObjects(mapText, newObjs);
  // confere ANTES de gravar: tudo fora de "objects" idêntico e itens do usuário intactos
  const after = JSON.parse(text);
  const strip = m => { const c = Object.assign({}, m); delete c.objects; return JSON.stringify(c); };
  if (strip(after) !== strip(mapJson)) throw new Error('verificação falhou: algo além de "objects" mudou — nada foi gravado');
  const keep = (after.objects || []).filter(o => o.tag !== TAG);
  if (JSON.stringify(keep) !== JSON.stringify(userObjs)) throw new Error('verificação falhou: itens do usuário mudaram — nada foi gravado');
  const bdir = path.join(path.dirname(MAP), 'backup'); fs.mkdirSync(bdir, { recursive: true });
  const bf = path.join(bdir, 'world-' + stamp() + '.json'); fs.writeFileSync(bf, mapText);
  fs.writeFileSync(MAP, text);
  say('\nBackup: ' + path.relative(ROOT, bf) + '\nGravado: ' + path.relative(ROOT, MAP) + ' (' + after.objects.length + ' objetos: ' + keep.length + ' do usuário + ' + (after.objects.length - keep.length) + ' ' + TAG + ')');
  say('Conferência: tudo fora de "objects" (veículos, relevo, world, cabeçalho) igual ao original — OK');
}

(async () => {
  if (CLEAN) { say('--clean: removendo os ' + oldTagged + ' itens "' + TAG + '"'); if (DRY) return say('(--dry: nada gravado)'); if (!oldTagged) return say('Nada a remover.'); return write(userObjs); }
  const avail = loadAvail(), n = Object.keys(avail).length;
  if (!n) { say('Nenhum modelo de pack em ' + path.relative(ROOT, OBJ) + ' (assets não commitados neste PC). Nada a fazer.'); return; }
  say('Modelos disponíveis: ' + n + ' · gerando no jogo (Electron oculto, ~1 min)...');
  const res = await generate(avail);
  summarize(res.defs, res.stats, avail);
  if (DRY) return say('\n(--dry: nada gravado)');
  write(userObjs.concat(res.defs));
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
