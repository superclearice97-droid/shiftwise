import {build} from 'esbuild';
await build({entryPoints:['src/city-world.js'],bundle:true,format:'iife',minify:true,outfile:'public/city-world.js',legalComments:'inline'});
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const assets={},types={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',webmanifest:'application/manifest+json',jpg:'image/jpeg',png:'image/png',ttf:'font/ttf',txt:'text/plain; charset=utf-8'};
for(const name of fs.readdirSync('public')){const ext=name.split('.').at(-1);if(!types[ext])continue;const binary=['png','jpg','ttf'].includes(ext);assets['/'+name]={body:fs.readFileSync('public/'+name,binary?'base64':'utf8'),type:types[ext],binary};}
const revision=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);assets['/sw.js'].body=assets['/sw.js'].body.replace('__SHELL_VERSION__','shiftwise-shell-'+revision);
fs.mkdirSync('dist/server',{recursive:true});fs.writeFileSync('dist/server/index.js','const ASSETS='+JSON.stringify(assets)+';\n'+fs.readFileSync('public/core.js','utf8')+'\n'+fs.readFileSync('public/crypto.js','utf8')+'\n'+fs.readFileSync('markets.js','utf8')+'\n'+fs.readFileSync('worker.js','utf8'));
