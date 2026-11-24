// NEON ENGINE — "abrasileira" texturas de objetos de rua do GTA IV na importação (--brasil).
// Regras por nome do objeto/textura: lixeiras e caçambas nas cores de SP, hidrante vermelho, poste/semáforo cinza-escuro, placas de rua
// no azul das placas de São Paulo. Mexe só na cor (matiz/saturação) mantendo o desenho e o desgaste da textura original.
'use strict';
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function hsl2rgb(h, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
/* pinta as partes "coloridas" (saturadas) com a cor nova; o que é cinza/preto/branco fica igual */
function recolor(t, hue, sat, light) {
  const d = Buffer.from(t.rgba);
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); if (s < 0.18) continue;
    const c = hsl2rgb(hue, Math.min(1, sat === undefined ? s : sat * (0.6 + 0.4 * s)), light === undefined ? l : l * light);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return Object.assign({}, t, { rgba: d, name: t.name + '_br' });
}
const RULES = [
  [/hydrant/, t => recolor(t, 0.0, 0.85)],                        // hidrante: vermelho (como os da Sabesp)
  [/bin|trash|garbage|litter|dumpster|skip/, t => recolor(t, 0.07, 0.9)],   // lixeira/caçamba: laranja das lixeiras de SP
  [/mailbox|post_box|postbox/, t => recolor(t, 0.13, 0.95)],      // caixa de correio: amarela (Correios)
  [/street_?sign|streetname|st_sign|roadsign_name/, t => recolor(t, 0.6, 0.85, 0.9)],   // placa de rua: azul
  [/traffic|tlight|signal|lamppost|lamp_post|streetlight/, t => recolor(t, 0.0, 0.0, 0.55)],   // semáforo/poste: cinza-escuro (tira o amarelo americano)
  [/newspaper|news_box|newsbox/, t => recolor(t, 0.33, 0.6)]      // banca/caixa de jornal: verde das bancas
];
function brazilize(objName, tex) {
  const key = (objName + ' ' + tex.name).toLowerCase();
  for (const [re, fn] of RULES) if (re.test(key)) return fn(tex);
  return tex;
}
module.exports = { brazilize, recolor };
