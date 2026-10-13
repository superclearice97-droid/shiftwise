/* Hosted transport. Only administrator-approved origins can receive requests. */
const dealLimits=new Map();
async function dealResponse(request,env){
 if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in required'},401);
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
 // Per-isolate abuse guard; production hosting should also configure platform rate limits.
 const user=request.headers.get('oai-authenticated-user-id'),now=Date.now();
 for(const [key,v] of dealLimits)if(now-v.start>60000)dealLimits.delete(key);
 const limit=dealLimits.get(user)||{start:now,count:0};if(limit.count>=20)return json({error:'Too many checks. Wait a minute.'},429);
 limit.count++;dealLimits.set(user,limit);
 try{
  const raw=await request.text();if(raw.length>200000)return json({error:'Request too large'},413);
  let packet;try{packet=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  const origins=String(env.DEAL_API_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return json(await DealAPI.run(packet,{origins}));
 }catch(e){return json({error:e.name==='TimeoutError'?'Provider timed out. Try again.':e.message||'Connection unavailable.'},400)}
}
