// Handle diagram + fluoro label layout: programmatic overlap checks (bounding boxes) + screenshots, desktop 1280x800 and phone 390 wide.
import { launch } from './pw.mjs';
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { bad++; fails.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file:///workspace/navitor-3d-simulator/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(700);
const tab = async (t) => { if (mobile) { await page.locator(`#ctabs button[data-t=${t}]`).click(); await page.waitForTimeout(200); } };

// ---- the checks run inside the page
const check = () => page.evaluate(() => {
  const svg = document.getElementById('hsvg'); const sr = svg.getBoundingClientRect();
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, b, tol = 0.5) => a.x < b.r - tol && a.r > b.x + tol && a.y < b.b - tol && a.b > b.y + tol;
  const inside = (a, b, tol = 0.5) => a.x >= b.x - tol && a.r <= b.r + tol && a.y >= b.y - tol && a.b <= b.b + tol;
  const out = { textOverlaps: [], textVsShape: [], clipped: [], notContained: [], htmlOverlaps: [], htmlOverflow: [], n: 0 };
  const texts = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim());
  out.n = texts.length;
  const T = texts.map(t => ({ t, s: t.textContent.trim(), r: R(t) }));
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (hit(T[i].r, T[j].r)) out.textOverlaps.push(T[i].s + ' <> ' + T[j].s);
  for (const x of T) if (!inside(x.r, { x: sr.left, y: sr.top, r: sr.right, b: sr.bottom })) out.clipped.push(x.s);
  // text must stay inside its container
  const pairs = [['#mac1', 'MACRO SLIDE', 0], ['#mac1', 'close nosecone', 0], ['#mac2', 'MACRO SLIDE', 1], ['#mac2', 'hold both = close', 0], ['#muM', '-', 0], ['#muP', '+', 0]];
  const contain = (cont, label) => { const c = document.querySelector(cont); const tt = T.filter(x => x.s === label); for (const x of tt) { if (!inside(x.r, R(c))) out.notContained.push(label + ' !in ' + cont); } };
  contain('#mac1', 'close nosecone'); contain('#mac2', 'hold both = close'); for (const x of T.filter(x => x.s === 'MACRO SLIDE')) if (!inside(x.r, R(document.querySelector('#mac1'))) && !inside(x.r, R(document.querySelector('#mac2')))) out.notContained.push('MACRO SLIDE');
  { const w = document.querySelector('#lockbar rect'); const gr = document.querySelectorAll('#lockbar rect')[1]; const tw = T.find(x => x.s.startsWith('white zone')), tg = T.find(x => x.s.startsWith('gray')); if (!inside(tw.r, R(w))) out.notContained.push('white zone label'); if (!inside(tg.r, R(gr))) out.notContained.push('gray label'); }
  { const mc = document.querySelector('#micro circle'); const tm = T.find(x => x.s === 'MICRO'); if (!inside(tm.r, R(mc))) out.notContained.push('MICRO in circle'); }
  // free-standing labels (ids t*) must not touch any shape
  const shapes = ['#wheel circle', '#micro circle', '#muM', '#muP', '#mac1', '#mac2', '#lockbar rect', '#lockBody', '#lockShackle', '#caret', '#fillBar'].flatMap(q => [...svg.querySelectorAll(q)]);
  for (const x of T.filter(x => x.t.id && /^t(Wheel|Micro[12]|Macro|LockHead|LockHint)/.test(x.t.id))) for (const sh of shapes) { const r = R(sh); if (r.w && hit(x.r, r)) out.textVsShape.push(x.s + ' x ' + (sh.id || sh.tagName)); }
  // HTML side of the handle panel
  const kids = [...document.querySelectorAll('#handleBox .hside > *')].filter(e => e.offsetParent !== null).map(e => ({ id: e.id || e.className, r: R(e), e }));
  for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (hit(kids[i].r, kids[j].r, 1)) out.htmlOverlaps.push(kids[i].id + ' <> ' + kids[j].id);
  for (const b of document.querySelectorAll('#handleBox button')) if (b.offsetParent && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1)) out.htmlOverflow.push(b.textContent.trim() + ` (${b.scrollWidth}>${b.clientWidth})`);
  for (const sp of document.querySelectorAll('#handleBox .speed')) { const sr2 = R(sp), pr = R(document.querySelector('#handleBox')); if (sr2.r > pr.r + 1) out.htmlOverflow.push('speed line ' + sp.textContent.slice(0, 20)); }
  out.hscroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  out.labels = T.map(x => x.s);
  return out;
});
const report = (name, o) => {
  ok(o.textOverlaps.length === 0, `${name}: no SVG text overlaps (${o.n} texts)` + (o.textOverlaps.length ? ' ' + JSON.stringify(o.textOverlaps) : ''));
  ok(o.textVsShape.length === 0, `${name}: no label touches a button/lock/bar` + (o.textVsShape.length ? ' ' + JSON.stringify(o.textVsShape) : ''));
  ok(o.clipped.length === 0, `${name}: no text clipped by the SVG edge` + (o.clipped.length ? ' ' + JSON.stringify(o.clipped) : ''));
  ok(o.notContained.length === 0, `${name}: button/bar texts fit inside their shapes` + (o.notContained.length ? ' ' + JSON.stringify(o.notContained) : ''));
  ok(o.htmlOverlaps.length === 0, `${name}: status lines / gauges / buttons do not overlap` + (o.htmlOverlaps.length ? ' ' + JSON.stringify(o.htmlOverlaps) : ''));
  ok(o.htmlOverflow.length === 0, `${name}: no button text overflow / status line overflow` + (o.htmlOverflow.length ? ' ' + JSON.stringify(o.htmlOverflow) : ''));
  ok(!o.hscroll, `${name}: no horizontal scroll`);
};
const shotHandle = async (n) => { await tab('handle'); await page.waitForTimeout(300); await page.locator('#handleBox').screenshot({ path: `shots/v4/${prof}-handle-${n}.png` }); };

// ---- state 1: phase 1 (idle handle)
await tab('handle'); let o = await check(); report('phase 1', o);
ok(o.labels.some(s => s === 'MICRO (fine recapture only)'), 'label reads "MICRO (fine recapture only)"'); ok(o.labels.includes('Deployment / resheath wheel') && o.labels.includes('white zone: recapturable') && o.labels.includes('gray: no return'), 'wheel, white-zone and gray labels present');
await shotHandle('phase1');
// ---- state 2: locked at 80% with the Unlock hint
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); __drv.toLock(); }); await page.waitForTimeout(900);
await tab('handle'); o = await check(); report('locked 80%', o); ok(o.labels.some(s => /80% lock/.test(s)), 'lock hint present: ' + o.labels.find(s => /80% lock/.test(s))); await shotHandle('locked80');
// ---- state 3: released (phase 8)
await page.evaluate(() => { __drv.secondView(); __drv.release('fast'); }); await page.waitForTimeout(900); await tab('handle'); o = await check(); report('released', o); await shotHandle('released');

// ---- fluoro label overlap (phase 1/2 shows both 'Iliac plaque (Ca)' and 'Wire'; also the root labels later)
const labelCheck = async (name) => {
  if (mobile) { await page.locator('#viewtabs button[data-vt=mon]').click(); await page.waitForTimeout(300); }
  await page.evaluate(() => __sim.render(0.5)); await page.waitForTimeout(100);
  const r = await page.evaluate(() => { const L = __sim.views.labelRects || []; const ov = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1) ov.push(a.s + ' <> ' + b.s); } const c = __sim.views.dom.ov; const out = L.filter(a => a.x < 0 || a.y < 0 || a.x + a.w > c.width + 1 || a.y + a.h > c.height + 1).map(a => a.s); return { n: L.length, ov, out, names: L.map(a => a.s) }; });
  ok(r.n > 0 && r.ov.length === 0 && r.out.length === 0, `${name}: ${r.n} fluoro labels, none overlap, none off-canvas ${JSON.stringify(r.ov)} ${JSON.stringify(r.out)} [${r.names.join(' | ')}]`);
  await page.locator('#monPanel').screenshot({ path: `shots/v4/${prof}-fluoro-labels-${name.replace(/\W+/g, '-')}.png` });
};
await page.evaluate(() => { __sim.reset(); __sim.setMode('fluoro'); }); await page.waitForTimeout(500);
await labelCheck('phase 1 start');
await page.evaluate(() => { const s = __sim.sim; s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.dev.s < s.lm.plaque - 25 && g++ < 4000) { __drv.autoFlex(); s.update(1 / 30); } s.input = {}; }); await labelCheck('phase 1 at the plaque');
await page.evaluate(() => { const s = __sim.sim; s.input = { adv: 1, twirl: 1 }; let g = 0; while (s.dev.s < s.lm.plaque + 10 && g++ < 4000) { __drv.autoFlex(); s.update(1 / 30); } s.input = {}; }); await labelCheck('phase 1 past the plaque');
await page.evaluate(() => { __sim.reset(); __drv.goPhase1(); __drv.goDesc(); __drv.setRotation(); __drv.goArch(); __drv.goCross(); __drv.alignAt(); __sim.setAngles(-30, -30); __drv.press(); }); await page.waitForTimeout(500); await labelCheck('phase 5 root');
await page.evaluate(() => __sim.setMode('anat')); await labelCheck('phase 5 root anatomy');
ok(logs.length === 0, 'no console errors: ' + JSON.stringify(logs.slice(0, 2)));
console.log(`\n${prof}: ${pass} ok, ${bad} failed`); if (bad) console.log(fails.join('\n'));
await browser.close(); process.exit(bad ? 1 : 0);
