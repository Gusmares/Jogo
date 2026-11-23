/* NEON COAST — Texturas e materiais da cidade */
'use strict';
/* ============================ TEXTURAS DA CIDADE ============================ */
const TILE=25.6;
function winTex(emissive){
  const cells=8,cs=64,cv=mkCanvas(512,512),g=cv.getContext('2d');
  g.fillStyle=emissive?'#000':'#f4f4f6';g.fillRect(0,0,512,512);
  const r=mulberry32(77);
  for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){
    const lit=r()<0.42,h=r();
    if(emissive){if(lit){g.fillStyle=h<0.6?'#ffe2a0':h<0.85?'#ffd080':'#cfe6ff';g.fillRect(x*cs+10,y*cs+12,44,38);}}
    else{g.fillStyle=lit?'#5d7390':'#26364d';g.fillRect(x*cs+10,y*cs+12,44,38);g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x*cs+10,y*cs+12,44,4);}
  }
  const t=toTex(cv,true);return t;
}
const winMap=winTex(false),winEm=winTex(true);
const dashTex=(()=>{const cv=mkCanvas(8,32),g=cv.getContext('2d');g.fillStyle='#e8c93a';g.fillRect(3,0,2,16);const t=toTex(cv,true);t.repeat.set(1,7);return t;})();
const bColors=[0xc9ced6,0xb7bfc9,0xd8cfc0,0xa9b4c2,0xe0d6c8,0x9fb0bf,0xcdbfae,0xb8a9b8];
const bMats=[new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:winMap,emissiveMap:winEm,emissive:0xffd9a0,emissiveIntensity:0})];   // um material só: a cor de cada prédio vai nos vértices
const slabMat=new THREE.MeshLambertMaterial({color:0xb4b4aa});
const parkMat=new THREE.MeshLambertMaterial({color:0x3f8f4f});
const asphaltMat=new THREE.MeshLambertMaterial({color:0x2c3038});
function roadTexture(url,repeat){if(/roadnew4/.test(url)){const t=PAVE.asphalt.clone();t.needsUpdate=true;t.repeat.set(repeat,repeat);return t;}const t=new THREE.TextureLoader().load(url);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return t;}
asphaltMat.map=roadTexture('assets/world/roadnew4_256.png',S/8);asphaltMat.color.setHex(0xffffff);addMacro(asphaltMat,1/41,1/173,0.2,0.16);
slabMat.map=PAVE.concreto;slabMat.color.setHex(0xffffff);addMacro(slabMat,1/29,1/131,0.18,0.12);
/* calçadas: UV em coordenadas de mundo (1 repetição = 8 m), variação macro por cima; o tipo muda com o bairro */
const WALK={
  portuguesa:addMacro(new THREE.MeshLambertMaterial({map:PAVE.portuguesa}),1/33,1/127,0.16,0.1),
  concreto:slabMat,
  intertravado:addMacro(new THREE.MeshLambertMaterial({map:PAVE.intertravado}),1/31,1/139,0.15,0.12)
};
parkMat.map=PAVE.grass;parkMat.color.setHex(0xffffff);addMacro(parkMat,1/23,1/97,0.22,0);
const lawnMat=addMacro(new THREE.MeshLambertMaterial({map:PAVE.grass,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),1/19,1/89,0.24,0);
const lineMat=new THREE.MeshBasicMaterial({map:dashTex,transparent:true});
const lampMat=new THREE.MeshStandardMaterial({color:0x888888,emissive:0xffd9a0,emissiveIntensity:0});
const poleMat=new THREE.MeshStandardMaterial({color:0x444a52,roughness:0.6});

for(const C of CITIES){const am=C===SP?asphaltMat:asphaltMat.clone();if(C!==SP){am.map=asphaltMat.map.clone();am.map.repeat.set((C.x1-C.x0)/8,(C.z1-C.z0)/8);am.map.needsUpdate=true;addMacro(am,1/41,1/173,0.2,0.16);}
  const asphalt=new THREE.Mesh(new THREE.PlaneGeometry(C.x1-C.x0,C.z1-C.z0).rotateX(-Math.PI/2),am);asphalt.position.set(C.cx,0.06,C.cz);asphalt.receiveShadow=true;scene.add(asphalt);}
{
  const gx=new THREE.PlaneGeometry(0.35,B).rotateX(-Math.PI/2),gz=new THREE.PlaneGeometry(0.35,B).rotateX(-Math.PI/2).rotateY(Math.PI/2);
  const lb=new GeoBatch(320);
  for(const C of CITIES){
    for(let r=C.i0;r<=C.i0+C.ni;r++)for(let k=C.j0;k<C.j0+C.nj;k++)lb.add(gx.clone(),lineMat,roadC(r),0.09,blockC(k));
    for(let r=C.j0;r<=C.j0+C.nj;r++)for(let k=C.i0;k<C.i0+C.ni;k++)lb.add(gz.clone(),lineMat,blockC(k),0.09,roadC(r));
  }
  lb.flush(false,false);
}
/* estrada elevada ao pântano */
{
  const L=SWD-30;
  const roadMat=asphaltMat.clone();roadMat.map=asphaltMat.map.clone();roadMat.map.repeat.set(12/8,L/8);roadMat.map.needsUpdate=true;addMacro(roadMat,1/41,1/173,0.2,0.16);
  const road=new THREE.Mesh(new THREE.PlaneGeometry(12,L).rotateX(-Math.PI/2),roadMat);road.position.set(0,0.12,HALF+L/2);road.receiveShadow=true;scene.add(road);
  const tx=dashTex.clone();tx.needsUpdate=true;tx.repeat.set(1,L/8);
  const line=new THREE.Mesh(new THREE.PlaneGeometry(0.35,L).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:tx,transparent:true}));line.position.set(0,0.14,HALF+L/2);scene.add(line);
}

