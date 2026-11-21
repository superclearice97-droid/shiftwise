// Read-only bank connections: Plaid calls, token sealing, encrypted delivery to the vault, and turning purchases into expenses.
process.env.TZ='America/Chicago';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const {default:worker}=await import('../dist/server/index.js');
const sqlite=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint'))sqlite.exec(s);
const stmt=(sql,args=[])=>({sql,args,bind:(...v)=>stmt(sql,v),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})});
const DB={prepare:sql=>stmt(sql),batch:async list=>{sqlite.exec('BEGIN');try{for(const s of list)sqlite.prepare(s.sql).run(...s.args);sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const env={DB,PLAID_ENV:'sandbox',PLAID_CLIENT_ID:'client-test',PLAID_SECRET:'secret-test',BANK_TOKEN_KEY:Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url')};

// Fake Plaid Sandbox.
const calls=[];let pages=[],syncError=null;
const txn=(id,amount,primary,detailed,extra={})=>({transaction_id:id,account_id:'acc',date:'2026-11-20',name:'RAW '+id,merchant_name:'Shop '+id,amount,pending:false,iso_currency_code:'USD',personal_finance_category:{primary,detailed},...extra});
const plaid=async(url,init)=>{
 const u=new URL(url),body=JSON.parse(init.body);calls.push({path:u.pathname,body});
 assert.equal(u.origin,'https://sandbox.plaid.com');assert.equal(init.headers['plaid-client-id'],'client-test');assert.equal(init.headers['plaid-secret'],'secret-test');assert.equal(init.redirect,'error');
 const ok=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
 if(u.pathname==='/link/token/create'){assert.deepEqual(body.products,['transactions']);assert.equal(body.redirect_uri,'https://app.test/bank.html');assert(!body.user.client_user_id.includes('owner'));return ok({link_token:'link-sandbox-123'})}
 if(u.pathname==='/item/public_token/exchange'){assert.equal(body.public_token,'public-sandbox-abc');return ok({access_token:'access-sandbox-SECRET-TOKEN',item_id:'item-1'})}
 if(u.pathname==='/transactions/sync'){assert.equal(body.access_token,'access-sandbox-SECRET-TOKEN');if(syncError){const e=syncError;return new Response(JSON.stringify({error_code:e,display_message:null}),{status:400,headers:{'content-type':'application/json'}})}const page=pages.shift()||{added:[],modified:[],removed:[],next_cursor:body.cursor||'c0',has_more:false};return ok(page)}
 if(u.pathname==='/item/remove')return ok({});
 throw Error('unexpected '+u.pathname);
};
globalThis.fetch=plaid;

// Client: the real app scripts, talking to the real worker through fetch.
const elements=new Map(),el=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',hidden:false,open:false,style:{setProperty(){}},dataset:{},classList:{toggle(){},add(){},remove(){}},querySelector:()=>({disabled:false})});return elements.get(k)};
const app={console,document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){},body:{classList:{toggle(){},add(){},remove(){}}},documentElement:{dataset:{},style:{setProperty(){}}},visibilityState:'visible'},navigator:{onLine:true,userAgent:'test'},window:{addEventListener(){},matchMedia:()=>({matches:false})},crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa,location:{href:'https://app.test/',search:'',reload(){}},matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>0,clearTimeout(){},setInterval(){},Date,Intl,AbortController,Blob,URL,URLSearchParams,DataView,Uint8Array,
 fetch:(path,init)=>worker.fetch(new Request('https://app.test'+path,{...init,headers:{...init.headers,'oai-authenticated-user-id':'owner',origin:'https://app.test'}}),env)};
vm.createContext(app);
for(const f of ['deal-api.js','core.js','crypto.js','storage.js','app.js','features.js','investments.js','discounts.js','offers.js','sync.js','experience.js','restock.js','schedule.js','webpush.js','notify.js','bankcrypto.js','banking.js','connections.js'])vm.runInContext(fs.readFileSync('public/'+f,'utf8'),app);
const run=c=>vm.runInContext(c,app);
run("data=normalize({});ready=true;vaultKey={};save=async()=>{};render=()=>{};toast=()=>{}");

// Encryption round trip and key checks.
run("BankCrypto.generate().then(k=>{testKeys=k})");await new Promise(r=>setTimeout(r,50));
const packet=await run("BankCrypto.encrypt(testKeys.publicJwk,{hello:'world'})");
assert.deepEqual(JSON.parse(JSON.stringify(await run(`BankCrypto.decrypt(testKeys.privateJwk,${JSON.stringify(packet)})`))),{hello:'world'});
run("BankCrypto.generate().then(k=>{otherKeys=k})");await new Promise(r=>setTimeout(r,50));
await assert.rejects(run(`BankCrypto.decrypt(otherKeys.privateJwk,${JSON.stringify(packet)})`));
const tampered={...packet,ct:packet.ct.slice(0,-2)+(packet.ct.endsWith('A')?'BA':'AA')};await assert.rejects(run(`BankCrypto.decrypt(testKeys.privateJwk,${JSON.stringify(tampered)})`));
await assert.rejects(run("BankCrypto.encrypt({...testKeys.privateJwk},{})"),/Invalid bank delivery key/);

// Not configured: status says so, actions refuse.
assert.deepEqual(await (await worker.fetch(new Request('https://app.test/api/bank',{headers:{'oai-authenticated-user-id':'owner'}}),{DB})).json(),{configured:false,items:[]});
assert.equal((await worker.fetch(new Request('https://app.test/api/bank'),env)).status,401);
const post=(body,{user='owner',origin='https://app.test'}={})=>worker.fetch(new Request('https://app.test/api/bank',{method:'POST',headers:{'oai-authenticated-user-id':user,origin,'content-type':'application/json'},body:JSON.stringify(body)}),env);
assert.equal((await post({action:'link-token'},{origin:'https://evil.test'})).status,403);
assert.equal((await post({action:'link-token'})).status,409,'needs a delivery key first');
assert.equal((await post({action:'key',publicKey:{kty:'EC',crv:'P-256',x:'x',y:'y'}})).status,400);

// Connect: the app registers its public key; the connect page gets a link token and exchanges the public token.
await run("refreshBankStatus()");assert.equal(run('bankStatus.configured'),true);assert.equal(run('bankStatus.environment'),'sandbox');
run("location.href='https://app.test/'");await run('connectBank()');assert.equal(run('location.href'),'/bank.html');assert(run('ShiftwiseCore.valid(data)'));
assert(!JSON.stringify(sqlite.prepare('SELECT * FROM bank_keys').all()).includes(run('data.bankKey.privateJwk.d')),'private key never reaches the server');
assert.equal((await (await post({action:'link-token'})).json()).linkToken,'link-sandbox-123');
pages=[{added:[txn('t1',54.21,'FOOD_AND_DRINK','FOOD_AND_DRINK_GROCERIES'),txn('t2',1200,'RENT_AND_UTILITIES','RENT_AND_UTILITIES_RENT'),txn('pay',-900,'INCOME','INCOME_WAGES')],modified:[],removed:[],next_cursor:'c1',has_more:true},
 {added:[txn('t3',40,'TRANSFER_OUT','TRANSFER_OUT_ACCOUNT_TRANSFER'),txn('t4',300,'LOAN_PAYMENTS','LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'),txn('t5',8.5,'FOOD_AND_DRINK','FOOD_AND_DRINK_COFFEE',{pending:true}),txn('t6',22,'TRANSPORTATION','TRANSPORTATION_GAS')],modified:[],removed:[],next_cursor:'c2',has_more:false}];
const ex=await (await post({action:'exchange',publicToken:'public-sandbox-abc',institution:'Huntington Bank'})).json();assert.equal(ex.ok,true);
// The access token is stored sealed, never in readable form; the batch is stored encrypted.
const row=sqlite.prepare('SELECT * FROM bank_items').get();assert.equal(row.cursor,'c2');assert(!row.access_token.includes('access-sandbox'));
const inbox=JSON.stringify(sqlite.prepare('SELECT * FROM bank_inbox').all());assert(!inbox.includes('Shop t1')&&!inbox.includes('54.21'),'server stores no readable transactions');
// Another account can't see, pull or remove it.
assert.equal((await (await post({action:'pull'},{user:'intruder'})).json()).batches.length,0);
assert.equal((await post({action:'remove',id:row.id},{user:'intruder'})).status,404);

// The vault pulls, decrypts and adds only posted purchases; then the server deletes the batch.
await run("refreshBankStatus()");const added=await run('pullBankTransactions()');assert.equal(added,3);
const exp=JSON.parse(run("JSON.stringify(data.expenses.map(e=>[e.id,e.name,e.amount,e.category]))"));
assert.deepEqual(exp,[['bank:t1','Shop t1',54.21,'Groceries'],['bank:t2','Shop t2',1200,'Housing & bills'],['bank:t6','Shop t6',22,'Transport']]);
assert(run('ShiftwiseCore.valid(data)'));assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM bank_inbox').get().n,0);
assert.equal(await run('pullBankTransactions()'),0);

// Later sync: a pending purchase posts, an amount changes, one is removed; your own category choice is kept.
run("data.expenses.find(e=>e.id==='bank:t6').category='Other'");
sqlite.prepare('UPDATE bank_items SET last_sync = 0').run();
pages=[{added:[txn('t7',8.5,'FOOD_AND_DRINK','FOOD_AND_DRINK_COFFEE')],modified:[txn('t1',50.01,'FOOD_AND_DRINK','FOOD_AND_DRINK_GROCERIES'),txn('t6',25,'TRANSPORTATION','TRANSPORTATION_GAS')],removed:[{transaction_id:'t2'},{transaction_id:'t5'}],next_cursor:'c3',has_more:false}];
const all=[];await worker.scheduled({},env,{waitUntil:p=>all.push(p)});await Promise.all(all);
assert.equal(sqlite.prepare('SELECT cursor FROM bank_items').get().cursor,'c3');
await run('pullBankTransactions()');
assert.deepEqual(JSON.parse(run("JSON.stringify(data.expenses.map(e=>[e.id,e.amount,e.category]).sort())")),[['bank:t1',50.01,'Groceries'],['bank:t6',25,'Other'],['bank:t7',8.5,'Food & dining']]);
// Not due again for 6 hours.
const before=calls.length;{const a=[];await worker.scheduled({},env,{waitUntil:p=>a.push(p)});await Promise.all(a)}assert.equal(calls.length,before);

// A bank that needs signing in again is marked, not retried every run.
sqlite.prepare('UPDATE bank_items SET last_sync = 0').run();syncError='ITEM_LOGIN_REQUIRED';
{const a=[];await worker.scheduled({},env,{waitUntil:p=>a.push(p)});await Promise.all(a)}
await run("refreshBankStatus()");assert.equal(run('bankStatus.items[0].status'),'login_required');assert.match(run('bankCard()'),/Sign-in needed/);
syncError=null;

// Category mapping.
for(const [p,d,want] of [['FOOD_AND_DRINK','FOOD_AND_DRINK_RESTAURANT','Food & dining'],['GENERAL_MERCHANDISE','GENERAL_MERCHANDISE_ONLINE_MARKETPLACES','Shopping'],['ENTERTAINMENT','ENTERTAINMENT_TV_AND_MOVIES','Other'],['TRANSFER_IN','TRANSFER_IN_DEPOSIT',null],['LOAN_PAYMENTS','LOAN_PAYMENTS_CAR_PAYMENT','Housing & bills'],['TRAVEL','TRAVEL_FLIGHTS','Transport']])
 assert.equal(run(`bankCategory(${JSON.stringify(p)},${JSON.stringify(d)})`),want);

// Validation rejects a malformed vault key.
assert.equal(run("ShiftwiseCore.valid({...data,bankKey:{publicJwk:{kty:'EC',crv:'P-256',x:'a',y:'b'},privateJwk:{}}})"),false);

// Removing a connection calls Plaid's remove and deletes the stored token.
assert.equal((await post({action:'remove',id:row.id})).status,200);assert(calls.some(c=>c.path==='/item/remove'));assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM bank_items').get().n,0);

// The connect page has its own policy allowing only Plaid's script and frame; the app keeps the strict one.
const page=await worker.fetch(new Request('https://app.test/bank.html'),env),csp=page.headers.get('content-security-policy');
assert.match(csp,/script-src 'self' https:\/\/cdn\.plaid\.com\/link\/v2\/stable\/link-initialize\.js;/);assert.match(csp,/frame-ancestors 'none'/);assert(!/unsafe-inline/.test(csp.match(/script-src[^;]*/)[0]));
assert(!(await worker.fetch(new Request('https://app.test/'),env)).headers.get('content-security-policy').includes('plaid'));

// The device apps never show bank connections.
run("window.SHIFTWISE_DEVICE=true");assert.equal(run('bankCard()'),'');
