/* NEON COAST — Modelos procedurais: pessoas e carros genéricos */
'use strict';
/* ============================ MODELOS ============================ */
const skinMats=[0xf1c8a0,0xd8a47a,0xa8714a,0x6e4630].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:0.8}));
const shirtMats=[0xd94141,0x3b82d9,0x44b86b,0xe8b93a,0x9b59d6,0xeeeeee,0x222222,0xe86fa8].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:0.8}));
const pantsMats=[0x2b3a55,0x333333,0x6b5a3e,0x4a6b52].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:0.8}));
const pg={torso:new THREE.BoxGeometry(0.5,0.65,0.28),head:new THREE.BoxGeometry(0.26,0.28,0.26),leg:new THREE.BoxGeometry(0.2,0.8,0.22).translate(0,-0.4,0),arm:new THREE.BoxGeometry(0.14,0.6,0.16).translate(0,-0.3,0)};
function makePerson(shirt,pants,skin){
  const g=new THREE.Group(),u={};
  const t=new THREE.Mesh(pg.torso,shirt);t.position.y=1.15;const h=new THREE.Mesh(pg.head,skin);h.position.y=1.66;g.add(t,h);t.castShadow=h.castShadow=true;
  const mk=(geo,mat,x,y)=>{const p=new THREE.Group();p.position.set(x,y,0);const m=new THREE.Mesh(geo,mat);m.castShadow=true;p.add(m);g.add(p);return p;};
  u.legL=mk(pg.leg,pants,-0.13,0.82);u.legR=mk(pg.leg,pants,0.13,0.82);u.armL=mk(pg.arm,shirt,-0.33,1.42);u.armR=mk(pg.arm,shirt,0.33,1.42);
  g.userData=u;return g;
}
function animPerson(g,phase,amp){const u=g.userData,s=Math.sin(phase)*amp;u.legL.rotation.x=s;u.legR.rotation.x=-s;u.armL.rotation.x=-s*0.8;u.armR.rotation.x=s*0.8;}
const cg={body:new THREE.BoxGeometry(2.0,0.7,4.4),cabin:new THREE.BoxGeometry(1.7,0.6,2.3),roof:new THREE.BoxGeometry(1.62,0.08,2.1),wheel:new THREE.CylinderGeometry(0.38,0.38,0.3,14).rotateZ(Math.PI/2),lamp:new THREE.BoxGeometry(0.5,0.2,0.1)};
const glassMat=new THREE.MeshStandardMaterial({color:0x14202e,roughness:0.15,metalness:0.6,transparent:true,opacity:0.5,depthWrite:false}),tireMat=new THREE.MeshStandardMaterial({color:0x111111,roughness:1});
function makeCarMesh(color){
  const root=new THREE.Group(),tilt=new THREE.Group();root.add(tilt);
  const paint=new THREE.MeshStandardMaterial({color,roughness:0.35,metalness:0.5});
  const body=new THREE.Mesh(cg.body,paint);body.position.y=0.65;
  const cab=new THREE.Mesh(cg.cabin,glassMat);cab.position.set(0,1.3,-0.25);
  const roof=new THREE.Mesh(cg.roof,paint);roof.position.set(0,1.64,-0.25);
  body.castShadow=cab.castShadow=roof.castShadow=true;tilt.add(body,cab,roof);
  for(const sx of[-0.7,0.7]){const hl=new THREE.Mesh(cg.lamp,headMat);hl.position.set(sx,0.72,2.2);const tl=new THREE.Mesh(cg.lamp,tailMat);tl.position.set(sx,0.78,-2.2);tilt.add(hl,tl);}
  const wheels=[];
  for(const[x,z,front]of[[-1,1.4,true],[1,1.4,true],[-1,-1.4,false],[1,-1.4,false]]){
    const pivot=new THREE.Group();pivot.position.set(x,0.38,z);const w=new THREE.Mesh(cg.wheel,tireMat);pivot.add(w);root.add(pivot);wheels.push({pivot,w,front});
  }
  root.userData={tilt,wheels};return root;
}
const CAR_COLORS=[0xd62839,0x2a6fdb,0xf2c230,0xeeeeee,0x1d1d1d,0x2fa66a,0xff7a1a,0x8a3ffc,0x16c5c5,0xc0c0c8];

