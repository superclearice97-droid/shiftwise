/* Opt-in connected discounts; configuration and observations live inside the vault. */
let dealBusy=false,dealQuery='',dealMessage='',dealAnswer='',dealGeneration=0,lastDealRefresh=0;
function clearDealConnections(){dealGeneration++;dealBusy=false;dealQuery='';dealMessage='';dealAnswer='';lastDealRefresh=0;}
function currentConnectedOffers(){return data.connectedOffers.filter(o=>DealAPI.active(o,data.discountPreferences.zip)&&data.dealConnections.stores.some(c=>c.id===o.connectionId&&c.locationId===o.locationId));}
function connectionsView(){
 const s=data.dealConnections,offers=currentConnectedOffers(),cached=data.connectedOffers.length;
 return `<div class="card"><div class="card-head"><div><h2>Connected local discounts</h2><p class="sub">ZIP ${esc(data.discountPreferences.zip)} · ${s.enabled?'Connections enabled':'Connections off'}</p></div><div class="actions"><button id="discountLocation">Change ZIP</button><button id="connectionSettings">AI & refresh settings</button><button id="addStoreConnection">＋ Connect store API</button></div></div><p>Connect an authorized store feed, search for desired items, then watch up to 10 exact products and package sizes. Prices are USD shelf prices; verify tax, delivery and eligibility at checkout.</p><div class="actions">${s.stores.map(c=>`<button data-editconnection="${esc(c.id)}">${esc(c.name)} · ${c.kind==='kroger'?'Kroger':'JSON feed'}</button><button data-removeconnection="${esc(c.id)}" aria-label="Remove ${esc(c.name)} connection">Remove</button>`).join('')}</div><label>Desired item or discount<input id="dealSearch" value="${esc(dealQuery)}" maxlength="200" placeholder="Coffee, laundry detergent, headphones…"></label><button id="refreshDeals" class="primary" ${dealBusy||!s.enabled||!s.stores.length?'disabled':''}>${dealBusy?'Checking…':'Check local prices'}</button><p class="sub">${s.autoRefresh?'Refreshes every 15 minutes while visible and unlocked, after your first check.':'Manual refresh enabled.'} No checks while closed or locked; no background phone notifications.</p><p role="status" class="sub">${esc(dealMessage)}</p>${cached>offers.length?`<p class="notice">${cached-offers.length} cached observations are expired, over 24 hours old, or from another location. Refresh to check current prices.</p>`:''}<details><summary>API setup & privacy</summary><p class="sub">Kroger requires your authorized access token and an eight-digit location ID. Tokens expire; replace them here when needed. Other stores require a JSON feed implementing the contract in API-CONNECTIONS.md. A store URL alone cannot supply prices. Website administrators must allow custom API hosts; Android and Linux connect directly.</p><p class="sub">Keys are saved in your encrypted vault and included in encrypted backups. Store checks send only the ZIP, location ID and search text. AI sends the ZIP, your question and up to 30 current store observations after confirmation; no pay, expenses or balances. Provider fees may apply. Chat subscriptions do not supply API keys.</p></details></div><div class="grid">${offers.map(o=>{const watch=data.dealItems.find(i=>DealAPI.matches(i,o)),saved=o.regularPrice===null?0:o.regularPrice-o.price;return `<article class="card"><span class="pill">${esc(o.store)}</span><h2>${esc(o.name)}</h2><p class="sub">${esc(o.variant)} · location ${esc(o.locationId||o.zip)}</p><div class="number">${money(o.price)}</div><p>${saved>0?`Save ${money(saved)} from ${money(o.regularPrice)}`:'No verified markdown supplied'}</p><p class="sub">Observed ${esc(new Date(o.observedAt).toLocaleString())}${o.expiresAt?' · expires '+esc(new Date(o.expiresAt).toLocaleString()):' · expiration not supplied'}</p><p>${esc(o.terms)}</p>${watch?`<p class="notice">Watching${watch.target!==null?' · target '+money(watch.target):''}${watch.target!==null&&o.price<=watch.target?' · Target reached':''}</p>`:''}<button data-watchconnected="${esc(o.id)}">${watch?'Edit target':'Watch this product'}</button>${o.url?`<a class="deal-link" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Store details ↗</a>`:''}</article>`}).join('')}</div>${!offers.length?'<div class="card empty">Connect a store API and check prices to see local offers here.</div>':''}<div class="card"><h2>AI discount assistant</h2><p class="sub">Compares fetched prices. Advice may contain mistakes; the store feed remains the price source.</p><label>Your question<textarea id="dealQuestion" maxlength="1000" rows="3" placeholder="Which of these detergent offers is best value? Consider package sizes."></textarea></label><button id="askDealAI" ${dealBusy||!s.enabled||!s.ai.enabled||!offers.length?'disabled':''}>Review data & ask AI</button>${dealAnswer?`<p class="offer-text" role="status">${esc(dealAnswer)}</p>`:''}</div>`;
}
function storeConnectionModal(id){
 const c=data.dealConnections.stores.find(x=>x.id===id)||{id:uid(),name:'',kind:'json',endpoint:'',key:'',locationId:''};
 modal(id?'Edit store API':'Connect store API',`<label>Store name<input name="name" maxlength="100" value="${esc(c.name)}" required></label><label>Provider<select name="kind"><option value="json" ${c.kind==='json'?'selected':''}>Authorized JSON deal feed</option><option value="kroger" ${c.kind==='kroger'?'selected':''}>Kroger Products API</option></select></label><label>JSON feed endpoint (ignored for Kroger)<input name="endpoint" maxlength="2000" value="${esc(c.endpoint)}" placeholder="https://your-store-api.example/offers"></label><label>Bearer API key / Kroger access token<input name="key" type="password" autocomplete="off" maxlength="4000" value="${esc(c.key)}"></label><label>Store location ID<input name="locationId" maxlength="100" value="${esc(c.locationId)}" placeholder="Kroger: eight digits; JSON: your feed location"></label><p class="sub">Only use an API you are authorized to access. Keys stay encrypted at rest. Saving does not send a request; enable connections and press Check local prices.</p>`,f=>{
  const next={...c};for(const k of ['name','kind','endpoint','key','locationId'])next[k]=String(f.get(k)||'').trim();
  if(next.kind==='kroger'){next.endpoint='';if(!next.key)throw Error('Enter your Kroger access token.')}
  const settings={...data.dealConnections,stores:[...data.dealConnections.stores.filter(x=>x.id!==c.id),next]};
  if(!DealAPI.validSettings(settings))throw Error('Check the name, endpoint and location ID. Kroger requires an eight-digit ID; feeds use HTTPS or a device-local address.');
  data.dealConnections=settings;data.connectedOffers=data.connectedOffers.filter(o=>o.connectionId!==c.id);dealGeneration++;dealBusy=false;dealAnswer='';
 });
}
function connectionSettingsModal(){
 const s=data.dealConnections,a=s.ai;
 modal('API connections & AI',`<label class="check"><input name="enabled" type="checkbox" ${s.enabled?'checked':''}>Enable store and AI API requests</label><label class="check"><input name="autoRefresh" type="checkbox" ${s.autoRefresh?'checked':''}>Refresh store feeds every 15 minutes while visible and unlocked</label><label class="check"><input name="aiEnabled" type="checkbox" ${a.enabled?'checked':''}>Enable AI comparison (confirmation required for each question)</label><label>OpenAI-compatible chat endpoint<input name="endpoint" maxlength="2000" value="${esc(a.endpoint)}" placeholder="https://api.openai.com/v1/chat/completions"></label><label>AI API key (leave empty for a local server without authentication)<input type="password" name="key" maxlength="4000" autocomplete="off" value="${esc(a.key)}"></label><label>Model name<input name="model" maxlength="100" value="${esc(a.model)}" placeholder="Exact model offered by your API or Ollama server"></label><p class="sub">Ollama: http://YOUR-LAN-IP:11434/v1/chat/completions in the Linux app. Android requires HTTPS for local servers. The website cannot reach your home network. Use your provider’s exact model name; ChatGPT, Gemini and Claude chat subscriptions are separate from API billing.</p>`,f=>{
  const next={...s,enabled:f.has('enabled'),autoRefresh:f.has('autoRefresh'),ai:{enabled:f.has('aiEnabled'),endpoint:String(f.get('endpoint')||'').trim(),key:String(f.get('key')||'').trim(),model:String(f.get('model')||'').trim()}};
  if(!DealAPI.validSettings(next)||next.ai.enabled&&(!next.ai.model||!next.ai.endpoint.endsWith('/chat/completions')))throw Error('Enter a valid chat-completions endpoint and model.');
  data.dealConnections=next;dealGeneration++;dealBusy=false;dealAnswer='';
 });
}
async function connectedRequest(packet){
 let result;
 if(window.SHIFTWISE_DEVICE&&window.Capacitor?.isNativePlatform?.()){
  // Native HTTP avoids WebView CORS without opening renderer networking generally.
  result=await DealAPI.run(packet,{device:true},async(url,init)=>{
   if(new URL(url).protocol!=='https:')throw Error('Android API connections require HTTPS. Use a trusted HTTPS gateway for local Ollama.');
   const http=window.Capacitor.Plugins.CapacitorHttp;
   const r=await http.request({url,method:init.method||'GET',headers:init.headers,data:init.body?JSON.parse(init.body):undefined,responseType:'text',connectTimeout:10000,readTimeout:30000,disableRedirects:true});
   if(r.url&&r.url!==url)throw Error('API redirects are not allowed.');
   return new Response(typeof r.data==='string'?r.data:JSON.stringify(r.data),{status:r.status});
  });
 }else{
  const response=await (window.SHIFTWISE_DEVICE?originalFetch:fetch)('/api/deals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(35000)});
  result=await response.json();if(!response.ok)throw Error(result.error||'Connection unavailable.');
 }
 return result;
}
async function refreshConnectedDeals(automatic=false){
 if(!ready||dealBusy||!data.dealConnections.enabled||!data.dealConnections.stores.length)return;
 dealBusy=true;const generation=dealGeneration,owner=accountId,zip=data.discountPreferences.zip,settings=JSON.stringify(data.dealConnections),query=dealQuery;
 if(!automatic){dealMessage='Checking configured stores…';render()}
 const connections=clone(data.dealConnections.stores);
 // Up to ten linked products are checked independently of the current discovery query.
 const watches=clone(data.dealItems.filter(i=>i.connectionId&&connections.some(c=>c.id===i.connectionId)).slice(0,10));
 try{
  const outcomes=await Promise.allSettled(connections.map(c=>connectedRequest({action:'store',zip,query,connection:c})));
  const watched=await Promise.allSettled(watches.map(i=>connectedRequest({action:'store',zip,query:i.name,productId:i.productId,connection:connections.find(c=>c.id===i.connectionId)})));
  if(!ready||generation!==dealGeneration||owner!==accountId||zip!==data.discountPreferences.zip||settings!==JSON.stringify(data.dealConnections))return;
  let count=0;const errors=[];
  outcomes.forEach((r,i)=>{const c=connections[i];if(r.status==='rejected'){errors.push(c.name+': '+(r.reason?.message||'Connection failed'));return}
   const offers=r.value.offers;if(!Array.isArray(offers)){errors.push(c.name+': Invalid feed');return}
   data.connectedOffers=[...data.connectedOffers.filter(o=>o.connectionId!==c.id),...offers];count+=offers.length;
   for(const item of data.dealItems){const o=offers.find(x=>DealAPI.matches(item,x)&&DealAPI.active(x,zip));if(o&&!data.dealPrices.some(p=>p.itemId===item.id&&p.at===o.observedAt)){data.dealPrices.push({id:uid(),itemId:item.id,price:o.price,at:o.observedAt,source:c.name,locationId:o.locationId,zip:o.zip})}}
  });
  watched.forEach((r,i)=>{
   const item=data.dealItems.find(x=>x.id===watches[i].id&&x.connectionId===watches[i].connectionId&&x.productId===watches[i].productId&&x.variant===watches[i].variant);if(!item)return;if(r.status==='rejected'){errors.push(item.name+': '+(r.reason?.message||'Watch check failed'));return}
   const o=r.value.offers.find(x=>DealAPI.matches(item,x)&&DealAPI.active(x,zip));
   if(!o){errors.push(item.name+': Exact product not returned; last observation retained.');return}
   data.connectedOffers=[...data.connectedOffers.filter(x=>x.id!==o.id),o];
   if(!data.dealPrices.some(p=>p.itemId===item.id&&p.at===o.observedAt))data.dealPrices.push({id:uid(),itemId:item.id,price:o.price,at:o.observedAt,source:o.store,locationId:o.locationId,zip:o.zip});
  });
  lastDealRefresh=Date.now();dealAnswer='';dealMessage=`Checked ${new Date().toLocaleTimeString()} · ${count} observations. ${errors.join(' · ')}`;await save();
 }catch(e){if(ready&&generation===dealGeneration)dealMessage=e.message||'Could not check stores.'}
 finally{if(generation===dealGeneration){dealBusy=false;if(ready&&tab==='discounts'&&!$('#modal').open)render()}}
}
function watchConnectedOffer(id){
 const o=currentConnectedOffers().find(x=>x.id===id);if(!o)return;
 const existing=data.dealItems.find(i=>DealAPI.matches(i,o));
 if(existing){dealModal(existing.id);return}
 if(data.dealItems.filter(i=>i.connectionId&&data.dealConnections.stores.some(c=>c.id===i.connectionId)).length>=10){toast('You can monitor up to 10 API-linked products. Remove a watch before adding another.');return}
 modal('Watch '+o.name,`<p>${esc(o.store)} · ${esc(o.variant)} · ${money(o.price)}</p><label>Desired target price ($)<input name="target" type="number" min="0" max="1000000000" step=".01" required></label><p class="sub">Links this exact product and package size to its API feed. In-app alerts appear after a refresh reaches your target. Refresh results are shelf prices, excluding tax and delivery.</p>`,f=>{
  const target=Number(f.get('target'));if(!Number.isFinite(target)||target<0||target>1e9)throw Error('Enter a valid target.');
  const item={id:uid(),name:o.name,store:o.store,variant:o.variant,url:o.url,target,alerts:true,connectionId:o.connectionId,productId:o.productId};data.dealItems.push(item);
  data.dealPrices.push({id:uid(),itemId:item.id,price:o.price,at:o.observedAt,source:o.store,locationId:o.locationId,zip:o.zip});
 });
}
async function askConnectedAI(){
 if(!ready||dealBusy||!data.dealConnections.enabled||!data.dealConnections.ai.enabled)return;
 const prompt=$('#dealQuestion')?.value.trim();if(!prompt){toast('Enter your question.');return}
 const offers=clone(currentConnectedOffers().slice(0,30)),c=clone(data.dealConnections.ai),zip=data.discountPreferences.zip;
 if(!offers.length){toast('Refresh store prices first.');return}
 const host=new URL(c.endpoint).host;
 if(!confirm(`Send to ${host} using ${c.model}?\n\nZIP: ${zip}\nQuestion: ${prompt}\n\n${offers.length} store observations: product names, sizes, stores, prices, times and terms. No pay, expenses, API keys from other connections or balances are included. Provider fees may apply.`))return;
 dealBusy=true;dealAnswer='';dealMessage='Asking AI…';const generation=dealGeneration,owner=accountId;render();
 try{const r=await connectedRequest({action:'ai',zip,query:'',prompt,offers,connection:c});if(ready&&generation===dealGeneration&&owner===accountId&&zip===data.discountPreferences.zip){dealAnswer=r.answer;dealMessage='AI comparison complete. Verify details with the store.'}}
 catch(e){if(ready&&generation===dealGeneration)dealMessage=e.message||'AI unavailable.'}
 finally{if(generation===dealGeneration){dealBusy=false;if(ready&&tab==='discounts'&&!$('#modal').open)render()}}
}
document.addEventListener('input',e=>{if(e.target.id==='dealSearch')dealQuery=e.target.value;});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||!ready)return;
 if(b.id==='addStoreConnection')storeConnectionModal();if(b.dataset.editconnection)storeConnectionModal(b.dataset.editconnection);
 if(b.id==='connectionSettings')connectionSettingsModal();if(b.id==='refreshDeals')refreshConnectedDeals();if(b.id==='askDealAI')askConnectedAI();if(b.dataset.watchconnected)watchConnectedOffer(b.dataset.watchconnected);
 if(b.dataset.removeconnection&&confirm('Remove this API connection and its cached offers? Saved price history remains.')){const id=b.dataset.removeconnection;data.dealConnections.stores=data.dealConnections.stores.filter(c=>c.id!==id);data.connectedOffers=data.connectedOffers.filter(o=>o.connectionId!==id);dealGeneration++;dealBusy=false;dealAnswer='';save();render()}
});
setInterval(()=>{if(ready&&!dealBusy&&!document.hidden&&!$('#modal').open&&data.dealConnections.enabled&&data.dealConnections.autoRefresh&&lastDealRefresh&&Date.now()-lastDealRefresh>=900000)refreshConnectedDeals(true)},30000);
