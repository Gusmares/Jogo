// Copia o handling.cfg original (do pack, via tools/auto-catalog.json) e o serviço de cada veículo para o model.json (campo physics.sa).
// A física do jogo (js/entities/car-physics-core.js → deriveCar) transforma esses números no perfil do carro: cada carro dirige diferente.
//   node tools/vehicle-handling.js
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), A = require('./auto-catalog.json');
let n = 0, sa = 0;
for (const v of A.vehicles) {
  const f = path.join(root, 'assets/models', v.id, 'model.json'); if (!fs.existsSync(f)) continue;
  const man = JSON.parse(fs.readFileSync(f, 'utf8'));
  man.physics = Object.assign({}, man.physics || {}, { service: v.service || null });
  if (v.sa_handling) { man.physics.sa = v.sa_handling; sa++; } else delete man.physics.sa;
  fs.writeFileSync(f, JSON.stringify(man)); n++;
}
console.log('handling gravado em', n, 'modelos (', sa, 'com handling original do SA )');
