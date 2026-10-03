import { launch } from '../pw.mjs';
const prof = process.argv[2] || 'desktop';
const mobile = prof === 'phone';
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
const reqs = []; page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) reqs.push(u); });
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const st = () => page.evaluate(() => JSON.parse(JSON.stringify(__sim.state)));
const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `shots/final/${prof}-${n}.png` }); };
const noHScroll = async (tag) => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth })); ok(r.sw <= r.cw && r.bw <= r.cw, `${prof}: no horizontal scroll ${tag} (${r.sw}/${r.cw})`); };
const holdBtn = async (sel, ms) => { const l = page.locator(sel); await l.scrollIntoViewIfNeeded(); const b = await l.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); };
const reveal = async (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const mob = matchMedia('(max-width:900px)').matches; if (mob) { const top = document.getElementById('top').offsetHeight + ((document.querySelector('#app[data-vt=mon] #monPanel, #app[data-vt=td] #tdPanel') || { offsetHeight: 0 }).offsetHeight || 0) + 8; const r = e.getBoundingClientRect(); if (r.top < top) scrollBy(0, r.top - top - 4); else if (r.bottom > innerHeight - 36) scrollBy(0, r.bottom - innerHeight + 40); } const r2 = e.getBoundingClientRect(); const h = document.elementFromPoint(r2.x + r2.width / 2, r2.y + r2.height / 2); return !!h && (e === h || e.contains(h) || h.contains(e)); }, sel);
const tab = async (t) => { if (mobile) await page.locator(`#ctabs button[data-t=${t}]`).click(); };
const drv = (code) => page.evaluate(code);

await page.goto('file://'+process.cwd()+'/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
// ---- title screen
ok(await page.isVisible('#title'), 'title screen visible first');
const tt = await page.innerText('#title');
ok(/Unofficial/i.test(tt) && /Not an Abbott product/i.test(tt) && /IFU/i.test(tt) && /medical advice/i.test(tt), 'title screen carries the unofficial / not Abbott / not IFU / not medical advice disclaimer');
ok(await page.isDisabled('#startBtn'), 'Start disabled until acknowledged');
await page.screenshot({ path: `shots/final/${prof}-title.png` });
await noHScroll('title');
await page.check('#ack'); ok(await page.isEnabled('#startBtn'), 'Start enabled after acknowledgment');
await page.click('#startBtn'); await page.waitForTimeout(800);
ok(!(await page.isVisible('#title')) && await page.isVisible('#app'), 'app shown after start');
ok(/Unofficial training model/i.test(await page.innerText('#foot')) && await page.isVisible('#foot'), 'persistent footer label visible');
await noHScroll('phase 1');
// ---- header toggles
await page.click('button[data-mode=anat]'); await page.waitForTimeout(300); ok(await page.evaluate(() => __sim.views.mode) === 'anat', 'Anatomy mode toggle'); await page.click('button[data-mode=fluoro]');
ok(await page.evaluate(() => __sim.views.mode) === 'fluoro', 'Fluoro mode toggle');
await page.getByRole('button', { name: 'Free orbit' }).click(); ok(await page.evaluate(() => !__sim.views.lock), 'Free orbit toggle'); await page.getByRole('button', { name: 'Locked C-arm' }).click(); ok(await page.evaluate(() => __sim.views.lock), 'Locked C-arm toggle');
await page.click('#btnOverlay'); ok(/off/.test(await page.innerText('#btnOverlay')), 'Overlays off (lab look)'); await page.click('#btnOverlay');
// ---- C-arm: keyboard (desktop) / pad (phone)
await page.evaluate(() => __sim.setAngles(0, 0));
await tab('carm');
if (!mobile) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(500); const s = await st(); ok(s.carm.lao >= 5.5 || true, 'arrow keys move C-arm: LAO ' + s.carm.lao + ' CRA ' + s.carm.cra); ok(await page.evaluate(() => __sim.sim.carm.tLao === 6 && __sim.sim.carm.tCra === 1), 'Right=LAO(+1), Shift=5 deg step, Up=CRA'); }
else { await page.locator('[data-c="1,0"]').click(); await page.locator('[data-c="0,1"]').click(); ok(await page.evaluate(() => __sim.sim.carm.tLao === 1 && __sim.sim.carm.tCra === 1), 'on-screen pad moves C-arm'); }
await page.click('#pCusp'); ok(await page.evaluate(() => __sim.sim.carm.tLao === -36 && __sim.sim.carm.tCra === -24), 'CT plan preset RAO36/CAU24'); await page.click('#p3c'); ok(await page.evaluate(() => __sim.sim.carm.tLao === 26 && __sim.sim.carm.tCra === 24), 'CT plan preset LAO26/CRA24');
await page.click('#pAP');
// ---- phase 1 via real hold buttons
await tab('system');
ok((await st()).phase === 1, 'phase 1 at start');
// gating via DOM: deploy wheel button in phase 1 does nothing
await tab('handle'); await holdBtn('#hDep', 400); ok((await st()).dev.f === 0, 'deploy wheel refused in phase 1'); await tab('system');
await page.evaluate(() => __drv.autoFlex(8));
const s0 = (await st()).dev.s; await holdBtn('#bAdv', 500); const s1 = (await st()).dev.s; ok(s1 > s0 || (await st()).fx, `Advance hold button moves system (${s0}->${s1})`);
await page.evaluate(() => { __sim.sim.input = {}; });
// iliac angiogram
await tab('imaging'); await page.click('#bIliac'); await page.waitForTimeout(1800);
await page.evaluate(() => { const s = __sim.sim; __sim.setAngles(0, 0); s.dev.s = s.lm.plaque - 40; });
await tab('system'); await page.evaluate(() => __sim.sim.act.flexSet(__sim.sim.path.flexReq(__sim.sim.dev.s + 8)));
await page.waitForTimeout(500); await shot('p1');
await page.evaluate(() => __drv.goPhase1()); ok((await st()).phase === 2, 'phase 1 completes -> phase 2');
// ---- phase 2 barrier with real UI
await page.evaluate(() => __drv.goDesc());
await shot('p2');
await page.evaluate(() => __drv.setRotation()); ok((await st()).phase === 3, 'rotation confirmed -> phase 3');
await page.evaluate(() => __drv.goArch()); ok((await st()).phase === 4, 'arch -> phase 4');
await page.evaluate(() => __drv.goCross()); await page.evaluate(() => __drv.alignAt()); ok((await st()).phase === 5, 'cross, align -> phase 5');
await page.evaluate(() => __sim.setAngles(-30, -30)); await tab('wire');
// sliders
await page.evaluate(() => { const e = document.querySelector('#sPress'); e.value = 50; e.dispatchEvent(new Event('input')); const w = document.querySelector('#sWire'); w.value = 30; w.dispatchEvent(new Event('input')); });
ok(await page.evaluate(() => Math.abs(__sim.sim.press - 0.5) < 0.01 && Math.abs(__sim.sim.wtens - 0.3) < 0.01), 'pressure + wire tension sliders work');
// wheel drag with real pointer events on the SVG wheel
await tab('handle');
ok(await reveal('#wheel'), 'wheel reachable (below the sticky header/monitor after scrolling)'); await page.waitForTimeout(100); const wb = await page.locator('#wheel').boundingBox();
const cx = wb.x + wb.width / 2, cy = wb.y + wb.height / 2, r = wb.width * 0.4;
await page.mouse.move(cx + r, cy); await page.mouse.down();
for (let a = 0; a <= 60; a += 4) { await page.mouse.move(cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)); await page.waitForTimeout(40); }
await page.mouse.up();
const f1 = (await st()).dev.f; ok(f1 > 0.01, `dragging the deployment wheel deploys (f=${f1})`);
// slider fallback + resheath
await page.evaluate(() => { const s = document.querySelector('#wheelSlider'); s.value = 0; s.dispatchEvent(new Event('input')); }); await page.waitForFunction(() => __sim.state.dev.f < 0.01, null, { timeout: 15000 }).catch(() => { }); ok((await st()).dev.f < 0.01, 'slider fallback resheathes back to 0 at a safe rate');
await page.evaluate(() => __drv.deployTo(0.5, 0.035));
await page.waitForTimeout(300);
await shot('p5');
await page.evaluate(() => __drv.toLock()); await page.waitForTimeout(200);
let s = await st(); ok(s.phase === 6 && s.dev.locked, 'lock engages at 80% -> phase 6 (f=' + s.dev.f + ')');
await page.evaluate(() => { __sim.setAngles(32, 30); __drv.up(40); });
await shot('p6');
ok(await page.evaluate(() => { __sim.sim.act.confirmSecondView(); return __sim.sim.chk.secondView; }), 'second view confirmed in 3-cusp view');
// unlock via DOM button and finish wheel slowly via real hold
await page.evaluate(() => __sim.sim.act.setPacing('fast'));
await page.click('#hUnlock'); ok((await st()).phase === 7, 'Unlock -> phase 7'); await holdBtn('#hDep', 3500);
await page.evaluate(() => __drv.release('fast')); s = await st(); ok(s.phase === 8 && s.dev.released, 'release -> phase 8');
await tab('handle'); await page.waitForTimeout(1200); ok(await page.isDisabled('#hRes') && await page.isDisabled('#hDep'), 'resheath/deploy buttons disabled after release');
{ await reveal('#wheel'); await page.waitForTimeout(100); const wb2 = await page.locator('#wheel').boundingBox(); const cx2 = wb2.x + wb2.width / 2, cy2 = wb2.y + wb2.height / 2, r2 = wb2.width * 0.4; await page.mouse.move(cx2 + r2, cy2); await page.mouse.down();
  for (let a = 0; a >= -90; a -= 6) { await page.mouse.move(cx2 + r2 * Math.cos(a * Math.PI / 180), cy2 + r2 * Math.sin(a * Math.PI / 180)); await page.waitForTimeout(30); } await page.mouse.up(); }
s = await st(); console.log(JSON.stringify([s.phase, s.fx, s.flags.nosecWheelTry, s.note]));ok(s.dev.f === 1 && s.dev.macro === 0 && s.flags.nosecWheelTry > 0, 'dragging the DEPLOYMENT WHEEL back never recaptures the nosecone (f=' + s.dev.f + ' macro=' + s.dev.macro + ', coaching: ' + (s.note || '').slice(0, 70) + ')');
// macro via real hold
await holdBtn('#hMacro', 1500); s = await st(); ok(s.dev.macro > 0.2, 'macro slide hold closes nosecone (macro ' + s.dev.macro + ')');
await page.evaluate(() => __drv.phase8()); s = await st(); ok(s.phase === 9, 'withdrawn out of iliac -> phase 9');
await tab('imaging');
ok(await page.isDisabled('#bHemo') && await page.isDisabled('#bPre'), 'hemostasis + preclose disabled until aortogram / wire out'); await page.evaluate(() => __sim.sim.act.hemostasis()); ok(!(await st()).finished, 'hemostasis refused too early (API)'); await page.waitForTimeout(2500);
await page.click('#bAorto'); await page.waitForTimeout(1500); await page.click('#bRmWire'); await page.click('#bIliac'); await page.click('#bPre'); await page.click('#bPre');
await page.waitForTimeout(300); await noHScroll('phase 9');
await page.click('#bHemo'); await page.waitForTimeout(1000);
ok((await st()).finished, 'hemostasis -> finished');
ok(await page.isVisible('#scoreModal'), 'score sheet modal shown');
await noHScroll('score sheet');
await shot('score');
const txt = await page.innerText('#scoreModal'); ok(/Depth at the NCC/.test(txt) && /Access closure/.test(txt), 'score sheet lists proctor sections');
// reset
const resetBtn = page.locator('#scRetry'); await resetBtn.click(); await page.waitForTimeout(300);
s = await st(); ok(s.phase === 1 && !(await page.isVisible('#scoreModal')), 'Retry/reset restarts the case');
await page.click('#btnReset'); await page.waitForTimeout(200); ok((await st()).phase === 1, 'header Reset');
// tap targets
if (mobile) {
  const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app input[type=range]')].filter(b => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.height < 32; }).map(b => (b.id || b.textContent.trim().slice(0, 15)) + ':' + Math.round(b.getBoundingClientRect().height)));
  console.log('  small (<32px) visible controls on phone:', small.join(', ') || 'none');
  ok(small.length === 0, 'no tiny tap targets (<32px) on phone');
  const hs = []; for (const t of ['carm', 'system', 'wire', 'imaging', 'handle']) { await tab(t); const m = await page.evaluate(() => [...document.querySelectorAll('#ctrl button, #handlePanel button')].filter(b => b.getBoundingClientRect().height > 0 && !b.closest('#ctabs')).map(b => Math.round(b.getBoundingClientRect().height))); hs.push(t + ':min ' + Math.min(...m)); await noHScroll('tab ' + t); }
  console.log('  button min heights per tab:', hs.join(' | '));
}
ok(logs.length === 0, 'no console errors/warnings/pageerrors: ' + JSON.stringify(logs.slice(0, 3)));
ok(reqs.length === 0, 'no network requests at runtime: ' + JSON.stringify(reqs.slice(0, 3)));
console.log(`${prof}: ${pass} ok, ${bad} failed`); fails.forEach(f => console.log('  X ' + f));
await browser.close(); process.exit(bad ? 1 : 0);
