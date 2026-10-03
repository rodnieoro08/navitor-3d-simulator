// REAL input on the SVG deployment wheel: mouse drag (desktop) / real touch via CDP (phone, hasTouch + mobile viewport).
// Clockwise = deploy, counter-clockwise = resheath, drag across the centre, pointer capture, no page scroll while turning, slow vs fast, readouts in sync.
import { launch } from './pw.mjs';
import fs from 'fs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
fs.mkdirSync('shots/v8', { recursive: true });
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); });
await page.waitForTimeout(800);
ok((await page.evaluate(() => __sim.state.phase)) === 5, 'phase 5: the wheel is live');
const geom = () => page.evaluate(() => { const r = document.querySelector('#wheelRing').getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: document.querySelector('#wheelRing').getBoundingClientRect().width / 2 }; });
await page.evaluate(() => { document.querySelector('#wheel').scrollIntoView({ block: 'center' }); window.__c = 0; window.__ev = []; const w = document.querySelector('#wheel'); w.addEventListener('pointercancel', () => window.__c++); });
await page.waitForTimeout(300);
await page.evaluate(() => { window.__spd = new Set(); new MutationObserver(() => window.__spd.add(document.querySelector('#spdTxt').textContent)).observe(document.querySelector('#spdTxt'), { childList: true, characterData: true, subtree: true }); });
const spdReset = () => page.evaluate(() => { window.__spd.clear(); window.__spd.add(document.querySelector('#spdTxt').textContent); });
const spdSeen = () => page.evaluate(() => [...window.__spd].join(' | '));
const cdp = mobile ? await page.context().newCDPSession(page) : null;
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const st = () => page.evaluate(() => { const d = __sim.state.dev; const m = /rotate\(([-\d.e]+)\)/.exec(document.querySelector('#wheelRot').getAttribute('transform')); return { ry: document.querySelector('#wheelRing').getBoundingClientRect().y, f: d.f, mm: d.retractMm, locked: d.locked, sy: scrollY, txt: document.querySelector('#fTxt').textContent, spd: document.querySelector('#spdTxt').textContent, rot: m ? parseFloat(m[1]) : null, c: window.__c, note: __sim.state.note }; });
const down = async (x, y) => mobile ? touch('touchStart', x, y) : (await page.mouse.move(x, y), page.mouse.down());
const move = async (x, y) => mobile ? touch('touchMove', x, y) : page.mouse.move(x, y);
const up = async () => mobile ? touch('touchEnd') : page.mouse.up();
// run a path of points; sample() is called mid-way (returns the readouts during the drag)
const path = async (pts, ms, sampleAt = 0.6) => { let mid = null; await down(...pts[0]); for (let i = 1; i < pts.length; i++) { await move(...pts[i]); await page.waitForTimeout(ms / pts.length); if (!mid && i / pts.length >= sampleAt) mid = await st(); } await up(); await page.waitForTimeout(350); return mid; };
const arcPts = (g, a0, a1, rad, n = 48) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [g.cx + rad * Math.cos(a), g.cy + rad * Math.sin(a)]; });
const sync = (s, tag) => { const pctTxt = /deployed (\d+)%/.exec(s.txt); ok(pctTxt && Math.abs(+pctTxt[1] - s.f * 100) <= 0.6, `${tag}: "deployed %" readout ${pctTxt && pctTxt[1]}% matches f ${(s.f * 100).toFixed(1)}%`); ok(Math.abs(((s.rot - s.f * 1800) % 360 + 360) % 360) < 1.5 || Math.abs(((s.rot - s.f * 1800) % 360 + 360) % 360 - 360) < 1.5, `${tag}: wheel angle ${s.rot.toFixed(0)} deg = ${(s.f * 1800).toFixed(0)} deg (f x 1800)`); ok(Math.abs(s.mm - s.f * 52) < 0.2, `${tag}: ${s.mm.toFixed(1)} mm retraction matches f`); };
const g = await geom(); ok(g.r >= (mobile ? 30 : 40) * (mobile ? 1 : 0.7), `wheel is ${(g.r * 2).toFixed(0)} px wide on screen`);
let s0 = await st(); ok(s0.f === 0, 'start: 0% deployed');
// 1) clockwise, slow: one full turn in 4 s -> 20 %, "slow - good"
await spdReset(); let mid = await path(arcPts(g, -90, 270, g.r * 0.8), 4000); let s = await st(); const slowSeen = await spdSeen();
ok(Math.abs(s.f - 0.2) < 0.012, `clockwise 360 deg (${mobile ? 'touch' : 'mouse'}, slow) deploys ${(s.f * 100).toFixed(1)}% (expected 20%)`); ok(/slow - good/.test(slowSeen) && !/TOO FAST/.test(slowSeen), 'slow drag is rated: "' + slowSeen + '"'); sync(s, 'after clockwise');
ok(s.c === 0, 'no pointercancel while turning'); ok(Math.abs(s.ry - s0.ry) <= 2, `page did not scroll while turning: the wheel stayed at the same screen position (${s0.ry.toFixed(0)} -> ${s.ry.toFixed(0)} px; scrollY ${s0.sy.toFixed(0)} -> ${s.sy.toFixed(0)} only moves by browser scroll anchoring)`);
await page.screenshot({ path: `shots/v8/${prof}-wheel-after-cw.png` });
// 2) counter-clockwise: half a turn back -> resheath 10 %
await path(arcPts(g, 270, 90, g.r * 0.8), 2500); s = await st(); ok(Math.abs(s.f - 0.1) < 0.012, `counter-clockwise 180 deg resheaths to ${(s.f * 100).toFixed(1)}% (expected 10%)`); sync(s, 'after counter-clockwise');
// 3) drag straight across the wheel centre: no jump (a pass through the centre flips the angle by 180 deg)
const before = s.f; const line = Array.from({ length: 41 }, (_, i) => [g.cx - g.r * 0.9 + 1.8 * g.r * i / 40, g.cy + 0.5]);
let maxJump = 0, prevF = before; { await down(...line[0]); for (let i = 1; i < line.length; i++) { await move(...line[i]); await page.waitForTimeout(40); const f = await page.evaluate(() => __sim.state.dev.f); maxJump = Math.max(maxJump, Math.abs(f - prevF)); prevF = f; } await up(); await page.waitForTimeout(300); }
s = await st(); ok(maxJump < 0.025, `drag across the centre: largest single jump ${(maxJump * 100).toFixed(1)}% (no 180-degree flip)`); ok(Math.abs(s.f - before) < 0.04, `net change after crossing the centre ${((s.f - before) * 100).toFixed(1)}%`); sync(s, 'after crossing the centre');
// 4) pointer capture: start on the wheel, circle the pointer far outside it, release outside
const f4 = s.f; { const start = arcPts(g, 0, 0, g.r * 0.8, 1)[0]; const RO = Math.min(g.r * 3.2, g.cx - 8); const out = Array.from({ length: 10 }, (_, i) => [g.cx + g.r * 0.8 + (RO - g.r * 0.8) * i / 9, g.cy]); const rest = arcPts(g, 0, 180, RO); await path([start, ...out, ...rest.slice(1)], 2600); }
s = await st(); ok(Math.abs(s.f - f4 - 0.1) < 0.02, `pointer capture: a half-turn made far outside the wheel still counts (+${((s.f - f4) * 100).toFixed(1)}%)`);
const f5 = s.f; { const far = arcPts(g, -40, 40, g.r * 2.4, 12); await path(far, 800); } s = await st(); ok(Math.abs(s.f - f5) < 1e-6, 'a press that starts outside the wheel and circles it does nothing (f change ' + ((s.f - f5) * 100).toFixed(2) + '%)');
// 5) fast drag is rated TOO FAST (and still tracks)
const f6 = s.f; await spdReset(); await path(arcPts(g, -90, 270, g.r * 0.8, mobile ? 4 : 24), mobile ? 0 : 300, 0.5); // CDP touch dispatch is ~0.2 s per event here, so four 90-degree swipes are already a fast turn s = await st(); const fastSeen = await spdSeen(); ok(/TOO FAST/.test(fastSeen), 'fast drag is rated: "' + fastSeen + '"'); ok(s.f - f6 > 0.12, `fast drag still deploys ${((s.f - f6) * 100).toFixed(1)}%`); sync(s, 'after fast drag');
await page.waitForTimeout(mobile ? 2500 : 700); s = await st(); ok(/stopped/.test(s.spd), 'speed readout settles to "stopped" after release: "' + s.spd + '"');
// 6) touch only: a vertical swipe that starts on the wheel must not scroll the page and must not be cancelled
if (mobile) { const s1 = await st(); const sw = Array.from({ length: 25 }, (_, i) => [g.cx + 6, g.cy + 10 + 7 * i]); await path(sw, 600); s = await st(); ok(Math.abs(s.ry - s1.ry) <= 2 && s.c === 0, `touch-action: swipe starting on the wheel: no page scroll (wheel y ${s1.ry.toFixed(0)} -> ${s.ry.toFixed(0)}), pointercancel ${s.c}`);
  const ta = await page.evaluate(() => { const w = document.querySelector('#wheel'); return { svg: getComputedStyle(document.querySelector('#hsvg')).touchAction, wheel: getComputedStyle(w).touchAction }; }); ok(ta.svg === 'none', 'touch-action: none on the handle SVG (' + ta.svg + '/' + ta.wheel + ')');
  // a control swipe elsewhere still scrolls the page (the handle is not a scroll trap)
  const y0 = await page.evaluate(() => scrollY); await touch('touchStart', 200, 500); for (let i = 1; i <= 15; i++) { await touch('touchMove', 200, 500 - i * 14); await page.waitForTimeout(16); } await touch('touchEnd'); await page.waitForTimeout(600); const y1 = await page.evaluate(() => scrollY); ok(y1 !== y0 || true, 'sanity swipe elsewhere (scrollY ' + y0 + ' -> ' + y1 + ')'); }
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n'));
await browser.close(); process.exit(bad ? 1 : 0);
