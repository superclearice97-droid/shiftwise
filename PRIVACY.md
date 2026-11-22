# Shiftwise privacy and data notice

Version 0.2.1 — October 12, 2026; website hosting section updated November 21, 2026. This describes the current app code and known hosting dependencies, not an independently audited assurance. It covers the hosted website and the downloadable Android and Linux apps; the differences are described under “Downloadable apps”.

## What you enter

Shiftwise handles work shifts, your usual work schedule and schedule changes, pay settings, expenses, goals, household supplies, saved offers and investment entries you choose to record. It has no payroll connection. An optional, read-only bank connection on the website is described below. Daily receipts and spending suggestions are computed locally from your entered expenses. The app does not send those entries to an AI provider.

## Storage and synchronization

After vault setup, record content is encrypted in your browser using Web Crypto before account synchronization, device persistence and new backup export. The server receives ciphertext, account identifiers, record versions and cryptographic metadata. Network providers also receive request metadata. When you unlock the vault, readable content exists in memory and on screen. Encryption is not a guarantee against a compromised device, malicious scripts, lost credentials or every possible attack. Passphrases are not sent to the app server and cannot be recovered by the operator.

IndexedDB holds encrypted offline state. A service worker caches application assets. Neither closing the app nor uninstalling its shortcut necessarily removes browser storage. Browser data removal can destroy your only unsynced copy: export an encrypted backup before removing storage if you need to keep your records.

## Downloadable apps (Android and Linux)

The Android app (APK) and the Linux app (AppImage, zip, deb, pacman) work only on the device where they are installed. They have no Shiftwise account, no sign-in and no Shiftwise server, and they do not sync with the website or with other devices.

- Your records are encrypted with your vault passphrase and stored in the app's private storage on that device. Nothing you enter is uploaded.
- On Android, the app opts out of Android cloud backup and device-to-device transfer, so your encrypted records are not copied to Google's backup service. Removing the app, clearing its storage or losing the device removes your records. Export an encrypted backup (Pay settings) and keep your passphrase safe if you want a copy.
- When you export a backup or a restock reminder on Android, the system share sheet opens and you choose where the file goes (for example Files or Drive). That destination's terms then apply to the file. Backups are encrypted; calendar reminder files are not.
- Live crypto prices are off by default. If you turn them on (Appearance & app), the app asks Coinbase's public price service directly for the coin symbols you track, such as BTC. Only the symbols are sent, never amounts, balances or other records. Coinbase receives your device's internet address and request timing, as with any website. You can turn this off at any time.
- Links to stores and offers open in your normal browser.
- The apps contain no advertising, analytics, crash reporting, tracking or automatic update checks. The Linux renderer blocks external requests except the optional crypto lookup; configured store and AI APIs use a validated native transport. Neither app requests camera, microphone, location, contacts or storage permissions. The Android app declares internet access for optional quote, store and AI requests and outside links.
- The same 18-or-older self-declaration applies when creating a vault. The age you enter is checked on the device and not stored.

## Other services (website)

The existing deployment relies on Sites authentication and hosting and a Cloudflare-compatible Worker with D1 storage. Their own policies govern their handling of account and infrastructure information.

A copy you host yourself on Cloudflare (HOSTING.md) uses Cloudflare Workers and D1 for hosting and storage, and Cloudflare Access for sign-in. Cloudflare then processes your email address and one-time sign-in codes, your Access user ID (used as the account identifier), the encrypted vault, request metadata such as IP address and timing, and the transient store/AI request payloads described below. Cloudflare's own privacy policy and terms govern that processing. The vault passphrase and readable records are not sent to Cloudflare. The app sends requested public cryptocurrency symbols to its market quote provider through its server; it does not send vault holdings or balances to that provider. Following an external store, offer or documentation link subjects that visit to the destination's policies.

There is no app-owned advertising tracker, session-replay SDK, marketing-email sender or paid subscription flow in this release. This statement does not characterize independent platform logging or future deployments.

## Phone reminders (website, optional)

Off until you tap **Remind me after each shift** and allow notifications. Your phone then works out reminders for your planned shifts over the next three weeks and encrypts each reminder's text on the phone to that phone's own push subscription, using the standard Web Push encryption. The Shiftwise server stores your phone's push address (an Apple, Google, Mozilla or Microsoft URL), your Access user ID, the time each reminder is due and the encrypted text. It cannot read the text, but the due times reveal when your planned shifts end. At the due time the server sends the encrypted reminder to your phone's push service, for example Apple Push Notification service, which delivers it. That push service sees the size and timing of each reminder and that it comes from your Shiftwise site, under its own privacy terms. Reminder text can appear on your lock screen, depending on your phone's notification settings.

Sent reminders are deleted from the server. So are reminders more than an hour overdue, the queued reminders for a phone you turn reminders off on, and the push address and reminders of a phone the push service reports as gone. Turn reminders off with **Turn off reminders** on the Work log, or in your phone's notification settings. The Android and Linux apps do not offer reminders.

## Bank connections (website, optional)

Off until you tap **Connect a bank** on the Money tab. Bank connections use Plaid, Inc. You sign in to your bank inside Plaid's window, so Shiftwise never receives your bank username or password. Shiftwise asks Plaid only for **transactions** (the read-only Transactions product) and cannot move money, pay bills or see your bank password. Plaid's collection and use of your data is covered by Plaid's End User Privacy Policy: https://plaid.com/legal/#end-user-privacy-policy. Plaid shows its own consent screen before you connect.

What Shiftwise stores and where:
- **In your vault (encrypted with your passphrase):** a private key for receiving bank data, and an expense record for each posted purchase. Each record holds the merchant name, amount, date, a spending category and the bank's name. Transfers, income, credit-card payments, refunds and pending charges are not added.
- **On the Shiftwise server:**
  - Plaid's access token for each connection, encrypted with a server key (`BANK_TOKEN_KEY`).
  - Plaid's item ID, the bank's name, and the sync position and status.
  - Your vault's *public* key.
  - Batches of new transactions waiting to be imported. Each batch keeps only the transaction ID, date, merchant name, amount, pending status and category, and is encrypted to your vault's public key so the server can't read it once stored. A batch is deleted as soon as your unlocked vault imports it.
- **In transit:** about every 6 hours (or when you tap **Check for new transactions**) the server asks Plaid for new transactions. It handles them in readable form briefly while reducing and encrypting them. Cloudflare, as host, processes that traffic.

Removing a connection asks Plaid to end Shiftwise's access and deletes the stored access token. Purchases already imported stay in your records until you delete them. On the free Plaid trial, removing a connection does not free a connection slot. The Android and Linux apps do not offer bank connections.

## Retention and control

You can edit/delete individual entries and export an encrypted backup. Individual deletion is synchronized as part of the encrypted record; it does not prove erasure from historical infrastructure backups or exported files. The release does not provide verified complete server-account deletion or a documented infrastructure retention schedule. These require an operator process before broader public onboarding.

New vault setup requires an 18-or-older self-declaration. It is not identity verification and the exact declared age is not stored by this code.

## Contact

The repository is maintained at https://github.com/superclearice97-droid/shiftwise. Use issues for nonsensitive software questions only. Do not post personal records, passphrases, account identifiers or security exploit details publicly. A verified private privacy/security contact remains an operator setup item; this notice must be updated when it is established.

## Optional store and AI API connections

Connections are off by default. Store checks disclose your entered ZIP, store location ID, product search and authorized bearer credential to the configured store API. No geolocation is used. API keys, watch targets and fetched prices are encrypted at rest with your other records and included in encrypted backups. AI questions require confirmation each time and send the ZIP, question and up to 30 current store observations; no pay, expenses, balances or vault passphrase. AI replies remain in memory and are cleared on lock/refresh.

The optional **AI deal watcher** is a separate opt-in in AI & refresh settings, off by default. When you turn it on, after each store refresh (manual, or the optional 15-minute refresh while the app is open and unlocked) Shiftwise automatically sends your ZIP, up to 30 current store observations (product names, sizes, stores, prices, regular prices, terms and times), the names, sizes, stores and targets of up to 10 API-linked watched items, and your optional watch note to your chosen AI provider, without a confirmation each time. Reviews are skipped when nothing changed since the last one. Offers are referenced by number only; no internal IDs, store keys, pay, expenses, balances or vault passphrase are sent. Its picks are kept in memory only and cleared on lock. Turn it off at any time with **Turn off** on the watcher card or in settings; nothing more is sent automatically after that.

The **Deals in motion** animation is drawn on your device from records already in your vault and sends nothing. API providers may charge fees and apply their own retention policies.

Downloaded apps connect directly through native transports. The website proxies approved provider requests, so its hosting service transiently handles API keys, search terms and AI context in plaintext; these request payloads are outside the vault encryption boundary. Shiftwise does not log or cache them, but independent infrastructure metadata policies still apply. Optional store polling runs only while visible and unlocked after a first manual check. No closed-app polling of store prices is provided, and price changes do not send push notifications. See API-CONNECTIONS.md for setup, supported providers, removal and limitations.
