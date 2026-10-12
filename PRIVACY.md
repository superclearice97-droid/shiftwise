# Shiftwise privacy and data notice

Version 0.2.1 — October 12, 2026. This describes the current app code and known hosting dependencies, not an independently audited assurance. It covers the hosted website and the downloadable Android and Linux apps; the differences are described under “Downloadable apps”.

## What you enter

Shiftwise handles work shifts, pay settings, expenses, goals, household supplies, saved offers and investment entries you choose to record. It has no bank or payroll connection. Daily receipts and spending suggestions are computed locally from your entered expenses. The app does not send those entries to an AI provider.

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
- The apps contain no advertising, analytics, crash reporting, tracking or automatic update checks. The Linux app blocks all network requests except the optional price lookup. Neither app requests camera, microphone, location, contacts or storage permissions. The Android app declares internet access only for the optional price lookup and outside links.
- The same 18-or-older self-declaration applies when creating a vault. The age you enter is checked on the device and not stored.

## Other services (website)

The existing deployment relies on Sites authentication and hosting and a Cloudflare-compatible Worker with D1 storage. Their own policies govern their handling of account and infrastructure information. The app sends requested public cryptocurrency symbols to its market quote provider through its server; it does not send vault holdings or balances to that provider. Following an external store, offer or documentation link subjects that visit to the destination's policies.

There is no app-owned advertising tracker, session-replay SDK, marketing-email sender or paid subscription flow in this release. This statement does not characterize independent platform logging or future deployments.

## Retention and control

You can edit/delete individual entries and export an encrypted backup. Individual deletion is synchronized as part of the encrypted record; it does not prove erasure from historical infrastructure backups or exported files. The release does not provide verified complete server-account deletion or a documented infrastructure retention schedule. These require an operator process before broader public onboarding.

New vault setup requires an 18-or-older self-declaration. It is not identity verification and the exact declared age is not stored by this code.

## Contact

The repository is maintained at https://github.com/superclearice97-droid/shiftwise. Use issues for nonsensitive software questions only. Do not post personal records, passphrases, account identifiers or security exploit details publicly. A verified private privacy/security contact remains an operator setup item; this notice must be updated when it is established.
