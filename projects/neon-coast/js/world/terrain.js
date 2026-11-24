/* NEON COAST — Terreno: altura, costa, serra, morros com favela, pântano, praia do Rio, malha e distância até a água */
'use strict';
/* ============================ TERRENO ============================ */
const HG=new Float32Array(W1*(NZ+1)),LDG=new Float32Array(HG.length),SWG=new Float32Array(HG.length),WCG=new Float32Array(HG.length),HFG=new Float32Array(HG.length);
let _ld=0,_sw=0,_wc=0,_hf=0;
const LAKES=[[-190,HALF+215,62,2.5],[170,HALF+300,50,2.0],[-60,HALF+120,28,1.2]];

/* ---------- morros com favela ----------
   Cada morro tem um referencial local: u = da cidade para a crista (atravessa o morro), v = ao longo da crista.
   Crista alongada e irregular, encosta íngreme voltada para a cidade e uma ladeira em zigue-zague que sobe até uma quadra. */
const FAVS=[
  {id:'esperanca',name:'Morro da Esperança',city:'sp',cx:430,cz:-92,ux:1,uz:0,a:100,b:125,R:100,H:40,seed:90210,label:'MORRO DA ESPERANÇA'},
  {id:'alemao',name:'Morro do Alemão',city:'rj',cx:RJ.cx-175,cz:RJ.z0-122,ux:0,uz:-1,a:96,b:122,R:100,H:46,seed:31337,phase:2.1,label:'COMPLEXO DO ALEMÃO'},
  {id:'rocinha',name:'Rocinha',city:'rj',cx:RJ.cx+200,cz:RJ.z0-140,ux:0,uz:-1,a:118,b:160,R:100,H:62,seed:77001,phase:4.4,label:'ROCINHA'}
];
for(const F of FAVS){F.vx=-F.uz;F.vz=F.ux;F.road=[];F.flats=[];}
const favLocal=(F,x,z)=>{const dx=x-F.cx,dz=z-F.cz;return[dx*F.ux+dz*F.uz,dx*F.vx+dz*F.vz];};
const favWorld=(F,u,v)=>[F.cx+u*F.ux+v*F.vx,F.cz+u*F.uz+v*F.vz];
const favRidgeU=(F,v)=>10*Math.sin(v/34+(F.phase||0));
const favDist=(F,x,z)=>{const[u,v]=favLocal(F,x,z);return Math.hypot(u/F.a,v/F.b)*F.R;};
function favMorroH(F,x,z){
  const[u0,v]=favLocal(F,x,z),e=Math.hypot(u0/F.a,v/F.b);if(e>1.2)return 0;
  const u=(u0-favRidgeU(F,v))/F.a,vv=v/(F.b*0.62),env=Math.exp(-vv*vv*0.8);
  let h=F.H*Math.exp(-u*u*1.1)*env+(fbm(x*0.045+4+(F.phase||0)*7,z*0.045-2,3)-0.5)*9*env;
  let cd=1e9;for(const c of CITIES)cd=Math.min(cd,cityDist(c,x,z));
  return Math.max(0,h*(1-smooth(0.95,1.2,e))*smooth(20,95,cd));
}
/* 1 dentro da comunidade, cai a 0 na borda */
const favMask1=(F,x,z)=>1-smooth(F.R*0.7,F.R*1.0,favDist(F,x,z));
const favelaMask=(x,z)=>{let m=0;for(const F of FAVS){const k=favMask1(F,x,z);if(k>m)m=k;}return m;};
const favAt=(x,z)=>{let b=FAVS[0],bd=1e9;for(const F of FAVS){const d=favDist(F,x,z)/F.R;if(d<bd){bd=d;b=F;}}return b;};
const FAV=FAVS[0];                                                       // compatibilidade: o morro de São Paulo
const favD=(x,z)=>favDist(FAV,x,z);

/* ---------- Rio: morros atrás da cidade (Corcovado com o Cristo), praia curva ao sul, baía a leste e o Pão de Açúcar no mar ---------- */
const RIO={beachZ:x=>RJ.z1+62+22*Math.sin((x-RJ.cx)/190)+14*Math.cos((x-RJ.cx)/77),
  corcovado:{x:RJ.x0+40,z:RJ.z0-235,H:205,r:70},
  paoAcucar:{x:RJ.x1+95,z:RJ.z1+175,H:105,r:42},urca:{x:RJ.x1+30,z:RJ.z1+128,H:48,r:30}};
function rioPeaks(x,z){
  let h=0;const C=RIO.corcovado,d=Math.hypot(x-C.x,(z-C.z)*0.8)/C.r;
  if(d<3.2)h=Math.max(h,C.H*Math.exp(-Math.pow(d,1.6)*0.9)+(fbm(x*0.03,z*0.03+7,3)-0.5)*14*Math.exp(-d*0.6));
  // serra contínua atrás da zona norte (liga os morros e fecha o horizonte)
  const ridge=RJ.z0-300+30*Math.sin((x-RJ.cx)/160),dr=(z-ridge)/90;
  if(x>RJ.x0-260&&x<RJ.x1+120)h=Math.max(h,(70+40*fbm(x*0.006+3,1.7,3))*Math.exp(-dr*dr)*smooth(RJ.x0-260,RJ.x0-80,x)*(1-smooth(RJ.x1-40,RJ.x1+120,x)));
  return h;
}
function rockDome(R,x,z){const d=Math.hypot(x-R.x,z-R.z)/R.r;if(d>1.6)return -99;const s=Math.max(0,1-Math.pow(d,2.4));return R.H*Math.pow(s,0.55)-0.4+(fbm(x*0.08,z*0.08,2)-0.5)*3;}

/* ---------- Via Dutra: perfil da pista (terreno suavizado com rampa máxima de 5,5%) ---------- */
const HWY_PROF=[],HWY_STEP=6;
function hwyH(x){if(x<=HWY.x0)return 0;if(x>=HWY.x1)return 0;const f=(x-HWY.x0)/HWY_STEP,i=Math.floor(f);return lerp(HWY_PROF[i]||0,HWY_PROF[i+1]||0,f-i);}

function rawBase(x,z){
  // massa de terra: São Paulo + pântano, a serra entre as cidades e o Rio (cujo sul é a linha da praia)
  const Usp=smin(sdBox(x,z,0,0,HALF+230,HALF+230),sdBox(x,z,0,HALF+SWD/2-20,HALF+110,SWD/2+150),50);
  const Ucor=sdBox(x,z,(HALF+RJ.x0)/2,40,(RJ.x0-HALF)/2+120,430);
  const Urj=Math.max(sdBox(x,z,RJ.cx-40,-120,RJ.hx+330,560),z-RIO.beachZ(x),x-(RJ.x1+70+40*smooth(RJ.z0,RJ.z0-260,z)));
  const U=smin(smin(Usp,Ucor,90),Urj,70);
  const nearRio=1-smooth(60,420,cityDist(RJ,x,z)), corr=smooth(HALF+120,HALF+260,x)*(1-smooth(RJ.x0-200,RJ.x0-60,x));
  const coast=((fbm(x*0.0045+7,z*0.0045-3,4)-0.5)*260+(fbm(x*0.015,z*0.015+9,3)-0.5)*40)*(1-nearRio*0.9)*(1-corr*0.85);
  const ld=U-coast;_ld=ld;
  let dc=1e9;for(const c of CITIES)dc=Math.min(dc,cityDist(c,x,z));
  const t=clamp(-ld/45,0,1);
  let h;
  if(ld>=0){const q=Math.min(ld,300);h=WL-q*0.03-(q/300)*(q/300)*9;}
  else h=WL+t*t*(3-2*t)*1.9+(fbm(x*0.01+1,z*0.01+4,3)-0.5)*4.5*smooth(0.2,1,t);
  const sw=smooth(HALF-5,HALF+70,z)*(1-smooth(HALF+30,HALF+170,Math.abs(x)))*smooth(0,0.6,t);_sw=sw;
  const hf=smooth(70,220,dc)*clamp(-ld/90,0,1)*(1-sw);_hf=hf;
  if(hf>0)h+=hf*(Math.max(0,fbm(x*0.0032+3,z*0.0032+5,4)-0.32)*130+fbm(x*0.02,z*0.02,3)*6)*(1+corr*0.35);
  if(sw<0.5&&ld<-10){let mh=0;for(const F of FAVS){const k=favMorroH(F,x,z);if(k>mh)mh=k;}if(mh>0)h+=mh;}
  if(ld<-5&&x>RJ.x0-300){const rp=rioPeaks(x,z)*smooth(15,90,dc)*clamp(-ld/40,0,1);if(rp>0)h=Math.max(h,h*0.4+rp);}
  const wc=1-smooth(0,70,dc);_wc=wc;
  h=lerp(h,0,wc);
  for(const R of [RIO.paoAcucar,RIO.urca]){const r=rockDome(R,x,z);if(r>h)h=r;}
  const cw=(1-smooth(7,26,Math.abs(x)))*smooth(HALF+2,HALF+16,z)*(1-smooth(HALF+SWD-45,HALF+SWD-10,z));
  if(cw>0)h=lerp(h,0.10,cw);
  return h;
}
/* perfil da rodovia */
{
  const n=Math.ceil((HWY.x1-HWY.x0)/HWY_STEP)+1;let p=[];
  for(let i=0;i<n;i++){const x=HWY.x0+i*HWY_STEP;let s=0;for(const dz of [-14,-6,0,6,14])s+=rawBase(x,HWY.z+dz);p.push(Math.max(0.3,s/5));}
  for(let k=0;k<40;k++)p=p.map((h,i)=>(p[Math.max(0,i-1)]+h*2+p[Math.min(n-1,i+1)])/4);
  p[0]=0;p[n-1]=0;const g=0.055*HWY_STEP;
  for(let i=1;i<n;i++)p[i]=Math.min(p[i],p[i-1]+g);for(let i=n-2;i>=0;i--)p[i]=Math.min(p[i],p[i+1]+g);
  for(let i=1;i<n;i++)p[i]=Math.max(p[i],p[i-1]-g);for(let i=n-2;i>=0;i--)p[i]=Math.max(p[i],p[i+1]-g);
  p[0]=0;p[n-1]=0;HWY_PROF.push(...p);
}
/* ladeiras das favelas: zigue-zague de rampa constante (~8%) com curvas fechadas, gerado no referencial do morro */
for(const F of FAVS){
  const rb=(u,v)=>{const w=favWorld(F,u,v);return rawBase(w[0],w[1]);};
  const v0=0.144*F.b,pts0=[[-F.a-30,v0],[-F.a-6,v0],[-F.a+16,v0]];let u=-F.a+16,v=v0,dirV=-1,legs=0,safety=0;const top=F.H*0.75;
  const vMin=-F.b*0.77,vMax=F.b*0.94;
  while(safety++<1200){
    let best=null;
    for(let fe=-0.5;fe<=0.95;fe+=0.05){
      const du=fe,dv=dirV*Math.sqrt(1-fe*fe),nu=u+du*3,nv=v+dv*3,gain=rb(nu,nv)-rb(u,v),pu=-dv,pv=du,cross=Math.abs(rb(nu+pu*3,nv+pv*3)-rb(nu-pu*3,nv-pv*3));
      const cost=Math.abs(gain-0.26)*3+Math.max(0,cross-3.6)*1.2+Math.abs(fe-0.18)*0.15;
      if(nu<-F.a+10||nu>favRidgeU(F,nv)-6||!(rb(nu,nv)>WL+0.6))continue;
      if(!best||cost<best.cost)best={cost,nu,nv,gain};
    }
    const out=!best||(dirV<0?best.nv<vMin:best.nv>vMax)||best.cost>3.2;
    if(!best||out){
      if(legs>=4||(rb(u,v)>top))break;
      const bulge=dirV<0?1:-1,R=8.5;
      for(let k=1;k<=10;k++){const tt=k/10*Math.PI;pts0.push([u+bulge*R*Math.sin(tt)*0.9,v-dirV*R*(1-Math.cos(tt))]);}
      u=pts0[pts0.length-1][0];v=pts0[pts0.length-1][1];dirV=-dirV;legs++;continue;
    }
    u=best.nu;v=best.nv;pts0.push([u,v]);
    if(rb(u,v)>top&&legs>=2)break;
  }
  let pts=pts0.map(([pu,pv])=>favWorld(F,pu,pv));
  for(let it=0;it<2;it++){const o=[pts[0]];for(let i=0;i<pts.length-1;i++){const p=pts[i],q=pts[i+1];o.push([p[0]*0.75+q[0]*0.25,p[1]*0.75+q[1]*0.25],[p[0]*0.25+q[0]*0.75,p[1]*0.25+q[1]*0.75]);}o.push(pts[pts.length-1]);pts=o;}
  const res=[pts[0]];let acc=0;for(let i=1;i<pts.length;i++){let p=pts[i-1],q=pts[i],d=Math.hypot(q[0]-p[0],q[1]-p[1]);while(acc+d>=3){const tt=(3-acc)/d;p=[p[0]+(q[0]-p[0])*tt,p[1]+(q[1]-p[1])*tt];res.push(p);d=Math.hypot(q[0]-p[0],q[1]-p[1]);acc=0;}acc+=d;}
  let hs=res.map(p=>rawBase(p[0],p[1]));
  for(let k=0;k<26;k++)hs=hs.map((h,i)=>(hs[Math.max(0,i-1)]+h*2+hs[Math.min(hs.length-1,i+1)])/4);
  res.forEach((p,i)=>F.road.push([p[0],p[1],hs[i]]));
  const e=F.road[F.road.length-1],e2=favWorld(F,favLocal(F,e[0],e[1])[0]+6,favLocal(F,e[0],e[1])[1]-2);
  F.flats.push({x:e2[0],z:e2[1],rx:F.uz?11:17,rz:F.uz?17:11,h:e[2]});         // quadra/praça plana no fim da ladeira (alinhada ao morro)
}
const FAV_ROAD=FAV.road,FAV_FLATS=FAV.flats;
const FAV_ROAD_HW=3.4;
function favRoadNearF(F,x,z){            // ponto mais próximo da ladeira: {d, h, i, x, z}
  let bd=1e9,bh=0,bi=0,bx=0,bz=0;const R=F.road;
  for(let i=0;i<R.length-1;i++){const a=R[i],b=R[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1,t=clamp(((x-a[0])*dx+(z-a[1])*dz)/l2,0,1),px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz);if(d<bd){bd=d;bh=lerp(a[2],b[2],t);bi=i+t;bx=px;bz=pz;}}
  return{d:bd,h:bh,i:bi,x:bx,z:bz};
}
const favRoadNear=(x,z)=>favRoadNearF(favAt(x,z),x,z);
/* ---------- SP oeste: Rio Pinheiros canalizado (paredes de concreto, água abaixo da rua), Ponte Estaiada sobre um aterro
   escondido pelo tabuleiro (carro e pedestre andam no terreno, sem física especial) e a esplanada do Morumbi ---------- */
const PINH={x0:-351,x1:-315,z0:-414,z1:324,bz:roadC(6),water:-1.6,deck:[137,159]};
const MORUMBI={x:-447,z:roadC(6),rx:44,rz:38};
const inPinh=(x,z,m=0)=>x>PINH.x0-m&&x<PINH.x1+m&&z>PINH.z0-m&&z<PINH.z1+m;
const onMorumbiRoad=(x,z,m=0)=>x<PINH.x1+12&&x>MORUMBI.x-MORUMBI.rx*0.5&&Math.abs(z-PINH.bz)<RW/2+m;
const nearMorumbi=(x,z,m=0)=>Math.hypot((x-MORUMBI.x)/(MORUMBI.rx+m),(z-MORUMBI.z)/(MORUMBI.rz+m))<1;
const spWestBusy=(x,z,m=0)=>inPinh(x,z,m+24)||onMorumbiRoad(x,z,m+4)||nearMorumbi(x,z,m+18);
function spWestH(x,z,h){
  if(x>-290||x<-540||z<PINH.z0-60||z>PINH.z1+60)return h;
  const e=Math.hypot((x-MORUMBI.x)/(MORUMBI.rx+18),(z-MORUMBI.z)/(MORUMBI.rz+18)),wp=1-smooth(1,1.45,e);
  const wr=(1-smooth(RW/2+1,RW/2+12,Math.abs(z-PINH.bz)))*smooth(MORUMBI.x-30,MORUMBI.x,x)*(1-smooth(-309,-305,x));   // avenida/ponte no nível da rua (0,06)
  const wb=smooth(-392,-372,x)*(1-smooth(-312,-306,x))*(1-smooth(PINH.z1,PINH.z1+40,z))*smooth(PINH.z0-40,PINH.z0,z);   // margens planas
  if(wb>0)h=lerp(h,0.3,wb);const w2=Math.max(wp,wr);if(w2>0)h=lerp(h,0.06,w2);
  if(x>=PINH.x0+1&&x<=PINH.x1-1&&z>=PINH.z0&&z<=PINH.z1&&Math.abs(z-PINH.bz)>10.5)h=-4;   // leito do rio (o aterro da ponte fica de fora)
  return h;
}
function rawH(x,z){
  let h=rawBase(x,z);
  // rodovia: pista no perfil suavizado, com taludes de ~25 m dos dois lados
  if(x>HWY.x0-30&&x<HWY.x1+30){const dz=Math.abs(z-HWY.z);if(dz<RW/2+40){const w=(1-smooth(RW/2+1.5,RW/2+38,dz))*smooth(HWY.x0-30,HWY.x0+4,x)*(1-smooth(HWY.x1-4,HWY.x1+30,x));if(w>0)h=lerp(h,hwyH(x)+0.02,w);}}
  for(const F of FAVS){
    if(favDist(F,x,z)>F.R*1.9)continue;
    const r=favRoadNearF(F,x,z),w=1-smooth(FAV_ROAD_HW+1.2,FAV_ROAD_HW+10,r.d);
    if(w>0){const hc=rawBase(r.x,r.z);h=lerp(h,r.h+(h-hc)*0.35,w);}      // mantém parte da inclinação lateral: banco suave em vez de corte seco
    for(const Fl of F.flats){const e=Math.hypot((x-Fl.x)/Fl.rx,(z-Fl.z)/Fl.rz),wf=1-smooth(1,1.9,e);if(wf>0)h=lerp(h,Fl.h,wf);}
  }
  return spWestH(x,z,h);
}
for(let iz=0;iz<=NZ;iz++)for(let ix=0;ix<=NX;ix++){
  const i=iz*W1+ix;HG[i]=rawH(X0+ix*CS,Z0+iz*CS);LDG[i]=_ld;SWG[i]=_sw;WCG[i]=_wc;HFG[i]=_hf;
}
/* relevo esculpido no NEON ENGINE (maps/world.json -> terrain), somado antes de água, vegetação e estradas */
const TERRAIN_DELTA=mapTerrainDelta(HG.length,W1);if(TERRAIN_DELTA)for(let i=0;i<HG.length;i++)HG[i]+=TERRAIN_DELTA[i];
function Hq(x,z){
  const fx=(x-X0)/CS,fz=(z-Z0)/CS;
  if(fx<0||fz<0||fx>=NX||fz>=NZ)return -12;
  const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,i=iz*W1+ix;
  return lerp(lerp(HG[i],HG[i+1],tx),lerp(HG[i+W1],HG[i+W1+1],tx),tz);
}
const gridIdx=(x,z)=>clamp(Math.round((z-Z0)/CS),0,NZ)*W1+clamp(Math.round((x-X0)/CS),0,NX);
const gridAt=(arr,x,z)=>arr[gridIdx(x,z)];
const inWater=(x,z)=>Hq(x,z)<WL;
const slopeAt=(x,z)=>{const e=1.5;return Math.hypot(Hq(x+e,z)-Hq(x-e,z),Hq(x,z+e)-Hq(x,z-e))/(2*e);};
const inCity=(x,z,m=0)=>!!cityAt(x,z,m);
/* distância até a água (chanfro) */
const WD=new Float32Array(HG.length);
for(let i=0;i<WD.length;i++)WD[i]=HG[i]<WL?0:1e5;
for(let iz=0;iz<=NZ;iz++)for(let ix=0;ix<=NX;ix++){const i=iz*W1+ix;let v=WD[i];
  if(ix>0)v=Math.min(v,WD[i-1]+1);
  if(iz>0){v=Math.min(v,WD[i-W1]+1);if(ix>0)v=Math.min(v,WD[i-W1-1]+1.414);if(ix<NX)v=Math.min(v,WD[i-W1+1]+1.414);}
  WD[i]=v;}
for(let iz=NZ;iz>=0;iz--)for(let ix=NX;ix>=0;ix--){const i=iz*W1+ix;let v=WD[i];
  if(ix<NX)v=Math.min(v,WD[i+1]+1);
  if(iz<NZ){v=Math.min(v,WD[i+W1]+1);if(ix<NX)v=Math.min(v,WD[i+W1+1]+1.414);if(ix>0)v=Math.min(v,WD[i+W1-1]+1.414);}
  WD[i]=v;}
const gridWD=(x,z)=>WD[gridIdx(x,z)]*CS;
function nearestWater(x,z){
  let ix=clamp(Math.round((x-X0)/CS),1,NX-1),iz=clamp(Math.round((z-Z0)/CS),1,NZ-1);
  for(let k=0;k<90;k++){
    const v=WD[iz*W1+ix];if(v===0)break;
    let best=v,bx=ix,bz=iz;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const nx=ix+dx,nz=iz+dz;if(nx<1||nz<1||nx>=NX||nz>=NZ)continue;const nv=WD[nz*W1+nx];if(nv<best){best=nv;bx=nx;bz=nz;}}
    if(bx===ix&&bz===iz)break;ix=bx;iz=bz;
  }
  return[X0+ix*CS,Z0+iz*CS];
}
/* malha do terreno com cores por bioma (TERRAIN: referências usadas pelo editor para esculpir ao vivo) */
const TERRAIN={geo:null,tiles:[],tw:0,th:0,color:null};
const mkCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const toTex=(c,rep)=>{const t=new THREE.CanvasTexture(c);t.anisotropy=8;if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;};
function texDetail(){const cv=mkCanvas(256,256),g=cv.getContext('2d'),r=mulberry32(3);g.fillStyle='#ececec';g.fillRect(0,0,256,256);
  for(let i=0;i<2600;i++){const l=170+r()*85|0;g.fillStyle=`rgba(${l},${l},${l},.5)`;g.beginPath();g.arc(r()*256,r()*256,1+r()*5,0,7);g.fill();}
  return toTex(cv,true);}
{
  const NV=W1*(NZ+1),pos=new Float32Array(NV*3),uv=new Float32Array(NV*2),col=new Float32Array(NV*3);
  for(let iz=0;iz<=NZ;iz++)for(let ix=0;ix<=NX;ix++){
    const i=iz*W1+ix,x=X0+ix*CS,z=Z0+iz*CS;
    pos[i*3]=x;pos[i*3+1]=HG[i];pos[i*3+2]=z;uv[i*2]=x*0.1;uv[i*2+1]=z*0.1;terrainColor(i,col);
  }
  function terrainColor(i,col){
    const NV=HG.length,ix=i%W1,iz=(i-ix)/W1,x=X0+ix*CS,z=Z0+iz*CS,h=HG[i];
    const sxn=(HG[Math.min(i+1,NV-1)]-HG[Math.max(i-1,0)])/(2*CS),szn=(HG[Math.min(i+W1,NV-1)]-HG[Math.max(i-W1,0)])/(2*CS);
    const slope=Math.hypot(sxn,szn),sw=SWG[i],hf=HFG[i];
    const n1=fbm(x*0.02,z*0.02,3),n2=vnoise(x*0.2,z*0.2);
    let c=[lerp(0.30,0.44,n1),lerp(0.46,0.57,n1),lerp(0.20,0.25,n1)];
    const mix=(t,a)=>{c=[lerp(c[0],a[0],t),lerp(c[1],a[1],t),lerp(c[2],a[2],t)];};
    mix(hf*0.7,[0.19,0.33,0.14]);
    mix(clamp(1-(h-WL)/1.5,0,1)*(1-sw),[0.84,0.77,0.6]);
    mix(sw*0.92,[lerp(0.17,0.24,n1),lerp(0.23,0.30,n1),0.12]);
    if(h<WL+0.35)mix(sw*0.6*smooth(WL+0.35,WL-0.1,h),[0.16,0.28,0.1]);
    mix(smooth(WL+0.1,WL-0.5,h)*0.9,[0.32,0.29,0.2]);
    mix(smooth(-1.5,-5,h),[0.22,0.25,0.26]);
    mix(Math.max(smooth(0.5,0.95,slope),smooth(48,72,h)),[0.5,0.47,0.42]);
    mix(favelaMask(x,z)*0.8,[0.5,0.34,0.24]);
    const k=0.88+0.24*n2;col[i*3]=c[0]*k;col[i*3+1]=c[1]*k;col[i*3+2]=c[2]*k;
  }
  TERRAIN.color=terrainColor;
  const idx=new Uint32Array(NX*NZ*6);let p=0;
  for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){const a=iz*W1+ix,b=a+1,c=a+W1,d=c+1;idx[p++]=a;idx[p++]=c;idx[p++]=b;idx[p++]=b;idx[p++]=c;idx[p++]=d;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(new THREE.BufferAttribute(idx,1));g.computeVertexNormals();
  const tmat=new THREE.MeshLambertMaterial({vertexColors:true,map:texDetail()}),TT=8,tw=Math.ceil(NX/TT),th=Math.ceil(NZ/TT);
  TERRAIN.geo=g;TERRAIN.tw=tw;TERRAIN.th=th;
  for(let bz=0;bz<TT;bz++)for(let bx=0;bx<TT;bx++){
    const ids=[];for(let iz=bz*th;iz<Math.min(NZ,(bz+1)*th);iz++)for(let ix=bx*tw;ix<Math.min(NX,(bx+1)*tw);ix++){const a=iz*W1+ix,b=a+1,c=a+W1,d=c+1;ids.push(a,c,b,b,c,d);}
    if(!ids.length)continue;
    const tg=new THREE.BufferGeometry();['position','color','uv','normal'].forEach(k=>tg.setAttribute(k,g.getAttribute(k)));tg.setIndex(new THREE.BufferAttribute(new Uint32Array(ids),1));
    {const x0=X0+bx*tw*CS,x1=X0+Math.min(NX,(bx+1)*tw)*CS,z0=Z0+bz*th*CS,z1=Z0+Math.min(NZ,(bz+1)*th)*CS;let hmin=1e9,hmax=-1e9;for(let iz=bz*th;iz<=Math.min(NZ,(bz+1)*th);iz+=2)for(let ix=bx*tw;ix<=Math.min(NX,(bx+1)*tw);ix+=2){const h=HG[iz*W1+ix];if(h<hmin)hmin=h;if(h>hmax)hmax=h;}
     tg.boundingSphere=new THREE.Sphere(new THREE.Vector3((x0+x1)/2,(hmin+hmax)/2,(z0+z1)/2),Math.hypot((x1-x0)/2,(z1-z0)/2,(hmax-hmin)/2)+4);}
    const tm=new THREE.Mesh(tg,tmat);tm.receiveShadow=true;scene.add(tm);farCullAdd(tm);TERRAIN.tiles.push({mesh:tm,bx,bz});
  }
}

