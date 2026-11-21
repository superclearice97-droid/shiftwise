# Shiftwise encrypted vault

## What is protected

After the user completes vault setup, account financial records, the device's offline state (including the merge baseline), and newly exported backups are encrypted in the browser. The server accepts only the versioned encrypted account envelope for writes. Authentication still comes from the private Sites access policy and platform-authenticated user headers. On a Cloudflare deployment (HOSTING.md, `AUTH=cloudflare-access`), every `/api/` request needs a Cloudflare Access token. The Worker verifies its RS256 signature against the team's published keys, plus its issuer, audience, expiry and subject. Client-supplied identity headers are discarded, and data requests are refused when the sign-in settings are missing. Pages cannot be framed by other sites in that mode.

Phone reminders (`/api/push`, `push.js`, `public/webpush.js`, `public/notify.js`) are opt-in. The browser encrypts each reminder to its own push subscription with RFC 8291 (aes128gcm). It uploads only ciphertext, due times and the push endpoint, so the server cannot read reminder text and holds no subscription decryption keys. Endpoints must be HTTPS URLs on the Apple, Google, Mozilla or Microsoft push services (no credentials, no custom ports), which keeps the server from posting to arbitrary hosts. Each push address belongs to one account. There are at most 5 devices per account and 60 queued reminders per device, due no more than 40 days ahead. Deliveries carry a VAPID ES256 token, valid for 12 hours, signed with `VAPID_PRIVATE_KEY`. The deploy workflow creates that Cloudflare secret on the first deploy and never prints it. Due times are visible to the server and reveal when planned shifts end.

Bank connections (`/api/bank`, `plaid.js`, `public/bankcrypto.js`, `public/banking.js`, `public/bank.html`) request only Plaid's Transactions product. Plaid access tokens are sealed with AES-256-GCM under the `BANK_TOKEN_KEY` Worker secret (bound to account and connection ID) and never sent to the browser. The vault generates a P-256 key pair and the private key stays inside the encrypted vault. The server encrypts each fetched batch to the public key (ephemeral ECDH, HKDF-SHA-256, AES-256-GCM) before storing it, and deletes the batch after the vault acknowledges it. The server handles transaction data in plaintext only while fetching and encrypting. Plaid Link runs on its own page, `/bank.html`, whose CSP allows only Plaid's Link script and frame plus Plaid's API hosts. Every other page keeps the strict self-only policy. Plaid requests disable redirects and time out after 20 seconds. Connections are scoped per account (other accounts get 404), limited to 10, and synced at most every 6 hours by the scheduler, or every 10 minutes when requested.

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

Watchlist items, product URLs, observed prices, targets and alert dismissals are encrypted with the rest of the vault. Manual observations remain available. Opt-in store API requests fetch explicit location prices; product webpage URLs are never scraped. Optional polling runs only while visible and unlocked; no background push service is connected. In-app alerts are computed after unlock from recorded observations. Store links require HTTPS, reject embedded credentials, and open with no referrer. Opening a store link leaves the app and exposes the normal visit to that store.

## Savings offers and sharing

Coupon codes, cashback and rebate entries, deadlines, private notes and savings amounts use the encrypted vault and offline synchronization. Sharing is user-initiated: only offers explicitly marked publicly shareable expose a preview. The preview contains the offer title, store, benefit, code, expiry, terms and public link. Private notes, redemption status and expected/actual amounts are excluded. Copying creates plaintext on the user's clipboard; no message is sent automatically. External discovery links do not import or redeem offers. Rotating tiles display saved data only, stop while locked or hidden, pause on focus/hover, and honor reduced-motion preferences.

## Motion and celebrations

Tile layout, experience preferences and deduplicated achievement markers are part of the encrypted vault. Sounds are synthesized locally through Web Audio; no audio service or external script is used. Vault lock clears achievement baselines, rendered celebrations and audio context. Goals already complete at unlock are not replayed; later threshold crossings and confirmed final weekly reviews may celebrate once per goal/week. Device reduced-motion settings override animation preferences.

## Household supplies
Restock supply cycles, shopping flags, cost estimates, and links to price/offer records are stored inside the same encrypted vault and use the same encrypted offline and synchronization paths. Calendar reminders are exported only on a user's explicit action and contain a plaintext supply name and reminder date; the receiving calendar manages that exported copy. Install instructions contain no vault data.

## Store and AI request boundary

Keys are encrypted in the vault at rest, but available in unlocked memory. The hosted `/api/deals` endpoint requires authenticated identity, same-origin Origin, JSON, size limits and an exact-origin allowlist (`DEAL_API_ORIGINS`; OpenAI/Kroger by default). Redirects are disabled. Only trusted public HTTPS origins should be enabled: this allowlist is not a DNS rebinding defense for malicious approved hosts. Hosted requests transiently expose the selected key and shopping context to the hosting runtime. At-rest end-to-end vault encryption does not cover API request bodies. No credentials or provider bodies are logged. Configure platform rate limits; the in-memory guard is per isolate.

Downloaded Linux routes deal requests through the same-app native handler, retaining the renderer network deny policy. Its native transport permits HTTPS or explicit local HTTP hosts (numeric RFC1918/loopback and localhost). Android uses Capacitor native HTTPS requests with redirects disabled, without widening renderer CSP. Android local AI requires a trusted HTTPS gateway. AI uses only a minimal projection of current feed observations and explicit question/ZIP after confirmation. Returned content is escaped plain text and cannot execute HTML or create price records. Vault lock invalidates pending responses and clears ephemeral AI/search state.
