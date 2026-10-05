// v15: in phase 5 unsheathing is ALWAYS allowed (wheel drag, hold, tap, keyboard). Skipped prerequisites become scored misses on the existing rows,
// the valve lands where the system is, and reaching the 80% lock moves on to phase 6 by itself (coach line), where the usual second-view / Unlock / recapture rules still hold.
import { launch } from './pw.mjs';
import fs from 'fs'; fs.mkdirSync('shots/v15', { recursive: true });
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file://' + process.cwd() + '/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(800);
const cdp = mobile ? await page.context().newCDPSession(page) : null;
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const down = async (x, y) => mobile ? touch('touchStart', x, y) : (await page.mouse.move(x, y), page.mouse.down());
const move = async (x, y) => mobile ? touch('touchMove', x, y) : page.mouse.move(x, y);
const up = async () => mobile ? touch('touchEnd') : page.mouse.up();
const st = () => page.evaluate(() => { const S = __sim.state; return { phase: S.phase, f: S.dev.f, locked: S.dev.locked, released: S.dev.released, fx: S.fx, note: __sim.sim.note || '', coach: document.querySelector('#coachbar').innerText.replace(/\s+/g, ' '), fl: __sim.sim.flags, sv: __sim.sim.chk.secondView, active: document.querySelector('.chip.active')?.dataset.p }; });
// set up phase 5 with a given list of broken prerequisites
const setup = async (opt) => {
  await page.evaluate(() => __sim.reset()); await page.waitForTimeout(300);
  await page.evaluate((o) => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press();
    const s = __sim.sim; if (o.ap) __sim.setAngles(0, 0); if (o.dz) { s.dev.s += o.dz; s.dev.sd = s.dev.s; } if (o.free) s.act.setHold(false); }, opt);
  await page.waitForTimeout(500);
  if (mobile) await page.locator('#ctabs button[data-t=handle]').click().catch(() => {}); else await page.locator('#ctabs button[data-t=handle]').click().catch(() => {});
  await page.evaluate(() => { document.querySelector('#wheel').scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(300);
};
const geom = () => page.evaluate(() => { const r = document.querySelector('#wheelRing').getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.width / 2 }; });
const arcPts = (g, a0, a1, rad, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [g.cx + rad * Math.cos(a), g.cy + rad * Math.sin(a)]; });
const spinTo80 = async () => { const g = await geom(); const pts = arcPts(g, -90, -90 + 360 * 4.6, g.r * 0.8, 80); await down(...pts[0]); for (let i = 1; i < pts.length; i++) { await move(...pts[i]); await page.waitForTimeout(30); if (i % 8 === 0 && (await page.evaluate(() => __sim.state.phase)) !== 5) break; } await up(); await page.waitForTimeout(500); };
// the swiftshader renderer is slow, so while the REAL pointer/touch/key is held the simulation is fast-forwarded in the page (same Sim.update, input stays as the real events set it)
const ff = (maxSteps = 4000) => page.evaluate((n) => { const S = __sim.sim; let g = 0; while (S.phase === 5 && g++ < n) S.update(1 / 30); return g / 30; }, maxSteps);
const holdUntil = async (sel) => { const b = await page.locator(sel).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await down(x, y); await page.waitForTimeout(400); const held = await page.evaluate(() => __sim.sim.input.deploy); await ff(); await up(); await page.waitForTimeout(400); return held; };
const checkAdvance = async (tag) => {
  await page.waitForTimeout(700);
  const s = await st();
  ok(s.phase === 6 && s.locked && Math.abs(s.f - 0.8) < 1e-6, `${tag}: reached 80% -> phase ${s.phase} automatically, locked, f=${s.f.toFixed(3)}`);
  ok(s.fl.autoAdvance56 >= 1, `${tag}: auto-advance recorded; coach line: "${(s.note || s.coach).slice(0, 100)}"`);
  ok(s.active === '6', `${tag}: stepper shows phase 6`); ok(!s.fx, `${tag}: no failure pending`);
  const wire = await page.evaluate(() => { const dv = __sim.views.dev, T = __sim.THREE, cl = dv.cl; let mx = 0; for (let i = 0; i < cl.n; i++) { const pp = __sim.sim.path.pos(dv.sTipNow - i * 2); mx = Math.max(mx, Math.hypot(cl.P[i * 3] - pp.x, cl.P[i * 3 + 1] - pp.y, cl.P[i * 3 + 2] - pp.z)); } return mx; });
  ok(wire <= 1.0 + 1e-6, `${tag}: phase 6 state consistent, device on the rail (${wire.toFixed(2)} mm)`);
  return s;
};
// ---------- 1. wheel drag, NOTHING satisfied: AP view (parallax), marker 8 mm off the plane, wire free
await setup({ ap: true, dz: 8, free: true });
let s = await st(); ok(s.phase === 5 && s.f === 0, 'phase 5, nothing satisfied (AP view, marker +8 mm, wire free)');
await spinTo80();
s = await checkAdvance('wheel / nothing satisfied'); ok(/moved on to phase 6 automatically|lock/i.test(s.note), 'wheel: coach line after the auto-advance: "' + s.note.slice(0, 80) + '"');
ok(s.fl.deployNoView && s.fl.deployNoMarker && s.fl.deployNoHold, `misses recorded at the first turn: view=${s.fl.deployNoView} marker=${s.fl.deployNoMarker} wire=${s.fl.deployNoHold}`);
await page.screenshot({ path: `shots/v15/${prof}-phase6-after-auto-advance.png` });
// bad landing is real: the second view must reject it; Unlock without it = MAJOR (unchanged rule); full run still completes
const sv = await page.evaluate(() => { __drv.secondView(); return __sim.sim.chk.secondView; }); ok(sv === false, 'phase 6: the second view is rejected for the badly landed valve (' + (await st()).note.slice(0, 70) + ')');
// recapture between 0-80 % still works from phase 6 and returns to phase 5
await page.evaluate(() => { __sim.sim.act.wheel(-0.2); __sim.sim.update(1 / 30); }); await page.waitForTimeout(300); s = await st(); ok(s.phase === 5 && !s.locked && s.f < 0.7, `recapture below 80% returns to phase 5 (f=${s.f.toFixed(2)})`);
await page.evaluate(() => { __drv.resheathTo(0); }); 
// fix everything this time: the same prerequisites now clean, misses stay recorded
await page.evaluate(() => { const S = __sim.sim; S.act.setHold(true); __sim.setAngles(-30, -30); S.dev.s -= S.sysZ(); S.dev.sd = S.dev.s; __drv.press(); });
await page.evaluate(() => { __drv.toLock(); }); s = await st(); ok(s.phase === 6, 'redo after recapture: auto-advance again');
await page.evaluate(() => { __drv.secondView(); __sim.sim.act.unlock(); __drv.release('fast'); __drv.phase8(); __drv.phase9(); }); await page.waitForTimeout(500);
const sc = await page.evaluate(() => __sim.sim.score && { p: __sim.sim.score.passed, t: __sim.sim.score.total, rows: Object.fromEntries(__sim.sim.score.rows.map(r => [r.id, [r.pass, r.result, r.feedback]])) });
ok(!!sc, 'the full case can still be finished'); ok(!sc.rows.align[0] && /cusp-overlap|marker/i.test(sc.rows.align[1] + sc.rows.align[2]), 'sheet: alignment row = miss (view / marker): ' + sc.rows.align[1].slice(0, 120));
ok(!sc.rows.wire[0] && /not fixed|wire free/i.test(sc.rows.wire[1] + sc.rows.wire[2]), 'sheet: wire row = miss (wire not fixed): ' + sc.rows.wire[1]);
ok(sc.p <= 7, `sheet is not clean: ${sc.p}/${sc.t}`);
// ---------- 2. hold-to-deploy (desktop: Deploy fast button; phone: Hold to deploy), wire free + AP only
await setup({ ap: true });
const held = await holdUntil(mobile ? '#mHoldDep' : '#hDepF'); ok(held === 1, 'the real press set the deploy input');
s = await checkAdvance(mobile ? 'hold (touch) / AP view' : 'hold (button) / AP view'); ok(s.fl.deployNoView, 'miss recorded: parallax / view');
// ---------- 3. tap (phone) or keyboard (desktop)
await setup({ dz: -6 });
if (mobile) { const b = await page.locator('#mTapDep').boundingBox(); for (let i = 0; i < 22; i++) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(120); } await ff(); }
else { await page.keyboard.down('Shift'); await page.keyboard.down('KeyX'); await page.waitForTimeout(300); ok((await page.evaluate(() => __sim.sim.input.deploy)) === 1, 'the real X key set the deploy input'); await ff(); await page.keyboard.up('KeyX'); await page.keyboard.up('Shift'); await page.waitForTimeout(400); }
s = await checkAdvance(mobile ? 'tap +2 mm x22 / marker 6 mm above the plane' : 'keyboard X / marker 6 mm above the plane'); ok(s.fl.deployNoMarker, 'miss recorded: marker off the annular plane');
// ---------- 4. a very bad landing: the sheet says what happened (depth rows), no crash
await setup({ dz: 30 });
await page.evaluate(() => { __drv.toLock(); __sim.sim.act.unlock(); __drv.release('fast'); __drv.phase8(); __drv.phase9(); }); await page.waitForTimeout(400);
const bl = await page.evaluate(() => __sim.sim.score && Object.fromEntries(__sim.sim.score.rows.filter(r => /depth|stop80/.test(r.id)).map(r => [r.id, [r.pass, r.result, r.feedback]])));
ok(bl && !bl.depthNcc[0] && /deep|embolise|LV/i.test(bl.depthNcc[2]), 'very deep landing: depth row miss with a realistic consequence: "' + (bl && bl.depthNcc[2].slice(0, 120)) + '"');
ok(bl && !bl.stop80[0], 'unlocking without a valid second view = MAJOR on the 80% row (unchanged)');
await page.screenshot({ path: `shots/v15/${prof}-score-bad-landing.png` });
// ---------- 5. Back and Skip still work around phase 5
await setup({}); await page.evaluate(() => { __drv.toLock(); }); await page.click('#btnBack'); await page.waitForTimeout(400); s = await st(); ok(s.phase === 5 && s.f === 0, 'Back from 6 -> 5 (valve re-sheathed)');
await page.evaluate(() => __sim.setAngles(0, 0)); await page.evaluate(() => { __sim.sim.act.wheel(0.03); }); s = await st(); ok(s.f > 0 && s.fl.deployNoView, 'after Back the deployment is also free of gates, and recorded');
await page.evaluate(() => { __drv.resheathTo(0); }); await page.click('#btnSkip'); await page.waitForTimeout(300); s = await st(); ok(s.phase === 6 && s.locked, 'Skip phase from 5 -> 6 at the lock still works');
const real = logs.filter(l => !/GPU stall|swiftshader|WebGL|Automatic fallback|GroupMarker/i.test(l)); ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real[0] : ''));
ok((await page.evaluate(() => __sim.errors.length)) === 0, 'window error list empty');
console.log(`\ndeploy-free-e2e ${prof}: ${pass} passed, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
