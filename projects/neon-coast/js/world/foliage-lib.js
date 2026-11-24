/* NEON COAST — Texturas procedurais, materiais de folhagem (vento) e instanciamento */
'use strict';
/* ============================ TEXTURAS DE VEGETAÇÃO ============================ */
function texNeedle(){
  const cv=mkCanvas(256,256),g=cv.getContext('2d'),r=mulberry32(11),pal=[[88,124,46],[112,146,54],[74,106,42],[134,158,66]];
  g.lineCap='round';
  for(let b=0;b<54;b++){
    const a=r()*6.283,len=36+r()*44,cx=128+(r()-0.5)*48,cy=128+(r()-0.5)*48,dx=Math.cos(a),dy=Math.sin(a),n=Math.floor(len/3.2),c=pal[Math.floor(r()*pal.length)];
    g.strokeStyle='rgb(70,60,40)';g.lineWidth=1.2;g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+dx*len,cy+dy*len+16);g.stroke();
    for(let k=0;k<n;k++){
      const t=k/n,x=cx+dx*len*t,y=cy+dy*len*t+t*t*16,nl=11*(1-t*0.55)+3,sh=0.8+0.35*r();
      g.strokeStyle=`rgb(${c[0]*sh|0},${c[1]*sh|0},${c[2]*sh|0})`;g.lineWidth=1.7;
      g.beginPath();g.moveTo(x,y);g.lineTo(x-dy*nl+dx*4,y+dx*nl+dy*4);g.stroke();
      g.beginPath();g.moveTo(x,y);g.lineTo(x+dy*nl+dx*4,y-dx*nl+dy*4);g.stroke();
    }
  }
  return toTex(cv);
}
function texLeaf(){
  const cv=mkCanvas(256,256),g=cv.getContext('2d'),r=mulberry32(21);
  for(let pass=0;pass<2;pass++)for(let i=0;i<110;i++){
    const a=r()*6.283,rad=Math.sqrt(r())*(pass?85:100),x=128+Math.cos(a)*rad,y=128+Math.sin(a)*rad*0.9,sz=12+r()*10,rot=r()*6.283,l=(pass?1:0.7)*(0.75+r()*0.4);
    g.save();g.translate(x,y);g.rotate(rot);
    g.fillStyle=`rgb(${(54+r()*40)*l|0},${(96+r()*50)*l|0},${(34+r()*24)*l|0})`;
    g.beginPath();g.ellipse(0,0,sz,sz*0.45,0,0,6.283);g.fill();
    g.strokeStyle='rgba(180,210,120,.45)';g.lineWidth=1;g.beginPath();g.moveTo(-sz,0);g.lineTo(sz,0);g.stroke();g.restore();
  }
  return toTex(cv);
}
function texGrass(){
  const cv=mkCanvas(128,256),g=cv.getContext('2d'),r=mulberry32(31);
  for(let i=0;i<26;i++){
    const bx=14+r()*100,h=110+r()*140,lean=(r()-0.5)*70,w=2.5+r()*4,tipx=bx+lean,tipy=256-h;
    const gr=g.createLinearGradient(0,256,0,tipy);gr.addColorStop(0,'rgb(34,58,22)');gr.addColorStop(1,`rgb(${110+r()*40|0},${150+r()*30|0},${50+r()*20|0})`);
    g.fillStyle=gr;g.beginPath();g.moveTo(bx-w,256);g.quadraticCurveTo(bx-w+lean*0.2,256-h*0.55,tipx,tipy);g.quadraticCurveTo(bx+w+lean*0.5,256-h*0.5,bx+w,256);g.closePath();g.fill();
  }
  return toTex(cv);
}
function texFern(){
  const cv=mkCanvas(256,256),g=cv.getContext('2d'),r=mulberry32(61);g.lineCap='round';
  for(let f=0;f<9;f++){
    const a=(f/8-0.5)*1.6+(r()-0.5)*0.15,L=110+r()*35,steps=22;let px=128,py=252;
    for(let k=1;k<=steps;k++){
      const t=k/steps,ang=a+t*t*0.7*(a>=0?1:-1),sp=L/steps*(1.1-t*0.3);
      const nx=px+Math.sin(ang)*sp,ny=py-Math.cos(ang)*sp+t*1.4;
      g.strokeStyle='rgb(70,100,40)';g.lineWidth=2.2*(1-t)+0.6;g.beginPath();g.moveTo(px,py);g.lineTo(nx,ny);g.stroke();
      const ll=26*Math.sin(Math.PI*Math.min(1,t*1.15))+4,c=Math.cos(ang),s=Math.sin(ang);
      g.strokeStyle=`rgb(${60+r()*40|0},${105+r()*45|0},${38+r()*20|0})`;g.lineWidth=2.4*(1-t*0.5);
      g.beginPath();g.moveTo(nx,ny);g.lineTo(nx+c*ll+s*ll*0.3,ny+s*ll-c*ll*0.3);g.stroke();
      g.beginPath();g.moveTo(nx,ny);g.lineTo(nx-c*ll+s*ll*0.3,ny-s*ll-c*ll*0.3);g.stroke();
      px=nx;py=ny;
    }
  }
  return toTex(cv);
}
function texReed(){
  const cv=mkCanvas(128,256),g=cv.getContext('2d'),r=mulberry32(71);
  for(let b=0;b<11;b++){
    const x=10+r()*108,h=150+r()*100,lean=(r()-0.5)*26,w=2+r()*2.2,gr=g.createLinearGradient(0,256,0,256-h);
    gr.addColorStop(0,'rgb(60,84,34)');gr.addColorStop(1,'rgb(140,160,70)');g.fillStyle=gr;
    g.beginPath();g.moveTo(x-w,256);g.quadraticCurveTo(x+lean*0.2,256-h*0.5,x+lean,256-h);g.quadraticCurveTo(x+w+lean*0.4,256-h*0.5,x+w,256);g.fill();
  }
  for(let k=0;k<3;k++){
    const x=30+r()*68,top=40+r()*30;
    g.strokeStyle='rgb(110,130,60)';g.lineWidth=2.2;g.beginPath();g.moveTo(x,256);g.lineTo(x+(r()-0.5)*8,top);g.stroke();
    g.fillStyle='#5a3a22';g.beginPath();g.ellipse(x+(r()-0.5)*8,top+16,5.5,19,0,0,6.283);g.fill();
  }
  return toTex(cv);
}
function texMoss(){
  const cv=mkCanvas(64,256),g=cv.getContext('2d'),r=mulberry32(81);
  for(let s=0;s<18;s++){const x0=4+r()*56,len=110+r()*140;
    for(let y=0;y<len;y+=3){const x=x0+Math.sin(y*0.05+s)*3+(r()-0.5)*2;
      g.fillStyle=`rgba(${150+r()*30|0},${160+r()*30|0},${140+r()*20|0},${0.95*(1-y/len)})`;g.fillRect(x,y,2.4,3.6);}}
  return toTex(cv);
}
function texFrond(){
  const cv=mkCanvas(256,128),g=cv.getContext('2d');g.lineCap='round';
  for(let k=0;k<=46;k++){
    const t=k/46,x=4+t*246,y=64+Math.sin(t*3)*2,len=Math.sin(Math.PI*Math.min(1,t*1.05+0.04))*54*(0.35+0.65*(1-t*0.5))+3;
    g.strokeStyle=`rgb(${48+t*50|0},${96+t*40|0},${30+t*18|0})`;g.lineWidth=3-1.4*t;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+len*0.55,y-len);g.stroke();
    g.beginPath();g.moveTo(x,y);g.lineTo(x+len*0.55,y+len);g.stroke();
  }
  g.strokeStyle='rgb(92,110,48)';g.lineWidth=3.2;g.beginPath();g.moveTo(2,64);g.lineTo(252,67);g.stroke();
  return toTex(cv);
}
function texBark(){
  const cv=mkCanvas(128,256),g=cv.getContext('2d'),r=mulberry32(91);g.fillStyle='#6b5a49';g.fillRect(0,0,128,256);
  for(let i=0;i<260;i++){const x=r()*128,w=1+r()*4,l=30+r()*140,y=r()*256;
    g.fillStyle=r()<0.5?`rgba(30,22,14,${0.25+r()*0.3})`:`rgba(150,130,105,${0.15+r()*0.2})`;g.fillRect(x,y,w,l);}
  return toTex(cv,true);
}
function texPalmBark(){
  const cv=mkCanvas(128,64),g=cv.getContext('2d'),r=mulberry32(97);g.fillStyle='#8a7556';g.fillRect(0,0,128,64);
  for(let x=0;x<128;x+=8){g.fillStyle='rgba(50,38,24,.55)';g.fillRect(x,0,3,64);}
  for(let i=0;i<300;i++){g.fillStyle=`rgba(40,30,20,${r()*0.25})`;g.fillRect(r()*128,r()*64,2,2);}
  return toTex(cv,true);
}
function texScute(){
  const cv=mkCanvas(128,128),g=cv.getContext('2d'),r=mulberry32(41);g.fillStyle='#585858';g.fillRect(0,0,128,128);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){const l=170+r()*70|0;g.fillStyle=`rgb(${l},${l},${l})`;g.beginPath();g.ellipse(x*16+(y%2)*8+8,y*16+8,7.2,6.8,0,0,6.283);g.fill();}
  return toTex(cv,true);
}
const T={needle:texNeedle(),leaf:texLeaf(),grass:texGrass(),fern:texFern(),reed:texReed(),moss:texMoss(),frond:texFrond(),bark:texBark(),palmBark:texPalmBark(),scute:texScute()};
T.bark.repeat.set(3,3);T.palmBark.repeat.set(14,2);

/* materiais de folhagem com vento */
const windU={value:0};
function foliage(mat,amp,hang){
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uTime=windU;
    sh.vertexShader=sh.vertexShader.replace('void main() {','uniform float uTime;\nvoid main() {').replace('#include <begin_vertex>',`#include <begin_vertex>
      float ph=0.0;
      #ifdef USE_INSTANCING
        ph=instanceMatrix[3].x*0.21+instanceMatrix[3].z*0.17;
      #endif
      float bd=${hang?'max(-transformed.y,0.0)':'max(transformed.y,0.0)'};
      transformed.x+=sin(uTime*1.7+ph)*${amp.toFixed(3)}*bd*bd*0.2;
      transformed.z+=cos(uTime*1.3+ph*1.3)*${amp.toFixed(3)}*bd*bd*0.14;`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);');
  };
  mat.customProgramCacheKey=()=>'fol'+amp+(hang?'h':'');
  return mat;
}
const cardMat=(tex,amp,hang)=>foliage(new THREE.MeshStandardMaterial({map:tex,alphaTest:0.5,side:THREE.DoubleSide,roughness:1,metalness:0}),amp,hang);
const M={
  needle:cardMat(T.needle,0.25),leaf:cardMat(T.leaf,0.25),grass:cardMat(T.grass,1.2),fern:cardMat(T.fern,0.5),
  reed:cardMat(T.reed,0.5),moss:cardMat(T.moss,0.4,true),frond:cardMat(T.frond,0.12),
  bark:new THREE.MeshStandardMaterial({map:T.bark,roughness:1}),palmBark:new THREE.MeshStandardMaterial({map:T.palmBark,roughness:1}),
  knee:new THREE.MeshStandardMaterial({color:0x6a4a34,roughness:1}),
  rock:new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),
  pad:new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.7,side:THREE.DoubleSide}),
  flower:new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.6})
};
/* geometrias de cartões cruzados */
/* texturas de planta do GTA IV (assets/world/gta4/*.png, geradas por engine/tools/gta4-import.js --grama na cópia local do jogo): trocam a textura desenhada quando existem */
function ivTexture(name,mat){new THREE.TextureLoader().load('assets/world/gta4/'+name+'.png',t=>{t.anisotropy=4;mat.map=t;mat.needsUpdate=true;},undefined,()=>{});return mat;}
function cardsGeo(w,h,n,cy){
  const pos=[],uv=[],nor=[],idx=[];
  for(let i=0;i<n;i++){
    const a=i*Math.PI/n,c=Math.cos(a),s=Math.sin(a),base=pos.length/3,xs=[-w/2,w/2,w/2,-w/2],ys=[0,0,h,h],us=[0,1,1,0],vs=[0,0,1,1];
    for(let k=0;k<4;k++){pos.push(xs[k]*c,ys[k]-cy,xs[k]*s);uv.push(us[k],vs[k]);nor.push(0,1,0);}
    idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);return g;
}
function frondGeo(L,Wd,segs){
  const pos=[],uv=[],nor=[],idx=[];
  for(let k=0;k<=segs;k++){const t=k/segs,z=t*L,y=-0.2*t*t*L,w=Wd*0.5*Math.sin(Math.PI*Math.min(1,t*1.1+0.1));
    pos.push(-w,y,z,w,y,z);uv.push(t,0,t,1);nor.push(0,1,0,0,1,0);
    if(k<segs){const a=k*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);return g;
}
/* acumulador de instâncias */
const VEG_CHUNKS=[],_vf=new THREE.Frustum(),_vm=new THREE.Matrix4(),_vs=new THREE.Sphere();
function updateVegetationCulling(){
  camera.updateMatrixWorld();_vm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);_vf.setFromProjectionMatrix(_vm);const cp=camera.position;
  for(const c of VEG_CHUNKS){const d=Math.hypot(c.cx-cp.x,c.cz-cp.z)-c.r;let v=d<c.range;if(v){_vs.center.set(c.cx,Hq(c.cx,c.cz)+6,c.cz);_vs.radius=c.r+22;v=_vf.intersectsSphere(_vs)||d<60;}c.mesh.visible=v;if(c.cast)c.mesh.castShadow=d<80;}
}
const WHITE=new THREE.Color(1,1,1),dum=new THREE.Object3D();dum.rotation.order='YXZ';
class Inst{
  constructor(geo,mat){this.geo=geo;this.mat=mat;this.m=[];this.c=[];}
  add(x,y,z,sx,sy,sz,ry,rx,color){dum.position.set(x,y,z);dum.rotation.set(rx||0,ry||0,0);dum.scale.set(sx,sy,sz);dum.updateMatrix();this.m.push(dum.matrix.clone());this.c.push(color||null);return this.m.length-1;}
  build(cast,range){
    if(!this.m.length)return null;
    const CELL=280,cells=new Map(),useC=this.c.some(Boolean);this.where=[];   // where[i] = [malha, índice na malha] (o editor move/apaga árvores)
    this.m.forEach((m,i)=>{const k=Math.floor(m.elements[12]/CELL)+','+Math.floor(m.elements[14]/CELL);let l=cells.get(k);if(!l){l=[];cells.set(k,l);}l.push(i);});
    for(const [k,ids] of cells){
      const mesh=new THREE.InstancedMesh(this.geo,this.mat,ids.length);let sx=0,sz=0;
      ids.forEach((id,j)=>{this.where[id]=[mesh,j];mesh.setMatrixAt(j,this.m[id]);sx+=this.m[id].elements[12];sz+=this.m[id].elements[14];if(useC)mesh.setColorAt(j,this.c[id]||WHITE);});
      mesh.frustumCulled=false;mesh.castShadow=!!cast;scene.add(mesh);
      let r=0;const cx=sx/ids.length,cz=sz/ids.length;ids.forEach(id=>{r=Math.max(r,Math.hypot(this.m[id].elements[12]-cx,this.m[id].elements[14]-cz));});
      VEG_CHUNKS.push({mesh,cx,cz,r:r+14,range:range||650,cast:!!cast});
    }
    return null;
  }
}
const col=(r,g,b)=>new THREE.Color(r,g,b);
/* amostragem de pontos */
function pick(n,tries,box,pred){
  const out=[];
  for(let t=0;t<tries&&out.length<n;t++){const x=rr(box[0],box[1]),z=rr(box[2],box[3]),h=Hq(x,z);if(favelaMask(x,z)<0.02&&pred(x,z,h))out.push([x,z,h]);}
  return out;
}
const ALL=[X0+40,X1-40,Z0+40,Z1-40],SWBOX=[-520,520,HALF+5,HALF+SWD+130];

