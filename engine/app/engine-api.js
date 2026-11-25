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
  const SOCKETS_FILE = path.join(root, 'data', 'sockets.json'), { socketsValidate, LIM: SOCKETS_LIM } = require(path.join(engineTools, 'sockets-validate.js'));      // caminho FIXO: nunca vem do cliente
  const ANIM_DIR = path.join(root, 'data', 'anims'), ANIM_BAK = path.join(root, 'data', '.backup', 'anims'), AV = require(path.join(engineTools, 'anim-validate.js')), AB = require(path.join(engineTools, 'anim-bake.js'));      // caminhos FIXOS: o cliente só manda o id [a-z0-9_-]
  const animId = v => { if (typeof v !== 'string' || !AV.ID.test(v) || AV.RESERVED.includes(v)) throw new Error('id de animação inválido (use a-z 0-9 _ - de 1 a 64 caracteres)'); return v; };
  const animFile = id => path.join(ANIM_DIR, animId(id) + '.json'), stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  const animSummary = (d, bytes) => ({ id: d.id, name: d.name, base: d.base, duration: d.duration, loop: d.loop, fps: d.fps, bones: Object.keys(d.bones).length, ik: d.ik.length, events: d.events.length, bytes });
  const fsFail = (what, e) => { console.error('anim: ' + what + ':', e); const x = new Error(what + ' (detalhes no console do servidor)'); x.http = 500; return x; };      // erro de disco: o cliente só vê texto genérico (nada de caminho absoluto)
  const fsDo = (what, fn) => { try { return fn(); } catch (e) { throw e && e.http ? e : fsFail(what, e); } };
  function animRead(id) { const text = fsDo('falha ao ler o arquivo da animação', () => fs.readFileSync(animFile(id), 'utf8')), v = AV.animValidate(JSON.parse(text)); if (!v.ok) throw new Error('animação "' + id + '" inválida no disco: ' + v.erro); return { data: v.data, bytes: Buffer.byteLength(text) }; }
  function animList() {                                                  // lê a pasta (fonte da verdade); arquivo inválido entra com invalid:true para o editor avisar
    const out = []; if (!fs.existsSync(ANIM_DIR)) return out;
    for (const f of fsDo('falha ao listar as animações', () => fs.readdirSync(ANIM_DIR)).sort()) {
      const m = /^([a-z0-9_-]{1,64})\.json$/.exec(f); if (!m || AV.RESERVED.includes(m[1])) continue;
      try { const r = animRead(m[1]); out.push(animSummary(r.data, r.bytes)); } catch (e) { out.push({ id: m[1], invalid: true, erro: e.http || !e.code ? e.message : 'não foi possível ler o arquivo' }); }
    }
    return out;
  }
  function animWriteAtomic(file, text) { const tmp = file + '.tmp'; try { fs.writeFileSync(tmp, text, 'utf8'); fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* não existia */ } console.error('anim: falha ao gravar:', e); const x = new Error('falha ao gravar o arquivo'); x.http = 500; throw x; } }
  function animReindex() {                                               // data/anims/index.json = lista que o jogo lê (id, name, base, duration); reescrito a cada salvar/apagar
    const clips = animList().filter(a => !a.invalid).map(a => ({ id: a.id, name: a.name, base: a.base, duration: a.duration })), text = JSON.stringify({ version: 1, clips }, null, 1) + '\n', file = path.join(ANIM_DIR, 'index.json');
    fsDo('falha ao preparar a pasta das animações', () => fs.mkdirSync(ANIM_DIR, { recursive: true })); let cur = null; try { cur = fs.readFileSync(file, 'utf8'); } catch (e) { /* ainda não existe */ }
    if (cur !== text) animWriteAtomic(file, text); return clips;
  }
  /* cópias de segurança de um id em data/.backup/anims/: novas = <id>@<data>.json (o @ não existe em id, sem ambiguidade); antigas = <id>-<data>.json (continuam valendo); apagadas = <id>.deleted-<data>.json.
     -> [{ file, stamp, kind }] do mais antigo para o mais novo (a data ISO ordena como texto) */
  const STAMP = '(\\d{4}-\\d\\d-\\d\\dT[\\d-]+Z)';
  function animBackups(id) {
    let names; try { names = fs.readdirSync(ANIM_BAK); } catch (e) { if (e.code === 'ENOENT') return []; throw fsFail('falha ao ler as cópias de segurança', e); }
    const rx = [[new RegExp('^' + id + '@' + STAMP + '\\.json$'), 'version'], [new RegExp('^' + id + '-' + STAMP + '\\.json$'), 'version'], [new RegExp('^' + id + '\\.deleted-' + STAMP + '\\.json$'), 'deleted']], out = [];
    for (const f of names) for (const [r, kind] of rx) { const m = r.exec(f); if (m) { out.push({ file: f, stamp: m[1], kind }); break; } }
    return out.sort((x, y) => x.stamp < y.stamp ? -1 : x.stamp > y.stamp ? 1 : 0);
  }
  function animSave(data, overwrite) {                                   // valida, guarda a versão anterior em data/.backup/anims/ e grava com rename atômico
    const v = AV.animValidate(data); if (!v.ok) throw new Error('animação inválida: ' + v.erro);
    const text = AV.animStringify(v.data); if (Buffer.byteLength(text) > AV.LIM.bytes) throw new Error('animação grande demais (máximo ' + (AV.LIM.bytes >> 20) + ' MB)');
    const file = animFile(v.data.id); fsDo('falha ao preparar a pasta das animações', () => fs.mkdirSync(ANIM_DIR, { recursive: true }));
    if (fs.existsSync(file)) {
      if (overwrite === false) throw new Error('já existe uma animação com o id "' + v.data.id + '"');
      fsDo('falha ao guardar a cópia de segurança da versão anterior', () => {
        fs.mkdirSync(ANIM_BAK, { recursive: true }); fs.copyFileSync(file, path.join(ANIM_BAK, v.data.id + '@' + stamp() + '.json'));
        const old = animBackups(v.data.id).filter(x => x.kind === 'version'); while (old.length > 10) fs.unlinkSync(path.join(ANIM_BAK, old.shift().file));
      });
    }
    animWriteAtomic(file, text); animReindex(); return { data: v.data, bytes: Buffer.byteLength(text), avisos: v.avisos || [] };
  }
  function animRestore(id, backup) {                                     // volta a versão mais recente (ou a nomeada) de data/.backup/anims/; a versão atual também vai para o backup (dá para desfazer)
    const list = animBackups(id); if (!list.length) throw new Error('não há versão anterior guardada para "' + id + '"');
    let pick = list[list.length - 1];
    if (backup !== undefined && backup !== null) { pick = list.find(x => x.file === backup); if (!pick) throw new Error('cópia de segurança não encontrada'); }      // só aceita nome que a própria listagem produziu
    const text = fsDo('falha ao ler a cópia de segurança', () => fs.readFileSync(path.join(ANIM_BAK, pick.file), 'utf8'));
    let obj; try { obj = JSON.parse(text); } catch (e) { throw new Error('a cópia de segurança não é um JSON válido'); }
    if (!obj || obj.id !== id) throw new Error('a cópia de segurança é de outra animação');
    const r = animSave(obj, true); return { data: r.data, bytes: r.bytes, file: pick.file, avisos: r.avisos };
  }
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
      if (req.method === 'GET' && route === 'anims') return send(res, 200, { ok: true, anims: animList(), index: (() => { try { return JSON.parse(fs.readFileSync(path.join(ANIM_DIR, 'index.json'), 'utf8')); } catch (e) { return null; } })(), boneNames: AV.BONE_NAMES, limits: AV.LIM });
      if (req.method === 'GET' && route === 'anim') { const id = new URL(req.url, 'http://x').searchParams.get('id'); try { animId(id); } catch (e) { return send(res, 400, { ok: false, error: e.message }); } if (!fs.existsSync(animFile(id))) return send(res, 404, { ok: false, error: 'animação não encontrada: ' + id }); return send(res, 200, { ok: true, anim: animRead(id).data }); }
      if (req.method === 'GET' && route === 'anim-clips') return send(res, 200, { ok: true, clips: AB.listClips(root), edited: animList().map(a => a.id) });
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'use POST' });
      const b = await body(req, route === 'save-sockets' ? SOCKETS_LIM.bytes : route === 'save-anim' ? AV.LIM.bytes : route === 'dup-anim' || route === 'delete-anim' || route === 'restore-anim' ? 8 * 1024 : undefined);
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
      if (route === 'save-anim') { const r = animSave(b.anim === undefined ? b : b.anim, b.overwrite); return send(res, 200, { ok: true, id: r.data.id, bytes: r.bytes, avisos: r.avisos, anim: animSummary(r.data, r.bytes) }); }
      if (route === 'restore-anim') { const id = animId(b.id); if (b.backup !== undefined && b.backup !== null && (typeof b.backup !== 'string' || b.backup.length > 128)) throw new Error('backup inválido'); const r = animRestore(id, b.backup); return send(res, 200, { ok: true, id, restored: r.file, bytes: r.bytes, avisos: r.avisos, anim: r.data }); }
      if (route === 'delete-anim') {                                       // não apaga de verdade: move para data/.backup/anims/<id>.deleted-<data>.json
        const id = animId(b.id), file = animFile(id); if (!fs.existsSync(file)) throw new Error('animação não encontrada: ' + id);
        fsDo('falha ao mover a animação para o backup', () => { fs.mkdirSync(ANIM_BAK, { recursive: true }); fs.renameSync(file, path.join(ANIM_BAK, id + '.deleted-' + stamp() + '.json')); }); animReindex();
        return send(res, 200, { ok: true, id, moved: 'data/.backup/anims/' });
      }
      if (route === 'dup-anim') {                                          // from: id editável OU nome de clipe .ifp; to: novo id (já existe = erro, a menos que overwrite:true)
        const to = animId(b.to), src = b.source === undefined ? 'auto' : b.source; if (!['auto', 'edit', 'ifp'].includes(src)) throw new Error('source deve ser auto, edit ou ifp');
        if (b.pack !== undefined && (typeof b.pack !== 'string' || !/^[\w.-]{1,40}$/.test(b.pack))) throw new Error('pack inválido');
        if (b.fps !== undefined && !(typeof b.fps === 'number' && b.fps >= 5 && b.fps <= 120)) throw new Error('fps deve ser um número de 5 a 120');
        if (typeof b.from !== 'string' || !b.from || b.from.length > 64) throw new Error('"from" deve ser o id de uma animação editável ou o nome de um clipe .ifp');
        let data, info = { from: 'ifp' };
        const editId = AV.ID.test(b.from) ? b.from : null, hasEdit = !!editId && !AV.RESERVED.includes(editId) && fs.existsSync(animFile(editId));
        if (src === 'edit' || (src === 'auto' && hasEdit)) { if (!hasEdit) throw new Error('animação editável não encontrada: ' + b.from); data = animRead(editId).data; data.id = to; data.name = typeof b.name === 'string' && b.name ? b.name : to; info = { from: 'edit' }; }
        else {
          const f = AB.findIfp(root, b.from, b.pack); if (!f) throw new Error('clipe .ifp não encontrado: ' + b.from);
          const r0 = AB.bakeIfp(f.clip, { id: to, name: typeof b.name === 'string' && b.name ? b.name : to, fps: b.fps || 30, resample: !!b.resample }); data = r0.data; info = { from: 'ifp', pack: f.pack, resampled: r0.resampled, reduced: r0.reduced, maxErrDeg: r0.maxErrDeg, fps: r0.fps };
        }
        const r = animSave(data, b.overwrite === true ? undefined : false); return send(res, 200, Object.assign({ ok: true, id: to, bytes: r.bytes, anim: animSummary(r.data, r.bytes) }, info));
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
    })().catch(e => send(res, e.http || 400, { ok: false, error: e.message }));
    return true;
  };
};
