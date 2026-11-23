/* Adaptação do solver ao mundo, controles, colisores e modelos do NEON COAST. Motos usam a física anterior. */
'use strict';
const usesCarPhysics = c => c.kind !== 'prop';      // carro, ônibus e moto usam o mesmo solver (a moto tem o modelo de inclinação)
function carGroundHeight(x,z){
  // Mesmos triângulos da malha visível: Hq é bilinear e diverge nas diagonais das colinas.
  const fx=(x-X0)/CS,fz=(z-Z0)/CS;
  if(fx<0||fz<0||fx>=NX||fz>=NZ)return -12;
  const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,i=iz*W1+ix;
  let height=tx+tz<=1?HG[i]+tx*(HG[i+1]-HG[i])+tz*(HG[i+W1]-HG[i]):HG[i+W1+1]+(1-tx)*(HG[i+W1]-HG[i+W1+1])+(1-tz)*(HG[i+1]-HG[i+W1+1]);
  if(cityAt(x,z)){
    const bi=Math.floor((x+HALF)/P),bj=Math.floor((z+HALF)/P);
    const slab=!!blockOK(bi,bj)&&Math.abs(x-blockC(bi))<=B/2&&Math.abs(z-blockC(bj))<=B/2;
    height=Math.max(height,slab?.3:.06);
  }
  if(Math.abs(x)<6&&z>HALF&&z<HALF+SWD-30)height=Math.max(height,.12);
  if(typeof MAP_SURF!=='undefined'&&MAP_SURF.size)height=Math.max(height,mapGroundAt(x,z));   // rampas e pisos colocados no editor (placements.js)
  return height;
}
function sampleCarGround(x,z){
  const height=carGroundHeight(x,z),e=.3;
  let name='terra',grip=.7,rolling=.45;
  if(inCity(x,z)||onHighway(x,z)||onMorumbiRoad(x,z,2)||(Math.abs(x)<6&&z>HALF&&z<HALF+SWD-30)||onFavelaRoad(x,z)){name='asfalto';grip=1;rolling=0;}
  else if(height<WL+.08){name='lama';grip=.38;rolling=1.3;}
  else if(height<WL+1.3){name='areia';grip=.53;rolling=.95;}
  return {height,name,grip,rolling,gx:(carGroundHeight(x+e,z)-carGroundHeight(x-e,z))/(2*e),gz:(carGroundHeight(x,z+e)-carGroundHeight(x,z-e))/(2*e)};
}
function ensureCarPhysics(c){
  if(!usesCarPhysics(c))return null;
  const u=c.mesh.userData;
  if(!c.physics||c.physics.mesh!==c.mesh){
    const wheels=u.wheels.map(w=>({x:w.pivot.position.x,y:w.pivot.position.y,z:w.pivot.position.z,r:w.radius||c.wr,front:w.front}));
    CarPhysics.create(c,wheels,{},sampleCarGround);c.physics.mesh=c.mesh;
    u.wheels.forEach((w,i)=>{w.rest=c.physics.wheels[i];w.baseFlip=w.w.rotation.y;});
  }
  // Reposicionamentos de spawn/debug são reinicializados; impulsos comuns preservam a suspensão.
  if(Math.hypot(c.x-c.physics.lastX,c.z-c.physics.lastZ)>15){c.physics=null;return ensureCarPhysics(c);}
  return c.physics;
}
function physicsCrash(c,impact){
  if(c===player.car&&c.crashCd<=0&&impact>7){hurt((impact-7)*2,'Acidente de carro');c.crashCd=.7;shake=Math.max(shake,Math.min(1,impact/25));}
}
function advanceCarPhysics(c,dt,input){
  const p=ensureCarPhysics(c),ox=c.x,oz=c.z;
  c.crashCd=Math.max(0,c.crashCd-dt);
  CarPhysics.step(c,c===player.car?input:{...input,maxSpeed:(c.handling||{}).maxSpeed||46},dt,sampleCarGround);   // o jogador anda no limite do próprio carro (perfil em car-physics-core.js)
  if(carGroundHeight(c.x,c.z)<-1.6){c.x=ox;c.z=oz;p.vx*=.5;p.vz*=.5;CarPhysics.syncSpeed(c);}
  for(let pass=0;pass<2;pass++)for(const [cx,cz] of carCircles(c)){
    const q={x:cx,z:cz},hit=pushOut(q,c.cr,nearby(cx,cz));
    if(!hit)continue;
    const correction=Math.hypot(q.x-cx,q.z-cz);
    const impact=CarPhysics.collide(c,null,hit.nx,hit.nz,correction,cx-hit.nx*c.cr,cz-hit.nz*c.cr);
    physicsCrash(c,impact);
    if(typeof applyVehicleDamage==='function'){const bx=hit.box,thin=bx&&Math.max(bx.x1-bx.x0,bx.z1-bx.z0)<1.3;applyVehicleDamage(c,impact,null,cx-hit.nx*c.cr,cz-hit.nz*c.cr,hit.nx,hit.nz,{kind:thin?'pole':'wall'});}
  }
  if(p.impact){physicsCrash(c,p.impact);if(typeof applyVehicleDamage==='function'&&p.impact>9)applyVehicleDamage(c,p.impact,null,c.x,c.z,undefined,undefined,{kind:'land'});p.impact=0;}
  p.lastX=c.x;p.lastZ=c.z;
}
function driveCarAI(c,dt,target,diff){
  const p=ensureCarPhysics(c),error=target-c.speed;
  let throttle=clamp(error/4,-1,1),brake=0;
  if(c.speed*error<0&&Math.abs(c.speed)>.4){brake=clamp(Math.abs(error)/5,0,1);throttle=0;}
  advanceCarPhysics(c,dt,{throttle,brake,steer:clamp(diff*1.6,-1,1)*(target<0?-1:1),park:Math.abs(target)<.1&&Math.abs(c.speed)<.2});
}
function drivePlayerPhysics(c,dt){
  ensureCarPhysics(c);
  const forward=!!keys.KeyW,back=!!keys.KeyS;
  let throttle=0,brake=0;
  if(forward&&back)brake=1;
  else if(forward){if(c.speed<-.6)brake=1;else throttle=1;}
  else if(back){if(c.speed>.6)brake=1;else throttle=-.65;}
  advanceCarPhysics(c,dt,{throttle,brake,handbrake:!!keys.Space,steer:(keys.KeyA?1:0)-(keys.KeyD?1:0),park:keys.Space&&Math.abs(c.speed)<.2});
}
function resolvePhysicsCars(a,b){
  if(!usesCarPhysics(a)||!usesCarPhysics(b))return false;
  const pa=ensureCarPhysics(a),pb=ensureCarPhysics(b);
  if(Math.abs(pa.y-pb.y)>Math.max(1.4,(pa.cfg.cg+pb.cfg.cg)*1.4))return true;
  if(Math.hypot(a.x-b.x,a.z-b.z)>(a.len+b.len)/2+1)return true;
  let depth=0,nx=0,nz=0,px=0,pz=0;
  for(const [ax,az]of carCircles(a))for(const [bx,bz]of carCircles(b)){
    const dx=ax-bx,dz=az-bz,d=Math.hypot(dx,dz),pen=a.cr+b.cr-d;
    if(pen>depth){depth=pen;nx=d>.0001?dx/d:Math.cos(a.h);nz=d>.0001?dz/d:-Math.sin(a.h);px=(ax+bx)/2;pz=(az+bz)/2;}
  }
  if(depth>0){
    const impact=CarPhysics.collide(a,b,nx,nz,depth,px,pz);
    physicsCrash(a,impact);physicsCrash(b,impact);
    if(typeof applyVehicleDamage==='function'){applyVehicleDamage(a,impact,b,px,pz,nx,nz);applyVehicleDamage(b,impact,a,px,pz,-nx,-nz);}
    if(impact>2){const pc=a===player.car?a:b===player.car?b:null;if(pc)carHitCrime(pc,pc===a?b:a);}
  }
  return true;
}
function renderCarPhysics(c){
  const p=ensureCarPhysics(c),u=c.mesh.userData,k=p.cfg;
  if(p.bike){
    // moto: inclina em torno da linha de contato com o chão (como na vida real), não em torno do centro de massa
    c.mesh.position.set(c.x,p.y-k.cg,c.z);
  }else{
    const offset=CarPhysics.rotate({x:0,y:k.cg,z:p.centerZ},c.h,p.pitch,p.roll);
    c.mesh.position.set(c.x-offset.x,p.y-offset.y,c.z-offset.z);
  }
  c.mesh.rotation.set(p.pitch,c.h,p.roll,'YXZ');u.tilt.rotation.set(0,0,0);
  for(let i=0;i<u.wheels.length;i++){
    const w=u.wheels[i],r=p.wheels[i];
    // altura da roda vem direto do curso da suspensão calculado na física (sempre dentro do limite): a roda nunca sai do chassi
    w.pivot.position.y=r.y+clamp(r.offset,-k.sag,k.travel);
    if(w.front){
      if(p.bike)w.pivot.rotation.y=clamp(c.steer,-.45,.45)*.6;
      else{const sign=Math.sign(c.steer),radius=p.wheelbase/Math.max(.001,Math.abs(Math.tan(c.steer)));w.pivot.rotation.y=sign*Math.atan(p.wheelbase/Math.max(.5,radius-sign*r.x));}
    }
    // giro = ângulo real da física (proporcional à velocidade). O passo por quadro é limitado para a roda não "piscar" em alta velocidade.
    // O sinal é o mesmo nos dois lados: a roda do lado esquerdo só está virada 180° em torno do eixo vertical.
    const d=r.spin-(w.lastSpin===undefined?r.spin:w.lastSpin);w.lastSpin=r.spin;
    w.vis=(w.vis||0)+clamp(d,-1.45,1.45);
    w.w.rotation.x=w.vis;
  }
}
function recoverPlayerCar(){
  const c=player.car;if(!c||!usesCarPhysics(c))return;
  if(Math.abs(c.speed)>1){toast('Pare o carro para reposicionar',1400);return;}
  c.speed=0;if(typeof repairVehicle==='function')repairVehicle(c);c.physics=null;ensureCarPhysics(c);renderCarPhysics(c);toast('Carro reposicionado e consertado',1400);
}
addEventListener('keydown',e=>{if(e.code==='Backspace'&&started&&!paused&&player.car){e.preventDefault();if(!e.repeat)recoverPlayerCar();}});
