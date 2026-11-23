/* NEON COAST — Jacarés: modelo e IA de predador */
'use strict';
/* ============================ JACARÉS ============================ */
const gData=(()=>{
  const sk={dark:[0.34,0.43,0.25],pale:[0.8,0.8,0.58]};
  const body=[[3.15,0.04,0.03,0.03,0.27],[3.05,0.2,0.07,0.06,0.27],[2.6,0.26,0.09,0.07,0.27],[2.1,0.3,0.1,0.08,0.28],[1.75,0.43,0.17,0.1,0.3],[1.45,0.5,0.2,0.14,0.34],[0.9,0.6,0.24,0.16,0.37],[0.0,0.67,0.27,0.18,0.38],[-0.9,0.62,0.25,0.17,0.37],[-1.5,0.53,0.22,0.15,0.35],[-2.1,0.41,0.18,0.12,0.32],[-2.8,0.29,0.14,0.09,0.28],[-3.5,0.18,0.1,0.06,0.24],[-4.2,0.09,0.06,0.04,0.2],[-4.8,0.02,0.02,0.02,0.18]];
  const jaw=[[0,0.34,0.05,0.045,-0.02],[0.4,0.3,0.05,0.045,-0.025],[0.9,0.23,0.045,0.04,-0.03],[1.3,0.17,0.04,0.035,-0.03],[1.45,0.05,0.03,0.025,-0.03]];
  function ringGeo(rings,M,dark,pale,ridge){
    const R=rings.length,pos=new Float32Array(R*M*3),uv=new Float32Array(R*M*2),cl=new Float32Array(R*M*3),idx=[];let za=0;
    for(let i=0;i<R;i++){
      const[z,w,ht,hb,yc]=rings[i];if(i>0)za+=Math.abs(rings[i-1][0]-z);
      for(let j=0;j<M;j++){
        const th=j/M*Math.PI*2,c=Math.cos(th),s=Math.sin(th),k=i*M+j;
        let y=yc+(s>0?ht:hb)*s;if(ridge&&w>0.1&&(j===2||j===M/4+1||j===M/4))y+=0.03;
        pos[k*3]=w*c;pos[k*3+1]=y;pos[k*3+2]=z;uv[k*2]=j/M*2;uv[k*2+1]=za*0.6;
        const t=smooth(-0.55,0.45,s);cl[k*3]=lerp(pale[0],dark[0],t);cl[k*3+1]=lerp(pale[1],dark[1],t);cl[k*3+2]=lerp(pale[2],dark[2],t);
      }
    }
    for(let i=0;i<R-1;i++)for(let j=0;j<M;j++){const a=i*M+j,b=i*M+(j+1)%M,c=(i+1)*M+j,d=(i+1)*M+(j+1)%M;idx.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('color',new THREE.BufferAttribute(cl,3));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  function teeth(list){
    const p=[];
    for(const[x,y,z,dir]of list){const h=0.075*dir,r=0.022;
      const b=[[x-r,y,z-r],[x+r,y,z-r],[x+r,y,z+r],[x-r,y,z+r]],a=[x,y+h,z];
      for(let k=0;k<4;k++){const u=b[k],v=b[(k+1)%4];p.push(u[0],u[1],u[2],v[0],v[1],v[2],a[0],a[1],a[2]);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
  }
  const up=[],lo=[];
  for(let k=0;k<10;k++){const z=2.05+k*0.11,w=lerp(0.27,0.15,(z-2)/1.1)*0.85;up.push([-w,0.2,z,-1],[w,0.2,z,-1]);}
  for(let k=0;k<9;k++){const z=0.5+k*0.1,w=lerp(0.25,0.14,z/1.4)*0.85;lo.push([-w,0.0,z,1],[w,0.0,z,1]);}
  return{body:ringGeo(body,12,sk.dark,sk.pale,true),jaw:ringGeo(jaw,10,[0.6,0.65,0.45],[0.8,0.8,0.6],false),teethU:teeth(up),teethL:teeth(lo),rings:body};
})();
const gMat={
  skin:new THREE.MeshStandardMaterial({vertexColors:true,map:T.scute,bumpMap:T.scute,bumpScale:1.2,roughness:0.72,side:THREE.DoubleSide}),
  dark:new THREE.MeshStandardMaterial({color:0x2f3f22,roughness:0.9}),
  eye:new THREE.MeshStandardMaterial({color:0xe8d23a,emissive:0xb89f10,emissiveIntensity:0.7}),
  tooth:new THREE.MeshStandardMaterial({color:0xf0ecd8,side:THREE.DoubleSide}),
  pupil:new THREE.MeshBasicMaterial({color:0x000000})
};
const legGeo=new THREE.BoxGeometry(0.2,0.2,0.26).translate(0.1,-0.1,0),footGeo=new THREE.BoxGeometry(0.26,0.06,0.34).translate(0.22,-0.2,0.05),eyeGeo=new THREE.SphereGeometry(0.055,8,6),pupGeo=new THREE.BoxGeometry(0.012,0.06,0.02);
class Gator{
  constructor(x,z,state){
    this.s=R2(0.44,0.62);
    this.geo=gData.body.clone();this.base=Float32Array.from(this.geo.attributes.position.array);
    const root=new THREE.Group(),inner=new THREE.Group();root.add(inner);
    const body=new THREE.Mesh(this.geo,gMat.skin);body.castShadow=true;inner.add(body);
    inner.add(new THREE.Mesh(gData.teethU,gMat.tooth));
    this.jaw=new THREE.Group();this.jaw.position.set(0,0.2,1.6);inner.add(this.jaw);
    const jm=new THREE.Mesh(gData.jaw,gMat.skin);jm.castShadow=true;this.jaw.add(jm,new THREE.Mesh(gData.teethL,gMat.tooth));
    for(const sx of[-1,1]){const e=new THREE.Mesh(eyeGeo,gMat.eye);e.position.set(sx*0.2,0.44,1.95);inner.add(e);const pu=new THREE.Mesh(pupGeo,gMat.pupil);pu.position.set(sx*0.2,0.44,2.0);inner.add(pu);}
    this.legs=[];
    for(const[sx,sz]of[[-1,0.95],[1,0.95],[-1,-1.0],[1,-1.0]]){
      const l=new THREE.Group();l.position.set(sx*0.52,0.26,sz);l.scale.x=sx;
      const a=new THREE.Mesh(legGeo,gMat.dark),f=new THREE.Mesh(footGeo,gMat.dark);a.castShadow=true;l.add(a,f);inner.add(l);this.legs.push(l);
    }
    root.scale.setScalar(this.s);scene.add(root);this.mesh=root;this.inner=inner;
    this.x=x;this.z=z;this.h=R2(0,6.28);this.home={x,z};this.state=state;this.timer=R2(3,10);this.stam=100;this.alert=0;this.sub=0;this.open=0;this.t=R2(0,20);this.speed=0;
    this.tx=x;this.tz=z;this.rx=x;this.rz=z;this.sated=0;this.chased=0;this.grabT=0;this.biteCd=0;this.dmgT=0;this.ticks=0;this.y=Hq(x,z);this.phase=R2(0,6);this.amp=0.05;
  }
}
function randomWaterNear(x,z,r){for(let k=0;k<16;k++){const a=R2(0,6.28),d=R2(8,r),tx=x+Math.cos(a)*d,tz=z+Math.sin(a)*d,h=Hq(tx,tz);if(h<WL-0.05&&h>-2.8&&gridAt(SWG,tx,tz)>0.3)return[tx,tz];}return null;}
function bankNear(g){for(let k=0;k<16;k++){const a=R2(0,6.28),d=R2(4,32),tx=g.x+Math.cos(a)*d,tz=g.z+Math.sin(a)*d,h=Hq(tx,tz);if(h>WL+0.2&&h<WL+0.9&&gridWD(tx,tz)<9&&gridAt(SWG,tx,tz)>0.4&&Math.abs(tx)>12)return[tx,tz];}return null;}
function go(g,state,timer){
  g.state=state;g.timer=timer||0;
  if(state==='lunge')g.chased=0;
  if(state==='retreat'||state==='flee'){const w=nearestWater(g.x,g.z);g.rx=w[0];g.rz=w[1];}
  if(state==='tired'){g.sated=Math.max(g.sated,9);g.timer=R2(5,8);}
}
function grabPlayer(g){
  go(g,'grab');g.grabT=1.7;g.ticks=0;g.dmgT=0.5;player.grabbedBy=g;player.stun=1.7;shake=1;
  toast('JACARÉ TE AGARROU!  Aperte ESPAÇO!',1400);hurt(12,'Ataque de jacaré');
}
function releaseGrab(g,dead){
  if(player.grabbedBy===g)player.grabbedBy=null;player.stun=0;g.biteCd=10;g.sated=30;g.stam=Math.min(g.stam,70);go(g,'retreat');
  if(!dead){const d=Math.hypot(player.x-g.x,player.z-g.z)||1;player.vx=(player.x-g.x)/d*4;player.vz=(player.z-g.z)/d*4;}
}
function updateGator(g,dt){
  g.t+=dt;g.timer-=dt;g.biteCd=Math.max(0,g.biteCd-dt);g.sated=Math.max(0,g.sated-dt);
  const px=player.x,pz=player.z,dx=px-g.x,dz=pz-g.z,d=Math.hypot(dx,dz),w=inWater(g.x,g.z);
  let seen=false;
  if(!player.dead&&!player.car&&g.sated<=0&&g.state!=='grab'&&g.state!=='tired'){
    const spd=Math.hypot(player.vx,player.vz);let noise=5+spd*2.2+(inWater(px,pz)?6:0);if(g.state==='bask')noise*=0.7;
    if(d<noise)seen=true;else if(d<18&&Math.abs(wrap(Math.atan2(dx,dz)-g.h))<1.4)seen=true;
  }
  g.alert=seen?Math.min(3,g.alert+dt):Math.max(0,g.alert-dt*0.7);
  const car=player.car;
  if(car&&d<18&&Math.abs(car.speed)>3&&g.state!=='flee'&&g.state!=='grab')go(g,'flee',6);
  const preyWD=gridWD(px,pz),facing=Math.abs(wrap(Math.atan2(dx,dz)-g.h));
  let speed=0,desired=g.h,turn=2.0,subT=0,openT=0.03;
  switch(g.state){
    case'bask':
      openT=0.05+0.17*(Math.sin(g.t*0.3)>0.6?1:0);
      if(g.alert>0.9){if(d<11&&preyWD<22&&g.stam>60&&Math.random()<0.4)go(g,'lunge');else go(g,'retreat');}
      break;
    case'lurk':
      subT=0.75;speed=0.12;
      if(g.alert>0.7&&d<34&&preyWD<24)go(g,'stalk',12);
      else if(g.timer<=0){
        if(Math.random()<0.22){const b=bankNear(g);if(b){g.tx=b[0];g.tz=b[1];go(g,'tobank',30);}else go(g,'patrol',20);}
        else{const p=randomWaterNear(g.home.x,g.home.z,55);if(p){g.tx=p[0];g.tz=p[1];}go(g,'patrol',25);}
      }
      break;
    case'patrol':
      subT=0.25;speed=1.1;desired=Math.atan2(g.tx-g.x,g.tz-g.z);
      if(g.alert>0.7&&d<34&&preyWD<24)go(g,'stalk',12);
      else if(Math.hypot(g.tx-g.x,g.tz-g.z)<2.5||g.timer<=0)go(g,'lurk',R2(5,14));
      break;
    case'tobank':
      speed=1.5;desired=Math.atan2(g.tx-g.x,g.tz-g.z);
      if(g.alert>0.7&&d<34&&preyWD<24)go(g,'stalk',12);
      else if(Math.hypot(g.tx-g.x,g.tz-g.z)<2||g.timer<=0)go(g,'bask',R2(20,50));
      break;
    case'stalk':{
      subT=w?1:0;speed=w?1.9:1.2;desired=Math.atan2(dx,dz);
      const start=w?12:9;
      if(seen&&d<start&&facing<1.0&&g.stam>55)go(g,'lunge');
      else if((g.alert<0.15&&g.timer<=0)||d>46||preyWD>26)go(g,'lurk',R2(4,9));
      break;}
    case'lunge':
      speed=w?6.6:8.4;turn=2.5;desired=Math.atan2(dx,dz);openT=d<6?0.7:0.2;
      g.stam-=34*dt;g.chased+=speed*dt;
      if(player.car||player.dead||g.stam<=6||g.chased>28||d>36||preyWD>26)go(g,(g.stam<=6||g.chased>28)?'tired':'retreat');
      else if(d<2.3&&facing<0.75&&g.biteCd<=0&&!player.grabbedBy&&player.stun<=0)grabPlayer(g);
      break;
    case'grab':
      speed=0;openT=0.45+0.3*Math.sin(g.t*14);
      g.grabT-=dt;g.dmgT-=dt;player.stun=Math.max(g.grabT,0);
      if(g.dmgT<=0&&g.ticks<2){g.dmgT=0.55;g.ticks++;hurt(10,'Ataque de jacaré');}
      if(g.state==='grab'&&(g.grabT<=0||player.dead))releaseGrab(g,player.dead);
      break;
    case'tired':
      openT=0.5+0.12*Math.sin(g.t*8);g.stam=Math.min(100,g.stam+14*dt);
      if(g.timer<=0&&g.stam>50)go(g,'retreat');
      break;
    case'retreat':
      speed=w?2.6:4.2;desired=Math.atan2(g.rx-g.x,g.rz-g.z);
      if(w||Math.hypot(g.rx-g.x,g.rz-g.z)<2.5)go(g,'lurk',R2(6,14));
      break;
    case'flee':
      speed=w?5.5:6.5;turn=3;desired=Math.atan2(g.rx-g.x,g.rz-g.z);
      if((w&&d>22)||g.timer<=0)go(g,'lurk',R2(6,12));
      break;
  }
  if(g.state!=='lunge'&&g.state!=='tired')g.stam=Math.min(100,g.stam+7*dt);
  g.h+=clamp(wrap(desired-g.h),-turn*dt,turn*dt);
  g.speed+=(speed-g.speed)*Math.min(1,dt*(speed>g.speed?6:4));
  if(g.state==='grab'){g.x=px-Math.sin(g.h)*1.5;g.z=pz-Math.cos(g.h)*1.5;}
  else{
    const ox=g.x,oz=g.z;g.x+=Math.sin(g.h)*g.speed*dt;g.z+=Math.cos(g.h)*g.speed*dt;
    const q={x:g.x,z:g.z};pushOut(q,0.8,nearby(q.x,q.z));g.x=q.x;g.z=q.z;
    if(Hq(g.x,g.z)<-3||gridAt(SWG,g.x,g.z)<0.15||g.z<HALF+8){g.x=ox;g.z=oz;g.h+=1.2;}
    if(car&&d<3.4){const n=1/Math.max(d,0.1);g.x-=dx*n*(3.4-d)*0.5;g.z-=dz*n*(3.4-d)*0.5;if(Math.abs(car.speed)>2){go(g,'flee',3);car.speed*=0.9;}}
  }
  /* visual */
  g.sub+=(subT-g.sub)*Math.min(1,dt*1.5);
  const ground=Hq(g.x,g.z);
  const ty=(ground<WL)?WL-0.37*g.s+0.05-0.06*g.sub+Math.sin(g.t*1.4)*0.012:ground-0.02;
  g.y+=(ty-g.y)*Math.min(1,dt*5);
  const fh=Hq(g.x+Math.sin(g.h)*1.5,g.z+Math.cos(g.h)*1.5),bh=Hq(g.x-Math.sin(g.h)*1.5,g.z-Math.cos(g.h)*1.5);
  g.mesh.position.set(g.x,g.y,g.z);g.mesh.rotation.y=g.h;
  g.inner.rotation.x=ground<WL?0:-Math.atan2(fh-bh,3);
  g.inner.rotation.z=g.state==='grab'?Math.sin(g.t*14)*0.9:0;
  g.open+=(openT-g.open)*Math.min(1,dt*14);g.jaw.rotation.x=g.open;
  const m=Math.min(1,g.speed/3);
  g.legs.forEach((l,i)=>{l.rotation.x=Math.sin(g.t*7)*0.6*m*((i===0||i===3)?1:-1);l.visible=ground>=WL||g.speed>0.5;});
  g.phase+=dt*(1.4+g.speed*1.1);g.amp+=((0.05+0.14*m)-g.amp)*Math.min(1,dt*4);
  if(Math.hypot(g.x-camera.position.x,g.z-camera.position.z)<170){
    const pa=g.geo.attributes.position,rings=gData.rings,M=12;
    for(let i=0;i<rings.length;i++){
      const z=rings[i][0],wt=smooth(0,-4.8,z)+0.12*smooth(0.9,3.1,z),off=wt*g.amp*Math.sin(g.phase+z*1.1)*2;
      for(let j=0;j<M;j++){const k=(i*M+j)*3;pa.array[k]=g.base[k]+off;}
    }
    pa.needsUpdate=true;
  }
}
/* nascem: parte na água, parte tomando sol */
{
  const wpts=pick(40,90000,SWBOX,(x,z,h)=>gridAt(SWG,x,z)>0.7&&h<WL-0.1&&h>-2.6&&Math.abs(x)>14);
  wpts.slice(0,12).forEach(p=>gators.push(new Gator(p[0],p[1],'lurk')));
  for(const p of wpts.slice(12,40)){
    if(gators.length>=19)break;
    const a=rr(0,6.28);let x=p[0],z=p[1],ok=false;
    for(let k=0;k<30;k++){x+=Math.cos(a);z+=Math.sin(a);if(Hq(x,z)>WL+0.25){ok=true;break;}}
    if(ok&&gridAt(SWG,x,z)>0.5&&Math.abs(x)>12){const gt=new Gator(x,z,'bask');gt.h=a+Math.PI;gators.push(gt);}
  }
}
function updateGators(dt){const cx=camera.position.x,cz=camera.position.z;for(const g of gators){updateGator(g,dt);g.mesh.visible=Math.hypot(g.x-cx,g.z-cz)<230;}fireflies.material.opacity=nightF*(0.55+0.4*Math.sin(performance.now()/400));}

