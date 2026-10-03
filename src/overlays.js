// Overlay switches (what is drawn on top of the images). Purely visual: they never touch the simulation, scoring or gating.
export const OV_KEY = 'navitor-sim-overlays-v1';
export const OVERLAYS = [
  { key: 'parts', label: 'Device part labels', desc: '3D legend of the FlexNav parts and the part-info box' },
  { key: 'labels', label: 'Anatomy labels', desc: 'LCA, RCA, NCC, pigtail, nosecone, wire... on fluoro and anatomy images' },
  { key: 'measures', label: 'Measurements and readouts', desc: 'marker vs annulus, depth, root motion, centre, post offset' },
  { key: 'guides', label: 'Target guides', desc: 'annulus ring and cusp dots, flex target, pressure and wire target bands' },
  { key: 'inset', label: 'Plan view inset', desc: 'small marker-pattern / plan view of the valve' },
  { key: 'parallax', label: 'Parallax meter', desc: 'parallax error, ring-open % and view check' },
  { key: 'angles', label: 'C-arm angle readout', desc: 'LAO / CRA and image orientation' },
  { key: 'handle', label: 'Handle status text', desc: 'wheel speed, deployed %, recapture feel' },
];
export const defaultOverlays = () => Object.fromEntries(OVERLAYS.map(o => [o.key, true]));
export function loadOverlays() {
  const o = defaultOverlays();
  try { const raw = window.localStorage.getItem(OV_KEY); if (raw) { const j = JSON.parse(raw); for (const k in o) if (typeof j[k] === 'boolean') o[k] = j[k]; } } catch (e) { /* storage blocked: defaults */ }
  return o;
}
export function saveOverlays(o) { try { window.localStorage.setItem(OV_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
