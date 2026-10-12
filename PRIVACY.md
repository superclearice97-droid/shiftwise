# Shiftwise privacy and data notice

Version 0.1.0 — October 12, 2026. This describes the current app code and known hosting dependencies, not an independently audited assurance.

## What you enter

Shiftwise handles work shifts, pay settings, expenses, goals, household supplies, saved offers and investment entries you choose to record. It has no bank or payroll connection. Daily receipts and spending suggestions are computed locally from your entered expenses. The app does not send those entries to an AI provider.

## Storage and synchronization

After vault setup, record content is encrypted in your browser using Web Crypto before account synchronization, device persistence and new backup export. The server receives ciphertext, account identifiers, record versions and cryptographic metadata. Network providers also receive request metadata. When you unlock the vault, readable content exists in memory and on screen. Encryption is not a guarantee against a compromised device, malicious scripts, lost credentials or every possible attack. Passphrases are not sent to the app server and cannot be recovered by the operator.

IndexedDB holds encrypted offline state. A service worker caches application assets. Neither closing the app nor uninstalling its shortcut necessarily removes browser storage. Browser data removal can destroy your only unsynced copy: export an encrypted backup before removing storage if you need to keep your records.

## Other services

The existing deployment relies on Sites authentication and hosting and a Cloudflare-compatible Worker with D1 storage. Their own policies govern their handling of account and infrastructure information. The app sends requested public cryptocurrency symbols to its market quote provider through its server; it does not send vault holdings or balances to that provider. Following an external store, offer or documentation link subjects that visit to the destination's policies.

There is no app-owned advertising tracker, session-replay SDK, marketing-email sender or paid subscription flow in this release. This statement does not characterize independent platform logging or future deployments.

## Retention and control

You can edit/delete individual entries and export an encrypted backup. Individual deletion is synchronized as part of the encrypted record; it does not prove erasure from historical infrastructure backups or exported files. The release does not provide verified complete server-account deletion or a documented infrastructure retention schedule. These require an operator process before broader public onboarding.

New vault setup requires an 18-or-older self-declaration. It is not identity verification and the exact declared age is not stored by this code.

## Contact

The repository is maintained at https://github.com/superclearice97-droid/shiftwise. Use issues for nonsensitive software questions only. Do not post personal records, passphrases, account identifiers or security exploit details publicly. A verified private privacy/security contact remains an operator setup item; this notice must be updated when it is established.
