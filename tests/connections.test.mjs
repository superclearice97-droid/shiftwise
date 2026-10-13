import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const settings={enabled:true,autoRefresh:true,stores:[{id:'store',name:'Local shop',kind:'json',key:'private',endpoint:'https://feed.example/offers',locationId:'north'}],ai:{enabled:true,endpoint:'https://api.openai.com/v1/chat/completions',key:'private-ai',model:'test-model'}};
const offer={id:'store:coffee',productId:'coffee',connectionId:'store',name:'Coffee',store:'Local shop',variant:'12 oz',price:4,regularPrice:8,currency:'USD',url:'',terms:'Members only',locationId:'north',zip:'60438',observedAt:new Date().toISOString(),expiresAt:null,retrievedAt:new Date().toISOString()};
let saved=0,requests=0,resolveRequest;
const intervals=[],elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{open:false,value:'Best coffee?',innerHTML:''});return elements.get(id)};
const scope={URL,Date,AbortSignal,TextDecoder,Response,console,document:{addEventListener(){},hidden:false},window:{},setInterval:fn=>intervals.push(fn),ready:true,accountId:'owner',data:{dealConnections:structuredClone(settings),discountPreferences:{zip:'60438'},connectedOffers:[],dealItems:[{id:'watch',name:'Coffee',connectionId:'store',productId:'coffee',variant:'12 oz'}],dealPrices:[]},clone:structuredClone,render(){},tab:'discounts',$:el,save:async()=>saved++,uid:()=>crypto.randomUUID(),confirm:()=>false,toast(){}};
vm.createContext(scope);for(const file of ['deal-api.js','connections.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),scope);
const run=s=>vm.runInContext(s,scope);
scope.fetch=async()=>{requests++;return Response.json({offers:[offer]})};
await run('refreshConnectedDeals()');assert.equal(requests,2,'search plus exact watch lookup');assert.equal(scope.data.dealPrices.length,1);assert.equal(saved,1);assert.equal(scope.data.connectedOffers.length,1);
await run('refreshConnectedDeals()');assert.equal(scope.data.dealPrices.length,1,'same observed timestamp is deduplicated');
await run('askConnectedAI()');assert.equal(requests,4,'declining AI disclosure sends no request');
// The whole result is discarded if vault locks while provider calls are outstanding.
scope.fetch=()=>new Promise(r=>resolveRequest=r);
const pending=run('refreshConnectedDeals()');assert(run('dealBusy'));scope.ready=false;run('clearDealConnections()');resolveRequest(Response.json({offers:[{...offer,price:1}]}));
// The independent watch phase resolves too, but is never accepted into locked records.
await new Promise(r=>setTimeout(r,0));resolveRequest(Response.json({offers:[{...offer,price:1}]}));await pending;
assert.equal(scope.data.dealPrices.length,1);assert.equal(scope.data.connectedOffers[0].price,4);assert.equal(run('dealBusy'),false);assert.equal(run('dealAnswer'),'');
// Hidden, locked, disabled and open-form states never initiate automatic polling.
const before=requests;scope.ready=true;scope.document.hidden=true;run('lastDealRefresh=Date.now()-900001');intervals[0]();assert.equal(requests,before);
scope.document.hidden=false;el('#modal').open=true;intervals[0]();assert.equal(requests,before);
el('#modal').open=false;scope.data.dealConnections.enabled=false;intervals[0]();assert.equal(requests,before);
console.log('PASS: exact watch refresh, timestamp deduplication, AI cancellation, lock-time response invalidation and automatic refresh visibility/form/consent guards.');
