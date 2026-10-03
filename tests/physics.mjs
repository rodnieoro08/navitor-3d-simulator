// Unit tests for src/physics.js (pure, deterministic) + sim-level checks of the physics integration
import * as P from '../src/physics.js';
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Sim } from '../src/sim.js';
globalThis.window = globalThis; globalThis.__sim = { sim: null };
await import('./drv.js'); const D = globalThis.__drv;
const C = P.CONSTANTS;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const f2 = (x) => (+x).toFixed(2);

console.log('== constants ==');
const list = P.describeConstants();
ok(list.length >= 40 && list.every(c => c.status === 'estimate (uncalibrated)'), `${list.length} constants, every one marked "estimate (uncalibrated)"`);
ok(/uncalibrated/.test(P.PHYSICS_NOTE), 'physics note says uncalibrated: ' + P.PHYSICS_NOTE);
ok(Object.isFrozen(C), 'CONSTANTS is frozen (single labelled object)');

console.log('== wheel mapping (turns per mm) ==');
ok(Math.abs(P.turnsFromMm(C.capsuleTravelMm) - C.wheelTurnsFull) < 1e-9, `full retraction = ${C.wheelTurnsFull} turns = ${C.capsuleTravelMm} mm (${f2(P.turnsPerMm())} turns/mm)`);
ok(Math.abs(P.mmFromTurns(P.turnsFromMm(17.3)) - 17.3) < 1e-9, 'mm <-> turns round trip');
ok(Math.abs(P.fractionFromMm(P.mmFromFraction(0.8)) - 0.8) < 1e-9, 'fraction <-> mm round trip (lock at 80% = ' + f2(P.mmFromFraction(0.8)) + ' mm)');

console.log('== progressive expansion, inflow first ==');
{ let prev = -1, mono = true; for (let r = 0; r <= C.capsuleTravelMm; r += 0.5) { const e = P.meanExpansion(r); if (e < prev - 1e-12) mono = false; prev = e; }
  ok(mono, 'mean expansion is monotonic in capsule retraction'); ok(P.meanExpansion(0) < 0.001 && P.meanExpansion(C.capsuleTravelMm) > 0.999, `0 at 0 mm, 1 at full retraction (${f2(P.meanExpansion(0))} -> ${f2(P.meanExpansion(C.capsuleTravelMm))})`);
  let inflowFirst = true; for (let r = 1; r < 46; r += 1) if (P.sectionExpansion(2, r) < P.sectionExpansion(30, r) - 1e-12) inflowFirst = false;
  ok(inflowFirst, 'inflow section is always at least as open as the outflow section'); ok(P.sectionExpansion(40, 20) === 0 && P.sectionExpansion(2, 20) === 1, 'at 20 mm the inflow is fully open, the outflow still crimped');
  ok(P.meanExpansion(P.mmFromFraction(0.8)) < 0.9, 'at the 80% lock the outflow is still partly constrained (' + f2(P.meanExpansion(P.mmFromFraction(0.8))) + ')'); }

console.log('== foreshortening and oversizing ==');
{ let prev = 1e9, mono = true; for (let e = 0; e <= 1.0001; e += 0.05) { const L = P.frameLength(e); if (L > prev + 1e-12) mono = false; prev = L; }
  ok(mono, 'frame length shortens monotonically as it expands'); ok(Math.abs(P.foreshortening(1) - (C.frameCrimpLenMm - C.frameFreeLenMm)) < 1e-9 && P.foreshortening(0) === 0, `foreshortening 0 -> ${f2(P.foreshortening(1))} mm`);
  ok(P.lengthScale(0) > 1 && Math.abs(P.lengthScale(1) - 1) < 1e-9, 'visual length scale > 1 crimped, 1 when open');
  ok(Math.abs(P.oversizePct() - 12.5) < 1e-9, `27 mm valve in a 24 mm annulus = ${f2(P.oversizePct())}% oversize`);
  const f1 = P.radialForce(52, 3.5); const small = P.radialForce(10, 3.5); ok(f1 > 0 && f1 > small * 0.99, `radial force at the annulus ${f2(f1)} N (estimate), grip ${f2(P.grip(f1))}`);
  ok(P.radialForce(0, 3.5) === 0, 'no radial force while crimped');
  // the unanchored inflow edge moves relative to the annulus as the frame shortens; a gripped one does not
  const st = P.createState(); const base = { f: 0.4, speedMmS: 0, press: 0.5, wtens: 0.3, pacing: 'fast', stab: 1, lat: 0, tiltBase: 0.5, calc: 0.5, sysFrozen: 0.8, sysLive: 0.8, bias: 0, tug: 0, root: 0, post80: false };
  const T = P.seatTargets(Object.assign(st, { rEff: P.mmFromFraction(0.4), xN: 3 }), base); ok(T.fsUp > 0 && T.fsUp <= C.foreshortCouplingMm * P.foreshortening(1) + 1e-9, 'foreshortening shifts the un-gripped inflow edge toward the aorta: ' + f2(T.fsUp) + ' mm at 40%'); }

console.log('== hysteresis (deploy vs resheath) ==');
{ const st = P.createState(); const ctx = { f: 0, speedMmS: 0, press: 0.5, wtens: 0.3, pacing: 'fast', stab: 1, lat: 0, tiltBase: 0.5, calc: 0.5, sysFrozen: 0.8, sysLive: 0.8, bias: 0, tug: 0, root: 0, post80: false };
  const go = (f) => { ctx.f = f; P.step(st, ctx, 1 / 30); };
  for (let f = 0; f <= 0.6; f += 0.005) go(f); const eUp = P.meanExpansion(st.rEff), rUp = st.rEff; const fUp = P.resheathForce(st.rEff, P.mmFromFraction(0.6), false).n;
  for (let f = 0.6; f >= 0.5; f -= 0.005) go(f); const rDown = st.rEff, eDown = P.meanExpansion(st.rEff), r = P.mmFromFraction(ctx.f);
  ok(rDown > r + 1 && rDown <= r + C.hysteresisMm + 1e-9, `on resheath the frame stays more open than the capsule position (effective ${f2(rDown)} mm vs ${f2(r)} mm)`);
  ok(eDown > P.meanExpansion(r) + 0.01, `expansion at the same position is larger on the way back (${f2(eDown)} vs ${f2(P.meanExpansion(r))})`);
  ok(P.resheathForce(st.rEff, P.mmFromFraction(0.6), true).n > fUp, 'recapture force is larger than the forward drag at the same position (hysteresis)');
  ok(P.playStep(10, 20) === 20 && P.playStep(40, 20) === 20 + C.hysteresisMm && P.playStep(22, 20) === 22, 'play operator'); }

console.log('== recapture feel only before the lock ==');
{ let prev = -1, mono = true; for (let f = 0.01; f <= 0.8; f += 0.01) { const x = P.resheathForce(P.mmFromFraction(f), P.mmFromFraction(f), true).feel; if (x < prev - 1e-9) mono = false; prev = x; }
  ok(mono, 'feel/resistance rises monotonically toward the lock'); const lo = P.resheathForce(P.mmFromFraction(0.1), P.mmFromFraction(0.1), true).feel, hi = P.resheathForce(P.mmFromFraction(0.78), P.mmFromFraction(0.78), true).feel;
  ok(hi > lo + 0.4, `feel ${f2(lo)} at 10% -> ${f2(hi)} near the lock`); ok(P.resheathForce(41.6, 45, true).zone === 'gray', 'beyond the lock there is no recapture (gray zone)'); }

console.log('== pacing reduces cardiac drag / motion ==');
{ ok(P.paceFactor('off') > P.paceFactor('120') && P.paceFactor('120') > P.paceFactor('fast'), `pace factors off ${P.paceFactor('off')} > 120 ${P.paceFactor('120')} > rapid ${P.paceFactor('fast')}`);
  const c = (pacing) => ({ press: 0.5, wtens: 0.3, pacing }); ok(P.netForce(c('off')) < P.netForce(c('120')) && P.netForce(c('120')) < P.netForce(c('fast')), 'unpaced ejection pushes toward the aorta; pacing removes that push');
  ok(P.netForce(c('off')) < 0 && P.netForce(c('fast')) > 0, 'net force sign: unpaced = toward aorta (-), paced = system pushes toward LV (+)');
  ok(P.netForce({ press: 0.9, wtens: 0.3, pacing: 'fast' }) > P.netForce(c('fast')), 'more forward pressure -> more force toward the LV'); ok(P.netForce({ press: 0.5, wtens: 0.8, pacing: 'fast' }) < P.netForce(c('fast')), 'more wire tension -> pulls toward the aorta');
  ok(Math.abs(P.releasePop('off', 0.5)) > Math.abs(P.releasePop('120', 0.5)) && Math.abs(P.releasePop('120', 0.5)) > Math.abs(P.releasePop('fast', 0.5)) && P.releasePop('fast', 0.5) === 0, `release pop (mm): off ${f2(P.releasePop('off', 0.5))}, 120 ${f2(P.releasePop('120', 0.5))}, rapid ${f2(P.releasePop('fast', 0.5))}`);
  // sim level: root motion amplitude
  const F = buildFrame(), Pa = buildPaths(F);
  const amp = (mode) => { const s = new Sim(F, Pa); s.started = true; s.act.setCarm(0, 0); __sim.sim = s; D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); if (mode) s.act.setPacing(mode); D.deployTo(0.5); return s.v.bounceAmp; };
  const a0 = amp(null), a1 = amp('120'), a2 = amp('fast'); ok(a0 > a1 && a1 > a2, `root motion amplitude drops with pacing: off ${f2(a0)} > 120 ${f2(a1)} > rapid ${f2(a2)} mm`); }

console.log('== fast release = jump, slow release = no jump ==');
function runRelease(speedFrac, pacing) { // pure physics: lock zone -> 100% at a given speed, then settle
  const st = P.createState(); const ctx = { f: 0, speedMmS: 0, press: 0.5, wtens: 0.3, pacing, stab: 1, lat: 0, tiltBase: 0.5, calc: 0.5, sysFrozen: 0.8, sysLive: 0.8, bias: 0, tug: 0, root: 0, post80: false };
  const dt = 1 / 30; let f = 0; let at80 = null, maxStep = 0, last = 0;
  while (f < 1) { f = Math.min(1, f + (f < 0.8 ? 0.035 : speedFrac) * dt); ctx.f = f; ctx.speedMmS = P.mmFromFractionRate(f < 0.8 ? 0.035 : speedFrac); ctx.post80 = f > 0.8; const o = P.step(st, ctx, dt); if (at80 == null && f >= 0.8) at80 = o.xN; maxStep = Math.max(maxStep, Math.abs(o.xN - last)); last = o.xN; }
  const rel = P.release(st, { ...ctx, f: 1, cfgFinalFast: true }, 6); return { at80, final: rel.xN, move: rel.xN - at80, maxStep, pop: st.pop, extra: st.extra }; }
{ const slow = runRelease(0.035, 'fast'), fast = runRelease(0.25, 'fast'), fastUnp = runRelease(0.25, 'off'), slowUnp = runRelease(0.035, 'off');
  ok(Math.abs(slow.move) < 0.3, `slow wheel + rapid pacing: valve stays put after the lock (moves ${f2(slow.move)} mm)`);
  ok(Math.abs(fast.move) > Math.abs(slow.move) + 0.5, `fast wheel after 80% makes the valve migrate/jump (${f2(fast.move)} mm vs ${f2(slow.move)} mm)`);
  ok(fast.move > 0, 'paced + fast: net force toward the LV -> migrates deeper (+' + f2(fast.move) + ' mm)'); ok(fastUnp.move < -0.8, 'unpaced + fast: ejection pushes it toward the aorta -> high pop-up (' + f2(fastUnp.move) + ' mm)');
  ok(slowUnp.move < -0.5 && slowUnp.move > fastUnp.move, 'unpaced slow release still pops ~1 mm up, less than a fast one (' + f2(slowUnp.move) + ' mm)');
  ok(P.springBack(C.safeSpeedPost80MmS, { press: .5, wtens: .3, pacing: 'fast' }, 0.5) === 0 && P.springBack(12, { press: .5, wtens: .3, pacing: 'fast' }, 0.5) > 0.5, 'spring-back is zero at a safe speed, large above it'); }

console.log('== stick-slip (hang up, then jump) ==');
{ const mk = (calc, fricScale) => { const st = P.createState(); return st; };
  // ramp the frame down slowly; count slip events and the largest single jump, left cusp (calcium) vs NCC
  const st = P.createState(); const ctx = { f: 0, speedMmS: 1.8, press: 0.5, wtens: 0.3, pacing: 'fast', stab: 1, lat: 0, tiltBase: 0.5, calc: 1, sysFrozen: 0.8, sysLive: 0.8, bias: 0, tug: 0, root: 0, post80: false };
  let prevL = null, holdFrames = 0, maxHold = 0, maxJumpL = 0, f = 0;
  while (f < 0.8) { f += 0.035 / 30; ctx.f = f; const o = P.step(st, ctx, 1 / 30); if (f > 0.2) { if (prevL != null) { const d = Math.abs(o.xL - prevL); if (d < 1e-6) { holdFrames++; maxHold = Math.max(maxHold, holdFrames); } else holdFrames = 0; maxJumpL = Math.max(maxJumpL, d); } prevL = o.xL; } }
  ok(maxHold >= 5, 'the frame hangs up against the leaflet/calcium for a while (held ' + maxHold + ' frames with the target moving)');
  ok(st.slipsN + st.slipsL >= 1 || maxJumpL > 0.02, `...then slips (slip events N ${st.slipsN} / L ${st.slipsL}; biggest single frame ${f2(maxJumpL)} mm)`);
  const hi = P.createState(), lo = P.createState(); const run = (s, calc) => { const c = { ...ctx, calc }; let g = 0; while (g < 0.8) { g += 0.035 / 30; c.f = g; P.step(s, c, 1 / 30); } return s; };
  run(hi, 1); run(lo, 0); const tHi = P.seatTargets(hi, { ...ctx, f: 0.8, calc: 1 }), tLo = P.seatTargets(lo, { ...ctx, f: 0.8, calc: 0 });
  ok(tHi.tN - hi.xN > -1 && (hi.xN - hi.xL) !== (lo.xN - lo.xL), `NCC and left-cusp sides have separate depths: calcified ${f2(hi.xN)}/${f2(hi.xL)}, clean ${f2(lo.xN)}/${f2(lo.xL)} mm`);
  ok((hi.xN - hi.xL) > (lo.xN - lo.xL), 'more calcium on the left cusp = more hang-up there = larger NCC-vs-left tilt');
  // root motion shakes a stuck frame free
  const a = P.createState(), b = P.createState(); const still = { ...ctx, f: 0.5, root: 0 }; const shaky = { ...ctx, f: 0.5, root: 3 };
  let ga = 0; while (ga < 0.5) { ga += 0.035 / 30; P.step(a, { ...still, f: ga }, 1 / 30); } let gb = 0; while (gb < 0.5) { gb += 0.035 / 30; P.step(b, { ...shaky, f: gb }, 1 / 30); }
  ok(Math.abs(P.seatTargets(b, shaky).tN - b.xN) <= Math.abs(P.seatTargets(a, still).tN - a.xN) + 1e-9, 'root motion helps free a hung-up frame (pacing = steadier but stickier)'); }

console.log('== depth drivers ==');
{ const t = (press, wt, stiff = 1) => P.biasMm(press, wt, stiff); ok(t(0.9, 0.3) > t(0.5, 0.3), 'more forward pressure = deeper'); ok(t(0.5, 0.8) < t(0.5, 0.3), 'more wire tension = higher'); ok(t(0.5, 0.8, 1.4) < t(0.5, 0.8, 1), 'a stiffer wire transmits more pull');
  const base = { stab: 1, lat: 0, tiltBase: 0.5, wireStiff: 1 }; ok(P.tiltTarget({ ...base, stab: 0.2 }) > P.tiltTarget(base) + 0.4, 'poor stability tilts the valve'); ok(P.tiltTarget({ ...base, wireStiff: 1.4 }) > P.tiltTarget(base), 'a stiffer wire adds tilt'); ok(P.tiltTarget({ ...base, lat: 3 }) > P.tiltTarget(base), 'lateral offset adds tilt'); }

console.log('== stable control lands 3-4.5 mm (sim) ==');
{ const F = buildFrame(), Pa = buildPaths(F); const one = (press, wt, stiff, mode) => { const s = new Sim(F, Pa); s.started = true; s.act.setCarm(0, 0); __sim.sim = s; if (stiff) s.cfg.wireStiffness = stiff; D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); s.act.setPress(press); s.act.setWireTension(wt); D.deployTo(0.8); D.secondView(); s.act.unlock(); s.act.setPacing(mode); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(1 / 30); s.input = {}; return s; };
  const s = one(0.5, 0.3, 0, 'fast'); ok(s.flags.finalDepthNcc >= 3 && s.flags.finalDepthNcc <= 4.5 && s.flags.finalDepthLcc >= 3 && s.flags.finalDepthLcc <= 4.5, `slow wheel + forward pressure + slight wire pull: NCC ${f2(s.flags.finalDepthNcc)} / LCC ${f2(s.flags.finalDepthLcc)} mm`);
  const s2 = one(0.55, 0.35, 0, 'fast'); ok(s2.flags.finalDepthNcc >= 3 && s2.flags.finalDepthNcc <= 4.5 && s2.flags.finalDepthLcc >= 3, `slightly firmer pressure and pull still lands: ${f2(s2.flags.finalDepthNcc)} / ${f2(s2.flags.finalDepthLcc)} mm`);
  const s3 = one(0.5, 0.3, 0, 'off'); ok(s3.flags.finalDepthNcc < s.flags.finalDepthNcc - 0.4, `unpaced final release pops it up (${f2(s3.flags.finalDepthNcc)} vs ${f2(s.flags.finalDepthNcc)} mm)`);
  const s4 = one(0.5, 0.3, 1.4, 'fast'); ok(s4.dev.tilt > s.dev.tilt, `extra-stiff wire tilts the valve more (tilt ${f2(s4.dev.tilt)} vs ${f2(s.dev.tilt)})`);
  const a = one(0.5, 0.3, 0, 'fast'), b = one(0.5, 0.3, 0, 'fast'); ok(a.flags.finalDepthNcc === b.flags.finalDepthNcc && a.flags.finalDepthLcc === b.flags.finalDepthLcc, 'deterministic: identical runs give identical depths');
  const sq = (()=>{ const s = new Sim(F, Pa); s.started = true; s.act.setCarm(0,0); __sim.sim = s; D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30,-30); D.press(); D.deployTo(0.5); return s; })();
  ok(Math.abs(sq.dev.retractMm - 26) < 0.3 && Math.abs(sq.dev.turns - 2.5) < 0.05, `wheel state in mm / turns: ${f2(sq.dev.retractMm)} mm = ${f2(sq.dev.turns)} turns at 50%`);
  sq.act.wheelMm(2); D.up(1); ok(sq.dev.retractMm > 27.9, 'act.wheelMm moves the capsule by mm'); sq.act.wheelTurns(-0.5); D.up(1); ok(sq.dev.retractMm < 25.0, 'act.wheelTurns(-0.5) retracts the wheel back half a turn'); }
console.log(`\nphysics: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
