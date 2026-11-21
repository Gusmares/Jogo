// Conversor de VEÍCULOS do GTA San Andreas (DFF + TXD) -> assets/models/<id>/ (binários + PNG + model.json)
// Uso em lote:  node tools/convert-dff.js --all            (lê tools/models.json)
//        um só:  node tools/convert-dff.js --id palio_rp
// Detalhe total por padrão. Cada veículo também ganha uma versão LOD (~10 mil triângulos) para longe.
'use strict';
const { fs } = require('./rw');
const path = require('path');
const { loadDFF, worldPoint, worldDir } = require('./dff');
const { loadTXD, downscale, encodePNG } = require('./txd');
const { modFile } = require('./mods');
const { genericIndex } = require('./generic-vehicle-tex');

const root = path.resolve(__dirname, '..');
const GTA2 = p => [-p[0], p[2], p[1]];                    // (x dir, y frente, z cima) -> three (x, y cima, z frente), rotação própria
const LAMP_TEX = /vehiclelights|lights|emerglights|lightbar|farol|lanterna/i;

function convertVehicle(cfg) {
  const t0 = Date.now();
  const dff = loadDFF(modFile(cfg.dff)), txd = loadTXD(modFile(cfg.txd));
  // Alguns mods armazenam rotações de proteção em peças estáticas. Correção explícita por preset.
  for (const f of dff.frames) if ((cfg.resetFrameRotation || []).includes(f.name)) f.m.splice(0,9,1,0,0,0,1,0,0,0,1);
  const GEN = genericIndex();                               // texturas do vehicle.txd genérico (compartilhadas em assets/models/_generic)
  const txdLower = {}; Object.keys(txd).forEach(k => txdLower[k.toLowerCase()] = k);
  const outDir = path.join(root, 'assets/models', cfg.id), texDir = path.join(outDir, 'textures');
  if (!/^[a-z0-9_]+$/.test(cfg.id)) throw new Error('ID de modelo inválido');
  fs.mkdirSync(texDir, { recursive: true });
  const hide = new Set(cfg.hide || []);

  /* ---- regras de visibilidade: só peças "ok" e renderizáveis ---- */
  // roda = átomo filho de um "wheel_*_dummy" (qualquer nome: "wheel", "roda", "Pneu 3d"...) ou, na moto, wheel_front/rear
  const isWheelAtomic = a => {
    const f = dff.frames[a.frame], par = f.parent >= 0 ? dff.frames[f.parent] : null;
    return /^wheel$/i.test(f.name) || /^wheel_(front|rear)$/i.test(f.name) || !!(par && /^wheel_(lf|rf|lb|rb)_dummy$/i.test(par.name));
  };
  const visible = a => {
    const n = dff.frames[a.frame].name;
    if (!(a.flags & 4)) return false;
    if (/_dam(\b|$)|_vlo|_lo$|\blod|damaged/i.test(n)) return false;
    return !hide.has(n);
  };
  const atomics = dff.atomics.filter(visible);

  /* ---- peças: transformação para o mundo three (sem o deslocamento do chão, aplicado depois) ---- */
  function part(a, centerSub) {
    const g = dff.geos[a.geo], used = [...new Set(g.indices)], remap = new Map(used.map((v,i)=>[v,i]));
    const n = used.length, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = g.uv ? new Float32Array(n*2) : null;
    for (let i = 0; i < n; i++) {
      const j = used[i];
      const w = worldPoint(dff.frames, a.frame, [g.pos[j * 3], g.pos[j * 3 + 1], g.pos[j * 3 + 2]]);
      const nn = worldDir(dff.frames, a.frame, g.nrm ? [g.nrm[j * 3], g.nrm[j * 3 + 1], g.nrm[j * 3 + 2]] : [0, 0, 1]);
      if (!w.every(v=>Number.isFinite(v)&&Math.abs(v)<1000)) throw new Error('Vértice inválido em '+dff.frames[a.frame].name);
      if(uv){uv[i*2]=g.uv[j*2];uv[i*2+1]=g.uv[j*2+1];}
      pos.set(GTA2(w), i * 3); nrm.set(GTA2(nn), i * 3);
    }
    return { name: dff.frames[a.frame].name, n, pos, nrm, uv, mats: g.materials, indices: g.indices.map(v=>remap.get(v)), matIdx: g.matIdx };
  }
  const bbox = (p, parts) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const q of parts) for (let i = 0; i < q.n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q.pos[i * 3 + k]); mx[k] = Math.max(mx[k], q.pos[i * 3 + k]); } return { mn, mx }; };

  /* ---- materiais globais ---- */
  const matList = [], matKey = new Map();
  const texOf = m => m.tex ? txd[txdLower[m.tex.toLowerCase()]] : null;
  const solid = m => !m.tex || (texOf(m) && Math.max(texOf(m).w, texOf(m).h) <= 128);
  function gmat(m) {
    // cores "mágicas" do GTA SA: 60,255,0 = cor primária; 255,0,175 = secundária; 255,175,0 / 0,255,200 = faróis; 185,255,0 / 255,60,0 = lanternas traseiras
    const rgb = m.color.slice(0, 3).join(','), opaque = m.color[3] === 255;
    const paint = opaque && (rgb === '60,255,0' || rgb === '255,0,175' || rgb === '0,255,255' || rgb === '255,0,255');
    const lampKind = rgb === '255,175,0' || rgb === '0,255,200' ? 'head' : rgb === '185,255,0' || rgb === '255,60,0' ? 'tail' : null;
    const glass = /^(vidro|vidros|glass|windscreen|windshield)/i.test(m.tex || '') ||
      (!m.tex && m.color.slice(0,3).every(v=>v<=60) && m.color[3]>0 && m.color[3]<210) ||
      (m.color[0] === 60 && m.color[1] === 255 && m.color[2] === 0 && m.color[3] < 255);
    const tex = m.tex ? txdLower[m.tex.toLowerCase()] || null : null, alpha = m.color[3] / 255;
    const key = [tex || (m.tex ? '?' + m.tex.toLowerCase() : null), glass ? 'g' : m.color.slice(0, 3).join('.'), alpha.toFixed(2)].join('|');
    if (!matKey.has(key)) {
      const o = { tex, color: glass || paint ? [255, 255, 255] : m.color.slice(0, 3), opacity: glass ? Math.min(0.24, alpha) : +alpha.toFixed(2), glass, paint };
      if (tex && LAMP_TEX.test(tex)) o.lamp = true;
      const gn = m.tex && !tex ? m.tex.toLowerCase() : null;
      if (gn === 'carplate') { o.plate = 'front'; o.color = [255, 255, 255]; o.paint = false; }      // placa: o jogo desenha uma placa Mercosul
      else if (gn === 'carpback') { o.color = [34, 34, 36]; o.paint = false; o.missingTex = m.tex; } // suporte/moldura da placa
      else if (gn && GEN[gn] && !glass) {                               // textura genérica do jogo (vehicle.txd do pack): uma cópia compartilhada
        o.tex = gn; o.generic = true; if (GEN[gn].alpha) o.alpha = true;
        o.color = paint || lampKind ? [255, 255, 255] : m.color.slice(0, 3);
        if (LAMP_TEX.test(gn)) o.lamp = lampKind || true;
      }
      else if (m.tex && !tex && !glass && !paint && !lampKind) {             // textura que nem o vehicle.txd tem: cor neutra coerente com a peça
        const n = m.tex.toLowerCase(); o.color = /wheel|tyre|tire|rim|pneu|roda/.test(n) ? [38, 38, 40] : /interior|seat|dash|banco/.test(n) ? [62, 62, 66] : /light|lamp|farol/.test(n) ? [235, 235, 228] : /grill|grade|plate|placa/.test(n) ? [90, 92, 96] : m.color.slice(0, 3).map(v => Math.round(v * 0.55));
        o.missingTex = m.tex;
      }
      if (lampKind) { o.lamp = lampKind; if (!glass && !o.generic) o.color = lampKind === 'head' ? [236, 236, 228] : [200, 24, 20]; }
      if (opaque && rgb === '255,0,175') o.paint2 = true;
      matKey.set(key, matList.length); matList.push(o);
    }
    return matKey.get(key);
  }
  function merge(parts) {
    const P = [], N = [], U = [], buckets = new Map(); let base = 0;
    for (const p of parts) {
      for (let i = 0; i < p.n; i++) { P.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]); N.push(p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]); U.push(p.uv ? p.uv[i * 2] : 0.5, p.uv ? 1 - p.uv[i * 2 + 1] : 0.5); }
      for (let t = 0; t < p.matIdx.length; t++) {
        const gm = gmat(p.mats[p.matIdx[t]]); if (!buckets.has(gm)) buckets.set(gm, []);
        buckets.get(gm).push(p.indices[t * 3] + base, p.indices[t * 3 + 1] + base, p.indices[t * 3 + 2] + base);
      }
      base += p.n;
    }
    const idx = [], groups = [];
    [...buckets.keys()].sort((a, b) => a - b).forEach(m => { const l = buckets.get(m); groups.push([idx.length, l.length, m]); for (const v of l) idx.push(v); });
    return { P, N, U, idx, groups, verts: base };
  }

  /* ---- simplificação por agrupamento de vértices (só LOD) ---- */
  function decimate(pt, target) {
    const { n, pos, nrm, uv, indices, matIdx } = pt, vmat = new Int32Array(n).fill(-1);
    for (let t = 0; t < matIdx.length; t++) for (let k = 0; k < 3; k++) { const v = indices[t * 3 + k]; if (vmat[v] < 0) vmat[v] = matIdx[t]; }
    if (matIdx.length <= target) return pt;
    const b = bbox(0, [pt]), diag = Math.hypot(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]) || 1;
    function run(h, q) {
      const map = new Map(), rem = new Int32Array(n), acc = [];
      for (let i = 0; i < n; i++) {
        const m = vmat[i]; if (m < 0) { rem[i] = -1; continue; }
        let key = Math.floor(pos[i * 3] / h) + ',' + Math.floor(pos[i * 3 + 1] / h) + ',' + Math.floor(pos[i * 3 + 2] / h) + ',' + m;
        if (!solid(pt.mats[m]) && uv && q > 0) key += ',' + Math.round(uv[i * 2] * q) + ',' + Math.round(uv[i * 2 + 1] * q);
        let id = map.get(key); if (id === undefined) { id = acc.length; map.set(key, id); acc.push({ p: [0, 0, 0], n: [0, 0, 0], u: [0, 0], c: 0 }); }
        const c = acc[id]; c.c++; for (let k = 0; k < 3; k++) { c.p[k] += pos[i * 3 + k]; c.n[k] += nrm[i * 3 + k]; } if (uv) { c.u[0] += uv[i * 2]; c.u[1] += uv[i * 2 + 1]; } rem[i] = id;
      }
      const ind = [], mi = [];
      for (let t = 0; t < matIdx.length; t++) { const a = rem[indices[t * 3]], bb = rem[indices[t * 3 + 1]], c = rem[indices[t * 3 + 2]]; if (a < 0 || bb < 0 || c < 0 || a === bb || bb === c || a === c) continue; ind.push(a, bb, c); mi.push(matIdx[t]); }
      return { acc, ind, mi };
    }
    let h = diag / 300, res = run(h, 24);
    for (let it = 0; it < 80 && res.mi.length > target; it++) { h *= 1.15; res = run(h, Math.max(0, 24 - it)); }
    const m = res.acc.length, np = new Float32Array(m * 3), nn = new Float32Array(m * 3), nu = new Float32Array(m * 2);
    res.acc.forEach((c, i) => { for (let k = 0; k < 3; k++) np[i * 3 + k] = c.p[k] / c.c; const l = Math.hypot(c.n[0], c.n[1], c.n[2]) || 1; for (let k = 0; k < 3; k++) nn[i * 3 + k] = c.n[k] / l; nu[i * 2] = c.u[0] / c.c; nu[i * 2 + 1] = c.u[1] / c.c; });
    return { ...pt, n: m, pos: np, nrm: nn, uv: uv ? nu : null, indices: res.ind, matIdx: res.mi };
  }

  /* ---- rodas ---- */
  // porta do motorista (lado esquerdo): o modelo do mod já traz "door_lf_ok" separada, ligada ao pivô "door_lf_dummy" (na dobradiça) — vira uma malha à parte que o jogo abre/fecha
  const doorFrame = cfg.kind === 'bike' ? -1 : dff.frames.findIndex(f => /^door_lf_dummy$/i.test(f.name));
  const isDoorAtomic = a => doorFrame >= 0 && dff.frames[a.frame].parent === doorFrame && !isWheelAtomic(a);
  const doorAtoms = atomics.filter(isDoorAtomic);
  const bodyAtoms = atomics.filter(a => !isWheelAtomic(a) && !isDoorAtomic(a));
  const wheelDefs = [], wheelMeshes = [];       // wheelDefs: posições; wheelMeshes: geometria (1 para carros, 2 para moto)
  let groundZ = 0, wheelR = 0.38;
  if (cfg.kind === 'bike') {
    // pneu + disco de freio etc. têm o mesmo nome de quadro: funde as peças de cada roda
    const groups = { front: [], rear: [] };
    atomics.forEach(a => { const m = /^wheel_(front|rear)$/i.exec(dff.frames[a.frame].name); if (m) groups[m[1].toLowerCase()].push(a); });
    let lowest = 1e9;
    ['front', 'rear'].forEach((key, i) => {
      const ps = groups[key].map(a => part(a)); if (!ps.length) return;
      const b = bbox(0, ps), c = [0, 1, 2].map(k => (b.mn[k] + b.mx[k]) / 2), r = Math.max(b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]) / 2;
      ps.forEach(p => { for (let j = 0; j < p.n; j++) for (let k = 0; k < 3; k++) p.pos[j * 3 + k] -= c[k]; });   // centraliza para girar no eixo
      wheelMeshes.push(ps); wheelDefs.push({ set: wheelMeshes.length - 1, pos: c, front: key === 'front', flip: false, r });
      lowest = Math.min(lowest, c[1] - r); wheelR = r;
    });
    groundZ = -lowest;
  } else {
    const wa = atomics.filter(isWheelAtomic).sort((a, b) => dff.geos[b.geo].indices.length - dff.geos[a.geo].indices.length)[0];   // a maior malha
    if (wa) {
      const p = part(wa); const dummies = {};
      dff.frames.forEach((f, i) => { const m = /^wheel_(lf|rf|lb|rb)_dummy$/.exec(f.name); if (m) dummies[m[1]] = GTA2(worldPoint(dff.frames, i, [0, 0, 0])); });
      // geometria da roda em coordenadas locais ao redor do eixo: subtrai a posição mundial do próprio quadro
      const wf = GTA2(worldPoint(dff.frames, wa.frame, [0, 0, 0]));
      for (let j = 0; j < p.n; j++) for (let k = 0; k < 3; k++) p.pos[j * 3 + k] -= wf[k];
      const b = bbox(0, [p]); wheelR = Math.max(b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]) / 2;
      wheelMeshes.push([p]);
      let lowest = 1e9;
      for (const k of ['lf', 'rf', 'lb', 'rb']) if (dummies[k]) { wheelDefs.push({ set: 0, pos: dummies[k], front: k[1] === 'f', flip: k[0] === 'l', r: wheelR }); lowest = Math.min(lowest, dummies[k][1] - wheelR); }
      groundZ = -lowest;
    }
  }
  const GROUND = groundZ;
  wheelDefs.forEach(w => { w.pos = w.pos.map((v, k) => +(k === 1 ? v + GROUND : v).toFixed(3)); });

  /* ---- corpo ---- */
  const bodyParts = bodyAtoms.map(a => { const p = part(a); for (let i = 0; i < p.n; i++) p.pos[i * 3 + 1] += GROUND; return p; });
  const doorParts = doorAtoms.map(a => { const p = part(a); for (let i = 0; i < p.n; i++) p.pos[i * 3 + 1] += GROUND; return p; });
  const allParts = bodyParts.concat(doorParts);
  const bb = bbox(0, allParts), dims = { len: +(bb.mx[2] - bb.mn[2]).toFixed(2), width: +(bb.mx[0] - bb.mn[0]).toFixed(2), height: +bb.mx[1].toFixed(2), wheelRadius: +wheelR.toFixed(3), ground: +GROUND.toFixed(3) };
  const totalTris = allParts.reduce((s, p) => s + p.matIdx.length, 0), ratio = Math.min(1, (cfg.lodTris || 10000) / totalTris);
  const body = merge(bodyParts), bodyLod = merge(allParts.map(p => decimate(p, Math.max(40, Math.round(p.matIdx.length * ratio)))));
  const wheelFull = wheelMeshes.map(ps => merge(ps)), wheelLod = wheelMeshes.map(ps => merge(ps.map(p => decimate(p, 500))));

  // porta: geometria em coordenadas do carro (como a carroceria, para os amassados casarem); o jogo gira em torno do pivô
  let doorMesh = null, doorInfo = null;
  if (doorParts.length) {
    doorMesh = merge(doorParts);
    const pv = GTA2(worldPoint(dff.frames, doorFrame, [0, 0, 0])); pv[1] += GROUND;
    const db = bbox(0, doorParts), cz = (db.mn[2] + db.mx[2]) / 2;
    doorInfo = { pivot: pv.map(v => +v.toFixed(3)), sign: cz < pv[2] ? -1 : 1, len: +(db.mx[2] - db.mn[2]).toFixed(2) };
  }

  /* ---- luzes de emergência a partir dos quadros "foglight_*" do sistema de luzes (LM3D) ---- */
  const lights = [], seen = new Set();
  dff.frames.forEach((f, i) => {
    const m = /^foglight_([lr])\d*_?(?:prm([0-9a-f]{6})|bg)/i.exec(f.name); if (!m) return;
    const p = GTA2(worldPoint(dff.frames, i, [0, 0, 0])); p[1] += GROUND;
    const color = m[2] ? m[2].toLowerCase() : (p[0] >= 0 ? 'ff0000' : '0000ff'), key = Math.round(p[0] / 0.04) + ',' + Math.round(p[1] / 0.04) + ',' + Math.round(p[2] / 0.04) + color;
    if (seen.has(key)) return; seen.add(key);
    lights.push({ p: p.map(v => +v.toFixed(3)), c: color, s: p[0] >= 0 ? 1 : -1 });
  });
  if (!lights.length && cfg.emergency !== false) {                     // sem sistema de luzes no mod: usa a peça da barra de luzes (pelo nome) ou o teto
    const barAtoms = bodyAtoms.filter(a => /giro|light ?bar|pegasus|barra|siren|generic lights/i.test(dff.frames[a.frame].name));
    const bp = barAtoms.map(a => { const p = part(a); for (let i = 0; i < p.n; i++) p.pos[i * 3 + 1] += GROUND; return p; });
    const second = cfg.siren === 'white' ? 'ffffff' : '1e3cff';
    let x0 = -0.4, x1 = 0.4, y = dims.height - 0.04, z = bb.mn[2] + (bb.mx[2] - bb.mn[2]) * 0.55;
    if (bp.length) { const b = bbox(0, bp); x0 = b.mn[0] * 0.92; x1 = b.mx[0] * 0.92; y = b.mx[1] - 0.04; z = (b.mn[2] + b.mx[2]) / 2; }
    for (let k = 0; k < 4; k++) { const f = (k + 0.5) / 4; lights.push({ p: [+(x1 * f).toFixed(3), +y.toFixed(3), +z.toFixed(3)], c: 'ff0000', s: 1 }, { p: [+(x0 * f).toFixed(3), +y.toFixed(3), +z.toFixed(3)], c: second, s: -1 }); }
  }
  lights.length = Math.min(lights.length, 180);

  /* ---- bancos: o mod marca "ped_frontseat" no banco do PASSAGEIRO; o motorista é o espelho (carros de mão esquerda) ---- */
  const seats = {};
  dff.frames.forEach((f, i) => {
    const m = /^ped_(front|back)seat/i.exec(f.name); if (!m || seats[m[1].toLowerCase()]) return;
    const p = GTA2(worldPoint(dff.frames, i, [0, 0, 0])); p[1] += GROUND; seats[m[1].toLowerCase()] = p.map(v => +v.toFixed(3));
  });
  const ax = seats.front ? Math.abs(seats.front[0]) : 0.45;
  const seatOut = cfg.kind === 'bike' ? null : {
    driver: seats.front ? [+ax.toFixed(3), seats.front[1], seats.front[2]] : [0.45, dims.height * 0.4, 0],
    passenger: seats.front ? [-ax, seats.front[1], seats.front[2]] : [-0.45, dims.height * 0.4, 0],
    rear: seats.back || null
  };

  /* ---- texturas ---- */
  const used = new Set(); matList.forEach(m => m.tex && used.add(m.tex));
  const textures = {}, lampTexOnly = [];
  used.forEach(name => {
    if (!txd[name] && GEN[name]) { textures[name] = '../_generic/' + GEN[name].file; return; }
    const file = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
    fs.writeFileSync(path.join(texDir, file), encodePNG(downscale(txd[name], 2048))); textures[name] = 'textures/' + file;
  });

  /* ---- gravação ---- */
  const write = (file, m) => {
    const buf = Buffer.concat([Float32Array.from(m.P), Float32Array.from(m.N), Float32Array.from(m.U), Uint32Array.from(m.idx)].map(a => Buffer.from(a.buffer)));
    fs.writeFileSync(path.join(outDir, file), buf); return { file, verts: m.verts, indices: m.idx.length, groups: m.groups };
  };
  const meshes = { body: write('body.bin', body), bodyLod: write('body_lod.bin', bodyLod) };
  if (doorMesh) meshes.door = write('door.bin', doorMesh);
  wheelFull.forEach((m, i) => { meshes['wheel' + i] = write('wheel' + i + '.bin', m); meshes['wheel' + i + 'Lod'] = write('wheel' + i + '_lod.bin', wheelLod[i]); });
  if (!Number.isFinite(GROUND) || Math.abs(GROUND) > 100 || !Number.isFinite(dims.height)) throw new Error('Geometria/rodas inválidas: ' + cfg.id);
  const manifest = { id: cfg.id, name: cfg.name || cfg.id, kind: cfg.kind || 'car', version: 4, dims, materials: matList, textures, meshes, wheels: wheelDefs, lights: cfg.emergency === false ? [] : lights, seats: cfg.seats || seatOut, door: doorInfo, handling: cfg.handling || null, trafficWeight: cfg.trafficWeight || 0, driveClip: cfg.driveClip || null, ...(cfg.extra || {}) };
  fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(manifest));
  console.log(`${cfg.id.padEnd(16)} corpo ${(body.idx.length / 3 / 1000).toFixed(0)}k tris (LOD ${(bodyLod.idx.length / 3 / 1000).toFixed(1)}k) | ${dims.len}x${dims.width}x${dims.height} m | roda r=${dims.wheelRadius} | rodas ${wheelDefs.length} | luzes ${lights.length} | porta ${doorInfo ? (doorMesh.idx.length / 3) + ' tris' : '—'} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (require.main === module) {
const cfgs = JSON.parse(fs.readFileSync(path.join(__dirname, 'models.json'), 'utf8')).concat(require('./assets.json').vehicles);
const idArg = process.argv.indexOf('--id') > 0 ? process.argv[process.argv.indexOf('--id') + 1] : null;
if (!process.argv.includes('--all') && !cfgs.some(c => c.id === idArg)) { console.error('Use --all ou --id <modelo>'); process.exitCode = 1; }
for (const c of cfgs) if (process.argv.includes('--all') || c.id === idArg) { try { convertVehicle(c); } catch (e) { console.error(c.id, 'FALHOU:', e.stack); process.exitCode = 1; } }
}
module.exports = { convertVehicle };
