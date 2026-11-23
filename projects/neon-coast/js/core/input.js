/* NEON COAST — Teclado, mouse e áudio */
'use strict';
/* ============================ ENTRADA ============================ */
const keys={},cam={a:Math.PI/2,p:0.25,lastMouse:0};
let started=false,paused=true,locked=false,dragging=false,shake=0,hurtFlash=0;
addEventListener('keydown',e=>{
  if(paused || !started)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  keys[e.code]=true;
  if(e.code==='Space'&&player.grabbedBy)player.grabbedBy.grabT-=0.3;
  if(e.code==='KeyF'&&started&&!paused)interact();
  if(e.code==='KeyG'&&started&&!paused&&typeof cycleEmote==='function')cycleEmote();
  if(e.code==='KeyO'&&started&&!paused&&typeof cycleOutfit==='function')cycleOutfit(e.shiftKey);
  if(e.code==='KeyL'&&player.car&&player.car.cop)player.car.sirenManual=!player.car.sirenManual;
  if(e.code==='F7'&&typeof togglePhysicsMode==='function'){e.preventDefault();togglePhysicsMode();}
  if(e.code==='KeyH')$('help').style.display=$('help').style.display==='none'?'block':'none';
});
addEventListener('keyup',e=>{keys[e.code]=false;});
addEventListener('mousedown',()=>{dragging=true;});addEventListener('mouseup',()=>{dragging=false;});
addEventListener('mousemove',e=>{if(paused||!(locked||dragging))return;const sens=((typeof weapons!=='undefined'&&weapons.aim>0.5)?0.62:1)*(typeof gameSettings!=='undefined'?gameSettings.sensitivity:1);cam.a-=e.movementX*0.0028*sens;cam.p=clamp(cam.p+e.movementY*0.0025*sens,-0.35,1.3);cam.lastMouse=performance.now();});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===$('c');if(!locked&&started&&!paused)pauseGame();});
function startGame(){started=true;paused=false;Object.keys(keys).forEach(k=>keys[k]=false);$('overlay').style.display='none';document.body.classList.remove('in-menu');try{const p=$('c').requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(e){}initAudio();if(audio)audio.ac.resume().catch(()=>{});}
function pauseGame(){if(typeof closeSelectionWheel==='function')closeSelectionWheel(false);paused=true;Object.keys(keys).forEach(k=>keys[k]=false);dragging=false;if(audio)audio.g.gain.setTargetAtTime(0,audio.ac.currentTime,0.04);if(typeof showMenu==='function')showMenu('home');if(document.pointerLockElement)document.exitPointerLock();}
addEventListener('blur',()=>{if(started&&!paused)pauseGame();});

/* ============================ ÁUDIO ============================ */
let audio=null;
function initAudio(){
  if(audio)return;
  try{const ac=new(window.AudioContext||window.webkitAudioContext)(),o1=ac.createOscillator(),o2=ac.createOscillator(),f=ac.createBiquadFilter(),g=ac.createGain();
    o1.type='sawtooth';o2.type='square';f.type='lowpass';f.frequency.value=500;g.gain.value=0;o1.connect(f);o2.connect(f);f.connect(g);g.connect(ac.destination);o1.start();o2.start();audio={ac,o1,o2,f,g};}catch(e){}
}
addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);dragging=false;});
function updateAudio(){
  if(!audio)return;const c=player.car,t=audio.ac.currentTime;
  if(c){const s=Math.abs(c.speed),fr=48+s*3.4;audio.o1.frequency.setTargetAtTime(fr,t,0.05);audio.o2.frequency.setTargetAtTime(fr*0.5,t,0.05);audio.f.frequency.setTargetAtTime(350+s*28,t,0.05);audio.g.gain.setTargetAtTime(0.035+Math.min(s,40)*0.0011,t,0.08);}
  else audio.g.gain.setTargetAtTime(0,t,0.1);
}

