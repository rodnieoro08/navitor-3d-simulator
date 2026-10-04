// Smooth centreline of the FlexNav delivery system (tip -> handle), shared by the 3D tubes, the fluoro strokes and the tests.
// Built per frame from the anatomical path + a smooth lateral offset (flex mismatch), then relaxed so that the bending radius never
// drops below a limit (stiffer / longer rigid section at the capsule and nosecone). Offsets are low-pass filtered in time (no jitter).
import * as THREE from 'three';

export const CL = {
  step: 2,            // mm between samples along the system
  total: 1000,        // mm of system modelled (tip to handle)
  rFlex: 22,          // mm: minimum bending radius of the sheath / outer shaft (teaching estimate)
  rRigid: 32,         // mm: minimum bending radius of the rigid capsule + nosecone section
  rigidBlend: 24,     // mm over which the limit changes from rigid to flexible
  decay: 85,          // mm: how far a lateral offset persists along the shaft
  tau: 0.07,          // s: time constant of the temporal offset smoothing
  passes: 50,       // fixed relaxation passes per frame
  maxOff: 1.0,      // mm: the most the device axis may sit off the wire (rail) - lumen clearance, only where the shaft is flexed in a bend
  offScale: 7,      // mm of gameplay 'lat' at which the visual clearance is ~76% of maxOff (tanh)
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Centreline {
  constructor(F, path) {
    this.F = F; this.path = path; this.n = Math.floor(CL.total / CL.step) + 1;
    const n = this.n;
    this.P = new Float64Array(n * 3); this.T = new Float64Array(n * 3); this.Nn = new Float64Array(n * 3); this.Bn = new Float64Array(n * 3);
    this.off = new Float64Array(n * 3); this.fresh = true; this.lastS = null;
    this.rigidEnd = 74; this.maxTurn = 0;
    this._buildField();
  }
  // smooth unit-ish lateral direction field along the path (outer curve where it bends, patient-lateral where it is straight)
  _buildField() {
    const path = this.path, F = this.F, N = path.N; const U = new Float64Array((N + 1) * 3); const o = new THREE.Vector3();
    for (let i = 0; i <= N; i++) { const s = i * path.h; const k = path.kappa[i], w = sm(0.0006, 0.004, k); path.outer(s, o); U[i * 3] = o.x * w + F.ex.x * (1 - w); U[i * 3 + 1] = o.y * w + F.ex.y * (1 - w); U[i * 3 + 2] = o.z * w + F.ex.z * (1 - w); }
    const hw = Math.max(2, Math.round(24 / path.h)); // three box passes ~ gaussian, sigma ~ 24 mm
    let A = U, B = new Float64Array(U.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let c = 0; c < 3; c++) { const pre = new Float64Array(N + 2); for (let i = 0; i <= N; i++) pre[i + 1] = pre[i] + A[i * 3 + c]; for (let i = 0; i <= N; i++) { const lo = Math.max(0, i - hw), hi = Math.min(N, i + hw); B[i * 3 + c] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1); } }
      [A, B] = [B, A];
    }
    for (let i = 0; i <= N; i++) { const t = path.T[i]; let x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; const d = x * t.x + y * t.y + z * t.z; x -= d * t.x; y -= d * t.y; z -= d * t.z; const l = Math.hypot(x, y, z); const sc = 1 / Math.max(l, 0.4); A[i * 3] = x * sc; A[i * 3 + 1] = y * sc; A[i * 3 + 2] = z * sc; }
    this.U = A;
  }
  _u(s, out) { const path = this.path; const f = Math.min(path.N, Math.max(0, s / path.h)), i = Math.floor(f), j = Math.min(path.N, i + 1), t = f - i; for (let c = 0; c < 3; c++) out[c] = this.U[i * 3 + c] * (1 - t) + this.U[j * 3 + c] * t; return out; }
  reset() { this.fresh = true; this.fresh2 = true; }
  // sTip: arclength of the nosecone tip; lat: lateral offset of the tip (mm, + = greater curve side); fx: sim fail effect or null
  update(sTip, lat, fx, dt, rigidEnd = 74) {
    const n = this.n, h = CL.step, path = this.path, P = this.P, off = this.off; this.rigidEnd = rigidEnd;
    const p = this._p || (this._p = new THREE.Vector3()), u = this._uv || (this._uv = [0, 0, 0]);
    const jump = this.lastS == null || Math.abs(sTip - this.lastS) > 40; this.lastS = sTip;
    const a = (this.fresh || jump || !(dt > 0)) ? 1 : 1 - Math.exp(-Math.min(dt, 0.25) / CL.tau);
    for (let i = 0; i < n; i++) {
      const d = i * h, s = sTip - d; path.pos(s, p); this._u(Math.min(path.length, Math.max(0, s)), u);
      // WIRE AS RAIL: the device axis IS the wire (path) centreline. The only deviation is a tiny, bounded lumen clearance (<= maxOff) that exists
      // behind the rigid section and only where the vessel bends (flexed shaft); the nosecone, inner shaft and capsule sit exactly on the wire.
      const kw = sm(0.0006, 0.004, path.kappa[Math.min(path.N, Math.max(0, Math.round(Math.min(path.length, Math.max(0, s)) / path.h)))]);
      const g = CL.maxOff * Math.tanh(lat / CL.offScale) * sm(rigidEnd, rigidEnd + 30, d) * Math.exp(-Math.max(0, d - rigidEnd - 30) / CL.decay) * kw;
      for (let c = 0; c < 3; c++) { const tgt = g * u[c]; off[i * 3 + c] += (tgt - off[i * 3 + c]) * a; }
      P[i * 3] = p.x + off[i * 3]; P[i * 3 + 1] = p.y + off[i * 3 + 1]; P[i * 3 + 2] = p.z + off[i * 3 + 2];
    }
    this.fresh = false;
    // failure displacement: a soft, wide bump (a 'force' failure); a kink is only a local narrowing (see kinkAt)
    if (fx && fx.type === 'force') {
      const amp = 9; const sf = fx.s, t = fx.t;
      for (let i = 0; i < n; i++) { const s = sTip - i * h, ds = s - sf; const bump = amp * Math.exp(-(ds * ds) / (2 * 16 * 16)) * sm(0, 0.25, t) * (1 - sm(1.2, 2.0, t)); if (bump < 1e-3) continue; const k = Math.round(Math.min(path.length, Math.max(0, s)) / path.h); const nn = path.Nn[k]; P[i * 3] += nn.x * bump; P[i * 3 + 1] += nn.y * bump; P[i * 3 + 2] += nn.z * bump; }
    }
    // bend-radius limit: relax, then low-pass the *correction* in time (so the limiter never flickers), then re-check
    // (only while a 'force' failure is bending the system: in normal operation the wire is the rail and the axis is not re-routed)
    const limiting = !!(fx && fx.type === 'force' && fx.t < 2.3); this.limiting = limiting;
    if (!limiting) { if (this.dl) this.dl.fill(0); this.fresh2 = true; this.passes = 0; this.frames(); return; }
    const raw = this._raw || (this._raw = new Float64Array(P.length)); raw.set(P); this.relax();
    const dl = this.dl || (this.dl = new Float64Array(P.length)); const a2 = (this.fresh2 || jump || !(dt > 0)) ? 1 : 1 - Math.exp(-Math.min(dt, 0.25) / CL.tau); this.fresh2 = false;
    for (let k = 0; k < P.length; k++) { dl[k] += ((P[k] - raw[k]) - dl[k]) * a2; P[k] = raw[k] + dl[k]; }
    this.relax();
    this.frames();
  }
  // soft local narrowing for a kink failure: returns radius multiplier at distance d from the tip
  kinkScale(d, fx, sTip) {
    if (!fx || fx.type !== 'kink') return 1;
    const ds = (sTip - d) - Math.max(fx.s - 120, 40), t = fx.t; /* the kink sits in the sheath behind the capsule, in the bend that was over-flexed */
    const env = sm(0, 0.25, t) * (1 - sm(1.2, 2.0, t));
    return 1 - 0.5 * env * Math.exp(-(ds * ds) / (2 * 5 * 5));
  }
  // enforce the minimum bending radius (rigid near the tip): local 1-2-1 relaxation until every turning angle is under its limit
  _limit(i) { const d = i * CL.step; const R = CL.rRigid + (CL.rFlex - CL.rRigid) * sm(this.rigidEnd, this.rigidEnd + CL.rigidBlend, d); return CL.step / R; }
  // Deterministic, continuous limiter: a FIXED number of smoothing passes whose per-sample weight rises smoothly as the local turn nears its limit.
  // (No early exit and no thresholds, so the result is a smooth function of the input and cannot flicker between frames.)
  relax() {
    const n = this.n, P = this.P; const tmp = this._tmp || (this._tmp = new Float64Array(P.length)), wt = this._wt || (this._wt = new Float64Array(n)), x = this._x || (this._x = new Float64Array(n));
    const cosLim = this._cl || (this._cl = new Float64Array(n)); for (let i = 1; i < n - 1; i++) cosLim[i] = 1 - Math.cos(this._limit(i));
    const meas = (a = 1, b = n - 2) => { for (let i = a; i <= b; i++) { const ax = P[i * 3] - P[(i - 1) * 3], ay = P[i * 3 + 1] - P[(i - 1) * 3 + 1], az = P[i * 3 + 2] - P[(i - 1) * 3 + 2], bx = P[(i + 1) * 3] - P[i * 3], by = P[(i + 1) * 3 + 1] - P[i * 3 + 1], bz = P[(i + 1) * 3 + 2] - P[i * 3 + 2]; const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz); x[i] = la < 1e-6 || lb < 1e-6 ? 0 : (1 - (ax * bx + ay * by + az * bz) / (la * lb)) / cosLim[i]; } };
    meas(); let lo = n, hi = 0; for (let i = 1; i < n - 1; i++) if (x[i] > 0.25) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
    if (hi < lo) { this.passes = 0; return; }
    lo = Math.max(1, lo - 16); hi = Math.min(n - 2, hi + 16); tmp.set(P);
    for (let pass = 0; pass < CL.passes; pass++) {
      meas(lo, hi);
      for (let i = lo; i <= hi; i++) { const t = Math.min(1, Math.max(0, (x[i] - 0.55) / 0.45)); wt[i] = 0.85 * t * t * (3 - 2 * t); }
      for (let i = lo; i <= hi; i++) { const w = Math.max(wt[i], i > lo ? wt[i - 1] * 0.9 : 0, i < hi ? wt[i + 1] * 0.9 : 0); for (let c = 0; c < 3; c++) tmp[i * 3 + c] = P[i * 3 + c] * (1 - w) + w * 0.5 * (P[(i - 1) * 3 + c] + P[(i + 1) * 3 + c]); }
      for (let i = lo; i <= hi; i++) for (let c = 0; c < 3; c++) P[i * 3 + c] = tmp[i * 3 + c];
    }
    this.passes = CL.passes;
  }
  frames() {
    const n = this.n, P = this.P, T = this.T, N = this.Nn, B = this.Bn; let mt = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let x = P[b * 3] - P[a * 3], y = P[b * 3 + 1] - P[a * 3 + 1], z = P[b * 3 + 2] - P[a * 3 + 2]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; T[i * 3] = x; T[i * 3 + 1] = y; T[i * 3 + 2] = z;
      let nx, ny, nz;
      if (i === 0) { nx = 0; ny = 0; nz = 1; if (Math.abs(z) > 0.9) { nx = 1; nz = 0; } } else { nx = N[(i - 1) * 3]; ny = N[(i - 1) * 3 + 1]; nz = N[(i - 1) * 3 + 2]; }
      const dd = nx * x + ny * y + nz * z; nx -= dd * x; ny -= dd * y; nz -= dd * z; const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz; B[i * 3] = y * nz - z * ny; B[i * 3 + 1] = z * nx - x * nz; B[i * 3 + 2] = x * ny - y * nx;
      if (i > 0 && i < n - 1) { mt = Math.max(mt, this.turnAt(i)); }
    }
    this.maxTurn = mt;
  }
  turnAt(i) { const P = this.P; const ax = P[i * 3] - P[(i - 1) * 3], ay = P[i * 3 + 1] - P[(i - 1) * 3 + 1], az = P[i * 3 + 2] - P[(i - 1) * 3 + 2], bx = P[(i + 1) * 3] - P[i * 3], by = P[(i + 1) * 3 + 1] - P[i * 3 + 1], bz = P[(i + 1) * 3 + 2] - P[i * 3 + 2]; const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz); if (la < 1e-6 || lb < 1e-6) return 0; return Math.acos(Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / (la * lb)))) * 180 / Math.PI; }
  // sampling helpers (d = mm behind the tip)
  _ix(d) { const f = Math.min(this.n - 1, Math.max(0, d / CL.step)); const i = Math.min(this.n - 2, Math.floor(f)); return [i, f - i]; }
  at(d, out = new THREE.Vector3()) { const [i, t] = this._ix(d), P = this.P; return out.set(P[i * 3] * (1 - t) + P[(i + 1) * 3] * t, P[i * 3 + 1] * (1 - t) + P[(i + 1) * 3 + 1] * t, P[i * 3 + 2] * (1 - t) + P[(i + 1) * 3 + 2] * t); }
  offsetAt(d, out = new THREE.Vector3()) { const [i, t] = this._ix(d), P = this.off; return out.set(P[i * 3] * (1 - t) + P[(i + 1) * 3] * t, P[i * 3 + 1] * (1 - t) + P[(i + 1) * 3 + 1] * t, P[i * 3 + 2] * (1 - t) + P[(i + 1) * 3 + 2] * t); }
  // unit tangent pointing away from the tip (toward the handle)
  tan(d, out = new THREE.Vector3()) { const [i, t] = this._ix(d), P = this.T; return out.set(P[i * 3] * (1 - t) + P[(i + 1) * 3] * t, P[i * 3 + 1] * (1 - t) + P[(i + 1) * 3 + 1] * t, P[i * 3 + 2] * (1 - t) + P[(i + 1) * 3 + 2] * t).normalize(); }
  frameAt(d, nOut, bOut) { const [i, t] = this._ix(d), N = this.Nn, B = this.Bn; nOut.set(N[i * 3] * (1 - t) + N[(i + 1) * 3] * t, N[i * 3 + 1] * (1 - t) + N[(i + 1) * 3 + 1] * t, N[i * 3 + 2] * (1 - t) + N[(i + 1) * 3 + 2] * t).normalize(); bOut.set(B[i * 3] * (1 - t) + B[(i + 1) * 3] * t, B[i * 3 + 1] * (1 - t) + B[(i + 1) * 3 + 1] * t, B[i * 3 + 2] * (1 - t) + B[(i + 1) * 3 + 2] * t).normalize(); }
}
