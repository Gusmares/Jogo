// Captura determinística para comparar o visual antes/depois (--q "&nobatch=1" = sem as otimizações): Math.random semeado, carros/pedestres escondidos,
// vento/semáforo/sol congelados, câmera fixa. Salva só o canvas do jogo (sem HUD). Uso (a partir de projects/neon-coast):
//   npx electron tools/batching-diag/run-shot.js --pos "[roadC(4), 3, roadC(4)+9, 90, 0]" --out a.png [--q "&nobatch=1"]    (pos = [x, y, z, yawGraus, pitchGraus])
// Depois: npx electron tools/batching-diag/diff.js a.png b.png [mapa-de-diferenca.png]
// Não são deterministas (existem nos DOIS modos): água, pilhas de lixo (Math.random em jogo) e o marcador de missão aleatório.
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const args = process.argv.slice(2), arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const pos = arg('--pos'), out = arg('--out'), q = arg('--q') || '';
const HOOK = ';(function(){let a=12345;Math.random=function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();';
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(async () => {
  app.setPath('userData', path.join(app.getPath('temp'), 'neon-coast-script-profile'));
  const base = require(path.join(root, 'electron', 'static-server'))(root);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/vendor/three.min.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(fs.readFileSync(path.join(root, 'vendor', 'three.min.js'), 'utf8') + '\n' + HOOK); return; }
    base(req, res);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const win = new BrowserWindow({ width: 1280, height: 720, show: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', ev => { if (ev.level === 'error') console.log('[jogo]', ev.message); });
  const timer = setTimeout(() => { console.log('TEMPO ESGOTADO'); app.exit(5); }, 120000);
  win.webContents.once('did-finish-load', async () => {
    try {
      await win.webContents.executeJavaScript(`new Promise(r => { const t = setInterval(() => { if (typeof started !== 'undefined' && started && typeof peds !== 'undefined' && peds.length > 10) { clearInterval(t); setTimeout(r, 1500); } }, 300); })`);
      await win.webContents.executeJavaScript(`window.__run = secs => { let T = last; const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { T += 1000 / 60; frame(T); } }; true`);
      const info = await win.webContents.executeJavaScript(`(async () => {
        POST.warmup = 1e12; if (POST.scale !== 1) { POST.scale = 1; postResize(); }
        const [cx, cy, cz, yaw, pitch] = (${pos}); const x = cx, z = cz, h = yaw;
        player.x = x; player.z = z; player.y = carGroundHeight(x, z); player.vx = player.vz = 0; player.h = h * Math.PI / 180; cam.a = player.h; updateMapGens(0, true);
        for (let i = 0; i < 240; i++) { if (i % 30 === 0) updateMapGens(0.5); window.__run(1 / 60); }
        const dyn = () => { for (const r of scene.children) { let sk = false; r.traverse(o => { if (o.isSkinnedMesh) sk = true; }); if (sk) r.visible = false; } for (const c of cars) if (c.mesh) c.mesh.visible = false; for (const n of peds) if (n.a && n.a.group) n.a.group.visible = false; player.mesh.visible = false; if (typeof officers !== 'undefined') for (const o of officers) if (o.a) o.a.group.visible = false; };
        window.frame = function () { dyn(); camera.position.set(cx, cy, cz); camera.rotation.order = 'YXZ'; camera.rotation.set((pitch || 0) * Math.PI / 180, (yaw + 180) * Math.PI / 180, 0); camera.updateMatrixWorld(true); windU.value = 3.0; TL.clock = 5; TL.t = 0; updateTrafficLights(0); sunLight.target.position.set(cx, 0, cz); sunLight.position.set(cx + sunDir.x * 160, Math.max(sunDir.y, 0.15) * 160, cz + sunDir.z * 160); sunLight.target.updateMatrixWorld(true); sunLight.updateMatrixWorld(true); updateVegetationCulling(); renderer.info.reset(); postRender(); window.__calls = renderer.info.render.calls; window.__png = renderer.domElement.toDataURL('image/png'); requestAnimationFrame(window.frame); };
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        return { calls: window.__calls, farCulled: typeof FARC !== 'undefined' ? FARC.filter(m => m.__fc).length : -1, farTotal: typeof FARC !== 'undefined' ? FARC.length : -1, cam: [camera.position.x, camera.position.y, camera.position.z].map(v => +v.toFixed(1)) };
      })()`);
      console.log('INFO', JSON.stringify(info));
      const du = await win.webContents.executeJavaScript('window.__png'); fs.writeFileSync(path.resolve(out), Buffer.from(du.split(',')[1], 'base64'));
      clearTimeout(timer); app.exit(0);
    } catch (e) { console.log('FALHOU', e.message); clearTimeout(timer); app.exit(4); }
  });
  win.loadURL('http://127.0.0.1:' + server.address().port + '/index.html?test=37,0.3,80,180' + q);
});
