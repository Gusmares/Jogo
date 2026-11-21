// Texturas GENÉRICAS de veículo (o "vehicle.txd" do jogo: grade, cromados, borrachas, faróis, pneus, volante, painel...).
// Os modelos dos mods só citam essas texturas pelo nome; o pack GTA Brasil traz a versão dele em _CFG/generic.
// Este script extrai, amplia 2x (Catmull-Rom + nitidez leve) e grava UMA cópia compartilhada em assets/models/_generic/
// (todos os carros apontam para a mesma imagem: o navegador baixa uma vez só). A placa Mercosul é desenhada no jogo (vehicle-models.js).
//   node tools/generic-vehicle-tex.js
'use strict';
const fs = require('fs'), path = require('path');
const { loadTXD, encodePNG } = require('./txd');
const { modFile } = require('./mods');

const root = path.resolve(__dirname, '..'), out = path.join(root, 'assets/models/_generic');
const SRC = ['mods/Pack_185_vehicles_Extras_-_GTA_Brasil_v4.1_-_ImVehSys/Pack 185 vehicles Extras - GTA Brasil v4.1 - ImVehSys/_CFG/generic/vehicle.txd',
             'mods/Pack_185_vehicles_Extras_-_GTA_Brasil_v4.1_-_ImVehSys/Pack 185 vehicles Extras - GTA Brasil v4.1 - ImVehSys/_CFG/generic/vehicle2.txd'];
const SKIP = /^(carplate|carpback|platecharset|plateback\d|vehicleenvmap128|xvehicleenv128|vehiclespecdot64|vehiclescratch64)$/i;   // placa: gerada no jogo; mapas de reflexo: o motor tem os seus
const UPSCALE = /generic256|lights128|lightson128|tyres128|steering128|dash32|grunge256|logo256|poldecals128|shatter128/i;

function cubic(img, s) {                                   // amplia s× com Catmull-Rom (por canal, inclusive alfa)
  const { w, h, rgba } = img, W = w * s, H = h * s, o = new Uint8Array(W * H * 4);
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const px = (x, y, c) => rgba[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4 + c];
  for (let Y = 0; Y < H; Y++) { const fy = (Y + 0.5) / s - 0.5, y = Math.floor(fy), ty = fy - y;
    for (let X = 0; X < W; X++) { const fx = (X + 0.5) / s - 0.5, x = Math.floor(fx), tx = fx - x;
      for (let c = 0; c < 4; c++) { const r = [-1, 0, 1, 2].map(k => cr(px(x - 1, y + k, c), px(x, y + k, c), px(x + 1, y + k, c), px(x + 2, y + k, c), tx));
        o[(Y * W + X) * 4 + c] = Math.max(0, Math.min(255, Math.round(cr(r[0], r[1], r[2], r[3], ty)))); } } }
  return { w: W, h: H, rgba: o, hasAlpha: img.hasAlpha };
}
function sharpen(img, amt) {                               // máscara de nitidez 3×3 (só cor)
  const { w, h, rgba } = img, o = new Uint8Array(rgba);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) for (let c = 0; c < 3; c++) {
    const i = (y * w + x) * 4 + c, blur = (rgba[i - 4] + rgba[i + 4] + rgba[i - w * 4] + rgba[i + w * 4] + rgba[i] * 4) / 8;
    o[i] = Math.max(0, Math.min(255, Math.round(rgba[i] + (rgba[i] - blur) * amt)));
  }
  return { ...img, rgba: o };
}
function realAlpha(img) { let n = 0; for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < 128) n++; return n / (img.w * img.h) > 0.02; }

function build() {
  fs.mkdirSync(out, { recursive: true });
  const index = {};
  for (const rel of SRC) {
    let file; try { file = modFile(rel); } catch (e) { file = null; }
    if (!file || !fs.existsSync(file)) { console.warn('não achei', rel); continue; }
    const txd = loadTXD(file);
    for (const [name, img0] of Object.entries(txd)) {
      if (SKIP.test(name) || img0.w < 8) continue;
      const alpha = img0.hasAlpha && realAlpha(img0);
      let img = alpha ? img0 : { ...img0, rgba: (() => { const r = new Uint8Array(img0.rgba); for (let i = 3; i < r.length; i += 4) r[i] = 255; return r; })(), hasAlpha: false };
      if (UPSCALE.test(name)) img = sharpen(cubic(img, 2), 0.45);
      const fn = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.png';
      fs.writeFileSync(path.join(out, fn), encodePNG(img));
      index[name.toLowerCase()] = { file: fn, alpha, w: img.w, h: img.h };
    }
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
  console.log('texturas genéricas:', Object.keys(index).length, '→ assets/models/_generic');
  return index;
}
function genericIndex() {
  const f = path.join(out, 'index.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : build();
}
if (require.main === module) build();
module.exports = { genericIndex, build };
