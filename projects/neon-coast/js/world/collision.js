/* NEON COAST — Colisão (grade espacial de caixas) */
'use strict';
/* ============================ COLISÃO ============================ */
const CELL=48,grid=new Map(),EMPTY=[];
function addCollider(b){
  const x0=Math.floor((b.x0-4)/CELL),x1=Math.floor((b.x1+4)/CELL),z0=Math.floor((b.z0-4)/CELL),z1=Math.floor((b.z1+4)/CELL);
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const k=x+','+z;let l=grid.get(k);if(!l){l=[];grid.set(k,l);}l.push(b);}
}
const addRound=(x,z,r)=>addCollider({x0:x-r,x1:x+r,z0:z-r,z1:z+r});
const nearby=(x,z)=>grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL))||EMPTY;
function pushOut(p,r,boxes){
  let hit=false,nx=0,nz=0,box=null;
  for(const b of boxes){
    const cx=clamp(p.x,b.x0,b.x1),cz=clamp(p.z,b.z0,b.z1),dx=p.x-cx,dz=p.z-cz,d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2>1e-6){const d=Math.sqrt(d2),pen=r-d;p.x+=dx/d*pen;p.z+=dz/d*pen;nx+=dx/d;nz+=dz/d;}
      else{const l=p.x-b.x0,rt=b.x1-p.x,t=p.z-b.z0,bt=b.z1-p.z,m=Math.min(l,rt,t,bt);
        if(m===l){p.x=b.x0-r;nx-=1;}else if(m===rt){p.x=b.x1+r;nx+=1;}else if(m===t){p.z=b.z0-r;nz-=1;}else{p.z=b.z1+r;nz+=1;}}
      hit=true;box=b;
    }
  }
  if(hit){const l=Math.hypot(nx,nz)||1;return{nx:nx/l,nz:nz/l,box};}
  return null;
}


/* ============================ ENTIDADES DO MUNDO (NEON ENGINE) ============================
   Cada prédio/marco gerado pelo código vira uma "entidade" com id estável (tipo@x,z). Enquanto ela é gerada, o que vai para as
   malhas juntadas (Mesher, GeoBatch), as colisões e os objetos soltos na cena ficam anotados nela. Assim o editor consegue
   selecionar, mover, girar e apagar a cidade original, e o jogo aplica essas alterações (maps/world.json -> "world") ao abrir.
   As malhas continuam juntadas (mesmo desempenho); a alteração mexe só nos vértices daquela entidade (placements.js). */
const WENT = { list: [], byId: new Map(), cur: null, depth: 0 };
function entBegin(kind, name, x, z, id) {
  if (WENT.cur) { WENT.depth++; return WENT.cur; }                     // dentro de outra entidade: faz parte dela
  const base = id || kind + '@' + Math.round(x) + ',' + Math.round(z); let k = base, n = 1;
  while (WENT.byId.has(k)) k = base + '#' + (++n);
  const e = { id: k, kind, name, x, z, segs: [], geos: [], gsegs: [], cols: [], objs: [], city: typeof curCityId !== 'undefined' ? curCityId : null };
  WENT.byId.set(k, e); WENT.cur = e; return e;
}
function entEnd() {
  if (WENT.depth) { WENT.depth--; return; }
  const e = WENT.cur; WENT.cur = null; if (!e) return;
  if (e.segs.length || e.geos.length || e.objs.length) WENT.list.push(e); else WENT.byId.delete(e.id);
}
function worldEntity(kind, name, x, z, fn, id) { entBegin(kind, name, x, z, id); try { return fn(); } finally { entEnd(); } }
/* embrulha um gerador f(x, z, ...) para que cada chamada vire uma entidade */
const entityFn = (kind, name, fn) => function (...a) { return worldEntity(kind, typeof name === 'function' ? name(...a) : name, a[0], a[1], () => fn.apply(this, a)); };
for (const k of ['quad', 'tri']) {
  const f = Mesher.prototype[k];
  Mesher.prototype[k] = function () {
    const e = WENT.cur; if (!e) return f.apply(this, arguments);
    const s0 = this.v, r = f.apply(this, arguments), s = e.segs[e.segs.length - 1];
    if (s && s.m === this && s.end === s0) s.end = this.v; else e.segs.push({ m: this, start: s0, end: this.v });
    return r;
  };
}
{ const b = Mesher.prototype.build; Mesher.prototype.build = function () { const m = b.apply(this, arguments); this.__mesh = m; return m; }; }
{ const a = GeoBatch.prototype.add; GeoBatch.prototype.add = function (geo) { if (WENT.cur) { geo.__ent = WENT.cur; WENT.cur.geos.push(geo); } return a.apply(this, arguments); }; }
{ const ac = addCollider; addCollider = function (b) { if (WENT.cur) { b.__ent = WENT.cur; WENT.cur.cols.push(b); } return ac(b); }; }
{ const sa = scene.add; scene.add = function (...o) { if (WENT.cur) WENT.cur.objs.push(...o); return sa.apply(this, o); }; }
/* tira uma caixa de colisão da grade (o editor move/apaga prédios) */
function removeCollider(b) {
  const x0 = Math.floor((b.x0 - 4) / CELL), x1 = Math.floor((b.x1 + 4) / CELL), z0 = Math.floor((b.z0 - 4) / CELL), z1 = Math.floor((b.z1 + 4) / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const l = grid.get(x + ',' + z); if (!l) continue; const i = l.indexOf(b); if (i >= 0) l.splice(i, 1); }
}
