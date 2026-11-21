// Usual schedule, date-range changes (peak season) and one-tap shift check-ins.
process.env.TZ='America/Chicago';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const elements=new Map(),classes={toggle(){},add(){},remove(){}};
const el=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',hidden:false,open:false,style:{setProperty(){}},dataset:{},classList:classes,append(){},showModal(){this.open=true},close(){this.open=false},querySelector:()=>({disabled:false})});return elements.get(key)};
const clicks=[],document={querySelector:el,querySelectorAll:()=>[],addEventListener(type,fn){if(type==='click')clicks.push(fn)},body:{classList:classes},documentElement:{dataset:{},style:{setProperty(){}}},visibilityState:'visible'};
class TestFormData{constructor(form){this.v=form._values||{}}get(k){return this.v[k]??null}has(k){return k in this.v}}
const sandbox={console,document,navigator:{onLine:true},window:{addEventListener(){},matchMedia:()=>({matches:false})},crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,location:{href:'https://app.test/',reload(){}},matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>0,clearTimeout(){},setInterval(){},Date,Intl,AbortController,FormData:TestFormData,Blob,URL,confirm:()=>true};
vm.createContext(sandbox);
for(const file of ['deal-api.js','core.js','crypto.js','storage.js','app.js','features.js','investments.js','discounts.js','offers.js','sync.js','experience.js','restock.js','schedule.js','connections.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),sandbox);
const run=code=>vm.runInContext(code,sandbox),J=code=>JSON.parse(run(`JSON.stringify(${code})`));
run('data=normalize({});ready=true;save=()=>{};render=()=>{};toast=()=>{}');
const local=(s)=>run(`(d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'))(${s})`);
function submit(values){const form=el('#form');form._values=values;let error='';el('#formError').textContent='';form.onsubmit({preventDefault(){},target:form});error=el('#formError').textContent;return error}
const click=b=>{for(const fn of clicks)fn({target:{closest:()=>({id:'',dataset:{},...b})}})};

// Usual schedule: Monday 06:00–14:30 with a 30-minute break, and a Friday overnight 22:00–06:00.
run("scheduleModal()");
const days={};for(let d=0;d<7;d++)days['start'+d]='09:00',days['end'+d]='17:30',days['break'+d]='30';
assert.match(submit({...days,on1:'on',start1:'06:00',end1:'06:00'}),/must differ/);
assert.match(submit({...days,on1:'on',start1:'06:00',end1:'06:20',break1:'30'}),/break must be shorter/);
assert.equal(submit({...days,on1:'on',start1:'06:00',end1:'14:30',on5:'on',start5:'22:00',end5:'06:00',break5:'0'}),'');
assert.equal(run('data.schedule.length'),2);assert(run('ShiftwiseCore.valid(data)'));
run("data.schedule.forEach(t=>t.since='2026-11-01')");

// Planned shifts for a week, including the overnight one ending the next morning.
const week=run("plannedShifts(new Date('2026-11-15T00:00:00'),new Date('2026-11-22T00:00:00'))");
assert.deepEqual([...week.map(o=>o.id.slice(0,10))],['2026-11-16','2026-11-20']);
assert.equal(local("plannedShifts(new Date('2026-11-16T00:00:00'),new Date('2026-11-17T00:00:00'))[0].start"),'2026-11-16 06:00');
assert.equal(local("plannedShifts(new Date('2026-11-20T00:00:00'),new Date('2026-11-21T00:00:00'))[0].end"),'2026-11-21 06:00');

// Nothing is planned before the schedule existed.
assert.equal(run("plannedShifts(new Date('2026-10-25T00:00:00'),new Date('2026-11-01T00:00:00')).length"),0);

// Clock change: the overnight shift spanning the end of daylight saving (Nov 1 2026) counts real hours worked.
run("data.schedule.find(t=>t.day===5).since='2026-10-01'");
const dst=run("(o=>({hours:hoursBetween(o,o.start,o.end)}))(plannedShifts(new Date('2026-10-30T00:00:00'),new Date('2026-10-31T00:00:00'))[0])");
assert.equal(run("plannedShifts(new Date('2026-10-31T00:00:00'),new Date('2026-11-01T00:00:00')).length"),0);
assert.equal(dst.hours,8);
run("data.schedule.forEach(t=>t.since='2026-11-01')");

// Peak season: start one hour earlier, same end time, from Nov 23 to Dec 31.
run('scheduleChangeModal()');
assert.match(submit({name:'Peak',from:'2026-11-30',to:'2026-11-23',startDir:'-1',startBy:'1',endDir:'0',endBy:'1'}),/on or after/);
assert.match(submit({name:'Peak',from:'2026-11-23',to:'2026-12-31',startDir:'0',startBy:'1',endDir:'0',endBy:'1'}),/Choose an earlier or later/);
assert.match(submit({name:'Peak',from:'2026-11-23',to:'2026-12-31',startDir:'1',startBy:'8',endDir:'0',endBy:'0'}),/too short/);
assert.equal(submit({name:'Peak',from:'2026-11-23',to:'2026-12-31',startDir:'-1',startBy:'1',endDir:'0',endBy:'1'}),'');
assert.deepEqual(J('data.scheduleAdjust.map(({name,from,to,startShift,endShift})=>({name,from,to,startShift,endShift}))'),[{name:'Peak',from:'2026-11-23',to:'2026-12-31',startShift:-60,endShift:0}]);
assert(run('ShiftwiseCore.valid(data)'));
run('scheduleChangeModal()');
assert.match(submit({name:'Overlap',from:'2026-12-20',to:'2027-01-05',startDir:'-1',startBy:'1',endDir:'0',endBy:'1'}),/overlaps/);
const peakMonday=run("plannedShifts(new Date('2026-11-23T00:00:00'),new Date('2026-11-24T00:00:00'))[0]");
assert.equal(local("plannedShifts(new Date('2026-11-23T00:00:00'),new Date('2026-11-24T00:00:00'))[0].start"),'2026-11-23 05:00');
assert.equal(local("plannedShifts(new Date('2026-11-23T00:00:00'),new Date('2026-11-24T00:00:00'))[0].end"),'2026-11-23 14:30');
assert.equal(peakMonday.change,'Peak');
assert.equal(local("plannedShifts(new Date('2027-01-04T00:00:00'),new Date('2027-01-05T00:00:00'))[0].start"),'2027-01-04 06:00');

// Check-ins: after Monday Nov 23 ends, it (and the earlier unconfirmed shifts) await confirmation; future ones do not.
const now="new Date('2026-11-23T15:00:00')";
assert.deepEqual(J(`pendingCheckins(${now}).map(o=>o.id.slice(0,10))`),['2026-11-09','2026-11-13','2026-11-16','2026-11-20','2026-11-23']);
// It looks back 14 days at most.
assert.deepEqual(J(`pendingCheckins(new Date('2026-12-07T15:00:00')).map(o=>o.id.slice(0,10))`)[0],'2026-11-23');
run(`pendingCheckins(${now}).slice(0,2).forEach(o=>markPlanned(o.id,'skipped'))`);
assert.deepEqual(J(`pendingCheckins(${now}).map(o=>o.id.slice(0,10))`),['2026-11-16','2026-11-20','2026-11-23']);
// A shift already logged by hand over the planned time resolves it without asking.
run("data.shifts.push({id:'manual',start:new Date('2026-11-16T06:10:00').toISOString(),end:new Date('2026-11-16T14:00:00').toISOString(),break:0})");
assert.deepEqual(J(`pendingCheckins(${now}).map(o=>o.id.slice(0,10))`),['2026-11-20','2026-11-23']);
// One tap logs it with the planned times and break.
run(`confirmPlanned(pendingCheckins(${now}).at(-1))`);
const logged=run("data.shifts.at(-1)");
assert.equal(local(`new Date('${logged.start}')`),'2026-11-23 05:00');assert.equal(logged.break,30);
assert.equal(run(`hoursBetween(data.shifts.at(-1),new Date('2026-11-23'),new Date('2026-11-24'))`),9);
assert.deepEqual(J(`pendingCheckins(${now}).map(o=>o.id.slice(0,10))`),['2026-11-20']);
assert.throws(()=>run(`confirmPlanned(plannedShifts(new Date('2026-11-23T00:00:00'),new Date('2026-11-24T00:00:00'))[0])`),/already covers/);
// Didn't work: no shift is created and it stops asking.
const count=run('data.shifts.length');run(`markPlanned(pendingCheckins(${now})[0].id,'skipped')`);
assert.equal(run('data.shifts.length'),count);assert.equal(run(`pendingCheckins(${now}).length`),0);
assert(run('ShiftwiseCore.valid(data)'));

// Adjust opens the shift form prefilled; saving logs the edited times and resolves the check-in.
run("data.scheduleDone=[];data.shifts=[]");
const target=run(`pendingCheckins(${now})[0].id`);
run(`shiftModal(null,{...pendingCheckins(${now})[0],done:()=>markPlanned('${target}','worked')})`);
assert.equal(submit({start:'2026-11-16T06:00',end:'2026-11-16T15:30',break:'30'}),'');
assert.equal(run(`hoursBetween(data.shifts[0],new Date('2026-11-16'),new Date('2026-11-17'))`),9);
assert(run(`data.scheduleDone.some(x=>x.id==='${target}'&&x.status==='worked')`));

// The selected week's projection adds planned, unconfirmed hours to logged hours.
run("week=new Date('2026-11-15T00:00:00')");
const p=run('weekProjection()');
assert.equal(p.logged,9);assert.equal(p.planned.length,1);assert.equal(p.extra,8);assert.equal(p.total,17);

// Validation rejects malformed schedule records from sync or backups.
for(const bad of [
 {schedule:[{id:'a',day:7,start:'06:00',end:'14:00',break:0,since:'2026-11-01'}]},
 {schedule:[{id:'a',day:1,start:'6:00',end:'14:00',break:0,since:'2026-11-01'}]},
 {schedule:[{id:'a',day:1,start:'06:00',end:'06:30',break:30,since:'2026-11-01'}]},
 {scheduleAdjust:[{id:'b',name:'Peak',from:'2026-12-01',to:'2026-11-01',startShift:-60,endShift:0}]},
 {scheduleAdjust:[{id:'b',name:'Peak',from:'2026-11-01',to:'2026-12-01',startShift:-900,endShift:0}]},
 {scheduleDone:[{id:'2026-11-01:a',status:'maybe'}]}
])assert.equal(run(`ShiftwiseCore.valid(normalize(${JSON.stringify(bad)}))`),false,JSON.stringify(bad));

// Two devices editing the schedule merge record by record.
const merged=run(`ShiftwiseCore.merge({schedule:[]},{schedule:[{id:'mon'}]},{schedule:[{id:'fri'}]})`);
assert.deepEqual([...merged.data.schedule.map(x=>x.id).sort()],['fri','mon']);assert.equal(merged.conflicts.length,0);

// Card renders with a peak note and one-tap buttons.
run("data.scheduleDone=[]");
const html=run('scheduleCard()');assert.match(html,/Edit usual schedule/);assert.match(html,/Peak: Nov 23 – Dec 31 · start 1 hr earlier/);

// "Confirm all" through the real click handler logs every pending shift up to now.
run("data.scheduleDone=[];data.shifts=[]");
const pendingNow=run('pendingCheckins().length');assert(pendingNow>0);
click({id:'confirmAllPlanned'});
assert.equal(run('data.shifts.length'),pendingNow);assert.equal(run('pendingCheckins().length'),0);assert(run('ShiftwiseCore.valid(data)'));
