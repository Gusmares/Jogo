/* Catálogo compartilhado com o importador (assets/catalog.json). Falhas individuais mantêm os carros de reserva.
   São ~180 veículos: carregar todos de uma vez estoura a memória/rede, então o tráfego usa um RODÍZIO — começa com ~12 modelos sorteados
   e vai trocando um modelo a cada ~20 s (o carro que já está na rua continua com o dele). */
'use strict';
const assetCatalogReady = fetch('assets/catalog.json').then(r => { if (!r.ok) throw new Error('Catálogo ausente'); return r.json(); });
const trafficModels = [];
const TRAFFIC_POOL = 14;
let trafficCatalog = [];
function pickTrafficType() {
  const total = trafficModels.reduce((s, t) => s + (t.man.trafficWeight || 1), 0);
  let n = Math.random() * total;
  return trafficModels.find(t => (n -= (t.man.trafficWeight || 1)) < 0) || trafficModels[0];
}
function applyTrafficModel(c, type) {
  if (!type || c === player.car) return;
  const old = c.mesh, color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  c.mesh = makeVehicleMesh(type, color); scene.remove(old); scene.add(c.mesh);
  if (old.userData.ownedMats) old.userData.ownedMats.forEach(m => m.dispose());
  c.mesh.position.copy(old.position); c.mesh.rotation.copy(old.rotation);
  applyVehDims(c, type.man); c.speed = Math.min(c.speed, c.cruise);
}
/* sorteio ponderado de um modelo do catálogo que ainda não está no rodízio */
function drawCatalogModel() {
  const free = trafficCatalog.filter(v => !trafficModels.some(t => t.id === v.id)); if (!free.length) return null;
  const total = free.reduce((s, v) => s + v.weight, 0); let n = Math.random() * total;
  return free.find(v => (n -= v.weight) < 0) || free[0];
}
async function rotateTraffic() {
  const v = drawCatalogModel(); if (!v) return;
  try { const t = await loadVehicleType(v.id); if (!trafficModels.includes(t)) trafficModels.push(t); } catch (e) { console.warn('Veículo civil:', v.id, e); trafficCatalog = trafficCatalog.filter(x => x !== v); return; }
  // tira do sorteio o modelo mais antigo (os carros que já usam continuam rodando)
  if (trafficModels.length > TRAFFIC_POOL) trafficModels.splice(Math.floor(Math.random() * (trafficModels.length - 1)), 1);
}
const trafficReady = assetCatalogReady.then(async catalog => {
  trafficCatalog = catalog.vehicles.filter(v => v.weight > 0 && !v.service);
  const first = []; for (let k = 0; k < 10; k++) { const v = drawCatalogModel(); if (!v) break; first.push(v); trafficModels.push({ id: v.id, man: { trafficWeight: 0 }, placeholder: true }); }
  trafficModels.length = 0;
  for (let k = 0; k < first.length; k += 4) {                       // poucos por vez: não satura a rede
    const res = await Promise.allSettled(first.slice(k, k + 4).map(v => loadVehicleType(v.id)));
    res.forEach(r => { if (r.status === 'fulfilled') trafficModels.push(r.value); else console.warn('Veículo civil:', r.reason); });
  }
  window.upgradeTrafficCar = c => applyTrafficModel(c, pickTrafficType());
  cars.filter(c => !c.cop && !c.ems).forEach(c => applyTrafficModel(c, pickTrafficType()));
  setInterval(() => { if (typeof started === 'undefined' || started) rotateTraffic(); }, 20000);
  // ?showroom: todos os modelos estacionados lado a lado perto do início (carrega em sequência)
  if (location.search.includes('showroom')) (async () => {
    const list = catalog.vehicles.filter(v => !location.search.includes('showroom=') || v.id.startsWith(location.search.split('showroom=')[1].split('&')[0]));
    for (let i = 0; i < list.length; i++) { try { const type = await loadVehicleType(list[i].id); const row = i % 20, col = Math.floor(i / 20); const c = new Car(0xffffff, -4.5 + col * 12, 72 + row * 14, 0, false, () => makeVehicleMesh(type, CAR_COLORS[i % CAR_COLORS.length])); applyVehDims(c, type.man); c.parked = true; } catch (e) { console.warn(list[i].id, e); } }
  })();
  return trafficModels;
}).catch(e => { console.warn('Catálogo de veículos:', e); return []; });
