/* Device copies are account-scoped and are never used as another account's data. */
const LocalRecords={
 db:null,
 async open(){if(this.db)return this.db;return this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('shiftwise-offline',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});},
 async rawGet(key){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})},
 async rawPut(key,value){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('records','readwrite');t.objectStore('records').put(value,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})},
 async get(key){const raw=await this.rawGet(key);if(key==='activeAccount'||raw===undefined)return raw;if(!VaultCrypto.valid(raw))throw Error('This device needs encryption setup.');return VaultCrypto.decrypt(raw,vaultKey,key,'device')},
 async put(key,value){if(key==='activeAccount')return this.rawPut(key,value);return this.rawPut(key,await VaultCrypto.encrypt(value,vaultKey,vaultSalt,key,'device'))},
 async clearAccount(user){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('records','readwrite');t.objectStore('records').delete(user);t.objectStore('records').delete('activeAccount');t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
};
