// Node test of the smooth delivery-system centreline (src/centreline.js): curvature in every phase, bend limit with Flex/rigid capsule, temporal smoothness.
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Centreline, CL } from '../src/centreline.js';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const F = buildFrame(), P = buildPaths(F), path = P.path, lm = P.lm; const cl = new Centreline(F, path);
// WIRE AS RAIL (v11): in normal operation the device axis follows the wire (anatomical path) - it is not re-routed by a bend limiter - so its curvature is the path's own
// (plus <= 1 mm of lumen clearance). Cap = the steepest turn of the path itself (deg per 2 mm) + 4 deg (the <= 1 mm clearance adds a little); failures ('force') still use the limiter (7.5 deg).
let pathTurn = 0; { const pts = []; for (let s = -1100; s <= path.length + 150; s += 2) pts.push(path.pos(s)); for (let i = 1; i < pts.length - 1; i++) { const a = pts[i].clone().sub(pts[i - 1]).normalize(), b = pts[i + 1].clone().sub(pts[i]).normalize(); pathTurn = Math.max(pathTurn, Math.acos(Math.min(1, a.dot(b))) * 57.2958); } }
const MAXTURN = pathTurn + 4, FAILTURN = 7.5;
const phases = { 'phase 1 (femoral/iliac)': [lm.skin + 2, lm.bif + 60], 'phase 2-3 (descending + arch)': [lm.bif + 60, lm.archApex + 40], 'phase 4-5 (ascending, root, annulus)': [lm.archApex + 40, lm.ann + 30], 'phase 6-9 (LV approach and pull-back)': [lm.ann + 30, lm.apex - 2] };
const lats = [-14, -8, 0, 8, 14]; const rigidEnds = [74, 114, 150];
for (const [name, [a, b]] of Object.entries(phases)) {
  let worst = 0, at = null, n = 0, ms = 0;
  for (const lat of lats) for (const re of rigidEnds) for (let s = a; s <= b; s += 6) { cl.reset(); const t0 = performance.now(); cl.update(s, lat, null, 1 / 30, re); ms += performance.now() - t0; n++; if (cl.maxTurn > worst) { worst = cl.maxTurn; at = [lat, re, Math.round(s)]; } }
  ok(worst <= MAXTURN, `${name}: max turning angle ${worst.toFixed(2)} deg per ${CL.step} mm over ${n} poses [lat,rigid,s]=${JSON.stringify(at)} (<= ${MAXTURN}); ${(ms / n).toFixed(1)} ms/update`);
}
// failure effects: a 'force' bump stays smooth; a kink never changes the centreline (only a local narrowing of the radius)
{ let worst = 0; for (const t of [0.1, 0.4, 0.8, 1.2, 1.8]) for (const s of [200, 320, 700, 830, 1000]) { cl.reset(); cl.update(s, 6, { type: 'force', s, t }, 1 / 30, 74); worst = Math.max(worst, cl.maxTurn); } ok(worst <= FAILTURN, `'force' failure bump: max turn ${worst.toFixed(2)} deg`); }
{ cl.reset(); cl.update(700, 6, null, 1 / 30, 74); const A = Float64Array.from(cl.P); cl.reset(); cl.update(700, 6, { type: 'kink', s: 700, t: 0.8 }, 1 / 30, 74); let dmax = 0; for (let i = 0; i < A.length; i++) dmax = Math.max(dmax, Math.abs(A[i] - cl.P[i])); ok(dmax < 1e-9, 'kink failure leaves the centreline untouched (no jagged geometry), max diff ' + dmax.toExponential(1));
  let mn = 1, w = 0; for (let d = 0; d < 1000; d++) { const k = cl.kinkScale(d, { type: 'kink', s: 700, t: 0.8 }, 700); mn = Math.min(mn, k); if (k < 0.97) w++; } ok(mn < 0.7 && mn > 0.3 && w > 8 && w < 40, `kink = soft local narrowing: min radius x${mn.toFixed(2)}, ${w} mm wide`);
  ok(cl.kinkScale(100, null, 700) === 1 && cl.kinkScale(100, { type: 'force', s: 1, t: 1 }, 700) === 1, 'no narrowing without a kink failure'); }
// the tip sits where the sim says (offset = Flex lateral), and the chain stays close to the path
{ cl.reset(); cl.update(900, 0, null, 1 / 30, 74); const tip = cl.at(0), pp = path.pos(900); ok(tip.distanceTo(pp) < 0.01, 'zero flex offset: tip is on the anatomical path'); let dev = 0; for (let d = 0; d < 400; d += 4) dev = Math.max(dev, cl.at(d).distanceTo(path.pos(900 - d))); ok(dev < 7, `zero offset: chain stays near the path (max ${dev.toFixed(1)} mm; the rigid section only trims the tightest arch corner, lumen radius there ~16 mm)`);
  cl.reset(); cl.update(lm.archApex + 10, 14, null, 1 / 30, 74); { const o = cl.at(0).distanceTo(path.pos(lm.archApex + 10)); ok(o < 1e-6, `lat 14 mm gameplay offset: the NOSECONE TIP stays exactly on the wire (${o.toExponential(1)} mm)`); } }
// tangent / frames
{ cl.reset(); cl.update(800, 5, null, 1 / 30, 74); let worst = 0; const n = cl.Nn, t = cl.T; for (let i = 0; i < cl.n; i++) { worst = Math.max(worst, Math.abs(n[i * 3] * t[i * 3] + n[i * 3 + 1] * t[i * 3 + 1] + n[i * 3 + 2] * t[i * 3 + 2])); } ok(worst < 1e-6, 'frame normals are perpendicular to the tangent (rings do not twist or pinch)');
  let tw = 0; for (let i = 1; i < cl.n; i++) { const a = cl.Nn[i * 3] * cl.Nn[(i - 1) * 3] + cl.Nn[i * 3 + 1] * cl.Nn[(i - 1) * 3 + 1] + cl.Nn[i * 3 + 2] * cl.Nn[(i - 1) * 3 + 2]; tw = Math.max(tw, Math.acos(Math.min(1, a)) * 57.3); } ok(tw < 9, `ring-to-ring frame twist max ${tw.toFixed(1)} deg`); }
// temporal smoothness: advance fast (1.2 mm/frame at 30 fps = 36 mm/s), rotate, flex up/down; no sample may jump
{ cl.reset(); let prev = null, prev2 = null, worstV = 0, worstA = 0, worstT = 0; const dt = 1 / 30;
  for (let i = 0; i < 700; i++) { const s = 40 + i * 1.5, lat = 10 * Math.sin(i / 25) * Math.min(1, i / 30); cl.update(s, lat, null, dt, 74 + 40 * Math.max(0, Math.sin(i / 40))); const cur = Float64Array.from(cl.P); worstT = Math.max(worstT, cl.maxTurn);
    if (prev) for (let k = 0; k < cur.length; k += 3) { const v = Math.hypot(cur[k] - prev[k], cur[k + 1] - prev[k + 1], cur[k + 2] - prev[k + 2]); if (v > worstV) worstV = v; if (prev2) { const ax = cur[k] - 2 * prev[k] + prev2[k], ay = cur[k + 1] - 2 * prev[k + 1] + prev2[k + 1], az = cur[k + 2] - 2 * prev[k + 2] + prev2[k + 2]; worstA = Math.max(worstA, Math.hypot(ax, ay, az)); } }
    prev2 = prev; prev = cur; }
  ok(worstV < 3.0, `advancing 45 mm/s with flex swing: max per-frame displacement of any sample ${worstV.toFixed(2)} mm (< 3.0)`);
  ok(worstA < 2.0, `no jitter: max per-frame acceleration (second difference) ${worstA.toFixed(2)} mm (< 2.0)`);
  ok(worstT <= MAXTURN, `curvature stays within the limit throughout the run (${worstT.toFixed(2)} deg)`); }
// ---- WIRE AS RAIL: device axis vs wire centreline (the anatomical path) in every phase, at several advance positions, flex (lat) values and capsule extents ----
{
  const rails = { 'phase 1 femoral/iliac': [lm.skin + 4, lm.bif + 40], 'phase 2 descending': [lm.bif + 40, lm.archApex - 60], 'phase 3 arch': [lm.archApex - 60, lm.archApex + 50], 'phase 4 root/annulus': [lm.archApex + 50, lm.ann - 10], 'phase 5-6 annulus (deploy)': [lm.ann - 10, lm.ann + 8], 'phase 7-8 recapture/withdraw': [lm.ann - 40, lm.ann + 30] };
  let allMax = 0, allNose = 0;
  for (const [name, [a, b]] of Object.entries(rails)) {
    let mx = 0, nose = 0, n = 0, maxAt = null;
    for (const lat of [-14, -6, 0, 3, 8, 14]) for (const re of [60, 74, 114, 150]) for (let k = 0; k <= 6; k++) { const sT = a + (b - a) * k / 6; cl.reset(); cl.update(sT, lat, null, 1 / 30, re); n++;
      for (let i = 0; i < cl.n; i++) { const d = i * CL.step; const pp = path.pos(sT - d); const e = Math.hypot(cl.P[i * 3] - pp.x, cl.P[i * 3 + 1] - pp.y, cl.P[i * 3 + 2] - pp.z); if (e > mx) { mx = e; maxAt = [lat, re, +sT.toFixed(0), d]; } if (d <= Math.min(re, 22) && e > nose) nose = e; } }
    allMax = Math.max(allMax, mx); allNose = Math.max(allNose, nose);
    ok(mx <= 1.0 + 1e-9, `${name}: max lateral deviation device vs wire ${mx.toFixed(3)} mm over ${n} poses (<= 1.0) at ${JSON.stringify(maxAt)}`);
    ok(nose < 1e-6, `${name}: nosecone/inner shaft sit exactly on the wire (${nose.toExponential(1)} mm)`);
  }
  ok(allMax <= 1.0 + 1e-9 && allMax > 0.05, `the 1 mm lumen clearance is used where the shaft is flexed in a bend (max ${allMax.toFixed(2)} mm)`);
  // advancing / withdrawing changes only the arclength position: the swept axis is the same curve (no lateral drift)
  { cl.reset(); cl.update(lm.archApex, 0, null, 1 / 30, 74); const A = []; for (let d = 0; d < 400; d += 20) A.push(cl.at(d)); cl.reset(); cl.update(lm.archApex + 60, 0, null, 1 / 30, 74); let dm = 0; for (let k = 0; k < A.length; k++) { const q = cl.at(k * 20 + 60); dm = Math.max(dm, q.distanceTo(A[k])); } ok(dm < 1e-6, `advance 60 mm: the same wire curve is traversed (device point at d+60 meets the old point at d: ${dm.toExponential(1)} mm)`); }
}
console.log(`\ncentreline: ${pass} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
