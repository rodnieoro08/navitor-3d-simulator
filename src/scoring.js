// Proctor sheet: one sentence of lab-language feedback per miss.
const fx = (x, n = 1) => (Math.round(x * 10 ** n) / 10 ** n).toFixed(n);
export function computeScore(sim, provisional = false) {
  const fl = sim.flags, rows = [];
  const row = (id, title, pass, result, feedback, major = false) => rows.push({ id, title, pass, result, feedback: pass ? '' : feedback, major });
  const depthRow = (id, title, h0, side) => {
    const h = Math.max(-40, Math.min(40, h0)), capped = Math.abs(h0) > 40;   // a valve opened far from the annulus is shown as 40+ mm
    const pass = h >= 3 && h <= 4.5;
    const high = h < 3;
    const far = h < -1 ? 'The valve opened above the annulus, in the aortic root or ascending aorta: it will pop up, migrate into the aorta or leave a huge leak, and needs a snare or a second valve. ' : h > 8 ? 'The valve opened deep in the LV outflow tract: it can embolise into the left ventricle, block the mitral apparatus, and needs a snare or surgical retrieval. ' : '';
    row(id, title, pass, capped ? `${h0 < 0 ? 'More than 40 mm above' : 'More than 40 mm below'} the annulus (good 3-4.5)` : `${fx(h)} mm ${h < 0 ? 'ABOVE' : 'below'} the annulus${h < 0 ? '' : ''} (good 3-4.5)`,
      far + (high ? `Only ${fx(h)} mm at the ${side} - that is high, pop-up and leak territory; start the marker a touch lower, let it come down on the pigtail, and fix a high valve with a partial recapture and a gentle wire tug.`
        : `${fx(h)} mm at the ${side} is deep and sitting on the membranous septum, which is pacemaker risk; a deep valve needs a full recapture and a new approach, not a partial one.`));
  };
  depthRow('depthNcc', 'Depth at the NCC', fl.finalDepthNcc ?? 0, 'NCC');
  depthRow('depthLcc', 'Depth at the left cusp', fl.finalDepthLcc ?? 0, 'left cusp');
  const al = Math.abs(fl.finalAlign ?? 99);
  row('align', 'Commissural alignment and coronary access', al <= 15 && sim.chk.alignConfirmed && !fl.skipNoMarker && !fl.deployNoView && !fl.deployNoMarker, `Posts ${fx(al, 0)} deg off the native commissures${sim.chk.alignConfirmed ? '' : ' (not re-checked at the annulus)'}${fl.skipNoMarker ? ' (marker was off the annular plane when phase 4 was skipped)' : ''}${fl.deployNoView ? ' (unsheathing started outside the cusp-overlap view)' : ''}${fl.deployNoMarker ? ' (unsheathing started with the marker off the annular plane)' : ''}`,
    (fl.deployNoView ? 'You started to unsheathe before killing parallax in the cusp-overlap view, so the landing was not judged on a true edge-on annulus; get NCC alone on the left first. ' : '') + (fl.deployNoMarker ? 'You started to unsheathe with the inner-shaft marker off the annular plane, so the valve was positioned by guesswork; put the marker on the plane first. ' : '') + (fl.skipNoMarker ? 'You skipped phase 4 with the inner-shaft marker off the annular plane, so the valve was aligned to the wrong level before unsheathing; put the marker on the annular plane first. ' : '') + (!sim.chk.alignConfirmed ? 'Alignment was not re-checked at the annulus after the arch' + (fl.alignSkipped ? ' (you continued without the confirmation)' : '') + '; always repeat the alignment check in cusp overlap before you unsheathe - one post isolated on the right, two overlapped on the left.' : '') + (al > 15 ? (sim.chk.alignConfirmed ? '' : ' ') + `Your posts finished ${fx(al, 0)} deg off the commissures, so a post can sit in front of an ostium and coronary re-access gets awkward.` : ''));
  const rotOk = fl.rotSetDesc && !(fl.hardRot > 0);
  row('rot', 'Rotation set in the descending aorta', rotOk, fl.rotSetDesc ? `Set before the arch (${fx(fl.rotErrDesc, 0)} deg error); arch drift ${fx(Math.abs(sim.driftTotal), 0)} deg` : 'Not set', fl.hardRot > 0 ? 'You fought resistance on the rotation - stop, back off and take the short way round; do not wind up the shaft.' : 'Set the markers (2 outer, 1 inner) before the arch, then repeat the check at the annulus.');
  const spOk = !fl.major80 && sim.chk.secondView && !(fl.partialDeepRecapture > 0);
  row('stop80', '80% stop and the second view', spOk, fl.major80 ? 'Passed 80% without the 3-cusp check - MAJOR' : fl.partialDeepRecapture > 0 ? 'Partial recapture of a deep valve' : 'Lock, 3-cusp view, both sides and posts confirmed',
    fl.major80 ? 'Major miss: you went past 80% without leaving cusp overlap for the 3-cusp view, so nobody checked the left cusp or the posts before the point of no return.' : 'A deep valve gets a full recapture and a new approach; a partial recapture teaches the wrong lesson.', fl.major80);
  const wireEv = (fl.wireLostN || 0) + (fl.wireApex || 0) + (fl.wirePulled || 0);
  const wireOk = wireEv === 0 && (fl.stabAt80 ?? 1) >= 0.45 && !fl.deployNoHold;
  row('wire', 'Wire discipline', wireOk, wireEv ? `${wireEv} wire event(s)` : fl.deployNoHold ? 'Unsheathing started with the wire not fixed' : `Wire held; stability at 80% ${fx((fl.stabAt80 ?? 1) * 100, 0)}%`,
    fl.deployNoHold && !wireEv ? 'You started to unsheathe with the wire free, so it travelled with the system; fix the wire before the first turn of the wheel.' : wireEv ? 'You let the wire move - lost, jammed in the apex or pulled out with the system; the wire is your rail, so hold it every time the system moves.' : 'The wire work was loose during unsheathing; keep gentle forward pressure on the system and a little pull on the wire so the valve stays on the greater curve.');
  const skipPos = !!(fl.skipNoCross || fl.skipNoCentre || fl.deployNoCross || fl.deployOffCentre);
  const noseOk = !(fl.frameCatch > 0) && !(fl.nosecWheelTry > 0) && !(fl.archScrape > 0) && !(fl.macroEarly > 0) && !skipPos;
  row('nose', 'Nosecone and system path', noseOk, noseOk ? 'Open system withdrawn centred on the wire, nosecone closed with the macro slide in the descending aorta, clean path' : skipPos && !(fl.frameCatch > 0) && !(fl.nosecWheelTry > 0) && !(fl.archScrape > 0) && !(fl.macroEarly > 0) ? (fl.skipNoCross ? 'Phase 4 skipped before the valve was crossed' : fl.skipNoCentre ? 'Phase 4 skipped with the shaft not centred' : fl.deployNoCross ? 'Unsheathing started before the valve was across the annulus' : 'Unsheathing started with the shaft not centred') : `${fl.frameCatch || 0} frame catch, ${fl.nosecWheelTry || 0} wheel attempts, ${fl.archScrape || 0} arch scrapes, ${fl.macroEarly || 0} early nosecone closures`,
    skipPos && !(fl.frameCatch > 0) && !(fl.nosecWheelTry > 0) && !(fl.archScrape > 0) && !(fl.macroEarly > 0) ? (fl.skipNoCross ? 'You pressed Skip before the valve had crossed the annulus, so the nosecone and system path were never set up over the wire; cross first, hold the wire, then centre and set the marker before you move on.' : fl.skipNoCentre ? 'You pressed Skip with the shaft not centred in the ascending aorta; an off-centre nosecone drags the valve to the greater curve - centre it on the wire before you unsheathe.' : fl.deployNoCross ? 'You started to unsheathe before the capsule was across the annulus, so the valve opened above the annular plane; cross over the wire first, then centre and set the marker before the first turn of the wheel.' : 'You started to unsheathe with the shaft off-centre in the root; an off-centre nosecone drags the valve to the greater curve - flex to centre it on the wire before the first turn of the wheel.') : fl.frameCatch > 0 ? 'The open nosecone caught the valve frame: keep the wire fixed and advanced, flex to centre the tip on the wire, and pull back slowly through the valve; close the nosecone later, in the descending aorta.' : fl.macroEarly > 0 ? 'You tried to close the nosecone with the system still in the root, arch or ascending aorta. The correct order is: wire fixed, withdraw the whole system with the nosecone OPEN into the descending aorta, and only then close it with the macro slide.' : fl.nosecWheelTry > 0 ? 'You reached for the deployment wheel to close the nosecone - it never recaptures the tip; the macro slide does.' : 'You rode the greater curve in the arch; flex earlier and stay central on the wire.');
  row('iliac', 'Iliac trauma', !(fl.iliacEvents > 0), fl.iliacEvents ? `${fl.iliacEvents} iliac event(s)` : 'No force, no scrape, no kink', 'You forced, scraped or kinked in the iliac; flex to the bend, add a slow rotation and let the system find the lumen.');
  const clOk = fl.iliacAngioEnd && fl.preclose >= 2 && !(fl.closureFail > 0) && fl.hemostasis;
  row('closure', 'Access closure', clOk, clOk ? 'Angiogram, two preclose devices, hemostasis' : 'Closure sequence incomplete', fl.closureFail > 0 ? 'You went for hemostasis before both preclose devices and a clean angiogram; the sequence is angiogram, two devices, then hemostasis.' : 'Closure was not completed in order.');
  // ---- phases skipped with the "Skip phase" button: every row that phase would have assessed is flagged, with one proctor sentence each
  const SKIP = {
    1: { name: 'Femoral entry', rows: ['iliac'], what: 'the femoral entry and iliac passage' },
    2: { name: 'Descending aorta: set rotation', rows: ['rot'], what: 'the rotation set in the descending aorta' },
    3: { name: 'Arch', rows: ['nose'], what: 'the arch path and the nosecone position' },
    4: { name: 'Cross and centre', rows: ['align', 'nose'], what: 'crossing, centring and the commissure alignment re-check' },
    5: { name: 'Cusp overlap: land the inflow', rows: ['depthNcc', 'depthLcc'], what: 'the landing and the slow unsheathing to the 80% lock' },
    6: { name: 'Stop at 80%', rows: ['stop80', 'wire'], what: 'the 80% stop, the 3-cusp second view and the wire stability' },
    7: { name: 'Release', rows: ['depthNcc', 'depthLcc', 'align'], what: 'the final release, depth and post alignment' },
    8: { name: 'Nosecone out', rows: ['nose', 'wire'], what: 'withdrawing the open system over the fixed wire into the descending aorta, then closing the nosecone there' },
    9: { name: 'Close', rows: ['closure'], what: 'the access closure' },
  };
  // ---- phases the learner went back to (Back button): informational only; misses that existed when going back are kept (no farming of a clean sheet)
  for (const id in (fl.sticky || {})) { const r = rows.find(q => q.id === id); const st = fl.sticky[id]; if (r && r.pass) { r.pass = false; r.result = `${r.result} (earlier attempt: ${st.result})`; r.feedback = `${st.feedback} This was already a miss before you went back to an earlier phase, so it stays on the sheet.`; r.major = !!st.major; r.kept = true; } }
  const wentBack = (fl.wentBack || []).map(q => ({ from: q.from, to: q.to, text: `Went back to phase ${q.to} (${SKIP[q.to].name}) from phase ${q.from}. Informational only: going back is not a miss, and earlier misses stay on the sheet.` }));
  const skipped = Object.keys(fl.skipped || {}).map(Number).filter(n => fl.skipped[n]).sort((a, b) => a - b).map(n => ({ phase: n, name: SKIP[n].name, rows: SKIP[n].rows, text: `Phase ${n} (${SKIP[n].name}) was skipped, so ${SKIP[n].what} was not assessed.` }));
  for (const sk of skipped) for (const id of sk.rows) {
    const r = rows.find(q => q.id === id); if (!r) continue;
    r.skipped = (r.skipped || []).concat(sk.phase); r.pass = false; r.result = 'Skipped by learner (phase ' + r.skipped.join(', ') + ')';
  }
  for (const r of rows) if (r.skipped) r.feedback = skipped.filter(q => r.skipped.includes(q.phase)).map(q => q.text).join(' ');
  const passed = rows.filter(r => r.pass).length;
  const majors = rows.filter(r => !r.pass && r.major).length;
  const bits = [];
  if (fl.pvl) bits.push(`Completion aortogram: PVL ${fl.pvl}; ${fl.coronary}.`);
  if (fl.pacingEarly) bits.push('Pacing was started before the valve touched.');
  if (fl.pacingWrong) bits.push('Rapid pacing was used outside the final release / case card.');
  if (fl.releasedUnpaced) bits.push('Final release without the rapid pacing the case card asked for.');
  if (fl.releasedFast) bits.push('Wheel speed after 80% was too fast.');
  if (sim.v && sim.v.tugCount) bits.push(`${sim.v.tugCount} wire tug(s) used to let the valve descend.`);
  if (skipped.length) bits.unshift(`Skipped by learner: phase${skipped.length > 1 ? 's' : ''} ${skipped.map(q => q.phase).join(', ')}.`);
  const overall = majors ? `MAJOR miss recorded. ${passed}/${rows.length} sections passed. ` + bits.join(' ') : `${passed}/${rows.length} sections passed. ` + (passed === rows.length ? 'Clean case - good depth, aligned posts, full close. ' : 'Work through the misses above and run it again. ') + bits.join(' ');
  return { rows, passed, total: rows.length, majors, overall, skipped, wentBack };
}
