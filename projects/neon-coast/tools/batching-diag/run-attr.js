// Diagnóstico de draw calls por ORIGEM (engine/docs/desempenho-batching.md). Não altera o projeto: serve o jogo com um gancho (hook.js) anexado ao three.min.js
// que anota, em cada objeto adicionado à cena, o arquivo:linha de quem o criou. Uso (a partir de projects/neon-coast):
//   npx electron tools/batching-diag/run-attr.js tools/batching-diag/census.js --test "37,0.3,80,180&p=a"      (p=a centro de SP, p=b avenida; &nobatch=1 = sem as otimizações)
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const args = process.argv.slice(2), file = args.find(a => a.endsWith('.js') && !/run-attr/.test(a));
const ti = args.indexOf('--test'), test = ti >= 0 ? args[ti + 1] : '37,0.3,80,180';
const HOOK = fs.readFileSync(__dirname + '/hook.js', 'utf8');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(async () => {
  app.setPath('userData', path.join(app.getPath('temp'), 'neon-coast-script-profile'));
  const base = require(path.join(root, 'electron', 'static-server'))(root);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/vendor/three.min.js')) { const b = fs.readFileSync(path.join(root, 'vendor', 'three.min.js'), 'utf8') + '\n' + HOOK; res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(b); return; }
    base(req, res);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const win = new BrowserWindow({ width: 1280, height: 720, show: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', ev => { if (ev.level === 'error') console.log('[jogo]', ev.message); });
  const timer = setTimeout(() => { console.log('TEMPO ESGOTADO'); app.exit(5); }, 240000);
  win.webContents.once('did-finish-load', async () => {
    try {
      await win.webContents.executeJavaScript(`new Promise(r => { const t = setInterval(() => { if (typeof started !== 'undefined' && started && typeof peds !== 'undefined' && peds.length > 10) { clearInterval(t); setTimeout(r, 1500); } }, 300); })`);
      await win.webContents.executeJavaScript(`window.__run = secs => { let T = last; const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { T += 1000 / 60; frame(T); } }; true`);
      const out = await win.webContents.executeJavaScript(fs.readFileSync(path.resolve(file), 'utf8'));
      console.log('RESULTADO', JSON.stringify(out));
      clearTimeout(timer); app.exit(0);
    } catch (e) { console.log('FALHOU', e.message); clearTimeout(timer); app.exit(4); }
  });
  win.loadURL('http://127.0.0.1:' + server.address().port + '/index.html?test=' + test);
});
