/* Programação offline contínua; sintonia pertence ao veículo, volume ao jogador. */
'use strict';
const RADIO_STYLES = {
 TERR:['Sertanejo raiz','#e6b66d','TV'], BROC:['Rock nacional','#f37679','BR'], FUNK:['Funk brasileiro','#baff68','FM'],
 DOPE:['Bass & trap','#bd94ff','DP'], BTOP:['Sertanejo universitário','#ffd26e','BT'], TRAC:['Rap nacional','#ff9f78','CT'],
 BEAT:['Eletrônica & house','#65e5dc','BH'], ROLL:['Rock internacional','#f190c2','RR'], BRAS:['MPB & reggae','#7bd8ad','BR'],
 APOP:['Pop','#d6a2ff','AP'], RAPU:['Hip-hop internacional','#9aafff','RP'], PAGO:['Pagode & samba','#ffbf82','PG']
};
const radio = {stations:[],ads:[],station:0,enabled:false,volume:0.35,clock:0,car:null,audio:new Audio(),error:'',loaded:''};
try { const s=JSON.parse(localStorage.getItem('neon-radio')||'null'); if(s&&Number.isFinite(s.volume))radio.volume=clamp(s.volume,0,1); } catch {}
function saveRadio(){try{localStorage.setItem('neon-radio',JSON.stringify({volume:radio.volume}));}catch{}}
function radioShuffle(values){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeRadioProgram(s){
 const last=s.program&&s.program[s.program.length-1],songs=radioShuffle(s.tracks);
 if(songs.length>1&&songs[0]===last)[songs[0],songs[1]]=[songs[1],songs[0]];
 s.program=[];const ads=radioShuffle(radio.ads);
 songs.forEach((song,i)=>{s.program.push(song);if(ads.length&&(i+1)%4===0)s.program.push(ads[Math.floor(i/4)%ads.length]);});
 s.cursor=0;s.index=s.tracks.indexOf(s.program[0]);
}
const radioReady=fetch('assets/radio/stations.json').then(r=>{if(!r.ok)throw Error('Catálogo ausente');return r.json();}).then(data=>{
 radio.ads=data.ads||[];
 radio.stations=data.stations.filter(s=>s.tracks.length).map(s=>{
  const [genre,color,mark]=RADIO_STYLES[s.id]||['Seleção musical','#65e5dc',s.id];
  const station={...s,genre,color,mark,failed:new Set(),start:0};makeRadioProgram(station);
  station.start=-Math.random()*Math.max(1,(station.program[0].duration||180)-3);return station;
 });cars.forEach(ensureCarRadio);
}).catch(e=>{radio.error='Rádio indisponível';console.warn(e);});
function ensureCarRadio(car){
 if(!car||!radio.stations.length)return null;
 if(!car.radio)car.radio={station:Math.floor(Math.random()*radio.stations.length),enabled:Math.random()<0.78};
 return car.radio;
}
function radioStation(){return radio.stations[radio.station];}
function radioBroadcast(station){
 if(!station)return null;let track=station.program[station.cursor],remaining=station.program.length;
 while(remaining-->0&&(radio.clock-station.start>=(track.duration||180)||station.failed.has(track.url))){
  station.start+=track.duration||180;if(station.failed.has(track.url))station.start=radio.clock;
  if(++station.cursor>=station.program.length)makeRadioProgram(station);track=station.program[station.cursor];
 }
 station.index=station.tracks.indexOf(track);return {track,offset:Math.max(0,radio.clock-station.start),station};
}
function radioTrack(){return radioBroadcast(radioStation())?.track;}
function radioActive(){return started&&!paused&&!player.dead&&!!player.car&&!!ensureCarRadio(player.car)?.enabled;}
function syncCarRadio(){radio.car=player.car;const state=ensureCarRadio(player.car);radio.station=state?state.station:0;radio.enabled=!!state?.enabled;}
function selectRadioStation(index){
 const state=ensureCarRadio(player.car);if(!state)return;
 if(index<0)state.enabled=false;else{state.station=((index%radio.stations.length)+radio.stations.length)%radio.stations.length;state.enabled=true;}
 radio.error='';syncCarRadio();
}
function changeStation(delta){const state=ensureCarRadio(player.car);if(state)selectRadioStation(state.station+delta);}
function toggleRadio(){const state=ensureCarRadio(player.car);if(state){state.enabled=!state.enabled;radio.error='';syncCarRadio();}}
function radioVolume(delta){radio.volume=clamp(radio.volume+delta,0,1);saveRadio();}
function makeRadioChannel(element){
 const ch={audio:element||new Audio(),url:'',station:null,pending:false,desired:false,token:0,blocked:false};ch.audio.preload='metadata';
 ch.audio.addEventListener('loadedmetadata',()=>{const b=radioBroadcast(ch.station);if(b&&b.track.url===ch.url)ch.audio.currentTime=Math.min(b.offset,Math.max(0,ch.audio.duration-0.1));});
 ch.audio.addEventListener('error',()=>{if(ch.station&&ch.url)ch.station.failed.add(ch.url);ch.audio.pause();ch.url='';});
 ch.audio.addEventListener('ended',()=>{const b=radioBroadcast(ch.station);if(b&&b.track.url===ch.url)ch.station.start=radio.clock-(b.track.duration||180);});
 return ch;
}
const cabinRadio=makeRadioChannel(radio.audio),streetRadios=[makeRadioChannel(),makeRadioChannel()];
function playRadioChannel(ch,station,volume){
 const a=ch.audio;ch.desired=!!station&&volume>0&&started&&!paused&&!player.dead;
 if(!ch.desired){a.pause();return;}const b=radioBroadcast(station);
 if(!b||station.failed.has(b.track.url)){a.pause();return;}a.volume=clamp(volume,0,1);
 ch.station=station;
 if(ch.url!==b.track.url){a.pause();ch.token++;ch.pending=false;ch.blocked=false;ch.url=b.track.url;a.src=ch.url;}
 if(a.readyState>=1&&Math.abs(a.currentTime-b.offset)>1.2)a.currentTime=Math.min(b.offset,Math.max(0,a.duration-0.1));
 if(a.paused&&!ch.pending&&!ch.blocked){const token=ch.token;ch.pending=true;
  a.play().then(()=>{if(!ch.desired)a.pause();}).catch(e=>{if(token!==ch.token)return;if(e.name==='NotAllowedError')ch.blocked=true;else if(e.name!=='AbortError')station.failed.add(b.track.url);}).finally(()=>{if(token===ch.token)ch.pending=false;});
 }
}
function updateRadio(dt=0){
 if(started&&!paused&&!player.dead){radio.clock+=dt;radio.stations.forEach(radioBroadcast);}syncCarRadio();const station=radioStation();
 playRadioChannel(cabinRadio,radioActive()?station:null,radio.volume);radio.loaded=cabinRadio.url;
 // Dois receptores próximos, nunca um decoder por NPC. A tomada do carro preserva a transmissão.
 const near=!player.car&&started&&!paused&&!player.dead?cars.filter(c=>c.ai&&!c.driverGone&&ensureCarRadio(c)?.enabled).map(c=>({c,d:Math.hypot(c.x-player.x,c.z-player.z)})).filter(v=>v.d<22).sort((a,b)=>a.d-b.d).slice(0,2):[];
 streetRadios.forEach((ch,i)=>{const v=near[i];playRadioChannel(ch,v?radio.stations[v.c.radio.station]:null,v?radio.volume*0.32*Math.pow(1-v.d/22,2):0);});
 $('radioHud').hidden=!player.car||!started||paused;
 const unavailable=station&&station.tracks.every(t=>station.failed.has(t.url));
 $('radioStation').textContent=radio.error||(!radio.enabled?'Rádio desligado':unavailable?'Estação fora do ar':station?.name||'Carregando rádio…');
 $('radioTrack').textContent=radio.enabled&&station?radioTrack()?.title||'':'A cidade tem sua própria trilha.';
 $('radioGenre').textContent=radio.enabled&&station?station.genre:'NO AR • NEON COAST';
 $('radioVolume').textContent=Math.round(radio.volume*100)+'%';$('radioHud').style.setProperty('--station-color',station?.color||'#65e5dc');
}
addEventListener('keydown',e=>{
 if(e.repeat||!started||paused||!player.car||(typeof selectionWheel!=='undefined'&&selectionWheel.open))return;
 if(e.code==='KeyR')changeStation(e.shiftKey?-1:1);if(e.code==='KeyM'){cabinRadio.blocked=false;toggleRadio();}
 if(e.code==='BracketLeft')radioVolume(-0.05);if(e.code==='BracketRight')radioVolume(0.05);
});
addEventListener('pointerdown',()=>{cabinRadio.blocked=false;streetRadios.forEach(c=>c.blocked=false);});
