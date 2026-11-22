/* Opt-in phone reminders after each planned shift (hosted website only, Home Screen app on iPhone).
   Reminder text is encrypted on this device to its own push subscription before upload; the server
   keeps this device's push address, the send times and ciphertext. */
let pushState='unknown',pushLastQueue='',pushBusy=false;
const PUSH_REMIND_AFTER_MINUTES=10,PUSH_DAYS_AHEAD=21;
const pushSupported=()=>!window.SHIFTWISE_DEVICE&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const pushNeedsHomeScreen=()=>/iPhone|iPad/.test(navigator.userAgent)&&!(navigator.standalone||matchMedia('(display-mode: standalone)').matches);
async function pushSubscription(){const reg=await navigator.serviceWorker.getRegistration();return reg?reg.pushManager.getSubscription():null}
async function pushApi(method,body){
 const r=await fetch('/api/push',{method,cache:'no-store',credentials:'same-origin',headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const out=r.headers.get('content-type')?.includes('application/json')?await r.json():{error:'Sign in again to manage notifications.'};
 if(!r.ok)throw Error(out.error||'Notifications are unavailable.');return out;
}
// Reminders for planned shifts that haven't ended yet and aren't already logged.
function pushMessages(now=new Date()){
 const time=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),day=d=>d.toLocaleDateString('en-US',{weekday:'short'});
 return plannedShifts(plus(now,-1),plus(now,PUSH_DAYS_AHEAD)).filter(o=>o.end>now&&!plannedResolved(o)).slice(0,59)
  .map(o=>({at:+o.end+PUSH_REMIND_AFTER_MINUTES*60000,title:'Shift check-in',body:`Worked ${day(o.start)} ${time(o.start)}–${time(o.end)}? Tap to confirm.`,url:'/?tab=shifts',tag:o.id}));
}
async function syncPushQueue(test=false){
 if(pushState!=='on'||!ready||!vaultKey||!data.schedule)return;
 const sub=await pushSubscription();if(!sub){pushState='off';updatePushControls();return}
 const messages=pushMessages(),fingerprint=sub.endpoint+JSON.stringify(messages.map(m=>[m.at,m.body]));
 if(!test&&fingerprint===pushLastQueue)return;
 const all=test?[{at:Date.now(),title:'Shiftwise',body:'Notifications are working.',url:'/?tab=shifts',tag:'test'},...messages]:messages;
 const items=await Promise.all(all.map(async m=>({at:m.at,payload:WebPushCrypto.b64u.encode(await WebPushCrypto.encrypt(JSON.stringify({title:m.title,body:m.body,url:m.url,tag:m.tag}),sub.getKey('p256dh'),sub.getKey('auth')))})));
 await pushApi('PUT',{endpoint:sub.endpoint,items});pushLastQueue=fingerprint;
}
async function enablePush(){
 // Must be the first call in the tap handler: iOS only asks for permission in response to a tap.
 const permission=await Notification.requestPermission();
 if(permission!=='granted'){pushState='denied';throw Error('Notifications are blocked. Allow them in iPhone Settings → Notifications → Shiftwise.')}
 const {publicKey}=await pushApi('GET'),reg=await navigator.serviceWorker.ready;
 let sub=await reg.pushManager.getSubscription();
 if(sub&&sub.options.applicationServerKey&&WebPushCrypto.b64u.encode(sub.options.applicationServerKey)!==publicKey){await sub.unsubscribe();sub=null}
 sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:WebPushCrypto.b64u.decode(publicKey)});
 await pushApi('POST',{endpoint:sub.endpoint});pushState='on';pushLastQueue='';await syncPushQueue();
}
async function disablePush(){const sub=await pushSubscription();if(sub){try{await pushApi('DELETE',{endpoint:sub.endpoint})}finally{await sub.unsubscribe()}}pushState='off';pushLastQueue=''}
function pushControls(){
 if(!pushSupported()||pushState==='unknown')return '';
 if(pushNeedsHomeScreen())return '<p class="sub">To get a reminder after each shift, add Shiftwise to your Home Screen (Share → Add to Home Screen) and open it from there.</p>';
 if(pushState==='on')return '<span class="pill">🔔 Reminders on</span> <button id="pushTest">Send test</button> <button id="pushOff">Turn off reminders</button>';
 if(pushState==='denied'||Notification.permission==='denied')return '<p class="sub">Notifications are blocked. Allow them in iPhone Settings → Notifications → Shiftwise.</p>';
 return `<button id="pushOn">🔔 Remind me after each shift</button><p class="sub">Your phone gets a notification ${PUSH_REMIND_AFTER_MINUTES} minutes after each planned shift ends. The reminder text is encrypted on this phone; Shiftwise's server stores only your phone's push address, the reminder times and that encrypted text, and Apple delivers it.</p>`;
}
function updatePushControls(){const el=document.querySelector('#pushControls');if(el)el.innerHTML=pushControls()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!ready||!['pushOn','pushOff','pushTest'].includes(b.id)||pushBusy)return;
 pushBusy=true;const task=b.id==='pushOn'?enablePush().then(()=>'Reminders on.'):b.id==='pushOff'?disablePush().then(()=>'Reminders off. Shiftwise removed this phone\'s queued reminders.'):syncPushQueue(true).then(()=>'Test sent. It should arrive within a minute.');
 task.then(toast,err=>toast(err.message||'Notifications are unavailable.')).finally(()=>{pushBusy=false;updatePushControls()});
});
window.addEventListener('load',()=>{
 if(!pushSupported())return;
 pushSubscription().then(sub=>{pushState=sub&&Notification.permission==='granted'?'on':'off';updatePushControls();syncPushQueue().catch(()=>{})},()=>{pushState='off'});
 navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='OPEN_TAB'&&e.data.tab==='shifts'&&ready)switchWorkspaceTab('shifts')});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncPushQueue().catch(()=>{})});
 setInterval(()=>syncPushQueue().catch(()=>{}),60000);
});
