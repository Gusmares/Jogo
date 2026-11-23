(async()=>{
  const checks=[],assert=(v,msg)=>{if(!v)throw new Error(msg);checks.push(msg);};
  await Promise.all([trafficReady,ifpLoaded,pedestriansReady,loadPlayerOutfit(0,false)]);
  paused=true;started=true;$('overlay').style.display='none';
  // Localiza no terreno real um trecho irregular sem colliders, com declive longitudinal e lateral.
  let site=null;
  for(let x=HALF+90;x<HALF+280&&!site;x+=8)for(let z=-200;z<200&&!site;z+=8){
    const s=sampleCarGround(x,z);if(s.height<2||Math.abs(s.gx)<.09||Math.abs(s.gz)<.09||Math.hypot(s.gx,s.gz)>.5)continue;
    if(nearby(x,z).some(b=>x>b.x0-8&&x<b.x1+8&&z>b.z0-8&&z<b.z1+8))continue;
    site={x,z};
  }
  assert(!!site,'encontrou ladeira real para regressão');
  const original=cars.slice();original.forEach(c=>c.mesh.visible=false);cars.length=0;
  const make=id=>{const type=vehReady[id],c=new Car(0x8a3ffc,site.x,site.z,.35,false,()=>makeVehicleMesh(type,0x8a3ffc));applyVehDims(c,type.man);return c;};
  const fusca=make('vw_fusca');player.car=fusca;
  for(let i=0;i<600;i++)advanceCarPhysics(fusca,CarPhysics.STEP,{park:true});renderCarPhysics(fusca);updatePlayerSeat(.25);
  assert(Math.abs(fusca.physics.pitch)>.04&&Math.abs(fusca.physics.roll)>.04,'carro inclina nos dois eixos da ladeira');
  assert(fusca.physics.grounded===4,'quatro contatos de suspensão no declive');
  fusca.mesh.updateMatrixWorld(true);
  const gaps=fusca.mesh.userData.wheels.map(w=>{const q=w.pivot.getWorldPosition(new THREE.Vector3());return q.y-(w.radius||fusca.wr)-carGroundHeight(q.x,q.z);});
  assert(gaps.every(g=>Math.abs(g)<.09),'rodas renderizadas apoiadas no terreno '+gaps.map(g=>g.toFixed(3)).join(','));
  const pelvis=new THREE.Vector3().setFromMatrixPosition(player.seat.bones[player.seat.index.pelvis].matrixWorld);fusca.mesh.userData.tilt.worldToLocal(pelvis);
  assert(pelvis.distanceTo(new THREE.Vector3(...vehicleSeat(fusca)))<.02,'motorista acompanha a carroceria na ladeira');
  const peakBefore=fusca.physics.y;fusca.physics.y+=3;fusca.physics.vy=2;
  for(let i=0;i<15;i++)advanceCarPhysics(fusca,CarPhysics.STEP,{});renderCarPhysics(fusca);
  assert(fusca.physics.grounded===0&&fusca.physics.y>peakBefore+2,'carro sai do chão em vez de colar no terreno');
  for(let i=0;i<600;i++)advanceCarPhysics(fusca,CarPhysics.STEP,{park:true});
  assert(fusca.physics.grounded===4&&Math.abs(fusca.physics.vy)<.1,'pouso estável na ladeira real');
  const sampleBike=make('honda_biz');assert(!usesCarPhysics(sampleBike)&&!sampleBike.physics,'motos mantêm sistema anterior');removeCar(sampleBike);
  // Trânsito, viatura e emergência usam o mesmo solver; valida a integração em ruas.
  await Promise.all([prefetchUnit('rp'),loadVehicleType('ambulancia')]);
  const ai=make('vw_gol');ai.x=roadC(3)-4.2;ai.z=blockC(3);ai.h=0;ai.ai=true;ai.from=[3,3];ai.to=[3,4];setTarget(ai);
  const policeCar=make('palio_rp');policeCar.x=roadC(4)-4.2;policeCar.z=blockC(3);policeCar.h=0;
  const ambulance=make('ambulancia');ambulance.x=roadC(5)-4.2;ambulance.z=blockC(3);ambulance.h=0;
  const aiStart=ai.z;
  for(let i=0;i<1200;i++){updateAICar(ai,CarPhysics.STEP);driveToward(policeCar,CarPhysics.STEP,policeCar.x,roadC(5),20,5,20);driveToward(ambulance,CarPhysics.STEP,ambulance.x,roadC(5),18,5,18);}
  assert(ai.z>aiStart+20,'trânsito se desloca usando pneus e suspensão');
  assert(policeCar.physics&&ambulance.physics&&Number.isFinite(policeCar.speed)&&Number.isFinite(ambulance.speed),'polícia e emergência compatíveis com nova física');
  cars.filter(c=>c!==fusca).forEach(c=>c.mesh.visible=false);
  renderCarPhysics(fusca);updatePlayerSeat(.25);setVehLod(fusca.mesh.userData,true);
  player.mesh.visible=false;player.actor.group.visible=false;$('hud').style.display='none';
  hour=12;updateSky(0);sunLight.position.set(site.x+50,100,site.z+50);sunLight.target.position.set(site.x,carGroundHeight(site.x,site.z),site.z);
  const center=new THREE.Vector3(fusca.x,fusca.physics.y,fusca.z);camera.position.copy(center).add(new THREE.Vector3(6,1.4,6));camera.lookAt(center);scene.updateMatrixWorld(true);renderer.render(scene,camera);
  return {ok:true,checks:checks.length,details:checks,site,wheelGaps:gaps};
})()
