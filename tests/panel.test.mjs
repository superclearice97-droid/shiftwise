import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
// Pull-down panel view: the finance grid is the default until another view is chosen, and the choice is remembered.
function load(stored,{narrow=false,blocked=false}={}){
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{id,hidden:false,value:'workspace',textContent:'My week ▾',innerHTML:'',dataset:{},classList:{set:new Set(),toggle(c,on){on?this.set.add(c):this.set.delete(c)},add(c){this.set.add(c)},remove(c){this.set.delete(c)},contains(c){return this.set.has(c)}},setAttribute(){},focus(){}});return els.get(id)};
 const store=new Map(stored===undefined?[]:[['shiftwise-panel-view',stored]]),listeners={};
 const ctx={ready:false,tab:'overview',week:new Date(),localStorage:{getItem:k=>{if(blocked)throw Error('storage blocked');return store.has(k)?store.get(k):null},setItem:(k,v)=>store.set(k,v)},matchMedia:q=>({matches:q.includes('reduce')?false:narrow}),
  document:{querySelector:el,querySelectorAll:()=>[],addEventListener:(t,f)=>(listeners[t]=listeners[t]||[]).push(f),body:el('body'),documentElement:{style:{setProperty(){}}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/city.js','utf8'),ctx);return {ctx,el,store,listeners,run:s=>vm.runInContext(s,ctx)};
}
let t=load(undefined);
assert.equal(t.run('cityPanelMode'),'finance','fresh install opens the finance grid');
assert.equal(t.el('#cityPanel').hidden,true,'desktop does not cover the workspace with the grid at launch');
assert.equal(t.el('#cityMenuToggle').textContent,'Finances ▾');assert.equal(t.el('#inspectorMode').value,'finance');
// Picking a compact view is remembered and restores the old per-tab behaviour.
for(const f of t.listeners.change)f({target:{id:'inspectorMode',value:'spend'}});
assert.equal(t.store.get('shiftwise-panel-view'),'');assert.equal(t.el('#cityMenuToggle').textContent,'My week ▾');
t=load('');assert.equal(t.run('cityPanelMode'),'workspace');assert.equal(t.el('#cityPanel').hidden,false,'desktop opens the compact panel as before');
t=load('finance',{narrow:true});assert.equal(t.run('cityPanelMode'),'finance');assert.equal(t.el('#cityPanel').hidden,true,'phones start with the panel tucked away');
assert.equal(load(undefined,{blocked:true}).run('cityPanelMode'),'finance','blocked storage still shows the grid');
// Performance: the grid is not built while the panel is closed, and unchanged output is not rewritten.
t=load(undefined,{narrow:true});let builds=0,writes=0,html='<div>grid</div>';t.ctx.ready=true;t.ctx.reducedMotion=()=>false;t.ctx.financeGrid=()=>{builds++;return html};
const summary=t.el('#citySummary');let inner='';Object.defineProperty(summary,'innerHTML',{get:()=>inner,set:v=>{writes++;inner=v}});
t.run('updateCityPanel();updateCityPanel()');assert.equal(builds,0,'closed panel skips the grid');assert.equal(inner,'');writes=0;
t.run('toggleCityPanel(true)');assert.equal(builds,1);assert.equal(writes,1);assert.equal(inner,html);
t.run('updateCityPanel();updateCityPanel()');assert.equal(builds,3);assert.equal(writes,1,'identical grid is not re-inserted');
html='<div>changed</div>';t.run('updateCityPanel()');assert.equal(writes,2);assert.equal(inner,html);
console.log('PASS: finance grid is the default pull-down view, remembered per device, and never covers the desktop workspace at launch.');
