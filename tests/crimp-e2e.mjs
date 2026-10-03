// The crimped valve (frame struts, posts, Vision markers, cuff) must sit INSIDE the smooth, bending capsule and flex with it - never poke out.
import { launch } from './pw.mjs';
import fs from 'fs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
fs.mkdirSync('shots/v6', { recursive: true });
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
const view = async (v) => { if (mobile) { await page.locator(`#viewtabs button[data-vt=${v}]`).click(); await page.waitForTimeout(400); } };
// set a flex value, let the sim derive the lateral offset, rebuild the device with no temporal lag, then measure containment + bend
const probe = (flex) => page.evaluate((flex) => {
  const S = __sim.sim, dv = __sim.views.dev; __sim.pause(true); S.fx = null; window.__flex0 = window.__flex0 ?? S.dev.flex; S.dev.flex = flex; S.update(1 / 30); S.fx = null; dv.cl.reset(); dv.update(S, 0); dv.update(S, 0);
  const c = dv.containment(); const cl = dv.cl; const kz = dv.kz || 1;
  // sagitta (mm) of the capsule centreline and of the three posts' mean line over the posts' length
  const sag = (pt) => { const n = pt.length; const A = pt[0], B = pt[n - 1]; const ab = B.clone().sub(A), L2 = ab.lengthSq(); let m = 0; for (const p of pt) { const t = p.clone().sub(A).dot(ab) / L2; m = Math.max(m, p.clone().sub(A.clone().addScaledVector(ab, t)).length()); } return m; };
  const capPts = [], postPts = []; for (let i = 0; i < 9; i++) { capPts.push(cl.at(dv.constructor.name && 22 + (14 + 26 * i / 8) * kz)); const m = new __sim.THREE.Vector3(); for (let k = 0; k < 3; k++) m.add(dv.postPts[k][i]); postPts.push(m.multiplyScalar(1 / 3)); }
  return { ld: dv.ld, n: c.n, total: c.total, margin: c.minMargin, worst: c.worst, lat: S.dev.lat, f: S.dev.f, capSag: sag(capPts), postSag: sag(postPts), maxTurn: cl.maxTurn, rel: dv.rel };
}, flex);
const FLEX = [0, 0.25, 0.5, 0.75, 1];
const restore = () => page.evaluate(() => { const S = __sim.sim; if (window.__flex0 != null) { S.dev.flex = window.__flex0; window.__flex0 = null; S.update(1 / 30); } __sim.pause(false); });
const sweep = async (tag, requireInside = true) => {
  let worst = 1e9, nmin = 1e9, w = null, maxSag = 0, bendOk = true, dsag = 0;
  for (const fl of FLEX) { const r = await probe(fl); worst = Math.min(worst, r.margin); nmin = Math.min(nmin, r.n); if (r.margin === worst) w = { fl, ...r.worst }; maxSag = Math.max(maxSag, r.capSag); if (r.ld <= 14) dsag = Math.max(dsag, Math.abs(r.capSag - r.postSag)); }
  await restore();
  ok(!requireInside || nmin > 20, `${tag}: crimped valve vertices inside the capsule were sampled (min ${nmin} per pose)`);
  ok(worst > 0.05, `${tag}: crimped valve stays inside the capsule at flex 0..100% - worst clearance ${worst.toFixed(2)} mm ${JSON.stringify(w)}`);
  ok(dsag < 0.6, `${tag}: posts follow the capsule bend while crimped (capsule sagitta up to ${maxSag.toFixed(2)} mm; posts differ by at most ${dsag.toFixed(2)} mm)`);
  return { worst, maxSag };
};
const closeup = async (tag, flex) => {
  await probe(flex); await restore(); await page.evaluate(() => __sim.pause(true));
  await page.evaluate(() => {
    const V = __sim.views, dv = V.dev, THREE = __sim.THREE, cl = dv.cl, kz = dv.kz || 1; __sim.setMode('anat'); __sim.setLock(false);
    const A = cl.at(22 + 2 * kz), B = cl.at(22 + 50 * kz), M = cl.at(22 + 26 * kz); const chord = B.clone().sub(A).normalize(); const cur = M.clone().sub(A.clone().add(B).multiplyScalar(0.5)); cur.addScaledVector(chord, -cur.dot(chord));
    let dir = chord.clone().cross(cur); if (dir.length() < 0.02) dir = chord.clone().cross(new THREE.Vector3(0, 0, 1)); dir.normalize();
    // cam looks along the bend plane normal, slightly raised
    const up = new THREE.Vector3().crossVectors(dir, chord).normalize(); dir.addScaledVector(up, 0.25).normalize();
    V.updateTarget = () => {}; V.centerT.copy(M); V.center.copy(M); V.controls.target.copy(M); V.cam3.position.copy(M).addScaledVector(dir, 62); V.cam3.up.copy(up); V.cam3.lookAt(M); V.controls.update();
  });
  await view('td'); await page.waitForTimeout(900);
  await page.evaluate(() => { const V = __sim.views; V.cam3.updateMatrixWorld(); });
  await page.locator('#tdPanel').screenshot({ path: `shots/v6/${prof}-${tag}-flex${Math.round(flex * 100)}-3d.png` });
};
const st = () => page.evaluate(() => __sim.state);
// ---- phase 1 (iliac), crimped valve, 0 % deployed
await page.evaluate(() => { const s = __sim.sim; s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.phase === 1 && s.dev.s < 250 && g++ < 6000) { __drv.autoFlex(); s.update(1 / 30); } s.input = {}; });
ok((await st()).phase === 1, 'phase 1 (iliac)'); await sweep('phase 1, deployment 0%');
// ---- phase 3 (arch)
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); const s = __sim.sim; s.input = { adv: 1 }; let g = 0; while (s.phase === 3 && s.dev.s < s.lm.archApex && g++ < 9000) { __drv.autoFlex(); s.update(1 / 30); } s.input = {}; });
ok((await st()).phase === 3, 'phase 3 (arch)'); await sweep('phase 3, deployment 0%'); await closeup('phase3', 0.5);
// ---- phase 4 (crossed)
await page.evaluate(() => { __drv.goArch(); __drv.goCross(); });
ok((await st()).phase === 4, 'phase 4 (valve crossed)'); await sweep('phase 4, deployment 0%');
// ---- phase 5: deployment 0, 30, 60, 80 %
await page.evaluate(() => { __drv.alignAt(); __sim.sim.act.setCarm(-30, -30); __drv.press(); });
ok((await st()).phase === 5, 'phase 5'); await sweep('phase 5, deployment 0%');
for (const fx of [0.3, 0.6, 0.8]) { await page.evaluate((f) => { __sim.pause(false); __drv.deployTo(f); __sim.sim.fx = null; __drv.up(20); }, fx); const s = await st(); ok(Math.abs(s.dev.f - fx) < 0.06, `deployed to ${(s.dev.f * 100).toFixed(0)}% (wanted ${fx * 100}%)`); await sweep(`phase ${s.phase}, deployment ${Math.round(fx * 100)}%`); }
// ---- close-ups at flex 0 / 50 / 100 (3D anatomy view, camera on the capsule, valve 30 % out so crimped + opening parts show); then fluoro
await page.evaluate(() => { __sim.pause(false); __drv.resheathTo(0.3); __sim.sim.fx = null; __drv.up(20); });
for (const fl of [0, 0.5, 1]) await closeup('phase5', fl);
await page.evaluate(() => { __sim.setMode('fluoro'); __sim.render(0.5); __sim.render(0.5); }); await view('mon'); await page.waitForTimeout(600);
await page.locator('#monPanel').screenshot({ path: `shots/v6/${prof}-phase5-fluoro.png` });
// the fluoro crimped bundle exists and is bent along the same centreline
const fl = await page.evaluate(() => { const dv = __sim.views.dev; return { rings: dv.crimpBody.rings, vis: dv.crimpBody.geo.drawRange.count > 0, struts: dv.struts.count }; });
ok(fl.rings > 4 && fl.vis && fl.struts > 100, `fluoro: dense crimped bundle drawn along the centreline (${fl.rings} rings, ${fl.struts} strut pieces)`);
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n'));
await browser.close(); process.exit(bad ? 1 : 0);
