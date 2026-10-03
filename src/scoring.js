// Proctor sheet: one sentence of lab-language feedback per miss.
const fx = (x, n = 1) => (Math.round(x * 10 ** n) / 10 ** n).toFixed(n);
export function computeScore(sim) {
  const fl = sim.flags, rows = [];
  const row = (id, title, pass, result, feedback, major = false) => rows.push({ id, title, pass, result, feedback: pass ? '' : feedback, major });
  const depthRow = (id, title, h, side) => {
    const pass = h >= 3 && h <= 4.5;
    const high = h < 3;
    row(id, title, pass, `${fx(h)} mm below the annulus (good 3-4.5)`,
      high ? `Only ${fx(h)} mm at the ${side} - that is high, pop-up and leak territory; start the marker a touch lower, let it come down on the pigtail, and fix a high valve with a partial recapture and a gentle wire tug.`
        : `${fx(h)} mm at the ${side} is deep and sitting on the membranous septum, which is pacemaker risk; a deep valve needs a full recapture and a new approach, not a partial one.`);
  };
  depthRow('depthNcc', 'Depth at the NCC', fl.finalDepthNcc ?? 0, 'NCC');
  depthRow('depthLcc', 'Depth at the left cusp', fl.finalDepthLcc ?? 0, 'left cusp');
  const al = Math.abs(fl.finalAlign ?? 99);
  row('align', 'Commissural alignment and coronary access', al <= 15 && sim.chk.alignConfirmed, `Posts ${fx(al, 0)} deg off the native commissures${sim.chk.alignConfirmed ? '' : ' (not re-checked at the annulus)'}`,
    (!sim.chk.alignConfirmed ? 'Alignment was not re-checked at the annulus after the arch' + (fl.alignSkipped ? ' (you continued without the confirmation)' : '') + '; always repeat the alignment check in cusp overlap before you unsheathe - one post isolated on the right, two overlapped on the left.' : '') + (al > 15 ? (sim.chk.alignConfirmed ? '' : ' ') + `Your posts finished ${fx(al, 0)} deg off the commissures, so a post can sit in front of an ostium and coronary re-access gets awkward.` : ''));
  const rotOk = fl.rotSetDesc && !(fl.hardRot > 0);
  row('rot', 'Rotation set in the descending aorta', rotOk, fl.rotSetDesc ? `Set before the arch (${fx(fl.rotErrDesc, 0)} deg error); arch drift ${fx(Math.abs(sim.driftTotal), 0)} deg` : 'Not set', fl.hardRot > 0 ? 'You fought resistance on the rotation - stop, back off and take the short way round; do not wind up the shaft.' : 'Set the markers (2 outer, 1 inner) before the arch, then repeat the check at the annulus.');
  const spOk = !fl.major80 && sim.chk.secondView && !(fl.partialDeepRecapture > 0);
  row('stop80', '80% stop and the second view', spOk, fl.major80 ? 'Passed 80% without the 3-cusp check - MAJOR' : fl.partialDeepRecapture > 0 ? 'Partial recapture of a deep valve' : 'Lock, 3-cusp view, both sides and posts confirmed',
    fl.major80 ? 'Major miss: you went past 80% without leaving cusp overlap for the 3-cusp view, so nobody checked the left cusp or the posts before the point of no return.' : 'A deep valve gets a full recapture and a new approach; a partial recapture teaches the wrong lesson.', fl.major80);
  const wireEv = (fl.wireLostN || 0) + (fl.wireApex || 0) + (fl.wirePulled || 0);
  const wireOk = wireEv === 0 && (fl.stabAt80 ?? 1) >= 0.45;
  row('wire', 'Wire discipline', wireOk, wireEv ? `${wireEv} wire event(s)` : `Wire held; stability at 80% ${fx((fl.stabAt80 ?? 1) * 100, 0)}%`,
    wireEv ? 'You let the wire move - lost, jammed in the apex or pulled out with the system; the wire is your rail, so hold it every time the system moves.' : 'The wire work was loose during unsheathing; keep gentle forward pressure on the system and a little pull on the wire so the valve stays on the greater curve.');
  const noseOk = !(fl.frameCatch > 0) && !(fl.nosecWheelTry > 0) && !(fl.archScrape > 0);
  row('nose', 'Nosecone and system path', noseOk, noseOk ? 'Centred, closed with the macro slide, clean path' : `${fl.frameCatch || 0} frame catch, ${fl.nosecWheelTry || 0} wheel attempts, ${fl.archScrape || 0} arch scrapes`,
    fl.frameCatch > 0 ? 'The nosecone caught the frame: advance the wire, centre the tip, close it with the macro slide and only then withdraw.' : fl.nosecWheelTry > 0 ? 'You reached for the deployment wheel to close the nosecone - it never recaptures the tip; the macro slide does.' : 'You rode the greater curve in the arch; flex earlier and stay central on the wire.');
  row('iliac', 'Iliac trauma', !(fl.iliacEvents > 0), fl.iliacEvents ? `${fl.iliacEvents} iliac event(s)` : 'No force, no scrape, no kink', 'You forced, scraped or kinked in the iliac; flex to the bend, add a slow rotation and let the system find the lumen.');
  const clOk = fl.iliacAngioEnd && fl.preclose >= 2 && !(fl.closureFail > 0) && fl.hemostasis;
  row('closure', 'Access closure', clOk, clOk ? 'Angiogram, two preclose devices, hemostasis' : 'Closure sequence incomplete', fl.closureFail > 0 ? 'You went for hemostasis before both preclose devices and a clean angiogram; the sequence is angiogram, two devices, then hemostasis.' : 'Closure was not completed in order.');
  const passed = rows.filter(r => r.pass).length;
  const majors = rows.filter(r => !r.pass && r.major).length;
  const bits = [];
  if (fl.pvl) bits.push(`Completion aortogram: PVL ${fl.pvl}; ${fl.coronary}.`);
  if (fl.pacingEarly) bits.push('Pacing was started before the valve touched.');
  if (fl.pacingWrong) bits.push('Rapid pacing was used outside the final release / case card.');
  if (fl.releasedUnpaced) bits.push('Final release without the rapid pacing the case card asked for.');
  if (fl.releasedFast) bits.push('Wheel speed after 80% was too fast.');
  if (sim.v && sim.v.tugCount) bits.push(`${sim.v.tugCount} wire tug(s) used to let the valve descend.`);
  const overall = majors ? `MAJOR miss recorded. ${passed}/${rows.length} sections passed. ` + bits.join(' ') : `${passed}/${rows.length} sections passed. ` + (passed === rows.length ? 'Clean case - good depth, aligned posts, full close. ' : 'Work through the misses above and run it again. ') + bits.join(' ');
  return { rows, passed, total: rows.length, majors, overall };
}
