// NEON ENGINE — API local do editor (rotas /__engine/*), usada pelo app desktop (editor/app/main.js) e pelo servidor de desenvolvimento (tools/serve.js).
// Só aceita pedidos da própria máquina (o servidor escuta em 127.0.0.1) e só escreve dentro de maps/ (e no data/sockets.json fixo).
// Anti-CSRF / DNS rebinding: todo pedido precisa de Host e (quando houver) Origin = 127.0.0.1:<porta> ou localhost:<porta> da própria engine; POST ainda exige Content-Type application/json (form/fetch simples de outra página não consegue).
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');

module.exports = function engineApi(opts) {
  const root = opts.root, desktop = !!opts.desktop, jobs = new Map(), P = require(path.join(opts.engine || path.resolve(__dirname, '..'), 'tools', 'project.js')), engineTools = path.join(P.ENGINE, 'tools');
  let jobSeq = 0;
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = (req, max = 600e6) => new Promise((ok, fail) => { let n = 0, over = false; const parts = []; req.on('data', d => { if (over) return; n += d.length; if (n > max) { over = true; parts.length = 0; fail(new Error('pedido grande demais (máximo ' + Math.round(max / 1024) + ' KB)')); req.resume(); } else parts.push(d); }); req.on('end', () => { if (over) return; try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { fail(new Error('JSON inválido: ' + e.message)); } }); req.on('error', fail); });
  const SOCKETS_FILE = path.join(root, 'data', 'sockets.json'), { socketsValidate, LIM: SOCKETS_LIM } = require(path.join(__dirname, '..', 'tools', 'sockets-validate.js'));      // caminho FIXO: nunca vem do cliente
  const sameOrigin = req => {                                           // true se Host (e Origin, quando existe) são o endereço local desta engine
    const port = req.socket && req.socket.localPort, hosts = ['127.0.0.1:' + port, 'localhost:' + port], h = req.headers.host, o = req.headers.origin;
    if (!port || typeof h !== 'string' || !hosts.includes(h.toLowerCase())) return false;
    if (o !== undefined && !hosts.some(x => String(o).toLowerCase() === 'http://' + x)) return false;
    return true;
  };
  const mapPath = rel => { if (typeof rel !== 'string' || !/^maps\/[\w\-\/]+\.json$/.test(rel) || rel.includes('..')) throw new Error('arquivo de mapa inválido: ' + rel); return path.join(root, rel); };
  /* roda um script de tools/ com o Node (no app desktop, o próprio Electron em modo Node) e guarda a saída num "job" */
  function runJob(script, args, label) {
    const id = ++jobSeq, job = { id, label, log: '', done: false, code: null, started: Date.now() };
    const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', NEON_PROJECT: root });   // as ferramentas da engine trabalham no projeto aberto
    const p = spawn(process.execPath, [path.join(engineTools, script)].concat(args), { cwd: root, env, windowsHide: true });
    const add = d => { job.log += d.toString(); if (job.log.length > 200000) job.log = job.log.slice(-150000); };
    p.stdout.on('data', add); p.stderr.on('data', add);
    p.on('error', e => { add('\n' + e.message); job.done = true; job.code = -1; });
    p.on('close', code => { job.done = true; job.code = code; });
    jobs.set(id, job); return job;
  }
  function listModels() {
    const dir = path.join(root, 'assets/models'), out = [];
    if (!fs.existsSync(dir)) return out;
    for (const id of fs.readdirSync(dir)) {
      if (id.startsWith('_')) continue;
      try { const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'model.json'), 'utf8')); out.push({ id, name: m.name || id, kind: m.kind || 'car', dims: m.dims || null }); } catch (e) { /* pasta sem model.json */ }
    }
    const od = path.join(root, 'assets/objects');                    // modelos 3D importados (GLB)
    if (fs.existsSync(od)) for (const id of fs.readdirSync(od)) { try { const m = JSON.parse(fs.readFileSync(path.join(od, id, 'object.json'), 'utf8')); if (fs.existsSync(path.join(od, id, 'model.glb'))) out.push({ id, name: m.name || id, kind: 'object3d', dims: m.dims || null, source: m.source || null, cat: m.cat || null, veg: !!m.veg }); } catch (e) { /* sem object.json */ } }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  function backup(file) {
    if (!fs.existsSync(file)) return;
    const dir = path.join(root, 'maps', '.backup'); fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(file, path.join(dir, path.basename(file, '.json') + '-' + stamp + '.json'));
    const old = fs.readdirSync(dir).filter(f => f.startsWith(path.basename(file, '.json') + '-')).sort();
    while (old.length > 30) fs.unlinkSync(path.join(dir, old.shift()));
  }

  return function handle(req, res) {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/__engine/')) return false;
    const route = url.slice('/__engine/'.length);
    if (!sameOrigin(req)) { send(res, 403, { ok: false, error: 'origem não permitida' }); req.resume(); return true; }
    if (req.method === 'POST' && !/^application\/json\s*(;|$)/i.test(String(req.headers['content-type'] || ''))) { send(res, 415, { ok: false, error: 'use Content-Type: application/json' }); req.resume(); return true; }
    (async () => {
      if (route === 'ping') return send(res, 200, { ok: true, desktop, root: desktop ? root : undefined });
      if (route === 'project') return send(res, 200, { ok: true, root: desktop ? root : undefined, folder: path.basename(root), manifest: P.readManifest(root), projects: P.listProjects().map(p => ({ name: p.name, folder: path.basename(p.root), root: desktop ? p.root : undefined, current: path.resolve(p.root) === path.resolve(root) })), recent: opts.recent ? opts.recent() : [] });
      if (route === 'models') return send(res, 200, { ok: true, models: listModels() });
      if (route === 'maps') { const d = path.join(root, 'maps'); return send(res, 200, { ok: true, maps: fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => 'maps/' + f) : [] }); }
      if (route === 'sockets' && req.method === 'GET') {                   // sockets e anexos das armas (data/sockets.json)
        const empty = { version: 1, weapons: {} }; let raw;
        try { raw = fs.readFileSync(SOCKETS_FILE, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return send(res, 200, { ok: true, exists: false, invalid: false, data: empty }); console.error('sockets: leitura falhou:', e); return send(res, 200, { ok: true, exists: true, invalid: true, erro: 'não foi possível ler data/sockets.json', data: empty }); }
        let v; try { v = socketsValidate(JSON.parse(raw)); } catch (e) { v = { ok: false, erro: 'JSON inválido: ' + e.message }; }
        // arquivo existe mas não presta: invalid:true (o editor avisa e bloqueia o salvar até o usuário confirmar, para não sobrescrever e perder dados)
        return send(res, 200, v.ok ? { ok: true, exists: true, invalid: false, data: v.data } : { ok: true, exists: true, invalid: true, erro: v.erro, data: empty });
      }
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'use POST' });
      const b = await body(req, route === 'save-sockets' ? SOCKETS_LIM.bytes : undefined);
      if (route === 'save-sockets') {
        const v = socketsValidate(b); if (!v.ok) throw new Error('sockets inválidos: ' + v.erro);
        const text = JSON.stringify(v.data, null, 2) + '\n', tmp = SOCKETS_FILE + '.tmp';
        try {
          fs.mkdirSync(path.dirname(SOCKETS_FILE), { recursive: true });
          if (fs.existsSync(SOCKETS_FILE)) { const bd = path.join(path.dirname(SOCKETS_FILE), '.backup'); fs.mkdirSync(bd, { recursive: true }); fs.copyFileSync(SOCKETS_FILE, path.join(bd, 'sockets.json.bak')); }     // data/.backup/ fica fora do build
          fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, SOCKETS_FILE);
        } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* não existia */ } console.error('save-sockets: falha ao gravar:', e); return send(res, 500, { ok: false, error: 'falha ao gravar o arquivo' }); }
        return send(res, 200, { ok: true, bytes: Buffer.byteLength(text), weapons: Object.keys(v.data.weapons).length });
      }
      if (route === 'save') {
        const file = mapPath(b.file), text = typeof b.text === 'string' ? b.text : JSON.stringify(b.data, null, 1);
        JSON.parse(text);                                                   // não grava JSON quebrado
        fs.mkdirSync(path.dirname(file), { recursive: true }); backup(file);
        const tmp = file + '.tmp'; fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, file);
        return send(res, 200, { ok: true, file: b.file, bytes: Buffer.byteLength(text) });
      }
      if (route === 'save-object') {                                       // modelo 3D convertido para GLB no editor
        const id = String(b.id || '').toLowerCase(); if (!/^[a-z0-9_]{2,60}$/.test(id)) throw new Error('ID inválido (letras minúsculas, números e _)');
        const buf = Buffer.from(String(b.glb || ''), 'base64'); if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('GLB inválido');
        const dir = path.join(root, 'assets/objects', id); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'model.glb'), buf);
        const meta = { id, name: String(b.name || id).slice(0, 80), kind: 'object3d', format: 'glb', dims: b.dims || null, source: b.source || null, triangles: b.triangles || null, imported: new Date().toISOString() };
        fs.writeFileSync(path.join(dir, 'object.json'), JSON.stringify(meta, null, 2));
        return send(res, 200, { ok: true, id, bytes: buf.length });
      }
      if (route === 'gta4-import') {                                       // modelos do GTA IV exportados com o OpenIV (.wdr/.wdd/.wft + .wtd)
        if (!b.dir || !fs.existsSync(b.dir)) throw new Error('escolha a pasta com os arquivos do GTA IV');
        const args = [b.dir, '--cat', String(b.cat || 'GTA IV').slice(0, 60)]; if (b.brasil) args.push('--brasil'); if (b.grama) args.push('--grama');
        return send(res, 200, { ok: true, job: runJob('gta4-import.js', args, 'Importar do GTA IV').id });
      }
      if (route === 'import') {
        if (!b.dff || !b.txd) throw new Error('escolha o .dff e o .txd');
        const args = ['--dff', b.dff, '--txd', b.txd]; if (b.id) args.push('--id', b.id); if (b.name) args.push('--name', b.name);
        return send(res, 200, { ok: true, job: runJob('import-object.js', args, 'Importar ' + path.basename(b.dff)).id });
      }
      if (route === 'build') return send(res, 200, { ok: true, job: runJob('build-game.js', [root], 'Gerar o executável do projeto').id });
      if (route === 'open-project') { if (!opts.openProject) return send(res, 200, { ok: false, error: 'só no app desktop' }); return send(res, 200, { ok: true, opened: await opts.openProject(b) }); }
      if (route === 'job') { const j = jobs.get(+b.id); if (!j) throw new Error('tarefa não encontrada'); return send(res, 200, { ok: true, job: j }); }
      if (route === 'pick') { if (!opts.pick) return send(res, 200, { ok: false, error: 'só no app desktop' }); return send(res, 200, { ok: true, files: await opts.pick(b) }); }
      if (route === 'play') { if (!opts.play) return send(res, 200, { ok: false, error: 'só no app desktop' }); await opts.play(b); return send(res, 200, { ok: true }); }
      if (route === 'reveal') { if (!opts.reveal) return send(res, 200, { ok: false }); opts.reveal(b.path ? path.join(root, b.path) : root); return send(res, 200, { ok: true }); }
      send(res, 404, { ok: false, error: 'rota desconhecida' });
    })().catch(e => send(res, 400, { ok: false, error: e.message }));
    return true;
  };
};
