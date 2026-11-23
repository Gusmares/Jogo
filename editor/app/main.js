// NEON ENGINE — editor de mapa do NEON COAST (app desktop, Electron).
// Roda em cima da pasta do projeto (não de dentro do .exe do jogo), porque é ali que ele grava o mapa (maps/world.json) e importa modelos.
//   desenvolvimento:  npm run editor
//   executável:       npm run build:editor  ->  dist/NEON ENGINE-win32-x64/NEON ENGINE.exe (lembra a pasta do projeto em project.json)
'use strict';
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');

function projectRoot() {
  const cands = [process.env.NEON_PROJECT, (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'project.json'), 'utf8')).root; } catch (e) { return null; } })(), path.resolve(__dirname, '..', '..')];
  for (const c of cands) if (c && fs.existsSync(path.join(c, 'index.html')) && fs.existsSync(path.join(c, 'editor.html'))) return c;
  return null;
}
const root = projectRoot();
const isDev = process.argv.includes('--dev');
let editorWin = null, playWin = null;

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function start() {
  if (!root) { dialog.showErrorBox('NEON ENGINE', 'Não achei a pasta do projeto NEON COAST (com index.html e editor.html).\nDefina a variável NEON_PROJECT ou gere o editor de novo com npm run build:editor.'); app.quit(); return; }
  const statics = require(path.join(root, 'electron', 'static-server.js'))(root);
  let port = 0;
  const api = require('./engine-api')({
    root, desktop: true,
    pick: async b => { const r = await dialog.showOpenDialog(editorWin, { title: b.title || 'Escolher arquivo', properties: ['openFile'].concat(b.multi ? ['multiSelections'] : []), filters: b.filters || [] }); return r.canceled ? [] : r.filePaths; },
    play: async b => openGame(port, b),
    reveal: p => shell.showItemInFolder(p)
  });
  const server = http.createServer((req, res) => { if (!api(req, res)) statics(req, res); });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); port = server.address().port;
  editorWin = new BrowserWindow({ width: 1680, height: 960, minWidth: 1100, minHeight: 640, backgroundColor: '#101216', title: 'NEON ENGINE', show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  if (!isDev) Menu.setApplicationMenu(null);
  editorWin.once('ready-to-show', () => { editorWin.maximize(); editorWin.show(); });
  editorWin.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') editorWin.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F11') editorWin.setFullScreen(!editorWin.isFullScreen());
  });
  editorWin.on('close', e => {       // pergunta antes de fechar com alterações não salvas
    if (editorWin.__allowClose) return;
    e.preventDefault();
    editorWin.webContents.executeJavaScript('window.__engineDirty ? window.__engineDirty() : false').then(dirty => {
      if (!dirty || dialog.showMessageBoxSync(editorWin, { type: 'question', buttons: ['Sair sem salvar', 'Cancelar'], defaultId: 1, cancelId: 1, title: 'NEON ENGINE', message: 'Há alterações no mapa que não foram salvas.' }) === 0) { editorWin.__allowClose = true; editorWin.close(); }
    }).catch(() => { editorWin.__allowClose = true; editorWin.close(); });
  });
  if (process.argv.includes('--selftest')) {     // verificação automática: abre o editor, espera montar o mundo, imprime o estado e sai
    editorWin.webContents.on('console-message', ev => { if (ev.level === 'error') console.log('[editor]', ev.message); });
    editorWin.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await editorWin.webContents.executeJavaScript(`(async()=>{for(let i=0;i<120&&(typeof ED==='undefined'||document.getElementById('edBoot'));i++)await new Promise(r=>setTimeout(r,500));
          if(typeof ED==='undefined')return{ok:false,erro:document.getElementById('edBootMsg').textContent+' '+document.getElementById('edBootErr').textContent};
          return{ok:true,api:ED.api,desktop:ED.desktop,arquivo:ED.file,objetos:ED.map.objects.length,carros:ED.map.vehicles.length,modelos:ED.models.length,prefabs:Object.keys(MAP_PREFABS).length,erros:document.getElementById('edBootErr')?document.getElementById('edBootErr').textContent:''}})()`);
        console.log('EDITOR SELFTEST', JSON.stringify(r)); editorWin.__allowClose = true; app.exit(r.ok ? 0 : 3);
      } catch (err) { console.log('EDITOR SELFTEST FALHOU:', err.message); app.exit(4); }
    }, 500));
  }
  editorWin.loadURL('http://127.0.0.1:' + port + '/editor.html');
}
/* "Testar no jogo": abre o jogo numa janela própria, começando onde a câmera do editor está */
function openGame(port, b) {
  const q = 'test=' + [b.x, b.y, b.z, b.h].map(v => (+v || 0).toFixed(2)).join(',') + (b.car ? '&car=' + encodeURIComponent(b.car) : '');
  if (playWin && !playWin.isDestroyed()) playWin.close();
  playWin = new BrowserWindow({ width: 1600, height: 900, backgroundColor: '#000000', title: 'NEON COAST — teste', autoHideMenuBar: true, webPreferences: { contextIsolation: true, backgroundThrottling: false } });   // sem o preload do jogo: o save de carreira (IPC síncrono) não existe aqui, o teste usa o localStorage
  playWin.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F12') playWin.webContents.toggleDevTools(); if (input.type === 'keyDown' && input.key === 'F11') playWin.setFullScreen(!playWin.isFullScreen()); });
  playWin.maximize();
  playWin.loadURL('http://127.0.0.1:' + port + '/index.html?' + q);
}
app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
