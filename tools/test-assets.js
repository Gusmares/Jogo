'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..'),cfg=require('./assets.json');
for(const entry of [...cfg.vehicles,...cfg.weapons]){
  const base=path.join(root,'assets/models',entry.id),man=JSON.parse(fs.readFileSync(path.join(base,'model.json')));
  for(const m of Object.values(man.meshes)){
    const data=fs.readFileSync(path.join(base,m.file));assert.equal(data.length,m.verts*32+m.indices*4,entry.id);
    for(let i=0;i<m.verts*8;i++)assert.ok(Number.isFinite(data.readFloatLE(i*4)),entry.id+' float');
    for(let i=0;i<m.indices;i++)assert.ok(data.readUInt32LE(m.verts*32+i*4)<m.verts,entry.id+' index');
  }
  for(const texture of Object.values(man.textures))assert.ok(fs.existsSync(path.join(base,texture)));
  if(entry.kind==='bus'){assert.ok(man.dims.width<3.2);assert.ok(man.dims.len>10&&man.dims.len<13);}
  if(entry.trafficWeight){assert.ok(man.wheels.length>=2);assert.equal(man.lights.length,0);assert.ok(man.seats.driver.every(Number.isFinite));}
}
const stations=JSON.parse(fs.readFileSync(path.join(root,'assets/radio/stations.json'))).stations;
const ads=JSON.parse(fs.readFileSync(path.join(root,'assets/radio/stations.json'))).ads;assert.equal(ads.length,5);ads.forEach(a=>assert.ok(fs.existsSync(path.join(root,a.url))));
assert.equal(stations.length,12);assert.equal(stations.reduce((n,s)=>n+s.tracks.length,0),226);
for(const station of stations)for(const track of station.tracks){const file=path.join(root,track.url);assert.ok(fs.statSync(file).size>1000);}
assert.ok(cfg.disabled.includes('Mod_de_ser_assaltado'));
const server=http.createServer(require('../electron/static-server')(root));
server.listen(0,'127.0.0.1',async()=>{
  try{
    const base='http://127.0.0.1:'+server.address().port,url=base+'/'+stations[0].tracks[0].url;
    const r=await fetch(url,{headers:{Range:'bytes=0-15'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'audio/mpeg');assert.equal((await r.arrayBuffer()).byteLength,16);
    const bad=await fetch(url,{headers:{Range:'bytes=9999999999-'}});assert.equal(bad.status,416);
    assert.equal((await fetch(base+'/%E0%A4%A')).status,400);
    console.log('PASS: 9 modelos, índices/geometrias/texturas, ônibus, 12 estações/226 faixas, HTTP Range e mod desativado.');
  }catch(e){console.error(e);process.exitCode=1;}finally{server.close();}
});
