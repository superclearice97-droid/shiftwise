import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
// Simulated SimpleFIN responses only; real bank access must be tested by the account owner.
const scope={URL,Date,AbortSignal,TextDecoder,Response,atob,btoa,Buffer};vm.createContext(scope);
for(const f of ['deal-api.js','bank-api.js','core.js'])vm.runInContext(fs.readFileSync('public/'+f,'utf8'),scope);
const same=(a,b,m)=>assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),b,m);
const B=scope.BankAPI,Core=scope.ShiftwiseCore,b64=s=>Buffer.from(s).toString('base64');
const ACCESS='https://user%40x:p%3Ass@bridge.example/simplefin';
const fail=async(fn,re)=>{let e;try{await fn()}catch(x){e=x}assert(e,'expected an error');assert.match(e.message,re)};

// Setup tokens decode to a public HTTPS claim URL only.
assert.equal(B.claimUrl(b64('https://bridge.example/simplefin/claim/abc')).href,'https://bridge.example/simplefin/claim/abc');
assert.equal(B.claimUrl(' '+b64('https://bridge.example/claim/x')+'\n').host,'bridge.example');
for(const bad of ['',b64('http://bridge.example/claim/x'),b64('https://127.0.0.1/claim/x'),b64('https://192.168.1.4/claim'),b64('https://u:p@bridge.example/claim'),'not base64 at all!!',b64('ftp://x')])assert.throws(()=>B.claimUrl(bad));
// Access URLs: credentials move into a Basic header and out of the request URL.
const a=B.access(ACCESS);assert.equal(a.base,'https://bridge.example/simplefin');assert.equal(a.auth,'Basic '+b64('user@x:p:ss'));assert(!a.base.includes('user'));
for(const bad of ['https://bridge.example/simplefin','http://u:p@bridge.example/s','https://u:p@10.0.0.2/s','https://u:p@bridge.example/s?x=1'])assert.throws(()=>B.access(bad));
console.log('PASS: setup token and access URL validation (HTTPS, public host, credentials kept out of URLs).');

// Protocol v2 and v1 payloads normalize to the same records.
const now=Date.parse('2026-10-31T18:00:00Z'),t=s=>Math.floor(Date.parse(s)/1000);
const v2={errlist:[{code:'con.auth',msg:'Reconnect Credit Union',conn_id:'c2'}],connections:[{conn_id:'c1',name:'First Bank',org_id:'o1',sfin_url:'x'},{conn_id:'c2',name:'Credit Union',org_id:'o2',sfin_url:'y'}],accounts:[
 {id:'chk',name:'Checking',conn_id:'c1',currency:'USD',balance:'1200.50','available-balance':'1100.00','balance-date':t('2026-10-31T12:00:00Z'),transactions:[{id:'t1',posted:t('2026-10-30T15:00:00Z'),amount:'-45.10',description:'Grocery <img src=x onerror=alert(1)>'},{id:'t2',posted:0,transacted_at:t('2026-10-31T09:00:00Z'),amount:'-9.99',description:'Pending coffee',pending:true},{id:'t3',posted:t('2026-10-29T08:00:00Z'),amount:'800',description:'Payroll'}]},
 {id:'card',name:'Card',conn_id:'c2',currency:'USD',balance:'-300','balance-date':t('2026-10-31T12:00:00Z')}]};
const n=B.normalize(v2,now);
same(n.accounts.map(x=>[x.id,x.org,x.balance,x.available]),[['chk','First Bank',1200.5,1100],['card','Credit Union',-300,null]]);
same(n.transactions.map(x=>[x.id,x.amount,x.pending]),[['chk:t1',-45.1,false],['chk:t2',-9.99,true],['chk:t3',800,false]]);
assert.equal(n.transactions[1].posted,'2026-10-31T09:00:00.000Z','pending uses transacted_at');
same(n.errors,['Reconnect Credit Union']);
const v1=B.normalize({errors:['Old style warning'],accounts:[{id:'s',name:'Savings',org:{domain:'bank.example',name:'Old Bank'},currency:'USD',balance:'50','balance-date':t('2026-10-30T00:00:00Z')}]},now);
assert.equal(v1.accounts[0].org,'Old Bank');same(v1.errors,['Old style warning']);
for(const bad of [{accounts:'x'},{accounts:[{id:'a',name:'A',currency:'USD',balance:'1e9999','balance-date':1}]},{accounts:[{id:'a',name:'A',currency:'USD',balance:'abc','balance-date':1}]},{accounts:[{id:'a',name:'A',currency:'USD',balance:'1','balance-date':1},{id:'a',name:'B',currency:'USD',balance:'1','balance-date':1}]},{accounts:[{id:'a',name:'A',currency:'USD',balance:'1','balance-date':1,transactions:[{id:'',posted:1,amount:'1',description:'x'}]}]}])assert.throws(()=>B.normalize(bad,now));
console.log('PASS: SimpleFIN v2 and v1 payloads, pending items, warnings and malformed data rejection.');

// Merging keeps settled history, replaces stale pending items, and drops old or unlinked accounts.
const prev=[{id:'chk:t1',accountId:'chk',posted:'2026-10-30T15:00:00.000Z',amount:-40,description:'old',pending:false},{id:'chk:p',accountId:'chk',posted:'2026-10-31T01:00:00.000Z',amount:-5,description:'stale pending',pending:true},{id:'chk:ancient',accountId:'chk',posted:'2026-05-01T00:00:00.000Z',amount:-1,description:'too old',pending:false},{id:'gone:t',accountId:'gone',posted:'2026-10-30T00:00:00.000Z',amount:-1,description:'removed account',pending:false},{id:'chk:keep',accountId:'chk',posted:'2026-09-01T00:00:00.000Z',amount:-7,description:'kept',pending:false}];
const merged=B.mergeTransactions(prev,n.transactions,['chk','card'],now);
same(merged.map(x=>x.id),['chk:t2','chk:t1','chk:t3','chk:keep']);assert.equal(merged.find(x=>x.id==='chk:t1').amount,-45.1,'newer download wins');
console.log('PASS: transaction merge (dedupe, pending refresh, 120-day window, removed accounts).');

// Requests: claim is a POST to the decoded URL; account reads use Basic auth, 90-day windows and refuse redirects.
let calls=[];const fake=(status,body)=>async(url,init)=>{calls.push({url,init});return new Response(body,{status})};
const claimed=await B.run({action:'claim',token:b64('https://bridge.example/simplefin/claim/once')},fake(200,ACCESS+'\n'),now);
assert.equal(claimed.accessUrl,ACCESS);assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].url,'https://bridge.example/simplefin/claim/once');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.credentials,'omit');
await fail(()=>B.run({action:'claim',token:b64('https://bridge.example/claim/used')},fake(403,'')),/already used/);
await fail(()=>B.run({action:'claim',token:b64('https://bridge.example/claim/x')},fake(200,'http://u:p@bridge.example/s')),/HTTPS/);
await fail(()=>B.run({action:'claim',token:b64('https://bridge.example/claim/x')},fake(200,'<html>error page</html>')),/access URL/);
calls=[];const got=await B.run({action:'accounts',accessUrl:ACCESS,startDate:t('2026-01-01T00:00:00Z')},fake(200,JSON.stringify(v2)),now);
const u=new URL(calls[0].url);assert.equal(u.origin+u.pathname,'https://bridge.example/simplefin/accounts');assert(!u.username&&!u.password);
assert.equal(u.searchParams.get('version'),'2');assert.equal(u.searchParams.get('pending'),'1');assert.equal(Number(u.searchParams.get('start-date')),Math.floor(now/1000)-89*86400,'clamped to SimpleFIN 90-day limit');
assert.equal(calls[0].init.headers.Authorization,'Basic '+b64('user@x:p:ss'));assert.equal(calls[0].init.redirect,'error');assert.equal(got.accounts.length,2);assert.equal(got.checkedAt,new Date(now).toISOString());
await fail(()=>B.run({action:'accounts',accessUrl:ACCESS,startDate:1},fake(402,'')),/payment/);
await fail(()=>B.run({action:'accounts',accessUrl:ACCESS,startDate:1},fake(403,'')),/revoked/);
await fail(()=>B.run({action:'accounts',accessUrl:ACCESS,startDate:1},fake(200,'x'.repeat(3000001))),/too large/);
await fail(()=>B.run({action:'accounts',accessUrl:ACCESS,startDate:1},fake(200,'<html>')),/JSON/);
await fail(()=>B.run({action:'transfer'},fake(200,'')),/Invalid bank request/);
console.log('PASS: claim and account requests (method, Basic auth, date window, no redirects, error and size handling).');

// Vault validation and sync merge accept bank records and reject malformed ones.
const base={settings:{rate:20,ot:40,mult:1.5,credit:0,otherIncome:0,w4ded:0,extra:0,state:0,local:0,retire:0,benefits:0,post:0,ytd:0,hourGoal:40,budget:300,status:'single'},shifts:[],expenses:[],goals:[]};
const linked={...base,bankLink:{accessUrl:ACCESS,lastSync:got.checkedAt},bankAccounts:got.accounts,bankTransactions:merged.filter(x=>x.accountId!=='gone')};
assert.equal(Core.valid(linked),true);assert.equal(Core.valid({...base,bankLink:{accessUrl:'',lastSync:''}}),true);
assert.equal(Core.valid({...linked,bankLink:{accessUrl:'http://u:p@x.example/s',lastSync:''}}),false);
assert.equal(Core.valid({...linked,bankAccounts:[{...got.accounts[0],balance:'1'}]}),false);
assert.equal(Core.valid({...linked,bankTransactions:[{...merged[0],accountId:'unknown'}]}),false);
assert.equal(Core.valid({...linked,bankAccounts:[got.accounts[0],got.accounts[0]]}),false);
const m=Core.merge({bankAccounts:[got.accounts[0]]},{bankAccounts:[{...got.accounts[0],balance:5}]},{bankAccounts:[got.accounts[0],got.accounts[1]]});
same(m.data.bankAccounts.map(x=>[x.id,x.balance]),[['chk',5],['card',-300]]);assert.equal(m.conflicts.length,0);
console.log('PASS: vault validation and sync merge for linked accounts and transactions.');

