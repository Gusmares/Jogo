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
  let hit=false,nx=0,nz=0;
  for(const b of boxes){
    const cx=clamp(p.x,b.x0,b.x1),cz=clamp(p.z,b.z0,b.z1),dx=p.x-cx,dz=p.z-cz,d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2>1e-6){const d=Math.sqrt(d2),pen=r-d;p.x+=dx/d*pen;p.z+=dz/d*pen;nx+=dx/d;nz+=dz/d;}
      else{const l=p.x-b.x0,rt=b.x1-p.x,t=p.z-b.z0,bt=b.z1-p.z,m=Math.min(l,rt,t,bt);
        if(m===l){p.x=b.x0-r;nx-=1;}else if(m===rt){p.x=b.x1+r;nx+=1;}else if(m===t){p.z=b.z0-r;nz-=1;}else{p.z=b.z1+r;nz+=1;}}
      hit=true;
    }
  }
  if(hit){const l=Math.hypot(nx,nz)||1;return{nx:nx/l,nz:nz/l};}
  return null;
}

