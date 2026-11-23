/* NEON COAST — Fardamentos (skins do GTA SA): malha com pele, esqueleto de 32 ossos e animação procedural */
'use strict';

const SKIN_BASE = 'assets/models/skins/';
const skinTypes = {}, skinReady = {};

function loadSkin(id) {
  if (!skinTypes[id]) skinTypes[id] = (async () => {
    const base = SKIN_BASE + id + '/', man = await (await fetch(base + 'skin.json')).json();
    const ab = await (await fetch(base + 'skin.bin')).arrayBuffer(), v = man.verts, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ab, 0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ab, v * 12, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ab, v * 24, v * 2), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(ab, v * 32, v * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(ab, v * 40, v * 4), 4));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(ab, v * 56, man.indices), 1));
    man.groups.forEach(([s, c, mat]) => g.addGroup(s, c, mat));
    const mats = man.materials.map(m => makeTexMaterial(m, base, man, { skinning: true, roughness: 0.8, metalness: 0.05 }));
    mats.forEach(mt => { mt.skinning = true; });
    const type = { id, man, geo: g, mats };
    // níveis de detalhe para NPCs: 1 material (atlas) e malha simplificada (6,5 mil e 1,7 mil triângulos, em vez de ~60 mil e ~20 materiais)
    if (man.atlas && man.lods && man.lods.length) {
      const tex = new THREE.TextureLoader().load(base + man.atlas.file); tex.anisotropy = 2; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      type.atlasMat = new THREE.MeshLambertMaterial({ map: tex, skinning: true, alphaTest: man.atlas.alpha ? 0.5 : 0, side: man.atlas.alpha ? THREE.DoubleSide : THREE.FrontSide });
      type.lods = await Promise.all(man.lods.map(async L => {
        const lb = await (await fetch(base + L.file)).arrayBuffer(), lv = L.verts, lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lb, 0, lv * 3), 3)); lg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(lb, lv * 12, lv * 3), 3));
        lg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(lb, lv * 24, lv * 2), 2)); lg.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(lb, lv * 32, lv * 4), 4));
        lg.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(lb, lv * 40, lv * 4), 4)); lg.setIndex(new THREE.BufferAttribute(new Uint32Array(lb, lv * 56, L.indices), 1));
        return lg;
      }));
    }
    skinReady[id] = type; return type;
  })();
  return skinTypes[id];
}

const _pv = new THREE.Vector3();
/* assenta o ator no chão: a animação ignora o deslocamento da raiz, então poses agachadas/deitadas ficavam "no ar".
   Mede o osso mais baixo e ajusta a altura do grupo para ele ficar na mesma altura que em pé. Devolve o ajuste aplicado. */
function plantActor(a, groundY) {
  const sc = a.group.scale.x, base = groundY + a.footOffset * sc; a.group.position.y = base; a.group.updateMatrixWorld(true);
  let m = 1e9; for (const b of a.bones) { const y = _pv.setFromMatrixPosition(b.matrixWorld).y; if (y < m) m = y; }
  const d = clamp(groundY + (a.sole || 0) * sc - m, -1.6, 1.3); a.group.position.y = base + d; return d;
}
/* cria um ator (grupo + SkinnedMesh + ossos) a partir de um fardamento carregado */
function makeActor(type, useLod) {
  const man = type.man, group = new THREE.Group(), bones = [], inverses = [], restW = [], index = {};
  man.bones.forEach((b, i) => {
    const bone = new THREE.Bone(); bone.name = b.name;
    const m = new THREE.Matrix4().fromArray(b.local); m.decompose(bone.position, bone.quaternion, bone.scale);
    bones.push(bone); inverses.push(new THREE.Matrix4().fromArray(b.inverse)); index[b.name] = i;
    if (b.parent >= 0) bones[b.parent].add(bone);
    restW.push(b.parent >= 0 ? restW[b.parent].clone().multiply(bone.quaternion) : bone.quaternion.clone());
  });
  const lodOn = !!(useLod && type.lods), mesh = new THREE.SkinnedMesh(lodOn ? type.lods[0] : type.geo, lodOn ? type.atlasMat : type.mats);
  mesh.frustumCulled = false; mesh.castShadow = true;
  mesh.add(bones[0]); group.add(mesh); group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  const a = { type, group, mesh, bones, index, restW, info: man.bones, phase: Math.random() * 6, cur: {}, mode: 'idle', footOffset: -man.minY };
  { group.position.y = a.footOffset; group.updateMatrixWorld(true); let m = 1e9; for (const b of bones) { const y = _pv.setFromMatrixPosition(b.matrixWorld).y; if (y < m) m = y; } a.sole = m; }   // altura do osso mais baixo em pé (pés no chão)
  a.lodOn = lodOn; a.lod = lodOn ? 1 : 0;
  a.setLod = l => { if (!a.lodOn || l === a.lod) return; a.lod = l; mesh.geometry = type.lods[l - 1]; };
  a.ap = typeof AnimPlayer === 'function' ? new AnimPlayer(a) : null;   // animações reais do GTA SA (.ifp)
  group.position.y = a.footOffset;      // pés no chão quando o grupo está em y=0 (ajuste de altura é feito por quem posiciona)
  return a;
}

/* ---------- animação procedural ----------
   Cada osso recebe uma rotação em espaço do modelo (X = lado esquerdo, Y = cima, Z = frente), acumulada na hierarquia.
   Rodar em torno de +X: para-baixo vai para trás; logo, balançar para a frente = ângulo negativo. */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _qi = new THREE.Quaternion();
function poseActor(a, deltas) {
  const n = a.bones.length, D = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const info = a.info[i], d = deltas[info.name];
    const dq = d ? _q.setFromEuler(_e.set(d[0], d[1], d[2], 'XYZ')).clone() : new THREE.Quaternion();
    D[i] = (info.parent >= 0 ? D[info.parent].clone() : new THREE.Quaternion()).multiply(dq);
    R[i] = D[i].clone().multiply(a.restW[i]);
    const Rp = info.parent >= 0 ? R[info.parent] : null;
    a.bones[i].quaternion.copy(Rp ? _qi.copy(Rp).invert().multiply(R[i]) : R[i]);
  }
}
function targetPose(mode, ph) {
  const s = Math.sin(ph), c = Math.cos(ph), t = {};
  const set = (k, x, y, z) => { t[k] = [x, y || 0, z || 0]; };
  if (mode === 'walk' || mode === 'run') {
    const A = mode === 'run' ? 0.95 : 0.55, K = mode === 'run' ? 1.35 : 0.7, G = mode === 'run' ? 0.9 : 0.5;
    set('lthigh', -A * s); set('rthigh', A * s);
    set('lcalf', K * Math.max(0, Math.sin(ph + 1.3)) + 0.08); set('rcalf', K * Math.max(0, -Math.sin(ph + 1.3)) + 0.08);
    set('lupperarm', G * s * 0.9); set('rupperarm', -G * s * 0.9);
    set('lforearm', -(mode === 'run' ? 1.0 : 0.3)); set('rforearm', -(mode === 'run' ? 1.0 : 0.3));
    set('spine', mode === 'run' ? 0.22 : 0.05, 0.12 * s); set('spine1', mode === 'run' ? 0.1 : 0.02, -0.12 * s);
  } else if (mode === 'aim') {          // postura de abordagem: pistola em duas mãos à frente, pernas levemente abertas
    set('rupperarm', -1.45, 0.05, -0.12); set('rforearm', -0.25); set('lupperarm', -1.3, 0, 0.45); set('lforearm', -0.55);
    set('lthigh', -0.12, 0, 0.1); set('rthigh', 0.1, 0, -0.1); set('spine', 0.08, 0.15); set('head', 0, -0.1);
  } else if (mode === 'sit') {          // sentado na moto
    set('lthigh', -1.25, 0, 0.12); set('rthigh', -1.25, 0, -0.12); set('lcalf', 1.4); set('rcalf', 1.4);
    set('lupperarm', -0.95, 0, 0.1); set('rupperarm', -0.95, 0, -0.1); set('lforearm', -0.55); set('rforearm', -0.55); set('spine', 0.35);
  } else {                               // parado, respirando
    set('spine', 0.02 * s); set('spine1', 0.015 * s); set('lupperarm', 0, 0, 0.0); set('rupperarm', 0, 0, 0.0);
  }
  return t;
}
function animateProcedural(a, dt, mode, speed) {
  if (a.mode !== mode) a.mode = mode;
  const rate = mode === 'run' ? 10 : mode === 'walk' ? 7 : mode === 'sit' ? 0 : 2;
  a.phase += dt * rate * (mode === 'walk' || mode === 'run' ? clamp(speed / (mode === 'run' ? 5.5 : 2), 0.4, 1.3) : 1);
  const target = targetPose(mode, a.phase), k = Math.min(1, dt * 12);
  const keys = new Set([...Object.keys(a.cur), ...Object.keys(target)]);
  for (const key of keys) {
    const cur = a.cur[key] || (a.cur[key] = [0, 0, 0]), tg = target[key] || [0, 0, 0];
    for (let i = 0; i < 3; i++) cur[i] += (tg[i] - cur[i]) * k;
  }
  poseActor(a, a.cur);
}

/* ---------- animação por modo: clipes reais do ped.ifp (e pacotes de armas/moto), com a procedural como reserva ---------- */
const CLIP_DEFAULT = { idle: 'IDLE_stance', walk: 'WALK_player', run: 'run_player', sprint: 'sprint_civi', aim: 'ARRESTgun', sit: 'BIKEs_Ride' };
const CLIP_REF = { walk: 1.8, run: 4.8, sprint: 7.5 };       // velocidade (m/s) em que cada ciclo foi gravado
function animateActor(a, dt, mode, speed) {
  const name = (a.clips && a.clips[mode]) || CLIP_DEFAULT[mode];
  if (a.ap && name && findClip(name)) {
    a.ap.play(name, { loop: true, fade: 0.18 });
    a.ap.speed = CLIP_REF[mode] ? clamp(speed / CLIP_REF[mode], 0.5, 1.8) : 1;
    a.ap.update(dt); return;
  }
  animateProcedural(a, dt, mode, speed);
}
/* toca um clipe específico (por nome); loop=false mantém o último quadro */
function playClip(a, name, loop, speed) {
  if (!a.ap || !findClip(name)) return false;
  a.ap.play(name, { loop: loop !== false, fade: 0.18 }); a.ap.speed = speed || 1; return true;
}
