// Phase 8 ordering rule (v12): keep the wire fixed, withdraw the whole system with the nosecone still OPEN through the valve and the arch into the descending aorta,
// and only there close the nosecone with the MACRO slide. Real UI: button / handle-diagram states, coach lines, refusal + scored miss, correct run passes.
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
const st = () => page.evaluate(() => JSON.parse(JSON.stringify(__sim.state)));
await page.goto('file://' + process.cwd() + '/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
const tab = async (t) => { if (mobile) { await page.locator(`#ctabs button[data-t=${t}]`).click(); await page.waitForTimeout(300); } };
const view = async (v) => { if (mobile) { await page.locator(`#viewtabs button[data-vt=${v}]`).click(); await page.waitForTimeout(400); } };
const holdBtn = async (sel, ms) => { const l = page.locator(sel); await l.scrollIntoViewIfNeeded(); const b = await l.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(300); };
const txt = (sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
const shots = async (tag) => { await view('mon'); await page.locator('#monPanel').screenshot({ path: `shots/v12/${prof}-${tag}-fluoro.png` }); await tab('handle'); await page.locator('#hsvg').screenshot({ path: `shots/v12/${prof}-${tag}-handle.png` }).catch(() => {}); };
const toPhase8 = async () => page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); __drv.toLock(); __drv.secondView(); __drv.release('fast'); });
const prep = () => page.evaluate(() => { const S = __sim.sim; if (!S.wire.hold) S.act.toggleHold(); S.input = { wire: 1 }; let g = 0; while (S.wireAdv() < 0.6 && g++ < 400) S.update(1 / 30); S.input = {}; S.act.flexSet(0.15); });
const step = (target) => page.evaluate((t) => { const S = __sim.sim; S.input = { adv: -1 }; let g = 0; while (S.dev.s > t && g++ < 20000) { __drv.autoFlex(-8); S.update(1 / 30); if (S.fx) break; } S.input = {}; return { s: S.dev.s, fx: S.fx && S.fx.type }; }, target);
const lm = await page.evaluate(() => ({ ...__sim.sim.lm }));

// ---------------- run 1: tries to close early (scored miss), then does it right
await toPhase8(); await page.waitForTimeout(600);
let s = await st(); ok(s.phase === 8 && s.dev.released, 'released -> phase 8');
const coach0 = await txt('#coachText'); ok(/OPEN nosecone/.test(coach0) && /descending aorta/.test(coach0) && /Keep the wire FIXED/.test(coach0), 'phase 8 instructions: wire fixed, withdraw the OPEN system into the descending aorta, then close: "' + coach0.slice(0, 120) + '..."');
await tab('handle'); await page.waitForTimeout(300);
ok(await page.evaluate(() => document.querySelector('#hMacro').dataset.macro) === 'locked', 'MACRO button state: locked'); ok(/LOCKED/.test(await txt('#hMacro')) && /descending aorta/.test(await txt('#hMacro')), 'MACRO button label: "' + await txt('#hMacro') + '"');
ok(/locked/i.test(await txt('#mac1t')) && /descending/i.test(await txt('#tMacro2')), 'handle diagram: "' + await txt('#mac1t') + '" / "' + await txt('#tMacro2') + '"');
ok(await page.evaluate(() => document.querySelector('#mac1').getAttribute('stroke')) !== '#f5f5f5', 'handle diagram: MACRO slide drawn in the locked (amber) style');
ok(await page.evaluate(() => !document.querySelector('#hMacro').disabled && document.querySelector('#hMacro').getAttribute('aria-disabled') === 'true'), 'locked button is flagged aria-disabled but can still be pressed (it explains why it refuses)');
await shots('p8-locked-root');
await holdBtn('#hMacro', 1300); s = await st();
ok(s.dev.macro === 0, 'real MACRO hold in the root is REFUSED (macro 0)'); ok(s.flags.macroEarly >= 1, 'refused attempt counted as an early closure (' + s.flags.macroEarly + ')'); ok(/Withdraw the open system into the descending aorta before closing the nosecone/.test(s.note || ''), 'coach line: "' + s.note + '"');
await page.keyboard.down('KeyM'); await page.waitForTimeout(900); await page.keyboard.up('KeyM'); s = await st(); ok(s.dev.macro === 0, 'keyboard M in the root also refused');
await prep();
// through the ascending aorta / arch: still locked
let r = await step(lm.ann - 150); s = await st(); ok(!r.fx && s.dev.s > lm.archStart && s.dev.macro === 0, 'withdrawn open to s=' + s.dev.s.toFixed(0) + ' (ascending aorta): MACRO still locked'); ok(await page.evaluate(() => __sim.sim.macroState()) === 'locked', 'macroState locked in the ascending aorta');
r = await step(lm.archApex); s = await st(); ok(!r.fx && s.dev.macro === 0 && await page.evaluate(() => __sim.sim.macroState()) === 'locked', 'in the arch (s=' + s.dev.s.toFixed(0) + '): locked, no failure');
await tab('handle'); await holdBtn('#hMacro', 800); s = await st(); ok(s.dev.macro === 0, 'macro in the arch refused too');
r = await step(lm.archStart - 27); s = await st(); ok(!r.fx && s.dev.s <= lm.archStart - 25 + 1 && s.dev.macro === 0 && s.phase === 8, 'open system is now in the descending aorta (s=' + s.dev.s.toFixed(0) + '), nosecone still open, no failure');
await page.waitForTimeout(600); await tab('handle');
ok(await page.evaluate(() => document.querySelector('#hMacro').dataset.macro) === 'ready' && /READY/.test(await txt('#hMacro')), 'MACRO button now READY: "' + await txt('#hMacro') + '"');
ok(/READY/.test(await txt('#tMacro2')) && await page.evaluate(() => document.querySelector('#mac1').getAttribute('stroke')) === '#f5f5f5', 'handle diagram: "' + await txt('#tMacro2') + '", enabled style');
ok(/descending aorta, clear of the arch: now close the nosecone/.test(await txt('#coachText')), 'coach line: now close the nosecone'); await shots('p8-ready-descending');
await holdBtn('#hMacro', 2000); s = await st(); ok(s.dev.macro > 0.2, 'MACRO hold now closes the nosecone (macro ' + s.dev.macro + ')');
await page.evaluate(() => __drv.phase8()); s = await st(); ok(s.phase === 9, 'after closure the withdrawal continues out the iliac -> phase 9');
await page.evaluate(() => __drv.phase9()); await page.waitForTimeout(800);
ok(await page.locator('#scoreModal').isVisible(), 'score sheet shown');
let rows = await page.evaluate(() => [...document.querySelectorAll('#scoreTable tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
const nose = rows.find(x => /Nosecone and system path/.test(x)) || ''; ok(/early nosecone closure/.test(nose) && /MISS|Miss|miss|X|✗|fail/i.test(nose + ' ') || /early nosecone closure/.test(nose), 'score sheet: early closure is a scored miss on the nosecone row: "' + nose.slice(0, 220) + '"');
ok(/descending aorta/.test(nose), 'score sheet wording explains the correct order');
await page.screenshot({ path: `shots/v12/${prof}-score-early-closure.png` });

// ---------------- run 2: correct order from the start => the nosecone row passes
await page.evaluate(() => __sim.reset()); await page.waitForTimeout(500);
await toPhase8(); await page.evaluate(() => { __drv.phase8(); __drv.phase9(); }); await page.waitForTimeout(800);
rows = await page.evaluate(() => [...document.querySelectorAll('#scoreTable tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
const nose2 = rows.find(x => /Nosecone and system path/.test(x)) || ''; ok(/nosecone closed with the macro slide in the descending aorta/.test(nose2) && !/early/.test(nose2), 'correct order: nosecone row text "' + nose2.slice(0, 200) + '"');
await page.screenshot({ path: `shots/v12/${prof}-score-correct-order.png` });

// ---------------- skipped into phase 8: same rule
await page.evaluate(() => __sim.reset()); await page.waitForTimeout(500);
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); __drv.toLock(); __drv.secondView(); __sim.sim.act.unlock(); });
for (let i = 0; i < 6; i++) { const p = (await st()).phase; if (p >= 8) break; await page.click('#btnSkip'); await page.waitForTimeout(300); }
s = await st(); ok(s.phase === 8 && s.dev.released && s.dev.macro === 0, 'Skip phase sets up phase 8: released, nosecone open, system in the root'); ok(await page.evaluate(() => __sim.sim.macroState()) === 'locked' && /locked/i.test(await txt('#coachText')), 'skip set-up: MACRO locked and the coach line says so: "' + (await txt('#coachText')).slice(-120) + '"');
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).then(v => ok(v, 'no horizontal scroll'));
console.log(`${prof}: ${pass} ok, ${bad} failed`); fails.forEach(f => console.log('  X ' + f));
await browser.close(); process.exit(bad ? 1 : 0);
