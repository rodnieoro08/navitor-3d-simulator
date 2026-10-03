// Shared math + constants (all lengths in mm, angles in degrees unless noted)
import * as THREE from 'three';
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrap180 = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };
export const wrap60 = a => { a = ((a + 60) % 120 + 120) % 120 - 60; return a; }; // period 120 (3 posts)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Beam direction (source -> detector, i.e. toward the detector) in patient frame:
// X = patient LEFT, Y = HEAD, Z = ANTERIOR.  LAO positive, CRA positive.
export function beamDir(lao, cra, out = new THREE.Vector3()) {
  const a = lao * D2R, c = cra * D2R;
  return out.set(Math.cos(c) * Math.sin(a), Math.sin(c), Math.cos(c) * Math.cos(a));
}
export function fmtLao(v) { const r = Math.round(v); return (r < 0 ? 'RAO ' : r > 0 ? 'LAO ' : 'AP ') + Math.abs(r); }
export function fmtCra(v) { const r = Math.round(v); return (r < 0 ? 'CAU ' : r > 0 ? 'CRA ' : 'CRA ') + Math.abs(r); }
export const CASE = {
  annulusMm: 24, valveMm: 27, seed: 20261003,
  cuspOverlapPlan: { lao: -36, cra: -24 }, cuspOverlapTrue: { lao: -30, cra: -30 },
  threeCuspPlan: { lao: 26, cra: 24 }, threeCuspTrue: { lao: 32, cra: 30 },
};
