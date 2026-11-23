// NEON ENGINE — app desktop (Electron). Abre um PROJETO (pasta com neon.project.json) e edita o mapa dele.
// A engine mora em engine/ (este app, a interface do editor em engine/editor e as ferramentas em engine/tools);
// os projetos ficam em projects/<nome>/ (o NEON COAST é projects/neon-coast). A engine só grava dentro do projeto aberto.
//   desenvolvimento:  npm run editor  [-- --project <pasta>]
//   executável:       npm run build:editor  ->  dist/NEON ENGINE-win32-x64/NEON ENGINE.exe
'use strict';
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');

/* onde está a engine (no .exe, o caminho gravado em engine.json na hora de gerar) */
const ENGINE = (() => { try { const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine.json'), 'utf8')).root; if (r && fs.existsSync(path.join(r, 'editor', 'editor.html'))) return r; } catch (e) { /* desenvolvimento */ } return path.resolve(__dirname, '..'); })();
const P = require(path.join(ENGINE, 'tools', 'project.js'));
const isDev = process.argv.includes('--dev');
let editorWin = null, playWin = null, port = 0, current = null, handler = null;

/* projetos recentes (no perfil do usuário) */
const settingsFile = () => path.join(app.getPath('userData'), 'neon-engine.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { return { recent: [] }; } }
function saveSettings(s) { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { console.warn(e.message); } }
function remember(root) { const s = loadSettings(); s.last = root; s.recent = [root].concat((s.recent || []).filter(r => path.resolve(r) !== path.resolve(root))).filter(P.isProject).slice(0, 10); saveSettings(s); }
const recent = () => (loadSettings().recent || []).filter(P.isProject).map(r => ({ root: r, name: (P.readManifest(r) || {}).name || path.basename(r), folder: path.basename(r), current: current && path.resolve(r) === path.resolve(current) }));

function initialProject() {
  const a = process.argv.indexOf('--project'), cands = [a > 0 ? process.argv[a + 1] : null, process.env.NEON_PROJECT, loadSettings().last].concat(P.listProjects().map(p => p.root));
  for (const c of cands) if (c && P.isProject(c)) return path.resolve(c);
  return null;
}
async function pickProjectFolder() {
  const r = await dialog.showOpenDialog(editorWin, { title: 'Abrir projeto do NEON ENGINE (pasta com neon.project.json)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  if (!P.isProject(r.filePaths[0])) { dialog.showMessageBoxSync(editorWin, { type: 'warning', title: 'NEON ENGINE', message: 'Essa pasta não é um projeto do NEON ENGINE (falta o neon.project.json).' }); return null; }
  return r.filePaths[0];
}
/* troca o projeto servido (mesma porta, a janela recarrega) */
function useProject(root) {
  current = path.resolve(root); remember(current);
  const statics = require(path.join(ENGINE, 'tools', 'static-server.js'))(current, { '/__ed/': path.join(ENGINE, 'editor') });
  delete require.cache[require.resolve('./engine-api')];
  const api = require('./engine-api')({
    root: current, engine: ENGINE, desktop: true, recent,
    pick: async b => { const r = await dialog.showOpenDialog(editorWin, { title: b.title || 'Escolher arquivo', properties: ['openFile'].concat(b.multi ? ['multiSelections'] : []), filters: b.filters || [] }); return r.canceled ? [] : r.filePaths; },
    play: async b => openGame(b),
    reveal: p => shell.showItemInFolder(p),
    openProject: async b => { const root = b.root && P.isProject(b.root) ? b.root : await pickProjectFolder(); if (!root) return false; setTimeout(() => { useProject(root); loadEditor(); }, 50); return true; }
  });
  handler = (req, res) => { if (!api(req, res)) statics(req, res); };
  const m = P.readManifest(current) || {}; if (editorWin) editorWin.setTitle('NEON ENGINE — ' + (m.name || path.basename(current)));
}
const loadEditor = () => editorWin.loadURL('http://127.0.0.1:' + port + '/__ed/editor.html');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function start() {
  const server = http.createServer((req, res) => handler ? handler(req, res) : (res.writeHead(503), res.end()));
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); port = server.address().port;
  editorWin = new BrowserWindow({ width: 1680, height: 960, minWidth: 1100, minHeight: 640, backgroundColor: '#101216', title: 'NEON ENGINE', show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  if (!isDev) Menu.setApplicationMenu(null);
  let root = initialProject();
  if (!root) { root = await pickProjectFolder(); if (!root) { app.quit(); return; } }
  useProject(root);
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
          return{ok:true,projeto:ED.project&&ED.project.manifest&&ED.project.manifest.name,pasta:ED.project&&ED.project.root,api:ED.api,desktop:ED.desktop,arquivo:ED.file,objetos:ED.map.objects.length,carros:ED.map.vehicles.length,modelos:ED.models.length,prefabs:Object.keys(MAP_PREFABS).length,erros:document.getElementById('edBootErr')?document.getElementById('edBootErr').textContent:''}})()`);
        console.log('EDITOR SELFTEST', JSON.stringify(r)); editorWin.__allowClose = true; app.exit(r.ok ? 0 : 3);
      } catch (err) { console.log('EDITOR SELFTEST FALHOU:', err.message); app.exit(4); }
    }, 500));
  }
  loadEditor();
}
/* "Testar": abre o jogo do projeto numa janela própria, começando onde a câmera do editor está */
function openGame(b) {
  const m = P.readManifest(current) || {}, entry = m.entry || 'index.html';
  const q = 'test=' + [b.x, b.y, b.z, b.h].map(v => (+v || 0).toFixed(2)).join(',') + (b.car ? '&car=' + encodeURIComponent(b.car) : '');
  if (playWin && !playWin.isDestroyed()) playWin.close();
  playWin = new BrowserWindow({ width: 1600, height: 900, backgroundColor: '#000000', title: (m.name || 'Jogo') + ' — teste', autoHideMenuBar: true, webPreferences: { contextIsolation: true, backgroundThrottling: false } });   // sem o preload do jogo: o save de carreira (IPC síncrono) não existe aqui, o teste usa o localStorage
  playWin.webContents.on('before-input-event', (e, input) => { if (input.type === 'keyDown' && input.key === 'F12') playWin.webContents.toggleDevTools(); if (input.type === 'keyDown' && input.key === 'F11') playWin.setFullScreen(!playWin.isFullScreen()); });
  playWin.maximize();
  playWin.loadURL('http://127.0.0.1:' + port + '/' + entry + '?' + q);
}
app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
