/* NEON ENGINE — painéis do editor: biblioteca, cena, propriedades, barra de ferramentas, planta da cidade, importar DFF e gerar .exe. */
'use strict';
const $e = id => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === undefined || v === null || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const fmtNum = v => (Math.round(v * 100) / 100).toString().replace('.', ',');

/* ---------------- miniaturas (um renderizador pequeno só para isso) ---------------- */
const TH = { r: null, scene: null, cam: null, cache: new Map(), queue: [], busy: false };
function thumbInit() {
  if (TH.r) return; const c = document.createElement('canvas'); c.width = 160; c.height = 120;
  TH.r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }); TH.r.outputEncoding = renderer.outputEncoding; TH.r.setClearColor(0x000000, 0);
  TH.scene = new THREE.Scene(); TH.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5f66, 0.95)); const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(3, 5, 4); TH.scene.add(d);
  TH.cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 2000);
}
function thumbOf(key, make) {
  if (TH.cache.has(key)) return Promise.resolve(TH.cache.get(key));
  return new Promise(ok => { TH.queue.push({ key, make, ok }); thumbPump(); });
}
async function thumbPump() {
  if (TH.busy) return; TH.busy = true; thumbInit();
  while (TH.queue.length) {
    const j = TH.queue.shift(); let url = '';
    try {
      const obj = await j.make(); TH.scene.add(obj); obj.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new THREE.Vector3()), r = Math.max(0.3, bb.getSize(new THREE.Vector3()).length() / 2);
      const dist = r / Math.sin(16 * DEG) * 1.02; TH.cam.position.set(c.x + dist * 0.62, c.y + dist * 0.42, c.z + dist * 0.66); TH.cam.lookAt(c); TH.cam.near = dist / 50; TH.cam.far = dist * 4; TH.cam.updateProjectionMatrix();
      TH.r.render(TH.scene, TH.cam); url = TH.r.domElement.toDataURL('image/png'); TH.scene.remove(obj);
    } catch (e) { console.warn('miniatura', j.key, e); }
    TH.cache.set(j.key, url); j.ok(url);
  }
  TH.busy = false;
}

/* ---------------- biblioteca ---------------- */
let libTab = 'prefab';
const KIND_NAME = { car: 'Carros', bike: 'Motos', bus: 'Ônibus e caminhões', object3d: 'Modelos 3D importados (FBX, GLB, OBJ…)', object: 'Objetos do GTA SA (DFF)', prop: 'Armas e acessórios' };
function libItems() {
  const q = $e('edLibSearch').value.trim().toLowerCase(), m = s => !q || s.toLowerCase().includes(q);
  if (libTab === 'prefab') return Object.entries(MAP_PREFABS).filter(([k, v]) => m(v.name + ' ' + v.cat)).map(([k, v]) => ({ key: 'p:' + k, cat: v.cat, name: v.name, tpl: { type: 'prefab', ref: k },
    thumb: () => mapBuildObject({ type: 'prefab', ref: k }) }));
  const kinds = libTab === 'model' ? ['object3d', 'object', 'prop'] : ['car', 'bike', 'bus'];
  return ED.models.filter(x => kinds.includes(x.kind) && m(x.name + ' ' + x.id + ' ' + (x.cat || ''))).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || String(a.cat || '').localeCompare(String(b.cat || '')) || a.name.localeCompare(b.name, 'pt-BR')).map(x => ({ key: 'm:' + x.id, cat: x.cat || KIND_NAME[x.kind] || x.kind, name: x.name, sub: x.id,
    tpl: x.kind === 'object3d' ? { type: 'gltf', ref: x.id } : libTab === 'model' ? { type: 'model', ref: x.id } : { model: x.id },
    thumb: () => x.kind === 'object3d' ? mapLoadGLB(x.id).then(s => s.clone(true)) : loadVehicleType(x.id).then(t => libTab === 'vehicle' || x.kind !== 'object' && x.kind !== 'prop' ? makeVehicleMesh(t, 0x9aa4ae) : new THREE.Mesh(t.geo.body, t.mats)) }));
}
function renderLib() {
  const box = $e('edLib'); box.textContent = '';
  const items = libItems(); let cat = null, grid = null;
  if (!items.length) box.append(el('p', { class: 'ed-empty' }, libTab === 'model' ? 'Nenhum modelo importado ainda. Use "Importar" (FBX, GLB, OBJ, DAE, STL… ou DFF do GTA SA).' : 'Nada encontrado.'));
  const io = new IntersectionObserver(ents => ents.forEach(en => { if (!en.isIntersecting) return; io.unobserve(en.target); const it = en.target.__it;
    thumbOf(it.key, it.thumb).then(u => { if (u) en.target.querySelector('.th').style.backgroundImage = 'url(' + u + ')'; }); }), { root: box });
  for (const it of items) {
    if (it.cat !== cat) { cat = it.cat; box.append(el('h4', {}, cat)); grid = el('div', { class: 'ed-grid' }); box.append(grid); }
    const b = el('button', { class: 'ed-item' + (ED.placing && ED.placing.tpl.__key === it.key ? ' on' : ''), title: it.name + (it.sub ? ' (' + it.sub + ')' : ''), onclick: () => { it.tpl.__key = it.key; edStartPlacing(it.tpl); renderLib(); } },
      el('span', { class: 'th' }), el('span', { class: 'nm' }, it.name));
    b.__it = it; grid.append(b); io.observe(b);
  }
}

/* ---------------- cena (lista) ---------------- */
function renderOutliner() {
  const box = $e('edOutliner'), q = $e('edOutSearch').value.trim().toLowerCase(); box.textContent = '';
  const rows = [];
  if (ED.map.spawn) rows.push(['spawn', 'Ponto de partida', 'partida']);
  for (const d of ED.map.vehicles) rows.push([d.id, edLabel(d), 'carro']);
  for (const d of ED.map.objects) rows.push([d.id, edLabel(d), d.type === 'model' ? 'modelo' : (MAP_PREFABS[d.ref] || {}).cat || '']);
  const W = Object.entries(ED.map.world || {}); if (ED.sel && ED.sel.startsWith('w:') && !ED.map.world[ED.sel.slice(2)]) W.unshift([ED.sel.slice(2), {}]);
  for (const [wid, ov] of W) rows.push(['w:' + wid, edLabel(null, 'w:' + wid), ov.del ? 'original · apagado' : Object.keys(ov).length ? 'original · alterado' : 'original']);
  $e('edCount').textContent = ED.map.objects.length + ' objetos · ' + ED.map.vehicles.length + ' carros · ' + Object.keys(ED.map.world || {}).length + ' alterações no original';
  const shown = rows.filter(r => !q || (r[1] + ' ' + r[0] + ' ' + r[2]).toLowerCase().includes(q));
  if (!shown.length) box.append(el('p', { class: 'ed-empty' }, rows.length ? 'Nada com esse nome.' : 'O mapa ainda não tem objetos colocados. Escolha algo na biblioteca à esquerda.'));
  for (const [id, name, tag] of shown.slice(0, 600))
    box.append(el('div', { class: 'ed-row' + (ED.sel === id ? ' on' : ''), onclick: () => edSelect(id), ondblclick: () => { edSelect(id); edFocus(); } }, el('span', {}, name), el('small', {}, tag + ' · ' + id)));
  if (shown.length > 600) box.append(el('p', { class: 'ed-empty' }, '… e mais ' + (shown.length - 600) + '. Use o filtro.'));
}

/* ---------------- propriedades ---------------- */
function numField(label, value, onInput, o) {
  o = o || {}; const inp = el('input', { type: 'number', step: o.step || 0.1, min: o.min, max: o.max, value: Math.round(value * 1000) / 1000 });
  inp.addEventListener('focus', () => edBegin()); inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) onInput(v); });
  inp.addEventListener('change', () => edCommit()); inp.addEventListener('blur', () => edCommit());
  // arrastar o rótulo muda o valor (como nos editores de jogo)
  const lab = el('label', { class: 'drag', title: 'Arraste para ajustar' }, label);
  lab.addEventListener('pointerdown', e => { e.preventDefault(); edBegin(); const x0 = e.clientX, v0 = parseFloat(inp.value) || 0, st = o.step || 0.1; lab.setPointerCapture(e.pointerId);
    const mv = ev => { let v = v0 + Math.round((ev.clientX - x0) / 4) * st * (ev.shiftKey ? 10 : 1); if (o.min !== undefined) v = Math.max(o.min, v); if (o.max !== undefined) v = Math.min(o.max, v); v = Math.round(v * 1000) / 1000; inp.value = v; onInput(v); };
    const up = () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); edCommit(); renderInspector(); };
    lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); });
  return el('div', { class: 'ed-num' }, lab, inp);
}
function vec3Row(title, arr, def0, onSet, o) {
  const v = arr || def0;
  return el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, title), el('div', { class: 'ed-vec' }, ['X', 'Y', 'Z'].map((ax, i) => numField(ax, v[i], x => { const n = (arr || def0).slice(); n[i] = x; onSet(n); }, o))));
}
function field(title, input) { return el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, title), input); }
function check(title, value, onSet, hint) {
  const c = el('input', { type: 'checkbox' }); c.checked = !!value; c.addEventListener('change', () => { edChange(() => onSet(c.checked)); edReconcile(); });
  return el('label', { class: 'ed-check', title: hint || '' }, c, title);
}
function colorInput(value, onSet) {
  const c = el('input', { type: 'color', value: value || '#cccccc' }); c.addEventListener('focus', () => edBegin()); c.addEventListener('input', () => onSet(c.value)); c.addEventListener('change', () => edCommit()); return c;
}
function selectInput(options, value, onSet) {
  const s = el('select', {}, options.map(([v, t]) => el('option', { value: v, selected: v === value }, t))); s.addEventListener('change', () => { edChange(() => onSet(s.value)); edReconcile(); renderInspector(); }); return s;
}
let inspId = null;
function renderInspector() {
  { const a = document.activeElement;                       // digitando num campo: não recria o painel (perderia o cursor)
    if (inspId && inspId === ED.sel && !ED.placing && a && $e('edInspector').contains(a) && (a.type === 'number' || a.type === 'text')) return refreshInspectorNumbers(); }
  const box = $e('edInspector'), id = ED.sel, def = id && edDef(id); inspId = id; box.textContent = '';
  if (AE.on) return renderAnimPanel(box);
  if (SK.on) return renderSocketPanel(box);
  if (TT.on) return renderTerrainPanel(box);
  if (VB.on) return renderVegPanel(box);
  if (ED.placing) { box.append(el('p', { class: 'ed-empty' }, 'Colocando: ', el('b', {}, edLabel(ED.placing.def)), '. Clique no mapa. R gira 15°, Shift+clique coloca vários, Esc ou botão direito cancela.')); return; }
  if (!def) {
    box.append(el('p', { class: 'ed-empty' }, 'Nada selecionado. Clique num objeto do mapa ou da lista.'),
      el('div', { class: 'ed-actions' }, el('button', { onclick: edSetSpawnHere }, 'Ponto de partida aqui'), el('button', { onclick: () => edSelect('spawn'), disabled: !ED.map.spawn }, 'Ver ponto de partida')),
      el('p', { class: 'ed-hint' }, 'Atalhos: W mover · E girar · R escala · G assentar no chão · Ctrl+D duplicar · Del apagar · Ctrl+Z desfazer · T vista de cima · X grade · F5 testar.'));
    return;
  }
  const kind = edKind(id), upd = fn => { fn(); edUpdated(id); };
  if (kind === 'world') return renderWorldInspector(box, id);
  box.append(el('div', { class: 'ed-insp-head' }, el('b', {}, edLabel(def)), el('small', {}, kind === 'object' ? (def.type === 'model' ? 'modelo · ' + def.ref : 'objeto · ' + def.ref) : kind === 'vehicle' ? 'gerador de carro' : 'onde o jogador começa')));
  if (kind !== 'spawn') { const n = el('input', { type: 'text', value: def.name || '', placeholder: edLabel(Object.assign({}, def, { name: '' })) });
    n.addEventListener('focus', () => edBegin()); n.addEventListener('input', () => { def.name = n.value || undefined; if (!def.name) delete def.name; }); n.addEventListener('change', () => { edCommit(); renderOutliner(); }); box.append(field('Nome', n)); }
  box.append(vec3Row('Posição', def.pos, [0, 0, 0], v => upd(() => { def.pos = v; }), { step: 0.1 }));
  if (kind === 'object') {
    box.append(vec3Row('Rotação °', def.rot, [0, 0, 0], v => upd(() => { def.rot = v; }), { step: 1 }));
    box.append(vec3Row('Escala', def.scale, [1, 1, 1], v => upd(() => { def.scale = v; }), { step: 0.05, min: 0.01 }));
    const F = def.type === 'prefab' && MAP_PREFABS[def.ref];
    if (F && Object.keys(F.params).length) {
      box.append(el('h4', {}, 'Parâmetros'));
      const p = mapParams(def), setP = (k, v) => { def.p = Object.assign({}, def.p || {}, { [k]: v }); };
      const names = { w: 'Largura (m)', h: 'Altura (m)', d: 'Profundidade (m)', r: 'Raio (m)', lados: 'Lados', andares: 'Andares', mat: 'Material', color: 'Cor', telhado: 'Telhado', copa: 'Copa' };
      for (const [k, spec] of Object.entries(F.params)) {
        if (Array.isArray(spec)) box.append(el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, names[k] || k), numField('↔', p[k], v => upd(() => setP(k, v)), { min: spec[1], max: spec[2], step: spec[3] })));
        else if (k === 'mat') box.append(field(names[k], selectInput(Object.entries(MAP_SURFACES).map(([v, s]) => [v, s.name]), p[k], v => setP(k, v))));
        else box.append(field(names[k] || k, colorInput(p[k], v => upd(() => setP(k, v)))));
      }
    }
    const f = mapFlags(def);
    box.append(el('h4', {}, 'No jogo'), el('div', { class: 'ed-checks' },
      check('Colide', f.solid, v => { def.solid = v; }, 'Carros e pessoas batem nele (caixa alinhada aos eixos)'),
      f.surf ? check('Pisável', f.walk, v => { def.walk = v; }, 'Carros e pessoas andam por cima (rampas e pisos)') : null));
  }
  if (kind === 'vehicle') {
    const opts = ED.models.filter(m => ['car', 'bike', 'bus'].includes(m.kind)).map(m => [m.id, m.name]);
    box.append(field('Modelo', selectInput(opts, def.model, v => { def.model = v; })));
    box.append(field('Direção °', numField('↻', def.h || 0, v => upd(() => { def.h = v; }), { step: 5 })));
    const rnd = check('Cor aleatória', !def.color, v => { if (v) delete def.color; else def.color = '#2a6fdb'; });
    box.append(el('div', { class: 'ed-checks' }, rnd), ...(def.color ? [field('Cor', colorInput(def.color, v => upd(() => { def.color = v; })))] : []),
      el('p', { class: 'ed-hint' }, 'No jogo o carro aparece estacionado aqui quando você chega perto, e volta a aparecer depois que você vai embora.'));
  }
  if (kind === 'spawn') {
    box.append(field('Direção °', numField('↻', def.h || 0, v => upd(() => { def.h = v; }), { step: 5 })));
    box.append(el('div', { class: 'ed-actions' }, el('button', { onclick: edSetSpawnHere }, 'Mover para a câmera')));
  }
  box.append(el('div', { class: 'ed-actions' },
    el('button', { onclick: edDrop, title: 'G' }, 'Assentar no chão'), kind !== 'spawn' ? el('button', { onclick: edDuplicate, title: 'Ctrl+D' }, 'Duplicar') : null,
    el('button', { onclick: edFocus, title: 'F' }, 'Focar'), el('button', { class: 'danger', onclick: edDelete, title: 'Del' }, 'Apagar')));
}
function renderWorldInspector(box, id) {
  const e = WENT.byId.get(id.slice(2)), wid = e.id, ov = () => ED.map.world[wid] || {}, cur = ov();
  const setOv = fn => { const o = JSON.parse(JSON.stringify(ov())); fn(o); for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    if (o.d && o.d.every(v => v === 0)) delete o.d; if (o.r === 0) delete o.r; if (o.s === 1) delete o.s;
    if (Object.keys(o).length) ED.map.world[wid] = o; else delete ED.map.world[wid]; edReconcile(); };
  box.append(el('div', { class: 'ed-insp-head' }, el('b', {}, e.name), el('small', {}, 'mapa original · ' + wid)));
  if (cur.del) {
    box.append(el('p', { class: 'ed-warn' }, 'Apagado: não aparece no jogo.'), el('div', { class: 'ed-actions' }, el('button', { class: 'primary', onclick: () => edWorldRestore(wid) }, 'Restaurar')));
    return;
  }
  box.append(el('p', { class: 'ed-hint' }, 'Prédio gerado pelo código da cidade. Dá para mover, girar, mudar o tamanho e apagar; a alteração fica salva no mapa.'));
  box.append(vec3Row('Deslocar', cur.d, [0, 0, 0], v => setOv(o => { o.d = v.map(r2); }), { step: 0.5 }));
  box.append(field('Girar °', numField('↻', cur.r || 0, v => setOv(o => { o.r = r2(v); }), { step: 5 })));
  box.append(field('Escala', numField('×', cur.s || 1, v => setOv(o => { o.s = Math.max(0.05, r2(v)); }), { step: 0.05, min: 0.05 })));
  box.append(el('div', { class: 'ed-actions' },
    el('button', { onclick: edDrop, title: 'G' }, 'Assentar no chão'), el('button', { onclick: edFocus, title: 'F' }, 'Focar'),
    Object.keys(cur).length ? el('button', { onclick: () => edWorldRestore(wid) }, 'Restaurar original') : null,
    el('button', { class: 'danger', onclick: edDelete, title: 'Del' }, 'Apagar')));
}
function renderTerrainPanel(box) {
  box.append(el('div', { class: 'ed-insp-head' }, el('b', {}, 'Esculpir terreno'), el('small', {}, 'B liga/desliga · Esc sai')));
  const brushes = el('div', { class: 'ed-brushes' }, Object.entries(TT_BRUSHES).map(([k, n]) => el('button', { class: TT.brush === k ? 'on' : '', onclick: () => { TT.brush = k; renderInspector(); } }, n)));
  const slider = (label, key, min, max, step, unit) => { const v = el('span', { class: 'ed-sv' }, TT[key] + ' ' + unit), r = el('input', { type: 'range', min, max, step, value: TT[key] });
    r.addEventListener('input', () => { TT[key] = +r.value; v.textContent = TT[key] + ' ' + unit; ttRing(); }); return el('div', { class: 'ed-field' }, el('span', { class: 'ed-lab' }, label), el('div', { class: 'ed-slider' }, r, v)); };
  box.append(brushes, slider('Tamanho', 'radius', 4, 240, 1, 'm'), slider('Força', 'strength', 0.5, 40, 0.5, 'm/s'),
    el('p', { class: 'ed-hint' }, 'Segure o botão esquerdo e passe sobre o terreno. Shift inverte (subir ↔ descer). [ e ] mudam o tamanho. Nivelar usa a altura de onde você começou. Baixar o chão abaixo do mar vira água; subir no mar cria terra.'),
    el('p', { class: 'ed-hint' }, 'Árvores e grama se acomodam ao relevo novo quando o mundo recarrega (salvar e abrir de novo, ou testar no jogo). Prédios e ruas não sobem junto: deixe a cidade plana.'),
    el('div', { class: 'ed-actions' }, el('button', { onclick: ttResetAll }, 'Relevo original'), el('button', { class: 'primary', onclick: () => ttSetOn(false) }, 'Concluir')));
}
/* o gizmo mexeu: só atualiza os números (sem recriar o painel) */
function refreshInspectorNumbers() {
  const def = ED.sel && edDef(ED.sel); if (!def || inspId !== ED.sel) return renderInspector();
  if (edKind(ED.sel) === 'world') { const w = ED.map.world[ED.sel.slice(2)] || {}, ins = $e('edInspector').querySelectorAll('.ed-num input'), v = (w.d || [0, 0, 0]).concat([w.r || 0, w.s || 1]); ins.forEach((inp, k) => { if (document.activeElement !== inp && v[k] !== undefined) inp.value = v[k]; }); return; }
  const rows = $e('edInspector').querySelectorAll('.ed-vec'), vals = [def.pos, def.rot || [0, 0, 0], def.scale || [1, 1, 1]];
  rows.forEach((r, i) => r.querySelectorAll('input').forEach((inp, k) => { if (document.activeElement !== inp && vals[i]) inp.value = Math.round(vals[i][k] * 1000) / 1000; }));
  const hd = $e('edInspector').querySelectorAll('.ed-num input'); if (edKind(ED.sel) !== 'object' && hd.length > 3 && document.activeElement !== hd[3]) hd[3].value = def.h || 0;
}

/* ---------------- janela modal ---------------- */
function modal(title, body, wide) { $e('edModalTitle').textContent = title; const b = $e('edModalBody'); b.textContent = ''; b.append(body); $e('edModal').hidden = false; $e('edModal').classList.toggle('wide', !!wide); }
function closeModal() { $e('edModal').hidden = true; }

/* ---------------- planta da cidade ---------------- */
const BLOCK_TYPES = { R: ['Residencial', '#7fbf6a'], M: ['Prédios médios', '#d8b26a'], T: ['Torres', '#6aa6d8'], I: ['Industrial', '#9a8f86'], C: ['Shopping', '#c77dd1'], S: ['Estádio', '#e0675a'],
  P: ['Parque', '#3f9a4a'], Z: ['Praça', '#9fcf7a'], A: ['Orla (prédios de frente p/ o mar)', '#e8d49a'], V: ['Terreno vazio', '#5d636b'] };
function openPlan() {
  const cities = CITIES.map(c => c.id); let city = 'sp', brush = 'R', lmBrush = null;
  const layouts = {}; for (const c of cities) layouts[c] = (ED.map.layouts && ED.map.layouts[c] ? ED.map.layouts[c] : (c === 'sp' ? LAYOUT_SP : LAYOUT_RJ)).map(r => r.split(''));
  const lms = Object.assign({}, ED.map.landmarks && ED.map.landmarks.sp ? ED.map.landmarks.sp : SP_LM);
  const wrap = el('div', { class: 'ed-plan' }), gridBox = el('div', { class: 'ed-plan-grid' }), pal = el('div', { class: 'ed-plan-pal' });
  const draw = () => {
    gridBox.textContent = ''; const L = layouts[city], C = CITIES.find(c => c.id === city); gridBox.style.gridTemplateColumns = 'repeat(' + C.ni + ', 1fr)';
    for (let j = 0; j < C.nj; j++) for (let i = 0; i < C.ni; i++) {
      const lm = city === 'sp' ? lms[i + ',' + j] : null, t = L[j][i], col = lm ? (SP_PARKS.has(lm) ? '#3f9a4a' : '#e0b83f') : (BLOCK_TYPES[t] || ['?', '#444'])[1];
      const cell = el('button', { class: 'cell', style: 'background:' + col, title: (lm ? 'Marco: ' + lm : (BLOCK_TYPES[t] || [t])[0]) + ' — quarteirão ' + i + ',' + j + '  (Ctrl+clique: ir até lá)' }, el('b', {}, lm ? lm : t));
      const paint = () => { if (lmBrush) { if (city === 'sp') lms[i + ',' + j] = lmBrush; } else { L[j][i] = brush; if (city === 'sp') delete lms[i + ',' + j]; } draw(); };
      cell.addEventListener('pointerdown', e => { if (e.ctrlKey) { closeModal(); const x = blockC(C.i0 + i), z = blockC(C.j0 + j); edLookAtPoint(x, 0.3, z, 120); return; } paint(); });
      cell.addEventListener('pointerenter', e => { if (e.buttons === 1 && !e.ctrlKey) paint(); });
      gridBox.append(cell);
    }
    pal.querySelectorAll('[data-b]').forEach(b => b.classList.toggle('on', !lmBrush && b.dataset.b === brush)); lmSel.disabled = city !== 'sp'; lmSel.value = lmBrush || '';
  };
  for (const [k, [n, c]] of Object.entries(BLOCK_TYPES)) pal.append(el('button', { 'data-b': k, onclick: () => { brush = k; lmBrush = null; draw(); } }, el('i', { style: 'background:' + c }), k + ' — ' + n));
  const lmSel = el('select', {}, el('option', { value: '' }, 'Marco de SP…'), Object.keys(SP_BUILD).map(k => el('option', { value: k }, k)));
  lmSel.addEventListener('change', () => { lmBrush = lmSel.value || null; draw(); }); pal.append(lmSel);
  const tabs = el('div', { class: 'ed-tabs' }, cities.map(c => el('button', { class: c === city ? 'on' : '', onclick: e => { city = c; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, CITIES.find(x => x.id === c).name)));
  const apply = async () => {
    edChange(() => { ED.map.layouts = {}; for (const c of cities) ED.map.layouts[c] = layouts[c].map(r => r.join('')); ED.map.landmarks = { sp: lms }; });
    if (await edSave()) { edToast('Recarregando o mundo com a planta nova…', 4000); setTimeout(() => location.reload(), 300); }
  };
  const reset = () => { if (!confirm('Voltar a planta e os marcos para os do jogo original?')) return; edChange(() => { delete ED.map.layouts; delete ED.map.landmarks; }); closeModal(); edSave().then(ok => ok && location.reload()); };
  wrap.append(tabs, el('div', { class: 'ed-plan-body' }, gridBox, pal),
    el('p', { class: 'ed-hint' }, 'Cada quadrado é um quarteirão (56 m) entre as ruas. Pinte com o tipo escolhido (dá para arrastar). Os prédios de cada tipo são gerados pelo jogo; para detalhes use a biblioteca de objetos. Norte para cima, como no mapa do jogo. Mudar a planta sorteia de novo os prédios da cidade.'),
    el('div', { class: 'ed-actions' }, el('button', { onclick: reset }, 'Planta original'), el('span', { class: 'ed-spacer' }), el('button', { onclick: closeModal }, 'Cancelar'), el('button', { class: 'primary', onclick: apply }, 'Aplicar (salva e recarrega o mundo)')));
  modal('Planta da cidade', wrap, true); draw();
}

/* ---------------- importar objeto de mod (DFF + TXD) ---------------- */
function openImport() {
  const dff = el('input', { type: 'text', placeholder: 'C:\\...\\objeto.dff' }), txd = el('input', { type: 'text', placeholder: 'C:\\...\\objeto.txd' }), id = el('input', { type: 'text', placeholder: 'automático (obj_nome)' }), name = el('input', { type: 'text', placeholder: 'nome na biblioteca' });
  const log = el('pre', { class: 'ed-log' }), go = el('button', { class: 'primary' }, 'Importar');
  const pick = async (inp, ext) => { try { const r = await edApi('pick', { title: 'Escolha o .' + ext, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (r.files && r.files[0]) { inp.value = r.files[0]; if (ext === 'dff' && !txd.value) txd.value = r.files[0].replace(/\.dff$/i, '.txd'); } } catch (e) { edToast(e.message); } };
  go.addEventListener('click', async () => {
    go.disabled = true; log.textContent = 'Convertendo…';
    try { const { job } = await edApi('import', { dff: dff.value.trim(), txd: txd.value.trim(), id: id.value.trim() || undefined, name: name.value.trim() || undefined });
      const j = await edJob(job, t => { log.textContent = t; });
      if (j.code === 0) { const m = /IMPORTADO (.*)/.exec(j.log), info = m ? JSON.parse(m[1]) : null; await edLoadModels(); libTab = 'model'; setLibTab('model');
        log.textContent += '\nPronto! Está na aba Modelos da biblioteca.'; if (info) { edToast('Importado: ' + info.name); edStartPlacing({ type: 'model', ref: info.id, __key: 'm:' + info.id }); closeModal(); } }
      else log.textContent += '\nNão deu certo (código ' + j.code + ').';
    } catch (e) { log.textContent = 'Erro: ' + e.message; }
    go.disabled = false;
  });
  const row = (t, inp, ext) => field(t, el('div', { class: 'ed-pick' }, inp, ED.desktop && ext ? el('button', { onclick: () => pick(inp, ext) }, 'Procurar…') : null));
  modal('Importar objeto do GTA SA (DFF + TXD)', el('div', {},
    el('p', { class: 'ed-hint' }, 'Traz um modelo de mod (poste, placa, quiosque, prédio…) para a biblioteca, com textura. Usa o mesmo conversor dos carros. Os arquivos convertidos vão para assets/models/<id>.'),
    row('Modelo .dff', dff, 'dff'), row('Texturas .txd', txd, 'txd'), field('ID', id), field('Nome', name),
    ED.api ? null : el('p', { class: 'ed-warn' }, 'Precisa do servidor do editor (npm run editor ou npm run serve).'),
    el('div', { class: 'ed-actions' }, el('span', { class: 'ed-spacer' }), go), log));
}

/* ---------------- gerar o .exe ---------------- */
async function openBuild() {
  if (!ED.api) { edToast('Precisa do servidor do editor (npm run editor).'); return; }
  if (ED.dirty && !(await edSave())) return;
  const log = el('pre', { class: 'ed-log' }, 'Gerando o NEON COAST.exe com o mapa atual… (leva alguns minutos)');
  modal('Gerar executável', el('div', {}, log));
  try { const { job } = await edApi('build', {}); const j = await edJob(job, t => { log.textContent = t; log.scrollTop = log.scrollHeight; });
    log.textContent += j.code === 0 ? '\n\nPronto! O .exe está em dist/NEON COAST-win32-x64/.' : '\n\nFalhou (código ' + j.code + ').';
    if (j.code === 0 && ED.desktop) edApi('reveal', { path: 'dist/NEON COAST-win32-x64/NEON COAST.exe' }).catch(() => {});
  } catch (e) { log.textContent += '\nErro: ' + e.message; }
}

/* ---------------- projetos ---------------- */
async function openProjects() {
  let info = ED.project; try { info = await edApi('project'); ED.project = info; } catch (e) { /* sem servidor */ }
  const m = (info && info.manifest) || {}, box = el('div', { class: 'ed-projects' });
  const open = async p => {
    if (ED.dirty && !confirm('Há alterações não salvas neste mapa. Trocar de projeto mesmo assim?')) return;
    try { const r = await edApi('open-project', p ? { root: p.root } : {}); if (r.opened) { ED.dirty = false; edToast('Abrindo o projeto…', 3000); } } catch (e) { edToast(e.message, 4000); }
  };
  box.append(el('div', { class: 'ed-proj-cur' }, el('span', { class: 'ed-lab' }, 'Projeto aberto'), el('b', {}, m.name || (info && info.folder) || '—'),
    m.description ? el('p', { class: 'ed-hint' }, m.description) : null,
    el('small', {}, (info && info.root) || (info && info.folder) || ''), el('small', {}, 'Criado no NEON ENGINE ' + (m.engine || '') + (m.created ? ' · ' + m.created : '') + ' · mapa: ' + (m.map || ED.file))));
  const all = []; const seen = new Set();
  for (const p of ((info && info.recent) || []).concat((info && info.projects) || [])) { const k = p.root || p.folder; if (seen.has(k)) continue; seen.add(k); all.push(p); }
  box.append(el('h4', {}, 'Projetos'));
  for (const p of all) box.append(el('div', { class: 'ed-row' + (p.current ? ' on' : '') }, el('span', {}, p.name || p.folder), el('small', {}, p.current ? 'aberto' : ''),
    !p.current && ED.desktop ? el('button', { onclick: () => open(p) }, 'Abrir') : null));
  if (!all.length) box.append(el('p', { class: 'ed-empty' }, 'Nenhum outro projeto encontrado.'));
  box.append(el('div', { class: 'ed-actions' },
    ED.desktop ? el('button', { onclick: () => open(null) }, 'Abrir outra pasta…') : el('p', { class: 'ed-hint' }, 'No navegador o projeto é o que o servidor abriu (npm run serve -- <pasta>).'),
    ED.desktop ? el('button', { onclick: () => edApi('reveal', { path: 'neon.project.json' }) }, 'Mostrar pasta do projeto') : null));
  modal('Projeto', box);
}

/* ---------------- barra de status ---------------- */
function onCursor(p) {
  $e('edStCursor').textContent = 'X ' + fmtNum(p.x) + '  Y ' + fmtNum(p.y) + '  Z ' + fmtNum(p.z);
  let z = ''; try { z = zoneName(p.x, p.z) || ''; } catch (e) { /* fora do mapa */ } $e('edStZone').textContent = z;
}
function setLibTab(t) { libTab = t; document.querySelectorAll('[data-lib]').forEach(b => b.classList.toggle('on', b.dataset.lib === t)); renderLib(); }

function edUiStart() {
  // a interface do editor não repassa teclado/mouse para o jogo que está carregado por baixo
  for (const id of ['edTop', 'edLeft', 'edRight', 'edStatus', 'edModal']) for (const t of ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'click']) $e(id).addEventListener(t, e => e.stopPropagation());
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => edSetTool(b.dataset.tool)));
  document.querySelectorAll('[data-lib]').forEach(b => b.addEventListener('click', () => setLibTab(b.dataset.lib)));
  $e('edLibSearch').addEventListener('input', renderLib); $e('edOutSearch').addEventListener('input', renderOutliner);
  $e('edSnap').addEventListener('click', () => edSetSnap(!ED.snap)); $e('edSpace').addEventListener('click', () => edSetSpace(ED.space === 'world' ? 'local' : 'world'));
  $e('edTopView').addEventListener('click', () => edSetTop(!ED.top));
  $e('edUndo').addEventListener('click', edUndo); $e('edRedo').addEventListener('click', edRedo);
  $e('edSave').addEventListener('click', edSave); $e('edPlay').addEventListener('click', edPlay); $e('edBuild').addEventListener('click', openBuild);
  $e('edPlan').addEventListener('click', openPlan); $e('edExport').addEventListener('click', openExport); $e('edTerrain').addEventListener('click', () => ttSetOn(!TT.on)); $e('edVeg').addEventListener('click', () => vbSetOn(!VB.on)); edOn('terrain', renderInspector); $e('edImport').addEventListener('click', openImport3D);
  $e('edModalClose').addEventListener('click', closeModal); $e('edModal').addEventListener('pointerdown', e => { if (e.target === $e('edModal')) closeModal(); });
  $e('edModal').addEventListener('keydown', e => { if (e.code === 'Escape') closeModal(); });
  const hr = $e('edHour'); hr.addEventListener('input', () => { hour = +hr.value; updateSky(0); const h = Math.floor(hour) % 24, m = Math.round((hour % 1) * 60); $e('edHourVal').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); });
  { const m = ED.project && ED.project.manifest; $e('edProjName').textContent = (m && m.name) || 'Projeto'; $e('edMapName').textContent = ED.file + (ED.desktop ? '' : ED.api ? ' · navegador' : ' · sem servidor'); }
  $e('edProject').addEventListener('click', openProjects);
  edOn('scene', renderOutliner); edOn('select', () => { renderOutliner(); renderInspector(); }); edOn('transform', refreshInspectorNumbers);
  edOn('placing', () => { renderInspector(); renderLib(); }); edOn('models', renderLib); edOn('cursor', onCursor);
  edOn('fps', f => { $e('edStFps').textContent = Math.round(f) + ' fps'; $e('edStCam').textContent = 'câmera ' + Math.round(fly.speed) + ' m/s'; });
  edOn('history', () => { $e('edUndo').disabled = !ED.undo.length; $e('edRedo').disabled = !ED.redo.length; });
  edEmit('history'); renderLib(); renderOutliner(); renderInspector();
}
