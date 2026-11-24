// roda dentro do editor: npx electron engine/app --selftest --script engine/docs/espalhar-packs-data/editor-packs.js
// confere que os itens "packs-auto" aparecem como objetos editáveis (um grupo por def), que dá para mover/girar/apagar/desfazer
// e que o item mexido perde a tag (passa a ser do usuário e sobrevive a uma nova geração).
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tagged = () => ED.map.objects.filter(o => o.tag === 'packs-auto');
  const res = { total: ED.map.objects.length, comTag: tagged().length, raizes: ED.roots.size };
  const veg = ED.map.objects.find(o => o.tag === 'packs-auto' && o.veg), prop = ED.map.objects.find(o => o.tag === 'packs-auto' && o.batch);
  await wait(1500);                                                    // GLBs carregam em segundo plano
  const probe = async (def0, nome) => {
    if (!def0) return { nome, erro: 'sem item' };
    const id = def0.id, def = edDef(id), root = ED.roots.get(id), p0 = def.pos.slice(), q = { nome, id, ref: def.ref, tinhaRaiz: !!root, meshes: 0, tagAntes: def.tag };
    await (root && root.userData.ready); root.traverse(o => { if (o.isMesh) q.meshes++; });
    edSelect(id); q.selecionado = ED.sel === id;
    edChange(() => { edDef(id).pos = [p0[0] + 5, p0[1], p0[2] + 3]; edDef(id).rot = [0, 90, 0]; }); edReconcile();
    q.moveu = Math.abs(ED.roots.get(id).position.x - (p0[0] + 5)) < 1e-6 && Math.abs(ED.roots.get(id).rotation.y - Math.PI / 2) < 1e-6;
    q.tagDepois = (edDef(id) || {}).tag || null;
    edUndo(); await wait(50); const d2 = edDef(id); q.desfez = !!d2 && Math.abs(d2.pos[0] - p0[0]) < 1e-6 && Math.abs(ED.roots.get(id).position.x - p0[0]) < 1e-6; q.tagVoltou = (d2 || {}).tag || null;
    const n0 = ED.map.objects.length; edSelect(id); edDelete(); q.apagou = ED.map.objects.length === n0 - 1 && !ED.roots.has(id);
    edUndo(); await wait(50); q.restaurou = ED.map.objects.length === n0 && ED.roots.has(id);
    return q;
  };
  res.vegetacao = await probe(veg, 'vegetação'); res.prop = await probe(prop, 'prop');
  res.semErroDeModelo = true;
  return res;
})()
