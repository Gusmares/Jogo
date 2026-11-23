/* NEON COAST — Laço principal do jogo */
'use strict';
/* ============================ LOOP ============================ */
let last=performance.now(),trafficT=0,hudT=0,wasFav=false,lastZone='';
function frame(now){
  requestAnimationFrame(frame);
  const elapsed=Math.max(0,(now-last)/1000);const dt=Math.min(0.05,elapsed)*(selectionWheel.open?0.15:1);adaptResolution(now-last);last=now;
  if(!paused&&started){
    windU.value=now/1000;
    updateSky(dt);applySwamp();
    if(player.car){player.mesh.visible=false;if(player.actor)player.actor.group.visible=false;}else if(player.trans)updateVehicleTransition(dt);else updateFoot(dt);
    updateCarDoors(dt);
    if(player.dead){player.deadT-=dt;if(player.deadT<=0)respawn();}
    else{player.regenDelay=Math.max(0,player.regenDelay-dt);if(player.regenDelay<=0&&player.hp<100)player.hp=Math.min(100,player.hp+2.5*dt);}
    updateCars(dt);updatePeds(dt);updateGators(dt);updatePolice(dt);updatePlayerSeat(dt);updateWeapons(dt);
    {const zn=zoneName(player.car?player.car.x:player.x,player.car?player.car.z:player.z);if(zn!==lastZone){if(lastZone)toast(zn==='Pântano'?'PÂNTANO — cuidado com os jacarés!':favelaMask(player.car?player.car.x:player.x,player.car?player.car.z:player.z)>0.25?zn.toUpperCase()+' — a viatura não sobe, a polícia vem a pé':zn.toUpperCase(),2600);lastZone=zn;}}
    if(obj)updateObjective(dt);
    updateCamera(dt);updateVegetationCulling();
    updateTrafficLights(dt);manageTraffic(dt);
    marker.userData.beam.material.opacity=0.22+0.08*Math.sin(now/300);marker.userData.ring.rotation.y=now/600;
    const fx=camTarget.x,fz=camTarget.z;
    sunLight.target.position.set(fx,0,fz);sunLight.position.set(fx+sunDir.x*160,Math.max(sunDir.y,0.15)*160,fz+sunDir.z*160);
    if(player.car){const c=player.car,sx=Math.sin(c.h),sz=Math.cos(c.h),gy=c.physics?c.physics.y-c.physics.cfg.cg:Hq(c.x,c.z);carSpot.intensity=nightF*2.6;carSpot.position.set(c.x+sx*2,gy+1,c.z+sz*2);carSpot.target.position.set(c.x+sx*22,gy,c.z+sz*22);}else carSpot.intensity=0;
    sunMesh.position.copy(camera.position).addScaledVector(sunDir,2000);moonMesh.position.copy(camera.position).addScaledVector(sunDir,-2000);stars.position.copy(camera.position);
    water.position.x=camera.position.x;water.position.z=camera.position.z;
    waterNormal.offset.set(WREP*camera.position.x/6000+now*0.000004*60,-WREP*camera.position.z/6000+now*0.0000025*60);
    lhBeam.rotation.y=now/1500;
    hudT+=dt;
    const px=player.car?player.car.x:player.x,pz=player.car?player.car.z:player.z,hd=player.car?player.car.h:player.h;
    drawMinimap(px,pz,cam.a,hd);
    hurtFlash=Math.max(0,hurtFlash-dt*1.8);
    const low=player.hp<30?(0.35+0.25*Math.sin(now/180))*(1-player.hp/30):0;
    $('vignette').style.opacity=Math.max(hurtFlash,low);
    if(hudT>0.08){hudT=0;
      $('money').textContent='$'+money.toLocaleString('pt-BR');$('clock').textContent=clockStr();
      $('zone').textContent=zoneName(px,pz);policeHud();
      $('speedo').style.display=player.car?'block':'none';if(player.car)$('spd').textContent=Math.round(Math.abs(player.car.speed)*3.6);
      $('hpBar').style.width=player.hp+'%';$('hpTxt').textContent=Math.ceil(player.hp);$('stBar').style.width=player.stam+'%';
      const pr=$('prompt');
      if(player.grabbedBy){pr.style.display='block';pr.innerHTML='Aperte <kbd>ESPAÇO</kbd> repetidamente para se soltar!';}
      else if(player.dead)pr.style.display='none';
      else if(player.car){pr.style.display='block';pr.innerHTML='<kbd>F</kbd> Sair do carro';}
      else if(player.trans)pr.style.display='none';
      else if(nearestCar()){pr.style.display='block';pr.innerHTML='<kbd>F</kbd> Entrar no carro';}
      else pr.style.display='none';
    }
    updateAudio();
  }
  updateRadio(elapsed);
  if(selectionWheel.open&&(player.dead||player.trans||paused||player.car!==selectionWheel.car))closeSelectionWheel(false);
  updateMenuPreview(elapsed);
  postRender(typeof weaponAim==='function'&&weaponAim());
}
updateSky(0);newObjective();camera.position.set(0,6,0);
window.__game={setHour:h=>{hour=h;},player,cars,peds,gators,cam,scene,renderer,THREE,Hq,hurt,inWater,nearestWater,keys,get obj(){return obj;},start:startGame,interact,
  step:dt=>{updateFoot(dt);if(player.dead){player.deadT-=dt;if(player.deadT<=0)respawn();}else{player.regenDelay=Math.max(0,player.regenDelay-dt);if(player.regenDelay<=0&&player.hp<100)player.hp=Math.min(100,player.hp+2.5*dt);}updateCars(dt);updateGators(dt);updatePolice(dt);},police,crime,copCars,UNITS,officers,EMS,emsCall,spawnUnit,prefetchUnit,vehReady,skinReady,loadSkin,makeActor,animateActor,loadVehicleType,ifpReady,findClip,AnimPlayer,EMOTES,cycleEmote,cycleOutfit,updateNpcDriver,vehicleSeat};
requestAnimationFrame(frame);
Object.assign(window.__game,{radio,radioReady,trafficReady,trafficModels,assetCatalogReady,weaponReady,weapons,equipWeapon,updateWeapons,fireWeapon,updatePlayerSeat,updateRadio,changeStation,toggleRadio,leaveCar,makeVehicleMesh,applyVehDims,Car,animateSeatedActor});
