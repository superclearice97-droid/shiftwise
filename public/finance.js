/* Finance grid shown in the pull-down control panel, plus optional read-only bank linking (SimpleFIN).
   Every figure comes from records in the unlocked vault or from linked bank downloads. Nothing is invented. */
let bankBusy=false,bankMessage='',bankErrors=[],bankAutoTried=false;
const BANK_MIN_GAP=3600000,BANK_AUTO_AFTER=6*3600000,FIN_COLORS={cyan:'#1fc7b6',magenta:'#f2468f',orange:'#f08a2c',violet:'#8f78f5'};
function bankLinked(){return !!data.bankLink?.accessUrl}
function usdAccounts(){return data.bankAccounts.filter(a=>a.currency==='USD')}
async function bankRequest(packet){
 if(window.SHIFTWISE_DEVICE&&window.Capacitor?.isNativePlatform?.()){
  // Native HTTP: no WebView CORS, redirects refused, nothing logged.
  return BankAPI.run(packet,async(url,init)=>{
   if(new URL(url).protocol!=='https:')throw Error('Bank connections require HTTPS.');
   const r=await window.Capacitor.Plugins.CapacitorHttp.request({url,method:init.method||'GET',headers:init.headers,responseType:'text',connectTimeout:15000,readTimeout:45000,disableRedirects:true});
   if(r.url&&r.url!==url)throw Error('Bank redirects are not allowed.');
   return new Response(typeof r.data==='string'?r.data:JSON.stringify(r.data),{status:r.status});
  });
 }
 if(!window.SHIFTWISE_DEVICE)throw Error('Bank linking is available in the Android and Linux apps only, so your bank access never passes through a website server.');
 const response=await originalFetch('/api/bank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(50000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Bank connection unavailable.');return result;
}
function linkBankModal(){
 modal('Link bank accounts (experimental)',`<p class="sub">Shiftwise reads balances and transactions through <b>SimpleFIN</b>, a read-only service: it cannot move money, and Shiftwise never sees your bank password.</p><ol class="sub fin-steps"><li>At <b>beta-bridge.simplefin.org</b> (SimpleFIN Bridge, a paid service run by a separate company), connect your banks.</li><li>Create a <b>setup token</b> for a new app there and copy it.</li><li>Paste it below. It works once.</li></ol><label>SimpleFIN setup token<textarea name="token" rows="3" maxlength="4000" autocomplete="off" spellcheck="false" required></textarea></label><p class="sub">Your access key is saved only in your encrypted vault and encrypted backups. Shiftwise checks at most about once an hour and only while open and unlocked.</p>`,()=>{});
 $('#form').onsubmit=async e=>{
  e.preventDefault();const token=String(new FormData(e.target).get('token')||'');let host;
  try{host=BankAPI.claimUrl(token).host}catch(err){$('#formError').textContent=err.message;return}
  if(!confirm(`Connect to ${host}?\n\nShiftwise will claim your one-time setup token there, then download account names, balances and up to 90 days of transactions from the banks you linked in SimpleFIN. They are stored in your encrypted vault on this device.\n\nNothing else from Shiftwise is sent.`))return;
  const d=data,owner=accountId;$('#formError').textContent='Connecting…';
  try{const r=await bankRequest({action:'claim',token});if(!ready||data!==d||owner!==accountId)return;data.bankLink={accessUrl:r.accessUrl,lastSync:''};await save();$('#modal').close();bankAutoTried=true;await refreshBank(true)}
  catch(err){$('#formError').textContent=err.message||'Could not link.'}
 };
}
async function refreshBank(manual=false){
 if(!ready||bankBusy||!bankLinked())return;
 const last=Date.parse(data.bankLink.lastSync)||0;
 if(Date.now()-last<BANK_MIN_GAP){if(manual){bankMessage='Updated '+new Date(last).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'. SimpleFIN allows about one update an hour; try again after '+new Date(last+BANK_MIN_GAP).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'.';render()}return}
 const d=data,owner=accountId,link=clone(data.bankLink);
 // Overlap the previous download by 5 days so late-posting transactions are not missed.
 const start=Math.floor((last?last-5*86400000:Date.now()-90*86400000)/1000);
 bankBusy=true;bankMessage='Updating balances…';render();
 try{
  const r=await bankRequest({action:'accounts',accessUrl:link.accessUrl,startDate:start});
  if(!ready||data!==d||owner!==accountId||data.bankLink.accessUrl!==link.accessUrl)return;
  data.bankAccounts=r.accounts;data.bankTransactions=BankAPI.mergeTransactions(data.bankTransactions,r.transactions,r.accounts.map(a=>a.id));
  data.bankLink={...data.bankLink,lastSync:r.checkedAt};bankErrors=r.errors;bankMessage=r.accounts.length+' account'+(r.accounts.length===1?'':'s')+' updated.';await save();
 }catch(err){if(data===d)bankMessage=err.message||'Could not update balances.'}
 finally{bankBusy=false;if(ready&&data===d)render()}
}
function unlinkBank(){if(!confirm('Unlink bank accounts?\n\nThis deletes the SimpleFIN access key and the downloaded balances and transactions from Shiftwise. To stop access completely, also disable the Shiftwise connection at your SimpleFIN server.'))return;data.bankLink={accessUrl:'',lastSync:''};data.bankAccounts=[];data.bankTransactions=[];bankErrors=[];bankMessage='Bank accounts unlinked.';save();render()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!ready)return;if(b.id==='linkBank'||b.id==='linkBankHero')linkBankModal();if(b.id==='refreshBank')refreshBank(true);if(b.id==='unlinkBank')unlinkBank()});

// ---------- Charts: thin marks, a glow drawn as a wider faint stroke (no filters), native hover titles ----------
const finMoney=n=>money(n).replace('.00','');
function finCompact(n){const a=Math.abs(n);return (n<0?'−':'')+'$'+(a>=1e6?(a/1e6).toFixed(1)+'M':a>=1e4?Math.round(a/1e3)+'k':a>=1e3?(a/1e3).toFixed(1)+'k':Math.round(a))}
let finChartId=0;
function finLine(series,labels,{height=150,label='Line chart',width=600}={}){
 const w=width,h=height,pad={l:44,r:10,t:12,b:28},all=series.flatMap(s=>s.values);if(!all.length)return '';
 let max=Math.max(...all),min=Math.min(0,...all);if(max===min)max=min+1;
 const x=i=>pad.l+(labels.length<2?0:i/(labels.length-1))*(w-pad.l-pad.r),y=v=>pad.t+(1-(v-min)/(max-min))*(h-pad.t-pad.b);
 const id='fg'+(++finChartId),grid=[max,(max+min)/2,min].map(v=>`<line x1="${pad.l}" x2="${w-pad.r}" y1="${y(v)}" y2="${y(v)}" class="fin-gridline"/><text x="${pad.l-6}" y="${y(v)+4}" text-anchor="end">${finCompact(v)}</text>`).join('');
 const paths=series.map((s,k)=>{const d=s.values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+','+y(v).toFixed(1)).join('');const area=k===0&&series.length===1?`<path d="${d}L${x(s.values.length-1)},${y(min)}L${x(0)},${y(min)}Z" fill="url(#${id})"/>`:'';return `${area}<path d="${d}" stroke="${s.color}" class="fin-glow"/><path d="${d}" stroke="${s.color}" class="fin-stroke"/>`}).join('');
 const hits=labels.map((l,i)=>`<rect x="${x(i)-(w-pad.l-pad.r)/Math.max(1,labels.length-1)/2}" y="${pad.t}" width="${(w-pad.l-pad.r)/Math.max(1,labels.length-1)}" height="${h-pad.t-pad.b}" class="fin-hit"><title>${esc(l)}: ${series.map(s=>esc(s.name)+' '+money(s.values[i])).join(' · ')}</title></rect>`).join('');
 const last=series.map(s=>`<circle cx="${x(s.values.length-1)}" cy="${y(s.values.at(-1))}" r="4" fill="${s.color}" class="fin-dot"/>`).join('');
 return `<svg class="fin-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${series[0].color}" stop-opacity=".28"/><stop offset="1" stop-color="${series[0].color}" stop-opacity="0"/></linearGradient></defs>${grid}${paths}${last}<text x="${pad.l}" y="${h-5}">${esc(labels[0])}</text><text x="${w-pad.r}" y="${h-5}" text-anchor="end">${esc(labels.at(-1))}</text>${hits}</svg>`;
}
function finBars(values,labels,color,{height=130,label='Bar chart',fmt=money,every=1}={}){
 const w=600,h=height,pad={l:8,r:8,t:10,b:28},max=Math.max(1e-9,...values),n=values.length,step=(w-pad.l-pad.r)/n,bw=Math.max(2,step-2);
 return `<svg class="fin-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><line x1="${pad.l}" x2="${w-pad.r}" y1="${h-pad.b}" y2="${h-pad.b}" class="fin-gridline"/>${values.map((v,i)=>{const bh=v>0?Math.max(2,v/max*(h-pad.t-pad.b)):0,x=pad.l+i*step+(step-bw)/2;return `<g><rect x="${x}" y="${pad.t}" width="${step}" height="${h-pad.t-pad.b}" class="fin-hit"/>${bh?`<rect x="${x}" y="${h-pad.b-bh}" width="${bw}" height="${bh}" rx="${Math.min(4,bw/2)}" fill="${color}" class="fin-bar"/>`:''}${(i%every===0&&n-1-i>=every/2)||i===n-1?`<text x="${x+bw/2}" y="${h-5}" text-anchor="middle">${esc(labels[i])}</text>`:''}<title>${esc(labels[i])}: ${esc(fmt(v))}</title></g>`}).join('')}</svg>`;
}
function finRing(pct,color,center,sub){const r=42,c=2*Math.PI*r,k=Math.max(0,Math.min(1,pct));return `<svg class="fin-ring" viewBox="0 0 110 110" role="img" aria-label="${esc(center+' '+sub)}"><circle cx="55" cy="55" r="${r}" class="fin-ring-track"/>${k>0?`<circle cx="55" cy="55" r="${r}" stroke="${color}" class="fin-glow" stroke-dasharray="${c*k} ${c}" transform="rotate(-90 55 55)"/><circle cx="55" cy="55" r="${r}" stroke="${color}" class="fin-ring-arc" stroke-dasharray="${c*k} ${c}" transform="rotate(-90 55 55)"/>`:''}<text x="55" y="56" text-anchor="middle" class="fin-ring-value">${esc(center)}</text><text x="55" y="72" text-anchor="middle">${esc(sub)}</text></svg>`}
const finTile=(cls,title,sub,body,color)=>`<section class="fin-tile ${cls}" style="--tile:${color||FIN_COLORS.cyan}"><header><h3>${title}</h3>${sub?`<small>${sub}</small>`:''}</header>${body}</section>`;
// End-of-day balances: today's total minus everything posted after that day (local time).
function finBalanceTrail(now,txs,dayKeys){return dayKeys.map(k=>{const end=new Date(k+'T23:59:59.999').getTime();return Math.round((now-txs.filter(t=>!t.pending&&Date.parse(t.posted)>end).reduce((n,t)=>n+t.amount,0))*100)/100})}
const finEmpty=t=>`<p class="fin-empty">${t}</p>`;

function financeGrid(){
 if(!ready)return '<p class="panel-caption">Unlock your vault to see your finances.</p>';
 if(bankLinked()&&!bankAutoTried&&!bankBusy&&Date.now()-(Date.parse(data.bankLink.lastSync)||0)>BANK_AUTO_AFTER){bankAutoTried=true;setTimeout(()=>refreshBank(false),0)}
 const today=new Date();today.setHours(0,0,0,0);
 const dayKeys=Array.from({length:30},(_,i)=>datekey(plus(today,i-29))),short=k=>new Date(k+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
 const thisWeek=startWeek(new Date()),p=calc(hours(thisWeek,plus(thisWeek,7))),wStart=datekey(thisWeek),wEnd=datekey(plus(thisWeek,7));
 const weekExp=data.expenses.filter(e=>e.date>=wStart&&e.date<wEnd),spent=weekExp.reduce((n,e)=>n+e.amount,0),budget=data.weeks.find(w=>w.id===wStart)?.budgetEnabled?data.weeks.find(w=>w.id===wStart).budgetTarget:data.settings.budget;
 const accounts=usdAccounts(),linked=bankLinked(),txs=data.bankTransactions.filter(t=>accounts.some(a=>a.id===t.accountId));
 const cash=accounts.filter(a=>a.balance>0).reduce((n,a)=>n+a.balance,0),owed=accounts.filter(a=>a.balance<0).reduce((n,a)=>n-a.balance,0),netLinked=cash-owed;
 let invested=0,held=0,cost=0;try{for(const x of data.investments){const v=investmentValue(x);invested+=v;if(['stock','crypto'].includes(x.kind)){held+=v;cost+=x.quantity*x.averageCost}}}catch(e){}
 // Eight weeks of estimated take-home against logged spending (same dollar axis).
 const weeks=Array.from({length:8},(_,i)=>plus(thisWeek,(i-7)*7)),weekLabels=weeks.map(w=>w.toLocaleDateString('en-US',{month:'short',day:'numeric'}));
 const weekNet=weeks.map(w=>calc(hours(w,plus(w,7))).net),weekSpent=weeks.map(w=>{const a=datekey(w),b=datekey(plus(w,7));return data.expenses.filter(e=>e.date>=a&&e.date<b).reduce((n,e)=>n+e.amount,0)});
 // Daily money out: bank downloads when linked, otherwise logged expenses.
 const outByDay=dayKeys.map(k=>linked?txs.filter(t=>!t.pending&&t.amount<0&&datekey(new Date(t.posted))===k).reduce((n,t)=>n-t.amount,0):data.expenses.filter(e=>e.date===k).reduce((n,e)=>n+e.amount,0));
 // Balance trail: today's balance minus everything posted after each day. Only as complete as the downloaded history.
 const balanceTrail=finBalanceTrail(netLinked,txs,dayKeys);
 const monthStart=datekey(new Date(today.getFullYear(),today.getMonth(),1)),cats={};for(const e of data.expenses)if(e.date>=monthStart)cats[e.category||'Other']=(cats[e.category||'Other']||0)+e.amount;
 const catRows=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5),catMax=Math.max(1,...catRows.map(r=>r[1]));
 const days=Array.from({length:7},(_,i)=>hours(plus(thisWeek,i),plus(thisWeek,i+1)));
 const last=data.bankLink.lastSync?new Date(data.bankLink.lastSync).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
 const kpi=(label,value,sub,color)=>`<section class="fin-tile fin-kpi" style="--tile:${color}"><small>${label}</small><strong>${value}</strong><span>${sub}</span></section>`;
 const tiles=[
  kpi('Linked balance',linked&&accounts.length?finMoney(netLinked):'—',linked?(accounts.length?`${finMoney(cash)} cash · ${finMoney(owed)} owed`:'Waiting for first update'):'No bank linked',FIN_COLORS.magenta),
  kpi('Take-home this week',finMoney(p.net),`${p.h.toFixed(1)} hrs · estimate`,FIN_COLORS.cyan),
  kpi('Spent this week',finMoney(spent),budget>0?`${spent<=budget?finMoney(budget-spent)+' left':finMoney(spent-budget)+' over'} of ${finMoney(budget)}`:'Logged expenses',FIN_COLORS.orange),
  kpi('Tracked investments',finMoney(invested),data.investments.length?`${held-cost<0?'−':'+'}${finMoney(Math.abs(held-cost))} vs cost`:'Nothing tracked yet',FIN_COLORS.violet),
  finTile('fin-wide','Linked balance · 30 days',linked?'Rebuilt from downloaded transactions':'Link a bank to see real balances',linked&&accounts.length?finLine([{name:'Balance',color:FIN_COLORS.magenta,values:balanceTrail}],dayKeys.map(short),{height:230,width:840,label:'Linked balance over the last 30 days'}):finEmpty('Your combined bank balance will trace here once accounts are linked.')+`<button id="linkBankHero" class="fin-cta">Link bank accounts</button>`,FIN_COLORS.magenta),
  finTile('fin-side','Budget this week',budget>0?'Logged expenses':'',finRing(budget>0?spent/budget:0,spent>budget?FIN_COLORS.magenta:FIN_COLORS.violet,budget>0?Math.round(spent/budget*100)+'%':'—',budget>0?'of '+finMoney(budget):'no budget')+`<p class="fin-note">${budget>0?(spent<=budget?finMoney(budget-spent)+' left to spend':'Over by '+finMoney(spent-budget)):'Set a budget in Pay settings.'}</p>`,FIN_COLORS.violet),
  finTile('fin-half','Take-home vs spending · 8 weeks','<i class="fin-key" style="--k:'+FIN_COLORS.cyan+'"></i>Take-home (est.) <i class="fin-key" style="--k:'+FIN_COLORS.orange+'"></i>Logged spending',finLine([{name:'Take-home',color:FIN_COLORS.cyan,values:weekNet},{name:'Spending',color:FIN_COLORS.orange,values:weekSpent}],weekLabels,{label:'Estimated take-home and logged spending for the last 8 weeks'}),FIN_COLORS.cyan),
  finTile('fin-half',linked?'Bank money out · 30 days':'Logged spending · 30 days',linked?'Includes transfers and card payments':'From your expense entries',outByDay.some(v=>v>0)?finBars(outByDay,dayKeys.map(short),FIN_COLORS.orange,{label:'Money out per day for 30 days',every:7}):finEmpty('No spending recorded in the last 30 days.'),FIN_COLORS.orange),
  finTile('fin-third','Hours this week','Daily, unpaid breaks excluded',finBars(days,days.map((_,i)=>plus(thisWeek,i).toLocaleDateString('en-US',{weekday:'short'})),FIN_COLORS.cyan,{height:120,label:'Hours worked each day this week',fmt:v=>v.toFixed(1)+' hrs'}),FIN_COLORS.cyan),
  finTile('fin-third','Where it went · this month','Logged expenses by category',catRows.length?`<ul class="fin-hbars">${catRows.map(([c,v],i)=>`<li><span>${esc(c)}</span><b>${finMoney(v)}</b><i style="width:${v/catMax*100}%;--k:${Object.values(FIN_COLORS)[i%4]}"></i></li>`).join('')}</ul>`:finEmpty('Log expenses to see categories.'),FIN_COLORS.orange),
  finTile('fin-third','Goals',data.goals.length?data.goals.length+' saving':'',data.goals.length?`<div class="fin-rings">${data.goals.slice(0,3).map((g,i)=>finRing(totalSaved(g)/g.target,Object.values(FIN_COLORS)[(i+1)%4],Math.round(totalSaved(g)/g.target*100)+'%',g.name.length>11?g.name.slice(0,10)+'…':g.name)).join('')}</div>`:finEmpty('Create a savings goal to track it here.'),FIN_COLORS.violet),
  finTile('fin-half','Accounts',linked?(bankBusy?'Updating…':last?'Updated '+esc(last):'Not updated yet'):'Read-only via SimpleFIN · experimental',`${linked&&data.bankAccounts.length?`<ul class="fin-list">${data.bankAccounts.map(a=>`<li><span>${esc(a.name)}<small>${esc(a.org)}${a.available!==null&&a.available!==a.balance?' · '+esc(a.currency==='USD'?finMoney(a.available):a.available+' '+a.currency)+' available':''}</small></span><b class="${a.balance<0?'fin-neg':''}">${a.currency==='USD'?finMoney(a.balance):esc(a.balance+' '+a.currency)}</b></li>`).join('')}</ul>`:''}${bankErrors.map(m=>`<p class="fin-warn">${esc(m)}</p>`).join('')}${bankMessage?`<p class="fin-note" role="status">${esc(bankMessage)}</p>`:''}<div class="fin-actions">${linked?`<button id="refreshBank" ${bankBusy?'disabled':''}>${bankBusy?'Updating…':'Refresh'}</button><button id="unlinkBank">Unlink</button>`:`<button id="linkBank">Link bank accounts</button>`}</div>`,FIN_COLORS.magenta),
  finTile('fin-half','Recent bank activity',linked?'Pending items marked':'',txs.length?`<ul class="fin-list">${txs.slice(0,7).map(t=>`<li><span>${esc(t.description)}<small>${new Date(t.posted).toLocaleDateString('en-US',{month:'short',day:'numeric'})}${t.pending?' · pending':''}</small></span><b class="${t.amount<0?'':'fin-pos'}">${t.amount<0?'−':'+'}${finMoney(Math.abs(t.amount))}</b></li>`).join('')}</ul>`:finEmpty(linked?'No transactions downloaded yet.':'Transactions appear here after linking a bank.'),FIN_COLORS.cyan)
 ];
 return `<div class="fin-grid">${tiles.join('')}</div><p class="panel-caption">Take-home figures are estimates. Bank figures come from SimpleFIN and may lag your bank. Not financial advice.</p>`;
}
