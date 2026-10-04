// v13 "Back" (previous phase) button: real UI clicks on desktop + phone.
//  - disabled in phase 1; Back from every phase 2..9 goes to the previous phase with a self-consistent state (wire rail, device on the path, no failure, no console errors)
//  - gates still work going forward again; a full case can be completed after Back; Back is not a miss (clean run keeps 9/9) but is listed as information on the score sheet
//  - earlier misses stay on the sheet (no farming a clean score)
import { launch } from './pw.mjs';
import fs from 'fs'; fs.mkdirSync('shots/v13', { recursive: true });
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file://' + process.cwd() + '/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(800);
const mon = async () => { if (mobile) await page.locator('#viewtabs button[data-vt=mon]').click(); };
await mon(); await page.locator('button[data-mode=fluoro]').click().catch(() => {});
await page.evaluate(() => {
  window.__to = (ph) => { const D = __drv, s = __sim.sim;
    if (ph >= 2) D.goPhase1(); if (ph >= 3) { D.goDesc(); D.setRotation(); } if (ph >= 4) D.goArch(); if (ph >= 5) { D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); }
    if (ph >= 6) D.toLock(); if (ph >= 7) { D.secondView(); s.act.unlock(); } if (ph >= 8) D.release('fast'); if (ph >= 9) D.phase8(); return s.phase; };
  window.__finish = () => { const D = __drv, s = __sim.sim; let g = 0; while (!s.finished && g++ < 12) { const p = s.phase;
    if (p === 1) D.goPhase1(); else if (p === 2) { D.goDesc(); D.setRotation(); } else if (p === 3) D.goArch(); else if (p === 4) { D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); }
    else if (p === 5) { D.press(); D.toLock(); } else if (p === 6) { D.secondView(); s.act.unlock(); D.release('fast'); } else if (p === 7) D.release('fast'); else if (p === 8) D.phase8(); else if (p === 9) D.phase9();
    let w = 0; while (s.fx && w++ < 300) s.update(1 / 30); } return s.finished; };
  window.__rail = () => { const S = __sim.sim, dv = __sim.views.dev, T = __sim.THREE, cl = dv.cl, W = dv.wirePts || [], path = S.path;
    let mx = 0; for (let i = 0; i < cl.n; i++) { const pp = path.pos(dv.sTipNow - i * 2); mx = Math.max(mx, Math.hypot(cl.P[i * 3] - pp.x, cl.P[i * 3 + 1] - pp.y, cl.P[i * 3 + 2] - pp.z)); }
    const tip = cl.at(0, new T.Vector3()); let mt = 1e9; for (const p of W) mt = Math.min(mt, p.distanceTo(tip));
    return { axisDev: mx, wireToTip: W.length ? mt : null, nW: W.length, wireAhead: S.wire.s - S.dev.s, hold: S.wire.hold, removed: !!S.wire.removed, fx: !!S.fx, phase: S.phase, s: S.dev.s, f: S.dev.f, locked: S.dev.locked, released: S.dev.released, macro: S.dev.macro }; };
});
const st = () => page.evaluate(() => __sim.state);
const backBtn = page.locator('#btnBack');
// phase 1: disabled
ok(await backBtn.evaluate(b => b.disabled), 'phase 1: Back is disabled'); ok((await backBtn.getAttribute('aria-label')) !== null, 'aria-label present (phase 1): ' + (await backBtn.getAttribute('aria-label')));
await backBtn.click({ force: true, timeout: 1500 }).catch(() => {}); ok((await st()).phase === 1, 'phase 1: clicking the disabled Back does nothing');
// each phase 2..9
const names = ['', 'Femoral entry', 'Descending aorta', 'Arch', 'Cross and centre', 'Cusp overlap', 'Stop at 80%', 'Release', 'Nosecone out', 'Close'];
for (let p = 2; p <= 9; p++) {
  await page.evaluate(() => __sim.reset()); await page.waitForTimeout(250); await mon();
  const reached = await page.evaluate((p) => __to(p), p); ok(reached === p, `reached phase ${p}`);
  await page.waitForTimeout(200);
  ok(await backBtn.evaluate(b => !b.disabled), `phase ${p}: Back enabled`); const aria = await backBtn.getAttribute('aria-label'); ok(new RegExp('phase ' + (p - 1)).test(aria), `phase ${p}: aria-label "${aria}"`);
  const missesBefore = await page.evaluate(() => JSON.stringify(Object.keys(__sim.sim.flags).filter(k => /fail|Fail|miss|major|Try|Early/.test(k)).map(k => [k, __sim.sim.flags[k]])));
  await backBtn.click(); await page.waitForTimeout(600);
  const r = await page.evaluate(() => __rail()); const s = await st();
  ok(r.phase === p - 1, `Back ${p} -> ${r.phase}`);
  ok(!r.fx && !s.fx, `Back ${p}->${p - 1}: no failure / fluoro problem pending`);
  ok(r.axisDev <= 1.0 + 1e-6, `Back ${p}->${p - 1}: device axis on the rail path (${r.axisDev.toFixed(3)} mm)`);
  ok(r.wireToTip !== null && r.wireToTip < 0.1, `Back ${p}->${p - 1}: wire leaves the nosecone tip (${r.wireToTip === null ? 'n/a' : r.wireToTip.toFixed(3)} mm), held ${r.hold}, ahead ${r.wireAhead.toFixed(0)} mm`);
  ok(r.hold && !r.removed && r.wireAhead >= 13.9, `Back ${p}->${p - 1}: wire fixed, present, >= 14 mm ahead of the nosecone`);
  const missesAfter = await page.evaluate(() => JSON.stringify(Object.keys(__sim.sim.flags).filter(k => /fail|Fail|miss|major|Try|Early/.test(k)).map(k => [k, __sim.sim.flags[k]])));
  ok(missesBefore === missesAfter, `Back ${p}->${p - 1}: no scoring counter changed (Back is not a miss)`);
  const coach = await page.evaluate(() => document.querySelector('#coachText').textContent); ok(/went back from phase/i.test(coach) || /Back/.test(coach), `Back ${p}->${p - 1}: coach line mentions it: "${coach.slice(-80)}"`);
  const cur = await page.evaluate(() => document.querySelector('.chip.active')?.dataset.p); ok(+cur === p - 1, `Back ${p}->${p - 1}: stepper shows phase ${p - 1} (${cur})`);
  if (p === 5 || p === 9) { await page.screenshot({ path: `shots/v13/${prof}-after-back-from-${p}.png` }); }
  await page.waitForTimeout(500); const r2 = await page.evaluate(() => __rail()); ok(r2.phase === p - 1 && !r2.fx && r2.axisDev <= 1.0 + 1e-6, `Back ${p}->${p - 1}: still stable and on the rail after 0.5 s of live frames`);
  // forward again through the real gates and complete the case
  const fin = await page.evaluate(() => __finish()); ok(fin, `Back ${p}->${p - 1}: gates work going forward again, case completes`);
  await page.waitForTimeout(500);
  const sh = await page.evaluate(() => ({ vis: !document.querySelector('#scoreModal').hidden, back: document.querySelector('#backBox')?.textContent || '', skipped: !!document.querySelector('#skippedBox'), score: __sim.sim.score && { p: __sim.sim.score.passed, t: __sim.sim.score.total } }));
  ok(sh.vis, `Back ${p}->${p - 1}: score sheet opens`); ok(new RegExp('Went back to phase ' + (p - 1)).test(sh.back) && /not a miss/i.test(sh.back), `score sheet note: "${sh.back.replace(/\s+/g, ' ').slice(0, 110)}"`);
  ok(sh.score.p === 9 && sh.score.t === 9 && !sh.skipped, `clean run with a Back is still ${sh.score.p}/${sh.score.t} (not a miss)`);
  if (p === 5) await page.screenshot({ path: `shots/v13/${prof}-score-went-back.png` });
  await page.evaluate(() => { document.querySelector('#scoreModal').hidden = true; });
}
// misses stay: alignment check skipped -> back -> redo properly -> still a miss
console.log('== misses stay ==');
await page.evaluate(() => __sim.reset()); await page.waitForTimeout(250); await mon();
await page.evaluate(() => { const D = __drv, s = __sim.sim; D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); s.act.skipAlign(); });
ok((await st()).phase === 5, 'alignment skipped -> phase 5 (scored miss)');
await backBtn.click(); await page.waitForTimeout(400); ok((await st()).phase === 4, 'Back to phase 4');
await page.evaluate(() => { __drv.goCross(); __drv.alignAt(); }); ok(await page.evaluate(() => __sim.sim.chk.alignConfirmed), 'alignment confirmed properly this time');
await page.evaluate(() => __finish()); await page.waitForTimeout(500);
const m = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#scoreTable tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')), back: document.querySelector('#backBox')?.textContent || '', p: __sim.sim.score.passed }));
const al = m.rows.find(r => /Alignment|align/i.test(r.slice(0, 40))) || m.rows.find(r => /align/i.test(r)); ok(!!al && /MISS|FAIL|Miss|✗|missed/i.test(al.slice(0, 120)) || (m.p < 9), 'the alignment row is still a miss after redoing it (' + m.p + '/9): ' + (al || '').slice(0, 140));
ok(/Went back to phase 4/.test(m.back), 'sheet also says "Went back to phase 4"'); ok(m.p < 9, 'no clean sheet from going back (' + m.p + '/9)');
// console
const real = logs.filter(l => !/GPU stall|swiftshader|WebGL|Automatic fallback|GroupMarker/i.test(l)); ok(real.length === 0, 'no console errors / warnings' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
ok((await page.evaluate(() => __sim.errors.length)) === 0, 'window error list empty');
console.log(`\nback-e2e ${prof}: ${pass} passed, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
