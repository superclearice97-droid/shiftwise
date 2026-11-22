// Cloudflare Access sign-in: only a correctly signed, unexpired token for this app's audience grants an identity.
import assert from 'node:assert/strict';
import {webcrypto as crypto} from 'node:crypto';
const team='shiftwise-test.cloudflareaccess.com',aud='test-audience-tag';
const algorithm={name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'};
const signer=await crypto.subtle.generateKey(algorithm,true,['sign','verify']),stranger=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',signer.publicKey),kid:'key-1'};
let certFetches=0;
globalThis.fetch=async url=>{assert.equal(String(url),'https://'+team+'/cdn-cgi/access/certs');certFetches++;return Response.json({keys:[jwk]})};
const b64=x=>Buffer.from(x).toString('base64url');
async function token(claims={},{key=signer.privateKey,kid='key-1',alg='RS256'}={}){
 const now=Math.floor(Date.now()/1000),body=b64(JSON.stringify({alg,kid}))+'.'+b64(JSON.stringify({iss:'https://'+team,aud:[aud],sub:'user-123',email:'owner@example.test',iat:now,nbf:now,exp:now+3600,...claims}));
 return body+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(body)));
}
const {default:worker}=await import('../dist/server/index.js');
const env={AUTH:'cloudflare-access',ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud,DB:{prepare:()=>({bind:user=>({first:async()=>({payload:JSON.stringify({owner:user}),version:3})})})}};
const get=(headers,e=env)=>worker.fetch(new Request('https://app.test/api/state',{headers}),e);

// A valid token yields its subject, even if the browser also sends a forged identity header.
const ok=await get({'cf-access-jwt-assertion':await token(),'oai-authenticated-user-id':'someone-else'});
assert.equal(ok.status,200);assert.equal((await ok.json()).userId,'user-123');

// The legacy identity header alone is ignored.
assert.equal((await get({'oai-authenticated-user-id':'someone-else'})).status,401);
assert.equal((await get({})).status,401);

// Rejected tokens: wrong audience, issuer, expired, not yet valid, no subject, wrong key, unknown key id, other algorithm, tampered, malformed.
const bad=[
 await token({aud:['another-app']}),await token({iss:'https://evil.cloudflareaccess.com'}),
 await token({exp:Math.floor(Date.now()/1000)-5}),await token({nbf:Math.floor(Date.now()/1000)+600}),
 await token({sub:''}),await token({},{key:stranger.privateKey}),await token({},{kid:'key-2'}),await token({},{alg:'HS256'}),
 (await token()).replace(/\.[^.]+\./,'.'+b64(JSON.stringify({iss:'https://'+team,aud:[aud],sub:'admin',exp:9e9}))+'.'),
 'not-a-token','a.b.c'
];
for(const t of bad)assert.equal((await get({'cf-access-jwt-assertion':t})).status,401,t.slice(0,40));
// Unknown key ids do not trigger a key download on every request.
assert(certFetches<=2,'certs fetched '+certFetches+' times');

// A string audience is accepted, as Access may send either form.
assert.equal((await get({'cf-access-jwt-assertion':await token({aud})})).status,200);

// Deals and quotes use the verified identity too.
const deal=await worker.fetch(new Request('https://app.test/api/deals',{method:'POST',headers:{'oai-authenticated-user-id':'forged','origin':'https://app.test','content-type':'application/json'},body:'{}'}),env);
assert.equal(deal.status,401);
const signedDeal=await worker.fetch(new Request('https://app.test/api/deals',{method:'POST',headers:{'cf-access-jwt-assertion':await token(),'origin':'https://app.test','content-type':'application/json'},body:'{}'}),env);
assert.notEqual(signedDeal.status,401);

// Fails closed when sign-in is not configured, instead of trusting headers.
for(const e of [{...env,ACCESS_AUD:''},{...env,ACCESS_TEAM_DOMAIN:'evil.example.com'},{...env,ACCESS_TEAM_DOMAIN:undefined}])
 assert.equal((await get({'oai-authenticated-user-id':'someone-else','cf-access-jwt-assertion':await token()},e)).status,503);

// Key download failure is reported as unavailable, not as signed out.
const {default:fresh}=await import('../dist/server/index.js?keys-down');
globalThis.fetch=async()=>new Response('down',{status:500});
assert.equal((await fresh.fetch(new Request('https://app.test/api/state',{headers:{'cf-access-jwt-assertion':await token()}}),env)).status,503);

// Pages cannot be framed by other sites in this mode.
const page=await worker.fetch(new Request('https://app.test/'),env);
assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'self'$/);
assert.match((await worker.fetch(new Request('https://app.test/'),{})).headers.get('content-security-policy'),/chatgpt\.com/);
