// NEON ENGINE - importador de PACKS 3D (um arquivo com dezenas de modelos -> um GLB por modelo na biblioteca do projeto).
//   node engine/tools/pack-import.js inspect <pasta-do-pack> [--mode auto|roots|meshes|whole] [--zup|--no-zup] [--scale k] [--no-extract]
//   node engine/tools/pack-import.js split   <pasta-do-pack> --cat "Categoria" [--prefix p_] [--veg] [--max-tex 1024] [--only a,b] [--dry]
//                                            [--max-tris N [--decimate]] [--scale k] [--zup|--no-zup] [--mode ...] [--file trecho] [--redo] [--no-sheet]
//   node engine/tools/pack-import.js verify  <id1,id2,...|prefixo*> [--out contato.png]
//   node engine/tools/pack-import.js summary            (gera engine/docs/packs-inventario.md a partir de assets/_inventario/*.json)
// <pasta-do-pack> pode ser só o nome (procura em <projeto>/assets/<nome>). Projeto: --project <pasta> ou NEON_PROJECT (padrão projects/neon-coast).
// Roda dentro de uma janela Electron oculta (precisa de DOM/WebGL e dos carregadores do three r128); o "node" chama o Electron sozinho.
// Detalhes, heurísticas e limites: engine/docs/packs.md
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http'), { spawn, spawnSync } = require('child_process');
const REPO = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const FLAGS_VAL = new Set(['cat', 'prefix', 'max-tex', 'only', 'max-tris', 'scale', 'mode', 'file', 'project', 'out', 'blender', 'cols']);
function parseArgs(a) { const o = { _: [] }; for (let i = 0; i < a.length; i++) { const x = a[i]; if (x.startsWith('--')) { const k = x.slice(2); if (FLAGS_VAL.has(k)) o[k] = a[++i]; else o[k] = true; } else o._.push(x); } return o; }
const A = parseArgs(argv), CMD = A._[0];

/* ---- projeto ---- */
function projectRoot() {
  const P = require('./project');
  if (A.project) return path.resolve(A.project);
  if (process.env.NEON_PROJECT) return path.resolve(process.env.NEON_PROJECT);
  const cwdP = (() => { let d = process.cwd(); for (;;) { if (P.isProject(d)) return d; const p = path.dirname(d); if (p === d) return null; d = p; } })();
  return cwdP || path.join(REPO, 'projects', 'neon-coast');
}
const ROOT = projectRoot(), ASSETS = path.join(ROOT, 'assets'), OBJ = path.join(ASSETS, 'objects'), INV = path.join(ASSETS, '_inventario');
const MODEL_EXT = ['fbx', 'glb', 'gltf', 'obj', 'dae', '3ds', 'stl', 'ply'], IMG_EXT = ['png', 'jpg', 'jpeg', 'tga', 'dds', 'bmp', 'webp', 'gif', 'tif', 'tiff'];
const extOf = f => path.extname(f).slice(1).toLowerCase(), slash = p => p.split(path.sep).join('/');
const say = (...a) => console.log(...a);

if (CMD === 'summary') { summary(); process.exit(0); }
if (!CMD || CMD === 'help' || CMD === '--help' || !['inspect', 'split', 'verify'].includes(CMD)) {
  say(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(CMD ? 1 : 0);
}
if (!process.versions.electron) {                                   // rodou com "node": reabre o mesmo script dentro do Electron
  const exe = require(path.join(REPO, 'node_modules', 'electron')); const env = Object.assign({}, process.env); delete env.ELECTRON_RUN_AS_NODE;
  const p = spawn(exe, [__filename, ...argv], { stdio: 'inherit', env, windowsHide: true }); p.on('exit', c => process.exit(c === null ? 1 : c)); p.on('error', e => { console.error(e.message); process.exit(1); }); return;
}

/* ================= arquivos ================= */
function walk(dir, skip) { const out = []; (function w(d) { let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!(skip && skip(p))) w(p); } else out.push(p); } })(dir); return out; }
function sha256(file) { const h = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buf = Buffer.alloc(8 << 20); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); }
const HASH_FILE = path.join(INV, '_hashes.json');
function cachedHash(file) {
  let c = {}; try { c = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')); } catch (e) { /* sem cache */ }
  const st = fs.statSync(file), k = path.resolve(file), hit = c[k]; if (hit && hit.size === st.size && hit.mtime === Math.round(st.mtimeMs)) return hit.sha;
  const sha = sha256(file); c[k] = { size: st.size, mtime: Math.round(st.mtimeMs), sha }; fs.mkdirSync(INV, { recursive: true }); fs.writeFileSync(HASH_FILE, JSON.stringify(c, null, 1)); return sha;
}
function resolvePack(arg) {
  if (!arg) throw new Error('informe a pasta do pack');
  for (const c of [path.resolve(arg), path.join(ASSETS, arg)]) if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  throw new Error('pasta não encontrada: ' + arg + ' (procurei também em ' + ASSETS + ')');
}

/* abre os .zip (do pack e o irmão <pack>.zip) numa subpasta _unzipped/, sem sobrescrever; avisa de duplicatas por hash */
function prepareZips(packDir, log) {
  const Z = require('./pack/zip'), name = path.basename(packDir), parent = path.dirname(packDir), rep = { zips: [], avisos: [] };
  const isSkip = p => path.basename(p) === '_unzipped' ? false : false;
  const done = new Set(); let guard = 0, found = true;
  const siblings = fs.readdirSync(parent).filter(f => /\.zip$/i.test(f)).map(f => path.join(parent, f));
  const mine = siblings.filter(f => { const b = path.basename(f, '.zip'); return b === name || b.replace(/\(\d+\)$/, '').trim() === name.replace(/\(\d+\)$/, '').trim() && b === name; });
  const sibHash = new Map(); for (const f of siblings) { try { sibHash.set(f, cachedHash(f)); } catch (e) { /* ilegível */ } }
  const queue = () => walk(packDir).filter(f => /\.zip$/i.test(f)).concat(mine);
  while (found && guard++ < 8) {
    found = false;
    for (const z of queue()) {
      if (done.has(z)) continue; done.add(z); found = true;
      const sha = sibHash.get(z) || cachedHash(z), isSib = mine.includes(z), ents = Z.list(z).filter(e => !e.dir), r = { arquivo: isSib ? '../' + path.basename(z) : slash(path.relative(packDir, z)), sha256: sha.slice(0, 16), bytes: fs.statSync(z).size, entradas: ents.length };
      const dup = [...sibHash].find(([f, h]) => f !== z && h === sha); if (dup) { r.duplicadoDe = path.basename(dup[0]); rep.avisos.push('zip duplicado: ' + path.basename(z) + ' é idêntico (hash) a ' + path.basename(dup[0])); }
      if (isSib) {                                                    // zip ao lado da pasta: se a pasta já tem tudo, é só espelho
        const have = ents.filter(e => { const p = path.join(packDir, e.name.split('\\').join('/')); try { return fs.statSync(p).size === e.usize; } catch (er) { return false; } }).length;
        if (have >= ents.length * 0.9) { r.acao = 'espelho da pasta (já extraído, nada a fazer)'; rep.zips.push(r); continue; }
      }
      const dest = path.join(packDir, '_unzipped', (isSib ? '_' : slash(path.relative(packDir, path.dirname(z))).replace(/\//g, '__') + '__') + path.basename(z, '.zip'));
      if (A['no-extract']) { r.acao = 'não extraído (--no-extract)'; rep.zips.push(r); continue; }
      const x = Z.extract(z, dest); r.acao = 'extraído para ' + slash(path.relative(packDir, dest)) + ' (' + x.written + ' novos, ' + x.skipped + ' já existiam/ignorados)'; log(r.arquivo + ': ' + r.acao); rep.zips.push(r);
    }
  }
  if (/\(\d+\)$/.test(name)) { const orig = path.join(parent, name.replace(/\s*\(\d+\)$/, '')); if (fs.existsSync(orig)) { const a = walk(orig).length, b = walk(packDir).length; rep.avisos.push('a pasta "' + name + '" parece cópia de "' + path.basename(orig) + '" (' + a + ' x ' + b + ' arquivos); importe só uma'); } }
  return rep;
}
function findBlender() {
  if (A.blender) return A.blender; if (process.env.BLENDER) return process.env.BLENDER;
  for (const base of ['C:/Program Files/Blender Foundation', 'C:/Program Files (x86)/Blender Foundation']) { try { for (const d of fs.readdirSync(base).sort().reverse()) { const e = path.join(base, d, 'blender.exe'); if (fs.existsSync(e)) return e; } } catch (e) { /* sem Blender aí */ } }
  return null;
}
/* .blend: sem o Blender instalado não há como ler (formato proprietário do Blender). Com ele, converte para GLB em <pack>/_converted */
function convertBlend(packDir, blends, log) {
  const exe = findBlender(), out = [], notes = [];
  for (const b of blends) {
    const dest = path.join(packDir, '_converted', path.basename(b, '.blend') + '.glb');
    if (fs.existsSync(dest)) { out.push(dest); continue; }
    if (!exe) { notes.push(slash(path.relative(packDir, b)) + ': .blend não lido (Blender não encontrado; instale o Blender gratuito de blender.org, ou exporte para GLB, ou passe --blender <exe>)'); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true }); log('Blender: convertendo ' + path.basename(b));
    const py = 'import bpy\nbpy.ops.export_scene.gltf(filepath=' + JSON.stringify(slash(dest)) + ", export_format='GLB', export_yup=True, export_apply=True)\n";
    const r = spawnSync(exe, ['-b', b, '--python-expr', py], { encoding: 'utf8', timeout: 600000 });
    if (fs.existsSync(dest)) out.push(dest); else notes.push(path.basename(b) + ': falha na conversão do Blender: ' + String(r.stderr || r.stdout || '').slice(-300));
  }
  return { out, notes };
}
function collect(packDir, log) {
  const zr = prepareZips(packDir, log), all = walk(packDir, p => path.basename(p) === '_converted' && false);
  const blends = all.filter(f => extOf(f) === 'blend'), bl = blends.length ? convertBlend(packDir, blends, log) : { out: [], notes: [] };
  const files = walk(packDir), models = files.filter(f => MODEL_EXT.includes(extOf(f)));
  const names = {}, stems = {}, mtl = [];
  for (const f of files) {
    const rel = slash(path.relative(packDir, f)), e = extOf(f), base = path.basename(f).toLowerCase();
    if (e === 'mtl') mtl.push(rel);
    if (!IMG_EXT.includes(e)) continue;
    (names[base] = names[base] || []).push(rel); const st = base.replace(/\.[^.]+$/, ''); (stems[st] = stems[st] || []).push(rel); const sn = st.replace(/[^a-z0-9]+/g, ''); if (sn !== st) (stems[sn] = stems[sn] || []).push(rel);
  }
  const imgs = files.filter(f => IMG_EXT.includes(extOf(f))).map(f => slash(path.relative(packDir, f)));
  return { zr, models: models.map(f => slash(path.relative(packDir, f))), blendNotes: bl.notes, texIndex: { names, stems, mtl, all: imgs }, nBlend: blends.length, nImg: imgs.length };
}

/* ================= servidor local + janela ================= */
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tga: 'image/x-tga', dds: 'image/vnd-ms.dds', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', mtl: 'text/plain', obj: 'text/plain', dae: 'text/xml', fbx: 'application/octet-stream' };
function startServer(packDir, createdDirs) {
  const TOKEN = crypto.randomBytes(12).toString('hex'), vendor = path.join(REPO, 'engine', 'editor', 'vendor');
  const vmap = n => n === 'three.min.js' ? path.join(REPO, 'node_modules', 'three', 'build', 'three.min.js') : n.startsWith('meshopt/') ? path.join(REPO, 'node_modules', 'meshoptimizer', n.slice(8)) : path.join(vendor, n);
  const inside = (base, rel) => { const p = path.resolve(base, rel); return p.startsWith(path.resolve(base) + path.sep) || p === path.resolve(base) ? p : null; };
  const server = http.createServer((req, res) => {
    const port = req.socket.localPort, host = String(req.headers.host || '').toLowerCase();
    if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) { res.writeHead(403); return res.end('host'); }
    const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    const sendFile = f => { if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('não existe'); } res.writeHead(200, { 'Content-Type': MIME[extOf(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res); };
    if (req.method === 'GET') {
      if (p.startsWith('/v/')) return sendFile(/^[\w.\-\/]+$/.test(p.slice(3)) && !p.includes('..') ? vmap(p.slice(3)) : null);
      if (p.startsWith('/w/')) return sendFile(/^[\w.\-]+$/.test(p.slice(3)) ? path.join(__dirname, 'pack', p.slice(3)) : null);
      if (p.startsWith('/p/')) return sendFile(inside(packDir, p.slice(3)));
      if (p.startsWith('/o/')) { const rel = p.slice(3); return sendFile(/^(objects|_inventario)\//.test(rel) ? inside(ASSETS, rel) : null); }
      res.writeHead(404); return res.end();
    }
    if (req.method === 'POST' && p === '/out') {
      if (req.headers['x-pack-token'] !== TOKEN) { res.writeHead(403); return res.end('token'); }
      const rel = u.searchParams.get('path') || '', m = /^objects\/([a-z0-9_]{2,60})\/(model\.glb|object\.json)$/.exec(rel), okInv = /^_inventario\/[\w.\-]+\.(json|png|md|txt)$/.test(rel);
      if (!m && !okInv) { res.writeHead(400); return res.end('caminho não permitido'); }
      const f = path.join(ASSETS, rel); const chunks = [];
      if (m) { const dir = path.join(OBJ, m[1]); if (fs.existsSync(dir) && !createdDirs.has(m[1])) { res.writeHead(409); return res.end('já existe e não é deste pack: ' + m[1]); } createdDirs.add(m[1]); }
      req.on('data', d => chunks.push(d)); req.on('end', () => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); } catch (e) { res.writeHead(500); res.end(e.message); } });
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ server, TOKEN, port: server.address().port })));
}

/* ================= saída ================= */
const pad = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n);
function dimsStr(d) { return d.width + '×' + d.height + '×' + d.len; }
function printInspect(f) {
  if (f.arvore) { say(String.fromCharCode(10) + '== ' + f.arquivo + '  (árvore de nós)' + String.fromCharCode(10) + f.arvore); return; }
  say('\n== ' + f.arquivo + '  [' + f.formato + ']  eixo Z-up: ' + (f.zUp ? 'SIM' : 'não') + ' (' + f.zUpMotivo + ')  escala sugerida ×' + f.escalaSugerida + '  modo ' + f.modo + '  (' + f.ms + ' ms)');
  say(pad('nome', 34) + pad('tipo', 11) + pad('tris', 8) + pad('caixa (m: L×A×C)', 22) + pad('tex', 5) + pad('alfa', 5) + 'obs');
  for (const u of f.unidades) {
    const tex = u.materiais.reduce((s, m) => s + m.texturas.length, 0), alfa = u.materiais.some(m => m.temAlfa || m.alphaTest > 0);
    say(pad(u.nome, 34) + pad(u.tipo, 11) + pad(u.tris, 8) + pad(dimsStr(u.dims), 22) + pad(tex, 5) + pad(alfa ? 'sim' : 'não', 5) + (u._lodDe ? 'LOD ' + u.lodNivel + ' de outro modelo; ' : '') + (u.lods.length ? u.lods.length + ' LODs; ' : '') + u.avisos.join('; '));
  }
  if (f.ignorados.length) say('ignorados: ' + f.ignorados.map(i => i.nome + ' (' + i.motivo + ')').join(', '));
  if (f.texturasFaltando.length) say('texturas faltando (' + f.texturasFaltando.length + '): ' + f.texturasFaltando.slice(0, 12).join(', ') + (f.texturasFaltando.length > 12 ? '…' : ''));
  for (const a of f.avisos) say('AVISO: ' + a);
}

/* ================= execução ================= */
const { app, BrowserWindow } = require('electron');
app.setPath('userData', path.join(app.getPath('temp'), 'neon-pack-import-profile-' + process.pid));
app.commandLine.appendSwitch('ignore-gpu-blocklist'); app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');
let win = null;
const call = (cmd, arg) => win.webContents.executeJavaScript('window.packRun(' + JSON.stringify(cmd) + ',' + JSON.stringify(arg || {}) + ')').then(r => { if (!r.ok) throw new Error(r.erro + (r.stack ? '\n' + r.stack : '')); return r.r; });
const numOpt = (k, d) => A[k] === undefined || A[k] === true ? d : +A[k];
function pageOpts(pack) {
  const o = { mode: A.mode || 'auto', hint: pack }; if (A.zup) o.zup = true; if (A['no-zup']) o.zup = false; if (A.scale !== undefined) o.scale = +A.scale; return o;
}
async function boot(packDir, createdDirs) {
  const srv = await startServer(packDir, createdDirs || new Set());
  win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true } });
  const seen = new Map();                                            // mensagens repetidas dos carregadores saem uma vez só
  win.webContents.on('console-message', ev => {
    if (ev.level !== 'error' && ev.level !== 'warning') return;
    if (/GLTFExporter|Texture marked|THREE\.WebGLRenderer|Electron Security Warning/.test(ev.message)) return;
    const k = ev.message.slice(0, 90), c = (seen.get(k) || 0) + 1; seen.set(k, c);
    if (c === 1) console.log('[janela]', ev.message.slice(0, 220)); else if (c === 20) console.log('[janela] (repetida muitas vezes: ' + k + ')');
  });
  await win.loadURL('http://127.0.0.1:' + srv.port + '/w/worker.html');
  for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('window.__packReady === true')); i++) await new Promise(r => setTimeout(r, 100));
  await win.webContents.executeJavaScript('window.__tok = ' + JSON.stringify(srv.TOKEN));
  return srv;
}

async function cmdInspect() {
  const packDir = resolvePack(A._[1]), pack = path.basename(packDir), t0 = Date.now(); say('Pack: ' + pack + '  (' + packDir + ')');
  const c = collect(packDir, say); for (const a of c.zr.avisos) say('AVISO: ' + a); for (const n of c.blendNotes) say('AVISO: ' + n);
  say(c.models.length + ' arquivo(s) 3D, ' + c.nImg + ' imagens' + (c.nBlend ? ', ' + c.nBlend + ' .blend' : ''));
  const inv = { pack, pasta: packDir, geradoEm: new Date().toISOString(), zips: c.zr.zips, avisos: c.zr.avisos.concat(c.blendNotes), imagens: c.nImg, arquivos: [] };
  const srv = await boot(packDir); await call('setup', { texIndex: c.texIndex });
  const filter = A.file ? String(A.file).toLowerCase() : null;
  for (const rel of c.models) {
    if (filter && !rel.toLowerCase().includes(filter)) continue;
    const abs = path.join(packDir, rel), entry = { arquivo: rel, bytes: fs.statSync(abs).size, sha256: cachedHash(abs).slice(0, 16) };
    try { const r = await call('inspect', { file: rel, opt: pageOpts(pack) }); Object.assign(entry, r); printInspect(r); } catch (e) { entry.erro = e.message.split('\n')[0]; say('\n== ' + rel + '\nERRO: ' + entry.erro); }
    inv.arquivos.push(entry);
  }
  for (const n of c.blendNotes) inv.arquivos.push({ arquivo: n.split(':')[0], formato: 'blend', erro: 'não lido' });
  inv.arquivos.forEach(f => { delete f._texturasNaoUsadasNaPasta; });
  const mods = inv.arquivos.flatMap(f => (f.unidades || []).filter(u => !u._lodDe));
  inv.resumo = { arquivos3D: inv.arquivos.length, modelos: mods.length, lodsExtras: inv.arquivos.flatMap(f => f.unidades || []).filter(u => u._lodDe).length, triangulos: mods.reduce((s, u) => s + u.tris, 0), porTipo: mods.reduce((o, u) => (o[u.tipo] = (o[u.tipo] || 0) + 1, o), {}) };
  fs.mkdirSync(INV, { recursive: true }); fs.writeFileSync(path.join(INV, pack + '.json'), JSON.stringify(inv, null, 1));
  say('\nRESUMO ' + pack + ': ' + inv.resumo.modelos + ' modelos (' + inv.resumo.lodsExtras + ' LODs extras), ' + inv.resumo.triangulos.toLocaleString('pt-BR') + ' triângulos, ' + JSON.stringify(inv.resumo.porTipo) + '  -> assets/_inventario/' + pack + '.json  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  srv.server.close();
}

function existingOwned(pack) {
  const owned = {}, ids = [];
  if (fs.existsSync(OBJ)) for (const id of fs.readdirSync(OBJ)) { ids.push(id); try { const m = JSON.parse(fs.readFileSync(path.join(OBJ, id, 'object.json'), 'utf8')); if (m.pack === pack && m.packFile && m.sourceNode) owned[m.packFile + '|' + m.sourceNode] = id; } catch (e) { /* sem object.json */ } }
  return { owned, ids };
}
async function cmdSplit() {
  const packDir = resolvePack(A._[1]), pack = path.basename(packDir), cat = A.cat && A.cat !== true ? A.cat : 'Pacote: ' + pack, prefix = String(A.prefix || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const maxTex = Math.max(64, Math.min(8192, numOpt('max-tex', 1024))), maxTris = A['max-tris'] ? +A['max-tris'] : 0, t0 = Date.now();
  say('Pack: ' + pack + ' -> categoria "' + cat + '", prefixo "' + prefix + '", texturas até ' + maxTex + ' px' + (A.dry ? '  [SIMULAÇÃO: nada é gravado]' : ''));
  const c = collect(packDir, say); for (const a of c.zr.avisos) say('AVISO: ' + a); for (const n of c.blendNotes) say('AVISO: ' + n);
  const { owned, ids } = existingOwned(pack), created = new Set(); if (A.redo) for (const id of Object.values(owned)) created.add(id);
  const srv = await boot(packDir, created); await call('setup', { texIndex: c.texIndex });
  const log = { pack, cat, prefix, maxTex, geradoEm: new Date().toISOString(), arquivos: [] }, madeIds = [], taken = ids.slice();
  const filter = A.file ? String(A.file).toLowerCase() : null;
  for (const rel of c.models) {
    if (filter && !rel.toLowerCase().includes(filter)) continue;
    let r; try { r = await call('split', { file: rel, opt: Object.assign(pageOpts(pack), { pack, cat, prefix, maxTex, maxTris, decimate: !!A.decimate, veg: !!A.veg, dry: !!A.dry, redo: !!A.redo, only: A.only ? String(A.only).split(',').map(s => s.trim()).filter(Boolean) : null, existingIds: taken, owned }) }); }
    catch (e) { say('\n== ' + rel + '\nERRO: ' + e.message.split('\n')[0]); log.arquivos.push({ arquivo: rel, erro: e.message.split('\n')[0] }); continue; }
    r.feitos.forEach(m => { taken.push(m.id); madeIds.push(m.id); });
    say('\n== ' + rel + '  Z-up ' + (r.zUp ? 'SIM' : 'não') + ' (' + r.zUpMotivo + ')  escala ×' + r.escala + ' (' + r.escalaMotivo + ')  ' + r.detectados + ' modelos detectados');
    say(pad('id', 36) + pad('tipo', 11) + pad('tris', 8) + pad('caixa (m)', 22) + pad('MB', 7) + 'obs');
    for (const m of r.feitos) say(pad(m.id, 36) + pad(m.tipo, 11) + pad(m.tris, 8) + pad(dimsStr(m.dims), 22) + pad(m.mb === null ? '-' : m.mb, 7) + (m.lods ? m.lods + ' LODs; ' : '') + (m.decimated ? 'decimado ' + m.decimated.de + '->' + m.decimated.para + '; ' : '') + m.avisos.join('; '));
    for (const s of r.pulados) say('  pulado: ' + s.nome + (s.id ? ' (' + s.id + ')' : '') + ' - ' + s.motivo);
    if (r.ignorados.length) say('  ignorados: ' + r.ignorados.map(i => i.nome).join(', '));
    for (const a of r.avisos) say('AVISO: ' + a); if (r.texturasFaltando.length) say('AVISO: texturas faltando: ' + r.texturasFaltando.slice(0, 10).join(', '));
    log.arquivos.push(r);
  }
  fs.mkdirSync(INV, { recursive: true }); if (!A.dry) fs.writeFileSync(path.join(INV, pack + '.split.json'), JSON.stringify(log, null, 1));
  say('\nSPLIT ' + pack + ': ' + madeIds.length + ' modelo(s) ' + (A.dry ? 'planejados' : 'gravados em assets/objects') + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  if (!A.dry && madeIds.length) {
    const v = await call('verify', { ids: madeIds }); log.verificacao = v; fs.writeFileSync(path.join(INV, pack + '.split.json'), JSON.stringify(log, null, 1));
    say('VERIFICAÇÃO (cada GLB reaberto):'); say(pad('id', 36) + pad('MB', 7) + pad('malhas', 7) + pad('tris', 8) + pad('caixa (m)', 22) + pad('base y', 8) + 'texturas'); let bad = 0;
    for (const x of v) { if (x.erro) { bad++; say(pad(x.id, 36) + 'ERRO ' + x.erro); continue; } const sus = x.nan || !x.meshes || x.invisiveis || Math.abs(x.baseY) > 0.01; if (sus) bad++; say(pad(x.id, 36) + pad(x.mb, 7) + pad(x.meshes, 7) + pad(x.tris, 8) + pad(dimsStr(x.dims), 22) + pad(x.baseY, 8) + x.texturas + (sus ? '  <-- SUSPEITO' : '')); }
    say(bad ? bad + ' GLB(s) suspeito(s)' : 'todos os GLBs abrem, têm malha, base em y=0'); const mbTot = v.reduce((s, x) => s + (x.mb || 0), 0); say('tamanho total: ' + mbTot.toFixed(1) + ' MB');
    if (!A['no-sheet']) { const n = Math.min(12, madeIds.length), pick = madeIds.length <= 12 ? madeIds : Array.from({ length: n }, (_, i) => madeIds[Math.round(i * (madeIds.length - 1) / (n - 1))]); const lines = await call('sheet', { ids: pick, out: pack + '_contato.png', cols: A.cols ? +A.cols : 4 }); say('folha de contato: assets/_inventario/' + pack + '_contato.png (' + pick.length + ' modelos)'); }
  }
  srv.server.close();
}
async function cmdVerify() {
  const spec = A._[1]; if (!spec) throw new Error('informe ids separados por vírgula ou prefixo*'); const all = fs.existsSync(OBJ) ? fs.readdirSync(OBJ) : [];
  const ids = spec.split(',').flatMap(s => s.endsWith('*') ? all.filter(i => i.startsWith(s.slice(0, -1))) : [s]);
  const srv = await boot(ASSETS); await call('setup', { texIndex: { names: {}, stems: {}, mtl: [], all: [] } });
  const v = await call('verify', { ids }); for (const x of v) say(x.erro ? x.id + ' ERRO ' + x.erro : pad(x.id, 36) + pad(x.mb + ' MB', 10) + pad(x.meshes + ' malhas', 11) + pad(x.tris + ' tris', 11) + dimsStr(x.dims) + ' m  base y=' + x.baseY + '  ' + x.texturas);
  if (A.out) await call('sheet', { ids: ids.slice(0, 24), out: path.basename(String(A.out)), cols: A.cols ? +A.cols : 4 });
  srv.server.close();
}

/* ================= resumo (sem dados dos assets pagos: só pastas e contagens) ================= */
function summary() {
  const files = fs.existsSync(INV) ? fs.readdirSync(INV).filter(f => f.endsWith('.json') && !f.endsWith('.split.json') && !f.startsWith('_')) : [], rows = []; const hashes = new Map();
  for (const f of files) { let j; try { j = JSON.parse(fs.readFileSync(path.join(INV, f), 'utf8')); } catch (e) { continue; }
    const tipos = j.resumo ? j.resumo.porTipo : {}, nf = (j.arquivos || []), falt = nf.reduce((s, a) => s + ((a.texturasFaltando || []).length), 0), err = nf.filter(a => a.erro).length;
    const obs = []; const zup = nf.filter(a => a.zUp).length; if (zup) obs.push('Z-up em ' + zup + ' arquivo(s)'); const esc = nf.filter(a => a.escalaSugerida && a.escalaSugerida !== 1).length; if (esc) obs.push('escala corrigida em ' + esc + ' arquivo(s)'); if (falt) obs.push(falt + ' textura(s) faltando'); if (err) obs.push(err + ' arquivo(s) não lido(s) (.blend ou erro)');
    if ((j.zips || []).some(z => z.duplicadoDe)) obs.push('zip duplicado'); const lods = j.resumo ? j.resumo.lodsExtras : 0; if (lods) obs.push(lods + ' LOD(s) extra');
    for (const a of nf) if (a.sha256) { if (!hashes.has(a.sha256)) hashes.set(a.sha256, []); hashes.get(a.sha256).push(j.pack); }
    rows.push({ pack: j.pack, arq: nf.length, mod: j.resumo ? j.resumo.modelos : 0, tri: j.resumo ? j.resumo.triangulos : 0, tipos, obs });
  }
  for (const [h, ps] of hashes) if (ps.length > 1) for (const r of rows) if (ps.includes(r.pack)) r.obs.push('arquivo idêntico em ' + ps.filter(p => p !== r.pack).join(', '));
  const L = ['# Inventário dos packs 3D', '', 'Gerado por `node engine/tools/pack-import.js summary` a partir de `projects/neon-coast/assets/_inventario/*.json` (pasta ignorada pelo git).', 'Só nomes de pasta e contagens agregadas; o detalhe por modelo fica no JSON local de cada pack.', '',
    '| Pack | Arquivos 3D | Modelos | Triângulos | Vegetação | Natureza | Urbano | Estrada | Outro | Observações |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
  const T = { arq: 0, mod: 0, tri: 0 };
  for (const r of rows) { const t = r.tipos || {}; L.push('| ' + r.pack + ' | ' + r.arq + ' | ' + r.mod + ' | ' + r.tri.toLocaleString('pt-BR') + ' | ' + (t['vegetação'] || 0) + ' | ' + (t.natureza || 0) + ' | ' + (t.urbano || 0) + ' | ' + (t.estrada || 0) + ' | ' + (t.outro || 0) + ' | ' + (r.obs.join('; ') || '-') + ' |'); T.arq += r.arq; T.mod += r.mod; T.tri += r.tri; }
  L.push('| **Total** | ' + T.arq + ' | ' + T.mod + ' | ' + T.tri.toLocaleString('pt-BR') + ' | | | | | | |', '');
  fs.mkdirSync(path.join(REPO, 'engine', 'docs'), { recursive: true }); fs.writeFileSync(path.join(REPO, 'engine', 'docs', 'packs-inventario.md'), L.join('\n')); console.log(L.join('\n')); console.log('\nescrito engine/docs/packs-inventario.md');
}

app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.log('TEMPO ESGOTADO (40 min)'); app.exit(5); }, 40 * 60 * 1000);
  try { if (CMD === 'inspect') await cmdInspect(); else if (CMD === 'split') await cmdSplit(); else if (CMD === 'verify') await cmdVerify(); clearTimeout(timer); app.exit(0); }
  catch (e) { console.log('FALHOU: ' + (e && e.stack || e)); clearTimeout(timer); app.exit(1); }
});
