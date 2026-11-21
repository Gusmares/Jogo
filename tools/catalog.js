// Monta assets/catalog.json (o que o jogo carrega): veículos civis e de serviço, skins e armas — manuais (tools/assets.json) + automáticos (auto-catalog.json).
// Só entra o que foi convertido de verdade (existe model.json / skin.json).
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
function writeCatalog() {
  const man = require('./assets.json'), auto = fs.existsSync(path.join(__dirname, 'auto-catalog.json')) ? require('./auto-catalog.json') : { vehicles: [], skins: [], weapons: [] };
  const has = id => fs.existsSync(path.join(root, 'assets/models', id, 'model.json')), hasSkin = id => fs.existsSync(path.join(root, 'assets/models/skins', id, 'skin.json'));
  const vehicles = man.vehicles.map(v => ({ id: v.id, weight: v.trafficWeight, name: v.name, kind: v.kind || 'car' }))
    .concat(auto.vehicles.filter(v => has(v.id)).map(v => ({ id: v.id, weight: v.trafficWeight, name: v.name, kind: v.kind, service: v.service || undefined, unit: v.unit || undefined })));
  const weapons = man.weapons.map(({ dff, txd, ...w }) => w).concat(auto.weapons.filter(w => has(w.id)).map(({ dff, txd, ...w }) => w));
  const skins = auto.skins.filter(s => hasSkin(s.id)).map(s => ({ id: s.id, name: s.name, role: s.role, unit: s.unit || undefined }));
  const out = { vehicles, weapons, skins, disabled: man.disabled };
  fs.writeFileSync(path.join(root, 'assets/catalog.json'), JSON.stringify(out, null, 1));
  console.log('catálogo:', vehicles.length, 'veículos,', skins.length, 'skins,', weapons.length, 'armas');
  return out;
}
module.exports = { writeCatalog };
if (require.main === module) writeCatalog();
