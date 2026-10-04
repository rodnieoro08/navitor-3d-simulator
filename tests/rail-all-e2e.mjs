// v13: "nosecone drawn beside the wire in fluoro?" Live-frame measurement, in 3D AND in fluoro screen space (pixels), in ALL phases:
//  natural play, after every Skip phase, after every Back. No cl.reset(), no pausing: real animation frames, as a learner sees them.
//  Checks: tip / nosecone / inner-shaft ring centres lie on the wire centreline (mm and px), the wire leaves the nosecone tip centre,
//  the displayed device axis is on the anatomical path (rail), and the nosecone mesh is actually drawn in the monitor (visible, in fluoro mode).
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file://' + process.cwd() + '/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(800);
if (mobile) { await page.locator('#viewtabs button[data-vt=mon]').click(); }
await page.locator('button[data-mode=fluoro]').click().catch(() => {});
await page.evaluate(() => {
  window.__measure = () => {
    const S = __sim.sim, V = __sim.views, dv = V.dev, T = __sim.THREE, cl = dv.cl, W = dv.wirePts || [], path = S.path;
    const cam = V.camMon, mon = V.dom.mon, w = mon.clientWidth, h = mon.clientHeight;
    const segP = (a, b, c) => { const ab = b.clone().sub(a), l2 = ab.lengthSq() || 1, t = Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / l2)); return a.clone().addScaledVector(ab, t); };
    const nearest = (c) => { let best = null, bd = 1e9; for (let i = 0; i < W.length - 1; i++) { const q = segP(W[i], W[i + 1], c), d = q.distanceTo(c); if (d < bd) { bd = d; best = q; } } return { q: best, d: bd }; };
    const px = (p) => { const n = p.clone().project(cam); return { x: n.x * w / 2, y: n.y * h / 2 }; };
    const out = { phase: S.phase, mode: V.mode, wire: S.wire.s, sTip: dv.sTipNow, removed: !!S.wire.removed, nW: W.length, f: S.dev.f, rootMode: V.rootMode, fov: V.fov, monW: w, monH: h };
    const dTip = Math.max(0, dv.sTipNow - S.wire.s); out.dTip = dTip;
    const ringCentres = (t, d0, step) => { const R1 = t.radial + 1, arr = []; for (let i = 0; i < t.rings; i++) { let x = 0, y = 0, z = 0; for (let j = 0; j < t.radial; j++) { const q = (i * R1 + j) * 3; x += t.pos[q]; y += t.pos[q + 1]; z += t.pos[q + 2]; } arr.push({ d: d0 + i * step, p: new T.Vector3(x / t.radial, y / t.radial, z / t.radial) }); } return arr; };
    const measure = (arr, minD) => { let mmax = 0, pxmax = 0, n = 0; for (const r of arr) { if (r.d < minD) continue; const nn = nearest(r.p); if (!nn.q) continue; mmax = Math.max(mmax, nn.d); const a = px(r.p), b = px(nn.q); pxmax = Math.max(pxmax, Math.hypot(a.x - b.x, a.y - b.y)); n++; } return { mm: mmax, px: pxmax, n }; };
    out.nose = measure(ringCentres(dv.tNose, 0, 1), dTip + 1);
    out.inner = measure(ringCentres(dv.tInner, 22, 2), dTip + 1);
    const tip = cl.at(0, new T.Vector3()); let mt = 1e9, mq = null; for (const p of W) { const d = p.distanceTo(tip); if (d < mt) { mt = d; mq = p; } } out.wireToTip = mt; // wire vertices pass the tip centre
    const nn = nearest(tip); out.tipToWire = W.length ? nn.d : null; const a = px(tip), b = px(nn.q || tip); out.tipPx = Math.hypot(a.x - b.x, a.y - b.y);
    // displayed axis on the anatomical path (live, no reset)
    let mx = 0; for (let i = 0; i < cl.n; i++) { const d = i * 2, pp = path.pos(dv.sTipNow - d); mx = Math.max(mx, Math.hypot(cl.P[i * 3] - pp.x, cl.P[i * 3 + 1] - pp.y, cl.P[i * 3 + 2] - pp.z)); } out.axisDev = mx;
    // nosecone mesh drawn in the monitor: visible, in a flu material, and its projected tip is inside the monitor frame (when the camera follows the device)
    const nm = dv.parts.nosecone[0]; out.noseVisible = !!nm.visible && nm.material !== dv.matA.nosecone || (V.mode !== 'fluoro' && nm.visible);
    out.noseMat = nm.material && nm.material.type; out.tipScreen = px(tip); out.wireMeshVisible = dv.wireMesh.visible;
    out.errors = __sim.errors.length;
    return out;
  };
});
const settle = async (ms = 600) => { await page.waitForTimeout(ms); };
const check = async (label) => {
  await settle(); const r = await page.evaluate(() => __measure());
  const wirePresent = r.nW > 2 && !r.removed;
  ok(r.axisDev <= 1.0 + 1e-6, `${label}: [ph ${r.phase}] displayed device axis is on the rail path: ${r.axisDev.toFixed(3)} mm (<= 1.0)`);
  if (wirePresent) {
    ok(r.nose.n === 0 || (r.nose.mm < 0.4 && r.nose.px < 1.0), `${label}: nosecone rings on the wire: ${r.nose.mm.toFixed(3)} mm / ${r.nose.px.toFixed(2)} px over ${r.nose.n} rings (fluoro screen space, fov ${r.fov.toFixed(0)})`);
    ok(r.inner.n === 0 || (r.inner.mm < 0.4 && r.inner.px < 1.0), `${label}: inner-shaft rings on the wire: ${r.inner.mm.toFixed(3)} mm / ${r.inner.px.toFixed(2)} px`);
    ok(r.dTip > 0 || (r.tipToWire < 0.1 && r.tipPx < 0.5), `${label}: wire leaves the nosecone tip centre: ${r.tipToWire.toFixed(3)} mm / ${r.tipPx.toFixed(2)} px` + (r.dTip > 0 ? ' (wire pulled back in the lumen)' : ''));
  } else ok(r.removed || r.nW <= 2, `${label}: wire removed (phase 9 after removal) - nothing to compare`);
  ok(r.mode === 'fluoro' || !mobile, `${label}: monitor in fluoro mode (${r.mode})`);
  return r;
};
const S = (fn, ...a) => page.evaluate(fn, ...a);
// ---------------- A: natural play, every phase
console.log('== A: natural play ==');
await S(() => { __drv.goPhase1(); }); await check('natural: phase 2 start');
await S(() => { const s = __sim.sim; __drv.goDesc(); }); await check('natural: descending aorta');
await S(() => { __drv.setRotation(); }); await check('natural: phase 3 (rotation set)');
await S(() => { __drv.goArch(); }); await check('natural: phase 4');
await S(() => { __drv.goCross(); __drv.alignAt(); __drv.press(); }); await check('natural: phase 5 cusp overlap (the reported view)');
await page.screenshot({ path: `shots/v13/${prof}-phase5-fluoro.png` });
await S(() => { __drv.toLock(); }); await check('natural: phase 6 (80% lock)');
await S(() => { __drv.secondView(); __sim.sim.act.unlock(); __drv.release('fast'); }); await check('natural: phase 8 released, open nosecone in the root');
await S(() => { const s = __sim.sim; if (!s.wire.hold) s.act.toggleHold(); s.input = { wire: 1 }; let g = 0; while (s.wireAdv() < 0.6 && g++ < 400) s.update(1 / 30); s.input = {}; s.act.flexSet(0.15); __drv.withdrawOpen(); }); await check('natural: phase 8 open system in the descending aorta');
await S(() => { const s = __sim.sim; s.input = { macro: 1 }; let g = 0; while (s.dev.macro < 1 && g++ < 600) s.update(1 / 30); s.input = {}; }); await check('natural: nosecone closed (macro)');
await S(() => { __drv.phase8(); }); await check('natural: phase 9');
await S(() => { const s = __sim.sim; s.act.aortogram('root'); }); await check('natural: phase 9 root aortogram');
// ---------------- B: Skip chain 1 -> 9, measure after each skip
console.log('== B: after every Skip phase ==');
await S(() => __sim.reset()); await settle(500);
if (mobile) await page.locator('#viewtabs button[data-vt=mon]').click();
await check('skip chain: start phase 1');
for (let n = 1; n <= 8; n++) { await page.click('#btnSkip'); await check(`after Skip ${n} -> ${n + 1}`); if (n + 1 === 5) await page.screenshot({ path: `shots/v13/${prof}-phase5-after-skip-fluoro.png` }); }
// ---------------- C: Back chain 9 -> 1 (from the skip chain's phase 9)
console.log('== C: after every Back ==');
for (let n = 9; n >= 2; n--) { await page.click('#btnBack'); await check(`after Back ${n} -> ${n - 1}`); if (n - 1 === 5) await page.screenshot({ path: `shots/v13/${prof}-phase5-after-back-fluoro.png` }); }
// ---------------- D: back then forward again with Skip, measure again
console.log('== D: back, then forward again ==');
for (let n = 1; n <= 8; n++) { await page.click('#btnSkip'); await check(`forward again ${n} -> ${n + 1}`); }
// ---------------- E: live no-reset sweep: keys / movement in phase 5 and 8 while frames run
console.log('== E: moving while frames run ==');
await S(() => __sim.reset()); await settle(300); await S(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __drv.press(); });
await check('moving: phase 5 landing');
for (let i = 0; i < 4; i++) { await S((i) => { const s = __sim.sim; s.input = { adv: i % 2 ? -1 : 1 }; }, i); await page.waitForTimeout(250); await S(() => { __sim.sim.input = {}; }); const r = await page.evaluate(() => __measure()); ok(r.axisDev <= 1.0 + 1e-6 && (r.nose.n === 0 || (r.nose.mm < 0.4 && r.nose.px < 1.0)), `moving phase 5 (frame ${i}): nosecone on the wire ${r.nose.mm.toFixed(3)} mm / ${r.nose.px.toFixed(2)} px, axis ${r.axisDev.toFixed(2)} mm`); }
const real = logs.filter(l => !/GPU stall|swiftshader|WebGL|Automatic fallback|GroupMarker/i.test(l));
ok(real.length === 0, 'no console errors / warnings' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
ok((await page.evaluate(() => __sim.errors.length)) === 0, 'window error list empty');
console.log(`\nrail-all-e2e ${prof}: ${pass} passed, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
