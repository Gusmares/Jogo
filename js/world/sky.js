/* NEON COAST — Céu, sol, lua, estrelas e ciclo dia/noite */
'use strict';
/* ============================ CÉU ============================ */
const sunMesh=new THREE.Mesh(new THREE.SphereGeometry(55,16,16),new THREE.MeshBasicMaterial({color:0xfff0b8,fog:false}));
const moonMesh=new THREE.Mesh(new THREE.SphereGeometry(38,16,16),new THREE.MeshBasicMaterial({color:0xdfe8ff,fog:false}));
scene.add(sunMesh,moonMesh);
const stars=(()=>{const n=1400,pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){const u=Math.random()*Math.PI*2,v=Math.acos(Math.random()*0.98),r=2200;pos[i*3]=r*Math.sin(v)*Math.cos(u);pos[i*3+1]=r*Math.cos(v);pos[i*3+2]=r*Math.sin(v)*Math.sin(u);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const p=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:1.8,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));p.frustumCulled=false;scene.add(p);return p;})();
let hour=13.5,nightF=0,dayF=1;
const CLOCK_RUNS=false;   // por enquanto o jogo é sempre de dia (clima/ciclo dia-noite ficam para depois): ponha true para voltar a passar o tempo
const sunDir=new THREE.Vector3(),skyCol=new THREE.Color(),cDay=new THREE.Color(0x7cc4ff),cDusk=new THREE.Color(0xff8a5c),cNight=new THREE.Color(0x060a1c);
const headMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff2c0,emissiveIntensity:0.2});
const tailMat=new THREE.MeshStandardMaterial({color:0x550000,emissive:0xff1010,emissiveIntensity:0.4});
function updateSky(dt){
  if(CLOCK_RUNS)hour=(hour+dt*24/360)%24;
  const ang=(hour-6)/24*Math.PI*2,sy=Math.sin(ang),sx=Math.cos(ang);
  sunDir.set(sx*0.85,sy,0.5).normalize();
  const day=smooth(-0.1,0.25,sy),tw=Math.max(0,1-Math.abs(sy)/0.28);
  skyCol.copy(cNight).lerp(cDay,day).lerp(cDusk,tw*0.65*(sy>-0.25?1:0));
  scene.background.copy(skyCol);scene.fog.color.copy(skyCol);
  hemi.intensity=0.18+0.5*day;
  sunLight.intensity=1.15*day;sunLight.color.setRGB(1,lerp(0.62,0.97,smooth(0,0.4,sy)),lerp(0.4,0.95,smooth(0,0.4,sy)));
  moonLight.intensity=0.32*(1-day);moonLight.position.copy(sunDir).multiplyScalar(-1);
  nightF=1-smooth(-0.12,0.18,sy);dayF=day;
  bMats.forEach(m=>m.emissiveIntensity=nightF*0.95);
  lampMat.emissiveIntensity=nightF*2.2;lhMat.emissiveIntensity=nightF*3;lhBeam.material.opacity=nightF*0.13;
  headMat.emissiveIntensity=0.25+nightF*2.5;tailMat.emissiveIntensity=0.4+nightF*0.8;
  stars.material.opacity=smooth(0.3,1,nightF);
  sunMesh.visible=sy>-0.15;moonMesh.visible=sy<0.15;
}

