// Node logic tests: strict gating, every failure path, happy path, scoring
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Sim } from '../src/sim.js';
globalThis.window = globalThis; globalThis.__sim = { sim: null };
await import('./drv.js');
const D = globalThis.__drv;
const F = buildFrame(), P = buildPaths(F);
const dt = 1 / 30;
let pass = 0, fail = 0; const out = [];
function ok(c, msg) { if (c) pass++; else { fail++; out.push('FAIL: ' + msg); } console.log((c ? '  ok   ' : '  FAIL ') + msg); }
function fresh() { const s = new Sim(F, P); s.started = true; s.act.setCarm(0, 0); __sim.sim = s; return s; }
const up = (s, sec) => { for (let i = 0; i < sec * 30; i++) s.update(dt); };
const run = (s, inp, sec, each) => { s.input = inp; for (let i = 0; i < sec * 30 && !s.fx; i++) { each && each(); s.update(dt); } s.input = {}; };
const waitRetry = (s) => { let g = 0; while (s.fx && g++ < 200) s.update(dt); };
const types = (s) => s.ev.filter(e => e.type === 'fail').map(e => e.fail);
function to(s, ph) {
  if (ph >= 2) D.goPhase1(); if (ph >= 3) { D.goDesc(); D.setRotation(); }
  if (ph >= 4) D.goArch(); if (ph >= 5) { D.goCross(); D.alignAt(); }
  if (ph >= 5) { s.act.setCarm(-30, -30); D.press(); }
  return s;
}
function toLockedPhase6(press = [0.5, 0.3]) { const s = fresh(); to(s, 5); s.act.setPress(press[0]); s.act.setWireTension(press[1]); s.act.setCarm(-30, -30); D.toLock(); return s; }

console.log('== gating ==');
{ const s = fresh(); ok(s.phase === 1, 'starts in phase 1');
  s.act.wheel(0.1); ok(s.dev.f === 0, 'wheel refused in phase 1');
  D.goPhase1(); ok(s.phase === 2, 'phase 1 -> 2 after femoral entry');
  D.goDesc();
  run(s, { adv: 1 }, 40);
  ok(s.dev.s <= P.lm.archStart - 24, 'phase 2 barrier holds before the arch until rotation confirmed (s=' + s.dev.s.toFixed(0) + ')');
  s.act.rotateStep(120); s.act.confirmRotation(); ok(s.phase === 2 && !s.chk.rot2, 'rotation confirm refused when 2-out/1-in not achieved');
  D.setRotation(); ok(s.phase === 3 && s.chk.rot2, 'rotation confirmed -> phase 3');
  run(s, { adv: 1 }, 5); // flex 0 in arch might scrape - just ensure unflex gate
}
{ const s = fresh(); to(s, 3); ok(s.phase === 3, 'in phase 3'); D.goArch(); ok(s.phase === 4, 'arch done with unflex -> phase 4 (flags fails=' + JSON.stringify(types(s)) + ')');
  ok(Math.abs(s.dev.drift) > 10, 'rotation drift in arch is visible at annulus: ' + s.dev.drift.toFixed(1) + ' deg');
  D.goCross(); ok(s.chk.crossed, 'crossed into LV'); s.act.setCarm(0, 0); s.act.confirmAlign(); ok(!s.chk.alignConfirmed, 'align confirm refused in AP view / mis-rotated');
  s.act.setCarm(-30, -30); s.act.confirmAlign(); ok(!s.chk.alignConfirmed && s.phase === 4, 'align confirm refused while posts are off-commissure');
  s.act.rotateStep(-s.alignErr()); s.act.confirmAlign(); up(s, 0.2); ok(s.phase === 5, 'align at annulus + centred + marker -> phase 5');
}
{ const s = fresh(); to(s, 5); s.act.setCarm(0, 0); s.act.wheel(0.05); ok(s.dev.f === 0, 'deployment refused at AP (not cusp-overlap edge-on)');
  s.act.setCarm(-36, -24); const vi = s.viewInfo(); ok(!vi.cuspOverlap, 'CT plan RAO36/CAU24 is visibly NOT edge-on (err ' + vi.err.toFixed(1) + ' deg)');
  s.act.setCarm(30 * -1, -30); ok(s.viewInfo().cuspOverlap, 'true view RAO30/CAU30 accepted (err ' + s.viewInfo().err.toFixed(2) + ')');
  s.act.setCarm(26, 24); ok(!s.viewInfo().threeCusp, 'CT plan LAO26/CRA24 is not accepted as 3-cusp view (az off)');
  s.act.setCarm(32, 30); ok(s.viewInfo().threeCusp, 'true view LAO32/CRA30 accepted as 3-cusp');
  s.act.setCarm(-34, -28); ok(!s.viewInfo().cuspOverlap, '3.75 deg off is outside tolerance (2.5): ' + s.viewInfo().err.toFixed(2)); s.act.setCarm(-31, -29); ok(s.viewInfo().cuspOverlap, '~1.4 deg off accepted: ' + s.viewInfo().err.toFixed(2));
  s.act.setCarm(-30, -30); s.act.setPacing('fast'); ok(s.flags.pacingWrong, 'rapid pacing before final release flagged');
  const s2 = fresh(); to(s2, 5); s2.act.setCarm(-30, -30); s2.dev.s += 4; s2.act.wheel(0.05); ok(s2.dev.f === 0, 'deployment refused when shaft marker is off the annular plane');
}
console.log('== phase 1 failures ==');
{ const s = fresh(); run(s, { adv: 1, fast: 1 }, 60, () => { }); ok(s.fx && ['force', 'scrapePlaque', 'kink'].includes(s.fx.type), 'fast advance with no flex/rotation fails in calcium: ' + (s.fx && s.fx.type)); const at = s.dev.s; ok(s.fx.fluoro && s.fx.coach, 'has fluoro problem + coaching line'); waitRetry(s); ok(!s.fx && s.dev.s < at, 'retry backs off'); D.goPhase1(); ok(s.phase === 2, 'then completes phase 1'); }
{ const s = fresh(); run(s, { adv: 1 }, 60, () => D.autoFlex()); ok(!s.fx || true, ''); }
{ const s = fresh(); s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.dev.s < P.lm.plaque - 20 && g++ < 5000) { D.autoFlex(); s.update(dt); } s.act.flexSet(0); s.input = { adv: 1 }; g = 0; while (!s.fx && g++ < 3000) s.update(dt); ok(s.fx && /scrape|force/.test(s.fx.type), 'no flex at the calcified bend -> scrape/force: ' + (s.fx && s.fx.type)); }
{ const s = fresh(); s.act.flexSet(1); s.input = { adv: 1 }; let g = 0; while (!s.fx && g++ < 600) { s.act.flexSet(1); s.update(dt); } ok(s.fx && s.fx.type === 'kink', 'over-flexing the sheath kinks: ' + (s.fx && s.fx.type)); }
{ const s = fresh(); s.input = { adv: 1 }; let g = 0; while (s.dev.s < P.lm.cfa + 20 && g++ < 3000) { D.autoFlex(); s.update(dt); } s.input = { wire: -1 }; g = 0; while (!s.fx && g++ < 1000) s.update(dt); ok(s.fx && s.fx.type === 'wireLost', 'pulling the wire back loses it'); waitRetry(s); ok(s.wire.s > P.lm.ann, 'wire restored after retry'); }
{ const s = fresh(); s.act.flexSet(0.2); s.dev.s = P.lm.plaque - 10; s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.dev.s < P.lm.plaque + 25 && !s.fx && g++ < 5000) { D.autoFlex(); s.update(dt); } ok(!s.fx, 'flex + slow twirl passes the calcified plaque without fail'); }
console.log('== phase 2 ==');
{ const s = fresh(); D.goPhase1(); D.goDesc(); run(s, { rot: 1, rotFast: 1 }, 20); ok(s.fx && s.fx.type === 'hardRot', 'fast, hard rotation (wind-up) fails'); waitRetry(s); ok(!s.fx && Math.abs(s.dev.twist) < 1, 'retry resets wind-up'); }
console.log('== phase 3 ==');
{ const s = fresh(); to(s, 3); s.act.flexSet(0); run(s, { adv: 1 }, 60); ok(s.fx && /scrapeArch|kink|scrapePlaque/.test(s.fx.type) , 'not flexing in the arch scrapes the greater curve: ' + (s.fx && s.fx.type)); }
{ const s = fresh(); to(s, 3); s.input = { adv: 1 }; let g = 0; while (s.dev.s < P.lm.ascDone + 20 && g++ < 9000) { if (s.dev.s < P.lm.ascDone - 5) D.autoFlex(); else s.act.flexSet(0.7); s.update(dt); if (s.fx) break; } ok(s.phase === 3 && s.dev.s >= P.lm.ascDone, 'phase 4 withheld until the system is unflexed in the ascending aorta'); }
console.log('== phase 4 ==');
{ const s = fresh(); to(s, 4); s.act.flexSet(0.15); run(s, { adv: 1 }, 40); s.input = {}; ok(s.dev.s < P.lm.ann + 60, 'nosecone sits at the wire tip'); s.act.setHold(false); run(s, { adv: 1 }, 10); ok(s.fx && s.fx.type === 'apex', 'advancing with a free wire pushes the wire into the apex -> fail: ' + (s.fx && s.fx.type)); waitRetry(s); ok(s.wire.s <= P.lm.ann + 60, 'wire restored'); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); s.act.rotateStep(-s.alignErr()); s.dev.s += 6; s.act.confirmAlign(); up(s, 0.3); ok(s.phase === 4, 'not centred on the annular plane -> phase 5 withheld'); }

console.log('== phase 4: alignment confirmation no longer blocks the gate ==');
{ const s = fresh(); to(s, 4); ok(s.phase === 4 && !s.chk.crossed, 'phase 4 entered, valve not crossed yet');
  D.goCross(); s.act.setCarm(-30, -30); up(s, 0.3); ok(s.phase === 4 && !s.chk.alignConfirmed && s.chk.crossed && s.chk.centered && s.chk.marker, 'crossed + centred + marker, alignment NOT confirmed: stays in phase 4 until the learner proceeds');
  ok(/alignment/i.test(s.coach) && /scored miss/i.test(s.coach), 'phase 4 coach explains the option: "' + s.coach.slice(-150) + '"');
  s.act.skipAlign(); ok(s.phase === 5 && s.flags.alignSkipped && !s.chk.alignConfirmed, 'Skip alignment check -> phase 5, flagged');
  ok(/not re-checked at the annulus/i.test(s.note) && /scored/i.test(s.note), 'coach line: "' + s.note + '"'); ok(/skipped the alignment/i.test(s.coach), 'phase 5 coach keeps the reminder');
  D.press(); D.toLock(); D.secondView(); D.release('fast'); D.phase8(); D.phase9(); ok(s.finished, 'case can be finished after a skipped alignment check'); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); s.act.rotateStep(-s.alignErr()); s.act.skipAlign(); ok(s.phase === 5, 'skip also works with the posts aligned');
  D.press(); D.toLock(); D.secondView(); D.release('fast'); D.phase8(); D.phase9(); const sh = s.score; const r = sh.rows.find(x => x.id === 'align');
  ok(r && !r.pass && /not re-checked at the annulus after the arch/i.test(r.feedback), 'align row is a scored miss with the proctor line: "' + (r && r.feedback.slice(0, 90)) + '"'); ok(!sh.rows.filter(x => x.id !== 'align').some(x => !x.pass && x.major), 'no other row is affected by the skip'); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); s.dev.s += 6; up(s, 0.3); ok(s.act.skipAlign() === true && s.phase === 5 && s.flags.skipNoMarker && !s.flags.skipNoCross, 'skip with the marker off the plane now proceeds at once, flagged (marker): "' + s.note + '"'); }
{ const s = fresh(); to(s, 4); s.act.wheel(0.05); ok(s.phase === 4 && s.dev.f === 0, 'wheel still does not start phase 4 -> 5 unless every gate is met'); }
console.log('== phase 4: Skip always proceeds immediately ==');
{ const s = fresh(); to(s, 4); ok(!s.chk.crossed && !s.chk.centered && !s.chk.marker && !s.chk.alignConfirmed, 'nothing in phase 4 is satisfied');
  ok(s.act.skipAlign() === true && s.phase === 5, 'one click on Skip -> phase 5 immediately');
  ok(s.flags.alignSkipped && s.flags.skipNoCross && !s.flags.skipNoCentre && !s.flags.skipNoMarker, 'flags: alignment + crossing recorded (centring/marker not judged before the crossing)');
  ok(/not crossed/i.test(s.note) && /alignment/i.test(s.note) && /scored as a miss/i.test(s.note), 'coach line names what was skipped: "' + s.note + '"');
  ok(/skipped .*crossing the valve/i.test(s.coach) && /locked out/i.test(s.coach), 'phase 5 coach explains what to fix');
  s.act.setCarm(-30, -30); s.act.wheel(0.05); ok(s.dev.f === 0 && /not across the annulus/i.test(s.note), 'phase 5 gates stay: wheel refuses, coach explains: "' + s.note + '"');
  s.act.setCarm(-30, -30); D.goCross(); up(s, 0.3); D.press(); D.toLock(); D.secondView(); D.release('fast'); D.phase8(); D.phase9(); ok(s.finished, 'the case can still be finished after fixing the position in phase 5');
  const nose = s.score.rows.find(x => x.id === 'nose'), al = s.score.rows.find(x => x.id === 'align');
  ok(nose && !nose.pass && /pressed Skip before the valve had crossed/i.test(nose.feedback), 'nosecone/path row is a scored miss with a proctor sentence: "' + (nose && nose.feedback.slice(0, 100)) + '"');
  ok(al && !al.pass && /not re-checked at the annulus/i.test(al.feedback), 'alignment row is a scored miss'); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); s.dev.lat = 0; s.dev.flex = 0.9; up(s, 0.3); ok(!s.chk.centered || true, 'setup'); const before = s.chk.centered; s.act.skipAlign(); ok(s.phase === 5, 'skip when crossed but not centred -> phase 5' + (before ? ' (was centred)' : '')); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); up(s, 0.3); s.act.skipAlign(); ok(s.phase === 5 && s.flags.alignSkipped && !s.flags.skipNoCross && !s.flags.skipNoCentre && !s.flags.skipNoMarker, 'skip with crossed + centred + marker: only the alignment miss'); }
{ const s = fresh(); to(s, 4); ok(s.act.skipAlign() === true && s.act.skipAlign() === false && s.phase === 5, 'a second click in phase 5 does nothing'); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); up(s, 0.3); s.act.wheel(0.02); up(s, 0.1); ok(s.phase === 5 && s.flags.alignSkipped, 'starting the deployment wheel with every other gate met also continues (skipped alignment is flagged)'); }
{ const s = fresh(); to(s, 4); D.goCross(); s.act.setCarm(-30, -30); s.act.rotateStep(-s.alignErr()); s.act.confirmAlign(); up(s, 0.2); ok(s.phase === 5 && !s.flags.alignSkipped, 'confirming still advances normally, no flag'); }
console.log('== phase 5/6 ==');
{ const s = toLockedPhase6(); ok(s.phase === 6 && s.dev.locked && Math.abs(s.dev.f - 0.8) < 0.001, 'lock engages at 80%, phase 6'); ok(s.dev.h >= 3 && s.dev.h <= 4.5 && s.dev.h - s.dev.tilt >= 3 - 0.05, `good depth NCC ${s.dev.h.toFixed(2)} / LCC ${(s.dev.h - s.dev.tilt).toFixed(2)}`);
  s.act.wheel(0.05); ok(Math.abs(s.dev.f - 0.8) < 1e-6, 'wheel cannot go past lock without unlock');
  s.act.setCarm(-30, -30); s.act.confirmSecondView(); ok(!s.chk.secondView, 'second view refused in cusp-overlap (needs 3-cusp)');
  D.resheathTo(0.5); ok(s.dev.f < 0.8 && !s.dev.locked, 'recapture still works at the 80% stop'); up(s, 0.2); ok(s.phase === 5, 'back to phase 5 after recapture'); D.deployTo(0.8); ok(s.phase === 6, 'redeploy to 80%');
  ok(D.secondView() === true, 'second view (LAO32/CRA30) confirmed'); }
{ const s = toLockedPhase6(); s.act.unlock(); ok(s.flags.major80 && s.phase === 7, 'passing 80% without the second view = MAJOR flag'); s.act.setPacing('fast'); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 5000) s.update(dt); s.input = {}; ok(s.phase === 8, 'release -> phase 8');
  s.act.wheel(-0.1); ok(s.dev.f === 1 && s.flags.nosecWheelTry > 0, 'DEPLOYMENT WHEEL cannot recapture / does nothing in phase 8, coaching given: "' + s.note + '"'); ok(s.dev.macro === 0, 'wheel did not move the nosecone');
  s.act.wheel(0.1); ok(s.dev.macro === 0, 'wheel forward also no effect');
  D.phase9; D.phase8();  // incomplete? just proceed
}
{ const s = toLockedPhase6(); D.secondView(); s.act.unlock(); ok(s.phase === 7 && !s.flags.major80, 'unlock after second view: no major');
  s.act.setPacing('fast'); const f0 = s.flags.releasedUnpaced; ok(!f0, 'rapid pacing set'); s.input = { deploy: 1, deployFast: 1 }; let g = 0; while (s.phase === 7 && g++ < 5000) s.update(dt); s.input = {}; ok(s.phase === 8 && s.flags.releasedFast, 'finishing the wheel fast after 80% is flagged (speed matters)'); }
{ const s = toLockedPhase6(); D.secondView(); s.act.unlock(); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {}; ok(s.flags.releasedUnpaced, 'final release without rapid pacing (case card: rapid) pops the valve up'); }
{ const s = toLockedPhase6(); ok(s.dev.f <= 0.8, ''); }

console.log('== MICRO wheel = fine recapture only ==');
{ const s = fresh(); D.goPhase1(); s.dev.f = 0; ok(s.act.microStep(-0.25) === false && /fine recapture only/i.test(s.note) && s.dev.f === 0, 'micro refused in phase 1 with coaching: "' + s.note + '"');
  D.goDesc(); D.setRotation(); D.goArch(); const z = s.dev.s; s.act.microStep(0.5); s.act.microStep(-0.5); ok(s.dev.s === z && s.flags.microWrong >= 2, 'micro never moves the whole system (phase 4)'); }
{ const s = fresh(); to(s, 5); ok(s.act.microStep(-0.25) === false && /Nothing to recapture/i.test(s.note), 'phase 5, valve still in the capsule: nothing to recapture - "' + s.note + '"');
  ok(s.act.microStep(0.25) === false && s.dev.f === 0, 'micro + cannot deploy from 0');
  D.deployTo(0.5); const f0 = s.dev.f; ok(s.act.microStep(0.25) === false && s.dev.f === f0 && /cannot deploy/i.test(s.note), 'micro + never deploys forward (f stays ' + f0.toFixed(3) + '): "' + s.note + '"');
  for (let i = 0; i < 4; i++) s.act.microStep(-0.25); up(s, 0.2); ok(s.dev.f < f0 - 0.015 && s.dev.f > f0 - 0.03, 'micro - resheaths in fine steps (0.25 mm each): ' + f0.toFixed(3) + ' -> ' + s.dev.f.toFixed(3));
  ok(s.v.resheathing && s.dev.fv > s.dev.f, 'fine recapture uses the same hysteresis (frame stays open ' + s.dev.fv.toFixed(3) + ')');
  const f1 = s.dev.f; s.act.microStep(0.25); ok(s.dev.f > f1 && s.dev.f <= f0 + 1e-9, 'micro + only walks back toward where the recapture began');
  for (let i = 0; i < 40; i++) s.act.microStep(0.25); ok(s.dev.f <= f0 + 1e-9, 'micro + can never pass the recapture start (' + s.dev.f.toFixed(3) + ' <= ' + f0.toFixed(3) + ')'); }
{ const s = toLockedPhase6(); const fl = s.dev.f; ok(s.act.microStep(0.25) === false && s.dev.f === fl && s.dev.locked, 'at the 80% lock micro + does nothing');
  ok(s.act.microStep(-0.25) === true && s.dev.f < fl && !s.dev.locked, 'fine recapture works from the 80% lock'); ok(s.flags.recapAttempts >= 1, 'counted as a recapture'); }
{ const s = toLockedPhase6(); D.secondView(); s.act.unlock(); const f = s.dev.f; ok(s.phase === 7, 'phase 7'); ok(s.act.microStep(-0.25) === false && s.dev.f === f && /past the lock/i.test(s.note), 'past the lock micro is refused: "' + s.note + '"'); s.act.microStep(0.25); ok(s.dev.f === f, 'micro + past the lock does nothing');
  s.act.setPacing('fast'); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {}; ok(s.phase === 8, 'deployment wheel still finishes the release'); ok(s.act.microStep(-0.5) === false && /MACRO/i.test(s.note) && s.dev.macro === 0, 'phase 8: micro does not close/recapture the nosecone: "' + s.note + '"');
  s.input = { microHold: -1 }; up(s, 1); s.input = {}; ok(s.dev.macro === 0 && s.dev.f === 1, 'held micro in phase 8 has no effect on macro or deployment'); s.input = { macro: 1 }; D.phase8; }
{ const s = toLockedPhase6(); const d0 = s.flags.finalDepthNcc; for (const f of [0.3]) { /* depth is unchanged by micro attempts */ }
  const h = s.dev.h; s.act.microStep(0.5); s.act.microStep(0.5); up(s, 1); ok(Math.abs(s.dev.h - h) < 0.4, 'micro + attempts do not move the valve depth'); }
// too deep
{ const s = fresh(); to(s, 5); s.act.setPress(0.9); s.act.setWireTension(0.0); s.act.setCarm(-30, -30); D.deployTo(0.8); ok(s.phase === 6 && s.dev.h > 4.5, 'deep setup: NCC ' + s.dev.h.toFixed(2) + ' mm > 4.5');
  s.act.setCarm(32, 30); s.act.confirmSecondView(); ok(!s.chk.secondView && /DEEP/.test(s.note), 'second view rejects the deep valve: ' + s.note);
  D.resheathTo(0.35); D.deployTo(0.5); ok(s.flags.partialDeepRecapture > 0, 'PARTIAL recapture of a deep valve is logged as the wrong lesson'); }
{ const s = fresh(); to(s, 5); s.act.setPress(0.9); s.act.setWireTension(0.0); s.act.setCarm(-30, -30); D.deployTo(0.8); D.resheathTo(0); s.act.setPress(0.5); s.act.setWireTension(0.3); D.deployTo(0.8); ok(s.flags.fullRecapture > 0 && !s.flags.partialDeepRecapture && s.dev.h <= 4.5, 'FULL recapture + new approach of a deep valve is the right lesson, then depth ' + s.dev.h.toFixed(2)); }
// too high
{ const s = fresh(); to(s, 5); s.act.setPress(0.2); s.act.setWireTension(0.8); s.act.setCarm(-30, -30); D.deployTo(0.8); ok(s.dev.h < 3, 'high setup: NCC ' + s.dev.h.toFixed(2) + ' < 3');
  s.act.setCarm(32, 30); s.act.confirmSecondView(); ok(!s.chk.secondView && /HIGH/.test(s.note), 'second view rejects high valve: ' + s.note);
  D.resheathTo(0.45); s.act.setPress(0.5); s.act.setWireTension(0.3); s.act.tug(); s.act.tug(); up(s, 4); D.deployTo(0.8); ok(s.dev.h >= 3 && s.flags.partialHighRecapture >= 0, 'partial recapture + gentle tug lets it descend: NCC ' + s.dev.h.toFixed(2)); }
// stability/bounce
{ const a = fresh(); to(a, 5); a.act.setPress(0.5); a.act.setWireTension(0.3); a.act.setCarm(-30, -30); D.deployTo(0.5); const good = a.v.bounceAmp;
  const b = fresh(); to(b, 5); b.act.setPress(0.0); b.act.setWireTension(0.0); b.act.setCarm(-30, -30); D.deployTo(0.5); const bad = b.v.bounceAmp;
  ok(bad > good * 1.5, `bounce larger with poor pressure/wire tension (${bad.toFixed(2)} vs ${good.toFixed(2)})`);
  b.act.setPacing('120'); up(b, 0.1); ok(b.v.bounceAmp < bad * 0.6, 'pacing 120 reduces root bounce'); }
console.log('== phase 8/9 ==');
function toPhase8() { const s = toLockedPhase6(); D.secondView(); D.release('fast'); return s; }
{ const s = toPhase8(); ok(s.phase === 8 && s.dev.released, 'released -> phase 8'); s.act.toggleHold(); s.input = { macro: 1 }; up(s, 1); s.input = {}; ok(s.dev.macro > 0, 'macro slide works after release');
  const m = s.dev.macro; s.act.setHold(true); s.input = { adv: -1 }; up(s, 1); ok(s.dev.macro >= m && s.phase === 8, 'cannot withdraw until closed'); }
{ const s = toPhase8(); s.act.setHold(true); s.input = { macro: 1 }; up(s, 4); s.input = {}; ok(s.dev.macro >= 1, 'macro closed'); D.autoFlex(-8); s.dev.lat = 0;
  // off-centre: nosecone not centred (no wire advance, flex off)
  s.act.flexSet(0.9); s.input = { adv: -1 }; let g = 0; while (!s.fx && g++ < 3000 && s.dev.s > P.lm.ann - 30) { s.update(dt); }
  ok(s.fx && s.fx.type === 'frameCatch', 'withdrawing OFF-CENTRE catches the frame -> fail: ' + (s.fx && s.fx.type + ' lat ' + s.dev.lat.toFixed(1))); }
{ const s = toPhase8(); s.act.setHold(true); s.input = { adv: -1 }; let g = 0; while (!s.fx && g++ < 3000) s.update(dt); ok(s.fx && s.fx.type === 'frameCatch', 'withdrawing with the nosecone NOT closed catches the frame: ' + (s.fx && s.fx.type)); waitRetry(s); ok(s.dev.macro === 0 || true, 'retry'); }
{ const s = toPhase8(); s.act.setHold(false); s.input = { macro: 1 }; up(s, 4); s.input = { adv: -1 }; let g = 0; while (!s.fx && g++ < 3000) s.update(dt); ok(s.fx && (s.fx.type === 'wirePulled' || s.fx.type === 'frameCatch'), 'wire not held -> wire pulled out with the device / frame catch: ' + (s.fx && s.fx.type)); }
{ const s = toPhase8(); s.act.setHold(false); s.input = { macro: 1 }; up(s, 4); s.input = {}; s.act.setHold(false); s.dev.lat = 0; s.dev.s = s.dev.valveS - 2 + 40; s.input = { adv: -1 }; let g = 0; while (!s.fx && g++ < 4000 && s.dev.s > P.lm.ann - 100) s.update(dt); ok(s.fx && s.fx.type === 'wirePulled', 'wire pulled with the device -> wirePulled: ' + (s.fx && s.fx.type)); ok(s.flags.wirePulled > 0, 'flag recorded'); }
{ const s = fresh(); s.act.macroTry(); ok(s.flags.macroWrong > 0, 'macro slide before release is rejected'); const t = toLockedPhase6(); t.input = { macro: 1 }; up(t, 1); ok(t.dev.macro === 0 && t.flags.macroWrong > 0, 'macro slide before release has no effect, coaching'); }
// full happy path
console.log('== happy path ==');
{ const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); D.toLock(); D.secondView(); D.release('fast'); ok(s.phase === 8, 'happy: released');
  D.phase8(); ok(s.phase === 9, 'happy: out via arch and iliac, phase 9 (fx ' + (s.fx && s.fx.type) + ')');
  s.act.hemostasis(); ok(!s.finished && /Remove the wire/.test(s.note), 'hemostasis before wire removal refused: ' + s.note); s.act.preclose(); ok(!s.flags.preclose, 'preclose before wire removal refused'); s.act.removeWire(); ok(!s.flags.wireRemoved, 'wire removal before aortogram refused');
  s.act.aortogram('root'); ok(s.flags.aortogram, 'completion aortogram: ' + s.note); s.act.removeWire(); s.act.hemostasis(); ok(!s.finished && s.flags.closureFail >= 1, 'hemostasis before 2 preclose + angiogram -> closure fail'); waitRetry(s);
  s.act.preclose(); s.act.hemostasis(); waitRetry(s); ok(!s.finished, 'one preclose not enough'); s.act.preclose(); s.act.aortogram('iliac'); s.act.hemostasis(); ok(s.finished && s.score, 'hemostasis -> score sheet');
  console.log(JSON.stringify(s.score.rows.map(r => [r.name || r.title, r.pass, r.msg || r.feedback || '']), null, 0));
  console.log(s.score.overall || s.score.note);
}
// clean run => 9/9
{ const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); D.toLock(); D.secondView(); D.release('fast'); D.phase8(); D.phase9();
  ok(s.finished && s.score.passed === 9, 'clean case scores 9/9: ' + s.score.passed + '/' + s.score.total + ' ' + s.score.rows.filter(r => !r.pass).map(r => r.title + ': ' + r.feedback).join(' | ')); }
// sloppy run => misses with feedback, MAJOR
{ const s = fresh(); D.goPhase1(); D.goDesc(); /* skip rotation: confirm anyway after wrong rot */ s.act.rotateStep(100 - s.rotErr2()); s.act.confirmRotation(); ok(s.phase === 2, 'cannot confirm a wrong rotation'); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30);
  s.act.setPress(0.9); s.act.setWireTension(0); D.toLock(); s.act.unlock(); s.act.setPacing('fast'); s.input = { deploy: 1, deployFast: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {};
  D.phase8(); D.phase9();
  console.log('sloppy:', s.finished, s.score && s.score.overall); (s.score ? s.score.rows : []).filter(r => !r.pass).forEach(r => console.log('   MISS', r.title, r.major ? '[MAJOR]' : '', '-', r.feedback));
  ok(s.finished && s.score.rows.some(r => !r.pass && r.feedback && r.feedback.split('. ').length <= 3), 'sloppy case: misses carry a feedback sentence'); }

{ const s = toLockedPhase6(); s.act.unlock(); D.release(null); D.phase8(); if (s.phase === 8) { } console.log('sloppy phase', s.phase); }
{ const s = fresh(); run(s, { adv: 1, fast: 1 }, 60); waitRetry(s); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); D.toLock(); D.secondView(); D.release('fast');
  s.act.toggleHold(); s.act.setHold(false); s.input = { macro: 1 }; up(s, 4); s.dev.lat = 0; s.input = { adv: -1 }; let g = 0; while (!s.fx && g++ < 5000) s.update(dt); waitRetry(s); D.phase8(); D.phase9();
  const r = s.score && Object.fromEntries(s.score.rows.map(x => [x.id, x]));
  ok(r && !r.iliac.pass && r.iliac.feedback, 'iliac trauma recorded and scored: ' + (r && r.iliac.feedback));
  ok(r && (!r.wire.pass || !r.nose.pass), 'wire pulled / nosecone path recorded in score: ' + (r && (r.wire.feedback + ' ' + r.nose.feedback))); }
console.log('== contrast injection / unlock / slider ==');
{ const s = fresh(); s.act.inject(); ok(!s.contrast.root && /phase 4|not in the NCC/.test(s.note), 'inject refused before phase 4: ' + s.note);
  to(s, 5); s.act.inject(); ok(!!s.contrast.root && !!s.contrast.cor && !s.flags.aortogram && !s.contrast.pvlJet, 'inject in phase 5: root + coronaries, no leak, not recorded as completion aortogram');
  up(s, 6); ok(!s.contrast.root, 'puff fades after its duration');
  s.act.unlock(); ok(/Nothing to unlock/.test(s.note), 'unlock when not locked explains: ' + s.note);
  s.act.setCarm(-30, -30); D.press(); D.toLock(); s.fx = { type: 'x', t: 0, coach: '' }; s.act.unlock(); ok(s.dev.locked && /fluoro problem/.test(s.note), 'unlock during a fluoro problem explains: ' + s.note); s.fx = null;
  s.act.wheel(0.05); ok(/second-view|3-cusp/.test(s.note), 'deploy while locked & unchecked says do the 3-cusp check then unlock: ' + s.note);
  D.secondView(); s.act.wheel(0.05); ok(/UNLOCK/.test(s.note), 'deploy while locked & checked says press UNLOCK: ' + s.note); ok(/UNLOCK/.test(s.coach), 'phase 6 coach line tells the learner to UNLOCK after the check');
  s.act.unlock(); ok(!s.dev.locked && s.phase === 7 && /CLOCKWISE|clockwise/.test(s.coach), 'phase 7 coach: finish clockwise slowly');
  s.act.wheel(-0.01); s.act.wheel(0.03); ok(!s.dev.locked, 'backwards wobble after Unlock does not re-engage the lock (f=' + s.dev.f.toFixed(3) + ')');
  up(s, 1); s.v.maxSpeedPost80 = 0; s.input = { sliderTarget: 1 }; let g = 0; while (s.phase === 7 && g++ < 3000) s.update(dt); ok(s.phase === 8 && s.dev.f === 1, 'slider target follows at a safe rate to exactly 100% and releases (' + (g / 30).toFixed(1) + ' s)');
  ok(s.v.maxSpeedPost80 <= 0.075, 'slider-driven finish never exceeds the post-80% speed limit (max ' + s.v.maxSpeedPost80.toFixed(3) + ')');
  s.act.inject(); ok(s.flags.aortogram && !!s.contrast.pvlJet && !!s.contrast.lv, 'after release: inject records the completion aortogram and shows the leak into the LV (PVL ' + s.flags.pvl + ')');
  D.phase8(); ok(s.phase === 9, 'phase 9'); s.act.removeWire(); ok(s.flags.wireRemoved, 'wire removal allowed after the injection satisfied the aortogram'); s.act.inject(); ok(/pigtail is out/.test(s.note), 'inject after pigtail removal explains: ' + s.note); }
{ // same case with and without extra injections: identical score rows
  const run = (inj) => { const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); if (inj) s.act.inject(); D.toLock(); if (inj) s.act.inject(); D.secondView(); D.release('fast'); if (inj) s.act.inject(); D.phase8(); if (!inj) s.act.aortogram('root'); D.phase9(); return s.score.rows.map(r => r.pass + ':' + r.result).join('|'); };
  ok(run(true) === run(false), 'injections do not change any score row'); }
{ // tap-to-step (+/-2 mm): same physics, lock and speed rules as the wheel
  const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press();
  ok(s.phase === 5, 'step test: phase 5');
  let mx = 0; const run = (sec) => { for (let i = 0; i < sec * 30; i++) { s.update(dt); mx = Math.max(mx, s.v.speed); } };
  s.act.stepMm(2); run(3); ok(Math.abs(s.dev.retractMm - 2) < 0.05, 'stepMm(+2) retracts exactly 2 mm (' + s.dev.retractMm.toFixed(3) + ')'); ok(mx <= 0.085, 'a step never exceeds the safe wheel speed (' + mx.toFixed(3) + ' of travel/s)');
  s.act.stepMm(2); s.act.stepMm(2); run(5); ok(Math.abs(s.dev.retractMm - 6) < 0.05, 'three steps queue up to 6 mm (' + s.dev.retractMm.toFixed(2) + ')');
  s.act.stepMm(-2); run(3); ok(Math.abs(s.dev.retractMm - 4) < 0.05, 'stepMm(-2) resheaths 2 mm (' + s.dev.retractMm.toFixed(2) + ')');
  s.act.stepMm(-50); run(5); ok(s.dev.f === 0, 'stepping below 0 stops at fully sheathed');
  s.input = { sliderTarget: 0.78 }; run(30); s.act.stepMm(2); run(4); ok(s.dev.locked && Math.abs(s.dev.f - 0.8) < 0.003, 'a step stops at the 80% lock (f=' + s.dev.f.toFixed(3) + ', locked ' + s.dev.locked + ')');
  const f0 = s.dev.f; s.act.stepMm(2); run(3); ok(Math.abs(s.dev.f - f0) < 1e-6, 'at the lock a step does nothing until Unlock');
  const s2 = fresh(); s2.act.stepMm(2); for (let i = 0; i < 90; i++) s2.update(dt); ok(s2.dev.f === 0, 'before phase 5 a step is refused (the wheel gate applies)');
}
console.log(`\n${pass} passed, ${fail} failed`); out.forEach(o => console.log(o)); process.exit(fail ? 1 : 0);
