// Real-UI-only test of: 80% lock -> second view -> Unlock -> 100% -> release -> phase 8.
// Hooks are used ONLY to reach phase 5 quickly (phases 1-4 are covered by e2e.mjs) and to READ state.
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const only = process.argv[3];
const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };

async function scenario(name, { lock, confirm, unlock, finish }) {
  console.log(`\n== ${prof}: ${name} ==`);
  const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
  const st = () => page.evaluate(() => __sim.state);
  // a user scrolls the page so the control sits below the sticky header/monitor; do the same before raw mouse work
  const reveal = async (sel) => { const okv = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const top = document.getElementById('top').offsetHeight + ((document.querySelector('#app[data-vt=mon] #monPanel, #app[data-vt=td] #tdPanel') || { offsetHeight: 0 }).offsetHeight || 0) + 8; const bl = innerHeight - 36;
      let r = e.getBoundingClientRect(); if (matchMedia('(max-width:900px)').matches) { if (r.top < top) scrollBy(0, r.top - top - 4); else if (r.bottom > bl) scrollBy(0, r.bottom - bl + 4); } else e.scrollIntoView({ block: 'nearest' });
      r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!h && (e === h || e.contains(h) || h.contains(e)); }, sel); await page.waitForTimeout(80); return okv; };
  const click = async (sel) => { const r = await reveal(sel); if (!r) console.log('   (not reachable by hit test: ' + sel + ')'); await page.locator(sel).click({ timeout: 8000 }); };
  const tab = async (t) => { if (mobile) await click(`#ctabs button[data-t=${t}]`); await page.waitForTimeout(150); };
  await page.goto('file://'+process.cwd()+'/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
  await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
  // --- setup only (hooks): reach phase 5 at the true cusp-overlap view
  await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); });
  await page.waitForTimeout(1200);
  ok((await st()).phase === 5, 'setup: phase 5 reached');
  // --- real UI from here
  await tab('wire'); await page.locator('#sPress').fill('50'); await page.locator('#sWire').fill('30');
  await tab('handle');
  const wheelBox = async () => { ok(await reveal('#wheel'), 'deployment wheel reachable (not under the sticky header)'); const b = await page.locator('#wheel').boundingBox(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: b.width * 0.4 }; };
  const dragWheel = async (deg, perMove = 3, wait = 22, untilLocked = false, untilDone = false) => { // clockwise positive
    const { cx, cy, r } = await wheelBox(); let a = 0; await page.mouse.move(cx + r, cy); await page.mouse.down();
    let n = 0; while (Math.abs(a) < Math.abs(deg) && n++ < 3000) { a += Math.sign(deg) * perMove; await page.mouse.move(cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)); await page.waitForTimeout(wait);
      if (n % 10 === 0) { const s = await st(); if ((untilLocked && s.dev.locked) || (untilDone && s.phase >= 8)) break; } }
    await page.mouse.up(); };
  const holdUntil = async (sel, cond, timeout = 90000) => { ok(await reveal(sel), `${sel} reachable (not under the sticky header)`); const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    try { await page.waitForFunction(cond, null, { timeout, polling: 100 }); } catch (e) { console.log('   (timeout while holding ' + sel + ')'); } await page.mouse.up(); };
  const dragThumb = async (frac) => { await reveal('#wheelSlider'); const b = await page.locator('#wheelSlider').boundingBox(); const y = b.y + b.height / 2; const cur = Number(await page.locator('#wheelSlider').inputValue()) / 100; const x0 = b.x + 8 + (b.width - 16) * cur; await page.mouse.move(x0, y); await page.mouse.down(); await page.mouse.move(b.x + 8 + (b.width - 16) * frac + 20, y, { steps: 8 }); await page.mouse.up(); };
  const setSlider = async (v) => { await page.locator('#wheelSlider').fill(String(v)); };

  // ---- 1. reach the 80% lock
  if (lock === 'hold') await holdUntil('#hDep', () => __sim.state.dev.locked);
  if (lock === 'holdfast') await holdUntil('#hDepF', () => __sim.state.dev.locked);
  if (lock === 'drag') await dragWheel(2400, 3, 22, true);
  if (lock === 'slider') { await setSlider(100); await page.waitForFunction(() => __sim.state.dev.locked, null, { timeout: 90000, polling: 100 }).catch(() => { }); await page.waitForTimeout(300); }
  if (lock === 'sliderdrag') { await dragThumb(1.0); await page.waitForFunction(() => __sim.state.dev.locked, null, { timeout: 90000, polling: 100 }).catch(() => { }); await page.waitForTimeout(500);
    const v = await page.locator('#wheelSlider').inputValue(); ok(Math.abs(v - 80) <= 1, 'slider thumb resyncs to the real 80% (not stuck at 100): ' + v); }
  let s = await st();
  ok(s.dev.locked && Math.abs(s.dev.f - 0.8) < 0.005, `lock engaged at 80% via ${lock} (f=${s.dev.f}, locked=${s.dev.locked})`);
  ok(s.phase === 6, 'phase 6 shown (stop at 80%)');
  await page.waitForTimeout(500);
  const coach = await page.innerText('#coachbar');
  ok(/unlock/i.test(coach), 'coach line mentions Unlock: "' + coach.replace(/\s+/g, ' ').slice(0, 160) + '"');
  ok(await page.locator('#hUnlock').isEnabled(), 'Unlock button enabled while locked');
  ok(await page.locator('#hUnlock').isVisible(), 'Unlock button visible in the handle panel');
  // pressing deploy while locked: refused with a reason, not silent
  const f80 = (await st()).dev.f;
  await holdUntil('#hDep', () => false, 700);
  s = await st(); ok(Math.abs(s.dev.f - f80) < 1e-6, 'deploy refused while locked'); ok(/lock|unlock|second|3-cusp/i.test(s.note || ''), 'refusal explains why: "' + s.note + '"');

  // ---- 2. second view
  if (confirm) {
    await tab('carm');
    // go from RAO30/CAU30 to LAO32/CRA30 with the pad / arrow keys
    const pad = (dl, dc) => ({ click: () => click(`[data-c="${dl},${dc}"]`) });
    const target = { lao: 32, cra: 30 };
    for (let guard = 0; guard < 40; guard++) {
      const c = (await st()); const t = await page.evaluate(() => [__sim.sim.carm.tLao, __sim.sim.carm.tCra]); const dl = target.lao - t[0], dc = target.cra - t[1];
      if (dl === 0 && dc === 0) break;
      const big = Math.abs(dl) >= 5 || Math.abs(dc) >= 5; const want = big ? 5 : 1;
      if (mobile) { const cur = await page.evaluate(() => __sim.ui.stepSize); if (cur !== want) await click('#stepBtn'); }
      if (Math.abs(dl) >= want) { if (mobile) await pad(Math.sign(dl), 0).click(); else { await page.keyboard.press(`${want === 5 ? 'Shift+' : ''}${dl > 0 ? 'ArrowRight' : 'ArrowLeft'}`); } }
      if (Math.abs(dc) >= want) { if (mobile) await pad(0, Math.sign(dc)).click(); else { await page.keyboard.press(`${want === 5 ? 'Shift+' : ''}${dc > 0 ? 'ArrowUp' : 'ArrowDown'}`); } }
    }
    await page.waitForFunction(() => __sim.state.carm.lao === 32 && __sim.state.carm.cra === 30 && __sim.state.view.threeCusp, null, { timeout: 15000 }).catch(() => { });
    s = await st(); ok(s.view.threeCusp && s.carm.lao === 32 && s.carm.cra === 30, `3-cusp view reached by real C-arm controls: LAO ${s.carm.lao} CRA ${s.carm.cra}`);
    await tab('handle');
    // unlocking BEFORE the check is allowed (scored) - here we confirm first
    await page.getByRole('button', { name: /Confirm 3-cusp check/ }).click(); await page.waitForTimeout(300);
    s = await st(); ok(s.chk.secondView === true, 'Confirm 3-cusp check accepted (depth NCC ' + s.dev.h + ' / LCC ' + s.dev.hLcc + '): ' + (s.chk.secondView ? '' : s.note));
    ok(await page.locator('#hUnlock').isEnabled(), 'Unlock still enabled after the second-view check');
    ok(/unlock/i.test(await page.innerText('#coachbar')), 'coach/ note tells the learner to unlock after the check');
  }
  // ---- 3. Unlock
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  if (unlock === 'button') await click('#hUnlock');
  if (unlock === 'key') await page.keyboard.press('KeyU');
  if (unlock === 'icon') { await reveal('#lockIcon'); const b = await page.locator('#lockIcon').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
  await page.waitForTimeout(400);
  s = await st();
  ok(!s.dev.locked && s.phase === 7, `unlocked via ${unlock} -> phase 7`);
  ok(confirm ? !s.flags.major80 : s.flags.major80, confirm ? 'no MAJOR flag when second view done' : 'MAJOR flag recorded when 80% passed without the second view');
  await page.screenshot({ path: `shots/final/${prof}-unlocked-${name.replace(/\W+/g, '-')}.png` });
  // pacing for the final release (rapid is only for the final release)
  await tab('wire'); await click('button[data-pm=fast]'); await tab('handle');
  // ---- 4. finish to 100%
  const f0 = (await st()).dev.f;
  if (finish === 'hold') await holdUntil('#hDep', () => __sim.state.phase >= 8);
  if (finish === 'holdfast') await holdUntil('#hDepF', () => __sim.state.phase >= 8);
  if (finish === 'drag') await dragWheel(900, 3, 22, false, true);
  if (finish === 'slider') { await setSlider(100); await page.waitForFunction(() => __sim.state.phase >= 8, null, { timeout: 90000, polling: 100 }).catch(() => { }); await page.waitForTimeout(500); }
  if (finish === 'sliderdrag') { await dragThumb(1.0); await page.waitForFunction(() => __sim.state.phase >= 8, null, { timeout: 90000, polling: 100 }).catch(() => { }); await page.waitForTimeout(500); }
  if (finish === 'wobble') { // after Unlock a small backwards wobble must NOT re-engage the lock; then a clockwise drag finishes
    const { cx, cy, r } = await wheelBox(); await page.mouse.move(cx + r, cy); await page.mouse.down(); let a = 0;
    for (const d of [-3, -3, 3, 3, 3, 3]) { a += d; await page.mouse.move(cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)); await page.waitForTimeout(40); } await page.mouse.up();
    s = await st(); ok(!s.dev.locked && s.phase === 7, 'wobble after Unlock does not re-lock (f=' + s.dev.f + ')');
    await dragWheel(900, 3, 22, false, true); }
  if (finish === 'key') { await page.keyboard.down('KeyX'); try { await page.waitForFunction(() => __sim.state.phase >= 8, null, { timeout: 60000, polling: 100 }); } catch { } await page.keyboard.up('KeyX'); }
  await page.waitForTimeout(600);
  s = await st();
  ok(s.dev.f === 1 && s.dev.released && s.phase === 8, `deployed 80% -> 100% via ${finish}: f=${s.dev.f} released=${s.dev.released} phase=${s.phase} (started ${f0})`);
  ok(/Phase 8/i.test(await page.innerText('#coachbar')), 'phase 8 coach line shown');
  if (finish === 'slider' || true) ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll');
  await page.screenshot({ path: `shots/final/${prof}-released-${name.replace(/\W+/g, '-')}.png` });
  ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
  await browser.close();
}

const combos = [
  ['hold-button lock, button unlock, hold finish', { lock: 'hold', confirm: true, unlock: 'button', finish: 'hold' }],
  ['wheel-drag lock, key U unlock, wheel-drag finish', { lock: 'drag', confirm: true, unlock: 'key', finish: 'drag' }],
  ['slider lock, lock-icon unlock, slider finish', { lock: 'slider', confirm: true, unlock: 'icon', finish: 'slider' }],
  ['fast hold lock, unchecked MAJOR unlock, fast finish', { lock: 'holdfast', confirm: false, unlock: 'button', finish: 'holdfast' }],
  ['hold lock, button unlock, keyboard X finish', { lock: 'hold', confirm: true, unlock: 'button', finish: 'key' }],
  ['slider-thumb drag lock, unlock button, slider-thumb drag finish', { lock: 'sliderdrag', confirm: true, unlock: 'button', finish: 'sliderdrag' }],
  ['hold lock, unlock then wobble back, wheel finish', { lock: 'hold', confirm: true, unlock: 'button', finish: 'wobble' }],
];
for (const [n, c] of combos) { if (only && !n.includes(only)) continue; try { await scenario(n, c); } catch (e) { bad++; fails.push(n + ': ' + e.message.split('\n')[0]); console.log('  FAIL exception: ' + e.message.split('\n')[0]); } }
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); fails.forEach(f => console.log('  X ' + f)); process.exit(bad ? 1 : 0);
