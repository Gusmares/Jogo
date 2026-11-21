/* NEON COAST — Carros, tráfego, jogador (estado) */
'use strict';
/* ============================ CARROS / JOGADOR ============================ */
const cars=[];
class Car{
  constructor(color,x,z,h,ai,factory){
    this.mesh=(factory||makeCarMesh)(color);scene.add(this.mesh);
    this.x=x;this.z=z;this.h=h;this.speed=0;this.steer=0;this.ai=ai;this.cruise=R2(9,15);
    this.hl=1.3;this.cr=1.15;this.len=4.4;this.wr=0.38;
    this.from=[0,0];this.to=[0,0];this.tx=0;this.tz=0;this.stuck=0;this.ghost=0;this.crashCd=0;
    cars.push(this);
    if(typeof ensureCarRadio==='function')ensureCarRadio(this);
  }
}
const player={x:20,z:0,y:0,vx:0,vz:0,vy:0,h:0,car:null,phase:0,hp:100,stam:100,exhausted:false,regenDelay:0,dead:false,deadT:0,stun:0,grabbedBy:null,
  mesh:makePerson(shirtMats[0],pantsMats[0],skinMats[1])};
player.y=Hq(player.x,player.z);scene.add(player.mesh);
/* vizinhos de um cruzamento na grade global (cidades + rodovia) */
const neighbors=(i,j)=>{const r=[];for(const n of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]])if(nodeOK(n[0],n[1]))r.push(n);return r;};
/* sorteia um cruzamento existente perto de (x,z), a até k quadras */
function nodeNear(x,z,k){const[ci,cj]=nodeIJ(x,z);for(let t=0;t<40;t++){const i=ci+Math.round(R2(-k,k)),j=cj+Math.round(R2(-k,k));if(nodeOK(i,j))return[i,j];}const c=nearestCity(x,z);return[clamp(ci,c.i0,c.i0+c.ni),clamp(cj,c.j0,c.j0+c.nj)];}
function setTarget(c){
  const a=c.from,b=c.to;let dx=roadC(b[0])-roadC(a[0]),dz=roadC(b[1])-roadC(a[1]);const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
  c.tx=roadC(b[0])+(-dz)*4.2;c.tz=roadC(b[1])+dx*4.2;
}
function chooseNext(c){
  const b=c.to;let opts=neighbors(b[0],b[1]).filter(n=>!(n[0]===c.from[0]&&n[1]===c.from[1]));
  if(!opts.length)opts=neighbors(b[0],b[1]);
  const dx=b[0]-c.from[0],dz=b[1]-c.from[1],straight=opts.find(n=>n[0]-b[0]===dx&&n[1]-b[1]===dz);
  const pick_=(straight&&Math.random()<0.55)?straight:opts[Math.floor(Math.random()*opts.length)];
  c.from=b;c.to=pick_;setTarget(c);
}
function spawnAI(){
  for(let tries=0;tries<30;tries++){
    const i=Math.floor(Math.random()*(N+1)),j=Math.floor(Math.random()*(N+1)),nb=neighbors(i,j),b=nb[Math.floor(Math.random()*nb.length)];
    const ax=roadC(i),az=roadC(j),bx=roadC(b[0]),bz=roadC(b[1]);let dx=bx-ax,dz=bz-az;const l=Math.hypot(dx,dz);dx/=l;dz/=l;
    const t=R2(0.3,0.7),x=lerp(ax,bx,t)+(-dz)*4.2,z=lerp(az,bz,t)+dx*4.2,px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z;
    if(Math.hypot(x-px,z-pz)<110)continue;
    if(cars.some(o=>Math.hypot(o.x-x,o.z-z)<8))continue;
    const c=new Car(CAR_COLORS[Math.floor(Math.random()*CAR_COLORS.length)],x,z,Math.atan2(dx,dz),true);
    if(window.upgradeTrafficCar)window.upgradeTrafficCar(c);
    c.from=[i,j];c.to=b;setTarget(c);c.speed=c.cruise;return c;
  }
}
for(let i=0;i<10;i++)spawnAI();
[[-4.5,28,0],[-3,HALF+40,0],[4.5,48,Math.PI],[-4.5,-30,0],[4.5,-52,Math.PI],[30,4.5,Math.PI/2],[-30,-4.5,-Math.PI/2]].forEach(([x,z,h],i)=>{new Car(CAR_COLORS[(i*3)%CAR_COLORS.length],x,z,h,false);});
/* cada carro tem as próprias dimensões de colisão: hl = meia distância entre os círculos, cr = raio, len = comprimento, wr = raio da roda */
const carCircles=c=>{const n=Math.max(1,Math.ceil(2*c.hl/(c.cr*1.5))),out=[];for(let i=0;i<=n;i++){const t=-c.hl+2*c.hl*i/n;out.push([c.x+Math.sin(c.h)*t,c.z+Math.cos(c.h)*t]);}return out;};
const CAR_R=1.15;

