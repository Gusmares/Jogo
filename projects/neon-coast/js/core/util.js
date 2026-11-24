/* NEON COAST — Utilidades, ruído e constantes do mundo */
'use strict';
/* ============================ UTIL ============================ */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const rnd=mulberry32(20261119);
const rr=(a,b)=>a+(b-a)*rnd();          // mundo determinístico
const R2=(a,b)=>a+(b-a)*Math.random();  // aleatório em jogo
/* ruído de valor */
function hash2(ix,iz){let h=Math.imul(ix,374761393)^Math.imul(iz,668265263);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;}
function vnoise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  return lerp(lerp(hash2(ix,iz),hash2(ix+1,iz),u),lerp(hash2(ix,iz+1),hash2(ix+1,iz+1),u),v);}
function fbm(x,z,o){let a=0.5,s=0,f=1,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f,z*f);n+=a;f*=2;a*=0.5;}return s/n;}
const sdBox=(px,pz,cx,cz,hx,hz)=>{const qx=Math.abs(px-cx)-hx,qz=Math.abs(pz-cz)-hz;return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0);};
const smin=(a,b,k)=>{const h=clamp(0.5+0.5*(b-a)/k,0,1);return lerp(b,a,h)-k*h*(1-h);};

/* ---- interruptores de otimização de desenho (engine/docs/desempenho-batching.md) ----
   NOBATCH = true desliga TODAS de uma vez (também com ?nobatch=1 na URL, para medir antes/depois); cada uma tem seu interruptor no topo do arquivo dela. */
const NOBATCH = typeof location !== 'undefined' && /[?&]nobatch=1/.test(location.search);
const FAR_CULL = !NOBATCH && true;       // blocos estáticos (terreno, cidade) inteiros além da névoa (fog.far) não são desenhados: seriam só cor de névoa. Função: updateFarCull (foliage-lib.js)
const FARC = [];
function farCullAdd(m) {
  if (!FAR_CULL || !m || !(m.isMesh || m.isLineSegments) || m.isSkinnedMesh) return m;
  const ms = Array.isArray(m.material) ? m.material : [m.material]; if (!ms.every(x => x && x.fog !== false && !x.isShaderMaterial)) return m;
  FARC.push(m); return m;
}

/* junta geometrias estáticas em poucas malhas (por material e por bloco de 150 m): menos chamadas de desenho, com culling por bloco */
class GeoBatch {
  constructor(cell) { this.cell = cell || 150; this.map = new Map(); }
  add(geo, mat, x, y, z, matrix, color) {
    if (matrix) geo.applyMatrix4(matrix); else geo.translate(x, y, z);
    if (color !== undefined) { const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    const k = mat.uuid + '|' + Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); let b = this.map.get(k); if (!b) { b = { mat, geos: [] }; this.map.set(k, b); } b.geos.push(geo);
  }
  flush(cast, receive) {
    for (const b of this.map.values()) {
      let nv = 0, ni = 0; for (const g of b.geos) { nv += g.attributes.position.count; ni += g.index.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = new Uint32Array(ni), hasC = !!b.geos[0].attributes.color, C = hasC ? new Float32Array(nv * 3) : null; let vo = 0, io = 0;
      const es = []; for (const g of b.geos) { if (g.__ent) es.push([g.__ent, vo, vo + g.attributes.position.count]); if (hasC) C.set(g.attributes.color.array, vo * 3); P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); U.set(g.attributes.uv.array, vo * 2); const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[io + i] = ix[i] + vo; vo += g.attributes.position.count; io += ix.length; g.dispose(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); if (hasC) g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, b.mat); m.castShadow = !!cast; m.receiveShadow = receive !== false; scene.add(m); farCullAdd(m);
      for (const [e, s0, s1] of es) e.gsegs.push({ mesh: m, start: s0, end: s1 });          // entidades do mundo (editor): onde cada prédio foi parar na malha juntada
    }
    this.map.clear();
  }
}

/* ============================ MUNDO ============================ */
const N=8,B=56,RW=18,P=B+RW,S=N*P+RW,HALF=S/2;
/* As duas cidades e a rodovia moram numa MESMA grade de ruas (espaçamento P): o cruzamento (i,j) fica em (roadC(i), roadC(j)) para qualquer i,j inteiro.
   São Paulo ocupa i,j 0..8 (a cidade original, no centro do mapa); o Rio fica a leste (i 26..36, j 1..7) e a Via Dutra liga as duas pela linha j=6. */
const roadC=i=>-HALF+RW/2+i*P;
const blockC=i=>-HALF+RW+B/2+i*P;
const CITIES=[
  {id:'sp',name:'São Paulo',i0:0,j0:0,ni:8,nj:8},
  {id:'rj',name:'Rio de Janeiro',i0:26,j0:1,ni:10,nj:6}
];
for(const c of CITIES){c.x0=roadC(c.i0)-RW/2;c.x1=roadC(c.i0+c.ni)+RW/2;c.z0=roadC(c.j0)-RW/2;c.z1=roadC(c.j0+c.nj)+RW/2;c.cx=(c.x0+c.x1)/2;c.cz=(c.z0+c.z1)/2;c.hx=(c.x1-c.x0)/2;c.hz=(c.z1-c.z0)/2;}
const SP=CITIES[0],RJ=CITIES[1];
const HWY={j:6,i0:SP.i0+SP.ni,i1:RJ.i0,name:'Via Dutra'};HWY.z=roadC(HWY.j);HWY.x0=roadC(HWY.i0);HWY.x1=roadC(HWY.i1);
const cityAt=(x,z,m=0)=>{for(const c of CITIES)if(Math.abs(x-c.cx)<c.hx+m&&Math.abs(z-c.cz)<c.hz+m)return c;return null;};
const cityDist=(c,x,z)=>Math.hypot(Math.max(Math.abs(x-c.cx)-c.hx,0),Math.max(Math.abs(z-c.cz)-c.hz,0));
const nearestCity=(x,z)=>{let b=CITIES[0],bd=1e9;for(const c of CITIES){const d=cityDist(c,x,z);if(d<bd){bd=d;b=c;}}return b;};
/* cruzamento existe? (dentro de alguma cidade ou na rodovia) — a rodovia só tem ligações leste-oeste */
const nodeOK=(i,j)=>{for(const c of CITIES)if(i>=c.i0&&i<=c.i0+c.ni&&j>=c.j0&&j<=c.j0+c.nj)return true;return j===HWY.j&&i>=HWY.i0&&i<=HWY.i1;};
const blockOK=(i,j)=>{for(const c of CITIES)if(i>=c.i0&&i<c.i0+c.ni&&j>=c.j0&&j<c.j0+c.nj)return c;return null;};
const isHwyNode=(i,j)=>j===HWY.j&&i>HWY.i0&&i<HWY.i1;
const onHighway=(x,z,m=0)=>x>HWY.x0-2&&x<HWY.x1+2&&Math.abs(z-HWY.z)<RW/2+m;
const nodeIJ=(x,z)=>[Math.round((x-roadC(0))/P),Math.round((z-roadC(0))/P)];
const SWD=360;            // profundidade do pântano
const WL=-0.05;           // nível da água
const X0=-900,Z0=-760,CS=6,NX=667,NZ=286,W1=NX+1,X1=X0+NX*CS,Z1=Z0+NZ*CS;


/* ============================ MAPA EDITÁVEL (NEON ENGINE) ============================
   maps/world.json é o arquivo que o editor (editor.html / NEON ENGINE.exe) salva — o equivalente aos IDE/IPL do SA:
   planta das cidades (tipo de cada quarteirão), marcos, objetos colocados, geradores de carro e o ponto de partida.
   Lido de forma síncrona porque a cidade é montada enquanto os scripts carregam. Sem o arquivo, vale o mapa do código. */
const MAPDATA=(()=>{
  const q=typeof location!=='undefined'?new URLSearchParams(location.search):null,file=(q&&q.get('map'))||'maps/world.json';
  if(!/^maps\/[\w\-\/]+\.json$/.test(file))return{};
  try{const x=new XMLHttpRequest();x.open('GET',file+'?t='+Date.now(),false);x.send();if(x.status===200){const d=JSON.parse(x.responseText);d.__file=file;return d;}}
  catch(e){console.warn('Mapa: não consegui ler '+file,e);}
  return{};
})();
/* planta de uma cidade: a do arquivo do mapa (se válida, mesmo tamanho) ou a do código */
function mapLayout(id,def){const L=MAPDATA.layouts&&MAPDATA.layouts[id];return Array.isArray(L)&&L.length===def.length&&L.every((r,k)=>typeof r==='string'&&r.length===def[k].length)?L:def;}
/* relevo esculpido no editor: MAPDATA.terrain = { unit: metros por passo, rows: { "<linha iz>": base64 de Int16 (deslocamento de cada ponto da linha) } }.
   Somado à grade de alturas (terrain.js) logo depois de gerada, antes de água, vegetação e estradas olharem para ela. */
function mapTerrainDelta(n, w) {
  const T = MAPDATA.terrain, out = new Float32Array(n); if (!T || !T.rows) return null;
  const u = +T.unit || 0.05; let any = false;
  for (const [k, b64] of Object.entries(T.rows)) {
    const iz = +k; if (!(iz >= 0) || iz * w >= n) continue;
    try { const bin = atob(b64), a = new Int16Array(new Uint8Array([...bin].map(c => c.charCodeAt(0))).buffer); for (let ix = 0; ix < Math.min(w, a.length); ix++) if (a[ix]) { out[iz * w + ix] = a[ix] * u; any = true; } }
    catch (e) { console.warn('Mapa: linha de relevo inválida', k); }
  }
  return any ? out : null;
}
