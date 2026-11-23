// Aplica uma animação real num fardamento e mede o corpo já com a pele (altura, posição de cabeça/pés...). Uso: node tools/test-ifp-pose.js <skin> <animação> [tempo]
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.THREE = require('three'); global.clamp = (v, a, b) => v < a ? a : v > b ? b : v; global.lerp = (a, b, t) => a + (b - a) * t;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/entities/anim.js'), 'utf8').replace("'use strict';", '').replace('const IFP_CONJ = true', 'var IFP_CONJ = true').replace('const ifpReady = {}', 'var ifpReady = {}'));
const T = THREE, [skinId, animName, tArg] = process.argv.slice(2), t = parseFloat(tArg || '0');
const base = path.join(__dirname, '../assets/models/skins', skinId), man = JSON.parse(fs.readFileSync(path.join(base, 'skin.json'), 'utf8'));
const ab = fs.readFileSync(path.join(base, 'skin.bin')), v = man.verts, buf = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.length);
const P = new Float32Array(buf, 0, v * 3), SI = new Uint16Array(buf, v * 32, v * 4), SW = new Float32Array(buf, v * 40, v * 4);
const pb = fs.readFileSync(path.join(__dirname, '../assets/anims/ped.ifp'));
ifpReady.ped = parseIfp(pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.length));
for (const f of fs.readdirSync(path.join(__dirname, '../assets/anims'))) if (f !== 'ped.ifp' && /.ifp$/.test(f)) { const b = fs.readFileSync(path.join(__dirname, '../assets/anims', f)); ifpReady[f] = parseIfp(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }

function measure(conj) {
  global.IFP_CONJ = conj;
  const bones = [], inv = [], root = new T.Group();
  man.bones.forEach((b, i) => { const bone = new T.Bone(); new T.Matrix4().fromArray(b.local).decompose(bone.position, bone.quaternion, bone.scale); bones.push(bone); inv.push(new T.Matrix4().fromArray(b.inverse)); (b.parent >= 0 ? bones[b.parent] : root).add(bone); });
  const actor = { bones, info: man.bones }, pl = new AnimPlayer(actor);
  pl.play(animName, { fade: 0 }); pl.update(t); root.updateMatrixWorld(true);
  const M = bones.map((b, i) => b.matrixWorld.clone().multiply(inv[i])), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], p = new T.Vector3(), o = new T.Vector3();
  for (let i = 0; i < v; i += 3) { o.set(0, 0, 0); for (let k = 0; k < 4; k++) { const w = SW[i * 4 + k]; if (!w) continue; p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M[SI[i * 4 + k]]); o.addScaledVector(p, w); } for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], o.getComponent(c)); mx[c] = Math.max(mx[c], o.getComponent(c)); } }
  const pos = n => { const b = bones[man.bones.findIndex(x => x.name === n)]; return new T.Vector3().setFromMatrixPosition(b.matrixWorld).toArray().map(x => +x.toFixed(2)); };
  return { conj, altura: +(mx[1] - mn[1]).toFixed(2), largura: +(mx[0] - mn[0]).toFixed(2), prof: +(mx[2] - mn[2]).toFixed(2), yMin: +mn[1].toFixed(2), pelvis: pos('pelvis'), cabeca: pos('head'), peEsq: pos('lfoot'), maoEsq: pos('lhand'), maoDir: pos('rhand') };
}
console.log(JSON.stringify(measure(false)));
