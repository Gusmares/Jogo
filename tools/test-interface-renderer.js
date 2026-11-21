(async()=>{
 const until=async(fn,msg)=>{const end=performance.now()+20000;while(!fn()){if(performance.now()>end)throw Error(msg);await new Promise(r=>setTimeout(r,80));}};
 showMenu('skin');await selectMenuSkin('player_emmet');$('confirmSkin').click();
 await until(()=>started&&!paused,'Confirmar skin inicia jogo');
 check(player.actor.type.id==='player_emmet','Skin escolhida aplicada ao jogador');
 // Freeze the simulation, keep radio/input live for deterministic integration checks.
 window.testOriginalFrame=frame;frame=()=>{};
 const carA=cars[0],carB=cars[1];carA.radio={station:2,enabled:true};carB.radio={station:4,enabled:false};
 player.car=carA;updateRadio(.1);await until(()=>radio.audio.readyState>=2&&!radio.audio.paused,'Decodificação de áudio real');
 const first=radioBroadcast(radio.stations[2]);check(radio.station===2&&radioTrack()===first.track,'Carro herda estação e música do NPC');
 check(Math.abs(radio.audio.currentTime-first.offset)<2,'Entra no meio da transmissão');
 player.car=carB;updateRadio(.1);check(!radio.enabled&&radio.audio.paused,'Outro carro com rádio desligado');
 toggleRadio();changeStation(1);updateRadio(.1);check(carB.radio.enabled&&carB.radio.station===5,'Troca salva no carro atual');
 check(carA.radio.station===2&&carA.radio.enabled,'Sintonia de outro carro preservada');
 player.car=carA;updateRadio(10);check(radio.station===2&&radioBroadcast(radio.stations[2]).offset>first.offset+9,'Programação continua longe do carro');
 const clock=radio.clock;paused=true;updateRadio(5);check(radio.clock===clock&&radio.audio.paused,'Pausa congela transmissão');paused=false;
 const all=Array.from({length:120},()=>ensureCarRadio({}));check(all.some(s=>s.enabled)&&all.some(s=>!s.enabled)&&new Set(all.map(s=>s.station)).size>6,'Veículos sorteiam ligado/desligado e estações variadas');
 check(radio.stations.every(s=>s.tracks.every(t=>t.duration>0)),'Duração real de todas as músicas');
 const s=radio.stations[0];check(new Set(s.program.filter(t=>s.tracks.includes(t))).size===s.tracks.length,'Programação embaralhada inclui todas as músicas');
 const ad=s.program.findIndex(t=>radio.ads.includes(t));check(ad===4,'Intervalo após quatro músicas');
 s.cursor=3;s.start=radio.clock-(s.program[3].duration+.01);check(radio.ads.includes(radioBroadcast(s).track),'Avança para intervalo');
 s.start=radio.clock-(s.program[4].duration+.01);check(s.tracks.includes(radioBroadcast(s).track),'Retorna do intervalo');
 const failed=radioBroadcast(s).track;s.failed.add(failed.url);check(radioBroadcast(s).track.url!==failed.url,'Faixa com erro é pulada');
 player.car=null;carA.x=player.x+2;carA.z=player.z;carA.ai=true;carA.driverGone=false;updateRadio(.1);
 check(streetRadios.some(ch=>ch.desired&&ch.station===radio.stations[2]),'Rádio audível no NPC próximo');
 player.car=carA;updateRadio(.1);check(streetRadios.every(ch=>ch.audio.paused),'Entrar no carro silencia receptores externos');
 const previous=carA.radio.station;
 dispatchEvent(new KeyboardEvent('keydown',{code:'AltLeft',bubbles:true,cancelable:true}));check(selectionWheel.open&&selectionWheel.mode==='radio','Segurar Alt abre rádio');
 const pos=cam.a;dispatchEvent(new MouseEvent('mousemove',{movementX:80,movementY:0,bubbles:true}));check(cam.a===pos,'Mouse da roda não move câmera');
 selectionWheel.selected=4;dispatchEvent(new KeyboardEvent('keyup',{code:'AltLeft',bubbles:true,cancelable:true}));check(!selectionWheel.open&&carA.radio.station===3,'Soltar Alt confirma estação');
 openSelectionWheel('radio');selectionWheel.selected=8;closeSelectionWheel(false);check(carA.radio.station===3,'Cancelar preserva sintonia');
 openSelectionWheel('radio');selectionWheel.selected=0;closeSelectionWheel(true);check(!carA.radio.enabled,'Opção desligar na roda');
 selectRadioStation(2);openSelectionWheel('radio');updateWheelSelection();
 return true;
})()
