// Real-UI: phase 4 can be left WITHOUT 'Confirm commissure alignment' (scored miss), other gates stay.
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
const st = () => page.evaluate(() => __sim.state);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __sim.setAngles(-30, -30); }); await page.waitForTimeout(500);
ok((await st()).phase === 4, 'phase 4 reached');
const skip = page.getByRole('button', { name: /Skip alignment check/ });
ok(await skip.isVisible(), 'a "Skip alignment check" button is offered next to "Confirm commissure alignment"');
ok(await page.getByRole('button', { name: /Confirm commissure alignment/ }).isVisible(), 'the confirm button is still there');
// ---- Skip with NOTHING satisfied (not crossed, not centred, no marker, no alignment): one click goes straight to phase 5
await page.screenshot({ path: `shots/v4/${prof}-phase4-skip-nothing-before.png` });
await skip.click(); await page.waitForTimeout(400);
let s = await st(); ok(s.phase === 5, 'Skip with nothing satisfied: ONE click -> phase 5 immediately');
ok(s.flags.alignSkipped && s.flags.skipNoCross, 'misses recorded: alignment not re-checked + valve not crossed');
let cb = (await page.innerText('#coachbar')).replace(/\s+/g, ' '); ok(/not crossed/i.test(cb) && /scored as a miss/i.test(cb), 'coach line names what was skipped: "' + cb.slice(0, 200) + '"');
ok(/skipped .*crossing the valve/i.test(cb) && /locked out/i.test(cb), 'phase 5 coach explains what to fix');
await page.screenshot({ path: `shots/v4/${prof}-phase5-after-skip-nothing.png` });
// phase 5 gates stay: the wheel refuses and says why
await page.evaluate(() => { __sim.setAngles(-30, -30); __sim.sim.act.wheel(0.05); });
s = await st(); ok(s.dev.f === 0 && /not across the annulus/i.test(s.note), 'unsheathing refused in phase 5: "' + s.note + '"');
await page.evaluate(() => { __sim.setAngles(32, 30); __sim.sim.act.wheel(0.05); }); s = await st(); ok(s.dev.f === 0 && /cusp-overlap/i.test(s.note), 'edge-on / cusp-overlap gate still applies: "' + s.note + '"');
// the proctor rows carry the misses at the end
await page.evaluate(() => { __sim.setAngles(-30, -30); __drv.goCross(); __drv.press(); __drv.toLock(); __drv.secondView(); __drv.release('fast'); __drv.phase8(); __drv.phase9(); }); await page.waitForTimeout(500);
const rows = await page.evaluate(() => Object.fromEntries(__sim.sim.score.rows.filter(r => ['nose', 'align'].includes(r.id)).map(r => [r.id, [r.pass, r.feedback]])));
ok(rows.nose && !rows.nose[0] && /pressed Skip before the valve had crossed/i.test(rows.nose[1]), 'nosecone/path row = scored miss with the proctor sentence');
ok(rows.align && !rows.align[0], 'alignment row = scored miss');
// ---- fresh case: the original walk-through (crossed, centred, on the plane, alignment skipped)
await page.evaluate(() => __sim.reset()); await page.waitForTimeout(400);
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __sim.setAngles(-30, -30); }); await page.waitForTimeout(500);
ok((await st()).phase === 4, 'fresh case: phase 4 again');
await page.evaluate(() => { __drv.goCross(); }); await page.waitForTimeout(500);
s = await st(); ok(s.phase === 4 && s.chk.crossed && s.chk.centered && s.chk.marker && !s.chk.alignConfirmed, 'crossed + centred + marker, alignment unconfirmed: still phase 4 (offered, not forced)');
ok(/scored miss/i.test(await page.innerText('#coachbar')), 'coach bar explains the scored-miss option');
await page.screenshot({ path: `shots/v4/${prof}-phase4-skip-offer.png` });
await skip.click(); await page.waitForTimeout(500);
s = await st(); ok(s.phase === 5 && s.flags.alignSkipped, 'Skip -> phase 5');
const coach = await page.innerText('#coachbar'); ok(/not re-checked at the annulus/i.test(coach) || /skipped the alignment/i.test(coach), 'coach line shown: "' + coach.replace(/\s+/g, ' ').slice(0, 170) + '"');
await page.screenshot({ path: `shots/v4/${prof}-phase5-after-skip.png` });
ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll');
// finish the case and read the proctor row
await page.evaluate(() => { __sim.setAngles(-30, -30); __drv.press(); __drv.toLock(); __drv.secondView(); __drv.release('fast'); __drv.phase8(); __drv.phase9(); }); await page.waitForTimeout(800);
s = await st(); const row = await page.evaluate(() => (__sim.sim.score.rows.find(r => r.id === 'align')));
ok(row && !row.pass && /not re-checked at the annulus after the arch/i.test(row.feedback), 'alignment row = scored miss: "' + (row && row.feedback.slice(0, 120)) + '"');
await page.waitForTimeout(500); await page.screenshot({ path: `shots/v4/${prof}-score-align-miss.png` });
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n'));
await browser.close(); process.exit(bad ? 1 : 0);
