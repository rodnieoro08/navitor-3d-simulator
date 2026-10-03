// Continuous variable-radius tubes (3D + fluoro). One BufferGeometry per part, rebuilt in place every frame (fixed index buffer + draw range).
import * as THREE from 'three';

export class VarTube {
  constructor(maxRings, radial = 12) {
    this.maxRings = maxRings; this.radial = radial; const R1 = radial + 1;
    this.pos = new Float32Array(maxRings * R1 * 3); this.nor = new Float32Array(maxRings * R1 * 3);
    const idx = new Uint32Array((maxRings - 1) * radial * 6); let k = 0;
    for (let i = 0; i < maxRings - 1; i++) for (let j = 0; j < radial; j++) { const a = i * R1 + j, b = a + R1; idx[k++] = a; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1; }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000); this.geo.boundingBox = new THREE.Box3(new THREE.Vector3(-4000, -4000, -4000), new THREE.Vector3(4000, 4000, 4000));
    this.rings = 0; this.geo.setDrawRange(0, 0);
    this._c = []; this._cs = new Float32Array(radial + 1); this._sn = new Float32Array(radial + 1);
    for (let j = 0; j <= radial; j++) { const th = j / radial * Math.PI * 2; this._cs[j] = Math.cos(th); this._sn[j] = Math.sin(th); }
  }
  _ring(i, p, nv, bv, tv, r, dr) { // dr = dr/d(arclength toward the handle): tilts the normal on tapers
    const R1 = this.radial + 1, cs = this._cs, sn = this._sn, pos = this.pos, nor = this.nor;
    for (let j = 0; j < R1; j++) {
      const c = cs[j], s = sn[j]; const rx = nv.x * c + bv.x * s, ry = nv.y * c + bv.y * s, rz = nv.z * c + bv.z * s; const q = (i * R1 + j) * 3;
      pos[q] = p.x + rx * r; pos[q + 1] = p.y + ry * r; pos[q + 2] = p.z + rz * r;
      let ax = rx - dr * tv.x, ay = ry - dr * tv.y, az = rz - dr * tv.z; const l = Math.hypot(ax, ay, az) || 1; nor[q] = ax / l; nor[q + 1] = ay / l; nor[q + 2] = az / l;
    }
  }
  _done(n) { this.rings = n; this.geo.setDrawRange(0, Math.max(0, n - 1) * this.radial * 6); this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; }
  // tube along the Centreline between distances d0..d1 (mm behind the tip); rf(d) -> radius
  fromCentreline(cl, d0, d1, step, rf) {
    if (d1 - d0 < 1e-3) { this._done(0); return; }
    const n = Math.min(this.maxRings, Math.max(2, Math.ceil((d1 - d0) / step) + 1)); const p = this._p || (this._p = new THREE.Vector3()), nv = this._n || (this._n = new THREE.Vector3()), bv = this._b || (this._b = new THREE.Vector3()), tv = this._t || (this._t = new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const d = d0 + (d1 - d0) * i / (n - 1); cl.at(d, p); cl.frameAt(d, nv, bv); cl.tan(d, tv);
      const r = rf(d), dr = (rf(Math.min(d1, d + 0.5)) - rf(Math.max(d0, d - 0.5))) / Math.max(1e-3, Math.min(d1, d + 0.5) - Math.max(d0, d - 0.5));
      this._ring(i, p, nv, bv, tv, Math.max(0.02, r), dr);
    }
    this._done(n);
  }
  // tube through an array of Vector3 (e.g. the guidewire); rf(i, n) -> radius
  fromPoints(pts, rf) {
    const n = Math.min(this.maxRings, pts.length); if (n < 2) { this._done(0); return; }
    const nv = new THREE.Vector3(0, 0, 1), bv = new THREE.Vector3(), tv = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      tv.copy(pts[Math.min(n - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]); if (tv.lengthSq() < 1e-10) tv.set(0, 1, 0); tv.normalize();
      nv.addScaledVector(tv, -nv.dot(tv)); if (nv.lengthSq() < 1e-6) { nv.set(1, 0, 0).addScaledVector(tv, -tv.x); } nv.normalize(); bv.crossVectors(tv, nv);
      this._ring(i, pts[i], nv, bv, tv, rf(i, n), 0);
    }
    this._done(n);
  }
}
