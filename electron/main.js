// NEON COAST — aplicativo de desktop (Electron). Abre o jogo numa janela própria, sem navegador.
'use strict';
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const isDev = process.argv.includes('--dev');
if(process.argv.includes('--asset-selftest'))app.setPath('userData',path.join(app.getPath('temp'),'neon-coast-selftest-profile'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8' };

/* servidor local interno: entrega os arquivos do jogo (modelos .bin, texturas, scripts) só para esta janela */
function startServer() {
  return new Promise(resolve => {
    const server = http.createServer(require('./static-server')(root));
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function createWindow() {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, backgroundColor: '#000000', title: 'NEON COAST', show: false,
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') }
  });
  if (!isDev) Menu.setApplicationMenu(null);
  ipcMain.on('neon:quit', event => { if (event.sender === win.webContents) win.close(); });
  ipcMain.on('neon:fullscreen', event => { if (event.sender === win.webContents) win.setFullScreen(!win.isFullScreen()); });
  win.once('ready-to-show', () => { if(!process.argv.includes('--asset-selftest')){win.maximize(); win.show();} });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (isDev && input.key === 'F12') win.webContents.toggleDevTools();
  });
  if (process.argv.includes('--selftest')) {   // verificação automática: carrega, espera, imprime o estado do jogo e sai
    win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
    win.webContents.on('did-fail-load', (e, code, desc) => { console.log('SELFTEST FALHOU: did-fail-load', desc); app.exit(2); });
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(`(async()=>{await new Promise(r=>setTimeout(r,20000));const g=window.__game;if(!g)return{ok:false,erro:'sem __game'};g.start();await new Promise(r=>setTimeout(r,25000));
          const cops=g.cars.filter(c=>c.cop);const count={};g.copCars().forEach(c=>count[c.unit]=(count[c.unit]||0)+1);
          return{ok:true,viaturas:cops.length,patrulhaPorUnidade:count,modelosProntos:Object.keys(g.vehReady),skinsProntas:Object.keys(g.skinReady),
          motoComPolicial:cops.filter(c=>c.rider).length,animacoes:{pacotes:Object.keys(g.ifpReady).length,jogador:g.player.actor&&g.player.actor.type.id,clipeJogador:g.player.actor&&g.player.actor.ap&&g.player.actor.ap.name,clipeMotociclista:(cops.find(c=>c.rider)||{rider:null}).rider&&cops.find(c=>c.rider).rider.ap.name},procurado:{heat:+g.police.heat.toFixed(2),ultimoMotivo:g.police.why,estrelas:g.police.lastStars},triangulos:g.renderer.info.render.triangles}})()`);
        console.log('SELFTEST', JSON.stringify(r)); app.exit(r.ok ? 0 : 3);
      } catch (err) { console.log('SELFTEST FALHOU:', err.message); app.exit(4); }
    }, 1500));
  }
  if(process.argv.includes('--asset-selftest')){
    const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    const timer=setTimeout(()=>{console.error('ASSET SELFTEST timeout');app.exit(5);},120000);
    win.webContents.once('did-finish-load',async()=>{try{
      const result=await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'tools/test-game-renderer.js'),'utf8'));
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,80))))');
      const dest=path.join(app.getPath('temp'),'neon-coast-assets-test.png');fs.writeFileSync(dest,(await win.webContents.capturePage()).toPNG());
      for(const id of ['honda_biz','bus_belem','palio_rp']){
        await win.webContents.executeJavaScript(`(()=>{const type=vehReady[${JSON.stringify(id)}];for(const old of cars)old.mesh.visible=false;const c=new Car(0xeeeeee,0,20,0,false,()=>makeVehicleMesh(type));applyVehDims(c,type.man);c.mesh.position.set(0,Hq(0,20)+0.06,20);player.car=c;updatePlayerSeat(.25);setVehLod(c.mesh.userData,true);updateWeapons(0);const d=type.man.kind==='bus'?10:3;camera.position.set(d,2.6,20+d);camera.lookAt(0,type.man.dims.height/2,20);scene.updateMatrixWorld(true);renderer.render(scene,camera);})()`);
        await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,80))))');
        fs.writeFileSync(path.join(app.getPath('temp'),'neon-coast-'+id+'-test.png'),(await win.webContents.capturePage()).toPNG());
      }
      await win.webContents.executeJavaScript(`(()=>{for(const c of cars)c.mesh.visible=false;player.mesh.visible=false;player.actor.group.visible=false;for(const p of peds)p.mesh.visible=false;peds.slice(0,3).forEach((p,i)=>{p.mesh.visible=true;p.mesh.position.set((i-1)*1.5,.3,20);p.mesh.rotation.y=0;p.wait=1;p.actor.group.visible=true;animateActor(p.actor,.3,'idle',0);});$('toast').style.opacity=0;$('hud').style.display='none';camera.position.set(0,1.7,25);camera.lookAt(0,1.2,20);scene.updateMatrixWorld(true);renderer.render(scene,camera);})()`);
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,80))))');
      fs.writeFileSync(path.join(app.getPath('temp'),'neon-coast-pedestrians-test.png'),(await win.webContents.capturePage()).toPNG());
      console.log('ASSET SELFTEST',JSON.stringify({...result,errors,screenshot:dest}));clearTimeout(timer);app.exit(errors.length?6:0);
    }catch(e){console.error('ASSET SELFTEST',e);clearTimeout(timer);app.exit(4);}});
  }
  win.loadURL('http://127.0.0.1:' + port + '/index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
