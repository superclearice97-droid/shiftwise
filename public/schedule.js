/* Usual weekly schedule, date-range changes (such as peak season) and one-tap check-ins after each planned shift. */
const SCHEDULE_LOOKBACK_DAYS=14,SCHEDULE_DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],TIME_RE=/^([01]\d|2[0-3]):[0-5]\d$/;
const hhmm=t=>t.split(':').map(Number),shiftMinutes=(start,end)=>{const [sh,sm]=hhmm(start),[eh,em]=hhmm(end);return ((eh*60+em)-(sh*60+sm)+1440)%1440};
function scheduleChangeFor(key){return data.scheduleAdjust.find(a=>a.from<=key&&key<=a.to)}
// Planned shifts that start on dates in [from, to), with any date-range change applied.
function plannedShifts(from,to){
 const out=[];const day=new Date(from);day.setHours(0,0,0,0);
 for(;day<to;day.setDate(day.getDate()+1)){
  const key=datekey(day),change=scheduleChangeFor(key);
  for(const t of data.schedule){
   if(t.day!==day.getDay()||key<t.since)continue;
   const [sh,sm]=hhmm(t.start),[eh,em]=hhmm(t.end);
   let start=new Date(day.getFullYear(),day.getMonth(),day.getDate(),sh,sm),end=new Date(day.getFullYear(),day.getMonth(),day.getDate(),eh,em);
   if(end<=start)end=plus(end,1);
   if(change){start=new Date(+start+change.startShift*60000);end=new Date(+end+change.endShift*60000)}
   const length=(end-start)/60000;if(length<=t.break||length>1440)continue;
   out.push({id:key+':'+t.id,start,end,break:t.break,change:change?.name||''});
  }
 }
 return out.sort((a,b)=>a.start-b.start);
}
function plannedLogged(o){return allShifts().some(s=>+new Date(s.start)<+o.end&&+new Date(s.end)>+o.start)}
function plannedResolved(o){return data.scheduleDone.some(x=>x.id===o.id)||plannedLogged(o)}
function pendingCheckins(now=new Date()){return plannedShifts(plus(now,-SCHEDULE_LOOKBACK_DAYS),plus(now,1)).filter(o=>o.end<=now&&!plannedResolved(o))}
function markPlanned(id,status){const cutoff=datekey(plus(new Date(),-60));data.scheduleDone=data.scheduleDone.filter(x=>x.id!==id&&x.id.slice(0,10)>=cutoff);data.scheduleDone.push({id,status})}
function confirmPlanned(o){if(plannedLogged(o))throw Error('A logged shift already covers this time.');data.shifts.push({id:uid(),start:o.start.toISOString(),end:o.end.toISOString(),break:o.break});markWeekUnreviewed(o.start);markPlanned(o.id,'worked')}
// Hours for the selected week: logged shifts plus planned shifts not yet confirmed or skipped.
function weekProjection(){const planned=plannedShifts(week,plus(week,7)).filter(o=>!plannedResolved(o)),extra=planned.reduce((n,o)=>n+hoursBetween(o,week,plus(week,7)),0),logged=hours();return {planned,logged,extra,total:logged+extra}}
function describeChange(a){const part=(m,what)=>m?`${what} ${+(Math.abs(m)/60).toFixed(2)} hr ${m<0?'earlier':'later'}`:'',d=k=>new Date(k+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});return `${a.name}: ${d(a.from)} – ${d(a.to)} · ${[part(a.startShift,'start'),part(a.endShift,'end')].filter(Boolean).join(', ')}`}
function scheduleCard(){
 if(!data.schedule)return '';
 if(!data.schedule.length)return `<div class="card schedule-card"><div class="card-head"><div><h2>Set your usual schedule once</h2><div class="sub">Shiftwise then asks you to confirm each shift with one tap, so you don't have to type it in.</div></div><button class="primary" id="editSchedule">Set schedule</button></div></div>`;
 const now=new Date(),time=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),day=d=>d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
 const pending=pendingCheckins(now),next=plannedShifts(now,plus(now,8)).find(o=>o.start>now&&!plannedResolved(o)),p=weekProjection(),changes=data.scheduleAdjust.filter(a=>a.to>=datekey(now)).sort((a,b)=>a.from<b.from?-1:1);
 const label=o=>`${day(o.start)} · ${time(o.start)}–${time(o.end)}${o.break?` · ${o.break}m break`:''}${o.change?` · ${esc(o.change)}`:''}`;
 return `<div class="card schedule-card"><div class="card-head"><div><h2>${pending.length?`${pending.length} shift${pending.length>1?'s':''} to confirm`:'Shifts confirmed'}</h2><div class="sub">${next?`Next shift: ${label(next)}`:'No shifts planned in the next week.'}</div></div>${pending.length>1?`<button class="primary" id="confirmAllPlanned">✓ Confirm all ${pending.length}</button>`:''}</div>
 ${pending.length?`<ul class="checkins">${pending.map(o=>`<li><span>Worked ${label(o)}?</span><span class="actions"><button class="primary" data-plannedok="${esc(o.id)}">✓ Yes</button><button data-plannedadjust="${esc(o.id)}">Adjust</button><button data-plannedskip="${esc(o.id)}">Didn't work</button></span></li>`).join('')}</ul>`:''}
 <div class="insight">Selected week: ${p.logged.toFixed(1)} h logged${p.planned.length?` + ${p.extra.toFixed(1)} h scheduled, not yet confirmed`:''} ≈ ${p.total.toFixed(1)} h · estimated take-home ${money(calc(p.total).net)}.</div>
 ${changes.length?`<ul class="schedule-changes">${changes.map(a=>`<li>${esc(describeChange(a))} <button data-deladjust="${esc(a.id)}" aria-label="Remove schedule change">×</button></li>`).join('')}</ul>`:''}
 <div class="actions"><button id="editSchedule">Edit usual schedule</button><button id="addScheduleChange">＋ Date-range change (e.g. peak)</button></div></div>`;
}
function scheduleModal(){
 const order=Array.from({length:7},(_,i)=>(i+(data.settings.weekStart??0))%7);
 modal('Your usual weekly schedule',`<p class="sub">Tick the days you usually work. An end time earlier than the start means the shift ends the next morning.</p>${order.map(d=>{const t=data.schedule.find(x=>x.day===d);return `<fieldset class="schedule-day"><legend><label><input type="checkbox" name="on${d}" ${t?'checked':''}> ${SCHEDULE_DAYS[d]}</label></legend><div class="form-grid"><label>Start<input name="start${d}" type="time" value="${t?.start||'09:00'}"></label><label>End<input name="end${d}" type="time" value="${t?.end||'17:30'}"></label><label>Unpaid break (min)<input name="break${d}" type="number" min="0" max="600" step="1" value="${t?.break??30}"></label></div></fieldset>`}).join('')}`,f=>{
  const today=datekey(new Date()),next=[];
  for(const d of order){
   if(!f.has('on'+d))continue;const start=String(f.get('start'+d)),end=String(f.get('end'+d)),br=+f.get('break'+d);
   if(!TIME_RE.test(start)||!TIME_RE.test(end))throw Error(SCHEDULE_DAYS[d]+': enter a start and end time.');
   if(start===end)throw Error(SCHEDULE_DAYS[d]+': the end time must differ from the start.');
   if(!Number.isInteger(br)||br<0||br>=shiftMinutes(start,end))throw Error(SCHEDULE_DAYS[d]+': the unpaid break must be shorter than the shift.');
   const old=data.schedule.find(x=>x.day===d);
   next.push(old&&old.start===start&&old.end===end&&old.break===br?old:{id:uid(),day:d,start,end,break:br,since:today});
  }
  data.schedule=next;
 });
}
function scheduleChangeModal(){
 const today=datekey(new Date()),dir=(name,selected)=>`<select name="${name}">${[['-1','Earlier'],['0','Same'],['1','Later']].map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${l}</option>`).join('')}</select>`;
 modal('Schedule change for a date range',`<p class="sub">For example peak season, when you start earlier than usual. It applies to your usual shifts between these dates.</p><label>Name<input name="name" maxlength="60" value="Peak season" required></label><div class="form-grid"><label>First day<input name="from" type="date" value="${today}" required></label><label>Last day<input name="to" type="date" value="${today}" required></label></div><div class="form-grid"><label>Start time${dir('startDir','-1')}</label><label>By (hours)<input name="startBy" type="number" min="0" max="12" step="0.25" value="1"></label></div><div class="form-grid"><label>End time${dir('endDir','0')}</label><label>By (hours)<input name="endBy" type="number" min="0" max="12" step="0.25" value="1"></label></div>`,f=>{
  const name=String(f.get('name')).trim(),from=String(f.get('from')),to=String(f.get('to')),by=(d,b)=>Math.round(Math.sign(+f.get(d))*+f.get(b)*60)||0,startShift=by('startDir','startBy'),endShift=by('endDir','endBy');
  if(!name)throw Error('Name this change, for example "Peak season".');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from)throw Error('The last day must be on or after the first day.');
  if(!Number.isInteger(startShift)||!Number.isInteger(endShift)||Math.abs(startShift)>720||Math.abs(endShift)>720)throw Error('Changes can be up to 12 hours.');
  if(!startShift&&!endShift)throw Error('Choose an earlier or later start or end time.');
  if(data.scheduleAdjust.some(a=>a.from<=to&&from<=a.to))throw Error('This overlaps another schedule change. Remove that one first.');
  for(const t of data.schedule){const length=shiftMinutes(t.start,t.end)-startShift+endShift;if(length<=t.break||length>1440)throw Error(`This would make your ${SCHEDULE_DAYS[t.day]} shift too short or longer than 24 hours.`)}
  data.scheduleAdjust.push({id:uid(),name,from,to,startShift,endShift});
 });
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!ready||!data.schedule)return;
 const find=id=>pendingCheckins().find(o=>o.id===id);
 if(b.id==='editSchedule')scheduleModal();
 if(b.id==='addScheduleChange')scheduleChangeModal();
 if(b.dataset.plannedok){const o=find(b.dataset.plannedok);if(!o)return;try{confirmPlanned(o);save();render();toast('Shift logged.')}catch(err){toast(err.message)}}
 if(b.id==='confirmAllPlanned'){const list=pendingCheckins();for(const o of list)confirmPlanned(o);save();render();toast(list.length+' shifts logged.')}
 if(b.dataset.plannedadjust){const o=find(b.dataset.plannedadjust);if(o)shiftModal(null,{...o,done:()=>markPlanned(o.id,'worked')})}
 if(b.dataset.plannedskip){const o=find(b.dataset.plannedskip);if(!o)return;markPlanned(o.id,'skipped');save();render();toast('Marked as not worked.')}
 if(b.dataset.deladjust&&confirm('Remove this schedule change?')){data.scheduleAdjust=data.scheduleAdjust.filter(a=>a.id!==b.dataset.deladjust);save();render()}
});
