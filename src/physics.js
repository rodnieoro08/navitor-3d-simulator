// Navitor-style self-expanding valve: deployment + seating physics (pure, deterministic, no DOM / no three.js).
//
// !!! Physics model: TEACHING ESTIMATES, UNCALIBRATED. !!!
// No manufacturer data was used. Every constant below is an "estimate (uncalibrated)" chosen so that the
// qualitative behaviour (inflow-first expansion, foreshortening, hysteresis, stick-slip, pop-up/migration)
// feels right in a teaching sim. None of the numbers describe a real device.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const ESTIMATE = 'estimate (uncalibrated)';

// [name, value, unit, meaning]  - one place for ALL constants; each is an estimate (uncalibrated)
const SPEC = [
  // --- wheel / capsule ---
  ['capsuleTravelMm', 52, 'mm', 'capsule retraction needed to fully unsheathe (100% on the wheel)'],
  ['wheelTurnsFull', 5, 'turns', 'wheel turns for full retraction -> turns per mm = wheelTurnsFull / capsuleTravelMm'],
  ['lockFraction', 0.8, '-', '80% stop: lock engages here; recapture is only possible below it'],
  ['safeSpeedMmS', 4.4, 'mm/s', 'capsule retraction speed below 80% that stays controlled (about 0.085 of travel per s)'],
  ['safeSpeedPost80MmS', 3.9, 'mm/s', 'same, after the lock (outflow ring releasing: about 0.075 of travel per s)'],
  // --- frame geometry ---
  ['frameCrimpLenMm', 46, 'mm', 'axial length of the frame crimped in the capsule (longer than expanded)'],
  ['frameFreeLenMm', 40, 'mm', 'axial length of the fully expanded frame (foreshortened)'],
  ['releaseRampMm', 6, 'mm', 'capsule travel over which one frame section goes from crimped to open (progressive)'],
  ['frameFreeRadiusMm', 13.5, 'mm', 'free (unconstrained) inflow radius of the 27 mm valve'],
  ['frameCrimpRadiusMm', 3.3, 'mm', 'crimped radius'],
  ['annulusRadiusMm', 12, 'mm', 'native annulus radius (24 mm case annulus)'],
  ['annulusCompliance', 0.25, '-', 'fraction of oversize the annulus yields to (calcified annulus: stiff)'],
  ['hysteresisMm', 4, 'mm', 'play of the frame: on resheath it stays open until the capsule has travelled this far back'],
  // --- radial force / grip ---
  ['radialForceN_perMm', 6, 'N/mm', 'radial force per mm of oversize at full expansion'],
  ['gripForceScaleN', 8, 'N', 'radial force at which the frame grips ~63% (grip = 1-exp(-F/scale))'],
  // --- seating ---
  ['seatDropMm', 4.1, 'mm', 'depth the inflow edge settles to below the annulus once the frame wedges in the root'],
  ['foreshortCouplingMm', 0.35, '-', 'fraction of the frame shortening that pulls an UN-gripped inflow edge up toward the aorta'],
  ['kPressMm', 1.8, 'mm per unit', 'depth shift per unit of system forward pressure above/below neutral (0.5)'],
  ['kWireMm', 1.5, 'mm per unit', 'depth shift per unit of wire tension above/below neutral (0.3), at wire stiffness 1.0'],
  ['wireStiffness', 1.0, '-', 'default wire stiffness factor (1 = standard; >1 stiffer: more tension transmitted, straighter root)'],
  ['kStiffTiltMm', 0.35, 'mm', 'extra NCC-vs-left-cusp tilt per +1.0 of wire stiffness above 1.0 (straightened root)'],
  ['tiltPerInstabilityMm', 0.7, 'mm', 'tilt added at zero stability (poor pressure / wire tension)'],
  ['tiltPerLateralMm', 0.06, 'mm/mm', 'tilt added per mm of lateral offset of the shaft'],
  ['septumDepthMm', 5.0, 'mm', 'NCC depth at which the frame meets the membranous septum (soft stop)'],
  ['septumStiffness', 0.4, '-', 'fraction of the further push that passes the septum stop'],
  // --- friction (stick-slip), expressed as a depth-gap in mm needed to break free ---
  ['fricBaseNcc', 0.12, 'mm', 'static friction against the native NCC leaflet, before grip'],
  ['fricBaseLcc', 0.22, 'mm', 'static friction against the left-cusp leaflet and calcium, before grip'],
  ['fricGripMm', 0.30, 'mm', 'extra static friction at full grip (radial force x friction coefficient)'],
  ['fricCalcLccVarMm', 0.15, 'mm', 'case-dependent extra calcium friction on the left cusp (0..1 x this)'],
  ['kineticRatio', 0.5, '-', 'kinetic / static friction (sliding after break-away)'],
  ['slipRatePerS', 7, '1/s', 'how fast a slipping side closes the gap to its target'],
  ['rootAssistMm', 0.12, 'mm per mm', 'root motion shakes the frame free: mm of break-away help per mm of root swing'],
  // --- forces: flow, pacing, migration ---
  ['paceOff', 1.0, '-', 'root motion / ejection drag factor without pacing'],
  ['pace120', 0.45, '-', 'factor at ~120 bpm pacing'],
  ['paceRapid', 0.15, '-', 'factor at rapid pacing'],
  ['flowPushN', 0.9, '-', 'LV ejection push toward the aorta without pacing (scaled by pace factor)'],
  ['forwardPushN', 0.6, '-', 'resting forward push of the stiff system toward the LV'],
  ['netForceScale', 0.5, '-', 'scale of tanh() that turns net force into a migration direction'],
  ['migrationMmPerMmS', 0.23, 'mm per (mm/s) per s', 'uncontrolled migration per mm/s of wheel speed above the safe speed'],
  ['popPerMmS', 0.2, 'mm per (mm/s)', 'spring-back jump on the outflow ring per mm/s above the safe speed after the lock'],
  ['popUnpacedMm', 1.3, 'mm', 'spring-back pop toward the aorta at release when the heart is not rapid-paced (case-card release)'],
  ['popRadialRelief', 0.3, '-', 'fraction of a pop absorbed by grip (pop x (1 - this x grip))'],
  // --- recapture feel ---
  ['resheathBaseN', 4, 'N', 'drag of the capsule sliding back over the shaft'],
  ['resheathPerExpN', 14, 'N', 'added resheath force at full mean expansion'],
  ['resheathLockRiseN', 22, 'N', 'extra force that builds as the lock is approached'],
  ['resheathHystN', 5, 'N', 'extra force on the way back (recapture hysteresis)'],
  ['resheathMaxN', 45, 'N', 'force that fills the feel gauge'],
];
export const CONSTANTS = Object.freeze(Object.fromEntries(SPEC.map(s => [s[0], s[1]])));
export const CONSTANT_INFO = Object.freeze(Object.fromEntries(SPEC.map(s => [s[0], { unit: s[2], meaning: s[3], status: ESTIMATE }])));
export const describeConstants = () => SPEC.map(s => ({ name: s[0], value: s[1], unit: s[2], meaning: s[3], status: ESTIMATE }));
export const PHYSICS_NOTE = 'Physics model: teaching estimates, uncalibrated (no manufacturer data).';
const C = CONSTANTS;

// ---------------------------------------------------------------- wheel
export const turnsPerMm = () => C.wheelTurnsFull / C.capsuleTravelMm;
export const mmFromFraction = (f) => f * C.capsuleTravelMm;
export const fractionFromMm = (mm) => mm / C.capsuleTravelMm;
export const turnsFromMm = (mm) => mm * turnsPerMm();
export const mmFromTurns = (t) => t / turnsPerMm();
export const mmFromFractionRate = (df) => df * C.capsuleTravelMm; // fraction/s -> mm/s

// ---------------------------------------------------------------- frame expansion (inflow first, progressive)
// section at distance x (mm, crimped coordinates, from the inflow edge) opens as the capsule edge passes it
export function sectionExpansion(xMm, rMm) { return smooth(0, 1, (rMm - xMm) / C.releaseRampMm); }
const NSEC = 24;
export function meanExpansion(rMm) { let s = 0; for (let i = 0; i < NSEC; i++) s += sectionExpansion((i + 0.5) / NSEC * C.frameCrimpLenMm, rMm); return s / NSEC; }
// hysteresis ("play"): returns the effective retraction the frame has actually opened to
export function playStep(rEff, rMm) { return clamp(rEff, rMm, rMm + C.hysteresisMm); }
export function frameLength(e) { return C.frameCrimpLenMm - (C.frameCrimpLenMm - C.frameFreeLenMm) * e; }
export function foreshortening(e) { return C.frameCrimpLenMm - frameLength(e); }
export const lengthScale = (e) => frameLength(e) / C.frameFreeLenMm; // >= 1 while crimped; 1 when open
export function inflowRadius(rMm) { // radius of the inflow section, ignoring the annulus
  return C.frameCrimpRadiusMm + sectionExpansion(0.5, rMm) * (C.frameFreeRadiusMm - C.frameCrimpRadiusMm);
}
export const oversizePct = () => (C.frameFreeRadiusMm / C.annulusRadiusMm - 1) * 100;
// radial force at the annulus: the section lying at the annulus (depth mm from the inflow edge)
export function radialForce(rEff, depthMm) {
  const e = sectionExpansion(Math.max(0.5, depthMm), rEff);
  const rFree = C.frameCrimpRadiusMm + e * (C.frameFreeRadiusMm - C.frameCrimpRadiusMm);
  const over = Math.max(0, rFree - C.annulusRadiusMm) * (1 - C.annulusCompliance);
  return C.radialForceN_perMm * over;
}
export const grip = (radialN) => 1 - Math.exp(-radialN / C.gripForceScaleN);
const E_LOCK = meanExpansion(C.lockFraction * C.capsuleTravelMm);
export const seatFraction = (e) => smooth(0.04, E_LOCK, e); // how far the frame has wedged into the root (saturates at the lock)

// ---------------------------------------------------------------- recapture feel (handle gauge)
export function resheathForce(rEff, rMm, movingBack) {
  const f = rMm / C.capsuleTravelMm;
  if (f <= 0.005) return { n: 0, feel: 0, zone: 'free' };
  if (f > C.lockFraction + 1e-6) return { n: C.resheathMaxN, feel: 1, zone: 'gray' };
  const e = meanExpansion(rEff);
  const rise = Math.pow(smooth(0.5, C.lockFraction, f), 2);
  const n = C.resheathBaseN + C.resheathPerExpN * e + C.resheathLockRiseN * rise + (movingBack ? C.resheathHystN * e : 0);
  return { n, feel: clamp(n / C.resheathMaxN, 0, 1), zone: f >= C.lockFraction - 1e-6 ? 'lock' : f > 0.5 ? 'firm' : 'light' };
}

// ---------------------------------------------------------------- pacing, forces
export const paceFactor = (mode) => mode === 'fast' ? C.paceRapid : mode === '120' ? C.pace120 : C.paceOff;
// net axial force on the valve: + toward the LV (deeper), - toward the aorta (higher)
export function netForce(ctx) {
  const stiff = ctx.wireStiff ?? C.wireStiffness;
  return C.forwardPushN + (ctx.press - 0.5) * 2 - (ctx.wtens - 0.3) * 2 * stiff - C.flowPushN * paceFactor(ctx.pacing);
}
export const forceDirection = (ctx) => Math.tanh(netForce(ctx) / C.netForceScale);
// static depth shift from system pressure and wire tension (frozen by the caller once the frame is anchored)
export function biasMm(press, wtens, wireStiff = C.wireStiffness) { return C.kPressMm * (press - 0.5) - C.kWireMm * wireStiff * (wtens - 0.3); }
export function tiltTarget(ctx) {
  const stab = ctx.stab;
  return ctx.tiltBase + C.tiltPerInstabilityMm * (1 - stab) + C.tiltPerLateralMm * Math.abs(ctx.lat || 0) + C.kStiffTiltMm * Math.max(0, (ctx.wireStiff ?? 1) - 1);
}
// uncontrolled migration (mm per second) when the wheel is too fast; sign follows the net force
export function migrationRate(speedMmS, post80, ctx) {
  const lim = post80 ? C.safeSpeedPost80MmS : C.safeSpeedMmS;
  if (speedMmS <= lim) return 0;
  return (speedMmS - lim) * C.migrationMmPerMmS * forceDirection(ctx);
}
// spring-back impulse (mm, signed: + deeper) when the outflow ring springs open fast
export function springBack(speedMmS, ctx, gripV) {
  const ex = Math.max(0, speedMmS - C.safeSpeedPost80MmS);
  if (!ex) return 0;
  return ex * C.popPerMmS * Math.sign(forceDirection(ctx) || 1) * (1 - C.popRadialRelief * gripV);
}
// final release pop (mm, signed): the heart pushes the freed frame toward the aorta unless it is paced
export function releasePop(pacing, gripV) { const k = (paceFactor(pacing) - C.paceRapid) / (C.paceOff - C.paceRapid); return -C.popUnpacedMm * Math.max(0, k) * (1 - C.popRadialRelief * gripV); }

// ---------------------------------------------------------------- seating (per side: NCC and left cusp)
export function createState() {
  return { rMm: 0, rEff: 0, xN: 0, xL: 0, stuckN: true, stuckL: true, slipsN: 0, slipsL: 0, jump: 0, lastJump: 0, jumpT: -9, extra: 0, pop: 0, init: false };
}
function frictionStatic(side, ctx, gripV) {
  const base = side === 'N' ? C.fricBaseNcc : C.fricBaseLcc + C.fricCalcLccVarMm * (ctx.calc ?? 0.5);
  return base + C.fricGripMm * gripV;
}
// targets: where each side would settle with no friction
export function seatTargets(st, ctx) {
  const e = meanExpansion(st.rEff);
  const g = seatFraction(e);
  const rad = radialForce(st.rEff, Math.max(1, st.xN));
  const gp = grip(rad);
  const fsUp = C.foreshortCouplingMm * foreshortening(e) * (1 - gp) * g;
  let tN = ctx.sysFrozen + C.seatDropMm * g - fsUp + ctx.bias * smooth(0.1, 0.5, ctx.f) + (ctx.tug || 0) + st.extra + st.pop;
  if (tN > C.septumDepthMm) tN = C.septumDepthMm + (tN - C.septumDepthMm) * C.septumStiffness; // membranous septum soft stop
  const tilt = tiltTarget(ctx);
  return { tN, tL: tN - tilt, grip: gp, radial: rad, e, g, fsUp };
}
// advance one step. ctx: {f, speedMmS, press, wtens, wireStiff, pacing, stab, lat, tiltBase, calc, sysFrozen, sysLive, bias, tug, root, post80}
export function step(st, ctx, dt) {
  const rMm = mmFromFraction(ctx.f);
  const movingBack = rMm < st.rMm - 1e-9;
  st.rMm = rMm; st.rEff = playStep(Math.max(st.rEff, rMm), rMm);
  if (!st.init || ctx.f < 0.05) { // inside the capsule / not yet engaged: the valve rides with the system
    st.xN = st.xL = ctx.sysLive; st.stuckN = st.stuckL = true; st.init = true; st.rEff = rMm; st.jump = 0;
    if (ctx.f < 0.03) { st.extra = 0; st.pop = 0; }
    const t0 = seatTargets(st, ctx); return { xN: st.xN, xL: st.xL, targets: t0 };
  }
  // migration (too fast a wheel) and spring-back (outflow ring) accumulate into the targets
  const mig = migrationRate(Math.max(0, ctx.speedMmS), ctx.post80, ctx);
  st.extra += mig * dt;
  if (ctx.speedMmS > C.safeSpeedPost80MmS && ctx.post80) { const pb = springBack(ctx.speedMmS, ctx, grip(radialForce(st.rEff, Math.max(1, st.xN)))) * dt; st.pop += pb; }
  const T = seatTargets(st, ctx);
  const gripV = T.grip;
  let jumpNow = 0;
  for (const side of ['N', 'L']) {
    const x = side === 'N' ? st.xN : st.xL, tg = side === 'N' ? T.tN : T.tL, gap = tg - x;
    const Fs = frictionStatic(side, ctx, gripV), Fk = Fs * C.kineticRatio;
    const help = C.rootAssistMm * Math.abs(ctx.root || 0);
    let stuck = side === 'N' ? st.stuckN : st.stuckL, nx = x;
    if (stuck && Math.abs(gap) + help > Fs) stuck = false;
    if (!stuck) {
      const aim = tg - Math.sign(gap) * Fk; const d = (aim - x) * (1 - Math.exp(-C.slipRatePerS * dt));
      if (Math.sign(aim - x) !== Math.sign(gap) || Math.abs(gap) <= Fk) { stuck = true; } else { nx = x + d; jumpNow = Math.max(jumpNow, Math.abs(d)); if (Math.abs(d) / dt > 1.2) { if (side === 'N') st.slipsN++; else st.slipsL++; } }
    }
    if (side === 'N') { st.xN = nx; st.stuckN = stuck; } else { st.xL = nx; st.stuckL = stuck; }
  }
  st.lastJump = jumpNow;
  return { xN: st.xN, xL: st.xL, targets: T, jumpNow };
}
// final release: the free frame settles for `sec` seconds under the pacing at release (deterministic)
export function release(st, ctx, sec = 6) {
  const gp = grip(radialForce(st.rEff, Math.max(1, st.xN)));
  if (ctx.cfgFinalFast) st.pop += releasePop(ctx.pacing, gp);
  st.rEff = C.capsuleTravelMm; st.rMm = C.capsuleTravelMm;
  const c = { ...ctx, f: 1, speedMmS: 0, root: 0 };
  let last; for (let t = 0; t < sec; t += 1 / 30) last = step(st, c, 1 / 30);
  return { xN: st.xN, xL: st.xL, pop: st.pop };
}
