// Prints depth numbers for a set of scenarios (used to calibrate / regression-check the physics)
import { buildFrame, buildPaths } from '../src/anatomy.js';
import { Sim } from '../src/sim.js';
globalThis.window = globalThis; globalThis.__sim = { sim: null };
await import('./drv.js'); const D = globalThis.__drv;
const F = buildFrame(), P = buildPaths(F); const dt = 1 / 30;
function fresh() { const s = new Sim(F, P); s.started = true; s.act.setCarm(0, 0); __sim.sim = s; return s; }
function to5(s) { D.goPhase1(); D.goDesc(); D.setRotation(); D.goArch(); D.goCross(); D.alignAt(); s.act.setCarm(-30, -30); D.press(); return s; }
const f2 = (x) => x.toFixed(2);
function scen(name, press, wt, pace, fin) {
  const s = to5(fresh()); s.act.setPress(press); s.act.setWireTension(wt); if (pace) s.act.setPacing(pace);
  D.deployTo(0.8); const a = [s.dev.h, s.dev.tilt]; D.secondView(); s.act.unlock(); s.act.setPacing(fin.pace);
  s.input = { deploy: 1, deployFast: fin.fast ? 1 : 0 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {};
  console.log(name.padEnd(28), 'lock ncc', f2(a[0]), 'tilt', f2(a[1]), '| final ncc', f2(s.flags.finalDepthNcc), 'lcc', f2(s.flags.finalDepthLcc), 'releasedFast', !!s.flags.releasedFast, 'unpaced', !!s.flags.releasedUnpaced);
}
scen('baseline slow/paced', 0.5, 0.3, 'off', { pace: 'fast' });
scen('baseline slow/unpaced', 0.5, 0.3, 'off', { pace: 'off' });
scen('baseline fast/paced', 0.5, 0.3, 'off', { pace: 'fast', fast: 1 });
scen('baseline fast/unpaced', 0.5, 0.3, 'off', { pace: 'off', fast: 1 });
scen('deep setup', 0.9, 0.0, 'off', { pace: 'fast' });
scen('high setup', 0.2, 0.8, 'off', { pace: 'fast' });
scen('pace120 during', 0.5, 0.3, '120', { pace: 'fast' });
