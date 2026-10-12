# Shiftwise

Official release: **v0.2.0**. See [release notes](RELEASE-NOTES.md), [install guide](INSTALL.md), [privacy notice](PRIVACY.md), [third-party notices](THIRD-PARTY-NOTICES.md), and [remaining legal setup](LEGAL-STATUS.md).

## Download the app

**[Downloads page →](https://github.com/superclearice97-droid/shiftwise/releases/latest)**

- **Android:** `Shiftwise-<version>-android.apk`
- **Linux:** `.AppImage` (any distro), `.pacman` (Arch/CachyOS), `.deb` (Ubuntu/Debian) or `.zip`

The apps work offline, with no account or server. Records are encrypted and stay on that device. See [INSTALL.md](INSTALL.md) for step-by-step instructions.

Work, money, goals, daily spending receipts, and household supplies in one app: a hosted website plus downloadable Android and Linux apps. This is the source snapshot of the existing Shiftwise app, imported from its Sites project on October 12, 2026.

Live app: https://shiftwise-work-money.superclearice97.chatgpt.site

The live app's access policy is separate from this repository. A public repository does not make the live app or its financial records public.

## Included

- Shift logging, weekly hours, configurable workweek start, overtime and estimated take-home pay.
- Expense logging, daily itemized receipts, category summaries, budget comparisons, and locally generated spending suggestions.
- Savings goals and weekly report cards.
- Restock countdowns and shopping lists; saved deals, coupons, rebates and cashback tracking.
- Investment tracking and limited crypto quotes. No connected bank or payroll feeds.
- Original Canvas 2D isometric night city in grey line art: low-rise blocks, glass towers, palms, forests, marina and port. An elevated metro runs from the city across a gorge bridge to a farming village. Also bubble tab transitions, themes, and pause/reduced-motion controls.
- AES-GCM vault encryption, encrypted device storage, encrypted backups and offline synchronization.

Pay figures are estimates, not payroll or tax-return calculations. Daily receipts include manually logged expenses only. Savings suggestions are category-based rules, not verified alternative prices or AI analysis.

## Build and test

Install Node.js 22 LTS or newer and npm, then run:

```sh
git clone https://github.com/superclearice97-droid/shiftwise.git
cd shiftwise
npm ci
npm run build
npm test
```

`npm run build` bundles `src/city-world.js` into `public/city-world.js` and packs the public assets with the Worker into `dist/server/index.js`. Generated output is not committed. `npm test` rebuilds first, then runs the Node-based checks for calculations, encryption, sync, receipts, city geometry and transition lifecycle.

These tests do not replace browser/device testing. Frame rate depends on hardware and browser settings; 120 FPS is not guaranteed.

## Android and Linux apps

The apps live in `apps/`. `node apps/build-www.mjs` copies `public/` into `apps/www`. It adds `public/device.js`, which replaces the server API with encrypted on-device storage that enforces the server's rules, and it drops the web-only service worker and install pages. Then:

- **Android:** Capacitor 8. `apps/android-build.sh` generates the Android project, applies icons, turns off cloud backup, builds and signs the APK. It needs JDK 21 and the Android SDK.
- **Linux:** Electron, packaged by electron-builder (`npm run linux` in `apps/`) as AppImage, zip, deb and pacman. `apps/electron/main.cjs` serves only the bundled files, blocks every network request except the opt-in price lookup, and denies device permissions.

`.github/workflows/release.yml` builds everything on each push to `main`. It smoke-tests the AppImage (creating and unlocking a vault) and the APK (on an Android 14 emulator), then publishes a release when `package.json` has a new version.

### Android signing

Add these repository secrets (Settings → Secrets and variables → Actions) so CI signs the APK with the release key: `ANDROID_KEYSTORE_B64` (the keystore file, base64), `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` (`shiftwise`). Without them, CI produces an unsigned APK and holds the release as a draft. Always sign with the same key, or Android will refuse to update installed copies. Keep a private backup of the keystore and never commit it.

## Runtime and hosting

This repository is a source-code transfer, not a hosting or database migration. GitHub commits do not automatically deploy to the current live app.

The existing runtime is a Cloudflare-compatible Worker hosted through Sites, with a D1 database bound as `DB`. Its schema migration is `drizzle/0000_safe_hellcat.sql`. `.openai/hosting.json` retains the existing Sites project identity so future Sites updates target the correct project. It contains no access credential.

**GitHub Pages cannot run the complete app.** Merely serving `public/` also does not provide account authentication or synchronization. There is no configured standalone local development server in this source snapshot.

The current Worker trusts the `oai-authenticated-user-id` header supplied by the Sites authentication layer. Before hosting elsewhere, replace that assumption with verified server-side authentication and reject/strip client-supplied identity headers. Provision a database and apply the schema before enabling sync. Do not expose this Worker directly with its current trusted-header authentication assumption.

If the app's domain changes, browser offline data does not automatically move between origins. Export an encrypted backup through the existing app and retain your vault passphrase before changing hosting. Identity-bound vaults also require a planned account migration; restoring across unrelated account IDs must not be assumed to work.

## Source map

| Path | Purpose |
| --- | --- |
| `public/app.js`, `public/features.js` | Core interface, work/pay/budget views, themes and goals |
| `public/receipts.js` | Daily expense receipts and local suggestions |
| `public/restock.js`, `public/discounts.js`, `public/offers.js` | Household supplies and savings tools |
| `public/crypto.js`, `public/vault.js`, `public/sync.js`, `public/storage.js` | Encryption, unlocking, offline persistence and synchronization |
| `public/experience.js`, `public/city.css`, `public/city.js` | Animations, sounds and city workspace interface |
| `src/city-model.js`, `src/city-world.js` | Original isometric city model and Canvas 2D renderer |
| `public/device.js`, `apps/` | Device-only mode and the Android/Linux app packaging |
| `public/city-fallback.js` | Legacy canvas city (no longer loaded; kept for its test) |
| `worker.js`, `markets.js` | State and quote endpoints |
| `db/`, `drizzle/` | Database schema and migrations, not user data |
| `tests/` | Automated checks |

## Privacy and security

No production database, financial records, vault passphrases or deployment secrets are included. Record content is encrypted in the browser; account identifiers and encryption metadata are not hidden. The unlocked page necessarily holds readable data in memory. See `SECURITY.md` for the protection model and limits.

Keep encrypted exports, database copies, credentials and environment files out of Git. Do not post financial records or passphrases in issues.

## Notices

Third-party license texts ship in `public/third-party-licenses.txt`. Bundled DejaVu fonts keep their notice at `public/font-license.txt`. This project does not include the Factory Yard repository's source code.

No overall open-source license has been selected for Shiftwise in this import. Public visibility alone is not a license grant. The owner can choose a license separately.
