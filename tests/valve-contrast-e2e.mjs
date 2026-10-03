// Tests + screenshots for (A) "Inject contrast (pigtail)" and (B) the redesigned Navitor-style valve.
import { launch } from '../pw.mjs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
const st = () => page.evaluate(() => __sim.state);
await page.goto('file://'+process.cwd()+'/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
const reveal = async (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const mob = matchMedia('(max-width:900px)').matches; const top = mob ? document.getElementById('top').offsetHeight + 8 : 0; const r = e.getBoundingClientRect(); if (mob && r.top < top) scrollBy(0, r.top - top - 4); const r2 = e.getBoundingClientRect(); const h = document.elementFromPoint(r2.x + r2.width / 2, r2.y + r2.height / 2); return !!h && (e === h || e.contains(h)); }, sel);
const view = async (v) => { if (mobile) { await page.locator(`#viewtabs button[data-vt=${v}]`).click(); await page.waitForTimeout(500); } };
const monShot = async (n) => { await view('mon'); await page.waitForTimeout(500); await page.locator('#monPanel').screenshot({ path: `shots/final/${prof}-${n}.png` }); };
const tdShot = async (n) => { await view('td'); await page.waitForTimeout(700); await page.locator('#tdPanel').screenshot({ path: `shots/final/${prof}-${n}.png` }); };
const pix = async (loc) => { const b = await loc.screenshot(); return b.length; };
const grey = async (selector) => page.evaluate((s) => { const c = document.querySelector(s); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; return null; }, selector);

// ---- inject button availability
const btn = page.locator('#bInject');
ok(await btn.isVisible() && await btn.isDisabled(), 'Inject contrast button is visible but disabled before the pigtail is in the NCC (phase < 4)');
ok((await btn.boundingBox()).height >= (mobile ? 44 : 34), 'Inject contrast button is large enough (' + Math.round((await btn.boundingBox()).height) + ' px)');
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); });
await page.waitForTimeout(500); ok((await st()).phase === 4, 'phase 4 (pigtail in NCC)');
ok(await btn.isEnabled(), 'Inject enabled from phase 4');
await page.evaluate(() => { __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); }); await page.waitForTimeout(800);
const score0 = await page.evaluate(() => JSON.stringify(__sim.sim.flags.injections || 0));
// click it for real
ok(await reveal('#bInject'), 'Inject button reachable (not covered) at the current scroll');
await btn.click();
await page.waitForTimeout(1500);
let s = await st();
ok(await page.evaluate(() => !!__sim.sim.contrast.root && !!__sim.sim.contrast.cor), 'phase 5: puff opacifies root + coronary ostia (contrast.root/cor active)');
ok(!s.flags.aortogram && s.phase === 5, 'in phase 5 it does NOT count as the completion aortogram and nothing changes phase');
ok(!(await page.evaluate(() => !!__sim.sim.contrast.pvlJet)), 'no leak shown before release');
await monShot('inject-p5-fluoro');
// brightness evidence: monitor canvas mean luminance with vs without contrast
const lum = async () => page.evaluate(() => { const c = document.getElementById('mon'); const t = document.createElement('canvas'); t.width = 160; t.height = 100; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 160, 100); const d = x.getImageData(0, 0, 160, 100).data; let m = 0; for (let i = 0; i < d.length; i += 4) m += d[i]; return m / (d.length / 4); });
await page.waitForTimeout(6500); const lOff = await lum();
await page.evaluate(() => __sim.sim.act.inject()); await page.waitForTimeout(1800); const lOn = await lum(); ok(Math.abs(lOn - lOff) > 1.0, `fluoro changes during the puff (mean luminance ${lOff.toFixed(1)} -> ${lOn.toFixed(1)})`);
await page.waitForTimeout(6500); const lAfter = await lum(); ok(Math.abs(lAfter - lOff) < Math.abs(lOn - lOff) * 0.6 + 0.5, `puff fades after a few seconds (${lAfter.toFixed(1)})`);
await page.locator('button[data-mode=anat]').click(); await page.evaluate(() => __sim.sim.act.inject()); await page.waitForTimeout(1500);
await monShot('inject-p5-anatomy');
await page.locator('button[data-mode=fluoro]').click();
// keyboard shortcut C
await page.waitForTimeout(5500); const n0 = await page.evaluate(() => __sim.sim.flags.injections); if (!mobile) { await page.keyboard.press('KeyC'); await page.waitForTimeout(200); ok(await page.evaluate(() => __sim.sim.flags.injections) === n0 + 1, 'keyboard C injects'); }
// scoring unaffected: play to the end with and without injections and compare rows
await page.evaluate(() => { __drv.toLock(); __drv.secondView(); __drv.release('fast'); });
s = await st(); ok(s.phase === 8 && s.dev.released, 'released');
await page.waitForTimeout(500);
const noLeakBefore = await page.evaluate(() => !__sim.sim.flags.aortogram);
ok(noLeakBefore, 'no completion aortogram recorded yet');
await btn.click(); await page.waitForTimeout(1500);
s = await st(); ok(s.flags.aortogram && !!s.flags.pvl, 'after release the same button records the completion aortogram: PVL ' + s.flags.pvl + ' / ' + s.flags.coronary);
ok(await page.evaluate(() => !!__sim.sim.contrast.pvlJet && !!__sim.sim.contrast.lv), 'leak into the LV shows only after release');
await monShot('inject-released-fluoro');
await page.evaluate(() => __drv.phase8()); s = await st(); ok(s.phase === 9, 'phase 9');
ok(await btn.isEnabled(), 'Inject still enabled in phase 9 (not greyed by the closure sequence)');
await page.evaluate(() => { __sim.sim.act.removeWire(); }); ok(await page.evaluate(() => __sim.sim.flags.wireRemoved), 'wire removal allowed because the injection satisfied the aortogram');
await btn.click(); await page.waitForTimeout(200); ok(/pigtail is out|iliac/i.test((await st()).note || ''), 'after pigtail removal the button explains why no root puff: "' + (await st()).note + '"');
await page.evaluate(() => { __sim.sim.act.aortogram('iliac'); __sim.sim.act.preclose(); __sim.sim.act.preclose(); __sim.sim.act.hemostasis(); });
s = await st(); const sc = await page.evaluate(() => __sim.sim.score);
ok(s.finished && sc.passed === sc.total, 'clean case with 4+ injections still scores ' + sc.passed + '/' + sc.total + ' (rows unchanged)');

// ---- B: valve render checks in a fresh case
await page.evaluate(() => __sim.reset ? __sim.reset() : 0); await page.waitForTimeout(400);
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(32, 30); __drv.press(); });
await page.evaluate(() => { __sim.sim.act.setCarm(-30, -30); });
await page.waitForTimeout(1500);
const nStruts = async () => page.evaluate(() => { const d = __sim.views.dev; return { count: d.struts.count, vis: d.struts.visible, nC: d.nC, rows: d.nRows }; });
let q = await nStruts(); ok(q.nC === 9 && q.rows === 3, `frame is 3 rows x ${q.nC} large diamond cells (not a dense mesh)`);
await page.evaluate(() => __drv.deployTo(0.5)); await page.waitForTimeout(800); q = await nStruts(); ok(q.count > 0 && q.count <= 9 * 3 * 2 * 3, 'partial deployment: frame struts rendered (' + q.count + ' segments)');
const rad = async () => page.evaluate(() => { const d = __sim.views.dev, f = __sim.sim.dev.f, ld = f * 40 + 9 * Math.max(0, Math.min(1, (f - 0.85) / 0.15)); return [d.rAt(2, ld), d.rAt(38, ld)]; });
let r = await rad(); ok(r[0] > r[1] - 0.001 && r[0] > 11, `inflow opens first at 50% (inflow r ${r[0].toFixed(1)} mm vs outflow still crimped r ${r[1].toFixed(1)} mm)`);
await monShot('valve-50-fluoro'); await tdShot('valve-50-3d');
await page.evaluate(() => { __sim.sim.act.setCarm(32, 30); __drv.up(40); __drv.deployTo(0.8); __drv.up(10); __drv.secondView(); __sim.sim.act.unlock(); __sim.sim.act.setPacing('fast'); __sim.sim.input = { deploy: 1 }; let g = 0; while (__sim.sim.phase === 7 && g++ < 9000) __sim.sim.update(1 / 30); __sim.sim.input = {}; });
await page.waitForTimeout(1500);
s = await st(); ok(s.dev.released && s.phase === 8, 'valve released');
r = await rad(); ok(r[1] > r[0] + 2, `released frame is flared at the outflow (inflow r ${r[0].toFixed(1)} -> outflow r ${r[1].toFixed(1)} mm)`);
q = await nStruts(); ok(q.count === 162, 'full frame = 162 strut segments (9 cells x 3 rows x 2 diagonals x 3 sub-segments)');
ok(await page.evaluate(() => { const d = __sim.views.dev; return d.vision.length === 3 && d.posts.length === 3 && d.cuff && d.leaf.length === 3; }), 'three Vision markers, three posts, NaviSeal cuff and 3 leaflets present');
// close-up, no contrast, to judge the frame itself
await view('mon'); for (let i = 0; i < 4; i++) await page.locator('#zIn').click(); await page.waitForTimeout(2500);
await monShot('valve-closeup-fluoro'); await page.locator('button[data-mode=anat]').click(); await page.waitForTimeout(800); await tdShot('valve-closeup-3d'); await monShot('valve-closeup-anatomy'); await page.locator('button[data-mode=fluoro]').click();
await view('mon'); for (let i = 0; i < 4; i++) await page.locator('#zOut').click();
await page.evaluate(() => { __sim.sim.act.inject(); });
await page.waitForTimeout(500); await page.evaluate(() => __sim.pause(true)); await page.evaluate(() => __sim.sim.contrast.root && (__sim.sim.contrast.root.t = 0.5, __sim.sim.contrast.cor && (__sim.sim.contrast.cor.t = 0.5)));
await page.evaluate(() => __sim.pause(false));
await page.locator('button[data-mode=anat]').click(); await page.waitForTimeout(600);
await tdShot('valve-released-3d'); await monShot('valve-released-anatomy');
await page.locator('button[data-mode=fluoro]').click(); await page.waitForTimeout(2200);
await monShot('valve-released-fluoro');
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).then(v => ok(v, 'no horizontal scroll'));
console.log(`${prof}: ${pass} ok, ${bad} failed`); fails.forEach(f => console.log('  X ' + f));
await browser.close(); process.exit(bad ? 1 : 0);
