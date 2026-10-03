// Builds all static anatomy meshes + a registry that lets every object carry an "anatomy" and a "fluoro" material.
import * as THREE from 'three';
import { D2R, clamp, lerp, smooth, mulberry32, CASE } from './util.js';
import { R_ANN, Path, tubeGeom, rootGeom, sinusProfile, lvProfile } from './anatomy.js';

export const wallClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
export function anatMat(color, opacity = 1, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 0.95, emissive: o.emissive ?? 0x000000, flatShading: !!o.flat });
  if (o.clip) { m.userData.clip = true; }
  return m;
}
export function fluMat(att, line = false) {
  const p = { color: new THREE.Color(att, att, att), blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide };
  return line ? new THREE.LineBasicMaterial(p) : new THREE.MeshBasicMaterial(p);
}
export const lumenUniforms = {}; // name -> {uFront,uStrength}
export function lumenMat(name, rev = false) {
  const u = { uFront: { value: -1 }, uStrength: { value: 0 }, uRev: { value: rev ? 1 : 0 } };
  lumenUniforms[name] = u;
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'attribute float aS; varying float vS; uniform float uRev; void main(){ vS = mix(aS, 1.0-aS, uRev); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying float vS; uniform float uFront; uniform float uStrength; void main(){ float a = uStrength*smoothstep(uFront, uFront-0.18, vS); gl_FragColor = vec4(vec3(a),1.0); }',
  });
}

// anatomy-mode hint of the same contrast puff (shares the uniforms of the fluoro lumen material)
export function lumenAnat(name, rev = false) {
  return new THREE.ShaderMaterial({
    uniforms: lumenUniforms[name], transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'attribute float aS; varying float vS; uniform float uRev; void main(){ vS = mix(aS, 1.0-aS, uRev); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying float vS; uniform float uFront; uniform float uStrength; void main(){ float a = 1.7*uStrength*smoothstep(uFront, uFront-0.18, vS); gl_FragColor = vec4(a*0.95, a*0.55, a*0.12, 1.0); }',
  });
}

export class Registry {
  constructor() { this.items = []; this.walls = []; }
  add(obj, { anat = null, flu = null, group = 'static', wall = false, show = true } = {}) {
    obj.userData.matAnat = anat; obj.userData.matFlu = flu; obj.userData.show = show; obj.userData.group = group;
    obj.frustumCulled = false;
    this.items.push(obj);
    if (wall && anat) this.walls.push(anat);
    if (anat) obj.material = anat; else if (flu) obj.material = flu;
    return obj;
  }
  setMode(mode) { // 'anat' | 'flu'
    for (const o of this.items) {
      const m = mode === 'flu' ? o.userData.matFlu : o.userData.matAnat;
      o.visible = !!(o.userData.show && m);
      if (m) o.material = m;
    }
  }
  setCutaway(on) { for (const m of this.walls) { m.clippingPlanes = on ? [wallClip] : []; m.needsUpdate = true; } }
}

export function buildScene(F, P) {
  const { path, lm, left } = P;
  const reg = new Registry();
  const scene = new THREE.Scene();
  const rootGroup = new THREE.Group(); rootGroup.name = 'root'; scene.add(rootGroup); // moves with cardiac bounce
  const rnd = mulberry32(CASE.seed + 7);
  const add = (obj, o, parent = scene) => { parent.add(obj); return reg.add(obj, o); };
  const mesh = (g, a, f, o = {}, parent = scene) => add(new THREE.Mesh(g, a || f), { anat: a, flu: f, ...o }, parent);
  const colors = { NCC: 0xffb300, RCC: 0x43c466, LCC: 0xb07cff };

  // ---- aortic root wall + lumen (contrast) ----
  const rootG = rootGeom(F, -3, 40, sinusProfile);
  mesh(rootG, anatMat(0xd2606a, 0.17, { clip: true }), null, { wall: true, group: 'root' }, rootGroup);
  { const f = lumenMat('root'); mesh(rootG, lumenAnat('root'), f, { group: 'root' }, rootGroup); }
  // ---- LV ----
  const lvG = rootGeom(F, -100, -2, lvProfile, { nz: 30, nt: 40 });
  mesh(lvG, anatMat(0xc96b78, 0.1, { clip: true }), null, { wall: true, group: 'root' }, rootGroup);
  { const f = lumenMat('lv'); mesh(lvG, lumenAnat('lv'), f, { group: 'root' }, rootGroup); }
  // ---- ascending / arch / descending / abdominal aorta ----
  const sA0 = lm.ann - 38, sA1 = lm.bif + 6;
  const aortaG = tubeGeom(path, sA0, sA1, s => path.radius(s), { radial: 24, step: 4, shiftFn: s => path.shift(s) });
  mesh(aortaG, anatMat(0xd2606a, 0.15, { clip: true }), null, { wall: true });
  // lumen only from the root up to the arch apex for the root aortogram
  const ascG = tubeGeom(path, lm.archStart + 20, sA0 + 2, s => path.radius(s) - 0.3, { radial: 20, step: 4, shiftFn: s => path.shift(s) });
  { const f = lumenMat('asc', true); mesh(ascG, lumenAnat('asc', true), f); }
  // ---- iliacs + femoral ----
  const ilG = tubeGeom(path, lm.cfa, lm.bif + 8, s => path.radius(s) * (Math.abs(s - lm.plaque) < 14 ? 0.82 : 1), { radial: 16, step: 3, shiftFn: s => path.shift(s) * 0.6 });
  mesh(ilG, anatMat(0xd2606a, 0.2, { clip: true }), null, { wall: true });
  mesh(ilG, null, lumenMat('iliac'));
  const lilG = tubeGeom(left, 0, left.length - 6, s => left.radius(s), { radial: 14, step: 4 });
  mesh(lilG, anatMat(0xd2606a, 0.2, { clip: true }), null, { wall: true });
  mesh(lilG, null, lumenMat('iliacL'));
  // ---- plaque with calcium on the first/second iliac bend ----
  const plaqueG = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 9; i++) {
    const s = lm.plaque + (i - 4) * 4.2 + (rnd() - 0.5) * 2;
    const p = path.pos(s), o = path.outer(s), N = path.Nn[Math.round(s / path.h)], B = path.Bn[Math.round(s / path.h)];
    const ang = (rnd() - 0.5) * 1.6 + Math.PI;
    const r = path.radius(s) * 0.82 - 0.4;
    const q = p.clone().addScaledVector(o, path.shift(s) * 0.6).addScaledVector(N, Math.cos(ang) * r * 0.9).addScaledVector(B, Math.sin(ang) * r * 0.9);
    const m = mesh(plaqueG, anatMat(0xf1ead6, 1, { rough: 0.9 }), fluMat(0.5), { group: 'plaque' });
    m.position.copy(q); m.scale.set(1.9 + rnd() * 1.4, 1.5 + rnd(), 2.8 + rnd() * 1.6); m.lookAt(p);
  }
  // ---- cusps, calcium, annulus, membranous septum ----
  const cuspGeom = (az0) => {
    const nA = 18, nV = 8, pos = [], idx = [];
    for (let i = 0; i <= nA; i++) {
      const a = -1 + 2 * i / nA, th = az0 + 60 * a;
      const zA = 19 * a * a, [b, l] = sinusProfile(zA), rA = b + l * Math.cos(3 * (th - 180) * D2R) - 0.3;
      const zF = lerp(9.5, 19, a * a), rF = (rA) * (a * a) * 0.98;
      for (let j = 0; j <= nV; j++) {
        const v = j / nV, z = lerp(zA, zF, v) - 3.2 * Math.sin(Math.PI * v) * (1 - a * a), r = lerp(rA, rF, v) + 0.9 * Math.sin(Math.PI * v) * (1 - a * a);
        const p = F.pt(th, r, z); pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < nA; i++) for (let j = 0; j < nV; j++) { const a = i * (nV + 1) + j, b2 = a + nV + 1; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return { g, pos };
  };
  const cuspMeshes = {};
  for (const k of ['NCC', 'RCC', 'LCC']) {
    const { g, pos } = cuspGeom(F.cuspAz[k]);
    cuspMeshes[k] = mesh(g, anatMat(colors[k], 0.62, { rough: 0.7 }), null, { group: 'root' }, rootGroup);
    // calcium nodules
    const cg = new THREE.IcosahedronGeometry(1, 1);
    const nodes = k === 'NCC' ? 4 : 3;
    for (let i = 0; i < nodes; i++) {
      const vi = Math.floor((0.25 + rnd() * 0.5) * 18) * 9 + Math.floor((0.25 + rnd() * 0.55) * 8);
      const c = mesh(cg, anatMat(0xffffff, 1, { rough: 0.9 }), fluMat(0.55), { group: 'root' }, rootGroup);
      c.position.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]); c.scale.set(1.1 + rnd(), 1.0 + rnd() * 0.7, 1.4 + rnd());
    }
  }
  // annulus ring (24 mm) - anatomy mode only; fluoro guide is drawn in the overlay
  { const pts = []; for (let i = 0; i < 64; i++) pts.push(F.pt(i / 64 * 360, R_ANN, 0)); pts.push(pts[0].clone());
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffee58 })), { anat: new THREE.LineBasicMaterial({ color: 0xffee58 }), flu: null, group: 'root' }, rootGroup); }
  // membranous septum under the NCC
  { const nz = 6, nt = 10, pos = [], idx = [];
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= nt; j++) { const z = -7.5 + 7 * i / nz, th = 180 - 16 + 32 * j / nt; const p = F.pt(th, 12.4 + 0.3, z - 0.5); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b2 = a + nt + 1; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, anatMat(0xe6d9ff, 0.9, { emissive: 0x2a2250 }), null, { group: 'root' }, rootGroup); }
  // ---- coronaries ----
  const cor = (pts, rad, name, rev) => {
    const cp = new Path(pts, pts.map(() => rad));
    const g = tubeGeom(cp, 0, cp.length, () => rad, { radial: 10, step: 2 });
    mesh(g, anatMat(name === 'rca' ? 0x66d9a0 : 0xff8fb0, 0.85), null, { group: 'root' }, rootGroup);
    { const f = lumenMat(name); mesh(g, lumenAnat(name), f, { group: 'root' }, rootGroup); }
    return cp;
  };
  { const rr = sinusProfile(13)[0] + sinusProfile(13)[1] - 0.5;
    cor([F.pt(-60, rr, 13), F.pt(-60, rr + 9, 14), F.pt(-72, rr + 20, 6), F.pt(-92, rr + 28, -10), F.pt(-120, rr + 30, -28), F.pt(-150, rr + 22, -44)], 1.6, 'rca');
    cor([F.pt(60, rr, 14), F.pt(60, rr + 8, 15), F.pt(56, rr + 16, 10), F.pt(40, rr + 24, -4), F.pt(26, rr + 28, -22)], 1.7, 'lad');
    cor([F.pt(60, rr + 12, 13), F.pt(78, rr + 18, 6), F.pt(98, rr + 22, -8), F.pt(118, rr + 22, -24)], 1.4, 'lcx'); }
  // ---- pigtail (from the other, left, femoral access) sitting in the NCC ----
  { const pts = [];
    for (let i = left.wp.length - 1; i >= 1; i--) pts.push(left.P[Math.round(left.wp[i] / left.h)].clone());
    for (let s = lm.bif + 20; s < lm.ann - 38; s += 90) { const p = path.pos(s), N = path.Nn[Math.round(s / path.h)]; pts.push(p.clone().addScaledVector(N, 4).addScaledVector(path.outer(s), path.shift(s))); }
    pts.push(F.pt(180, 6, 38), F.pt(180, 9.4, 22), F.pt(180, 11, 10));
    const nadir = F.pt(180, 11.4, 0.9), tang = F.dir(180 + 90), rc = 4.2;
    const cc = nadir.clone().addScaledVector(F.n, rc);
    for (let a = -90; a <= 270; a += 28) { const ra = a * D2R; pts.push(cc.clone().addScaledVector(tang, Math.cos(ra) * rc * (1 - 0.15 * (a + 90) / 360)).addScaledVector(F.n, Math.sin(ra) * rc * (1 - 0.15 * (a + 90) / 360))); }
    const cp = new Path(pts, pts.map(() => 0.9));
    const g = tubeGeom(cp, 0, cp.length, () => 0.9, { radial: 8, step: 3 });
    mesh(g, anatMat(0xb8c4d6, 1), fluMat(0.34), { group: 'root' }, rootGroup);
    P.pigtailTip = nadir; }
  // ---- temporary RV wire ----
  { const pts = [new THREE.Vector3(-28, -230, -40), new THREE.Vector3(-32, -110, -30), new THREE.Vector3(-38, -40, -10), new THREE.Vector3(-34, -12, 8), new THREE.Vector3(-10, -30, 28), new THREE.Vector3(18, -58, 40)];
    const cp = new Path(pts, pts.map(() => 0.5));
    const g = tubeGeom(cp, 0, cp.length, () => 0.55, { radial: 6, step: 4 });
    mesh(g, anatMat(0x9bd0ff, 1), fluMat(0.3));
    const tip = mesh(new THREE.SphereGeometry(1.1, 8, 6), anatMat(0xffe082, 1), fluMat(0.5)); tip.position.copy(pts[pts.length - 1]); }
  // ---- spine (faint orientation in fluoro) ----
  { const vg = new THREE.CylinderGeometry(1, 1, 1, 10);
    for (let i = 0; i < 26; i++) { const y = -330 + i * 19, curve = Math.sin(i / 25 * Math.PI) * -6;
      const m = mesh(vg, null, fluMat(0.075), { group: 'spine' }); m.position.set(14 + curve * 0.2, y, -100 + curve); m.scale.set(15, 14, 13); m.rotation.x = Math.PI / 2 * 0.0; m.rotation.z = 0; m.rotation.x = 1.5708; m.scale.set(15, 13, 14); } }
  // ---- paravalvular jet (only visible in fluoro during the completion aortogram) ----
  { const g = new THREE.ConeGeometry(2.6, 18, 10, 4, true); const m = new THREE.Mesh(g, null);
    const base = F.pt(215, 13.2, -4); m.position.copy(base); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), F.n.clone().negate());
    const aa = g.attributes.position, sArr = new Float32Array(aa.count); for (let i = 0; i < aa.count; i++) sArr[i] = (aa.getY(i) + 9) / 18; g.setAttribute('aS', new THREE.BufferAttribute(sArr, 1));
    { const f = lumenMat('jet', true); add(m, { anat: lumenAnat('jet', true), flu: f, group: 'root' }, rootGroup); } }
  // ---- lights ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.2); d1.position.set(200, 300, 400); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0x88aaff, 0.5); d2.position.set(-300, -100, -200); scene.add(d2);
  return { scene, reg, rootGroup, cuspMeshes, colors };
}
