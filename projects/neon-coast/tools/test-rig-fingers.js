// Teste do esqueleto estendido (dedos) DENTRO do jogo (Electron oculto, como run-game-script.js).
//   npx electron projects/neon-coast/tools/test-rig-fingers.js [skinId,skinId,...] [--out pasta] [--fps]
// Para cada skin com assets/rigs/<id>.rig.json: renderiza o personagem original e o estendido nas mesmas poses (repouso, andando, mirando),
// compara os pixels (corpo inteiro e close das mãos), curva os dedos (rigCurl) e grava uma folha de contato em assets/_inventario/rigs/<id>.png.
// --fps compara o custo de simular+desenhar o jogador com e sem o rig (A/B alternado). Termina com código 0 se todas as diferenças < 0,5%.
'use strict';
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2), oi = args.indexOf('--out'), skinArg = args.find((a, i) => !a.startsWith('--') && !a.endsWith('.js') && !(oi >= 0 && i === oi + 1));
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(root, 'assets', '_inventario', 'rigs'));
const skins = skinArg ? skinArg.split(',') : ['player_argentina', 'player_bbthin', 'player_emmet'];
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const PAGE = `(async (SKINS, FPS) => {
  await ifpLoaded;
  if (typeof rigExtendActor !== 'function') await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'js/entities/rig-extend.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const out = { skins: {}, images: {} };
  if (FPS) {                                                          // A/B no jogo de verdade: jogador sem e com rig
    const pa = player.actor; if (!pa) throw new Error('sem ator do jogador');
    const run = () => { const t0 = performance.now(); __run(4); return (performance.now() - t0) / 240; };
    run(); run();
    const mean = x => x.reduce((s, v) => s + v, 0) / x.length, A = [], B = [], C = [];
    for (let k = 0; k < 3; k++) A.push(run());
    const ok = await rigExtendActor(pa);
    if (!ok) out.fps = { error: 'rig do jogador ausente (' + pa.type.id + ')' };
    else {
      for (let k = 0; k < 3; k++) B.push(run());
      rigCurl(pa, 'l', 0.6); rigCurl(pa, 'r', 0.6); for (let k = 0; k < 2; k++) C.push(run());
      const type = pa.type, m0 = makeActor(type), m1 = makeActor(type); await rigExtendActor(m1); const bench = m => { const t0 = performance.now(); for (let i = 0; i < 4000; i++) { animateActor(m, 1 / 60, 'walk', 2); m.group.updateMatrixWorld(true); m.mesh.skeleton.update(); } return (performance.now() - t0) / 4000; };
      bench(m0); bench(m1); const M0 = [], M1 = []; for (let k = 0; k < 4; k++) { M0.push(bench(m0)); M1.push(bench(m1)); }
      out.cpuPorAtor = { msSemRig: +mean(M0).toFixed(4), msComRig: +mean(M1).toFixed(4), deltaMs: +(mean(M1) - mean(M0)).toFixed(4), note: 'animação IFP + matrizes + Skeleton.update de 1 ator (CPU), média de 4x4000 iterações' };
      out.fps = { skin: pa.type.id, bones: pa.bones.length, msSemRig: +mean(A).toFixed(3), msComRig: +mean(B).toFixed(3), msComRigEDedosCurvados: +mean(C).toFixed(3), deltaMs: +(mean(B) - mean(A)).toFixed(3), blocosSemRig: A.map(x => +x.toFixed(2)), blocosComRig: B.map(x => +x.toFixed(2)), note: 'ms por quadro simulado+desenhado (4 s por bloco); o ruído entre blocos iguais mostra a incerteza' };
    }
    return out;
  }
  const saveRender = POST.enabled; POST.enabled = false;
  scene.children.forEach(c => { if (!c.isLight) c.visible = false; }); scene.background = new THREE.Color(0x707880); scene.fog = null;
  document.querySelectorAll('body > *:not(canvas)').forEach(e => e.style.display = 'none');
  const cv = renderer.domElement, W = cv.width, H = cv.height;
  const grab = () => new Promise(r => { renderer.render(scene, camera); const im = new Image(); im.onload = () => r(im); im.src = cv.toDataURL('image/png'); });
  const pix = im => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
  const diff = (A, B) => { let n = 0, sil = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])); const bg = Math.abs(A[i] - 112) + Math.abs(A[i + 1] - 120) + Math.abs(A[i + 2] - 128) > 30; if (bg) sil++; if (d > 8) n++; } return { pct: +(100 * n / (A.length / 4)).toFixed(4), pctSil: +(100 * n / Math.max(1, sil)).toFixed(3) }; };
  const poses = [['idle', 'IDLE_stance', 0], ['walk', 'WALK_player', 0.45], ['run', 'run_player', 0.3], ['aim', 'ARRESTgun', 0.3], ['gun', 'colt45_fire_2hands', 0.2]];
  const setPose = (a, p) => { a.ap.play(p[1], { loop: false, fade: 0, restart: true }); a.ap.time = p[2]; a.ap.speed = 0.0001; a.ap.update(0.0001); a.ap.prev = null; a.ap.fade = 1; a.group.updateMatrixWorld(true); };
  const place = (a) => { a.group.position.set(0, 100 + a.footOffset, 0); a.group.updateMatrixWorld(true); };
  const camFull = () => { camera.fov = 35; camera.position.set(0, 100.1, -3.4); camera.up.set(0, 1, 0); camera.lookAt(0, 100.05, 0); camera.near = 0.05; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); };
  const camHand = (a, side, dir, dist) => { const p = new THREE.Vector3(), q = new THREE.Vector3(); a.bones[a.index[side + 'hand']].getWorldPosition(p); a.bones[a.index[side + 'finger']].getWorldPosition(q); const c = p.lerp(q, 0.7); camera.fov = 38; camera.position.copy(c).addScaledVector(new THREE.Vector3().fromArray(dir).normalize(), dist || 0.4); camera.up.set(0, 1, 0); camera.lookAt(c); camera.near = 0.02; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); };
  const sheetCells = [];
  for (const id of SKINS) {
    const R = { id, diffs: {} };
    try {
      const type = await loadSkin(id), a0 = makeActor(type), a1 = makeActor(type); scene.add(a0.group); scene.add(a1.group);
      const ok = await rigExtendActor(a1); R.extended = ok; R.bones = a1.bones.length;
      if (!ok) { R.error = 'sem rig'; out.skins[id] = R; continue; }
      let worst = 0; const cells = [];
      for (const p of poses) {
        for (const view of [['full'], ['Lout', 'l', [1, 0.15, 0.2]], ['Rout', 'r', [-1, 0.15, 0.2]], ['Lfront', 'l', [0, 0.1, -1]], ['Rfront', 'r', [0, 0.1, -1]]]) {
          const name = p[0] + '_' + view[0];
          const shot = a => { place(a); setPose(a, p); if (view[0] === 'full') camFull(); else camHand(a, view[1], view[2], 0.45); };
          a1.group.visible = false; a0.group.visible = true; shot(a0); const i0 = await grab(); const d0 = pix(i0);
          a0.group.visible = false; a1.group.visible = true; shot(a1); const i1 = await grab(); const d1 = pix(i1);
          const d = diff(d0, d1); R.diffs[name] = d; worst = Math.max(worst, view[0] === 'full' ? d.pct : d.pct);
          if (name === 'idle_full' || name === 'idle_Lout' || name === 'gun_Lout' || name === 'gun_Rout' || name === 'walk_Lout') cells.push([name + ' orig', i0], [name + ' rig', i1]);
        }
      }
      R.worstPct = +worst.toFixed(4);
      // dedos curvados (polegar incluído), vistos de dois lados
      a0.group.visible = false; a1.group.visible = true; place(a1); setPose(a1, poses[0]);
      for (const amt of [0.5, 1]) {
        rigCurl(a1, 'l', amt); rigCurl(a1, 'r', amt);
        for (const [vn, side, dir] of [['L-out', 'l', [1, 0.15, 0.2]], ['L-front', 'l', [0, 0.1, -1]], ['R-out', 'r', [-1, 0.15, 0.2]], ['R-back', 'r', [0, 0.1, 1]]]) { camHand(a1, side, dir, 0.4); a1.group.updateMatrixWorld(true); cells.push(['curl ' + amt + ' ' + vn, await grab()]); }
      }
      rigClear(a1);
      // folha de contato desta skin
      const cols = 4, cw = 400, ch = 225, rows = Math.ceil(cells.length / cols), sh = document.createElement('canvas'); sh.width = cols * cw; sh.height = rows * ch;
      const sx = sh.getContext('2d'); sx.fillStyle = '#222'; sx.fillRect(0, 0, sh.width, sh.height); sx.font = '14px sans-serif';
      cells.forEach(([t, im], k) => { const x = (k % cols) * cw, y = Math.floor(k / cols) * ch; sx.drawImage(im, x, y, cw, ch); sx.fillStyle = '#fff'; sx.fillText(id + ' - ' + t, x + 6, y + 18); });
      out.images[id] = sh.toDataURL('image/png');
      scene.remove(a0.group); scene.remove(a1.group); a0.mesh.skeleton.dispose(); a1.mesh.skeleton.dispose();
    } catch (e) { R.error = String(e && e.message || e); }
    out.skins[id] = R;
  }
  POST.enabled = saveRender;
  return out;
})`;

app.whenReady().then(async () => {
  app.setPath('userData', path.join(app.getPath('temp'), 'neon-coast-script-profile'));
  const server = http.createServer(require('../electron/static-server')(root)); await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', ev => { if (ev.level === 'error') console.log('[jogo]', ev.message); });
  const timer = setTimeout(() => { console.log('TESTE TEMPO ESGOTADO'); app.exit(5); }, 420000);
  win.webContents.once('did-finish-load', async () => {
    try {
      await win.webContents.executeJavaScript(`new Promise(r => { const t = setInterval(() => { if (typeof started !== 'undefined' && started && typeof peds !== 'undefined' && peds.length > 10) { clearInterval(t); setTimeout(r, 1500); } }, 300); })`);
      await win.webContents.executeJavaScript(`window.__run = secs => { let T = last; const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { T += 1000 / 60; frame(T); } }; true`);
      let code = 0;
      if (args.includes('--fps')) {
        const o = await win.webContents.executeJavaScript(PAGE + '(' + JSON.stringify(skins) + ', true)');
        console.log('FPS', JSON.stringify(o.fps)); console.log('CPU', JSON.stringify(o.cpuPorAtor));
      } else {
        await win.webContents.executeJavaScript('window.frame = () => {}; new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
        const o = await win.webContents.executeJavaScript(PAGE + '(' + JSON.stringify(skins) + ', false)');
        fs.mkdirSync(outDir, { recursive: true });
        for (const id of Object.keys(o.images)) { fs.writeFileSync(path.join(outDir, id + '_rig.png'), Buffer.from(o.images[id].split(',')[1], 'base64')); console.log('IMAGEM', path.join(outDir, id + '_rig.png')); }
        for (const id of Object.keys(o.skins)) {
          const r = o.skins[id]; console.log(id, r.error ? 'ERRO ' + r.error : 'ossos ' + r.bones + ' | pior diferença de pixels ' + r.worstPct + '%');
          if (!r.error) console.log('   ' + Object.entries(r.diffs).map(([k, v]) => k + '=' + v.pct + '%').join('  '));
          if (r.error || r.worstPct >= 0.5) code = 1;
        }
      }
      clearTimeout(timer); app.exit(code);
    } catch (e) { console.log('TESTE FALHOU', e.message); clearTimeout(timer); app.exit(4); }
  });
  win.loadURL('http://127.0.0.1:' + server.address().port + '/index.html?test=37,0.3,80,180');
});
