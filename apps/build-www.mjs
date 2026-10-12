// Builds the web files packaged inside the Android and Linux apps (apps/www).
// Same interface as the hosted app, plus device.js (on-device encrypted storage, no server).
// Run from the repository root after `npm run build`.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'public'), out = path.join(root, 'apps', 'www');
// Hosted-web-only files: service worker, browser install pages, web manifest and unused legacy art.
const skip = new Set(['sw.js', 'install.html', 'install.js', 'update.html', 'update.js', 'manifest.webmanifest', 'city-night.jpg', 'city-fallback.js']);

if (!fs.existsSync(path.join(src, 'city-world.js'))) throw Error('Run `npm run build` first: public/city-world.js is missing.');
fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(out, {recursive: true});
for (const name of fs.readdirSync(src)) if (!skip.has(name)) fs.copyFileSync(path.join(src, name), path.join(out, name));

const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
  "img-src 'self' data: blob:", "connect-src 'self' https://api.exchange.coinbase.com",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-src 'none'"
].join('; ');

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const replace = (from, to) => { if (!html.includes(from)) throw Error('index.html changed; update apps/build-www.mjs: ' + from); html = html.replace(from, to); };
replace('<meta charset="utf-8">', `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`);
replace('<link rel="manifest" href="/manifest.webmanifest">', '');
replace('<a class="install-shortcut" href="/install.html">Install app</a>', '');
replace('<script src="vault.js"></script>', '<script src="device.js"></script><script src="vault.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

for (const name of fs.readdirSync(out)) if (name.endsWith('.html')) {
  const page = fs.readFileSync(path.join(out, name), 'utf8');
  if (/install\.html|manifest\.webmanifest/.test(page) && name !== 'index.html') fs.writeFileSync(path.join(out, name), page.replace(/<link rel="manifest"[^>]*>/g, ''));
}
console.log('apps/www ready:', fs.readdirSync(out).length, 'files');
