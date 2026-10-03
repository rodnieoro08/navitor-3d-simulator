// Overlays menu: individual switches hide / show the exact elements, All on / All off, 3D "Labels" button, persistence, mobile layout, no effect on scoring.
import { launch } from './pw.mjs';
import fs from 'fs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
fs.mkdirSync('shots/v7', { recursive: true });
const URL = 'file:///workspace/navitor-3d-simulator/index.html';
const W = mobile ? 390 : 1280, H = mobile ? 844 : 800;
const KEYS = ['parts', 'labels', 'measures', 'guides', 'inset', 'parallax', 'angles', 'handle'];
const boot = async (page) => { await page.goto(URL); await page.addScriptTag({ path: 'tests/drv.js' }); await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600); };
const view = async (page, v) => { if (mobile) { await page.locator(`#viewtabs button[data-vt=${v}]`).click(); await page.waitForTimeout(350); } };
const { browser, page, logs } = await launch(W, H, mobile);
await boot(page);
// state: phase 5, valve crossed and aligned, so every overlay has something to show
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); });
await page.waitForTimeout(500);
ok((await page.evaluate(() => __sim.state.phase)) === 5, 'phase 5 reached (every overlay has content)');
// spy on the drawing calls that carry no text (inset, annulus ring)
await page.evaluate(() => { const V = __sim.views; window.__spy = { inset: 0, ring: 0 }; const di = V.drawInset.bind(V); V.drawInset = (...a) => { window.__spy.inset++; return di(...a); }; const sd = V.ctx.setLineDash.bind(V.ctx); V.ctx.setLineDash = (a) => { if (a && a.length) window.__spy.ring++; return sd(a); }; });
const frame = async () => { await page.evaluate(() => { window.__spy.inset = 0; window.__spy.ring = 0; __sim.render(0.5); __sim.render(0.5); }); };
const seen = async () => page.evaluate(() => { const V = __sim.views; const t = (V.labelRects || []).map(r => r.s); const has = (re) => t.some(s => re.test(s)); const flex = document.querySelector('#flexTxt').textContent; const disp = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : null; };
  return { labels: has(/Pigtail @ NCC nadir|Ascending aorta|^RCA$|^LCA$|^NCC$|Inflow \/ Vision/), measures: has(/Marker vs annulus|Post offset/), parallax: has(/^Parallax/), angles: has(/(root-up|patient-up) image/), inset: window.__spy.inset > 0, guides: window.__spy.ring > 0 && /target/.test(flex) && disp('#gReq') !== 'none' && disp('#pBand') !== 'none',
    parts: ['#legend', '#partinfo'].every(s => true) && getComputedStyle(document.querySelector('#legend')).display !== 'none', handle: ['#spdTxt', '#fTxt', '#feelTxt'].every(s => getComputedStyle(document.querySelector(s).parentElement).display !== 'none'), flexTxt: flex, texts: t.length }; });
const menuBtn = (k) => page.locator(`#ovMenu label[data-row=${k}]`);
const openMenu = async () => { if (await page.locator('#ovMenu').isHidden()) { await page.click('#btnOverlay'); await page.waitForTimeout(250); } };
const closeMenu = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
// ---- default: everything on, menu structure
await frame(); let sn = await seen(); ok(KEYS.every(k => sn[k]), 'default: all 8 overlays visible ' + JSON.stringify(KEYS.filter(k => !sn[k])));
await openMenu();
ok(await page.locator('#ovMenu').isVisible(), 'Overlays button opens the menu'); ok((await page.locator('#ovMenu input[data-ov]').count()) === 8, '8 individual switches');
ok((await page.locator('#ovAllOn').isVisible()) && (await page.locator('#ovAllOff').isVisible()), '"All on" and "All off (lab look)" buttons');
ok(/All off \(lab look\)/.test(await page.innerText('#ovAllOff')), 'All off is labelled as the lab look');
// layout: 44 px targets, inside the viewport, rows do not overlap, no horizontal scroll
const lay = await page.evaluate(() => { const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const rows = [...document.querySelectorAll('#ovMenu .ovrow')].map(r); const btns = [...document.querySelectorAll('#ovMenu button')].map(r); const m = r(document.querySelector('#ovMenu'));
  const sw = [...document.querySelectorAll('#ovMenu input[data-ov]')].map(r); let ov = 0; for (let i = 1; i < rows.length; i++) if (rows[i].y < rows[i - 1].b - 0.5) ov++;
  return { m, minRow: Math.min(...rows.map(q => q.h)), minBtn: Math.min(...btns.map(q => Math.min(q.h, q.w))), minSw: Math.min(...sw.map(q => Math.min(q.w, q.h))), overlap: ov, vw: innerWidth, vh: innerHeight, sx: document.documentElement.scrollWidth, cx: document.documentElement.clientWidth, scrollable: document.querySelector('#ovMenu').scrollHeight > document.querySelector('#ovMenu').clientHeight + 1, rows: rows.length }; });
ok(lay.minRow >= 44 && lay.minBtn >= 44 && lay.minSw >= 44, `44 px targets: rows ${lay.minRow.toFixed(0)}, buttons ${lay.minBtn.toFixed(0)}, switch hit areas ${lay.minSw.toFixed(0)}`);
ok(lay.m.x >= -0.5 && lay.m.r <= lay.vw + 0.5 && lay.m.y >= -0.5 && lay.m.b <= lay.vh + 0.5, `menu inside the viewport (${Math.round(lay.m.x)},${Math.round(lay.m.y)} ${Math.round(lay.m.w)}x${Math.round(lay.m.h)} of ${lay.vw}x${lay.vh})`);
ok(lay.overlap === 0, 'rows do not overlap'); ok(lay.sx <= lay.cx, 'no horizontal scroll with the menu open');
if (mobile) ok(Math.abs(lay.m.w - lay.vw) < 2 && lay.m.b >= lay.vh - 2, 'phone: the menu is a full-width bottom sheet');
await page.screenshot({ path: `shots/v7/${prof}-menu-open.png` });
// ---- every switch hides exactly its own element(s)
for (const k of KEYS) {
  await openMenu(); await menuBtn(k).click({ position: { x: 20, y: 12 } }); await closeMenu(); await frame(); sn = await seen();
  ok(!sn[k] && KEYS.filter(q => q !== k).every(q => sn[q]), `switch off "${k}": only that overlay disappears` + (KEYS.every(q => q === k ? !sn[q] : sn[q]) ? '' : ' ' + JSON.stringify(sn)));
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('navitor-sim-overlays-v1') || '{}')); ok(st[k] === false && KEYS.filter(q => q !== k).every(q => st[q] === true), `"${k}" saved off in localStorage`);
  await openMenu(); await menuBtn(k).click({ position: { x: 20, y: 12 } }); await closeMenu(); await frame(); sn = await seen(); ok(KEYS.every(q => sn[q]), `switch on "${k}": everything back`);
}
// ---- All off (lab look) / All on
await openMenu(); await page.click('#ovAllOff'); await frame(); sn = await seen();
ok(KEYS.every(k => !sn[k]) && /Overlays: off/.test(await page.innerText('#btnOverlay')), 'All off: nothing drawn, header says "Overlays: off"');
ok(sn.texts <= 1, 'lab look: only the scale bar text remains on the canvas (' + sn.texts + ' text box)');
ok(await page.locator('#coach').isVisible() && (await page.innerText('#coachText')).length > 10, 'coach line stays on with all overlays off');
await page.screenshot({ path: `shots/v7/${prof}-lab-look-menu.png` });
await closeMenu(); await view(page, 'mon'); await page.locator('#monPanel').screenshot({ path: `shots/v7/${prof}-lab-look-fluoro.png` });
await view(page, 'td'); await page.waitForTimeout(400); await page.locator('#tdPanel').screenshot({ path: `shots/v7/${prof}-lab-look-3d.png` });
await openMenu(); await page.click('#ovAllOn'); await frame(); sn = await seen(); ok(KEYS.every(k => sn[k]) && /Overlays: on/.test(await page.innerText('#btnOverlay')), 'All on: everything back'); await closeMenu();
// ---- 3D panel "Labels" button
await view(page, 'td'); await page.waitForTimeout(300);
ok(await page.locator('#legend').isVisible() && await page.locator('#btnLabels').isVisible(), '3D panel: legend and the Labels button are visible');
const lb = await page.locator('#btnLabels').boundingBox(); ok(lb.height >= (mobile ? 44 : 20), `Labels button size ${Math.round(lb.width)}x${Math.round(lb.height)}`);
await page.click('#btnLabels'); await page.waitForTimeout(200);
ok(await page.locator('#legend').isHidden() && /off/.test(await page.innerText('#btnLabels')), 'Labels off hides the 3D legend');
await page.evaluate(() => { __sim.views.legendPart = null; }); await page.locator('#tdPanel').screenshot({ path: `shots/v7/${prof}-3d-labels-off.png` });
await openMenu(); ok(!(await page.locator('#ovMenu input[data-ov=parts]').isChecked()) && (await page.locator('#ovMenu input[data-ov=labels]').isChecked()), 'menu switch "Device part labels" follows the Labels button; anatomy labels untouched'); await closeMenu();
await page.click('#btnLabels'); await page.waitForTimeout(200); ok(await page.locator('#legend').isVisible(), 'Labels on shows the legend again');
await page.locator('#tdPanel').screenshot({ path: `shots/v7/${prof}-3d-labels-on.png` });
// legend / button do not overlap on the 3D panel
const ovl = await page.evaluate(() => { const a = document.querySelector('#legend').getBoundingClientRect(), b = document.querySelector('.tdbtns').getBoundingClientRect(); return !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5); });
ok(!ovl, '3D panel: legend and the Labels / Cutaway buttons do not overlap');
// header controls do not overlap each other (phone header is tight)
await view(page, 'mon');
const hdr = await page.evaluate(() => { const els = ['#segMode', '#segLock', '#btnOverlay', '#btnSettings', '#btnReset'].map(s => document.querySelector(s).getBoundingClientRect()); let o = 0; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; if (!(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5)) o++; } return { o, sx: document.documentElement.scrollWidth, cx: document.documentElement.clientWidth }; });
ok(hdr.o === 0, 'header controls do not overlap'); ok(hdr.sx <= hdr.cx, 'no horizontal scroll');
// ---- persistence: turn some off, reload, the choices come back (menu, header text, drawing)
await openMenu(); for (const k of ['labels', 'inset', 'handle']) await menuBtn(k).click({ position: { x: 20, y: 12 } }); await closeMenu();
await page.reload(); await page.addScriptTag({ path: 'tests/drv.js' }); await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
const after = await page.evaluate(() => ({ o: { ...__sim.views.overlay }, ls: JSON.parse(localStorage.getItem('navitor-sim-overlays-v1')), btn: document.querySelector('#btnOverlay').textContent, cls: ['labels', 'inset', 'handle', 'parts'].map(k => document.querySelector('#app').classList.contains('ov-off-' + k)) }));
ok(!after.o.labels && !after.o.inset && !after.o.handle && after.o.parts && after.o.measures && after.o.guides && after.o.parallax && after.o.angles, 'after reload: the saved choices are applied ' + JSON.stringify(after.o));
await openMenu(); const chk = await page.evaluate(() => KEYS_ = [...document.querySelectorAll('#ovMenu input[data-ov]')].map(c => [c.dataset.ov, c.checked])); ok(chk.filter(c => !c[1]).map(c => c[0]).sort().join() === 'handle,inset,labels', 'menu switches reflect the saved state: off = ' + chk.filter(c => !c[1]).map(c => c[0]));
ok(await page.evaluate(() => getComputedStyle(document.querySelector('#spdTxt').parentElement).display === 'none'), 'handle status text stays hidden after reload'); await closeMenu();
// corrupt storage falls back to defaults
await page.evaluate(() => localStorage.setItem('navitor-sim-overlays-v1', '{not json')); await page.reload(); await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(500);
ok(await page.evaluate(() => Object.values(__sim.views.overlay).every(v => v === true)), 'corrupt storage: defaults (all on), no crash');
await page.evaluate(() => localStorage.removeItem('navitor-sim-overlays-v1'));
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
await browser.close();
// ---- scoring and gating are identical with all overlays on vs all off (same scripted case, two fresh browsers)
const run = async (allOff) => {
  const b = await launch(W, H, mobile); const pg = b.page;
  if (allOff) await pg.addInitScript(() => localStorage.setItem('navitor-sim-overlays-v1', JSON.stringify({ parts: false, labels: false, measures: false, guides: false, inset: false, parallax: false, angles: false, handle: false })));
  await boot(pg);
  const mid = []; const grab = () => pg.evaluate(() => { const s = __sim.state; return JSON.stringify([s.phase, s.chk, s.dev.f, s.dev.s, s.note]); });
  await pg.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); }); mid.push(await grab());
  await pg.evaluate(() => { __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); __drv.deployTo(0.5); }); mid.push(await grab());
  await pg.evaluate(() => { __drv.toLock(); __drv.secondView(); __drv.release('fast'); __drv.phase8(); __drv.phase9(); });
  const res = await pg.evaluate(() => { const sc = __sim.sim.score; return JSON.stringify({ passed: sc.passed, total: sc.total, rows: sc.rows.map(r => [r.id, r.pass]), fin: __sim.sim.finished }); });
  const ovs = await pg.evaluate(() => JSON.stringify(__sim.views.overlay)); await b.browser.close(); return { mid, res, ovs };
};
const A = await run(false), B = await run(true);
ok(/false/.test(B.ovs) && !/true/.test(B.ovs), 'second run really had every overlay off'); ok(A.mid.join('|') === B.mid.join('|'), 'gating: identical phase / checks / deployment / notes at phase 4 and 5 with overlays on vs off'); ok(A.res === B.res && JSON.parse(A.res).fin, 'scoring: identical proctor rows with overlays on vs off: ' + JSON.parse(A.res).passed + '/' + JSON.parse(A.res).total);
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n'));
process.exit(bad ? 1 : 0);
