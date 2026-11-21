/* NEON COAST — HUD e minimapa */
'use strict';
/* ============================ HUD ============================ */
let toastT=0,money=0;
function toast(msg,ms=2200){const t=$('toast');t.textContent=msg;t.style.opacity=1;clearTimeout(toastT);toastT=setTimeout(()=>t.style.opacity=0,ms);}
const fmt=s=>Math.max(0,Math.ceil(s));
const clockStr=()=>{const h=Math.floor(hour),m=Math.floor((hour-h)*60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');};

/* nome da região onde o jogador está */
function zoneName(x,z){
  if(favelaMask(x,z)>0.25)return favAt(x,z).name;
  {const b=spBairro(x,z);if(b)return b;}                 // bairros e marcos de São Paulo
  const c=cityAt(x,z,10);if(c)return c.name;
  if(onHighway(x,z,30))return HWY.name;
  if(z>HALF+4&&Math.abs(x)<HALF+170)return 'Pântano';
  if(x>RJ.x0-350)return 'Rio de Janeiro';
  return x>HALF+120?'Serra das Araras':'São Paulo';
}
/* minimapa do relevo */
const MAPR=2,mapW=Math.ceil((X1-X0)/MAPR),mapH=Math.ceil((Z1-Z0)/MAPR),mapCv=mkCanvas(mapW,mapH);
{
  const g=mapCv.getContext('2d'),img=g.createImageData(mapW,mapH);
  for(let py=0;py<mapH;py++)for(let px=0;px<mapW;px++){
    const x=X0+px*MAPR,z=Z0+py*MAPR,h=Hq(x,z),sw=gridAt(SWG,x,z),shade=0.88+clamp((Hq(x-3,z-3)-Hq(x+3,z+3))*0.05,-0.25,0.25);
    let r,gg,b;
    if(h<WL){const t=clamp((WL-h)/6,0,1);if(sw>0.4&&h>-1.6){r=58;gg=88;b=62;}else{r=lerp(46,14,t);gg=lerp(128,62,t);b=lerp(176,112,t);}}
    else if(sw>0.4){r=50;gg=74;b=44;}
    else if(h<WL+1.3){r=214;gg=200;b=160;}
    else if(h>48){r=124;gg=118;b=108;}
    else{const k=clamp(h/45,0,1);r=lerp(94,56,k);gg=lerp(132,96,k);b=lerp(68,50,k);}
    const i=(py*mapW+px)*4;img.data[i]=r*shade;img.data[i+1]=gg*shade;img.data[i+2]=b*shade;img.data[i+3]=255;
  }
  g.putImageData(img,0,0);
  g.setTransform(1/MAPR,0,0,1/MAPR,-X0/MAPR,-Z0/MAPR);
  g.fillStyle='#7d8798';for(const c of CITIES)g.fillRect(c.x0,c.z0,c.x1-c.x0,c.z1-c.z0);g.fillRect(-6,HALF,12,SWD-30);
  g.fillRect(HWY.x0,HWY.z-RW/2,HWY.x1-HWY.x0,RW);
  for(const c of CITIES)for(let i=c.i0;i<c.i0+c.ni;i++)for(let j=c.j0;j<c.j0+c.nj;j++){g.fillStyle=parkSet.has(i+','+j)?'#2d6a4f':'#232c3a';g.fillRect(blockC(i)-B/2,blockC(j)-B/2,B,B);}
  for(const FV of FAVELAS){
    g.strokeStyle='#7d8798';g.lineWidth=FAV_ROAD_HW*1.6;g.lineJoin='round';g.beginPath();FV.F.road.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();
    g.strokeStyle='#c9b79c';g.lineWidth=1.6;for(const al of FV.alleys){g.beginPath();al.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();}
    g.fillStyle='#b5714f';for(const h of FV.houses){g.save();g.translate(h.x,h.z);g.rotate(h.yaw);g.fillRect(-h.w/2,-h.d/2,h.w,h.d);g.restore();}
  }
}
const mg=$('mm').getContext('2d'),MS=200,MSC=1.15;
let obj=null;const gators=[];
function drawMinimap(px,pz,a,hdg){
  mg.clearRect(0,0,MS,MS);mg.save();mg.beginPath();mg.arc(MS/2,MS/2,MS/2-1,0,7);mg.clip();
  mg.fillStyle='#0d3552';mg.fillRect(0,0,MS,MS);
  const th=a-Math.PI;mg.translate(MS/2,MS/2);mg.rotate(th);mg.scale(MSC,MSC);mg.translate(-px,-pz);
  mg.drawImage(mapCv,X0,Z0,mapW*MAPR,mapH*MAPR);
  mg.fillStyle='#ffdd55';for(const c of cars){if(c===player.car)continue;mg.fillRect(c.x-1.6,c.z-1.6,3.2,3.2);}
  mg.fillStyle='rgba(235,235,235,.85)';for(const n of peds){if(n.ph==='dead')continue;mg.fillRect(n.x-0.9,n.z-0.9,1.8,1.8);}
  mg.fillStyle='#ff6a3a';for(const gt of gators)if(gt.state!=='lurk'&&gt.state!=='patrol'||Math.hypot(gt.x-px,gt.z-pz)<40)mg.fillRect(gt.x-1.8,gt.z-1.8,3.6,3.6);
  if(obj){mg.strokeStyle='#ff3ea5';mg.lineWidth=2.5;mg.beginPath();mg.arc(obj.x,obj.z,8,0,7);mg.stroke();}
  mg.translate(px,pz);mg.rotate(Math.PI-hdg);mg.fillStyle='#fff';mg.strokeStyle='#000';mg.lineWidth=1.2;
  mg.beginPath();mg.moveTo(0,-7);mg.lineTo(5,6);mg.lineTo(0,3);mg.lineTo(-5,6);mg.closePath();mg.fill();mg.stroke();mg.restore();
  if(obj){const dx=obj.x-px,dz=obj.z-pz,rx=(dx*Math.cos(th)-dz*Math.sin(th))*MSC,ry=(dx*Math.sin(th)+dz*Math.cos(th))*MSC,l=Math.hypot(rx,ry),mx=MS/2-12;
    if(l>mx){const k=mx/l;mg.fillStyle='#ff3ea5';mg.beginPath();mg.arc(MS/2+rx*k,MS/2+ry*k,6,0,7);mg.fill();mg.strokeStyle='#fff';mg.lineWidth=1.5;mg.stroke();}}
}

