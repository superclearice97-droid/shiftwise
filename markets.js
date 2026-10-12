// Public quotes only. No holdings, balances, or vault secrets are accepted here.
const publicQuoteCache=new Map();
async function marketResponse(request){
 if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in required'},401);
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const symbols=[...new Set((new URL(request.url).searchParams.get('symbols')||'').split(',').filter(Boolean))];
 if(!symbols.length||symbols.length>10||symbols.some(s=>! /^[A-Z0-9]{1,12}$/.test(s)))return json({error:'Use 1–10 crypto symbols such as BTC, ETH or SOL.'},400);
 const quotes=[],errors=[];
 await Promise.all(symbols.map(async symbol=>{
  try{const cached=publicQuoteCache.get(symbol);if(cached&&Date.now()-cached.fetchedAt<60000){quotes.push(cached.quote);return}
   const response=await fetch('https://api.exchange.coinbase.com/products/'+symbol+'-USD/ticker',{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error(response.status===404?'No Coinbase USD pair for this symbol.':'Quote provider is temporarily unavailable.');
   const r=await response.json(),price=Number(r.price),time=Date.parse(r.time);if(!Number.isFinite(price)||price<=0||!Number.isFinite(time))throw Error('Provider returned an invalid quote.');
   const quote={symbol,price,currency:'USD',time:new Date(time).toISOString(),source:'Coinbase last trade',retrievedAt:new Date().toISOString()};
   if(publicQuoteCache.size>=1000)publicQuoteCache.clear();publicQuoteCache.set(symbol,{quote,fetchedAt:Date.now()});quotes.push(quote);
  }catch(e){errors.push({symbol,message:e.name==='TimeoutError'?'Quote request timed out.':e.message||'Quote unavailable.'})}
 }));return json({quotes,errors});
}
