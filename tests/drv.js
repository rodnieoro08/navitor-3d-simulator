// Test driver (runs in the page, uses window.__sim only)
window.__drv = (() => {
  const S = () => __sim.sim;
  const dt = 1 / 30;
  const up = (n) => { for (let i = 0; i < n; i++) S().update(dt); };
  const autoFlex = (look = 8) => S().act.flexSet(S().path.flexReq(S().dev.s + look));
  const lm = () => S().lm;
  const goPhase1 = () => { const s = S(); s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.phase === 1 && g++ < 6000) { autoFlex(); s.update(dt); } s.input = {}; return s.phase; };
  const goDesc = () => { const s = S(); s.input = { adv: 1, fast: 1 }; let g = 0; while (s.dev.s < lm().descStart + 10 && g++ < 6000) { autoFlex(); s.update(dt); } s.input = {}; };
  const setRotation = () => { const s = S(); s.act.rotateStep(-s.rotErr2()); s.act.confirmRotation(); return s.phase; };
  const goArch = () => { const s = S(); s.input = { adv: 1 }; let g = 0; while (s.phase === 3 && g++ < 9000) { if (s.dev.s < lm().ascDone - 5) autoFlex(); else s.act.flexSet(0.1); s.update(dt); } s.input = {}; return s.phase; };
  const goCross = (z = 0.8) => { const s = S(); s.act.flexSet(0.15); s.input = { adv: 1 }; let g = 0; while (s.dev.s < lm().ann + 32 && g++ < 6000) s.update(dt); s.input = { adv: -1 }; while (s.sysZ() > z && g++ < 9000) s.update(dt); s.input = {}; };
  const alignAt = () => { const s = S(); s.act.setCarm(-30, -30); s.act.rotateStep(-s.alignErr()); s.act.confirmAlign(); up(3); return s.phase; };
  const press = () => { S().act.setPress(0.5); S().act.setWireTension(0.3); };
  const deployTo = (f, rate = 0.035) => { const s = S(); if (f >= 0.8 && f < 1) f += 0.02; s.input = { deploy: 1, deployFast: rate > 0.1 ? 1 : 0, deployMed: rate > 0.05 && rate <= 0.1 ? 1 : 0 }; let g = 0; while (s.dev.f < f - 1e-3 && !s.dev.locked && g++ < 9000) s.update(dt); s.input = {}; };
  const resheathTo = (f) => { const s = S(); s.input = { deploy: -1 }; let g = 0; while (s.dev.f > f && g++ < 9000) s.update(dt); s.input = {}; };
  const toLock = () => { deployTo(0.8); };
  const secondView = () => { S().act.setCarm(32, 30); S().act.confirmSecondView(); return S().chk.secondView; };
  const release = (pace = 'fast') => { const s = S(); s.act.unlock(); if (pace) s.act.setPacing(pace); s.input = { deploy: 1 }; let g = 0; while (s.phase === 7 && g++ < 9000) s.update(dt); s.input = {}; return s.phase; };
  // phase 8 (v12 order): wire fixed + advanced, centre the OPEN nosecone, withdraw the whole open system through the valve and the arch into the descending aorta,
  // close the nosecone there with the macro slide, then withdraw out the iliac.
  const withdrawOpen = () => { const s = S(); s.input = { adv: -1 }; let g = 0; while (s.phase === 8 && !s.descOk() && g++ < 20000) { autoFlex(-8); s.update(dt); if (s.fx) break; } s.input = {}; return s.descOk(); };
  const phase8 = () => { const s = S(); if (!s.wire.hold) s.act.toggleHold(); s.input = { wire: 1 }; let g = 0; while (s.wireAdv() < 0.6 && g++ < 400) s.update(dt); s.input = {}; s.act.flexSet(0.15);
    withdrawOpen();
    if (s.fx) return s.phase;
    s.input = { macro: 1 }; g = 0; while (s.dev.macro < 1 && g++ < 600) s.update(dt); s.input = {};
    s.input = { adv: -1 }; g = 0; while (s.phase === 8 && g++ < 20000) { autoFlex(-8); s.update(dt); if (s.fx) break; } s.input = {}; return s.phase; };
  const phase9 = () => { const s = S(); s.act.aortogram('root'); s.act.removeWire(); s.act.aortogram('iliac'); s.act.preclose(); s.act.preclose(); s.act.hemostasis(); return s.finished; };
  return { up, autoFlex, goPhase1, goDesc, setRotation, goArch, goCross, alignAt, press, deployTo, resheathTo, toLock, secondView, release, withdrawOpen, phase8, phase9 };
})();
