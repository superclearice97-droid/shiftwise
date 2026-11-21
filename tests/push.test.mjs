// Phone reminders: encryption, device registration, the reminder queue and scheduled delivery.
process.env.TZ='America/Chicago';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import nodeCrypto,{webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

// Independent receiver-side decryption (RFC 8291) using Node's crypto module.
function decrypt(body,ua,auth){
 const salt=body.subarray(0,16),rs=body.readUInt32BE(16),idlen=body[20],asPublic=body.subarray(21,21+idlen),cipher=body.subarray(21+idlen);
 assert.equal(rs,4096);assert.equal(idlen,65);
 const shared=ua.computeSecret(asPublic),ikm=Buffer.from(nodeCrypto.hkdfSync('sha256',shared,auth,Buffer.concat([Buffer.from('WebPush: info\0'),ua.getPublicKey(),asPublic]),32));
 const cek=Buffer.from(nodeCrypto.hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16)),nonce=Buffer.from(nodeCrypto.hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
 const d=nodeCrypto.createDecipheriv('aes-128-gcm',cek,nonce);d.setAuthTag(cipher.subarray(-16));const plain=Buffer.concat([d.update(cipher.subarray(0,-16)),d.final()]);
 assert.equal(plain.at(-1),2);return plain.subarray(0,-1).toString();
}
const device=()=>{const ua=nodeCrypto.createECDH('prime256v1');ua.generateKeys();return {ua,auth:nodeCrypto.randomBytes(16)}};

// Encryption round trip, size limit and key checks.
const {default:worker}=await import('../dist/server/index.js');
const W=globalThis.WebPushCrypto||(await import('node:vm'),null);
const ctx={crypto:webcrypto,btoa,atob,TextEncoder,Uint8Array,DataView};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/webpush.js','utf8'),ctx);
const encrypt=(...a)=>vm.runInContext('WebPushCrypto.encrypt',ctx)(...a),b64u=vm.runInContext('WebPushCrypto.b64u',ctx);
const phone=device();
assert.equal(decrypt(Buffer.from(await encrypt('{"title":"Shift check-in"}',phone.ua.getPublicKey(),phone.auth)),phone.ua,phone.auth),'{"title":"Shift check-in"}');
assert.equal(decrypt(Buffer.from(await encrypt('é'.repeat(1996),b64u.encode(phone.ua.getPublicKey()),b64u.encode(phone.auth))),phone.ua,phone.auth).length,1996);
await assert.rejects(encrypt('x'.repeat(3994),phone.ua.getPublicKey(),phone.auth),/too long/);
await assert.rejects(encrypt('x',phone.ua.getPublicKey().subarray(1),phone.auth),/Invalid push subscription/);
const a=Buffer.from(await encrypt('same',phone.ua.getPublicKey(),phone.auth)),b=Buffer.from(await encrypt('same',phone.ua.getPublicKey(),phone.auth));
assert(!a.equals(b),'each message uses a fresh key and salt');

// D1 stand-in backed by real SQLite with the project's migrations.
const sqlite=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const stmt of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint'))sqlite.exec(stmt);
const stmt=(sql,args=[])=>({sql,args,bind:(...v)=>stmt(sql,v),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})});
const DB={prepare:sql=>stmt(sql),batch:async list=>{sqlite.exec('BEGIN');try{for(const s of list)sqlite.prepare(s.sql).run(...s.args);sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const vapid=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await webcrypto.subtle.exportKey('jwk',vapid.privateKey);
const env={DB,VAPID_PRIVATE_KEY:JSON.stringify({kty:'EC',crv:'P-256',d:jwk.d,x:jwk.x,y:jwk.y})};

// Fake push service: records deliveries, checks the VAPID signature and decrypts the body.
const sent=[];let reply=201;
globalThis.fetch=async(url,init)=>{
 const auth=init.headers.authorization,[,token,k]=auth.match(/^vapid t=([^,]+), k=(.+)$/),[h,p,s]=token.split('.');
 const key=await webcrypto.subtle.importKey('raw',b64u.decode(k),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,b64u.decode(s),new TextEncoder().encode(h+'.'+p)),'VAPID signature verifies');
 const claims=JSON.parse(Buffer.from(p,'base64url'));assert.equal(claims.aud,new URL(url).origin);assert.equal(claims.sub,'https://app.test');assert(claims.exp>Date.now()/1000&&claims.exp<=Date.now()/1000+86400);
 assert.equal(init.headers['content-encoding'],'aes128gcm');assert.equal(init.redirect,'manual');
 sent.push({url,text:decrypt(Buffer.from(init.body),phone.ua,phone.auth)});return new Response(null,{status:reply});
};
const call=(method,body,{user='owner',origin='https://app.test'}={})=>worker.fetch(new Request('https://app.test/api/push',{method,headers:{'oai-authenticated-user-id':user,...(origin?{origin}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
const endpoint='https://web.push.apple.com/QGuQyavXutnMH9e-test';
const item=async(at,text='{"title":"Shift check-in","body":"Worked Mon 6:00 AM–2:30 PM?"}')=>({at,payload:b64u.encode(await encrypt(text,phone.ua.getPublicKey(),phone.auth))});

// Sign-in, configuration, origin and push-service checks.
assert.equal((await worker.fetch(new Request('https://app.test/api/push'),env)).status,401);
const key=await (await call('GET')).json();assert.equal(key.publicKey,b64u.encode(Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')])));
assert.equal((await worker.fetch(new Request('https://app.test/api/push',{headers:{'oai-authenticated-user-id':'owner'}}),{DB})).status,503);
assert.equal((await call('POST',{endpoint},{origin:'https://evil.test'})).status,403);
for(const bad of ['http://web.push.apple.com/x','https://169.254.169.254/latest','https://web.push.apple.com.evil.test/x','https://user:pw@fcm.googleapis.com/x','https://web.push.apple.com:8443/x','https://example.com/push'])
 assert.equal((await call('POST',{endpoint:bad})).status,400,bad);

// Register, queue reminders, deliver a due one immediately and keep future ones.
assert.equal((await call('PUT',{endpoint,items:[]})).status,404);
assert.equal((await call('POST',{endpoint})).status,200);assert.equal((await call('POST',{endpoint})).status,200);
assert.equal((await call('POST',{endpoint},{user:'intruder'})).status,409);
assert.equal((await call('PUT',{endpoint,items:[]},{user:'intruder'})).status,409);
for(const items of [[{at:Date.now(),payload:'short'}],[{at:Date.now()+50*86400000,payload:(await item(Date.now())).payload}],[{at:'soon',payload:(await item(Date.now())).payload}],Array(61).fill(await item(Date.now()+60000))])
 assert.equal((await call('PUT',{endpoint,items})).status,400);
const future=Date.now()+3600000;
const r=await call('PUT',{endpoint,items:[await item(Date.now(),'{"title":"Shiftwise","body":"Notifications are working."}'),await item(future)]});
assert.equal(r.status,200);assert.equal(sent.length,1);assert.equal(sent[0].url,endpoint);assert.match(sent[0].text,/Notifications are working/);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_queue').get().n,1);
// The server never stores readable reminder text.
assert(!JSON.stringify(sqlite.prepare('SELECT * FROM push_queue').all()).includes('Shift check-in'));

// The scheduled run sends reminders once they are due.
await worker.scheduled({},env,{waitUntil:p=>p});await new Promise(r=>setTimeout(r,10));assert.equal(sent.length,1);
sqlite.prepare('UPDATE push_queue SET send_at = ?').run(Date.now()-1000);
let pending;await worker.scheduled({},env,{waitUntil:p=>pending=p});await pending;
assert.equal(sent.length,2);assert.match(sent[1].text,/Worked Mon/);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_queue').get().n,0);

// Temporary push-service errors are retried; reminders over an hour late are dropped.
reply=503;await call('PUT',{endpoint,items:[await item(Date.now())]});assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_queue').get().n,1);
sqlite.prepare('UPDATE push_queue SET send_at = ?').run(Date.now()-3700000);await worker.scheduled({},env,{waitUntil:p=>pending=p});await pending;
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_queue').get().n,0);

// A push address reported gone is forgotten with its queue.
reply=410;await call('PUT',{endpoint,items:[await item(Date.now()),await item(Date.now()+1000)]});
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_queue').get().n,0);
reply=201;

// Device limit, and turning reminders off removes the device and its queue.
for(let i=0;i<5;i++)assert.equal((await call('POST',{endpoint:endpoint+i})).status,200);
assert.equal((await call('POST',{endpoint:endpoint+'6'})).status,409);
await call('PUT',{endpoint:endpoint+'0',items:[await item(future)]});
assert.equal((await call('DELETE',{endpoint:endpoint+'0'})).status,200);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_queue').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,4);

// Client: reminders 10 minutes after each upcoming planned shift, encrypted to this phone's subscription.
const elements=new Map(),el=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',hidden:false,style:{setProperty(){}},dataset:{},classList:{toggle(){},add(){},remove(){}},querySelector:()=>({disabled:false})});return elements.get(k)};
const puts=[];const subscription={endpoint,getKey:n=>n==='p256dh'?phone.ua.getPublicKey().buffer.slice(phone.ua.getPublicKey().byteOffset):phone.auth,options:{}};
const app={console,document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},body:{classList:{toggle(){},add(){},remove(){}}},documentElement:{dataset:{},style:{setProperty(){}}},visibilityState:'visible'},navigator:{onLine:true,userAgent:'test',serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>subscription}})}},window:{addEventListener(){},matchMedia:()=>({matches:false})},crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,location:{href:'https://app.test/',reload(){}},matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>0,clearTimeout(){},setInterval(){},Date,Intl,AbortController,Blob,URL,DataView,Uint8Array,
 fetch:async(url,init)=>{puts.push(JSON.parse(init.body));return new Response('{"ok":true}',{headers:{'content-type':'application/json'}})}};
vm.createContext(app);
for(const f of ['deal-api.js','core.js','crypto.js','storage.js','app.js','features.js','investments.js','discounts.js','offers.js','sync.js','experience.js','restock.js','schedule.js','webpush.js','notify.js','connections.js'])vm.runInContext(fs.readFileSync('public/'+f,'utf8'),app);
const run=c=>vm.runInContext(c,app);
run("data=normalize({schedule:[{id:'mon',day:1,start:'06:00',end:'14:30',break:30,since:'2026-11-01'}],scheduleAdjust:[{id:'p',name:'Peak',from:'2026-11-23',to:'2026-12-31',startShift:-60,endShift:0}]});ready=true;vaultKey={};pushState='on'");
const msgs=JSON.parse(run("JSON.stringify(pushMessages(new Date('2026-11-23T10:00:00')))"));
assert.equal(msgs.length,4);assert.equal(new Date(msgs[0].at).toString().slice(16,21),'14:40');assert.equal(msgs[0].body,'Worked Mon 5:00 AM–2:30 PM? Tap to confirm.');assert.equal(msgs[0].url,'/?tab=shifts');
// Already logged (or clocked in) over the shift: no reminder for it.
run("data.shifts=[{id:'t',start:new Date('2026-11-23T05:02:00').toISOString(),end:new Date('2026-11-23T14:31:00').toISOString(),break:30}]");
assert.equal(JSON.parse(run("JSON.stringify(pushMessages(new Date('2026-11-23T10:00:00')))")).length,3);run('data.shifts=[]');
await run('syncPushQueue()');assert.equal(puts.length,1);assert.equal(puts[0].endpoint,endpoint);
assert(puts[0].items.length>=2&&puts[0].items.every(x=>Number.isInteger(x.at)));
const first=JSON.parse(decrypt(Buffer.from(puts[0].items[0].payload,'base64url'),phone.ua,phone.auth));assert.equal(first.title,'Shift check-in');assert.equal(first.url,'/?tab=shifts');
await run('syncPushQueue()');assert.equal(puts.length,1,'unchanged reminders are not re-sent');
await run('syncPushQueue(true)');assert.equal(puts.length,2);assert.match(decrypt(Buffer.from(puts[1].items[0].payload,'base64url'),phone.ua,phone.auth),/Notifications are working/);
run("vaultKey=null");await run('syncPushQueue(true)');assert.equal(puts.length,2,'nothing is sent while locked');
// The device apps never offer server reminders.
run("vaultKey={};window.SHIFTWISE_DEVICE=true");assert.equal(run('pushControls()'),'');
