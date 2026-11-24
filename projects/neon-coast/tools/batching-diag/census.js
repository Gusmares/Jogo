// roda dentro do jogo via run-attr.js: agrupa os draw calls visíveis por origem (arquivo:linha) e imprime as categorias
(async () => {
  const Q = new URLSearchParams(location.search), which = Q.get('p') || 'a';
  const rc = i => roadC(i);
  function teleport(x, z, hDeg) { player.x = x; player.z = z; player.y = carGroundHeight(x, z); player.vx = player.vz = 0; player.h = (hDeg || 0) * Math.PI / 180; cam.a = player.h; updateMapGens(0, true); }
  if (which === 'a') teleport(rc(4), rc(4) + 9, 90); else teleport(rc(1) + 40, rc(4), 90);
  for (let i = 0; i < 600; i++) { if (i % 30 === 0) updateMapGens(0.5); window.__run(1 / 60); }
  renderer.info.autoReset = false; renderer.info.reset(); renderer.shadowMap.needsUpdate = true; POST.st = 1; postRender();
  const real = { callsTotal: renderer.info.render.calls, tris: renderer.info.render.triangles };
  camera.updateMatrixWorld(); sunLight.shadow.camera.updateMatrixWorld();
  const mk = c => { const f = new THREE.Frustum(); f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)); return f; };
  const f = mk(camera), sf = mk(sunLight.shadow.camera);
  const rootOf = o => { while (o.parent && o.parent !== scene) o = o.parent; return o; };
  const carRoots = new Set(cars.map(c => c.mesh)); const cats = new Map(); const tot = { objetos: 0, calls: 0, sombra: 0 }; const allMats = new Set();
  const allObjs = new Map();
  scene.traverse(o => { tot.objetos++; const r = rootOf(o); const k = carRoots.has(r) ? 'CARRO' : (r.__src || '??').split(' < ')[0]; const a = allObjs.get(k) || { n: 0 }; a.n++; allObjs.set(k, a); if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => allMats.add(m.uuid)); });
  scene.traverse(o => {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.material) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    if (o.frustumCulled && !f.intersectsObject(o)) return;
    const r = rootOf(o); const mats = Array.isArray(o.material) ? o.material : [o.material]; const calls = Array.isArray(o.material) && o.geometry.groups.length ? o.geometry.groups.length : 1;
    const src = carRoots.has(r) ? 'CARRO (veiculos)' : o.isSkinnedMesh ? 'PEDESTRE/ator (skinned)' : (r.__src || '??').split(' < ')[0];
    const k = src + (o.isInstancedMesh ? ' [instanciada]' : '');
    let c = cats.get(k); if (!c) cats.set(k, c = { k, calls: 0, objs: 0, mats: new Set(), sombra: 0, tris: 0 });
    c.calls += calls; c.objs++; mats.forEach(m => c.mats.add(m.uuid)); tot.calls += calls;
    const nv = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; c.tris += nv / 3 * (o.isInstancedMesh ? o.count : 1);
    if (o.castShadow && (!o.frustumCulled || sf.intersectsObject(o))) { c.sombra += calls; tot.sombra += calls; }
  });
  const list = [...cats.values()].sort((a, b) => b.calls - a.calls).map(c => [c.k, c.objs, c.mats.size, c.calls, c.sombra, Math.round(c.tris / 1000)]);
  return { cenario: which, real, tot, materiaisNaCena: allMats.size, totalObjetosNaCena: tot.objetos, cats: list.slice(0, 22), objsPorOrigem: [...allObjs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => [k, v.n]) };
})()
