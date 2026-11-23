/* Menu principal, preferências e catálogo completo; prévia isolada do jogador. */
'use strict';
const gameSettings={sensitivity:1,quality:'auto',help:false};
try{const s=JSON.parse(localStorage.getItem('neon-settings')||'null');if(s){gameSettings.sensitivity=clamp(Number(s.sensitivity)||1,.25,2);gameSettings.quality=['auto','performance','high'].includes(s.quality)?s.quality:'auto';gameSettings.help=!!s.help;}}catch{}
const gameMenu={panel:'home',skins:[],selected:null,preview:null,request:0,ready:false,loading:false};
function saveSettings(){try{localStorage.setItem('neon-settings',JSON.stringify(gameSettings));}catch{}}
function applySettings(){
 $('help').style.display=gameSettings.help?'block':'none';
 const q=gameSettings.quality;POST.minScale=q==='high'?1:0.5;POST.maxScale=q==='performance'?0.75:1;POST.scale=clamp(POST.scale,POST.minScale,POST.maxScale);POST.bloom=q!=='performance';POST.shadows=q!=='performance';sunLight.castShadow=POST.shadows;postResize();
 $('settingVolume').value=Math.round(radio.volume*100);$('settingVolumeValue').textContent=Math.round(radio.volume*100)+'%';
 $('settingSensitivity').value=Math.round(gameSettings.sensitivity*100);$('settingSensitivityValue').textContent=gameSettings.sensitivity.toFixed(2)+'×';
 $('settingQuality').value=q;$('settingHelp').checked=gameSettings.help;
}
function showMenu(panel){
 gameMenu.panel=panel;$('overlay').style.display='flex';document.body.classList.add('in-menu');$('overlay').dataset.panel=panel;
 for(const name of ['home','skin','settings'])$(name+'Panel').hidden=name!==panel;
 $('play').querySelector('span').textContent=started?'Continuar':'Iniciar';
 $('changeSkin').hidden=!started;$('menuEyebrow').textContent=started?'PAUSADO':'';$('menuEyebrow').hidden=!started;
 $('confirmSkin').textContent=started?'Usar esta skin':'Entrar na cidade';
 $('menuFooterHint').textContent=panel==='home'?'':'ESC · Voltar';
 if(panel==='settings')applySettings();
 if(panel==='skin'){renderSkinList();if(!gameMenu.selected&&gameMenu.skins.length){let id;try{id=localStorage.getItem('neon-skin');}catch{}selectMenuSkin(id||PLAYER_SKINS[player.outfit]||PLAYER_SKINS[0]);}}
 requestAnimationFrame(()=>{const el=panel==='home'?$('play'):panel==='skin'?$('skinSearch'):$('settingVolume');el.focus({preventScroll:true});});
}
function skinRoleName(role){return role==='policia'?'Fardamento':role==='faccao'?'Facção':'Civil';}
function renderSkinList(){
 const query=$('skinSearch').value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,''),filter=$('skinFilter').value;
 const filtered=gameMenu.skins.filter(sk=>(filter==='all'||sk.role===filter)&&sk.name.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query));
 const list=$('skinList');list.replaceChildren();
 filtered.forEach(sk=>{
  const button=document.createElement('button');button.className='skin-card';button.dataset.skin=sk.id;button.classList.toggle('selected',gameMenu.selected===sk.id);button.setAttribute('aria-pressed',String(gameMenu.selected===sk.id));
  const badge=document.createElement('span');badge.className='skin-badge';badge.textContent=sk.role==='policia'?'PM':sk.name.replace(/Jogador\s*[—-]?\s*/,'').slice(0,2).toUpperCase();
  const text=document.createElement('span'),name=document.createElement('b'),role=document.createElement('small');name.textContent=sk.name;role.textContent=sk.available===false?'Arquivo indisponível':skinRoleName(sk.role);text.append(name,role);button.append(badge,text);button.disabled=sk.available===false;button.addEventListener('click',()=>selectMenuSkin(sk.id));list.append(button);
 });
 $('skinCount').textContent=filtered.length+' de '+gameMenu.skins.length+' personagens';$('skinEmpty').hidden=filtered.length>0;
}
function initSkinPreview(){
 if(gameMenu.preview)return gameMenu.preview;
 const render=new THREE.WebGLRenderer({canvas:$('skinPreview'),antialias:true,alpha:true});render.setPixelRatio(Math.min(devicePixelRatio,1.5));render.outputEncoding=THREE.sRGBEncoding;
 const world=new THREE.Scene(),view=new THREE.PerspectiveCamera(30,1,0.05,100);world.add(new THREE.HemisphereLight(0xe6f1ff,0x313e4b,1.6));
 const key=new THREE.DirectionalLight(0xffe7ca,1.7);key.position.set(3,4,5);world.add(key);const rim=new THREE.DirectionalLight(0x65e5dc,1.3);rim.position.set(-3,3,-2);world.add(rim);
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(.8,.9,.035,64),new THREE.MeshStandardMaterial({color:0x20393c,roughness:.5}));floor.position.y=-.03;world.add(floor);
 gameMenu.preview={render,world,view,actor:null,width:0,height:0};return gameMenu.preview;
}
async function selectMenuSkin(id){
 const sk=gameMenu.skins.find(s=>s.id===id&&s.available!==false)||gameMenu.skins.find(s=>s.available!==false);if(!sk)return;
 const request=++gameMenu.request;gameMenu.selected=sk.id;gameMenu.ready=false;$('confirmSkin').disabled=true;
 $('skinName').textContent=sk.name;$('skinRole').textContent=skinRoleName(sk.role);$('skinStatus').textContent='Carregando prévia…';renderSkinList();
 try{
  const p=initSkinPreview();if(p.actor)p.actor.group.visible=false;
  const [type]=await Promise.all([loadSkin(sk.id),ifpLoaded]);if(request!==gameMenu.request)return;
  if(p.actor){p.world.remove(p.actor.group);p.actor.mesh.skeleton.dispose();}
  p.actor=makeActor(type);p.actor.group.rotation.y=.3;p.world.add(p.actor.group);animateActor(p.actor,.01,'idle',0);
  const height=Math.max(1.3,type.man.maxY-type.man.minY);
  p.view.position.set(0,height*.54,height*2.65);p.view.lookAt(0,height*.52,0);
  gameMenu.ready=true;$('confirmSkin').disabled=false;$('skinStatus').textContent='Tudo pronto. Essa é a sua próxima história.';
 }catch(e){if(request!==gameMenu.request)return;$('skinStatus').textContent='Não foi possível carregar esta skin. Escolha outra para continuar.';console.warn('Prévia:',sk.id,e);}
}
function updateMenuPreview(dt){
 const p=gameMenu.preview;if(gameMenu.panel!=='skin'||!paused||!p)return;
 const rect=$('skinPreview').getBoundingClientRect();if(!rect.width||!rect.height)return;
 if(p.width!==rect.width||p.height!==rect.height){p.width=rect.width;p.height=rect.height;p.render.setSize(rect.width,rect.height,false);p.view.aspect=rect.width/rect.height;p.view.updateProjectionMatrix();}
 if(p.actor&&p.actor.group.visible){animateActor(p.actor,dt,'idle',0);p.actor.group.rotation.y+=dt*.16;}
 p.render.render(p.world,p.view);
}
$('play').addEventListener('click',()=>started?startGame():showMenu('skin'));
$('changeSkin').addEventListener('click',()=>showMenu('skin'));
$('settingsButton').addEventListener('click',()=>showMenu('settings'));
$('quitButton').addEventListener('click',()=>{if(window.neonDesktop)window.neonDesktop.quit();else{window.close();$('menuFooterHint').textContent='Pode fechar esta aba para sair.';}});
$('fullscreenButton').addEventListener('click',()=>{if(window.neonDesktop)window.neonDesktop.fullscreen();else if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});});
for(const button of document.querySelectorAll('[data-menu-back]'))button.addEventListener('click',()=>showMenu('home'));
$('skinSearch').addEventListener('input',renderSkinList);$('skinFilter').addEventListener('change',renderSkinList);
$('confirmSkin').addEventListener('click',async()=>{
 if(!gameMenu.ready||gameMenu.loading)return;gameMenu.loading=true;$('confirmSkin').disabled=true;
 const id=gameMenu.selected,success=await loadPlayerOutfit(PLAYER_SKINS.indexOf(id),false);gameMenu.loading=false;
  if(success&&gameMenu.panel==='skin'&&gameMenu.selected===id){try{localStorage.setItem('neon-skin',id);}catch{}startGame();}else if(!success) $('skinStatus').textContent='Falha ao aplicar skin. Tente outra.';
 $('confirmSkin').disabled=!gameMenu.ready;
});
$('settingVolume').addEventListener('input',e=>{radio.volume=Number(e.target.value)/100;saveRadio();$('settingVolumeValue').textContent=e.target.value+'%';});
$('settingSensitivity').addEventListener('input',e=>{gameSettings.sensitivity=Number(e.target.value)/100;saveSettings();$('settingSensitivityValue').textContent=gameSettings.sensitivity.toFixed(2)+'×';});
$('settingQuality').addEventListener('change',e=>{gameSettings.quality=e.target.value;saveSettings();applySettings();});
$('settingHelp').addEventListener('change',e=>{gameSettings.help=e.target.checked;saveSettings();applySettings();});
addEventListener('keydown',e=>{if(e.code!=='Escape')return;e.preventDefault();if(!paused){pauseGame();return;}if(gameMenu.panel!=='home')showMenu('home');else if(started)startGame();});
const menuReady=outfitCatalogReady.then(skins=>{gameMenu.skins=skins;if(gameMenu.panel==='skin')showMenu('skin');return skins;}).catch(e=>{$('skinCount').textContent='Não foi possível carregar o catálogo.';console.warn(e);return [];});
applySettings();showMenu('home');
