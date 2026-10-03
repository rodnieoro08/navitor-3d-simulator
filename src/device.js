// FlexNav delivery system modelled as separate named parts, plus stiff wire.
import * as THREE from 'three';
import { D2R, clamp, lerp, smooth } from './util.js';
import { anatMat, fluMat } from './scene.js';
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

class DynTube {
  constructor(maxPts, radial = 6) {
    this.maxPts = maxPts; this.radial = radial;
    this.pos = new Float32Array(maxPts * (radial + 1) * 3);
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3); this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr); this.geo.setIndex(idx);
    this.count = 0;
  }
  set(points, r) {
    const n = Math.min(points.length, this.maxPts), R = this.radial;
    const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), nn = new THREE.Vector3(), bb = new THREE.Vector3();
    let nrm = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < this.maxPts; i++) {
      const p = points[Math.min(i, n - 1)];
      t.copy(points[Math.min(n - 1, i + 1)]).sub(points[Math.min(n - 1, Math.max(0, i - 1))]); if (t.lengthSq() < 1e-8) t.set(0, 1, 0); t.normalize();
      nrm.addScaledVector(t, -nrm.dot(t)); if (nrm.lengthSq() < 1e-6) nrm.set(1, 0, 0).addScaledVector(t, -t.x); nrm.normalize();
      bb.crossVectors(t, nrm);
      const rr = i >= n ? 0 : r;
      for (let j = 0; j <= R; j++) { const th = j / R * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), q = (i * (R + 1) + j) * 3;
        this.pos[q] = p.x + (nrm.x * c + bb.x * s) * rr; this.pos[q + 1] = p.y + (nrm.y * c + bb.y * s) * rr; this.pos[q + 2] = p.z + (nrm.z * c + bb.z * s) * rr; }
    }
    this.attr.needsUpdate = true;
  }
}

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
    const N = Math.ceil(DEV.total / DEV.seg);
    this.matA = {
      sheath: anatMat(0x7fd0ff, 0.42, { emissive: 0x001a2a }), outerShaft: anatMat(0xb7c0cc, 0.95, { metal: 0.4 }), capsule: anatMat(0x5fa3ff, 0.55, { emissive: 0x001533, metal: 0.3 }),
      innerShaft: anatMat(0xf5f5f5, 1), nosecone: anatMat(0x2ee6c4, 0.95, { emissive: 0x003a30 }),
      capsuleMarker: anatMat(0xffd54a, 1, { emissive: 0x6a5000 }), innerMarker: anatMat(0xff8a3d, 1, { emissive: 0x5a2200 }),
      vision: anatMat(0xff3b52, 1, { emissive: 0x70101c }), posts: anatMat(0xfff176, 1, { emissive: 0x5a5000 }),
      cuff: anatMat(0xe9f7ff, 0.5, { emissive: 0x0a1e2a }), leaflets: anatMat(0xffa9c2, 0.7, { emissive: 0x3a1020 }), frame: anatMat(0xc9d6ea, 1, { metal: 0.55, rough: 0.35, emissive: 0x151c28 }),
    };
    this.imSheath = mk('sheath', N, this.matA.sheath, fluMat(0.045));
    this.imShaft = mk('outerShaft', N, this.matA.outerShaft, fluMat(0.07));
    this.imCap = mk('capsule', 40, this.matA.capsule, fluMat(0.16));
    this.imInner = mk('innerShaft', 40, this.matA.innerShaft, fluMat(0.14));
    this.imNose = mk('nosecone', 12, this.matA.nosecone, fluMat(0.2));
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
    this.wireTube = new DynTube(520, 5);
    this.wireMesh = new THREE.Mesh(this.wireTube.geo, anatMat(0xd9e2ee, 1, { metal: 0.6 }));
    scene.add(this.wireMesh); reg.add(this.wireMesh, { anat: this.wireMesh.material, flu: fluMat(0.34), group: 'device' });
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
    const nSeg = Math.ceil(DEV.total / DEV.seg);
    const prof = (d) => d < DEV.noseL ? 'nose' : d < capEdge ? 'inner' : d < capEnd ? 'cap' : d < capEnd + 14 ? 'shaft' : 'sheath';
    const counts = { nose: 0, inner: 0, cap: 0, shaft: 0, sheath: 0 };
    const mats = { nose: this.imNose, inner: this.imInner, cap: this.imCap, shaft: this.imShaft, sheath: this.imSheath };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
    const posAt = (d, out) => {
      const s = sTip - d; path.pos(s, out); this.latVec(s, latV);
      let off = lat * Math.exp(-d / 85);
      if (fx) { const ds = (sTip - d) - fx.s; const t = fx.t; const amp = fx.type === 'kink' ? 14 : fx.type === 'force' ? 9 : 0; if (amp) { off += 0; const bump = amp * Math.exp(-(ds * ds) / (2 * 14 * 14)) * smooth(0, 0.25, t) * (1 - smooth(1.2, 2.0, t)); out.addScaledVector(path.Nn[Math.round(clamp(s, 0, path.length) / path.h)], bump); } }
      out.addScaledVector(latV, off);
      return out;
    };
    let prev = posAt(0, new THREE.Vector3()), p2 = new THREE.Vector3();
    this.tipPos = prev.clone();
    for (let i = 1; i <= nSeg; i++) {
      const d0 = (i - 1) * DEV.seg, d1 = i * DEV.seg, dm = (d0 + d1) / 2;
      posAt(d1, p2);
      const kind = prof(dm), im = mats[kind];
      if (kind === 'cap' && counts.cap >= 40) { prev.copy(p2); continue; }
      if (kind === 'inner' && counts.inner >= 40) { prev.copy(p2); continue; }
      let r = kind === 'nose' ? lerp(1.0, DEV.Rn - 0.2, Math.pow(smooth(0, DEV.noseL, dm), 0.7)) : kind === 'inner' ? DEV.Rinner : kind === 'cap' ? DEV.Rn : kind === 'shaft' ? DEV.Rshaft : DEV.Rsheath;
      mid.copy(prev).add(p2).multiplyScalar(0.5); dir.copy(p2).sub(prev); const len = dir.length() + 0.15; dir.normalize();
      q.setFromUnitVectors(up, dir); sc.set(r, len, r); m4.compose(mid, q, sc);
      im.setMatrixAt(counts[kind]++, m4);
      prev.copy(p2);
    }
    for (const k in counts) { const im = mats[k]; im.count = counts[k]; im.instanceMatrix.needsUpdate = true; }
    // markers
    const place = (mesh, d0, d1, r) => { posAt(d0, a); posAt(d1, b); mid.copy(a).add(b).multiplyScalar(0.5); dir.copy(b).sub(a); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(up, dir); sc.set(r, len, r); m4.compose(mid, q, sc); mesh.matrix.copy(m4); mesh.matrixAutoUpdate = false; mesh.matrixWorldNeedsUpdate = true; mesh.matrixWorld.copy(m4); };
    place(this.capMarker, capEdge + 0.1, capEdge + 1.8, DEV.Rn + 0.25);
    place(this.innerMarker, DEV.noseL - 0.5, DEV.noseL + 1.7, 1.95);
    // ---------- valve ----------
    // valve frame: origin at inflow edge centre
    let sOrigin;
    if (dv.released && dv.valveS != null) sOrigin = dv.valveS; else sOrigin = sTip - DEV.noseL;
    const vo = path.pos(sOrigin, new THREE.Vector3());
    this.latVec(sOrigin, latV);
    const latHere = dv.released ? 0 : lat * Math.exp(-DEV.noseL / 85) * (1 - smooth(0.3, 0.8, f));
    vo.addScaledVector(latV, latHere);
    path.tan(sOrigin, dir); const axis = dir.clone().negate(); // toward the aortic side
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
    const pts = []; const path = this.path;
    const sEnd = Math.min(w.s, path.length + 120);
    for (let s = -40; s < sEnd; s += 3) pts.push(path.pos(s, new THREE.Vector3()));
    const T = path.pos(sEnd, new THREE.Vector3()); pts.push(T.clone());
    const t = path.tan(Math.min(sEnd, path.length - 1), new THREE.Vector3()), u = this.F.ex.clone();
    u.addScaledVector(t, -u.dot(t)).normalize();
    const Rc = 8; const C = T.clone().addScaledVector(u, Rc);
    for (let th = 12; th <= 430; th += 14) { const a = th * D2R; pts.push(C.clone().addScaledVector(u, -Math.cos(a) * Rc).addScaledVector(t, Math.sin(a) * Rc + th * 0.04)); }
    this.wireTube.set(pts, 0.45);
  }
}
