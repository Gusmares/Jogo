/* NEON COAST — Skins civis para a multidão (a lógica dos NPCs fica em npcs.js).
   O catálogo tem ~140 roupas (packs de skins). A rua usa um RODÍZIO: ~14 skins sorteadas ao iniciar e uma troca a cada ~25 s,
   para variar sem carregar tudo (cada skin tem malha + atlas). Policiais ficam fora (são das unidades). */
'use strict';
const PEDESTRIAN_SKINS = ['player_argentina', 'player_bbthin', 'player_emmet'];
const PED_POOL = 14;
let pedestrianTypes = [], pedCatalog = [];
function drawPedSkin() { const free = pedCatalog.filter(s => !pedestrianTypes.some(t => t.id === s.id)); return free.length ? free[Math.floor(Math.random() * free.length)] : null; }
const pedestriansReady = (async () => {
  let cat = null; try { cat = await (await fetch('assets/catalog.json')).json(); } catch (e) { cat = null; }
  pedCatalog = (cat && cat.skins ? cat.skins.filter(s => s.role !== 'policia') : []).concat(PEDESTRIAN_SKINS.map(id => ({ id, role: 'civil' })));
  const first = []; while (first.length < 10) { const s = pedCatalog[Math.floor(Math.random() * pedCatalog.length)]; if (!s) break; if (!first.includes(s)) first.push(s); if (first.length >= pedCatalog.length) break; }
  for (let k = 0; k < first.length; k += 4) {
    const res = await Promise.allSettled(first.slice(k, k + 4).map(s => loadSkin(s.id)));
    res.forEach((r, i) => { if (r.status === 'fulfilled') { r.value.role = first[k + i].role; pedestrianTypes.push(r.value); } else console.warn('Skin de pedestre:', r.reason); });
  }
  await ifpLoaded;
  if (!pedestrianTypes.length) console.warn('Nenhuma skin civil disponível para os pedestres.');
  setInterval(async () => {
    const s = drawPedSkin(); if (!s) return;
    try { const t = await loadSkin(s.id); t.role = s.role; pedestrianTypes.push(t); if (pedestrianTypes.length > PED_POOL) pedestrianTypes.splice(Math.floor(Math.random() * (pedestrianTypes.length - 1)), 1); } catch (e) { pedCatalog = pedCatalog.filter(x => x !== s); }
  }, 25000);
  return pedestrianTypes;
})();
