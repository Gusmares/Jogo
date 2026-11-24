// Teste (Node puro, sem Electron) de sockets de arma: validação (engine e jogo iguais), delta/override do jogo e rotas /__engine/sockets e /__engine/save-sockets.
// Rodar: node projects/neon-coast/tools/test-sockets.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), vm = require('vm'), assert = require('assert');
const REPO = path.resolve(__dirname, '..', '..', '..');
const { socketsValidate: engineValidate } = require(path.join(REPO, 'engine', 'tools', 'sockets-validate.js'));
const engineApi = require(path.join(REPO, 'engine', 'app', 'engine-api.js'));
let n = 0; const ok = (name) => console.log('  ok  ' + name), T = (name, fn) => Promise.resolve().then(fn).then(() => { n++; ok(name); });

// o sockets.js do jogo roda num contexto isolado (sem fetch, sem weapons)
const ctx = vm.createContext({ console }); ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'gameplay', 'sockets.js'), 'utf8'), ctx, { filename: 'sockets.js' });
const game = ctx, J = x => JSON.parse(JSON.stringify(x));   // resultados do vm vêm de outro realm: compara por JSON

const v3 = (a, b, c) => [a, b, c], good = { version: 1, weapons: { fn_fal: { grip: { pos: v3(0.01, 0, -0.02), rot: v3(0, 0, 15) }, lhand: v3(-0.3, -0.08, 0.02), muzzle: 0.9, byAnim: { WALK_player: { pos: v3(0, 0.01, 0), rot: v3(5, 0, 0) }, RIFLE_fire: { pos: v3(0, 0, 0.005), rot: v3(0, 0, 0) } } }, taurus_247: { lhand: null, muzzle: null } } };
const tooMany = (k, f) => { const o = {}; for (let i = 0; i < k; i++) o[f(i)] = {}; return o; };
const bad = [
  ['não-objeto', null], ['array', []], ['versão 2', { version: 2, weapons: {} }], ['sem weapons', { version: 1 }], ['weapons array', { version: 1, weapons: [] }],
  ['id com espaço', { version: 1, weapons: { 'a b': {} } }], ['id com barra', { version: 1, weapons: { '../x': {} } }], ['id 65 chars', { version: 1, weapons: { ['a'.repeat(65)]: {} } }], ['id __proto__', JSON.parse('{"version":1,"weapons":{"__proto__":{}}}')],
  ['clipe inválido', { version: 1, weapons: { a: { byAnim: { 'x/y': { pos: v3(0, 0, 0), rot: v3(0, 0, 0) } } } } }],
  ['pos com 2 números', { version: 1, weapons: { a: { grip: { pos: [0, 0], rot: v3(0, 0, 0) } } } }], ['pos NaN/string', { version: 1, weapons: { a: { grip: { pos: ['1', 0, 0], rot: v3(0, 0, 0) } } } }],
  ['pos > 2', { version: 1, weapons: { a: { grip: { pos: v3(2.01, 0, 0), rot: v3(0, 0, 0) } } } }], ['rot > 360', { version: 1, weapons: { a: { grip: { pos: v3(0, 0, 0), rot: v3(0, 361, 0) } } } }],
  ['muzzle 0', { version: 1, weapons: { a: { muzzle: 0 } } }], ['muzzle negativo', { version: 1, weapons: { a: { muzzle: -0.3 } } }], ['muzzle > 5', { version: 1, weapons: { a: { muzzle: 5.01 } } }], ['id constructor', { version: 1, weapons: { constructor: {} } }], ['id prototype', { version: 1, weapons: { Prototype: {} } }],
  ['clipe constructor', { version: 1, weapons: { a: { byAnim: { constructor: { pos: v3(0, 0, 0), rot: v3(0, 0, 0) } } } } }], ['clipes duplicados (maiúsculas/minúsculas)', { version: 1, weapons: { a: { byAnim: { Walk: { pos: v3(0, 0, 0), rot: v3(0, 0, 0) }, WALK: { pos: v3(1, 0, 0), rot: v3(0, 0, 0) } } } } }],
  ['lhand fora', { version: 1, weapons: { a: { lhand: v3(0, 3, 0) } } }], ['muzzle string', { version: 1, weapons: { a: { muzzle: 'x' } } }],
  ['201 armas', { version: 1, weapons: tooMany(201, i => 'w' + i) }], ['101 clipes', { version: 1, weapons: { a: { byAnim: tooMany(101, i => 'c' + i) } } }]
];
const edge = [['200 armas', { version: 1, weapons: tooMany(200, i => 'w' + i) }], ['100 clipes', { version: 1, weapons: { a: { byAnim: Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['c' + i, { pos: v3(2, -2, 0), rot: v3(360, -360, 0) }])) } } }], ['id 64 chars', { version: 1, weapons: { ['a'.repeat(64)]: {} } }], ['vazio', { version: 1, weapons: {} }], ['muzzle 5', { version: 1, weapons: { a: { muzzle: 5 } } }], ['muzzle 0.02', { version: 1, weapons: { a: { muzzle: 0.02 } } }]];

function req(port, method, url, bodyStr, extra) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: url, headers: Object.assign(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}, extra || {}) }, rs => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* */ } res({ code: rs.statusCode, json: j }); }); });
    r.on('error', rej); if (bodyStr) r.write(bodyStr); r.end();
  });
}

(async () => {
  console.log('Validação (engine e jogo):');
  await T('exemplo válido passa nos dois', () => { for (const f of [engineValidate, game.socketsValidate]) { const r = f(good); assert(r.ok, r.erro); assert.deepStrictEqual(J(r.data.weapons.fn_fal.grip.rot), [0, 0, 15]); } });
  for (const [name, o] of edge) await T('limite aceito: ' + name, () => { for (const f of [engineValidate, game.socketsValidate]) assert(f(o).ok, name); });
  for (const [name, o] of bad) await T('rejeita: ' + name, () => { const a = engineValidate(o), b = game.socketsValidate(o); assert(!a.ok && !b.ok, 'deveria rejeitar'); assert(a.erro && /\S/.test(a.erro)); assert.strictEqual(a.erro, b.erro, 'mensagens diferentes: ' + a.erro + ' | ' + b.erro); });
  await T('campos desconhecidos são descartados', () => { const r = engineValidate({ version: 1, weapons: { a: { grip: { pos: v3(1, 1, 1), rot: v3(0, 0, 0), x: 1 }, evil: 1 } }, extra: 1 }); assert(r.ok); assert(!('extra' in r.data) && !('evil' in r.data.weapons.a) && !('x' in r.data.weapons.a.grip)); });

  console.log('Funções do jogo (sockets.js):');
  await T('sem dados: delta zero, sem override', () => { assert.deepStrictEqual(J(game.socketDelta('fn_fal', 'WALK_player')), { pos: [0, 0, 0], rot: [0, 0, 0] }); assert.deepStrictEqual(J(game.socketOverride('fn_fal')), { lhand: null, muzzle: null }); });
  await T('chaves de byAnim são normalizadas para minúsculas (engine e jogo)', () => { for (const f of [engineValidate, game.socketsValidate]) { const r = f(good); assert.deepStrictEqual(Object.keys(r.data.weapons.fn_fal.byAnim).sort(), ['rifle_fire', 'walk_player']); } });
  await T('socketsSet aceita; socketDelta: byAnim SUBSTITUI o grip (não soma), busca em minúsculas', () => {
    const r = game.socketsSet(good); assert(r.ok); const d = J(game.socketDelta('fn_fal', 'WALK_player'));
    assert.deepStrictEqual(d, { pos: [0, 0.01, 0], rot: [5, 0, 0] }, JSON.stringify(d));
    assert.deepStrictEqual(J(game.socketDelta('fn_fal', 'walk_player')), d);
    const g = J(game.socketDelta('fn_fal', 'outro_clipe')); assert.deepStrictEqual(g.pos, [0.01, 0, -0.02]); assert.deepStrictEqual(g.rot, [0, 0, 15]); assert.deepStrictEqual(J(game.socketDelta('desconhecida', 'x')), { pos: [0, 0, 0], rot: [0, 0, 0] });
    assert.deepStrictEqual(J(game.socketOverride('fn_fal')), { lhand: [-0.3, -0.08, 0.02], muzzle: 0.9 }); assert.strictEqual(ctx.SOCKETS.rev > 0, true);
  });
  await T('composição da rotação: gripQ * Euler(delta) (eixo da arma), não Euler * gripQ', () => {
    // mini-quaternions (x,y,z,w) sem three.js: grip calibrado = 90° em Y; delta = 90° em X (ordem XYZ com um só eixo = rotação simples)
    const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const ax = (x, y, z, deg) => { const h = deg * Math.PI / 360, s = Math.sin(h); return [x * s, y * s, z * s, Math.cos(h)]; };
    const rot = (q, v) => { const p = qm(qm(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
    const grip = ax(0, 1, 0, 90), delta = ax(1, 0, 0, 90), near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
    const meshQ = qm(grip, delta), wrong = qm(delta, grip);        // jogo/editor: grip * delta
    // eixo +Y da arma: o delta gira em X da própria arma (+Y -> +Z), depois o grip gira em Y (+Z -> +X)
    assert(near(rot(meshQ, [0, 1, 0]), [1, 0, 0]), JSON.stringify(rot(meshQ, [0, 1, 0])));
    assert(near(rot(wrong, [0, 1, 0]), [0, 0, 1]) && !near(rot(wrong, [0, 1, 0]), rot(meshQ, [0, 1, 0])));
    // e o código-fonte do jogo usa exatamente essa ordem
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'gameplay', 'weapons.js'), 'utf8');
    assert(src.includes('_sgq.copy(_sgb).multiply(_sge2.setFromEuler(_sge))'), 'weapons.js deve compor gripQ * Euler(delta)'); assert(src.includes('weapons.gripQ = _sgb.clone()'), 'weapons.gripQ deve ficar base (objeto novo)');
  });
  await T('weaponGripApply (jogo real, com three.js): delta somado UMA vez, não muta objetos guardados pelo editor, chave do clipe = a do editor', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'gameplay', 'weapons.js'), 'utf8'), a = src.indexOf('const _sgq'), b = src.indexOf('function attachWeapon');
    assert(a > 0 && b > a, 'trecho de weaponGripApply não encontrado'); const g = vm.createContext({ console, weapons: { mesh: null }, SOCKETS: ctx.SOCKETS, socketDelta: ctx.socketDelta });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'three.min.js'), 'utf8'), g, { filename: 'three.min.js' }); if (!g.THREE) g.THREE = vm.runInContext('typeof THREE !== "undefined" ? THREE : (this.THREE || self.THREE)', g);
    vm.runInContext(src.slice(a, b), g, { filename: 'weapons.js(trecho)' });
    const w = { id: 'fn_fal', grip: new g.THREE.Matrix4().compose(new g.THREE.Vector3(0.1, 0.2, 0.3), new g.THREE.Quaternion(), new g.THREE.Vector3(1, 1, 1)) };
    const editorGp = new g.THREE.Vector3(0.1, 0.2, 0.3), editorGq = new g.THREE.Quaternion();          // o que o editor guarda (SK.gp/SK.gq) e entrega ao jogo
    g.weapons.gripPos = editorGp.clone(); g.weapons.gripQ = editorGq.clone();
    game.socketsSet({ version: 1, weapons: { fn_fal: { grip: { pos: [0.02, 0, 0], rot: [0, 0, 0] } } } });
    assert.strictEqual(vm.runInContext('weaponGripApply', g)(w, 'idle_stance'), true);
    assert(Math.abs(g.weapons.gripPos.x - 0.12) < 1e-9, 'gripPos.x = base + delta uma vez, deu ' + g.weapons.gripPos.x);
    const held = g.weapons.gripPos; game.socketsSet({ version: 1, weapons: { fn_fal: { grip: { pos: [0.05, 0, 0], rot: [0, 0, 0] } } } }); g.weapons.gripKey = null; vm.runInContext('weaponGripApply', g)(w, 'idle_stance');
    assert(Math.abs(held.x - 0.12) < 1e-9, 'objeto guardado foi mutado'); assert(Math.abs(g.weapons.gripPos.x - 0.15) < 1e-9);
    const key = vm.runInContext('socketClipKey', g);
    assert.strictEqual(key({ name: 'IDLE_stance', overlay: { name: 'RIFLE_fire' } }), 'RIFLE_fire', 'parado com overlay de tiro/recarga: chave = overlay');
    assert.strictEqual(key({ name: 'GunMove_FWD', overlay: { name: 'RIFLE_fire' } }), 'GunMove_FWD', 'andando mirando: chave = clipe base');
    assert.strictEqual(key({ name: 'WALK_player', overlay: null }), 'WALK_player'); assert.strictEqual(key(null), ''); game.socketsSet(good);
  });
  await T('socketsSet inválido não troca os dados', () => { const r = game.socketsSet({ version: 9 }); assert(!r.ok && r.erro); assert(game.socketsExport().weapons.fn_fal); });
  await T('socketsExport devolve cópia', () => { const e = game.socketsExport(); e.weapons.fn_fal.muzzle = 99; assert.strictEqual(game.socketsExport().weapons.fn_fal.muzzle, 0.9); });

  console.log('Rotas /__engine/sockets e /__engine/save-sockets:');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-sockets-')), file = path.join(root, 'data', 'sockets.json');
  fs.writeFileSync(path.join(root, 'neon.project.json'), '{"name":"teste"}');
  const handle = engineApi({ root, desktop: false }), server = http.createServer((q, s) => { if (!handle(q, s)) { s.statusCode = 404; s.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  try {
    await T('GET sem arquivo -> vazio', async () => { const r = await req(port, 'GET', '/__engine/sockets'); assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.json, { ok: true, exists: false, invalid: false, data: { version: 1, weapons: {} } }); });
    await T('POST válido grava o arquivo no caminho fixo', async () => { const r = await req(port, 'POST', '/__engine/save-sockets', JSON.stringify(good)); assert.strictEqual(r.code, 200, JSON.stringify(r.json)); assert(r.json.ok); assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), engineValidate(good).data); assert(!fs.existsSync(file + '.tmp'), 'sobrou .tmp'); assert(!fs.existsSync(path.join(root, 'data', '.backup')), 'não havia versão anterior'); });
    await T('GET devolve o que foi gravado', async () => { const r = await req(port, 'GET', '/__engine/sockets'); assert(r.json.ok && r.json.exists && !r.json.invalid); assert.deepStrictEqual(r.json.data, engineValidate(good).data); });
    await T('segunda gravação guarda a anterior em data/.backup/ (fora do build)', async () => { const nova = { version: 1, weapons: { fn_fal: { muzzle: 1.1 } } }; const antes = fs.readFileSync(file, 'utf8'); const r = await req(port, 'POST', '/__engine/save-sockets', JSON.stringify(nova)); assert.strictEqual(r.code, 200); assert.strictEqual(fs.readFileSync(path.join(root, 'data', '.backup', 'sockets.json.bak'), 'utf8'), antes); assert(!fs.existsSync(file + '.bak')); assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).weapons.fn_fal.muzzle, 1.1); });
    const antes = fs.readFileSync(file, 'utf8'), antes2 = () => antes;
    for (const [name, o] of bad.slice(1)) await T('400 em português e sem gravar: ' + name, async () => { const r = await req(port, 'POST', '/__engine/save-sockets', JSON.stringify(o)); assert.strictEqual(r.code, 400, name); assert(r.json && r.json.ok === false && /inválid|deve|limite|demais|versão|número/.test(r.json.error), r.json && r.json.error); assert.strictEqual(fs.readFileSync(file, 'utf8'), antes); });
    await T('400 para JSON quebrado', async () => { const r = await req(port, 'POST', '/__engine/save-sockets', '{"version":'); assert.strictEqual(r.code, 400); assert(/JSON inválido/.test(r.json.error)); });
    await T('400 para corpo acima de 512 KB', async () => { const big = JSON.stringify({ version: 1, weapons: { a: { pad: 'x'.repeat(520 * 1024) } } }); const r = await req(port, 'POST', '/__engine/save-sockets', big); assert.strictEqual(r.code, 400); assert(/grande demais/.test(r.json.error), r.json.error); assert.strictEqual(fs.readFileSync(file, 'utf8'), antes); });
    await T('caminho vindo do cliente é ignorado', async () => { const r = await req(port, 'POST', '/__engine/save-sockets', JSON.stringify({ version: 1, weapons: {}, file: '../../evil.json', path: '../evil.json' })); assert.strictEqual(r.code, 200); assert(!fs.existsSync(path.join(root, '..', 'evil.json'))); assert(!fs.existsSync(path.join(root, 'evil.json'))); assert.deepStrictEqual(fs.readdirSync(root).sort(), ['data', 'neon.project.json']); });
    const J1 = JSON.stringify({ version: 1, weapons: {} }), url = '/__engine/save-sockets', H = port => ({ Origin: 'http://127.0.0.1:' + port });
    await T('POST text/plain (CSRF simples) -> 415 e não grava', async () => { const b4 = fs.readFileSync(file, 'utf8'); const r = await req(port, 'POST', url, J1, { 'Content-Type': 'text/plain' }); assert.strictEqual(r.code, 415); assert.strictEqual(fs.readFileSync(file, 'utf8'), b4); });
    await T('POST sem Content-Type -> 415', async () => { const r = await req(port, 'POST', url, J1, { 'Content-Type': '' }); assert.strictEqual(r.code, 415); });
    await T('POST form-urlencoded -> 415', async () => { const r = await req(port, 'POST', url, J1, { 'Content-Type': 'application/x-www-form-urlencoded' }); assert.strictEqual(r.code, 415); });
    await T('Origin estranho -> 403 e não grava', async () => { const b4 = fs.readFileSync(file, 'utf8'); for (const o of ['http://evil.example', 'null', 'http://127.0.0.1:1', 'http://localhost.evil.com:' + port]) { const r = await req(port, 'POST', url, J1, { Origin: o }); assert.strictEqual(r.code, 403, o); } assert.strictEqual(fs.readFileSync(file, 'utf8'), b4); });
    await T('Host estranho -> 403 (também no GET)', async () => { const r = await req(port, 'POST', url, J1, { Host: 'evil.example:' + port }); assert.strictEqual(r.code, 403); const g = await req(port, 'GET', '/__engine/sockets', null, { Host: 'evil.example' }); assert.strictEqual(g.code, 403); const g2 = await req(port, 'POST', url, J1, { Host: '127.0.0.1:' + (port + 1) }); assert.strictEqual(g2.code, 403); });
    await T('Origin e Host locais (127.0.0.1 e localhost) -> 200; Content-Type com charset aceito', async () => { const a = await req(port, 'POST', url, JSON.stringify(good), Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, H(port))); assert.strictEqual(a.code, 200, JSON.stringify(a.json)); const b = await req(port, 'POST', url, J1, { Origin: 'http://localhost:' + port, Host: 'localhost:' + port }); assert.strictEqual(b.code, 200, JSON.stringify(b.json)); });
    await T('GET com arquivo inválido -> invalid:true, sem apagar o arquivo', async () => { fs.writeFileSync(file, '{ quebrado'); const r = await req(port, 'GET', '/__engine/sockets'); assert.strictEqual(r.code, 200); assert(r.json.ok && r.json.invalid && r.json.exists && /S/.test(r.json.erro)); assert.deepStrictEqual(r.json.data, { version: 1, weapons: {} }); assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ quebrado'); fs.writeFileSync(file, JSON.stringify({ version: 1, weapons: { a: { muzzle: 0 } } })); const r2 = await req(port, 'GET', '/__engine/sockets'); assert(r2.json.invalid && /muzzle/.test(r2.json.erro)); fs.writeFileSync(file, antes); });
    await T('falha de fs -> 500 genérico em português, sem caminho, sem sobrar .tmp', async () => { fs.mkdirSync(file + '.tmp'); const r = await req(port, 'POST', url, JSON.stringify(good)); assert.strictEqual(r.code, 500); assert.strictEqual(r.json.error, 'falha ao gravar o arquivo'); assert(!r.json.error.includes(root) && !JSON.stringify(r.json).includes(os.tmpdir())); fs.rmSync(file + '.tmp', { recursive: true }); const r2 = await req(port, 'POST', url, JSON.stringify(good)); assert.strictEqual(r2.code, 200); assert(!fs.existsSync(file + '.tmp')); });
    await T('GET em save-sockets -> 405', async () => { const r = await req(port, 'GET', '/__engine/save-sockets'); assert.strictEqual(r.code, 405); });
  } finally { server.close(); fs.rmSync(root, { recursive: true, force: true }); }
  console.log('\n' + n + ' testes ok');
})().catch(e => { console.error('\nFALHOU:', e && e.stack || e); process.exit(1); });
