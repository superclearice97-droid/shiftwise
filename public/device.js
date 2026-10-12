/* Device-only mode, used by the Android and Linux apps.
   There is no Shiftwise server in these apps. The encrypted vault is kept only on this device,
   in the app's private storage. This file replaces the network calls in sync.js with an
   on-device store that applies the same checks the server applies. It is loaded after
   sync.js and before vault.js, and is never served by the hosted web app. */
'use strict';
window.SHIFTWISE_DEVICE = true;
document.documentElement.classList.add('device-app');

const DeviceStore = {
  async accountId() {
    let id = await LocalRecords.rawGet('deviceAccountId');
    if (typeof id !== 'string') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = 'device-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      await LocalRecords.rawPut('deviceAccountId', id);
    }
    return id;
  },
  async read() {
    const r = await LocalRecords.rawGet('deviceVault');
    return r && typeof r === 'object' ? r : null;
  }
};

function deviceError(message, status) { const e = Error(message); e.status = status; return e; }

// Same contract as GET/PUT /api/state in worker.js, but stored on this device.
async function rawApi(method = 'GET', body) {
  const user = await DeviceStore.accountId(), current = await DeviceStore.read();
  if (method === 'GET') return {userId: user, data: current ? JSON.parse(JSON.stringify(current.payload)) : null, version: current?.version || 0};
  if (method !== 'PUT') throw deviceError('Method not allowed', 405);
  const {data: packet, version, expectedUserId, ageConfirmed} = body || {};
  if (expectedUserId && expectedUserId !== user) throw deviceError('This device copy belongs to a different vault. No records were changed.', 403);
  if (!VaultCrypto.valid(packet) || packet.owner !== user || packet.purpose !== 'account') throw deviceError('Encryption is required. Unlock your vault and try again.', 426);
  if (!Number.isInteger(version) || version < 0) throw deviceError('Invalid version', 400);
  if (!current && ageConfirmed !== true) throw deviceError('You must confirm you are 18 or older before creating a Shiftwise vault.', 403);
  if (current && VaultCrypto.valid(current.payload) && current.payload.kdf.salt !== packet.kdf.salt) throw deviceError('This device already has a vault with a different passphrase. No records were overwritten.', 409);
  if ((current?.version || 0) !== version) throw deviceError('A newer version is available. Merge and retry.', 409);
  await LocalRecords.rawPut('deviceVault', {payload: packet, version: version + 1});
  return {version: version + 1, userId: user};
}

// The app files are already installed, so there is no offline download to prepare.
async function prepareOffline() { offlineReady = true; updateSyncUI(); }

// ---------- Optional live crypto quotes (off until the person turns them on) ----------
// When on, only coin symbols such as BTC are sent, directly to Coinbase's public price service.
// Holdings, amounts and vault contents never leave the device.
const DeviceQuotes = {
  key: 'shiftwise-live-quotes',
  get allowed() { try { return localStorage.getItem(this.key) === 'on'; } catch { return false; } },
  set allowed(v) { try { v ? localStorage.setItem(this.key, 'on') : localStorage.removeItem(this.key); } catch {} },
  ask() {
    if (this.allowed) return true;
    const ok = confirm('Turn on live crypto prices?\n\nShiftwise will ask Coinbase’s public price service for the coin symbols you track (for example BTC). Only the symbols are sent — never your amounts, balances or other records. Coinbase will see your internet address, as with any website.\n\nYou can turn this off again in Appearance & app.');
    this.allowed = ok;
    return ok;
  },
  async fetchQuotes(symbols) {
    const quotes = [], errors = [];
    await Promise.all(symbols.map(async symbol => {
      try {
        const response = await originalFetch('https://api.exchange.coinbase.com/products/' + encodeURIComponent(symbol) + '-USD/ticker', {headers: {Accept: 'application/json'}, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(8000)});
        if (!response.ok) throw Error(response.status === 404 ? 'No Coinbase USD pair for this symbol.' : 'Quote provider is temporarily unavailable.');
        const r = await response.json(), price = Number(r.price), time = Date.parse(r.time);
        if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) throw Error('Provider returned an invalid quote.');
        quotes.push({symbol, price, currency: 'USD', time: new Date(time).toISOString(), source: 'Coinbase last trade', retrievedAt: new Date().toISOString()});
      } catch (e) { errors.push({symbol, message: e.name === 'TimeoutError' ? 'Quote request timed out.' : e.message || 'Quote unavailable.'}); }
    }));
    return {quotes, errors};
  }
};
const originalFetch = window.fetch.bind(window);
const sameApp = url => { const here = new URL(location.href); return url.protocol === here.protocol && url.host === here.host; };
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!sameApp(url) || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
  if (url.pathname === '/api/markets') {
    const symbols = [...new Set((url.searchParams.get('symbols') || '').split(',').filter(Boolean))];
    if (!symbols.length || symbols.length > 10 || symbols.some(s => !/^[A-Z0-9]{1,12}$/.test(s))) return reply({error: 'Use 1–10 crypto symbols such as BTC, ETH or SOL.'}, 400);
    if (!DeviceQuotes.ask()) return reply({error: 'Live prices are off. Manual prices still work.'}, 403);
    return reply(await DeviceQuotes.fetchQuotes(symbols));
  }
  return reply({error: 'Not available in the device app.'}, 404);
};

function deviceAppCard() {
  const platform = window.Capacitor?.getPlatform?.() === 'android' ? 'Android' : 'Linux';
  return `<div class="card"><h2>Shiftwise for ${platform}</h2><p class="sub">This app keeps everything on this device. There is no Shiftwise account or server, and nothing syncs to other devices. Your records are encrypted with your vault passphrase.</p><p class="sub"><strong>Keep a backup.</strong> If this device is lost or the app is removed, your records go with it. Export an encrypted backup from Pay settings now and then, and keep your passphrase somewhere safe.</p><h3>Live crypto prices</h3><p class="sub">${DeviceQuotes.allowed ? 'On. Only coin symbols are sent to Coinbase’s public price service.' : 'Off. Turn on to fetch prices from Coinbase; only coin symbols are sent.'}</p><button id="deviceQuotes" aria-pressed="${DeviceQuotes.allowed}">${DeviceQuotes.allowed ? 'Turn off live prices' : 'Turn on live prices'}</button><p class="sub"><a href="/legal.html">Privacy, licenses & limitations</a></p></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#deviceQuotes');
  if (!b) return;
  if (DeviceQuotes.allowed) { DeviceQuotes.allowed = false; toast('Live prices are off.'); } else if (DeviceQuotes.ask()) toast('Live prices are on.');
  if (typeof render === 'function' && ready) render();
});

// ---------- Android: files and outside links ----------
const nativePlugins = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins : null;
if (nativePlugins()) {
  // Android's web view cannot save downloads itself: write to the app cache and open the share sheet,
  // so the person can save to Files or Drive, or open a calendar file in their calendar app.
  window.deviceSaveFile = async (text, name) => {
    const {Filesystem, Share} = nativePlugins();
    try {
      const {uri} = await Filesystem.writeFile({path: name, data: text, directory: 'CACHE', encoding: 'utf8'});
      await Share.share({title: name, files: [uri], dialogTitle: 'Save or open ' + name});
    } catch (e) {
      if (!/cancel/i.test(String(e?.message || e))) toast('Could not open the save options. Please try again.');
    }
  };
  // Links to stores and offers open in the phone's browser, not inside Shiftwise.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const url = new URL(a.getAttribute('href'), location.href);
    if (sameApp(url) || !/^https?:$/.test(url.protocol)) return;
    e.preventDefault();
    nativePlugins().Browser.open({url: url.href});
  }, true);
}
