// "Skip phase" button: real UI clicks through all 9 phases (desktop + phone), console errors, score sheet marks, every phase playable afterwards.
import { launch } from './pw.mjs';
import fs from 'fs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
fs.mkdirSync('shots/v9', { recursive: true });
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(700);
const ph = () => page.evaluate(() => __sim.state.phase);
const txt = (s) => page.evaluate((q) => document.querySelector(q).textContent, s);
// ---- layout of the button
const lay = await page.evaluate(() => { const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; }; return { skip: r('#btnSkip'), set: r('#btnSettings'), rs: r('#btnReset'), vw: innerWidth, sx: document.documentElement.scrollWidth, cx: document.documentElement.clientWidth, label: document.querySelector('#btnSkip').textContent }; });
ok(lay.skip.h >= 44, `Skip phase button is ${Math.round(lay.skip.w)}x${Math.round(lay.skip.h)} px (>= 44 high)`); ok(/Skip phase/.test(lay.label), 'label: ' + lay.label);
if (mobile) { const sameRow = Math.abs(lay.skip.y - lay.set.y) < lay.skip.h && Math.abs(lay.skip.y - lay.rs.y) < lay.skip.h; ok(lay.set.r <= lay.skip.x + 1 && lay.skip.r <= lay.rs.x + 1, `phone: placed between Settings (right ${Math.round(lay.set.r)}) and Reset (left ${Math.round(lay.rs.x)}): ${Math.round(lay.skip.x)}..${Math.round(lay.skip.r)}`); }
else ok(lay.skip.r <= lay.vw && lay.skip.x >= 0, 'desktop: in the header, inside the window');
ok(lay.sx <= lay.cx, 'no horizontal scroll'); await page.screenshot({ path: `shots/v9/${prof}-header-skip.png` });
// ---- chips: only the next circle is tappable
ok((await ph()) === 1, 'start in phase 1');
await page.evaluate(() => { document.querySelector('.chip[data-p="4"]').click(); }); ok((await ph()) === 1, 'tapping a circle 3 ahead does nothing');
await page.evaluate(() => { document.querySelector('.chip[data-p="1"]').click(); }); ok((await ph()) === 1, 'tapping the current circle does nothing');
await page.evaluate(() => { document.querySelector('.chip[data-p="2"]').click(); }); ok((await ph()) === 2, 'tapping the NEXT circle skips forward by one'); 
// ---- 1 -> 9 by real clicks
const names = ['Femoral entry', 'Descending aorta', 'Arch', 'Cross and centre', 'Cusp overlap', 'Stop at 80%', 'Release', 'Nosecone out', 'Close'];
for (let n = 2; n <= 8; n++) {
  const before = await ph(); await page.click('#btnSkip'); await page.waitForTimeout(250); const after = await ph();
  ok(before === n && after === n + 1, `click Skip phase: ${before} -> ${after}`);
  const t = await txt('#coachText'); ok(new RegExp('Phase ' + before + ' was skipped').test(t), `coach line after skipping ${before}: "...${t.slice(-70)}"`);
  ok(await page.evaluate(() => !__sim.state.fx), 'no fluoro problem left over');
  if (after === 5) { await page.screenshot({ path: `shots/v9/${prof}-phase5.png` }); }
}
ok((await ph()) === 9, 'reached phase 9 by clicks'); ok(/Finish \/ show score/.test(await txt('#btnSkip')), 'phase 9: button reads "' + (await txt('#btnSkip')) + '"');
await page.screenshot({ path: `shots/v9/${prof}-phase9.png` });
await page.click('#btnSkip'); await page.waitForTimeout(600);
ok(await page.locator('#scoreModal').isVisible(), 'Finish / show score opens the score sheet');
const sheet = await page.evaluate(() => ({ box: document.querySelector('#skippedBox')?.textContent || '', rows: [...document.querySelectorAll('#scoreTable tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')) }));
ok(/Skipped by learner/.test(sheet.box) && (sheet.box.match(/was skipped, so/g) || []).length === 9, 'sheet lists all 9 phases under "Skipped by learner"');
ok(sheet.rows.length === 9 && sheet.rows.every(r => /SKIPPED/.test(r) && /Skipped by learner \(phase/.test(r) && /was skipped, so .* not assessed/.test(r)), 'all 9 rows are marked SKIPPED with a proctor sentence');
ok(sheet.rows.some(r => /Depth at the NCC.*Phase 5 \(Cusp overlap: land the inflow\) was skipped, so the landing/.test(r)), 'e.g. "Phase 5 ... was skipped, so the landing and the slow unsheathing to the 80% lock was not assessed."');
await page.screenshot({ path: `shots/v9/${prof}-score-all-skipped.png` });
ok(await page.evaluate(() => document.querySelector('#btnSkip').disabled), 'Skip is disabled once the sheet is final');
// ---- Reset, then partial skip and PLAY each phase for real
await page.click('#scClose'); await page.click('#btnReset'); await page.waitForTimeout(500); ok((await ph()) === 1, 'Reset -> phase 1');
const mouseHold = async (sel, ms) => { await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(150); const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(300); };
for (let i = 0; i < 4; i++) { await page.click('#btnSkip'); await page.waitForTimeout(150); } ok((await ph()) === 5, 'skipped 4 times -> phase 5');
let f0 = await page.evaluate(() => __sim.state.dev.f); await mouseHold('#hDep', 2000); let f1 = await page.evaluate(() => __sim.state.dev.f); ok(f1 > f0 + 0.04, `phase 5 is playable: holding Deploy slow raised f ${f0.toFixed(3)} -> ${f1.toFixed(3)}`);
if (mobile) { f0 = f1; await mouseHold('#mHoldDep', 1500); f1 = await page.evaluate(() => __sim.state.dev.f); ok(f1 > f0 + 0.03, 'and the phone Hold-to-deploy button works too'); }
await page.click('#btnSkip'); await page.waitForTimeout(300); ok((await ph()) === 6 && await page.evaluate(() => __sim.state.dev.locked && Math.abs(__sim.state.dev.f - 0.8) < 0.01), 'skip from a part-deployed phase 5 -> phase 6, locked at 80%');
await page.click('#btnSkip'); await page.waitForTimeout(300); ok((await ph()) === 7 && await page.evaluate(() => !__sim.state.dev.locked), 'phase 7 unlocked');
f0 = await page.evaluate(() => __sim.state.dev.f); await mouseHold('#hDep', 1500); f1 = await page.evaluate(() => __sim.state.dev.f); ok(f1 > f0 + 0.03, `phase 7 is playable: the wheel carries on past 80% (${f0.toFixed(2)} -> ${f1.toFixed(2)})`);
await page.click('#btnSkip'); await page.waitForTimeout(400); ok((await ph()) === 8 && await page.evaluate(() => __sim.state.dev.released), 'skip -> phase 8, released');
if (mobile) await page.click('#ctabs button[data-t=handle]'); { await page.evaluate(() => document.querySelector('#hMacro').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); const b = await page.locator('#hMacro').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); const t = Date.now(); while (Date.now() - t < 20000 && !(await page.evaluate(() => __sim.state.dev.macro >= 1))) await page.waitForTimeout(300); await page.mouse.up(); await page.waitForTimeout(300); } ok(await page.evaluate(() => __sim.state.dev.macro >= 1), 'phase 8 is playable: the macro slide closes the nosecone');
await page.click('#btnSkip'); await page.waitForTimeout(300); ok((await ph()) === 9, 'phase 9');
// closure items left undone: real closure from the UI still works
await page.evaluate(() => { const A = __sim.act; A.aortogram('root'); A.removeWire(); A.aortogram('iliac'); A.preclose(); A.preclose(); A.hemostasis(); }); await page.waitForTimeout(500);
ok(await page.locator('#scoreModal').isVisible(), 'phase 9 closure is playable and ends in the sheet');
const sh2 = await page.evaluate(() => ({ box: document.querySelector('#skippedBox')?.textContent || '', rows: [...document.querySelectorAll('#scoreTable tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')) }));
ok((sh2.box.match(/was skipped, so/g) || []).length === 8 && !/Phase 9/.test(sh2.box), 'sheet marks phases 1-8 (every skip) but not 9, which was played for real: ' + (sh2.box.match(/Phase \d/g) || []).join(','));
ok(sh2.rows.some(r => /Access closure.*PASS/.test(r)), 'closure row passes (it was done for real)');
// ---- hammering the button: 1 -> 9 several times in a row (Reset between)
for (let rep = 0; rep < 3; rep++) { await page.click('#scClose').catch(() => { }); await page.click('#btnReset'); await page.waitForTimeout(400); for (let i = 0; i < 9; i++) await page.click('#btnSkip', { delay: 0 }); await page.waitForTimeout(500); }
ok(await page.locator('#scoreModal').isVisible(), 'three rounds of 1 -> 9 -> sheet by clicking as fast as possible: no soft-lock');
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 3)));
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
