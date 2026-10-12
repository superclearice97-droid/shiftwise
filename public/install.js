let installPrompt=null;
const installButton=document.querySelector('#installNow'),installStatus=document.querySelector('#installStatus');
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.hidden=false;installStatus.textContent='Your browser supports direct installation. Tap Install Shiftwise to continue.'});
installButton.addEventListener('click',async()=>{if(!installPrompt)return;try{await installPrompt.prompt();const result=await installPrompt.userChoice;installStatus.textContent=result.outcome==='accepted'?'Installation requested. Look for Shiftwise on your home screen or desktop.':'You can install later using your browser menu.'}catch{installStatus.textContent='Use the browser installation steps below.'}installPrompt=null;installButton.hidden=true});
window.addEventListener('appinstalled',()=>{installStatus.textContent='Shiftwise is installed. Open it from your home screen or desktop.';installButton.hidden=true});
if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)installStatus.textContent='You are already using Shiftwise in its app window.';
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
