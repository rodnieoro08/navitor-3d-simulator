import { buildFrame, buildPaths } from './src/anatomy.js';
import { Sim } from './src/sim.js';
const F = buildFrame(), P = buildPaths(F);
const sim = new Sim(F, P); sim.started = true;
const lm = P.lm, path = P.path;
const dt = 1/30;
const T = (n) => { for (let i = 0; i < n * 30; i++) sim.update(dt); };
const log = (...a) => console.log(...a);
sim.act.setCarm(0, 0);
function autoFlex() { sim.act.flexSet(sim.path.flexReq(sim.dev.s + 8)); }
// phase 1
let g = 0;
sim.input = { adv: 1, twirl: 1, fast: 0 };
while (sim.phase === 1 && g++ < 5000) { autoFlex(); sim.update(dt); }
log('P1 done', sim.phase, sim.dev.s.toFixed(0), 'events', JSON.stringify(sim.ev.filter(e => e.type === 'fail')), 'time', sim.time.toFixed(0));
// phase 2
sim.input = { adv: 1, fast: 1 }; g = 0;
while (sim.dev.s < lm.descStart + 10 && g++ < 5000) { autoFlex(); sim.update(dt); }
sim.input = {};
log('roll', sim.dev.roll, 'rotErr', sim.rotErr2());
sim.act.rotateStep(-sim.rotErr2());
log('rotErr after', sim.rotErr2()); sim.act.confirmRotation(); log('phase', sim.phase, sim.note);
// phase 3
sim.input = { adv: 1, fast: 0 }; g = 0;
while (sim.phase === 3 && g++ < 8000) { if (sim.dev.s < lm.ascDone - 5) autoFlex(); else sim.act.flexSet(0.1); sim.update(dt); }
log('P3 done', sim.phase, sim.dev.s.toFixed(0), 'time', sim.time.toFixed(0), 'fails', JSON.stringify(sim.ev.filter(e => e.type === 'fail')), 'drift', sim.dev.drift.toFixed(1));
// phase 4
sim.act.flexSet(0.15); g = 0;
sim.input = { adv: 1 };
while (sim.dev.s < lm.ann + 32 && g++ < 5000) sim.update(dt);
sim.input = { adv: -1 };
while (sim.sysZ() > 0.8 && g++ < 9000) sim.update(dt);
sim.input = {};
log('sysZ', sim.sysZ().toFixed(2), 'lat', sim.dev.lat.toFixed(2), 'alignErr', sim.alignErr().toFixed(1), 'crossed', sim.chk.crossed);
sim.act.setCarm(-30, -30);
sim.act.rotateStep(-sim.alignErr());
log('alignErr after', sim.alignErr().toFixed(1), 'view', JSON.stringify(sim.viewInfo()));
sim.act.confirmAlign(); T(0.2);
log('phase', sim.phase, sim.chk);
sim.act.setPress(0.5); sim.act.setWireTension(0.3);
// phase 5
sim.input = { deploy: 1 }; g = 0;
while (sim.phase === 5 && g++ < 5000) sim.update(dt);
sim.input = {};
log('lock', sim.phase, sim.dev.f, 'h', sim.dev.h.toFixed(2), 'tilt', sim.dev.tilt.toFixed(2), 'lcc', (sim.dev.h - sim.dev.tilt).toFixed(2), 'stab', sim.v.stab);
// phase 6
sim.act.setCarm(32, 30);
log('3cusp view', JSON.stringify(sim.viewInfo()));
sim.act.confirmSecondView(); log('note', sim.note, sim.chk.secondView);
