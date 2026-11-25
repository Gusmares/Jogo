// Teste (Node puro, sem Electron) das animações editáveis: validação (engine = jogo), bake de .ifp real (original x bake), substituição de clipe pelo mesmo nome,
// IK por clipe e rotas /__engine/anims, anim, anim-clips, save-anim, delete-anim, dup-anim (servidor com pasta temporária).
// Rodar: node projects/neon-coast/tools/test-anims.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), vm = require('vm'), assert = require('assert');
const REPO = path.resolve(__dirname, '..', '..', '..'), PROJ = path.join(__dirname, '..');
const AV = require(path.join(REPO, 'engine', 'tools', 'anim-validate.js')), AB = require(path.join(REPO, 'engine', 'tools', 'anim-bake.js'));
const engineApi = require(path.join(REPO, 'engine', 'app', 'engine-api.js'));
let n = 0; const T = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('  ok  ' + name); });
const J = x => JSON.parse(JSON.stringify(x));

/* ---- o jogo (anim.js + anim-edit.js) num contexto isolado, com o three.js do projeto ---- */
const ctx = vm.createContext({ console }); ctx.globalThis = ctx; ctx.self = ctx;
vm.runInContext(fs.readFileSync(path.join(PROJ, 'vendor', 'three.min.js'), 'utf8'), ctx, { filename: 'three.min.js' }); if (!ctx.THREE) ctx.THREE = vm.runInContext('typeof THREE !== "undefined" ? THREE : (this.THREE || self.THREE)', ctx);
vm.runInContext('const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;', ctx);
const animSrc = fs.readFileSync(path.join(PROJ, 'js', 'entities', 'anim.js'), 'utf8'), editSrc = fs.readFileSync(path.join(PROJ, 'js', 'entities', 'anim-edit.js'), 'utf8');
vm.runInContext(animSrc, ctx, { filename: 'anim.js' });
const run = code => vm.runInContext(code, ctx);
const ifpBuf = f => { const b = fs.readFileSync(path.join(PROJ, 'assets', 'anims', f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
ctx.__ifpBuf = ifpBuf('ped.ifp'); run('ifpReady.ped = parseIfp(__ifpBuf)');      // antes do anim-edit.js: o editável tem de vencer mesmo assim
vm.runInContext(editSrc, ctx, { filename: 'anim-edit.js' });
const skinMan = JSON.parse(fs.readFileSync(path.join(PROJ, 'assets', 'models', 'skins', 'player_argentina', 'skin.json'), 'utf8'));
ctx.__man = skinMan;
run(`globalThis.__mkActor = function (man) { const bones = [], index = {}, group = new THREE.Group(); man.bones.forEach((b, i) => { const bone = new THREE.Bone(); bone.name = b.name; new THREE.Matrix4().fromArray(b.local).decompose(bone.position, bone.quaternion, bone.scale); bones.push(bone); index[b.name] = i; (b.parent >= 0 ? bones[b.parent] : group).add(bone); }); group.updateMatrixWorld(true); const a = { group, bones, index, info: man.bones }; a.ap = new AnimPlayer(a); return a; };`);

const q = (x, y, z, w) => { const l = Math.hypot(x, y, z, w); return [x / l, y / l, z / l, w / l]; };
const minimal = (o) => Object.assign({ version: 1, id: 'teste', name: 'Teste', base: null, fps: 30, duration: 1, loop: true, bones: { 1: { rot: [[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]] } }, ik: [], events: [], notes: '' }, o || {});
function req(port, method, url, bodyStr, extra) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: url, headers: Object.assign(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}, extra || {}) }, rs => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { /* */ } res({ code: rs.statusCode, json: j }); }); });
    r.on('error', rej); if (bodyStr) r.write(bodyStr); r.end();
  });
}
const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / Math.hypot(a.x, a.y, a.z, a.w) / Math.hypot(b.x, b.y, b.z, b.w))) * 180 / Math.PI;      // o IFP quantizado vem com norma 0,94 a 1,16: compara só a direção

(async () => {
  console.log('Validação (engine e jogo iguais):');
  await T('o bloco do validador no jogo é cópia exata do da engine', () => { const ev = fs.readFileSync(path.join(REPO, 'engine', 'tools', 'anim-validate.js'), 'utf8'); assert(editSrc.includes(ev.slice(ev.indexOf('const LIM'), ev.indexOf('module.exports')).trimEnd()), 'rode a injeção de novo: anim-edit.js desatualizado'); });
  await T('convenção do jogo: IFP_CONJ=false (a engine assume (-x, z, y))', () => assert(/const IFP_CONJ = false/.test(animSrc)));
  const ik = { chain: 'lhand', target: { space: 'weapon', pos: [-0.3, -0.08, 0.02] }, weight: [[0, 0], [0.2, 1], [0.8, 1], [1, 0]], hint: [0, -1, 0] };
  const good = minimal({ base: 'WALK_civi', bones: { 1: { rot: [[0, 0, 0, 0, 1.5], [0.5, 0, 0.7, 0, 0.7], [1, 0, 0, 0, 1]], pos: [[0, 0, 0, 0], [1, 0, 0.1, 0]] }, 0: { rot: [[0, 0, 0, 0, 1]], pos: [[0, 0, 0, 0]] } }, ik: [ik], events: [{ t: 0.5, name: 'passo' }], notes: 'x' });
  const bad = [
    ['não-objeto', null], ['versão 2', minimal({ version: 2 })], ['id com maiúscula', minimal({ id: 'Walk' })], ['id com espaço', minimal({ id: 'a b' })], ['id com barra', minimal({ id: '../x' })], ['id 65 chars', minimal({ id: 'a'.repeat(65) })], ['id reservado index', minimal({ id: 'index' })], ['id __proto__', minimal({ id: '__proto__' })],
    ['sem ossos', minimal({ bones: {} })], ['ossos não-objeto', minimal({ bones: [] })], ['65 ossos', minimal({ bones: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [i, { rot: [[0, 0, 0, 0, 1]] }])) })], ['id de osso não numérico', minimal({ bones: { pelvis: { rot: [[0, 0, 0, 0, 1]] } } })],
    ['osso sem rot', minimal({ bones: { 1: {} } })], ['rot vazio', minimal({ bones: { 1: { rot: [] } } })], ['601 quadros', minimal({ duration: 7, bones: { 1: { rot: Array.from({ length: 601 }, (_, i) => [i / 100, 0, 0, 0, 1]) } } })],
    ['tempos repetidos', minimal({ bones: { 1: { rot: [[0, 0, 0, 0, 1], [0, 0, 0, 0, 1]] } } })], ['tempos decrescentes', minimal({ bones: { 1: { rot: [[0.5, 0, 0, 0, 1], [0.2, 0, 0, 0, 1]] } } })], ['tempo negativo', minimal({ bones: { 1: { rot: [[-1, 0, 0, 0, 1]] } } })],
    ['quaternio zero', minimal({ bones: { 1: { rot: [[0, 0, 0, 0, 0]] } } })], ['quaternio NaN', minimal({ bones: { 1: { rot: [[0, NaN, 0, 0, 1]] } } })], ['quaternio com 4 números', minimal({ bones: { 1: { rot: [[0, 0, 0, 1]] } } })], ['quaternio string', minimal({ bones: { 1: { rot: [[0, '0', 0, 0, 1]] } } })], ['quaternio enorme', minimal({ bones: { 1: { rot: [[0, 9, 0, 0, 1]] } } })],
    ['pos com 3 números', minimal({ bones: { 1: { rot: [[0, 0, 0, 0, 1]], pos: [[0, 0, 0]] } } })], ['pos fora do limite', minimal({ bones: { 1: { rot: [[0, 0, 0, 0, 1]], pos: [[0, 99, 0, 0]] } } })],
    ['duration menor que o último quadro', minimal({ duration: 0.5 })], ['duration 0', minimal({ duration: 0, bones: { 1: { rot: [[0, 0, 0, 0, 1]] } } })], ['duration > 120', minimal({ duration: 121 })], ['fps 0', minimal({ fps: 0 })], ['fps 1000', minimal({ fps: 1000 })], ['loop string', minimal({ loop: 'sim' })], ['base inválida', minimal({ base: 'a/b' })], ['name vazio', minimal({ name: '' })],
    ['ik chain inválida', minimal({ ik: [{ chain: 'cabeca', target: { space: 'world', pos: [0, 0, 0] } }] })], ['ik espaço inválido', minimal({ ik: [{ chain: 'lhand', target: { space: 'lua', pos: [0, 0, 0] } }] })], ['ik world sem pos', minimal({ ik: [{ chain: 'lhand', target: { space: 'world' } }] })], ['ik bone sem id', minimal({ ik: [{ chain: 'lhand', target: { space: 'bone', pos: [0, 0, 0] } }] })],
    ['ik peso > 1', minimal({ ik: [{ chain: 'lhand', target: { space: 'actor', pos: [0, 0, 0] }, weight: [[0, 1.5]] }] })], ['ik peso tempos repetidos', minimal({ ik: [{ chain: 'lhand', target: { space: 'actor', pos: [0, 0, 0] }, weight: [[0, 1], [0, 1]] }] })], ['ik cadeia repetida', minimal({ ik: [ik, ik] })], ['ik pos NaN', minimal({ ik: [{ chain: 'lhand', target: { space: 'actor', pos: [0, NaN, 0] } }] })],
    ['ik hint zero', minimal({ ik: [{ chain: 'lhand', target: { space: 'actor', pos: [0, 0, 0] }, hint: [0, 0, 0] }] })], ['9 ik', minimal({ ik: Array.from({ length: 9 }, () => ik) })], ['evento sem nome', minimal({ events: [{ t: 0 }] })], ['evento fora da duração', minimal({ events: [{ t: 5, name: 'x' }] })], ['notes enorme', minimal({ notes: 'x'.repeat(2001) })]
  ];
  await T('exemplo válido passa nos dois e dá o mesmo resultado; quaternio normalizado, duration mantida', () => {
    const a = AV.animValidate(good), b = J(run('animValidate')(good)); assert(a.ok, a.erro); assert.deepStrictEqual(J(a), b);
    const q0 = a.data.bones[1].rot[0]; assert(Math.abs(Math.hypot(q0[1], q0[2], q0[3], q0[4]) - 1) < 1e-9); assert.strictEqual(a.data.duration, 1); assert.strictEqual(a.data.ik[0].hint[1], -1);
  });
  await T('limites aceitos: 64 ossos, 600 quadros, 8 ik, id de 64 caracteres, id numérico no meio', () => {
    for (const o of [minimal({ bones: Object.fromEntries(Array.from({ length: 64 }, (_, i) => [i, { rot: [[0, 0, 0, 0, 1]] }])) }), minimal({ duration: 6, bones: { 1: { rot: Array.from({ length: 600 }, (_, i) => [i / 100, 0, 0, 0, 1]) } } }), minimal({ id: 'a'.repeat(64) }), minimal({ ik: Object.keys(AV.CHAINS).map(c => ({ chain: c, target: { space: 'actor', pos: [0, 0, 0] } })) })]) { assert(AV.animValidate(o).ok); assert(run('animValidate')(o).ok); }
  });
  for (const [name, o] of bad) await T('rejeita: ' + name, () => { const a = AV.animValidate(o), b = run('animValidate')(o); assert(!a.ok && !b.ok, 'deveria rejeitar'); assert(a.erro && /\S/.test(a.erro)); assert.strictEqual(a.erro, b.erro); });
  await T('campos desconhecidos são descartados; ik/events ausentes viram []', () => { const r = AV.animValidate(Object.assign(minimal(), { extra: 1, evil: { a: 1 } })); delete r.data.ik; assert(r.ok); const r2 = AV.animValidate({ version: 1, id: 'x', bones: { 1: { rot: [[0, 0, 0, 0, 1], [0.8, 0, 0, 0, 1]], lixo: 1 } } }); assert(r2.ok && !('extra' in r.data) && !('lixo' in r2.data.bones[1]) && r2.data.ik.length === 0 && r2.data.events.length === 0 && r2.data.duration === 0.8 && r2.data.fps === 30 && r2.data.loop === true); });

  await T('animStringify: só colapsa arrays puros de números (texto com "[ 1, 2 ]" no nome/notas fica intacto) e o arquivo continua válido', () => {
    const o = AV.animValidate(minimal({ name: 'a [ 1, 2 ] b', notes: 'x [\n 1,\n 2 ] y [ 3 ]' })); assert(o.ok, o.erro); const txt = AV.animStringify(o.data), back = JSON.parse(txt);
    assert.strictEqual(back.name, 'a [ 1, 2 ] b'); assert.strictEqual(back.notes, 'x [\n 1,\n 2 ] y [ 3 ]'); assert(txt.includes('"a [ 1, 2 ] b"')); assert(/\[0,0,0,0,1\]/.test(txt), 'quadros em uma linha'); assert.strictEqual(run('animStringify')(o.data), txt);
  });
  await T('ids reservados do Windows (com0-9, lpt0-9) e cadeias IK com nomes de Object (constructor, __proto__, toString) são rejeitados', () => {
    for (const id of ['com0', 'com5', 'com9', 'lpt0', 'lpt4', 'lpt9', 'nul', 'aux']) assert(!AV.animValidate(minimal({ id })).ok && !run('animValidate')(minimal({ id })).ok, id);
    for (const chain of ['constructor', '__proto__', 'toString', 'hasOwnProperty', ['lhand']]) { const o = minimal({ ik: [{ chain, target: { space: 'actor', pos: [0, 0, 0] } }] }); assert(!AV.animValidate(o).ok && !run('animValidate')(o).ok, String(chain)); }
  });
  await T('aviso (não erro) de velocidade média da raiz > 15 m/s só em walk_/run_/sprint_/woman_', () => {
    const fast = id => minimal({ id, bones: { 0: { rot: [[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]], pos: [[0, 0, 0, 0], [1, 0, 0, 18]] } } });
    for (const id of ['walk_rapido', 'run_x', 'sprint_x', 'woman_x']) { const a = AV.animValidate(fast(id)), b = run('animValidate')(fast(id)); assert(a.ok && a.avisos.length === 1 && /m\/s/.test(a.avisos[0]), id); assert.deepStrictEqual(J(a), J(b)); }
    assert.strictEqual(AV.animValidate(fast('gunmove_x')).avisos.length, 0); const slow = AV.animValidate(Object.assign(fast('walk_lento'), { bones: { 0: { rot: [[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]], pos: [[0, 0, 0, 0], [1, 0, 0, 1.5]] } } })); assert(slow.ok && slow.avisos.length === 0);
  });
  await T('clipSpeed de clipe editável é limitado a 15 m/s (NPC não é lançado); o de .ifp não muda', () => {
    const fastClip = minimal({ id: 'walk_veloz', bones: { 0: { rot: [[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]], pos: [[0, 0, 0, 0], [1, 0, 0, 18]] } } }); assert(run('animEditSet')(fastClip).ok);
    const sp = run('clipSpeed')('walk_veloz'); assert(sp > 0 && sp <= 15 + 1e-9, 'velocidade ' + sp); run('animEditRemove')('walk_veloz');
  });

  console.log('Bake de clipes reais (original x bake):');
  const ped = run('ifpReady.ped'), orig = n => ped.anims[n.toLowerCase()];
  await T('parser Node da engine == parseIfp do jogo (ped.ifp: mesmos nós e quadros)', () => {
    const e = AB.parseIfp(fs.readFileSync(path.join(PROJ, 'assets', 'anims', 'ped.ifp'))), names = Object.keys(e.anims); assert.strictEqual(names.length, Object.keys(ped.anims).length);
    for (const k of names) { const a = e.anims[k], b = ped.anims[k]; assert.strictEqual(a.nodes.length, b.nodes.length, k); for (let i = 0; i < a.nodes.length; i++) { assert.strictEqual(a.nodes[i].frames, b.nodes[i].frames); assert.strictEqual(a.nodes[i].bone, b.nodes[i].bone); assert(a.nodes[i].quats.every((v, j) => v === b.nodes[i].quats[j]) && a.nodes[i].times.every((v, j) => v === b.nodes[i].times[j])); } }
  });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-anims-')); fs.mkdirSync(path.join(tmpRoot, 'assets', 'anims'), { recursive: true }); for (const f of fs.readdirSync(path.join(PROJ, 'assets', 'anims'))) fs.copyFileSync(path.join(PROJ, 'assets', 'anims', f), path.join(tmpRoot, 'assets', 'anims', f)); fs.writeFileSync(path.join(tmpRoot, 'neon.project.json'), '{"name":"teste"}');
  const sample = (clip, bone, t) => { const node = clip.nodes.find(x => x.bone === bone), o = { q: new ctx.THREE.Quaternion(), t: null }; run('sampleNode')(node, t, o); const gq = run('ifpQuat')(o.q, new ctx.THREE.Quaternion()); return { q: gq, t: o.t }; };
  for (const name of ['WALK_civi', 'GunMove_FWD', 'WALK_player', 'IDLE_stance']) {
    await T('bake de ' + name + ': rotação e posição batem (erro < 0,5° em 20 tempos, todos os ossos), quadros originais mantidos', () => {
      const o = orig(name), f = AB.findIfp(tmpRoot, name), r = AB.bakeIfp(f.clip, { id: 'bake_' + name.toLowerCase(), fps: 30 }); assert(!r.resampled, 'não deveria reamostrar');
      assert.strictEqual(Object.keys(r.data.bones).length, o.nodes.length); for (const node of o.nodes) assert.strictEqual(r.data.bones[node.bone].rot.length, node.frames, 'quadros do osso ' + node.bone);
      const res = run('animEditSet')(r.data); assert(res.ok, res.erro); const ed = run('findClip')('bake_' + name.toLowerCase()); assert(ed && ed._eid); assert(Math.abs(ed.duration - o.duration) < 1e-4);
      let worst = 0, worstP = 0; for (let k = 0; k < 20; k++) { const t = o.duration * k / 19; for (const node of o.nodes) { const a = sample(o, node.bone, t), b = sample(ed, node.bone, t); worst = Math.max(worst, ang(a.q, b.q)); if (a.t) for (let c = 0; c < 3; c++) worstP = Math.max(worstP, Math.abs(a.t[c] - b.t[c])); } }
      assert(worst < 0.5, 'erro de rotação ' + worst + '°'); assert(worstP < 0.002, 'erro de posição ' + worstP + ' m'); console.log('       erro máx.: ' + worst.toFixed(4) + '°, posição ' + (worstP * 1000).toFixed(3) + ' mm, ' + o.nodes.length + ' ossos');
      assert(Math.abs(run('clipSpeed')('bake_' + name.toLowerCase()) - run('clipSpeed')(name)) < 0.01, 'clipSpeed diferente'); const ra = run('clipRootAt')(name, o.duration * 0.5), rb = run('clipRootAt')('bake_' + name.toLowerCase(), o.duration * 0.5); for (let c = 0; c < 3; c++) assert(Math.abs(ra[c] - rb[c]) < 0.002, 'clipRootAt');
    });
  }
  await T('clipe com > 600 quadros por osso (Crazed_bdance, 1150) tem os quadros reduzidos por tolerância (sem reamostrar), cabe nos limites e o erro medido respeita a tolerância informada (perda inevitável: o limite é 600 quadros por osso)', () => {
    const f = AB.findIfp(tmpRoot, 'Crazed_bdance'); assert(f, 'clipe não encontrado'); const r = AB.bakeIfp(f.clip, { id: 'dancao', fps: 30 }); assert(!r.resampled && r.reduced && r.maxErrDeg > 0); assert(Object.values(r.data.bones).every(b => b.rot.length <= 600));
    const res = run('animEditSet')(r.data); assert(res.ok); ctx.__ub = ifpBuf('urbanize.ifp'); run('ifpReady.urbanize = parseIfp(__ub)'); const o = run('ifpReady.urbanize').anims.crazed_bdance, ed = run('findClip')('dancao'); let worst = 0; for (let k = 0; k < 20; k++) { const t = o.duration * k / 19; for (const node of o.nodes) worst = Math.max(worst, ang(sample(o, node.bone, t).q, sample(ed, node.bone, t).q)); }
    assert(worst <= r.maxErrDeg * 1.05 + 0.01, 'erro ' + worst + '° maior que a tolerância declarada ' + r.maxErrDeg); console.log('       tolerância de redução ' + r.maxErrDeg.toFixed(3) + '°, erro máx. medido ' + worst.toFixed(4) + '°');
  });
  await T('todos os clipes .ifp com ossos de personagem (' + AB.listClips(tmpRoot).filter(c => c.bones > 0).length + ' de ' + AB.listClips(tmpRoot).length + ') fazem bake válido (<= 2 MB, <= 600 quadros); os sem osso dão erro claro', () => {
    let bad = 0, big = 0, res = 0; for (const c of AB.listClips(tmpRoot)) { if (!c.bones) { assert.throws(() => AB.bakeIfp(AB.findIfp(tmpRoot, c.name, c.pack).clip, { id: 'x' }), /sem ossos de personagem/); continue; } try { const r = AB.bakeIfp(AB.findIfp(tmpRoot, c.name, c.pack).clip, { id: 'x', fps: 30 }); if (r.reduced) res++; big = Math.max(big, Buffer.byteLength(AV.animStringify(r.data))); } catch (e) { bad++; console.log('       falhou: ' + c.name + ': ' + e.message); } }
    assert.strictEqual(bad, 0); console.log('       com quadros reduzidos: ' + res + '; maior arquivo: ' + (big / 1024).toFixed(0) + ' KB');
  });
  await T('reamostragem forçada (resample, 15 fps) de WALK_civi: erro < 5° (é perda assumida; o padrão mantém os quadros)', () => {
    const o = orig('WALK_civi'), r = AB.bakeIfp(AB.findIfp(tmpRoot, 'WALK_civi').clip, { id: 'w15', fps: 15, resample: true }); assert(r.resampled); assert(r.data.bones[1].rot.length < o.nodes.find(x => x.bone === 1).frames + 1);
    run('animEditSet')(r.data); const ed = run('findClip')('w15'); let worst = 0; for (let k = 0; k < 20; k++) for (const node of o.nodes) worst = Math.max(worst, ang(sample(o, node.bone, o.duration * k / 19).q, sample(ed, node.bone, o.duration * k / 19).q)); assert(worst < 5, worst + '°');
  });
  await T('animEditFromClip (no jogo) == bake da engine (mesmos quadros, diferença < 1e-5)', () => {
    for (const name of ['WALK_civi', 'GunMove_FWD']) {
      const a = run('animEditFromClip')(orig(name), 'x'), b = AB.bakeIfp(AB.findIfp(tmpRoot, name).clip, { id: 'x' }); assert(a.ok, a.erro); const A = J(a.data), B = J(b.data); assert.strictEqual(A.base, B.base); assert(Math.abs(A.duration - B.duration) < 1e-5);
      for (const id in B.bones) { assert.strictEqual(A.bones[id].rot.length, B.bones[id].rot.length); A.bones[id].rot.forEach((f, i) => f.forEach((v, k) => assert(Math.abs(v - B.bones[id].rot[i][k]) < 1e-5))); if (B.bones[id].pos) A.bones[id].pos.forEach((f, i) => f.forEach((v, k) => assert(Math.abs(v - B.bones[id].pos[i][k]) < 1e-5))); }
    }
  });
  await T('trilhas rot e pos com tempos diferentes viram um nó só (união dos tempos), sem erro', () => {
    const d = minimal({ id: 'uniao', duration: 1, bones: { 1: { rot: [[0, 0, 0, 0, 1], [1, 0, 0.5, 0, 0.8660254]], pos: [[0, 0, 0, 0], [0.5, 1, 0, 0], [1, 2, 0, 0]] } } }); const r = run('animEditSet')(d); assert(r.ok); const c = run('findClip')('uniao'), node = c.nodes[0];
    assert.strictEqual(node.frames, 3); const s = sample(c, 1, 0.5); assert(Math.abs(s.t[0] + 1) < 1e-5, 'pos x (espaço do jogo -> IFP é (-x))'); assert(s.q.w > 0.9 && s.q.w < 0.9999, 'rotação interpolada entre 0 e 60° (30° em torno de Y)');
  });

  console.log('Substituição de clipe pelo mesmo nome:');
  await T('editável com o mesmo nome do .ifp substitui: findClip, AnimPlayer.play, clipSpeed; remover devolve o original; vale mesmo com o .ifp carregado antes', () => {
    const find = run('findClip'); assert(!find('WALK_player')._eid); const origC = find('WALK_player'), sp0 = run('clipSpeed')('WALK_player'), r = AB.bakeIfp(AB.findIfp(tmpRoot, 'WALK_player').clip, { id: 'walk_player', fps: 30 });
    const a = ctx.__mkActor(skinMan), ap = a.ap; ap.play('WALK_player', { fade: 0 }); ap.update(0.3); const i = a.index.lupperarm, before = a.bones[i].quaternion.clone();
    const rot = r.data.bones[32].rot; for (const f of rot) { const qq = q(f[1], f[2] + 0.5, f[3], f[4]); f[1] = qq[0]; f[2] = qq[1]; f[3] = qq[2]; f[4] = qq[3]; }       // edita o braço esquerdo em todos os quadros
    assert(run('animEditSet')(r.data).ok); const c2 = find('WALK_player'); assert(c2 && c2._eid === 'walk_player' && c2 !== origC, 'findClip deve devolver o editável');
    assert.strictEqual(ap.cur, origC, 'antes do próximo update ainda é o antigo'); ap.update(0.0001); assert.strictEqual(ap.cur, c2, 'o player em execução troca para o editável (edição ao vivo)');
    const after = a.bones[i].quaternion.clone(); assert(ang(before, after) > 5, 'o osso deveria mudar (mudou ' + ang(before, after).toFixed(1) + '°)');
    const a2 = ctx.__mkActor(skinMan); assert(a2.ap.play('WALK_player', { fade: 0 })); assert.strictEqual(a2.ap.cur, c2); a2.ap.update(0.3); assert(ang(a2.bones[i].quaternion, after) < 0.5);
    assert(Math.abs(run('clipSpeed')('WALK_player') - sp0) < 0.01, 'a velocidade natural continua a mesma (só mexi num braço)'); console.log('       osso lupperarm mudou ' + ang(before, after).toFixed(1) + '°');
    assert(run('animEditRemove')('walk_player')); assert(find('WALK_player') === origC); ap.update(0.0001); assert.strictEqual(ap.cur, origC, 'removido: volta ao .ifp'); assert(!run('animEditRemove')('walk_player'));
  });
  await T('animEditSet inválido não troca nada; animEditEvents; animEditExport devolve cópia; loop manual', () => {
    const r = run('animEditSet')(minimal({ id: 'walk_civi', version: 3 })); assert(!r.ok && r.erro); assert(!run('findClip')('WALK_civi')._eid);
    run('animEditSet')(minimal({ id: 'ev', duration: 2, events: [{ t: 0.5, name: 'a' }, { t: 1.9, name: 'b' }] })); const c = run('findClip')('ev'), E = run('animEditEvents');
    assert.deepStrictEqual(J(E(c, 0.4, 0.6)), ['a']); assert.deepStrictEqual(J(E(c, 1.8, 0.1)), ['b']); assert.deepStrictEqual(J(E(c, 0.6, 1.0)), []); const x = run('animEditExport')('ev'); x.events.length = 0; assert.strictEqual(run('animEditExport')('ev').events.length, 2);
  });

  console.log('IK por clipe (animIkApply + gancho em AnimPlayer.update):');
  const handDist = (a, p) => new ctx.THREE.Vector3().setFromMatrixPosition(a.bones[a.index.lhand].matrixWorld).distanceTo(p);
  await T('lhand no espaço "actor" em GunMove_FWD: mão a < 3 cm do alvo; sem ik a mão fica longe; peso 0 não mexe', () => {
    const r = AB.bakeIfp(AB.findIfp(tmpRoot, 'GunMove_FWD').clip, { id: 'gunmove_fwd', fps: 30 });
    assert(run('animEditSet')(r.data).ok);                                  // sem ik: referência
    const a0 = ctx.__mkActor(skinMan); a0.group.position.set(3, 0, -2); a0.group.rotation.y = 0.7; a0.ap.play('GunMove_FWD', { fade: 0 }); a0.ap.update(0.35); a0.group.updateMatrixWorld(true);
    const base = new ctx.THREE.Vector3().setFromMatrixPosition(a0.bones[a0.index.lhand].matrixWorld), baseLocal = a0.group.worldToLocal(base.clone()), tgtLocal = [baseLocal.x + 0.12, baseLocal.y + 0.18, baseLocal.z + 0.1];
    r.data.ik = [{ chain: 'lhand', target: { space: 'actor', pos: tgtLocal }, weight: [[0, 1]], hint: null, }]; assert(run('animEditSet')(r.data).ok);
    const tgtW = a0.group.localToWorld(new ctx.THREE.Vector3(tgtLocal[0], tgtLocal[1], tgtLocal[2])); assert(base.distanceTo(tgtW) > 0.15, 'o alvo deveria estar longe da mão original');
    const a = ctx.__mkActor(skinMan); a.group.position.set(3, 0, -2); a.group.rotation.y = 0.7; a.ap.play('GunMove_FWD', { fade: 0 }); a.ap.update(0.35); a.group.updateMatrixWorld(true);
    const d = handDist(a, tgtW); assert(d < 0.03, 'distância ' + d); console.log('       sem IK a mão estaria a ' + (base.distanceTo(tgtW) * 100).toFixed(1) + ' cm; com IK: ' + (d * 100).toFixed(2) + ' cm'); assert(a._ikLast && a._ikLast.clip.ik.length === 1);
    const d2 = r.data; d2.ik[0].weight = [[0, 0]]; run('animEditSet')(d2); const b = ctx.__mkActor(skinMan); b.group.position.set(3, 0, -2); b.group.rotation.y = 0.7; b.ap.play('GunMove_FWD', { fade: 0 }); b.ap.update(0.35); b.group.updateMatrixWorld(true); assert(handDist(b, base) < 1e-4, 'peso 0 não deve mexer na pose');
    d2.ik[0].weight = [[0, 0], [0.7, 0]]; d2.ik[0].weight = [[0, 0], [1, 1]]; run('animEditSet')(d2); const c = ctx.__mkActor(skinMan); c.group.position.set(3, 0, -2); c.group.rotation.y = 0.7; c.ap.play('GunMove_FWD', { fade: 0 }); c.ap.update(0.35); c.group.updateMatrixWorld(true); const dm = handDist(c, tgtW), t = c.ap.wrapT(c.ap.cur, c.ap.time); assert(dm > 0.03 && dm < base.distanceTo(tgtW), 'peso intermediário (' + t.toFixed(2) + ') deve ficar entre os dois: ' + dm);
    run('animEditRemove')('gunmove_fwd');
  });
  await T('lhand no espaço "weapon" com matriz de arma e ponto lhand do contexto/da entrada; "bone"; pé; orientação rot', () => {
    const THREE = ctx.THREE, a = ctx.__mkActor(skinMan); a.ap.play('IDLE_stance', { fade: 0 }); a.ap.update(0.1); a.group.updateMatrixWorld(true);
    const M = new THREE.Matrix4().compose(new THREE.Vector3(0.2, 0.2, 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.2, 0.2)), new THREE.Vector3(1, 1, 1)), clip = { ik: [{ chain: 'lhand', target: { space: 'weapon', pos: null }, weight: [[0, 1]], hint: null }] };
    let r = ctx.animIkApply(a, clip, 0, { weaponMatrix: M, lhand: [-0.2, -0.05, 0.02] }); const want = new THREE.Vector3(-0.2, -0.05, 0.02).applyMatrix4(M); assert.strictEqual(r.length, 1); assert(handDist(a, want) < 0.03, 'weapon+ctx.lhand: ' + handDist(a, want)); assert(r[0].err < 0.03);
    const a2 = ctx.__mkActor(skinMan); a2.ap.play('IDLE_stance', { fade: 0 }); a2.ap.update(0.1); clip.ik[0].target.pos = [-0.25, 0, 0.05]; ctx.animIkApply(a2, clip, 0, { weaponMatrix: M }); assert(handDist(a2, new THREE.Vector3(-0.25, 0, 0.05).applyMatrix4(M)) < 0.03, 'weapon com pos na entrada');
    assert.strictEqual(ctx.animIkApply(a2, { ik: [{ chain: 'lhand', target: { space: 'weapon', pos: null }, weight: [[0, 1]] }] }, 0, {}).length, 0, 'sem arma e sem ponto: ignora sem quebrar');
    const a3 = ctx.__mkActor(skinMan); a3.ap.play('IDLE_stance', { fade: 0 }); a3.ap.update(0.1); a3.group.updateMatrixWorld(true); const head = a3.bones[a3.index.head], hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const hb = new THREE.Vector3(0.1, 0.02, 0.15).applyMatrix4(head.matrixWorld); r = ctx.animIkApply(a3, { ik: [{ chain: 'lhand', target: { space: 'bone', bone: 5, pos: [0.1, 0.02, 0.15] }, weight: [[0, 1]], hint: [0, -1, 0] }] }, 0, {}); assert(handDist(a3, hb) < 0.03, 'bone: ' + handDist(a3, hb));
    const a4 = ctx.__mkActor(skinMan); a4.ap.play('IDLE_stance', { fade: 0 }); a4.ap.update(0.1); a4.group.updateMatrixWorld(true); const foot = a4.bones[a4.index.rfoot], fp = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld), ft = fp.clone().add(new THREE.Vector3(0.05, 0.12, 0.2));
    r = ctx.animIkApply(a4, { ik: [{ chain: 'rfoot', target: { space: 'world', pos: [ft.x, ft.y, ft.z] }, weight: [[0, 1]], hint: [0, 0, 1] }] }, 0, {}); assert(r[0].err < 0.03, 'pé: ' + r[0].err);
    const a5 = ctx.__mkActor(skinMan); a5.ap.play('IDLE_stance', { fade: 0 }); a5.ap.update(0.1); a5.group.updateMatrixWorld(true);
    ctx.animIkApply(a5, { ik: [{ chain: 'lhand', target: { space: 'world', pos: [0.25, 0.3, 0.3], rot: [0, 90, 0] }, weight: [[0, 1]] }] }, 0, {}); const wq = new THREE.Quaternion(); a5.bones[a5.index.lhand].getWorldQuaternion(wq); assert(ang(wq, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))) < 0.5, 'orientação da mão');
    assert(handDist(a5, new THREE.Vector3(0.25, 0.3, 0.3)) < 0.03, 'posição com rot');
  });
  await T('alvo fora do alcance: braço estica sem NaN; clipe sem ik não custa nada', () => {
    const a = ctx.__mkActor(skinMan); a.ap.play('IDLE_stance', { fade: 0 }); a.ap.update(0.1); const r = ctx.animIkApply(a, { ik: [{ chain: 'lhand', target: { space: 'world', pos: [5, 5, 5] }, weight: [[0, 1]] }] }, 0, {});
    assert(r[0].err > 3 && a.bones.every(b => isFinite(b.quaternion.x + b.quaternion.y + b.quaternion.z + b.quaternion.w))); assert.deepStrictEqual(J(ctx.animIkApply(a, { ik: [] }, 0)), []); assert.deepStrictEqual(J(ctx.animIkApply(a, {}, 0)), []);
  });

  console.log('Rotas /__engine/anims, anim, anim-clips, save-anim, delete-anim, dup-anim:');
  const handle = engineApi({ root: tmpRoot, desktop: false }), server = http.createServer((a, b) => { if (!handle(a, b)) { b.statusCode = 404; b.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port, D = path.join(tmpRoot, 'data', 'anims'), BK = path.join(tmpRoot, 'data', '.backup', 'anims'), post = (u, o, h) => req(port, 'POST', '/__engine/' + u, JSON.stringify(o), h), get = u => req(port, 'GET', '/__engine/' + u);
  try {
    await T('GET anims sem pasta -> lista vazia, boneNames e limites', async () => { const r = await get('anims'); assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.json.anims, []); assert.strictEqual(r.json.index, null); assert.strictEqual(r.json.boneNames['32'], 'lupperarm'); assert.strictEqual(r.json.limits.frames, 600); });
    await T('GET anim-clips lista todos os .ifp com duração e nº de ossos', async () => { const r = await get('anim-clips'); assert(r.json.ok); const c = r.json.clips.find(x => x.name === 'WALK_player'); assert(c && c.pack === 'ped' && c.bones > 20 && Math.abs(c.duration - orig('WALK_player').duration) < 1e-3, JSON.stringify(c)); assert(r.json.clips.length > 700); assert(r.json.clips.every(x => x.name && x.pack && x.maxFrames > 0)); assert.deepStrictEqual(r.json.edited, []); });
    await T('dup-anim de um .ifp cria <to>.json e index.json sem tocar no original', async () => {
      const ifpBefore = fs.readFileSync(path.join(tmpRoot, 'assets', 'anims', 'ped.ifp')); const r = await post('dup-anim', { from: 'GunMove_FWD', to: 'minha_mira', name: 'Minha mira' }); assert.strictEqual(r.code, 200, JSON.stringify(r.json)); assert(r.json.ok && r.json.from === 'ifp' && r.json.pack === 'ped' && !r.json.resampled && r.json.anim.base === 'GunMove_FWD');
      const f = JSON.parse(fs.readFileSync(path.join(D, 'minha_mira.json'), 'utf8')); assert.strictEqual(f.id, 'minha_mira'); assert.strictEqual(f.name, 'Minha mira'); assert.strictEqual(f.base, 'GunMove_FWD'); assert.strictEqual(f.version, 1); assert(AV.animValidate(f).ok);
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), { version: 1, clips: [{ id: 'minha_mira', name: 'Minha mira', base: 'GunMove_FWD', duration: f.duration }] }); assert(ifpBefore.equals(fs.readFileSync(path.join(tmpRoot, 'assets', 'anims', 'ped.ifp'))), '.ifp intocado'); assert(!fs.readdirSync(D).some(x => x.endsWith('.tmp')));
      assert(/\n  *\[\d/.test(fs.readFileSync(path.join(D, 'minha_mira.json'), 'utf8')), 'um quadro por linha'); assert(fs.statSync(path.join(D, 'minha_mira.json')).size < 400 * 1024);
    });
    await T('dup-anim com id existente -> 400 sem sobrescrever; overwrite:true sobrescreve com backup', async () => { const f0 = fs.readFileSync(path.join(D, 'minha_mira.json'), 'utf8'); let r = await post('dup-anim', { from: 'WALK_civi', to: 'minha_mira' }); assert.strictEqual(r.code, 400); assert(/já existe/.test(r.json.error)); assert.strictEqual(fs.readFileSync(path.join(D, 'minha_mira.json'), 'utf8'), f0); r = await post('dup-anim', { from: 'WALK_civi', to: 'minha_mira', overwrite: true }); assert.strictEqual(r.code, 200); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(D, 'minha_mira.json'), 'utf8')).base, 'WALK_civi'); assert.strictEqual(fs.readdirSync(BK).filter(x => x.startsWith('minha_mira@')).length, 1); assert.strictEqual(fs.readFileSync(path.join(BK, fs.readdirSync(BK).find(x => x.startsWith('minha_mira@'))), 'utf8'), f0); });
    await T('dup-anim de uma editável copia (base preservada, id/name novos); source:ifp ignora a editável de mesmo nome', async () => {
      let r = await post('dup-anim', { from: 'minha_mira', to: 'copia_mira' }); assert(r.json.ok && r.json.from === 'edit'); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(D, 'copia_mira.json'), 'utf8')).base, 'WALK_civi');
      r = await post('dup-anim', { from: 'walk_civi', to: 'walk_civi' }); assert.strictEqual(r.code, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.from, 'ifp', 'sem editável com esse id, vai ao .ifp (nome case-insensitive)'); assert.strictEqual(r.json.anim.id, 'walk_civi');
      r = await post('dup-anim', { from: 'walk_civi', to: 'walk_civi2', source: 'edit' }); assert.strictEqual(r.json.from, 'edit'); r = await post('dup-anim', { from: 'minha_mira', to: 'cru_mira', source: 'ifp' }); assert.strictEqual(r.code, 400, 'minha_mira não é nome de clipe .ifp'); assert(/não encontrado/.test(r.json.error));
      r = await post('dup-anim', { from: 'WALK_civi', to: 'w_pack', pack: 'urbanize' }); assert.strictEqual(r.code, 400); r = await post('dup-anim', { from: 'WALK_civi', to: 'w_resample', resample: true, fps: 12 }); assert(r.json.ok && r.json.resampled && r.json.fps === 12);
    });
    await T('dup-anim de clipe > 600 quadros reduz os quadros automaticamente (reduced:true)', async () => { const r = await post('dup-anim', { from: 'Crazed_bdance', to: 'dancao' }); assert.strictEqual(r.code, 200, JSON.stringify(r.json)); assert(!r.json.resampled && r.json.reduced && r.json.anim.duration > 37); });
    await T('GET anims lista tudo (id, name, base, duration) + índice; GET anim devolve o JSON', async () => { const r = await get('anims'); assert(r.json.anims.length >= 6); const m = r.json.anims.find(x => x.id === 'minha_mira'); assert(m && m.base === 'WALK_civi' && m.duration > 0 && m.name === 'minha_mira'); assert.strictEqual(r.json.index.clips.length, r.json.anims.length); const g = await get('anim?id=copia_mira'); assert(g.json.ok && g.json.anim.id === 'copia_mira' && g.json.anim.bones['1'].rot.length > 3); assert.strictEqual((await get('anim?id=nao_existe')).code, 404); });
    await T('GET anim com id malicioso -> 400', async () => { for (const id of ['..%2F..%2Fneon.project', '../x', 'index', 'A', '', 'a%00b', '__proto__']) { const g = await get('anim?id=' + id); assert.strictEqual(g.code, 400, id + ' -> ' + g.code); } assert.strictEqual((await get('anim')).code, 400); });
    await T('save-anim valida e grava (cópia anterior em data/.backup/anims, 10 no máx.), tmp não sobra, ids de fora ignorados', async () => {
      const cur = (await get('anim?id=copia_mira')).json.anim; cur.name = 'Editada'; cur.bones['32'].rot[0][2] += 0.1; cur.ik = [{ chain: 'lhand', target: { space: 'weapon', pos: [-0.3, -0.08, 0.02] }, weight: [[0, 1]] }]; cur.notes = 'teste'; let r = await post('save-anim', { anim: cur }); assert.strictEqual(r.code, 200, JSON.stringify(r.json)); assert(r.json.ok && r.json.anim.ik === 1);
      const f = JSON.parse(fs.readFileSync(path.join(D, 'copia_mira.json'), 'utf8')); assert.strictEqual(f.name, 'Editada'); assert.strictEqual(f.ik[0].target.space, 'weapon'); assert(fs.readdirSync(BK).some(x => x.startsWith('copia_mira@'))); assert(!fs.readdirSync(D).some(x => x.endsWith('.tmp')));
      for (let i = 0; i < 12; i++) { cur.notes = 'v' + i; r = await post('save-anim', cur); assert.strictEqual(r.code, 200); } assert.strictEqual(fs.readdirSync(BK).filter(x => x.startsWith('copia_mira@')).length, 10);
      assert.strictEqual(JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')).clips.find(c => c.id === 'copia_mira').name, 'Editada');
    });
    const before = () => fs.readdirSync(D).sort().join(',') + fs.readFileSync(path.join(D, 'copia_mira.json'), 'utf8').length;
    for (const [name, o] of bad.filter(x => x[1]).slice(0, 60)) await T('save-anim 400 e não grava: ' + name, async () => { const b4 = before(); const r = await post('save-anim', { anim: o }); assert.strictEqual(r.code, 400, name); assert(r.json.ok === false && /\S/.test(r.json.error)); assert.strictEqual(before(), b4); });
    await T('save-anim: POST text/plain -> 415; Origin/Host estranhos -> 403 (GET também); >2 MB -> 400; JSON quebrado -> 400', async () => {
      const body = JSON.stringify({ anim: minimal({ id: 'x1' }) }); assert.strictEqual((await req(port, 'POST', '/__engine/save-anim', body, { 'Content-Type': 'text/plain' })).code, 415); assert.strictEqual((await req(port, 'POST', '/__engine/save-anim', body, { 'Content-Type': '' })).code, 415);
      assert.strictEqual((await req(port, 'POST', '/__engine/save-anim', body, { Origin: 'http://evil.example' })).code, 403); assert.strictEqual((await req(port, 'GET', '/__engine/anims', null, { Host: 'evil.example' })).code, 403); assert.strictEqual((await req(port, 'GET', '/__engine/anim-clips', null, { Origin: 'null' })).code, 403);
      assert(!fs.existsSync(path.join(D, 'x1.json'))); const big = JSON.stringify({ anim: minimal({ id: 'x2', notes: 'x'.repeat(2.2 * 1024 * 1024) }) }); const r = await req(port, 'POST', '/__engine/save-anim', big); assert.strictEqual(r.code, 400); assert(/grande demais/.test(r.json.error)); assert(!fs.existsSync(path.join(D, 'x2.json')));
      const r2 = await req(port, 'POST', '/__engine/save-anim', '{ quebrado'); assert.strictEqual(r2.code, 400); assert(/JSON inválido/.test(r2.json.error)); assert.strictEqual((await req(port, 'GET', '/__engine/save-anim')).code, 405);
    });
    await T('dup-anim/delete-anim: entradas inválidas -> 400 (id fora do padrão, from enorme, fps ruim, source ruim, pack com caminho)', async () => {
      for (const o of [{ from: 'WALK_civi', to: '../fora' }, { from: 'WALK_civi', to: 'A' }, { from: 'WALK_civi', to: 'index' }, { from: 'x'.repeat(100), to: 'ok1' }, { from: 'WALK_civi', to: 'ok1', fps: 1000 }, { from: 'WALK_civi', to: 'ok1', source: 'x' }, { from: 'WALK_civi', to: 'ok1', pack: '../ped' }, { from: 5, to: 'ok1' }, { from: 'inexistente_zzz', to: 'ok1' }, {}]) { const r = await post('dup-anim', o); assert.strictEqual(r.code, 400, JSON.stringify(o)); }
      for (const id of ['../x', 'index', '', 'nao_existe', 7]) assert.strictEqual((await post('delete-anim', { id })).code, 400); assert(!fs.existsSync(path.join(D, 'ok1.json'))); assert(!fs.existsSync(path.join(tmpRoot, 'fora.json')));
    });
    await T('delete-anim move para data/.backup/anims/ (recuperável) e atualiza o índice', async () => { const txt = fs.readFileSync(path.join(D, 'dancao.json'), 'utf8'); const r = await post('delete-anim', { id: 'dancao' }); assert.strictEqual(r.code, 200); assert(!fs.existsSync(path.join(D, 'dancao.json'))); const mv = fs.readdirSync(BK).find(x => x.startsWith('dancao.deleted-')); assert(mv && fs.readFileSync(path.join(BK, mv), 'utf8') === txt); assert(!JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')).clips.some(c => c.id === 'dancao')); assert.strictEqual((await post('delete-anim', { id: 'dancao' })).code, 400); });
    await T('arquivo editado à mão e quebrado aparece com invalid:true (não some nem derruba a lista) e fica fora do índice', async () => { fs.writeFileSync(path.join(D, 'quebrado.json'), '{ nada'); let r = await get('anims'); const q = r.json.anims.find(x => x.id === 'quebrado'); assert(q && q.invalid && q.erro); assert.strictEqual((await get('anim?id=quebrado')).code, 400); await post('save-anim', { anim: minimal({ id: 'novo1' }) }); assert(!JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')).clips.some(c => c.id === 'quebrado')); });
    await T('anim-clips marca as editáveis existentes em "edited"; o jogo (vm) consegue carregar o que a rota gravou e o substitui pelo nome', async () => {
      const r = await get('anim-clips'); assert(r.json.edited.includes('minha_mira') && r.json.edited.includes('walk_civi')); const g = await get('anim?id=walk_civi'); assert(run('animEditSet')(g.json.anim).ok); const c = run('findClip')('WALK_civi'); assert(c._eid === 'walk_civi');
      const o = orig('WALK_civi'); let worst = 0; for (let k = 0; k < 20; k++) for (const node of o.nodes) worst = Math.max(worst, ang(sample(o, node.bone, o.duration * k / 19).q, sample(c, node.bone, o.duration * k / 19).q)); assert(worst < 0.5, 'rota -> arquivo -> jogo: ' + worst + '°'); run('animEditRemove')('walk_civi');
    });

    await T('restore-anim volta a versão anterior (a atual vira backup), aceita backup antigo "<id>-<data>.json", recusa nome fora da listagem e id sem backup', async () => {
      await post('dup-anim', { from: 'minha_mira', to: 'rest_a' }); const a0 = (await get('anim?id=rest_a')).json.anim; const v1 = JSON.parse(JSON.stringify(a0)); v1.notes = 'primeira'; assert.strictEqual((await post('save-anim', v1)).code, 200); const v2 = JSON.parse(JSON.stringify(a0)); v2.notes = 'segunda'; assert.strictEqual((await post('save-anim', v2)).code, 200);
      assert(fs.readdirSync(BK).some(x => /^rest_a@\d{4}-/.test(x)));
      let r = await post('restore-anim', { id: 'rest_a' }); assert.strictEqual(r.code, 200, JSON.stringify(r.json)); assert(r.json.ok && r.json.anim.notes === 'primeira' && /^rest_a@/.test(r.json.restored)); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(D, 'rest_a.json'), 'utf8')).notes, 'primeira');
      assert(!JSON.stringify(r.json).includes(tmpRoot), 'sem caminho absoluto');
      fs.writeFileSync(path.join(BK, 'rest_a-2020-01-01T00-00-00-000Z.json'), JSON.stringify(Object.assign({}, v1, { notes: 'antiga' }))); assert.strictEqual((await post('restore-anim', { id: 'rest_a', backup: 'rest_a-2020-01-01T00-00-00-000Z.json' })).code, 200); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(D, 'rest_a.json'), 'utf8')).notes, 'antiga');
      for (const backup of ['../../index.json', 'rest_a@x.json', 'qualquer.json', 7]) assert.strictEqual((await post('restore-anim', { id: 'rest_a', backup })).code, 400, String(backup));
      for (const id of ['../x', 'index', 'com1', 7, 'sem_backup_nenhum']) assert.strictEqual((await post('restore-anim', { id })).code, 400, String(id));
      assert.strictEqual((await post('restore-anim', { id: 'rest_a' }, { Origin: 'http://evil.example' })).code, 403);
      assert.strictEqual((await req(port, 'POST', '/__engine/restore-anim', '{"id":"rest_a"}', { 'Content-Type': 'text/plain' })).code, 415);
    });
    await T('ids de backup parecidos não se misturam (a e a-2) e o limite de 10 versões vale por id', async () => {
      await post('dup-anim', { from: 'minha_mira', to: 'bk' }); await post('dup-anim', { from: 'minha_mira', to: 'bk-2' }); const c = (await get('anim?id=bk')).json.anim, d = (await get('anim?id=bk-2')).json.anim;
      for (let i = 0; i < 13; i++) { c.notes = 'c' + i; await post('save-anim', c); } d.notes = 'd'; await post('save-anim', d);
      const mine = fs.readdirSync(BK).filter(x => /^bk@/.test(x)).length, other = fs.readdirSync(BK).filter(x => /^bk-2@/.test(x)).length; assert.strictEqual(mine, 10); assert.strictEqual(other, 1);
    });
    await T('erro de disco não vaza caminho absoluto (save-anim com data/anims substituída por arquivo)', async () => {
      const real = D, hold = D + '_hold'; fs.renameSync(real, hold); fs.writeFileSync(real, 'x');
      try { const r = await post('save-anim', minimal({ id: 'sem_disco' })); assert(r.code >= 400); assert(!JSON.stringify(r.json).includes(tmpRoot) && !/[A-Za-z]:\\|\/tmp\//.test(JSON.stringify(r.json)), JSON.stringify(r.json)); const l = await get('anims'); assert(!JSON.stringify(l.json.anims || l.json).includes(tmpRoot)); }
      finally { fs.rmSync(real, { force: true }); fs.renameSync(hold, real); }
    });
  } finally { server.close(); fs.rmSync(tmpRoot, { recursive: true, force: true }); }
  console.log('\n' + n + ' testes ok');
})().catch(e => { console.error('\nFALHOU:', e && e.stack || e); process.exit(1); });
