(async()=>{
  const checks=[],assert=(v,msg)=>{if(!v)throw new Error(msg);checks.push(msg);};
  const until=async(fn,msg)=>{const end=performance.now()+60000;while(!fn()){if(performance.now()>end)throw new Error('Timeout: '+msg);await new Promise(r=>setTimeout(r,100));}};
  await Promise.all([trafficReady,weaponReady,radioReady,pedestriansReady,ifpLoaded,loadSkin(PLAYER_SKINS[0]),prefetchUnit('rp')]);
  assert(peds.length===40&&peds.every(p=>p.actor&&p.actor.mesh.isSkinnedMesh),'40 pedestres com skins');
  assert(new Set(peds.map(p=>p.actor.type.id)).size===3,'três skins civis variadas');
  assert(peds.every(p=>p.mesh.children.length===1&&p.mesh.children[0]===p.actor.group),'sem bonecos de blocos nos pedestres');
  assert(peds[0].actor.type.geo===peds[3].actor.type.geo&&peds[0].actor.bones[0]!==peds[3].actor.bones[0],'geometria compartilhada e esqueletos independentes');
  const ped=peds[0],savedWait=ped.wait,savedCamera=camera.position.clone();
  camera.position.copy(ped.mesh.position);ped.wait=0;updatePedestrianActor(ped,0.1);assert(ped.actor.ap.name==='WALK_player','pedestre usa caminhada IFP');
  const savedRoute=ped.s;ped.wait=1;updatePeds(0.1);assert(ped.s===savedRoute&&ped.actor.ap.name==='IDLE_stance','pedestre para na rota com animação de espera');
  camera.position.x+=300;updatePedestrianActor(ped,0.1);assert(!ped.actor.group.visible,'oculta skin distante sem substituto em blocos');
  camera.position.copy(ped.mesh.position);updatePedestrianActor(ped,0.1);assert(ped.actor.group.visible,'skin reaparece ao se aproximar');
  ped.wait=savedWait;camera.position.copy(savedCamera);
  await until(()=>!!player.actor,'skin jogador');
  started=true;paused=false;$('overlay').style.display='none';initAudio();
  assert(trafficModels.length===7,'sete modelos civis carregados');assert(weapons.items.length===2,'duas armas carregadas');
  assert(cars.some(c=>c.ai&&c.modelId&&!c.cop),'modelos no trânsito');
  for(const type of trafficModels){
    const c=cars.find(c=>c.modelId===type.id&&!c.ai)||cars.find(c=>c.modelId===type.id);player.car=c;updatePlayerSeat(0.05);
    assert(player.seat.group.parent===c.mesh.userData.tilt,type.id+' jogador no veículo');
    for(let i=0;i<10;i++)animateSeatedActor(player.seat,c,0.05);
    c.mesh.updateWorldMatrix(true,true);const pelvis=new THREE.Vector3().setFromMatrixPosition(player.seat.bones[player.seat.index.pelvis].matrixWorld);c.mesh.userData.tilt.worldToLocal(pelvis);
    assert(pelvis.distanceTo(new THREE.Vector3(...vehicleSeat(c)))<0.01,type.id+' pélvis no banco');
    assert(player.seat.ap.name===(type.man.kind==='bike'?'WF_Ride':'CAR_sit'),type.id+' animação de dirigir');
    leaveCar();updatePlayerSeat(0.01);assert(!player.seat,type.id+' remoção ao sair');
  }
  const cop=new Car(0xffffff,0,0,0,true,()=>makeVehicleMesh(vehReady.palio_rp));applyVehDims(cop,vehReady.palio_rp.man);cop.cop=true;cop.unit='rp';
  updateNpcDriver(cop,2,0.05);assert(!!cop.driver&&cop.driver.group.visible,'policial visível dirigindo');cop.officers=1;updateNpcDriver(cop,2,0.05);assert(!cop.driver.group.visible,'viatura vazia durante abordagem');
  cop.officers=0;player.car=cop;updatePlayerSeat(0.05);assert(!cop.driver.group.visible,'sem motorista duplicado na viatura roubada');leaveCar();updatePlayerSeat(0.01);removeCar(cop);
  const c=cars.find(c=>c.modelId==='vw_gol');player.car=c;updatePlayerSeat(0.05);
  const previous=player.seat;await loadPlayerOutfit(1,false);updatePlayerSeat(0.05);assert(player.seat!==previous&&player.seat.type===player.actor.type,'troca de roupa sentado');
  assert(vehReady.palio_rp.mats.some(m=>m.transparent&&m.opacity<0.3),'vidros transparentes');
  radio.enabled=true;radio.error='';radio.failed.clear();radio.station=0;updateRadio();
  await until(()=>radio.audio.readyState>=2&&!radio.audio.paused,'rádio tocando');
  const initialTime=radio.audio.currentTime;await new Promise(r=>setTimeout(r,350));assert(radio.audio.currentTime>initialTime,'áudio decodificado e reproduzindo');
  paused=true;updateRadio();assert(radio.audio.paused,'rádio pausa com jogo');paused=false;
  changeStation(1);updateRadio();await until(()=>radio.audio.readyState>=2&&!radio.audio.paused,'troca rádio');assert(radio.station===1,'troca estação');
  const s=radioStation(),idx=s.index;radio.audio.dispatchEvent(new Event('ended'));assert(s.index===(idx+1)%s.tracks.length,'avanço de faixa');
  radio.completed=3;radio.audio.dispatchEvent(new Event('ended'));assert(radio.ad>=0,'intervalo da rádio');radio.audio.dispatchEvent(new Event('ended'));assert(radio.ad===-1,'música retorna após intervalo');
  leaveCar();updatePlayerSeat(0.01);updateRadio();assert(radio.audio.paused,'rádio silencia fora do veículo');
  for(let i=0;i<weapons.items.length;i++){equipWeapon(i);updateWeapons(0.01);const item=weapons.items[i],ammo=item.ammo;weapons.cooldown=0;assert(fireWeapon(),'disparo '+item.name);assert(item.ammo===ammo-1,'munição '+item.name);reloadWeapon();updateWeapons(item.reload+0.01);assert(item.ammo===item.capacity,'recarga '+item.name);}
  equipWeapon(-1);
  // Cena determinística para inspeção visual (câmera lateral junto ao banco).
  paused=true;radio.audio.pause();c.ai=false;c.x=0;c.z=20;c.h=0;c.mesh.position.set(0,Hq(0,20)+0.06,20);c.mesh.rotation.set(0,0,0);player.car=c;updatePlayerSeat(0.01);player.actor.group.visible=false;player.mesh.visible=false;
  await loadPlayerOutfit(0,false);updatePlayerSeat(0.01);player.actor.group.visible=false;
  setVehLod(c.mesh.userData,true);hour=12;updateSky(0);sunLight.position.set(50,80,60);sunLight.target.position.set(0,0,20);camera.position.set(3.5,1.9,22.8);camera.lookAt(0,1.0,20);scene.updateMatrixWorld(true);renderer.render(scene,camera);
  return {ok:true,checks:checks.length,details:checks,radioTracks:radio.stations.reduce((n,s)=>n+s.tracks.length,0)};
})()
