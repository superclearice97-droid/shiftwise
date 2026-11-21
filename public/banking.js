/* Read-only bank connections on the Money tab (hosted website only). The vault keeps a private key; the
   server encrypts fetched transactions to its public key. Posted purchases become expenses, so budgets,
   receipts and weekly reviews include them. Transfers, income and card payments are left out. */
let bankStatus=null,bankBusy=false;
const BANK_SYNC_HOURS_LABEL=6;
const BANK_CATEGORIES=['Groceries','Housing & bills','Transport','Family','Food & dining','Shopping','Other'];
const bankAvailable=()=>!window.SHIFTWISE_DEVICE;
// Maps Plaid's personal finance category to a Shiftwise expense category, or null when it isn't spending.
function bankCategory(primary,detailed){
 if(['INCOME','TRANSFER_IN','TRANSFER_OUT'].includes(primary)||detailed==='LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'||detailed==='LOAN_DISBURSEMENTS'||String(primary).startsWith('LOAN_DISBURSEMENTS'))return null;
 if(primary==='FOOD_AND_DRINK')return /GROCER/.test(detailed)?'Groceries':'Food & dining';
 if(primary==='RENT_AND_UTILITIES'||primary==='LOAN_PAYMENTS')return 'Housing & bills';
 if(primary==='TRANSPORTATION'||primary==='TRAVEL')return 'Transport';
 if(primary==='GENERAL_MERCHANDISE'||primary==='HOME_IMPROVEMENT'||primary==='PERSONAL_CARE')return 'Shopping';
 return 'Other';
}
// Applies one decrypted batch to the records. Returns the number of expenses added or changed.
function applyBankBatch(batch){
 let changed=0;const byId=new Map(data.expenses.map(e=>[e.id,e]));
 const drop=id=>{const e=byId.get('bank:'+id);if(e){markWeekUnreviewed(new Date(e.date+'T12:00:00'));data.expenses=data.expenses.filter(x=>x!==e);byId.delete(e.id);changed++}};
 for(const id of batch.removed||[])drop(id);
 for(const t of [...(batch.added||[]),...(batch.modified||[])]){
  const category=bankCategory(t.category,t.detailed);
  if(t.pending||!(t.amount>=.01)||!category||(t.currency&&t.currency!=='USD')||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)){drop(t.id);continue}
  const id='bank:'+t.id,old=byId.get(id),userChose=old&&old.category!==bankCategory(old.bank?.category,old.bank?.detailed);
  const item={id,name:String(t.name).trim().slice(0,80)||'Bank purchase',amount:t.amount,date:t.date,category:userChose?old.category:category,bank:{institution:String(batch.institution||'').slice(0,80),category:t.category,detailed:t.detailed}};
  if(old&&JSON.stringify(old)===JSON.stringify(item))continue;
  if(old){markWeekUnreviewed(new Date(old.date+'T12:00:00'));data.expenses=data.expenses.map(x=>x===old?item:x)}else data.expenses.push(item);
  byId.set(id,item);markWeekUnreviewed(new Date(t.date+'T12:00:00'));changed++;
 }
 return changed;
}
async function bankApi(method,body){
 const r=await fetch('/api/bank',{method,cache:'no-store',credentials:'same-origin',headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const out=r.headers.get('content-type')?.includes('application/json')?await r.json():{error:'Sign in again to manage bank connections.'};
 if(!r.ok)throw Error(out.error||'Bank connections are unavailable.');return out;
}
async function refreshBankStatus(){if(!bankAvailable())return;try{bankStatus=await bankApi('GET')}catch{bankStatus=null}if(ready&&tab==='money'&&!$('#modal').open)render()}
// Downloads waiting batches, decrypts them with the vault key, saves, then tells the server to delete them.
async function pullBankTransactions(){
 if(!bankAvailable()||!ready||!vaultKey||!data.bankKey||bankBusy||!bankStatus?.configured)return 0;
 bankBusy=true;let total=0;
 try{
  for(let round=0;round<10;round++){
   const {batches}=await bankApi('POST',{action:'pull'});if(!batches.length)break;
   for(const b of batches)total+=applyBankBatch(await BankCrypto.decrypt(data.bankKey.privateJwk,b.packet));
   await save();await bankApi('POST',{action:'ack',ids:batches.map(b=>b.id)});
   if(batches.length<20)break;
  }
 }finally{bankBusy=false}
 if(total&&!$('#modal').open)render();return total;
}
async function connectBank(){
 if(!data.bankKey){data.bankKey=await BankCrypto.generate();await save()}
 await bankApi('POST',{action:'key',publicKey:data.bankKey.publicJwk});
 location.href='/bank.html';
}
function bankCard(){
 if(!bankAvailable()||!bankStatus?.configured)return '';
 const when=t=>t?new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'not yet';
 const rows=bankStatus.items.map(i=>`<li><span><strong>${esc(i.institution)}</strong> · ${i.status==='login_required'?'<span class="pill">Sign-in needed</span>':i.status==='error'?'<span class="pill">Error, retrying</span>':'Last checked '+esc(when(i.lastSync))}</span><button data-bankremove="${esc(i.id)}" aria-label="Remove ${esc(i.institution)}">Remove</button></li>`).join('');
 const imported=data.expenses.filter(e=>e.id.startsWith('bank:')).length;
 return `<div class="card bank-card"><div class="card-head"><div><h2>Bank accounts</h2><div class="sub">Read-only, through Plaid. Purchases are added to your spending automatically; transfers, income and card payments are left out.${bankStatus.environment==='sandbox'?' <strong>Test mode (Plaid Sandbox): use Plaid\'s test bank, not your real one.</strong>':''}</div></div><button class="primary" id="bankConnect">＋ Connect a bank</button></div>
 ${rows?`<ul class="checkins">${rows}</ul>`:'<p class="sub">No banks connected yet.</p>'}
 <div class="actions">${bankStatus.items.length?'<button id="bankSync">Check for new transactions</button>':''}<span class="sub">${imported} bank purchases in your records.</span></div>
 <p class="sub">Shiftwise checks about every ${BANK_SYNC_HOURS_LABEL} hours. New transactions are encrypted for your vault before they are stored and are added the next time you unlock. Your free Plaid trial allows 10 bank connections in total, and removing one does not give the slot back.</p></div>`;
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!ready||!bankAvailable())return;
 const run=(task,done)=>{if(bankBusy)return;task().then(done,err=>toast(err.message||'Bank connections are unavailable.'))};
 if(b.id==='bankConnect')run(connectBank,()=>{});
 if(b.id==='bankSync')run(async()=>{await bankApi('POST',{action:'sync'});await refreshBankStatus();return pullBankTransactions()},n=>toast(n?`${n} bank transactions updated.`:'No new bank transactions yet.'));
 if(b.dataset.bankremove&&confirm('Remove this bank connection? Purchases already added stay in your records. Your Plaid trial does not give the connection slot back.'))run(()=>bankApi('POST',{action:'remove',id:b.dataset.bankremove}).then(refreshBankStatus),()=>toast('Bank connection removed.'));
});
window.addEventListener('load',()=>{
 if(!bankAvailable())return;
 if(new URLSearchParams(location.search).get('bank')==='connected')setTimeout(()=>toast('Bank connected. Transactions can take a few minutes to arrive.'),1500);
 refreshBankStatus().then(()=>pullBankTransactions().catch(()=>{}));
 setInterval(()=>pullBankTransactions().catch(()=>{}),5*60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshBankStatus().then(()=>pullBankTransactions().catch(()=>{}))});
});
