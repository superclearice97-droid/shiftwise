const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
function db(env){if(!env.DB)throw Error('Database unavailable');return env.DB}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/markets')return marketResponse(request);
 if(path==='/api/state'){
  const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Sign in required'},401);
  try{
   if(request.method==='GET'){const row=await db(env).prepare('SELECT payload, version FROM records WHERE user_id = ?').bind(user).first();return json({userId:user,data:row?JSON.parse(row.payload):null,version:row?.version||0})}
   if(request.method==='PUT'){
    const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
    const body=await request.text();if(body.length>4000000)return json({error:'Backup too large'},413);
    let packet;try{packet=JSON.parse(body)}catch(e){return json({error:'Invalid JSON'},400)}const {data,version,expectedUserId}=packet;
    if(expectedUserId&&expectedUserId!==user)return json({error:'Account changed. Sign into the original account to sync.'},403);
    if(!VaultCrypto.valid(data)||data.owner!==user||data.purpose!=='account')return json({error:'Encryption is required. Refresh Shiftwise and unlock or set up your vault. Readable records are no longer accepted.'},426);
    if(!Number.isInteger(version)||version<0)return json({error:'Invalid version'},400);
    const current=await db(env).prepare('SELECT payload, version FROM records WHERE user_id = ?').bind(user).first();
    if(!current&&packet.ageConfirmed!==true)return json({error:'You must confirm you are 18 or older before creating a Shiftwise vault.'},403);
    if(current){let previous;try{previous=JSON.parse(current.payload)}catch(e){return json({error:'Stored record format requires review'},409)}
     if(VaultCrypto.valid(previous)&&previous.kdf.salt!==data.kdf.salt)return json({error:'The account already has a different vault key. Reload and unlock with its passphrase. No records were overwritten.'},409);
    }
    const payload=JSON.stringify(data);
    const query=version===0?'INSERT INTO records (user_id, payload, version) VALUES (?, ?, 1) ON CONFLICT(user_id) DO NOTHING':'UPDATE records SET payload = ?, version = version + 1 WHERE user_id = ? AND version = ?';
    const statement=db(env).prepare(query);const result=await (version===0?statement.bind(user,payload):statement.bind(payload,user,version)).run();
    if(!result.meta.changes)return json({error:'A newer version is available. Merge and retry.'},409);
    return json({version:version+1,userId:user});
   }
   return json({error:'Method not allowed'},405);
  }catch(e){console.error('State storage failed');return json({error:'Could not access saved records. Your offline edits stay on this device.'},503)}
 }
 const key=path==='/'?'/index.html':path,asset=ASSETS[key];if(!asset)return new Response('Not found',{status:404});
 const body=asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
 return new Response(body,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','strict-transport-security':'max-age=31536000','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",'permissions-policy':'camera=(), microphone=(), geolocation=()',...(path==='/sw.js'?{'service-worker-allowed':'/'}:{})}});
}};
