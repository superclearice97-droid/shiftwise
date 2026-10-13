// Shiftwise for Linux. Loads only the bundled app files from app://shiftwise/.
// No remote content, no Node access in the page, no telemetry, no auto-update.
'use strict';
const {app, BrowserWindow, protocol, shell, session, Menu} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const DealAPI = require('../www/deal-api.js');

const WWW = path.join(__dirname, '..', 'www');
const ORIGIN = 'app://shiftwise';
const SMOKE = process.env.SHIFTWISE_SMOKE_TEST; // CI only: path for a screenshot, then quit.
if (SMOKE) app.disableHardwareAcceleration(); // CI has no GPU; avoids sporadic compositor errors under Xvfb.

protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true}}]);
app.setName('Shiftwise');
if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();

const TYPES = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', ttf: 'font/ttf', png: 'image/png', txt: 'text/plain; charset=utf-8', json: 'application/json'};
// Files are read straight from the app folder; file:// stays blocked for the page.
function serve() {
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    if (url.host !== 'shiftwise') return new Response('Not found', {status: 404});
    if (url.pathname === '/api/deals') {
      if (request.method !== 'POST') return Response.json({error:'Method not allowed'}, {status:405});
      try {
        const raw=await request.text();if(raw.length>200000)return Response.json({error:'Request too large'}, {status:413});
        const result=await DealAPI.run(JSON.parse(raw), {device:true}, globalThis.fetch);
        return Response.json(result, {headers:{'cache-control':'no-store'}});
      } catch(e) {return Response.json({error:e.message}, {status:400,headers:{'cache-control':'no-store'}});}
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(WWW, rel));
    const type = TYPES[path.extname(file).slice(1)];
    if (!file.startsWith(WWW + path.sep) || !type) return new Response('Not found', {status: 404});
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, {headers: {'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache'}});
    } catch { return new Response('Not found', {status: 404}); }
  });
}

function lockDown() {
  const ses = session.defaultSession;
  // No camera, microphone, location, notifications or other device permissions.
  ses.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  ses.setPermissionCheckHandler(() => false);
  // Only the app itself and the optional, opt-in Coinbase price lookup may be reached.
  ses.webRequest.onBeforeRequest((details, done) => {
    const u = details.url;
    const allowed = u.startsWith(ORIGIN + '/') || u.startsWith('devtools://') || u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('https://api.exchange.coinbase.com/products/');
    done({cancel: !allowed});
  });
}

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 360, minHeight: 560, backgroundColor: '#0f0f10', title: 'Shiftwise',
    icon: path.join(__dirname, '..', 'linux', 'icon.png'), autoHideMenuBar: true, show: !!SMOKE || false,
    webPreferences: {contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false, devTools: !app.isPackaged}
  });
  win.once('ready-to-show', () => win.show());
  // Links to shops and offers open in the person's normal browser.
  win.webContents.setWindowOpenHandler(({url}) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  win.loadURL(ORIGIN + '/index.html');
  if (SMOKE) smokeTest();
}

// CI check: create a vault, unlock, and capture the city view to prove the packaged app runs.
async function smokeTest() {
  const wc = win.webContents, wait = ms => new Promise(r => setTimeout(r, ms));
  const run = js => wc.executeJavaScript(js, true);
  const fail = e => { console.error('SMOKE FAIL', e); app.exit(1); };
  try {
    await new Promise(r => wc.once('did-finish-load', r));
    for (let i = 0; i < 60 && !(await run('!!document.querySelector("#vaultForm")')); i++) await wait(500);
    await run(`(()=>{const f=document.querySelector('#vaultForm');const set=(n,v)=>{const el=f.querySelector('[name='+n+']');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))};set('passphrase','smoke test passphrase only');set('age','30');set('confirm','smoke test passphrase only');f.querySelector('[name=acknowledge]').checked=true;f.requestSubmit()})()`);
    for (let i = 0; i < 120 && await run('document.body.classList.contains("vault-locked")'); i++) await wait(500);
    if (await run('document.body.classList.contains("vault-locked")')) throw Error('vault did not unlock: ' + await run('document.querySelector("#vaultError")?.textContent'));
    await wait(3000);
    const status = await run('document.querySelector("#syncBadge").textContent');
    if (!/on this device/.test(status)) throw Error('unexpected status ' + status);
    let image;
    for (let i = 0; i < 5; i++) { try { image = await wc.capturePage(); break; } catch (e) { if (i === 4) throw e; await wait(1500); } }
    fs.writeFileSync(SMOKE, image.toPNG());
    console.log('SMOKE OK', status);
    app.exit(0);
  } catch (e) { fail(e); }
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('web-contents-created', (_e, contents) => contents.on('will-attach-webview', e => e.preventDefault()));
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  serve();
  lockDown();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
