/* NEON COAST — Câmera, atmosfera do pântano */
'use strict';
/* ============================ CÂMERA ============================ */
const camTarget=new THREE.Vector3();
function updateCamera(dt){
  const look=(keys.ArrowLeft?1:0)-(keys.ArrowRight?1:0),lookP=(keys.ArrowDown?1:0)-(keys.ArrowUp?1:0);
  if(look){cam.a+=look*2*dt;cam.lastMouse=performance.now();}
  if(lookP){cam.p=clamp(cam.p+lookP*1.2*dt,-0.35,1.3);cam.lastMouse=performance.now();}
  const c=player.car,aimK=(typeof weapons!=='undefined'&&!c)?weapons.aim:0;let dist=lerp(5.5,2.15,aimK),ty=lerp(1.6,1.68,aimK),fov=lerp(65,52,aimK);
  if(c){
    // distância/altura pelo tamanho do veículo; segue a frente do carro, puxando um pouco para onde ele realmente vai (derrapagem fica legível)
    const L=c.len||4.4,H=(c.dims&&c.dims.height)||1.5,p=c.physics;dist=clamp(4.6+L*1.05,7.2,19);ty=clamp(0.9+Math.min(H,3.4)*0.42,1.4,2.6);
    if(performance.now()-cam.lastMouse>1200&&Math.abs(c.speed)>2){
      let aim=c.speed>=0?c.h:c.h+Math.PI;const sp2=p?Math.hypot(p.vx,p.vz):0;
      if(p&&sp2>5&&c.speed>0)aim+=wrap(Math.atan2(p.vx,p.vz)-aim)*0.35;
      cam.a+=wrap(aim-cam.a)*Math.min(1,dt*(2.6+Math.min(Math.abs(c.speed),30)*0.05));
    }
    camTarget.set(c.x,(p?p.y-p.cfg.cg:Hq(c.x,c.z))+ty,c.z);fov=63+Math.min(Math.abs(c.speed),45)*0.42;
  }else{
    const shoulder=aimK*0.62;camTarget.set(player.x-Math.cos(cam.a)*shoulder,player.y+ty,player.z+Math.sin(cam.a)*shoulder);   // ombro direito: a câmera e o ponto de mira ficam deslocados para o lado
  }
  const cp=Math.cos(cam.p),sp=Math.sin(cam.p),q={x:camTarget.x-Math.sin(cam.a)*dist*cp,z:camTarget.z-Math.cos(cam.a)*dist*cp};
  pushOut(q,0.9,nearby(q.x,q.z));
  camera.position.set(q.x,Math.max(Hq(q.x,q.z)+0.7,camTarget.y+dist*sp),q.z);
  if(shake>0.01){camera.position.x+=(Math.random()-0.5)*shake*0.5;camera.position.y+=(Math.random()-0.5)*shake*0.5;shake*=Math.exp(-dt*5);}
  camera.lookAt(camTarget);
  if(window.__camHook)window.__camHook(camera);      // gancho de depuração (câmera livre nos testes)
  if(Math.abs(camera.fov-fov)>0.1){camera.fov=lerp(camera.fov,fov,Math.min(1,dt*4));camera.updateProjectionMatrix();}
}

/* atmosfera do pântano */
const swTint=new THREE.Color(0x5d7a52),tmpC=new THREE.Color();
function applySwamp(){
  const f=smooth(HALF-20,HALF+70,camera.position.z)*(1-smooth(HALF+200,HALF+400,Math.abs(camera.position.x)));
  scene.fog.near=lerp(150,40,f);scene.fog.far=lerp(1200,420,f);
  tmpC.copy(swTint).multiplyScalar(0.12+0.88*dayF);scene.fog.color.lerp(tmpC,f*0.75);scene.background.lerp(scene.fog.color,f*0.8);
}
let wasSwamp=false;

