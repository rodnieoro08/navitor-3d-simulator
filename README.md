> **Unofficial training model only.** Not an Abbott product, not the Navitor IFU, and not medical advice. No Abbott logos or certification are implied. Physics values are uncalibrated teaching estimates.

![Handle and lock at 80%](docs/desktop-good-lock80-handle-feel.png)

Quick start: open `index.html` in a browser (single file, works offline). Rebuild with `npm i && npm run build`.

# Navitor Vision / FlexNav TAVI teaching simulator (UNOFFICIAL)
Unofficial training model. Not an Abbott product, not the Navitor IFU, not medical advice.

* Play: open `index.html` (single self-contained file, no network).
* Build: `npm i && node build.mjs` (esbuild bundles src/ + three.js into index.html).
* Tests: `node tests/logic.mjs` (pure logic, all gates and failure paths), `node tests/e2e.mjs desktop|phone` (Playwright + screenshots into shots/final).
* Debug hook: `window.__sim` (state, setAngles, act.*, hold, step, ...).

## Physics model: teaching estimates, uncalibrated

Deployment and seating live in `src/physics.js` (pure, deterministic, unit-tested in `tests/physics.mjs`). **No manufacturer data was used.** Every constant is an *estimate (uncalibrated)* chosen only so the qualitative behaviour feels right; none of them are real device values.

- Wheel = capsule retraction in mm (turns-per-mm mapping; 100% = full retraction). Progressive, inflow-first frame expansion with foreshortening (the frame shortens as it opens), radial force/grip from the 27 mm-in-24 mm oversize, and hysteresis between deployment and resheath.
- Seating: NCC-side and left-cusp-side inflow depth are computed separately (tilt, root motion, forward pressure, wire tension, wire stiffness) with stick-slip friction against the native leaflets/calcium (the frame can hang up, then jump), a membranous-septum soft stop, pacing-dependent root motion/ejection drag, migration when the wheel is too fast (direction = sign of the net force), spring-back pop past the point of no return and at release.
- Recapture: resistance rises toward the 80% lock (feel gauge in the handle diagram); no recapture past the lock.
- Depth semantics unchanged: 3 to 4.5 mm below the annulus is good.

| constant | value | unit | meaning | status |
|---|---|---|---|---|
| capsuleTravelMm | 52 | mm | capsule retraction needed to fully unsheathe (100% on the wheel) | estimate (uncalibrated) |
| wheelTurnsFull | 5 | turns | wheel turns for full retraction -> turns per mm = wheelTurnsFull / capsuleTravelMm | estimate (uncalibrated) |
| lockFraction | 0.8 | - | 80% stop: lock engages here; recapture is only possible below it | estimate (uncalibrated) |
| safeSpeedMmS | 4.4 | mm/s | capsule retraction speed below 80% that stays controlled (about 0.085 of travel per s) | estimate (uncalibrated) |
| safeSpeedPost80MmS | 3.9 | mm/s | same, after the lock (outflow ring releasing: about 0.075 of travel per s) | estimate (uncalibrated) |
| frameCrimpLenMm | 46 | mm | axial length of the frame crimped in the capsule (longer than expanded) | estimate (uncalibrated) |
| frameFreeLenMm | 40 | mm | axial length of the fully expanded frame (foreshortened) | estimate (uncalibrated) |
| releaseRampMm | 6 | mm | capsule travel over which one frame section goes from crimped to open (progressive) | estimate (uncalibrated) |
| frameFreeRadiusMm | 13.5 | mm | free (unconstrained) inflow radius of the 27 mm valve | estimate (uncalibrated) |
| frameCrimpRadiusMm | 3.3 | mm | crimped radius | estimate (uncalibrated) |
| annulusRadiusMm | 12 | mm | native annulus radius (24 mm case annulus) | estimate (uncalibrated) |
| annulusCompliance | 0.25 | - | fraction of oversize the annulus yields to (calcified annulus: stiff) | estimate (uncalibrated) |
| hysteresisMm | 4 | mm | play of the frame: on resheath it stays open until the capsule has travelled this far back | estimate (uncalibrated) |
| radialForceN_perMm | 6 | N/mm | radial force per mm of oversize at full expansion | estimate (uncalibrated) |
| gripForceScaleN | 8 | N | radial force at which the frame grips ~63% (grip = 1-exp(-F/scale)) | estimate (uncalibrated) |
| seatDropMm | 4.1 | mm | depth the inflow edge settles to below the annulus once the frame wedges in the root | estimate (uncalibrated) |
| foreshortCouplingMm | 0.35 | - | fraction of the frame shortening that pulls an UN-gripped inflow edge up toward the aorta | estimate (uncalibrated) |
| kPressMm | 1.8 | mm per unit | depth shift per unit of system forward pressure above/below neutral (0.5) | estimate (uncalibrated) |
| kWireMm | 1.5 | mm per unit | depth shift per unit of wire tension above/below neutral (0.3), at wire stiffness 1.0 | estimate (uncalibrated) |
| wireStiffness | 1 | - | default wire stiffness factor (1 = standard; >1 stiffer: more tension transmitted, straighter root) | estimate (uncalibrated) |
| kStiffTiltMm | 0.35 | mm | extra NCC-vs-left-cusp tilt per +1.0 of wire stiffness above 1.0 (straightened root) | estimate (uncalibrated) |
| tiltPerInstabilityMm | 0.7 | mm | tilt added at zero stability (poor pressure / wire tension) | estimate (uncalibrated) |
| tiltPerLateralMm | 0.06 | mm/mm | tilt added per mm of lateral offset of the shaft | estimate (uncalibrated) |
| septumDepthMm | 5 | mm | NCC depth at which the frame meets the membranous septum (soft stop) | estimate (uncalibrated) |
| septumStiffness | 0.4 | - | fraction of the further push that passes the septum stop | estimate (uncalibrated) |
| fricBaseNcc | 0.12 | mm | static friction against the native NCC leaflet, before grip | estimate (uncalibrated) |
| fricBaseLcc | 0.22 | mm | static friction against the left-cusp leaflet and calcium, before grip | estimate (uncalibrated) |
| fricGripMm | 0.3 | mm | extra static friction at full grip (radial force x friction coefficient) | estimate (uncalibrated) |
| fricCalcLccVarMm | 0.15 | mm | case-dependent extra calcium friction on the left cusp (0..1 x this) | estimate (uncalibrated) |
| kineticRatio | 0.5 | - | kinetic / static friction (sliding after break-away) | estimate (uncalibrated) |
| slipRatePerS | 7 | 1/s | how fast a slipping side closes the gap to its target | estimate (uncalibrated) |
| rootAssistMm | 0.12 | mm per mm | root motion shakes the frame free: mm of break-away help per mm of root swing | estimate (uncalibrated) |
| paceOff | 1 | - | root motion / ejection drag factor without pacing | estimate (uncalibrated) |
| pace120 | 0.45 | - | factor at ~120 bpm pacing | estimate (uncalibrated) |
| paceRapid | 0.15 | - | factor at rapid pacing | estimate (uncalibrated) |
| flowPushN | 0.9 | - | LV ejection push toward the aorta without pacing (scaled by pace factor) | estimate (uncalibrated) |
| forwardPushN | 0.6 | - | resting forward push of the stiff system toward the LV | estimate (uncalibrated) |
| netForceScale | 0.5 | - | scale of tanh() that turns net force into a migration direction | estimate (uncalibrated) |
| migrationMmPerMmS | 0.23 | mm per (mm/s) per s | uncontrolled migration per mm/s of wheel speed above the safe speed | estimate (uncalibrated) |
| popPerMmS | 0.2 | mm per (mm/s) | spring-back jump on the outflow ring per mm/s above the safe speed after the lock | estimate (uncalibrated) |
| popUnpacedMm | 1.3 | mm | spring-back pop toward the aorta at release when the heart is not rapid-paced (case-card release) | estimate (uncalibrated) |
| popRadialRelief | 0.3 | - | fraction of a pop absorbed by grip (pop x (1 - this x grip)) | estimate (uncalibrated) |
| resheathBaseN | 4 | N | drag of the capsule sliding back over the shaft | estimate (uncalibrated) |
| resheathPerExpN | 14 | N | added resheath force at full mean expansion | estimate (uncalibrated) |
| resheathLockRiseN | 22 | N | extra force that builds as the lock is approached | estimate (uncalibrated) |
| resheathHystN | 5 | N | extra force on the way back (recapture hysteresis) | estimate (uncalibrated) |
| resheathMaxN | 45 | N | force that fills the feel gauge | estimate (uncalibrated) |

## Handle controls (v4)
- **Deployment wheel**: clockwise = deploy, counter-clockwise = resheath (inside the white zone only).
- **MICRO wheel (fine recapture only)**: `-` = fine resheath in 0.25 mm steps (also from the 80% lock), `+` = undo part of a fine recapture, never beyond where the recapture started. It never deploys, never moves the whole system and never closes the nosecone; outside a recapture the sim refuses with a coaching line.
- **Macro slide**: closes the nosecone, only after release **and only in the descending aorta** (see "Phase 8 order (v12)"); before that it is shown LOCKED and refuses with a coach line.
- Phase 4: *Confirm commissure alignment* is no longer a hard gate. *Skip alignment check* (or simply starting the wheel once the valve is crossed, centred and the marker is on the annular plane) moves on to the landing and records a scored miss on the commissural-alignment row ("not re-checked at the annulus after the arch"). Crossing, centring and the annular-plane marker stay gated.
- The built `index.html` carries `<meta name="navitor-build" content="...">` so a deployed page can be identified.
- Tests: `node tests/logic.mjs`, `tests/physics.mjs`, then `centreline.mjs` (smooth-centreline curvature / jitter), `tube-e2e.mjs` (phase 1/3/4/5 fluoro + 3D shots into shots/v5), `crimp-e2e.mjs` (crimped valve stays inside the bending capsule; shots into shots/v6), `overlays-e2e.mjs` (Overlays menu, shots into shots/v7), `e2e.mjs`, `unlock-e2e.mjs`, `valve-contrast-e2e.mjs`, `physics-ui-e2e.mjs`, `handle-layout-e2e.mjs`, `skip-align-e2e.mjs` (each with `desktop` or `phone`; they need `tests/pw.mjs` and Chrome at `/usr/bin/google-chrome`; `mkdir -p shots/final shots/v4 shots/v5 shots/v6 shots/v7` first).


## Smooth delivery system (v5)
The FlexNav system (sheath, outer shaft, capsule, inner shaft, nosecone) and the guidewire are continuous tubes, not stacked segments.
* `src/centreline.js` builds one smooth centreline (tip to handle, 2 mm samples) every frame from the anatomical path plus the Flex offset. The offset is low-passed in time (tau 70 ms), then a deterministic bend limiter runs (fixed number of smoothing passes whose weight rises smoothly near the limit): minimum bending radius about 22 mm for the sheath/shaft and about 32 mm for the rigid capsule + nosecone section (teaching estimates, not device data). The correction is also low-passed in time, so nothing flickers.
* `src/tube.js` (`VarTube`) turns the centreline into 14-sided variable-radius tubes (capsule slightly thicker with bevelled ends, tapered rounded nosecone, shoulder from shaft to sheath). Markers, valve frame, posts, Vision markers, cuff and leaflets are placed from the same centreline (valve axis = tangent of the rigid section).
* Fluoro uses `fluTube()` (scene.js): additive density follows the chord through the cylinder, so strokes have a soft edge. The wire is a Catmull-Rom spline (about 1.5 mm samples) with an 8 mm pigtail curl.
* A *kink failure* never bends the geometry: it narrows the sheath radius over about 20 mm (soft local narrowing) and shows the coaching line.

### Crimped valve inside the capsule (v6)
While the valve is (partly) in the capsule, its frame struts, commissural posts (thin tubes), Vision markers, cuff and leaflets are built along the *same* smooth centreline and tangent frame as the capsule tube (`Device.frameU`), at a crimped radius of 2.8 mm against a capsule inner radius of 3.8 mm (outer 4.3 mm minus a 0.5 mm wall), so they bend and flex with the capsule and never poke through the wall. The part that has left the mouth expands from the capsule mouth along the centreline tangent and self-centres as before. The frame never opens ahead of the capsule mouth. In fluoro a dense bent bundle (`crimpBody`) is drawn inside the capsule. `Device.containment()` is the test helper used by `tests/crimp-e2e.mjs`.

### Overlays menu (v7)
The header **Overlays** button opens a menu (a popover on desktop, a full-width bottom sheet on phones, 44 px targets) with eight switches: Device part labels (3D legend + part info), Anatomy labels, Measurements and readouts, Target guides (annulus ring, cusp dots, flex target, pressure/wire bands), Plan view inset, Parallax meter, C-arm angle readout, Handle status text. **All on** / **All off (lab look)** set them all; the coach line is always on. The 3D panel also has a **Labels** button for the part legend. Choices persist in `localStorage` (`navitor-sim-overlays-v1`; corrupt data falls back to all on). Overlays are display-only (`src/overlays.js`, `Views.overlay`): nothing in the simulation, scoring or gating reads them.

### Phase 4 "Skip alignment check" (v7)
The button always moves to phase 5 at once. What was skipped is flagged and scored: the alignment row (not re-checked), the nosecone/system-path row (valve not crossed / shaft not centred) and, for a marker off the annular plane, the alignment row too, each with a proctor sentence and a coach line. Phase 5 no longer blocks unsheathing (see "Free deployment in phase 5 (v15)"): the coach says what to fix, and starting anyway is scored.

### Deployment wheel input and touch deploy controls (v8)
- **Wheel**: the SVG wheel is driven by pointer events with pointer capture (mouse and real touch). `touch-action: none`, a non-passive `touchstart` default-prevent, no text selection and no long-press menu mean a finger turning the wheel never scrolls the page. Clockwise deploys, counter-clockwise resheaths (1800 degrees = 100 %). A drag through the centre no longer flips the angle by 180 degrees: a dead zone around the hub pauses the turn and re-syncs on exit. Coalesced touch samples are all applied, and the touch target is larger than the drawn wheel. The wheel angle, "deployed %" and mm readouts always come from the same `f`.
- **Phone / tablet (<= 900 px)**: the first block on the Handle tab (visible without scrolling) has four large buttons (>= 56 px): **Hold to deploy (slow)**, **Hold to resheath**, **Tap to deploy: +2 mm**, **Tap to resheath: -2 mm**, plus an Unlock button and a live readout (deployed %, mm, LOCK, speed rating). Holds use the same slow wheel rate as "Deploy slow"; a tap sets a target 2 mm away that the capsule glides to at the safe wheel speed (`act.stepMm`). All of them go through `Sim.wheel()`, so the phase gates, the 80 % lock (Unlock required), the second-view check and the speed scoring are identical to the wheel. Touch hardening: touchstart default prevented (no ghost click), no context menu, no selection, pointer capture so sliding the finger off a held button keeps the hold until release.
- Tests: `tests/wheel-input-e2e.mjs` (mouse on desktop, CDP touch on a 390x844 mobile viewport with hasTouch) and `tests/mobile-deploy-e2e.mjs` (real touch holds and taps, lock, speed, layout, no ghost click/menu/selection).

### Skip phase (v9)
- **Button**: `Skip phase ▶` (>= 44 px) in the header, between Settings and Reset on a phone. In phases 1-8 it advances to the next phase at once, from any state (also during a fluoro problem or with inputs held). In phase 9 it reads `Finish / show score ▶` and opens the proctor sheet. Optional: tap the *next* phase circle (only forward by one) for the same effect.
- **Safe state for the next phase** (`Sim.skipPhase()`): entry -> in the descending aorta; rotation -> markers neutral (not credited); arch -> ascending aorta, unflexed; cross -> valve crossed, shaft centred, marker on the annular plane, wire held, cusp-overlap C-arm view (alignment not credited); landing -> 80 % locked; 80 % stop -> unlocked at 80 % (no MAJOR from the button); release -> released at 100 % (deployment is moved by running the real physics at the safe slow wheel rate, so depth and seating are physical); nosecone out -> wire fixed, nosecone closed, out at the access site, closure left undone.
- **Score sheet**: each skipped phase is listed under "Skipped by learner" with one sentence ("Phase 5 (...) was skipped, so ... was not assessed."), and the rows that phase would have scored are marked SKIPPED (failed): 1 iliac; 2 rotation; 3 nosecone/path; 4 alignment + nosecone; 5 depth NCC + left cusp; 6 80 % stop + wire; 7 depth + alignment; 8 nosecone + wire; 9 closure. Phases played for real are scored as usual.
- Tests: `tests/logic.mjs` (skip section) and `tests/skip-phase-e2e.mjs` (real clicks, desktop + phone).

### Bigger handle diagram (v10)
- **Phones (<= 900 px)**: the diagram has its own portrait layout (viewBox 360x524) and spans the full width (4 px side padding, 390 px phone: deployment wheel 166 px across = 42 % of the width; 153 px at 360, 183 px at 430). MICRO wheel 81 px, MICRO -/+ buttons >= 44 px, MACRO SLIDE buttons side by side (>= 56 px high), deployment-lock bar 34 px high with a 54 px lock icon, captions >= 12 px. The touch deploy block stays first and the diagram sits directly beneath it; the other Handle buttons and readouts follow. Wheel touch-drag works on the larger ring and its larger hit circle.
- **Desktop**: wider right column and a larger wheel (about 99 px across, was about 68 px).
- The SVG is rebuilt when the window crosses the 900 px breakpoint. Layout, overlap and size checks live in `tests/handle-layout-e2e.mjs`.

### Wire as rail (v11)
- **Rule**: the guidewire is the rail. The device axis (nosecone tip -> handle) is the wire's centreline (the anatomical path) plus at most **1.0 mm** of lumen clearance, and only where the shaft is flexed in a bend; the nosecone, inner shaft and capsule sit **exactly** on the wire. Gameplay `lat` (Flex mismatch, the "centred within 2 mm" gates and scoring) is unchanged, but its visual effect is bounded (`CL.maxOff`, `src/centreline.js`). Advance / withdraw only slides the system along the wire's arc length; the old bend limiter now acts only during a 'force' failure.
- **Wire drawing** (`Device.updateWire`): the wire is drawn along the device axis through the central lumen from the handle end, out of the **nosecone tip centre** (a dark exit hole on the tip axis), then along the path to the wire tip and the atraumatic pigtail in the LV. Shafts, sheath and nosecone are translucent in 3D; in fluoro the wire is continuous through and beyond the nosecone. Moving the wire (phases 4 and 8) moves the rail, the system keeps following it. **Wire lost / pulled**: the wire tip is drawn pulled back inside the lumen behind the nosecone; nothing floats off the wire. After the pigtail is removed the wire is not drawn.
- **Valve redesign (first-generation look, current-generation markers)**: silver nitinol lattice, small dense diamond cells at the inflow (12 around), an hourglass waist at the leaflets, 6 large elongated cells at the flared outflow ending in three tall arched peaks over the commissural posts (a bead on each post tip), eyelet blocks on the mid vertical struts, light grey/white NaviSeal skirt on the lower exterior with a scalloped top edge following the lower cells, three low pale-cream scalloped leaflets, 9 dark rim feet. No logo. **Vision markers**: three radiopaque markers **3 mm above the inflow edge, each exactly in line with its commissural post** (same azimuth, 120 deg apart) - the cue for rotation / commissure alignment in phases 2, 4, 5 and 6, in 3D and fluoro. Partial deployment (inflow first), foreshortening and crimped containment in the bending capsule are unchanged.
- Tests: `tests/centreline.mjs` (rail deviation <= 1 mm, nosecone ~0, phases 1-8 poses, flex/lat sweep), `tests/rail-e2e.mjs` (live sim: wire through the nosecone tip, in the lumen, along the rail, wire control, wire lost, marker azimuth = post azimuth, marker height 3 mm; screenshots of phases 1, 2, 4 in fluoro and 3D).

### Phase 8 order: withdraw OPEN, close in the descending aorta (v12)
Cusp-overlap technique: after the valve is released the operator **withdraws the whole delivery system with the nosecone still open**, wire kept fixed across the valve as the rail, back through the valve and the arch into the descending aorta, and **only there closes the nosecone with the MACRO slide**; then the closed system is withdrawn out the iliac holding the wire.
- **Threshold**: nosecone tip at or below `archStart - 25` on the path (`Sim.descOk()`), i.e. distal to the arch, whole capsule in the descending aorta. `Sim.macroState()` is `off` / `locked` / `ready` / `closed`.
- **Locked in the root / ascending aorta / arch**: the MACRO slide (button, handle diagram, M key) does nothing and says "Withdraw the open system into the descending aorta before closing the nosecone." The attempt is counted (`flags.macroEarly`, once per 2 s of holding) and is a **scored miss** on the "Nosecone and system path" row, with feedback explaining the correct order.
- **Visible state**: the `Macro slide` button reads LOCKED (dimmed, `aria-disabled`, still pressable so it can explain) / READY (highlighted) / closed; the handle diagram's MACRO SLIDE rectangles turn amber with "locked: pull back" and the caption reads "locked: descending aorta" / "READY: close nosecone"; the fluoro readout shows the next step.
- **Safety kept**: pulling the OPEN nosecone back through the valve still needs it centred on the wire (|offset| <= 2.5 mm, use Flex, wire fixed and advanced) or it catches the frame/leaflets (`frameCatch`, scored); wire not held -> `wirePulled`; the half-closed nosecone cannot be withdrawn; an open nosecone is stopped in the descending aorta (it cannot enter the iliac open); phase 9 starts only after closure and exit.
- **Skip phase**: skipping 7 -> 8 gives a released valve with the nosecone open and the system in the root (macro locked, coach line says so); skipping 8 -> 9 is unchanged (wire fixed, nosecone closed, out at the access site, closure undone).
- Tests: `tests/order-e2e.mjs` (real UI, desktop + phone), plus updated `tests/logic.mjs`, `tests/e2e.mjs`, `tests/skip-phase-e2e.mjs`, `tests/handle-layout-e2e.mjs`; `tests/drv.js` `phase8()` follows the new order.

### Back / previous phase button (v13)
A **◀ Back** button sits in the header between *Skip phase* and *Reset* (a real `<button>`, `aria-label` "Go back to phase N", at least 44 px high on phones, keyboard: Tab / Enter / Space; disabled in phase 1 and once the score sheet is final).
- **State set-up** (`Sim.backPhase()`, mirrors the Skip set-ups; the wire stays the rail, held and at least 14 mm ahead of the nosecone):
  2 -> 1 in the iliac at the bifurcation (rotation unset); 3 -> 2 in the descending aorta before the arch barrier (rotation unset); 4 -> 3 in the arch; 5 -> 4 in the ascending aorta before crossing (alignment unconfirmed, flex relaxed); 6 -> 5 the valve is **re-sheathed to crimped / not deployed** and the system is back at the landing across the annulus (marker a touch below the plane so a clean redo gives ~4 / ~3.3 mm); 7 -> 6 recaptured to the 80 % stop (locked, second view not yet credited); 8 -> 7 the valve is **un-released**: the state just before the final turn is restored from a snapshot taken at release; 9 -> 8 the released valve with the open system back in the descending aorta (MACRO ready), wire un-removed and held, phase-9 closure steps reset.
- **Not a miss**: nothing is added to any miss counter. The score sheet gets an informational box "Went back (information only)" with "Went back to phase N ..." lines; `computeScore().wentBack` carries them and they never change passed / total.
- **No farming a clean sheet**: counters are never reset, and every row that is *already a miss when you go back* is recorded as sticky (`flags.sticky`); if you redo that step well, the row stays a miss and shows "(earlier attempt: ...)".
- **Tests**: `tests/back.mjs` (logic: every phase 2-9, state, 9/9 kept for a clean run, misses stay, flags untouched), `tests/back-e2e.mjs` (UI clicks desktop + phone, rail, no console errors, gates going forward again, full run, sheet note), header checks in `tests/handle-layout-e2e.mjs` and `tests/overlays-e2e.mjs`.

### Nosecone vs wire measurement and stale-build protection (v13)
- A report said the nosecone looked drawn *beside* the wire in fluoro at phase 5. `tests/rail-all-e2e.mjs` measures the **live** build (real animation frames, no reset) in all phases: natural play, after every Skip, after every Back, and while moving. It checks ring centres of nosecone + inner shaft against the wire polyline in mm **and in fluoro screen pixels** (projection through the monitor camera), the wire leaving the tip centre, and the axis on the rail. Result: 0.000 mm / 0.00 px everywhere on the current build, so the geometry is not off; builds before v11 (`f21039b`) drew the wire on the path while the device was offset, which looks exactly like the report, so a cached old page is the most likely cause.
- GitHub Pages sends `Cache-Control: max-age=600`, which cannot be changed from the repo, so v13 adds: `no-cache` meta tags, a **visible build marker** in the footer and in Settings (and `<meta name="navitor-build">`), and a version check (`fetch(..., {cache: 'no-store'})` of the page itself with `?v=`) on load and when the tab becomes visible again; if the server has another marker a banner "A newer build is available - Reload now" appears. `tests/version-e2e.mjs` covers it.
Screenshots: `docs/v13-desktop-*.png`, `docs/v13-phone-*.png` (header with Back, score sheet "Went back to phase N", phase 5 fluoro live / after Back, Settings build marker, update banner, state after Back from 9).

### White nosecone (v14)
The nosecone is now **white** in the 3D view (it used to be teal): clean white (`#ffffff`, 80 % opacity, a little emissive so it stays light in the dim scene) with a thin dark-slate rim (an outline tube just outside it, 3D only) so it separates from the white inner shaft (`#f5f5f5`), the NaviSeal cuff (`#e9ecee`) and the pale frame, and the dark wire-exit hole dot on the tip is unchanged. The handle diagram's MACRO slide (which drives the nosecone), the "FlexNav nosecone" label and the part info use the same white; the READY / LOCKED / closed states are still told apart by fill and amber. **Fluoro is untouched** (radiopaque-dark shader, the outline is not drawn in fluoro). Note: the tube meshes are wound inward-facing, so the outline uses `FrontSide` to draw its far wall.
- Test: `tests/nosecone-white-e2e.mjs` (material colours, translucency, hole dot, outline, fluoro material unchanged, rendered pixels are light and neutral along the cone, handle diagram colour, no teal left in the build).
- Screenshots: `docs/v14-*-3d-nosecone-white.png`.

### Free deployment in phase 5, automatic move to phase 6 (v15)
- **No gates in phase 5.** The deployment wheel (drag), Hold to deploy, Tap +2 mm, the Deploy buttons and the X key always start unsheathing in phase 5, whatever has not been done: parallax not killed / not in the cusp-overlap view, inner-shaft marker off the annular plane, valve not across the annulus, shaft off-centre, wire not fixed. (Phases 1-4 still refuse the wheel; `Sim.wheel()` is the single path for every input, so the lock, speed and recapture rules are unchanged.)
- **Recorded, not blocked** (`Sim.startDeploy()`, once per start from fully sheathed; flags are never cleared, so recapturing and redoing it well does not erase the miss): `deployNoView` and `deployNoMarker` -> **Commissural alignment** row (the cusp-overlap view / marker on the plane are what that row stands for); `deployNoCross` and `deployOffCentre` -> **Nosecone and system path** row; `deployNoHold` -> **Wire discipline** row. A coach line lists exactly what was skipped ("Unsheathing without ... - allowed, but scored as a miss, and the valve will land where the system really is").
- **Real consequences** come from the existing physics (the valve opens at the real system position, relative to the real annulus), so a marker 10 mm too deep gives a deep valve, and one that starts above the plane gives an implant above the annulus. The **depth rows** now say what that means: above the annulus -> pops up / migrates into the aorta, needs a snare or a second valve; more than 8 mm deep -> LV outflow tract, embolisation risk; the displayed depth is capped at "more than 40 mm". The existing second-view check still rejects a bad depth, and Unlock without it is still the MAJOR miss.
- **Pigtail contrast** was never a gate or a scored row (Inject contrast is optional and "never changes the score rows"), so there is no new miss for it.
- **Auto-advance**: when the wheel reaches the 80 % lock in phase 5 the sim moves on to phase 6 by itself (`flags.autoAdvance56`) with the coach line "80% lock engaged - moved on to phase 6 automatically. Now the 3-cusp second view...". Phase 6 is exactly as before: second view, Unlock, recapture between 0 and 80 % (returns to phase 5 and can advance again), passing 80 % without the second view = MAJOR.
- Back, Skip phase and the phase 8 order are unchanged (Back 6 -> 5 re-sheathes and deployment is free again; Skip 5 -> 6 lands at the lock).
- Tests: `tests/deploy-free.mjs` (logic: every prerequisite, row mapping, physics consequences, phase 6 rules, tap path, Back/Skip/phase 8) and `tests/deploy-free-e2e.mjs` (desktop + phone: real wheel drag, hold, tap / X key, auto-advance, recapture, misses on the sheet, bad landing). Updated: `logic`, `skip-align-e2e`.
