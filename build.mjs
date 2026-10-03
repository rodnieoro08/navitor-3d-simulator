import { build } from 'esbuild';
import fs from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8');
let html = fs.readFileSync('src/template.html', 'utf8');
import crypto from 'crypto';
const marker = 'micro-recapture-' + crypto.createHash('sha1').update(js + css + html).digest('hex').slice(0, 10); // build marker, visible in <meta name="navitor-build">
html = html.replace('/*BUILD*/', marker);
html = html.replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
fs.writeFileSync('index.html', html);
console.log('build marker', marker); console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
