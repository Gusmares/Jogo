// Roda um script de teste DENTRO do jogo (janela Electron, como no .exe) e imprime o resultado.
//   npx electron projects/neon-coast/tools/run-game-script.js <script.js> [--test x,y,z,graus] [--show] [--shot imagem.png]
// O script é avaliado na página depois que o jogo começa (index.html?test=...). Ele pode usar a função __run(segundos), que avança o
// jogo em quadros de 1/60 s sem depender do relógio (testes de IA, física, polícia). O valor final do script (ou da Promise) é impresso.
'use strict';
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2), file = args.find(a => a.endsWith('.js') && !a.endsWith('run-game-script.js'));
const ti = args.indexOf('--test'), test = ti >= 0 ? args[ti + 1] : '37,0.3,80,180', show = args.includes('--show');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(async () => {
  if (!file) { console.log('Use: run-game-script.js <script.js>'); app.exit(1); return; }
  app.setPath('userData', path.join(app.getPath('temp'), 'neon-coast-script-profile'));
  const server = http.createServer(require('../electron/static-server')(root)); await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const win = new BrowserWindow({ width: 1280, height: 720, show, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', ev => { if (ev.level === 'error') console.log('[jogo]', ev.message); });
  const timer = setTimeout(() => { console.log('SCRIPT TEMPO ESGOTADO'); app.exit(5); }, 240000);
  win.webContents.once('did-finish-load', async () => {
    try {
      await win.webContents.executeJavaScript(`new Promise(r => { const t = setInterval(() => { if (typeof started !== 'undefined' && started && typeof peds !== 'undefined' && peds.length > 10) { clearInterval(t); setTimeout(r, 1500); } }, 300); })`);
      await win.webContents.executeJavaScript(`window.__run = secs => { let T = last; const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { T += 1000 / 60; frame(T); } }; true`);
      const out = await win.webContents.executeJavaScript(fs.readFileSync(path.resolve(file), 'utf8'));
      console.log('RESULTADO', JSON.stringify(out, null, 1));
      const si = args.indexOf('--shot'); if (si >= 0) { await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); fs.writeFileSync(path.resolve(args[si + 1]), (await win.webContents.capturePage()).toPNG()); console.log('IMAGEM', args[si + 1]); }
      clearTimeout(timer); app.exit(0);
    } catch (e) { console.log('SCRIPT FALHOU', e.message); clearTimeout(timer); app.exit(4); }
  });
  win.loadURL('http://127.0.0.1:' + server.address().port + '/index.html?test=' + test);
});
