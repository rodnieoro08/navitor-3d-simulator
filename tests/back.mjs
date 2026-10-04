// Node test of the "Back" (previous phase) button logic: Sim.backPhase().
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Sim } from '../src/sim.js';
globalThis.window = globalThis; globalThis.__sim = { sim: null };
await import('./drv.js');
const D = globalThis.__drv; const F = buildFrame(), P = buildPaths(F), lm = P.lm; const dt = 1 / 30;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const fresh = () => { const s = new Sim(F, P); s.started = true; s.act.setCarm(0, 0); __sim.sim = s; return s; };
const up = (s, sec) => { for (let i = 0; i < sec * 30; i++) s.update(dt); };
function to(s, ph) { // clean run up to the START of phase ph
  if (ph >= 2) D.goPhase1(); if (ph >= 3) { D.goDesc(); D.setRotation(); } if (ph >= 4) D.goArch(); if (ph >= 5) { D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); }
  if (ph >= 6) D.toLock(); if (ph >= 7) { D.secondView(); s.act.unlock(); } if (ph >= 8) { D.release('fast'); } if (ph >= 9) { D.phase8(); }
  return s;
}
function finishFrom(s) { // complete the case from whatever phase it is in
  let g = 0; while (!s.finished && g++ < 12) { const p = s.phase;
    if (p === 1) D.goPhase1(); else if (p === 2) { D.goDesc(); D.setRotation(); } else if (p === 3) D.goArch(); else if (p === 4) { D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); }
    else if (p === 5) { D.press(); D.toLock(); } else if (p === 6) { D.secondView(); s.act.unlock(); D.release('fast'); } else if (p === 7) { D.release('fast'); }
    else if (p === 8) D.phase8(); else if (p === 9) { D.phase9(); } if (s.fx) { let w = 0; while (s.fx && w++ < 300) s.update(dt); } }
  return s.finished;
}
const consistent = (s, tag) => {
  const d = s.dev; ok(!s.fx, `${tag}: no failure active`); ok(Number.isFinite(d.s) && d.s >= lm.skin && d.s <= P.path.length, `${tag}: device position valid (s=${d.s.toFixed(0)})`);
  ok(s.wire.s >= d.s + 13.9 && !s.wire.removed && s.wire.hold, `${tag}: wire is the rail ahead of the nosecone (wire ${s.wire.s.toFixed(0)} >= tip ${d.s.toFixed(0)} + 14, held, not removed)`);
  ok(Number.isFinite(d.sd) && Math.abs(d.lat) <= 14, `${tag}: displayed position finite, lateral offset sane (${d.lat.toFixed(1)})`);
};

console.log('== phase 1: no back ==');
{ const s = fresh(); ok(s.act.backPhase() === false && s.phase === 1, 'Back does nothing in phase 1'); }
console.log('== back from every phase 2..9 ==');
const expect = {
  2: (s) => s.phase === 1 && s.dev.s < lm.bif + 55 && !s.chk.rot2,
  3: (s) => s.phase === 2 && s.dev.s <= lm.archStart - 25 && s.dev.s >= lm.descStart + 10 && !s.chk.rot2,
  4: (s) => s.phase === 3 && s.chk.rot2 && s.dev.s > lm.archStart && s.dev.s < lm.ascDone && !s.chk.crossed,
  5: (s) => s.phase === 4 && s.dev.f === 0 && !s.dev.locked && s.dev.s < lm.ann - 20 && !s.chk.alignConfirmed && !s.chk.crossed,
  6: (s) => s.phase === 5 && s.dev.f === 0 && !s.dev.locked && s.dev.lockArmed && !s.dev.released && Math.abs(s.sysZ()) <= 1.5 && s.dev.s > lm.ann && s.v.ph.rEff === 0,
  7: (s) => s.phase === 6 && s.dev.locked && s.dev.f <= 0.8 + 1e-9 && !s.chk.secondView && !s.dev.released,
  8: (s) => s.phase === 7 && !s.dev.released && !s.dev.locked && s.dev.f > 0.9 && s.dev.macro === 0,
  9: (s) => s.phase === 8 && s.dev.released && s.dev.macro === 0 && s.descOk() && s.macroState() === 'ready' && !s.wire.removed,
};
for (let p = 2; p <= 9; p++) {
  const s = to(fresh(), p); ok(s.phase === p, `reached phase ${p}`);
  const ok1 = s.act.backPhase(); ok(ok1 === true && expect[p](s), `phase ${p} -> ${s.phase}: state set up (s=${s.dev.s.toFixed(0)}, f=${s.dev.f.toFixed(2)}, locked ${s.dev.locked}, released ${s.dev.released})`);
  consistent(s, `back ${p}->${p - 1}`);
  ok(/Back to phase/.test(s.note) && /not a miss/i.test(s.note) && /went back from phase/.test(s.coach), `back ${p}->${p - 1}: note + coach line explain it: "${s.note.slice(0, 60)}..."`);
  up(s, 0.5); ok(s.phase === p - 1 && !s.fx, `back ${p}->${p - 1}: the new phase is stable after 0.5 s (no instant forward/failure)`);
  ok(finishFrom(s) && s.score, `back ${p}->${p - 1}: gates still work going forward again and the full case can be completed`);
  ok(s.score.passed === 9, `back ${p}->${p - 1}: a clean run with a Back keeps 9/9 (Back is not a miss): ${s.score.passed}/${s.score.total}`);
  ok(s.score.wentBack.length === 1 && s.score.wentBack[0].to === p - 1 && new RegExp('Went back to phase ' + (p - 1)).test(s.score.wentBack[0].text), `back ${p}->${p - 1}: score sheet notes "${s.score.wentBack[0].text.slice(0, 48)}..."`);
}
console.log('== repeated back, back/forward/back ==');
{ const s = to(fresh(), 7); s.act.backPhase(); s.act.backPhase(); s.act.backPhase(); ok(s.phase === 4, 'three Backs in a row from 7 -> 4'); consistent(s, 'triple back');
  ok(finishFrom(s) && s.score.passed === 9 && s.score.wentBack.length === 3, 'case completes after three Backs, 9/9, three informational lines'); }
{ const s = to(fresh(), 5); D.toLock(); s.act.backPhase(); ok(s.phase === 5 && s.dev.f === 0, 'back from 6 re-sheathes the valve completely'); D.toLock(); ok(s.phase === 6 && s.dev.locked, 'the real wheel reaches the 80% lock again'); }
{ const s = to(fresh(), 8); const rel = s.flags.finalDepthNcc; s.act.backPhase(); ok(s.phase === 7 && !s.dev.released, 'back from 8: the valve is un-released (restored just before the last turn)'); D.release('fast'); ok(s.phase === 8 && s.dev.released && Math.abs(s.flags.finalDepthNcc - rel) < 1.5, `re-release gives a comparable depth (${rel.toFixed(1)} -> ${s.flags.finalDepthNcc.toFixed(1)} mm)`); }
console.log('== misses stay (no farming a clean sheet) ==');
{ // skipped alignment check, then go back and do it properly: the miss stays
  const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); s.act.skipAlign(); ok(s.phase === 5 && s.flags.alignSkipped, 'alignment check skipped (scored miss)');
  s.act.backPhase(); ok(s.phase === 4, 'back to phase 4'); D.goCross(); D.alignAt(); ok(s.chk.alignConfirmed, 'alignment now confirmed properly'); finishFrom(s);
  const al = s.score.rows.find(r => r.id === 'align'); ok(s.finished && !al.pass && al.kept !== undefined && /earlier|skipped|re-check|stays/.test(al.result + al.feedback), 'alignment row stays a MISS after redoing it: ' + al.result.slice(0, 80)); ok(s.score.passed < 9, 'sheet is not clean (' + s.score.passed + '/9)'); }
{ // wheel-for-nosecone counter then back and redo
  const s = to(fresh(), 8); s.act.wheel(-0.1); ok(s.flags.nosecWheelTry > 0, 'nosecone-by-wheel attempt counted'); s.act.backPhase(); s.act.backPhase(); finishFrom(s);
  const nr = s.score.rows.find(r => r.id === 'nose'); ok(!nr.pass, 'nosecone row still a miss after going back twice and finishing'); }
{ // sloppy deployment (bad press / tension), its row failures must survive a back + redo
  const s = fresh(); D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); s.act.setPress(0.95); s.act.setWireTension(0); D.toLock(); s.act.unlock(); s.act.setPacing('fast'); s.input = { deploy: 1, deployFast: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {};
  const probe = fresh; const before = s.flags; const failing = []; // provisional score at release time
  const rows0 = (await import('../src/scoring.js')).computeScore(s, true).rows; for (const r of rows0) if (!r.pass && ['depthNcc', 'depthLcc', 'align', 'stop80', 'wire'].includes(r.id)) failing.push(r.id);
  ok(failing.length > 0, 'sloppy release produced misses to protect: ' + failing.join(','));
  s.act.backPhase(); ok(s.phase === 7 && !s.dev.released, 'back from 8 after a sloppy release'); s.act.setPress(0.5); s.act.setWireTension(0.3); s.act.setPacing('fast'); finishFrom(s);
  const rows1 = s.score.rows; ok(failing.every(id => !rows1.find(r => r.id === id).pass), 'every row that was a miss before going back is still a miss: ' + failing.join(',')); }
console.log('== no side effects on the score from Back itself ==');
{ const s = to(fresh(), 3); const snap = () => { const o = JSON.parse(JSON.stringify(s.flags)); delete o.wentBack; delete o.sticky; return JSON.stringify(o); }; const f0 = snap(); s.act.backPhase(); const f1 = snap(); ok(f0 === f1, 'Back changes no scoring counter / flag (only the informational wentBack list)'); }
console.log(`\nback: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
