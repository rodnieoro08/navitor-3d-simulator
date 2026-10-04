import { fmtLao, fmtCra, clamp, wrap60 } from './util.js';
import { PHASES, COACH } from './sim.js';
import { PARTS } from './device.js';
import * as PH from './physics.js';
import { OVERLAYS, saveOverlays } from './overlays.js';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } e.innerHTML = html; return e; };

export class UI {
  constructor(sim, views, world) {
    this.sim = sim; this.views = views; this.W = world; this.keys = {}; this.cache = {}; this.stepSize = 1;
    this.buildStepper(); this.buildControls(); this.buildHandle(); this.buildLegend(); this.buildOverlayMenu(); this.bindHeader(); this.bindKeys(); this.bindModal();
    sim.on((ev, data) => this.onSim(ev, data));
    const mq = window.matchMedia('(max-width:900px)'); const upd = () => { $('#app').classList.toggle('mobile', mq.matches); if (this.handleMobile !== undefined && this.handleMobile !== mq.matches) { this.buildHandle(); this.refreshAll(); } }; mq.addEventListener('change', upd); upd();
    this.setTab('system'); $('#app').dataset.vt = 'mon';
  }
  onSim(ev, data) {
    if (ev === 'phase') { const t = { 1: 'system', 2: 'system', 3: 'system', 4: 'system', 5: 'handle', 6: 'handle', 7: 'handle', 8: 'system', 9: 'imaging' }[data]; if (t) this.setTab(t); }
    if (ev === 'score') this.showScore(data);
    if (ev === 'reset') { $('#scoreModal').hidden = true; this.refreshAll(true); }
  }
  // ---------- header ----------
  bindHeader() {
    const V = this.views;
    $('#segMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; V.setMode(b.dataset.mode); [...$('#segMode').children].forEach(c => c.classList.toggle('on', c === b)); });
    $('#segLock').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; V.setLock(b.dataset.lock === '1'); [...$('#segLock').children].forEach(c => c.classList.toggle('on', c === b)); });
    $('#btnOverlay').addEventListener('click', (e) => { e.stopPropagation(); this.toggleOverlayMenu(); });
    $('#btnLabels').addEventListener('click', () => this.setOverlay('parts', !V.overlay.parts));
    $('#btnSettings').addEventListener('click', () => { this.buildSettings(); $('#settingsModal').hidden = false; });
    $('#btnSkip').addEventListener('click', () => { if (this.sim.phase >= 9) this.sim.act.finishNow(); else this.sim.act.skipPhase(); this.refresh(); });
    $('#btnBack').addEventListener('click', () => { this.sim.act.backPhase(); this.refresh(); });
    $('#btnReset').addEventListener('click', () => { this.sim.reset(true); this.sim.started = true; });
    $('#btnCut').addEventListener('click', () => { V.cutaway = !V.cutaway; $('#btnCut').textContent = 'Cutaway: ' + (V.cutaway ? 'on' : 'off'); $('#btnCut').classList.toggle('on', V.cutaway); });
    $('#zIn').addEventListener('click', () => { V.zoom = clamp(V.zoom * 1.25, 0.5, 4); });
    $('#zOut').addEventListener('click', () => { V.zoom = clamp(V.zoom / 1.25, 0.5, 4); });
    $('#viewtabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('#app').dataset.vt = b.dataset.vt; [...$('#viewtabs').children].forEach(c => c.classList.toggle('on', c === b)); });
  }
  // ---------- overlays (visual only: never read by the simulation, scoring or gating) ----------
  setOverlay(key, val, persist = true) { this.views.overlay[key] = !!val; if (persist) saveOverlays(this.views.overlay); this.syncOverlayBtn(); }
  setAllOverlays(val) { for (const o of OVERLAYS) this.views.overlay[o.key] = !!val; saveOverlays(this.views.overlay); this.syncOverlayBtn(); }
  syncOverlayBtn() {
    const o = this.views.overlay, any = OVERLAYS.some(d => o[d.key]), n = OVERLAYS.filter(d => o[d.key]).length;
    $('#btnOverlay').textContent = 'Overlays: ' + (any ? 'on' : 'off') + ' \u25BE'; $('#btnOverlay').title = `${n} of ${OVERLAYS.length} overlays on - open the menu`;
    const lb = $('#btnLabels'); lb.textContent = 'Labels: ' + (o.parts ? 'on' : 'off'); lb.classList.toggle('on', !!o.parts); lb.setAttribute('aria-pressed', o.parts ? 'true' : 'false');
    document.querySelectorAll('#ovMenu input[data-ov]').forEach(c => { c.checked = !!o[c.dataset.ov]; });
    const app = $('#app'); for (const d of OVERLAYS) app.classList.toggle('ov-off-' + d.key, !o[d.key]);
  }
  buildOverlayMenu() {
    const m = $('#ovMenu');
    m.innerHTML = `<div class="ovhead"><b>Overlays</b><button id="ovClose" class="sm" aria-label="Close overlays menu">Done</button></div>
    <div class="ovall"><button id="ovAllOn">All on</button><button id="ovAllOff">All off (lab look)</button></div>
    <div class="ovlist">${OVERLAYS.map(d => `<label class="ovrow" data-row="${d.key}"><span class="ovtxt"><b>${d.label}</b><small>${d.desc}</small></span><input type="checkbox" role="switch" data-ov="${d.key}"><i class="ovsw"></i></label>`).join('')}</div>
    <p class="ovnote">The coach line is always on. Overlays are display only: they never change scoring or step gating. Your choices are remembered on this device.</p>`;
    m.querySelectorAll('input[data-ov]').forEach(c => c.addEventListener('change', e => this.setOverlay(c.dataset.ov, e.target.checked)));
    m.querySelector('#ovAllOn').onclick = () => this.setAllOverlays(true); m.querySelector('#ovAllOff').onclick = () => this.setAllOverlays(false);
    m.querySelector('#ovClose').onclick = () => this.toggleOverlayMenu(false);
    document.addEventListener('pointerdown', e => { if (!m.hidden && !m.contains(e.target) && e.target.id !== 'btnOverlay') this.toggleOverlayMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) this.toggleOverlayMenu(false); });
    window.addEventListener('resize', () => { if (!m.hidden) this.placeOverlayMenu(); });
    this.syncOverlayBtn();
  }
  placeOverlayMenu() {
    const m = $('#ovMenu'), b = $('#btnOverlay').getBoundingClientRect();
    if ($('#app').classList.contains('mobile')) { m.style.left = '0'; m.style.right = '0'; m.style.top = 'auto'; m.style.bottom = '0'; m.style.width = ''; return; }
    const wdt = Math.min(360, window.innerWidth - 12); m.style.width = wdt + 'px'; m.style.bottom = 'auto'; m.style.top = Math.round(b.bottom + 6) + 'px'; m.style.right = 'auto'; m.style.left = Math.max(6, Math.min(window.innerWidth - wdt - 6, Math.round(b.right - wdt))) + 'px';
  }
  toggleOverlayMenu(open) {
    const m = $('#ovMenu'); const show = open === undefined ? m.hidden : open; m.hidden = !show; $('#btnOverlay').setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) { this.placeOverlayMenu(); this.syncOverlayBtn(); }
  }
  bindModal() {
    $('#settingsModal').addEventListener('click', e => { if (e.target.id === 'settingsModal') $('#settingsModal').hidden = true; });
  }
  buildSettings() {
    const S = this.sim, O = this.views.overlay, sh = $('#settingsSheet');
    sh.innerHTML = `<h2>Case card and settings</h2><p class="fb" style="color:#9fb6d6">Instructor-set case card. Pacing rules: default OFF until the valve touches; about 120 if the root bounces; rapid pacing only at final release and only if the card says so.</p>
    <div class="row"><label><input type="checkbox" id="cfFast" ${S.cfg.finalFast ? 'checked' : ''}> Case card: rapid pacing at final release (phase 7)</label></div>
    <div class="row"><label>Wire stiffness: <select id="cfStiff"><option value="1" ${(S.cfg.wireStiffness ?? 1) === 1 ? 'selected' : ''}>standard (1.0)</option><option value="1.4" ${S.cfg.wireStiffness === 1.4 ? 'selected' : ''}>extra-stiff (1.4)</option></select></label></div>
    <h4>Physics model</h4><p class="fb" style="color:#9fb6d6" id="physNote">${PH.PHYSICS_NOTE} Deployment, foreshortening, friction and pop-up use invented constants chosen only to teach the qualitative behaviour; they are not manufacturer values.</p>
    <details><summary class="ro">Show the ${PH.describeConstants().length} constants (all ${PH.ESTIMATE})</summary><div class="ro" style="font-size:11px;max-height:160px;overflow:auto">${PH.describeConstants().map(c => `<div><b>${c.name}</b> = ${c.value} ${c.unit} - ${c.meaning} <i>[${c.status}]</i></div>`).join('')}</div></details>
    <h4>Overlays</h4><p class="ro" style="font-size:12px">Use the <b>Overlays</b> menu in the header (and the <b>Labels</b> button on the 3D panel) to show or hide labels, readouts, the plan-view inset and the handle status text.</p>
    <h4>Keys</h4><p class="ro" style="font-size:12px">Arrows = C-arm (Shift = 5 deg) | W/S advance/withdraw (Shift fast) | Q/E rotate | F/G flex +/- | X/Z deploy/resheath (Shift fast) | I/K wire advance/pull | H hold wire | M macro slide | U unlock | P pacing | T wire tug | C aortogram</p>
    <h4>Build</h4><p class="ro" style="font-size:12px" id="buildInfo">Build marker: <b id="buildMarkSettings">${(document.querySelector('meta[name=navitor-build]') || {}).content || 'dev'}</b> &middot; built ${(document.querySelector('meta[name=navitor-built]') || {}).content || ''}. If a colleague sees a different marker, one of you has a cached copy: hard-refresh (Ctrl/Cmd+Shift+R). The page also checks for a newer build when it loads and when you return to the tab.</p>
    <div class="row"><button id="stClose" class="primary">Done</button></div>`;
    sh.querySelector('#cfStiff').onchange = e => S.act.setCard({ wireStiffness: parseFloat(e.target.value) });
    sh.querySelector('#cfFast').onchange = e => S.act.setCard({ finalFast: e.target.checked });
    sh.querySelector('#stClose').onclick = () => { $('#settingsModal').hidden = true; };
  }
  // ---------- stepper ----------
  buildStepper() {
    const st = $('#stepper'); st.innerHTML = '';
    PHASES.forEach(p => st.appendChild(el('div', { class: 'chip locked', 'data-p': p.n }, `<i>${p.n}</i><span>${p.short}</span>`)));
    // optional: tap the NEXT phase circle (only forward by one) to skip the current phase; the header button is the main route
    st.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; const S = this.sim; if (!S.finished && +c.dataset.p === S.phase + 1 && S.phase < 9) { S.act.skipPhase(); this.refresh(); } });
  }
  // ---------- controls ----------
  hold(btn, on, off) {
    btn.classList.add('hold');
    const down = e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { } btn.classList.add('on'); on(); };
    const up = () => { if (btn.classList.contains('on')) { btn.classList.remove('on'); off(); } };
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); btn.addEventListener('selectstart', e => e.preventDefault()); btn.addEventListener('dragstart', e => e.preventDefault());
  }
  buildControls() {
    const S = this.sim, tabs = $('#ctabs'), cards = $('#ccards');
    const mk = (id, title, html) => { const c = el('div', { class: 'card2', 'data-card': id }, `<h4>${title}</h4>` + html); cards.appendChild(c); return c; };
    // C-arm
    const carm = mk('carm', 'C-arm', `<div class="ro" id="carmRO" style="text-align:center;margin-bottom:4px">AP 0 / CRA 0</div>
      <div class="pad"><span></span><button data-c="0,1" aria-label="Cranial">&#9650;</button><span></span><button data-c="-1,0" aria-label="RAO">&#9664;</button><button class="mid" id="stepBtn">1&deg;</button><button data-c="1,0" aria-label="LAO">&#9654;</button><span></span><button data-c="0,-1" aria-label="Caudal">&#9660;</button><span></span></div>
      <div class="row"><button id="pCusp">CT plan: cusp overlap<br><small>RAO 36 / CAU 24</small></button><button id="p3c">CT plan: 3-cusp<br><small>LAO 26 / CRA 24</small></button><button id="pAP" style="flex:0 0 52px">AP</button></div>
      <div class="lbl"><span>Arrow keys: L/R = RAO/LAO, Up/Dn = CRA/CAU</span></div>`);
    carm.querySelectorAll('[data-c]').forEach(b => { const [dl, dc] = b.dataset.c.split(',').map(Number); let tm = null, iv = null;
      const step = () => S.act.nudgeCarm(dl * this.stepSize, dc * this.stepSize);
      b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { } step(); tm = setTimeout(() => { iv = setInterval(step, 110); }, 380); });
      const up = () => { clearTimeout(tm); clearInterval(iv); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); b.style.touchAction = 'none'; });
    carm.querySelector('#stepBtn').onclick = e => { this.stepSize = this.stepSize === 1 ? 5 : 1; e.target.innerHTML = this.stepSize + '&deg;'; };
    carm.querySelector('#pCusp').onclick = () => S.act.setCarm(-36, -24, false);
    carm.querySelector('#p3c').onclick = () => S.act.setCarm(26, 24, false);
    carm.querySelector('#pAP').onclick = () => S.act.setCarm(0, 0, false);
    // system
    const sys = mk('system', 'FlexNav system', `
      <div class="row"><button id="bAdv" class="hold">&#9650; Advance</button><button id="bWd" class="hold">&#9660; Withdraw</button></div>
      <div class="row"><button id="bTw" class="hold">Advance + slow twirl</button><label style="display:flex;gap:6px;align-items:center;min-height:38px"><input type="checkbox" id="fastChk" style="width:22px;height:22px"> fast</label></div>
      <div class="row"><button id="bRotL" class="hold">&#10226; Rotate</button><button id="bRotR" class="hold">Rotate &#10227;</button></div>
      <div class="row"><button id="bFlexM" class="hold">Flex &minus;</button><button id="bFlexP" class="hold">Flex +</button></div>
      <div class="g3"><div><div class="lbl"><span>Flex</span></div><div class="gauge"><i id="gFlex"></i><b id="gReq"></b></div></div><div><div class="lbl"><span>Feel</span></div><div class="gauge"><i id="gRes"></i></div></div><div><div class="lbl"><span>Wind-up</span></div><div class="gauge"><i id="gTq"></i></div></div></div>
      <div class="lbl"><span id="flexTxt" class="ro"></span><span id="resTxt" class="ro"></span></div>`);
    this.hold(sys.querySelector('#bAdv'), () => { S.hold('adv', 1); S.hold('fast', this.fastChk()); }, () => { S.hold('adv', 0); });
    this.hold(sys.querySelector('#bWd'), () => { S.hold('adv', -1); S.hold('fast', this.fastChk()); }, () => { S.hold('adv', 0); });
    this.hold(sys.querySelector('#bTw'), () => { S.hold('adv', this.sim.phase === 8 ? -1 : 1); S.hold('twirl', 1); S.hold('fast', this.fastChk()); }, () => { S.hold('adv', 0); S.hold('twirl', 0); });
    this.hold(sys.querySelector('#bRotL'), () => S.hold('rot', 1), () => S.hold('rot', 0));
    this.hold(sys.querySelector('#bRotR'), () => S.hold('rot', -1), () => S.hold('rot', 0));
    this.hold(sys.querySelector('#bFlexM'), () => S.hold('flex', -1), () => S.hold('flex', 0));
    this.hold(sys.querySelector('#bFlexP'), () => S.hold('flex', 1), () => S.hold('flex', 0));
    // wire + pacing
    const wr = mk('wire', 'Wire, pressure, pacing', `
      <div class="row"><button id="bHold">Wire: fixed (held)</button><button id="bTug">Gentle wire tug</button></div>
      <div class="row"><button id="bWAdv" class="hold">Wire advance</button><button id="bWPull" class="hold">Wire pull</button></div>
      <div class="lbl"><span>Forward pressure on system</span><span id="pTxt" class="ro"></span></div><div class="sl"><span class="band" id="pBand"></span><input type="range" id="sPress" min="0" max="100" value="20"></div>
      <div class="lbl"><span>Wire tension (a little pull)</span><span id="wTxt" class="ro"></span></div><div class="sl"><span class="band" id="wBand"></span><input type="range" id="sWire" min="0" max="100" value="0"></div>
      <div class="lbl"><span>Pacing</span><span id="pacTxt" class="ro"></span></div>
      <div class="row" id="pacRow"><button data-pm="off" class="on">Off</button><button data-pm="120">~120</button><button data-pm="fast">Rapid</button></div>`);
    wr.querySelector('#bHold').onclick = () => S.act.toggleHold();
    this.hold(wr.querySelector('#bWAdv'), () => S.hold('wire', 1), () => S.hold('wire', 0));
    this.hold(wr.querySelector('#bWPull'), () => S.hold('wire', -1), () => S.hold('wire', 0));
    wr.querySelector('#sPress').oninput = e => S.act.setPress(e.target.value / 100);
    wr.querySelector('#sWire').oninput = e => S.act.setWireTension(e.target.value / 100);
    wr.querySelector('#bTug').onclick = () => S.act.tug();
    wr.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => S.act.setPacing(b.dataset.pm));
    // imaging + close
    const im = mk('imaging', 'Imaging and closure', `
      <div class="row"><button id="bAorto">Aortogram (root)</button><button id="bIliac">Iliac / femoral angiogram</button></div>
      <div class="row"><button id="bRmWire">Remove wire + pigtail</button></div>
      <div class="row"><button id="bPre">Preclose device <span id="preN">0/2</span></button><button id="bHemo">Hemostasis</button></div>
      <div class="lbl"><span id="closeTxt">Sequence: aortogram, wire out, iliac angiogram, 2 preclose devices, hemostasis.</span></div>`);
    im.querySelector('#bAorto').onclick = () => S.act.aortogram('root');
    $('#bInject').onclick = () => S.act.inject();
    im.querySelector('#bIliac').onclick = () => S.act.aortogram('iliac');
    im.querySelector('#bRmWire').onclick = () => S.act.removeWire();
    im.querySelector('#bPre').onclick = () => S.act.preclose();
    im.querySelector('#bHemo').onclick = () => S.act.hemostasis();
    // tabs (mobile)
    this.tabDefs = [['carm', 'C-arm'], ['system', 'System'], ['wire', 'Wire / pace'], ['imaging', 'Imaging'], ['handle', 'Handle']];
    this.tabDefs.forEach(([id, t]) => { const b = el('button', { 'data-t': id, class: 'sm' }, t); b.onclick = () => this.setTab(id); tabs.appendChild(b); });
  }
  fastChk() { return $('#fastChk').checked ? 1 : 0; }
  setTab(id) {
    this.tab = id;
    document.querySelectorAll('#ctabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
    document.querySelectorAll('.card2').forEach(c => c.classList.toggle('cur', c.dataset.card === id));
    const hp = $('#handlePanel'); hp.classList.toggle('mobileHide', false);
    if ($('#app').classList.contains('mobile')) { hp.style.display = id === 'handle' ? 'block' : 'none'; } else hp.style.display = '';
  }
  // ---------- legend ----------
  buildLegend() {
    const lg = $('#legend'); lg.innerHTML = '';
    for (const id in PARTS) { const b = el('button', { 'data-p': id }, PARTS[id].name); lg.appendChild(b);
      b.addEventListener('pointerenter', () => this.showPart(id, false)); b.addEventListener('pointerleave', () => this.showPart(this.views.legendPart || null, false));
      b.addEventListener('click', () => { this.views.legendPart = this.views.legendPart === id ? null : id; this.showPart(this.views.legendPart, true); }); }
    this.views.onHover = (id, click) => { if (click && id) { this.views.legendPart = id; } this.showPart(id || this.views.legendPart, false); };
  }
  showPart(id, sticky) {
    this.views.dev.setHighlight(id || null);
    document.querySelectorAll('#legend button').forEach(b => b.classList.toggle('hl', b.dataset.p === (this.views.legendPart || id)));
    const pi = $('#partinfo'); if (id && PARTS[id]) { pi.style.display = 'block'; pi.innerHTML = `<b>${PARTS[id].name}</b> - ${PARTS[id].info}`; } else pi.style.display = 'none';
  }
  // Handle diagram geometry. Phones (<= 900 px) get a portrait layout that fills the width (wheel >= 150 px across at 360 px wide), desktop a moderately larger landscape one.
  get hP() { return this.handleMobile ? {
      vb: [360, 524], title: { x: 8, y: 16, fs: 13 }, house: { x: 2, y: 24, w: 356, h: 210, rx: 40 },
      wheel: { cx: 90, cy: 129, R: 78, hit: 88 }, cap1: { y: 256, y2: 273, fs: 12.5, fs2: 12.5 },
      micro: { cx: 269, cy: 86, r: 38, mb: { y: 138, h: 50, x1: 184, w1: 80, x2: 272, w2: 82 } },
      macro: { x1: 4, x2: 186, y: 288, w: 170, h: 62, fs: 13, fs2: 12.5, capY: 372, capY2: 389 },
      lock: { tx: 18, ty: 436, head: -20, hfs: 13, h: 32, white: 220, gray: 108, tfs: 13, ty1: 21, fillH: 8, caret: 'M0 42 l-8 12 h16z', icon: 'translate(220 -3) scale(1.7)', hintY: 80, hfs2: 12.5 } }
    : {
      vb: [430, 334], title: { x: 8, y: 16, fs: 12 }, house: { x: 6, y: 26, w: 418, h: 158, rx: 48 },
      wheel: { cx: 84, cy: 105, R: 62, hit: 72 }, cap1: { y: 204, y2: 221, fs: 10.5, fs2: 10 },
      micro: { cx: 228, cy: 80, r: 29, mb: { y: 122, h: 32, x1: 188, w1: 38, x2: 232, w2: 38 } },
      macro: { x1: 294, x2: 294, y: 36, w: 124, h: 60, fs: 11, fs2: 11, capY: 204, capY2: 221, stack: true },
      lock: { tx: 20, ty: 262, head: -12, hfs: 12, h: 24, white: 288, gray: 112, tfs: 11.5, ty1: 16, fillH: 6, caret: 'M0 32 l-6 9 h12z', icon: 'translate(288 -2) scale(1.1)', hintY: 62, hfs2: 11.5 } }; }
  handleSvg(mob) {
    const P = this.hP, W = P.wheel, Mi = P.micro, Mc = P.macro, L = P.lock, k = W.R / 56, km = Mi.r / 28, C = P.cap1, mb = Mi.mb;
    const mx2 = Mc.stack ? Mc.x1 : Mc.x2, my2 = Mc.stack ? Mc.y + Mc.h + 8 : Mc.y;
    const mcx1 = Mc.x1 + Mc.w / 2, mcx2 = mx2 + Mc.w / 2, capX = Mc.stack ? mcx1 : (Mc.x1 + Mc.x2 + Mc.w) / 2;
    return `<svg id="hsvg" viewBox="0 0 ${P.vb[0]} ${P.vb[1]}" role="img" aria-label="FlexNav handle diagram">
      <text x="${P.title.x}" y="${P.title.y}" fill="#9fb6d6" font-size="${P.title.fs}">FlexNav handle (teaching diagram, not to scale)</text>
      <rect x="${P.house.x}" y="${P.house.y}" width="${P.house.w}" height="${P.house.h}" rx="${P.house.rx}" fill="#16233b" stroke="#35507f" stroke-width="2"/>
      <g id="wheel" transform="translate(${W.cx} ${W.cy})" style="cursor:grab;touch-action:none"><circle r="${W.hit}" fill="#000" fill-opacity="0.001" id="wheelHit"/><circle id="wheelRing" r="${W.R}" fill="#0e1a30" stroke="#5b95ff" stroke-width="${3 * Math.max(1, k * 0.8)}"/><g id="wheelRot"></g><circle r="${20 * k}" fill="#1f3358" stroke="#5b95ff"/><text y="${3.5 * k}" text-anchor="middle" fill="#cfe3ff" font-size="${9.5 * k}">DEPLOY</text></g>
      <text id="tWheel1" x="${W.cx}" y="${C.y}" text-anchor="middle" fill="#cfe3ff" font-size="${C.fs}">Deployment / resheath wheel</text><text id="tWheel2" x="${W.cx}" y="${C.y2}" text-anchor="middle" fill="#9fb6d6" font-size="${C.fs2}">(clockwise = deploy)</text>
      <g id="micro" transform="translate(${Mi.cx} ${Mi.cy})" style="cursor:pointer"><circle r="${Mi.r}" fill="#0e1a30" stroke="#ffd24a" stroke-width="2.5"/><g id="microRot"></g><text id="tMicroIn" y="${3 * km}" text-anchor="middle" fill="#ffe9a8" font-size="${(mob ? 10 : 9) * km}">MICRO</text></g>
      <g id="microBtns"><rect id="muM" x="${mb.x1}" y="${mb.y}" width="${mb.w1}" height="${mb.h}" rx="8" fill="#2a2a14" stroke="#ffd24a"/><text x="${mb.x1 + mb.w1 / 2}" y="${mb.y + mb.h / 2 + 6}" text-anchor="middle" fill="#ffe9a8" font-size="${mob ? 26 : 16}" style="pointer-events:none">-</text>
      <rect id="muP" x="${mb.x2}" y="${mb.y}" width="${mb.w2}" height="${mb.h}" rx="8" fill="#2a2a14" stroke="#ffd24a"/><text x="${mb.x2 + mb.w2 / 2}" y="${mb.y + mb.h / 2 + 6}" text-anchor="middle" fill="#ffe9a8" font-size="${mob ? 26 : 16}" style="pointer-events:none">+</text></g>
      <text id="tMicro1" x="${Mi.cx}" y="${C.y}" text-anchor="middle" fill="#ffe9a8" font-size="${C.fs}">MICRO (fine recapture only)</text><text id="tMicro2" x="${Mi.cx}" y="${C.y2}" text-anchor="middle" fill="#c9b36a" font-size="${C.fs2}">- = resheath, + = undo</text>
      <g id="macro"><rect id="mac1" x="${Mc.x1}" y="${Mc.y}" width="${Mc.w}" height="${Mc.h}" rx="12" fill="#2a303a" stroke="#f5f5f5" stroke-width="2"/><rect id="mac2" x="${mx2}" y="${my2}" width="${Mc.w}" height="${Mc.h}" rx="12" fill="#2a303a" stroke="#f5f5f5" stroke-width="2"/>
      <text x="${mcx1}" y="${Mc.y + Mc.h * 0.43}" text-anchor="middle" fill="#f5f5f5" font-size="${Mc.fs}" style="pointer-events:none">MACRO SLIDE</text><text id="mac1t" x="${mcx1}" y="${Mc.y + Mc.h * 0.72}" text-anchor="middle" fill="#f5f5f5" font-size="${Mc.fs2}" style="pointer-events:none">close nosecone</text>
      <text x="${mcx2}" y="${my2 + Mc.h * 0.43}" text-anchor="middle" fill="#f5f5f5" font-size="${Mc.fs}" style="pointer-events:none">MACRO SLIDE</text><text x="${mcx2}" y="${my2 + Mc.h * 0.72}" text-anchor="middle" fill="#f5f5f5" font-size="${Mc.fs2}" style="pointer-events:none">hold both = close</text></g>
      <text id="tMacro1" x="${capX}" y="${Mc.capY}" text-anchor="middle" fill="#f5f5f5" font-size="${C.fs}">Macro-slide buttons</text><text id="tMacro2" x="${capX}" y="${Mc.capY2}" text-anchor="middle" fill="#d0d0d0" font-size="${C.fs2}">nosecone, after release</text>
      <g id="lockbar" transform="translate(${L.tx} ${L.ty})"><text id="tLockHead" x="0" y="${L.head}" fill="#cfe3ff" font-size="${L.hfs}">Deployment lock - deployed length</text>
        <rect x="0" y="0" width="${L.white}" height="${L.h}" rx="4" fill="#f4f7ff"/><rect x="${L.white}" y="0" width="${L.gray}" height="${L.h}" rx="4" fill="#6b7280"/>
        <text id="tWhite" x="${L.white / 2}" y="${L.ty1}" text-anchor="middle" fill="#223" font-size="${L.tfs}">white zone: recapturable</text><text id="tGray" x="${L.white + L.gray / 2}" y="${L.ty1}" text-anchor="middle" fill="#fff" font-size="${L.tfs - 0.5}">gray: no return</text>
        <rect id="fillBar" x="0" y="${L.h}" width="0" height="${L.fillH}" fill="#4c8dff"/><path id="caret" d="${L.caret}" fill="#ffd24a"/>
        <g id="lockIcon" transform="${L.icon}" style="cursor:pointer"><rect x="-14" y="-4" width="28" height="30" rx="6" fill="#0e1a30" stroke="#ffd24a" stroke-width="1.5" opacity="0.001"/><rect id="lockBody" x="-8" y="8" width="16" height="12" rx="2" fill="#ffd24a"/><path id="lockShackle" d="M-5 8 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke="#ffd24a" stroke-width="2.5"/></g>
        <text id="tLockHint" x="${L.white}" y="${L.hintY}" text-anchor="middle" fill="#ffd24a" font-size="${L.hfs2}">80% lock: tap the lock or press Unlock</text></g>
    </svg>`;
  }
  // ---------- handle diagram (SVG) ----------
  buildHandle() {
    const S = this.sim, box = $('#handleBox');
    const mob = window.matchMedia('(max-width:900px)').matches; this.handleMobile = mob; this.fillMax = mob ? 275 : 360;
    box.innerHTML = this.handleSvg(mob) + `
<div class="hside">
    <div class="mdep" id="mDep"><div class="mdhead">Deploy by touch: press and hold, or tap for precision</div>
      <div class="mdrow"><button id="mHoldDep" class="mbig hold">Hold to deploy (slow)</button><button id="mHoldRes" class="mbig hold">Hold to resheath</button></div>
      <div class="mdrow"><button id="mTapDep" class="mtap">Tap to deploy: +2 mm</button><button id="mTapRes" class="mtap">Tap to resheath: -2 mm</button></div>
      <div class="mdrow"><button id="mUnlock" class="mbig">Unlock (needed at 80%)</button><div id="mdTxt" class="ro mdstat">deployed 0%</div></div></div>
    <div class="hbtns three"><button id="hRes" class="hold">&#9664; Resheath</button><button id="hDep" class="hold">Deploy slow &#9654;</button><button id="hDepF" class="hold">Deploy fast &#9654;&#9654;</button></div>
    <div class="hbtns"><button id="hMacro" class="hold" style="grid-column:span 2">Macro slide: close nosecone</button><button id="hUnlock">Unlock (U)</button><button id="hMuM" class="hold" title="MICRO wheel: fine recapture only">Micro &minus; (fine recapture)</button><button id="hMuP" class="hold" title="MICRO wheel: fine recapture only">Micro + (undo)</button></div>
        <div class="speed"><span id="spdTxt" class="ro">wheel speed: -</span></div><div class="gauge"><i id="gSpd"></i></div><div class="speed"><span id="fTxt" class="ro">deployed 0%</span></div><div class="speed"><span id="feelTxt" class="ro">recapture feel: free</span></div><div class="gauge"><i id="gFeel"></i></div>
<input type="range" id="wheelSlider" min="0" max="100" value="0" aria-label="Deployment fraction (fallback slider)"></div>`;
    const wr = box.querySelector('#wheelRot'); const Rw = this.hP.wheel.R, kw = Rw / 56;
    wr.innerHTML = Array.from({ length: 12 }, (_, i) => `<rect x="${-3 * kw}" y="${-Rw}" width="${6 * kw}" height="${12 * kw}" fill="#5b95ff" transform="rotate(${i * 30})"/>`).join('');
    const mr = box.querySelector('#microRot'), rm = this.hP.micro.r, km = rm / 28; mr.innerHTML = Array.from({ length: 8 }, (_, i) => `<rect x="${-2 * km}" y="${-rm - 2 * km}" width="${4 * km}" height="${8 * km}" fill="#ffd24a" transform="rotate(${i * 45})"/>`).join('');
    this.svg = box.querySelector('svg');
    // wheel drag: angle about the wheel centre. Works for mouse and real touch (pointer capture, touch-action none, touchstart default prevented so the page never scrolls or fires a ghost click).
    // Passing through the centre (dead zone) pauses the turn and re-syncs on exit, so there is no 180-degree flip. Coalesced touch samples are all applied.
    const wheel = box.querySelector('#wheel'); let drag = null;
    const geo = () => { const c = wheel.querySelector('#wheelRing'), r = c.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 }; };
    const ang = (e, g) => Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180 / Math.PI;
    wheel.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); wheel.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    wheel.addEventListener('contextmenu', e => e.preventDefault());
    wheel.addEventListener('pointerdown', e => { e.preventDefault(); try { wheel.setPointerCapture(e.pointerId); } catch { } const g = geo(); drag = { id: e.pointerId, a: ang(e, g), dead: Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 0.22 * g.R }; wheel.style.cursor = 'grabbing'; wheel.classList.add('on'); });
    wheel.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return; const g = geo();
      // a fast finger or a slow frame rate coalesces many samples into one event: walk through all of them so no turn is lost
      const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || []; const list = evs.length ? evs : [e];
      for (const p of list) {
        if (Math.hypot(p.clientX - g.cx, p.clientY - g.cy) < 0.22 * g.R) { drag.dead = true; continue; }
        const a = ang(p, g); if (drag.dead) { drag.dead = false; drag.a = a; continue; }
        let d = a - drag.a; if (d > 180) d -= 360; if (d < -180) d += 360; drag.a = a;
        if (d) S.act.wheel(d / 1800);
      }
    });
    const end = (e) => { if (drag && (!e || e.pointerId === drag.id)) { drag = null; wheel.style.cursor = 'grab'; wheel.classList.remove('on'); } }; wheel.addEventListener('pointerup', end); wheel.addEventListener('pointercancel', end); wheel.addEventListener('lostpointercapture', end);
    box.querySelector('#lockIcon').addEventListener('click', () => S.act.unlock());
    box.querySelector('#hUnlock').onclick = () => S.act.unlock();
    // macro buttons (both svg rects and the big button hold the macro slide)
    const macOn = () => S.hold('macro', 1), macOff = () => S.hold('macro', 0);
    for (const id of ['#mac1', '#mac2']) { const r = box.querySelector(id); r.style.cursor = 'pointer'; r.addEventListener('pointerdown', e => { e.preventDefault(); r.setPointerCapture(e.pointerId); macOn(); }); r.addEventListener('pointerup', macOff); r.addEventListener('pointercancel', macOff); }
    this.hold(box.querySelector('#hMacro'), macOn, macOff);
    // deploy buttons
    this.hold(box.querySelector('#hDep'), () => { S.hold('deploy', 1); S.hold('deployFast', 0); }, () => { S.hold('deploy', 0); });
    this.hold(box.querySelector('#hDepF'), () => { S.hold('deploy', 1); S.hold('deployFast', 1); }, () => { S.hold('deploy', 0); S.hold('deployFast', 0); });
    this.hold(box.querySelector('#mHoldDep'), () => { S.hold('deploy', 1); S.hold('deployFast', 0); }, () => { S.hold('deploy', 0); });
    this.hold(box.querySelector('#mHoldRes'), () => { S.hold('deploy', -1); S.hold('deployFast', 0); }, () => { S.hold('deploy', 0); });
    for (const [id, mm] of [['#mTapDep', 2], ['#mTapRes', -2]]) { const b = box.querySelector(id); b.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); b.addEventListener('contextmenu', e => e.preventDefault()); b.addEventListener('selectstart', e => e.preventDefault()); b.addEventListener('pointerdown', e => { if (e.button === 0 || e.pointerType === 'touch') { e.preventDefault(); if (!b.disabled) S.act.stepMm(mm); } }); b.addEventListener('click', e => { if (e.detail === 0 && !b.disabled) S.act.stepMm(mm); }); } // one step per tap on pointer-down (the touchstart default is prevented, so no ghost click can repeat it); Enter / Space still work
    box.querySelector('#mUnlock').onclick = () => S.act.unlock();
    this.hold(box.querySelector('#hRes'), () => { S.hold('deploy', -1); S.hold('deployFast', 0); }, () => { S.hold('deploy', 0); });
    // micro
    const muRep = (dir) => { let iv = null; return [() => { S.act.microStep(dir * 0.25); iv = setInterval(() => S.act.microStep(dir * 0.25), 140); }, () => clearInterval(iv)]; };
    for (const [id, dir] of [['#muM', -1], ['#muP', 1], ['#micro', -1]]) { const r = box.querySelector(id); const [a, b] = muRep(dir); r.style.cursor = 'pointer'; r.addEventListener('pointerdown', e => { e.preventDefault(); r.setPointerCapture(e.pointerId); a(); }); r.addEventListener('pointerup', b); r.addEventListener('pointercancel', b); }
    for (const [id, dir] of [['#hMuM', -1], ['#hMuP', 1]]) { const [a, b] = muRep(dir); this.hold(box.querySelector(id), a, b); }
    // slider fallback
    const sl = box.querySelector('#wheelSlider'); this.sliderDown = false; sl.addEventListener('pointerdown', () => { this.sliderDown = true; }); const sUp = () => { this.sliderDown = false; sl.blur(); }; sl.addEventListener('pointerup', sUp); sl.addEventListener('pointercancel', sUp); sl.addEventListener('change', () => { if (!this.sliderDown) sl.blur(); });
    sl.oninput = () => { S.stepExact = false; S.hold('sliderTarget', sl.value / 100); }; // the sim follows the slider at a safe (slow) wheel speed
    this.handleRef = { sl };
  }
  // ---------- keys ----------
  bindKeys() {
    const S = this.sim;
    const map = {
      KeyW: ['adv', 1], KeyS: ['adv', -1], KeyQ: ['rot', 1], KeyE: ['rot', -1], KeyF: ['flex', 1], KeyG: ['flex', -1], KeyX: ['deploy', 1], KeyZ: ['deploy', -1], KeyI: ['wire', 1], KeyK: ['wire', -1], KeyM: ['macro', 1],
    };
    addEventListener('keydown', e => {
      if (!S.started || e.target.matches('input[type=text],textarea') || e.metaKey || e.ctrlKey) return;
      const c = e.code;
      if (c.startsWith('Arrow')) { e.preventDefault(); const st = e.shiftKey ? 5 : 1; const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[c]; S.act.nudgeCarm(m[0] * st, m[1] * st); return; }
      if (map[c]) { e.preventDefault(); if (e.repeat) return; const [n, v] = map[c]; S.hold(n, v); if (n === 'adv' || n === 'deploy') { S.hold('fast', e.shiftKey ? 1 : 0); S.hold('deployFast', e.shiftKey ? 1 : 0); } return; }
      if (e.repeat) return;
      if (c === 'KeyH') S.act.toggleHold(); if (c === 'KeyU') S.act.unlock(); if (c === 'KeyT') S.act.tug(); if (c === 'KeyC') { if (S.phase >= 4) S.act.inject(); else S.act.aortogram('iliac'); }
      if (c === 'KeyP') S.act.setPacing({ off: '120', 120: 'fast', fast: 'off' }[S.pacing]);
    });
    addEventListener('keyup', e => { const m = map[e.code]; if (m) { S.hold(m[0], 0); if (m[0] === 'deploy') S.hold('deployFast', 0); } });
    addEventListener('blur', () => { for (const k of ['adv', 'rot', 'flex', 'deploy', 'wire', 'macro', 'deployFast', 'twirl', 'microHold']) S.hold(k, 0); });
  }
  // ---------- per-frame refresh ----------
  setText(sel, v) { const e = typeof sel === 'string' ? $(sel) : sel; if (e && this.cache[sel] !== v) { this.cache[sel] = v; e.textContent = v; } }
  setHTML(sel, v) { const e = $(sel); if (e && this.cache[sel] !== v) { this.cache[sel] = v; e.innerHTML = v; } }
  refreshAll() { this.cache = {}; this.refresh(); }
  refresh() {
    const S = this.sim, d = S.dev, vi = S.viewInfo();
    // stepper
    document.querySelectorAll('.chip').forEach(c => { const n = +c.dataset.p; const cls = 'chip ' + (n < S.phase || S.finished ? 'done' : n === S.phase ? 'active' : 'locked') + (n === S.phase + 1 && !S.finished ? ' next' : ''); if (c.className !== cls) c.className = cls; if (n === S.phase + 1 && !S.finished) c.title = 'Tap to skip phase ' + S.phase + ' and go to phase ' + n; else c.removeAttribute('title'); });
    { const sb = $('#btnSkip'); const txt = S.phase >= 9 ? 'Finish / show score \u25B6' : 'Skip phase \u25B6'; if (sb.textContent !== txt) sb.textContent = txt; sb.disabled = !!S.finished; const bb = $('#btnBack'); const bd = !!S.finished || S.phase <= 1; if (bb.disabled !== bd) bb.disabled = bd; const bl = S.phase <= 1 ? 'Previous phase (not available in phase 1)' : `Go back to phase ${S.phase - 1}`; if (bb.getAttribute('aria-label') !== bl) { bb.setAttribute('aria-label', bl); bb.title = S.phase <= 1 ? 'Already at the first phase' : `Go back to phase ${S.phase - 1}: ${PHASES[S.phase - 2].name} (not a miss; earlier misses stay on the score sheet)`; } }
    const P = PHASES[S.phase - 1];
    this.setText('#phaseName', `Phase ${S.phase} of 9 - ${P.name}`);
    this.setText('#coachText', S.coach);
    this.setText('#note', S.note);
    // contextual actions
    const acts = [];
    if (S.phase === 2) acts.push(['Confirm rotation set', 'confirmRotation']);
    if (S.phase === 4) { acts.push(['Confirm commissure alignment', 'confirmAlign']); acts.push(['Skip alignment check', 'skipAlign', S.p4Ready() ? 'act skip attn' : 'act skip']); }
    if (S.phase === 6) acts.push(['Confirm 3-cusp check', 'confirmSecondView']);
    if (S.phase === 6 && S.dev.locked) acts.push(['Unlock 80% lock (U)', 'unlock', S.chk.secondView ? 'act attn' : 'act']);
    const key = acts.map(a => a[0] + (a[2] || '')).join('|');
    if (this.cache.actKey !== key) { this.cache.actKey = key; const A = $('#actions'); A.innerHTML = ''; acts.forEach(([t, fn, cl]) => { const b = el('button', { class: cl || 'act' }, t); b.onclick = () => S.act[fn](); A.appendChild(b); }); }
    // fx banner
    const fb = $('#fxbanner'); if (S.fx) { fb.hidden = false; this.setText(fb, 'FLUORO PROBLEM: ' + S.fx.fluoro + ' - ' + 'retrying…'); } else if (!fb.hidden) fb.hidden = true;
    // readouts
    this.setText('#carmRO', `${fmtLao(S.carm.lao)} / ${fmtCra(S.carm.cra)}`);
    this.setText('#flexTxt', `${(d.flex * 100).toFixed(0)}%` + (this.views.overlay.guides ? `  target ${(S.reqFlex * 100 || 0).toFixed(0)}%` : ''));
    $('#gFlex').style.width = (d.flex * 100) + '%'; const gr = $('#gReq'); gr.style.display = this.views.overlay.guides ? '' : 'none'; gr.style.left = ((S.reqFlex || 0) * 100) + '%';
    this.setText('#resTxt', S.pf.resist.toFixed(2) + (S.pf.resist > 0.8 ? '  HIGH' : ''));
    $('#gRes').style.width = clamp(S.pf.resist / 2 * 100, 0, 100) + '%'; $('#gRes').style.background = S.pf.resist > 0.8 ? '#ff6b57' : '#4c8dff';
    $('#gTq').style.width = clamp(Math.abs(d.twist) / 255 * 100, 0, 100) + '%'; $('#gTq').style.background = Math.abs(d.twist) > 190 ? '#ff6b57' : '#4c8dff';
    // wire card
    const hb = $('#bHold'); this.setText(hb, S.wire.hold ? 'Wire: FIXED (held)' : 'Wire: FREE - tap to fix'); hb.classList.toggle('warn', !S.wire.hold);
    this.setText('#pTxt', `${Math.round(S.press * 100)}%`); this.setText('#wTxt', `${Math.round(S.wtens * 100)}%`);
    const g = this.views.overlay.guides; [['#pBand', 40, 60], ['#wBand', 20, 40]].forEach(([id, a, b]) => { const e = $(id); e.style.display = g ? '' : 'none'; e.style.left = `calc(${a}% + 4px)`; e.style.width = `calc(${b - a}% - 8px)`; });
    this.setText('#pacTxt', S.pacing === 'off' ? 'off' : S.pacing === '120' ? '~120 bpm' : 'rapid');
    document.querySelectorAll('#pacRow button').forEach(b => b.classList.toggle('on', b.dataset.pm === S.pacing));
    // imaging card
    this.setText('#preN', `${S.flags.preclose}/2`);
    $('#bRmWire').disabled = !(S.phase === 9 && S.flags.aortogram && !S.flags.wireRemoved);
    $('#bPre').disabled = !(S.phase === 9 && S.flags.wireRemoved && S.flags.preclose < 2);
    $('#bHemo').disabled = !(S.phase === 9 && S.flags.wireRemoved);
    $('#bAorto').disabled = !(S.phase === 9 || (S.phase === 8 && d.released));
    { const bi = $('#bInject'); bi.disabled = S.phase < 4; bi.classList.toggle('flash', !!(S.contrast.root)); bi.innerHTML = S.phase < 4 ? 'Contrast<span class="pt"> (pigtail from phase 4)</span>' : 'Inject contrast<span class="pt"> (pigtail)</span>'; bi.title = 'Brief contrast puff from the pigtail in the NCC (phases 4-9). Shortcut: C'; }
    $('#bIliac').disabled = !(S.phase === 1 || S.phase === 9 || S.phase === 8);
    // handle
    const rot = document.getElementById('wheelRot'); const a = d.f * 1800; rot.setAttribute('transform', `rotate(${a})`);
    document.getElementById('microRot').setAttribute('transform', `rotate(${(d.retractMm || 0) * 40})`);
    { const rc = (S.phase === 5 || S.phase === 6) && d.f > 0.02; for (const id of ['#hMuM', '#hMuP', '#muM', '#muP', '#micro']) { const e = $(id); e.classList.toggle('dim', !rc); } }
    const bx = d.f * (this.fillMax || 360); $('#fillBar').setAttribute('width', bx); $('#caret').setAttribute('transform', `translate(${bx} 0)`);
    $('#lockBody').setAttribute('fill', d.locked ? '#ff6b57' : '#7dff9a'); $('#lockShackle').setAttribute('stroke', d.locked ? '#ff6b57' : '#7dff9a'); $('#lockShackle').setAttribute('d', d.locked ? 'M-5 8 v-4 a5 5 0 0 1 10 0 v4' : 'M-5 8 v-4 a5 5 0 0 1 10 0 v-1');
    const ms = S.macroState(); const mc = ms === 'ready'; for (const id of ['#mac1', '#mac2']) { $(id).setAttribute('fill', mc ? '#4a5a70' : ms === 'locked' ? '#3a2a1c' : '#2a303a'); $(id).setAttribute('stroke', ms === 'locked' ? '#b8803a' : '#f5f5f5'); $(id).setAttribute('opacity', ms === 'ready' || ms === 'closed' ? 1 : ms === 'locked' ? 0.7 : 0.35); }
    this.setText('#mac1t', ms === 'locked' ? 'locked: pull back' : ms === 'closed' ? 'closed' : 'close nosecone'); this.setText('#tMacro2', ms === 'ready' ? 'READY: close nosecone' : ms === 'closed' ? 'nosecone closed' : ms === 'locked' ? 'locked: descending aorta' : 'nosecone, after release');
    { const hb = $('#hMacro'); this.setText('#hMacro', ms === 'locked' ? 'Macro slide: LOCKED - withdraw the open system into the descending aorta first' : ms === 'ready' ? 'Macro slide: READY - hold to close the nosecone' : ms === 'closed' ? 'Macro slide: nosecone closed' : 'Macro slide: close nosecone (after release)'); hb.classList.toggle('dim', ms === 'locked' || ms === 'off'); hb.classList.toggle('attn', ms === 'ready'); hb.setAttribute('aria-disabled', ms === 'ready' ? 'false' : 'true'); hb.dataset.macro = ms; }
    this.setText('#fTxt', `deployed ${Math.round(d.f * 100)}% - ${(d.retractMm || 0).toFixed(1)} mm - ${(d.turns || 0).toFixed(1)} turns${d.f > 0.8 ? ' (gray zone)' : ''}`);
    { const fe = d.feel || { feel: 0, zone: 'free', n: 0 }; const zn = { free: 'free', light: 'light', firm: 'firm - resistance rising', lock: 'at the lock - last chance to recapture', gray: 'no recapture past the lock' }[fe.zone];
      this.setText('#feelTxt', `recapture feel: ${zn}${d.hungN || d.hungL ? ' | frame hung up - may jump' : ''}`); $('#gFeel').style.width = Math.round(fe.feel * 100) + '%'; $('#gFeel').style.background = fe.feel > 0.75 ? '#ff6b57' : fe.feel > 0.45 ? '#ffd24a' : '#4c8dff'; }
    const sp = Math.max(0, S.v.speed || 0); const lim = (d.f < 0.8 ? PH.CONSTANTS.safeSpeedMmS : PH.CONSTANTS.safeSpeedPost80MmS) / PH.CONSTANTS.capsuleTravelMm;
    this.setText('#spdTxt', `wheel speed: ${sp < 0.005 ? 'stopped' : sp <= lim ? 'slow - good' : 'TOO FAST'}`);
    $('#gSpd').style.width = clamp(sp / 0.25 * 100, 0, 100) + '%'; $('#gSpd').style.background = sp > lim ? '#ff6b57' : '#4c8dff';
    const sl = this.handleRef.sl; if (!this.sliderDown) sl.value = Math.round(d.f * 100);
    { const ph = S.phase, on = ph >= 5 && ph <= 7; $('#mHoldDep').disabled = !on; $('#mTapDep').disabled = !on; $('#mHoldRes').disabled = ph < 5 || ph > 6; $('#mTapRes').disabled = ph < 5 || ph > 6; $('#mUnlock').disabled = !d.locked; $('#mUnlock').classList.toggle('attn', d.locked && S.chk.secondView);
      { const sp2 = Math.max(0, S.v.speed || 0), lim2 = (d.f < 0.8 ? PH.CONSTANTS.safeSpeedMmS : PH.CONSTANTS.safeSpeedPost80MmS) / PH.CONSTANTS.capsuleTravelMm; this.setText('#mdTxt', `deployed ${Math.round(d.f * 100)}% - ${(d.retractMm || 0).toFixed(1)} mm${d.locked ? ' - LOCK' : ''}\n${sp2 < 0.005 ? 'stopped' : sp2 <= lim2 ? 'slow - good' : 'TOO FAST'}`); } }
    $('#hMacro').disabled = !(S.phase === 8 && d.released); $('#hUnlock').disabled = !d.locked; $('#hUnlock').classList.toggle('attn', d.locked && S.chk.secondView);
    $('#hRes').disabled = S.phase < 5 || S.phase > 6; $('#hDep').disabled = S.phase < 5 || S.phase > 7; $('#hDepF').disabled = S.phase < 5 || S.phase > 7;
    // keep sticky top height var for debugging
  }
  // ---------- score sheet ----------
  showScore(sc) {
    const S = this.sim;
    const rows = sc.rows.map(r => `<tr><td><b>${r.title}</b></td><td class="${r.pass ? 'pass' : r.skipped ? 'miss skip' : 'miss'}">${r.pass ? 'PASS' : r.skipped ? 'SKIPPED' : 'MISS'}${r.major ? ' <span class="major">MAJOR</span>' : ''}</td><td>${r.result}${r.pass ? '' : `<div class="fb">&ldquo;${r.feedback}&rdquo;</div>`}</td></tr>`).join('');
    $('#sheet').innerHTML = `<h2>Proctor sheet</h2><div style="color:#9fb6d6;font-size:12.5px">Navitor Vision 27 mm / FlexNav - unofficial training model - ${Math.round(S.time)} s case time</div>
      <table id="scoreTable"><thead><tr><th>Section</th><th>Result</th><th>Detail and proctor feedback</th></tr></thead><tbody>${rows}</tbody></table>
      ${sc.wentBack && sc.wentBack.length ? `<div id="backBox" class="skipbox backbox"><b>Went back (information only)</b><ul>${sc.wentBack.map(q => `<li>${q.text}</li>`).join('')}</ul></div>` : ''}
      ${sc.skipped && sc.skipped.length ? `<div id="skippedBox" class="skipbox"><b>Skipped by learner</b><ul>${sc.skipped.map(q => `<li>${q.text}</li>`).join('')}</ul></div>` : ''}
      <p id="overall"><b>Overall:</b> ${sc.overall}</p>
      <div class="row"><button id="scRetry" class="primary big">Retry / reset case</button><button id="scClose">Close</button></div>`;
    $('#scoreModal').hidden = false;
    $('#scRetry').onclick = () => { S.reset(true); S.started = true; };
    $('#scClose').onclick = () => { $('#scoreModal').hidden = true; };
  }
}
