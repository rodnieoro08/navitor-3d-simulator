import * as THREE from 'three';
import { buildFrame, buildPaths } from './anatomy.js';
import { buildScene } from './scene.js';
import { Device } from './device.js';
import { Sim } from './sim.js';
import { Views } from './view.js';
import { UI } from './ui.js';

const F = buildFrame(), P = buildPaths(F);
const world = buildScene(F, P); world.F = F; world.P = P;
const sim = new Sim(F, P);
const device = new Device(world.scene, world.reg, F, P, world.rootGroup);
const dom = { mon: document.getElementById('mon'), ov: document.getElementById('ov'), td: document.getElementById('td') };
const views = new Views(sim, world, device, dom);
const ui = new UI(sim, views, world);

const errors = [];
addEventListener('error', e => errors.push(String(e.message)));
let topH = 0, paused = false, last = performance.now(), acc = 0, tClock = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) { acc += dt; while (acc >= 1 / 30) { sim.update(1 / 30); acc -= 1 / 30; } }
  tClock += dt;
  device.update(sim, dt);
  views.render(dt, tClock);
  ui.refresh();
  const th = document.getElementById('top').offsetHeight; if (th !== topH) { topH = th; document.documentElement.style.setProperty('--topH', th + 'px'); }
  requestAnimationFrame(frame);
}
function start() { document.getElementById('title').hidden = true; document.getElementById('app').hidden = false; sim.reset(true); sim.started = true; views.sizeAll(); views.updateTarget(true); ui.setTab(ui.tab); ui.refreshAll(); }
const ack = document.getElementById('ack'), sb = document.getElementById('startBtn');
ack.addEventListener('change', () => { sb.disabled = !ack.checked; });
sb.addEventListener('click', () => { if (ack.checked) start(); });
requestAnimationFrame(frame);

// ---- stale-build check: when served over http(s) compare our build marker with the one on the server (cache-busting fetch, no-store) ----
const myBuild = (document.querySelector('meta[name=navitor-build]') || {}).content;
async function checkBuild() {
  if (!/^https?:/.test(location.protocol) || !myBuild) return;
  try {
    const r = await fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' }); const t = await r.text();
    const m = /<meta name="navitor-build" content="([^"]+)"/.exec(t);
    if (m && m[1] !== myBuild) { document.getElementById('updBanner').hidden = false; window.__latestBuild = m[1]; }
  } catch (e) { /* offline: ignore */ }
}
document.getElementById('updReload').addEventListener('click', () => { location.replace(location.pathname + '?v=' + (window.__latestBuild || Date.now())); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkBuild(); });
setTimeout(checkBuild, 1500);
window.__checkBuild = checkBuild;

// ---- test / debug hook ----
window.__sim = {
  sim, views, ui, world, THREE, errors,
  get state() { return sim.snapshot(); },
  setAngles(lao, cra) { sim.act.setCarm(lao, cra, true); },
  pause(p = true) { paused = p; },
  step(sec) { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) sim.update(1 / 30); device.update(sim, 1 / 30); },
  holdFor(inp, sec) { Object.assign(sim.input, inp); this.step(sec); for (const k in inp) sim.input[k] = 0; },
  hold(k, v) { sim.hold(k, v); },
  act: sim.act,
  render(t = 0.5) { device.update(sim, 0.016); views.frameUpdate(1); views.render(0.016, t); ui.refresh(); },
  snapView() { views.updateTarget(true); },
  setMode(m) { views.setMode(m); document.querySelectorAll('#segMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); },
  setLock(l) { views.setLock(l); },
  reset() { sim.reset(true); sim.started = true; ui.refreshAll(); },
  startNow() { start(); },
  viewInfo() { return sim.viewInfo(); },
};
