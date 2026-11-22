/* Web Push message encryption (RFC 8291, aes128gcm). The browser encrypts each reminder to its own
   push subscription before upload, so the server stores only ciphertext and send times. */
(function(root){
 const enc=new TextEncoder();
 const b64u={encode:b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),decode:s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0))};
 const bytes=v=>typeof v==='string'?b64u.decode(v):new Uint8Array(v);
 const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
 async function hkdf(salt,ikm,info,length){const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8))}
 async function encrypt(plaintext,p256dh,auth){
  const uaPublic=bytes(p256dh),authSecret=bytes(auth),data=enc.encode(plaintext);
  if(uaPublic.length!==65||uaPublic[0]!==4||authSecret.length!==16)throw Error('Invalid push subscription keys');
  if(data.length>3993)throw Error('Push message too long');
  const sender=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const asPublic=new Uint8Array(await crypto.subtle.exportKey('raw',sender.publicKey));
  const uaKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},sender.privateKey,256));
  const ikm=await hkdf(authSecret,shared,concat(enc.encode('WebPush: info\0'),uaPublic,asPublic),32),salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await crypto.subtle.importKey('raw',await hkdf(salt,ikm,enc.encode('Content-Encoding: aes128gcm\0'),16),'AES-GCM',false,['encrypt']);
  const nonce=await hkdf(salt,ikm,enc.encode('Content-Encoding: nonce\0'),12);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},cek,concat(data,new Uint8Array([2]))));
  const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=65;
  return concat(header,asPublic,cipher);
 }
 root.WebPushCrypto={encrypt,b64u};
})(globalThis);
