// v13 stale-build protection: visible build marker (footer + Settings), no-cache metas, and the "newer build available" banner (served over http, server reports another marker).
import { launch } from './pw.mjs';
import http from 'http'; import fs from 'fs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const html = fs.readFileSync('index.html', 'utf8'); const mk = /navitor-build" content="([^"]+)"/.exec(html)[1];
let served = html; let hits = 0;
const srv = http.createServer((q, r) => { if (q.url.includes('v=')) hits++; r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'max-age=600' }); r.end(served); }).listen(0);
const port = srv.address().port;
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto(`http://localhost:${port}/`); await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(2500);
ok(/^micro-recapture-[0-9a-f]{10}$/.test(mk), 'build marker format: ' + mk);
ok((await page.evaluate(() => [...document.querySelectorAll('meta[http-equiv]')].map(m => m.httpEquiv.toLowerCase() + '=' + m.content).join(' | '))).includes('cache-control=no-cache, no-store, must-revalidate'), 'no-cache meta tags present');
ok((await page.locator('#buildMark').textContent()).includes(mk), 'footer shows the build marker: ' + (await page.locator('#buildMark').textContent()));
ok(await page.locator('#buildMark').isVisible(), 'footer marker is visible (' + JSON.stringify(await page.locator('#buildMark').boundingBox()) + ')');
ok(await page.locator('#updBanner').isHidden(), 'same marker on the server: no update banner (version checks sent: ' + hits + ')'); ok(hits >= 1, 'page asked the server for a fresh copy (?v=, no-store)');
await page.click('#btnSettings'); await page.waitForTimeout(300); ok((await page.locator('#buildMarkSettings').textContent()) === mk, 'Settings shows the build marker'); await page.screenshot({ path: `shots/v13/${prof}-settings-build.png` }); await page.click('#stClose');
// the server now has a newer build
served = html.replace(mk, 'micro-recapture-ffffffffff'); await page.evaluate(() => __checkBuild()); await page.waitForTimeout(600);
ok(await page.locator('#updBanner').isVisible(), 'newer build on the server -> banner "A newer build is available" appears'); ok(/Reload/.test(await page.locator('#updReload').textContent()), 'banner has a Reload button');
await page.screenshot({ path: `shots/v13/${prof}-update-banner.png` });
const real = logs.filter(l => !/GPU stall|swiftshader|WebGL|Automatic fallback|GroupMarker/i.test(l)); ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real[0] : ''));
console.log(`\nversion-e2e ${prof}: ${pass} passed, ${bad} failed`); await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
