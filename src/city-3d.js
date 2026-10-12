import * as T from 'three';
import {makeBuildings,routeAt} from './city-layout.js';
const canvas=document.querySelector('#cityWorld');
let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});}catch(error){const replacement=canvas.cloneNode();canvas.replaceWith(replacement);const script=document.createElement('script');script.src='/city-fallback.js';document.head.append(script);}
if(renderer)start();
function start(){
const scene=new T.Scene();scene.background=new T.Color('#0d0e10');
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
const camera=new T.OrthographicCamera(-32,32,22,-22,.1,240);camera.position.set(65,58,65);camera.lookAt(0,1,0);
const geometry=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4(),rotation=new T.Quaternion(),batches=new Map(),edgePoints=[];
const colors={wall:'#141516',roof:'#202123',dark:'#0c0d0e',edge:'#343638',white:'#eceeed',glass:'#090a0b'};
function staticBox(x,y,z,w,h,d,color,outline=false,yaw=0){if(!batches.has(color))batches.set(color,[]);batches.get(color).push([x,y,z,w,h,d,yaw]);if(outline){const p=[];for(let i=0;i<8;i++)p.push([x+(i&1?w:-w)/2,y+(i&2?h:-h)/2,z+(i&4?d:-d)/2]);for(let i=0;i<8;i++)for(const k of [1,2,4])if(!(i&k))edgePoints.push(...p[i],...p[i|k]);}}
staticBox(0,-.25,0,67,.4,67,'#0e0f10');
for(let n=-18;n<=18;n+=6){staticBox(n,-.025,0,1.55,.04,39,'#090a0b');staticBox(0,-.025,n,39,.04,1.55,'#090a0b');for(let v=-18;v<=18;v+=2){staticBox(n,.006,v,.035,.015,.5,'#292b2c');staticBox(v,.006,n,.5,.015,.035,'#292b2c')}}
for(const b of makeBuildings()){
const {x,z,w,d,h,style,seed}=b;
staticBox(x,.08,z,w+.4,.16,d+.4,'#1a1b1d',true);
staticBox(x,h/2,z,w,h,d,colors.wall,true);
staticBox(x,h+.07,z,w+.06,.14,d+.06,colors.roof,true);
// Recessed roof, parapets, mechanical equipment and vertical facade ribs.
staticBox(x,h+.15,z,w-.28,.07,d-.28,'#101112');
staticBox(x-.65,h+.4,z-.5,.75,.5,.9,'#252628',true);
staticBox(x+.65,h+.28,z+.35,.7,.25,.55,'#222426',true);
for(let k=0;k<4;k++)staticBox(x-.92+k*.18,h+.66,z-.5,.025,.025,.75,'#484a4b');
for(let y=.7;y<h-.2;y+=.55){
for(let n=-w/2+.3;n<w/2-.15;n+=.4){const lit=Math.sin(seed+n*41+y*13)>.65||style===0;const c=lit?colors.white:'#202224';staticBox(x+n,y,z+d/2+.013,.17,.2,.022,c);staticBox(x+n,y,z-d/2-.013,.17,.2,.022,Math.sin(seed+n*17+y*19)>.77?colors.white:colors.glass);}
for(let n=-d/2+.3;n<d/2-.15;n+=.4){const c=Math.sin(seed+n*27+y*29)>.72?colors.white:'#1d1f20';staticBox(x+w/2+.013,y,z+n,.022,.2,.17,c);staticBox(x-w/2-.013,y,z+n,.022,.2,.17,c);}
if(style!==3)staticBox(x,y-.23,z+d/2+.03,w,.025,.025,'#323436');}
if(style===3){for(let n=-w/2+.1;n<w/2;n+=.8){staticBox(x+n,h/2,z+d/2+.03,.035,h,.04,'#303234');}staticBox(x,h+.5,z,.06,.9,.06,'#5c6062');}
}
// A small planted square, with paths and sculpted trees.
staticBox(0,.03,0,9,.1,9,'#181a1b',true);staticBox(0,.1,0,1.1,.03,9,'#2a2c2d');staticBox(0,.1,0,9,.03,1.1,'#2a2c2d');
for(const x of [-3,3])for(const z of [-3,-1,1,3]){staticBox(x,.6,z,.13,1.2,.13,'#383a3a');staticBox(x,1.45,z,.8,1.3,.8,'#171c1b',true);}
// Continuous elevated guideway with a reserved, building-free corridor.
const length=routeAt(0).total;
for(let s=0;s<length;s+=.55){const p=routeAt(s),next=routeAt(s+.55);staticBox(p.x,1.7,p.z,.59,.18,1.22,'#242729',false,-p.angle);for(const offset of [-.43,.43]){const x=p.x-Math.sin(p.angle)*offset,z=p.z+Math.cos(p.angle)*offset;staticBox(x,1.86,z,.6,.055,.045,'#73787b',false,-p.angle);}if(Math.floor(s/.55)%8===0)staticBox(p.x,.8,p.z,.32,1.6,.32,'#292c2e',true);}
for(const z of [-22,22]){staticBox(0,1.78,z+1.25,9,.25,1.15,'#626668',true);staticBox(0,3.35,z+1.4,9,.12,1.55,'#242729',true);for(let x=-4;x<=4;x+=2){staticBox(x,2.55,z+1.6,.08,1.5,.08,'#686d70');staticBox(x,3.23,z+1.35,1.35,.03,.06,colors.white);}}
for(let n=-18;n<=18;n+=6)for(const z of [-18,18]){staticBox(n,.9,z,.06,1.8,.06,'#424648');staticBox(n,1.85,z,.25,.07,.16,colors.white);}
for(const [color,items] of batches){const mesh=new T.InstancedMesh(geometry,new T.MeshBasicMaterial({color}),items.length);items.forEach(([x,y,z,w,h,d,yaw],i)=>{rotation.setFromAxisAngle(new T.Vector3(0,1,0),yaw);matrix.compose(new T.Vector3(x,y,z),rotation,new T.Vector3(w,h,d));mesh.setMatrixAt(i,matrix)});mesh.computeBoundingSphere();scene.add(mesh);}
const lines=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(edgePoints,3)),new T.LineBasicMaterial({color:colors.edge}));scene.add(lines);
function part(group,x,y,z,w,h,d,color){const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({color}));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);return mesh;}
const trains=[];
for(let service=0;service<2;service++)for(let car=0;car<4;car++){const g=new T.Group();part(g,0,.23,0,2.05,.28,.77,'#1a1d1f');part(g,0,.63,0,2,.6,.83,'#73797d');part(g,0,.97,0,1.88,.09,.76,'#bfc4c6');for(const side of [-1,1]){part(g,0,.71,side*.42,1.78,.24,.018,'#131719');for(let n=-.72;n<.9;n+=.38)part(g,n,.73,side*.434,.25,.17,.015,'#e6ecee');part(g,.1,.49,side*.435,.018,.35,.015,'#353a3d');}part(g,.99,.75,0,.02,.24,.62,'#1b252b');if(car===0)for(const side of [-1,1])part(g,1.015,.46,side*.28,.03,.06,.09,'#ffffff');part(g,-1.08,.3,0,.16,.08,.12,'#535a5e');scene.add(g);trains.push({g,car,service});}
const cars=[];for(let i=0;i<22;i++){const g=new T.Group();part(g,0,.18,0,.65,.24,.3,'#62686b');part(g,-.05,.34,0,.32,.13,.27,'#24292d');part(g,.33,.18,0,.025,.05,.22,'#eff1ed');scene.add(g);cars.push({g,lane:(i%6)*6-18,axis:i%2,offset:i*1.79});}
let width=1,height=1,dirty=true,last=null,time=0,frame=0,drag=null;
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;renderer.setSize(width,height,false);camera.left=-29*width/height;camera.right=29*width/height;camera.top=29;camera.bottom=-29;camera.updateProjectionMatrix();dirty=true;}resize();window.addEventListener('resize',resize);
function paused(){return cityPaused||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced'}
let lastView='';function tick(now){frame=0;if(document.hidden){last=null;return}const stop=paused();if(last!==null&&!stop)time+=Math.min((now-last)/1000,.05);last=now;const view=[cityZoom,cityPanX,cityPanY].join();if(view!==lastView){dirty=true;lastView=view;}if(!stop||dirty){
for(const {g,car,service} of trains){const p=routeAt(time*1.35+service*length/2-car*2.2);g.position.set(p.x,1.9,p.z);g.rotation.y=-p.angle;}
for(const c of cars){const v=(time*1.1+c.offset)%38-19;c.g.position.set(c.axis?c.lane+.28:v,0,c.axis?v:c.lane+.28);c.g.rotation.y=c.axis?-Math.PI/2:0;}
camera.zoom=cityZoom/ .86;const units=58/height/camera.zoom,px=cityPanX*units,pz=cityPanY*units;camera.position.set(65-px*.707-pz*.707,58,65+px*.707-pz*.707);camera.lookAt(-px*.707-pz*.707,1,px*.707-pz*.707);camera.updateProjectionMatrix();renderer.render(scene,camera);dirty=false;}frame=requestAnimationFrame(tick);}
canvas.addEventListener('pointerdown',e=>{if(!document.body.classList.contains('city-focus'))return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drag)return;cityPanX+=e.clientX-drag.x;cityPanY+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};dirty=true});for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>drag=null);document.addEventListener('click',()=>dirty=true);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!frame){last=null;dirty=true;frame=requestAnimationFrame(tick)}});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0});canvas.addEventListener('webglcontextrestored',()=>{dirty=true;last=null;if(!frame)frame=requestAnimationFrame(tick)});frame=requestAnimationFrame(tick);
}
