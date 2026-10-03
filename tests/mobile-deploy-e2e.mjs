// Touch deploy controls (phone): "Hold to deploy (slow)", "Hold to resheath", "Tap to deploy: +2 mm", "Tap to resheath: -2 mm".
// REAL touch via CDP (hold) and page.touchscreen (tap), mobile viewport + hasTouch. Same physics, lock and speed rules as the wheel.
import { launch } from './pw.mjs';
import fs from 'fs';
const prof = process.argv[2] || 'phone'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
fs.mkdirSync('shots/v8', { recursive: true });
const { browser, page } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); });
await page.waitForTimeout(1200);
ok((await page.evaluate(() => __sim.state.phase)) === 5, 'phase 5: deployment is live');
if (!mobile) {
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#mDep')).display) === 'none', 'desktop: the touch deploy block is hidden (the wheel and buttons are used)');
  console.log(`\n${prof}: ${pass} ok, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
}
const ID = ['#mHoldDep', '#mHoldRes', '#mTapDep', '#mTapRes', '#mUnlock'];
// ---- layout: first controls on the Handle tab, big, visible without scrolling
const lay = await page.evaluate((ids) => ({ sy: scrollY, vh: innerHeight, tab: document.querySelector('#ctabs button.on')?.textContent, r: ids.map(s => { const b = document.querySelector(s).getBoundingClientRect(); return { s, y: b.y, b: b.bottom, h: b.height, w: b.width, x: b.x, r: b.right, t: document.querySelector(s).textContent }; }),
  first: (() => { const m = document.querySelector('#mDep').getBoundingClientRect(), a = document.querySelector('#hDep').getBoundingClientRect(), w = document.querySelector('#wheel').getBoundingClientRect(), sp = document.querySelector('#spdTxt').getBoundingClientRect(); return m.y < a.y && m.y < w.y && m.y < sp.y; })(), sx: document.documentElement.scrollWidth, cx: document.documentElement.clientWidth }), ID);
ok(lay.tab === 'Handle', 'Handle tab is open in phase 5'); ok(lay.sy === 0, 'page not scrolled'); 
ok(lay.r.every(q => q.h >= 56 && q.w >= 56), 'all five touch buttons are >= 56 px: ' + lay.r.map(q => Math.round(q.w) + 'x' + Math.round(q.h)).join(' '));
ok(lay.r.every(q => q.y >= 0 && q.b <= lay.vh && q.x >= 0 && q.r <= 390), `all visible without scrolling (lowest bottom ${Math.round(Math.max(...lay.r.map(q => q.b)))} of ${lay.vh})`);
ok(lay.first, 'the touch block comes before Deploy slow / the wheel / the speed text'); ok(lay.sx <= lay.cx, 'no horizontal scroll');
ok(lay.r[0].t === 'Hold to deploy (slow)' && lay.r[1].t === 'Hold to resheath' && lay.r[2].t === 'Tap to deploy: +2 mm' && lay.r[3].t === 'Tap to resheath: -2 mm', 'labels: ' + lay.r.slice(0, 4).map(q => q.t).join(' | '));
const us = await page.evaluate((ids) => ids.map(s => { const c = getComputedStyle(document.querySelector(s)); return (c.userSelect || c.webkitUserSelect) + '/' + c.webkitTouchCallout + '/' + c.touchAction; }), ID);
ok(us.every(u => /^none/.test(u)), 'user-select none on all five: ' + us.join(' ')); ok(us.slice(0, 2).every(u => /none$/.test(u)), 'hold buttons: touch-action none');
await page.screenshot({ path: 'shots/v8/phone-deploy-block.png' });
// ---- instrumentation
await page.evaluate(() => { window.__ctx = 0; window.__clk = []; document.addEventListener('contextmenu', () => window.__ctx++, true); document.addEventListener('click', e => window.__clk.push(e.target.id || e.target.tagName), true);
  window.__spd = new Set(); new MutationObserver(() => window.__spd.add(document.querySelector('#spdTxt').textContent)).observe(document.querySelector('#spdTxt'), { childList: true, characterData: true, subtree: true }); });
const spdReset = () => page.evaluate(() => { window.__spd.clear(); window.__spd.add(document.querySelector('#spdTxt').textContent); });
const spdSeen = () => page.evaluate(() => [...window.__spd].join(' | '));
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const centre = async (s) => { const b = await page.locator(s).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const st = () => page.evaluate(() => { const d = __sim.state.dev; const m = /rotate\(([-\d.e]+)\)/.exec(document.querySelector('#wheelRot').getAttribute('transform')); return { f: d.f, mm: d.retractMm, locked: d.locked, phase: __sim.state.phase, fTxt: document.querySelector('#fTxt').textContent, md: document.querySelector('#mdTxt').textContent, rot: m ? parseFloat(m[1]) : null, ctx: window.__ctx, clk: window.__clk.length, max80: __sim.sim.v.maxSpeedPost80, rel: __sim.sim.flags.releasedFast, taps: __sim.sim.flags.tapSteps || 0, sel: String(getSelection()), on: document.querySelector('#mHoldDep').classList.contains('on') }; });
const holdTouch = async (sel, ms, moveAway) => { const [x, y] = await centre(sel); await touch('touchStart', x, y); if (moveAway) { await page.waitForTimeout(ms / 2); await touch('touchMove', x + 150, y - 60); await page.waitForTimeout(ms / 2); } else await page.waitForTimeout(ms); await touch('touchEnd'); await page.waitForTimeout(500); };
const sync = (s, tag) => { const pc = /deployed (\d+)%/.exec(s.fTxt), md = /deployed (\d+)%/.exec(s.md); ok(pc && Math.abs(+pc[1] - s.f * 100) <= 0.6, `${tag}: "deployed %" ${pc && pc[1]}% = f ${(s.f * 100).toFixed(1)}%`); ok(md && Math.abs(+md[1] - s.f * 100) <= 0.6, `${tag}: touch-block readout ${md && md[1]}% in sync`); const e = (((s.rot - s.f * 1800) % 360) + 360) % 360; ok(Math.min(e, 360 - e) < 1.5, `${tag}: wheel angle ${s.rot.toFixed(0)} deg = f x 1800 (${(s.f * 1800).toFixed(0)})`); };
// ---- 1. HOLD TO DEPLOY (slow), real touch
let s0 = await st(); ok(s0.f === 0, 'start 0%'); await spdReset();
await holdTouch('#mHoldDep', 2000); let s = await st();
ok(s.f > 0.05 && s.f < 0.09, `hold to deploy 2 s -> ${(s.f * 100).toFixed(1)}% (slow wheel rate is 3.5 %/s)`); ok(s.mm > 2.6 && s.mm < 4.8, `capsule retracted ${s.mm.toFixed(1)} mm`);
const seen1 = await spdSeen(); ok(/slow - good/.test(seen1) && !/TOO FAST/.test(seen1), `speed rated while holding: "${seen1}"`); sync(s, 'after hold-deploy');
const f1 = s.f; await page.waitForTimeout(600); s = await st(); ok(Math.abs(s.f - f1) < 1e-4 && !s.on, 'releasing the finger stops the capsule (no run-on)');
ok(s.ctx === 0, 'no context menu on long-press (' + s.ctx + ')'); ok(s.clk === 0, 'no ghost click after touchend (' + s.clk + ' clicks)'); ok(s.sel === '', 'no text selected after the long-press');
// sliding the finger off the button keeps the hold until release (pointer capture), then stops
const f2 = s.f; await holdTouch('#mHoldDep', 1600, true); s = await st(); ok(s.f - f2 > 0.04 && s.f - f2 < 0.07, `finger slid off the button: still deploying (+${((s.f - f2) * 100).toFixed(1)}%), stops on release`);
// ---- 2. HOLD TO RESHEATH
const f3 = s.f; await spdReset(); await holdTouch('#mHoldRes', 1200); s = await st(); ok(f3 - s.f > 0.03 && f3 - s.f < 0.055, `hold to resheath 1.2 s -> ${(f3 * 100).toFixed(1)}% to ${(s.f * 100).toFixed(1)}%`);
const seen2 = await spdSeen(); ok(!/TOO FAST/.test(seen2), 'resheath speed rated: "' + seen2 + '"'); sync(s, 'after hold-resheath'); ok(s.ctx === 0 && s.sel === '', 'no context menu / selection after resheath hold');
// ---- 3. TAP +2 mm / -2 mm with real touch taps
const tap = async (sel) => { const [x, y] = await centre(sel); await page.touchscreen.tap(x, y); };
let fa = s.f, mmA = s.mm, t0 = s.taps; await spdReset(); await tap('#mTapDep'); await page.waitForTimeout(2200); s = await st();
ok(Math.abs(s.mm - mmA - 2) < 0.15, `tap +2 mm: ${mmA.toFixed(2)} -> ${s.mm.toFixed(2)} mm (+${(s.mm - mmA).toFixed(2)})`); ok(s.taps === t0 + 1, 'one tap = one step (no double firing)');
ok(!/TOO FAST/.test(await spdSeen()), 'a +2 mm step is rated "' + (await spdSeen()) + '"'); sync(s, 'after +2 mm');
mmA = s.mm; await tap('#mTapRes'); await page.waitForTimeout(2200); s = await st(); ok(Math.abs(mmA - s.mm - 2) < 0.15, `tap -2 mm: ${mmA.toFixed(2)} -> ${s.mm.toFixed(2)} mm`); sync(s, 'after -2 mm');
mmA = s.mm; await tap('#mTapDep'); await page.waitForTimeout(120); await tap('#mTapDep'); await page.waitForTimeout(4200); s = await st(); ok(Math.abs(s.mm - mmA - 4) < 0.25, `two quick taps add up: +${(s.mm - mmA).toFixed(2)} mm`);
ok(s.ctx === 0, 'no context menu from taps'); ok(!/TOO FAST/.test(await spdSeen()), 'quick taps never rated too fast: "' + (await spdSeen()) + '"');
await page.screenshot({ path: 'shots/v8/phone-deploy-after-taps.png' });
// ---- 4. the 80% lock: holding stops at the lock; taps and holds cannot pass it without Unlock
await spdReset(); { const [x, y] = await centre('#mHoldDep'); await touch('touchStart', x, y); const t = Date.now(); while (Date.now() - t < 40000) { await page.waitForTimeout(500); if ((await page.evaluate(() => __sim.state.dev.locked))) break; } await page.waitForTimeout(1500); s = await st();
  ok(s.locked && Math.abs(s.f - 0.8) < 0.006, `holding stops at the lock (f ${(s.f * 100).toFixed(1)}%, locked ${s.locked}) while the finger is still down`); await touch('touchEnd'); }
await page.waitForTimeout(400); ok(s.phase === 6, 'phase 6 at the lock'); ok(!/TOO FAST/.test(await spdSeen()), 'whole slow hold never rated too fast');
const fl = s.f; await tap('#mTapDep'); await page.waitForTimeout(2200); s = await st(); ok(Math.abs(s.f - fl) < 0.003 && s.locked, 'Tap to deploy: +2 mm does NOT pass the lock'); await holdTouch('#mHoldDep', 1500); s = await st(); ok(Math.abs(s.f - fl) < 0.003 && s.locked, 'Hold to deploy does NOT pass the lock');
ok(!(await page.locator('#mUnlock').isDisabled()), 'Unlock (touch block) is enabled at the lock'); await page.screenshot({ path: 'shots/v8/phone-deploy-at-lock.png' });
await tap('#mTapRes'); await page.waitForTimeout(2200); s = await st(); ok(s.f < fl - 0.03, `recapture below the lock is still possible: Tap to resheath ${(fl * 100).toFixed(1)}% -> ${(s.f * 100).toFixed(1)}%`);
await holdTouch('#mHoldDep', 4500); s = await st(); ok(s.locked && Math.abs(s.f - 0.8) < 0.006, 'back at the lock after a hold'); 
await page.evaluate(() => { __sim.sim.chk.secondView = true; }); { const [x, y] = await centre('#mUnlock'); await page.touchscreen.tap(x, y); } await page.waitForTimeout(500); s = await st(); ok(!s.locked && s.phase === 7, 'Unlock via the touch button -> phase 7');
{ const [x, y] = await centre('#mHoldDep'); await touch('touchStart', x, y); const t = Date.now(); while (Date.now() - t < 14000) { await page.waitForTimeout(400); if ((await page.evaluate(() => __sim.state.dev.f)) >= 0.999) break; } await touch('touchEnd'); }
await page.waitForTimeout(600); s = await st(); ok(s.f >= 0.999, `holding after Unlock carries on to 100% (f ${(s.f * 100).toFixed(1)}%)`);
ok(s.max80 > 0 && s.max80 < 0.075 + 1e-3 && !s.rel, `speed after 80% scored as safe: max ${(s.max80 || 0).toFixed(3)} of travel/s, releasedFast ${s.rel}`);
ok(s.ctx === 0 && s.clk === 1, `no context menu in the whole run; synthesized clicks seen ${s.clk} (only the Unlock tap: holds and step taps never produce a ghost click)`);
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
