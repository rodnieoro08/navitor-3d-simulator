// Real-UI physics runs: (A) slow wheel + forward pressure + slight wire pull lands 3-4.5 mm; (B) fast release unpaced pops high.
// Hooks are used ONLY to reach phase 5 quickly (phases 1-4 are covered by e2e.mjs) and to READ state.
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const only = process.argv[3];
const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };

async function scenario(name, { good }) {
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
  await tab('wire'); await page.locator('#sPress').fill(good ? '55' : '50'); await page.locator('#sWire').fill(good ? '35' : '30');
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


  const slug = good ? 'good' : 'pop';
  const shotMon = async (n) => { if (mobile) await click('#viewtabs button[data-vt=mon]'); await page.waitForTimeout(700); await page.locator('#monPanel').screenshot({ path: `shots/v3/${prof}-${slug}-${n}.png` }); };
  const shot3d = async (n) => { if (mobile) await click('#viewtabs button[data-vt=td]'); await page.waitForTimeout(900); await page.locator('#tdPanel').screenshot({ path: `shots/v3/${prof}-${slug}-${n}.png` }); };
  const shotFull = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `shots/v3/${prof}-${slug}-${n}.png` }); };
  const gauge = () => page.evaluate(() => parseFloat(document.getElementById('gFeel').style.width) || 0);
  // ---- 1. slow wheel to 60%, test hysteresis with a real Resheath hold, then to the 80% lock
  await holdUntil('#hDep', () => __sim.state.dev.f >= 0.5);
  let s = await st(); const g50 = await gauge();
  if (good) { await shotMon('mid50-fluoro'); await shot3d('mid50-3d'); await tab('handle'); }
  ok(s.dev.fore > 0.5, `frame shortens as it opens: foreshortening ${s.dev.fore} mm at ${Math.round(s.dev.f * 100)}% (${s.dev.retractMm} mm = ${s.dev.turns} turns)`);
  if (good) {
    await holdUntil('#hDep', () => __sim.state.dev.f >= 0.6);
    await holdUntil('#hRes', () => false, 2500); s = await st();
    ok(s.dev.fv > s.dev.f + 0.02, `resheath hysteresis in the real UI: frame still open to ${s.dev.fv} while the capsule is at ${s.dev.f}`);
  }
  await holdUntil('#hDep', () => __sim.state.dev.locked);
  s = await st(); const gLock = await gauge();
  ok(s.dev.locked && Math.abs(s.dev.f - 0.8) < 0.005 && s.phase === 6, 'lock at 80%, phase 6');
  ok(gLock > g50 + 15 && gLock > 55, `recapture feel gauge rises toward the lock (${g50}% -> ${gLock}%)`);
  ok(/recapture feel/.test(await page.innerText('#feelTxt')), 'feel text shown: "' + (await page.innerText('#feelTxt')) + '"');
  ok(s.dev.h >= 3 && s.dev.h <= 4.5 || !good, `depth at the lock NCC ${s.dev.h} / LCC ${s.dev.hLcc}`);
  if (good) { await shotFull('lock80-handle-feel'); await shotMon('lock80-fluoro'); }
  // ---- 2. second view (real C-arm controls), Unlock via the button
  await tab('carm');
  for (let guard = 0; guard < 40; guard++) {
    const t = await page.evaluate(() => [__sim.sim.carm.tLao, __sim.sim.carm.tCra]); const dl = 32 - t[0], dc = 30 - t[1]; if (dl === 0 && dc === 0) break;
    const want = (Math.abs(dl) >= 5 || Math.abs(dc) >= 5) ? 5 : 1;
    if (mobile) { const cur = await page.evaluate(() => __sim.ui.stepSize); if (cur !== want) await click('#stepBtn'); }
    if (Math.abs(dl) >= want) { if (mobile) await click(`[data-c="${Math.sign(dl)},0"]`); else await page.keyboard.press(`${want === 5 ? 'Shift+' : ''}${dl > 0 ? 'ArrowRight' : 'ArrowLeft'}`); }
    if (Math.abs(dc) >= want) { if (mobile) await click(`[data-c="0,${Math.sign(dc)}"]`); else await page.keyboard.press(`${want === 5 ? 'Shift+' : ''}${dc > 0 ? 'ArrowUp' : 'ArrowDown'}`); }
  }
  await page.waitForFunction(() => __sim.state.view.threeCusp, null, { timeout: 15000 }).catch(() => { });
  await page.getByRole('button', { name: /Confirm 3-cusp check/ }).click(); await page.waitForTimeout(300);
  s = await st(); ok(s.chk.secondView === true, 'second view confirmed: ' + (s.chk.secondView ? '' : s.note));
  await tab('handle'); await page.evaluate(() => { document.activeElement && document.activeElement.blur(); }); await click('#hUnlock'); await page.waitForTimeout(400);
  s = await st(); ok(!s.dev.locked && s.phase === 7, 'unlocked -> phase 7');
  // ---- 3. final release: good = rapid pacing + slow; pop = no pacing + fast
  if (good) { await tab('wire'); await click('button[data-pm=fast]'); await tab('handle'); await holdUntil('#hDep', () => __sim.state.phase >= 8); }
  else { await holdUntil('#hDepF', () => __sim.state.phase >= 8); }
  await page.waitForTimeout(1200); s = await st();
  ok(s.dev.released && s.phase === 8, 'released, phase 8');
  console.log(`   RESULT ${slug}: NCC ${s.flags.finalDepthNcc} / LCC ${s.flags.finalDepthLcc}  pop ${s.flags.popMm}  releasedFast ${s.flags.releasedFast} unpaced ${s.flags.releasedUnpaced}`);
  if (good) {
    ok(s.flags.finalDepthNcc >= 3 && s.flags.finalDepthNcc <= 4.5 && s.flags.finalDepthLcc >= 3 && s.flags.finalDepthLcc <= 4.5, `GOOD range: NCC ${s.flags.finalDepthNcc} / LCC ${s.flags.finalDepthLcc} mm (3-4.5)`);
    ok(!s.flags.releasedFast && !s.flags.releasedUnpaced, 'slow wheel + rapid pacing: no speed or pacing flags');
    await shotMon('released-fluoro'); await shot3d('released-3d');
    // contrast injection on the released valve, in fluoro
    await click('#bInject'); await page.waitForTimeout(1600); await shotMon('contrast-injection-fluoro'); s = await st();
    ok(s.flags.aortogram === true, 'Inject contrast (pigtail) after release records the aortogram');
  } else {
    ok(s.flags.releasedFast && s.flags.releasedUnpaced, 'fast release, no pacing: flagged fast + unpaced');
    ok(s.flags.finalDepthNcc < 3 && s.flags.finalDepthLcc < 3, `HIGH pop-up: NCC ${s.flags.finalDepthNcc} / LCC ${s.flags.finalDepthLcc} mm (< 3)`);
    ok(s.flags.finalDepthNcc < 2.4, 'a pronounced pop (< 2.4 mm)');
    await shotMon('released-fluoro'); await shot3d('released-3d'); await shotFull('popup-score-state');
  }
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scroll');
  ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
  await browser.close();
}
await scenario('A: slow wheel + forward pressure + slight wire pull -> good depth', { good: true });
await scenario('B: fast wheel after 80%, no pacing -> high pop-up', { good: false });
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n')); process.exit(bad ? 1 : 0);
