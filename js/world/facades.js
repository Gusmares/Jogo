/* NEON COAST — Fachadas da cidade: vidro espelhado, concreto, tijolo, lojas, galpão e casas.
   Cada textura é uma grade 8×8 de células de 3,2 m (um andar × um vão) com a versão "acesa" para a noite; a cor de cada prédio vai nos vértices. */
'use strict';
const FACADE = {};
function facadePair(kind) {
  const cs = 64, cv = mkCanvas(512, 512), g = cv.getContext('2d'), ce = mkCanvas(512, 512), e = ce.getContext('2d'), r = mulberry32(kind.length * 977 + kind.charCodeAt(0) * 31);
  const base = { glass: '#a9bccb', concrete: '#dcd8cf', brick: '#b3573a', shop: '#cfc9bd', ware: '#9aa7b3', house: '#efe6d3', brise: '#2c3440', stone: '#ddd3bf' }[kind];
  g.fillStyle = base; g.fillRect(0, 0, 512, 512); e.fillStyle = '#000'; e.fillRect(0, 0, 512, 512);
  if (kind === 'brick') { for (let y = 0; y < 512; y += 8) for (let x = -((y / 8) % 2) * 16; x < 512; x += 32) { const k = 0.8 + r() * 0.35; g.fillStyle = `rgb(${182 * k | 0},${88 * k | 0},${58 * k | 0})`; g.fillRect(x + 1, y + 1, 30, 6); } }
  if (kind === 'ware') { for (let x = 0; x < 512; x += 8) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`; g.fillRect(x, 0, 3, 512); } }
  if (kind === 'concrete' || kind === 'house') for (let i = 0; i < 240; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.04})`; g.beginPath(); g.arc(r() * 512, r() * 512, 3 + r() * 16, 0, 7); g.fill(); }
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
    const x0 = cx * cs, y0 = cy * cs, lit = r() < 0.42, h = r(), tone = r(), litCol = h < 0.6 ? '#ffe2a0' : h < 0.85 ? '#ffd080' : '#cfe6ff';
    if (kind === 'glass') {
      const gr = g.createLinearGradient(x0, y0, x0 + cs, y0 + cs); gr.addColorStop(0, `rgb(${60 + tone * 40 | 0},${110 + tone * 40 | 0},${150 + tone * 40 | 0})`); gr.addColorStop(1, `rgb(${20 + tone * 30 | 0},${50 + tone * 30 | 0},${90 + tone * 30 | 0})`);
      g.fillStyle = gr; g.fillRect(x0 + 2, y0 + 2, cs - 4, cs - 12); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x0 + 2, y0 + 2, cs - 4, 7); g.fillStyle = '#5b6770'; g.fillRect(x0, y0 + cs - 10, cs, 10); g.fillRect(x0 + cs / 2 - 1, y0, 2, cs - 10);
      if (lit) { e.fillStyle = litCol; e.fillRect(x0 + 4, y0 + 4, cs - 8, cs - 16); }
    } else if (kind === 'concrete') {
      g.fillStyle = '#2a3a4d'; g.fillRect(x0 + 5, y0 + 16, cs - 10, 30); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x0 + 5, y0 + 16, cs - 10, 4); g.fillStyle = '#a9a69d'; g.fillRect(x0, y0 + 46, cs, 4);
      if (lit) { e.fillStyle = litCol; e.fillRect(x0 + 7, y0 + 18, cs - 14, 26); }
    } else if (kind === 'brick') {
      g.fillStyle = '#f0ece2'; g.fillRect(x0 + 12, y0 + 10, 40, 44); g.fillStyle = '#2a3a4d'; g.fillRect(x0 + 15, y0 + 13, 34, 38); g.fillStyle = '#f0ece2'; g.fillRect(x0 + 31, y0 + 13, 2, 38);
      if (cy % 2) { g.fillStyle = '#7d7b75'; g.fillRect(x0 + 6, y0 + 52, 52, 4); g.fillRect(x0 + 6, y0 + 44, 2, 12); g.fillRect(x0 + 56, y0 + 44, 2, 12); }
      if (lit) { e.fillStyle = litCol; e.fillRect(x0 + 16, y0 + 14, 32, 36); }
    } else if (kind === 'house') {
      g.fillStyle = '#6b5a47'; g.fillRect(x0 + 10, y0 + 12, 44, 38); g.fillStyle = '#394a5a'; g.fillRect(x0 + 14, y0 + 16, 36, 30); g.fillStyle = '#b97a4a'; g.fillRect(x0 + 6, y0 + 12, 6, 38); g.fillRect(x0 + 52, y0 + 12, 6, 38);
      if (lit) { e.fillStyle = litCol; e.fillRect(x0 + 16, y0 + 18, 32, 26); }
    } else if (kind === 'ware') {
      if (cy === 7 && (cx === 1 || cx === 4 || cx === 6)) { g.fillStyle = '#d8d8d0'; g.fillRect(x0 + 6, y0 + 8, cs - 12, cs - 8); for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0 + 6, y0 + 10 + k * 8, cs - 12, 2); } }
      else if (cy === 2) { g.fillStyle = '#20303f'; g.fillRect(x0 + 8, y0 + 20, cs - 16, 14); if (lit) { e.fillStyle = '#e7ecd0'; e.fillRect(x0 + 10, y0 + 22, cs - 20, 10); } }
    }
  }
  if (kind === 'brise') {                                          // brises horizontais contínuos (Copan, Conjunto Nacional): faixa clara por andar, vidro escuro atrás
    for (let cy = 0; cy < 8; cy++) { const y0 = cy * 64; g.fillStyle = '#f1efe9'; g.fillRect(0, y0 + 40, 512, 18); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y0 + 56, 512, 3); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, y0 + 4, 512, 6);
      for (let cx = 0; cx < 8; cx++) { if (r() < 0.4) { e.fillStyle = r() < 0.7 ? '#ffe2a0' : '#cfe6ff'; e.fillRect(cx * 64 + 4, y0 + 6, 56, 32); } g.fillStyle = '#4a5562'; g.fillRect(cx * 64 + 31, y0, 2, 40); } }
  }
  if (kind === 'stone') {                                          // pedra clara com janelas em arco, cornijas (prédios históricos do Centro)
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,80,60' : '255,255,255'},${0.03 + r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 4 + r() * 30, 2 + r() * 6); }
    for (let cy = 0; cy < 8; cy++) { const y0 = cy * 64; g.fillStyle = '#bfb39b'; g.fillRect(0, y0 + 58, 512, 6);
      for (let cx = 0; cx < 8; cx++) { const x0 = cx * 64; g.fillStyle = '#efe7d6'; g.fillRect(x0 + 14, y0 + 10, 36, 44); g.beginPath(); g.arc(x0 + 32, y0 + 18, 18, Math.PI, 0); g.fill();
        g.fillStyle = '#2d3640'; g.fillRect(x0 + 18, y0 + 18, 28, 34); g.beginPath(); g.arc(x0 + 32, y0 + 18, 14, Math.PI, 0); g.fill(); g.fillStyle = '#efe7d6'; g.fillRect(x0 + 31, y0 + 6, 2, 46);
        if (r() < 0.38) { e.fillStyle = '#ffd890'; e.fillRect(x0 + 19, y0 + 10, 26, 40); } } }
  }
  if (kind === 'shop') {                                           // vitrine contínua (1 linha), portas, toldos e rodapé
    g.fillStyle = '#cfc9bd'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#2a2d33'; g.fillRect(0, 440, 512, 72);
    for (let k = 0; k < 8; k++) { const x0 = k * 64, door = k % 4 === 2, awn = ['#d23b2e', '#e0a800', '#2e7bc4', '#2f9e5b'][(k * 3 + 1) % 4];
      g.fillStyle = awn; g.fillRect(x0 + 2, 70, 60, 54); g.fillStyle = 'rgba(255,255,255,.55)'; for (let s = 0; s < 6; s++) g.fillRect(x0 + 2 + s * 10, 70, 5, 54);
      g.fillStyle = door ? '#42505e' : '#7fa3bd'; g.fillRect(x0 + 6, 132, 52, 300); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x0 + 6, 132, 52, 30); g.fillStyle = '#4a4f57'; g.fillRect(x0 + 31, 132, 2, 300);
      e.fillStyle = '#ffe9b0'; e.fillRect(x0 + 8, 134, 48, 296); e.fillStyle = '#fff3cf'; e.fillRect(x0 + 2, 70, 60, 54); }
  }
  const map = toTex(cv, true), em = toTex(ce, true); return { map, em };
}
for (const k of ['glass', 'concrete', 'brick', 'shop', 'ware', 'house', 'brise', 'stone']) {
  const t = facadePair(k);
  FACADE[k] = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: t.map, emissiveMap: t.em, emissive: 0xffd9a0, emissiveIntensity: 0 });
  bMats.push(FACADE[k]);                                          // o céu liga as janelas à noite (sky.js percorre bMats)
}
/* atlas de placas (letreiros das lojas): 4 colunas × 3 linhas de 256×128 */
const SIGNS = ['PADARIA', 'FARMÁCIA', 'MERCADO', 'BAR DO ZÉ', 'LANCHONETE', 'BANCO', 'ÓTICA', 'CAFÉ', 'PIZZARIA', 'ACADEMIA', 'HOTEL', 'LOJA 24H'];
const signMat = (() => {
  const cv = mkCanvas(1024, 384), g = cv.getContext('2d'), pal = [['#c0392b', '#fff'], ['#1e8449', '#fff'], ['#f1c40f', '#222'], ['#2c3e50', '#f1c40f'], ['#e67e22', '#fff'], ['#154360', '#fff'], ['#8e44ad', '#fff'], ['#6e2c00', '#f5cba7'], ['#b03a2e', '#f9e79f'], ['#17202a', '#58d68d'], ['#1a5276', '#f7dc6f'], ['#27ae60', '#fff']];
  SIGNS.forEach((t, i) => { const x = (i % 4) * 256, y = Math.floor(i / 4) * 128; g.fillStyle = pal[i][0]; g.fillRect(x, y, 256, 128); g.strokeStyle = pal[i][1]; g.lineWidth = 6; g.strokeRect(x + 6, y + 6, 244, 116); g.fillStyle = pal[i][1]; g.font = 'bold 38px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 128, y + 66, 224); });
  const m = new THREE.MeshLambertMaterial({ map: toTex(cv, false), emissive: 0x555555, emissiveMap: null }); bMats.push(m); return m;
})();
