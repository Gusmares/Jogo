/* NEON COAST — Atualização: jogador a pé, carros, pedestres */
'use strict';
/* ============================ ATUALIZAÇÃO ============================ */
function updateFoot(dt){
  const gy0=Hq(player.x,player.z),wasGround=player.y<=gy0+0.04;
  if(player.dead){player.vx=player.vz=0;player.mesh.rotation.x=-1.45;player.mesh.position.set(player.x,player.y+0.25,player.z);if(typeof updatePlayerActor==='function')updatePlayerActor(dt,0,true,gy0);return;}
  const stunned=player.stun>0;
  const sa=Math.sin(cam.a),ca=Math.cos(cam.a),mx=stunned?0:(keys.KeyW?1:0)-(keys.KeyS?1:0),mz=stunned?0:(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const dx=sa*mx-ca*mz,dz=ca*mx+sa*mz,l=Math.hypot(dx,dz);
  const aimingNow=typeof weaponAim==='function'&&weaponAim();
  const wantSprint=!aimingNow&&(keys.ShiftLeft||keys.ShiftRight)&&!player.exhausted&&l>0;
  if(wantSprint){player.stam-=22*dt;if(player.stam<=0){player.stam=0;player.exhausted=true;toast('Sem fôlego!',900);}}
  else{player.stam=Math.min(100,player.stam+(l>0?10:16)*dt);if(player.exhausted&&player.stam>25)player.exhausted=false;}
  const wade=Hq(player.x,player.z)<WL;
  const sp=(wantSprint?9:aimingNow?2.7:4.8)*(wade?0.6:1),tx=l>0?dx/l*sp:0,tz=l>0?dz/l*sp:0,k=Math.min(1,dt*(player.y>gy0+0.1?3:12));
  if(stunned){player.vx=player.vz=0;}else{player.vx+=(tx-player.vx)*k;player.vz+=(tz-player.vz)*k;}
  const ox=player.x,oz=player.z;let nx=ox+player.vx*dt,nz=oz+player.vz*dt;
  const step=Math.hypot(nx-ox,nz-oz);
  if(step>1e-5&&wasGround&&(Hq(nx,nz)-gy0)>0.95*step){nx=ox;nz=oz;player.vx=player.vz=0;}
  if(Hq(nx,nz)<-1.6){nx=ox;nz=oz;}
  const p={x:nx,z:nz};pushOut(p,0.5,nearby(p.x,p.z));
  for(const c of cars)for(const[cx,cz]of carCircles(c)){const ddx=p.x-cx,ddz=p.z-cz,d=Math.hypot(ddx,ddz),rr_=0.5+c.cr;if(d<rr_&&d>1e-4){p.x+=ddx/d*(rr_-d);p.z+=ddz/d*(rr_-d);}}
  if(typeof forNear==='function')forNear(p.x,p.z,1.2,o=>{if(o.ph==='hit'||o.ph==='dead'||o.ph==='down')return;const dx=p.x-o.x,dz=p.z-o.z,d=Math.hypot(dx,dz),min=0.5+(o.r||0.34);if(d<min&&d>1e-4){const w=(o.fixed||o.anchored)?1:0.5;p.x+=dx/d*(min-d)*w;p.z+=dz/d*(min-d)*w;}});
  player.x=p.x;player.z=p.z;
  const gy=Hq(player.x,player.z);let jumped=false;
  if(keys.Space&&wasGround&&!stunned){player.vy=7.5;jumped=true;}
  player.vy-=24*dt;player.y+=player.vy*dt;
  if(player.y<gy||(wasGround&&!jumped&&player.vy<=0&&player.y-gy<0.5)){player.y=gy;player.vy=0;}
  const spd=Math.hypot(player.vx,player.vz);
  if(aimingNow)player.h+=wrap(cam.a-player.h)*Math.min(1,dt*18);
  else if(spd>0.4)player.h+=wrap(Math.atan2(player.vx,player.vz)-player.h)*Math.min(1,dt*14);
  if(stunned&&player.grabbedBy)player.h+=wrap(Math.atan2(player.grabbedBy.x-player.x,player.grabbedBy.z-player.z)-player.h)*Math.min(1,dt*8);
  player.phase+=spd*dt*2.4;animPerson(player.mesh,player.phase,Math.min(spd/6,1)*0.9);
  const wy=(player.y<gy+0.3&&gy<WL)?Math.min(0.55,0.15+(WL-gy)*0.8):0;
  const jit=stunned?(Math.random()-0.5)*0.18:0;
  player.mesh.rotation.x=0;player.mesh.position.set(player.x+jit,player.y-wy,player.z+jit);player.mesh.rotation.y=player.h;
  if(typeof updatePlayerActor==='function')updatePlayerActor(dt,spd,wasGround,gy);
}
function driveCar(c,dt){
  const ox=c.x,oz=c.z;
  c.x+=Math.sin(c.h)*c.speed*dt;c.z+=Math.cos(c.h)*c.speed*dt;
  for(let pass=0;pass<2;pass++)for(const [cx,cz] of carCircles(c)){
    const q={x:cx,z:cz},qx=q.x,qz=q.z,hit=pushOut(q,c.cr,nearby(q.x,q.z));
    if(hit){c.x+=q.x-qx;c.z+=q.z-qz;const dot=Math.sin(c.h)*hit.nx+Math.cos(c.h)*hit.nz;
      if(c.speed*dot<0){
        if(c===player.car&&c.crashCd<=0){const imp=Math.abs(c.speed*dot);if(imp>12){hurt((imp-12)*2.2,'Acidente de carro');c.crashCd=0.5;}}
        c.speed*=1-0.55*Math.abs(dot);}}
  }
  const step=Math.hypot(c.x-ox,c.z-oz),hN=Hq(c.x,c.z);
  if(hN<-0.7||(step>1e-4&&(hN-Hq(ox,oz))/step>0.85)){c.x=ox;c.z=oz;c.speed*=0.25;}
}
function updatePlayerCar(c,dt){
  if(usesCarPhysics(c)){drivePlayerPhysics(c,dt);return;}
  c.crashCd=Math.max(0,c.crashCd-dt);
  const h=c.handling||{},W=keys.KeyW,Sb=keys.KeyS,hand=keys.Space,MAXV=h.maxSpeed||46;let acc=0;
  if(W)acc=c.speed<0?(h.brake||30):(h.acceleration||17)*(1-Math.max(0,c.speed)/MAXV);
  if(Sb)acc=c.speed>0.5?-(h.brake||30):-9;
  if(!W&&!Sb)acc=-Math.sign(c.speed)*Math.min(Math.abs(c.speed)/Math.max(dt,1e-3),4.5);
  if(hand)c.speed-=Math.sign(c.speed)*Math.min(Math.abs(c.speed),38*dt);
  const hf=Hq(c.x+Math.sin(c.h)*1.4,c.z+Math.cos(c.h)*1.4),hb=Hq(c.x-Math.sin(c.h)*1.4,c.z-Math.cos(c.h)*1.4);
  acc-=Math.sin(Math.atan2(hf-hb,2.8))*7;
  c.speed=clamp(c.speed+acc*dt,-11,MAXV);
  const sin=(keys.KeyA?1:0)-(keys.KeyD?1:0),maxSteer=0.62/(1+Math.abs(c.speed)*0.07);
  c.steer+=(sin*maxSteer-c.steer)*Math.min(1,dt*8);c.h+=c.speed/(h.wheelbase||2.8)*Math.tan(c.steer)*dt;
  if(hand&&Math.abs(c.speed)>8)c.h+=sin*1.1*dt*Math.sign(c.speed);
  driveCar(c,dt);
}
function updateAICar(c,dt){
  if(Math.hypot(c.tx-c.x,c.tz-c.z)<8)chooseNext(c);
  const diff=wrap(Math.atan2(c.tx-c.x,c.tz-c.z)-c.h),fx=Math.sin(c.h),fz=Math.cos(c.h);
  let blocked=false;const look=c.len/2+7+Math.max(0,c.speed)*0.7;
  const test=(ox,oz)=>{const along=ox*fx+oz*fz,lat=-ox*fz+oz*fx;return along>0&&along<look&&Math.abs(lat)<2.7;};
  if((c.pedAhead||99)<look*0.9)blocked=true;
  if(c.ghost<=0){for(const o of cars){if(o!==c&&test(o.x-c.x,o.z-c.z)){blocked=true;break;}}if(!blocked&&!player.car&&!player.dead&&test(player.x-c.x,player.z-c.z))blocked=true;}
  if(blocked&&c.speed<0.5){c.stuck+=dt;if(c.stuck>5){c.ghost=3;c.stuck=0;}}else c.stuck=0;
  c.ghost=Math.max(0,c.ghost-dt);
  let lightStop=99;                                                   // semáforo à frente (só no eixo em que o carro anda): para na faixa de retenção
  { const dxn=c.to[0]-c.from[0],dzn=c.to[1]-c.from[1],nx=roadC(c.to[0]),nz=roadC(c.to[1]),ahead=(nx-c.x)*dxn+(nz-c.z)*dzn;
    if(ahead>0&&ahead<70&&c.speed>=0){const st=lightState(c.to[0],c.to[1],dxn?'x':'z'),toLine=ahead-14.2,brake=c.speed*c.speed/10;
      if(st!==0&&toLine>-1.2&&(st===2||toLine>brake+1.5))lightStop=Math.max(0,toLine);}}
  let target=blocked?0:c.cruise*(1-Math.min(0.55,Math.abs(diff)*0.6));
  if(lightStop<99)target=Math.min(target,lightStop<0.6?0:Math.sqrt(2*4.2*Math.max(0,lightStop-0.4)));
  if(usesCarPhysics(c)){driveCarAI(c,dt,target,diff);return;}
  c.speed+=clamp(target-c.speed,-24*dt,6*dt);if(c.speed>0.3)c.h+=clamp(diff*3,-1.7,1.7)*dt;c.steer=clamp(diff,-0.5,0.5);driveCar(c,dt);
}
let carPhysicsAccumulator=0;
function updateCars(dt){
  carPhysicsAccumulator=Math.min(.15,carPhysicsAccumulator+dt);
  while(carPhysicsAccumulator+1e-9>=CarPhysics.STEP){stepCars(CarPhysics.STEP);carPhysicsAccumulator-=CarPhysics.STEP;}
  for(const c of cars)if(usesCarPhysics(c)&&!c.sleep)renderCarPhysics(c);
  if(typeof updateDamageEffects==='function')updateDamageEffects(dt);
}
function stepCars(dt){
  for(const c of cars){
    if(c===player.car)updatePlayerCar(c,dt);else if(c.ai)(c.ems?updateEmsCar:c.chase?updatePoliceChase:c.torPatrol?updateTorPatrol:updateAICar)(c,dt);
    else if(usesCarPhysics(c)){if(c.sleep)continue;advanceCarPhysics(c,dt,{brake:.4,park:Math.abs(c.speed)<.15});}
    else if(c.speed!==0){c.speed-=Math.sign(c.speed)*Math.min(Math.abs(c.speed),14*dt);c.steer*=0.9;driveCar(c,dt);}
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    if(resolvePhysicsCars(cars[i],cars[j]))continue;
    const a=cars[i],b=cars[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),lim=(a.len+b.len)*0.48;
    if(d<lim&&d>1e-4){
      let pen=0,nx=0,nz=0;const rr=a.cr+b.cr;
      for(const [ax,az] of carCircles(a))for(const [bx,bz] of carCircles(b)){const dd=Math.hypot(bx-ax,bz-az),pp=rr-dd;if(pp>pen){pen=pp;nx=dd>0.0001?(bx-ax)/dd:dx/d;nz=dd>0.0001?(bz-az)/dd:dz/d;}}
      if(pen<=0)continue;
      const aS=!a.ai&&a!==player.car,bS=!b.ai&&b!==player.car;if(aS&&bS)continue;
      const pc=a===player.car?a:(b===player.car?b:null);
      if(pc&&pc.crashCd<=0&&Math.abs(pc.speed)>13){hurt((Math.abs(pc.speed)-13)*1.8,'Acidente de carro');pc.crashCd=0.7;}
      if(pc)carHitCrime(pc,pc===a?b:a);
      if(aS){b.x+=nx*pen;b.z+=nz*pen;}else if(bS){a.x-=nx*pen;a.z-=nz*pen;}else{a.x-=nx*pen/2;a.z-=nz*pen/2;b.x+=nx*pen/2;b.z+=nz*pen/2;}
      if(Math.abs(a.speed)>2)a.speed*=0.93;if(Math.abs(b.speed)>2)b.speed*=0.93;
    }
  }
  for(const c of cars){
    if(usesCarPhysics(c))continue;
    if(c.z>HALF&&inWater(c.x,c.z))c.speed*=Math.max(0,1-1.4*dt);
    const m=c.mesh,u=m.userData,gy=Hq(c.x,c.z);
    const hf=Hq(c.x+Math.sin(c.h)*1.4,c.z+Math.cos(c.h)*1.4),hb=Hq(c.x-Math.sin(c.h)*1.4,c.z-Math.cos(c.h)*1.4);
    m.position.set(c.x,gy+0.06,c.z);m.rotation.y=c.h;
    u.tilt.rotation.x=lerp(u.tilt.rotation.x,-Math.atan2(hf-hb,2.8),Math.min(1,dt*8));
    u.tilt.rotation.z=lerp(u.tilt.rotation.z,-c.steer*clamp(c.speed,-30,30)*(c.kind==='bike'?0.03:0.012),Math.min(1,dt*6));
    for(const w of u.wheels){w.w.rotation.x+=c.speed*dt/c.wr;if(w.front)w.pivot.rotation.y=c.steer;}
  }
}
function perimPoint(s,h){const L=2*h;s=((s%(4*L))+4*L)%(4*L);const side=Math.floor(s/L),t=s-side*L;return side===0?[-h+t,-h]:side===1?[h,-h+t]:side===2?[h-t,h]:[-h,h-t];}
function updatePeds(dt){if(typeof updateNpcs==='function')updateNpcs(dt);}
