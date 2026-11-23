// Pastas de mods ORIGINAIS (crus) — ficam em assets/mods/<balde>/<nome-do-mod>/ e nunca vão para o executável.
// Os baldes mostram, no explorador de arquivos, o que já foi aproveitado no jogo e o que ainda falta trabalhar:
//   0-NOVOS        jogue aqui os mods novos (descompactados). O inventário os classifica e move para o balde certo.
//   1-USADOS       tudo que presta do mod já está no jogo
//   2-PARCIAIS     parte do mod já está no jogo, parte ainda não (veja assets/mods/INVENTARIO.md)
//   3-NAO-USADOS   nada do mod está no jogo ainda
// As configurações (tools/*.json) apontam para "mods/<nome-do-mod>/arquivo" SEM o balde: mover a pasta de balde não quebra nada.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = require('./project').root();                // mods ficam em <projeto>/assets/mods
const MODS = path.join(ROOT, 'assets', 'mods');
const BUCKETS = ['0-NOVOS', '1-USADOS', '2-PARCIAIS', '3-NAO-USADOS'];

/** acha a pasta de um mod pelo nome, em qualquer balde (ou null) */
function findMod(name) {
  for (const b of BUCKETS) { const p = path.join(MODS, b, name); if (fs.existsSync(p)) return p; }
  return null;
}
/** "mods/<Nome>/sub/arquivo.dff" (ou caminho absoluto / relativo à raiz) -> caminho real no disco */
function modFile(rel) {
  if (path.isAbsolute(rel)) return rel;
  const m = /^(?:assets\/)?mods\/([^/]+)(?:\/(.*))?$/.exec(rel.replace(/\\/g, '/'));
  if (!m) return path.resolve(ROOT, rel);
  const dir = findMod(m[1]);
  if (!dir) throw new Error('Mod não encontrado em assets/mods/*: ' + m[1] + ' (procurado para ' + rel + ')');
  return m[2] ? path.join(dir, m[2]) : dir;
}
module.exports = { ROOT, MODS, BUCKETS, findMod, modFile };
