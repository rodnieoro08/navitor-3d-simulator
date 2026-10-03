// Node test of the smooth delivery-system centreline (src/centreline.js): curvature in every phase, bend limit with Flex/rigid capsule, temporal smoothness.
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Centreline, CL } from '../src/centreline.js';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const F = buildFrame(), P = buildPaths(F), path = P.path, lm = P.lm; const cl = new Centreline(F, path);
const MAXTURN = 7.5; // deg per 2 mm sample (bend radius >= ~15 mm). The flexible limit is 5.2 deg (R 22 mm); the rest is the anatomy itself in the tight arch.
const phases = { 'phase 1 (femoral/iliac)': [lm.skin + 2, lm.bif + 60], 'phase 2-3 (descending + arch)': [lm.bif + 60, lm.archApex + 40], 'phase 4-5 (ascending, root, annulus)': [lm.archApex + 40, lm.ann + 30], 'phase 6-9 (LV approach and pull-back)': [lm.ann + 30, lm.apex - 2] };
const lats = [-14, -8, 0, 8, 14]; const rigidEnds = [74, 114, 150];
for (const [name, [a, b]] of Object.entries(phases)) {
  let worst = 0, at = null, n = 0, ms = 0;
  for (const lat of lats) for (const re of rigidEnds) for (let s = a; s <= b; s += 6) { cl.reset(); const t0 = performance.now(); cl.update(s, lat, null, 1 / 30, re); ms += performance.now() - t0; n++; if (cl.maxTurn > worst) { worst = cl.maxTurn; at = [lat, re, Math.round(s)]; } }
  ok(worst <= MAXTURN, `${name}: max turning angle ${worst.toFixed(2)} deg per ${CL.step} mm over ${n} poses [lat,rigid,s]=${JSON.stringify(at)} (<= ${MAXTURN}); ${(ms / n).toFixed(1)} ms/update`);
}
// failure effects: a 'force' bump stays smooth; a kink never changes the centreline (only a local narrowing of the radius)
{ let worst = 0; for (const t of [0.1, 0.4, 0.8, 1.2, 1.8]) for (const s of [200, 320, 700, 830, 1000]) { cl.reset(); cl.update(s, 6, { type: 'force', s, t }, 1 / 30, 74); worst = Math.max(worst, cl.maxTurn); } ok(worst <= MAXTURN, `'force' failure bump: max turn ${worst.toFixed(2)} deg`); }
{ cl.reset(); cl.update(700, 6, null, 1 / 30, 74); const A = Float64Array.from(cl.P); cl.reset(); cl.update(700, 6, { type: 'kink', s: 700, t: 0.8 }, 1 / 30, 74); let dmax = 0; for (let i = 0; i < A.length; i++) dmax = Math.max(dmax, Math.abs(A[i] - cl.P[i])); ok(dmax < 1e-9, 'kink failure leaves the centreline untouched (no jagged geometry), max diff ' + dmax.toExponential(1));
  let mn = 1, w = 0; for (let d = 0; d < 1000; d++) { const k = cl.kinkScale(d, { type: 'kink', s: 700, t: 0.8 }, 700); mn = Math.min(mn, k); if (k < 0.97) w++; } ok(mn < 0.7 && mn > 0.3 && w > 8 && w < 40, `kink = soft local narrowing: min radius x${mn.toFixed(2)}, ${w} mm wide`);
  ok(cl.kinkScale(100, null, 700) === 1 && cl.kinkScale(100, { type: 'force', s: 1, t: 1 }, 700) === 1, 'no narrowing without a kink failure'); }
// the tip sits where the sim says (offset = Flex lateral), and the chain stays close to the path
{ cl.reset(); cl.update(900, 0, null, 1 / 30, 74); const tip = cl.at(0), pp = path.pos(900); ok(tip.distanceTo(pp) < 0.01, 'zero flex offset: tip is on the anatomical path'); let dev = 0; for (let d = 0; d < 400; d += 4) dev = Math.max(dev, cl.at(d).distanceTo(path.pos(900 - d))); ok(dev < 7, `zero offset: chain stays near the path (max ${dev.toFixed(1)} mm; the rigid section only trims the tightest arch corner, lumen radius there ~16 mm)`);
  cl.reset(); cl.update(700, 10, null, 1 / 30, 74); { const o = cl.at(0).distanceTo(path.pos(700)); ok(o > 8 && o <= 10.5, `lat 10 mm: tip is offset ${o.toFixed(1)} mm toward the outer curve`); } }
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
console.log(`\ncentreline: ${pass} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
