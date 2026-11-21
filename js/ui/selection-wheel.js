/* Rodas compartilhadas: Alt no veículo, Tab a pé. Sem soltar o pointer lock. */
'use strict';
const selectionWheel={open:false,mode:'',entries:[],selected:0,variants:new Map(),x:0,y:0,car:null};
const WEAPON_GROUPS=[['hands','Desarmado'],['pistol','Pistolas'],['smg','Submetralhadoras'],['rifle','Fuzis'],['shotgun','Escopetas'],['sniper','Precisão'],['taser','Taser'],['melee','Corpo a corpo']];
function weaponCategory(w){const s=w.style||(w.id==='fn_fal'?'rifle':'pistol');return ['deagle','pistol'].includes(s)?'pistol':['smg','smg2'].includes(s)?'smg':['shotgun','spas','sawnoff'].includes(s)?'shotgun':['knife','katana'].includes(s)?'melee':s;}
function wheelWeaponEntries(){return WEAPON_GROUPS.map(([id,name])=>({id,name,items:id==='hands'?[-1]:weapons.items.map((w,i)=>weaponCategory(w)===id?i:null).filter(i=>i!==null)})).filter(e=>e.items.length);}
const WEAPON_ICONS={hands:'M24 41V24q0-5 5-5t5 5v10-20q0-5 5-5t5 5v18-19q0-5 5-5t5 5v20-15q0-5 5-5t5 5v24q0 19-20 19H34L17 42q-5-7 1-10z',pistol:'M12 21h53v14H43l-5 25H21l5-25H12z M44 35v10h-8',smg:'M8 22h64v11H44l5 25H37l-7-25h-9v14H10z M55 22v-8',rifle:'M5 32h17l8-10h34v7h14v5H49l6 22H43l-6-22H25l-9 13H5z M45 22v-7h15v7',shotgun:'M5 26h73v7H39l-9 12H7z M40 34h27v7H40z',sniper:'M4 32h29l5-9h22v7h20v4H52l-8 19H32l4-19H22L9 46H4z M40 23V14h17v9',taser:'M18 20h46v15H42l-4 25H23l5-25H18z M52 20v-7 M60 20v-7',melee:'M21 59l-8-8 16-16 7 7z M30 34L62 5q3 21-23 37z'};
function weaponIcon(category){return '<svg class="weapon-icon" viewBox="0 0 84 68" aria-hidden="true"><path d="'+(WEAPON_ICONS[category]||WEAPON_ICONS.rifle)+'"/></svg>';}
function openSelectionWheel(mode){
 if(selectionWheel.open||!started||paused||player.dead||player.trans)return;
 if(mode==='radio'&&(!player.car||!radio.stations.length))return;
 if(mode==='weapons'&&(player.car||!weapons.items.length))return;
 const w=selectionWheel;w.open=true;w.mode=mode;w.car=player.car;w.x=w.y=0;
 weapons.trigger=false;weapons.fired=false;keys.MouseRight=false;Object.keys(keys).forEach(k=>keys[k]=false);dragging=false;
 if(mode==='radio'){
  const r=ensureCarRadio(player.car);w.entries=[{name:'Rádio desligado',genre:'Silêncio',mark:'OFF',color:'#a9b7c8',station:-1},...radio.stations.map((s,i)=>({...s,station:i}))];w.selected=r.enabled?r.station+1:0;
 }else{
  w.entries=wheelWeaponEntries();w.selected=Math.max(0,w.entries.findIndex(e=>e.items.includes(weapons.selected)));
  const entry=w.entries[w.selected];w.variants.set(entry.id,Math.max(0,entry.items.indexOf(weapons.selected)));
 }
 $('selectionWheel').hidden=false;document.body.classList.add('wheel-open');
 $('wheelTitle').textContent=mode==='radio'?'Encontre sua frequência.':'Escolha seu equipamento.';
 $('wheelEyebrow').textContent=mode==='radio'?'RÁDIO DO VEÍCULO':'ARSENAL';
 $('wheelInstruction').innerHTML=mode==='radio'?'<kbd>ALT</kbd> Solte para sintonizar · Mouse ou setas para escolher':'<kbd>TAB</kbd> Solte para equipar · Roda do mouse troca a arma da categoria';
 renderWheel();
}
function wheelVariant(entry){return (selectionWheel.variants.get(entry.id)||0)%entry.items.length;}
function renderWheel(){
 const w=selectionWheel,n=w.entries.length,svg=$('wheelSegments');svg.replaceChildren();$('wheelItems').replaceChildren();
 const point=(r,a)=>[300+Math.sin(a)*r,300-Math.cos(a)*r];
 w.entries.forEach((entry,i)=>{
  const angle=i*2*Math.PI/n,half=Math.PI/n-0.012,points=[point(280,angle-half),point(280,angle+half),point(151,angle+half),point(151,angle-half)];
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',`M${points[0]} A280 280 0 0 1 ${points[1]} L${points[2]} A151 151 0 0 0 ${points[3]}Z`);path.dataset.index=i;svg.append(path);
  const button=document.createElement('button');button.className='wheel-item';button.dataset.index=i;
  button.style.left=(50+Math.sin(angle)*36)+'%';button.style.top=(50-Math.cos(angle)*36)+'%';
  if(w.mode==='radio'){const mark=document.createElement('b');mark.className='station-mark';mark.textContent=entry.mark;button.append(mark);}else button.innerHTML=weaponIcon(entry.id);
  const label=document.createElement('span');label.textContent=entry.name;button.append(label);button.setAttribute('aria-label',entry.name);
  button.addEventListener('pointerenter',()=>{if(!locked){w.selected=i;updateWheelSelection();}});
  button.addEventListener('click',()=>{w.selected=i;updateWheelSelection();});$('wheelItems').append(button);
 });updateWheelSelection();
}
function updateWheelSelection(){
 const w=selectionWheel,e=w.entries[w.selected];if(!e)return;
 const color=w.mode==='radio'?e.color:'#c9f583';$('selectionWheel').style.setProperty('--wheel-accent',color);
 document.querySelectorAll('#wheelItems button,#wheelSegments path').forEach(el=>{const active=Number(el.dataset.index)===w.selected;el.classList.toggle('selected',active);if(el.tagName==='BUTTON')el.setAttribute('aria-pressed',String(active));});
 if(w.mode==='radio'){
  $('wheelGenre').textContent=e.genre;$('wheelName').textContent=e.name;$('wheelDetail').textContent=e.station<0?'Só você e a cidade.':radioBroadcast(radio.stations[e.station]).track.title;
  $('wheelCounter').textContent=e.station<0?'DESLIGAR':'TRANSMISSÃO AO VIVO';
 }else{
  const variant=wheelVariant(e),item=weapons.items[e.items[variant]];
  $('wheelGenre').textContent=e.name;$('wheelName').textContent=item?item.name:'Mãos livres';
  $('wheelDetail').textContent=item?(wAnim(item).melee?'Combate corpo a corpo':item.ammo+' / '+item.capacity+' no carregador'):'Guarde sua arma.';
  $('wheelCounter').textContent=e.items.length>1?(variant+1)+' / '+e.items.length+' · RODA DO MOUSE':'PRONTO PARA EQUIPAR';
 }
 $('wheelCursor').style.transform=`translate(${w.x}px,${w.y}px)`;
}
function closeSelectionWheel(commit=false){
 const w=selectionWheel;if(!w.open)return;const entry=w.entries[w.selected];
 w.open=false;$('selectionWheel').hidden=true;document.body.classList.remove('wheel-open');
 if(commit&&started&&!paused&&!player.dead&&!player.trans){
  if(w.mode==='radio'&&player.car===w.car)selectRadioStation(entry.station);
  if(w.mode==='weapons'&&!player.car)equipWeapon(entry.items[wheelVariant(entry)]);
 }
 Object.keys(keys).forEach(k=>keys[k]=false);weapons.trigger=false;keys.MouseRight=false;
}
function wheelStep(delta,variant=false){const w=selectionWheel,e=w.entries[w.selected];if(variant&&w.mode==='weapons')w.variants.set(e.id,(wheelVariant(e)+delta+e.items.length)%e.items.length);else w.selected=(w.selected+delta+w.entries.length)%w.entries.length;updateWheelSelection();}
addEventListener('keydown',e=>{
 if((e.code==='AltLeft'||e.code==='AltRight'||e.code==='Tab')&&started&&!paused){
  e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)openSelectionWheel(e.code==='Tab'?'weapons':'radio');return;
 }
 if(!selectionWheel.open)return;
 if(e.code==='Escape'){e.preventDefault();closeSelectionWheel(false);}
 if(e.code==='ArrowLeft')wheelStep(-1);if(e.code==='ArrowRight')wheelStep(1);
 if(e.code==='ArrowUp')wheelStep(-1,true);if(e.code==='ArrowDown')wheelStep(1,true);
 e.preventDefault();e.stopImmediatePropagation();
},true);
addEventListener('keyup',e=>{const w=selectionWheel;if(!w.open)return;if((w.mode==='radio'&&['AltLeft','AltRight'].includes(e.code))||(w.mode==='weapons'&&e.code==='Tab')){e.preventDefault();closeSelectionWheel(true);}e.stopImmediatePropagation();},true);
addEventListener('mousemove',e=>{
 const w=selectionWheel;if(!w.open)return;e.stopImmediatePropagation();
 const rect=$('wheelSegments').getBoundingClientRect(),radius=rect.width*.43;
 if(locked){w.x+=e.movementX;w.y+=e.movementY;}else{w.x=e.clientX-rect.left-rect.width/2;w.y=e.clientY-rect.top-rect.height/2;}
 const len=Math.hypot(w.x,w.y);if(len>radius){w.x*=radius/len;w.y*=radius/len;}
 if(len>30){const a=(Math.atan2(w.x,-w.y)+Math.PI*2)%(Math.PI*2);w.selected=Math.round(a/(Math.PI*2)*w.entries.length)%w.entries.length;}
 updateWheelSelection();
},true);
addEventListener('wheel',e=>{if(!selectionWheel.open)return;e.preventDefault();e.stopImmediatePropagation();wheelStep(e.deltaY>0?1:-1,true);},{capture:true,passive:false});
for(const event of ['mousedown','mouseup'])addEventListener(event,e=>{if(selectionWheel.open)e.stopImmediatePropagation();},true);
addEventListener('blur',()=>closeSelectionWheel(false));
