/* NEON COAST — Água do oceano e do pântano */
'use strict';
/* ============================ ÁGUA ============================ */
function texWaterNormal(){
  const n=256,cv=mkCanvas(n,n),g=cv.getContext('2d'),img=g.createImageData(n,n),r=mulberry32(51),waves=[];
  for(let k=0;k<7;k++)waves.push({kx:Math.floor(r()*6)+1,kz:Math.floor(r()*6)+1,sx:r()<0.5?1:-1,ph:r()*6.283,a:0.55/(1+k*0.55)});
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let nx=0,ny=0;
    for(const w of waves){const arg=6.283*(w.kx*w.sx*x/n+w.kz*y/n)+w.ph,c=Math.cos(arg)*w.a*0.4;nx-=c*w.kx*w.sx;ny-=c*w.kz;}
    const l=Math.hypot(nx,ny,1),i=(y*n+x)*4;
    img.data[i]=(nx/l*0.5+0.5)*255;img.data[i+1]=(ny/l*0.5+0.5)*255;img.data[i+2]=(1/l*0.5+0.5)*255;img.data[i+3]=255;
  }
  g.putImageData(img,0,0);return toTex(cv,true);
}
const WREP=430,waterNormal=texWaterNormal();waterNormal.repeat.set(WREP,WREP);
const waterMat=new THREE.MeshStandardMaterial({color:0x1b6ea0,roughness:0.06,metalness:0.15,transparent:true,opacity:0.84,normalMap:waterNormal});
waterMat.normalScale.set(0.55,0.55);
waterMat.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos=(modelMatrix*vec4(position,1.0)).xyz;');
  const f=v=>v.toFixed(1);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;').replace('#include <color_fragment>',`#include <color_fragment>
   float swz=smoothstep(${f(HALF-30)},${f(HALF+40)},vWPos.z)*(1.0-smoothstep(${f(HALF+SWD+60)},${f(HALF+SWD+260)},vWPos.z));
   float swx=1.0-smoothstep(${f(HALF+40)},${f(HALF+200)},abs(vWPos.x));
   float swm=swz*swx;
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.10,0.20,0.08),swm*0.92);
   diffuseColor.a=mix(diffuseColor.a,0.94,swm);
   if(vWPos.x>${f(PINH.x0)}&&vWPos.x<${f(PINH.x1)}&&vWPos.z>${f(PINH.z0)}&&vWPos.z<${f(PINH.z1)})discard;   // o Rio Pinheiros tem água própria, mais baixa`);
};
const water=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000).rotateX(-Math.PI/2),waterMat);
water.position.y=WL;scene.add(water);

