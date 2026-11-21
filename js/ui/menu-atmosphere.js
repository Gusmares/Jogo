/* Cenário ilustrado do menu. Canvas 2D independente da cena e da câmera do jogo. */
(function () {
  'use strict';
  const overlay = document.getElementById('overlay');
  const canvas = document.getElementById('menuAtmosphere');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const backdrop = document.createElement('canvas'), foreground = document.createElement('canvas');
  let width = 0, height = 0, ratio = 1, raf = 0, last = 0, time = 0;
  let pointerX = 0, pointerY = 0, panX = 0, panY = 0, visible = false;
  let seed = 8127;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const lights = [], stars = [];
  function gradient(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent'); return g;
  }
  function shape(c, points, color) {
    c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x*width,y*height) : c.moveTo(x*width,y*height));
    c.closePath(); c.fillStyle = color; c.fill();
  }
  function palm(c, x, y, size, lean) {
    c.save(); c.translate(x*width,y*height); c.scale(size*height,size*height);
    c.fillStyle = '#070d1b'; c.beginPath(); c.moveTo(-.025,0);
    c.bezierCurveTo(-.015,-.3,lean-.035,-.69,lean,-1);
    c.bezierCurveTo(lean+.04,-.67,.025,-.28,.025,0); c.fill();
    c.translate(lean,-1);
    for(let side=-1;side<=1;side+=2) for(let f=0;f<5;f++) {
      const reach=.29+f*.035, drop=-.1+f*.085;
      c.save();c.rotate(side*(-.5+f*.13));c.strokeStyle='#070d1b';c.lineWidth=.008;
      c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(side*reach*.6,drop-.25,side*reach,drop);c.stroke();
      for(let j=1;j<17;j++) {
        const t=j/17,cx=side*reach*.6,cy=drop-.25;
        const bx=2*(1-t)*t*cx+t*t*side*reach,by=2*(1-t)*t*cy+t*t*drop;
        const dx=2*(1-t)*cx+2*t*(side*reach-cx),dy=2*(1-t)*cy+2*t*(drop-cy),len=Math.hypot(dx,dy);
        const leaf=.11*Math.sin(Math.PI*t)*(.5+reach);
        for(const edge of [-1,1]) {
          const tx=bx+side*.035+edge*(-dy/len)*leaf,ty=by+.025+edge*(dx/len)*leaf;
          c.beginPath();c.moveTo(bx,by);c.quadraticCurveTo((bx+tx)/2-side*.01,(by+ty)/2-.015,tx,ty);c.quadraticCurveTo((bx+tx)/2+side*.006,(by+ty)/2,bx,by);c.fill();
        }
      }
      c.restore();
    }
    c.restore();
  }
  function skyline(c, horizon, base, maxHeight, color, detailed) {
    let x=.32;
    while(x<1.09) {
      const bw=.012+random()*.035, bh=.018+random()*maxHeight;
      const y=horizon-bh;
      c.fillStyle=color;c.fillRect(x*width,y*height,bw*width,(bh+base)*height);
      if(random()>.6){c.fillRect((x+bw*.18)*width,(y-.009)*height,bw*.64*width,.01*height);}
      if(detailed){
        c.fillStyle='#fcaf8850';
        for(let wx=x+.003;wx<x+bw-.003;wx+=.0045) for(let wy=y+.007;wy<horizon-.006;wy+=.010) {
          if(random()<.58)continue;
          c.fillStyle=random()>.75?'#75d7f59a':'#dfaf9580';c.fillRect(wx*width,wy*height,Math.max(1,.0012*width),Math.max(1,.0024*height));
          if(random()>.94)lights.push({x:wx,y:wy,phase:random()*6});
        }
        c.fillStyle='#c080ad35';c.fillRect(x*width,y*height,bw*width,1);
      }
      x+=bw+.003+random()*.009;
    }
  }
  function tower(c, x, y, w, h) {
    shape(c,[[x,y],[x+w,y],[x+w*.88,y-h],[x+w*.12,y-h]],'#111b35');
    c.strokeStyle='#bc8fc142';c.lineWidth=1;
    for(let i=1;i<18;i++){const yy=y-h*i/18;c.beginPath();c.moveTo((x+w*.13)*width,yy*height);c.lineTo((x+w*.87)*width,yy*height);c.stroke();}
    c.strokeStyle='#79cfe57a';c.beginPath();c.moveTo((x+w*.1)*width,y*height);c.lineTo((x+w*.15)*width,(y-h)*height);c.lineTo((x+w*.85)*width,(y-h)*height);c.stroke();
    c.fillStyle='#d6aec9';c.fillRect((x+w*.49)*width,(y-h-.035)*height,1,.035*height);
    c.fillStyle='#f7b8a9';c.fillRect((x+w*.49)*width,(y-h-.035)*height,2,2);
  }
  function paintBackdrop(c) {
    const sky=c.createLinearGradient(0,0,width*.16,height);
    sky.addColorStop(0,'#0b122c');sky.addColorStop(.35,'#303254');sky.addColorStop(.57,'#975c7c');sky.addColorStop(.66,'#e48b8d');sky.addColorStop(1,'#111e30');
    c.fillStyle=sky;c.fillRect(0,0,width,height);
    c.fillStyle=gradient(c,width*.77,height*.42,width*.4,'#fa947b4d');c.fillRect(0,0,width,height);
    for(let i=0;i<85;i++){const s={x:random(),y:random()*.42,r:random()*1+.3,phase:random()*6};stars.push(s);c.globalAlpha=.15+random()*.4;c.fillStyle='#c9e5ff';c.fillRect(s.x*width,s.y*height,s.r,s.r);}c.globalAlpha=1;
    const sun=c.createLinearGradient(0,height*.25,0,height*.55);sun.addColorStop(0,'#ffe1b8');sun.addColorStop(1,'#f39d92');
    c.fillStyle=sun;c.beginPath();c.arc(width*.77,height*.41,height*.112,0,Math.PI*2);c.fill();
    // Faixas de névoa, sem texturas ou dependências externas.
    for(let i=0;i<13;i++){const y=.34+random()*.22;c.fillStyle='#5f477f0b';c.fillRect(width*.3,y*height,width*.75,(.004+random()*.012)*height);}
    shape(c,[[.2,.65],[.35,.55],[.42,.59],[.53,.45],[.56,.41],[.59,.47],[.64,.6],[.72,.57],[.82,.6],[.92,.51],[1.1,.59],[1.1,.73]],'#3c3554');
    shape(c,[[.36,.67],[.49,.61],[.55,.54],[.61,.57],[.67,.62],[.73,.56],[.85,.61],[.94,.56],[1.1,.62],[1.1,.72]],'#302d49');
    skyline(c,.64,.03,.12,'#3a3552',false);
    skyline(c,.656,.025,.22,'#20273f',true);
    tower(c,.715,.66,.035,.31);tower(c,.85,.662,.044,.265);tower(c,.903,.662,.027,.18);
    // Orla, água e avenida convergindo para o centro da cidade.
    const water=c.createLinearGradient(0,height*.66,0,height);water.addColorStop(0,'#714f6d');water.addColorStop(.25,'#27354e');water.addColorStop(1,'#0d1b2c');
    c.fillStyle=water;c.fillRect(0,height*.67,width,height*.33);
    shape(c,[[.68,.667],[.704,.667],[1.14,1],[.33,1]],'#101829');
    shape(c,[[.68,.667],[.685,.667],[.35,1],[.3,1]],'#25344b');
    shape(c,[[.701,.667],[.708,.667],[1.18,1],[1.14,1]],'#2d3448');
    c.lineWidth=1.5;c.strokeStyle='#d8b5b351';c.beginPath();c.moveTo(width*.685,height*.667);c.lineTo(width*.35,height);c.moveTo(width*.701,height*.667);c.lineTo(width*1.14,height);c.stroke();
    for(let i=0;i<13;i++){
      const depth=Math.pow((i+1)/14,2),y=.667+depth*.333,x=.68-depth*.36,pole=.005+depth*.14;
      c.strokeStyle='#121d30';c.lineWidth=1+depth*3;c.beginPath();c.moveTo(x*width,y*height);c.lineTo(x*width,(y-pole)*height);c.lineTo((x+pole*.2)*width,(y-pole)*height);c.stroke();
      c.fillStyle=gradient(c,(x+pole*.2)*width,(y-pole)*height,5+depth*18,'#ffbf8b50');c.fillRect((x-.05)*width,(y-pole-.06)*height,.12*width,.12*height);
      c.fillStyle='#ffdab8';c.fillRect((x+pole*.12)*width,(y-pole)*height,Math.max(1,pole*.12*width),Math.max(1,depth*2));
    }
  }
  function paintForeground(c) {
    palm(c,.975,1.05,.64,-.075);palm(c,1.08,1.05,.51,-.14);palm(c,.456,.83,.27,-.04);
    // Cupê em contraluz: volumes, reflexos da cidade e lanternas.
    c.save();c.translate(width*.785,height*.90);c.scale(width*.26,height*.20);
    c.fillStyle='#040a12a6';c.beginPath();c.ellipse(0,.2,.95,.16,-.06,0,Math.PI*2);c.fill();
    const body=c.createLinearGradient(0,-.8,0,.2);body.addColorStop(0,'#3e4562');body.addColorStop(.45,'#1c253c');body.addColorStop(1,'#080f1d');
    c.fillStyle=body;c.beginPath();c.moveTo(-.9,.08);c.lineTo(-.88,-.24);c.quadraticCurveTo(-.8,-.36,-.58,-.4);c.lineTo(-.34,-.83);c.quadraticCurveTo(.08,-1.02,.48,-.72);c.lineTo(.7,-.37);c.quadraticCurveTo(.92,-.31,.95,-.16);c.lineTo(.96,.14);c.quadraticCurveTo(.04,.37,-.9,.08);c.fill();
    shapeCar(c,[[-.53,-.4],[-.3,-.77],[.12,-.83],[.43,-.67],[.6,-.37]],'#0b1728');
    c.strokeStyle='#d3afc66e';c.lineWidth=.008;c.beginPath();c.moveTo(-.84,-.27);c.quadraticCurveTo(.1,-.12,.88,-.26);c.moveTo(-.34,-.83);c.quadraticCurveTo(.04,-1,.48,-.72);c.stroke();
    c.fillStyle='#060b13';c.fillRect(-.71,.02,.22,.22);c.fillRect(.61,.05,.2,.2);
    c.fillStyle='#ff456e';c.shadowColor='#ff3668';c.shadowBlur=16;
    shapeCar(c,[[-.82,-.19],[-.34,-.11],[-.34,-.06],[-.82,-.13]],'#fa527d');shapeCar(c,[[.24,-.11],[.83,-.17],[.83,-.11],[.24,-.06]],'#fa527d');
    c.shadowBlur=0;c.fillStyle='#8c95a4';c.fillRect(-.08,.015,.22,.06);
    c.restore();
    c.fillStyle=gradient(c,width*.795,height*.955,width*.15,'#fa38651b');c.fillRect(width*.55,height*.85,width*.45,height*.15);
  }
  function shapeCar(c, points, color) {c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
  function rebuild() {
    width=innerWidth;height=innerHeight;ratio=Math.min(devicePixelRatio||1,1.25,1920/width);
    for(const el of [canvas,backdrop,foreground]){el.width=Math.round(width*ratio);el.height=Math.round(height*ratio);}
    seed=8127;lights.length=0;stars.length=0;
    const b=backdrop.getContext('2d'),f=foreground.getContext('2d');b.scale(ratio,ratio);f.scale(ratio,ratio);paintBackdrop(b);paintForeground(f);draw();
  }
  function draw() {
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.fillStyle='#0a1226';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(-width*.015+panX*7,-height*.015+panY*4);ctx.scale(1.03,1.03);ctx.drawImage(backdrop,0,0,width,height);
    // Luzes suaves e reflexos em movimento na água.
    for(const light of lights){ctx.globalAlpha=.25+.2*Math.sin(time*.65+light.phase);ctx.fillStyle='#c5f4ff';ctx.fillRect(light.x*width,light.y*height,2,2);}ctx.globalAlpha=1;
    for(let i=0;i<62;i++){
      const d=i/62,y=.677+d*d*.34,x=.72+Math.sin(i*17.7)*(.018+d*.17)+Math.sin(time*.25+i)*.002;
      ctx.fillStyle=i%3===0?'#df91a72b':'#ffbca61c';ctx.fillRect(x*width,y*height,(.004+d*.018)*width,Math.max(1,d*2));
      if(i%2===0){ctx.fillStyle='#87b7cf10';ctx.fillRect((.15+((i*137)%500)/1000)*width,y*height,(.01+d*.07)*width,1);}
    }
    // Faróis percorrem a avenida; a velocidade acompanha a perspectiva.
    for(let i=0;i<14;i++) {
      const p=((time*.024+i/14)%1),d=p*p,y=.67+d*.34,x=.694+d*(i%2?.22:-.2);
      ctx.strokeStyle=i%2?'#ff567b8a':'#afd8f29c';ctx.lineWidth=.6+d*2.2;ctx.beginPath();ctx.moveTo(x*width,y*height);ctx.lineTo((x+(i%2?.22:-.2)*(.006+d*.025))*width,(y+(.004+d*.014))*height);ctx.stroke();
    }
    ctx.restore();ctx.save();ctx.translate(-width*.02+panX*14,-height*.02+panY*8);ctx.scale(1.04,1.04);ctx.drawImage(foreground,0,0,width,height);ctx.restore();
    ctx.fillStyle=gradient(ctx,width*.87,height*.73,width*.48,'#df65ac0b');ctx.fillRect(0,0,width,height);
  }
  function tick(now) {
    raf=0;if(!visible)return;
    if(now-last>=32){const dt=Math.min(.08,(now-last)/1000);last=now;time+=dt;panX+=(pointerX-panX)*.045;panY+=(pointerY-panY)*.045;draw();}
    if(!reduced.matches)raf=requestAnimationFrame(tick);
  }
  function sync() {
    visible=!document.hidden&&document.body.classList.contains('in-menu')&&overlay.dataset.panel==='home';
    if(!visible&&raf){cancelAnimationFrame(raf);raf=0;}
    if(visible){if(width!==innerWidth||height!==innerHeight)rebuild();if(!raf){last=performance.now();draw();if(!reduced.matches)raf=requestAnimationFrame(tick);}}
  }
  overlay.addEventListener('pointermove',e=>{if(reduced.matches)return;pointerX=e.clientX/innerWidth-.5;pointerY=e.clientY/innerHeight-.5;});
  overlay.addEventListener('pointerleave',()=>{pointerX=pointerY=0;});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(sync).observe(overlay,{attributes:true,attributeFilter:['data-panel']});
  document.addEventListener('visibilitychange',sync);addEventListener('resize',()=>{if(visible)rebuild();});
  reduced.addEventListener('change',()=>{if(raf)cancelAnimationFrame(raf);raf=0;panX=panY=0;sync();});
  sync();
})();

