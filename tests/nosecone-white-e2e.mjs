// v14: nosecone is WHITE in the 3D view (translucent, dark outline rim, wire-exit hole dot kept); fluoro unchanged (radiopaque-dark); handle diagram / labels no longer teal.
import { launch } from './pw.mjs';
import { execSync } from 'child_process'; import fs from 'fs'; fs.mkdirSync('shots/v14', { recursive: true });
const prof = process.argv[2] || 'desktop'; const mobile = prof === 'phone';
let pass = 0, bad = 0; const ok = (c, m) => { if (c) pass++; else bad++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const { browser, page, logs } = await launch(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
await page.goto('file://' + process.cwd() + '/index.html'); await page.addScriptTag({ path: 'tests/drv.js' });
await page.check('#ack'); await page.click('#startBtn'); await page.waitForTimeout(800);
// ---- materials
const m = await page.evaluate(() => { const d = __sim.views.dev, a = d.matA, hex = (c) => c.getHexString(); return { nose: hex(a.nosecone.color), op: a.nosecone.opacity, em: hex(a.nosecone.emissive), hole: hex(a.tipHole.color), holeOp: a.tipHole.opacity, outline: hex(a.noseOutline.color), side: a.noseOutline.side, inner: hex(a.innerShaft.color), cuff: hex(a.cuff.color),
  fluNose: d.tNose && d.parts.nosecone[0].userData.matFlu ? { c: d.parts.nosecone[0].userData.matFlu.color ? d.parts.nosecone[0].userData.matFlu.color.getHexString() : 'shader', t: d.parts.nosecone[0].userData.matFlu.type } : null, outFlu: d.parts.nosecone[1].userData.matFlu || null }; });
const rgb = (h) => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
ok(rgb(m.nose).every(v => v >= 245), `nosecone colour is white: #${m.nose}`); ok(m.op > 0.5 && m.op < 0.95, `nosecone stays translucent (opacity ${m.op})`);
ok(rgb(m.hole).every(v => v < 30) && m.holeOp === 1, `wire-exit hole dot stays dark (#${m.hole}) and opaque`);
ok(rgb(m.outline).every(v => v < 90) && m.side === 0, `thin dark outline rim behind the nosecone (#${m.outline}, far wall only)`);
ok(m.nose !== m.inner && m.nose !== m.cuff, `nosecone (#${m.nose}) differs from the inner shaft (#${m.inner}) and the NaviSeal cuff (#${m.cuff})`);
ok(m.outFlu === null && m.fluNose && m.fluNose.t, 'fluoro: nosecone keeps its radiopaque material, the outline is not drawn in fluoro (' + JSON.stringify(m.fluNose) + ')');
// ---- pixels in the 3D view
await page.evaluate(() => { __drv.goPhase1(); __drv.goDesc(); }); await page.evaluate(() => __sim.pause(true));
if (mobile) await page.locator('#viewtabs button[data-vt=td]').click(); await page.locator('button[data-mode=anat]').click().catch(() => {}); await page.evaluate(() => { __sim.views.zoom = 3; }); await page.waitForTimeout(2200);
const pt = await page.evaluate(() => { const V = __sim.views, T = __sim.THREE, cl = V.dev.cl; const r = V.dom.td.getBoundingClientRect(); const res = []; const view = new T.Vector3(); V.cam3.getWorldDirection(view); for (const d of [8, 12, 16]) { const c = cl.at(d, new T.Vector3()), t = cl.tan(d, new T.Vector3()), side = new T.Vector3().crossVectors(t, view).normalize(); for (const sg of [-1, 1]) { const p = c.clone().addScaledVector(side, 1.7 * sg).project(V.cam3); res.push({ x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, d }); } } const tip = V.dev.tipHole.position.clone().project(V.cam3); return { pts: res, tip: { x: r.left + (tip.x * 0.5 + 0.5) * r.width, y: r.top + (-tip.y * 0.5 + 0.5) * r.height }, scale: V.dev.tipHole.scale.toArray(), vis: V.dev.tipHole.visible, nv: V.dev.parts.nosecone.map(o => o.visible) }; });
ok(pt.vis && pt.nv.every(Boolean), 'in 3D: nosecone, outline and wire hole dot are visible');
await page.screenshot({ path: `shots/v14/${prof}-3d-nosecone-white.png` });
const clip = (p) => ({ x: Math.round(p.x - 5), y: Math.round(p.y - 5), width: 10, height: 10 });
const brightest = (f) => JSON.parse(execSync(`python3 -W ignore -c "from PIL import Image;import json;im=Image.open('${f}').convert('RGB');px=sorted(im.getdata(),key=lambda c:-sum(c));print(json.dumps(px[0]))"`).toString());
const sampleSet = async (pts, tag) => { const byD = {}; for (const p of pts) { const f = `/tmp/nose-${prof}.png`; await page.screenshot({ path: f, clip: clip(p) }); const [r, g, b] = brightest(f); const luma = 0.299 * r + 0.587 * g + 0.114 * b, chroma = Math.max(r, g, b) - Math.min(r, g, b); byD[p.d] = Math.max(byD[p.d] || 0, (luma > 175 && chroma < 35) ? 1 : 0); console.log(`   ${tag} d=${p.d}: brightest rgb ${r},${g},${b} luma ${luma.toFixed(0)} chroma ${chroma.toFixed(0)}`); } return Object.values(byD).filter(Boolean).length; };
const n1 = await sampleSet(pt.pts, 'view'); ok(n1 >= 2, `rendered nosecone is white (bright, neutral; not teal) at ${n1}/3 stations along the cone`);
// cutaway (no vessel wall in front): the nosecone should read clearly white
await page.locator('#btnCut').click(); await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/v14/${prof}-3d-nosecone-white-cutaway.png` });
await page.locator('#btnCut').click();
await page.evaluate(() => __sim.pause(false));
// ---- handle diagram: macro slide no longer teal
const col = await page.evaluate(() => { const g = (q, a) => document.querySelector(q).getAttribute(a); return { s: g('#mac1', 'stroke'), f: g('#mac1', 'fill'), svg: document.querySelector('#hsvg').innerHTML.toLowerCase().includes('2ee6c4') || document.querySelector('#hsvg').innerHTML.toLowerCase().includes('bffff2') }; });
ok(col.s === '#f5f5f5' && !col.svg, `handle diagram MACRO slide uses the white nosecone colour (stroke ${col.s}), no teal left in the diagram`);
const src = fs.readFileSync('index.html', 'utf8'); ok(!/2ee6c4/i.test(src), 'no teal #2ee6c4 left anywhere in the build');
const real = logs.filter(l => !/GPU stall|swiftshader|WebGL|Automatic fallback|GroupMarker/i.test(l)); ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real[0] : ''));
console.log(`\nnosecone-white-e2e ${prof}: ${pass} passed, ${bad} failed`); await browser.close(); process.exit(bad ? 1 : 0);
