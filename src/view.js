// Monitor (C-arm orthographic, fluoro post-process or anatomy), 3D panel (perspective / orbit) and the 2D overlay.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { D2R, R2D, clamp, lerp, smooth, beamDir, fmtLao, fmtCra, wrap180 } from './util.js';
import { lumenUniforms, wallClip } from './scene.js';
import { R_ANN } from './anatomy.js';
import { DEV } from './device.js';

const POST_FRAG = `
precision highp float; varying vec2 vUv; uniform sampler2D tAcc; uniform float uTime; uniform vec2 uRes; uniform float uAspect; uniform float uNoise; uniform float uFail;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 px = 1.0/uRes; vec2 uv = vUv;
  float a = texture2D(tAcc, uv).r*0.36 + (texture2D(tAcc, uv+vec2(px.x,0.)).r + texture2D(tAcc, uv-vec2(px.x,0.)).r + texture2D(tAcc, uv+vec2(0.,px.y)).r + texture2D(tAcc, uv-vec2(0.,px.y)).r)*0.16;
  float n = hash(uv*uRes + vec2(floor(uTime*24.0)*17.13, floor(uTime*24.0)*3.7)) - 0.5;
  float n2 = hash(uv*uRes*0.5 + vec2(floor(uTime*12.0)*7.1, 1.3)) - 0.5;
  vec2 c = (uv-0.5)*vec2(uAspect,1.0);
  float r = length(c);
  float bg = 0.80 - 0.22*smoothstep(0.1, 0.75, r);
  float I = bg*exp(-1.7*a);
  I += (n*0.085 + n2*0.05)*uNoise*(0.4+0.8*I);
  I = pow(clamp(I,0.0,1.0), 0.92);
  float mask = smoothstep(0.80, 0.74, r*0.95);
  I = mix(I, I*0.8+0.05*sin(uTime*40.0), uFail*0.5);
  gl_FragColor = vec4(vec3(I*mask), 1.0);
}`;

export class Views {
  constructor(sim, world, device, dom) {
    this.sim = sim; this.W = world; this.dev = device; this.dom = dom; this.F = world.F; this.P = world.P;
    this.mode = 'fluoro'; this.lock = true; this.cutaway = false;
    this.overlay = { labels: true, parallax: true, angles: true, guides: true };
    this.zoom = 1;
    // monitor
    this.rMon = new THREE.WebGLRenderer({ canvas: dom.mon, antialias: true, preserveDrawingBuffer: true });
    this.rMon.setClearColor(0x0a0f18, 1);
    this.rMon.localClippingEnabled = true;
    this.camMon = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 1600);
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.postScene = new THREE.Scene(); this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({ uniforms: { tAcc: { value: this.rt.texture }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(512, 512) }, uAspect: { value: 1 }, uNoise: { value: 1 }, uFail: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }', fragmentShader: POST_FRAG, depthTest: false, depthWrite: false });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    // 3D panel
    this.r3 = new THREE.WebGLRenderer({ canvas: dom.td, antialias: true, preserveDrawingBuffer: true });
    this.r3.setClearColor(0x0d1420, 1); this.r3.localClippingEnabled = true;
    this.cam3 = new THREE.PerspectiveCamera(34, 1, 1, 3000);
    this.controls = new OrbitControls(this.cam3, dom.td);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12; this.controls.enablePan = false; this.controls.enabled = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.center = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.fov = 90; this.upT = new THREE.Vector3(0, 1, 0);
    this.centerT = new THREE.Vector3(); this.fovT = 90;
    this.ctx = dom.ov.getContext('2d');
    this.sizeAll();
    this.free3 = false; this._prevLock = true; this.raycaster = new THREE.Raycaster(); this.hoverPart = null;
    dom.td.addEventListener('pointermove', e => this.hover(e)); dom.td.addEventListener('pointerleave', () => { this.hoverPart = null; this.dev.setHighlight(this.legendPart || null); });
    dom.td.addEventListener('click', e => this.hover(e, true));
    this.initCenter();
  }
  initCenter() { this.updateTarget(true); }
  sizeAll() {
    const fit = (r, c) => { const w = Math.max(2, c.clientWidth), h = Math.max(2, c.clientHeight); const pr = Math.min(window.devicePixelRatio || 1, 2); if (c._w !== w || c._h !== h || c._pr !== pr) { r.setPixelRatio(pr); r.setSize(w, h, false); c._w = w; c._h = h; c._pr = pr; return true; } return false; };
    const a = fit(this.rMon, this.dom.mon);
    const w = this.dom.mon.clientWidth, h = this.dom.mon.clientHeight, pr = Math.min(window.devicePixelRatio || 1, 2);
    if (a || this.rt.width !== Math.round(w * pr * 0.8)) { this.rt.setSize(Math.max(2, Math.round(w * pr * 0.8)), Math.max(2, Math.round(h * pr * 0.8))); this.postMat.uniforms.uRes.value.set(this.rt.width, this.rt.height); this.postMat.uniforms.uAspect.value = w / h; }
    const ov = this.dom.ov; if (ov.width !== Math.round(w * pr) || ov.height !== Math.round(h * pr)) { ov.width = Math.round(w * pr); ov.height = Math.round(h * pr); }
    fit(this.r3, this.dom.td);
    this.camMon.userData.aspect = w / h; this.cam3.aspect = this.dom.td.clientWidth / this.dom.td.clientHeight; this.cam3.updateProjectionMatrix();
  }
  setMode(m) { this.mode = m; }
  setLock(l) {
    this.lock = l; this.controls.enabled = !l;
    if (!l) { this.controls.target.copy(this.center); }
  }
  // where the table / magnification is
  updateTarget(snap = false) {
    const S = this.sim, lm = S.lm, path = S.path, F = this.F, d = S.dev;
    const ph = S.phase;
    const root = F.n.clone().multiplyScalar(8);
    let c, fov, rootMode;
    const nearRoot = d.s > lm.ann - 85;
    if (ph >= 4 && ph <= 7 || (ph === 8 && nearRoot) || (ph === 9 && !S.flags.wireRemoved) || S.finished) { c = root; fov = 40; rootMode = true; }
    else if (ph === 9) { c = path.pos(lm.plaque, new THREE.Vector3()); fov = 85; rootMode = false; }
    else { c = path.pos(clamp(d.s - 10, 0, path.length), new THREE.Vector3()); fov = d.s < lm.bif + 60 ? 70 : d.s < lm.descTop ? 105 : 92; rootMode = false; if (ph === 1 && d.s < lm.cfa + 50) { fov = 60; } }
    fov /= this.zoom;
    this.centerT.copy(c); this.fovT = fov; this.upT.copy(rootMode ? F.n : new THREE.Vector3(0, 1, 0)); this.rootMode = rootMode;
    if (snap) { this.center.copy(c); this.fov = fov; this.up.copy(this.upT); }
  }
  frameUpdate(dt) {
    this.sizeAll(); this.updateTarget();
    const k = clamp(dt * 3.5, 0, 1);
    this.center.lerp(this.centerT, k); this.fov = lerp(this.fov, this.fovT, k); this.up.lerp(this.upT, clamp(dt * 4, 0, 1)).normalize();
    const S = this.sim, c = S.carm;
    const b = beamDir(c.lao, c.cra);
    const aspect = this.camMon.userData.aspect || 1;
    const cm = this.camMon; cm.left = -this.fov * aspect; cm.right = this.fov * aspect; cm.top = this.fov; cm.bottom = -this.fov; cm.updateProjectionMatrix();
    cm.up.copy(this.up); if (Math.abs(this.up.dot(b)) > 0.98) cm.up.set(0, 0, 1);
    cm.position.copy(this.center).addScaledVector(b, 700); cm.lookAt(this.center); cm.updateMatrixWorld(true);
    // root bounce
    this.W.rootGroup.position.copy(this.F.n).multiplyScalar(S.rootDelta || 0);
    // contrast uniforms
    this.updateContrast();
    // 3D panel camera
    const dist = this.fov * 2.9 / Math.tan(this.cam3.fov * D2R / 2) / 2.9 * 1.15;
    if (this.lock) { this.cam3.up.copy(cm.up); this.cam3.position.copy(this.center).addScaledVector(b, dist); this.cam3.lookAt(this.center); this.controls.target.copy(this.center); }
    else { const delta = this.center.clone().sub(this.controls.target); this.cam3.position.add(delta); this.controls.target.copy(this.center); this.controls.update(); }
  }
  updateContrast() {
    const S = this.sim, U = lumenUniforms;
    const set = (n, front, str) => { if (U[n]) { U[n].uFront.value = front; U[n].uStrength.value = str; } };
    for (const n in U) set(n, -1, 0);
    const prof = q => { const x = q.t / q.dur; return { front: clamp(q.t / 1.1, 0, 1.4), str: smooth(0, 0.08, x) * (1 - smooth(0.55, 1, x)) }; };
    const r = S.contrast.root; if (r) { const p = prof(r); set('root', p.front * 1.0, 0.5 * p.str); set('asc', p.front * 1.0 - 0.25, 0.42 * p.str); }
    const cj = S.contrast.cor; if (cj) { const p = prof(cj); const a = 0.85 * cj.amt; set('rca', p.front * 1.0 - 0.3, a * p.str); set('lad', p.front - 0.3, a * p.str); set('lcx', p.front - 0.3, a * p.str); }
    const lvq = S.contrast.lv; if (lvq) { const p = prof(lvq); set('lv', p.front * 1.0 - 0.45, 0.42 * lvq.amt * p.str); }
    const pj = S.contrast.pvlJet; if (pj) { const p = prof(pj); set('jet', p.front + 0.1, 0.9 * pj.amt * p.str); }
    const il = S.contrast.iliac; if (il) { const p = prof(il); set('iliac', p.front * 1.0, 0.5 * p.str); set('iliacL', p.front, 0.4 * p.str); }
  }
  hover(e, click = false) {
    const r = this.dom.td.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera({ x, y }, this.cam3);
    this.W.reg.setMode('anat');
    const objs = []; for (const id in this.dev.parts) for (const o of this.dev.parts[id]) if (o.visible) objs.push(o);
    const hits = this.raycaster.intersectObjects(objs, false);
    const id = hits.length ? (hits[0].object.userData.part) : null;
    this.hoverPart = id; this.dev.setHighlight(id || this.legendPart || null);
    if (this.onHover) this.onHover(id, click);
  }
  render(dt, t) {
    this.frameUpdate(dt);
    const S = this.sim, reg = this.W.reg, scene = this.W.scene;
    // --- monitor ---
    wallClip.normal.copy(this.camMon.getWorldDirection(new THREE.Vector3())); wallClip.constant = -wallClip.normal.dot(this.center);
    if (this.mode === 'fluoro') {
      reg.setMode('flu'); scene.background = null;
      this.rMon.setRenderTarget(this.rt); this.rMon.setClearColor(0x000000, 1); this.rMon.clear(); this.rMon.render(scene, this.camMon);
      this.rMon.setRenderTarget(null);
      this.postMat.uniforms.uTime.value = t; this.postMat.uniforms.uFail.value = S.fx ? 1 : 0;
      this.rMon.render(this.postScene, this.postCam);
    } else {
      reg.setMode('anat'); reg.setCutaway(this.cutaway);
      scene.background = new THREE.Color(0x0b1220); this.rMon.setClearColor(0x0b1220, 1); this.rMon.render(scene, this.camMon);
    }
    // --- 3D panel ---
    reg.setMode('anat'); reg.setCutaway(this.cutaway); scene.background = new THREE.Color(0x0d1420);
    const v3 = new THREE.Vector3(); this.cam3.getWorldDirection(v3); wallClip.normal.copy(v3); wallClip.constant = -v3.dot(this.center);
    this.r3.render(scene, this.cam3);
    scene.background = null;
    this.drawOverlay(t);
  }
  proj(p, out = new THREE.Vector3()) {
    out.copy(p).project(this.camMon); const w = this.dom.ov.width, h = this.dom.ov.height; return out.set((out.x * 0.5 + 0.5) * w, (-out.y * 0.5 + 0.5) * h, out.z);
  }
  drawOverlay(t) {
    const S = this.sim, F = this.F, ctx = this.ctx, w = this.dom.ov.width, h = this.dom.ov.height, pr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, w, h);
    const px = v => v * pr * (w / pr > 700 ? 1 : 0.9);
    const O = this.overlay, vi = S.viewInfo(), d = S.dev, rd = new THREE.Vector3().copy(F.n).multiplyScalar(S.rootDelta || 0);
    ctx.font = `${px(12)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'top';
    const fluo = this.mode === 'fluoro';
    const placed = this.labelRects = []; // label boxes of this frame: later labels are nudged so none overlap
    const txt = (s, x, y, col = '#d7e3f4', align = 'left') => {
      const m = ctx.measureText(s).width, hh = px(16); let xx = align === 'right' ? x - m : x; xx = Math.max(px(3) + 3, Math.min(xx, w - m - px(3) - 3));
      let yy = y; const hit = (yv) => placed.some(r => xx - 3 < r.x + r.w && xx - 3 + m + 6 > r.x && yv - 2 < r.y + r.h && yv - 2 + hh > r.y);
      for (let k = 0; k < 8 && hit(yy); k++) yy += hh + px(1);
      if (hit(yy) || yy + hh > h) { yy = y; for (let k = 0; k < 8 && hit(yy); k++) yy -= hh + px(1); }
      placed.push({ x: xx - 3, y: yy - 2, w: m + 6, h: hh, s });
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(xx - 3, yy - 2, m + 6, hh); ctx.fillStyle = col; ctx.fillText(s, xx, yy); };
    const inRoot = this.rootMode;
    // guides in the root
    if (O.guides && S.phase >= 4 || (O.guides && S.phase === 9 && inRoot)) {
      const ring = []; for (let i = 0; i <= 72; i++) ring.push(this.proj(F.pt(i / 72 * 360, R_ANN, 0).add(rd)));
      ctx.strokeStyle = vi.edgeOn ? 'rgba(255,238,88,0.9)' : 'rgba(255,238,88,0.55)'; ctx.lineWidth = px(1.2); ctx.setLineDash([px(5), px(4)]); ctx.beginPath(); ring.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
      const col = { NCC: '#ffb300', RCC: '#43c466', LCC: '#b07cff' };
      for (const k of ['NCC', 'RCC', 'LCC']) { const p = this.proj(F.pt(F.cuspAz[k], R_ANN, 0).add(rd)); ctx.fillStyle = col[k]; ctx.beginPath(); ctx.arc(p.x, p.y, px(4.5), 0, 7); ctx.fill(); if (O.labels) txt(k, p.x + px(7), p.y + px(2), col[k]); }
      ctx.fillStyle = '#fff'; for (const k in F.commAz) { const p = this.proj(F.pt(F.commAz[k], R_ANN, 0).add(rd)); ctx.fillRect(p.x - px(1.5), p.y - px(5), px(3), px(10)); }
      // pigtail nadir marker
    }
    // labels for the anatomy (anatomy mode and labels on)
    if (O.labels && S.phase >= 1) {
      const lab = (s, p, col = '#9fb6d6') => { const q = this.proj(p); if (q.x > 0 && q.x < w && q.y > 0 && q.y < h) txt(s, q.x + px(6), q.y - px(7), col); };
      if (inRoot) {
        lab('LV', F.n.clone().multiplyScalar(-40).add(F.dir(100).multiplyScalar(18)));
        lab('Membranous septum (under NCC)', F.pt(180, 12.6, -5).add(rd), '#d9ccff');
        lab('Pigtail @ NCC nadir', this.P.pigtailTip.clone().add(rd), '#cfe3ff');
        lab('Ascending aorta', F.n.clone().multiplyScalar(60), '#9fb6d6');
        if (S.phase >= 4) { lab('RCA', F.pt(-60, 24, 12).add(rd), '#66d9a0'); lab('LCA', F.pt(60, 24, 13).add(rd), '#ff8fb0'); }
      } else {
        const sT = clamp(d.s, 0, S.path.length);
        lab('FlexNav nosecone', this.dev.tipPos || S.path.pos(sT), '#2ee6c4');
        if (S.phase <= 2) lab('Iliac plaque (Ca)', S.path.pos(S.lm.plaque), '#f3e9cf');
        lab('Wire', S.path.pos(clamp(d.s + 40, 0, S.path.length)), '#d9e2ee');
      }
    }
    // device-aware labels at the root
    if (O.labels && inRoot && S.phase >= 4 && S.phase <= 8 && this.dev.vo) { const q = this.proj(this.dev.vo.clone().add(F.ex.clone().multiplyScalar(14))); txt('Inflow / Vision markers', q.x + px(6), q.y - px(4), '#ff7a8a'); }
    // guide readouts
    if (O.guides) {
      let y = px(8); const L = [];
      if (S.phase >= 4 && S.phase <= 7) {
        L.push(`Marker vs annulus: ${S.sysZ().toFixed(1)} mm`);
        if (S.phase >= 5) {
          const nccTxt = `NCC inflow: ${d.h.toFixed(1)} mm below annulus (good 3-4.5)`;
          if (S.phase === 5 || vi.cuspOverlap) L.push(nccTxt);
          if (vi.threeCusp && S.phase >= 6) L.push(`Left cusp inflow: ${(d.h - d.tilt).toFixed(1)} mm`);
          L.push(`Root motion: +/-${Math.abs(S.v.bounceAmp || 0).toFixed(1)} mm   pacing: ${S.pacing}`);
        }
        L.push(`Post offset: ${S.alignErr().toFixed(0)} deg   centre: ${d.lat.toFixed(1)} mm`);
      }
      if (S.phase === 8) L.push(`Nosecone offset: ${d.lat.toFixed(1)} mm   closed: ${(d.macro * 100).toFixed(0)}%`);
      L.forEach(s => { txt(s, px(8), y); y += px(18); });
    }
    // parallax meter + angles
    if (O.parallax) {
      const ok = vi.edgeOn; const x0 = w - px(8);
      txt(`Parallax ${vi.err.toFixed(1)}°  ring open ${(vi.open * 100).toFixed(0)}%`, x0, px(8), ok ? '#7dff9a' : vi.err < 6 ? '#ffd24a' : '#ff8b7a', 'right');
      if (S.phase >= 5 && S.phase <= 7) { const q = S.phase === 5 ? (vi.cuspOverlap ? 'cusp-overlap view OK' : 'not the cusp-overlap view') : (vi.threeCusp ? '3-cusp view OK' : vi.cuspOverlap ? 'still cusp overlap' : 'not the 3-cusp view'); txt(q, x0, px(26), (S.phase === 5 ? vi.cuspOverlap : vi.threeCusp) ? '#7dff9a' : '#c7d3e8', 'right'); }
    }
    if (O.angles) txt(`${fmtLao(S.carm.lao)} / ${fmtCra(S.carm.cra)}   ${this.rootMode ? 'root-up image' : 'patient-up image'}`, px(8), h - px(24));
    // scale bar
    { const mmPx = h / (2 * this.fov); const L = this.fov > 60 ? 50 : 10; ctx.strokeStyle = '#c7d3e8'; ctx.lineWidth = px(2); ctx.beginPath(); ctx.moveTo(w - px(12) - L * mmPx, h - px(14)); ctx.lineTo(w - px(12), h - px(14)); ctx.stroke(); txt(`${L} mm`, w - px(12), h - px(34), '#c7d3e8', 'right'); }
    // marker pattern inset
    if (O.guides && (S.phase === 2 || (S.phase >= 4 && S.phase <= 6))) this.drawInset(ctx, w, h, px);
    // failure halo
    if (S.fx) {
      const p = this.proj(S.path.pos(clamp(S.fx.s, 0, S.path.length)).clone().add(S.fx.type === 'frameCatch' || S.fx.type === 'wireLost' ? new THREE.Vector3() : new THREE.Vector3()));
      const pulse = 0.5 + 0.5 * Math.sin(t * 9); ctx.strokeStyle = `rgba(255,${120 + 80 * pulse | 0},60,0.95)`; ctx.lineWidth = px(3);
      ctx.beginPath(); ctx.arc(p.x, p.y, px(30 + 10 * pulse), 0, 7); ctx.stroke();
      ctx.font = `bold ${px(14)}px system-ui, sans-serif`; txt('FLUORO PROBLEM: ' + S.fx.fluoro, w / 2 - ctx.measureText('FLUORO PROBLEM: ' + S.fx.fluoro).width / 2, h * 0.82, '#ffb347');
    }
  }
  drawInset(ctx, w, h, px) {
    const S = this.sim, F = this.F, R = px(50), cx = w - R - px(10), cy = h - R - px(46);
    ctx.save(); ctx.fillStyle = 'rgba(5,10,18,0.78)'; ctx.strokeStyle = 'rgba(160,180,210,0.5)'; ctx.lineWidth = px(1);
    ctx.beginPath(); ctx.roundRect(cx - R - px(6), cy - R - px(18), 2 * R + px(12), 2 * R + px(24), px(6)); ctx.fill(); ctx.stroke();
    ctx.font = `${px(10)}px system-ui, sans-serif`; ctx.fillStyle = '#9fb6d6'; ctx.textBaseline = 'top';
    if (S.phase === 2) {
      ctx.fillText('CT view: arch', cx - R, cy - R - px(15));
      ctx.strokeStyle = '#3d5a80'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, 0, 7); ctx.stroke();
      ctx.fillStyle = '#88a'; ctx.fillText('OUTER', cx - px(14), cy - R * 0.85 - px(2)); ctx.fillText('INNER', cx - px(14), cy + R * 0.85 - px(8));
      ctx.strokeStyle = 'rgba(125,255,154,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, Math.PI / 2 - 0.26, Math.PI / 2 + 0.26); ctx.stroke();
      for (let k = 0; k < 3; k++) { const a = (S.dev.roll + 180 + k * 120) * D2R; const x = cx + Math.sin(a) * R * 0.85, y = cy - Math.cos(a) * R * 0.85; ctx.fillStyle = '#ff3b52'; ctx.beginPath(); ctx.arc(x, y, px(5), 0, 7); ctx.fill(); }
    } else {
      ctx.fillText('Plan view (from aorta)', cx - R, cy - R - px(15));
      const col = { NCC: '#ffb300', RCC: '#43c466', LCC: '#b07cff' };
      for (const k of ['NCC', 'RCC', 'LCC']) { const a = F.cuspAz[k] * D2R; ctx.strokeStyle = col[k]; ctx.lineWidth = px(5); ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, -(a + 1.0), -(a - 1.0)); ctx.stroke(); ctx.fillStyle = col[k]; ctx.fillText(k, cx + Math.cos(a) * R * 1.0 - px(8), cy - Math.sin(a) * R * 1.0 - px(4)); }
      ctx.fillStyle = '#fff'; for (const k in F.commAz) { const a = F.commAz[k] * D2R; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.85, cy - Math.sin(a) * R * 0.85, px(2.5), 0, 7); ctx.fill(); }
      const roll = S.dev.roll + S.dev.drift;
      for (let k = 0; k < 3; k++) { const a = (roll + k * 120) * D2R; ctx.fillStyle = '#ff3b52'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.62, cy - Math.sin(a) * R * 0.62, px(4.5), 0, 7); ctx.fill(); ctx.strokeStyle = '#fff176'; ctx.lineWidth = px(1.5); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.62, cy - Math.sin(a) * R * 0.62); ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy - Math.sin(a) * R * 0.85); ctx.stroke(); }
    }
    ctx.restore();
  }
}
