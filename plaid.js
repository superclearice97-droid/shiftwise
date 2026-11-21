/* Read-only bank transactions through Plaid (hosted website only).
   - Plaid access tokens are encrypted at rest with the BANK_TOKEN_KEY Worker secret and never leave the server.
   - Fetched transactions are reduced to a few fields and encrypted to the vault's public key (public/bankcrypto.js)
     before they are stored; the vault decrypts them, adds spending to its records, then acknowledges them.
   - Only the Transactions product is requested; nothing here can move money. */
const PLAID_HOSTS={sandbox:'https://sandbox.plaid.com',production:'https://production.plaid.com'},BANK_SYNC_HOURS=6,BANK_MAX_ITEMS=10;
function plaidConfigured(env){return !!(PLAID_HOSTS[env.PLAID_ENV]&&env.PLAID_CLIENT_ID&&env.PLAID_SECRET&&/^[A-Za-z0-9_-]{43}$/.test(env.BANK_TOKEN_KEY||''))}
async function plaidCall(env,path,body){
 const response=await fetch(PLAID_HOSTS[env.PLAID_ENV]+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json','plaid-client-id':env.PLAID_CLIENT_ID,'plaid-secret':env.PLAID_SECRET},body:JSON.stringify(body)});
 const out=await response.json().catch(()=>({}));
 if(!response.ok){const e=Error(typeof out.display_message==='string'&&out.display_message?out.display_message:'The bank connection service returned an error.');e.code=String(out.error_code||'');throw e}
 return out;
}
async function tokenKey(env){return crypto.subtle.importKey('raw',WebPushCrypto.b64u.decode(env.BANK_TOKEN_KEY),'AES-GCM',false,['encrypt','decrypt'])}
async function sealToken(env,token,aad){const iv=crypto.getRandomValues(new Uint8Array(12)),b=WebPushCrypto.b64u;return b.encode(iv)+'.'+b.encode(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},await tokenKey(env),new TextEncoder().encode(token)))}
async function openToken(env,sealed,aad){const [iv,ct]=sealed.split('.'),b=WebPushCrypto.b64u;return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b.decode(iv),additionalData:new TextEncoder().encode(aad)},await tokenKey(env),b.decode(ct)))}
const slimTransaction=t=>({id:String(t.transaction_id).slice(0,100),date:String(t.date).slice(0,10),name:String(t.merchant_name||t.name||'Bank transaction').slice(0,120),amount:Math.round(Number(t.amount)*100)/100,pending:!!t.pending,category:String(t.personal_finance_category?.primary||'').slice(0,60),detailed:String(t.personal_finance_category?.detailed||'').slice(0,100),currency:t.iso_currency_code||null});
// Pulls new, changed and removed transactions for one connection and stores them as one encrypted batch.
async function syncBankItem(env,item){
 const D=db(env),aad=item.user_id+':'+item.id,token=await openToken(env,item.access_token,aad),key=await D.prepare('SELECT public_key FROM bank_keys WHERE user_id = ?').bind(item.user_id).first();
 if(!key)throw Error('No delivery key');
 const start=item.cursor||'';let cursor=start,added=[],modified=[],removed=[];
 try{
  for(let page=0;page<20;page++){
   const out=await plaidCall(env,'/transactions/sync',{access_token:token,cursor:cursor||undefined,count:500,options:{personal_finance_category_version:'v2'}});
   added.push(...out.added.map(slimTransaction));modified.push(...out.modified.map(slimTransaction));removed.push(...out.removed.map(r=>String(r.transaction_id).slice(0,100)));cursor=out.next_cursor;
   if(!out.has_more)break;
  }
 }catch(e){
  if(e.code==='TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'){await D.prepare('UPDATE bank_items SET last_sync = 0 WHERE id = ?').bind(item.id).run();return}
  await D.prepare('UPDATE bank_items SET status = ?, last_sync = ? WHERE id = ?').bind(e.code==='ITEM_LOGIN_REQUIRED'?'login_required':'error',Date.now(),item.id).run();return;
 }
 const statements=[D.prepare('UPDATE bank_items SET cursor = ?, last_sync = ?, status = ? WHERE id = ?').bind(cursor,Date.now(),'ok',item.id)];
 if(added.length||modified.length||removed.length){
  const payload=JSON.stringify(await BankCrypto.encrypt(JSON.parse(key.public_key),{item:item.id,institution:item.institution,added,modified,removed}));
  statements.unshift(D.prepare('INSERT INTO bank_inbox (id, user_id, created_at, payload) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(),item.user_id,Date.now(),payload));
 }
 await D.batch(statements);
}
async function syncDueBanks(env){
 if(!plaidConfigured(env))return;
 const {results}=await db(env).prepare("SELECT * FROM bank_items WHERE status != 'login_required' AND last_sync < ? ORDER BY last_sync LIMIT 10").bind(Date.now()-BANK_SYNC_HOURS*3600000).all();
 for(const item of results)await syncBankItem(env,item).catch(()=>console.error('Bank sync failed'));
}
async function bankResponse(request,env){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'Sign in required'},401);
 const url=new URL(request.url),D=()=>db(env);
 try{
  if(request.method==='GET'){
   if(!plaidConfigured(env))return json({configured:false,items:[]});
   const {results}=await D().prepare('SELECT id, institution, status, last_sync FROM bank_items WHERE user_id = ? ORDER BY created_at').bind(user).all();
   const pending=(await D().prepare('SELECT COUNT(*) AS n FROM bank_inbox WHERE user_id = ?').bind(user).first()).n;
   return json({configured:true,environment:env.PLAID_ENV,items:results.map(r=>({id:r.id,institution:r.institution,status:r.status,lastSync:r.last_sync||null})),pending});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const raw=await request.text();if(raw.length>20000)return json({error:'Request too large'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  if(!plaidConfigured(env))return json({error:'Bank connections are not configured on this server yet.'},503);
  const action=body?.action;
  if(action==='key'){
   if(!BankCrypto.validPublic(body.publicKey))return json({error:'Invalid key'},400);
   await D().prepare('INSERT INTO bank_keys (user_id, public_key) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET public_key = excluded.public_key').bind(user,JSON.stringify({kty:'EC',crv:'P-256',x:body.publicKey.x,y:body.publicKey.y})).run();
   return json({ok:true});
  }
  if(action==='link-token'){
   if(!await D().prepare('SELECT 1 AS ok FROM bank_keys WHERE user_id = ?').bind(user).first())return json({error:'Open the Money tab in Shiftwise and tap Connect a bank first.'},409);
   const {n}=await D().prepare('SELECT COUNT(*) AS n FROM bank_items WHERE user_id = ?').bind(user).first();if(n>=BANK_MAX_ITEMS)return json({error:'Bank connection limit reached.'},409);
   const out=await plaidCall(env,'/link/token/create',{user:{client_user_id:(await sha256hex('shiftwise:'+user)).slice(0,40)},client_name:'Shiftwise',products:['transactions'],transactions:{days_requested:90},country_codes:['US'],language:'en',redirect_uri:url.origin+'/bank.html'});
   return json({linkToken:out.link_token});
  }
  if(action==='exchange'){
   if(typeof body.publicToken!=='string'||body.publicToken.length>200)return json({error:'Invalid request'},400);
   const institution=typeof body.institution==='string'&&body.institution.trim()?body.institution.trim().slice(0,80):'Bank';
   const out=await plaidCall(env,'/item/public_token/exchange',{public_token:body.publicToken}),id=crypto.randomUUID();
   await D().prepare("INSERT INTO bank_items (id, user_id, plaid_item_id, institution, access_token, cursor, status, last_sync, created_at) VALUES (?, ?, ?, ?, ?, '', 'ok', 0, ?)").bind(id,user,String(out.item_id),institution,await sealToken(env,out.access_token,user+':'+id),Date.now()).run();
   await syncBankItem(env,await D().prepare('SELECT * FROM bank_items WHERE id = ?').bind(id).first()).catch(()=>{});
   return json({ok:true,id});
  }
  if(action==='sync'){
   const {results}=await D().prepare('SELECT * FROM bank_items WHERE user_id = ? AND last_sync < ?').bind(user,Date.now()-10*60000).all();
   for(const item of results)await syncBankItem(env,item).catch(()=>{});
   return json({ok:true,synced:results.length});
  }
  if(action==='pull'){const {results}=await D().prepare('SELECT id, payload FROM bank_inbox WHERE user_id = ? ORDER BY created_at LIMIT 20').bind(user).all();return json({batches:results.map(r=>({id:r.id,packet:JSON.parse(r.payload)}))})}
  if(action==='ack'){
   if(!Array.isArray(body.ids)||body.ids.length>20||body.ids.some(x=>typeof x!=='string'||x.length>100))return json({error:'Invalid request'},400);
   if(body.ids.length)await D().batch(body.ids.map(id=>D().prepare('DELETE FROM bank_inbox WHERE id = ? AND user_id = ?').bind(id,user)));
   return json({ok:true});
  }
  if(action==='remove'){
   const item=await D().prepare('SELECT * FROM bank_items WHERE id = ? AND user_id = ?').bind(String(body.id||''),user).first();if(!item)return json({error:'Connection not found'},404);
   await plaidCall(env,'/item/remove',{access_token:await openToken(env,item.access_token,user+':'+item.id)}).catch(()=>{});
   await D().prepare('DELETE FROM bank_items WHERE id = ?').bind(item.id).run();
   return json({ok:true});
  }
  return json({error:'Unknown action'},400);
 }catch(e){console.error('Bank request failed');return json({error:e.code?e.message:'Bank connections are temporarily unavailable.'},502)}
}
