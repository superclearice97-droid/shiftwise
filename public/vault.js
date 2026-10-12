let ageSignupBlocked=false;try{ageSignupBlocked=sessionStorage.getItem('shiftwise-age-blocked')==='1'}catch{}
let cloudEncrypted=false,locking=false,lastInteraction=Date.now(),hiddenSince=null;
function downloadJSON(value,name){if(window.deviceSaveFile)return window.deviceSaveFile(JSON.stringify(value),name);const blob=new Blob([JSON.stringify(value)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportEncryptedBackup(){try{if(!ready||!vaultKey)throw Error('Unlock your vault first.');const packet=await VaultCrypto.encrypt(clone(data),vaultKey,vaultSalt,accountId,'backup');downloadJSON(packet,'shiftwise-encrypted-'+datekey(new Date())+'.json');toast('Encrypted backup downloaded. Keep your passphrase separately.')}catch(e){toast(e.message)}}
function gateChrome(){document.body.classList.remove('city-focus');if(typeof updateCityPanel==='function')updateCityPanel();clearExperience();document.body.classList.add('vault-locked');$('#setup').hidden=true;$('#syncError').hidden=true;$('#lockVault').hidden=true;$('#heading').textContent='Your private financial vault.';$('#saveStatus').textContent='Vault locked';$('#syncBadge').textContent='Vault locked';$('#modal').close();$('#form').onsubmit=null;$('#fields').innerHTML='';}
async function boot(){
 ready=false;gateChrome();$('#content').innerHTML='<div class="card vault-card"><h2>Opening your vault…</h2><p>Checking for encrypted records.</p></div>';
 try{
  const active=await LocalRecords.rawGet('activeAccount');let remote=null;try{if(navigator.onLine||window.SHIFTWISE_DEVICE)remote=await rawApi()}catch(e){}
  const owner=remote?.userId||active;if(!owner)throw Error('Connect and sign in once to create or download your encrypted vault.');
  const cached=await LocalRecords.rawGet(owner),remoteCipher=VaultCrypto.valid(remote?.data),localCipher=VaultCrypto.valid(cached);
  if(remote?.data&&!remoteCipher&&!ShiftwiseCore.valid(remote.data))throw Error('Account data has an unsupported format. No records were changed.');
  if(cached&&!localCipher&&(!ShiftwiseCore.valid(cached.data)||cached.accountId!==owner))throw Error('This device copy cannot be migrated safely. No records were changed.');
  if(!remote&&!localCipher)throw Error('Reconnect once to finish encryption setup before working offline. Existing records have not been changed.');
  const metadata=remoteCipher?remote.data:localCipher?cached:null,setup=!metadata;
  accountId=owner;cloudEncrypted=remoteCipher;
  $('#content').innerHTML=`<form id="vaultForm" class="card vault-card"><div class="vault-emblem" aria-hidden="true">▣</div><div class="eyebrow">${setup?'PROTECT YOUR RECORDS':'END-TO-END ENCRYPTED RECORDS'}</div><h2>${setup?'Create your vault passphrase':'Unlock Shiftwise'}</h2><p>${setup?(window.SHIFTWISE_DEVICE?'Your hours, income, expenses and goals are encrypted and stored only on this device. There is no account and no server.':'Your hours, income, expenses, goals and offline copies will be encrypted on this device before syncing. Existing records will be migrated after you complete setup.'):(window.SHIFTWISE_DEVICE?'Your passphrase never leaves this device.':'Use the same vault passphrase on each device. It is separate from your ChatGPT sign-in and is never sent to the server.')}</p><label>Vault passphrase<input name="passphrase" type="password" autocomplete="${setup?'new-password':'current-password'}" minlength="${setup?16:1}" maxlength="1024" required autofocus></label>${setup?'<label>Your age in years<input name="age" type="number" min="0" max="120" step="1" required autocomplete="off"></label><p class="sub">Your age is checked on this device and is not sent to the server or saved in your records. This is a self-declaration, not identity verification.</p><label>Confirm passphrase<input name="confirm" type="password" autocomplete="new-password" minlength="16" maxlength="1024" required></label><p class="sub">Use a unique passphrase of at least 16 characters, ideally several randomly chosen words. Save it in a password manager.</p><label class="check"><input name="acknowledge" type="checkbox" required>I saved my passphrase. I understand it cannot be reset and losing it means losing access to these records.</label>':''}<p class="vault-error" id="vaultError" role="alert"></p><button class="primary" type="submit">${setup?'Encrypt my records':'Unlock vault'}</button><p class="sub">${setup?(window.SHIFTWISE_DEVICE?'Nothing is uploaded. If this device is lost or the app is removed, your records go with it, so export an encrypted backup from Pay settings now and then.':'Setup replaces the current readable account record after a successful sync. Older provider backups and copies on other devices are not automatically erased.'):'Forgotten passphrases cannot be recovered by the app or account provider. Use your password manager or the passphrase saved separately from your encrypted backup.'}</p>${!remote?'<p class="sub">Offline unlock. Sync will resume after reconnecting and signing in if needed.</p>':''}<p class="sub">Encryption protects stored records, not a compromised device or an already unlocked screen. ${window.SHIFTWISE_DEVICE?'':'Account metadata and encrypted file sizes remain visible to the service.'}</p>${window.SHIFTWISE_DEVICE?'':'<a href="/?reauth=1">Refresh sign-in / check account</a>'}</form>`;
  $('#vaultForm').onsubmit=async e=>{
   e.preventDefault();const form=e.target,button=form.querySelector('button[type="submit"]');button.disabled=true;$('#vaultError').textContent='';
   try{
    const f=new FormData(form),pass=f.get('passphrase');if(setup){const age=Number(f.get('age'));if(ageSignupBlocked)throw Error('Signup is unavailable in this session because the age requirement was not met.');if(f.get('age')===null||f.get('age')===''||!Number.isInteger(age)||age<0||age>120)throw Error('Enter your age in years.');if(age<18){ageSignupBlocked=true;try{sessionStorage.setItem('shiftwise-age-blocked','1')}catch{}form.reset();throw Error('You must be 18 or older to create a Shiftwise vault. No vault was created.');}}if(setup&&(pass.length<16||pass!==f.get('confirm')||!f.has('acknowledge')))throw Error('Use at least 16 characters, confirm the same passphrase, and save it before continuing.');
    const salt=metadata?.kdf.salt||VaultCrypto.newSalt(),key=await VaultCrypto.derive(pass,salt);
    let local=localCipher?await VaultCrypto.decrypt(cached,key,owner,'device'):cached;
    let server=remoteCipher?await VaultCrypto.decrypt(remote.data,key,owner,'account'):remote?.data;
    if(local&&(!ShiftwiseCore.valid(local.data)||local.accountId!==owner))throw Error('The saved device record did not pass validation.');
    if(server&&!ShiftwiseCore.valid(server))throw Error('The decrypted account record did not pass validation.');
    // Validate before replacing any existing device copy or sending a migration.
    vaultKey=key;vaultSalt=salt;
    data=normalize(local?.data||server);baseData=normalize(local?.base||server);version=local?.version??remote?.version??0;
    if(setup){
     // Claim the account vault first: a concurrent setup must not strand a device
     // under a different passphrase or overwrite another device's encrypted vault.
     const initial=await VaultCrypto.encrypt(normalize(server),key,salt,owner,'account');await VaultCrypto.decrypt(initial,key,owner,'account');
     const claimed=await rawApi('PUT',{data:initial,version:remote.version,expectedUserId:owner,ageConfirmed:true});version=claimed.version;cloudEncrypted=true;
    }
    await persistDevice();form.reset();lastInteraction=Date.now();hiddenSince=null;document.body.classList.remove('vault-locked');ready=true;$('#lockVault').hidden=false;render();prepareOffline();syncRecords();
   }catch(err){vaultKey=null;vaultSalt=null;data=normalize({});baseData=normalize({});$('#vaultError').textContent=err.message||'Could not unlock the vault. No data was discarded.';button.disabled=false;}
  };
 }catch(e){$('#content').innerHTML=`<div class="card vault-card"><h2>Vault unavailable</h2><p>${esc(e.message)}</p><button data-reload>Try again</button><p><a href="/?reauth=1">Sign in again</a></p></div>`}
}
async function lockVault(){
 if(!ready||locking)return;locking=true;ready=false;gateChrome();
 try{
  $('#content').innerHTML='<div class="card vault-card"><h2>Locking your vault…</h2></div>';await persistDevice();
  while(syncing)await new Promise(r=>setTimeout(r,100));await writeQueue;
  vaultKey=null;vaultSalt=null;marketQuotes={};marketErrors={};data=normalize({});baseData=normalize({});syncConflict=null;syncProblem='';formDirty=false;$('#fields').innerHTML='';locking=false;await boot();
 }catch(e){locking=false;ready=true;document.body.classList.remove('vault-locked');$('#lockVault').hidden=false;render();toast('Could not save before locking. Export an encrypted backup before closing.');lastInteraction=Date.now();hiddenSince=null;}
}
for(const event of ['pointerdown','keydown','touchstart'])document.addEventListener(event,()=>{if(ready)lastInteraction=Date.now()},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hiddenSince=Date.now();document.body.classList.add('screen-private')}else{if(hiddenSince&&Date.now()-hiddenSince>=60000)lockVault();else hiddenSince=null;document.body.classList.remove('screen-private')}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='lockVault')lockVault();if(b?.hasAttribute('data-reload'))location.reload()});
setInterval(()=>{if(ready&&(Date.now()-lastInteraction>=300000||(hiddenSince&&Date.now()-hiddenSince>=60000)))lockVault()},10000);
bootWithLock();
