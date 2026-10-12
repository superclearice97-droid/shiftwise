// Reference palette: charcoal buildings #161616, white lights #f2f4f1.
// Local deterministic isometric city simulation. No network or financial data.
(function(){
'use strict';
const canvas=document.querySelector('#cityWorld');if(!canvas)return;
let ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;const mainContext=ctx;let pixelRatio=1,groundCache=null,groundKey='';
let width=0,height=0,scale=1,time=0,last=null,drawAt=0,raf=0,dirty=true,camX=0,camY=0;
let seed=719;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
// Proportioned architectural footprints; no overlapping annexes.
const buildings=[];
const buildingTypes=[{w:2.7,d:2.35,h:1.05},{w:2.15,d:2.05,h:2.2},{w:2.45,d:1.9,h:1.6},{w:1.85,d:1.85,h:3.8}];
for(let gx=-4;gx<24;gx+=4)for(let gy=-4;gy<24;gy+=4){
if(gx===8&&gy===8||gx===0&&gy===16||gx===4&&gy===16)continue;
const x=gx===20?24:gx,y=gy===20?24:gy,kind=Math.floor(random()*4),t=buildingTypes[kind];
buildings.push({x:x+.85,y:y+.85,w:t.w,d:t.d,h:t.h+(kind===3?random()*.6:0),kind,seed:Math.floor(random()*999),roof:random()});}
const cars=Array.from({length:36},(_,i)=>({axis:i%2,lane:(i%5)*4+.12,offset:random()*24,speed:.45+random()*.45,reverse:i%3===0}));
const walkers=Array.from({length:22},(_,i)=>({axis:i%2,lane:(i%5)*4+.48,offset:random()*24,speed:.12+random()*.07}));
const project=(x,y,z=0)=>[width*.5+(x-y)*scale+camX+(typeof cityPanX==='number'?cityPanX:0),height*.46+(x+y-17)*scale*.49-z*scale+camY+(typeof cityPanY==='number'?cityPanY:0)];
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>{const a=project(...p);i?ctx.lineTo(...a):ctx.moveTo(...a)});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.65;ctx.stroke()}}
function line(a,b,color,lw=1){ctx.beginPath();ctx.moveTo(...project(...a));ctx.lineTo(...project(...b));ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.stroke()}
function box(x,y,w,d,h,z,top='#3a3a3a',left='#1f1f1f',right='#2c2c2c'){polygon([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],left,'#52525244');polygon([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],right,'#52525244');polygon([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],top,'#7c7c7c55')}
function building(b){
box(b.x,b.y,b.w,b.d,b.h,0,'#161616','#101010','#141414');
// Delicate windows; most rooms remain dark, with selective lit floor bands.
for(let z=.22;z<b.h-.1;z+=.25){for(let n=.12;n<b.d-.12;n+=.23){const lit=Math.sin(b.seed+n*33+z*27)>.72,c=lit?'#f2f4f1':'#1d1d1d';polygon([[b.x+b.w+.003,b.y+n,z],[b.x+b.w+.003,b.y+n+.085,z],[b.x+b.w+.003,b.y+n+.085,z+.085],[b.x+b.w+.003,b.y+n,z+.085]],c)}for(let n=.12;n<b.w-.12;n+=.23){const lit=Math.sin(b.seed+n*41+z*23)>.8,c=lit?'#e6e8e5':'#1b1b1b';polygon([[b.x+n,b.y+b.d+.003,z],[b.x+n+.085,b.y+b.d+.003,z],[b.x+n+.085,b.y+b.d+.003,z+.085],[b.x+n,b.y+b.d+.003,z+.085]],c)}}
for(let z=.02;z<b.h;z+=.5){line([b.x,b.y+b.d+.01,z],[b.x+b.w,b.y+b.d+.01,z],'#303030',.45);line([b.x+b.w+.01,b.y,z],[b.x+b.w+.01,b.y+b.d,z],'#262626',.45)}
if(b.kind===0||b.seed%5===0){const z=b.kind===0?b.h*.55:.55;polygon([[b.x,b.y+b.d+.01,z],[b.x+b.w,b.y+b.d+.01,z],[b.x+b.w,b.y+b.d+.01,z+.15],[b.x,b.y+b.d+.01,z+.15]],'#e5e7e4');for(let n=.1;n<b.w;n+=.18)line([b.x+n,b.y+b.d+.02,z],[b.x+n,b.y+b.d+.02,z+.15],'#303030',.6)}
// Parapets, roof seams, vents and access housings are cached with the building.
box(b.x+.08,b.y+.08,b.w-.16,b.d-.16,.045,b.h,'#121212','#252525','#242424');
for(let n=.22;n<b.w-.1;n+=.18)line([b.x+n,b.y+.13,b.h+.05],[b.x+n,b.y+b.d-.13,b.h+.05],'#262626',.45);
box(b.x+.25,b.y+.3,.48,.5,.17,b.h+.05,'#202020','#181818','#1d1d1d');
for(let n=0;n<3;n++)line([b.x+.29+n*.12,b.y+.34,b.h+.23],[b.x+.29+n*.12,b.y+.76,b.h+.23],'#3a3a3a',.6);
if(b.w>2){box(b.x+b.w-.7,b.y+.3,.4,.65,.12,b.h+.05,'#242424','#171717','#202020');}
if(b.h>4){line([b.x+.8,b.y+.8,b.h],[b.x+.8,b.y+.8,b.h+.65],'#626262',.7)}
}
function surface(w,h){if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);if(typeof document.createElement==='function'){const el=document.createElement('canvas');el.width=w;el.height=h;return el}return null}
function cachedBuilding(b){const corners=[[b.x,b.y,b.h+.9],[b.x+b.w,b.y,0],[b.x,b.y+b.d,0],[b.x+b.w,b.y+b.d,0]].map(p=>project(...p)),x=Math.floor(Math.min(...corners.map(p=>p[0]))-4),y=Math.floor(Math.min(...corners.map(p=>p[1]))-4),w=Math.ceil(Math.max(...corners.map(p=>p[0]))-x+4),h=Math.ceil(Math.max(...corners.map(p=>p[1]))-y+4),key=scale+':'+pixelRatio;
if(!b.sprite||b.spriteKey!==key){const img=surface(Math.ceil(w*pixelRatio),Math.ceil(h*pixelRatio));if(img){const old=ctx;ctx=img.getContext('2d');ctx.setTransform(pixelRatio,0,0,pixelRatio,-x*pixelRatio,-y*pixelRatio);building(b);ctx=old;b.sprite=img;b.spriteKey=key;b.spriteW=w;b.spriteH=h;}}
if(b.sprite)ctx.drawImage(b.sprite,x,y,b.spriteW,b.spriteH);else building(b);
if(b.h>4){const p=project(b.x+.8,b.y+.8,b.h+.65);ctx.fillStyle=Math.sin(time*2+b.seed)>0?'#f2f4f1':'#5f5f5f';ctx.fillRect(p[0]-1,p[1]-1,2,2)}}
// Rounded rail loop: carriage orientation follows the track tangent.
const route=[];const corners=[[2,2,Math.PI,Math.PI*1.5],[20,2,Math.PI*1.5,Math.PI*2],[20,20,0,Math.PI*.5],[2,20,Math.PI*.5,Math.PI]];
for(const [x,y,a,b] of corners){for(let j=0;j<=16;j++){const t=a+(b-a)*j/16;route.push([x+2*Math.cos(t),y+2*Math.sin(t)])}}
let railLength=0;const segments=route.map((a,i)=>{const b=route[(i+1)%route.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),start=railLength;railLength+=len;return {a,b,len,start}});
function railPosition(distance){const d=((distance%railLength)+railLength)%railLength;const s=segments.find(s=>d<=s.start+s.len)||segments.at(-1),t=(d-s.start)/s.len;return {x:s.a[0]+(s.b[0]-s.a[0])*t,y:s.a[1]+(s.b[1]-s.a[1])*t,angle:Math.atan2(s.b[1]-s.a[1],s.b[0]-s.a[0])}}
// Reserve the complete swept train envelope, including rounded corners.
// A carriage fits inside radius .59; the wider .95 corridor adds clearance.
const railClearance=.95;
function blocksRail(b){for(const s of segments){const count=Math.ceil(s.len/.08);for(let i=0;i<=count;i++){const t=i/count,x=s.a[0]+(s.b[0]-s.a[0])*t,y=s.a[1]+(s.b[1]-s.a[1])*t,dx=Math.max(b.x-x,0,x-b.x-b.w),dy=Math.max(b.y-y,0,y-b.y-b.d);if(Math.hypot(dx,dy)<railClearance)return true}}return false}
for(let i=buildings.length-1;i>=0;i--)if(blocksRail(buildings[i]))buildings.splice(i,1);
function train(distance,selected=false,only=null){for(let i=4;i>=0;i--){if(only!==null&&i!==only)continue;const p=railPosition(distance-i*1.16),co=Math.cos(p.angle),si=Math.sin(p.angle);const v=(x,y,z)=>[p.x+x*co-y*si,p.y+x*si+y*co,z];
// Bogies, charcoal undercarriage, bevelled silver body and continuous windows.
polygon([v(-.5,-.22,1.12),v(.5,-.22,1.12),v(.5,.22,1.12),v(-.5,.22,1.12)],'#161616');
for(const n of [-.32,.32]){line(v(n,-.23,1.12),v(n,.23,1.12),'#0b0b0b',3)}
polygon([v(-.52,-.21,1.18),v(.52,-.21,1.18),v(.47,-.19,1.57),v(-.48,-.19,1.57)],'#ababab','#dedede');
polygon([v(-.52,.21,1.18),v(.52,.21,1.18),v(.47,.19,1.57),v(-.48,.19,1.57)],'#797979','#c2c2c2');
polygon([v(-.48,-.19,1.57),v(.47,-.19,1.57),v(.47,.19,1.57),v(-.48,.19,1.57)],'#dbdbdb','#f4f4f4');
for(const side of [-1,1]){line(v(-.46,side*.215,1.29),v(.46,side*.215,1.29),'#444444',1);for(let n=-.4;n<.4;n+=.2){polygon([v(n,side*.216,1.35),v(n+.13,side*.216,1.35),v(n+.13,side*.21,1.49),v(n,side*.21,1.49)],'#efefef');}line(v(.03,side*.22,1.19),v(.03,side*.20,1.52),'#343434',1)}
polygon([v(.52,-.21,1.18),v(.52,.21,1.18),v(.47,.19,1.57),v(.47,-.19,1.57)],i===0?'#353535':'#818181','#e2e2e2');
if(i===0){line(v(.505,-.14,1.43),v(.505,.14,1.43),'#e0e0e0',2);for(const side of [-1,1])line(v(.523,side*.15,1.23),v(.53,side*.15,1.26),'#fff',2)}
line(v(-.55,0,1.22),v(-.66,0,1.22),'#7a7a7a',2);

}}
function railway(){for(const s of segments){const a=[...s.a,1],b=[...s.b,1];line(a,b,'#2c2c2c',scale*.65);const angle=Math.atan2(s.b[1]-s.a[1],s.b[0]-s.a[0]),ox=Math.sin(angle)*.15,oy=-Math.cos(angle)*.15;for(const side of [-1,1])line([s.a[0]+ox*side,s.a[1]+oy*side,1.13],[s.b[0]+ox*side,s.b[1]+oy*side,1.13],'#959595',1)}for(let d=0;d<railLength;d+=.45){const p=railPosition(d),dx=Math.sin(p.angle)*.26,dy=-Math.cos(p.angle)*.26;line([p.x-dx,p.y-dy,1.05],[p.x+dx,p.y+dy,1.05],'#717171',1)}for(let d=0;d<railLength;d+=2){const p=railPosition(d);box(p.x-.07,p.y-.07,.14,.14,1,0,'#7b7b7b','#323232','#4f4f4f')}}
function station(x,y){box(x,y,4,.65,.2,.9,'#949494','#3c3c3c','#606060');for(let n=.2;n<4;n+=.3)line([x+n,y+.5,1.11],[x+n+.12,y+.5,1.11],'#e4e4e4',1);for(let n=.3;n<4;n+=1.1){line([x+n,y+.12,1.1],[x+n,y+.12,2.1],'#858585',1);line([x+n,y+.12,2.1],[x+n,y+.58,2.1],'#dedede',2)}polygon([[x-.1,y-.1,2.13],[x+4.1,y-.1,2.13],[x+4.1,y+.35,2.22],[x-.1,y+.35,2.22]],'#454545','#b3b3b3');}
function drawGround(){polygon([[-7,-7,0],[33,-7,0],[33,33,0],[-7,33,0]],'#0c0c0c','#404040');for(let i=-4.2;i<=24;i+=4){polygon([[i-.35,-6,0],[i+.4,-6,0],[i+.4,27,0],[i-.35,27,0]],'#151515');polygon([[-6,i-.35,0],[27,i-.35,0],[27,i+.4,0],[-6,i+.4,0]],'#151515');for(let k=-1;k<23;k+=1.2){line([i,k,.01],[i,k+.45,.01],'#8e8e8e55');line([k,i,.01],[k+.45,i,.01],'#8e8e8e55')}}
// Raised railway, platforms, plaza paving and street furniture.
railway();station(8,-.7);station(9,22.2);
for(let row=0;row<5;row++)for(let n=0;n<5;n++){const x=8.6+n*.55,y=8.6+row*.55,p=project(x,y,.55);line([x,y,0],[x,y,.5],'#707070',1);ctx.beginPath();ctx.ellipse(p[0],p[1],scale*.12,scale*.23,0,0,Math.PI*2);ctx.fillStyle='#181818';ctx.fill();ctx.strokeStyle='#3b3b3b';ctx.lineWidth=.5;ctx.stroke()}

for(let x=8.5;x<11.5;x+=.35)for(let y=8.5;y<11.5;y+=.35)polygon([[x,y,.015],[x+.3,y,.015],[x+.3,y+.3,.015],[x,y+.3,.015]],'#303030','#444444');
for(let x=1;x<20;x+=4)for(let y=3.4;y<21;y+=4){line([x,y,0],[x,y,.8],'#696969',1);const p=project(x,y,.8);ctx.fillStyle='#e0e0e0';ctx.fillRect(p[0]-1,p[1]-1,2,2)}
}
function travelAt(){const phase=time%88,half=railLength/2,segment=phase%44;return (phase>=44?half:0)+(segment<7?0:half*(.5-.5*Math.cos(Math.PI*(segment-7)/37)))+12}
function render(){ctx.fillStyle='#0d0e10';ctx.fillRect(0,0,width,height);scale=Math.max(width/42,Math.min(width/30,height/25))*(typeof cityZoom==='number'?cityZoom:1.05);if(typeof cityFollow!=='undefined'&&cityFollow){const focus=railPosition(travelAt());camX+=(-(focus.x-focus.y)*scale-camX)*.06;camY+=(-(focus.x+focus.y-17)*scale*.49+scale*1.5-camY)*.06}else{camX*=.93;camY*=.93}const key=[width,height,scale,camX,camY,typeof cityPanX==='number'?cityPanX:0,typeof cityPanY==='number'?cityPanY:0,pixelRatio].join(':');
if(!groundCache||key!==groundKey){groundCache=surface(canvas.width,canvas.height);if(groundCache){ctx=groundCache.getContext('2d');ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);drawGround();ctx=mainContext;groundKey=key;}}
if(groundCache)ctx.drawImage(groundCache,0,0,width,height);else drawGround();
const things=buildings.map(b=>({order:b.x+b.y+b.w+b.d,draw:()=>cachedBuilding(b)}));
for(const c of cars){const progress=((c.offset+time*c.speed)%25)-2,pos=c.reverse?21-progress:progress,x=c.axis?c.lane:pos,y=c.axis?pos:c.lane;things.push({order:x+y+.3,draw:()=>{box(x,y,c.axis?.13:.32,c.axis?.32:.13,.09,.02,'#c9c9c9','#6f6f6f','#a1a1a1');const p=project(x,y,.1);ctx.fillStyle='#fafafa';ctx.fillRect(p[0],p[1],2,1)}})}
for(const w of walkers){const p=(w.offset+time*w.speed)%25-2,x=w.axis?w.lane:p,y=w.axis?p:w.lane;things.push({order:x+y,draw:()=>{line([x,y,0],[x,y,.15],'#adadad',1.5)}})}
for(let service=0;service<2;service++)for(let car=0;car<5;car++){const distance=travelAt()+service*railLength/2,p=railPosition(distance-car*1.16);things.push({order:p.x+p.y+.7,draw:()=>train(distance,service===0,car)})}things.sort((a,b)=>a.order-b.order).forEach(t=>t.draw());
}
function paused(){return document.hidden||typeof cityPaused!=='undefined'&&cityPaused||matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced'}
function tick(now){raf=0;if(document.hidden){last=null;return}const p=paused();if(last===null)last=now;if(!p)time+=Math.min(.07,(now-last)/1000);last=now;if(dirty||!p){render();drawAt=now;dirty=false}raf=requestAnimationFrame(tick)}
function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;const ratio=Math.min(devicePixelRatio||1,1.5);pixelRatio=ratio;groundKey='';canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);dirty=true}
let drag=null;canvas.addEventListener('pointerdown',e=>{if(!document.body.classList.contains('city-focus'))return;cityFollow=false;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drag)return;cityPanX+=e.clientX-drag.x;cityPanY+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};dirty=true});for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{drag=null});
window.addEventListener('resize',resize);document.addEventListener('click',()=>{dirty=true});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!raf){dirty=true;raf=requestAnimationFrame(tick)}});resize();raf=requestAnimationFrame(tick);
})();
