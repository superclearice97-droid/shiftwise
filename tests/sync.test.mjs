import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const state={payload:null,version:0,user:'user-a',gets:0,puts:0,failPut:false};const disk=new Map();
const passphrase='test-only long vault secret 529';
function makeDevice(){
 const elements=new Map(),classes={toggle(){},add(){},remove(){}};
 const el=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',hidden:false,open:false,style:{setProperty(){}},dataset:{},classList:classes,append(){},close(){this.open=false},reset(){this._values={}},querySelector:()=>({disabled:false})});return elements.get(key)};
 const document={querySelector:el,querySelectorAll:()=>[],addEventListener(){},body:{classList:classes},documentElement:{dataset:{},style:{setProperty(){}}},visibilityState:'visible'};
 const navigator={onLine:true},window={addEventListener(){},matchMedia:()=>({matches:false})};
 class TestFormData{constructor(form){this.v=form._values||{}}get(k){return this.v[k]??null}has(k){return k in this.v}}
 const sandbox={console,document,navigator,window,crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,location:{href:'https://app.test/',reload(){}},matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>0,clearTimeout(){},setInterval(){},Date,Intl,AbortController,FormData:TestFormData,Blob,URL};
 sandbox.testDiskGet=async k=>copy(disk.get(k));sandbox.testDiskPut=async(k,v)=>disk.set(k,copy(v));
 sandbox.fetch=async (_url,options={})=>{if(!navigator.onLine)throw Error('offline');if(options.method==='PUT'){state.puts++;if(state.failPut)throw Error('temporarily unavailable');const body=JSON.parse(options.body);assert.equal(body.data.format,'shiftwise-e2ee');assert(!JSON.stringify(body).includes('Private lunch'));if(body.version!==state.version)return response({error:'conflict'},409);state.payload=copy(body.data);state.version++;return response({version:state.version,userId:state.user})}state.gets++;return response({data:copy(state.payload),version:state.version,userId:state.user})};
 function response(value,status=200){return {ok:status===200,status,redirected:false,headers:{get:()=> 'application/json'},json:async()=>copy(value)}}
 vm.createContext(sandbox);
 for(const file of ['deal-api.js','core.js','crypto.js','storage.js','app.js','features.js','investments.js','discounts.js','offers.js','sync.js','experience.js','restock.js','connections.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),sandbox);
 vm.runInContext(fs.readFileSync('public/city.js','utf8').replace('initCity();',''),sandbox);
 vm.runInContext(fs.readFileSync('public/vault.js','utf8').replace('bootWithLock();',''),sandbox);
 vm.runInContext('LocalRecords.rawGet=testDiskGet;LocalRecords.rawPut=testDiskPut;',sandbox);
 const run=code=>vm.runInContext(code,sandbox);
 return {sandbox,run,elements,async submit(password=passphrase,setup=false){const form=el('#vaultForm');form._values={passphrase:password,...(setup?{confirm:password,acknowledge:'on',age:'28'}:{})};await form.onsubmit({preventDefault(){},target:form});await settle(this)}};
}
async function settle(device){for(let i=0;i<3000;i++){if(!device.run('syncing'))break;await new Promise(r=>setTimeout(r,1))}await device.run('writeQueue.catch(()=>{})')}
async function serverData(d){d.sandbox.serverPacket=copy(state.payload);return copy(await d.run("VaultCrypto.decrypt(serverPacket,vaultKey,accountId,'account')"))}
async function setServerData(d,value){d.sandbox.serverValue=copy(value);state.payload=copy(await d.run("VaultCrypto.encrypt(serverValue,vaultKey,vaultSalt,accountId,'account')"));state.version++}
// Workweek boundaries, projections and investment collection validation.
const planning=makeDevice();planning.run('data=normalize({})');
assert.equal(planning.run("datekey(startWeek(new Date('2026-09-22T12:00:00')))"),'2026-09-20');
assert.equal(planning.run("datekey(startWeek(new Date('2026-09-20T12:00:00'),1))"),'2026-09-14');
for(let day=0;day<7;day++)assert.equal(planning.run(`startWeek(new Date('2026-09-22T12:00:00'),${day}).getDay()`),day);
planning.run("week=new Date('2026-09-20T00:00:00');data.shifts=[{id:'overnight',start:'2026-09-19T22:00:00',end:'2026-09-20T02:00:00',break:0}]");
assert.equal(planning.run('hours()'),2);assert.equal(planning.run("hours(new Date('2026-09-13T00:00:00'))"),2);
assert.equal(planning.run('weekdayLabels()[0]'),'Sun');assert.equal(planning.run('weekdayLabels()[6]'),'Sat');
assert.equal(planning.run('projectGrowth(1000,0,100,12).at(-1).value'),2200);
assert(Math.abs(planning.run('projectGrowth(1000,10,0,12).at(-1).value')-1100)<1e-8);
assert(Math.abs(planning.run('projectGrowth(1000,-10,0,12).at(-1).value')-900)<1e-8);
planning.run("data.investments=[{id:'retirement',name:'Private retirement',kind:'401k',quantity:0,averageCost:0,price:0,balance:1000,annualRate:0,monthlyContribution:100,employerMonthly:50,asOf:'2026-09-20',symbol:''}];data.balanceHistory=[{id:'older',investmentId:'retirement',value:700,date:'2026-09-19'}]");
assert.equal(planning.run('latestBalance(data.investments[0]).value'),1000);
assert.equal(planning.run('investmentProjection(12).at(-1).value'),2800);
assert.equal(planning.run('ShiftwiseCore.valid(data)'),true);
assert.equal(planning.run('ShiftwiseCore.valid({...data,settings:{...data.settings,weekStart:7}})'),false);
planning.run('data.shifts=[]');
const base=copy(planning.run('data')),local=copy(base),other=copy(base);local.investments[0].balance=1200;other.balanceHistory.push({id:'new',investmentId:'retirement',value:1300,date:'2026-09-21'});
planning.sandbox.mergeTest={base,local,other};
assert.equal(planning.run('ShiftwiseCore.merge(mergeTest.base,mergeTest.local,mergeTest.other).conflicts.length'),0);
assert.equal(planning.run('ShiftwiseCore.merge(mergeTest.base,mergeTest.local,mergeTest.other).data.balanceHistory.length'),2);
console.log('PASS: all weekday starts, Sunday overnight split, daily labels, contribution/APY/negative-return projections and investment merges.');
// Discounts: first observations are not record lows; only strictly lower prices qualify.
planning.run("data=normalize({});data.dealItems=[{id:'watch',name:'Private wish item',store:'Test store',variant:'Model 1',url:'https://example.com/item',target:80,alerts:true}];data.dealPrices=[{id:'p1',itemId:'watch',price:100,at:'2026-09-20T12:00:00.000Z'}]");
assert.equal(planning.run('dealAlerts().length'),0);
planning.run("data.dealPrices.push({id:'p2',itemId:'watch',price:90,at:'2026-09-21T12:00:00.000Z'})");
assert.equal(planning.run('dealAlerts()[0].low'),true);
planning.run("data.dealReads.push({id:'watch',key:dealStatus(data.dealItems[0]).key})");
assert.equal(planning.run('dealAlerts().length'),0);
planning.run("data.dealPrices.push({id:'p3',itemId:'watch',price:80,at:'2026-09-22T12:00:00.000Z'})");
assert.equal(planning.run('dealAlerts()[0].target'),true);
assert.equal(planning.run('dealStatus(data.dealItems[0]).lowest'),80);
assert.equal(planning.run('ShiftwiseCore.valid(data)'),true);
assert.equal(planning.run("ShiftwiseCore.valid({...data,dealItems:[{...data.dealItems[0],url:'javascript:alert(1)'}]})"),false);
assert.equal(planning.run("ShiftwiseCore.valid({...data,dealItems:[{...data.dealItems[0],url:'https://user:password@example.com'}]})"),false);
planning.run("data.dealPrices.push({id:'older',itemId:'watch',price:75,at:'2026-09-19T12:00:00.000Z'})");
assert.equal(planning.run('dealStatus(data.dealItems[0]).low'),false);
assert.equal(planning.run('dealStatus(data.dealItems[0]).latest.price'),80);
planning.run('data.dealItems[0].alerts=false');assert.equal(planning.run('dealAlerts().length'),0);
assert.match(planning.run('discountsView()'),/Manual prices/);
console.log('PASS: discount lows, targets, dismissals, historical observations, disabled alerts and unsafe link rejection.');
planning.run("data.savingOffers=[{id:'offer-test',title:'Private offer title',store:'Test store',type:'cashback',benefit:'5% cashback',code:'PUBLIC5',url:'https://example.com/offer',terms:'Public terms',notes:'PRIVATE RECEIPT',expires:'2099-12-31',claimBy:'',status:'pending',expected:10,actual:0,receivedOn:'',shareable:true}]");
assert.equal(planning.run('offerTotals().pending'),10);assert.equal(planning.run('offerTotals().actual'),0);
assert.equal(planning.run('ShiftwiseCore.valid(data)'),true);
assert(!planning.run('offerShareText(data.savingOffers[0])').includes('PRIVATE RECEIPT'));
assert(!planning.run('offerShareText(data.savingOffers[0])').includes('10'));
assert.equal(planning.run("offerDue({...data.savingOffers[0],claimBy:'2026-09-25'},'2026-09-24')"),'Due within 7 days');
assert.equal(planning.run("offerDue({...data.savingOffers[0],claimBy:'2026-09-23'},'2026-09-24')"),'Deadline passed');
planning.run("data.savingOffers[0].status='received';data.savingOffers[0].actual=8;data.savingOffers[0].receivedOn='2026-09-24'");
assert.equal(planning.run('offerTotals().pending'),0);assert.equal(planning.run('offerTotals().actual'),8);
assert.equal(planning.run('offerDue(data.savingOffers[0])'),'');
assert.equal(planning.run("ShiftwiseCore.valid({...data,savingOffers:[{...data.savingOffers[0],expires:'2026-02-30'}]})"),false);
assert.equal(planning.run("offerShareText({...data.savingOffers[0],shareable:false})"),'');
assert.equal(planning.run("featuredDeals().filter(x=>x.kind==='offer').length"),0);
planning.run("data.savingOffers[0].status='saved';data.savingOffers[0].actual=0;data.savingOffers[0].receivedOn=''");
assert.equal(planning.run("featuredDeals().filter(x=>x.kind==='offer').length"),1);
for(let i=0;i<10;i++){planning.run(`data.appearance={mode:presets[${i}].mode,accent:presets[${i}].accent,design:presets[${i}].design||'classic'};applyAppearance()`);assert.equal(planning.run('ShiftwiseCore.valid(data)'),true)}
console.log('PASS: pending vs realized savings, expiry deadlines, private share exclusions, tile eligibility and all 10 themes.');
planning.run("save=()=>Promise.resolve();ready=true;data.goals=[{id:'milestone',name:'Fund',saved:0,target:100,deadline:''}];data.contributions=[];data.celebrated=[];checkMilestones();data.goals[0].saved=100;checkMilestones()");
assert.equal(planning.run('data.celebrated.length'),1);planning.run('checkMilestones()');assert.equal(planning.run('data.celebrated.length'),1);
planning.run('clearExperience();checkMilestones()');assert.equal(planning.run('data.celebrated.length'),1);
assert.equal(planning.run('tileConfig().length'),6);assert.match(planning.run('dealTileCards()'),/metro-tile/);
assert.equal(planning.run("ShiftwiseCore.valid({...data,tileLayout:[{id:'offers',size:'wide',color:'red;display:none'}]})"),false);
assert.equal(planning.run("ShiftwiseCore.valid({...data,experience:{motion:true,sounds:true,volume:2}})"),false);
planning.run("week=new Date('2026-09-06T00:00:00');data.weeks=[{id:'2026-09-06',hoursEnabled:false,hoursTarget:40,budgetEnabled:true,budgetTarget:100,savingsEnabled:false,savingsTarget:100,reviewed:true}];data.weeks[0].reviewHash=reviewSignature(week);celebrateGrade()");
assert.equal(planning.run("data.celebrated.filter(x=>x.id==='grade:2026-09-06').length"),1);planning.run('celebrateGrade()');assert.equal(planning.run("data.celebrated.filter(x=>x.id==='grade:2026-09-06').length"),1);
console.log('PASS: milestone deduplication, reload baseline, finalized grade celebration, tile layout and sound settings validation.');
// Restock: deterministic countdown boundaries, shopping, pricing and concurrent edits.
planning.run("data.supplies=[{id:'supply-private',name:'Private toothpaste',category:'Personal care',days:30,lead:3,stocked:1000000000000,shopping:false,estimate:4.5,priceItemId:'',offerId:''}]");
assert.equal(planning.run('ShiftwiseCore.valid(data)'),true);
assert.equal(planning.run('supplyDue(data.supplies[0])'),1000000000000+30*86400000);
assert.equal(planning.run('supplySoon(data.supplies[0],supplyDue(data.supplies[0])-3*RESTOCK_DAY-1)'),false);
assert.equal(planning.run('shoppingSupplies(supplyDue(data.supplies[0])-3*RESTOCK_DAY).length'),1);
assert.deepEqual(copy(planning.run('countdownParts(data.supplies[0],supplyDue(data.supplies[0])+1)')),[0,0,0,0]);
assert.equal(planning.run('supplyPrice(data.supplies[0]).value'),4.5);
planning.run("data.supplies[0].priceItemId='watch'");
assert.equal(planning.run('supplyPrice(data.supplies[0]).value'),80);
assert.equal(planning.run('ShiftwiseCore.valid({...data,supplies:[{...data.supplies[0],lead:31}]})'),false);
assert.match(planning.run('restockCalendar(data.supplies[0])'),/TRIGGER:-P3D/);
const supplyBase=copy(planning.run('data')),supplyLocal=copy(supplyBase),supplyRemote=copy(supplyBase);
supplyLocal.supplies[0].shopping=true;supplyRemote.expenses.push({id:'independent',name:'Bus',category:'Transport',amount:2,date:'2026-09-22'});
planning.sandbox.supplyMerge={base:supplyBase,local:supplyLocal,remote:supplyRemote};
assert.equal(planning.run('ShiftwiseCore.merge(supplyMerge.base,supplyMerge.local,supplyMerge.remote).conflicts.length'),0);
assert.equal(planning.run('ShiftwiseCore.merge(supplyMerge.base,supplyMerge.local,supplyMerge.remote).data.supplies[0].shopping'),true);
console.log('PASS: restock countdown, reminder boundary, shopping, linked prices, calendar, validation and independent merges.');
const a=makeDevice();const legacy=copy(a.run('normalize({})'));legacy.expenses=[{id:'legacy',name:'Private lunch',category:'Food',amount:12,date:'2026-09-22'}];legacy.supplies=copy(planning.run('data.supplies'));legacy.savingOffers=copy(planning.run('data.savingOffers'));legacy.dealItems=copy(planning.run('data.dealItems'));legacy.dealPrices=copy(planning.run('data.dealPrices'));state.payload=legacy;state.version=1;
disk.set('activeAccount','user-a');disk.set('user-a',{accountId:'user-a',data:copy(legacy),base:copy(legacy),version:1});
a.run('updateCityPanel()');assert.match(a.run('cityPanelSummary()'),/Unlock your vault/);
await a.run('boot()');assert.equal(a.run('ready'),false);assert.match(a.elements.get('#content').innerHTML,/Create your vault/);
const rejected=makeDevice();await rejected.run('boot()');const rejectedForm=rejected.elements.get('#vaultForm');const beforeReject=state.puts;
rejectedForm._values={passphrase,confirm:passphrase,acknowledge:'on',age:'12'};
await rejectedForm.onsubmit({preventDefault(){},target:rejectedForm});assert.equal(state.puts,beforeReject);assert.equal(rejected.run('ready'),false);
assert.match(rejected.elements.get('#vaultError').textContent,/18 or older/);
await rejected.submit(passphrase,true);assert.equal(state.puts,beforeReject);assert.match(rejected.elements.get('#vaultError').textContent,/unavailable in this session/);
await a.submit(passphrase,true);assert.equal(a.run('ready'),true);assert.equal(disk.get('user-a').format,'shiftwise-e2ee');assert(!JSON.stringify(disk.get('user-a')).includes('Private lunch'));assert.equal(state.payload.format,'shiftwise-e2ee');assert.equal((await serverData(a)).expenses.length,1);assert.equal((await serverData(a)).supplies[0].name,'Private toothpaste');assert(!JSON.stringify(state.payload).includes('Private toothpaste'));assert.equal((await serverData(a)).dealItems[0].name,'Private wish item');assert(!JSON.stringify(state.payload).includes('Private wish item'));assert(!JSON.stringify(state.payload).includes('PRIVATE RECEIPT'));assert.equal((await serverData(a)).savingOffers[0].notes,'PRIVATE RECEIPT');
for(const tab of ['overview','shifts','money','goals','review','appearance','settings','investments','discounts','restock'])a.run(`tab='${tab}';render()`);
a.run("tab='overview';navigator.onLine=false;data.expenses.push({id:'offline',name:'Bus',category:'Transport',amount:3,date:'2026-09-22'});save()");await a.run('writeQueue');assert.equal((await serverData(a)).expenses.length,1);
// Reopening offline requires the vault passphrase; a wrong one does not discard records.
const b=makeDevice();b.sandbox.navigator.onLine=false;await b.run('boot()');assert.equal(b.run('ready'),false);await b.submit('incorrect but sufficiently long phrase');assert.equal(b.run('ready'),false);assert.equal(b.run('vaultKey'),null);await b.submit();assert.equal(b.run('ready'),true);assert.equal(b.run('data.expenses.length'),2);
let remote=await serverData(a);remote.goals.push({id:'remote-goal',name:'Fund',target:1000,saved:50,deadline:''});await setServerData(a,remote);
b.sandbox.navigator.onLine=true;await b.run('syncRecords()');remote=await serverData(b);assert.equal(remote.expenses.length,2);assert.equal(remote.goals.length,1);
// Conflicting field changes are resolved after client-side decryption, never server-side.
b.run('navigator.onLine=false;data.settings.rate=25;save()');await b.run('writeQueue');remote.settings.rate=26;await setServerData(a,remote);b.sandbox.navigator.onLine=true;await b.run('syncRecords()');assert.equal(b.run('syncConflict.conflicts[0].path'),'settings.rate');
b.run("const resolved=ShiftwiseCore.merge(baseData,data,syncConflict.remote,{'settings.rate':'local'});data=normalize(resolved.data);baseData=syncConflict.remote;version=syncConflict.version;syncConflict=null;syncProblem=''");await b.run('save()');await settle(b);assert.equal((await serverData(b)).settings.rate,25);
state.failPut=true;b.run("data.expenses.push({id:'retry',name:'Train',category:'Transport',amount:5,date:'2026-09-22'})");await b.run('save()');await settle(b);assert.equal((await serverData(b)).expenses.length,2);assert.equal((await b.run("LocalRecords.get('user-a')")).data.expenses.length,3);state.failPut=false;await b.run('syncRecords()');assert.equal((await serverData(b)).expenses.length,3);
// Locking removes keys and rendered financial values; offline unlocking restores them.
b.sandbox.navigator.onLine=false;await b.run('lockVault()');assert.equal(b.run('vaultKey'),null);assert.equal(b.run('ready'),false);assert.equal(b.run('data.expenses.length'),0);assert.match(b.run('cityPanelSummary()'),/Unlock your vault/);assert(!b.elements.get('#citySummary').innerHTML.includes('HOURS'));assert(!b.elements.get('#content').innerHTML.includes('Private lunch'));await b.submit();assert.equal(b.run('data.expenses.length'),3);
state.user='user-b';b.sandbox.navigator.onLine=true;const puts=state.puts;await b.run('syncRecords()');assert.equal(state.puts,puts);assert.match(b.run('syncProblem'),/different account/);
// Concurrent setup loses the version race without rewriting an existing device copy.
state.user='user-c';state.payload=copy(legacy);state.version=1;const c=makeDevice();await c.run('boot()');state.version=2;await c.submit(passphrase,true);assert.equal(c.run('ready'),false);assert.equal(disk.has('user-c'),false);
console.log('PASS: legacy migration, encrypted account and offline writes, wrong-passphrase protection, offline unlock, encrypted merge/conflicts/retry, memory lock, account isolation and concurrent setup protection.');
