// v11: the wire is the rail - the system takes the anatomical path's own tightest bend (about 9.1 deg per 2 mm, R ~12.7 mm in the arch/root) plus < 1 mm clearance, so the smoothness cap is 10.5 deg (was 7.5 with the old bend limiter).
// Smooth continuous delivery system: real-UI screenshots (fluoro + 3D) in phases 1, 3, 4, 5 and geometry checks on the live tubes.
import { launch } from './pw.mjs';
import fs from 'fs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
fs.mkdirSync('shots/v5', { recursive: true });
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
// geometry readout from the live device: max turning angle of the centreline AND of every tube (ring-to-ring), per-frame jitter
const geo = () => page.evaluate(() => {
  const dv = __sim.views.dev; const cl = dv.cl, THREE = __sim.THREE; const out = { cl: cl.maxTurn, tubes: {}, rings: {} };
  for (const k of ['tSheath', 'tShaft', 'tCap', 'tInner', 'tNose']) out.rings[k] = dv[k].rings;
  const w = dv.wirePts || []; let wm = 0; for (let i = 1; i < w.length - 1; i++) { const a = w[i].clone().sub(w[i - 1]).normalize(), b = w[i + 1].clone().sub(w[i]).normalize(); wm = Math.max(wm, Math.acos(Math.min(1, a.dot(b))) * 180 / Math.PI); }
  out.wire = wm; let ws = 0; for (let i = 1; i < w.length - 45; i++) { const a = w[i].clone().sub(w[i - 1]).normalize(), b = w[i + 1].clone().sub(w[i]).normalize(); ws = Math.max(ws, Math.acos(Math.min(1, a.dot(b))) * 180 / Math.PI); } out.wireShaft = ws; out.wirePts = w.length; out.tip = cl.at(0).toArray(); out.n = cl.n; return out;
});
const shots = async (tag) => {
  for (const mode of ['fluoro', 'anat']) {
    await page.evaluate((m) => { __sim.setMode(m); __sim.snapView(); __sim.render(0.5); __sim.render(0.5); }, mode); await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/v5/${prof}-${tag}-${mode === 'fluoro' ? 'fluoro' : '3d'}.png` });
  }
  await page.evaluate(() => { __sim.setMode('fluoro'); });
};
const check = async (tag) => {
  const g = await geo();
  ok(g.cl <= 10.5, `${tag}: centreline max turn ${g.cl.toFixed(2)} deg per 2 mm (<= 10.5)`);
  ok(g.wire <= 13.5, `${tag}: guidewire max turn ${g.wire.toFixed(2)} deg per 1.5 mm incl. the 8 mm pigtail curl (<= 13.5)`);
  ok(g.wireShaft <= 10.5, `${tag}: guidewire shaft (without the pigtail) max turn ${g.wireShaft.toFixed(2)} deg per 1.5 mm (<= 10.5)`);
  ok(g.rings.tSheath > 100 && g.rings.tCap > 5 && g.rings.tNose > 10, `${tag}: continuous tubes built (rings ${JSON.stringify(g.rings)})`);
  return g;
};
const st = () => page.evaluate(() => __sim.state);
// phase 1: mid-iliac
await page.evaluate(() => { const s = __sim.sim; s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.phase === 1 && s.dev.s < 250 && g++ < 6000) { __drv.autoFlex(); s.update(1 / 30); } s.input = {}; });
ok((await st()).phase === 1, 'phase 1 (iliac)'); await page.waitForTimeout(300); await check('p1'); await shots('phase1');
// phase 3: arch
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); const s = __sim.sim; s.input = { adv: 1 }; let g = 0; while (s.phase === 3 && s.dev.s < s.lm.archApex && g++ < 9000) { __drv.autoFlex(); s.update(1 / 30); } s.input = {}; });
ok((await st()).phase === 3, 'phase 3 (arch)'); await page.waitForTimeout(300); await check('p3'); await shots('phase3');
// phase 4: crossed, in the root
await page.evaluate(() => { __drv.goArch(); __drv.goCross(); });
ok((await st()).phase === 4, 'phase 4 (valve crossed)'); await page.waitForTimeout(300); await check('p4'); await shots('phase4');
// phase 5: partly deployed, flexed capsule
await page.evaluate(() => { __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); __drv.deployTo(0.5); });
ok((await st()).phase === 5, 'phase 5 (deploying)'); await page.waitForTimeout(300); await check('p5'); await shots('phase5');
// temporal smoothness while advancing / rotating: per-frame displacement of every centreline sample stays small
const jit = await page.evaluate(() => {
  const s = __sim.sim, dv = __sim.views.dev, cl = dv.cl; let worst = 0, worstTurn = 0; __sim.setMode('fluoro');
  const snap = () => Float64Array.from(cl.P);
  const run = (input, n) => { let prev = null; for (let i = 0; i < n; i++) { Object.assign(s.input, input); s.update(1 / 30); dv.update(s, 1 / 30); const cur = snap(); if (prev) for (let k = 0; k < cur.length; k += 3) { const d = Math.hypot(cur[k] - prev[k], cur[k + 1] - prev[k + 1], cur[k + 2] - prev[k + 2]); worst = Math.max(worst, d); } worstTurn = Math.max(worstTurn, cl.maxTurn); prev = cur; } s.input = {}; };
  run({ adv: -1 }, 40); run({ twirl: 1 }, 30); run({ adv: 1 }, 40); run({ flexUp: 1 }, 20);
  return { worst, worstTurn };
});
ok(jit.worst < 3.2, `frame-to-frame centreline displacement while retreating/rotating/advancing: max ${jit.worst.toFixed(2)} mm per frame (< 3.2)`);
ok(jit.worstTurn <= 10.5, `max turn during motion ${jit.worstTurn.toFixed(2)} deg`);
// kink failure: localized soft narrowing of the sheath radius, no jagged geometry
const kink = await page.evaluate(() => { const s = __sim.sim, dv = __sim.views.dev, cl = dv.cl; s.fx = null; s.fail('kink', { tag: 'iliac', retry: () => {} }); s.fx.t = 0.8; dv.update(s, 1 / 30);
  const sTip = s.dev.sd ?? s.dev.s; let mn = 1, at = 0, narrowN = 0; for (let d = 0; d < 1000; d += 1) { const k = cl.kinkScale(d, s.fx, sTip); if (k < mn) { mn = k; at = d; } if (k < 0.97) narrowN++; } return { mn, at, narrowN, turn: cl.maxTurn, coach: s.fx.coach }; });
ok(kink.mn < 0.7 && kink.narrowN > 8 && kink.narrowN < 40, `kink = localized soft narrowing (min radius x${kink.mn.toFixed(2)} at d=${kink.at}, ${kink.narrowN} mm wide), centreline still smooth (${kink.turn.toFixed(2)} deg)`);
ok(/kink/i.test(kink.coach), 'kink coaching line: ' + kink.coach);
await page.evaluate(() => { __sim.render(0.5); }); await page.waitForTimeout(300); await page.screenshot({ path: `shots/v5/${prof}-kink-fluoro.png` });
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n'));
await browser.close(); process.exit(bad ? 1 : 0);
