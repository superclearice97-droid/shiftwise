/* Bank transaction delivery encryption. The vault holds a P-256 key pair; the server knows only the
   public key and encrypts each batch of fetched transactions to it (ECDH + HKDF-SHA-256 + AES-256-GCM),
   so stored batches can be read only by an unlocked Shiftwise vault. */
(function(root){
 const enc=new TextEncoder(),b64u={encode:b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),decode:s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0))};
 const curve={name:'ECDH',namedCurve:'P-256'};
 const validPublic=j=>j&&j.kty==='EC'&&j.crv==='P-256'&&typeof j.x==='string'&&typeof j.y==='string'&&!j.d&&j.x.length===43&&j.y.length===43;
 async function key(salt,shared,epk,purpose){const ikm=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:enc.encode('Shiftwise bank v1 '+epk)},ikm,{name:'AES-GCM',length:256},false,[purpose==='encrypt'?'encrypt':'decrypt'])}
 async function generate(){const k=await crypto.subtle.generateKey(curve,true,['deriveBits']),privateJwk=await crypto.subtle.exportKey('jwk',k.privateKey),{kty,crv,x,y}=privateJwk;return {privateJwk:{kty,crv,x,y,d:privateJwk.d},publicJwk:{kty,crv,x,y}}}
 async function encrypt(publicJwk,value){
  if(!validPublic(publicJwk))throw Error('Invalid bank delivery key');
  const recipient=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:publicJwk.x,y:publicJwk.y,ext:true},curve,false,[]);
  const eph=await crypto.subtle.generateKey(curve,true,['deriveBits']),epk=b64u.encode(await crypto.subtle.exportKey('raw',eph.publicKey));
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:recipient},eph.privateKey,256),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(salt,shared,epk,'encrypt'),enc.encode(JSON.stringify(value)));
  return {v:1,epk,salt:b64u.encode(salt),iv:b64u.encode(iv),ct:b64u.encode(ct)};
 }
 async function decrypt(privateJwk,packet){
  if(packet?.v!==1)throw Error('Unknown bank delivery format');
  const own=await crypto.subtle.importKey('jwk',{...privateJwk,ext:true},curve,false,['deriveBits']),eph=await crypto.subtle.importKey('raw',b64u.decode(packet.epk),curve,false,[]);
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:eph},own,256);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u.decode(packet.iv)},await key(b64u.decode(packet.salt),shared,packet.epk,'decrypt'),b64u.decode(packet.ct))));
 }
 root.BankCrypto={generate,encrypt,decrypt,validPublic};
})(globalThis);
