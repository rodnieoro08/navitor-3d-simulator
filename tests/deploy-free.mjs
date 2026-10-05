// v15 logic: phase 5 never blocks unsheathing; skipped prerequisites are scored misses on the existing rows; the lock at 80% moves on to phase 6 by itself.
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Sim } from '../src/sim.js';
globalThis.window = globalThis; globalThis.__sim = { sim: null };
await import('./drv.js');
const D = globalThis.__drv; const F = buildFrame(), P = buildPaths(F); const dt = 1 / 30;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const fresh = () => { const s = new Sim(F, P); s.started = true; s.act.setCarm(0, 0); __sim.sim = s; return s; };
const p5 = () => { const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); return s; };
const hold = (s, inp, max = 3000) => { s.input = inp; let g = 0; while (s.phase === 5 && g++ < max) s.update(dt); s.input = {}; };
const finish = (s, second = true) => { if (second) D.secondView(); s.act.unlock(); if (s.pacing !== 'fast') s.act.setPacing('fast'); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 12000) s.update(dt); s.input = {}; for (let i = 0; i < 4 && !s.finished; i++) { if (s.phase === 8) D.phase8(); else if (s.phase === 9) D.phase9(); let w = 0; while (s.fx && w++ < 300) s.update(dt); } return s.finished; };
const row = (s, id) => s.score.rows.find(r => r.id === id);

console.log('== clean baseline: wheel hold -> 80% -> phase 6 by itself ==');
{ const s = p5(); hold(s, { deploy: 1 }); ok(s.phase === 6 && s.dev.locked && Math.abs(s.dev.f - 0.8) < 1e-9, 'hold to deploy reaches the lock and moves to phase 6 automatically'); ok(/moved on to phase 6 automatically/.test(s.note), 'coach line: "' + s.note.slice(0, 90) + '..."'); ok(s.flags.autoAdvance56 === 1 && !s.flags.deployNoView && !s.flags.deployNoMarker && !s.flags.deployNoHold && !s.flags.deployUnready, 'clean start records no miss');
  ok(!s.fx && s.dev.s > s.lm.ann, 'consistent: no failure, device at the annulus'); ok(finish(s) && s.score.passed === 9, 'full run still 9/9 (' + s.score.passed + '/9)'); }
console.log('== each missing prerequisite: allowed, recorded, mapped to an existing row ==');
const cases = [
  ['parallax / not cusp overlap', s => s.act.setCarm(0, 0), 'deployNoView', 'align'],
  ['edge-on but wrong azimuth (3-cusp view)', s => s.act.setCarm(32, 30), 'deployNoView', 'align'],
  ['marker 4 mm too deep', s => { s.dev.s += 4; s.dev.sd = s.dev.s; }, 'deployNoMarker', 'align'],
  ['marker 5 mm too high', s => { s.dev.s -= 5; s.dev.sd = s.dev.s; }, 'deployNoMarker', 'align'],
  ['valve not across the annulus', s => { s.dev.s -= 20; s.dev.sd = s.dev.s; }, 'deployNoCross', 'nose'],
  ['wire not fixed', s => s.act.setHold(false), 'deployNoHold', 'wire'],
];
for (const [name, mut, flag, rowId] of cases) {
  const s = p5(); mut(s); s.act.wheel(0.02); ok(s.dev.f > 0.015, `${name}: first turn of the wheel is NOT refused (f=${s.dev.f.toFixed(3)})`);
  ok(s.flags[flag] === true && s.flags.deployUnready === 1, `${name}: ${flag} recorded`); ok(/Unsheathing without/.test(s.note) && /scored as a miss/.test(s.note), `${name}: coach line: "${s.note.slice(0, 80)}..."`);
  hold(s, { deploy: 1 }); ok(s.phase === 6 && s.dev.locked && Math.abs(s.dev.f - 0.8) < 1e-9, `${name}: reaches the 80% lock -> phase 6 automatically`); ok(!s.fx, `${name}: no failure, state consistent`);
  const fin = finish(s, !!s.chk.secondView || true); ok(fin, `${name}: the case can still be finished`); const r = row(s, rowId); ok(r && !r.pass, `${name}: '${rowId}' row is a scored miss: "${(r.result || '').slice(0, 90)}"`);
  ok(s.score.passed < 9, `${name}: sheet not clean (${s.score.passed}/9)`);
}
console.log('== the valve lands where the system is (physics, not blocked) ==');
{ const dz = { '+10': 10, '+30': 30, '-10': -10 }; const res = {};
  for (const k in dz) { const s = p5(); s.dev.s += dz[k]; s.dev.sd = s.dev.s; hold(s, { deploy: 1 }); finish(s, false); res[k] = [s.flags.finalDepthNcc, s.score]; }
  ok(res['+10'][0] > 7 && res['+30'][0] > res['+10'][0], `deeper start = deeper valve (${res['+10'][0].toFixed(1)} mm, ${res['+30'][0].toFixed(1)} mm)`); ok(res['-10'][0] < 0, `starting above the plane = valve above the annulus (${res['-10'][0].toFixed(1)} mm)`);
  const dn = res['+30'][1].rows.find(r => r.id === 'depthNcc'), up = res['-10'][1].rows.find(r => r.id === 'depthNcc'); ok(!dn.pass && /embolise|LV/.test(dn.feedback), 'very deep: realistic consequence on the sheet: "' + dn.feedback.slice(0, 90) + '..."'); ok(!up.pass && /above the annulus|migrate/.test(up.feedback), 'above the annulus: realistic consequence: "' + up.feedback.slice(0, 90) + '..."');
  const s = p5(); s.dev.s = s.lm.archStart - 80; s.dev.sd = s.dev.s; hold(s, { deploy: 1 }); ok(finish(s, false), 'deployed far from the annulus (in the arch): no crash, case completes'); const r = row(s, 'depthNcc'); ok(!r.pass && /More than 40 mm/.test(r.result), 'depth is capped in the sheet text: ' + r.result); }
console.log('== phase 6 rules unchanged after the auto-advance ==');
{ const s = p5(); hold(s, { deploy: 1 }); const f0 = s.dev.f; s.act.wheel(0.02); ok(s.dev.f === f0 && /lock/i.test(s.note), 'phase 6: the wheel stops at the lock and says why');
  s.act.unlock(); ok(s.flags.major80 && s.phase === 7, 'Unlock without the second view = MAJOR (unchanged)');
  const t = p5(); hold(t, { deploy: 1 }); D.secondView(); ok(t.chk.secondView, 'second view is accepted for a good landing'); t.act.unlock(); ok(!t.flags.major80 && t.phase === 7, 'Unlock after the second view: no MAJOR'); }
{ const s = p5(); hold(s, { deploy: 1 }); s.act.wheel(-0.2); s.update(dt); ok(s.phase === 5 && s.dev.f < 0.7 && !s.dev.locked, 'recapture between 0-80% from phase 6 returns to phase 5'); s.act.wheel(0.5); ok(s.phase === 6 && s.dev.locked && s.flags.autoAdvance56 === 2, 'deploy again: auto-advance again (second time)'); }
{ const s = p5(); s.act.setCarm(0, 0); s.act.wheel(0.02); D.resheathTo(0); s.act.setCarm(-30, -30); hold(s, { deploy: 1 }); D.secondView(); finish(s, false); ok(!row(s, 'align').pass, 'a miss from a first, abandoned start stays on the sheet (no cleaning up by recapturing)'); }
console.log('== other phases: still gated; tap/slider path goes through the same rules ==');
{ const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); s.act.wheel(0.05); ok(s.dev.f === 0, 'phase 4 and earlier: unsheathing is still refused'); }
{ const s = p5(); s.act.setCarm(0, 0); s.act.stepMm(2); for (let i = 0; i < 150; i++) s.update(dt); ok(s.dev.f > 0.02 && s.flags.deployNoView, 'tap step in phase 5 works without the gates (recorded)'); for (let i = 0; i < 40; i++) s.act.stepMm(2); let g = 0; while (s.phase === 5 && g++ < 6000) s.update(dt); ok(s.phase === 6 && s.dev.locked && s.flags.autoAdvance56 === 1, 'taps reach the lock and advance automatically'); }
console.log('== Back / Skip / phase 8 ordering around it ==');
{ const s = p5(); hold(s, { deploy: 1 }); s.act.backPhase(); ok(s.phase === 5 && s.dev.f === 0, 'Back 6 -> 5 re-sheathes'); s.act.setCarm(0, 0); s.act.wheel(0.03); ok(s.dev.f > 0 && s.flags.deployNoView, 'after Back: unsheathing is free as well'); }
{ const s = p5(); ok(s.act.skipPhase() && s.phase === 6 && s.dev.locked, 'Skip 5 -> 6 still lands at the lock'); ok(finish(s) && s.finished, 'run completes after Skip'); }
{ const s = p5(); hold(s, { deploy: 1 }); D.secondView(); s.act.unlock(); s.act.setPacing('fast'); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {}; ok(s.phase === 8 && s.macroState() === 'locked', 'phase 8: MACRO locked until the open system is withdrawn (v12 order unchanged)'); }
console.log(`\ndeploy-free: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
