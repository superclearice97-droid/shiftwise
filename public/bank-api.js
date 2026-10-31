/* Read-only bank balances through SimpleFIN (https://www.simplefin.org/protocol.html).
   The person creates a one-time setup token at their SimpleFIN server (for example SimpleFIN Bridge),
   Shiftwise claims it once for an access URL, then downloads balances and transactions.
   SimpleFIN cannot move money. Shared by the app (Android native HTTP) and the Linux main process. */
(function(root){
 'use strict';
 const text=(v,max=200)=>typeof v==='string'&&v.length<=max;
 const privateHost=h=>h==='localhost'||h==='[::1]'||/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||/^169\.254\./.test(h)||h.endsWith('.local');
 const b64decode=s=>typeof root.atob==='function'?root.atob(s):Buffer.from(s,'base64').toString('binary');
 const b64encode=s=>typeof root.btoa==='function'?root.btoa(s):Buffer.from(s,'binary').toString('base64');
 const MAX_BYTES=3000000,DAY=86400000;
 function publicHttps(u){if(u.protocol!=='https:'||privateHost(u.hostname))throw Error('SimpleFIN servers must use HTTPS on a public host.');return u}
 // A setup token is the base64 of a claim URL. It works once.
 function claimUrl(token){
  if(!text(token,4000)||!token.trim())throw Error('Paste your SimpleFIN setup token.');
  let decoded;try{decoded=b64decode(token.trim().replace(/\s+/g,''))}catch{throw Error('That is not a SimpleFIN setup token.')}
  let u;try{u=new URL(decoded)}catch{throw Error('That is not a SimpleFIN setup token.')}
  publicHttps(u);if(u.username||u.password||u.hash)throw Error('That is not a SimpleFIN setup token.');
  return u;
 }
 // The access URL carries Basic credentials: https://user:pass@host/simplefin
 function access(accessUrl){
  if(!text(accessUrl,2000))throw Error('Invalid SimpleFIN access URL.');
  let u;try{u=new URL(accessUrl.trim())}catch{throw Error('Invalid SimpleFIN access URL.')}
  publicHttps(u);if(!u.username||!u.password||u.search||u.hash)throw Error('Invalid SimpleFIN access URL.');
  const auth='Basic '+b64encode(decodeURIComponent(u.username)+':'+decodeURIComponent(u.password));
  u.username='';u.password='';
  return {base:u.href.replace(/\/+$/,''),host:u.host,auth};
 }
 const num=v=>{const n=typeof v==='number'?v:typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v.trim())?Number(v):NaN;if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('SimpleFIN returned an invalid amount.');return Math.round(n*100)/100};
 const time=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>4102444800)throw Error('SimpleFIN returned an invalid date.');return n};
 // Accepts protocol v2 (connections + errlist) and v1 (org on each account + errors).
 function normalize(payload,now=Date.now()){
  if(!payload||typeof payload!=='object'||!Array.isArray(payload.accounts)||payload.accounts.length>200)throw Error('SimpleFIN returned an invalid account list.');
  const connections=new Map((Array.isArray(payload.connections)?payload.connections:[]).filter(c=>c&&text(c.conn_id,200)).map(c=>[c.conn_id,c]));
  const errors=[...(Array.isArray(payload.errlist)?payload.errlist.map(e=>e?.msg):[]),...(Array.isArray(payload.errors)?payload.errors:[])].filter(m=>text(m,1000)&&m.trim()).map(m=>m.trim()).slice(0,10);
  const accounts=[],transactions=[],seen=new Set();
  for(const a of payload.accounts){
   if(!a||!text(a.id,150)||!a.id||seen.has(a.id)||!text(a.name)||!text(a.currency,200))throw Error('SimpleFIN returned an invalid account.');
   seen.add(a.id);
   const conn=connections.get(a.conn_id),org=text(conn?.name)&&conn.name.trim()?conn.name.trim():text(a.org?.name)&&a.org.name.trim()?a.org.name.trim():text(a.org?.domain)&&a.org.domain?a.org.domain:'Bank';
   const balanceDate=time(a['balance-date']);
   accounts.push({id:a.id,org,name:a.name.trim()||'Account',currency:/^[A-Z]{3}$/.test(a.currency)?a.currency:'XXX',balance:num(a.balance),available:a['available-balance']===undefined||a['available-balance']===null||a['available-balance']===''?null:num(a['available-balance']),balanceDate:new Date(balanceDate*1000).toISOString()});
   const txs=Array.isArray(a.transactions)?a.transactions:[];if(txs.length>5000)throw Error('SimpleFIN returned too many transactions.');
   for(const t of txs){
    if(!t||!text(t.id,200)||!t.id||!text(t.description,1000))throw Error('SimpleFIN returned an invalid transaction.');
    const posted=time(t.posted),at=t.transacted_at===undefined?0:time(t.transacted_at),when=(posted||at)*1000||now;
    transactions.push({id:a.id+':'+t.id,accountId:a.id,posted:new Date(when).toISOString(),amount:num(t.amount),description:t.description.trim().slice(0,200)||'Transaction',pending:t.pending===true||posted===0});
   }
  }
  return {accounts,transactions,errors};
 }
 // Newer download wins for the same transaction; history is kept for 120 days, at most 5000 entries.
 function mergeTransactions(previous,incoming,accountIds,now=Date.now()){
  const keep=new Set(accountIds),map=new Map();
  for(const t of previous)if(keep.has(t.accountId)&&!t.pending)map.set(t.id,t);
  for(const t of incoming)map.set(t.id,t);
  return [...map.values()].filter(t=>keep.has(t.accountId)&&now-Date.parse(t.posted)<=120*DAY).sort((a,b)=>b.posted.localeCompare(a.posted)).slice(0,5000);
 }
 function validLink(s){return !!s&&typeof s==='object'&&text(s.accessUrl,2000)&&(s.accessUrl===''||(()=>{try{access(s.accessUrl);return true}catch{return false}})())&&text(s.lastSync,40)&&(s.lastSync===''||Number.isFinite(Date.parse(s.lastSync)))}
 async function read(response){
  const reader=response.body?.getReader?.();let raw='';
  if(reader){const decoder=new TextDecoder();let bytes=0;try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('SimpleFIN response is too large.');raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}}
  else{raw=await response.text();if(raw.length>MAX_BYTES)throw Error('SimpleFIN response is too large.')}
  return raw;
 }
 async function run(p,fetcher=root.fetch,now=Date.now()){
  if(!p||!['claim','accounts'].includes(p.action))throw Error('Invalid bank request.');
  const go=(url,init)=>fetcher(String(url),{...init,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(45000)});
  if(p.action==='claim'){
   const r=await go(claimUrl(p.token),{method:'POST',headers:{}});
   if(r.status===403)throw Error('This setup token was already used or does not exist. Create a new one at your SimpleFIN server. If you did not use it yourself, disable it there.');
   if(!r.ok)throw Error('SimpleFIN could not claim the token (HTTP '+r.status+').');
   const accessUrl=(await read(r)).trim();access(accessUrl);
   return {accessUrl};
  }
  const a=access(p.accessUrl),start=Number(p.startDate);
  if(!Number.isInteger(start)||start<0||start>now/1000)throw Error('Invalid start date.');
  // SimpleFIN allows at most 90 days per request.
  const url=new URL(a.base+'/accounts');url.searchParams.set('version','2');url.searchParams.set('pending','1');url.searchParams.set('start-date',String(Math.max(start,Math.floor(now/1000)-89*86400)));
  const r=await go(url,{headers:{Accept:'application/json',Authorization:a.auth}});
  if(r.status===402)throw Error('Your SimpleFIN subscription needs payment before balances can update.');
  if(r.status===403)throw Error('SimpleFIN access was revoked or is no longer valid. Unlink and connect again with a new setup token.');
  if(!r.ok)throw Error('SimpleFIN request failed (HTTP '+r.status+').');
  let body;try{body=JSON.parse(await read(r))}catch(e){throw Error(e.message.includes('too large')?e.message:'SimpleFIN did not return JSON.')}
  return {...normalize(body,now),checkedAt:new Date(now).toISOString()};
 }
 root.BankAPI={claimUrl,access,normalize,mergeTransactions,validLink,run};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.BankAPI;
})(globalThis);
