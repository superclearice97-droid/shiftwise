import assert from 'node:assert/strict';
import {makeBuildings,routeAt} from '../src/city-layout.js';
const buildings=makeBuildings(),length=routeAt(0).total;
assert.equal(buildings.length,32);
for(let s=0;s<length;s+=.02){const p=routeAt(s);assert([p.x,p.z,p.angle].every(Number.isFinite));for(const b of buildings){const dx=Math.max(Math.abs(p.x-b.x)-b.w/2,0),dz=Math.max(Math.abs(p.z-b.z)-b.d/2,0);assert(Math.hypot(dx,dz)>1.2,'full carriage envelope must clear buildings');}const q=routeAt(s+.02);assert(Math.hypot(q.x-p.x,q.z-p.z)<.021,'continuous route at joins');}
for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++){const a=buildings[i],b=buildings[j];assert(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.z-b.z)>=(a.d+b.d)/2);}
console.log('PASS: 3D building footprints, swept train clearance, continuous route and finite coordinates.');
