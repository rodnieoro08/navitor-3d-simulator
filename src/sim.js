// Case state machine + physics-ish model. Pure logic (no rendering).
import * as THREE from 'three';
import { clamp, lerp, smooth, wrap180, wrap60, mulberry32, beamDir, D2R, R2D, CASE } from './util.js';
import { DEV } from './device.js';
import { computeScore } from './scoring.js';
import * as PH from './physics.js';

const v_ph = (S) => S.v.ph;
export const PHASES = [
  { n: 1, name: 'Femoral entry', short: 'Entry' },
  { n: 2, name: 'Descending aorta: set rotation', short: 'Rotation' },
  { n: 3, name: 'Arch', short: 'Arch' },
  { n: 4, name: 'Cross and centre', short: 'Cross' },
  { n: 5, name: 'Cusp overlap: land the inflow', short: 'Land' },
  { n: 6, name: 'Stop at 80%', short: '80%' },
  { n: 7, name: 'Release', short: 'Release' },
  { n: 8, name: 'Nosecone out', short: 'Out' },
  { n: 9, name: 'Close', short: 'Close' },
];
export const COACH = {
  1: 'Over the 0.035 wire: hold the wire, advance with flex AND a slow twirl of the system and sheath together. Never force the calcified bend.',
  2: 'Descending aorta: rotate (< 60 deg, never against resistance) until 2 Vision markers sit on the OUTER curve and 1 on the INNER curve, then confirm. Rotation can be lost in the arch - you will re-check it at the annulus.',
  3: 'Arch: flex the capsule to follow the horizontal aorta and stay central on the wire. Do not ride the greater curve. Unflex once you are in the ascending aorta.',
  4: 'Cross the valve holding the wire, centre the shaft in the ascending aorta, put the inner-shaft marker on the annular plane, and re-check commissure alignment in the cusp-overlap view.',
  5: 'Cusp overlap, parallax gone: NCC alone on the left, pigtail at the NCC nadir. Watch only the NCC. Slow wheel, inflow first. Forward pressure on the system, a little pull on the wire. (Resheathing? The MICRO wheel is for fine recapture only.)',
  6: 'Lock engaged at 80%. Recapture still works (MICRO wheel = fine recapture only). Leave cusp overlap, apply the 3-cusp plan, kill parallax, read the LEFT cusp side (ignore the NCC), confirm both depths and the posts.',
  7: 'Unlock and finish the wheel slowly - speed after 80% still matters. Use the pacing the case card asks for. Leaflets open, cuff seals.',
  8: 'Fix the wire, advance it, centre the nosecone in the frame, close the tip with the MACRO slide (not the deployment or MICRO wheel), then withdraw across the arch and out the iliac holding the wire.',
  9: 'Completion aortogram (PVL, coronary fill, depth; the Inject contrast button counts once the valve is released), iliac/femoral angiogram, two preclose devices, then hemostasis. The case is not over at release.',
};
const FX_TEXT = {
  force: ['Capsule buckles at the calcified plaque; shaft bows back.', 'Do not force it. Flex to follow the bend and add a slow rotation, then advance.'],
  scrapePlaque: ['Capsule tip rides the plaque shelf; calcium shadow shifts.', 'You scraped the plaque. Match the flex to the bend before you reach the calcium.'],
  kink: ['Sharp kink in the sheath, shaft stops transmitting.', 'Too much flex in the iliacs kinks the sheath. Unflex a little and advance gently.'],
  wireLost: ['Wire tip drops out of the LV.', 'Never let the wire go. Hold it while the system moves. Re-cross and fix the wire.'],
  hardRot: ['Shaft winds up and the markers jump.', 'That is rotation against resistance. Stop, back off, rotate the short way (< 60 deg) and slowly.'],
  scrapeArch: ['System rides the greater curve of the arch; wire straightens.', 'Stay central on the wire. Flex earlier so the capsule follows the horizontal aorta.'],
  apex: ['Wire tip is jammed at the LV apex; ectopy on the monitor.', 'Hold the wire when you cross. Pull it back to a soft curve in the LV.'],
  frameCatch: ['Nosecone snags the valve frame; valve jolts.', 'Do not withdraw an open or off-centre nosecone. Advance the wire, centre the tip, close it with the macro slide.'],
  wirePulled: ['Wire comes back with the system; tip leaves the LV.', 'You pulled the wire with the system. Fix the wire, then withdraw.'],
  closure: ['The angiogram shows the access site is not sealed yet.', 'Hemostasis needs both preclose devices and a clean angiogram first.'],
};

export class Sim {
  constructor(F, P) {
    this.F = F; this.P = P; this.path = P.path; this.lm = P.lm;
    this.listeners = [];
    this.cfg = { finalFast: true, seed: CASE.seed };
    this.reset(false);
  }
  on(fn) { this.listeners.push(fn); }
  emit(ev, data) { for (const fn of this.listeners) fn(ev, data); }
  reset(started = this.started) {
    const lm = this.lm, path = this.path;
    this.rng = mulberry32(this.cfg.seed);
    const r1 = this.rng(), r2 = this.rng(), r3 = this.rng();
    this.started = started; this.time = 0; this.phase = 1; this.finished = false; this.score = null;
    this.carm = { lao: 0, cra: 0, tLao: 0, tCra: 0 };
    this.input = {};
    this.dev = { s: lm.skin + 4, sd: lm.skin + 4, lat: 0, flex: 0, roll: 0, drift: 0, f: 0, macro: 0, locked: false, lockArmed: true, released: false, valveS: null,
      h: 0, tilt: 0, bounce: 0, sealed: false, leafOpen: 0, twist: 0, shift: 0 };
    this.wire = { s: lm.ann + 58, hold: true, removed: false, tension: 0 };
    this.wireVer = 0;
    this.fx = null; this.fxPending = null;
    this.pacing = 'off'; this.press = 0.2; this.wtens = 0.0;
    this.rootDelta = 0;
    this.hidden = { note: '', noteT: 0 };
    this.note = ''; this.noteT = 0;
    this.drift = lerp(15, 40, r1) * (r2 > 0.5 ? 1 : -1); this.driftTotal = this.drift;
    this.roll2 = 38 * (r3 > 0.5 ? 1 : -1);
    this.tiltBase = 0.45 + 0.3 * r3;
    this.v = { ph: PH.createState(), tiltStab: 1, tiltLat: 0, sysFrozen: 0, biasFrozen: 0, extra: 0, tug: 0, tugT: 0, relExtra: 0, speed: 0, lastF: 0, stab: 0, bounceAmp: 0, touched: false, minF: 1, deepFlag: false, tugCount: 0, speedAt80: 0, maxSpeedPost80: 0, alignFrozen: null };
    this.pf = { scrapeM: 0, forceM: 0, kinkM: 0, hardM: 0, resist: 0 }; // meters
    this.p4Hint = false;
    this.chk = { crossed: false, centered: false, marker: false, alignOk: false, alignConfirmed: false, rot2: false, secondView: false, secondViewDepth: null };
    this.ev = []; // event log for scoring
    this.flags = { major80: false, rotSetDesc: false, rotErrDesc: null, alignAtConfirm: null, alignFinal: null, pacingEarly: false, pacingWrong: false, pacingLeftOn: false, partialDeepRecapture: 0, fullRecapture: 0, partialHighRecapture: 0, tugs: 0, wheelWrong: 0, nosecWheelTry: 0, macroWrong: 0, wireNotHeld: 0, preAngio: false, iliacAngioEnd: false, aortogram: false, wireRemoved: false, preclose: 0, hemostasis: false, closureFail: 0, stabLow: false, unlockAt: null, finalDepthNcc: null, finalDepthLcc: null, finalAlign: null, pvl: null, coronary: null, pacingUsed: 'off', releasedFast: false, phase8Closed: false, prematureFast: false };
    this.contrast = {}; // name -> {t,max,dur}
    this.setCoach();
    this.emit('reset');
  }
  // ---------- view info ----------
  viewInfo(lao = this.carm.lao, cra = this.carm.cra) {
    const F = this.F, b = beamDir(lao, cra);
    const nb = b.dot(F.n), err = Math.asin(clamp(Math.abs(nb), 0, 1)) * R2D;
    const inpl = b.clone().addScaledVector(F.n, -nb); const az = inpl.lengthSq() > 1e-8 ? F.azOf(inpl.normalize()) : 0;
    const az1 = F.azOf(F.b1), az2 = F.azOf(F.b2);
    const d1 = Math.abs(wrap180(az - az1)), d2 = Math.abs(wrap180(az - az2));
    return { err, az, d1, d2, open: Math.abs(nb), edgeOn: err <= 2.5, cuspOverlap: err <= 2.5 && d1 <= 8, threeCusp: err <= 2.5 && d2 <= 6, edgeLoose: err <= 3.5 };
  }
  alignErr() { return wrap60(this.dev.roll + this.dev.drift); }
  rotErr2() { return wrap60(this.dev.roll); }
  // ---------- helpers ----------
  setCoach() {
    let c = COACH[this.phase];
    if (this.phase === 6) c = this.chk.secondView ? 'Both sides and the posts are confirmed in the 3-cusp view. Now press UNLOCK (the orange button, the lock on the handle, or the U key), then turn the deployment wheel CLOCKWISE slowly to 100%.' : COACH[6] + ' When it is confirmed, press UNLOCK (U) to carry on. Passing 80% without this check is a MAJOR miss.';
    if (this.phase === 4 && this.p4Ready()) c = COACH[4] + ' Crossed, centred and on the plane: confirm the commissure alignment (recommended). You may also continue without it (press Skip alignment check, or just start the wheel): that is a scored miss on the alignment row.';
    if (this.phase === 5 && (this.flags.alignSkipped || this.flags.skipNoCross || this.flags.skipNoCentre || this.flags.skipNoMarker)) { const m = []; if (this.flags.alignSkipped) m.push('the alignment re-check at the annulus'); if (this.flags.skipNoCross) m.push('crossing the valve'); if (this.flags.skipNoCentre) m.push('centring the shaft'); if (this.flags.skipNoMarker) m.push('putting the marker on the annular plane'); c = COACH[5] + ' NOTE: you skipped ' + m.join(', ') + ' - scored as a miss.' + ((this.flags.skipNoCross || this.flags.skipNoCentre || this.flags.skipNoMarker) ? ' Unsheathing stays locked out until the valve is crossed, centred and the inner-shaft marker is on the annular plane (and the view is cusp overlap).' : ''); }
    if (this.phase === 7) c = 'Unlocked - past the point of no return. Finish slowly: turn the deployment wheel clockwise (or hold Deploy slow, or drag the slider) up to 100%. Rapid pacing for the final release only if the case card says so. Speed after 80% still matters.';
    this.coach = c;
  }
  say(t, secs = 5) { this.note = t; this.noteT = secs; this.emit('note', t); }
  log(type, detail = {}) { this.ev.push({ t: +this.time.toFixed(1), phase: this.phase, type, ...detail }); }
  setPhase(p) { if (p === this.phase) return; this.phase = p; this.setCoach(); this.log('phase', { to: p }); this.emit('phase', p); }
  sysZ() { return this.dev.s - DEV.noseL - this.lm.ann; }
  inRoot() { return this.dev.s > this.lm.ann - 60; }
  rootBlend() { return smooth(this.lm.ann - 70, this.lm.ann - 38, this.dev.s); }
  wireAdv() { return (this.wire.s - (this.lm.ann + 58)) / 25; }
  fail(type, o = {}) {
    if (this.fx) return;
    const [fluoro, coach] = FX_TEXT[type];
    this.fx = { type, t: 0, s: o.s ?? this.dev.s, fluoro, coach, retry: o.retry, tag: o.tag };
    this.log('fail', { fail: type, tag: o.tag, at: Math.round(this.dev.s) });
    this.say(coach, 8);
    this.emit('fail', this.fx);
  }
  // ---------- one-shot actions ----------
  act = {
    nudgeCarm: (dl, dc) => { this.carm.tLao = clamp(this.carm.tLao + dl, -60, 60); this.carm.tCra = clamp(this.carm.tCra + dc, -40, 40); },
    setCarm: (lao, cra, snap = true) => { this.carm.tLao = clamp(lao, -60, 60); this.carm.tCra = clamp(cra, -40, 40); if (snap) { this.carm.lao = this.carm.tLao; this.carm.cra = this.carm.tCra; } },
    rotateStep: (deg) => { this.rotate(deg); },
    microStep: (mm) => this.micro(mm), // negative = fine recapture
    flexSet: (x) => { if (!this.fx) this.dev.flex = clamp(x, 0, 1); },
    wheel: (df) => this.wheel(df),
    wheelMm: (mm) => this.wheel(PH.fractionFromMm(mm)), // capsule retraction in mm (+ deploy)
    wheelTurns: (t) => this.wheel(PH.fractionFromMm(PH.mmFromTurns(t))), // wheel turns (clockwise +)
    // tap-to-step: the capsule glides to (target + mm) at the safe wheel speed through wheel(), so the lock, phase gates and speed rules all apply
    stepMm: (mm) => { const I = this.input; const base = I.sliderTarget != null ? I.sliderTarget : this.dev.f; this.flags.tapSteps = (this.flags.tapSteps || 0) + 1; I.sliderTarget = clamp(base + PH.fractionFromMm(mm), 0, 1); this.stepExact = true; },
    unlock: () => this.unlock(),
    lockToggle: () => { if (this.dev.locked) this.unlock(); else this.say('The deployment lock engages by itself at 80%.'); },
    toggleHold: () => { this.wire.hold = !this.wire.hold; this.say(this.wire.hold ? 'Wire fixed - good.' : 'Wire is free: it will travel with the system.', 3); },
    setHold: (v) => { this.wire.hold = !!v; },
    setPacing: (m) => this.setPacing(m),
    setPress: (x) => { this.press = clamp(x, 0, 1); },
    setWireTension: (x) => { this.wtens = clamp(x, 0, 1); },
    tug: () => this.tug(),
    confirmRotation: () => this.confirmRotation(),
    confirmAlign: () => this.confirmAlign(),
    skipAlign: () => this.proceedToLanding(),
    confirmSecondView: () => this.confirmSecondView(),
    macroTry: () => this.macroTry(),
    aortogram: (where) => this.aortogram(where),
    inject: () => this.inject(),
    removeWire: () => this.removeWire(),
    preclose: () => this.preclose(),
    hemostasis: () => this.hemostasis(),
    setCard: (o) => { Object.assign(this.cfg, o); this.say('Case card updated.', 2); },
  };
  rotate(deg) { // discrete rotation (used by tests and key taps)
    if (this.fx) return; const dt = 0.05; const rate = deg / dt; this.rotRate = 25; this.applyRotation(rate, dt, true); this.rotRate = 0; this.dev.twist *= 0.5;
  }
  // MICRO wheel: fine control for RECAPTURE only (resheathing inside the white, recapturable zone).
  // mm < 0 = fine resheath (capsule moves forward over the valve); mm > 0 only walks back toward where the recapture started.
  // It never deploys the valve forward, never closes the nosecone and never moves the whole system.
  micro(mm) {
    if (!mm || this.fx) return false;
    const d = this.dev, v = this.v, ph = this.phase;
    const refuse = (t) => { this.flags.microWrong = (this.flags.microWrong || 0) + 1; this.say(t, 5); return false; };
    if (ph === 8) return refuse('Micro wheel is for fine recapture only. It never closes the nosecone - use the MACRO slide.');
    if (ph === 7 || d.released) return refuse('Micro wheel is for fine recapture only, and you are past the lock: no recapture now. Finish with the deployment wheel.');
    if (ph < 5 || ph > 6) return refuse('Micro wheel is for fine recapture only - it works while resheathing the valve before the 80% lock.');
    if (d.f <= 0.02) return refuse('Micro wheel is for fine recapture only. Nothing to recapture yet - deploy first with the deployment wheel.');
    if (mm < 0) { // fine resheath (also from the 80% lock, which is still recapturable)
      const ok = this.wheel(-PH.fractionFromMm(-mm));
      if (ok) this.say('Micro wheel: fine recapture. Resistance builds toward the lock - watch the feel gauge.', 3);
      return ok;
    }
    // + : only undo part of a fine recapture, never beyond the point where the recapture began
    const cap = Math.min(v.recapFrom ?? 0, 0.79);
    if (!v.resheathing || d.f >= cap - 1e-6) return refuse('Micro wheel is for fine recapture only: it cannot deploy the valve. Use the deployment wheel (slowly) to go forward.');
    d.f = Math.min(cap, d.f + PH.fractionFromMm(mm));
    return true;
  }
  setPacing(m) {
    const prev = this.pacing; this.pacing = m;
    if (m === 'off') return;
    this.flags.pacingUsed = m;
    if (this.phase < 5 || (this.phase === 5 && this.dev.f < 0.2 && !this.v.touched)) { this.flags.pacingEarly = true; this.log('pacingEarly'); this.say('Pacing before the valve touches is not needed - default is off until it touches.', 5); }
    if (m === 'fast') {
      const finalOk = this.cfg.finalFast && this.phase === 7;
      if (!finalOk) { this.flags.pacingWrong = true; this.log('pacingFastEarly'); this.say(this.cfg.finalFast ? 'Rapid pacing is for the final release only.' : 'The case card does not call for rapid pacing.', 5); }
    }
  }
  tug() {
    if (this.fx || this.phase < 5 || this.phase > 6) { this.say('A wire tug only helps a partly deployed, high valve.', 3); return; }
    const v = this.v, f = this.dev.f;
    this.flags.tugs++;
    if (f > 0.05 && f <= 0.66) { v.tugT = Math.min(v.tugT + 1.2, 3.6); v.tugCount++; this.say('Gentle tug - let the valve descend.', 3); this.log('tug', { f: +f.toFixed(2) }); }
    else if (f > 0.66) { this.say('The valve is anchored - a tug now does nothing useful. Recapture partially first.', 4); this.log('tugAnchored'); this.flags.wireNotHeld += 0; }
    else this.say('Nothing to tug yet - the valve is still in the capsule.', 3);
  }
  wheel(df) { // df = change of deployment fraction requested by the wheel (+ deploy, - resheath)
    if (this.fx || !df) return false;
    const d = this.dev, v = this.v;
    if (this.phase === 4 && df > 0 && this.p4Ready()) { this.proceedToLanding(); }
    if (this.phase < 5) { this.say('Not yet: unsheathing is only allowed in phases 5-7.', 3); this.flags.wheelWrong++; return false; }
    if (this.phase === 8 || this.phase === 9) { this.flags.nosecWheelTry++; this.say('The deployment wheel never recaptures the nosecone. Use the macro slide to close the tip.', 5); this.log('wheelForNose'); return false; }
    if (df > 0) {
      if (v.resheathing && d.f > v.minF + 0.004) {
        if (v.deepAtResheath) { if (v.minF > 0.06) { this.flags.partialDeepRecapture++; this.log('partialDeepRecapture', { minF: +v.minF.toFixed(2) }); this.say('Wrong lesson: a deep valve needs a FULL recapture and a new approach, not a partial one.', 9); } else { this.flags.fullRecapture++; this.log('fullRecapture'); } }
        else if (v.minF > 0.05) { this.flags.partialHighRecapture++; this.log('partialRecapture', { minF: +v.minF.toFixed(2) }); }
        v.resheathing = false; v.deepAtResheath = false;
      }
      if (d.locked) { this.say(this.chk.secondView ? 'The 80% lock is still engaged. Press UNLOCK (button or U key), then continue the wheel.' : 'The 80% lock is engaged. Do the 3-cusp second-view check (Confirm button), then press UNLOCK (U). Unlocking without the check is a MAJOR miss.', 6); return false; }
      if (d.f <= 0.02) { // starting
        const vi = this.viewInfo();
        if (!vi.cuspOverlap) { this.say('Kill parallax first, in the cusp-overlap view (NCC alone on the left).', 4); return false; }
        if (this.sysZ() < -2.6) { this.say('The valve is not across the annulus yet: advance over the wire until the inner-shaft marker is on the annular plane, then unsheathe.', 5); return false; }
        if (Math.abs(this.sysZ()) > 2.6 || Math.abs(d.lat) > 2.6) { this.say('Re-centre the shaft and put the inner-shaft marker back on the annular plane before unsheathing.', 4); return false; }
        if (!this.wire.hold) { this.say('Fix the wire first.', 3); return false; }
        if (!v.alignFrozen) v.alignFrozen = null;
      }
      const nf = d.f + df;
      if (nf >= 0.8 && d.lockArmed && !d.released) { d.f = 0.8; d.locked = true; d.lockArmed = false; this.flags.stabAt80 = this.v.stab; this.say('Deployment lock engaged at 80%. Recapture still works.', 4); this.log('lockEngaged'); if (this.phase === 5) { this.chk.secondView = false; this.setPhase(6); } }
      else d.f = Math.min(1, nf);
    } else {
      if (d.f > 0.8 + 1e-6) { this.say('Past the point of no return (gray zone) - the valve cannot be recaptured.', 4); return false; }
      if (d.released) return false;
      // resheath
      if (d.f > 0.02 && !v.resheathing) { v.resheathing = true; v.recapFrom = d.f; v.deepAtResheath = this.depthNow() > 4.6; v.minF = d.f; this.flags.recapAttempts = (this.flags.recapAttempts || 0) + 1; }
      d.f = Math.max(0, d.f + df); v.minF = Math.min(v.minF, d.f);
      if (d.locked) { d.locked = false; d.lockArmed = true; this.setCoach(); }
      if (d.f < 0.74) d.lockArmed = true; // hysteresis: a small backwards wobble after Unlock must not re-engage the lock
    }
    return true;
  }
  unlock() {
    const d = this.dev;
    if (this.fx) { this.say('Wait for the fluoro problem to clear, then press Unlock again.', 3); return; }
    if (!d.locked) { this.say(d.released ? 'Already released.' : d.f > 0.8 ? 'Already unlocked - keep turning the wheel clockwise slowly to 100%.' : 'Nothing to unlock yet: the lock engages by itself at 80% of the wheel.', 4); return; }
    d.locked = false; d.lockArmed = false;
    this.flags.unlockAt = this.time;
    if (!this.chk.secondView) {
      this.flags.major80 = true; this.log('major80');
      this.emit('major', {});
    }
    if (this.phase === 6) this.setPhase(7);
    this.setCoach();
    this.say(this.chk.secondView ? 'Unlocked. Turn the wheel clockwise slowly to 100%.' : 'MAJOR: you passed 80% without the 3-cusp second-view check. It is scored. Finish the wheel slowly.', 6);
  }
  depthNow() { return this.dev.h; }
  confirmRotation() {
    if (this.phase !== 2) { this.say('Rotation is set in the descending aorta (phase 2).', 3); return; }
    const lm = this.lm;
    if (this.dev.s < lm.descStart) { this.say('Advance into the descending aorta first, then set rotation.', 4); return; }
    const e = this.rotErr2();
    if (Math.abs(e) > 15) { this.say(`Not yet: 2 markers outer / 1 inner. You are ${Math.abs(Math.round(e))} deg off - rotate slowly the short way.`, 5); this.log('rotNotYet', { err: Math.round(e) }); return; }
    this.chk.rot2 = true; this.flags.rotSetDesc = true; this.flags.rotErrDesc = Math.abs(e);
    this.log('rotConfirmed', { err: +e.toFixed(1) });
    this.say('Rotation set before the arch. It can drift in the arch - re-check it at the annulus.', 6);
    this.setPhase(3);
  }
  p4Ready() { const c = this.chk; return c.crossed && c.centered && c.marker; }
  // Phase 4 -> 5 on the "Skip alignment check" button: ALWAYS proceeds (even if nothing else in phase 4 is satisfied). Whatever was skipped is
  // recorded as a scored miss (alignment, crossing, centring, marker on the plane) and explained by a coach line. Phase 5 keeps its own gates.
  proceedToLanding() {
    if (this.phase !== 4) { this.say('Nothing to skip: this continues from phase 4 (cross and centre) to the landing.', 3); return false; }
    const c = this.chk, F = this.flags, miss = [], fix = [];
    if (!c.alignConfirmed) { F.alignSkipped = true; miss.push('the commissural alignment was not re-checked at the annulus'); }
    if (!c.crossed) { F.skipNoCross = true; miss.push('the valve was not crossed'); fix.push('advance over the wire until the inner-shaft marker is on the annular plane'); }
    else {
      if (!c.centered) { F.skipNoCentre = true; miss.push('the shaft was not centred'); fix.push('re-centre the shaft in the ascending aorta'); }
      if (!c.marker) { F.skipNoMarker = true; miss.push('the inner-shaft marker was not on the annular plane'); fix.push('put the inner-shaft marker back on the annular plane'); }
    }
    this.log('phase4Skipped', { align: !c.alignConfirmed, crossed: !!c.crossed, centred: !!c.centered, marker: !!c.marker });
    this.setPhase(5);
    const list = miss.length ? miss.join('; ') : 'nothing was missed';
    this.say(`Skipped to the landing: ${list} - scored as a miss.` + (fix.length ? ` Before you unsheathe, ${fix.join(', and ')}; the wheel stays locked out until then.` : ' Continuing to the landing.'), 10);
    return true;
  }
  confirmAlign() {
    if (this.phase !== 4) { this.say('Commissure alignment is re-checked at the annulus in phase 4.', 3); return; }
    if (!this.chk.crossed) { this.say('Cross the valve first.', 3); return; }
    const vi = this.viewInfo(); if (!vi.cuspOverlap) { this.say('Check alignment in the cusp-overlap view with parallax gone.', 4); return; }
    const e = this.alignErr();
    if (Math.abs(e) > 30) { this.say(`Posts are ${Math.abs(Math.round(e))} deg off the native commissures. Rotate until ONE post is isolated on the right and the other two overlap on the left.`, 6); this.log('alignNotYet', { err: Math.round(e) }); return; }
    this.chk.alignConfirmed = true; this.flags.alignAtConfirm = e; this.log('alignConfirmed', { err: +e.toFixed(1) });
    this.say('Alignment confirmed at the annulus.', 3);
  }
  confirmSecondView() {
    if (this.phase !== 6) { this.say('The second-view check is made at the 80% stop.', 3); return; }
    const vi = this.viewInfo();
    if (!vi.threeCusp) { this.say(vi.edgeOn ? 'Right plane, wrong azimuth: you need the 3-cusp view (three cusps separated, posts I-I-I), not cusp overlap.' : 'Kill parallax in the 3-cusp view first: annulus must be a horizontal line.', 5); return; }
    const d = this.dev, ncc = d.h, lcc = d.h - d.tilt;
    const bad = [];
    if (lcc < 3) bad.push('the left cusp side is HIGH'); if (ncc < 3) bad.push('the NCC side is HIGH');
    if (ncc > 4.5) bad.push('the NCC side is DEEP'); if (lcc > 4.5) bad.push('the left cusp side is DEEP');
    if (Math.abs(this.alignErr()) > 30) bad.push('the posts are not on the commissures');
    if (bad.length) {
      const deep = ncc > 4.5 || lcc > 4.5;
      this.say(`Not acceptable: ${bad.join(' and ')}. ${deep ? 'Deep: full recapture and a new approach.' : 'High: partial recapture, gentle wire tug, let it descend, then continue.'}`, 9);
      this.log('secondViewRejected', { ncc: +ncc.toFixed(1), lcc: +lcc.toFixed(1) }); this.flags.secondViewRejects = (this.flags.secondViewRejects || 0) + 1; return;
    }
    this.chk.secondView = true; this.setCoach(); this.chk.secondViewDepth = { ncc, lcc }; this.log('secondViewConfirmed', { ncc: +ncc.toFixed(1), lcc: +lcc.toFixed(1) });
    this.say('Both sides and commissures confirmed in the 3-cusp view. You may unlock.', 6);
  }
  macroTry() { // used by the on-screen button as a one-shot (hold is via input.macro)
    if (this.dev.f < 1) { this.flags.macroWrong++; this.say('Macro slide closes the nosecone ONLY after the valve is released.', 4); }
  }
  aortogram(where) {
    if (this.fx) return;
    const lm = this.lm;
    if (where === 'iliac') {
      if (this.phase === 1 || this.phase === 8) { this.contrast.iliac = { t: 0, dur: 7 }; this.flags.preAngio = this.flags.preAngio || this.phase === 1; this.say('Iliac angiogram: the path and the calcified bend.', 4); return; }
      if (this.phase === 9) {
        if (!this.flags.wireRemoved) { this.say('Remove the wire and pigtail first, then do the iliac/femoral angiogram.', 4); return; }
        this.contrast.iliac = { t: 0, dur: 7 }; this.flags.iliacAngioEnd = true; this.log('iliacAngio'); this.say('Iliac/femoral angiogram: no extravasation, access patent.', 5); return;
      }
      this.say('Iliac angiogram is available at entry and at the end.', 3); return;
    }
    if (this.phase === 9 || (this.phase === 8 && this.dev.released)) { if (this.wire.removed) { this.say('The pigtail is out - the aortogram was done before removal. Do the iliac/femoral angiogram.', 4); return; } this.recordAortogram(7); return; }
    this.say('Aortogram: use the completion aortogram in phase 9. During the case, read depth against the Vision markers and the pigtail.', 5);
  }
  leak() { // what the completion aortogram shows (only meaningful after release)
    const h = this.flags.finalDepthNcc, hl = this.flags.finalDepthLcc, mn = Math.min(h, hl);
    let pvl = 'trace'; if (mn < 3) pvl = mn < 2 ? 'moderate' : 'mild'; else if (mn <= 4.5 && Math.abs(this.flags.finalAlign || 0) > 30) pvl = 'mild';
    const a = Math.abs(this.flags.finalAlign || 0);
    const coronary = a <= 15 ? 'both coronaries fill promptly' : a <= 30 ? 'coronaries fill; posts sit close to the ostia (access will be awkward)' : 'coronary fill delayed - a post sits over an ostium';
    return { h, hl, mn, pvl, a, coronary };
  }
  recordAortogram(dur = 7) { // completion aortogram: records PVL, coronary fill and depth for the review
    const L = this.leak(); this.flags.aortogram = true; this.flags.pvl = L.pvl; this.flags.coronary = L.coronary;
    this.contrast.root = { t: 0, dur };
    this.contrast.pvlJet = { t: 0, dur, amt: L.pvl === 'moderate' ? 1 : L.pvl === 'mild' ? 0.55 : 0.15 };
    this.contrast.lv = { t: 0, dur, amt: L.pvl === 'moderate' ? 1 : L.pvl === 'mild' ? 0.55 : 0.12 };
    this.contrast.cor = { t: 0, dur, amt: L.a <= 30 ? 1 : 0.35 };
    this.log('aortogram', { pvl: L.pvl, depth: +L.mn.toFixed(1) });
    this.say(`Aortogram: PVL ${L.pvl}; ${L.coronary}; inflow ${Math.max(L.h, L.hl).toFixed(1)}/${Math.min(L.h, L.hl).toFixed(1)} mm below the annulus.`, 12);
  }
  inject() { // "Inject contrast (pigtail)": a short puff from the pigtail in the NCC, phases 4-9. Never changes the score rows.
    if (this.fx) { this.say('Wait for the fluoro problem to clear, then inject again.', 3); return; }
    if (this.phase < 4) { this.say('The pigtail is not in the NCC yet (it is from phase 4). Use the iliac angiogram for the access path.', 4); return; }
    if (this.wire.removed) { this.say('The pigtail is out. Do the iliac/femoral angiogram now.', 4); return; }
    this.flags.injections = (this.flags.injections || 0) + 1; this.log('inject');
    if (this.dev.released && this.flags.finalDepthNcc != null) { // after release: shows the leak, coronary fill and depth; also satisfies the completion aortogram
      this.recordAortogram(5); return;
    }
    this.contrast.root = { t: 0, dur: 5 }; this.contrast.cor = { t: 0, dur: 5, amt: 1 };
    this.say('Contrast from the pigtail: root, sinuses, ostia and ascending aorta at this C-arm angle. Any leak only shows after release.', 5);
  }
  removeWire() {
    if (this.phase !== 9) return;
    if (!this.flags.aortogram) { this.say('Do the completion aortogram before you remove the wire and pigtail.', 4); return; }
    this.wire.removed = true; this.flags.wireRemoved = true; this.wireVer++; this.log('wireRemoved'); this.say('Wire and pigtail out.', 3);
  }
  preclose() {
    if (this.phase !== 9) return;
    if (!this.flags.wireRemoved) { this.say('Remove the wire and pigtail first.', 3); return; }
    if (this.flags.preclose >= 2) { this.say('Two preclose devices are already deployed.', 3); return; }
    this.flags.preclose++; this.log('preclose', { n: this.flags.preclose }); this.say(`Preclose device ${this.flags.preclose} of 2 set.`, 3);
  }
  hemostasis() {
    if (this.phase !== 9) return;
    if (!this.flags.wireRemoved) { this.say('Remove the wire and pigtail first.', 3); return; }
    if (this.flags.preclose < 2 || !this.flags.iliacAngioEnd) {
      this.flags.closureFail++; this.fail('closure', { retry: () => { } , tag: 'closure' }); return;
    }
    this.flags.hemostasis = true; this.log('hemostasis'); this.finish();
  }
  finish() {
    this.finished = true; this.score = computeScore(this); this.emit('score', this.score);
  }
  // ---------- held inputs ----------
  hold(name, val) { this.input[name] = val; }
  // ---------- core motion ----------
  maxS() {
    const lm = this.lm, ph = this.phase;
    let m = 1e9;
    if (ph === 1) m = lm.bif + 60;
    if (ph === 2) m = this.chk.rot2 ? 1e9 : lm.archStart - 25;
    if (ph === 3) m = lm.ascDone + 12;
    if (!this.wire.removed && this.wire.hold) m = Math.min(m, this.wire.s - 14);
    return m;
  }
  moveS(ds, dt) {
    const d = this.dev, lm = this.lm, ph = this.phase;
    if (!ds || this.fx) return;
    if (ph >= 5 && ph <= 7 && d.f > 0.55) return;
    if (ph === 9) return;
    if (ph === 8 && d.macro > 0 && d.macro < 1 && ds < 0) { this.say('Finish closing the nosecone first.', 3); return; }
    let ns = d.s + ds;
    const mx = this.maxS();
    if (ns > mx) {
      if (d.s < mx || !this.barrierNote) { this.barrierNote = true; this.say(ph === 2 ? 'Set and confirm rotation BEFORE the arch.' : ph === 3 ? 'Unflex before you go any further - you are in the ascending aorta.' : ph === 1 ? 'Entry complete.' : 'The nosecone cannot go past the wire tip.', 4); }
      ns = Math.max(d.s, mx);
    } else this.barrierNote = false;
    if (ph === 8 && ds < 0) { // frame catch check at the inflow plane
      const vs = d.valveS;
      if (d.s > vs - 0.0 && ns <= vs) {
        if (d.macro < 0.97 || Math.abs(d.lat) > 2.5) {
          this.flags.frameCatch = (this.flags.frameCatch || 0) + 1;
          this.fail('frameCatch', { s: vs, tag: 'frame', retry: () => { d.s = vs + DEV.noseL + 8; d.macro = 0; } });
          return;
        }
      }
    }
    if (!this.wire.hold) this.wire.s += (ns - d.s), this.wireVer++;
    d.s = ns;
    this.checkWire();
  }
  checkWire() {
    const w = this.wire, lm = this.lm; if (w.removed) return;
    if (w.s >= lm.ann + 84) { this.flags.wireApex = (this.flags.wireApex || 0) + 1; this.fail('apex', { tag: 'wire', retry: () => { w.s = lm.ann + 58; this.wireVer++; } }); }
    else if (w.s < lm.ann + 20 && this.phase >= 1 && this.phase !== 9) {
      if (this.phase === 8) { this.flags.wirePulled = (this.flags.wirePulled || 0) + 1; this.fail('wirePulled', { tag: 'wire', retry: () => { w.s = lm.ann + 58; this.wireVer++; } }); }
      else { this.flags.wireLostN = (this.flags.wireLostN || 0) + 1; this.fail('wireLost', { tag: 'wire', retry: () => { w.s = lm.ann + 58; this.wireVer++; this.dev.s = Math.min(this.dev.s, Math.max(lm.skin + 4, this.dev.s - 60)); } }); }
    }
  }
  applyRotation(rate, dt, discrete = false) { // rate deg/s
    const d = this.dev, ph = this.phase;
    if (!rate || this.fx) return;
    if (ph >= 5 && d.f > 0.1 && ph < 8) { this.say('Valve is engaged - rotation is locked now.', 3); return; }
    if (ph === 9) return;
    d.roll += rate * dt;
    const windPhase = ph === 2 || ph === 4;
    if (windPhase) {
      d.twist += rate * dt * (!discrete && Math.abs(rate) > 60 ? 2 : 1);
      if (Math.abs(d.twist) > 255 && Math.sign(d.twist) === Math.sign(rate)) {
        this.flags.hardRot = (this.flags.hardRot || 0) + 1;
        this.fail('hardRot', { tag: 'rot', retry: () => { d.twist = 0; d.roll -= Math.sign(rate) * 40; } });
      }
    }
  }
  inIliac() { return this.dev.s < this.lm.bif + 40; }
  zoneCheck(moving, dt) {
    const d = this.dev, lm = this.lm, path = this.path, ph = this.phase;
    const s = d.s, I = this.input;
    const req = path.flexReq(s);
    const reqEff = s > lm.ann - 50 ? 0.15 * this.rootBlend() + req * (1 - this.rootBlend()) : req;
    let lat = (reqEff - d.flex) * 14;
    if (ph === 8 && d.f >= 1 && s > lm.ann - 10) lat *= (1 - 0.6 * clamp(this.wireAdv(), 0, 1));
    d.lat = lat;
    this.reqFlex = reqEff;
    // resistance feel
    let R = 0.25 + 0.25 * req;
    const inPlaque = Math.abs(s - lm.plaque) < 30;
    const rotating = Math.abs(this.rotRate || 0) >= 6 && Math.abs(this.rotRate || 0) <= 50;
    const flexOk = Math.abs(d.flex - req) < 0.26;
    if (inPlaque) { R = (ph === 8 ? 1.0 : 1.5) * (rotating ? 0.62 : 1) * (flexOk ? 0.62 : 1) * (I.fast ? 1.5 : 1); }
    this.pf.resist = R;
    if (!moving) { this.pf.scrapeM = Math.max(0, this.pf.scrapeM - dt * 0.6); this.pf.forceM = Math.max(0, this.pf.forceM - dt * 0.6); this.pf.kinkM = Math.max(0, this.pf.kinkM - dt); return; }
    const iliac = this.inIliac();
    // under-flex scrape (greater curve / plaque)
    const eU = req - d.flex;
    if (inPlaque && Math.abs(d.flex - req) > 0.45) { this.pf.scrapeM += dt * 1.8; }
    else if (eU > 0.3 && s > lm.cfa + 40) { this.pf.scrapeM += (eU - 0.3) * 3 * dt; }
    else this.pf.scrapeM = Math.max(0, this.pf.scrapeM - dt * 0.7);
    if (this.pf.scrapeM >= 1) {
      this.pf.scrapeM = 0;
      if (inPlaque) { this.flags.scrapePlaque = (this.flags.scrapePlaque || 0) + 1; this.flags.iliacEvents = (this.flags.iliacEvents || 0) + 1; this.fail('scrapePlaque', { tag: 'iliac', retry: () => this.retreat(60) }); }
      else if (iliac) { this.flags.iliacEvents = (this.flags.iliacEvents || 0) + 1; this.fail('scrapePlaque', { tag: 'iliac', retry: () => this.retreat(50) }); }
      else { this.flags.archScrape = (this.flags.archScrape || 0) + 1; this.fail('scrapeArch', { tag: 'arch', retry: () => this.retreat(60) }); }
      return;
    }
    // force through calcium
    if (inPlaque && R > 0.8 && Math.abs(d.flex - req) <= 0.45) { this.pf.forceM += (R - 0.8) * 1.0 * dt * (I.fast ? 2 : 1); }
    else this.pf.forceM = Math.max(0, this.pf.forceM - dt * 0.6);
    if (this.pf.forceM >= 1) { this.pf.forceM = 0; this.flags.forceEvents = (this.flags.forceEvents || 0) + 1; this.flags.iliacEvents = (this.flags.iliacEvents || 0) + 1; this.fail('force', { tag: 'iliac', retry: () => this.retreat(60) }); return; }
    // kink
    if (d.flex > 0.93 || (iliac && d.flex - req > 0.6)) this.pf.kinkM += dt * 1.4; else this.pf.kinkM = Math.max(0, this.pf.kinkM - dt);
    if (this.pf.kinkM >= 1) { this.pf.kinkM = 0; this.flags.kinkEvents = (this.flags.kinkEvents || 0) + 1; if (iliac) this.flags.iliacEvents = (this.flags.iliacEvents || 0) + 1; this.fail('kink', { tag: iliac ? 'iliac' : 'arch', retry: () => { d.flex = Math.max(0, req - 0.1); this.retreat(40); } }); }
  }
  retreat(mm) { // back off against the direction of travel
    const d = this.dev, lm = this.lm;
    if (this.phase === 8) { d.s = Math.min(d.s + mm, lm.ann + 60); } else d.s = Math.max(lm.skin + 2, d.s - mm);
    d.flex = clamp(this.path.flexReq(d.s), 0, 1) * 0.9;
  }
  // ---------- per-frame update ----------
  update(dt) {
    if (!this.started) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const c = this.carm, d = this.dev, lm = this.lm, I = this.input, v = this.v;
    // C-arm easing (12 deg/s)
    { const sp = 18 * dt; c.lao += clamp(c.tLao - c.lao, -sp, sp); c.cra += clamp(c.tCra - c.cra, -sp, sp); }
    if (this.noteT > 0) { this.noteT -= dt; if (this.noteT <= 0) this.note = ''; }
    // contrast timers
    for (const k in this.contrast) { const q = this.contrast[k]; q.t += dt; if (q.t > q.dur) delete this.contrast[k]; }
    if (this.fx) {
      this.fx.t += dt;
      if (this.fx.t > 2.1) { const fx = this.fx; this.fx = null; if (fx.retry) fx.retry(); this.log('retry', { fail: fx.type }); this.say(`Retry - ${fx.coach}`, 7); this.emit('retry', fx); }
      this.updateValve(dt); return;
    }
    if (this.finished) { this.updateValve(dt); return; }
    // translation
    let speed = 0;
    const root = this.phase >= 4 && this.phase <= 7 || (this.phase === 8 && d.s > lm.ann - 60);
    const base = root ? (I.fast ? 24 : 9) : (I.fast ? 75 : 28);
    if (I.adv) speed = I.adv * base;
    let rot = 0;
    if (I.rot) rot = I.rot * (I.rotFast ? 90 : 25);
    if (I.twirl && I.adv) rot = (this.phase === 8 ? -1 : 1) * 25;
    this.rotRate = rot;
    if (I.microHold) this.micro(I.microHold * 1.8 * dt);
    // flex
    if (I.flex) d.flex = clamp(d.flex + I.flex * 0.6 * dt, 0, 1);
    // wire
    if (I.wire && !this.wire.removed && this.phase !== 9) { this.wire.s += I.wire * 14 * dt; this.wireVer++; this.checkWire(); if (this.fx) return; }
    this.moveS(speed * dt, dt);
    if (this.fx) return;
    this.applyRotation(rot, dt);
    if (this.fx) return;
    // twist relaxation
    if (!rot) d.twist = Math.abs(d.twist) < 20 * dt ? 0 : d.twist - Math.sign(d.twist) * 20 * dt;
    this.zoneCheck(speed !== 0, dt);
    if (this.fx) return;
    // drift of rotation in the arch
    d.drift = this.driftTotal * smooth(lm.archStart + 30, lm.ascTop + 60, d.s);
    // deployment / macro held inputs
    if (I.deploy) { const rate = I.deployFast ? 0.2 : (I.deployMed ? 0.07 : 0.035); this.wheel(I.deploy * rate * dt); }
    if (I.sliderTarget != null) { const tg = I.sliderTarget >= 0.995 ? 1 : I.sliderTarget <= 0.005 ? 0 : I.sliderTarget; const diff = tg - d.f; if (Math.abs(diff) < (tg === 1 || tg === 0 || this.stepExact ? 1e-6 : 0.004)) { I.sliderTarget = null; this.stepExact = false; } else if (!this.wheel(clamp(diff, -0.035 * dt, 0.035 * dt))) { I.sliderTarget = null; this.stepExact = false; } }
    if (I.macro) this.macroStep(dt);
    // wire tension (phase 5-6) and pressure are just state
    this.updateValve(dt);
    this.phaseLogic(dt);
  }
  macroStep(dt) {
    const d = this.dev;
    if (this.phase !== 8 || d.f < 1) { if (!this.macroMsg || this.time - this.macroMsg > 2) { this.macroMsg = this.time; this.flags.macroWrong++; this.say('Macro slide is only for closing the nosecone after release.', 4); } return; }
    if (d.macro >= 1) return;
    d.macro = Math.min(1, d.macro + 0.33 * dt);
    if (d.macro >= 1) { this.flags.phase8Closed = true; this.say('Nosecone closed against the capsule. Check the wire is fixed, then withdraw.', 5); }
  }
  updateValve(dt) {
    const d = this.dev, v = this.v, lm = this.lm, ph = this.phase;
    const f = d.f;
    // speed of the wheel (smoothed df/dt)
    const inst = (f - v.lastF) / Math.max(dt, 1e-4); v.lastF = f; v.speed = lerp(v.speed, inst, clamp(dt * 5, 0, 1));
    const sysLive = this.sysZ();
    if (!d.released) {
      if (f < 0.55) v.sysFrozen = sysLive;
      if (f < 0.75) v.biasFrozen = PH.biasMm(this.press, this.wtens, this.cfg.wireStiffness ?? PH.CONSTANTS.wireStiffness);
      // speed bookkeeping (uncontrolled migration itself is in physics.js)
      if (v.speed > 0 && f > 0.05 && f > 0.8) v.maxSpeedPost80 = Math.max(v.maxSpeedPost80, v.speed);
      if (f < 0.03) { v.extra = 0; v.tug = 0; v.tugT = 0; v.relExtra = 0; }
      v.tug = Math.min(v.tugT, v.tug + 1.4 * dt);
      const stabOK = (this.wire.hold ? 1 : 0.3);
      v.stab = clamp(1 - 1.2 * Math.abs(this.press - 0.5) - 1.2 * Math.abs(this.wtens - 0.3), 0, 1) * stabOK;
      if (f < 0.55) { v.tiltStab = v.stab; v.tiltLat = d.lat; }
      // physics: capsule retraction (mm), progressive frame, foreshortening, seating with stick-slip on each side
      const phc = this.physCtx(dt, sysLive);
      const out = PH.step(v.ph, phc, dt);
      d.h = out.xN; d.tilt = out.xN - out.xL;
      if (f < 0.05) { d.h = sysLive; d.tilt = 0; }
      v.extra = v.ph.extra; v.relExtra = v.ph.pop;
      d.shift = d.h - sysLive;
      this.physOut(out);
      if (f >= 0.22 && !v.touched) { v.touched = true; this.log('touch'); }
      if (f < 0.05) v.touched = false;
      // freeze alignment once the valve is engaged
      if (f >= 0.1 && v.alignFrozen == null) { v.alignFrozen = this.alignErr(); }
      if (f < 0.05) v.alignFrozen = null;
      // bounce
      const pace = this.pacing === 'off' ? 1 : this.pacing === '120' ? 0.45 : 0.15;
      const anch = f >= 0.8 ? 0.4 : 1;
      v.bounceAmp = f < 0.04 ? 0.5 * pace : (3.4 * (1 - 0.75 * v.stab) * pace * anch);
      const hz = this.pacing === 'off' ? 1.25 : this.pacing === '120' ? 2 : 3;
      this.bph = (this.bph || 0) + dt * hz * Math.PI * 2;
      d.bounce = v.bounceAmp * Math.sin(this.bph);
      if (f < 1 && f > 0.1 && v.bounceAmp > 1.6 && this.pacing === 'off' && !v.bounceHint) { v.bounceHint = true; this.say('The root is bouncing - consider pacing at ~120 now that the valve touches.', 6); }
      if (f >= 1) this.release();
      d.sd = d.s + d.shift;
    } else {
      d.bounce = (d.bounce) * (1 - dt * 1.5); this.bph = (this.bph || 0) + dt * 8;
      d.sd = d.s;
      d.lat = d.lat; // updated in zoneCheck
    }
    d.leafOpen = d.released ? lerp(d.leafOpen, 1, clamp(dt * 1.2, 0, 1)) : 0;
    if (d.released) d.sealed = true;
    this.rootDelta = d.bounce;
  }
  physCtx(dt, sysLive) {
    const d = this.dev, v = this.v, f = d.f;
    return { f, speedMmS: PH.mmFromFractionRate(v.speed), press: this.press, wtens: this.wtens, wireStiff: this.cfg.wireStiffness ?? PH.CONSTANTS.wireStiffness, pacing: this.pacing,
      stab: v.tiltStab, lat: v.tiltLat, tiltBase: this.tiltBase, calc: clamp((this.tiltBase - 0.45) / 0.3, 0, 1), sysFrozen: v.sysFrozen, sysLive, bias: v.biasFrozen, tug: v.tug, root: d.bounce, post80: f > 0.8, cfgFinalFast: this.cfg.finalFast };
  }
  physOut(out) { // publish what the views / handle need
    const d = this.dev, v = this.v, ph = v.ph;
    const e = PH.meanExpansion(ph.rEff);
    d.fv = d.released ? 1 : PH.fractionFromMm(ph.rEff); d.kz = d.released ? 1 : PH.lengthScale(e); d.fore = PH.foreshortening(e);
    d.retractMm = PH.mmFromFraction(d.f); d.turns = PH.turnsFromMm(d.retractMm);
    const t = out.targets; d.grip = t ? t.grip : 0; d.radialN = t ? t.radial : 0; d.hungN = !!ph.stuckN && d.f > 0.2 && t && Math.abs(t.tN - ph.xN) > 0.12; d.hungL = !!ph.stuckL && d.f > 0.2 && t && Math.abs(t.tL - ph.xL) > 0.12;
    d.jump = out.jumpNow || 0;
    d.feel = PH.resheathForce(ph.rEff, d.retractMm, v.speed < -0.002);
  }
  release() {
    const d = this.dev, v = this.v, lm = this.lm;
    if (d.released) return;
    // final release: spring-back / settle in physics.js (an unpaced release pops the valve up toward the aorta)
    if (this.cfg.finalFast && this.pacing !== 'fast') { this.flags.releasedUnpaced = true; this.say('Released without rapid pacing: the valve popped up toward the aorta.', 6); }
    if (v.maxSpeedPost80 > 0.09) { this.flags.releasedFast = true; }
    const rel = PH.release(v.ph, this.physCtx(1 / 30, this.sysZ()), 6);
    d.h = rel.xN; d.tilt = rel.xN - rel.xL; v.extra = v.ph.extra; v.relExtra = v.ph.pop; this.flags.popMm = rel.pop; this.flags.releaseJump = Math.abs(v.ph.pop);
    d.shift = d.h - this.sysZ();
    d.s += d.shift; d.shift = 0; d.sd = d.s;
    d.released = true; d.valveS = d.s - DEV.noseL; d.f = 1; d.locked = false; d.sealed = true;
    this.flags.finalDepthNcc = d.h; this.flags.finalDepthLcc = d.h - d.tilt; this.flags.finalAlign = v.alignFrozen != null ? v.alignFrozen : this.alignErr();
    this.log('released', { ncc: +d.h.toFixed(2), lcc: +(d.h - d.tilt).toFixed(2), align: +this.flags.finalAlign.toFixed(1) });
    if (this.pacing !== 'off') { this.flags.pacingLeftOn = false; this.pacing = 'off'; this.say('Valve released. Pacing off. Leaflets open, cuff sealed - but the case is not over.', 6); }
    else this.say('Valve released. Leaflets open, cuff sealed - but the case is not over.', 6);
    this.wire.hold = false; // hands were on the handle
    this.setPhase(8);
    this.say('Valve released. Fix the wire before you do anything else.', 7);
  }
  phaseLogic(dt) {
    const d = this.dev, lm = this.lm, ph = this.phase, c = this.chk;
    if (ph === 1 && d.s >= lm.bif + 55) {
      d.roll = Math.round(d.roll / 120) * 120 + this.roll2; d.twist = 0;
      this.setPhase(2); this.say('Through the iliacs. Now set rotation in the descending aorta.', 5);
    }
    if (ph === 3) {
      if (d.s >= lm.ascDone && d.flex <= 0.25) { this.log('archDone'); this.say('Rotation may have changed in the arch - re-check it at the annulus.', 6); this.setPhase(4); }
      else if (d.s >= lm.ascDone && d.flex > 0.25) { if (!this.unflexMsg || this.time - this.unflexMsg > 4) { this.unflexMsg = this.time; this.say('You are in the ascending aorta: unflex.', 3); } }
    }
    if (ph === 4) {
      c.crossed = c.crossed || d.s >= lm.ann + 30;
      c.centered = Math.abs(d.lat) <= 2.0 && d.s > lm.ann - 30;
      c.marker = Math.abs(this.sysZ()) <= 1.5 && c.crossed;
      if (c.crossed && c.centered && c.marker && c.alignConfirmed) { this.log('p4done'); this.setPhase(5); }
      else if (c.crossed && c.centered && c.marker && !this.p4Hint) { this.p4Hint = true; this.setCoach(); this.say('Crossed, centred and on the annular plane. Re-check the commissure alignment now (cusp-overlap view) - or continue without it and take a scored miss.', 7); }
    }
    if (ph === 5 && d.locked) { this.chk.secondView = false; this.setPhase(6); }
    if (ph === 6 && !d.locked && d.f < 0.78) { this.setPhase(5); this.chk.secondView = false; this.say('Back to landing - recaptured below 80%.', 4); }
    if (ph === 6) { /* confirm via button */ }
    if (ph === 8 && d.s <= lm.cfa - 4 && d.f >= 1) {
      this.wire.hold = true; d.s = Math.min(d.s, lm.skin - 3); this.setPhase(9); this.flags.phase8Done = true; this.say('FlexNav is out with the wire in place. Now close.', 6);
    }
    if (ph === 8 && this.pacing !== 'off') { this.pacing = 'off'; }
  }
  snapshot() {
    const d = this.dev, vi = this.viewInfo();
    return { phase: this.phase, started: this.started, finished: this.finished, time: +this.time.toFixed(2), carm: { lao: +this.carm.lao.toFixed(1), cra: +this.carm.cra.toFixed(1) },
      view: { err: +vi.err.toFixed(2), az: +vi.az.toFixed(1), cuspOverlap: vi.cuspOverlap, threeCusp: vi.threeCusp, edgeOn: vi.edgeOn },
      dev: { s: +d.s.toFixed(1), flex: +d.flex.toFixed(2), roll: +d.roll.toFixed(1), drift: +d.drift.toFixed(1), lat: +d.lat.toFixed(2), f: +d.f.toFixed(3), macro: +d.macro.toFixed(2), locked: d.locked, released: d.released, h: +d.h.toFixed(2), tilt: +d.tilt.toFixed(2), hLcc: +(d.h - d.tilt).toFixed(2), bounce: +d.bounce.toFixed(2), sysZ: +this.sysZ().toFixed(2), retractMm: +(d.retractMm || 0).toFixed(2), turns: +(d.turns || 0).toFixed(2), fv: +(d.fv ?? d.f).toFixed(3), fore: +(d.fore || 0).toFixed(2), grip: +(d.grip || 0).toFixed(2), feel: d.feel ? +d.feel.feel.toFixed(2) : 0, zone: d.feel ? d.feel.zone : 'free', jump: +(d.jump || 0).toFixed(2), hungN: !!d.hungN, hungL: !!d.hungL, xN: +(v_ph(this).xN).toFixed(2), xL: +(v_ph(this).xL).toFixed(2) },
      wire: { s: +this.wire.s.toFixed(1), hold: this.wire.hold, removed: this.wire.removed, adv: +this.wireAdv().toFixed(2) }, pacing: this.pacing, press: this.press, wtens: this.wtens, stab: +(this.v.stab || 0).toFixed(2),
      fx: this.fx ? this.fx.type : null, chk: { ...this.chk }, flags: { ...this.flags }, rotErr: +this.rotErr2().toFixed(1), alignErr: +this.alignErr().toFixed(1), resist: +this.pf.resist.toFixed(2), req: +(this.path.flexReq(d.s)).toFixed(2), note: this.note, coach: this.coach,
      lm: this.lm, driftTotal: this.driftTotal, tiltBase: this.tiltBase };
  }
}
function I_forward(input, d, v) { return input.deploy > 0 && d.f > v.minF + 0.01; }
