# Third-party notices

Full license texts that ship inside every version are in [`public/third-party-licenses.txt`](public/third-party-licenses.txt) and [`public/font-license.txt`](public/font-license.txt). The apps show them under **Privacy, licenses and limitations**.

- **DejaVu Sans, Sans Bold and Sans Mono** (all versions): Bitstream Vera license with DejaVu public-domain changes. The files are renamed `shiftwise-*.ttf` for local loading and are otherwise unmodified; this does not claim authorship of the typefaces.
- **Capacitor** `@capacitor/core`, `android`, `filesystem`, `share`, `browser` (Android app): MIT License. Copyright Drifty Co. and Ionic.
- **AndroidX libraries and the Kotlin standard library** (Android app, via Capacitor): Apache License 2.0. Copyright The Android Open Source Project and JetBrains. Unmodified.
- **Electron** (Linux app): MIT License. Copyright Electron contributors and GitHub Inc. The Linux app ships Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html`, which cover Chromium, Node.js and their components.
- **Build-only tools** (esbuild, Drizzle, electron-builder and the Capacitor CLI) keep their own licenses, as listed in `package-lock.json` and `apps/package.json`. They are not included in the apps beyond what the items above describe.
- The older `public/city-night.jpg` is an AI-generated image from earlier development. It is not used by the current background or by the apps.
- The animated city is original Shiftwise code (`src/city-world.js`, `src/city-model.js`) using the browser's Canvas 2D API. Three.js is no longer used. No Factory Yard source code or assets are included. The visual style takes general cues (monochrome isometric line art) from a reference video; no code, assets or names from it were copied.
- Coinbase is a trademark of its owner. Shiftwise is not affiliated with Coinbase.

Original Shiftwise code has no open-source license grant. Copyright and other rights stay with their holders, and the third-party licenses above remain in effect.
