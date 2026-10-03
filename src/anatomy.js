// Parametric anatomy (mm). Patient frame: X = left, Y = head, Z = anterior. Origin = centre of the aortic annulus.
import * as THREE from 'three';
import { D2R, R2D, clamp, lerp, smooth, beamDir, mulberry32, CASE } from './util.js';

export const R_ANN = CASE.annulusMm / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- root frame: the two "true" edge-on beams define the annular plane exactly ----------
export function buildFrame() {
  const b1 = beamDir(CASE.cuspOverlapTrue.lao, CASE.cuspOverlapTrue.cra);
  const b2 = beamDir(CASE.threeCuspTrue.lao, CASE.threeCuspTrue.cra);
  const n = new THREE.Vector3().crossVectors(b1, b2).normalize();
  if (n.y < 0) n.negate();
  // azimuth 0 = screen-right of the cusp-overlap view (RCC/LCC commissure). NCC is at 180 (screen-left).
  const ex = new THREE.Vector3().crossVectors(b1.clone().negate(), n).normalize();
  const ey = new THREE.Vector3().crossVectors(n, ex).normalize();
  const dir = (az, out = new THREE.Vector3()) => out.copy(ex).multiplyScalar(Math.cos(az * D2R)).addScaledVector(ey, Math.sin(az * D2R));
  const cuspAz = { RCC: -60, LCC: 60, NCC: 180 };
  const commAz = { RL: 0, LN: 120, NR: 240 };
  const azOf = v => Math.atan2(v.dot(ey), v.dot(ex)) * R2D;
  return { b1, b2, n, ex, ey, dir, cuspAz, commAz, azOf,
    pt: (az, r, z, out = new THREE.Vector3()) => dir(az, out).multiplyScalar(r).addScaledVector(n, z) };
}

// ---------- centreline (also the stiff-wire path) ----------
export class Path {
  constructor(pts, radii) {
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = this.curve.getLength();
    const N = Math.round(len);
    this.P = this.curve.getSpacedPoints(N);
    this.N = N; this.h = len / N; this.length = len;
    this.T = this.P.map((p, i) => { const a = this.P[Math.max(0, i - 1)], b = this.P[Math.min(N, i + 1)]; return b.clone().sub(a).normalize(); });
    const w = 14;
    this.K = this.P.map((_, i) => { const a = this.T[Math.max(0, i - w)], b = this.T[Math.min(N, i + w)]; const span = (Math.min(N, i + w) - Math.max(0, i - w)) * this.h; return b.clone().sub(a).multiplyScalar(1 / Math.max(span, 1)); });
    this.kappa = this.K.map(k => k.length());
    this.wp = pts.map(p => this.nearest(p)); // arclength (mm) of every waypoint
    this.radii = radii;
    { // smoothed flex requirement
      const raw = this.kappa.map(k => 0.92 * (1 - Math.exp(-k * 60))); const w2 = 32; this.flexArr = raw.map((_, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - w2); j <= Math.min(N, i + w2); j++) { a += raw[j]; c++; } return a / c; });
    }
    // parallel transport frames
    this.Nn = []; this.Bn = [];
    let nrm = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= N; i++) {
      const t = this.T[i];
      nrm = nrm.clone().addScaledVector(t, -nrm.dot(t));
      if (nrm.lengthSq() < 1e-6) nrm.set(1, 0, 0).addScaledVector(t, -t.x);
      nrm.normalize();
      this.Nn.push(nrm.clone()); this.Bn.push(new THREE.Vector3().crossVectors(t, nrm).normalize());
    }
  }
  nearest(p) { let best = 1e9, bi = 0; for (let i = 0; i <= this.N; i++) { const d = this.P[i].distanceToSquared(p); if (d < best) { best = d; bi = i; } } return bi * this.h; }
  idx(s) { return clamp(s / this.h, 0, this.N); }
  _lerpV(arr, s, out) { const f = this.idx(s), i = Math.floor(f), j = Math.min(this.N, i + 1), t = f - i; return out.copy(arr[i]).lerp(arr[j], t); }
  pos(s, out = new THREE.Vector3()) {
    if (s < 0) return out.copy(this.P[0]).addScaledVector(this.T[0], s);
    if (s > this.length) return out.copy(this.P[this.N]).addScaledVector(this.T[this.N], s - this.length);
    return this._lerpV(this.P, s, out);
  }
  tan(s, out = new THREE.Vector3()) { return this._lerpV(this.T, s, out).normalize(); }
  kap(s) { const f = this.idx(s), i = Math.floor(f), j = Math.min(this.N, i + 1); return lerp(this.kappa[i], this.kappa[j], f - i); }
  outer(s, out = new THREE.Vector3()) { // unit vector pointing away from the centre of curvature (greater-curve side)
    this._lerpV(this.K, s, out); if (out.lengthSq() < 1e-9) return out.set(0, 0, 0); return out.normalize().negate();
  }
  radius(s) { // piecewise smooth interpolation through waypoint radii
    const w = this.wp; if (s <= w[0]) return this.radii[0]; if (s >= w[w.length - 1]) return this.radii[this.radii.length - 1];
    let i = 0; while (i < w.length - 2 && s > w[i + 1]) i++;
    return lerp(this.radii[i], this.radii[i + 1], smooth(w[i], w[i + 1], s));
  }
  flexReq(s) { const f = this.idx(s), i = Math.floor(f), j = Math.min(this.N, i + 1); return lerp(this.flexArr[i], this.flexArr[j], f - i); }
  shift(s) { return 6 * this.flexReq(s); } // lumen is displaced to the greater curve relative to the wire path
}

export function buildPaths(F) {
  const n = F.n;
  const A = t => n.clone().multiplyScalar(t);
  const pts = [], rad = [];
  const add = (p, r) => { pts.push(p); rad.push(r); };
  add(V(-92, -520, 36), 3);   // outside the skin
  add(V(-80, -488, 28), 4.6); // right CFA (large-bore side)
  add(V(-70, -450, 16), 4.4);
  add(V(-58, -414, 6), 4.2);
  add(V(-68, -380, -4), 4.0);  // first iliac bend (tortuous)
  add(V(-52, -350, -12), 3.4);  // calcified plaque sits on this stretch
  add(V(-60, -320, -20), 3.8);  // second bend
  add(V(-38, -290, -32), 5.2);
  add(V(-12, -262, -46), 7);   // bifurcation
  add(V(2, -225, -56), 9);
  add(V(12, -170, -62), 9.8);
  add(V(20, -115, -66), 10.8);
  add(V(28, -40, -70), 11.4);
  add(V(32, 30, -68), 11.6);   // descending thoracic
  add(V(32, 80, -62), 11.8);
  add(V(24, 120, -50), 13.5);
  add(V(-2, 148, -34), 15);
  add(V(-50, 150, -16), 15.5);
  add(V(-95, 138, -4), 16);
  add(A(150), 16.5); add(A(110), 16.5); add(A(70), 16.2); add(A(36), 16.2);
  add(A(0), 14);               // annulus (origin)
  add(A(-30), 12.5); add(A(-60), 12); add(A(-92), 10); // LV
  const path = new Path(pts, rad);
  const lm = {
    cfa: path.wp[1], plaque: path.wp[5], bif: path.wp[8],
    descStart: path.wp[11], descTop: path.wp[14], archStart: path.wp[14], archApex: path.wp[17],
    ascTop: path.wp[18], ann: 0, skin: path.wp[1] - 6,
  };
  lm.ann = path.nearest(V(0, 0, 0));
  lm.ascDone = lm.ann - 45;
  lm.apex = lm.ann + 92;
  // left iliac (for the pigtail access)
  const left = new Path([V(-12, -262, -46), V(26, -296, -40), V(54, -340, -28), V(68, -396, -14), V(80, -460, 4), V(90, -520, 20)], [7, 4.6, 4.4, 4.3, 4.3, 3]);
  return { path, lm, left, A, pts };
}

// ---------- mesh helpers ----------
export function tubeGeom(path, s0, s1, radiusFn, { radial = 20, step = 3, shiftFn = null } = {}) {
  const rings = Math.max(2, Math.ceil((s1 - s0) / step)) + 1;
  const pos = new Float32Array(rings * (radial + 1) * 3), aS = new Float32Array(rings * (radial + 1));
  const idx = [];
  const p = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const s = lerp(s0, s1, i / (rings - 1));
    path.pos(s, p);
    const k = clamp(s / path.h, 0, path.N), a = Math.floor(k), t = k - a, b = Math.min(path.N, a + 1);
    const Nn = path.Nn[a].clone().lerp(path.Nn[b], t).normalize(), Bn = path.Bn[a].clone().lerp(path.Bn[b], t).normalize();
    if (shiftFn) { path.outer(s, o); p.addScaledVector(o, shiftFn(s)); }
    const r = radiusFn(s);
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), q = (i * (radial + 1) + j) * 3;
      pos[q] = p.x + (Nn.x * c + Bn.x * sn) * r; pos[q + 1] = p.y + (Nn.y * c + Bn.y * sn) * r; pos[q + 2] = p.z + (Nn.z * c + Bn.z * sn) * r;
      aS[i * (radial + 1) + j] = i / (rings - 1);
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// surface of revolution about the root axis with 3 sinus lobes; profile(z) -> [base, lobe]
export function rootGeom(F, z0, z1, profile, { nz = 36, nt = 54 } = {}) {
  const pos = [], aS = [], idx = [];
  for (let i = 0; i <= nz; i++) {
    const z = lerp(z0, z1, i / nz);
    const [base, lobe] = profile(z);
    for (let j = 0; j <= nt; j++) {
      const th = (j / nt) * 360;
      const r = base + lobe * Math.cos(3 * (th - 180) * D2R);
      const p = F.pt(th, r, z); pos.push(p.x, p.y, p.z); aS.push(i / nz);
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b = a + nt + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export const sinusProfile = z => {
  let base;
  if (z <= 0) base = lerp(12.6, 12, smooth(-3, 0, z));
  else if (z < 12) base = lerp(12, 15.2, smooth(0, 12, z));
  else if (z < 24) base = lerp(15.2, 13.6, smooth(12, 24, z));
  else base = lerp(13.6, 16.4, smooth(24, 38, z));
  const lobe = 2.9 * Math.pow(Math.sin(Math.PI * clamp(z / 24, 0, 1)), 1.2);
  return [base, lobe];
};
export const lvProfile = z => { // z negative (into LV)
  const d = -z;
  const pts = [[0, 12.4], [8, 15], [22, 24], [42, 33], [64, 30], [84, 18], [96, 0.5]];
  let r = 0.5;
  for (let i = 0; i < pts.length - 1; i++) if (d >= pts[i][0] && d <= pts[i + 1][0]) r = lerp(pts[i][1], pts[i + 1][1], smooth(pts[i][0], pts[i + 1][0], d));
  return [r, 0];
};
