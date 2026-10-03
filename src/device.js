// FlexNav delivery system modelled as separate named parts, plus stiff wire.
import * as THREE from 'three';
import { D2R, clamp, lerp, smooth } from './util.js';
import { anatMat, fluMat, fluTube } from './scene.js';
import { Centreline, CL } from './centreline.js';
import { VarTube } from './tube.js';
import { R_ANN } from './anatomy.js';

export const DEV = { noseL: 22, Lv: 40, Lcap: 52, Rn: 4.3, Rshaft: 2.3, Rsheath: 3.4, Rinner: 1.4, total: 1000, seg: 4, rCrimp: 3.3 };
export const PARTS = {
  sheath: { name: 'Integrated hydrophilic sheath', info: 'Part of the system - no separate large introducer. Rotate it together with the system as it enters.' },
  outerShaft: { name: 'Outer shaft', info: 'Carries the flex and torque. Under-flexed in the arch it rides the greater curve.' },
  capsule: { name: 'Valve capsule', info: 'Holds the crimped valve. Retracts proximally with the deployment wheel - inflow is released first.' },
  capsuleMarker: { name: 'Capsule marker (radiopaque)', info: 'Ring at the capsule edge. Shows how far the capsule has been withdrawn.' },
  innerShaft: { name: 'Inner shaft', info: 'The valve rides on it. It stays put while the capsule retracts.' },
  innerMarker: { name: 'Inner-shaft marker band', info: 'Place this at the annular plane before unsheathing (phase 4).' },
  nosecone: { name: 'Nosecone', info: 'Atraumatic tip. Closed again with the macro slide only - never with the deployment wheel.' },
  visionMarkers: { name: 'Vision markers (3 x 3 mm)', info: 'Three 3 mm markers on the inflow. Their height is your depth target; their spacing shows rotation.' },
  frame: { name: 'Nitinol frame (large open cells)', info: 'Self-expanding frame with a few large diamond cells (about 3 rows, 9 around) and a flared outflow - not a dense mesh. In fluoro it is a sparse set of diagonal struts.' },
  posts: { name: 'Commissural posts', info: 'Three posts at the outflow. Line them up with the native commissures to keep coronary access.' },
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
      sheath: anatMat(0x7fd0ff, 0.42, { emissive: 0x001a2a }), outerShaft: anatMat(0xb7c0cc, 0.95, { metal: 0.4 }), capsule: anatMat(0x5fa3ff, 0.55, { emissive: 0x001533, metal: 0.3 }),
      innerShaft: anatMat(0xf5f5f5, 1), nosecone: anatMat(0x2ee6c4, 0.95, { emissive: 0x003a30 }),
      capsuleMarker: anatMat(0xffd54a, 1, { emissive: 0x6a5000 }), innerMarker: anatMat(0xff8a3d, 1, { emissive: 0x5a2200 }),
      vision: anatMat(0xff3b52, 1, { emissive: 0x70101c }), posts: anatMat(0xfff176, 1, { emissive: 0x5a5000 }),
      cuff: anatMat(0xe9f7ff, 0.5, { emissive: 0x0a1e2a }), leaflets: anatMat(0xffa9c2, 0.7, { emissive: 0x3a1020 }), frame: anatMat(0xc9d6ea, 1, { metal: 0.55, rough: 0.35, emissive: 0x151c28 }),
    };
    this.cl = new Centreline(F, P.path);
    const tube = (id, maxRings, anat, flu, radial = 14) => { const t = new VarTube(maxRings, radial); const m = new THREE.Mesh(t.geo, anat); m.userData.part = id; scene.add(m); reg.add(m, { anat, flu, group: 'device' }); this.parts[id].push(m); m.userData.tube = t; return t; };
    this.tSheath = tube('sheath', 520, this.matA.sheath, fluTube(0.045, 0.45));
    this.tShaft = tube('outerShaft', 40, this.matA.outerShaft, fluTube(0.07, 0.4));
    this.tCap = tube('capsule', 60, this.matA.capsule, fluTube(0.16, 0.3), 16);
    this.tInner = tube('innerShaft', 60, this.matA.innerShaft, fluTube(0.14, 0.4));
    this.tNose = tube('nosecone', 60, this.matA.nosecone, fluTube(0.2, 0.3), 16);
    const solo = (id, a, f, geo = cyl) => { const m = new THREE.Mesh(geo, a); scene.add(m); reg.add(m, { anat: a, flu: f, group: 'device' }); m.userData.part = id; this.parts[id].push(m); return m; };
    this.capMarker = solo('capsuleMarker', this.matA.capsuleMarker, fluMat(0.95));
    this.innerMarker = solo('innerMarker', this.matA.innerMarker, fluMat(0.9));
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.vision = [0, 1, 2].map(() => solo('visionMarkers', this.matA.vision, fluMat(1.0), box));
    this.posts = [0, 1, 2].map(() => solo('posts', this.matA.posts, fluMat(0.7), cyl));
    // valve lattice (frame), cuff, leaflets: dynamic geometries
    // nitinol frame: 3 rows of large diamond cells, 9 around (see update()). Struts are thin instanced cylinders so they show in 3D and in fluoro.
    this.nC = 9; this.nRows = 3; this.nSub = 3;
    this.struts = mk('frame', this.nC * this.nRows * 2 * this.nSub + 4, this.matA.frame, fluMat(0.3));
    this.nodes = [];
    const dyn = (id, nu, nv, a, f) => {
      const g = new THREE.BufferGeometry(); const pos = new Float32Array((nu + 1) * (nv + 1) * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const idx = []; for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p = i * (nv + 1) + j, q = p + nv + 1; idx.push(p, q, p + 1, q, q + 1, p + 1); } g.setIndex(idx);
      const m = new THREE.Mesh(g, a); scene.add(m); reg.add(m, { anat: a, flu: f, group: 'device', show: false }); m.userData.part = id; this.parts[id].push(m); m.userData.pos = pos; m.userData.nu = nu; m.userData.nv = nv; return m;
    };
    this.cuff = dyn('cuff', 36, 6, this.matA.cuff, fluMat(0.07));
    this.leaf = [0, 1, 2].map(() => dyn('leaflets', 12, 8, this.matA.leaflets, fluMat(0.05)));
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
    const pts = [[0, 12.8], [8, 13.5], [18, 13.1], [28, 14.9], [40, 17.0]]; // inflow, waist at the leaflets, flared outflow
    for (let i = 0; i < pts.length - 1; i++) if (u <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], smooth(pts[i][0], pts[i + 1][0], u));
    return 17.0;
  }
  rAt(u, ld) {
    if (u > ld) return DEV.rCrimp;
    const full = this.rFull(u);
    return lerp(DEV.Rn - 0.3, full, smooth(ld, ld - 9, u));
  }
  // world position on the valve at height u above the inflow edge, azimuth psi (deg), radial scale
  vp(u, psi, ld, rScale, out) {
    const r = this.rAt(u, ld) * (u > ld ? 1 : rScale);
    const c = Math.cos(psi * D2R) * r, s = Math.sin(psi * D2R) * r;
    out.copy(this.vo).addScaledVector(this.va, u * (this.kz || 1)).addScaledVector(this.ve1, c).addScaledVector(this.ve2, s);
    if (this.tiltK) { const dz = this.tiltK * (c * this.wtE1 + s * this.wtE2) - this.tiltOff; out.addScaledVector(this.va, dz * this.tiltW); }
    return out;
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
    const noseR = (d) => lerp(1.0, DEV.Rn - 0.2, Math.pow(sm(0, DEV.noseL, d), 0.7)) * Math.sqrt(sm(0, 1.4, d));      // tapered, rounded tip
    const innerR = () => DEV.Rinner;
    const capR = (d) => { const u = d - capEdge; return (DEV.Rn - 0.3 * (1 - sm(0, 1.6, u))) * (1 - (1 - (DEV.Rshaft + 0.5) / DEV.Rn) * sm(DEV.Lcap - 5, DEV.Lcap, u)) * ks(d); }; // rigid body, bevelled front, tapered shoulder
    const shaftR = (d) => lerp(DEV.Rshaft + 0.5, DEV.Rshaft, sm(0, 3, d - capEnd)) * lerp(1, DEV.Rsheath / DEV.Rshaft, sm(8, 14, d - capEnd)) * ks(d);
    const sheathR = (d) => DEV.Rsheath * ks(d);
    this.tNose.fromCentreline(cl, 0, DEV.noseL, 1, (d) => noseR(d));
    this.tInner.fromCentreline(cl, DEV.noseL, capEdge, 2, innerR);
    this.tCap.fromCentreline(cl, capEdge, capEnd, 2, capR);
    this.tShaft.fromCentreline(cl, capEnd, capEnd + 14, 2, shaftR);
    this.tSheath.fromCentreline(cl, capEnd + 14, DEV.total, 2, sheathR);
    // markers (follow the smooth centreline; rings sit on the capsule edge and the inner shaft)
    const posAt = (d, out) => cl.at(d, out);
    const place = (mesh, d0, d1, r) => { posAt(d0, a); posAt(d1, b); mid.copy(a).add(b).multiplyScalar(0.5); dir.copy(b).sub(a); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(up, dir); sc.set(r, len, r); m4.compose(mid, q, sc); mesh.matrix.copy(m4); mesh.matrixAutoUpdate = false; mesh.matrixWorldNeedsUpdate = true; mesh.matrixWorld.copy(m4); };
    place(this.capMarker, capEdge + 0.1, capEdge + 1.8, DEV.Rn + 0.25);
    place(this.innerMarker, DEV.noseL - 0.5, DEV.noseL + 1.7, 1.95);
    // ---------- valve ----------
    // valve frame: origin at inflow edge centre
    const bl = smooth(0.3, 0.8, f); let vo, axis;
    if (dv.released && dv.valveS != null) { vo = path.pos(dv.valveS, new THREE.Vector3()); axis = path.tan(dv.valveS, new THREE.Vector3()).negate(); }
    else {
      vo = cl.at(DEV.noseL, new THREE.Vector3()).addScaledVector(cl.offsetAt(DEV.noseL, new THREE.Vector3()), -bl);   // the flex offset relaxes as the valve opens
      const sO = sTip - DEV.noseL; axis = cl.tan(DEV.noseL, new THREE.Vector3()).multiplyScalar(1 - bl).addScaledVector(path.tan(sO, dir).negate(), bl).normalize();
    }
    const e1 = F.ex.clone().addScaledVector(axis, -F.ex.dot(axis)).normalize(); const e2 = new THREE.Vector3().crossVectors(axis, e1);
    this.vo = vo; this.va = axis; this.ve1 = e1; this.ve2 = e2;
    const tiltTot = dv.tilt * smooth(0.35, 0.8, f);
    this.tiltW = 1; this.tiltK = tiltTot / Math.max(this.wtLen, 1) ; this.wtE1 = this.wt.dot(F.ex); this.wtE2 = this.wt.dot(F.ey);
    this.tiltOff = this.tiltK * (this.pN.dot(F.ex) * this.wtE1 + this.pN.dot(F.ey) * this.wtE2);
    const ld = fv * Lv + 9 * smooth(0.85, 1.0, fv), rS = 1; // frame has expanded to its full radius over the last 9 mm at 100%
    const roll = dv.roll + dv.drift;
    // frame struts: diamond lattice, rings at u = j*Lv/rows; odd rings sit on the post angles, even rings are offset half a cell
    { const nC = this.nC, rows = this.nRows, ns = this.nSub, step = 360 / nC, hh = step / 2; let k = 0;
      const P0 = this.sA || (this.sA = new THREE.Vector3()), P1 = this.sB || (this.sB = new THREE.Vector3());
      const m5 = new THREE.Matrix4(), q5 = new THREE.Quaternion(), s5 = new THREE.Vector3(), up5 = new THREE.Vector3(0, 1, 0), d5 = new THREE.Vector3(), mid5 = new THREE.Vector3();
      const strut = (A, B) => { mid5.copy(A).add(B).multiplyScalar(0.5); d5.copy(B).sub(A); const len = d5.length() + 0.1; d5.normalize(); q5.setFromUnitVectors(up5, d5); s5.set(0.42, len, 0.42); m5.compose(mid5, q5, s5); this.struts.setMatrixAt(k++, m5); };
      for (let j = 0; j < rows; j++) for (let i = 0; i < nC; i++) {
        const a0 = roll + (i + ((j % 2 === 0) ? 0.5 : 0)) * step, u0 = j * Lv / rows, u1 = (j + 1) * Lv / rows;
        for (const sgn of [1, -1]) { this.vp(u0, a0, ld, rS, P0);
          for (let t = 1; t <= ns; t++) { this.vp(lerp(u0, u1, t / ns), a0 + sgn * hh * t / ns, ld, rS, P1); strut(P0, P1); P0.copy(P1); } }
      }
      this.struts.count = f > 0.04 ? k : 0; this.struts.instanceMatrix.needsUpdate = true; this.struts.userData.show = f > 0.04; }
    // posts + vision markers
    const A0 = new THREE.Vector3(), A1 = new THREE.Vector3();
    for (let k = 0; k < 3; k++) {
      const psi = roll + k * 120;
      this.vp(Lv - 26, psi, ld, rS, A0); this.vp(Lv, psi, ld, rS, A1);
      mid.copy(A0).add(A1).multiplyScalar(0.5); dir.copy(A1).sub(A0); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(up, dir); sc.set(0.8, len, 0.8); m4.compose(mid, q, sc); this.posts[k].matrix.copy(m4); this.posts[k].matrixAutoUpdate = false; this.posts[k].matrixWorld.copy(m4);
      // vision marker: 3 mm tall at u 1.5..4.5, sits on the frame
      this.vp(3.0, psi, ld, rS, mid);
      const radial = mid.clone().sub(vo).addScaledVector(axis, -mid.clone().sub(vo).dot(axis)).normalize();
      const tang = new THREE.Vector3().crossVectors(axis, radial);
      m4.makeBasis(tang.multiplyScalar(1.6), axis.clone().multiplyScalar(3.0), radial.clone().multiplyScalar(0.7)); m4.setPosition(mid);
      this.vision[k].matrix.copy(m4); this.vision[k].matrixAutoUpdate = false; this.vision[k].matrixWorld.copy(m4);
    }
    // cuff (inflow band) - only once the inflow is open
    { const m = this.cuff, pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0; const v = new THREE.Vector3();
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = 0.3 + j * 18 / nv; this.vp(u, roll + i * 360 / nu, ld, 1.0, v); const rr = u <= ld ? 0.75 + (dv.sealed ? 0.5 : 0) : 0; const rad = v.clone().sub(vo); rad.addScaledVector(axis, -rad.dot(axis)).normalize(); v.addScaledVector(rad, rr); pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; }
      m.geometry.attributes.position.needsUpdate = true; m.userData.show = ld > 6; this.matA.cuff.color.setHex(dv.sealed ? 0x9ff5df : 0xe9f7ff); this.matA.cuff.opacity = dv.sealed ? 0.62 : 0.45; }
    // leaflets
    { const open = dv.leafOpen; const v = new THREE.Vector3(), w2 = new THREE.Vector3();
      for (let l = 0; l < 3; l++) { const m = this.leaf[l], pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0;
        for (let i = 0; i <= nu; i++) { const a2 = -1 + 2 * i / nu; const psi = roll + l * 120 + 60 + 60 * a2 * 0.98; const uA = 7 + 11 * a2 * a2; const uF = 17 + 2 * a2 * a2;
          for (let j = 0; j <= nv; j++) { const t = j / nv; const u = lerp(uA, uF, t);
            // radial: attachment at frame radius, free edge closes toward the axis (closed) or lies on the wall (open)
            const rW = this.rAt(u, ld) - 0.3; const close = 1 - open; const rFree = rW * lerp(1, a2 * a2 * 0.96 * close + (1 - close) * 0.96, 1);
            const rr = lerp(rW, rFree, t);
            const c = Math.cos(psi * D2R) * rr, s = Math.sin(psi * D2R) * rr;
            v.copy(vo).addScaledVector(axis, u).addScaledVector(e1, c).addScaledVector(e2, s);
            if (this.tiltK) { const dz = this.tiltK * (c * this.wtE1 + s * this.wtE2) - this.tiltOff; v.addScaledVector(axis, dz * this.tiltW); }
            pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; } }
        m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.userData.show = ld > 22 && f > 0.55; } }
    // wire
    this.updateWire(S);
    // part highlight pulse
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const id in this.parts) for (const o of this.parts[id]) { const m = o.userData.matAnat; if (m && m.emissive) { const base = o.userData.baseEm || (o.userData.baseEm = m.emissive.clone()); if (this.hl === id) m.emissive.setRGB(0.5 + 0.4 * pulse, 0.5 + 0.4 * pulse, 0.1); else m.emissive.copy(base); } }
  }
  updateWire(S) {
    const w = S.wire; const key = [Math.round(w.s * 4), S.wireVer].join(',');
    if (key === this.wireKey) return; this.wireKey = key;
    const ctrl = []; const path = this.path;
    const sEnd = Math.min(w.s, path.length + 120);
    for (let s = -40; s < sEnd - 3; s += 6) ctrl.push(path.pos(s, new THREE.Vector3()));
    const T = path.pos(sEnd, new THREE.Vector3()); ctrl.push(T.clone());
    const t = path.tan(Math.min(sEnd, path.length - 1), new THREE.Vector3()), u = this.F.ex.clone();
    u.addScaledVector(t, -u.dot(t)).normalize();
    const Rc = 8; const C = T.clone().addScaledVector(u, Rc);   // pigtail: a smooth, slightly opening spiral
    for (let th = 10; th <= 430; th += 10) { const a = th * D2R; ctrl.push(C.clone().addScaledVector(u, -Math.cos(a) * Rc).addScaledVector(t, Math.sin(a) * Rc + th * 0.012)); }
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'); curve.arcLengthDivisions = ctrl.length * 6;
    const len = curve.getLength(); const n = Math.min(1090, Math.max(8, Math.ceil(len / 1.5)));
    this.wirePts = curve.getSpacedPoints(n); this.wireTube.fromPoints(this.wirePts, () => 0.5);
  }
}
