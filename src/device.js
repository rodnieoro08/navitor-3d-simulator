// FlexNav delivery system modelled as separate named parts, plus stiff wire.
import * as THREE from 'three';
import { D2R, clamp, lerp, smooth } from './util.js';
import { anatMat, fluMat, fluTube } from './scene.js';
import { Centreline, CL } from './centreline.js';
import { VarTube } from './tube.js';
import { R_ANN } from './anatomy.js';

export const DEV = { noseL: 22, Lv: 40, Lcap: 52, Rn: 4.3, Rshaft: 2.3, Rsheath: 3.4, Rinner: 1.4, total: 1000, seg: 4, rCrimp: 2.8, capWall: 0.5, strutR: 0.34, postR: 0.55, markerU: 3.0 };   // markerU: Vision markers sit 3 mm above the inflow edge, each in line with a commissural post
export const PARTS = {
  sheath: { name: 'Integrated hydrophilic sheath', info: 'Part of the system - no separate large introducer. Rotate it together with the system as it enters.' },
  outerShaft: { name: 'Outer shaft', info: 'Carries the flex and torque. Under-flexed in the arch it rides the greater curve.' },
  capsule: { name: 'Valve capsule', info: 'Holds the crimped valve. Retracts proximally with the deployment wheel - inflow is released first.' },
  capsuleMarker: { name: 'Capsule marker (radiopaque)', info: 'Ring at the capsule edge. Shows how far the capsule has been withdrawn.' },
  innerShaft: { name: 'Inner shaft', info: 'The valve rides on it. It stays put while the capsule retracts.' },
  innerMarker: { name: 'Inner-shaft marker band', info: 'Place this at the annular plane before unsheathing (phase 4).' },
  nosecone: { name: 'Nosecone', info: 'White atraumatic tip with the wire exit hole on its axis. Closed again with the macro slide only - never with the deployment wheel.' },
  visionMarkers: { name: 'Vision markers (3 x 3 mm)', info: 'Three radiopaque markers 3 mm above the inflow edge, each exactly in line with a commissural post (120 deg apart). Their height is your depth target; their spacing and which one is on which side show rotation and commissure alignment.' },
  frame: { name: 'Nitinol frame (diamond cells)', info: 'Silver self-expanding lattice: small dense diamond cells at the inflow, a waist at the leaflets, then large elongated cells flaring to three tall arched peaks (a bead on each post tip). Foreshortens as it opens. In fluoro it is a dark lattice, densest at the inflow.' },
  posts: { name: 'Commissural posts', info: 'Three posts running up to the arched outflow peaks, each directly above a Vision marker. Line them up with the native commissures to keep coronary access.' },
  cuff: { name: 'NaviSeal cuff', info: 'Fabric cuff over the inflow / lower portion of the frame (faint in fluoro); seals against the annulus and calcium once the valve is released.' },
  leaflets: { name: 'Intra-annular leaflets', info: 'Visible once unsheathed. Closed before release, open flat against the frame after.' },
};

export class Device {
  constructor(scene, reg, F, P, rootGroup) {
    this.scene = scene; this.reg = reg; this.F = F; this.P = P; this.path = P.path; this.lm = P.lm;
    this.parts = {}; for (const k in PARTS) this.parts[k] = [];
    this.hl = null; this.t = 0;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    const mk = (id, count, anat, flu, o = {}) => {
      const m = new THREE.InstancedMesh(cyl, anat, count); m.count = 0; m.userData.part = id;
      scene.add(m); reg.add(m, { anat, flu, group: 'device' }); this.parts[id].push(m); return m;
    };
    this.matA = {
      sheath: anatMat(0x7fd0ff, 0.42, { emissive: 0x001a2a }), outerShaft: anatMat(0xb7c0cc, 0.55, { metal: 0.4 }), capsule: anatMat(0x5fa3ff, 0.55, { emissive: 0x001533, metal: 0.3 }),
      innerShaft: anatMat(0xf5f5f5, 0.7), nosecone: anatMat(0xffffff, 0.74, { emissive: 0x909090, rough: 0.5 }), noseOutline: anatMat(0x2c3a4d, 1, { rough: 0.6 }), tipHole: anatMat(0x04100e, 1),
      capsuleMarker: anatMat(0xffd54a, 1, { emissive: 0x6a5000 }), innerMarker: anatMat(0xff8a3d, 1, { emissive: 0x5a2200 }),
      vision: anatMat(0xff3b52, 1, { emissive: 0x70101c }), posts: anatMat(0xf1ead0, 1, { emissive: 0x3a3418, metal: 0.5, rough: 0.35 }),
      cuff: anatMat(0xe9ecee, 0.8, { emissive: 0x1a1d20, rough: 0.9 }), leaflets: anatMat(0xf3e6c2, 0.92, { emissive: 0x3a3018, rough: 0.8 }), frame: anatMat(0xdde4ec, 1, { metal: 0.85, rough: 0.28, emissive: 0x1b2230 }), foot: anatMat(0x2a2f36, 1, { metal: 0.6, rough: 0.4 }), bead: anatMat(0xf4f7fa, 1, { metal: 0.95, rough: 0.2, emissive: 0x20262e }),
    };
    this.cl = new Centreline(F, P.path);
    const tube = (id, maxRings, anat, flu, radial = 14) => { const t = new VarTube(maxRings, radial); const m = new THREE.Mesh(t.geo, anat); m.userData.part = id; scene.add(m); reg.add(m, { anat, flu, group: 'device' }); this.parts[id].push(m); m.userData.tube = t; return t; };
    this.tSheath = tube('sheath', 520, this.matA.sheath, fluTube(0.045, 0.45));
    this.tShaft = tube('outerShaft', 40, this.matA.outerShaft, fluTube(0.07, 0.4));
    this.tCap = tube('capsule', 60, this.matA.capsule, fluTube(0.16, 0.3), 16);
    this.tInner = tube('innerShaft', 60, this.matA.innerShaft, fluTube(0.14, 0.4));
    this.matA.noseOutline.side = THREE.FrontSide;   // thin dark-slate rim behind the white nosecone (VarTube winding is inward-facing, so FrontSide = the far wall) so it reads against the anatomy and the white NaviSeal / inner shaft (3D only, not drawn in fluoro)
    this.tNose = tube('nosecone', 60, this.matA.nosecone, fluTube(0.2, 0.3), 16);
    this.tNoseOut = tube('nosecone', 60, this.matA.noseOutline, null, 16);
    const solo = (id, a, f, geo = cyl) => { const m = new THREE.Mesh(geo, a); scene.add(m); reg.add(m, { anat: a, flu: f, group: 'device' }); m.userData.part = id; this.parts[id].push(m); return m; };
    this.tipHole = solo('nosecone', this.matA.tipHole, fluMat(0));   // dark wire-exit hole in the nosecone tip face
    this.capMarker = solo('capsuleMarker', this.matA.capsuleMarker, fluMat(0.95));
    this.innerMarker = solo('innerMarker', this.matA.innerMarker, fluMat(0.9));
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.vision = [0, 1, 2].map(() => solo('visionMarkers', this.matA.vision, fluMat(1.0), box));
    this.posts = [0, 1, 2].map(() => { const t = new VarTube(12, 8); const m = new THREE.Mesh(t.geo, this.matA.posts); m.userData.part = 'posts'; m.userData.tube = t; scene.add(m); reg.add(m, { anat: this.matA.posts, flu: fluTube(0.7, 0.4), group: 'device' }); this.parts.posts.push(m); return m; });
    this.postPts = [0, 1, 2].map(() => Array.from({ length: 9 }, () => new THREE.Vector3()));
    this.crimpBody = new VarTube(40, 12); { const m = new THREE.Mesh(this.crimpBody.geo, this.matA.cuff); m.userData.part = 'frame'; scene.add(m); reg.add(m, { anat: null, flu: fluTube(0.1, 0.55), group: 'device' }); this.parts.frame.push(m); }
    // valve lattice (frame), cuff, leaflets: dynamic geometries
    // nitinol frame: 3 rows of large diamond cells, 9 around (see update()). Struts are thin instanced cylinders so they show in 3D and in fluoro.
    this.nC = 12; this.nRows = 4; this.nSub = 3;     // dense inflow: 12 cells around (2 rows); outflow: 6 large elongated cells (2 rows) ending in 3 tall arched peaks
    this.strutCount = 276;                              // total strut pieces of the full lattice (see update())
    this.struts = mk('frame', 300, this.matA.frame, fluMat(0.3));
    // feet at the inflow rim (the 9 non-marker nodes), eyelet blocks on the mid-height vertical struts, one bead on each commissural-post tip
    const mkG = (id, count, geo, anat, flu) => { const m = new THREE.InstancedMesh(geo, anat, count); m.count = 0; m.userData.part = id; scene.add(m); reg.add(m, { anat, flu, group: 'device' }); this.parts[id].push(m); return m; };
    this.feet = mkG('frame', 9, new THREE.SphereGeometry(1, 10, 8), this.matA.foot, fluMat(0.75));
    this.eyelets = mkG('frame', 6, new THREE.BoxGeometry(1, 1, 1), this.matA.frame, fluMat(0.3));
    this.beads = mkG('frame', 3, new THREE.SphereGeometry(1, 12, 10), this.matA.bead, fluMat(1.0));
    this.nodes = [];
    const dyn = (id, nu, nv, a, f) => {
      const g = new THREE.BufferGeometry(); const pos = new Float32Array((nu + 1) * (nv + 1) * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const idx = []; for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p = i * (nv + 1) + j, q = p + nv + 1; idx.push(p, q, p + 1, q, q + 1, p + 1); } g.setIndex(idx);
      const m = new THREE.Mesh(g, a); scene.add(m); reg.add(m, { anat: a, flu: f, group: 'device', show: false }); m.userData.part = id; this.parts[id].push(m); m.userData.pos = pos; m.userData.nu = nu; m.userData.nv = nv; return m;
    };
    this.cuff = dyn('cuff', 72, 8, this.matA.cuff, fluMat(0.16));
    this.leaf = [0, 1, 2].map(() => dyn('leaflets', 16, 8, this.matA.leaflets, fluMat(0.1)));
    this.parts.visionMarkers.push(...[]); // already pushed via solo
    this.wireTube = new VarTube(1100, 8);
    this.wireMesh = new THREE.Mesh(this.wireTube.geo, anatMat(0xd9e2ee, 1, { metal: 0.6 }));
    scene.add(this.wireMesh); reg.add(this.wireMesh, { anat: this.wireMesh.material, flu: fluTube(0.36, 0.35), group: 'device' });
    this.wireKey = ''; this.tmp = new THREE.Vector3();
    // glow rings for bounce visual etc
    this.ncc = F.cuspAz.NCC; this.lcc = F.cuspAz.LCC;
    const pN = F.dir(F.cuspAz.NCC).multiplyScalar(R_ANN), pL = F.dir(F.cuspAz.LCC).multiplyScalar(R_ANN);
    this.wt = pN.clone().sub(pL); this.wtLen = this.wt.length(); this.wt.normalize(); this.pN = pN; this.pL = pL;
  }
  latVec(s, out) {
    const k = this.path.kap(s), w = smooth(0.0006, 0.004, k);
    this.path.outer(s, this._o || (this._o = new THREE.Vector3()));
    return out.copy(this._o).multiplyScalar(w).addScaledVector(this.F.ex, 1 - w).normalize();
  }
  // radius profile of the self-expanding frame measured from the inflow edge
  rFull(u) {
    const pts = [[0, 12.6], [7, 13.4], [16, 12.7], [26, 14.7], [40, 17.4]]; // cylindrical inflow, hourglass waist at the leaflets, flared outflow
    for (let i = 0; i < pts.length - 1; i++) if (u <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], smooth(pts[i][0], pts[i + 1][0], u));
    return 17.4;
  }
  rAt(u, ld) {
    if (u > ld) return DEV.rCrimp;
    const full = this.rFull(u);
    return lerp(DEV.rCrimp, full, smooth(ld, ld - 9, u));   // continuous with the crimped radius at the capsule mouth
  }
  // outer radius of the capsule wall at distance u behind its mouth (rigid body, bevelled mouth, tapered shoulder); inner radius = outer - capWall
  capOuterR(u) { return (DEV.Rn - 0.3 * (1 - smooth(0, 1.6, u))) * (1 - (1 - (DEV.Rshaft + 0.5) / DEV.Rn) * smooth(DEV.Lcap - 5, DEV.Lcap, u)); }
  capInnerR(u) { return this.capOuterR(u) - DEV.capWall; }
  // centre point + orthonormal frame of the valve at height u above the inflow edge. Unreleased: ON the smooth capsule centreline (same spline
  // and tangent frame as the capsule tube); the flex offset only relaxes for the part that has already left the capsule (it self-centres).
  frameU(u, ld, C, E1, E2, T) {
    if (this.rel) { C.copy(this.vo).addScaledVector(this.va, u * (this.kz || 1)); E1.copy(this.ve1); E2.copy(this.ve2); T.copy(this.va); return; }
    const cl = this.cl, d = Math.min(CL.total - 3, Math.max(0, DEV.noseL + u * (this.kz || 1)));
    const w = this.bl * (1 - smooth(ld - 9, ld, u));
    cl.at(d, C); if (w > 1e-4) { cl.offsetAt(d, this._fo || (this._fo = new THREE.Vector3())); C.addScaledVector(this._fo, -w); }
    cl.tan(d, T);
    if (w > 1e-4) { this.path.tan(this.sTipNow - d, this._fp || (this._fp = new THREE.Vector3())).negate(); T.multiplyScalar(1 - w).addScaledVector(this._fp, w).normalize(); }
    E1.copy(this.F.ex).addScaledVector(T, -this.F.ex.dot(T)); if (E1.lengthSq() < 1e-6) E1.copy(this.F.ey).addScaledVector(T, -this.F.ey.dot(T)); E1.normalize(); E2.crossVectors(T, E1);
  }
  // world position on the valve at height u above the inflow edge, azimuth psi (deg), radial scale
  vp(u, psi, ld, rScale, out) {
    const r = this.rAt(u, ld) * (u > ld ? 1 : rScale);
    const c = Math.cos(psi * D2R) * r, s = Math.sin(psi * D2R) * r;
    const C = this._vC || (this._vC = new THREE.Vector3()), E1 = this._vE1 || (this._vE1 = new THREE.Vector3()), E2 = this._vE2 || (this._vE2 = new THREE.Vector3()), T = this._vT || (this._vT = new THREE.Vector3());
    this.frameU(u, ld, C, E1, E2, T);
    out.copy(C).addScaledVector(E1, c).addScaledVector(E2, s);
    if (this.tiltK) { const dz = this.tiltK * (c * this.wtE1 + s * this.wtE2) - this.tiltOff; out.addScaledVector(T, dz * this.tiltW); }
    return out;
  }
  // Test helper: every vertex of the valve that is behind the capsule mouth (i.e. inside the capsule) vs the capsule's inner radius.
  // Returns { n, minMargin, worst } where margin = capsule inner radius - (distance of the vertex from the capsule centreline + its own thickness).
  containment() {
    const cl = this.cl, n = cl.n, P = cl.P, capEdge = this.capEdgeNow; const pts = [];
    const q = new THREE.Quaternion(), mid = new THREE.Vector3(), sc = new THREE.Vector3(), m = new THREE.Matrix4(), e = new THREE.Vector3(), a = new THREE.Vector3();
    for (let k = 0; k < this.struts.count; k++) { this.struts.getMatrixAt(k, m); m.decompose(mid, q, sc); e.set(0, sc.y / 2, 0).applyQuaternion(q); pts.push([mid.x + e.x, mid.y + e.y, mid.z + e.z, DEV.strutR, 'strut'], [mid.x - e.x, mid.y - e.y, mid.z - e.z, DEV.strutR, 'strut']); }
    for (const [im, th] of [[this.feet, 0.62], [this.beads, 0.85], [this.eyelets, 0.9]]) for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m); m.decompose(mid, q, sc); pts.push([mid.x, mid.y, mid.z, th, 'detail']); }
    for (const pm of this.posts) { const t = pm.userData.tube, R1 = t.radial + 1; for (let i = 0; i < t.rings * R1; i++) pts.push([t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2], 0, 'post']); }
    for (const v of this.vision) for (let c = 0; c < 8; c++) { a.set(c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5).applyMatrix4(v.matrix); pts.push([a.x, a.y, a.z, 0, 'vision']); }
    if (this.cuff.userData.show) { const pos = this.cuff.userData.pos; for (let i = 0; i < pos.length; i += 3) pts.push([pos[i], pos[i + 1], pos[i + 2], 0, 'cuff']); }
    let minMargin = 1e9, cnt = 0, worst = null;
    for (const [x, y, z, th, kind] of pts) {
      let best = 1e9, bi = 0;
      for (let i = 0; i < n - 1; i++) { const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[i * 3 + 3] - ax, by = P[i * 3 + 4] - ay, bz = P[i * 3 + 5] - az; const l2 = bx * bx + by * by + bz * bz || 1; let t = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = ax + bx * t - x, dy = ay + by * t - y, dz = az + bz * t - z, dd = dx * dx + dy * dy + dz * dz; if (dd < best) { best = dd; bi = i + t; } }
      const d = bi * CL.step; if (d < capEdge + 0.5) continue; // not inside the capsule (it has left the mouth)
      cnt++; const margin = this.capInnerR(d - capEdge) - (Math.sqrt(best) + th); if (margin < minMargin) { minMargin = margin; worst = { kind, d: +d.toFixed(1), dist: +Math.sqrt(best).toFixed(2), inner: +this.capInnerR(d - capEdge).toFixed(2) }; }
    }
    return { n: cnt, total: pts.length, minMargin, worst };
  }
  setHighlight(id) { this.hl = id; }
  update(S, dt) {
    this.t += dt;
    const F = this.F, path = this.path, dv = S.dev;
    const sTip = dv.sd ?? dv.s, fx = S.fx;
    const lat = dv.lat, latV = new THREE.Vector3();
    const f = dv.f, Lv = DEV.Lv;
    const fv = dv.fv ?? f, kz = dv.kz || 1; this.kz = kz; // frame opening (with recapture hysteresis) and foreshortening scale from physics.js
    const capEdge = DEV.noseL + (f < 1 ? f * Lv * kz : Lv * (1 - dv.macro));
    const capEnd = capEdge + DEV.Lcap;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
    // ---------- smooth centreline (tip -> handle): anatomical path + smooth flex offset, bend-radius limited, low-passed in time ----------
    const cl = this.cl; cl.update(sTip, lat, fx, dt, capEnd);
    this.tipPos = cl.at(0, this.tipPos || new THREE.Vector3());
    const ks = (d) => cl.kinkScale(d, fx, sTip), sm = smooth;
    const noseR = (d) => lerp(1.0, DEV.Rn - 0.2, Math.pow(sm(0, DEV.noseL, d), 0.7)) * (0.8 + 0.2 * Math.sqrt(sm(0, 1.4, d)));      // tapered tip with the open wire exit hole (r 0.8 mm) on the axis
    const innerR = () => DEV.Rinner;
    const capR = (d) => this.capOuterR(d - capEdge) * ks(d); // rigid body, bevelled mouth, tapered shoulder
    const shaftR = (d) => lerp(DEV.Rshaft + 0.5, DEV.Rshaft, sm(0, 3, d - capEnd)) * lerp(1, DEV.Rsheath / DEV.Rshaft, sm(8, 14, d - capEnd)) * ks(d);
    const sheathR = (d) => DEV.Rsheath * ks(d);
    this.tNose.fromCentreline(cl, 0, DEV.noseL, 1, (d) => noseR(d));
    this.tNoseOut.fromCentreline(cl, 0, DEV.noseL, 1, (d) => noseR(d) + 0.28);
    this.tInner.fromCentreline(cl, DEV.noseL, capEdge, 2, innerR);
    this.tCap.fromCentreline(cl, capEdge, capEnd, 2, capR);
    this.tShaft.fromCentreline(cl, capEnd, capEnd + 14, 2, shaftR);
    this.tSheath.fromCentreline(cl, capEnd + 14, DEV.total, 2, sheathR);
    // markers (follow the smooth centreline; rings sit on the capsule edge and the inner shaft)
    const posAt = (d, out) => cl.at(d, out);
    const place = (mesh, d0, d1, r) => { posAt(d0, a); posAt(d1, b); mid.copy(a).add(b).multiplyScalar(0.5); dir.copy(b).sub(a); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(up, dir); sc.set(r, len, r); m4.compose(mid, q, sc); mesh.matrix.copy(m4); mesh.matrixAutoUpdate = false; mesh.matrixWorldNeedsUpdate = true; mesh.matrixWorld.copy(m4); };
    place(this.tipHole, -0.12, 0.35, 0.84);
    place(this.capMarker, capEdge + 0.1, capEdge + 1.8, DEV.Rn + 0.25);
    place(this.innerMarker, DEV.noseL - 0.5, DEV.noseL + 1.7, 1.95);
    // ---------- valve ----------
    // The valve is built ON the smooth capsule centreline while it is in / leaving the capsule (same spline + tangent frame as the capsule tube),
    // at a crimped radius smaller than the capsule's inner radius, so it bends and flexes with the capsule and can never poke out of the wall.
    const bl = smooth(0.3, 0.8, f); this.bl = bl; this.sTipNow = sTip; this.rel = !!(dv.released && dv.valveS != null);
    let vo, axis;
    if (this.rel) { vo = path.pos(dv.valveS, new THREE.Vector3()); axis = path.tan(dv.valveS, new THREE.Vector3()).negate(); }
    else {
      vo = cl.at(DEV.noseL, new THREE.Vector3()).addScaledVector(cl.offsetAt(DEV.noseL, new THREE.Vector3()), -bl);   // the flex offset relaxes as the valve opens
      const sO = sTip - DEV.noseL; axis = cl.tan(DEV.noseL, new THREE.Vector3()).multiplyScalar(1 - bl).addScaledVector(path.tan(sO, dir).negate(), bl).normalize();
    }
    const e1 = F.ex.clone().addScaledVector(axis, -F.ex.dot(axis)).normalize(); const e2 = new THREE.Vector3().crossVectors(axis, e1);
    this.vo = vo; this.va = axis; this.ve1 = e1; this.ve2 = e2;
    const tiltTot = dv.tilt * smooth(0.35, 0.8, f);
    this.tiltW = 1; this.tiltK = tiltTot / Math.max(this.wtLen, 1) ; this.wtE1 = this.wt.dot(F.ex); this.wtE2 = this.wt.dot(F.ey);
    this.tiltOff = this.tiltK * (this.pN.dot(F.ex) * this.wtE1 + this.pN.dot(F.ey) * this.wtE2);
    // frame opening: never ahead of the capsule mouth (a recaptured frame is squeezed back into the capsule), 9 mm flare at 100%
    const ld = Math.min(fv * Lv + 9 * smooth(0.85, 1.0, fv), f * Lv + 9 * smooth(0.95, 1.0, f)), rS = 1;
    this.capEdgeNow = capEdge;
    this.ld = ld;
    const roll = dv.roll + dv.drift;
    const fC = this._fC || (this._fC = new THREE.Vector3()), fE1 = this._fE1 || (this._fE1 = new THREE.Vector3()), fE2 = this._fE2 || (this._fE2 = new THREE.Vector3()), fT = this._fT || (this._fT = new THREE.Vector3());
    // frame struts: nitinol diamond lattice. Rings (height u above the inflow edge): 0 (12 nodes, feet), 1 (12, offset half a cell), 2 (12) = dense inflow cells;
    // 3 (6 nodes) and 4 (6 nodes: 3 tall arched PEAKS on the commissural posts, 3 low valleys between them) = large elongated outflow cells.
    // Every strut is a short piece between points sampled on the (bent) centreline frame, so the lattice bends with the capsule.
    { let k = 0; const Lv2 = Lv, U0 = 0, U1 = 0.175 * Lv2, U2 = 0.35 * Lv2, U3 = 0.625 * Lv2, UV = 0.825 * Lv2, UP = Lv2;
      const P0 = this.sA || (this.sA = new THREE.Vector3()), P1 = this.sB || (this.sB = new THREE.Vector3());
      const m5 = new THREE.Matrix4(), q5 = new THREE.Quaternion(), s5 = new THREE.Vector3(), up5 = new THREE.Vector3(0, 1, 0), d5 = new THREE.Vector3(), mid5 = new THREE.Vector3();
      const strut = (A, B) => { mid5.copy(A).add(B).multiplyScalar(0.5); d5.copy(B).sub(A); const len = d5.length() + 0.1; d5.normalize(); q5.setFromUnitVectors(up5, d5); s5.set(DEV.strutR, len, DEV.strutR); m5.compose(mid5, q5, s5); this.struts.setMatrixAt(k++, m5); };
      const edge = (a0, u0, a1, u1, ns, arch) => { this.vp(u0, roll + a0, ld, rS, P0);
        for (let t = 1; t <= ns; t++) { const tt = t / ns, aa = arch ? a0 + (a1 - a0) * (1 - (1 - tt) * (1 - tt)) : lerp(a0, a1, tt); this.vp(lerp(u0, u1, tt), roll + aa, ld, rS, P1); strut(P0, P1); P0.copy(P1); } };
      for (let i = 0; i < 12; i++) for (const sg of [-1, 1]) { edge(30 * i, U0, 30 * i + 15 * sg, U1, 3, false); edge(30 * i + 15 * sg, U1, 30 * i, U2, 3, false); }  // dense inflow diamonds (rings 0-1-2)
      // note: ring-1 -> ring-2 edges run from the ring-1 node at 30i+15sg to the ring-2 node 30i; every ring-1 node gets two below and two above
      for (let i = 0; i < 6; i++) for (const sg of [-1, 1]) edge(60 * i, U2, 60 * i + 30 * sg, U3, 4, false);                                       // ring 2 (even) -> ring 3
      for (let i = 0; i < 6; i++) edge(60 * i + 30, U2, 60 * i + 30, U3, 3, false);                                                                  // ring 2 (odd) -> ring 3, vertical
      for (let i = 0; i < 6; i++) for (const sg of [-1, 1]) edge(60 * i + 30, U3, 60 * i + 30 + 30 * sg, ((i + (sg > 0 ? 1 : 0)) % 2 === 0) ? UP : UV, 5, true);  // ring 3 -> 4, arched peaks / valleys
      // marker stems: the Vision marker rides on a short stem rising from the inflow-rim node on each commissural post
      for (let p = 0; p < 3; p++) edge(120 * p, U0, 120 * p, DEV.markerU - 1.5, 2, false);
      this.struts.count = k; this.struts.instanceMatrix.needsUpdate = true; this.struts.userData.show = true; this.strutCountNow = k;
      // feet, eyelets, beads
      const place2 = (mesh, idx, c, sx, sy, sz) => { m5.compose(c, q5.identity(), s5.set(sx, sy, sz)); mesh.setMatrixAt(idx, m5); };
      const cv = this.sC || (this.sC = new THREE.Vector3()); let nf = 0;
      for (let i = 0; i < 12; i++) if (i % 4 !== 0) { this.vp(0, roll + 30 * i, ld, rS, cv); place2(this.feet, nf++, cv, 0.62, 0.62, 0.62); }
      this.feet.count = nf; this.feet.instanceMatrix.needsUpdate = true; this.feet.userData.show = true;
      let ne = 0; const eT = new THREE.Vector3(), eR = new THREE.Vector3();
      for (let i = 0; i < 6; i++) { const u = (U2 + U3) / 2; this.vp(u, roll + 60 * i + 30, ld, rS, cv); this.frameU(u, ld, fC, fE1, fE2, fT); eR.copy(cv).sub(fC); eR.addScaledVector(fT, -eR.dot(fT)).normalize(); eT.crossVectors(fT, eR).normalize();
        m5.makeBasis(eT.multiplyScalar(1.5), fT.clone().multiplyScalar(2.2), eR.clone().multiplyScalar(0.9)); m5.setPosition(cv); this.eyelets.setMatrixAt(ne++, m5); }
      this.eyelets.count = ne; this.eyelets.instanceMatrix.needsUpdate = true; this.eyelets.userData.show = true;
      for (let p = 0; p < 3; p++) { this.vp(UP + 0.7, roll + 120 * p, ld, rS, cv); place2(this.beads, p, cv, 0.85, 0.85, 0.85); }
      this.beads.count = 3; this.beads.instanceMatrix.needsUpdate = true; this.beads.userData.show = true; }
    // posts: thin tubes through points sampled along the bent centreline frame (no straight rods)
    for (let k = 0; k < 3; k++) {
      const psi = roll + k * 120; const pts = this.postPts[k];
      for (let i = 0; i < pts.length; i++) this.vp(lerp(Lv - 26, Lv, i / (pts.length - 1)), psi, ld, rS, pts[i]);
      this.posts[k].userData.tube.fromPoints(pts, () => DEV.postR);
      // Vision marker: 3 mm tall centred 3 mm above the inflow edge, on the frame (local tangent / radial), in line with its commissural post
      this.vp(DEV.markerU, psi, ld, rS, mid); this.frameU(DEV.markerU, ld, fC, fE1, fE2, fT);   // marker: 3 mm above the inflow edge, at EXACTLY the post angle psi
      const radial = mid.clone().sub(fC); radial.addScaledVector(fT, -radial.dot(fT)).normalize();
      const tang = new THREE.Vector3().crossVectors(fT, radial);
      m4.makeBasis(tang.multiplyScalar(1.6), fT.clone().multiplyScalar(3.0), radial.clone().multiplyScalar(0.7)); m4.setPosition(mid);
      this.vision[k].matrix.copy(m4); this.vision[k].matrixAutoUpdate = false; this.vision[k].matrixWorld.copy(m4);
    }
    // crimped valve body, fluoro only: a dense bent bundle inside the capsule (the part of the valve that has not left it yet)
    this.crimpBody.fromCentreline(cl, DEV.noseL + Math.min(ld, Lv) * kz, DEV.noseL + Lv * kz, 2, () => DEV.rCrimp);
    // NaviSeal skirt (light grey / white fabric) on the lower exterior of the frame; its top edge is scalloped and follows the zig-zag of the lower diamond cells
    { const m = this.cuff, pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0; const v = new THREE.Vector3();
      for (let i = 0; i <= nu; i++) { const psi = roll + i * 360 / nu; const ph = ((i * 360 / nu) % 30) / 15, tri = Math.abs(ph - 1);   // 1 at the ring-2 nodes (multiples of 30 deg), 0 between
        const uTop = lerp(9.2, 14.2, tri * tri * (3 - 2 * tri));
        for (let j = 0; j <= nv; j++) { const u = 0.3 + (uTop - 0.3) * j / nv; this.vp(u, psi, ld, 1.0, v); const rr = u <= ld ? (0.7 + (dv.sealed ? 0.5 : 0)) * (0.8 + 0.2 * Math.sin(Math.PI * j / nv)) : 0; if (rr) { this.frameU(u, ld, fC, fE1, fE2, fT); const ca = Math.cos(psi * D2R), sa = Math.sin(psi * D2R); v.addScaledVector(fE1, ca * rr).addScaledVector(fE2, sa * rr); } pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; } }
      m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.userData.show = ld > 6; this.matA.cuff.color.setHex(dv.sealed ? 0x9ff5df : 0xe9ecee); this.matA.cuff.opacity = dv.sealed ? 0.72 : 0.8; }
    // leaflets
    { const open = dv.leafOpen; const v = new THREE.Vector3();
      for (let l = 0; l < 3; l++) { const m = this.leaf[l], pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0;
        for (let i = 0; i <= nu; i++) { const a2 = -1 + 2 * i / nu; const psi = roll + l * 120 + 60 + 60 * a2 * 0.98; const uA = 5.5 + 11 * a2 * a2; const uF = 14 + 3.5 * a2 * a2;   // scalloped attachment line (belly low, commissures high); free edge forms the 3-lobed scallop
          for (let j = 0; j <= nv; j++) { const t = j / nv; const u = lerp(uA, uF, t);
            // radial: attachment at frame radius, free edge closes toward the axis (closed) or lies on the wall (open)
            const rW = this.rAt(u, ld) - 0.3; const close = 1 - open; const rFree = rW * lerp(1, a2 * a2 * 0.96 * close + (1 - close) * 0.96, 1);
            const rr = lerp(rW, rFree, t);
            const c = Math.cos(psi * D2R) * rr, s = Math.sin(psi * D2R) * rr;
            this.frameU(u, ld, fC, fE1, fE2, fT);
            v.copy(fC).addScaledVector(fE1, c).addScaledVector(fE2, s);
            if (this.tiltK) { const dz = this.tiltK * (c * this.wtE1 + s * this.wtE2) - this.tiltOff; v.addScaledVector(fT, dz * this.tiltW); }
            pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; } }
        m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.userData.show = ld > 22 && f > 0.55; } }
    // wire
    this.updateWire(S);
    // part highlight pulse
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const id in this.parts) for (const o of this.parts[id]) { const m = o.userData.matAnat; if (m && m.emissive) { const base = o.userData.baseEm || (o.userData.baseEm = m.emissive.clone()); if (this.hl === id) m.emissive.setRGB(0.5 + 0.4 * pulse, 0.5 + 0.4 * pulse, 0.1); else m.emissive.copy(base); } }
  }
  // WIRE AS RAIL. The guidewire runs from the handle end, through the central lumen of every shaft, the capsule and the nosecone, and out of the
  // nosecone tip centre, then continues along the anatomical path (the rail) to its own tip and atraumatic pigtail. Behind the tip its centreline is
  // the device centreline itself (the wire sits in the lumen), ahead of the tip it is the path. If the wire tip is pulled back behind the nosecone
  // (wire lost / pulled with the system) its tip stays inside the lumen: the wire is visibly withdrawn from the nosecone, not left beside it.
  updateWire(S) {
    const w = S.wire, dv = S.dev, cl = this.cl, path = this.path;
    const sTip = this.sTipNow ?? (dv.sd ?? dv.s);
    const P = cl.P; const key = [Math.round(sTip * 20), Math.round(w.s * 4), S.wireVer, w.removed ? 1 : 0, Math.round((P[300] + 3 * P[301] + 7 * P[302] + P[900] + 3 * P[901] + 7 * P[902]) * 200), S.fx ? S.fx.type + Math.round(S.fx.t * 20) : ''].join(',');
    if (key === this.wireKey) return; this.wireKey = key;
    if (w.removed) { this.wirePts = []; this.wireTube.fromPoints([], () => 0.5); return; }
    const pts = []; const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const dTip = Math.max(0, sTip - w.s);                       // >0: wire tip is inside the lumen, this far behind the nosecone tip
    const nIdx = cl.n - 1;
    // tail sticking out of the handle (straight, along the shaft direction)
    const tEnd = cl.tan(CL.total, new THREE.Vector3()), pEnd = cl.at(CL.total, new THREE.Vector3());
    for (let k = 10; k >= 1; k--) pts.push(pEnd.clone().addScaledVector(tEnd, k * 12));
    const iStart = Math.min(nIdx, Math.ceil(dTip / CL.step));
    for (let i = nIdx; i >= iStart; i--) pts.push(v(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
    this.wireTipIdx = pts.length - 1;
    if (dTip <= 0) {
      // ahead of the nosecone: the rail is the anatomical path out to the wire tip, then the atraumatic pigtail
      const ctrl = [cl.at(0, new THREE.Vector3())]; const sEnd = Math.min(w.s, path.length + 120);
      for (let s = sTip + 6; s < sEnd - 3; s += 6) ctrl.push(path.pos(s, new THREE.Vector3()));
      const T = path.pos(sEnd, new THREE.Vector3()); ctrl.push(T.clone());
      const t = path.tan(Math.min(sEnd, path.length - 1), new THREE.Vector3()), u = this.F.ex.clone();
      u.addScaledVector(t, -u.dot(t)).normalize();
      const Rc = 8; const C = T.clone().addScaledVector(u, Rc);   // pigtail: a smooth, slightly opening spiral
      for (let th = 10; th <= 430; th += 10) { const a = th * D2R; ctrl.push(C.clone().addScaledVector(u, -Math.cos(a) * Rc).addScaledVector(t, Math.sin(a) * Rc + th * 0.012)); }
      if (ctrl.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'); curve.arcLengthDivisions = ctrl.length * 6;
        const len = curve.getLength(); const n = Math.max(4, Math.ceil(len / 1.5));
        const fw = curve.getSpacedPoints(n); for (let i = 1; i < fw.length; i++) pts.push(fw[i]);
      }
    }
    this.wirePts = pts; this.wireTube.fromPoints(pts, () => 0.5);
  }
}
