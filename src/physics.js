// Navitor Vision 27 mm / FlexNav: deployment + seating physics (pure, deterministic, no DOM / no three.js).
//
// Every constant carries a provenance tag:
//   IFU      - stated in the Navitor Instructions for Use (ARTMT600362847 A)
//   DECK     - stated in the Navitor Vision / FlexNav training deck (TRN1006420 OUS VER A, TRN1006240 GLB REV E)
//   DERIVED  - computed here from the published geometry (nothing measured on a device)
//   ESTIMATE - uncalibrated teaching estimate chosen so the qualitative behaviour feels right
// The valve model is a 27 mm Navitor Vision (NVRO-27) in a 24 mm annulus on a FlexNav FNAV-DS-LG. Forces, friction, pacing
// factors and the handle feel are still estimates: the published documents give dimensions and rules, not force curves.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const ESTIMATE = 'estimate (uncalibrated)';
export const SRC = { IFU: 'IFU', DECK: 'training deck', DERIVED: 'derived from published geometry', EST: ESTIMATE };

// --------------------------------------------------------------- published device data (27 mm Navitor Vision, FlexNav LG)
const PUB = {
  valveMm: 27, annulusMinMm: 23, annulusMaxMm: 25, ascAortaMinMm: 30, ascAortaMaxMm: 40,              // IFU table 2
  stentHeightMm: 48, commissureHeightMm: 24, halfCellHeightMm: 8, cuffHeightMm: 10,                   // deck: valve dimensions (27 mm column)
  inflowDiaMm: 27, outflowDiaMm: 27, aorticStentDiaMm: 44,                                            // deck: valve dimensions (27 mm column)
  markerHeightMm: 3, markers: 3, retainerTabs: 3, inflowStruts: 9,                                    // IFU (markers 3 mm above the inflow edge, 3 tabs); deck ("look for all 9" struts)
  capsuleOdMm: 6.3, sheathFr: 15, workingLengthCm: 107, minVesselMm: 5.5, wireIn: 0.035,              // IFU table 3 (FNAV-DS-LG)
  targetDepthMm: 3, maxResheaths: 2, pacingDeployBpm: [90, 130],                                      // IFU (3 mm, <= 2 re-sheaths); deck (controlled pacing 90-130 if needed)
};

// --------------------------------------------------------------- lattice geometry derived from the published dimensions
// The frame is a laser-cut nitinol diamond lattice: 9 cells around, three half-cell rows (8 mm each) up to the commissure height,
// then a 24 mm crown that flares from 27 to 44 mm. A strut keeps its length when it is crimped, so the crimped axial pitch of every
// row follows from the expanded pitch and the crimped radius (capsule bore). That gives the crimped length, the capsule travel and
// the foreshortening without any manufacturer data beyond the table of dimensions.
const capsuleWallMm = 0.4;                                                   // ESTIMATE: thin-wall polymer capsule
const rCrimp = (PUB.capsuleOdMm - 2 * capsuleWallMm) / 2 - 0.15;             // crimped frame radius inside the capsule bore
const R0 = PUB.inflowDiaMm / 2, N0 = PUB.inflowStruts;
const halfW = Math.PI * R0 / N0, strutLen = Math.hypot(halfW, PUB.halfCellHeightMm);
const halfWc = Math.PI * rCrimp / N0, halfHc = Math.sqrt(strutLen * strutLen - halfWc * halfWc);
const stretchLower = halfHc / PUB.halfCellHeightMm;                          // crimped / expanded axial pitch of the inflow lattice (~1.15)
const lowerExp = PUB.commissureHeightMm, lowerCrimp = lowerExp * stretchLower;
const upperExp = PUB.stentHeightMm - PUB.commissureHeightMm;
const postBowMm = 2.4;                                                       // ESTIMATE: the commissure "eye" cell bows this far out of line
const upperCrimp = 2 * Math.hypot(upperExp / 2, postBowMm);                  // the tabbed posts straighten when crimped: the crown barely shortens
const tabMm = 2.2;                                                           // ESTIMATE: retainer tab beyond the post tip
const GEO = Object.freeze({ rCrimp, strutLen, halfW, halfWc, halfHc, stretchLower, lowerExp, lowerCrimp, upperExp, upperCrimp, crimpLen: lowerCrimp + upperCrimp, freeLen: PUB.stentHeightMm, tabMm, postBowMm });
export const GEOMETRY = GEO;
export const PUBLISHED = Object.freeze(PUB);

const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
// [name, value, unit, meaning, source]
const SPEC = [
  // --- published ---
  ['valveMm', PUB.valveMm, 'mm', 'Navitor Vision valve size (NVRO-27)', SRC.IFU],
  ['annulusRangeMm', `${PUB.annulusMinMm}-${PUB.annulusMaxMm}`, 'mm', 'labelled annulus diameter range for the 27 mm valve (case annulus 24 mm)', SRC.IFU],
  ['stentHeightMm', PUB.stentHeightMm, 'mm', 'stent height excluding the retainer tabs, fully expanded', SRC.DECK],
  ['commissureHeightMm', PUB.commissureHeightMm, 'mm', 'height of the commissure attachment feature above the inflow edge', SRC.DECK],
  ['halfCellHeightMm', PUB.halfCellHeightMm, 'mm', 'half cell height of the inflow lattice (the 3 mm target depth is below the first node row)', SRC.DECK],
  ['cuffHeightMm', PUB.cuffHeightMm, 'mm', 'height of the NaviSeal outer cuff', SRC.DECK],
  ['inflowDiaMm', PUB.inflowDiaMm, 'mm', 'valve inflow diameter (non-flared annulus section)', SRC.DECK],
  ['outflowDiaMm', PUB.outflowDiaMm, 'mm', 'valve outflow diameter at the leaflets', SRC.DECK],
  ['aorticStentDiaMm', PUB.aorticStentDiaMm, 'mm', 'free diameter of the aortic crown (constrained by the aorta in situ)', SRC.DECK],
  ['markerHeightMm', PUB.markerHeightMm, 'mm', 'Vision tantalum markers sit this far above the inflow edge, one under each commissure', SRC.IFU],
  ['inflowStruts', PUB.inflowStruts, '-', 'cells / struts around the inflow ("look for all 9")', SRC.DECK],
  ['retainerTabs', PUB.retainerTabs, '-', 'retainer tabs held in the retainer receptacle until full deployment', SRC.IFU],
  ['capsuleOdMm', PUB.capsuleOdMm, 'mm', 'FlexNav LG valve capsule outer diameter (15 F equivalent)', SRC.IFU],
  ['workingLengthCm', PUB.workingLengthCm, 'cm', 'FlexNav delivery system working length', SRC.IFU],
  ['targetDepthMm', PUB.targetDepthMm, 'mm', 'target implant depth of the inflow edge below the annulus (NCC depth < membranous septum length but not < 3 mm)', SRC.IFU],
  ['maxResheaths', PUB.maxResheaths, '-', 'do not re-sheath more than two times before final release', SRC.IFU],
  // --- derived ---
  ['frameCrimpRadiusMm', r2(GEO.rCrimp), 'mm', 'crimped frame radius = capsule bore (OD - 2 x wall) with running clearance', SRC.DERIVED],
  ['strutLenMm', r2(GEO.strutLen), 'mm', 'length of one inflow-lattice strut (9 cells of 27 mm circumference, 8 mm half cell)', SRC.DERIVED],
  ['stretchLower', r2(GEO.stretchLower), '-', 'crimped / expanded axial pitch of the inflow lattice (struts keep their length)', SRC.DERIVED],
  ['frameCrimpLenMm', r1(GEO.crimpLen), 'mm', 'crimped stent length (inflow lattice stretched, crown posts straightened)', SRC.DERIVED],
  ['frameFreeLenMm', GEO.freeLen, 'mm', 'expanded stent length (= stent height)', SRC.DECK],
  ['capsuleTravelMm', r1(GEO.crimpLen + GEO.tabMm), 'mm', 'capsule retraction that frees the retainer tabs (100% on the wheel)', SRC.DERIVED],
  ['releaseRampMm', r1(GEO.halfHc), 'mm', 'a cell opens over one crimped half-cell of capsule travel (its upper node must clear the mouth)', SRC.DERIVED],
  ['frameFreeRadiusMm', PUB.inflowDiaMm / 2, 'mm', 'free inflow radius', SRC.DECK],
  ['annulusRadiusMm', 12, 'mm', 'native annulus radius of this case (24 mm annulus, inside the 23-25 mm range)', SRC.IFU],
  // --- estimates: wheel / handle ---
  ['wheelTurnsFull', 5, 'turns', 'wheel turns for full retraction -> turns per mm = wheelTurnsFull / capsuleTravelMm', SRC.EST],
  ['lockFraction', 0.8, '-', 'partial deployment lock: the wheel clicks and the lock button must be pressed to continue; no recapture past it (gray zone)', SRC.EST],
  ['safeSpeedMmS', 4.4, 'mm/s', 'capsule retraction speed below the lock that stays controlled ("slowly and steadily")', SRC.EST],
  ['safeSpeedPost80MmS', 3.9, 'mm/s', 'same, after the lock (crown releasing: "release the valve slowly")', SRC.EST],
  ['annulusCompliance', 0.25, '-', 'fraction of the oversize the calcified annulus yields to', SRC.EST],
  ['hysteresisMm', 4, 'mm', 'play of the frame: on resheath it stays open until the capsule has travelled this far back', SRC.EST],
  // --- estimates: radial force / grip (shape from the deck: consistent, slightly falling with diameter) ---
  ['cofRefN', 42, 'N', 'chronic outward force of the 27 mm frame at the bottom of its range (23 mm)', SRC.EST],
  ['cofSlopePerMm', 0.06, '1/mm', 'relative fall of the chronic outward force per mm of annulus diameter across the use range', SRC.EST],
  ['gripForceScaleN', 26, 'N', 'radial force at which the frame grips ~63% (grip = 1-exp(-F/scale))', SRC.EST],
  // --- estimates: seating ---
  ['seatDropMm', 3.7, 'mm', 'depth the inflow edge settles to below the annulus once the frame wedges in the root ("the valve may descend slightly toward 3 mm")', SRC.EST],
  ['foreshortCouplingMm', 0.35, '-', 'fraction of the inflow-lattice shortening that pulls an UN-gripped inflow edge up toward the aorta (tabs are fixed)', SRC.EST],
  ['kPressMm', 1.8, 'mm per unit', 'depth shift per unit of system forward pressure above/below neutral (0.5)', SRC.EST],
  ['kWireMm', 1.5, 'mm per unit', 'depth shift per unit of wire tension above/below neutral (0.3), at wire stiffness 1.0', SRC.EST],
  ['wireStiffness', 1.0, '-', 'default wire stiffness factor (1 = pre-shaped super stiff; >1 stiffer)', SRC.EST],
  ['kStiffTiltMm', 0.35, 'mm', 'extra NCC-vs-left-cusp tilt per +1.0 of wire stiffness above 1.0 (straightened root)', SRC.EST],
  ['tiltPerInstabilityMm', 0.7, 'mm', 'tilt added at zero stability (poor pressure / wire tension)', SRC.EST],
  ['tiltPerLateralMm', 0.06, 'mm/mm', 'tilt added per mm of lateral offset of the shaft', SRC.EST],
  ['kWirePushTiltMm', 0.9, 'mm', 'a gentle push on the LV wire tilts the valve to the outer curve: left-cusp side rises (deck, LCC landing too low)', SRC.EST],
  ['kSysTiltMm', 0.8, 'mm', 'forward push on the system tilts to the outer curve (left cusp up); pulling it back tilts to the inner curve (left cusp down)', SRC.EST],
  ['septumDepthMm', 5.0, 'mm', 'NCC depth at which the frame meets the membranous septum (soft stop)', SRC.EST],
  ['septumStiffness', 0.4, '-', 'fraction of the further push that passes the septum stop', SRC.EST],
  // --- estimates: friction (stick-slip), expressed as a depth-gap in mm needed to break free ---
  ['fricBaseNcc', 0.12, 'mm', 'static friction against the native NCC leaflet, before grip', SRC.EST],
  ['fricBaseLcc', 0.22, 'mm', 'static friction against the left-cusp leaflet and calcium, before grip', SRC.EST],
  ['fricGripMm', 0.30, 'mm', 'extra static friction at full grip (radial force x friction coefficient)', SRC.EST],
  ['fricCalcLccVarMm', 0.15, 'mm', 'case-dependent extra calcium friction on the left cusp (0..1 x this)', SRC.EST],
  ['kineticRatio', 0.5, '-', 'kinetic / static friction (sliding after break-away)', SRC.EST],
  ['slipRatePerS', 7, '1/s', 'how fast a slipping side closes the gap to its target', SRC.EST],
  ['rootAssistMm', 0.12, 'mm per mm', 'root motion shakes the frame free: mm of break-away help per mm of root swing', SRC.EST],
  // --- estimates: flow, pacing, migration ---
  ['paceOff', 1.0, '-', 'root motion / ejection drag factor without pacing', SRC.EST],
  ['pace120', 0.45, '-', 'factor at controlled pacing ~120 bpm (deck: 90-130 bpm during unsheathing if needed)', SRC.EST],
  ['paceRapid', 0.15, '-', 'factor at rapid pacing', SRC.EST],
  ['flowPushN', 0.9, '-', 'LV ejection push toward the aorta without pacing (scaled by pace factor)', SRC.EST],
  ['forwardPushN', 0.6, '-', 'resting forward push of the stiff system toward the LV', SRC.EST],
  ['netForceScale', 0.5, '-', 'scale of tanh() that turns net force into a migration direction', SRC.EST],
  ['migrationMmPerMmS', 0.23, 'mm per (mm/s) per s', 'uncontrolled migration per mm/s of wheel speed above the safe speed', SRC.EST],
  ['popPerMmS', 0.2, 'mm per (mm/s)', 'spring-back jump of the crown per mm/s above the safe speed after the lock', SRC.EST],
  ['popUnpacedMm', 1.3, 'mm', 'spring-back pop toward the aorta at release when the heart is not rapid-paced (case-card release)', SRC.EST],
  ['popRadialRelief', 0.3, '-', 'fraction of a pop absorbed by grip (pop x (1 - this x grip))', SRC.EST],
  // --- estimates: recapture feel ---
  ['resheathBaseN', 4, 'N', 'drag of the capsule sliding back over the shaft', SRC.EST],
  ['resheathPerExpN', 14, 'N', 'added resheath force at full mean expansion', SRC.EST],
  ['resheathLockRiseN', 22, 'N', 'extra force that builds as the lock is approached', SRC.EST],
  ['resheathHystN', 5, 'N', 'extra force on the way back (recapture hysteresis)', SRC.EST],
  ['resheathMaxN', 45, 'N', 'force that fills the feel gauge', SRC.EST],
];
export const CONSTANTS = Object.freeze(Object.fromEntries(SPEC.map(s => [s[0], s[1]])));
export const CONSTANT_INFO = Object.freeze(Object.fromEntries(SPEC.map(s => [s[0], { unit: s[2], meaning: s[3], status: s[4] }])));
export const describeConstants = () => SPEC.map(s => ({ name: s[0], value: s[1], unit: s[2], meaning: s[3], status: s[4] }));
export const countBySource = () => SPEC.reduce((m, s) => { m[s[4]] = (m[s[4]] || 0) + 1; return m; }, {});
export const PHYSICS_NOTE = 'Physics model: geometry and procedure rules from the Navitor IFU and training deck; forces, friction and pacing effects are teaching estimates, uncalibrated.';
const C = CONSTANTS;

// ---------------------------------------------------------------- wheel
export const turnsPerMm = () => C.wheelTurnsFull / C.capsuleTravelMm;
export const mmFromFraction = (f) => f * C.capsuleTravelMm;
export const fractionFromMm = (mm) => mm / C.capsuleTravelMm;
export const turnsFromMm = (mm) => mm * turnsPerMm();
export const mmFromTurns = (t) => t / turnsPerMm();
export const mmFromFractionRate = (df) => df * C.capsuleTravelMm; // fraction/s -> mm/s

// ---------------------------------------------------------------- axial coordinates (expanded u <-> crimped x), per section
// u: height above the inflow edge on the expanded frame (0..48). x: the same material point measured along the crimped frame.
export function stretchAt(u) { return 1 + (GEO.stretchLower - 1) * (1 - smooth(GEO.lowerExp - 2, GEO.lowerExp + 2, u)); }
export function crimpCoord(u) { // x(u) = integral of stretch: closed form of the smooth blend is not needed, 0.5 mm Simpson is exact enough
  if (u <= 0) return 0; let n = Math.max(2, Math.ceil(u / 0.5)); if (n % 2) n++; let s = 0; const h = u / n;
  for (let i = 0; i <= n; i++) { const w = i === 0 || i === n ? 1 : (i % 2 ? 4 : 2); s += w * stretchAt(i * h); } return s * h / 3;
}
const U_TAB = []; for (let i = 0; i <= 96; i++) U_TAB.push(crimpCoord(i * 0.5)); // lookup for the inverse
export function expandedCoord(x) { // u(x): inverse of crimpCoord by table + linear interpolation
  if (x <= 0) return 0; let i = 1; while (i < U_TAB.length && U_TAB[i] < x) i++; if (i >= U_TAB.length) return 48 + (x - U_TAB[U_TAB.length - 1]);
  const t = (x - U_TAB[i - 1]) / (U_TAB[i] - U_TAB[i - 1]); return (i - 1 + t) * 0.5;
}

// ---------------------------------------------------------------- frame expansion (inflow first, progressive)
// material section at crimped distance x (mm, from the inflow edge) opens as the capsule mouth passes it
// the inflow lattice opens over one crimped half-cell; the crown struts converge on the posts and spring open over a shorter travel once the mouth passes them
export function rampAt(xMm) { return C.releaseRampMm + (2.0 - C.releaseRampMm) * smooth(GEO.lowerCrimp, GEO.crimpLen, xMm); }
export function sectionExpansion(xMm, rMm) { return smooth(0, 1, (rMm - xMm) / rampAt(xMm)); }
const NSEC = 32;
export function meanExpansion(rMm) { let s = 0; for (let i = 0; i < NSEC; i++) s += sectionExpansion((i + 0.5) / NSEC * C.frameCrimpLenMm, rMm); return s / NSEC; }
// expansion of the inflow lattice only (the part that foreshortens)
export function lowerExpansion(rMm) { let s = 0; for (let i = 0; i < 16; i++) s += sectionExpansion((i + 0.5) / 16 * GEO.lowerCrimp, rMm); return s / 16; }
// hysteresis ("play"): returns the effective retraction the frame has actually opened to
export function playStep(rEff, rMm) { return clamp(rEff, rMm, rMm + C.hysteresisMm); }
export function frameLength(e) { return C.frameCrimpLenMm - (C.frameCrimpLenMm - C.frameFreeLenMm) * e; }
export function foreshortening(e) { return C.frameCrimpLenMm - frameLength(e); }
export const lengthScale = (e) => frameLength(e) / C.frameFreeLenMm; // >= 1 while crimped; 1 when open
export function inflowRadius(rMm) { // radius of the inflow section, ignoring the annulus
  return C.frameCrimpRadiusMm + sectionExpansion(0.5, rMm) * (C.frameFreeRadiusMm - C.frameCrimpRadiusMm);
}
export const oversizePct = () => (C.frameFreeRadiusMm / C.annulusRadiusMm - 1) * 100;
// free radius of the expanded frame at height u (mm above the inflow edge): straight 27 mm to the commissures, then the crown flares to 44 mm
export function freeRadius(u) {
  if (u <= GEO.lowerExp) return R0;
  const t = smooth(GEO.lowerExp, GEO.freeLen, u); const Rtop = PUB.aorticStentDiaMm / 2;
  return R0 + (Rtop - R0) * Math.pow(t, 1.35);
}
// chronic outward force of the frame against an annulus of diameter d (deck: consistent across the range, slightly falling with diameter)
export function chronicOutwardForce(dMm = 2 * C.annulusRadiusMm) {
  const t = clamp((dMm - PUB.annulusMinMm) / (PUB.annulusMaxMm - PUB.annulusMinMm), -0.5, 1.5);
  return C.cofRefN * (1 - C.cofSlopePerMm * (PUB.annulusMaxMm - PUB.annulusMinMm) * t);
}
// radial force at the annulus: the section lying at the annulus (depth mm from the inflow edge), scaled by how far it has opened against the wall
export function radialForce(rEff, depthMm) {
  const e = sectionExpansion(crimpCoord(Math.max(0.5, depthMm)), rEff);
  const rFree = C.frameCrimpRadiusMm + e * (C.frameFreeRadiusMm - C.frameCrimpRadiusMm);
  const over = Math.max(0, rFree - C.annulusRadiusMm) * (1 - C.annulusCompliance);
  const contact = smooth(0, (C.frameFreeRadiusMm - C.annulusRadiusMm) * (1 - C.annulusCompliance), over); // 0 until the frame touches the wall, 1 when it carries its chronic outward force
  return chronicOutwardForce() * contact;
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
// NCC-minus-left-cusp depth difference the frame settles to. Positive = left-cusp side higher than the NCC side.
// Deck (step 3): landing too LOW on the LCC -> gentle push on the LV wire (tilts to the outer curve) and/or a gentle forward push on the system;
// landing too HIGH on the LCC -> gently pull the system back (tilts to the inner curve).
export function tiltTarget(ctx) {
  const stab = ctx.stab;
  const wirePush = clamp((0.3 - (ctx.wtens ?? 0.3)) / 0.3, 0, 1);          // wire tension below neutral = the wire is being pushed
  const sysPush = clamp(((ctx.press ?? 0.5) - 0.5) / 0.5, -1, 1);          // system pressure above neutral = forward push, below = pull
  return ctx.tiltBase + C.tiltPerInstabilityMm * (1 - stab) + C.tiltPerLateralMm * Math.abs(ctx.lat || 0) + C.kStiffTiltMm * Math.max(0, (ctx.wireStiff ?? 1) - 1)
    + C.kWirePushTiltMm * wirePush + C.kSysTiltMm * sysPush;
}
// uncontrolled migration (mm per second) when the wheel is too fast; sign follows the net force
export function migrationRate(speedMmS, post80, ctx) {
  const lim = post80 ? C.safeSpeedPost80MmS : C.safeSpeedMmS;
  if (speedMmS <= lim) return 0;
  return (speedMmS - lim) * C.migrationMmPerMmS * forceDirection(ctx);
}
// spring-back impulse (mm, signed: + deeper) when the crown springs open fast
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
  // migration (too fast a wheel) and spring-back (crown) accumulate into the targets
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
// depth verdict against the IFU target (3 mm): used by the readouts
export function depthVerdict(h) {
  if (h < 2) return { key: 'high', text: 'HIGH: embolisation / coronary risk' };
  if (h < 3) return { key: 'highish', text: 'a little high (target 3 mm)' };
  if (h <= 4.5) return { key: 'good', text: 'on target (3 mm, up to 4.5 acceptable)' };
  if (h <= 6) return { key: 'deep', text: 'DEEP: conduction / PVL risk' };
  return { key: 'vdeep', text: 'very deep: on the membranous septum' };
}
