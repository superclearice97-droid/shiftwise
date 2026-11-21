/* Phone notifications (Web Push). The browser uploads reminders already encrypted to its own push
   subscription (public/webpush.js). The server stores the device's push address, send times and
   ciphertext, signs a VAPID token and delivers due reminders; it never sees reminder text. */
const PUSH_HOSTS=['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'],PUSH_MAX_DEVICES=5,PUSH_MAX_ITEMS=60;
function pushEndpointOk(value){if(typeof value!=='string'||value.length>1000)return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(PUSH_HOSTS.includes(u.hostname)||u.hostname.endsWith('.notify.windows.com'))}catch{return false}}
async function sha256hex(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
let vapidCache=null;
async function vapidKeys(env){
 if(vapidCache&&vapidCache.raw===env.VAPID_PRIVATE_KEY)return vapidCache;
 let jwk;try{jwk=JSON.parse(env.VAPID_PRIVATE_KEY||'')}catch{}
 if(jwk?.kty!=='EC'||jwk.crv!=='P-256'||!jwk.d||!jwk.x||!jwk.y)throw Error('Notifications are not configured on this server yet.');
 const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',d:jwk.d,x:jwk.x,y:jwk.y,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const b=WebPushCrypto.b64u,publicKey=b.encode(new Uint8Array([4,...b.decode(jwk.x),...b.decode(jwk.y)]));
 return vapidCache={raw:env.VAPID_PRIVATE_KEY,key,publicKey};
}
async function vapidAuthorization(env,endpoint,subject){
 const {key,publicKey}=await vapidKeys(env),b=WebPushCrypto.b64u,part=v=>b.encode(new TextEncoder().encode(JSON.stringify(v)));
 const unsigned=part({typ:'JWT',alg:'ES256'})+'.'+part({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:subject});
 return `vapid t=${unsigned}.${b.encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(unsigned)))}, k=${publicKey}`;
}
// Sends due reminders (optionally for one device). Delivered, rejected and hour-old reminders are removed;
// a push address the push service reports as gone is forgotten with its queue.
async function deliverPush(env,subscriptionId){
 const now=Date.now(),D=db(env);
 const {results}=await D.prepare('SELECT q.id, q.payload, q.send_at, s.id AS sid, s.endpoint, s.origin FROM push_queue q JOIN push_subscriptions s ON s.id = q.subscription_id WHERE q.send_at <= ?'+(subscriptionId?' AND s.id = ?':'')+' ORDER BY q.send_at LIMIT 50').bind(...(subscriptionId?[now,subscriptionId]:[now])).all();
 const gone=new Set();
 for(const r of results){
  if(gone.has(r.sid))continue;
  let status=0;try{status=(await fetch(r.endpoint,{method:'POST',redirect:'manual',headers:{authorization:await vapidAuthorization(env,r.endpoint,r.origin),'content-encoding':'aes128gcm','content-type':'application/octet-stream',ttl:'86400',urgency:'normal'},body:WebPushCrypto.b64u.decode(r.payload)})).status}catch{}
  if(status===404||status===410){gone.add(r.sid);await D.batch([D.prepare('DELETE FROM push_queue WHERE subscription_id = ?').bind(r.sid),D.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(r.sid)]);continue}
  if(status>=200&&status<500&&status!==429||now-r.send_at>3600000)await D.prepare('DELETE FROM push_queue WHERE id = ?').bind(r.id).run();
 }
}
async function pushResponse(request,env){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Sign in required'},401);
 const url=new URL(request.url);
 try{
  if(request.method==='GET')return json({publicKey:(await vapidKeys(env)).publicKey});
  if(!['POST','PUT','DELETE'].includes(request.method))return json({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const raw=await request.text();if(raw.length>400000)return json({error:'Request too large'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  if(!pushEndpointOk(body?.endpoint))return json({error:'Unsupported push service.'},400);
  const D=db(env),id=await sha256hex(body.endpoint),row=await D.prepare('SELECT user_id FROM push_subscriptions WHERE id = ?').bind(id).first();
  if(row&&row.user_id!==user)return json({error:'This device is registered to another account.'},409);
  if(request.method==='DELETE'){await D.batch([D.prepare('DELETE FROM push_queue WHERE subscription_id = ? AND user_id = ?').bind(id,user),D.prepare('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?').bind(id,user)]);return json({ok:true})}
  if(request.method==='POST'){
   if(!row){
    const {n}=await D.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(user).first();
    if(n>=PUSH_MAX_DEVICES)return json({error:`Up to ${PUSH_MAX_DEVICES} devices can get notifications. Turn one off first.`},409);
    await vapidKeys(env);await D.prepare('INSERT INTO push_subscriptions (id, user_id, endpoint, origin, created_at) VALUES (?, ?, ?, ?, ?)').bind(id,user,body.endpoint,url.origin,Date.now()).run();
   }
   return json({ok:true});
  }
  // PUT replaces this device's queued reminders, then sends any that are already due (such as a test).
  if(!row)return json({error:'Turn on notifications on this device first.'},404);
  const items=body.items,now=Date.now();
  if(!Array.isArray(items)||items.length>PUSH_MAX_ITEMS||items.some(x=>!Number.isInteger(x?.at)||x.at<now-3600000||x.at>now+40*86400000||typeof x.payload!=='string'||!/^[A-Za-z0-9_-]{100,5500}$/.test(x.payload)))return json({error:'Invalid notification schedule.'},400);
  await D.batch([D.prepare('DELETE FROM push_queue WHERE subscription_id = ?').bind(id),...items.map(x=>D.prepare('INSERT INTO push_queue (id, subscription_id, user_id, send_at, payload) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(),id,user,x.at,x.payload))]);
  if(items.some(x=>x.at<=now))await deliverPush(env,id);
  return json({ok:true,queued:items.length});
 }catch(e){console.error('Push request failed');return json({error:/^Notifications are not configured/.test(e.message)?e.message:'Notifications are temporarily unavailable.'},503)}
}
