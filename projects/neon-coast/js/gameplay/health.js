/* NEON COAST — Vida, dano, morte e renascimento */
'use strict';
/* ============================ VIDA ============================ */
function leaveCar(){
  const c=player.car;if(!c)return;
  const rx=-Math.cos(c.h),rz=Math.sin(c.h),p={x:c.x-rx*2.6,z:c.z-rz*2.6};
  pushOut(p,0.5,nearby(p.x,p.z));
  player.x=p.x;player.z=p.z;player.y=Hq(p.x,p.z);player.vx=player.vz=0;player.h=c.h;player.car=null;player.mesh.visible=true;
}
function hurt(n,why){
  if(player.dead||n<=0)return;
  player.hp=Math.max(0,player.hp-n);player.regenDelay=8;hurtFlash=1;shake=Math.max(shake,Math.min(1,n/22));
  if(why==='Acidente de carro'&&typeof emsCall==='function'){const p=player.car||player;emsCall(p.x,p.z,n);}   // SAMU/Bombeiros respondem a acidentes
  if(player.hp<=0)die(why);
}
function die(why){
  player.dead=true;player.deadT=4.5;$('deadMsg').textContent=why?'Causa: '+why:'';$('dead').style.display='flex';
  if(player.grabbedBy)releaseGrab(player.grabbedBy,true);
  if(player.car){player.car.speed*=0.3;leaveCar();}
  player.stun=0;player.trans=null;player.mesh.visible=true;money=Math.max(0,money-150);
}
function respawn(){
  player.dead=false;player.hp=100;player.stam=100;player.exhausted=false;player.x=20;player.z=0;player.y=Hq(20,0);player.vx=player.vz=player.vy=0;player.stun=0;
  player.mesh.rotation.x=0;$('dead').style.display='none';cam.a=Math.PI/2;toast('Você foi atendido no hospital  -$150',2800);
}

