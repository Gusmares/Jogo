// NEON ENGINE - esqueleto estendido (dedos) para as skins do projeto. Node puro (sem Electron, sem dependências).
//   node engine/tools/skeleton-extend.js inspect <skinId> [--json]       ossos (id/nome/pai), pesos de pele nas mãos e nos dedos do SA, análise da mão
//   node engine/tools/skeleton-extend.js extend  <skinId|--all> [--dry]  gera assets/rigs/<skinId>.rig.json (ossos de dedo + repeso). --dry só analisa
//   node engine/tools/skeleton-extend.js verify  [skinId|--all]          confere cada .rig.json (pose de repouso idêntica, pesos, estiramento ao curvar)
// Projeto: --project <pasta> ou NEON_PROJECT (padrão projects/neon-coast). O arquivo original da skin (skin.json/skin.bin/lods) NUNCA é alterado.
// Heurística, ids e limites: engine/docs/esqueleto.md
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2), A = { _: [] };
for (let i = 0; i < argv.length; i++) { const x = argv[i]; if (x === '--project') A.project = argv[++i]; else if (x.startsWith('--')) A[x.slice(2)] = true; else A._.push(x); }
const CMD = A._[0];
const ROOT = path.resolve(A.project || process.env.NEON_PROJECT || path.join(REPO, 'projects', 'neon-coast'));
const SKINS = path.join(ROOT, 'assets', 'models', 'skins'), RIGS = path.join(ROOT, 'assets', 'rigs');

/* ================= matemática (matrizes 4x4 em coluna, como o three.js) ================= */
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function inv4(m) {
  const a = m, o = new Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return I4(); det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const f4 = x => +x.toFixed(5);
/* matriz (coluna) a partir de base ortonormal [X,Y,Z] e origem */
const basisM = (X, Y, Z, o) => [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, o[0], o[1], o[2], 1];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ================= leitura da skin ================= */
function loadSkin(id) {
  const dir = path.join(SKINS, id); if (!fs.existsSync(path.join(dir, 'skin.json'))) throw new Error('skin não encontrada: ' + dir);
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8'));
  const readGeo = (file, verts, indices) => {
    const b = fs.readFileSync(path.join(dir, file)), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    return { file, verts, indices, pos: new Float32Array(ab, 0, verts * 3), skinIndex: new Uint16Array(ab, verts * 32, verts * 4), skinWeight: new Float32Array(ab, verts * 40, verts * 4), index: new Uint32Array(ab, verts * 56, indices) };
  };
  const geoms = { base: readGeo('skin.bin', man.verts, man.indices) };
  (man.lods || []).forEach((L, i) => { if (fs.existsSync(path.join(dir, L.file))) geoms['lod' + (i + 1)] = readGeo(L.file, L.verts, L.indices); });
  const W = []; man.bones.forEach((b, i) => { W.push(b.parent >= 0 ? mul(W[b.parent], b.local) : b.local.slice()); });
  const idx = {}; man.bones.forEach((b, i) => { idx[b.name] = i; });
  return { id, dir, man, geoms, W, idx };
}
const SIDES = { l: { name: 'L', hand: 'lhand', fin: ['lfinger', 'lfinger01'] }, r: { name: 'R', hand: 'rhand', fin: ['rfinger', 'rfinger01'] } };
const DIGITS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const boneId = (side, d, j) => (side === 'l' ? 400 : 500) + (d + 1) * 10 + j;      // L_Thumb1=411 ... L_Pinky3=453; R_Thumb1=511 ... R_Pinky3=553
const FRAC = { fingers: [0.45, 0.75], thumb: [0.44, 0.75] };      // onde ficam as juntas 2 e 3 ao longo do comprimento do dedo (J0 = base, 1 = ponta)
const KNUCKLE = 0.46, CMC = 0.22;                                   // base dos dedos e do polegar, como fração do comprimento da mão (punho -> ponta)

/* ================= análise da mão ================= */
/* região da mão: vértices com >= 50% do peso nos ossos hand/finger/finger01. Coordenadas no espaço do osso da mão (inverse * posição de bind). */
function handRegion(S, geo, side) {
  const sd = SIDES[side], hb = S.idx[sd.hand], group = new Set([hb, ...sd.fin.map(n => S.idx[n])]), inv = S.man.bones[hb].inverse;
  const P = [];
  for (let i = 0; i < geo.verts; i++) {
    let s = 0; for (let k = 0; k < 4; k++) if (group.has(geo.skinIndex[i * 4 + k])) s += geo.skinWeight[i * 4 + k];
    if (s >= 0.5) P.push({ i, p: xf(inv, [geo.pos[i * 3], geo.pos[i * 3 + 1], geo.pos[i * 3 + 2]]), s });
  }
  return { P, hb, group, inv };
}
function pca3(pts, c, excl) {                                       // eixo principal (power iteration) fora dos vetores em excl
  let C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach(p => { const d = sub(p, c); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b] / pts.length; });
  let x = nrm([0.57, 0.31, 0.77]);
  for (let it = 0; it < 120; it++) { let y = [0, 0, 0]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) y[a] += C[a][b] * x[b]; for (const e of excl || []) y = sub(y, scl(e, dot(y, e))); const l = len(y); if (l < 1e-12) break; x = scl(y, 1 / l); }
  return x;
}
function kmeans(pts, k, seed) {                                      // pts: [[a,b],...]; devolve { assign, centers, inertia } da melhor entre várias inicializações
  let best = null; const R = rng(seed);
  for (let rs = 0; rs < 14; rs++) {
    const cs = [pts[Math.floor(R() * pts.length)].slice()];
    while (cs.length < k) { let bi = 0, bd = -1; pts.forEach((p, i) => { const d = Math.min(...cs.map(c => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2)); const dd = rs % 2 ? d * (0.5 + R()) : d; if (dd > bd) { bd = dd; bi = i; } }); cs.push(pts[bi].slice()); }
    let assign = new Array(pts.length).fill(0), inertia = 0;
    for (let it = 0; it < 60; it++) {
      inertia = 0; let ch = false;
      pts.forEach((p, i) => { let bj = 0, bd = 1e18; cs.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2; if (d < bd) { bd = d; bj = j; } }); if (assign[i] !== bj) { assign[i] = bj; ch = true; } inertia += bd; });
      const sum = cs.map(() => [0, 0, 0]); pts.forEach((p, i) => { const s = sum[assign[i]]; s[0] += p[0]; s[1] += p[1]; s[2]++; });
      sum.forEach((s, j) => { if (s[2]) { cs[j][0] = s[0] / s[2]; cs[j][1] = s[1] / s[2]; } });
      if (!ch) break;
    }
    if (!best || inertia < best.inertia) best = { assign: assign.slice(), centers: cs.map(c => c.slice()), inertia };
  }
  return best;
}
/* distância de um ponto a uma polilinha (lista de pontos); devolve { d, s } com s = comprimento de arco até o ponto mais próximo (s<0 antes do início) */
function polyDist(poly, cum, p) {
  let bd = 1e18, bs = 0;
  for (let j = 0; j < poly.length - 1; j++) {
    const a = poly[j], b = poly[j + 1], ab = sub(b, a), L2 = dot(ab, ab) || 1e-12; let t = dot(sub(p, a), ab) / L2;
    const raw = t; if (j > 0) t = Math.max(0, t); if (j < poly.length - 2) t = Math.min(1, t);
    const q = add(a, scl(ab, t)), d = len(sub(p, q));
    if (d < bd) { bd = d; bs = cum[j] + t * Math.sqrt(L2); void raw; }
  }
  return { d: bd, s: bs };
}
/* grupos de posição única (as costuras de UV duplicam vértices), com vizinhança pela malha; só vértices da região */
function groupRegion(R, geo, F) {
  const key = q => Math.round(q.p[0] * 20000) + '|' + Math.round(q.p[1] * 20000) + '|' + Math.round(q.p[2] * 20000), gm = new Map(), gid = new Array(geo.verts).fill(-1), G = [];
  R.P.forEach(q => { const k = key(q); let g = gm.get(k); if (g === undefined) { g = G.length; gm.set(k, g); G.push({ id: g, p: q.p, f: F ? dot(q.p, F) : 0, nb: new Set() }); } gid[q.i] = g; });
  for (let t = 0; t < geo.indices; t += 3) { const a = gid[geo.index[t]], b = gid[geo.index[t + 1]], c = gid[geo.index[t + 2]]; [[a, b], [b, c], [c, a]].forEach(([x, y]) => { if (x >= 0 && y >= 0 && x !== y) { G[x].nb.add(y); G[y].nb.add(x); } }); }
  return { G, gid };
}
function components(G, ok) {                                           // componentes conexas entre os grupos com ok[g]
  const comp = new Array(G.length).fill(-1), out = [];
  for (let s = 0; s < G.length; s++) { if (!ok[s] || comp[s] >= 0) continue; const st = [s], mem = []; comp[s] = out.length; while (st.length) { const x = st.pop(); mem.push(x); G[x].nb.forEach(y => { if (ok[y] && comp[y] < 0) { comp[y] = out.length; st.push(y); } }); } out.push(mem); }
  return out;
}
function analyzeHand(S, side, geo) {
  geo = geo || S.geoms.base;
  const sd = SIDES[side], R = handRegion(S, geo, side), warn = [];
  const bF = S.man.bones[S.idx[sd.fin[0]]].local, F = nrm([bF[12], bF[13], bF[14]]), fOf = p => dot(p, F);
  if (R.P.length < 30) return { side, ok: false, warn: ['poucos vértices na mão (' + R.P.length + ')'], n: R.P.length };
  const fs_ = R.P.map(q => fOf(q.p)).sort((a, b) => a - b), L = fs_[Math.floor(fs_.length * 0.995)];
  const { G } = groupRegion(R, geo, F), meanP = mem => mem.reduce((s, g) => add(s, G[g].p), [0, 0, 0]).map(x => x / mem.length);
  // 1) dedos = componentes conexas da parte distal da malha (acima da linha dos nós dos dedos): 4 pedaços separados
  let fingers = null, thrUsed = 0;
  for (let thr = 0.8; thr >= 0.5; thr -= 0.025) {
    const comp = components(G, G.map(g => g.f > thr * L)).filter(m => m.length >= 12);
    if (comp.length === 4) { fingers = comp; thrUsed = thr; break; }
  }
  if (!fingers) {                                                        // reserva: 4 faixas por largura (na ponta da mão)
    warn.push('dedos não se separam na malha (mão fechada/luva?): usando 4 faixas por largura (impreciso)');
    const tip = G.map((g, i) => i).filter(i => G[i].f > 0.62 * L); if (tip.length < 12) return { side, ok: false, warn: warn.concat(['região dos dedos vazia']), n: R.P.length };
    const c0 = meanP(tip), ax = pca3(tip.map(i => G[i].p), c0, [F]), key = tip.map(i => dot(sub(G[i].p, c0), ax)), lo = Math.min(...key), hi = Math.max(...key);
    fingers = [[], [], [], []]; tip.forEach((i, k) => fingers[Math.min(3, Math.floor((key[k] - lo) / (hi - lo + 1e-9) * 4))].push(i));
    if (fingers.some(m => m.length < 3)) return { side, ok: false, warn: warn.concat(['não foi possível achar 4 dedos']), n: R.P.length };
  }
  // 2) polegar = lóbulo menor ligado à palma: componente que se separa da massa principal numa linha mais baixa
  const fingIds = new Set(fingers.flat()); let thumb = null;
  const fingerCentroid = meanP(fingers.flat());
  for (let thr = 0.6; thr >= 0.3 && !thumb; thr -= 0.025) {
    const comp = components(G, G.map(g => g.f > thr * L)).sort((a, b) => b.length - a.length);
    for (const m of comp.slice(1)) { if (m.length < 12 || m.length > G.length * 0.15) continue; if (m.some(g => fingIds.has(g))) continue; const c = meanP(m); if (fOf(c) > 0.45 * L && len(sub(c, fingerCentroid)) > 0.012) { thumb = m; break; } }
  }
  if (!thumb) warn.push('polegar não separado: posição estimada pela anatomia (impreciso)');
  // eixos do plano perpendicular a F (largura = PCA dos dedos)
  const perp = p => sub(p, scl(F, fOf(p))), allD = fingers.flat(), fcp = perp(meanP(allD));
  const Wx = nrm(pca3(allD.map(g => perp(G[g].p)), fcp, [F])), Nx = nrm(cross(F, Wx));
  // 3) frame anatômico: o polegar fica do lado t; palma = F x t (esquerda) ou t x F (direita)
  let tdir;
  if (thumb) tdir = nrm(perp(sub(meanP(thumb), fingerCentroid)));
  else { const ws = R.P.filter(q => fOf(q.p) > 0.25 * L && fOf(q.p) < 0.6 * L).map(q => dot(perp(q.p), Wx)).sort((a, b) => a - b), c = dot(fcp, Wx), lo = c - ws[Math.floor(ws.length * 0.02)], hi = ws[Math.floor(ws.length * 0.98)] - c; tdir = hi > lo ? Wx : scl(Wx, -1); }
  const palm = side === 'l' ? nrm(cross(F, tdir)) : nrm(cross(tdir, F));
  // ordem dos dedos: o indicador é o mais perto do polegar
  const tPt = thumb ? meanP(thumb) : add(fingerCentroid, scl(tdir, 0.05));
  fingers.sort((a, b) => len(sub(meanP(a), tPt)) - len(sub(meanP(b), tPt)));
  // curvatura medida: as pontas dos dedos ficam do lado da palma em relação às bases?
  let curlM = 0; fingers.forEach(m => { const s = m.slice().sort((a, b) => G[a].f - G[b].f), n5 = Math.max(3, Math.floor(s.length * 0.25)); curlM += dot(sub(meanP(s.slice(-n5)), meanP(s.slice(0, n5))), palm) / 4; });
  // 4) membros de cada dedo. Dedos: crescem das pontas para a base ("bacia hidrográfica" por altura f, decrescente) até a linha dos nós.
  //    Polegar: cresce a partir do lóbulo por conectividade, só por vértices perto do eixo do lóbulo.
  const lab = new Array(G.length).fill(-1);                              // 0 = polegar, 1..4 = indicador..mínimo
  fingers.forEach((m, k) => m.forEach(g => { lab[g] = k + 1; }));
  const order = G.map((g, i) => i).filter(i => G[i].f >= KNUCKLE * L).sort((a, b) => G[b].f - G[a].f);
  for (let pass = 0; pass < 40; pass++) {
    let ch = false;
    for (const i of order) { if (lab[i] >= 0) continue; const cnt = {}; let bl = -1, bc = 0; G[i].nb.forEach(j => { if (lab[j] >= 1) { cnt[lab[j]] = (cnt[lab[j]] || 0) + 1; if (cnt[lab[j]] > bc) { bc = cnt[lab[j]]; bl = lab[j]; } } }); if (bl > 0) { lab[i] = bl; ch = true; } }
    if (!ch) break;
  }
  const axisOf = pts => { const c0 = pts.reduce((s, p) => add(s, p), [0, 0, 0]).map(x => x / pts.length); let ax = pca3(pts, c0, null); if (dot(ax, F) < 0) ax = scl(ax, -1); return { c0, ax }; };
  const lineD = (o, p) => len(sub(sub(p, o.c0), scl(o.ax, dot(sub(p, o.c0), o.ax))));
  let thumbMem = thumb ? thumb.slice() : null;
  if (thumbMem) {
    for (let it = 0; it < 8; it++) {
      const pts = thumbMem.map(g => G[g].p), o = axisOf(pts), rad = pts.map(p => lineD(o, p)).sort((a, b) => a - b), r0 = Math.max(0.011, rad[Math.floor(rad.length * 0.85)]);
      const inT = new Set(thumbMem), st = thumbMem.slice();
      while (st.length) { const x = st.pop(); G[x].nb.forEach(y => { if (!inT.has(y) && lab[y] < 1 && G[y].f >= 0.14 * L && lineD(o, G[y].p) < 2.4 * r0) { inT.add(y); st.push(y); } }); }
      thumbMem = Array.from(inT);
    }
    if (process.env.RIGDBG) console.log("thumb seed", thumb.length, "grown", thumbMem.length, "fmin", Math.min(...thumbMem.map(g => G[g].f)).toFixed(3), "fmax", Math.max(...thumbMem.map(g => G[g].f)).toFixed(3));
    thumbMem.forEach(g => { lab[g] = 0; });
  }
  const members = [thumbMem, ...[1, 2, 3, 4].map(k => G.map((g, i) => i).filter(i => lab[i] === k))];
  const chains = members.map((mem, i) => {
    const ch = { thumb: i === 0 }, f0 = (ch.thumb ? CMC : KNUCKLE) * L;
    if (!mem || mem.length < 6) { ch.fail = true; return ch; }
    const set = new Set(mem), fmin = Math.min(...mem.map(g => G[g].f)), fmax = Math.max(...mem.map(g => G[g].f));
    // distância pela malha (Dijkstra) a partir da base do dedo: ordena as fatias mesmo quando o dedo se curva
    const dist = new Map(); mem.filter(g => G[g].f <= fmin + 0.12 * (fmax - fmin)).forEach(g => dist.set(g, 0));
    const open = Array.from(dist.keys());
    while (open.length) { let bi = 0; for (let k = 1; k < open.length; k++) if (dist.get(open[k]) < dist.get(open[bi])) bi = k; const x = open.splice(bi, 1)[0], dx = dist.get(x); G[x].nb.forEach(y => { if (!set.has(y)) return; const nd = dx + len(sub(G[y].p, G[x].p)); if (!dist.has(y) || nd < dist.get(y) - 1e-9) { if (!dist.has(y)) open.push(y); dist.set(y, nd); } }); }
    const reach = mem.filter(g => dist.has(g)), dm = reach.map(g => dist.get(g)).sort((a, b) => a - b), dmax = dm[Math.floor(dm.length * 0.985)] || 1e-6;
    const K = 7, bk = Array.from({ length: K }, () => ({ n: 0, p: [0, 0, 0] }));
    reach.forEach(g => { const b = Math.min(K - 1, Math.floor(dist.get(g) / (dmax + 1e-9) * K)); bk[b].n++; bk[b].p = add(bk[b].p, G[g].p); });
    let pl = bk.filter(b => b.n >= 2).map(b => scl(b.p, 1 / b.n)); if (pl.length < 2) { ch.fail = true; return ch; }
    const d0 = nrm(sub(pl[1], pl[0])), back = (fOf(pl[0]) - f0) / (dot(d0, F) || 1e-6);
    const start = (fOf(pl[0]) > f0 && dot(d0, F) > 0.3 && back > 0 && back < 0.5 * len(sub(pl[pl.length - 1], pl[0]))) ? sub(pl[0], scl(d0, back)) : pl[0];
    const dl = nrm(sub(pl[pl.length - 1], pl[pl.length - 2])), lastP = pl[pl.length - 1];
    const slack = Math.max(0, Math.max(...reach.map(g => dot(sub(G[g].p, lastP), dl)))), tip = add(lastP, scl(dl, slack * 0.95));
    const poly = [start, ...pl, tip], cum = [0]; for (let j = 1; j < poly.length; j++) cum.push(cum[j - 1] + len(sub(poly[j], poly[j - 1])));
    const total = cum[cum.length - 1], at = fr => { const s = fr * total; let j = 1; while (j < cum.length - 1 && cum[j] < s) j++; return lerp3(poly[j - 1], poly[j], Math.min(1, (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1))); };
    const fr = ch.thumb ? FRAC.thumb : FRAC.fingers; ch.J = [poly[0], at(fr[0]), at(fr[1]), poly[poly.length - 1]]; ch.members = mem.length;
    const jc = [0, len(sub(ch.J[1], ch.J[0]))]; jc.push(jc[1] + len(sub(ch.J[2], ch.J[1]))); jc.push(jc[2] + len(sub(ch.J[3], ch.J[2]))); ch.length = jc[3];
    const pds = mem.map(g => polyDist(ch.J, jc, G[g].p)).filter(x => x.s > 0.3 * jc[3]).map(x => x.d).sort((a, b) => a - b); ch.r = Math.max(0.004, pds.length ? pds[Math.floor(pds.length * 0.7)] : 0.01);
    return ch;
  });
  if (!thumbMem) { const c = chains[0]; Object.assign(c, { fail: false }); }
  if (chains.some((c, i) => c.fail && (i > 0 || thumbMem))) return { side, ok: false, warn: warn.concat(['cadeia de dedo sem vértices']), n: R.P.length };
  if (!thumbMem || chains[0].fail) {                                     // polegar estimado: do lado t, da altura CMC até 0.62 L, comprimento ~ 0.4 L
    const base = add(add(fingerCentroid, scl(tdir, 0.045)), scl(F, CMC * L - fOf(fingerCentroid))), tip = add(base, scl(nrm(add(scl(F, 0.9), scl(tdir, 0.3))), 0.42 * L)), c = chains[0];
    c.thumb = true; c.J = [base, lerp3(base, tip, FRAC.thumb[0]), lerp3(base, tip, FRAC.thumb[1]), tip]; c.length = len(sub(tip, base)); c.members = 0; c.r = 0.009; c.fail = false;
  }
  { const fr_ = chains.slice(1).map(c => c.r).sort((x, y) => x - y), med = fr_[2]; if (chains[0].r > 1.5 * med) { chains[0].r = 1.5 * med; } }
  const digits = chains.map((c, i) => ({ name: DIGITS[i], thumb: c.thumb, J: c.J, r: c.r, members: c.members, length: c.length }));
  return { side, ok: true, n: R.P.length, L, F, W: Wx, N: Nx, palm, thumbDir: tdir, curlMeasured: curlM, curlAgree: curlM >= 0, digits, warn, zone: allD.length, thr: thrUsed, thumbFound: !!thumbMem };
}

/* ================= ossos do rig estendido ================= */
function buildBones(S, side, an) {
  const sd = SIDES[side], hb = S.idx[sd.hand], inv = S.man.bones[hb].inverse, out = [];
  an.digits.forEach((dg, di) => {
    let Rprev = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], prevJ = [0, 0, 0], parentName = sd.hand; const frames = [];
    for (let j = 0; j < 3; j++) {
      const X = nrm(sub(dg.J[j + 1], dg.J[j])); let Yp = sub(an.palm, scl(X, dot(an.palm, X))); if (len(Yp) < 1e-4) Yp = an.N; Yp = nrm(Yp); const Z = nrm(cross(X, Yp));
      const Hm = basisM(X, Yp, Z, dg.J[j]);                                          // espaço da mão -> osso
      // local = inverse(pai) * Hm  (em torno do pai: mão = identidade)
      const parentH = frames.length ? frames[frames.length - 1].H : I4(), local = mul(inv4(parentH), Hm);
      const name = SIDES[side].name + '_' + dg.name + (j + 1);
      out.push({ name, id: boneId(side, di, j + 1), side, digit: di, joint: j + 1, parent: parentName, local: local.map(f4), inverse: mul(inv4(Hm), inv).map(x => +x.toPrecision(9)), length: f4(len(sub(dg.J[j + 1], dg.J[j]))) });
      frames.push({ H: Hm }); parentName = name; void Rprev; void prevJ;
    }
  });
  return out;
}
/* pesos: devolve { v: [...índices], i: [...4 por vértice], w: [...4 por vértice] } para uma geometria */
function reweight(S, side, an, geo, bones, boneBase) {
  const sd = SIDES[side], R = handRegion(S, geo, side), L = an.L, digs = an.digits;
  const cand = bones.filter(b => b.side === side);                           // 15 ossos; índice 0..14 -> boneBase + índice global
  const chains = digs.map(dg => { const J = dg.J, cum = [0, len(sub(J[1], J[0]))]; cum.push(cum[1] + len(sub(J[2], J[1]))); cum.push(cum[2] + len(sub(J[3], J[2]))); return { J, cum, r: dg.r, total: cum[3], thumb: dg.thumb }; });
  // 1) pesos brutos por posição única (as costuras de UV não racham: mesma posição, mesmo peso)
  const { G, gid } = groupRegion(R, geo, null);
  const raw = G.map(g => {
    const om = new Array(16).fill(0); let sumGam = 0;
    const gs = chains.map(c => { const pd = polyDist([c.J[0], c.J[1], c.J[2], c.J[3]], c.cum, g.p); const x = pd.d / c.r; return { pd, g: x <= 1 ? 1 : Math.max(0, 1 - (x - 1) / 0.9) }; });
    const sg = gs.reduce((s, x) => s + x.g, 0), norm = Math.max(1, sg);
    let handW = 1;
    chains.forEach((c, di) => {
      const { pd } = gs[di], gam = gs[di].g / norm; if (gam <= 0) return;
      const h0 = Math.max(0.004, 0.14 * c.total), beta = smooth((pd.s + h0) / (2 * h0));
      if (beta <= 0) return; const gb = gam * beta; handW -= gb;
      const hh1 = Math.max(0.003, 0.3 * Math.min(c.cum[1], c.cum[2] - c.cum[1])), hh2 = Math.max(0.003, 0.3 * Math.min(c.cum[2] - c.cum[1], c.cum[3] - c.cum[2]));
      const u1 = smooth((pd.s - c.cum[1] + hh1) / (2 * hh1)), u2 = smooth((pd.s - c.cum[2] + hh2) / (2 * hh2));
      om[1 + di * 3] += gb * (1 - u1); om[2 + di * 3] += gb * Math.max(0, u1 - u2); om[3 + di * 3] += gb * u2;
    });
    om[0] = Math.max(0, handW); g.om = om; return om;
  });
  // 2) suavização por vizinhança na malha (grupos de posição), 2 iterações
  const nb = G.map(g => g.nb);
  let cur = raw;
  for (let it = 0; it < 2; it++) cur = cur.map((om, g) => { if (!nb[g].size) return om; const o = om.map(x => x * 0.6); nb[g].forEach(h => { for (let k = 0; k < 16; k++) o[k] += cur[h][k] * 0.4 / nb[g].size; }); return o; });
  // 3) escreve por vértice: demais influências (fora do grupo mão/dedos SA) ficam; a parcela S do grupo é repartida entre mão + 15 ossos (máx. 4 no total)
  const outV = [], outI = [], outW = [], handIdx = S.idx[sd.hand];
  R.P.forEach(q => {
    const om = cur[gid[q.i]], infl = []; let rest = 0;
    for (let k = 0; k < 4; k++) { const w = geo.skinWeight[q.i * 4 + k], b = geo.skinIndex[q.i * 4 + k]; if (w <= 0) continue; if (R.group.has(b)) rest += w; else infl.push([b, w]); }
    const slots = 4 - infl.length, c = om.map((w, k) => [k, w]).filter(x => x[1] > 0.004).sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, slots)), tot = c.reduce((s, x) => s + x[1], 0) || 1;
    c.forEach(([k, w]) => infl.push([k === 0 ? handIdx : boneBase + cand[k - 1]._g, rest * w / tot]));
    while (infl.length < 4) infl.push([0, 0]);
    outV.push(q.i); infl.forEach(([b, w]) => { outI.push(b); outW.push(+w.toFixed(5)); });
  });
  return { v: outV, i: outI, w: outW };
}
function makeRig(S, onlySides) {
  const rig = { version: 1, skin: S.id, baseBones: S.man.bones.length, bones: [], geoms: {}, hands: {}, notes: '' };
  const ans = {};
  for (const side of ['l', 'r']) { if (S.idx[SIDES[side].hand] === undefined) throw new Error('osso ' + SIDES[side].hand + ' ausente'); ans[side] = analyzeHand(S, side); if (!ans[side].ok) throw new Error('mão ' + side + ': ' + ans[side].warn.join('; ')); }
  const all = [];
  for (const side of ['l', 'r']) { const bs = buildBones(S, side, ans[side]); bs.forEach(b => { b._g = all.length; all.push(b); }); }
  all.forEach(b => { b.index = rig.baseBones + b._g; });
  rig.bones = all.map(b => ({ name: b.name, id: b.id, parent: b.parent, side: b.side, digit: b.digit, joint: b.joint, length: b.length, local: b.local, inverse: b.inverse }));
  const parts = {};
  for (const gname of Object.keys(S.geoms)) {
    const geo = S.geoms[gname], res = { v: [], i: [], w: [] };
    for (const side of ['l', 'r']) { const sub_ = { ...ans[side] }; let r; try { r = reweight(S, side, sub_, geo, all.filter(b => b.side === side).map(b => ({ ...b, _g: b._g })), rig.baseBones); } catch (e) { r = { v: [], i: [], w: [] }; } res.v.push(...r.v); res.i.push(...r.i); res.w.push(...r.w); }
    rig.geoms[gname] = { verts: geo.verts, count: res.v.length, v: res.v, i: res.i, w: res.w }; parts[gname] = res.v.length;
  }
  for (const side of ['l', 'r']) { const a = ans[side]; rig.hands[side] = { length: f4(a.L), curlAgree: a.curlAgree, curlMeasured: f4(a.curlMeasured), warn: a.warn, palm: a.palm.map(f4), thumbDir: a.thumbDir.map(f4), digits: a.digits.map(d => ({ name: d.name, r: f4(d.r), length: f4(d.length), members: d.members, J: d.J.map(p => p.map(f4)) })) }; }
  rig.driveSA = (['lfinger', 'rfinger'].some(n => { const geo = S.geoms.base, ids = [S.idx[n], S.idx[n + '01']]; let c = 0; for (let i = 0; i < geo.verts * 4; i++) if (geo.skinWeight[i] > 0.05 && ids.includes(geo.skinIndex[i])) c++; return c > 20; }));
  rig.notes = 'Gerado por engine/tools/skeleton-extend.js. Pesos esparsos por geometria (base/lod1/lod2): v = índice do vértice, i/w = 4 influências (índices de osso do esqueleto estendido: 0..' + (rig.baseBones - 1) + ' = SA, depois os novos).';
  return { rig, ans, parts };
}

/* ================= comandos ================= */
function listSkins() { return fs.readdirSync(SKINS).filter(d => fs.existsSync(path.join(SKINS, d, 'skin.json'))).sort(); }
function cmdInspect(id) {
  const S = loadSkin(id), out = { id, name: S.man.name, verts: S.man.verts, bones: S.man.bones.map((b, i) => ({ i, id: b.id, name: b.name, parent: b.parent })), hand: {} };
  const geo = S.geoms.base;
  for (const side of ['l', 'r']) {
    const sd = SIDES[side], names = [sd.hand, ...sd.fin], rows = {};
    names.forEach(n => { rows[n] = { id: S.man.bones[S.idx[n]].id, anyWeight: 0, dominant: 0, over50: 0 }; });
    for (let i = 0; i < geo.verts; i++) { let bw = 0, bb = -1; for (let k = 0; k < 4; k++) { const w = geo.skinWeight[i * 4 + k], b = geo.skinIndex[i * 4 + k]; if (w <= 0) continue; const nm = S.man.bones[b].name; if (rows[nm]) { rows[nm].anyWeight++; if (w >= 0.5) rows[nm].over50++; } if (w > bw) { bw = w; bb = b; } } if (bb >= 0 && rows[S.man.bones[bb].name]) rows[S.man.bones[bb].name].dominant++; }
    const an = analyzeHand(S, side); out.hand[side] = { weights: rows, analysis: an.ok ? { regionVerts: an.n, handLength: f4(an.L), zoneVerts: an.zone, curlAgreesWithAnatomy: an.curlAgree, warn: an.warn, digits: an.digits.map(d => ({ name: d.name, members: d.members, length: f4(d.length), radius: f4(d.r) })) } : an };
  }
  const rp = path.join(RIGS, id + '.rig.json'); out.rig = fs.existsSync(rp) ? { file: rp, bytes: fs.statSync(rp).size } : null;
  if (A.json) { console.log(JSON.stringify(out, null, 1)); return; }
  console.log('Skin ' + id + ' (' + out.name + ') ' + out.verts + ' vértices, ' + out.bones.length + ' ossos\n');
  console.log('i   id   osso          pai'); out.bones.forEach(b => console.log(String(b.i).padEnd(3), String(b.id).padEnd(4), b.name.padEnd(13), b.parent >= 0 ? out.bones[b.parent].name : '-'));
  for (const side of ['l', 'r']) {
    const h = out.hand[side]; console.log('\nMão ' + (side === 'l' ? 'esquerda' : 'direita') + ' - vértices por osso do SA (qualquer peso / peso dominante / peso >= 50%):');
    Object.entries(h.weights).forEach(([n, r]) => console.log('  ' + n.padEnd(10), '(id ' + r.id + ')', String(r.anyWeight).padStart(6), String(r.dominant).padStart(6), String(r.over50).padStart(6)));
    const a = h.analysis; if (!a.digits) { console.log('  análise: ' + (a.warn || []).join('; ')); continue; }
    console.log('  análise geométrica: ' + a.regionVerts + ' vértices na região, comprimento da mão ' + a.handLength + ' m, curvatura medida ' + (a.curlAgreesWithAnatomy ? 'coerente' : 'INVERTIDA') + ' com a regra anatômica');
    a.digits.forEach(d => console.log('   ' + d.name.padEnd(7), 'vértices ' + String(d.members).padStart(5), 'comprimento ' + d.length, 'raio ' + d.radius));
    (a.warn || []).forEach(w => console.log('   AVISO: ' + w));
  }
  console.log('\nrig estendido: ' + (out.rig ? out.rig.file + ' (' + out.rig.bytes + ' bytes)' : 'ainda não gerado (extend ' + id + ')'));
}
function cmdExtend(target) {
  const ids = target === '--all' || A.all ? listSkins() : [target]; if (!ids[0]) { console.log('use: extend <skinId|--all> [--dry]'); process.exit(1); }
  if (!A.dry) fs.mkdirSync(RIGS, { recursive: true });
  let ok = 0, fail = 0, warned = 0; const t0 = Date.now();
  for (const id of ids) {
    try {
      const S = loadSkin(id), { rig, parts } = makeRig(S), w = ['l', 'r'].flatMap(s => rig.hands[s].warn.map(x => s + ': ' + x)).concat(['l', 'r'].filter(s => !rig.hands[s].curlAgree).map(s => s + ': curvatura medida contra a regra anatômica'));
      if (w.length) warned++;
      const pathOut = path.join(RIGS, id + '.rig.json'), text = JSON.stringify(rig);
      if (!A.dry) fs.writeFileSync(pathOut, text);
      console.log((A.dry ? '[dry] ' : '') + id.padEnd(26), 'ossos novos ' + rig.bones.length, 'vértices repesados ' + Object.entries(parts).map(([k, v]) => k + ':' + v).join(' '), (text.length / 1024).toFixed(0) + ' KB', w.length ? 'AVISO ' + w.join(' | ') : '');
      ok++;
    } catch (e) { fail++; console.log(id.padEnd(26), 'FALHOU: ' + e.message); }
  }
  if (!A.dry) {                                                         // index.json: o jogo só tenta baixar rigs listados (sem 404 no console)
    const ixf = path.join(RIGS, 'index.json'); const ix = { skins: {} };
    fs.readdirSync(RIGS).filter(x => x.endsWith('.rig.json')).forEach(x => { ix.skins[x.replace('.rig.json', '')] = fs.statSync(path.join(RIGS, x)).size; });
    fs.writeFileSync(ixf, JSON.stringify(ix));
  }
  console.log('\n' + ok + ' ok, ' + fail + ' falhas, ' + warned + ' com avisos (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (A.dry ? ' [dry: nada gravado]' : ' -> ' + RIGS));
  process.exit(fail ? 2 : 0);
}
/* confere o rig: (1) osso novo * inverse = D (mesmo bind que a mão), (2) soma dos pesos = 1, <= 4 influências, ids únicos, (3) pose de repouso idêntica ao original, (4) curva os dedos e mede o estiramento das arestas */
function cmdVerify(target) {
  const ids = (!target || target === '--all' || A.all) ? fs.readdirSync(RIGS).filter(f => f.endsWith('.rig.json')).map(f => f.replace(/\.rig\.json$/, '')) : [target];
  let bad = 0;
  for (const id of ids) {
    const errs = [], info = [];
    try {
      const S = loadSkin(id), rig = JSON.parse(fs.readFileSync(path.join(RIGS, id + '.rig.json'), 'utf8')), nb = rig.baseBones + rig.bones.length;
      if (rig.baseBones !== S.man.bones.length) errs.push('número de ossos base mudou (' + rig.baseBones + ' vs ' + S.man.bones.length + ')');
      const used = new Set(S.man.bones.map(b => b.id)); rig.bones.forEach(b => { if (used.has(b.id)) errs.push('id repetido ' + b.id); used.add(b.id); if (b.id <= 400) errs.push('id <= 400: ' + b.name); });
      // mundo em repouso dos ossos novos
      const W = S.W.slice(); const nameIdx = Object.assign({}, S.idx); rig.bones.forEach((b, k) => { nameIdx[b.name] = rig.baseBones + k; W[rig.baseBones + k] = mul(W[nameIdx[b.parent]], b.local); });
      const Dof = s => { const h = S.idx[s + 'hand']; return mul(S.W[h], S.man.bones[h].inverse); }, D = Dof('l'); let dmax = 0;
      rig.bones.forEach((b, k) => { const M = mul(W[rig.baseBones + k], b.inverse), Ds = Dof(b.side); for (let q = 0; q < 16; q++) dmax = Math.max(dmax, Math.abs(M[q] - Ds[q])); });
      if (dmax > 1e-4) errs.push('bind dos ossos novos difere do bind da mão (' + dmax.toExponential(2) + ')');
      for (const g of Object.keys(rig.geoms)) {
        const geo = S.geoms[g], R = rig.geoms[g]; let wdev = 0, restErr = 0, bigMove = 0, usedIdx = true;
        for (let n = 0; n < R.v.length; n++) {
          const v = R.v[n]; let s = 0; for (let k = 0; k < 4; k++) { const w = R.w[n * 4 + k], b = R.i[n * 4 + k]; s += w; if (w > 0 && b >= nb) usedIdx = false; }
          let so = 0; for (let k = 0; k < 4; k++) so += geo.skinWeight[v * 4 + k]; wdev = Math.max(wdev, Math.abs(s - so));
          const p = [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]], skinAt = (idxA, wA) => { let o = [0, 0, 0]; for (let k = 0; k < 4; k++) { if (wA[k] <= 0) continue; const bi = idxA[k]; const inv = bi < rig.baseBones ? S.man.bones[bi].inverse : rig.bones[bi - rig.baseBones].inverse; o = add(o, scl(xf(mul(W[bi], inv), p), wA[k])); } return o; };
          const a0 = skinAt(Array.from(geo.skinIndex.subarray(v * 4, v * 4 + 4)), Array.from(geo.skinWeight.subarray(v * 4, v * 4 + 4))), a1 = skinAt(R.i.slice(n * 4, n * 4 + 4), R.w.slice(n * 4, n * 4 + 4));
          restErr = Math.max(restErr, len(sub(a0, a1)));
        }
        if (!usedIdx) errs.push(g + ': índice de osso fora do esqueleto');
        if (wdev > 2e-4) errs.push(g + ': soma de pesos mudou (' + wdev.toExponential(2) + ')');
        if (restErr > 1e-4) errs.push(g + ': pose de repouso mudou ' + restErr.toExponential(2) + ' m');
        info.push(g + ': ' + R.count + ' vértices, repouso ±' + restErr.toExponential(1));
      }
      // curvar: gira todas as juntas em torno do eixo Z local (positivo = para a palma) e mede o maior alongamento de aresta na malha base
      const geo = S.geoms.base, R = rig.geoms.base, pos2 = new Float32Array(geo.pos), touched = new Set(R.v), curl = [1.3, 1.5, 1.0];
      const rotZ = a => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const Wc = S.W.slice(); rig.bones.forEach((b, k) => { const th = b.digit === 0 ? [0.6, 0.8, 0.7][b.joint - 1] : curl[b.joint - 1]; Wc[rig.baseBones + k] = mul(Wc[nameIdx[b.parent]], mul(b.local, rotZ(th))); });
      for (let v = 0; v < geo.verts; v++) { const q = xf(D, [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]]); pos2[v * 3] = q[0]; pos2[v * 3 + 1] = q[1]; pos2[v * 3 + 2] = q[2]; }
      const slot = new Map(); R.v.forEach((v, n) => slot.set(v, n));
      touched.forEach(v => { const n = slot.get(v), p = [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]]; let o = [0, 0, 0]; for (let k = 0; k < 4; k++) { const w = R.w[n * 4 + k]; if (w <= 0) continue; const bi = R.i[n * 4 + k], inv = bi < rig.baseBones ? S.man.bones[bi].inverse : rig.bones[bi - rig.baseBones].inverse; o = add(o, scl(xf(mul(Wc[bi], inv), p), w)); } pos2[v * 3] = o[0]; pos2[v * 3 + 1] = o[1]; pos2[v * 3 + 2] = o[2]; });
      // o espaço do vértice não é o do modelo (D), mas o alongamento de aresta é invariante a rotação: compara comprimentos
      const rat = [];
      for (let t = 0; t < geo.indices; t += 3) for (let e = 0; e < 3; e++) { const a = geo.index[t + e], b = geo.index[t + (e + 1) % 3]; if (!touched.has(a) && !touched.has(b)) continue; const l0 = Math.hypot(geo.pos[a * 3] - geo.pos[b * 3], geo.pos[a * 3 + 1] - geo.pos[b * 3 + 1], geo.pos[a * 3 + 2] - geo.pos[b * 3 + 2]); if (l0 < 1e-4) continue; const l1 = Math.hypot(pos2[a * 3] - pos2[b * 3], pos2[a * 3 + 1] - pos2[b * 3 + 1], pos2[a * 3 + 2] - pos2[b * 3 + 2]); rat.push(l1 / l0); }
      rat.sort((x, y) => x - y); const pc = q => rat[Math.min(rat.length - 1, Math.floor(rat.length * q))];
      info.push('dedos curvados: alongamento de aresta p50 ' + pc(0.5).toFixed(2) + ' p99 ' + pc(0.99).toFixed(2) + ' p99.9 ' + pc(0.999).toFixed(2) + ' máx ' + rat[rat.length - 1].toFixed(2));
      if (pc(0.99) > 3.5) errs.push('estiramento forte ao curvar (p99 ' + pc(0.99).toFixed(2) + ')'); else if (pc(0.99) > 2.4) info.push('AVISO: estiramento moderado ao curvar tudo ao máximo (p99 ' + pc(0.99).toFixed(2) + ')');
    } catch (e) { errs.push(e.message); }
    if (errs.length) bad++;
    console.log((errs.length ? 'FALHA ' : 'ok    ') + id + (info.length ? '\n        ' + info.join('\n        ') : '') + (errs.length ? '\n        ' + errs.join('\n        ') : ''));
  }
  console.log('\n' + (ids.length - bad) + '/' + ids.length + ' rigs ok'); process.exit(bad ? 3 : 0);
}

if (require.main !== module) module.exports = { loadSkin, analyzeHand, makeRig, handRegion, polyDist, SIDES };
else if (CMD === 'inspect' && A._[1]) cmdInspect(A._[1]);
else if (CMD === 'extend') cmdExtend(A._[1] || (A.all ? '--all' : null));
else if (CMD === 'verify') cmdVerify(A._[1]);
else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(CMD ? 1 : 0); }
