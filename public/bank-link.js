/* Opens Plaid Link with a short-lived link token from the Shiftwise server, then hands the one-time
   public token back to the server. Bank sign-in happens inside Plaid's window. */
(()=>{
 const status=document.getElementById('bankStatus'),open=document.getElementById('bankOpen'),say=t=>{status.textContent=t};
 const post=async body=>{const r=await fetch('/api/bank',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)});const out=r.headers.get('content-type')?.includes('application/json')?await r.json():{error:'Sign in again, then retry.'};if(!r.ok)throw Error(out.error||'Bank connections are unavailable.');return out};
 const back=q=>location.replace('/?tab=money'+(q?'&bank='+q:''));
 if(typeof Plaid==='undefined'){say('Plaid could not load. Check your connection and try again.');return}
 (async()=>{
  // Returning from a bank's own sign-in page (OAuth) reuses the same link token.
  const returning=new URLSearchParams(location.search).has('oauth_state_id');
  let token;try{token=returning?sessionStorage.getItem('shiftwiseLinkToken'):null}catch{}
  if(!token){token=(await post({action:'link-token'})).linkToken;try{sessionStorage.setItem('shiftwiseLinkToken',token)}catch{}}
  const handler=Plaid.create({token,...(returning?{receivedRedirectUri:location.href}:{}),
   onSuccess:async(publicToken,metadata)=>{say('Connecting… this can take a few seconds.');open.disabled=true;try{await post({action:'exchange',publicToken,institution:metadata?.institution?.name||''});try{sessionStorage.removeItem('shiftwiseLinkToken')}catch{}back('connected')}catch(e){say(e.message);open.disabled=false}},
   onExit:err=>{try{sessionStorage.removeItem('shiftwiseLinkToken')}catch{}if(err)say(err.display_message||'The bank connection was not completed.');else back('')}});
  if(returning){handler.open();return}
  open.disabled=false;open.addEventListener('click',()=>handler.open());say('');
 })().catch(e=>say(e.message));
})();
