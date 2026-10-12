// Device-only mode (Android/Linux apps): the on-device store must enforce the same rules as the server.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const store = new Map(), html = {classList: {add() {}}};
const scope = {crypto: webcrypto, TextEncoder, TextDecoder, atob, btoa, URL, Response, AbortSignal, JSON, Math, Number, Error, Promise, Set,
  document: {documentElement: html, addEventListener() {}}, location: {href: 'app://shiftwise/index.html'},
  localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, confirm: () => false, toast() {},
  offlineReady: false, updateSyncUI() {}};
scope.window = scope; scope.fetch = async () => { throw Error('network must not be used'); };
scope.LocalRecords = {rawGet: async k => store.get(k), rawPut: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); }};
vm.createContext(scope);
vm.runInContext(fs.readFileSync('public/crypto.js', 'utf8'), scope);
vm.runInContext(fs.readFileSync('public/device.js', 'utf8') + '\n;globalThis.rawApi=rawApi;globalThis.prepareOffline=prepareOffline;', scope);
const C = scope.VaultCrypto, api = scope.rawApi;

assert.equal(scope.SHIFTWISE_DEVICE, true);
const first = await api();
assert.match(first.userId, /^device-[0-9a-f]{32}$/);
assert.equal(first.data, null); assert.equal(first.version, 0);
assert.equal((await api()).userId, first.userId, 'device account id is stable');

const salt = C.newSalt(), key = await C.derive('test-only device vault phrase 42', salt);
const packet = await C.encrypt({shifts: []}, key, salt, first.userId, 'account');
await assert.rejects(() => api('PUT', {data: packet, version: 0, expectedUserId: first.userId}), /18 or older/);
await assert.rejects(() => api('PUT', {data: {readable: true}, version: 0, ageConfirmed: true}), /Encryption is required/);
await assert.rejects(() => api('PUT', {data: packet, version: 0, expectedUserId: 'someone-else', ageConfirmed: true}), /different vault/);
const wrongOwner = await C.encrypt({}, key, salt, 'other-owner', 'account');
await assert.rejects(() => api('PUT', {data: wrongOwner, version: 0, ageConfirmed: true}), /Encryption is required/);

assert.equal(JSON.stringify(await api('PUT', {data: packet, version: 0, expectedUserId: first.userId, ageConfirmed: true})), JSON.stringify({version: 1, userId: first.userId}));
const saved = await api();
assert.equal(saved.version, 1); assert.equal(JSON.stringify(saved.data), JSON.stringify(packet));
assert(!JSON.stringify([...store.values()]).includes('shifts'), 'only ciphertext is stored');
await assert.rejects(() => api('PUT', {data: packet, version: 0, expectedUserId: first.userId}), /newer version/);
const otherSalt = C.newSalt(), otherKey = await C.derive('a different device passphrase 7', otherSalt);
const otherPacket = await C.encrypt({}, otherKey, otherSalt, first.userId, 'account');
await assert.rejects(() => api('PUT', {data: otherPacket, version: 1}), /different passphrase/);
assert.equal((await api('PUT', {data: packet, version: 1, expectedUserId: first.userId})).version, 2);

// Server-only endpoints are answered locally; live quotes stay off unless the person agrees.
const quotes = await scope.fetch('/api/markets?symbols=BTC');
assert.equal(quotes.status, 403);
assert.equal((await scope.fetch('/api/state')).status, 404);
await scope.prepareOffline(); assert.equal(scope.offlineReady, true);
console.log('PASS: device-only store keeps encrypted records local, enforces age, encryption, owner, salt and version checks; quotes are opt-in.');
