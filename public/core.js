/* Shared deterministic rules for synchronization and weekly reviews. */
(function(root){
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const collections=['shifts','supplies','expenses','goals','weeks','contributions','investments','balanceHistory','dealItems','dealPrices','dealReads','savingOffers','connectedOffers','celebrated'];
 function merge(base,local,remote,choices={}){
  const conflicts=[];
  function value(b,l,r,path){
   if(equal(l,r))return clone(l);
   if(equal(l,b))return clone(r);
   if(equal(r,b))return clone(l);
   if(choices[path]==='local')return clone(l);
   if(choices[path]==='remote')return clone(r);
   conflicts.push({path,base:clone(b),local:clone(l),remote:clone(r)});return clone(l);
  }
  function record(b,l,r,path){
   if(!b||!l||!r)return value(b,l,r,path);
   const out={};for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){const v=value(b[k],l[k],r[k],path+'.'+k);if(v!==undefined)out[k]=v}return out;
  }
  const out={};
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   if(collections.includes(key)){
    const b=new Map((base[key]||[]).map(x=>[x.id,x])),l=new Map((local[key]||[]).map(x=>[x.id,x])),r=new Map((remote[key]||[]).map(x=>[x.id,x]));out[key]=[];
    for(const id of new Set([...l.keys(),...r.keys(),...b.keys()])){const item=record(b.get(id),l.get(id),r.get(id),key+'.'+id);if(item!==undefined)out[key].push(item)}
   }else if(key==='settings'||key==='appearance'||key==='discountPreferences'||key==='experience')out[key]=record(base[key]||{},local[key]||{},remote[key]||{},key);
   else out[key]=value(base[key],local[key],remote[key],key);
  }
  // Two offline devices can independently log the same time with different IDs.
  const shifts=out.shifts||[],remove=new Set();
  for(let i=0;i<shifts.length;i++)for(let j=i+1;j<shifts.length;j++){
   const a=shifts[i],b=shifts[j];if(Date.parse(a.start)>=Date.parse(b.end)||Date.parse(b.start)>=Date.parse(a.end))continue;
   const localIds=new Set((local.shifts||[]).map(s=>s.id)),remoteIds=new Set((remote.shifts||[]).map(s=>s.id));
   const pair=localIds.has(a.id)&&!remoteIds.has(a.id)&&remoteIds.has(b.id)&&!localIds.has(b.id)?[a,b]:localIds.has(b.id)&&!remoteIds.has(b.id)&&remoteIds.has(a.id)&&!localIds.has(a.id)?[b,a]:null;
   if(!pair)continue;const path='overlap:'+pair[0].id+':'+pair[1].id;
   if(choices[path]==='local')remove.add(pair[1].id);else if(choices[path]==='remote')remove.add(pair[0].id);else conflicts.push({path,local:clone(pair[0]),remote:clone(pair[1]),overlap:true});
  }
  if(remove.size)out.shifts=out.shifts.filter(s=>!remove.has(s.id));
  return {data:out,conflicts};
 }
 function grade(plan,{hours,spent,saved,hasActivity,ended,future}){
  if(!plan)return {letter:'—',score:null,status:'Set targets',metrics:[]};
  const cap=n=>Math.max(0,Math.min(100,n));const metrics=[];
  if(plan.hoursEnabled)metrics.push({name:'Hours',actual:hours,target:plan.hoursTarget,score:cap(hours/plan.hoursTarget*100),kind:'hours'});
  if(plan.budgetEnabled)metrics.push({name:'Spending',actual:spent,target:plan.budgetTarget,score:spent<=plan.budgetTarget?100:cap((2-spent/plan.budgetTarget)*100),kind:'budget'});
  if(plan.savingsEnabled)metrics.push({name:'Savings',actual:saved,target:plan.savingsTarget,score:cap(saved/plan.savingsTarget*100),kind:'savings'});
  if(!metrics.length||future||(!hasActivity&&!plan.reviewed))return {letter:'—',score:null,status:future?'Planned':'No entries yet',metrics};
  const score=Math.round(metrics.reduce((n,m)=>n+m.score,0)/metrics.length);
  const letter=score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F';
  return {score,letter,metrics,status:!ended?'In progress':plan.reviewed?'Final':'Needs review'};
 }
 function safeDealUrl(value){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
 function valid(data){
  if(!data||typeof data!=='object'||!data.settings||!Array.isArray(data.shifts)||!Array.isArray(data.expenses)||!Array.isArray(data.goals))return false;
  const s=data.settings,n=(v,min=0,max=1e9)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,txt=(v,max=200)=>typeof v==='string'&&v.length<=max;
  for(const key of ['rate','ot','mult','credit','otherIncome','w4ded','extra','state','local','retire','benefits','post','ytd','hourGoal','budget'])if(!n(s[key]))return false;
  if(s.rate<=0||s.ot<=0||s.hourGoal<=0||s.budget<=0||!['single','joint'].includes(s.status))return false;
  for(const key of ['shifts','supplies','expenses','goals','weeks','contributions','investments','balanceHistory','dealItems','dealPrices','dealReads','savingOffers','connectedOffers','celebrated']){
   const list=data[key]??[];if(!Array.isArray(list)||list.length>25000||new Set(list.map(x=>x?.id)).size!==list.length)return false;
   if(list.some(x=>!x||!txt(x.id,key==='connectedOffers'?201:100)||!x.id))return false;
  }
  if(data.shifts.some(x=>!Number.isFinite(Date.parse(x.start))||!Number.isFinite(Date.parse(x.end))||Date.parse(x.end)<=Date.parse(x.start)||!n(x.break)||x.break>=(Date.parse(x.end)-Date.parse(x.start))/60000))return false;
  if(data.expenses.some(x=>!txt(x.name)||!txt(x.category)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!n(x.amount,.01)))return false;
  if(data.goals.some(x=>!txt(x.name)||!n(x.target,1)||!n(x.saved)|| (x.deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(x.deadline))))return false;
  if((data.contributions||[]).some(x=>!txt(x.goalId,100)||!n(x.amount,.01)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)))return false;
  if((data.weeks||[]).some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x.id)||!n(x.hoursTarget,.01,168)||!n(x.budgetTarget,.01)||!n(x.savingsTarget,.01)))return false;
  if(s.weekStart!==undefined&&(!Number.isInteger(s.weekStart)||s.weekStart<0||s.weekStart>6))return false;
  if((data.investments||[]).some(x=>!txt(x.name)||!['stock','crypto','401k','savings'].includes(x.kind)||!n(x.quantity,0,1e12)||!n(x.averageCost)||!n(x.price)||!n(x.balance)||!n(x.annualRate,-99,100)||!n(x.monthlyContribution)||!n(x.employerMonthly)||!/^\d{4}-\d{2}-\d{2}$/.test(x.asOf)||!txt(x.symbol,15)||((x.kind==='stock'||x.kind==='crypto')&&!/^[A-Z0-9.-]{1,15}$/.test(x.symbol))))return false;
  if((data.balanceHistory||[]).some(x=>!txt(x.investmentId,100)||!n(x.value)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)))return false;
  if((data.dealItems||[]).some(x=>!txt(x.name)||!x.name.trim()||!txt(x.store,100)||!x.store.trim()||!txt(x.variant)||typeof x.alerts!=='boolean'||(x.target!==null&&!n(x.target))||!txt(x.url,2000)||!safeDealUrl(x.url)))return false;
  if((data.dealPrices||[]).some(x=>!txt(x.itemId,100)||!x.itemId||!n(x.price)||!txt(x.at,40)||!Number.isFinite(Date.parse(x.at))))return false;
  if((data.dealReads||[]).some(x=>!txt(x.key,500)))return false;
  if(data.dealConnections&&(!root.DealAPI||!root.DealAPI.validSettings(data.dealConnections)))return false;
  if((data.dealItems||[]).some(x=>(x.connectionId!==undefined&&(!txt(x.connectionId,100)||!txt(x.productId,100)))))return false;
  if((data.connectedOffers||[]).some(x=>!txt(x.productId,100)||!txt(x.connectionId,100)||!txt(x.name)||!x.name.trim()||!txt(x.store,100)||!txt(x.variant)||!n(x.price)||!(x.regularPrice===null||n(x.regularPrice)&&x.regularPrice>=x.price)||x.currency!=='USD'||!txt(x.url,2000)||!safeDealUrl(x.url)||!txt(x.terms,3000)||!txt(x.locationId,100)||!/^\d{5}$/.test(x.zip)||!Number.isFinite(Date.parse(x.observedAt))||!Number.isFinite(Date.parse(x.retrievedAt))||!(x.expiresAt===null||Number.isFinite(Date.parse(x.expiresAt)))))return false;
  if(data.discountPreferences&&(!txt(data.discountPreferences.zip,5)||!/^\d{5}$/.test(data.discountPreferences.zip)))return false;
  const offerDate=v=>v===''||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
  if((data.savingOffers||[]).some(x=>!txt(x.title)||!x.title.trim()||!txt(x.store,100)||!x.store.trim()||!['coupon','cashback','rebate','other'].includes(x.type)||!txt(x.benefit,300)||!x.benefit.trim()||!txt(x.code,100)||!txt(x.url,2000)||!safeDealUrl(x.url)||!txt(x.terms,3000)||!txt(x.notes,3000)||!offerDate(x.expires)||!offerDate(x.claimBy)||!offerDate(x.receivedOn)||!['saved','pending','received','closed'].includes(x.status)||!n(x.expected)||!n(x.actual)||typeof x.shareable!=='boolean'||(x.status==='received'&&!x.receivedOn)))return false;
  if(data.experience&&(typeof data.experience.motion!=='boolean'||typeof data.experience.sounds!=='boolean'||!n(data.experience.volume,0,1)))return false;
  if(data.tileLayout&&(!Array.isArray(data.tileLayout)||data.tileLayout.length>6||new Set(data.tileLayout.map(t=>t.id)).size!==data.tileLayout.length||data.tileLayout.some(t=>!['offers','cashback','coupon','rebate','price','total'].includes(t.id)||!['small','medium','wide','large'].includes(t.size)||!['#185abd','#006b5b','#92278f','#b74700','#313a8a','#176d32','#333333'].includes(t.color))))return false;
  if((data.supplies||[]).some(x=>!txt(x.name,100)||!x.name.trim()||!['Personal care','House cleaning','Other'].includes(x.category)||!Number.isInteger(x.days)||!n(x.days,1,730)||!Number.isInteger(x.lead)||!n(x.lead,0,x.days)||!n(x.stocked,0,8640000000000000-730*86400000)||typeof x.shopping!=='boolean'||(x.estimate!==null&&!n(x.estimate))||!txt(x.priceItemId,100)||!txt(x.offerId,100)))return false;
  if(data.timer&&(!txt(data.timer.id,100)||!Number.isFinite(Date.parse(data.timer.start))))return false;
  if(data.appearance?.design!==undefined&&!['classic','neon','minimal'].includes(data.appearance.design))return false;
  if(data.appearance&&(!/^#[a-f0-9]{6}$/i.test(data.appearance.accent)||!['light','dark','system'].includes(data.appearance.mode)))return false;
  return true;
 }
 root.ShiftwiseCore={merge,grade,valid,clone,equal};
})(globalThis);
