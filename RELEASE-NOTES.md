# Shiftwise v0.3.0 — connected discounts

- Connect Kroger location-specific product prices with an authorized token, or another local store through a documented JSON API adapter.
- Search desired items and monitor up to 10 exact products/package sizes with target-price alerts and source-tagged price history.
- Optional refresh every 15 minutes while visible and unlocked, after a first manual check. No closed-app polling or push notifications.
- Compare current observations through OpenAI-compatible APIs; Linux can also use Ollama on a local/LAN address. Android requires HTTPS for local servers.
- API credentials/configuration and observations stay in the encrypted vault at rest. Each AI question requires confirmation; pay, expenses and balances are excluded.
- Setup: **Discounts → Connected deals → Connect store API**, then **AI & refresh settings**. See [API-CONNECTIONS.md](API-CONNECTIONS.md).

This source update is prepared for the existing Android/Linux release workflow. Real provider access still requires your authorized credentials; compatibility tests use simulated responses. The hosted website requires a separate deployment and custom-host allowlisting. Store website URLs alone are not APIs, and other retailer integrations need an adapter.

---

# Shiftwise v0.2.1

Shiftwise is a downloadable app for **Android** and **Linux**, with a redesigned city background and a new pop-up inspector for your numbers.

## Downloads

| Device | File | How to install |
| --- | --- | --- |
| Android 7 or newer | `Shiftwise-0.2.1-android.apk` | Open the file and tap Install |
| Linux (any distro) | `Shiftwise-0.2.1-linux-x86_64.AppImage` | Allow it to run as a program, then double-click |
| Arch, CachyOS, Manjaro | `Shiftwise-0.2.1-linux-x64.pacman` | `sudo pacman -U` the file |
| Ubuntu, Debian, Mint | `Shiftwise-0.2.1-linux-amd64.deb` | Open with Software Install |
| Linux, no install | `Shiftwise-0.2.1-linux-x64.zip` | Unzip and run `shiftwise` |

Step-by-step instructions are in [INSTALL.md](https://github.com/superclearice97-droid/shiftwise/blob/main/INSTALL.md).

## What's new in 0.2.1

- **Pop-up inspector for your finances.** The panel on the right now works like a map inspector: a label, one big figure, a status pill, a progress bar, right-aligned rows and an outlined action button. It follows the section you open. Work log shows hours, overtime, estimated take-home and taxes. Money shows spending against your budget with your top categories. Investments shows total value and gain or loss. Goals shows each goal's progress. Restock shows what's due. You can still pick a view by hand. Every number is calculated on your device from your own records, and nothing is sent anywhere.

## Since 0.2.0

- **Android and Linux apps.** They work fully offline, with no account or server. Records are encrypted with your vault passphrase and kept only on that device. Android cloud backup is turned off for the app. Export an encrypted backup from Pay settings to keep a copy.
- **New background.** A dark isometric night city in thin grey line art, modelled on a technical-drawing look: low-rise blocks with dot-grid windows, glass towers, palm-lined boulevards, forests, a marina with a breakwater and buoys, and a container port with cranes. The elevated metro calls at Northgate and Central, leaves the city, crosses a gorge on a truss bridge and pulls into the farming village of Millbrook (fields, barns, silos and a windmill), then heads back. Drag in Focus view to follow it. A "Fig 1" clock sits in the corner. It's drawn with Canvas 2D, so no WebGL or Three.js is needed. Pause, reduced-motion, zoom and drag-to-pan still work.
- **Phones:** the background control panel no longer covers the vault passphrase form.
- **Live crypto prices are opt-in** in the apps. Only coin symbols are sent, straight to Coinbase's public price service.
- New in-app **Privacy, licenses and limitations** page, plus bundled third-party notices.

## Records don't move between the website and the apps

The apps and the website keep separate records. To move records, export an encrypted backup in one and restore it in the other (Pay settings). Use the same vault passphrase in both.

## Verification

Every release runs the automated tests. The Linux AppImage is launched headlessly to create and unlock a vault. The Android APK is installed and launched on an Android 14 emulator, and its signature is checked with Google's `apksigner`. Physical-device performance isn't independently verified. Pay figures are estimates; check them against your pay stubs.

Android signing certificate SHA-256: `0D:20:36:8B:51:9B:28:5C:87:47:D7:01:A2:8B:F8:A6:46:88:0D:A8:C3:57:B2:FA:B4:D6:0C:CE:0A:DB:4F:60`
