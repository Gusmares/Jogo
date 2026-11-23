'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(app.getPath('temp'),'neon-interface-test'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
const captures=path.join(app.getPath('temp'),'neon-interface-captures');fs.mkdirSync(captures,{recursive:true});
app.whenReady().then(async()=>{
 const server=http.createServer(require('../electron/static-server')(root));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const win=new BrowserWindow({width:1440,height:900,show:false,webPreferences:{backgroundThrottling:false,preload:path.join(root,'electron/preload.js')}});
 const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 const run=code=>win.webContents.executeJavaScript(code,true);
 const capture=async name=>{await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(captures,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const timeout=setTimeout(()=>{console.error('Interface test timeout');app.exit(2);},180000);
 try{
  await win.loadURL('http://127.0.0.1:'+server.address().port+'/index.html');
  await run(`(async()=>{await Promise.all([menuReady,weaponReady,radioReady,ifpLoaded]);if(!window.__game)throw Error('Game initialization failed');})()`);
  await capture('menu');
  const init=await run(`(async()=>{window.interfaceChecks=[];window.check=(v,m)=>{if(!v)throw Error(m);interfaceChecks.push(m);};check(paused&&!started,'Menu abre sem iniciar jogo');$('overlay').click();check(!started,'Fundo do menu não inicia jogo');$('settingsButton').click();check(gameMenu.panel==='settings'&&paused,'Configurações preservam pausa');$('settingVolume').value=47;$('settingVolume').dispatchEvent(new Event('input'));check(radio.volume===.47,'Volume ajustável');$('settingSensitivity').value=125;$('settingSensitivity').dispatchEvent(new Event('input'));check(gameSettings.sensitivity===1.25,'Sensibilidade ajustável');showMenu('home');$('play').click();check(gameMenu.panel==='skin'&&!started,'Iniciar abre escolha de skin');await selectMenuSkin('player_argentina');check(gameMenu.ready&&gameMenu.preview.actor.type.id==='player_argentina','Prévia 3D pronta');check(gameMenu.skins.length===151,'Todas as 151 skins listadas');check(gameMenu.skins.some(s=>s.role==='policia'),'Fardamentos disponíveis');$('skinSearch').value='argentina';renderSkinList();check($('skinList').children.length>0&&$('skinList').children.length<151,'Busca filtra skins');$('skinSearch').value='';renderSkinList();return {skins:gameMenu.skins.length,weapons:weapons.items.length,stations:radio.stations.length};})()`);
  await capture('skins');
  await win.setSize(960,540);await capture('skins-960');await win.setSize(1440,900);
  await run(`(async()=>{showMenu('settings');})()`);await capture('settings');
  await run(fs.readFileSync(path.join(__dirname,'test-interface-renderer.js'),'utf8'));
  await capture('radio-wheel');
  await run(`closeSelectionWheel(false);player.car=null;openSelectionWheel('weapons');check(selectionWheel.open,'Tab abre arsenal');wheelStep(1);wheelStep(1,true);updateWheelSelection();`);
  await capture('weapon-wheel');
  const result=await run(`(()=>{const e=selectionWheel.entries[selectionWheel.selected],expected=e.items[wheelVariant(e)];closeSelectionWheel(true);check(weapons.selected===expected,'Soltar Tab equipa arma escolhida');updateWeapons(.4);check($('weaponName').textContent===weapons.items[expected].name,'HUD mostra arma equipada');const ammo=weapons.items[expected].ammo;openSelectionWheel('weapons');check(!fireWeapon()&&weapons.items[expected].ammo===ammo,'Roda bloqueia disparos');closeSelectionWheel(false);pauseGame();check(paused&&!selectionWheel.open,'Pausa fecha roda');check(radio.audio.paused||!radioActive(),'Pausa silencia rádio');return {ok:true,checks:interfaceChecks};})()`);
  console.log(JSON.stringify({...init,...result,errors,captures},null,2));clearTimeout(timeout);app.exit(0);
 }catch(e){console.error(e);console.error('Renderer errors:',JSON.stringify(errors));await capture('failure').catch(()=>{});clearTimeout(timeout);app.exit(1);}
});
