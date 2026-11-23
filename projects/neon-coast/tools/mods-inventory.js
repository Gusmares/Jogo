// Inventário dos mods originais: o que já foi aproveitado no jogo e o que falta trabalhar.
//   node tools/mods-inventory.js              gera assets/mods/INVENTARIO.md e inventario.json
//   node tools/mods-inventory.js --organizar  também move cada pasta de mod para o balde certo (0-NOVOS / 1-USADOS / 2-PARCIAIS / 3-NAO-USADOS)
// "Usado" = o arquivo é citado em tools/assets.json | models.json | skins.json, está em tools/mods-usage.json (uso manual),
// ou tem cópia idêntica em assets/models | anims | radio | world (animações e rádio são copiados).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ROOT, MODS, BUCKETS } = require('../../../engine/tools/mods');
const RUNTIME = ['models', 'anims', 'radio', 'world'].map(d => path.join(ROOT, 'assets', d));
const KIND = {
  model: ['dff'], texture: ['txd', 'tga', 'dds', 'png', 'jpg', 'jpeg', 'bmp'], anim: ['ifp'], audio: ['atp', 'ogg', 'mp3', 'wav', 'flac'], pack: ['img', 'pak', 'zip', 'rar', '7z'],
  script: ['cs', 'cm', 'sc', 'asi', 'dll', 'cso', 'lua', 'js'], config: ['ini', 'dat', 'ide', 'ipl', 'fxt', 'json', 'cfg', 'xml', 'zon', 'gxt'], doc: ['txt', 'url', 'ico', 'md', 'html', 'pdf', 'nfo']
};
const kindOf = f => { const e = path.extname(f).slice(1).toLowerCase(); for (const k in KIND) if (KIND[k].includes(e)) return k; return 'outro'; };
const ASSET_KINDS = ['model', 'texture', 'anim', 'audio', 'pack'];
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const norm = s => s.replace(/\\/g, '/').toLowerCase();
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const mb = n => (n / 1e6).toFixed(1) + ' MB';

/* ---- 1) o que as configurações citam ---- */
const refs = new Map();   // "mods/nome/rel" (minúsculo) -> ["veículo vw_gol", ...]
function addRef(p, who) { if (!p) return; const k = norm(p).replace(/^assets\//, ''); if (!refs.has(k)) refs.set(k, []); if (!refs.get(k).includes(who)) refs.get(k).push(who); }
const readJSON = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const A = readJSON('assets.json');
for (const v of A.vehicles) { addRef(v.dff, (v.kind === 'bike' ? 'moto ' : v.kind === 'bus' ? 'ônibus ' : 'carro ') + v.id); addRef(v.txd, 'carro ' + v.id); for (const r of v.retextures || v.skins || []) { addRef(r.txd || r, 'carro ' + v.id + ' (pintura)'); } }
for (const w of A.weapons) { addRef(w.dff, 'arma ' + w.id); addRef(w.txd, 'arma ' + w.id); }
for (const v of readJSON('models.json')) { addRef(v.dff, 'viatura ' + v.id); addRef(v.txd, 'viatura ' + v.id); }
for (const s of readJSON('skins.json')) { addRef(s.dff, 'skin ' + s.id); addRef(s.txd, 'skin ' + s.id); }
// catálogo automático dos packs (mods-catalog.js): só conta o que foi convertido de verdade
if (fs.existsSync(path.join(__dirname, 'auto-catalog.json'))) { const AC = readJSON('auto-catalog.json'), conv = id => fs.existsSync(path.join(ROOT, 'assets/models', id, 'model.json')) || fs.existsSync(path.join(ROOT, 'assets/models/skins', id, 'skin.json'));
  for (const v of AC.vehicles) if (conv(v.id)) { addRef(v.dff, 'veículo ' + v.id); addRef(v.txd, 'veículo ' + v.id); }
  for (const k of AC.skins) if (conv(k.id)) { addRef(k.dff, 'skin ' + k.id); addRef(k.txd, 'skin ' + k.id); }
  for (const w of AC.weapons) if (conv(w.id)) { addRef(w.dff, 'arma ' + w.id); addRef(w.txd, 'arma ' + w.id); } }
// varre qualquer outro "mods/..." citado em assets.json (ex.: texturas de pintura alternativas do ônibus)
(function scan(o, who) { if (typeof o === 'string') { if (/^(assets\/)?mods\//i.test(o)) addRef(o, who); } else if (o && typeof o === 'object') for (const k in o) scan(o[k], o.id ? 'carro ' + o.id : who); })(A.vehicles, '');
const usageFile = path.join(__dirname, 'mods-usage.json');
const manual = fs.existsSync(usageFile) ? JSON.parse(fs.readFileSync(usageFile, 'utf8')) : {};   // { "Pasta": { "usados": ["rel/arquivo", ...], "nota": "..." } }

/* ---- 2) cópias idênticas nas saídas do jogo ---- */
const rt = new Map();
for (const r of RUNTIME) if (fs.existsSync(r)) for (const f of walk(r)) { const s = fs.statSync(f).size; if (!rt.has(s)) rt.set(s, []); rt.get(s).push(f); }
const rtHash = new Map();
function copiedAs(f) {
  const s = fs.statSync(f).size, c = rt.get(s); if (!c) return null;
  const h = md5(f); for (const g of c) { if (!rtHash.has(g)) rtHash.set(g, md5(g)); if (rtHash.get(g) === h) return path.relative(path.join(ROOT, 'assets'), g).replace(/\\/g, '/'); }
  return null;
}

/* ---- 3) varre os mods ---- */
const mods = [];
for (const b of BUCKETS) {
  const bd = path.join(MODS, b); fs.mkdirSync(bd, { recursive: true });
  for (const e of fs.readdirSync(bd, { withFileTypes: true })) if (e.isDirectory()) mods.push({ name: e.name, bucket: b, dir: path.join(bd, e.name) });
}
for (const m of mods) {
  const files = walk(m.dir), man = manual[m.name] || {}, manSet = new Set((man.usados || []).map(norm));
  m.files = files.length; m.bytes = 0; m.kinds = {}; m.assets = []; m.notes = [];
  for (const f of files) {
    const rel = path.relative(m.dir, f).replace(/\\/g, '/'), kind = kindOf(f), size = fs.statSync(f).size; m.bytes += size; m.kinds[kind] = (m.kinds[kind] || 0) + 1;
    if (!ASSET_KINDS.includes(kind)) continue;
    const key = norm('mods/' + m.name + '/' + rel); let used = null;
    if (refs.has(key)) used = refs.get(key).join(', ');
    else if (manSet.has(norm(rel))) used = man.nota || 'uso manual (mods-usage.json)';
    else if (size < 700e6 && ['anim', 'audio', 'texture'].includes(kind) && (used = copiedAs(f))) used = 'copiado para assets/' + used;
    m.assets.push({ rel, kind, size, used });
  }
  // texturas "irmãs" de um modelo usado (mesmo nome-base, mesma pasta) contam como usadas apenas se citadas — nada automático
  const total = m.assets.length, usedN = m.assets.filter(a => a.used).length;
  m.total = total; m.usedN = usedN;
  m.status = total === 0 ? 'NAO-USADO' : usedN === 0 ? 'NAO-USADO' : usedN === total ? 'USADO' : 'PARCIAL';
  m.target = m.status === 'USADO' ? '1-USADOS' : m.status === 'PARCIAL' ? '2-PARCIAIS' : '3-NAO-USADOS';
  if (man.nota) m.notes.push(man.nota);
}
mods.sort((a, b) => a.target.localeCompare(b.target) || a.name.localeCompare(b.name));

/* ---- 4) organiza (move) ---- */
let moved = [];
if (process.argv.includes('--organizar')) {
  for (const m of mods) {
    if (m.bucket === m.target) continue;
    const dest = path.join(MODS, m.target, m.name); if (fs.existsSync(dest)) throw new Error('Já existe: ' + dest);
    fs.renameSync(m.dir, dest); moved.push(m.name + ': ' + m.bucket + ' -> ' + m.target); m.bucket = m.target; m.dir = dest;
  }
}

/* ---- 5) relatório ---- */
const L = [];
const ICON = { 'USADO': '✅', 'PARCIAL': '🟡', 'NAO-USADO': '⬜' };
const kindsTxt = k => Object.entries(k).filter(([n]) => !['doc'].includes(n)).map(([n, c]) => c + ' ' + n).join(', ');
L.push('# Inventário dos mods originais', '', 'Gerado por `node tools/mods-inventory.js` (rode de novo depois de mexer; `--organizar` move as pastas para o balde certo).', '',
  '**Como ler:** ✅ tudo que presta do mod já está no jogo · 🟡 parte já está, parte falta (lista abaixo) · ⬜ nada usado ainda. "Usado" = citado em `tools/*.json` ou copiado para `assets/models|anims|radio|world`.', '',
  '**Fluxo:** jogue o mod novo (descompactado) em `assets/mods/0-NOVOS/`, rode o inventário com `--organizar` e ele cai no balde certo. Para integrar: adicione o veículo/skin/arma em `tools/assets.json`, `models.json` ou `skins.json` (caminho `mods/<Pasta>/...`, sem o balde) e rode `node tools/import-assets.js`.', '');
L.push('## Resumo', '', '| | Mod | Conteúdo | Usado | Tamanho |', '|---|---|---|---|---|');
for (const m of mods) L.push(`| ${ICON[m.status]} | ${m.bucket}/${m.name} | ${kindsTxt(m.kinds)} | ${m.usedN}/${m.total} | ${mb(m.bytes)} |`);
const tot = mods.reduce((s, m) => s + m.bytes, 0); L.push('', `Total em \`assets/mods\`: ${mb(tot)} em ${mods.length} mods.`, '');
for (const m of mods) {
  L.push(`## ${ICON[m.status]} ${m.name}`, '', `Balde: \`${m.bucket}\` · ${m.files} arquivos · ${mb(m.bytes)} · conteúdo: ${kindsTxt(m.kinds)}`, '');
  for (const n of m.notes) L.push('> ' + n, '');
  const used = m.assets.filter(a => a.used), unused = m.assets.filter(a => !a.used);
  if (used.length) { L.push('**Já usado:**'); const g = new Map(); for (const a of used) { const k = a.used; if (!g.has(k)) g.set(k, []); g.get(k).push(a.rel); }
    let n = 0; for (const [who, rels] of g) { if (n++ >= 14) { L.push(`- … e mais ${g.size - 14} usos`); break; } L.push(`- ${who}: ${rels.length > 3 ? rels.slice(0, 2).join(', ') + ` (+${rels.length - 2})` : rels.join(', ')}`); } L.push(''); }
  if (unused.length) {
    L.push(`**Ainda não usado (${unused.length}):**`);
    const byDir = new Map(); for (const a of unused) { const d = path.posix.dirname(a.rel); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(a); }
    let n = 0; for (const [d, arr] of byDir) { if (n++ >= 18) { L.push(`- … e mais ${byDir.size - 18} pastas`); break; } const names = arr.map(a => path.posix.basename(a.rel)); L.push(`- \`${d === '.' ? '(raiz)' : d}\` — ${arr.length} arq.: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ' …' : ''}`); }
    L.push('');
  }
  const sc = (m.kinds.script || 0); if (sc) L.push(`Scripts/plugins do mod (CLEO/ASI/shaders): ${sc} arquivo(s) — não rodam no navegador; a lógica precisa ser reimplementada em JavaScript.`, '');
}
fs.mkdirSync(MODS, { recursive: true });
fs.writeFileSync(path.join(MODS, 'INVENTARIO.md'), L.join('\n'));
fs.writeFileSync(path.join(MODS, 'inventario.json'), JSON.stringify(mods.map(m => ({ mod: m.name, balde: m.bucket, status: m.status, usados: m.usedN, total: m.total, mb: +(m.bytes / 1e6).toFixed(1), naoUsados: m.assets.filter(a => !a.used).map(a => a.rel) })), null, 1));
console.log(mods.map(m => `${ICON[m.status]} ${m.bucket.padEnd(13)} ${m.name.padEnd(48)} ${m.usedN}/${m.total}  ${mb(m.bytes)}`).join('\n'));
if (moved.length) console.log('\nMovidos:\n' + moved.join('\n'));
