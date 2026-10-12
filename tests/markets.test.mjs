import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let calls=0;
const sandbox={Request,Response,URL,AbortSignal,Date,console,fetch:async url=>{calls++;assert.match(url,/^https:\/\/api.exchange.coinbase.com\/products\/[A-Z0-9]+-USD\/ticker$/);if(url.includes('BAD-'))return Response.json({price:'oops',time:'invalid'});if(url.includes('NOPE-'))return new Response('',{status:404});return Response.json({price:'123.45',time:'2026-09-22T12:00:00Z'})}};
vm.createContext(sandbox);vm.runInContext("const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});"+fs.readFileSync('markets.js','utf8'),sandbox);
async function request(symbols,auth=true){sandbox.req=new Request('https://app.test/api/markets?symbols='+encodeURIComponent(symbols),{headers:auth?{'oai-authenticated-user-id':'test-user'}:{}});return vm.runInContext('marketResponse(req)',sandbox)}
assert.equal((await request('BTC',false)).status,401);
assert.equal((await request('../BTC')).status,400);assert.equal(calls,0);
const good=await request('BTC');assert.equal(good.headers.get('cache-control'),'no-store');const payload=await good.json();assert.equal(payload.quotes[0].price,123.45);assert.equal(payload.quotes[0].time,'2026-09-22T12:00:00.000Z');
await request('BTC');assert.equal(calls,1);
const bad=await (await request('BAD,NOPE')).json();assert.equal(bad.quotes.length,0);assert.equal(bad.errors.length,2);
console.log('PASS: quote authentication, restricted symbols, provider timestamp, cache, invalid response and missing-pair handling. Live provider access remains unverified.');
