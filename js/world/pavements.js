/* NEON COAST — Pisos procedurais em alta (1024 px para 8 m): asfalto, calçada paulista (pedra portuguesa com o mapa do estado),
   cimentado com juntas e rachaduras, intertravado, grama — e uma variação em escala grande ("macro") no shader que quebra a repetição
   (manchas, desbotado, sujeira) sem custo de textura extra. Também o atlas de decalques da rua (bueiro, tampa, remendo, óleo). */
'use strict';
const PAVE = {};
{
  const N = 1024;
  const wrapDraw = (g, x, y, r, fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) if (x + ox > -r && x + ox < N + r && y + oy > -r && y + oy < N + r) fn(x + ox, y + oy); };
  const noiseFill = (g, amp, seed, bias) => {                     // ruído por pixel (agregado, poros) por cima do que já foi pintado
    const img = g.getImageData(0, 0, N, N), d = img.data, r = mulberry32(seed);
    for (let i = 0; i < d.length; i += 4) { let n = (r() + r() + r() - 1.5) * amp; const q = r(); if (q < (bias || 0.012)) n += 34; else if (q > 1 - (bias || 0.012)) n -= 30; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.97; }
    g.putImageData(img, 0, 0);
  };
  const blotches = (g, r, n, rmin, rmax, cols) => { for (let k = 0; k < n; k++) { const x = r() * N, y = r() * N, rad = rmin + r() * (rmax - rmin), c = cols[Math.floor(r() * cols.length)];
    wrapDraw(g, x, y, rad, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2); }); } };
  const crack = (g, r, x, y, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); let a = r() * 6.28; for (let s = 0; s < len; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); } g.stroke(); };
  const tex = cv => { const t = toTex(cv, true); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };

  /* asfalto: agregado fino, manchas de piche e desgaste, trincas finas */
  {
    const cv = mkCanvas(N, N), g = cv.getContext('2d'), r = mulberry32(4401);
    g.fillStyle = '#45474b'; g.fillRect(0, 0, N, N);
    blotches(g, r, 26, 60, 220, ['rgba(20,20,24,0.22)', 'rgba(120,118,112,0.16)', 'rgba(30,30,34,0.18)']);
    noiseFill(g, 22, 4402, 0.02);
    for (let k = 0; k < 7; k++) crack(g, r, r() * N, r() * N, 6 + r() * 14, 1.2, 'rgba(18,18,20,0.55)');
    PAVE.asphalt = tex(cv);
  }
  /* calçada paulista: pedra portuguesa preta e branca com o desenho do mapa do estado de São Paulo (motivo de 2 m) */
  {
    const mask = mkCanvas(N, N), m = mask.getContext('2d'), M = 256;
    m.fillStyle = '#fff'; m.fillRect(0, 0, N, N); m.fillStyle = '#000';
    const SPMAP = [[0, .44], [.08, .33], [.2, .27], [.31, .16], [.45, .1], [.55, .02], [.66, .07], [.74, 0], [.86, .07], [.97, .22], [1, .34], [.9, .46], [.8, .58], [.68, .7], [.55, .82], [.47, .9], [.4, .79], [.3, .67], [.17, .58], [.06, .52]];
    for (let row = -1; row <= N / M; row++) for (let col = -1; col <= N / M; col++) {
      const ox = col * M + (row % 2 ? M / 2 : 0) + M * 0.12, oy = row * M + M * 0.2, s = M * 0.74;
      m.beginPath(); SPMAP.forEach(([u, v], k) => k ? m.lineTo(ox + u * s, oy + v * s * 0.78) : m.moveTo(ox + u * s, oy + v * s * 0.78)); m.closePath(); m.fill();
    }
    const md = m.getImageData(0, 0, N, N).data, cv = mkCanvas(N, N), g = cv.getContext('2d'), r = mulberry32(5511), st = 11;
    g.fillStyle = '#6d6860'; g.fillRect(0, 0, N, N);                                   // rejunte (areia)
    for (let y = 0; y < N; y += st) for (let x = 0; x < N; x += st) {
      const cx = x + st / 2 + (r() - 0.5) * 3, cy = y + st / 2 + (r() - 0.5) * 3, black = md[((Math.floor(cy + N) % N) * N + (Math.floor(cx + N) % N)) * 4] < 128;
      const v = r(), col = black ? `rgb(${30 + v * 26 | 0},${30 + v * 24 | 0},${32 + v * 24 | 0})` : `rgb(${206 + v * 34 | 0},${200 + v * 34 | 0},${188 + v * 32 | 0})`, a = r() * 6.28, rad = st * (0.42 + r() * 0.12);
      wrapDraw(g, cx, cy, st, (px, py) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 5; k++) { const aa = a + k * 1.2566 + (r() - 0.5) * 0.5, rr2 = rad * (0.8 + r() * 0.3); k ? g.lineTo(px + Math.cos(aa) * rr2, py + Math.sin(aa) * rr2) : g.moveTo(px + Math.cos(aa) * rr2, py + Math.sin(aa) * rr2); } g.closePath(); g.fill(); });
    }
    blotches(g, r, 14, 40, 160, ['rgba(60,50,40,0.12)', 'rgba(0,0,0,0.10)']);
    noiseFill(g, 9, 5512, 0.004);
    PAVE.portuguesa = tex(cv);
  }
  /* cimentado: placas de ~1 m com juntas, tom diferente por placa, rachaduras, manchas e chicletes */
  {
    const cv = mkCanvas(N, N), g = cv.getContext('2d'), r = mulberry32(6611), S = 128;
    for (let y = 0; y < N; y += S) for (let x = 0; x < N; x += S) { const v = r(); g.fillStyle = `rgb(${176 + v * 26 | 0},${172 + v * 24 | 0},${162 + v * 22 | 0})`; g.fillRect(x, y, S, S); }
    blotches(g, r, 30, 30, 150, ['rgba(70,64,54,0.16)', 'rgba(255,255,250,0.10)', 'rgba(40,40,40,0.12)']);
    noiseFill(g, 16, 6612, 0.01);
    g.fillStyle = 'rgba(70,68,64,0.85)'; for (let k = 0; k <= N; k += S) { g.fillRect(k - 1.5, 0, 3, N); g.fillRect(0, k - 1.5, N, 3); }
    for (let k = 0; k < 18; k++) crack(g, r, r() * N, r() * N, 4 + r() * 10, 1.4, 'rgba(50,48,44,0.6)');
    for (let k = 0; k < 140; k++) { const x = r() * N, y = r() * N; g.fillStyle = `rgba(40,38,36,${0.25 + r() * 0.3})`; g.beginPath(); g.arc(x, y, 1.5 + r() * 2.5, 0, 6.3); g.fill(); }
    PAVE.concreto = tex(cv);
  }
  /* intertravado: blocos de concreto 20×10 cm em fileiras desencontradas, com tons misturados */
  {
    const cv = mkCanvas(N, N), g = cv.getContext('2d'), r = mulberry32(7711), bw = 32, bh = 16;
    g.fillStyle = '#4d4b47'; g.fillRect(0, 0, N, N);
    for (let y = 0, row = 0; y < N; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < N; x += bw) { const v = r(), red = r() < 0.07;
      g.fillStyle = red ? `rgb(${150 + v * 20 | 0},${96 + v * 14 | 0},${80 + v * 12 | 0})` : `rgb(${148 + v * 30 | 0},${146 + v * 28 | 0},${140 + v * 26 | 0})`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2); if (x < 0) g.fillRect(x + N + 1, y + 1, bw - 2, bh - 2); }
    blotches(g, r, 22, 40, 160, ['rgba(40,36,30,0.14)', 'rgba(255,255,255,0.08)']);
    noiseFill(g, 12, 7712, 0.008);
    PAVE.intertravado = tex(cv);
  }
  /* grama */
  {
    const cv = mkCanvas(512, 512), g = cv.getContext('2d'), r = mulberry32(8811);
    g.fillStyle = '#4c7f3a'; g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 9000; k++) { const x = r() * 512, y = r() * 512, v = r(); g.strokeStyle = `rgba(${40 + v * 60 | 0},${90 + v * 70 | 0},${30 + v * 30 | 0},0.7)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5); g.stroke(); }
    for (let k = 0; k < 30; k++) { const x = r() * 512, y = r() * 512, rad = 10 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < 0.5 ? 'rgba(130,120,60,0.25)' : 'rgba(20,50,20,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    PAVE.grass = tex(cv);
  }
  /* ruído macro (dois canais independentes, periódico em 256 px) */
  {
    const n = 256, cv = mkCanvas(n, n), g = cv.getContext('2d'), img = g.createImageData(n, n), d = img.data;
    const lat = (seed, L) => { const r = mulberry32(seed), a = new Float32Array(L * L); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
    const per = (a, L, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), q = (i, j) => a[((j % L + L) % L) * L + ((i % L + L) % L)];
      return (q(x0, y0) * (1 - sx) + q(x0 + 1, y0) * sx) * (1 - sy) + (q(x0, y0 + 1) * (1 - sx) + q(x0 + 1, y0 + 1) * sx) * sy; };
    const oct = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]].map(([L, w], k) => ({ L, w, A: lat(900 + k, L), B: lat(950 + k, L) }));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let a = 0, b = 0; for (const o of oct) { a += per(o.A, o.L, x / n * o.L, y / n * o.L) * o.w; b += per(o.B, o.L, x / n * o.L, y / n * o.L) * o.w; }
      const i = (y * n + x) * 4; d[i] = a * 255; d[i + 1] = b * 255; d[i + 2] = 128; d[i + 3] = 255; }
    g.putImageData(img, 0, 0); PAVE.macro = toTex(cv, true);
  }
  /* decalques de rua (atlas 2×2): tampa de bueiro, boca de lobo, remendo, mancha de óleo */
  {
    const cv = mkCanvas(512, 512), g = cv.getContext('2d'), r = mulberry32(9911);
    // tampa redonda de ferro fundido
    g.save(); g.translate(128, 128); g.fillStyle = '#2b2a28'; g.beginPath(); g.arc(0, 0, 112, 0, 6.3); g.fill(); g.fillStyle = '#3d3b37'; g.beginPath(); g.arc(0, 0, 100, 0, 6.3); g.fill();
    g.strokeStyle = '#2a2826'; g.lineWidth = 5; for (let k = -90; k <= 90; k += 18) { g.beginPath(); g.moveTo(k, -Math.sqrt(100 * 100 - k * k)); g.lineTo(k, Math.sqrt(100 * 100 - k * k)); g.stroke(); }
    g.fillStyle = '#56524b'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('SABESP', 0, 9); g.restore();
    // boca de lobo (grelha retangular)
    g.fillStyle = '#5a5a58'; g.fillRect(268, 70, 232, 116); g.fillStyle = '#121212'; for (let k = 0; k < 9; k++) g.fillRect(282 + k * 24, 84, 12, 88);
    // remendo de asfalto
    g.fillStyle = 'rgba(28,28,30,0.92)'; g.beginPath(); g.moveTo(30, 290); for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; g.lineTo(128 + Math.cos(a) * (88 + r() * 22), 384 + Math.sin(a) * (70 + r() * 22)); } g.closePath(); g.fill();
    // óleo
    const gr = g.createRadialGradient(384, 384, 0, 384, 384, 110); gr.addColorStop(0, 'rgba(8,8,10,0.55)'); gr.addColorStop(0.6, 'rgba(10,10,12,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(272, 272, 224, 224);
    const t = toTex(cv, false);
    PAVE.decalMat = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
}
/* variação macro em espaço de mundo: duas escalas de ruído multiplicam a cor (desbotado, sujeira, manchas) */
function addMacro(mat, k1, k2, amp, stain) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.macroMap = { value: PAVE.macro };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ=(modelMatrix*vec4(transformed,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D macroMap;\nvarying vec2 vWXZ;').replace('#include <map_fragment>', `#include <map_fragment>
      { float mA=texture2D(macroMap,vWXZ*${k1.toFixed(5)}).r, mB=texture2D(macroMap,vWXZ*${k2.toFixed(5)}+vec2(0.37,0.71)).g;
        diffuseColor.rgb*=mix(${(1 - amp).toFixed(3)},${(1 + amp * 0.7).toFixed(3)},mA*0.65+mB*0.35);
        diffuseColor.rgb*=1.0-${(stain || 0).toFixed(3)}*smoothstep(0.58,0.78,mB); }`);
  };
  mat.customProgramCacheKey = () => 'macro' + k1 + '|' + k2 + '|' + amp + '|' + stain;
  return mat;
}
