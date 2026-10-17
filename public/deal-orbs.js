/* Floating deal orbs: wireframe spheres drawn on a canvas that drift, tumble and react to touch.
   Everything is computed on this device from records already in the vault. Nothing is sent anywhere. */
(function(){
 'use strict';
 const PALETTE=[[255,210,63],[255,79,123],[58,91,255],[47,224,196],[255,138,61],[155,91,255]];
 const SHAPES=['sphere','sphere','bowl','band','sphere','tube'];
 const state=new Map(); // orb physics by deal id, kept across re-renders so orbs never jump
 let field=null,selected='',raf=0,last=0,frame=0,lite=false,slow=0; // lite: chosen once per session on slow devices

 const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
 const short=(s,n)=>{s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s};
 const reduced=()=>typeof reducedMotion==='function'?reducedMotion():matchMedia('(prefers-reduced-motion: reduce)').matches;

 // Every discount the person can see in the tab: saved offers, price drops and connected store prices.
 function orbItems(){
  const items=[];
  try{for(const d of featuredDeals())items.push({id:d.kind+':'+d.id,kind:d.kind,title:d.title,value:d.value,label:d.label,detail:d.detail,action:d.action,attr:d.kind==='offer'?'data-editoffer':'data-featuredprice',target:d.id,pct:d.kind==='price'?.35:.25})}catch{}
  try{
   const picks=typeof aiWatchPicks==='function'?aiWatchPicks():new Map();
   for(const o of currentConnectedOffers()){
    const pct=o.regularPrice?Math.max(0,(o.regularPrice-o.price)/o.regularPrice):0,watch=data.dealItems.find(i=>DealAPI.matches(i,o));
    items.push({id:'connected:'+o.id,kind:'connected',title:o.name,value:money(o.price),label:pct>0?Math.round(pct*100)+'% off · '+o.store:o.store,detail:o.variant+' · observed '+new Date(o.observedAt).toLocaleString(),action:watch?'Edit target':'Watch this product',attr:'data-watchconnected',target:o.id,pct,pick:picks.get(o.id)||''});
   }
  }catch{}
  const live=new Set(items.filter(i=>i.kind==='connected').map(i=>i.target));
  for(let i=items.length-1;i>=0;i--){const it=items[i];if(it.kind!=='price')continue;const w=data.dealItems.find(x=>x.id===it.target);if(w?.connectionId&&[...live].some(id=>id===w.connectionId+':'+w.productId))items.splice(i,1)}
  items.sort((a,b)=>(b.pick?1:0)-(a.pick?1:0)||b.pct-a.pct);
  return items.slice(0,24);
 }

 function section(){
  const items=orbItems();
  return `<section class="deal-orbs card" aria-label="Floating deals"><div class="card-head"><div><h2>Deals in motion</h2><p class="sub">${items.length?`${items.length} ${items.length===1?'deal':'deals'} · swipe across them · tap one for details`:'Your deals will float here'}${items.some(i=>i.pick)?' · ✦ AI picks glow':''}</p></div></div><div class="orb-stage" tabindex="0" aria-label="Deal orbs. Use left and right arrow keys to choose a deal."><canvas class="orb-canvas" aria-hidden="true"></canvas>${items.length?'':'<p class="orb-empty">Save an offer, watch a price or connect a store. Each deal becomes an orb you can spin.</p>'}</div><div class="orb-detail" role="status" aria-live="polite"></div><ul class="sr-only">${items.map(i=>`<li><button type="button" data-orbselect="${esc(i.id)}">${esc(i.title)}: ${esc(i.value)}</button></li>`).join('')}</ul></section>`;
 }

 function ghosts(){return Array.from({length:7},(_,i)=>({id:'ghost:'+i,ghost:true,pct:.2}))}

 function rot(m,ax,ay,az){
  // World-space rotation: m = Rz·Ry·Rx·m (small angles each frame).
  const r=(a,b,c,d)=>{for(let j=0;j<3;j++){const p=m[a*3+j],q=m[b*3+j];m[a*3+j]=p*c-q*d;m[b*3+j]=p*d+q*c}};
  if(ax)r(1,2,Math.cos(ax),Math.sin(ax));
  if(ay)r(2,0,Math.cos(ay),Math.sin(ay));
  if(az)r(0,1,Math.cos(az),Math.sin(az));
 }
 function orthonormal(m){
  // Gram–Schmidt on columns keeps the rotation from drifting after thousands of frames.
  const col=j=>[m[j],m[3+j],m[6+j]],set=(j,v)=>{m[j]=v[0];m[3+j]=v[1];m[6+j]=v[2]};
  const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)},dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const x=norm(col(0)),y0=col(1),y=norm(y0.map((v,i)=>v-dot(x,y0)*x[i])),z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  set(0,x);set(1,y);set(2,z);
 }

 function orbState(item){
  let s=state.get(item.id);
  if(!s){
   const h=hash(item.id),m=[1,0,0,0,1,0,0,0,1];rot(m,(h%628)/100,((h>>9)%628)/100,((h>>18)%628)/100);
   s={x:null,y:null,vx:0,vy:0,m,wx:0,wy:0,bx:((h>>3)%7-3)*.05+.12,by:((h>>6)%7-3)*.06+.18,bz:((h>>12)%5-2)*.03,phase:(h%1000)/159,shape:SHAPES[h%SHAPES.length],hue:h%PALETTE.length,pulse:0};
   state.set(item.id,s);
  }
  return s;
 }

 function layout(f){
  const w=f.stage.clientWidth||320,cols=w<520?4:w<900?5:6,cell=w/cols,n=f.items.length;
  let rows=0,placed=0;while(placed<n){placed+=rows%2?cols-1:cols;rows++}
  const h=Math.max(rows,2)*cell*1.06+cell*.12;
  f.cell=cell;f.w=w;f.h=h;
  const dpr=Math.min(lite?1.5:2,window.devicePixelRatio||1);
  f.canvas.width=Math.round(w*dpr);f.canvas.height=Math.round(h*dpr);f.canvas.style.height=h+'px';f.dpr=dpr;
  let i=0;
  for(let r=0;i<n;r++){const count=r%2?cols-1:cols,off=r%2?cell/2:0;for(let c=0;c<count&&i<n;c++,i++){const s=orbState(f.items[i]);s.hx=off+cell*(c+.5);s.hy=cell*(.46+r*1.06);if(s.x===null){s.x=s.hx;s.y=s.hy}}}
 }

 function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
 function ringColor(s,t){
  // Each orb blends three neighbouring palette colours from pole to pole.
  const a=PALETTE[s.hue],b=PALETTE[(s.hue+1)%PALETTE.length],c=PALETTE[(s.hue+2)%PALETTE.length];
  return t<.5?mix(a,b,t*2):mix(b,c,(t-.5)*2);
 }

 // Ring tables at unit radius: [height, ring radius, pole-to-pole position], computed once per shape.
 const RINGS={
  bowl:Array.from({length:9},(_,i)=>{const t=i/8*.96;return [t,Math.sqrt(1-t*t),i/8]}),
  band:Array.from({length:9},(_,i)=>{const t=-.42+i/8*.84;return [t,Math.sqrt(1-t*t),i/8]}),
  tube:Array.from({length:10},(_,i)=>{const t=-.7+i/9*1.4;return [t,.66,i/9]}),
  sphere:Array.from({length:18},(_,i)=>{const t=-.95+i/17*1.9;return [t,Math.sqrt(1-t*t),i/17]})
 };
 const sprites=new Map(); // glows and text labels drawn once, then copied each frame
 function sprite(key,w,h,paint){let c=sprites.get(key);if(!c){if(sprites.size>200)sprites.clear();c=document.createElement('canvas');c.width=Math.ceil(w);c.height=Math.ceil(h);paint(c.getContext('2d'));sprites.set(key,c)}return c}
 function glowSprite(col,dpr){const n=128;return sprite('glow:'+col+dpr,n,n,g=>{const r=g.createRadialGradient(n/2,n/2,n*.07,n/2,n/2,n/2);r.addColorStop(0,`rgba(${col},1)`);r.addColorStop(1,`rgba(${col},0)`);g.fillStyle=r;g.fillRect(0,0,n,n)})}
 function labelSprite(f,item){
  const d=f.dpr,big=Math.max(11,Math.min(15,f.cell*.13)),small=Math.max(10,Math.min(12,f.cell*.105)),gap=Math.max(27,f.cell*.31)-Math.max(14,f.cell*.17),w=f.cell*1.1,h=gap+small+big;
  return sprite(['label',item.id,item.value,item.title,f.cell|0,d].join('|'),w*d,h*d,g=>{g.scale(d,d);g.textAlign='center';g.textBaseline='alphabetic';
   g.fillStyle='rgba(255,255,255,.95)';g.font=`700 ${big}px 'Shiftwise Sans',system-ui,sans-serif`;g.fillText(short(item.value,12),w/2,big);
   g.fillStyle='rgba(225,232,240,.62)';g.font=`400 ${small}px 'Shiftwise Sans',system-ui,sans-serif`;g.fillText(short(item.title,f.cell<90?12:18),w/2,big+gap)});
 }

 function drawOrb(ctx,f,item,s,R,time){
  const m=s.m,nx=m[1],ny=m[4],nz=m[7],ang=Math.atan2(ny,nx)+Math.PI/2,rings=RINGS[s.shape]||RINGS.sphere;
  const ghost=item.ghost,sel=item.id===selected;
  if(item.pick||sel){
   const pulse=.55+.25*Math.sin(time*3+s.phase),g=R*1.45;
   ctx.globalAlpha=(sel?.22:.14)*pulse;ctx.drawImage(glowSprite(item.pick?'255,210,63':'47,224,196',f.dpr),s.x-g,s.y-g,g*2,g*2);ctx.globalAlpha=1;
  }
  // Rings are batched into a few paths (3 colour bands x front/back) so each orb costs ~6 strokes, not one per ring.
  ctx.lineWidth=ghost?.8:1.05;
  for(let band=0;band<3;band++)for(const front of [false,true]){
   let any=false;ctx.beginPath();
   for(const [u,v,t] of rings){
    if(Math.min(2,t*3|0)!==band||(u*nz>0)!==front)continue;
    const y=u*R,r=v*R;ctx.moveTo(s.x+nx*y+Math.cos(ang)*r,s.y+ny*y+Math.sin(ang)*r);
    ctx.ellipse(s.x+nx*y,s.y+ny*y,Math.max(.5,r),Math.max(.35,r*Math.abs(nz)),ang,0,Math.PI*2);any=true;
   }
   if(!any)continue;
   const c=PALETTE[(s.hue+band)%PALETTE.length],alpha=ghost?(front?.38:.24):(front?.95:.6);
   ctx.strokeStyle=`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${alpha})`;ctx.stroke();
  }
  if(s.pulse>0){ctx.strokeStyle=`rgba(255,255,255,${s.pulse*.6})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(s.x,s.y,R*(1.05+(1-s.pulse)*.5),0,Math.PI*2);ctx.stroke()}
  if(ghost)return;
  const lab=labelSprite(f,item),lw=lab.width/f.dpr,lh=lab.height/f.dpr,big=Math.max(11,Math.min(15,f.cell*.13));
  ctx.drawImage(lab,s.x-lw/2,s.y+R+Math.max(14,f.cell*.17)-big,lw,lh);
  if(item.pick){ctx.fillStyle='rgba(255,210,63,.95)';ctx.font=`700 ${Math.max(11,f.cell*.12)}px system-ui,sans-serif`;ctx.textAlign='center';ctx.fillText('✦',s.x+R*.85,s.y-R*.8)}
 }

 function draw(time){
  const f=field;if(!f)return;
  const ctx=f.canvas.getContext('2d');ctx.setTransform(f.dpr,0,0,f.dpr,0,0);
  ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,f.w,f.h);
  if(!lite)ctx.globalCompositeOperation='lighter';
  for(const item of f.items){const s=orbState(item),scale=item.ghost?.8:.86+Math.min(.6,item.pct)*.45;drawOrb(ctx,f,item,s,f.cell*.31*scale,time)}
  ctx.globalCompositeOperation='source-over';
 }

 function step(dt,time){
  const f=field,k=16,damp=4.2;
  for(const item of f.items){
   const s=orbState(item),fx=Math.sin(time*.55+s.phase)*f.cell*.035,fy=Math.cos(time*.47+s.phase*1.3)*f.cell*.05;
   s.vx+=((s.hx+fx-s.x)*k-s.vx*damp)*dt;s.vy+=((s.hy+fy-s.y)*k-s.vy*damp)*dt;
   s.x+=s.vx*dt;s.y+=s.vy*dt;
   const ease=Math.min(1,dt*1.2);s.wx+=(s.bx-s.wx)*ease;s.wy+=(s.by-s.wy)*ease;
   rot(s.m,s.wx*dt,s.wy*dt,s.bz*dt);
   s.pulse=Math.max(0,s.pulse-dt*1.8);
  }
  if(++frame%90===0)for(const item of f.items)orthonormal(orbState(item).m);
 }

 function loop(now){
  raf=0;const f=field;
  if(!f||!f.canvas.isConnected){stop();return}
  if(document.hidden||!f.visible){last=0;return}
  const dt=Math.min(.05,last?(now-last)/1000:.016);last=now;
  // Safety net for slower phones: if most recent frames miss ~45 fps, switch once to a lighter drawing mode.
  if(!lite&&!document.hidden){slow=Math.max(0,slow+(dt>1/45?1:-.5));if(slow>40){lite=true;layout(f)}}
  if(!reduced())step(dt,now/1000);
  draw(now/1000);
  if(!reduced())raf=requestAnimationFrame(loop);
 }
 function kick(){if(field&&!raf)raf=requestAnimationFrame(loop)}
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(field){field.ro?.disconnect();field.io?.disconnect()}field=null}

 // Finger or mouse motion: nearby orbs are pushed along the swipe and rolled like a ball under the finger.
 function push(f,x,y,vx,vy){
  const R=f.cell*1.25,speed=Math.hypot(vx,vy),cap=speed>2600?2600/speed:1;vx*=cap;vy*=cap;
  for(const item of f.items){const s=orbState(item),d=Math.hypot(s.x-x,s.y-y);if(d>R)continue;const w=(1-d/R)**2;
   s.vx+=vx*.32*w;s.vy+=vy*.32*w;s.wy+=vx*.011*w;s.wx-=vy*.011*w;
   s.wx=Math.max(-14,Math.min(14,s.wx));s.wy=Math.max(-14,Math.min(14,s.wy));}
  kick();
 }
 function nearest(f,x,y){let best=null,bd=Infinity;for(const item of f.items){if(item.ghost)continue;const s=orbState(item),d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;best=item}}return bd<f.cell*.55?best:null}

 function select(id,announce=true){
  const f=field;if(!f)return;const item=f.items.find(i=>i.id===id);if(!item)return;
  selected=id;orbState(item).pulse=1;
  const panel=f.root.querySelector('.orb-detail');
  if(panel&&announce)panel.innerHTML=`<div class="orb-detail-card"><div class="eyebrow">${esc(item.label||'')}</div><h3>${esc(item.title)}</h3><div class="tile-value">${esc(item.value)}</div><p class="sub">${esc(item.detail||'')}</p>${item.pick?`<p class="orb-pick">✦ AI watcher: ${esc(item.pick)}</p>`:''}<button type="button" ${item.attr}="${esc(item.target)}">${esc(item.action)} →</button></div>`;
  if(reduced())draw(performance.now()/1000);else kick();
 }

 function mount(){
  const root=document.querySelector('.deal-orbs');
  if(!root){if(field)stop();return}
  if(field&&field.root===root)return;
  stop();
  const stage=root.querySelector('.orb-stage'),canvas=root.querySelector('.orb-canvas'),real=orbItems();
  field={root,stage,canvas,items:real.length?real:ghosts(),visible:true};
  const f=field;layout(f);
  if(selected&&f.items.some(i=>i.id===selected))select(selected);else selected='';
  let down=null,prev=null;
  const pos=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top,t:e.timeStamp}};
  stage.addEventListener('pointerdown',e=>{prev=pos(e);down={...prev,moved:0}});
  stage.addEventListener('pointermove',e=>{
   const p=pos(e);
   if(prev&&(down||e.pointerType==='mouse')){const dt=Math.max(8,p.t-prev.t)/1000;push(f,p.x,p.y,(p.x-prev.x)/dt,(p.y-prev.y)/dt);if(down)down.moved+=Math.hypot(p.x-prev.x,p.y-prev.y)}
   prev=p;
  });
  const end=e=>{if(down&&down.moved<10&&e.type==='pointerup'){const p=pos(e),hit=nearest(f,p.x,p.y);if(hit)select(hit.id)}down=null;if(e.pointerType!=='mouse')prev=null};
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('pointerleave',()=>{prev=null;down=null});
  stage.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight'].includes(e.key))return;const real=f.items.filter(i=>!i.ghost);if(!real.length)return;e.preventDefault();
   const i=Math.max(-1,real.findIndex(x=>x.id===selected)),next=real[(i+(e.key==='ArrowRight'?1:real.length-1)+real.length)%real.length];
   select(next.id);const s=orbState(next);s.wy+=e.key==='ArrowRight'?4:-4;
  });
  f.ro=new ResizeObserver(()=>{layout(f);if(reduced())draw(performance.now()/1000);else kick()});f.ro.observe(stage);
  f.io=new IntersectionObserver(([en])=>{f.visible=en.isIntersecting;if(f.visible)kick()});f.io.observe(stage);
  draw(performance.now()/1000);kick();
 }

 document.addEventListener('click',e=>{const b=e.target.closest('[data-orbselect]');if(b)select(b.dataset.orbselect)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)kick()});
 const content=document.querySelector('#content');
 if(content)new MutationObserver(()=>mount()).observe(content,{childList:true});

 // Orbs sit at the top of every Discounts section.
 const hub=savingsHub;
 savingsHub=function(){return section()+hub()};
 window.DealOrbs={items:orbItems,mount,select,state};
})();
