// WIRE AS RAIL (v11) + redesigned valve markers. The delivery system must ride on the guidewire at all times:
//  - device axis (nosecone tip -> handle) = wire centreline (anatomical path) within <= 1.0 mm (0 in the nosecone / inner shaft), phases 1-8, several advance positions + flex values
//  - the wire is drawn through the nosecone tip centre, along the central lumen of capsule + shafts, and beyond the tip along the rail to its own tip / pigtail
//  - advancing / withdrawing / moving the wire never produces lateral drift; 'wire lost' shows the wire pulled back inside the lumen (not a floating nosecone)
//  - Vision markers: 3 mm above the inflow edge, angularly aligned with the commissural posts (120 deg apart)
// Screenshots: phases 1, 2 and 4, fluoro + 3D (shots/v11/).
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
const st = () => page.evaluate(() => __sim.state);
await page.goto('file://' + process.cwd() + '/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(600);
const view = async (v) => { if (mobile) { await page.locator(`#viewtabs button[data-vt=${v}]`).click(); await page.waitForTimeout(500); } };
const shots = async (tag) => {
  await page.evaluate(() => __sim.pause(true));
  await page.locator('button[data-mode=fluoro]').click().catch(() => {}); await view('mon'); await page.waitForTimeout(700); await page.locator('#monPanel').screenshot({ path: `shots/v11/${prof}-${tag}-fluoro.png` });
  await view('td'); await page.waitForTimeout(900); await page.locator('#tdPanel').screenshot({ path: `shots/v11/${prof}-${tag}-3d.png` });
  await page.evaluate(() => __sim.pause(false)); await view('mon');
};
// install the probe in the page
await page.evaluate(() => {
  window.__probe = (opt = {}) => {
    const segD = (W, c) => { let m = 1e9; const ab = new __sim.THREE.Vector3(), ap = new __sim.THREE.Vector3(), q = new __sim.THREE.Vector3(); for (let i = 0; i < W.length - 1; i++) { ab.subVectors(W[i + 1], W[i]); ap.subVectors(c, W[i]); const l2 = ab.lengthSq() || 1; const t = Math.max(0, Math.min(1, ap.dot(ab) / l2)); q.copy(W[i]).addScaledVector(ab, t); m = Math.min(m, q.distanceTo(c)); } return m; };
    const S = __sim.sim, dv = __sim.views.dev, T = __sim.THREE; __sim.pause(true); if (opt.flex != null) { S.fx = null; S.dev.flex = opt.flex; } S.update(1 / 30); if (!opt.keepFx) S.fx = null; dv.cl.reset(); dv.update(S, 0); dv.update(S, 0);
    const cl = dv.cl, path = S.path, sTip = dv.sTipNow, P = cl.P; const out = { sTip, wire: S.wire.s, lat: S.dev.lat, flex: S.dev.flex };
    let mx = 0, nose = 0; for (let i = 0; i < cl.n; i++) { const d = i * 2, pp = path.pos(sTip - d); const e = Math.hypot(P[i * 3] - pp.x, P[i * 3 + 1] - pp.y, P[i * 3 + 2] - pp.z); mx = Math.max(mx, e); if (d <= 22) nose = Math.max(nose, e); }
    out.maxDev = mx; out.noseDev = nose;
    const W = dv.wirePts || []; out.nW = W.length;
    const tip = cl.at(0, new T.Vector3());
    // the wire passes through the nosecone tip centre
    let mt = 1e9; for (const p of W) mt = Math.min(mt, p.distanceTo(tip)); out.wireToTip = mt;
    // the wire runs on the device axis (central lumen) along the whole device: every 25 mm of the axis has a wire vertex within 0.3 mm (only where the wire is present)
    const dTipIn = Math.max(0, sTip - S.wire.s); let worst = 0; for (let d = dTipIn + 2; d < 1000; d += 25) { const c = cl.at(d, new T.Vector3()); worst = Math.max(worst, segD(W, c)); } out.wireOnAxis = worst;
    // beyond the tip the wire follows the anatomical path (rail) up to its own tip
    let ahead = 0, aheadDev = 0; if (S.wire.s - sTip > 12) for (let s = sTip + 3; s < S.wire.s - 6; s += 3) { const pp = path.pos(s); aheadDev = Math.max(aheadDev, segD(W, pp)); ahead++; }
    out.aheadN = ahead; out.aheadDev = aheadDev;
    // wire tip location (last vertex) and distance behind the nosecone tip along the axis
    const last = W[W.length - 1]; out.tipBehind = last ? last.distanceTo(tip) : null; out.wireMeshRings = dv.wireTube.rings;
    out.noseOpacity = dv.matA.nosecone.opacity; out.shaftOpacity = dv.matA.outerShaft.opacity; out.holeCount = dv.tipHole ? 1 : 0;
    return out;
  };
});
const checkPose = async (label, opt = {}) => {
  const r = await page.evaluate((o) => __probe(o), opt);
  ok(r.maxDev <= 1.0 + 1e-6, `${label}: device axis vs wire max lateral deviation ${r.maxDev.toFixed(3)} mm (<= 1.0), lat ${r.lat.toFixed(1)} flex ${r.flex.toFixed(2)}`);
  ok(r.noseDev < 1e-3, `${label}: nosecone / inner shaft exactly on the wire (${r.noseDev.toExponential(1)} mm)`);
  ok(r.wireToTip < 0.1, `${label}: the wire passes through the nosecone tip centre (${r.wireToTip.toFixed(3)} mm)`);
  ok(r.wireOnAxis < 0.35, `${label}: wire runs inside the central lumen along the whole device (max ${r.wireOnAxis.toFixed(2)} mm off axis)`);
  if (r.aheadN) ok(r.aheadDev < 0.35, `${label}: beyond the nosecone the wire follows the rail path (${r.aheadDev.toFixed(2)} mm, ${r.aheadN} samples)`);
  return r;
};

// ---------------- phase 1: femoral / iliac
await page.evaluate(() => { const S = __sim.sim; S.input = { adv: 1 }; for (let i = 0; i < 150; i++) { __drv.autoFlex(); S.update(1 / 30); } S.input = {}; });
let s = await st(); ok(s.phase === 1, 'phase 1');
await checkPose('phase 1 (a)'); await checkPose('phase 1 (b, flex 0.9)', { flex: 0.9 }); await checkPose('phase 1 (c, flex 0.1)', { flex: 0.1 });
await shots('phase1');
await page.evaluate(() => { const S = __sim.sim; S.input = { adv: 1 }; let g = 0; while (S.phase === 1 && g++ < 6000) { __drv.autoFlex(); S.update(1 / 30); } S.input = {}; });
await checkPose('phase 1 end');
// ---------------- phase 2: descending aorta, set rotation
await page.evaluate(() => { __drv.goDesc(); });
s = await st(); ok(s.phase === 2, 'phase 2 (descending aorta, set rotation)');
await checkPose('phase 2 (a)'); await checkPose('phase 2 (b, flex 1)', { flex: 1 }); await checkPose('phase 2 (c, flex 0.4)', { flex: 0.4 });
await shots('phase2');
await page.evaluate(() => { __drv.setRotation(); });
// ---------------- phase 3: arch (several advance positions, wire follows)
for (const k of [1, 2, 3]) { await page.evaluate(() => { const S = __sim.sim; S.input = { adv: 1 }; for (let i = 0; i < 160; i++) { __drv.autoFlex(); S.update(1 / 30); } S.input = {}; }); s = await st(); await checkPose(`phase ${s.phase} (arch ${k})`); await checkPose(`phase ${s.phase} (arch ${k}, flex 0)`, { flex: 0 }); }
await page.evaluate(() => { __drv.goArch(); });
s = await st(); ok(s.phase === 4, 'phase 4');
await checkPose('phase 4 (ascending)'); await checkPose('phase 4 (ascending, flex 0.8)', { flex: 0.8 });
await page.evaluate(() => { __drv.goCross(); __drv.press(); });
await checkPose('phase 4 (valve crossed)'); await checkPose('phase 4 (valve crossed, flex 0.6)', { flex: 0.6 });
await page.evaluate(() => { __sim.sim.act.setCarm(32, 30); });
await shots('phase4');
// ---------------- wire control in phase 4: free wire, advance / pull a bit; the system keeps following the rail
{ const r0 = await page.evaluate(() => __probe()); await page.evaluate(() => { const S = __sim.sim; S.act.toggleHold(); if (S.wire.hold) S.act.toggleHold(); S.input = { wire: 1 }; for (let i = 0; i < 20; i++) S.update(1 / 30); S.input = {}; });
  const r1 = await checkPose('phase 4 (wire advanced 9 mm)'); ok(r1.wire > r0.wire + 3, `wire moved forward (${r0.wire.toFixed(1)} -> ${r1.wire.toFixed(1)} mm)`);
  await page.evaluate(() => { const S = __sim.sim; S.input = { wire: -1 }; for (let i = 0; i < 30; i++) S.update(1 / 30); S.input = {}; }); const r2 = await checkPose('phase 4 (wire pulled 14 mm)'); ok(r2.wire < r1.wire - 3, `wire moved back (${r1.wire.toFixed(1)} -> ${r2.wire.toFixed(1)} mm)`);
  // failure: wire lost -> the wire is pulled back inside the lumen (tip behind the nosecone), nothing floats
  const f = await page.evaluate(() => { const S = __sim.sim; S.wire.hold = false; S.wire.s = S.lm.ann + 8; S.wireVer++; S.checkWire(); const fx = S.fx ? S.fx.type : null; const r = __probe({ keepFx: true }); r.fx = fx; return r; });
  ok(f.fx === 'wireLost', `wire lost failure raised (${f.fx})`);
  ok(f.wire < f.sTip - 5 && f.tipBehind > 4, `wire lost: wire tip is pulled ${f.tipBehind.toFixed(0)} mm back INSIDE the lumen (behind the nosecone), nosecone does not float off the wire`);
  ok(f.noseDev < 1e-3 && f.wireOnAxis < 0.35, `wire lost: the nosecone is still on the wire axis (nose ${f.noseDev.toExponential(1)} mm, wire on axis ${f.wireOnAxis.toFixed(2)} mm)`);
  await page.evaluate(() => { const S = __sim.sim; for (let i = 0; i < 90; i++) S.update(1 / 30); }); s = await st(); ok(!s.fx, 'failure cleared after its retry (wire restored on the rail)');
  await checkPose('phase 4 after retry'); }
// ---------------- 3D drawing: translucent shafts + nosecone with a wire exit hole
{ const m = await page.evaluate(() => { const dv = __sim.views.dev; return { nose: dv.matA.nosecone.opacity, shaft: dv.matA.outerShaft.opacity, sheath: dv.matA.sheath.opacity, hole: !!dv.tipHole, holeVis: dv.tipHole && dv.tipHole.visible, wireMesh: dv.wireMesh.visible, rings: dv.wireTube.rings }; });
  ok(m.nose < 0.8 && m.shaft < 0.8 && m.sheath < 0.6, `3D: nosecone ${m.nose}, outer shaft ${m.shaft}, sheath ${m.sheath} are translucent so the wire is visible in the lumen`);
  ok(m.hole && m.rings > 100 && m.wireMesh, `3D: wire exit hole on the nosecone tip axis; wire tube has ${m.rings} rings and is drawn`); }
// ---------------- phases 5-8: deploy, release, wire control + withdraw
await page.evaluate(() => { __sim.sim.wire.hold = true; __sim.sim.wireVer++; __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); });
s = await st(); ok(s.phase === 5, 'phase 5');
await checkPose('phase 5');
await page.evaluate(() => { __drv.deployTo(0.3); });
// ---- Vision markers: 3 mm above the inflow edge, exactly in line with the posts (partial deployment, unreleased: markers on the bending capsule frame)
{ const m = await page.evaluate(() => {
    const dv = __sim.views.dev, S = __sim.sim, T = __sim.THREE; __sim.pause(true); S.update(1 / 30); dv.cl.reset(); dv.update(S, 0); dv.update(S, 0);
    const C = new T.Vector3(), E1 = new T.Vector3(), E2 = new T.Vector3(), Tn = new T.Vector3(), C0 = new T.Vector3(); const res = { az: [], paz: [], h: [], kz: dv.kz, markerU: 3 };
    const U = (u) => { dv.frameU(u, dv.ld, C, E1, E2, Tn); return { c: C.clone(), e1: E1.clone(), e2: E2.clone(), t: Tn.clone() }; };
    const fr0 = U(0);
    for (let k = 0; k < 3; k++) {
      const mp = new T.Vector3().setFromMatrixPosition(dv.vision[k].matrix); const fm = U(3); const dm = mp.clone().sub(fm.c); res.az.push(Math.atan2(dm.dot(fm.e2), dm.dot(fm.e1)) * 180 / Math.PI);
      const pp = dv.postPts[k][0]; const fp = U(14); const dp = pp.clone().sub(fp.c); res.paz.push(Math.atan2(dp.dot(fp.e2), dp.dot(fp.e1)) * 180 / Math.PI);
      res.h.push(mp.clone().sub(fr0.c).dot(fr0.t));
    }
    return res; });
  const wrap = (a) => ((a % 360) + 540) % 360 - 180;
  const dAz = m.az.map((a, k) => Math.abs(wrap(a - m.paz[k])));
  ok(Math.max(...dAz) < 0.6, `Vision marker azimuths equal the commissural post azimuths (max diff ${Math.max(...dAz).toFixed(2)} deg; markers ${m.az.map(a => a.toFixed(1))}, posts ${m.paz.map(a => a.toFixed(1))})`);
  ok(Math.abs(wrap(m.az[1] - m.az[0]) - 120) < 0.6 && Math.abs(wrap(m.az[2] - m.az[1]) - 120) < 0.6, 'the three Vision markers are 120 degrees apart');
  ok(m.h.every(h => Math.abs(h - 3 * m.kz) < 0.12), `marker centre height = 3 mm above the inflow edge (x foreshortening ${m.kz.toFixed(2)}): ${m.h.map(h => h.toFixed(2))} mm`);
  const fl = await page.evaluate(() => { const dv = __sim.views.dev; return dv.vision.map(v => v.userData.matFlu.color.r); }); ok(fl.every(a => a >= 0.9), 'Vision markers are the most radiopaque element in fluoro');
  const lg = await page.evaluate(() => { const dv = __sim.views.dev; return { feet: dv.feet.count, beads: dv.beads.count, eyelets: dv.eyelets.count, cuff: dv.cuff.userData.nu, leaflets: dv.leaf.length }; });
  ok(lg.feet === 9 && lg.beads === 3 && lg.eyelets === 6, `frame details: ${lg.feet} rim feet + 3 markers, ${lg.beads} post-tip beads, ${lg.eyelets} eyelet blocks`);
  await page.evaluate(() => __sim.pause(false)); }
await page.evaluate(() => { __drv.toLock(); __drv.secondView(); });
await checkPose('phase 6/7 (valve at lock)');
await page.evaluate(() => { __drv.release('fast'); });
s = await st(); ok(s.phase === 8 && s.dev.released, 'valve released, phase 8');
await checkPose('phase 8 (released)');
// markers vs posts also on the released valve (rigid frame in the annulus)
{ const m = await page.evaluate(() => { const dv = __sim.views.dev, S = __sim.sim, T = __sim.THREE; __sim.pause(true); S.update(1 / 30); dv.update(S, 0); const out = []; for (let k = 0; k < 3; k++) { const mp = new T.Vector3().setFromMatrixPosition(dv.vision[k].matrix).sub(dv.vo), pp = dv.postPts[k][0].clone().sub(dv.vo); out.push([Math.atan2(mp.dot(dv.ve2), mp.dot(dv.ve1)) * 57.2958, Math.atan2(pp.dot(dv.ve2), pp.dot(dv.ve1)) * 57.2958]); } __sim.pause(false); return out; });
  const wrap = (a) => ((a % 360) + 540) % 360 - 180; ok(m.every(([a, b]) => Math.abs(wrap(a - b)) < 0.6), 'released valve: marker azimuth = post azimuth (' + m.map(x => x.map(v => v.toFixed(0)).join('/')) + ')'); }
await page.evaluate(() => { const S = __sim.sim; S.act.toggleHold(); if (!S.wire.hold) S.act.toggleHold(); S.input = { wire: 1 }; for (let i = 0; i < 8; i++) S.update(1 / 30); S.input = {}; });
await checkPose('phase 8 (wire nudged)');
await page.evaluate(() => { const S = __sim.sim; S.input = { adv: -1 }; for (let i = 0; i < 90; i++) { __drv.autoFlex(); S.update(1 / 30); if (S.fx) break; } S.input = {}; });
await checkPose('phase 8 (withdrawing)', {});
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).then(v => ok(v, 'no horizontal scroll'));
console.log(`${prof}: ${pass} ok, ${bad} failed`); fails.forEach(f => console.log('  X ' + f));
await browser.close(); process.exit(bad ? 1 : 0);
