/* NEON COAST — Renderizador, cena, câmera e luzes */
'use strict';
/* ============================ RENDERER ============================ */
const renderer=new THREE.WebGLRenderer({canvas:$('c'),antialias:false,powerPreference:'high-performance',stencil:false});   // sem MSAA: o anti-aliasing é feito no pós-processamento (post.js)
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(65,1,0.5,2800);
scene.fog=new THREE.Fog(0x7cc4ff,150,1200);
scene.background=new THREE.Color(0x7cc4ff);
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();if(typeof postResize==='function')postResize();}
addEventListener('resize',resize);resize();

const hemi=new THREE.HemisphereLight(0xbfd8ff,0x5a5a48,0.6);scene.add(hemi);
const sunLight=new THREE.DirectionalLight(0xffffff,1);
sunLight.castShadow=true;
sunLight.shadow.mapSize.set(1024,1024);
Object.assign(sunLight.shadow.camera,{left:-58,right:58,top:58,bottom:-58,near:1,far:520});
sunLight.shadow.bias=-0.0005;
scene.add(sunLight,sunLight.target);
const moonLight=new THREE.DirectionalLight(0x8fa8ff,0);scene.add(moonLight);
const carSpot=new THREE.SpotLight(0xfff2d0,0,70,0.5,0.5,1);scene.add(carSpot,carSpot.target);

