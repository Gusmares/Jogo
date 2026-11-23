/* Física de veículos (carro, ônibus e moto), em unidades SI e passo fixo (1/120 s), sem dependência do renderizador.

   CARRO / ÔNIBUS — versão 3 (refeita do zero na parte de pneu, direção e assistências):
   • Cada carro tem o PRÓPRIO perfil, tirado do handling.cfg original do GTA SA que vem no pack (massa, inércia de giro, centro de massa,
     tração, perda de tração, distribuição de aderência, aceleração, velocidade máxima, freio, ângulo de direção, suspensão, tipo de tração).
     Carros sem handling (modelos avulsos) usam um tipo-base (compacto, sedã, SUV, van, caminhão, ônibus) + ajustes por modelo.
   • Pneu: força lateral cresce rápido até o pico (ângulo de deriva ~5-8°) e depois cai só até a "aderência deslizando" do carro
     (sem efeito sabão: mesmo de lado o pneu continua segurando 70-90%). Círculo de atrito: acelerar/frear forte rouba aderência lateral.
   • Motor de potência constante com força máxima limitada (arranque) e câmbio automático só para giro/som e pequenas pausas na troca.
   • Freio com ABS (não trava); freio de mão trava a traseira e solta o eixo — é ele que faz o carro rodar/derrapar de propósito.
   • Direção: esterço máximo cai com a velocidade só até o ponto de aderência máxima do pneu dianteiro (vira tudo o que o pneu deixa).
   • Assistências por carro: estabilidade (corta o giro excessivo e contra-esterça sozinho), controle de tração (tração traseira forte
     com pouco controle sai de traseira no acelerador), manobra em baixa velocidade (vira certinho no estacionamento).
   MOTO: modelo de bicicleta com inclinação (inalterado). */
(function (scope) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), G = 9.81, lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- tipos-base (em unidades do handling do SA) para veículos sem handling próprio ---------- */
  const TYPES = {
    compact: { mass: 1050, turnMass: 2200, drag: 2.2, com: [0, 0.1, -0.1], traction: 0.78, tractionLoss: 0.86, tractionBias: 0.52, gears: 5, vmax: 165, accel: 19, drive: 'F', engine: 'P', brake: 8.5, brakeBias: 0.55, steer: 35, susForce: 1.3, susDamp: 0.12, susUpper: 0.26, susLower: -0.16 },
    sedan: { mass: 1400, turnMass: 3200, drag: 2.2, com: [0, 0, -0.1], traction: 0.78, tractionLoss: 0.84, tractionBias: 0.5, gears: 5, vmax: 175, accel: 21, drive: 'R', engine: 'P', brake: 8.5, brakeBias: 0.53, steer: 32, susForce: 1.2, susDamp: 0.12, susUpper: 0.27, susLower: -0.17 },
    suv: { mass: 1900, turnMass: 4600, drag: 2.6, com: [0, 0, 0], traction: 0.76, tractionLoss: 0.86, tractionBias: 0.5, gears: 5, vmax: 170, accel: 21, drive: '4', engine: 'D', brake: 8, brakeBias: 0.55, steer: 33, susForce: 1.1, susDamp: 0.13, susUpper: 0.32, susLower: -0.22, hflags: '100000' },
    van: { mass: 2600, turnMass: 6800, drag: 3.0, com: [0, 0, 0.1], traction: 0.72, tractionLoss: 0.86, tractionBias: 0.5, gears: 5, vmax: 145, accel: 14, drive: 'R', engine: 'D', brake: 7, brakeBias: 0.55, steer: 32, susForce: 1.1, susDamp: 0.13, susUpper: 0.3, susLower: -0.2 },
    truck: { mass: 7000, turnMass: 26000, drag: 5.0, com: [0, 0, 0.2], traction: 0.68, tractionLoss: 0.86, tractionBias: 0.45, gears: 6, vmax: 120, accel: 9, drive: 'R', engine: 'D', brake: 5.5, brakeBias: 0.5, steer: 36, susForce: 1.2, susDamp: 0.14, susUpper: 0.3, susLower: -0.2 },
    bus: { mass: 9000, turnMass: 40000, drag: 5.5, com: [0, 0, 0.2], traction: 0.68, tractionLoss: 0.86, tractionBias: 0.45, gears: 6, vmax: 115, accel: 8, drive: 'R', engine: 'D', brake: 5.5, brakeBias: 0.5, steer: 40, susForce: 1.2, susDamp: 0.14, susUpper: 0.3, susLower: -0.2 }
  };
  /* modelos avulsos (fora dos packs com handling): tipo + o que muda */
  const MODEL = {
    vw_gol: { type: 'compact', mass: 980, accel: 19, vmax: 172, traction: 0.8 },
    vw_fusca: { type: 'compact', mass: 820, turnMass: 1700, accel: 12, vmax: 130, drive: 'R', com: [0, -0.35, -0.05], traction: 0.74, tractionLoss: 0.8, gears: 4 },
    peugeot_206: { type: 'compact', mass: 1080, accel: 22, vmax: 185, traction: 0.84, tractionLoss: 0.88 },
    palio_rp: { type: 'compact', mass: 960, accel: 22, vmax: 178, traction: 0.84, service: 'policia' },
    spin_rp: { type: 'compact', mass: 1180, accel: 20, vmax: 170, traction: 0.82, com: [0, 0, 0], service: 'policia' },
    sw4_ft: { type: 'suv', mass: 2100, accel: 22, vmax: 180, service: 'policia' },
    hilux_tor: { type: 'suv', mass: 2000, accel: 22, vmax: 175, service: 'policia' },
    hilux_rota: { type: 'suv', mass: 2000, accel: 23, vmax: 180, service: 'policia' },
    trailblazer_pc: { type: 'suv', mass: 2050, accel: 23, vmax: 185, service: 'policia' },
    trailblazer_rota: { type: 'suv', mass: 2050, accel: 24, vmax: 190, service: 'policia' },
    ambulancia: { type: 'van', accel: 15, vmax: 150, service: 'samu' },
    bombeiros: { type: 'truck', accel: 10, vmax: 125, service: 'bombeiros' },
    bus_belem: { type: 'bus' }, bus_sinoscap: { type: 'bus' }, bus_sao_jose: { type: 'bus' },
    honda_biz: { cat: 'scooter', bikeType: 'scooter' }, moto_rocam: { cat: 'bike', bikeType: 'police' }
  };
  /* motos: modelo próprio (inalterado) */
  const BIKES = {
    scooter: { bike: true, mass: 185, hp: 24, redline: 8200, idle: 1500, gears: [3.5, 2.1, 1.45, 1.05], rev: 0, final: 4.4, cdA: 0.55, crr: 0.016, cg: 0.55, fb: 0.46, drive: 'rear', travel: 0.10, sag: 0.05, grip: 1.2, brake: 1.0, steer0: 0.6, steerV: 8, lean: 0.7, leanK: 150, leanD: 17 },
    bike: { bike: true, mass: 330, hp: 135, redline: 9000, idle: 1300, gears: [2.8, 1.95, 1.5, 1.2, 1.0, 0.86], rev: 0, final: 3.0, cdA: 0.62, crr: 0.014, cg: 0.6, fb: 0.5, drive: 'rear', travel: 0.16, sag: 0.07, grip: 1.35, brake: 1.2, steer0: 0.55, steerV: 8, lean: 0.8, leanK: 170, leanD: 19 }
  };
  /* tipos de moto (o modelo tem nome/ID de moto de rua, esportiva, trilha...); o handling do SA, quando existe, ajusta potência, máxima e aderência */
  const BIKE_TYPES = {
    scooter: { base: 'scooter', mass: 125, hp: 10, vmax: 95, grip: 1.15, lean: 0.62 },
    street: { base: 'bike', mass: 165, hp: 26, vmax: 135, grip: 1.2, lean: 0.7, final: 3.7 },
    sport: { base: 'bike', mass: 200, hp: 125, vmax: 250, grip: 1.35, lean: 0.85 },
    dirt: { base: 'bike', mass: 130, hp: 45, vmax: 150, grip: 1.15, lean: 0.75, offroad: 1, travel: 0.24, final: 3.6 },
    custom: { base: 'bike', mass: 290, hp: 75, vmax: 180, grip: 1.2, lean: 0.6, steer0: 0.48, leanK: 140 },
    police: { base: 'bike', mass: 230, hp: 95, vmax: 210, grip: 1.3, lean: 0.8 }
  };
  const bikeType = (id, svc) => /faggio|pizzaboy|scooter|biz/.test(id) ? 'scooter' : /cop|pm_sp|pmerj|rocam/.test(id) || svc === 'policia' ? 'police' : /sanchez|trilha|xre|xt6|cross|dirt/.test(id) ? 'dirt' : /freeway|custom|wayfarer|chopper/.test(id) ? 'custom' : /bf400|cg1|fan|street|titan/.test(id) ? 'street' : 'sport';
  function deriveBike(id, pc, man) {
    const t = BIKE_TYPES[(man && man.bikeType) || bikeType(id, pc.service)], H = pc.sa, cfg = Object.assign({}, BIKES[t.base], t);
    if (H) { cfg.hp = t.hp * clamp((H.accel || 50) / 50, 0.75, 1.3); cfg.vmax = clamp((H.vmax || 200) * 0.95, t.vmax * 0.7, t.vmax * 1.15); cfg.grip = t.grip * clamp(1 + ((H.traction || 1.6) - 1.6) * 0.25, 0.9, 1.1); }
    cfg.vmax = cfg.vmax / 3.6; cfg.category = t === BIKE_TYPES.scooter ? 'scooter' : 'bike'; cfg.bikeType = Object.keys(BIKE_TYPES).find(k => BIKE_TYPES[k] === t);
    cfg.torque = cfg.hp * 745.7 / (0.707 * cfg.redline * 0.85 * 2 * Math.PI / 60); cfg.eff = 0.88; return cfg;
  }
  const CATEGORY = Object.assign({}, TYPES, BIKES), PRESETS = CATEGORY;

  /* tipo pelo tamanho, quando não há nada melhor */
  function guessType(c, d) {
    const len = c.len || 4.4, h = d && d.height || 1.5;
    if (c.kind === 'bus' || len > 10) return 'bus';
    if (len > 7.2) return 'truck';
    if (len > 5.9 || h > 2.25) return 'van';
    if (h > 1.75) return 'suv';
    return len < 4.25 ? 'compact' : 'sedan';
  }
  /* handling do SA (+ informações do modelo) -> parâmetros da física */
  function deriveCar(H, info) {
    const mass = clamp(H.mass || 1400, 400, 30000), heavy = smooth(2000, 7000, mass), flags = parseInt(H.hflags || '0', 16) || 0;
    const com = H.com || [0, 0, 0], height = Math.min(info.height || 1.5, ({ compact: 1.6, sedan: 1.5, suv: 1.95, van: 2.6 })[info.type] || (mass < 2500 ? 1.75 : 3.4)),   // altura do modelo inclui giroflex/rack: corta
      drive = H.drive === 'F' ? 'front' : H.drive === '4' ? 'all' : 'rear';
    const svc = info.service, police = svc === 'policia' || svc === 'caveirao' || svc === 'pf' || svc === 'choque';
    const k = {};
    k.mass = mass;
    k.iy = clamp((H.turnMass || mass * 2.3) * 0.72, mass * 0.9, mass * 4.2);              // inércia de giro (turnMass do SA ≈ momento de inércia)
    k.cg = clamp(0.3 * height + 0.1 + com[2] * 0.45, 0.3, 1.45);                          // altura do centro de massa
    k.fb = clamp(0.5 + com[1] * 0.22 + (drive === 'front' ? 0.08 : drive === 'all' ? 0.03 : -0.01), 0.38, 0.64);
    let mu = clamp(0.98 + ((H.traction || 0.75) - 0.6) * 1.45, 0.9, 1.5);                 // aderência: 0,65→1,05  0,75→1,2  0,85→1,34
    if (police) mu += 0.05;
    mu *= lerp(1, 0.8, heavy);                                                              // pesados seguram menos
    const bias = clamp(H.tractionBias || 0.5, 0.38, 0.62);
    k.muF = mu * (1 + (bias - 0.5) * 0.9); k.muR = mu * (1 - (bias - 0.5) * 0.9) * 1.03;   // pouca folga atrás: estável, mas solta no freio de mão
    k.slide = clamp(0.3 + (H.tractionLoss || 0.85) * 0.65, 0.66, 0.93);                    // quanto o pneu segura já deslizando (alto = sem sabão)
    k.peak = 0.09 + heavy * 0.035;                                                          // ângulo de deriva do pico (rad)
    if (flags & 0x300000) k.offroad = 1;                                                    // OFFROAD_ABILITY: perde menos na terra
    if (flags & 0x4000 || flags & 0x8000) k.muR *= 1.05;                                    // rodas traseiras largas
    k.drive = drive; k.awdF = 0.42;
    k.vmax = clamp((H.vmax || 160) * 0.8 / 3.6, 18, 62) * (police ? 1.06 : 1);            // m/s (o SA "exagera": 200 → ~160 km/h)
    k.fmax = mass * clamp(H.accel || 18, 4, 40) * 0.37 * (police ? 1.12 : 1);             // força máxima na roda (arranque)
    k.cdA = clamp((H.drag || 2.2) * 0.32, 0.5, 9);
    k.crr = 0.012 + heavy * 0.004;
    const resist = v => 0.6 * k.cdA * v * v + k.crr * mass * G;
    k.power = Math.max(resist(k.vmax) * k.vmax * 1.06, k.fmax * 7);                       // potência (W): chega na máxima, nem mais nem menos
    k.brakeA = clamp((H.brake || 8) * 1.12, 4.2, 12.5);                                     // desaceleração do freio (m/s²)
    k.brakeF = clamp(H.brakeBias || 0.55, 0.4, 0.7);
    k.steerLock = clamp(H.steer || 32, 22, 45) * Math.PI / 180;
    k.steerRate = lerp(3.4, 1.9, heavy);                                                    // rad/s do volante (teclado)
    k.stab = clamp(0.6 + ((H.tractionLoss || 0.85) - 0.84) * 1.6 + heavy * 0.25 + (police ? 0.08 : 0) - (drive === 'rear' && k.fmax / mass > 8 ? 0.12 : 0), 0.22, 0.96);
    k.tc = drive === 'front' ? 0.85 : drive === 'all' ? 0.75 : clamp(0.95 - (k.fmax / (mass * G * k.muR * (1 - k.fb))) * 0.5, 0.35, 0.9);
    k.hbGrip = flags & 0x10 ? 0.85 : 0.4;                                                   // NO_HANDBRAKE: freio de mão fraco
    k.sag = clamp(0.12 / (H.susForce || 1.2), 0.05, 0.16);
    k.travel = clamp(((H.susUpper || 0.28) - (H.susLower || -0.18)) * 0.5, 0.12, 0.3);
    k.zeta = clamp((H.susDamp || 0.12) * 5.5, 0.4, 1.0);
    k.maxRoll = lerp(0.13, 0.07, heavy); k.maxPitch = lerp(0.09, 0.05, heavy);
    k.gearN = clamp(H.gears || 5, 3, 7); k.redline = H.engine === 'D' ? (heavy > 0.5 ? 2600 : 4300) : 6600; k.idle = heavy > 0.5 ? 600 : 850;
    k.revMax = lerp(10, 6, heavy);                                                          // ré (m/s)
    return k;
  }
  /* ---------- MODO GTA IV ----------
     O comportamento dos carros do GTA IV vem do handling.dat (lido da cópia local do jogo por engine/tools/gta4-handling.js).
     Cada carro NOSSO continua com a própria identidade (massa, potência, máxima, aderência do handling dele) e pega do carro
     equivalente do GTA IV o "jeito": curva do pneu (pico em 12-20° de deriva e quanto segura deslizando), mola de tração
     (o pneu deforma antes de escorregar), suspensão mole e pouco amortecida (rolagem e mergulho grandes), divisão de freio,
     força do freio de mão, multiplicadores de dano — e sem as assistências de estabilidade do modo NEON. */
  let IV = null, MODE = 'gta4';
  const IV_CLASS = {                                     // classe -> carros de referência do GTA IV (o primeiro que existir na tabela)
    super: ['infernus', 'turismo', 'supergt', 'coquette'], sport: ['banshee', 'comet', 'feltzer', 'sultanrs'], sport4: ['sultan', 'sultanrs', 'comet'],
    muscle: ['dukes', 'sabregt', 'vigero', 'stallion'], compactF: ['blista', 'dilett', 'chavos'], compactR: ['futo', 'blista'],
    sedan: ['admiral', 'primo', 'pmp600', 'merit', 'oracle'], police: ['police', 'police2'], taxi: ['taxi', 'cabby'], suv: ['cavcade', 'habanero', 'huntley', 'patriot'],
    pickup: ['bobcat', 'rancher', 'yankee'], van: ['burrito', 'speedo', 'pony', 'minivan'], truck: ['benson', 'mule', 'flatbed'], bus: ['bus'], heavy: ['patriot', 'stockade']
  };
  /* valores típicos por classe (próprios, para quando a tabela do jogo não estiver no PC) */
  const IV_GENERIC = {
    super: { tracMax: 1.45, tracMin: 1.15, tracLat: 14, tracSpring: 0.12, tracBias: 0.47, susForce: 2.0, susComp: 1.4, susRebound: 1.6, susUpper: 0.1, susLower: -0.12, susBias: 0.5, brakeBias: 0.68, handbrake: 0.7, dmgDeform: 0.8, dmgCollision: 1 },
    sport: { tracMax: 1.45, tracMin: 1.15, tracLat: 13, tracSpring: 0.13, tracBias: 0.47, susForce: 2.0, susComp: 1.4, susRebound: 1.5, susUpper: 0.11, susLower: -0.13, susBias: 0.5, brakeBias: 0.66, handbrake: 0.8, dmgDeform: 0.7, dmgCollision: 1 },
    muscle: { tracMax: 1.2, tracMin: 0.95, tracLat: 18, tracSpring: 0.15, tracBias: 0.47, susForce: 1.15, susComp: 0.8, susRebound: 0.8, susUpper: 0.14, susLower: -0.22, susBias: 0.52, brakeBias: 0.65, handbrake: 0.7, dmgDeform: 0.8, dmgCollision: 1 },
    sedan: { tracMax: 1.2, tracMin: 0.95, tracLat: 14, tracSpring: 0.14, tracBias: 0.47, susForce: 1.5, susComp: 0.9, susRebound: 0.9, susUpper: 0.15, susLower: -0.17, susBias: 0.5, brakeBias: 0.65, handbrake: 0.7, dmgDeform: 0.8, dmgCollision: 1 },
    suv: { tracMax: 1.15, tracMin: 0.9, tracLat: 15, tracSpring: 0.16, tracBias: 0.48, susForce: 1.3, susComp: 0.9, susRebound: 0.9, susUpper: 0.2, susLower: -0.2, susBias: 0.5, brakeBias: 0.65, handbrake: 0.6, dmgDeform: 0.8, dmgCollision: 1 },
    van: { tracMax: 1.1, tracMin: 0.88, tracLat: 13.5, tracSpring: 0.15, tracBias: 0.49, susForce: 1.2, susComp: 1.0, susRebound: 0.8, susUpper: 0.1, susLower: -0.21, susBias: 0.5, brakeBias: 0.64, handbrake: 0.4, dmgDeform: 0.8, dmgCollision: 1 },
    truck: { tracMax: 0.88, tracMin: 0.72, tracLat: 14.5, tracSpring: 0.15, tracBias: 0.47, susForce: 1.0, susComp: 1.2, susRebound: 0.9, susUpper: 0.12, susLower: -0.25, susBias: 0.5, brakeBias: 0.58, handbrake: 0.2, dmgDeform: 0.8, dmgCollision: 1 }
  };
  const IV_GEN_OF = { super: 'super', sport: 'sport', sport4: 'sport', muscle: 'muscle', compactF: 'sedan', compactR: 'sedan', sedan: 'sedan', police: 'sedan', taxi: 'sedan', suv: 'suv', pickup: 'suv', van: 'van', truck: 'truck', bus: 'truck', heavy: 'suv' };
  function setGTA4(table) { IV = table && (table.vehicles || table); }
  function setMode(m) { MODE = m === 'neon' ? 'neon' : 'gta4'; }
  /* classe de GTA IV de um carro nosso (pelo tipo, peso, potência e tração) */
  function ivClass(k, info) {
    const t = info.type, h = info.height || 1.5, len = info.len || 4.4, kmh = k.vmax * 3.6, acc = k.fmax / k.mass;
    if (t === 'bus' || len > 10) return 'bus'; if (t === 'truck' || len > 7.2 || k.mass > 3500) return 'truck';
    if (info.police) return k.mass > 1700 || t === 'suv' ? 'suv' : 'police';           // viaturas: a altura do modelo inclui giroflex/rack, não serve
    if (t === 'van' || (h > 2.25 && len > 4.8 && k.mass > 1800)) return 'van';
    if (t === 'suv' || (h > 1.72 && k.mass > 1600)) return k.mass > 2600 ? 'heavy' : 'suv';
    if (kmh >= 192 && acc > 8) return 'super'; if (kmh >= 165 && acc > 8.5) return k.drive === 'all' ? 'sport4' : 'sport';
    if (k.drive !== 'front' && k.mass > 1450 && acc > 4.5) return 'muscle';
    if (t === 'compact' || k.mass < 1150) return k.drive === 'rear' ? 'compactR' : 'compactF';
    return 'sedan';
  }
  function ivRef(cls) {
    if (IV) for (const n of IV_CLASS[cls] || []) if (IV[n] && !IV[n].bike) return Object.assign({ name: n.toUpperCase() }, IV[n]);
    return Object.assign({ name: 'padrão ' + cls, generic: true }, IV_GENERIC[IV_GEN_OF[cls] || 'sedan']);
  }
  function applyIV(k, info) {
    const cls = ivClass(k, info), R = ivRef(cls), DEG = Math.PI / 180;
    k.iv = R.name; k.ivClass = cls;
    k.peak = clamp(R.tracLat, 8, 22) * DEG * 0.8;                                     // pico da curva lateral (o IV usa ângulos grandes: o carro "deita" e escorrega aos poucos)
    k.slide = clamp(R.tracMin / R.tracMax, 0.62, 0.92);                              // quanto segura deslizando
    const mu = (k.muF + k.muR) / 2 * clamp(R.tracMax / 1.25, 0.85, 1.15), b = clamp(R.tracBias, 0.4, 0.6);
    k.muF = mu * (1 + (b - 0.5) * 1.6); k.muR = mu * (1 - (b - 0.5) * 1.6);         // tracBias < 0,5: mais aderência atrás (estável)
    k.relax = clamp(R.tracSpring * 4, 0.3, 0.8);                                     // mola de tração: o pneu deforma ~0,4-0,7 m de rolagem antes da força chegar
    const f = 0.85 + 0.32 * clamp(R.susForce, 0.6, 3);                               // suspensão: força -> frequência (Hz) -> afundamento estático
    k.sag = clamp(G / Math.pow(2 * Math.PI * f, 2), 0.06, 0.2);
    k.travel = clamp((R.susUpper - R.susLower) * 0.5 + 0.05, 0.1, 0.3);
    k.zetaC = clamp(0.16 + 0.16 * R.susComp, 0.22, 0.6); k.zetaR = clamp(0.16 + 0.17 * R.susRebound, 0.22, 0.65); k.zeta = (k.zetaC + k.zetaR) / 2;
    k.susBias = clamp(R.susBias, 0.35, 0.65);
    k.cg = clamp(k.cg + clamp(R.comZ || -0.15, -0.3, 0.1) * 0.6, 0.28, 1.4);           // o IV abaixa o centro de massa (comZ negativo): rola muito, mas quase não capota
    k.rollDamp = 1.5; k.pitchDamp = 1.1; k.transfer = 0.9; k.rollStop = 0.15;         // carroceria solta (rola e mergulha), com batente de suspensão
    k.brakeF = clamp(R.brakeBias, 0.45, 0.75);
    k.hbGrip = clamp(0.62 - 0.32 * R.handbrake, 0.25, 0.6); k.hbForce = clamp(R.handbrake, 0.15, 1);
    k.stab *= 0.6; k.counter = 0.3;                                                   // o IV não tem controle de estabilidade (fica uma ajuda leve, para teclado)
    k.deform = R.dmgDeform; k.crash = R.dmgCollision;
    return k;
  }
  /* troca o modo de um carro que já existe (mantém posição e velocidade) */
  function reconfig(c) { const p = c.physics; if (!p || p.bike) return; const fresh = configFor(c); p.cfg = fresh; const n = p.wheels.filter(w => w.front).length || 1, r = Math.max(1, p.wheels.length - n), bF = fresh.susBias ? 2 * fresh.susBias : 1, bR = fresh.susBias ? 2 * (1 - fresh.susBias) : 1;
    fresh.spring = [fresh.mass * G * fresh.fb / (n * fresh.sag) * bF, fresh.mass * G * (1 - fresh.fb) / (r * fresh.sag) * bR]; }
  function configFor(c, options) {
    const pc = c.physicsCfg || {}, man = MODEL[c.modelId || ''];
    const bikeCat = (man && man.cat) || (pc.cat === 'bike' || pc.cat === 'scooter' ? pc.cat : null) || (c.kind === 'bike' ? 'bike' : null);
    if (bikeCat) return Object.assign(deriveBike(c.modelId || '', pc, man), options || {});   // moto: perfil pelo tipo + handling
    const d = c.dims || {}, type = (man && man.type) || (pc.sa ? null : (pc.cat && TYPES[pc.cat] && pc.cat !== 'compact' ? pc.cat : guessType(c, d)));
    const H = Object.assign({}, TYPES[type] || TYPES.sedan, pc.sa || {}, man || {});
    if (!pc.sa && !man && pc.mass && type !== 'bus' && type !== 'truck') H.mass = Math.max(pc.mass, TYPES[type].mass * 0.8);
    const cfg = Object.assign(deriveCar(H, { height: d.height || (c.len > 9 ? 3 : 1.5), service: (man && man.service) || pc.service || c.service, type }), options || {});
    cfg.category = type || 'sa'; cfg.cat = cfg.category;
    if (MODE === 'gta4') { const svc = (man && man.service) || pc.service || c.service; applyIV(cfg, { type, len: c.len, height: d.height, police: svc === 'policia' || svc === 'pf' || svc === 'caveirao' || svc === 'choque' }); }
    cfg.mode = MODE;
    // compatibilidade com quem lê cfg.grip/brake/travel/sag (dano, câmera, colisões)
    cfg.grip = (cfg.muF + cfg.muR) / 2; cfg.brake = cfg.brakeA / G;
    return cfg;
  }
  const torqueCurve = x => -0.8 * x * x + 1.1 * x + 0.35;          // (moto) fração do torque nominal em função de rpm/redline

  function rotate(p, h, pitch, roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), ch = Math.cos(h), sh = Math.sin(h);
    const x = cr * p.x - sr * p.y, y = sr * p.x + cr * p.y, z = sp * y + cp * p.z;
    return { x: ch * x + sh * z, y: cp * y - sp * p.z, z: -sh * x + ch * z };
  }
  function point(c, w) { const p = c.physics, r = rotate({ x: w.x, y: w.y - p.cfg.cg, z: w.z - p.centerZ }, c.h, p.pitch, p.roll); return { x: c.x + r.x, y: p.y + r.y, z: c.z + r.z }; }

  function create(c, wheels, options, sample) {
    const cfg = configFor(c, options), bike = !!cfg.bike;
    const front = wheels.filter(w => w.front), rear = wheels.filter(w => !w.front), mean = (a, k) => a.reduce((s, w) => s + w[k], 0) / Math.max(1, a.length);
    const fz = mean(front, 'z'), rz = mean(rear, 'z'), wb = Math.max(1, fz - rz), track = bike ? 0.4 : Math.max(1, ...wheels.map(w => Math.abs(w.x) * 2));
    const centerZ = rz + wb * cfg.fb;                               // o centro de massa fica onde o peso por eixo bate com "fb"
    const m = cfg.mass;
    { const cap = (track / (2 * cfg.cg)) * 0.92, top = Math.max(cfg.muF, cfg.muR); if (!bike && top > cap) { cfg.muF *= cap / top; cfg.muR *= cap / top; } }   // alto e estreito: aderência limitada pelo tombamento
    const bF = cfg.susBias ? 2 * cfg.susBias : 1, bR = cfg.susBias ? 2 * (1 - cfg.susBias) : 1;
    cfg.spring = [m * G * cfg.fb / (Math.max(1, front.length) * cfg.sag) * bF, m * G * (1 - cfg.fb) / (Math.max(1, rear.length) * cfg.sag) * bR];   // [dianteira, traseira] por roda
    const p = c.physics = {
      cfg, bike, centerZ, wheelbase: wb, track, a: fz - centerZ, b: centerZ - rz,
      wheels: wheels.map(w => ({ ...w, contact: false, compression: 0, offset: 0, spin: 0, load: 0, slipSpin: 0 })),
      y: sample(c.x, c.z).height + cfg.cg, vy: 0, vx: Math.sin(c.h) * c.speed, vz: Math.cos(c.h) * c.speed,
      pitch: 0, roll: 0, pitchV: 0, rollV: 0, yawV: 0, grounded: 0, gear: 1, rpm: cfg.idle || 800, surface: 'asfalto', slip: 0, impact: 0, beta: 0,
      ix: m * (wb * wb + 1) / 12, iz: m * (track * track + 1) / 12, iy: bike ? m * (wb * wb + track * track) / 12 : cfg.iy,
      lastX: c.x, lastZ: c.z, lastSpeed: c.speed, airTime: 0, shiftT: 0, cutT: 0, accel: 0, throttle: 0, lean: 0, hbT: 0, wheelspin: 0
    };
    const ground = wheels.map(w => { const r = rotate({ x: w.x, y: 0, z: w.z - centerZ }, c.h, 0, 0); return { ...w, g: sample(c.x + r.x, c.z + r.z).height }; });
    p.pitch = -Math.atan2(mean(ground.filter(w => w.front), 'g') - mean(ground.filter(w => !w.front), 'g'), wb);
    p.roll = bike ? 0 : Math.atan2(mean(ground.filter(w => w.x > 0), 'g') - mean(ground.filter(w => w.x < 0), 'g'), track);
    p.y = mean(ground, 'g') + cfg.cg * Math.cos(p.pitch) * Math.cos(p.roll);
    c.y = p.y - cfg.cg;
    return p;
  }
  function syncSpeed(c) { const p = c.physics; c.speed = p.vx * Math.sin(c.h) + p.vz * Math.cos(c.h); p.lastSpeed = c.speed; }

  /* ---------- motor do carro: potência constante + câmbio automático (giro/som e pausa curta na troca) ---------- */
  function engineCar(p, k, input, forward, dt) {
    const thr = clamp(input.throttle || 0, -1, 1), v = Math.abs(forward), N = k.gearN;
    if (thr < 0 && forward < 1.0) p.gear = -1; else if (p.gear < 0 && (thr > 0 || (thr === 0 && v < 0.5))) p.gear = 1;
    p.shiftT = Math.max(0, p.shiftT - dt); p.cutT = Math.max(0, p.cutT - dt);
    const vTop = i => k.vmax * 1.04 * Math.pow(i / N, 0.78);                     // velocidade no corte de cada marcha
    if (p.gear > 0 && p.shiftT <= 0) {
      const up = Math.abs(thr) > 0.5 ? 0.97 : 0.72;
      if (p.gear < N && v > vTop(p.gear) * up) { p.gear++; p.shiftT = 0.3; p.cutT = 0.12; }
      else if (p.gear > 1 && v < vTop(p.gear - 1) * 0.55) { p.gear--; p.shiftT = 0.3; }
    }
    const span = p.gear > 0 ? vTop(p.gear) : k.revMax, rpmT = Math.max(k.idle * (thr ? 1.3 : 1), (v / span) * k.redline, (p.gear === 1 && thr > 0) ? k.redline * 0.45 * thr : 0);
    p.rpm += (Math.min(rpmT, k.redline * 1.02) - p.rpm) * (1 - Math.exp(-dt * 12));
    let F = 0;
    if (thr > 0 && p.gear > 0) {
      F = thr * Math.min(k.fmax, k.power / Math.max(v, 0.5));
      if (v > k.vmax) F *= Math.max(0, 1 - (v - k.vmax) / 2);
      if (input.maxSpeed && v > input.maxSpeed) F *= Math.max(0, 1 - (v - input.maxSpeed) / 2);
      if (p.cutT > 0) F *= 0.25;
    } else if (thr < 0 && p.gear < 0) {
      F = thr * k.fmax * 0.6 * (v > k.revMax ? Math.max(0, 1 - (v - k.revMax) / 2) : 1);
    } else if (v > 0.4) F = -Math.sign(forward) * k.mass * (0.55 + 0.012 * v);   // freio-motor ao soltar
    p.throttle = Math.abs(thr);
    return F;
  }
  /* ---------- moto: motor com curva de torque e caixa (modelo antigo) ---------- */
  function drivetrain(p, k, input, forward, dt, wheelR) {
    const thr = clamp(input.throttle || 0, -1, 1), v = Math.abs(forward);
    const wantReverse = thr < 0 && k.rev > 0;
    if (wantReverse && forward < 1.2) p.gear = -1;
    else if (p.gear < 0 && thr > 0) p.gear = 1;
    else if (p.gear < 0 && !wantReverse && v < 0.5) p.gear = 1;
    const wheelRpm = v / wheelR * 60 / (2 * Math.PI), N = k.gears.length;
    p.shiftT = Math.max(0, p.shiftT - dt); p.cutT = Math.max(0, p.cutT - dt);
    if (p.gear > 0 && p.shiftT <= 0) {
      const rpmNow = wheelRpm * k.gears[p.gear - 1] * k.final, hold = Math.abs(thr) > 0.75 ? 0.93 : 0.8;
      if (rpmNow > k.redline * hold && p.gear < N) { p.gear++; p.shiftT = 0.35; p.cutT = 0.16; }
      else if (p.gear > 1 && wheelRpm * k.gears[p.gear - 2] * k.final < k.redline * 0.78 && rpmNow < k.redline * 0.36) { p.gear--; p.shiftT = 0.35; }
    }
    const ratio = (p.gear < 0 ? k.rev : k.gears[p.gear - 1]) * k.final, rpmWheel = wheelRpm * ratio;
    const launch = (p.gear === 1 || p.gear < 0) ? k.redline * 0.4 * Math.min(1, Math.abs(thr) * 1.2) : 0;
    const rpm = Math.max(k.idle * 1.15, rpmWheel, launch);
    p.rpm += (Math.min(rpm, k.redline * 1.02) - p.rpm) * (1 - Math.exp(-dt * 14));
    let Tn = torqueCurve(clamp(rpm / k.redline, 0.1, 1.15));
    if (rpm > k.redline) Tn *= Math.max(0, 1 - (rpm - k.redline) / 350);
    const sgn = p.gear < 0 ? -1 : 1, active = (thr > 0 && p.gear > 0) || (thr < 0 && p.gear < 0);
    let F = 0;
    if (active && !(p.cutT > 0)) {
      F = sgn * Math.abs(thr) * k.torque * Tn * ratio * k.eff / wheelR;
      const maxV = Math.min(input.maxSpeed || 99, k.vmax || 99);
      if (v > maxV) F *= Math.max(0, 1 - (v - maxV) / 2.5);
    }
    if (!active && Math.abs(thr) < 0.05 && p.gear > 0 && v > 0.5) F -= Math.sign(forward) * 0.045 * k.mass * G * smooth(0.5, 6, v) * (ratio / 12);
    p.throttle = Math.abs(thr);
    return F;
  }

  /* curva do pneu: sobe até 1 no pico (x = |deriva|/pico = 1) e cai suavemente até "slide" */
  const tire = (x, slide) => x <= 1 ? x * (2 - x) : 1 - (1 - slide) * smooth(1, 3.2, x);

  /* ---------- carro / ônibus ---------- */
  function stepCar(c, input, dt, sample) {
    const p = c.physics, k = p.cfg, m = k.mass, n = p.wheels.length, dmg = c.dmg;
    const sh = Math.sin(c.h), ch = Math.cos(c.h), forward = p.vx * sh + p.vz * ch, side = p.vx * ch - p.vz * sh, v = Math.abs(forward), speed = Math.hypot(p.vx, p.vz);
    const hand = !!input.handbrake; p.hbT = hand ? 0.7 : Math.max(0, p.hbT - dt);
    const beta = speed > 2 ? Math.atan2(side, Math.max(Math.abs(forward), 2)) * Math.sign(forward || 1) : 0; p.beta = beta;
    const surfMu = (g) => (g.grip === undefined ? 1 : k.offroad ? 1 - (1 - g.grip) * 0.45 : g.grip);

    /* direção: esterço máximo = o que leva o pneu dianteiro ao pico de aderência nesta velocidade (vira tudo o que dá, sem arrastar) */
    const aMax = Math.min(k.muF, k.muR) * G * 0.95, L = p.wheelbase;
    let steerMax = Math.min(k.steerLock, L * aMax / Math.max(v * v, 1) + k.peak * 1.35);
    if (dmg) steerMax *= 1 - 0.3 * dmg.total;
    const pull = dmg ? clamp((dmg.right - dmg.left) * 0.05, -0.06, 0.06) * smooth(2, 10, v) : 0;
    // contra-esterço automático (estabilidade): as rodas apontam para onde o carro está indo quando ele escorrega
    const counter = p.hbT > 0 ? 0 : clamp(beta * k.stab * 0.85 * (k.counter === undefined ? 1 : k.counter * 3), -0.35, 0.35) * smooth(3, 8, v) * (forward >= 0 ? 1 : 0);
    const target = clamp((input.steer || 0) * steerMax + counter + pull, -k.steerLock, k.steerLock);
    const rate = (Math.abs(target) > Math.abs(c.steer) && Math.sign(target) === Math.sign(c.steer || target) ? k.steerRate : k.steerRate * 1.7) * (1 - 0.35 * smooth(10, 40, v));
    c.steer += clamp(target - c.steer, -rate * dt, rate * dt);

    const drivenSet = w => k.drive === 'all' || (k.drive === 'front' ? w.front : !w.front);
    const frontN = p.wheels.filter(w => w.front).length || 1, rearN = Math.max(1, n - frontN);
    let Fdrive = engineCar(p, k, input, forward, dt);
    if (dmg) Fdrive *= 1 - 0.6 * Math.min(1, dmg.front + 0.3 * dmg.total);
    const brakeIn = clamp(input.brake || 0, 0, 1);

    /* 1) suspensão: carga em cada roda */
    let fy = -m * G, torqueP = 0, torqueR = 0, fx = 0, fz = 0, ty = 0, contacts = 0, totalLoad = 0, maxImpact = 0, slipMax = 0, spinMax = 0;
    for (const w of p.wheels) {
      const mount = point(c, { x: w.x, y: w.y + k.travel, z: w.z }), ground = sample(mount.x, mount.z);
      w.g = ground; w.mx = mount.x; w.mz = mount.z;
      const wr = w.lost ? 0.14 : w.r, length = mount.y - ground.height - wr, compression = k.travel + k.sag - length;
      const rate2 = w.lastLength === undefined ? 0 : (length - w.lastLength) / dt; w.lastLength = length;
      const kSpring = k.spring[w.front ? 0 : 1], mCorner = m * (w.front ? k.fb / frontN : (1 - k.fb) / rearN), damper = 2 * Math.sqrt(kSpring * mCorner) * (k.zetaC ? (rate2 < 0 ? k.zetaC : k.zetaR) : k.zeta);
      w.contact = compression > 0 && length > -1.2; w.load = 0; w.mCorner = mCorner;
      w.compression = clamp(compression / (2 * k.travel + k.sag), 0, 1);
      w.offset = w.contact ? clamp(compression - k.sag, -k.sag, k.travel) : -k.sag;
      if (!w.contact) continue;
      contacts++; p.surface = ground.name || 'terra';
      const load = clamp(kSpring * compression - damper * clamp(rate2, -8, 8), 0, m * G * 1.5);
      w.load = load; totalLoad += load; fy += load; maxImpact = Math.max(maxImpact, -rate2);
      const local = rotate({ x: w.x, y: w.y - k.cg, z: w.z - p.centerZ }, 0, p.pitch, p.roll);
      torqueP -= local.z * load; torqueR += local.x * load;
      const gx = ground.gx || 0, gz = ground.gz || 0, slopeDen = 1 + gx * gx + gz * gz;     // o peso puxa ladeira abaixo
      fx -= load * gx / slopeDen; fz -= load * gz / slopeDen;
    }
    /* divisão da força do motor entre as rodas motrizes (pela carga, como um diferencial autoblocante simples) */
    const driven = p.wheels.filter(w => w.contact && !w.lost && drivenSet(w));
    let dLoad = 0; for (const w of driven) dLoad += k.drive === 'all' ? (w.front ? k.awdF : 1 - k.awdF) * w.load : w.load;

    /* 2) pneus */
    let wheelspin = 0;
    for (const w of p.wheels) {
      if (!w.contact) { w.slipSpin *= Math.exp(-dt * 3); w.spin += (forward / w.r + w.slipSpin) * dt; continue; }
      const load = w.load, ground = w.g;
      const steer = w.front ? c.steer : 0, ang = c.h + steer, s = Math.sin(ang), co = Math.cos(ang);
      const rx = w.mx - c.x, rz = w.mz - c.z, wvx = p.vx + p.yawV * rz, wvz = p.vz - p.yawV * rx;
      const lon = wvx * s + wvz * co, lat = wvx * co - wvz * s, alon = Math.abs(lon);
      const mu = (w.front ? k.muF : k.muR) * surfMu(ground) * (w.lost ? 0.5 : 1), limit = Math.max(1, load * mu);
      const rearLocked = hand && !w.front;

      /* longitudinal: motor, freio (ABS), freio de mão, rolamento */
      let lonF = 0, spinning = false;
      if (drivenSet(w) && !w.lost && dLoad > 0) {
        const share = (k.drive === 'all' ? (w.front ? k.awdF : 1 - k.awdF) : 1) * load / dLoad;
        let want = Fdrive * share;
        if (Fdrive > 0 && want > limit) {                                              // patinou
          const allow = limit * (1 + (1 - k.tc) * 0.5);                               // controle de tração corta o excesso
          spinning = want > allow * 0.98 || k.tc < 0.5; want = Math.min(want, allow);
        }
        if (!rearLocked) lonF += want;
      }
      const brakeShare = w.front ? k.brakeF / frontN : (1 - k.brakeF) / rearN;
      let brakeF = brakeIn * k.brakeA * m * brakeShare;
      if (input.park) brakeF += 12 * m / n;
      brakeF = Math.min(brakeF, limit * 0.97);                                         // ABS: freia no limite sem travar
      const stopF = alon * w.mCorner / dt;                                             // nunca inverte o sentido só freando
      lonF -= Math.sign(lon) * Math.min(brakeF, stopF);
      lonF -= Math.sign(lon) * Math.min((k.crr + (ground.rolling || 0) * 0.04) * load, stopF);
      if (w.lost) lonF -= Math.sign(lon) * Math.min(0.5 * load, stopF);
      if (rearLocked) lonF = -Math.sign(lon) * Math.min(limit * 0.75 * k.slide * (k.hbForce === undefined ? 1 : 0.55 + 0.45 * k.hbForce), stopF + 1);
      lonF = clamp(lonF, -limit * 1.02, limit * 1.02);

      /* lateral: deriva -> curva do pneu; círculo de atrito com o longitudinal; em baixa velocidade amortece o escorregão */
      const u = Math.min(1, Math.abs(lonF) / limit);
      let latMax = limit * Math.sqrt(Math.max(0, 1 - u * u * 0.6));         // círculo de atrito "de jogo": acelerando/freando no limite ainda dá para virar
      if (spinning) latMax *= lerp(0.7, 0.9, k.tc);                                    // roda patinando: a traseira sai
      if (rearLocked) latMax *= k.hbGrip;
      let alpha = Math.atan2(lat, Math.max(alon, 1.5));
      if (k.relax) { w.alpha = w.alpha === undefined ? alpha : w.alpha + (alpha - w.alpha) * Math.min(1, Math.max(speed, 1) * dt / k.relax); alpha = w.alpha; }   // mola de tração do IV: a deriva "chega" ao pneu depois de rolar alguns decímetros
      const x = Math.abs(alpha) / (k.peak * (rearLocked ? 0.6 : 1));
      let latF = -Math.sign(alpha) * latMax * tire(x, k.slide);
      const visc = clamp(-lat * w.mCorner * 14, -latMax, latMax), blend = smooth(0.8, 3.5, speed);
      latF = lerp(visc, latF, blend);

      const wx = s * lonF + co * latF, wz = co * lonF - s * latF;
      fx += wx; fz += wz; ty += rz * wx - rx * wz;
      torqueP += lonF * k.cg * (k.transfer || 0.8); torqueR -= latF * k.cg * (k.transfer || 0.8);                       // mergulho/rolagem (transferência de carga)
      slipMax = Math.max(slipMax, Math.abs(lat)); if (spinning) wheelspin = 1;
      const spinV = spinning ? Math.min(14, 3 + Fdrive / m) : rearLocked ? -alon : 0;
      w.slipSpin += (spinV / w.r - w.slipSpin) * (1 - Math.exp(-dt * 10)); spinMax = Math.max(spinMax, Math.abs(spinV));
      w.spin += (lon / w.r + w.slipSpin) * dt;
    }
    p.wheelspin = wheelspin;
    const drag = 0.6 * k.cdA * speed; fx -= p.vx * drag; fz -= p.vz * drag;
    if (contacts >= 2 && speed < 0.12 && Math.abs(input.throttle || 0) < 0.01 && (input.park || hand || brakeIn > 0.5) && Math.hypot(fx, fz) < totalLoad * k.muR) {
      fx = fz = 0; p.vx = p.vz = 0; p.yawV *= Math.exp(-dt * 15);                      // parado no freio: segura a ladeira
    }
    if (contacts) {
      /* manobra em baixa velocidade: o giro segue o volante (geometria), sem depender de escorregar o pneu */
      const yawKin = forward * Math.tan(c.steer) / L, low = 1 - smooth(2.5, 6.5, speed);
      if (low > 0) ty += (yawKin - p.yawV) * p.iy * 14 * low;
      /* estabilidade: se o carro gira mais do que o volante pede (traseira saindo), corta o excesso — mais forte nos carros "estáveis" */
      if (p.hbT <= 0 && speed > 4) {
        const want = clamp(forward * Math.tan(c.steer) / L, -aMax / speed * 1.1, aMax / speed * 1.1), over = p.yawV - want;
        if (Math.sign(over) === Math.sign(p.yawV) && Math.abs(p.yawV) > Math.abs(want)) ty -= over * p.iy * (2 + 10 * k.stab) * smooth(0.04, 0.2, Math.abs(beta) + Math.abs(over) * 0.15);
      }
      ty -= p.yawV * p.iy * 0.12;                                                       // amortecimento leve (reta firme)
      torqueP -= p.pitchV * p.ix * (k.pitchDamp || 1.8); torqueR -= p.rollV * p.iz * (k.rollDamp || 2.6);
      if (k.rollStop && Math.abs(p.roll) > k.rollStop) torqueR -= (p.roll - Math.sign(p.roll) * k.rollStop) * p.iz * 90 + p.rollV * p.iz * 4;   // batente: a carroceria encosta e para de rolar
    } else { p.airTime += dt; torqueP = -p.pitchV * p.ix * 0.15; torqueR = -p.rollV * p.iz * 0.15; }
    const ax = fx / m, az = fz / m; p.accel = ax * sh + az * ch;
    p.vx += ax * dt; p.vz += az * dt; p.vy += fy / m * dt;
    p.pitchV += torqueP / p.ix * dt; p.rollV += torqueR / p.iz * dt; p.yawV += ty / p.iy * dt;
    p.pitchV = clamp(p.pitchV, -3, 3); p.rollV = clamp(p.rollV, -3, 3); p.yawV = clamp(p.yawV, -4, 4);
    p.pitch = clamp(p.pitch + p.pitchV * dt, -1.25, 1.25); p.roll = clamp(p.roll + p.rollV * dt, -1.25, 1.25);
    c.h += p.yawV * dt; c.x += p.vx * dt; c.z += p.vz * dt; p.y += p.vy * dt;
    let correction = 0;                                                                 // batentes: só corrigem penetração dos pneus
    for (const w of p.wheels) { const q = point(c, w), g = sample(q.x, q.z); correction = Math.max(correction, g.height + w.r - k.travel - q.y); }
    if (correction > 0) { p.y += correction; if (p.vy < 0) { p.impact = Math.max(p.impact, -p.vy); p.vy = 0; } }
    const groundCenter = sample(c.x, c.z).height;
    if (p.y < groundCenter + 0.15) { p.y = groundCenter + 0.15; p.vy = Math.max(0, p.vy); }
    if (contacts && p.grounded === 0 && p.airTime > 0.1) p.impact = Math.max(p.impact, maxImpact);
    if (contacts) p.airTime = 0;
    p.grounded = contacts; p.slip = Math.max(slipMax, spinMax); p.totalLoad = totalLoad;
    syncSpeed(c); c.y = p.y - k.cg;
    p.lastX = c.x; p.lastZ = c.z;
  }

  /* ---------- moto: bicicleta com inclinação ---------- */
  function stepBike(c, input, dt, sample) {
    const p = c.physics, k = p.cfg, m = k.mass, L = p.wheelbase;
    const sh = Math.sin(c.h), ch = Math.cos(c.h);
    let forward = p.vx * sh + p.vz * ch, lat = p.vx * ch - p.vz * sh; const v = Math.abs(forward);
    const fW = p.wheels.find(w => w.front) || p.wheels[0], rW = p.wheels.find(w => !w.front) || p.wheels[1];
    const gF = sample(c.x + sh * (fW.z - p.centerZ), c.z + ch * (fW.z - p.centerZ)), gR = sample(c.x + sh * (rW.z - p.centerZ), c.z + ch * (rW.z - p.centerZ)), gC = sample(c.x, c.z);
    const mu = k.grip * (gC.grip === undefined ? 1 : k.offroad ? 1 - (1 - gC.grip) * 0.4 : gC.grip), contact = p.y - k.cg <= gC.height + 0.12;
    const delta = (input.steer || 0) * k.steer0 / (1 + Math.pow(v / k.steerV, 1.5));
    const leanMax = Math.min(k.lean, Math.atan(mu * 1.1));
    const leanTarget = -clamp(input.steer || 0, -1, 1) * leanMax * smooth(1.0, 5.5, v) / (1 + Math.pow(v / 60, 2));
    p.rollV += ((leanTarget - p.roll) * k.leanK - p.rollV * k.leanD) * dt; p.roll += p.rollV * dt;
    c.steer = delta;
    const b = smooth(2, 5.5, v), yawLean = clamp(1.55 * G * Math.tan(-p.roll), -1.5 * G * Math.min(mu, 1.3), 1.5 * G * Math.min(mu, 1.3)) / Math.max(v, 2) * Math.sign(forward || 1), yawKin = forward * Math.tan(delta) / L;
    const yawTarget = b * yawLean + (1 - b) * yawKin;
    p.yawV += (yawTarget - p.yawV) * (1 - Math.exp(-dt * 16));
    const Fdrive = drivetrain(p, k, input, forward, dt, rW.r);
    const brakeIn = clamp(input.brake || 0, 0, 1);
    const Nrear = Math.max(m * G * 0.25, m * G * (1 - k.fb) + m * Math.max(0, p.accel) * k.cg / L), limitDrive = Nrear * mu;
    let F = clamp(Fdrive, -limitDrive, limitDrive);
    const rearLock = !!input.handbrake;
    let brakeF = brakeIn * k.brake * m * G * 0.95 + (rearLock ? 0.35 * m * G : 0) + (input.park ? 12 * m : 0);
    brakeF = Math.min(brakeF, mu * m * G * 1.05);
    F -= Math.tanh(forward * 4) * Math.min(brakeF, Math.abs(forward) * m / dt);
    F -= Math.tanh(forward * 4) * (k.crr + (gC.rolling || 0) * 0.04) * m * G;
    F -= 0.6 * k.cdA * v * forward;
    F -= m * G * ((gC.gx || 0) * sh + (gC.gz || 0) * ch) / (1 + (gC.gx || 0) ** 2 + (gC.gz || 0) ** 2);
    const a = F / m; p.accel = a; forward += a * dt;
    if (Math.abs(input.throttle || 0) < 0.01 && brakeIn < 0.01 && !input.park && Math.abs(forward) < 0.15 && contact) forward = 0;
    lat *= Math.exp(-dt * (rearLock ? 2.2 : 11) * clamp(mu, 0.3, 1.2));
    p.vx = sh * forward + ch * lat; p.vz = ch * forward - sh * lat;
    c.h += p.yawV * dt; c.x += p.vx * dt; c.z += p.vz * dt;
    const target = (gF.height + gR.height) / 2 + k.cg, pitchGround = -Math.atan2(gF.height - gR.height, L);
    if (p.y > target + 0.03 || !contact && p.vy > 0.5) { p.vy -= G * dt; p.y += p.vy * dt; p.airTime += dt; if (p.y <= target) { p.impact = Math.max(p.impact, -p.vy); p.y = target; p.vy = 0; } }
    else { const ny = p.y + (target - p.y) * (1 - Math.exp(-dt * 30)); p.vy = clamp((ny - p.y) / dt, -3, 12); p.y = ny; p.airTime = 0; }
    p.grounded = p.y - k.cg <= gC.height + 0.2 ? 2 : 0;
    const squat = clamp(p.accel * 0.012, -0.12, 0.1);
    p.pitchV = (pitchGround + squat - p.pitch) * 12; p.pitch += p.pitchV * dt;
    p.slip = Math.abs(lat); p.surface = gC.name || 'terra'; p.totalLoad = m * G;
    for (const w of p.wheels) { w.contact = true; w.offset = 0; w.compression = 0.5; w.spin += (forward / w.r) * dt; }
    if (p.grounded === 0) p.wheels.forEach(w => { w.contact = false; w.offset = -k.sag; });
    syncSpeed(c); c.y = p.y - k.cg; p.lastX = c.x; p.lastZ = c.z;
  }

  function step(c, input, dt, sample) { return c.physics.bike ? stepBike(c, input, dt, sample) : stepCar(c, input, dt, sample); }

  function impulse(c, ix, iz, rx, rz) { const p = c.physics; p.vx += ix / p.cfg.mass; p.vz += iz / p.cfg.mass; p.yawV += (rz * ix - rx * iz) / p.iy; syncSpeed(c); }
  function collide(a, b, nx, nz, penetration, px, pz) {
    const pa = a.physics, pb = b && b.physics, ma = pa.cfg.mass, mb = pb ? pb.cfg.mass : Infinity;
    const ax = px - a.x, az = pz - a.z, bx = b ? px - b.x : 0, bz = b ? pz - b.z : 0;
    const va = { x: pa.vx + pa.yawV * az, z: pa.vz - pa.yawV * ax }, vb = pb ? { x: pb.vx + pb.yawV * bz, z: pb.vz - pb.yawV * bx } : { x: 0, z: 0 };
    const approach = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
    const inv = 1 / ma + 1 / mb, move = Math.max(0, penetration - 0.002) * 0.85 / inv;
    a.x += nx * move / ma; a.z += nz * move / ma; if (pb) { b.x -= nx * move / mb; b.z -= nz * move / mb; }
    if (approach >= 0) return 0;
    const ca = az * nx - ax * nz, cb = bz * nx - bx * nz;
    const j = -(1.08) * approach / (inv + ca * ca / pa.iy + (pb ? cb * cb / pb.iy : 0));
    impulse(a, nx * j, nz * j, ax, az); if (pb) impulse(b, -nx * j, -nz * j, bx, bz);
    const tx = -nz, tz = nx, slide = (va.x - vb.x) * tx + (va.z - vb.z) * tz;
    const jt = clamp(-slide / (inv + (az * tx - ax * tz) ** 2 / pa.iy + (pb ? (bz * tx - bx * tz) ** 2 / pb.iy : 0)), -j * 0.45, j * 0.45);
    impulse(a, tx * jt, tz * jt, ax, az); if (pb) impulse(b, -tx * jt, -tz * jt, bx, bz);
    return -approach;
  }
  const api = { create, step, point, rotate, collide, impulse, syncSpeed, PRESETS, CATEGORY, TYPES, MODEL, configFor, deriveCar, setGTA4, setMode, reconfig, ivClass, get mode() { return MODE; }, get gta4() { return IV; }, STEP: 1 / 120 };
  if (typeof module === 'object' && module.exports) module.exports = api; else scope.CarPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
