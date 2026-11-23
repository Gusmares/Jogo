// NEON ENGINE — API local do editor (rotas /__engine/*), usada pelo app desktop (editor/app/main.js) e pelo servidor de desenvolvimento (tools/serve.js).
// Só aceita pedidos da própria máquina (o servidor escuta em 127.0.0.1) e só escreve dentro de maps/.
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');

module.exports = function engineApi(opts) {
  const root = opts.root, desktop = !!opts.desktop, jobs = new Map(), P = require(path.join(opts.engine || path.resolve(__dirname, '..'), 'tools', 'project.js')), engineTools = path.join(P.ENGINE, 'tools');
  let jobSeq = 0;
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = req => new Promise((ok, fail) => { let n = 0; const parts = []; req.on('data', d => { n += d.length; if (n > 40e6) { fail(new Error('pedido grande demais')); req.destroy(); } else parts.push(d); }); req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { fail(e); } }); req.on('error', fail); });
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
    (async () => {
      if (route === 'ping') return send(res, 200, { ok: true, desktop, root: desktop ? root : undefined });
      if (route === 'project') return send(res, 200, { ok: true, root: desktop ? root : undefined, folder: path.basename(root), manifest: P.readManifest(root), projects: P.listProjects().map(p => ({ name: p.name, folder: path.basename(p.root), root: desktop ? p.root : undefined, current: path.resolve(p.root) === path.resolve(root) })), recent: opts.recent ? opts.recent() : [] });
      if (route === 'models') return send(res, 200, { ok: true, models: listModels() });
      if (route === 'maps') { const d = path.join(root, 'maps'); return send(res, 200, { ok: true, maps: fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => 'maps/' + f) : [] }); }
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'use POST' });
      const b = await body(req);
      if (route === 'save') {
        const file = mapPath(b.file), text = typeof b.text === 'string' ? b.text : JSON.stringify(b.data, null, 1);
        JSON.parse(text);                                                   // não grava JSON quebrado
        fs.mkdirSync(path.dirname(file), { recursive: true }); backup(file);
        const tmp = file + '.tmp'; fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, file);
        return send(res, 200, { ok: true, file: b.file, bytes: Buffer.byteLength(text) });
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
