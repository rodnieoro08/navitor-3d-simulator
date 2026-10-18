// FlexNav delivery system (named parts) + the Navitor Vision valve, built from the published geometry (see physics.js PUBLISHED / GEOMETRY):
// 9-cell nitinol diamond lattice, 48 mm stent, commissure attachment features at 24 mm, three retainer tabs on the crown, NaviSeal inner and outer
// polyethylene cuffs (outer cuff 10 mm), three bovine-pericardium leaflets, three tantalum Vision markers 3 mm above the inflow edge under the commissures.
import * as THREE from 'three';
import { D2R, clamp, lerp, smooth } from './util.js';
import { anatMat, fluMat, fluTube } from './scene.js';
import { Centreline, CL } from './centreline.js';
import { VarTube } from './tube.js';
import { R_ANN, sinusProfile } from './anatomy.js';
import * as PH from './physics.js';

const G = PH.GEOMETRY, PUB = PH.PUBLISHED;
// capsule OD 6.3 mm (IFU, FlexNav LG); the valve crimps to the capsule bore. Lcap = crimped stent + tabs + retainer, rounded.
export const DEV = { noseL: 22, Lv: G.freeLen, Lcap: Math.ceil(G.crimpLen + G.tabMm + 4), Rn: PUB.capsuleOdMm / 2, Rshaft: 2.3, Rsheath: PUB.capsuleOdMm / 2 - 0.1, Rinner: 1.4, total: 1000, seg: 4,
  rCrimp: G.rCrimp, capWall: 0.4, strutW: 0.42, strutT: 0.3, markerU: PUB.markerHeightMm, cells: PUB.inflowStruts, commAz: [20, 140, 260], tabAz: [80, 200, 320] };
export const PARTS = {
  sheath: { name: 'Integrated hydrophilic sheath', info: '15 F equivalent, 30 cm working length, hydrophilic-coated. Part of the system - no separate large introducer. Rotate it together with the system as it enters.' },
  outerShaft: { name: 'Outer shaft', info: 'Carries the flex and torque. The stability layer lets the distal end move freely inside the integrated sheath. Under-flexed in the arch it rides the greater curve.' },
  capsule: { name: 'Valve capsule (6.3 mm)', info: 'Holds the crimped valve. Retracts proximally with the deployment / re-sheath wheel - the annulus end (inflow) is released first.' },
  capsuleMarker: { name: 'Capsule marker band', info: 'Radiopaque ring at the capsule mouth. Shows how far the capsule has been withdrawn (extent of deployment).' },
  innerShaft: { name: 'Inner shaft + retainer receptacle', info: 'The valve rides on it; the three retainer tabs sit in the receptacle until the capsule has fully retracted.' },
  innerMarker: { name: 'Inner-shaft marker band', info: 'IFU: align it with the native annular plane before unsheathing, then put the inflow edge at the base of the NCC.' },
  nosecone: { name: 'Radiopaque nosecone', info: 'Atraumatic tip with the 0.035" wire exit on its axis. Closed again with the macro slide only - never with the deployment wheel.' },
  visionMarkers: { name: 'Vision markers (3 x tantalum)', info: 'Three radiopaque tantalum markers between the inner and outer cuff, 3 mm above the inflow edge, one under each commissure. Inflow edge to the bottom of the markers = the 3 mm target depth; their spacing shows rotation and commissure alignment.' },
  frame: { name: 'Nitinol stent (9-cell lattice)', info: 'Self-expanding, radiopaque nitinol: 9 small cells at the non-flared 27 mm inflow, large open cells above for coronary access, a crown that flares to 44 mm free (held by the aorta in situ), 48 mm tall. It foreshortens about 4 mm as the inflow lattice opens.' },
  posts: { name: 'Commissure attachment features', info: 'Three slotted CAF posts at 24 mm carry the leaflet commissures. Line them up with the native commissures to keep coronary access (large cells face the ostia).' },
  cuff: { name: 'NaviSeal cuff (inner + outer)', info: 'Polyethylene fabric: inner cuff lines the inflow, the 10 mm outer cuff fills voids against the calcified annulus and moves with the cardiac cycle to mitigate PVL.' },
  leaflets: { name: 'Intra-annular pericardial leaflets', info: 'Bovine pericardium, Linx anticalcification. They work as soon as they are unsheathed (haemodynamics are stable at the 80% lock); after release they open and close with every beat.' },
};

// procedural woven-fabric texture for the NaviSeal cuff (no network: drawn on a canvas)
function weaveTexture() {
  if (typeof document === 'undefined') return null;
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const ctx = c.getContext('2d');
  ctx.fillStyle = '#eceae4'; ctx.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 4) for (let x = 0; x < n; x += 4) { const over = ((x >> 2) + (y >> 2)) % 2 === 0; const v = 214 + (over ? 22 : 0) + Math.round((Math.random() - 0.5) * 14); ctx.fillStyle = `rgb(${v},${v - 2},${v - 8})`; ctx.fillRect(x, y, 4, 4); ctx.fillStyle = 'rgba(0,0,0,0.08)'; if (over) ctx.fillRect(x, y + 3, 4, 1); else ctx.fillRect(x + 3, y, 1, 4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(18, 3); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function pericardiumTexture() {
  if (typeof document === 'undefined') return null;
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const ctx = c.getContext('2d');
  ctx.fillStyle = '#e7dcb6'; ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) { const x = Math.random() * n, y = Math.random() * n, r = 4 + Math.random() * 14; const g = ctx.createRadialGradient(x, y, 0, x, y, r); const k = Math.random() < 0.5 ? 'rgba(200,180,130,0.18)' : 'rgba(255,250,235,0.16)'; g.addColorStop(0, k); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let i = 0; i < 90; i++) { ctx.strokeStyle = 'rgba(190,170,120,0.12)'; ctx.lineWidth = 0.6 + Math.random(); ctx.beginPath(); const x = Math.random() * n, y = Math.random() * n; ctx.moveTo(x, y); ctx.bezierCurveTo(x + 20, y - 10 + Math.random() * 20, x + 40, y + 10 - Math.random() * 20, x + 70, y); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const phys = (o) => { const m = new THREE.MeshPhysicalMaterial(o); m.side = THREE.DoubleSide; return m; };

export class Device {
  constructor(scene, reg, F, P, rootGroup) {
    this.scene = scene; this.reg = reg; this.F = F; this.P = P; this.path = P.path; this.lm = P.lm;
    this.parts = {}; for (const k in PARTS) this.parts[k] = [];
    this.hl = null; this.t = 0;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    // ---------------- materials (anatomy / 3D view) ----------------
    this.matA = {
      sheath: phys({ color: 0x3f8fe8, roughness: 0.35, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.2, transparent: true, opacity: 0.55 }),
      outerShaft: phys({ color: 0x2f6fd0, roughness: 0.4, metalness: 0.05, clearcoat: 0.5, transparent: true, opacity: 0.68 }),
      capsule: phys({ color: 0xf4f7fb, roughness: 0.42, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.3, transparent: true, opacity: 0.72 }),
      innerShaft: phys({ color: 0xf3f5f8, roughness: 0.5 }),
      nosecone: phys({ color: 0xffffff, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, transparent: true, opacity: 0.78 }), noseOutline: anatMat(0x1b2431, 0.45, { rough: 1, metal: 0 }), tipHole: anatMat(0x04100e, 1),
      capsuleMarker: phys({ color: 0xcfa14a, roughness: 0.3, metalness: 1.0 }), innerMarker: phys({ color: 0xd98a3f, roughness: 0.3, metalness: 1.0 }),
      vision: phys({ color: 0x6f7378, roughness: 0.35, metalness: 1.0 }), visionCross: phys({ color: 0xb8bcc2, roughness: 0.3, metalness: 1.0 }),
      posts: phys({ color: 0xd5dae1, roughness: 0.3, metalness: 1.0 }),
      cuff: phys({ color: 0xf2f0ea, roughness: 0.92, metalness: 0, sheen: 0.8, sheenRoughness: 0.7, sheenColor: 0xffffff, transparent: true, opacity: 0.97, map: weaveTexture() }),
      cuffIn: phys({ color: 0xf6f4ee, roughness: 0.9, sheen: 0.5, sheenColor: 0xffffff, transparent: true, opacity: 0.9, map: weaveTexture() }),
      leaflets: phys({ color: 0xe9dfb9, roughness: 0.48, metalness: 0, sheen: 0.45, sheenRoughness: 0.5, sheenColor: 0xfff3d6, clearcoat: 0.25, clearcoatRoughness: 0.4, transparent: true, opacity: 0.96, map: pericardiumTexture() }),
      frame: phys({ color: 0xdadfe6, roughness: 0.26, metalness: 1.0 }), foot: phys({ color: 0xc9ced6, roughness: 0.3, metalness: 1.0 }), bead: phys({ color: 0xe2e6ec, roughness: 0.22, metalness: 1.0 }),
    };
    for (const k of ['sheath', 'capsule', 'cuff', 'cuffIn', 'leaflets', 'outerShaft', 'nosecone']) this.matA[k].depthWrite = this.matA[k].opacity >= 0.95;
    this.cl = new Centreline(F, P.path);
    const tube = (id, maxRings, anat, flu, radial = 14) => { const t = new VarTube(maxRings, radial); const m = new THREE.Mesh(t.geo, anat); m.userData.part = id; scene.add(m); reg.add(m, { anat, flu, group: 'device' }); this.parts[id].push(m); m.userData.tube = t; return t; };
    this.tSheath = tube('sheath', 520, this.matA.sheath, fluTube(0.045, 0.45));
    this.tShaft = tube('outerShaft', 40, this.matA.outerShaft, fluTube(0.07, 0.4));
    this.tCap = tube('capsule', 60, this.matA.capsule, fluTube(0.16, 0.3), 18);
    this.tInner = tube('innerShaft', 60, this.matA.innerShaft, fluTube(0.14, 0.4));
    this.matA.noseOutline.side = THREE.FrontSide;
    this.tNose = tube('nosecone', 60, this.matA.nosecone, fluTube(0.22, 0.3), 18);
    this.tNoseOut = tube('nosecone', 60, this.matA.noseOutline, null, 18);
    const solo = (id, a, f, geo = cyl) => { const m = new THREE.Mesh(geo, a); scene.add(m); reg.add(m, { anat: a, flu: f, group: 'device' }); m.userData.part = id; this.parts[id].push(m); return m; };
    this.tipHole = solo('nosecone', this.matA.tipHole, fluMat(0));
    this.capMarker = solo('capsuleMarker', this.matA.capsuleMarker, fluMat(0.95));
    this.innerMarker = solo('innerMarker', this.matA.innerMarker, fluMat(0.9));
    // Vision markers: tantalum disc (axis radial) + a raised cross; the disc mesh carries the legacy `vision[k].matrix` used by the tests
    const disc = new THREE.CylinderGeometry(1, 1, 1, 16);
    this.vision = [0, 1, 2].map(() => solo('visionMarkers', this.matA.vision, fluMat(1.0), disc));
    const bar = new THREE.BoxGeometry(1, 1, 1);
    this.visionCross = [0, 1, 2].map(() => [solo('visionMarkers', this.matA.visionCross, null, bar), solo('visionMarkers', this.matA.visionCross, null, bar)]);
    // CAF posts: short tubes along the commissure line (legacy postPts: index 0 is at the inflow rim, so its azimuth = the marker azimuth)
    this.posts = [0, 1, 2].map(() => { const t = new VarTube(12, 8); const m = new THREE.Mesh(t.geo, this.matA.posts); m.userData.part = 'posts'; m.userData.tube = t; scene.add(m); reg.add(m, { anat: this.matA.posts, flu: fluTube(0.7, 0.4), group: 'device' }); this.parts.posts.push(m); return m; });
    this.postPts = [0, 1, 2].map(() => Array.from({ length: 9 }, () => new THREE.Vector3()));
    this.crimpBody = new VarTube(40, 12); { const m = new THREE.Mesh(this.crimpBody.geo, this.matA.cuff); m.userData.part = 'frame'; scene.add(m); reg.add(m, { anat: null, flu: fluTube(0.1, 0.55), group: 'device' }); this.parts.frame.push(m); }
    // ---------------- lattice (precomputed in (u, psi) space) ----------------
    this.nC = DEV.cells; this.nRows = 4; this.buildLattice();
    const mkI = (id, count, geo, anat, flu) => { const m = new THREE.InstancedMesh(geo, anat, count); m.count = 0; m.userData.part = id; scene.add(m); reg.add(m, { anat, flu, group: 'device' }); this.parts[id].push(m); return m; };
    this.struts = mkI('frame', this.segTotal + 8, new THREE.BoxGeometry(1, 1, 1), this.matA.frame, fluMat(0.34));
    this.joints = mkI('frame', this.nodes.length + 8, new THREE.SphereGeometry(1, 10, 8), this.matA.frame, null);
    this.feet = mkI('frame', 9, new THREE.SphereGeometry(1, 10, 8), this.matA.foot, fluMat(0.75));                // suture eyelets at the 9 inflow apices
    this.eyelets = mkI('posts', 3, new THREE.BoxGeometry(1, 1, 1), this.matA.posts, fluMat(0.5));               // 3 slotted CAF plates
    this.eyeSlots = mkI('posts', 6, new THREE.BoxGeometry(1, 1, 1), anatMat(0x2b3138, 1, { rough: 0.6 }), null);
    this.beads = mkI('frame', 3, new THREE.SphereGeometry(1, 12, 10), this.matA.bead, fluMat(1.0));            // 3 retainer tabs
    this.tabNecks = mkI('frame', 3, new THREE.CylinderGeometry(1, 1, 1, 10), this.matA.bead, fluMat(0.8));
    const dyn = (id, nu, nv, a, f) => {
      const g = new THREE.BufferGeometry(); const pos = new Float32Array((nu + 1) * (nv + 1) * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const uv = new Float32Array((nu + 1) * (nv + 1) * 2); for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const q = (i * (nv + 1) + j) * 2; uv[q] = i / nu; uv[q + 1] = j / nv; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const idx = []; for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p = i * (nv + 1) + j, q = p + nv + 1; idx.push(p, q, p + 1, q, q + 1, p + 1); } g.setIndex(idx);
      const m = new THREE.Mesh(g, a); scene.add(m); reg.add(m, { anat: a, flu: f, group: 'device', show: false }); m.userData.part = id; this.parts[id].push(m); m.userData.pos = pos; m.userData.nu = nu; m.userData.nv = nv; return m;
    };
    this.cuff = dyn('cuff', 72, 8, this.matA.cuff, fluMat(0.16));
    this.cuffIn = dyn('cuff', 72, 6, this.matA.cuffIn, fluMat(0.08));
    this.leaf = [0, 1, 2].map(() => dyn('leaflets', 18, 10, this.matA.leaflets, fluMat(0.1)));
    this.wireTube = new VarTube(1100, 8);
    this.wireMesh = new THREE.Mesh(this.wireTube.geo, phys({ color: 0xd9e2ee, roughness: 0.35, metalness: 0.9 }));
    scene.add(this.wireMesh); reg.add(this.wireMesh, { anat: this.wireMesh.material, flu: fluTube(0.36, 0.35), group: 'device' });
    this.wireKey = ''; this.tmp = new THREE.Vector3();
    this.ncc = F.cuspAz.NCC; this.lcc = F.cuspAz.LCC;
    const pN = F.dir(F.cuspAz.NCC).multiplyScalar(R_ANN), pL = F.dir(F.cuspAz.LCC).multiplyScalar(R_ANN);
    this.wt = pN.clone().sub(pL); this.wtLen = this.wt.length(); this.wt.normalize(); this.pN = pN; this.pL = pL;
    this.zTab = new Float32Array(97); this.eTab = new Float32Array(97); this.depthNow = 0; this.inRootNow = false;
  }
  // Lattice in expanded coordinates. Rows: 0 (inflow apices, u 0), 1 (u 8), 2 (u 16), 3 (u 24, CAFs at commAz), crown: tab peaks at tabAz (u 48),
  // free-ended inner arches between (u 45). Each strut is sampled into short straight segments so the lattice bends with the capsule.
  buildLattice() {
    const N = DEV.cells, step = 360 / N, h = PUB.halfCellHeightMm, nodes = [], edges = [];
    const node = (u, psi) => { nodes.push({ u, psi: ((psi % 360) + 360) % 360 }); return nodes.length - 1; };
    const row = (u, off) => Array.from({ length: N }, (_, i) => node(u, i * step + off));
    const r0 = row(0, 0), r1 = row(h, step / 2), r2 = row(2 * h, 0), r3 = row(3 * h, step / 2);
    const E = (a, b, ns, o = {}) => edges.push({ a, b, ns, ...o });
    for (let i = 0; i < N; i++) { E(r0[i], r1[i], 3); E(r0[i], r1[(i + N - 1) % N], 3); E(r1[i], r2[(i + 1) % N], 3); E(r1[i], r2[i], 3); E(r2[i], r3[i], 3); E(r2[i], r3[(i + N - 1) % N], 3); }
    this.cafIdx = []; this.tabIdx = []; this.archIdx = [];
    for (let k = 0; k < 3; k++) { this.tabIdx.push(node(G.freeLen, DEV.tabAz[k])); this.archIdx.push(node(G.freeLen - 3, DEV.tabAz[k])); }
    for (let i = 0; i < N; i++) {
      const n3 = r3[i], psi = nodes[n3].psi, m = i % 3, k = Math.floor(i / 3);          // r3 azimuths: 20 + 40 i -> i%3 == 0 is a CAF (20 + 120 k)
      if (m === 0) { this.cafIdx.push(n3); E(n3, this.tabIdx[k], 7, { bow: 1 }); E(n3, this.tabIdx[(k + 2) % 3], 7, { bow: -1 }); }   // CAF -> the two neighbouring tab peaks (+60 / -60 deg)
      else E(n3, this.archIdx[k], 5, { bow: m === 1 ? 0.5 : -0.5 });                                                                  // 60 + 120 k and 100 + 120 k -> free-ended inner arch at 80 + 120 k
    }
    this.nodes = nodes; this.edges = edges; this.segTotal = edges.reduce((s, e) => s + e.ns, 0); this.r0 = r0; this.r1 = r1; this.r3 = r3;
  }
  latVec(s, out) {
    const k = this.path.kap(s), w = smooth(0.0006, 0.004, k);
    this.path.outer(s, this._o || (this._o = new THREE.Vector3()));
    return out.copy(this._o).multiplyScalar(w).addScaledVector(this.F.ex, 1 - w).normalize();
  }
  // ---------------- per-frame axial tables ----------------
  // e(u): how far the material at expanded height u has opened (0 crimped .. 1 free); z(u): its axial distance from the inflow edge (crimped parts are stretched)
  buildAxial(rMm) {
    const zT = this.zTab, eT = this.eTab; let z = 0, prevS = 1;
    for (let i = 0; i <= 96; i++) { const u = i * 0.5; const e = this.rel ? 1 : PH.sectionExpansion(PH.crimpCoord(u), rMm); eT[i] = e; const s = lerp(PH.stretchAt(u), 1, e); if (i) z += 0.5 * (s + prevS) / 2; prevS = s; zT[i] = z; }
  }
  eAt(u) { const f = clamp(u * 2, 0, 96), i = Math.floor(f), t = f - i; return lerp(this.eTab[i], this.eTab[Math.min(96, i + 1)], t); }
  zAt(u) { if (u <= 0) return u; const f = clamp(u * 2, 0, 96), i = Math.floor(f), t = f - i; const z = lerp(this.zTab[i], this.zTab[Math.min(96, i + 1)], t); return u > 48 ? z + (u - 48) : z; }
  // radius of the expanded frame in situ: free radius, pinched by the annulus / held by the aortic root above the commissures
  rSitu(u) {
    const free = PH.freeRadius(u);
    if (!this.inRootNow) return free;
    const z = u - this.depthNow; const [base] = sinusProfile(z); const lumen = base + 0.25;
    if (u <= G.lowerExp) return Math.min(free, lumen + 0.35 * (free - lumen)); // the annulus yields a little (compliance), the sinuses leave the inflow free
    return Math.min(free, lumen);
  }
  rFull(u) { return this.rSitu(u); }
  rAt(u) { return lerp(DEV.rCrimp - DEV.strutT, this.rSitu(u), this.eAt(u)); }
  capOuterR(u) { return (DEV.Rn - 0.25 * (1 - smooth(0, 1.6, u))) * (1 - (1 - (DEV.Rshaft + 0.5) / DEV.Rn) * smooth(DEV.Lcap - 5, DEV.Lcap, u)); }
  capInnerR(u) { return this.capOuterR(u) - DEV.capWall; }
  // centre point + orthonormal frame of the valve at height u above the inflow edge (ON the capsule centreline while unreleased; the flex offset relaxes for the open part)
  frameU(u, C, E1, E2, T) {
    if (this.rel) { C.copy(this.vo).addScaledVector(this.va, u); E1.copy(this.ve1); E2.copy(this.ve2); T.copy(this.va); return; }
    const cl = this.cl, d = Math.min(CL.total - 3, Math.max(0, DEV.noseL + this.zAt(u)));
    const w = this.bl * (1 - this.eAt(u));
    cl.at(d, C); if (w > 1e-4) { cl.offsetAt(d, this._fo || (this._fo = new THREE.Vector3())); C.addScaledVector(this._fo, -w); }
    cl.tan(d, T);
    if (w > 1e-4) { this.path.tan(this.sTipNow - d, this._fp || (this._fp = new THREE.Vector3())).negate(); T.multiplyScalar(1 - w).addScaledVector(this._fp, w).normalize(); }
    E1.copy(this.F.ex).addScaledVector(T, -this.F.ex.dot(T)); if (E1.lengthSq() < 1e-6) E1.copy(this.F.ey).addScaledVector(T, -this.F.ey.dot(T)); E1.normalize(); E2.crossVectors(T, E1);
  }
  // world position on the valve at height u, azimuth psi (deg), radius r (default: frame radius at u)
  vp(u, psi, r, out) {
    if (typeof r !== 'number') { out = r; r = this.rAt(u); }
    const c = Math.cos(psi * D2R) * r, s = Math.sin(psi * D2R) * r;
    const C = this._vC || (this._vC = new THREE.Vector3()), E1 = this._vE1 || (this._vE1 = new THREE.Vector3()), E2 = this._vE2 || (this._vE2 = new THREE.Vector3()), T = this._vT || (this._vT = new THREE.Vector3());
    this.frameU(u, C, E1, E2, T);
    out.copy(C).addScaledVector(E1, c).addScaledVector(E2, s);
    if (this.tiltK) { const dz = this.tiltK * (c * this.wtE1 + s * this.wtE2) - this.tiltOff; out.addScaledVector(T, dz * this.tiltW); }
    return out;
  }
  // Test helper: every vertex of the valve that is behind the capsule mouth (inside the capsule) vs the capsule's inner radius.
  containment() {
    const cl = this.cl, n = cl.n, P = cl.P, capEdge = this.capEdgeNow; const pts = [];
    const q = new THREE.Quaternion(), mid = new THREE.Vector3(), sc = new THREE.Vector3(), m = new THREE.Matrix4(), e = new THREE.Vector3(), a = new THREE.Vector3();
    for (let k = 0; k < this.struts.count; k++) { this.struts.getMatrixAt(k, m); m.decompose(mid, q, sc); e.set(0, sc.y / 2, 0).applyQuaternion(q); const th = Math.max(sc.x, sc.z) / 2; pts.push([mid.x + e.x, mid.y + e.y, mid.z + e.z, th, 'strut'], [mid.x - e.x, mid.y - e.y, mid.z - e.z, th, 'strut']); }
    for (const [im, th] of [[this.feet, 0.3], [this.beads, 0.45], [this.eyelets, 0.3]]) for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m); m.decompose(mid, q, sc); pts.push([mid.x, mid.y, mid.z, th, 'detail']); }
    for (const pm of this.posts) { const t = pm.userData.tube, R1 = t.radial + 1; for (let i = 0; i < t.rings * R1; i++) pts.push([t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2], 0, 'post']); }
    for (const v of this.vision) for (let c = 0; c < 8; c++) { a.set(c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5).applyMatrix4(v.matrix); pts.push([a.x, a.y, a.z, 0, 'vision']); }
    if (this.cuff.userData.show) { const pos = this.cuff.userData.pos; for (let i = 0; i < pos.length; i += 3) pts.push([pos[i], pos[i + 1], pos[i + 2], 0, 'cuff']); }
    let minMargin = 1e9, cnt = 0, worst = null;
    for (const [x, y, z, th, kind] of pts) {
      let best = 1e9, bi = 0;
      for (let i = 0; i < n - 1; i++) { const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[i * 3 + 3] - ax, by = P[i * 3 + 4] - ay, bz = P[i * 3 + 5] - az; const l2 = bx * bx + by * by + bz * bz || 1; let t = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = ax + bx * t - x, dy = ay + by * t - y, dz = az + bz * t - z, dd = dx * dx + dy * dy + dz * dz; if (dd < best) { best = dd; bi = i + t; } }
      const d = bi * CL.step; if (d < capEdge + 0.5) continue;
      cnt++; const margin = this.capInnerR(d - capEdge) - (Math.sqrt(best) + th); if (margin < minMargin) { minMargin = margin; worst = { kind, d: +d.toFixed(1), dist: +Math.sqrt(best).toFixed(2), inner: +this.capInnerR(d - capEdge).toFixed(2) }; }
    }
    return { n: cnt, total: pts.length, minMargin, worst };
  }
  setHighlight(id) { this.hl = id; }
  update(S, dt) {
    this.t += dt;
    const F = this.F, path = this.path, dv = S.dev;
    const sTip = dv.sd ?? dv.s, fx = S.fx;
    const f = dv.f;
    this.rel = !!(dv.released && dv.valveS != null);
    const rMm = PH.mmFromFraction(f);
    this.buildAxial(rMm);
    this.depthNow = dv.h || 0; this.inRootNow = S.phase >= 4 && Math.abs(S.sysZ()) < 60;
    const uMouth = this.rel ? 99 : PH.expandedCoord(rMm); this.kz = this.zAt(G.freeLen) / G.freeLen;
    const zTop = this.zAt(G.freeLen) + G.tabMm;
    const capEdge = DEV.noseL + (f < 1 ? Math.min(this.zAt(Math.min(uMouth, 60)), zTop + 1.5) : (zTop + 1.5) * (1 - dv.macro));
    const capEnd = capEdge + DEV.Lcap;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
    // ---------- smooth centreline (tip -> handle) ----------
    const cl = this.cl; cl.update(sTip, dv.lat, fx, dt, capEnd);
    this.tipPos = cl.at(0, this.tipPos || new THREE.Vector3());
    const ks = (d) => cl.kinkScale(d, fx, sTip), sm = smooth;
    const noseR = (d) => lerp(1.0, DEV.Rn - 0.15, Math.pow(sm(0, DEV.noseL, d), 0.7)) * (0.8 + 0.2 * Math.sqrt(sm(0, 1.4, d)));
    const innerR = () => DEV.Rinner;
    const capR = (d) => this.capOuterR(d - capEdge) * ks(d);
    const shaftR = (d) => lerp(DEV.Rshaft + 0.5, DEV.Rshaft, sm(0, 3, d - capEnd)) * lerp(1, DEV.Rsheath / DEV.Rshaft, sm(8, 14, d - capEnd)) * ks(d);
    const sheathR = (d) => DEV.Rsheath * ks(d);
    this.tNose.fromCentreline(cl, 0, DEV.noseL, 1, (d) => noseR(d));
    this.tNoseOut.fromCentreline(cl, 0, DEV.noseL, 1, (d) => noseR(d) + 0.1);
    this.tInner.fromCentreline(cl, DEV.noseL, capEdge, 2, innerR);
    this.tCap.fromCentreline(cl, capEdge, capEnd, 2, capR);
    this.tShaft.fromCentreline(cl, capEnd, capEnd + 14, 2, shaftR);
    this.tSheath.fromCentreline(cl, capEnd + 14, DEV.total, 2, sheathR);
    const posAt = (d, out) => cl.at(d, out);
    const place = (mesh, d0, d1, r) => { posAt(d0, a); posAt(d1, b); mid.copy(a).add(b).multiplyScalar(0.5); dir.copy(b).sub(a); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(up, dir); sc.set(r, len, r); m4.compose(mid, q, sc); mesh.matrix.copy(m4); mesh.matrixAutoUpdate = false; mesh.matrixWorldNeedsUpdate = true; mesh.matrixWorld.copy(m4); };
    place(this.tipHole, -0.12, 0.35, 0.84);
    place(this.capMarker, capEdge + 0.1, capEdge + 1.6, DEV.Rn + 0.12);
    place(this.innerMarker, DEV.noseL - 0.5, DEV.noseL + 1.7, 1.95);
    // ---------- valve frame of reference ----------
    const bl = smooth(0.3, 0.8, f); this.bl = bl; this.sTipNow = sTip;
    let vo, axis;
    if (this.rel) { vo = path.pos(dv.valveS, new THREE.Vector3()); axis = path.tan(dv.valveS, new THREE.Vector3()).negate(); }
    else {
      vo = cl.at(DEV.noseL, new THREE.Vector3()).addScaledVector(cl.offsetAt(DEV.noseL, new THREE.Vector3()), -bl);
      const sO = sTip - DEV.noseL; axis = cl.tan(DEV.noseL, new THREE.Vector3()).multiplyScalar(1 - bl).addScaledVector(path.tan(sO, dir).negate(), bl).normalize();
    }
    const e1 = F.ex.clone().addScaledVector(axis, -F.ex.dot(axis)).normalize(); const e2 = new THREE.Vector3().crossVectors(axis, e1);
    this.vo = vo; this.va = axis; this.ve1 = e1; this.ve2 = e2;
    const tiltTot = dv.tilt * smooth(0.35, 0.8, f);
    this.tiltW = 1; this.tiltK = tiltTot / Math.max(this.wtLen, 1); this.wtE1 = this.wt.dot(F.ex); this.wtE2 = this.wt.dot(F.ey);
    this.tiltOff = this.tiltK * (this.pN.dot(F.ex) * this.wtE1 + this.pN.dot(F.ey) * this.wtE2);
    const ld = this.rel ? 60 : uMouth; this.ld = ld; this.capEdgeNow = capEdge;
    const roll = dv.roll + dv.drift;
    const fC = this._fC || (this._fC = new THREE.Vector3()), fE1 = this._fE1 || (this._fE1 = new THREE.Vector3()), fE2 = this._fE2 || (this._fE2 = new THREE.Vector3()), fT = this._fT || (this._fT = new THREE.Vector3());
    // ---------- struts ----------
    { let k = 0; const P0 = this.sA || (this.sA = new THREE.Vector3()), P1 = this.sB || (this.sB = new THREE.Vector3());
      const m5 = new THREE.Matrix4(), d5 = new THREE.Vector3(), mid5 = new THREE.Vector3(), rad = new THREE.Vector3(), tan = new THREE.Vector3(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
      const strut = (A, B, uMid, psiMid) => { mid5.copy(A).add(B).multiplyScalar(0.5); d5.copy(B).sub(A); const len = d5.length() + 0.12; d5.normalize();
        this.frameU(uMid, fC, fE1, fE2, fT); rad.copy(mid5).sub(fC); rad.addScaledVector(fT, -rad.dot(fT)); if (rad.lengthSq() < 1e-6) rad.copy(fE1); rad.normalize();
        tan.crossVectors(d5, rad).normalize(); rad.crossVectors(tan, d5).normalize();
        const wScale = lerp(0.75, 1, this.eAt(uMid)); // crimped struts pack edge to edge
        bx.copy(tan).multiplyScalar(DEV.strutW * wScale); by.copy(d5).multiplyScalar(len); bz.copy(rad).multiplyScalar(DEV.strutT);
        m5.makeBasis(bx, by, bz); m5.setPosition(mid5); this.struts.setMatrixAt(k++, m5); };
      for (const E of this.edges) {
        const A = this.nodes[E.a], B = this.nodes[E.b]; let dpsi = B.psi - A.psi; if (dpsi > 180) dpsi -= 360; if (dpsi < -180) dpsi += 360;
        this.vp(A.u, roll + A.psi, P0);
        for (let t = 1; t <= E.ns; t++) { const tt = t / E.ns, u = lerp(A.u, B.u, tt); let psi = A.psi + dpsi * tt;
          if (E.bow) psi += E.bow * 3.2 * Math.sin(Math.PI * tt) * this.eAt(u) * (180 / (Math.PI * Math.max(this.rAt(u), 1))) ; // the crown struts bow sideways (in mm, converted to degrees at that radius)
          this.vp(u, roll + psi, P1); strut(P0, P1, lerp(A.u, B.u, tt - 0.5 / E.ns), 0); P0.copy(P1); }
      }
      this.struts.count = k; this.struts.instanceMatrix.needsUpdate = true; this.struts.userData.show = true; this.strutCountNow = k;
      // joints: a small sphere at every lattice node hides the segment seams and reads as the laser-cut node
      const cv = this.sC || (this.sC = new THREE.Vector3()); let nj = 0;
      for (const nd of this.nodes) { if (nd.u >= G.freeLen - 4 && nd.u < G.freeLen) continue; this.vp(nd.u, roll + nd.psi, cv); const rj = DEV.strutW * 0.62 * lerp(0.7, 1, this.eAt(nd.u)); m5.makeScale(rj, rj, rj); m5.setPosition(cv); this.joints.setMatrixAt(nj++, m5); }
      this.joints.count = nj; this.joints.instanceMatrix.needsUpdate = true; this.joints.userData.show = true;
      // inflow eyelets (9 suture eyelets at the rim)
      let nf = 0; for (const i of this.r0) { const nd = this.nodes[i]; this.vp(nd.u + 0.15, roll + nd.psi, cv); const rf = 0.42 * lerp(0.6, 1, this.eAt(0)); m5.makeScale(rf, rf, rf); m5.setPosition(cv); this.feet.setMatrixAt(nf++, m5); }
      this.feet.count = nf; this.feet.instanceMatrix.needsUpdate = true; this.feet.userData.show = true;
      // CAF plates (slotted) on the commissure nodes, flat against the frame
      let ne = 0, nsl = 0; const eT = new THREE.Vector3(), eR = new THREE.Vector3();
      for (let k2 = 0; k2 < 3; k2++) { const nd = this.nodes[this.cafIdx[k2]]; const ue = nd.u; this.vp(ue, roll + nd.psi, cv); this.frameU(ue, fC, fE1, fE2, fT); eR.copy(cv).sub(fC); eR.addScaledVector(fT, -eR.dot(fT)).normalize(); eT.crossVectors(fT, eR).normalize();
        const ee = lerp(0.55, 1, this.eAt(ue));
        m5.makeBasis(eT.clone().multiplyScalar(1.5 * ee), fT.clone().multiplyScalar(3.4), eR.clone().multiplyScalar(0.5)); m5.setPosition(cv); this.eyelets.setMatrixAt(ne++, m5);
        for (const dz of [-0.75, 0.75]) { const c2 = cv.clone().addScaledVector(fT, dz).addScaledVector(eR, 0.05); m5.makeBasis(eT.clone().multiplyScalar(0.9 * ee), fT.clone().multiplyScalar(0.8), eR.clone().multiplyScalar(0.62)); m5.setPosition(c2); this.eyeSlots.setMatrixAt(nsl++, m5); }
      }
      this.eyelets.count = ne; this.eyelets.instanceMatrix.needsUpdate = true; this.eyelets.userData.show = true; this.eyeSlots.count = nsl; this.eyeSlots.instanceMatrix.needsUpdate = true; this.eyeSlots.userData.show = true;
      // retainer tabs: short neck + paddle on the three crown peaks
      for (let p = 0; p < 3; p++) { const nd = this.nodes[this.tabIdx[p]]; const ee = this.eAt(G.freeLen - 1);
        const rT = this.rAt(nd.u) - 0.3 * (1 - ee); this.vp(nd.u + 0.6, roll + nd.psi, rT, cv); this.vp(nd.u + G.tabMm - 0.5, roll + nd.psi, rT, mid); this.frameU(nd.u + 1, fC, fE1, fE2, fT);
        dir.copy(mid).sub(cv); const L = dir.length() || 1; dir.normalize(); q.setFromUnitVectors(up, dir); m5.compose(cv.clone().lerp(mid, 0.5), q, sc.set(0.3, L, 0.3)); this.tabNecks.setMatrixAt(p, m5);
        m5.makeScale(0.62 * lerp(0.6, 1, ee), 0.62, 0.5 * lerp(0.6, 1, ee)); m5.setPosition(mid); this.beads.setMatrixAt(p, m5); }
      this.beads.count = 3; this.beads.instanceMatrix.needsUpdate = true; this.beads.userData.show = true; this.tabNecks.count = 3; this.tabNecks.instanceMatrix.needsUpdate = true; this.tabNecks.userData.show = true;
    }
    // CAF spine tubes along each commissure line (inflow rim -> CAF), used by tests for the commissure azimuth, drawn as the slightly heavier commissure strut
    for (let k = 0; k < 3; k++) {
      const psi = roll + DEV.commAz[k]; const pts = this.postPts[k];
      for (let i = 0; i < pts.length; i++) this.vp(lerp(0, G.lowerExp, i / (pts.length - 1)), psi, this.rAt(lerp(0, G.lowerExp, i / (pts.length - 1))) + 0.02, pts[i]);
      this.posts[k].userData.tube.fromPoints(pts.slice(6), () => DEV.strutT * 0.9);
      // Vision marker: tantalum disc between the cuffs, 3 mm above the inflow edge, exactly under the commissure
      const uM = DEV.markerU, rM = this.rAt(uM) + 0.22; this.vp(uM, psi, rM, mid); this.frameU(uM, fC, fE1, fE2, fT);
      const radial = mid.clone().sub(fC); radial.addScaledVector(fT, -radial.dot(fT)).normalize();
      const tang = new THREE.Vector3().crossVectors(fT, radial);
      const es = lerp(0.45, 1, this.eAt(uM));
      m4.makeBasis(tang.clone().multiplyScalar(1.05 * es), radial.clone().multiplyScalar(0.28), fT.clone().multiplyScalar(1.05)); m4.setPosition(mid);
      this.vision[k].matrix.copy(m4); this.vision[k].matrixAutoUpdate = false; this.vision[k].matrixWorld.copy(m4);
      const c2 = mid.clone().addScaledVector(radial, 0.16);
      m4.makeBasis(tang.clone().multiplyScalar(1.5 * es), fT.clone().multiplyScalar(0.26), radial.clone().multiplyScalar(0.12)); m4.setPosition(c2); this.visionCross[k][0].matrix.copy(m4); this.visionCross[k][0].matrixAutoUpdate = false; this.visionCross[k][0].matrixWorld.copy(m4);
      m4.makeBasis(tang.clone().multiplyScalar(0.26 * es), fT.clone().multiplyScalar(1.5), radial.clone().multiplyScalar(0.12)); m4.setPosition(c2); this.visionCross[k][1].matrix.copy(m4); this.visionCross[k][1].matrixAutoUpdate = false; this.visionCross[k][1].matrixWorld.copy(m4);
    }
    // crimped valve body (fluoro only): the part of the valve that has not left the capsule yet
    this.crimpBody.fromCentreline(cl, Math.max(capEdge, DEV.noseL), DEV.noseL + zTop, 2, () => DEV.rCrimp);
    // ---------- NaviSeal cuffs ----------
    const beat = this.heartPhase(S);
    const sealFill = dv.sealed ? 0.55 + 0.45 * beat.diastole : 0;
    { const m = this.cuff, pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0; const v = new THREE.Vector3(); const stepA = 360 / DEV.cells;
      for (let i = 0; i <= nu; i++) { const psiL = i * 360 / nu; const ph = ((psiL % stepA) / stepA); const tri = 1 - Math.abs(ph - 0.5) * 2;   // 1 at the row-1 nodes (psi = 20 + 40 i), 0 at the inflow apices
        const uTop = lerp(PUB.cuffHeightMm - 1.4, PUB.cuffHeightMm, tri * tri * (3 - 2 * tri));
        for (let j = 0; j <= nv; j++) { const t = j / nv, u = 0.25 + (uTop - 0.25) * t; const e = this.eAt(u);
          const rr = this.rAt(u) + (0.32 + 0.9 * sealFill * Math.sin(Math.PI * t) + 0.25 * Math.sin(Math.PI * t) * (1 - 0.6 * tri)) * e + 0.05;
          this.vp(u, roll + psiL, rr, v); pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; } }
      m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.userData.show = ld > 1.5; }
    { const m = this.cuffIn, pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0; const v = new THREE.Vector3();
      for (let i = 0; i <= nu; i++) { const psiL = i * 360 / nu;
        for (let j = 0; j <= nv; j++) { const t = j / nv, u = 0.3 + (PUB.halfCellHeightMm * 2 - 0.3) * t; const e = this.eAt(u); const rr = this.rAt(u) - 0.3 * e - 0.02; this.vp(u, roll + psiL, rr, v); pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; } }
      m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.userData.show = ld > 1.5; }
    // ---------- leaflets ----------
    { const openBase = dv.leafOpen; const open = dv.released ? openBase * beat.systole : openBase; const v = new THREE.Vector3();
      for (let l = 0; l < 3; l++) { const m = this.leaf[l], pos = m.userData.pos, nu = m.userData.nu, nv = m.userData.nv; let k = 0; const psi0 = DEV.commAz[l];
        for (let i = 0; i <= nu; i++) { const a2 = -1 + 2 * i / nu; const psi = psi0 + 60 + 60 * a2 * 0.985;
          const uA = 5.5 + (G.lowerExp - 5.5) * Math.pow(Math.abs(a2), 1.6);             // scalloped attachment: nadir 5.5 mm, up to the CAF at 24 mm
          const uF = lerp(17.5 + 1.5 * open, G.lowerExp, a2 * a2);                           // free edge: coaptation ~17.5 mm, commissure tips at 24
          for (let j = 0; j <= nv; j++) { const t = j / nv; const u = lerp(uA, uF, t); const e = this.eAt(u);
            const rW = this.rAt(u) - 0.45 * e; const close = 1 - open;
            const rEdge = rW * (lerp(0.04, 1, Math.pow(Math.abs(a2), 1.15)) * close + 0.93 * open);
            let rr = lerp(rW, rEdge, t) - rW * 0.12 * Math.sin(Math.PI * t) * (1 - a2 * a2) * close;   // slight belly toward the axis when closed
            rr = Math.max(rr, 0.15) * lerp(0.35, 1, e);
            this.vp(u, roll + psi, rr, v); pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z; } }
        m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); m.userData.show = ld > 7; } }
    this.updateWire(S);
    // part highlight pulse
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    for (const id in this.parts) for (const o of this.parts[id]) { const m = o.userData.matAnat; if (m && m.emissive) { const base = o.userData.baseEm || (o.userData.baseEm = m.emissive.clone()); if (this.hl === id) m.emissive.setRGB(0.5 + 0.4 * pulse, 0.5 + 0.4 * pulse, 0.1); else m.emissive.copy(base); } }
  }
  // cardiac cycle for the leaflets and the active cuff: pacing rate from the sim, otherwise ~72 bpm
  heartPhase(S) {
    const bpm = S.pacing === 'fast' ? 180 : S.pacing === '120' ? 120 : 72;
    this.beatT = (this.beatT || 0) + (this._lastT != null ? this.t - this._lastT : 0) * bpm / 60; this._lastT = this.t;
    const ph = this.beatT % 1; const systole = smooth(0.02, 0.14, ph) * (1 - smooth(0.3, 0.42, ph));
    return { ph, systole, diastole: 1 - systole };
  }
  // WIRE AS RAIL (unchanged): the guidewire runs through the lumen and out of the nosecone, then along the anatomical path to its pigtail tip.
  updateWire(S) {
    const w = S.wire, dv = S.dev, cl = this.cl, path = this.path;
    const sTip = this.sTipNow ?? (dv.sd ?? dv.s);
    const P = cl.P; const key = [Math.round(sTip * 20), Math.round(w.s * 4), S.wireVer, w.removed ? 1 : 0, Math.round((P[300] + 3 * P[301] + 7 * P[302] + P[900] + 3 * P[901] + 7 * P[902]) * 200), S.fx ? S.fx.type + Math.round(S.fx.t * 20) : ''].join(',');
    if (key === this.wireKey) return; this.wireKey = key;
    if (w.removed) { this.wirePts = []; this.wireTube.fromPoints([], () => 0.45); return; }
    const pts = []; const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const dTip = Math.max(0, sTip - w.s);
    const nIdx = cl.n - 1;
    const tEnd = cl.tan(CL.total, new THREE.Vector3()), pEnd = cl.at(CL.total, new THREE.Vector3());
    for (let k = 10; k >= 1; k--) pts.push(pEnd.clone().addScaledVector(tEnd, k * 12));
    const iStart = Math.min(nIdx, Math.ceil(dTip / CL.step));
    for (let i = nIdx; i >= iStart; i--) pts.push(v(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
    this.wireTipIdx = pts.length - 1;
    if (dTip <= 0) {
      const ctrl = [cl.at(0, new THREE.Vector3())]; const sEnd = Math.min(w.s, path.length + 120);
      for (let s = sTip + 6; s < sEnd - 3; s += 6) ctrl.push(path.pos(s, new THREE.Vector3()));
      const T = path.pos(sEnd, new THREE.Vector3()); ctrl.push(T.clone());
      const t = path.tan(Math.min(sEnd, path.length - 1), new THREE.Vector3()), u = this.F.ex.clone();
      u.addScaledVector(t, -u.dot(t)).normalize();
      const Rc = 8; const C = T.clone().addScaledVector(u, Rc);
      for (let th = 10; th <= 430; th += 10) { const a = th * D2R; ctrl.push(C.clone().addScaledVector(u, -Math.cos(a) * Rc).addScaledVector(t, Math.sin(a) * Rc + th * 0.012)); }
      if (ctrl.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'); curve.arcLengthDivisions = ctrl.length * 6;
        const len = curve.getLength(); const n = Math.max(4, Math.ceil(len / 1.5));
        const fw = curve.getSpacedPoints(n); for (let i = 1; i < fw.length; i++) pts.push(fw[i]);
      }
    }
    this.wirePts = pts; this.wireTube.fromPoints(pts, () => 0.45);
  }
}
