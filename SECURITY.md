# Shiftwise encrypted vault

## What is protected

After the user completes vault setup, account financial records, the device's offline state (including the merge baseline), and newly exported backups are encrypted in the browser. The server accepts only the versioned encrypted account envelope for writes. Authentication still comes from the private Sites access policy and platform-authenticated user headers.

AES-256-GCM is implemented with native Web Crypto, random 96-bit nonces per encryption, and 128-bit authentication tags. PBKDF2-HMAC-SHA-256 (600,000 iterations) derives a non-extractable key from the user's passphrase and a random 256-bit per-vault salt. Format/version, account ID, record purpose, algorithm, KDF parameters, and salt are authenticated as additional data. Account, device, and backup envelopes cannot be substituted for each other. Keys and passphrases are not persisted or sent to the server.

## Setup and migration

Vault setup claims the current server version with an encrypted snapshot before replacing the current device copy. A concurrent setup or change cannot overwrite a newer server version or silently replace an existing encrypted vault's salt. Existing readable server records remain readable until that account completes setup. Other devices must update and unlock separately to migrate their local copies. Readable writes from old app versions are rejected.

Historical database backups and storage media remnants are outside the application's deletion controls. Previously exported unencrypted files are unchanged. The upgrade does not retroactively encrypt or erase them.

## Unlock, recovery and sync

Each account needs its vault passphrase on every device. There is no reset or server recovery key. The user must save the passphrase separately (for example, in a password manager); encrypted backups require that passphrase. No passphrase-rotation workflow is currently provided.

Merging and validation of decrypted financial records happen on the client. The server checks encrypted envelope format, owner, purpose, size, salt consistency and optimistic concurrency versions; it cannot validate encrypted financial content. The device cache is IndexedDB ciphertext. Account ID, version, salt, nonce, encrypted size, requests, and timing are not secret metadata.

Auto-lock follows 5 minutes without interaction or 1 minute in the background, subject to browser scheduling. The screen is hidden when the page becomes hidden, and the timeout is checked on return. Locking waits for encrypted writes, clears active key/data references and modal handlers, and requires another unlock. Javascript garbage collection and OS memory are not secure-erasure guarantees. Sync operates only while unlocked and online; timers use persisted start times.

## Boundaries

This protects record contents at rest and from routine inspection by the application server. It does not protect an unlocked screen, malware, malicious extensions, a compromised browser/device, or malicious replacement of the delivered application code. The hosting/application-code supply chain remains trusted. CSP restricts scripts and network requests to the same origin, but this does not substitute for an independent security review.

This implementation has not undergone an independent cryptographic audit, penetration test, or physical-device security assessment. Platform transport encryption and historical-backup lifecycle were not independently audited.

## Verification

- `node build.mjs`
- `node tests/encryption.test.mjs`
- `node tests/sync.test.mjs`

These exercise authenticated encryption, tamper/wrong-passphrase rejection, account/purpose binding, key non-extractability, plaintext-write rejection, migration, offline encrypted unlock, conflict merging, retries, key clearing, and concurrent setup. Browser UI, platform authentication, storage eviction, and operating-system behavior require separate device testing.

## Investments and quotes

Holdings, quantities, cost basis, account balances, balance history, assumptions and workweek preferences are inside the same encrypted vault. The optional authenticated `/api/markets` endpoint accepts only public crypto symbols and requests USD last-trade snapshots from Coinbase. Requested symbols, request timing and authenticated identity are visible to the app service; Coinbase sees the service's symbol requests. No balances, quantities or vault keys are submitted. The server caches only public quotes for up to one minute. Client quotes are held in memory and cleared on vault lock or removal of the offline copy; offline valuations fall back to user-entered prices. No brokerage, bank or retirement provider is linked.

## Discounts

Watchlist items, product URLs, observed prices, targets and alert dismissals are encrypted with the rest of the vault. Price checks are manual; no product URLs are fetched by the app server and no background push service is connected. In-app alerts are computed after unlock from recorded observations. Store links require HTTPS, reject embedded credentials, and open with no referrer. Opening a store link leaves the app and exposes the normal visit to that store.

## Savings offers and sharing

Coupon codes, cashback and rebate entries, deadlines, private notes and savings amounts use the encrypted vault and offline synchronization. Sharing is user-initiated: only offers explicitly marked publicly shareable expose a preview. The preview contains the offer title, store, benefit, code, expiry, terms and public link. Private notes, redemption status and expected/actual amounts are excluded. Copying creates plaintext on the user's clipboard; no message is sent automatically. External discovery links do not import or redeem offers. Rotating tiles display saved data only, stop while locked or hidden, pause on focus/hover, and honor reduced-motion preferences.

## Motion and celebrations

Tile layout, experience preferences and deduplicated achievement markers are part of the encrypted vault. Sounds are synthesized locally through Web Audio; no audio service or external script is used. Vault lock clears achievement baselines, rendered celebrations and audio context. Goals already complete at unlock are not replayed; later threshold crossings and confirmed final weekly reviews may celebrate once per goal/week. Device reduced-motion settings override animation preferences.

## Household supplies
Restock supply cycles, shopping flags, cost estimates, and links to price/offer records are stored inside the same encrypted vault and use the same encrypted offline and synchronization paths. Calendar reminders are exported only on a user's explicit action and contain a plaintext supply name and reminder date; the receiving calendar manages that exported copy. Install instructions contain no vault data.
