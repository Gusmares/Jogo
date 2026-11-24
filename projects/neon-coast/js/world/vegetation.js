/* NEON COAST — Palmeiras, ciprestes, carvalhos, grama, juncos, rochas, farol */
'use strict';
/* ============================ VEGETAÇÃO ============================ */
const trunkGeo=new THREE.LatheGeometry([[1.9,0],[1.35,0.015],[0.95,0.04],[0.7,0.1],[0.58,0.3],[0.52,0.6],[0.46,1]].map(p=>new THREE.Vector2(p[0],p[1])),8);
const branchGeo=new THREE.CylinderGeometry(0.05,0.17,1,5).translate(0,0.5,0);
const IN={
  trunk:new Inst(trunkGeo,M.bark),branch:new Inst(branchGeo,M.bark),
  needle:new Inst(cardsGeo(6.4,6.4,3,3.2),M.needle),leaf:new Inst(cardsGeo(7,7,3,3.5),M.leaf),
  moss:new Inst(cardsGeo(1.6,3.4,2,3.4),M.moss),knee:new Inst(new THREE.ConeGeometry(0.3,1,6).translate(0,0.5,0),M.knee),
  bush:new Inst(cardsGeo(2.6,2.1,3,0),M.leaf),grass:new Inst(cardsGeo(1.2,0.95,2,0),M.grass),fern:new Inst(cardsGeo(2.4,1.9,3,0),M.fern),
  reed:new Inst(cardsGeo(1.1,2.5,2,0),M.reed),
  palmTrunk:new Inst(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0.5,3.5,0.1),new THREE.Vector3(1.1,6.5,0.3),new THREE.Vector3(1.6,9,0.5)]),8,0.3,5,false),M.palmBark),
  frond:new Inst(frondGeo(4.8,1.9,7),M.frond),
  pad:new Inst(new THREE.CircleGeometry(0.7,18,0.3,Math.PI*2-0.55).rotateX(-Math.PI/2),M.pad),
  flower:new Inst(new THREE.SphereGeometry(0.13,6,5),M.flower),
  log:new Inst(new THREE.CylinderGeometry(0.34,0.4,1,8).rotateZ(Math.PI/2),M.bark),
  // plantas do GTA IV (texturas fotográficas; sem os PNG, ficam com a textura desenhada)
  tallGrass:new Inst(cardsGeo(2.0,1.0,3,0),ivTexture('capim_alto',cardMat(T.grass,1.2))),darkGrass:new Inst(cardsGeo(1.9,0.95,3,0),ivTexture('capim_escuro',cardMat(T.grass,1.1))),
  weeds:new Inst(cardsGeo(1.4,1.4,3,0),ivTexture('mato_florido',cardMat(T.grass,1.0))),dryTuft:new Inst(cardsGeo(0.9,0.9,3,0),ivTexture('tufo_seco',cardMat(T.grass,0.8))),
  twigs:new Inst(cardsGeo(0.9,0.9,3,0),ivTexture('galhos_secos',cardMat(T.grass,0.4))),agave:new Inst(cardsGeo(0.9,0.9,3,0),ivTexture('agave',cardMat(T.grass,0.2)))
};
ivTexture('capim_verde',M.grass);                                      // a grama de sempre ganha a textura do IV
const AX=new THREE.Vector3(0,1,0);
/* ============================ VEGETAÇÃO DOS PACKS NO LUGAR DA PROCEDURAL (PACK_VEG) ============================
   A procedural abaixo (árvores de rua, carvalhos, ciprestes, pinheiros, arbustos, tufos e capim) sempre é calculada, com a MESMA sequência de rnd/rr
   (o mundo de fundo não muda), e cada posição fica anotada em VEGREC (entidades editáveis) e VEGREC_G (tufos/capim). O gerador
   engine/tools/scatter-packs.js grava VEGREC como modelos dos packs em maps/world.json (campo "rep":1) e placements.js desenha VEGREC_G com modelos dos packs.
   PACK_VEG liga quando (a) o mapa tem objetos com "rep" e (b) os assets dos packs existem (HEAD síncrono em um modelo-sentinela). Ligado: as instâncias
   procedurais substituídas e os colisores delas não são criados (palmeiras, juncos, vitórias-régias, troncos e rochas procedurais continuam: os packs não têm).
   Desligar para comparar: abrir com &packveg=0 (ou mapa sem objetos "rep"); sem os assets o jogo cai sozinho na procedural. */
const VEGREC=[],VEGREC_G=[],VEGREP_IDS=new Set(),_vrN=new Map();
function vrec(kind,x,z,o){const b=kind+'@'+Math.round(x)+','+Math.round(z);let k=b,n=1;while(_vrN.has(k))k=b+'#'+(++n);_vrN.set(k,1);o.id=k;o.k=kind;o.x=x;o.z=z;VEGREC.push(o);VEGREP_IDS.add(k);}
const PACK_VEG=(()=>{
  try{
    if(/[?&]packveg=0/.test(location.search))return false;
    if(!Array.isArray(MAPDATA.objects)||!MAPDATA.objects.some(o=>o&&o.rep))return false;
    const x=new XMLHttpRequest();x.open('HEAD','assets/objects/vf_betula_1/model.glb',false);x.send();return x.status===200;
  }catch(e){return false;}
})();
if(PACK_VEG)for(const k of ['trunk','branch','needle','leaf','moss','knee','bush','grass','fern','tallGrass','darkGrass','weeds','dryTuft','twigs','agave'])IN[k].add=function(){return 0;};
/* palmeiras: cidade + praias */
{
  const spots=palmSpots.slice();
  pick(340,60000,ALL,(x,z,h)=>h>WL+0.35&&h<WL+1.5&&!(inCity(x,z,12)||spWestBusy(x,z)||onHighway(x,z,18))&&gridAt(SWG,x,z)<0.2&&slopeAt(x,z)<0.25&&fbm(x*0.03,z*0.03,3)>0.38)
    .forEach(p=>spots.push([p[0],p[1],rr(0.9,1.3),p[2]]));
  for(const [x,z,s,gy] of spots){
    entBegin('palmeira','Palmeira',x,z);
    const yaw=rr(0,6.283);IN.palmTrunk.add(x,gy,z,s,s,s,yaw);
    const top=new THREE.Vector3(1.6,9,0.5).multiplyScalar(s).applyAxisAngle(AX,yaw);
    for(let k=0;k<10;k++){const sh=rr(0.72,1.05);IN.frond.add(x+top.x,gy+top.y,z+top.z,s*rr(0.85,1.1),s,s*rr(0.85,1.1),k*Math.PI*2/10+rr(-0.2,0.2),-rr(0.25,0.75),col(sh*0.95,sh,sh*0.9));}
    if(gy<0.5||true)addRound(x,z,0.45);
    entEnd();
  }
}
/* árvores de rua de São Paulo (sibipirunas/tipuanas de copa larga; uns ipês amarelos) — posições vêm de city.js/sp.js */
for(const [x,z,s,gy,big] of spTrees){
  entBegin('arvore-rua','Árvore de rua',x,z);
  const H=(big?rr(6.5,9):rr(4.6,6.4))*s,ipe=rnd()<0.08,yaw=rr(0,6.283);vrec('arvore-rua',x,z,{y:gy,s,big:big?1:0,H});
  IN.trunk.add(x,gy,z,0.26*s,H,0.26*s,yaw);
  for(let k=0;k<3;k++)IN.branch.add(x,gy+H*rr(0.6,0.85),z,0.55*s,rr(1.6,2.6)*s,0.55*s,rr(0,6.283),0.85);
  const n=big?9:6,R=(big?2.6:1.8)*s;
  for(let k=0;k<n;k++){const a=k/n*6.283+rr(-0.3,0.3),rad=k?R*rr(0.5,1):0,sh=rr(0.75,1.08),c=ipe?col(sh*1.2,sh*1.0,sh*0.3):col(sh*0.68,sh*0.8,sh*0.6);
    IN.leaf.add(x+Math.cos(a)*rad,gy+H*rr(0.9,1.1)+rr(-0.4,0.6),z+Math.sin(a)*rad,rr(0.6,0.85)*s*(big?1.25:1),rr(0.55,0.75)*s*(big?1.2:1),rr(0.6,0.85)*s*(big?1.25:1),rr(0,6.283),0,c);}
  if(!PACK_VEG)addRound(x,z,0.3);
  entEnd();
}
/* ciprestes do pântano */
function cypress(x,z,gy,s,H){
  entBegin('cipreste','Cipreste',x,z);
  const yaw=rr(0,6.283);vrec('cipreste',x,z,{y:gy,s,H});
  IN.trunk.add(x,gy,z,s,H,s,yaw);
  for(let k=0;k<4;k++)IN.branch.add(x,gy+H*rr(0.55,0.8),z,1,rr(3,5.5),1,rr(0,6.283),1.0);
  const top=H*0.92;
  for(let k=0;k<7;k++){const a=rr(0,6.283),rad=k?rr(1.5,3.8):0,sh=rr(0.75,1.1),cx=x+Math.cos(a)*rad,cz=z+Math.sin(a)*rad,cy=gy+top*rr(0.82,1.04)+rr(-0.4,1);
    IN.needle.add(cx,cy,cz,rr(0.85,1.3),rr(0.8,1.2),rr(0.85,1.3),rr(0,6.283),0,col(sh*0.9,sh,sh*0.78));
    if(k<5)IN.moss.add(cx+rr(-1,1),cy-0.6,cz+rr(-1,1),rr(0.8,1.3),rr(0.8,1.5),rr(0.8,1.3),rr(0,6.283));}
  for(let k=0;k<6;k++){const a=rr(0,6.283),d=rr(1.8,5),kx=x+Math.cos(a)*d,kz=z+Math.sin(a)*d,kh=Hq(kx,kz);if(kh>WL-0.5)IN.knee.add(kx,kh-0.05,kz,rr(0.6,1.3),rr(0.4,1.7),rr(0.6,1.3),0);}
  if(!PACK_VEG)addRound(x,z,1.0);
  entEnd();
}
pick(340,70000,SWBOX,(x,z,h)=>gridAt(SWG,x,z)>0.55&&h>WL-0.45&&Math.abs(x)>12.5&&fbm(x*0.018+9,z*0.018,3)>0.38)
  .forEach(p=>cypress(p[0],p[1],p[2],rr(0.85,1.3),rr(7,13)));
/* carvalhos nas colinas */
pick(780,120000,ALL,(x,z,h)=>h>2.6&&h<38&&gridAt(HFG,x,z)>0.15&&slopeAt(x,z)<0.55&&fbm(x*0.012+4,z*0.012+1,3)>0.45)
  .forEach(([x,z,h])=>{
    entBegin('arvore','Árvore',x,z);
    const s=rr(0.55,0.8),H=rr(5,8.5);vrec('arvore',x,z,{y:h,s,H});
    IN.trunk.add(x,h,z,s,H,s,rr(0,6.283));
    for(let k=0;k<3;k++)IN.branch.add(x,h+H*rr(0.55,0.8),z,0.8,rr(2,3.5),0.8,rr(0,6.283),0.9);
    for(let k=0;k<7;k++){const a=rr(0,6.283),rad=k?rr(1,3):0,sh=rr(0.75,1.1);IN.leaf.add(x+Math.cos(a)*rad,h+H*rr(0.75,1.15)+rr(-0.3,1),z+Math.sin(a)*rad,rr(0.8,1.2),rr(0.8,1.15),rr(0.8,1.2),rr(0,6.283),0,col(sh*0.95,sh,sh*0.85));}
    if(!PACK_VEG)addRound(x,z,0.55);
    entEnd();
  });
/* pinheiros no alto */
pick(260,60000,ALL,(x,z,h)=>h>=30&&slopeAt(x,z)<0.7&&gridAt(HFG,x,z)>0.15&&fbm(x*0.015+2,z*0.015+8,3)>0.4)
  .forEach(([x,z,h])=>{
    entBegin('pinheiro','Pinheiro',x,z);
    const H=rr(10,17);vrec('pinheiro',x,z,{y:h,s:1,H});IN.trunk.add(x,h,z,0.5,H,0.5,rr(0,6.283));
    for(let k=0;k<10;k++){const t=k/9,y=h+H*(0.22+0.78*t),rad=(1-t)*3.3+0.2,a=rr(0,6.283),sh=rr(0.55,0.8);
      IN.needle.add(x+Math.cos(a)*rad*0.6,y,z+Math.sin(a)*rad*0.6,0.85+(1-t)*0.4,0.8,0.85+(1-t)*0.4,rr(0,6.283),0,col(sh*0.7,sh,sh*0.75));}
    if(!PACK_VEG)addRound(x,z,0.5);
    entEnd();
  });
/* arbustos */
pick(1000,60000,ALL,(x,z,h)=>h>WL+0.9&&h<40&&!(inCity(x,z,8)||spWestBusy(x,z)||onHighway(x,z,14))&&slopeAt(x,z)<0.6&&gridAt(SWG,x,z)<0.9&&fbm(x*0.02+5,z*0.02,3)>0.45)
  .forEach(([x,z,h])=>{const sh=rr(0.75,1.1);worldEntity('arbusto','Arbusto',x,z,()=>{const sx=rr(0.8,1.5),sy=rr(0.7,1.3),sz=rr(0.8,1.5),yw=rr(0,6.283);vrec('arbusto',x,z,{y:h,s:(sx+sz)/2,sy});IN.bush.add(x,h-0.1,z,sx,sy,sz,yw,0,col(sh*0.9,sh,sh*0.8));});});
/* grama em tufos (grupos) */
function clump(cx,cz,n,rad,inst,hmin,hmax,smin){
  let ax=0,az=0,ah=0,as=0,ac=0;
  for(let k=0;k<n;k++){
    const a=rr(0,6.283),d=Math.sqrt(rnd())*rad,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d,h=Hq(x,z);
    if(h<hmin||h>hmax||(inCity(x,z,8)||spWestBusy(x,z)||onHighway(x,z,14))||(Math.abs(x)<7&&z>HALF-5&&z<HALF+SWD))continue;
    const sh=rr(0.7,1.15),sc=rr(0.7,1.5);inst.add(x,h-0.03,z,sc,sc*rr(0.8,1.3),sc,rr(0,6.283),0,col(sh*0.95,sh,sh*0.7));ax+=x;az+=z;ah+=h;as+=sc;ac++;
  }
  if(ac)VEGREC_G.push([inst===IN.fern?'fern':'grass',ax/ac,az/ac,ah/ac,ac,as/ac,rad]);
}
pick(1600,50000,SWBOX,(x,z,h)=>h>WL+0.1&&gridAt(SWG,x,z)>0.3&&fbm(x*0.025+2,z*0.025,3)>0.36).forEach(p=>clump(p[0],p[1],8,3.2,IN.grass,WL+0.1,5,0));
pick(1300,60000,ALL,(x,z,h)=>h>WL+1&&h<45&&!(inCity(x,z,10)||spWestBusy(x,z)||onHighway(x,z,16))&&slopeAt(x,z)<0.8&&gridAt(SWG,x,z)<0.3&&fbm(x*0.025+2,z*0.025,3)>0.38).forEach(p=>clump(p[0],p[1],8,3.2,IN.grass,WL+0.8,45,0));
pick(650,60000,ALL,(x,z,h)=>h>WL+0.1&&(gridAt(SWG,x,z)>0.4||(gridAt(HFG,x,z)>0.2&&h<40))&&fbm(x*0.03+7,z*0.03,3)>0.42).forEach(p=>clump(p[0],p[1],4,3,IN.fern,WL+0.1,40,0));
/* plantas do GTA IV: capim alto e mato florido na beira das estradas e campos, tufos e galhos secos nas encostas, agave perto do mar, grama nos parques da cidade */

function tufts(n,box,pred,inst,cnt,rad,smin,smax,tint){
  const tk=Object.keys(IN).find(q=>IN[q]===inst);
  pick(n,n*40,box,pred).forEach(([cx,cz])=>{let ax=0,az=0,ah=0,as=0,ac=0;for(let k=0;k<cnt;k++){const a=rr(0,6.283),d=Math.sqrt(rnd())*rad,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d,h=Hq(x,z);if(h<WL+0.15)continue;
    const sc=rr(smin,smax),sh=rr(0.8,1.1);inst.add(x,h-0.04,z,sc,sc*rr(0.85,1.25),sc,rr(0,6.283),0,tint?col(sh*tint[0],sh*tint[1],sh*tint[2]):col(sh,sh,sh));ax+=x;az+=z;ah+=h;as+=sc;ac++;}
    if(ac)VEGREC_G.push([tk,ax/ac,az/ac,ah/ac,ac,as/ac,rad]);});
}
const outside=(x,z)=>!(inCity(x,z,6)||spWestBusy(x,z)||(Math.abs(x)<7&&z>HALF-5&&z<HALF+SWD));
tufts(900,ALL,(x,z,h)=>h>WL+0.6&&h<30&&outside(x,z)&&!onHighway(x,z,5)&&(onHighway(x,z,26)||fbm(x*0.02+11,z*0.02,3)>0.5)&&slopeAt(x,z)<0.5,IN.tallGrass,6,3.5,0.8,1.4);
tufts(500,ALL,(x,z,h)=>h>WL+0.6&&h<35&&outside(x,z)&&fbm(x*0.03+21,z*0.03,3)>0.52&&slopeAt(x,z)<0.6,IN.weeds,4,2.5,0.7,1.2);
tufts(700,ALL,(x,z,h)=>h>4&&outside(x,z)&&(slopeAt(x,z)>0.3||h>28)&&gridAt(SWG,x,z)<0.2,IN.dryTuft,5,3,0.8,1.5);
tufts(350,ALL,(x,z,h)=>h>6&&outside(x,z)&&slopeAt(x,z)>0.25&&gridAt(SWG,x,z)<0.2,IN.twigs,3,2.5,0.8,1.6);
tufts(260,ALL,(x,z,h)=>h>WL+0.5&&h<WL+4&&outside(x,z)&&gridAt(SWG,x,z)<0.2&&slopeAt(x,z)<0.4,IN.agave,3,3,0.9,1.6);
tufts(800,SWBOX,(x,z,h)=>h>WL+0.2&&gridAt(SWG,x,z)>0.3&&fbm(x*0.03+5,z*0.03,3)>0.45,IN.darkGrass,6,3,0.9,1.5,[0.95,1,0.85]);
/* parques e praças da cidade: tufos esparsos de grama no gramado (a calçada fica limpa) */
for(const b of CITY_BLOCKS){if(b.type!=='P'&&b.type!=='R')continue;const half=b.type==='P'?(B-10)/2:(B-11.5)/2,n=b.type==='P'?60:22;
  for(let k=0;k<n;k++){const x=b.cx+rr(-half,half),z=b.cz+rr(-half,half),sc=rr(0.45,0.8),sh=rr(0.85,1.05);const gw=rnd()<0.85;(gw?IN.grass:IN.weeds).add(x,0.29,z,sc,sc*rr(0.8,1.1),sc,rr(0,6.283),0,col(sh,sh,sh*0.9));VEGREC_G.push([gw?'park':'parkweed',x,z,0.29,1,sc,0]);}}
/* juncos e taboas nas margens */
pick(1700,120000,SWBOX,(x,z,h)=>gridAt(SWG,x,z)>0.25&&h>WL-0.3&&h<WL+0.45&&Math.abs(x)>8).forEach(p=>{
  for(let k=0;k<3;k++){const sh=rr(0.75,1.1),sc=rr(0.8,1.5);IN.reed.add(p[0]+rr(-0.8,0.8),p[2]-0.05,p[1]+rr(-0.8,0.8),sc,sc*rr(0.8,1.2),sc,rr(0,6.283),0,col(sh*0.95,sh,sh*0.8));}
});
/* vitórias-régias e flores */
pick(680,120000,SWBOX,(x,z,h)=>gridAt(SWG,x,z)>0.4&&h<WL-0.05&&h>WL-1.0&&fbm(x*0.05+3,z*0.05,3)>0.5).forEach(([x,z],i)=>{
  const sh=rr(0.75,1.1);IN.pad.add(x,WL+0.02,z,rr(0.6,1.5),1,rr(0.6,1.5),rr(0,6.283),0,col(0.22*sh,0.5*sh,0.2*sh));
  if(i%8===0)IN.flower.add(x,WL+0.1,z,1,0.7,1,0,0,rnd()<0.5?col(1,0.95,0.95):col(1,0.6,0.8));
});
/* troncos caídos */
pick(45,40000,SWBOX,(x,z,h)=>gridAt(SWG,x,z)>0.5&&h>WL-0.3&&h<WL+0.5&&Math.abs(x)>14).forEach(([x,z,h])=>{
  const L=rr(3.5,8);IN.log.add(x,Math.max(h,WL)+0.22,z,L,rr(0.8,1.3),rr(0.8,1.3),rr(0,6.283));
});
/* rochas */
{
  const rg=new THREE.IcosahedronGeometry(1,1),pa=rg.attributes.position,rv=mulberry32(123);
  for(let i=0;i<pa.count;i++){const k=0.78+0.4*rv();pa.setXYZ(i,pa.getX(i)*k,pa.getY(i)*k*0.8,pa.getZ(i)*k);}
  rg.computeVertexNormals();
  const rocks=new Inst(rg,M.rock);
  pick(150,60000,ALL,(x,z,h)=>!(inCity(x,z,10)||spWestBusy(x,z)||onHighway(x,z,16))&&gridAt(SWG,x,z)<0.4&&((h>WL&&h<WL+1.2)||(slopeAt(x,z)>0.35&&gridAt(HFG,x,z)>0.1))).forEach(([x,z,h])=>{
    const s=rr(0.8,3.6),g=rr(0.45,0.62);rocks.add(x,h+s*0.15,z,s*rr(0.9,1.4),s*rr(0.6,1),s*rr(0.9,1.4),rr(0,6.283),rr(-0.2,0.2),col(g,g*0.97,g*0.92));addRound(x,z,s*0.8);
  });
  rocks.build(true);
}
/* faróis de vagalumes */
const fireflies=(()=>{
  const pts=pick(380,50000,SWBOX,(x,z,h)=>gridAt(SWG,x,z)>0.4&&Math.abs(x)>10),n=pts.length,pos=new Float32Array(n*3);
  pts.forEach((p,i)=>{pos[i*3]=p[0];pos[i*3+1]=Math.max(p[2],WL)+rr(0.7,3.5);pos[i*3+2]=p[1];});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const p=new THREE.Points(g,new THREE.PointsMaterial({color:0xd8ff6a,size:3.2,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false}));
  p.frustumCulled=false;scene.add(p);return p;
})();
/* construir todas as instâncias */
IN.trunk.build(true);IN.palmTrunk.build(true);IN.branch.build(true);IN.log.build(true);
['needle','leaf','moss','knee','frond'].forEach(k=>IN[k].build(false,520));
['bush','grass','fern','reed','pad','flower','tallGrass','darkGrass','weeds','dryTuft','twigs','agave'].forEach(k=>IN[k].build(false,190));
/* farol */
const lhMat=new THREE.MeshStandardMaterial({color:0xfff2b0,emissive:0xffe08a,emissiveIntensity:0}),lhBeam=new THREE.Mesh(
  new THREE.ConeGeometry(14,160,18,1,true).rotateX(-Math.PI/2).translate(0,0,80),
  new THREE.MeshBasicMaterial({color:0xfff0b0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
{
  let best=null,bd=0;
  for(let x=-X1+100;x<-300;x+=20)for(let z=Z0+60;z<-300;z+=20){const h=Hq(x,z);if(h>1&&h<8&&slopeAt(x,z)<0.2){const d=Math.hypot(x,z);if(d>bd){bd=d;best=[x,z,h];}}}
  if(best){
    const [x,z,h]=best,g=new THREE.Group();g.position.set(x,h,z);
    for(let i=0;i<4;i++){const c=new THREE.Mesh(new THREE.CylinderGeometry(3.3-i*0.55,3.8-i*0.55,6,14),new THREE.MeshStandardMaterial({color:i%2?0xcc2222:0xf2f2f2,roughness:0.7}));c.position.y=3+i*6;c.castShadow=true;g.add(c);}
    const gal=new THREE.Mesh(new THREE.CylinderGeometry(3.8,3.8,0.5,14),poleMat);gal.position.y=24.2;g.add(gal);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(1.6,12,10),lhMat);lamp.position.y=26;g.add(lamp);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(2.6,3,12),new THREE.MeshStandardMaterial({color:0x333333}));roof.position.y=28.4;g.add(roof);
    lhBeam.position.set(0,26,0);g.add(lhBeam);scene.add(g);addRound(x,z,4.5);
  }
}

