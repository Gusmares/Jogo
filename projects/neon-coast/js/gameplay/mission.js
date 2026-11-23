/* NEON COAST — Missões de entrega e interação (entrar/sair do carro) */
'use strict';
/* ============================ OBJETIVO ============================ */
const marker=new THREE.Group();
{
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(5,5,90,24,1,true).translate(0,45,0),new THREE.MeshBasicMaterial({color:0xff3ea5,transparent:true,opacity:0.28,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5.5,0.3,8,32).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff,fog:false}));ring.position.y=0.4;
  marker.add(beam,ring);marker.userData={beam,ring};scene.add(marker);
}
function newObjective(){
  const px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z;
  for(let t=0;t<40;t++){
    // entregas na cidade onde você está; às vezes no pântano (SP) ou do outro lado da Via Dutra
    const C=nearestCity(px,pz),r=Math.random(),far=r<0.18,sw=!far&&C===SP&&r<0.4,D=far?CITIES.find(c=>c!==C):C;
    const x=sw?0:roadC(D.i0+Math.floor(Math.random()*(D.ni+1))),z=sw?R2(HALF+70,HALF+SWD-60):roadC(D.j0+Math.floor(Math.random()*(D.nj+1))),d=Math.hypot(x-px,z-pz);
    if((far&&d>500)||(d>160&&d<460)||t===39){obj={x,z,time:d/11+35,total:d/11+35};marker.position.set(x,Hq(x,z),z);return;}
  }
}
function updateObjective(dt){
  const px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z;
  obj.time-=dt;const d=Math.hypot(obj.x-px,obj.z-pz);
  if(d<9&&!player.dead){const reward=250+Math.floor(Math.max(0,obj.time)*6);money+=reward;toast('ENTREGA CONCLUÍDA  +$'+reward);newObjective();return;}
  if(obj.time<=0){toast('Tempo esgotado!');newObjective();return;}
  $('objInfo').textContent='Vá até o marcador rosa · '+Math.round(d)+' m · '+Math.floor(fmt(obj.time)/60)+':'+String(fmt(obj.time)%60).padStart(2,'0');
}

/* ============================ INTERAÇÃO ============================ */
function nearestCar(){let best=null,bd=4.8;for(const c of cars){const d=Math.hypot(c.x-player.x,c.z-player.z);if(d<bd){bd=d;best=c;}}return best;}
function interact(){
  if(player.dead||player.stun>0||player.trans)return;
  if(player.car){const c=player.car;if(c.physics&&!c.physics.grounded){toast('Espere o carro tocar o chão para sair',1500);return;}if(Math.abs(c.speed)>10){toast('Pare o carro para sair',1200);return;}if(typeof startExitCar==='function')startExitCar();else leaveCar();}
  else{
    const c=nearestCar();if(!c)return;
    if(typeof startEnterCar==='function'){startEnterCar(c);return;}
    const wasAI=c.ai;c.ai=false;c.chase=false;c.police=false;c.ems=null;c.torPatrol=false;if(c.rider)c.rider.group.visible=false;if(c.driver)c.driver.group.visible=false;c.driverGone=true;player.car=c;player.mesh.visible=false;cam.a=c.h;
    if(c.cop)crime(3,'roubo de viatura');else if(wasAI)crime(1,'roubo de carro',true);
  }
}

