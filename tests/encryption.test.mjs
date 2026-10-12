import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const scope={crypto:webcrypto,TextEncoder,TextDecoder,atob,btoa};vm.createContext(scope);vm.runInContext(fs.readFileSync('public/crypto.js','utf8'),scope);const C=scope.VaultCrypto;
const salt=C.newSalt(),key=await C.derive('test-only randomized vault phrase 137',salt),other=await C.derive('wrong-passphrase-that-cannot-open-it',salt);
assert.equal(key.extractable,false);
const original={shifts:[{pay:1234.56}],expenses:[{name:'private groceries',amount:100}],settings:{rate:23.5}};
const a=await C.encrypt(original,key,salt,'account-a','account'),b=await C.encrypt(original,key,salt,'account-a','account');
assert(C.valid(a));assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);assert(!JSON.stringify(a).includes('groceries'));assert(!JSON.stringify(a).includes('1234.56'));
assert.deepEqual(JSON.parse(JSON.stringify(await C.decrypt(a,key,'account-a','account'))),original);
await assert.rejects(()=>C.decrypt(a,other,'account-a','account'));
await assert.rejects(()=>C.decrypt(a,key,'account-b','account'));
await assert.rejects(()=>C.decrypt(a,key,'account-a','backup'));
const changed={...a,ciphertext:(a.ciphertext[0]==='A'?'B':'A')+a.ciphertext.slice(1)};await assert.rejects(()=>C.decrypt(changed,key,'account-a','account'));
const renamed={...a,owner:'account-b'};await assert.rejects(()=>C.decrypt(renamed,key,'account-b','account'));
assert(!C.valid({...a,kdf:{...a.kdf,iterations:1}}));assert(!C.valid({...a,iv:'AAAA'}));
for(const purpose of ['device','backup']){const packet=await C.encrypt(original,key,salt,'account-a',purpose);assert.deepEqual(JSON.parse(JSON.stringify(await C.decrypt(packet,key,'account-a',purpose))),original)}
const {default:worker}=await import('../dist/server/index.js');let stored=null;
const env={DB:{prepare(sql){return {
 bind(...args){this.args=args;return this},
 async first(){return stored},
 async run(){
  if(sql.startsWith('INSERT')){if(stored)return {meta:{changes:0}};stored={payload:this.args[1],version:1};return {meta:{changes:1}}}
  if(sql.startsWith('UPDATE')&&stored?.version===this.args[2]){stored={payload:this.args[0],version:stored.version+1};return {meta:{changes:1}}}
  return {meta:{changes:0}};
 }
}}}};
const put=(data,version,owner='account-a',ageConfirmed=true)=>worker.fetch(new Request('https://test.example/api/state',{method:'PUT',headers:{'oai-authenticated-user-id':owner,'origin':'https://test.example'},body:JSON.stringify({data,version,expectedUserId:owner,ageConfirmed})}),env);
assert.equal((await put(original,0)).status,426);assert.equal(stored,null);
assert.equal((await put(a,0,'account-a',false)).status,403);assert.equal(stored,null);assert.equal((await put(a,0,'account-a','true')).status,403);
assert.equal((await put(a,0)).status,200);assert(!stored.payload.includes('private groceries'));
assert.equal((await put(original,1)).status,426);assert.equal((await put(a,1,'account-b')).status,426);
const newSalt=C.newSalt(),newKey=await C.derive('different unrelated test passphrase',newSalt),different=await C.encrypt(original,newKey,newSalt,'account-a','account');assert.equal((await put(different,1)).status,409);
assert.equal((await put(b,1,'account-a',false)).status,200);assert.equal(stored.version,2);
const html=await worker.fetch(new Request('https://test.example/'),env);assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(html.headers.get('referrer-policy'),'no-referrer');
console.log('PASS: AES-GCM round trips; unique IVs; non-exportable keys; wrong passphrase, tamper, account and purpose rejection; encrypted device/backup formats; server rejects plaintext and key replacement; CSP.');

assert.match(html.headers.get('content-security-policy'),/font-src 'self'/);
for(const name of ['shiftwise-sans.ttf','shiftwise-sans-bold.ttf']){const font=await worker.fetch(new Request('https://test.example/'+name),env);assert.equal(font.headers.get('content-type'),'font/ttf');assert.deepEqual(Buffer.from(await font.arrayBuffer()),fs.readFileSync('public/'+name));assert(fs.readFileSync('public/sw.js','utf8').includes(name))}
console.log('PASS: server rejects missing adult declaration for new vaults; existing sync preserved; same-origin fonts served intact and cached.');
