import { makeConstrainedRockOutline } from "./outline.js";
import { createWallComposition } from "./wall-composition.js";
import { buildBoundedRockSurface } from "./loft-rock.js";
import { createBodyProfile } from "./body-profile.js";

/** Default authoring controls; slope and direction are degrees, section scales are relative to the envelope. */
export const DEFAULT_ROCK = Object.freeze({
  seed: 4659,
  topScale: 0.8,
  bottomScale: 1,
  shoulderScale: 0.95,
  shoulderHeight: 0.68,
  obbWidth: 4.2,
  obbHeight: 4.2,
  obbDepth: 4.2,
  topRoughness: 0.15,
  topSlope: 0,
  wallCount: 12,
  wallOverlap: 0.45,
  wallStagger: 0.55,
  wallStrength: 0.65,
  wallProtrusion: 0.35,
  wallLength: 1.6,
  wallTilt: 8,
  topDirection: 0,
  outlineIrregularity: 0,
  aspect: 1,
  resolution: 32
});
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
function random(seed, i) {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

function crossSection(seed, wear, irregularity) {
  const r = (i) => random(seed, i),
    outline = makeConstrainedRockOutline(
      {
        seed,
        aspect: 1,
        taper: (r(1) - 0.5) * 0.12,
        cut: 0.1 + 0.1 * r(2) + 0.28 * irregularity,
        wave: 0.012 + 0.025 * wear + 0.035 * irregularity,
        scale: 0.16 + 0.12 * r(3),
        chip: 0.003 * wear,
        fineScale: 0.04,
        coverage: 1,
        notches: 1 + Math.floor(r(4) * 2),
        notchWidth: 0.045 + 0.05 * r(5),
        notchDepth: 0.008 + 0.035 * wear
      },
      256
    );
  const min = [Infinity, Infinity],
    max = [-Infinity, -Infinity];
  for (const point of outline.contour)
    for (let axis = 0; axis < 2; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  const center = min.map((v, i) => (v + max[i]) / 2),
    scale = min.map((v, i) => 4.2 / (max[i] - v));
  const contour = outline.contour.map((point) => point.map((v, i) => (v - center[i]) * scale[i]));
  return { ring: Float32Array.from(outline.contour, (p) => Math.hypot(...p)), center, scale, contour };
}
function radius(ring, x, z) {
  const u = ((Math.atan2(z, x) / TAU + 1) % 1) * ring.length,
    i = Math.floor(u);
  return mix(ring[i], ring[(i + 1) % ring.length], u - i);
}

function makeRockField(p) {
  const r = (i) => random(p.seed, i),
    halfHeight = 2.1,
    section = crossSection(p.seed, p.wear, p.outlineIrregularity);
  const { ring, center, scale } = section,
    sectionUnit = Math.min(...scale);
  const angle = (p.topDirection * Math.PI) / 180,
    roofX = Math.cos(angle),
    roofZ = Math.sin(angle);
  const metric = [p.obbWidth / 4.2, p.obbHeight / 4.2, p.obbDepth / 4.2];
  const roughScale = Math.min(1, Math.min(metric[0], metric[2]) / metric[1]);
  const span = Math.abs(roofX) * p.obbWidth + Math.abs(roofZ) * p.obbDepth;
  const allowedSlope = (Math.atan(((3.1 - 0.74 * p.topRoughness * roughScale) * metric[1]) / span) * 180) / Math.PI;
  const effectiveTopSlope = Math.min(p.topSlope, allowedSlope),
    slope = Math.tan((effectiveTopSlope * Math.PI) / 180),
    phase = r(12) * TAU;
  function roofRelief(x, z) {
    const u = x * roofX + z * roofZ,
      v = -x * roofZ + z * roofX;
    const rough =
      0.25 * Math.sin(u * 1.8 + phase) * Math.sin(v * 1.5 + phase * 0.7) + 0.12 * Math.sin(u * 3.1 - v * 1.2 + phase);
    return (slope * (x * metric[0] * roofX + z * metric[2] * roofZ)) / metric[1] + p.topRoughness * rough * roughScale;
  }
  // The roof plane is bounded over the whole OBB, including protrusions and
  // wider shoulders. Clipping a plane against the tiny top section instead
  // creates a hidden flat ledge where an outward wall crosses that section.
  const roofPeak = (slope * span) / (2 * metric[1]) + p.topRoughness * roughScale * 0.37;
  function crown(x, z) {
    return halfHeight - (roofPeak - roofRelief(x, z));
  }
  function coreSide(x, z) {
    const X = x / scale[0] + center[0],
      Z = z / scale[1] + center[1];
    return (Math.hypot(X, Z) - radius(ring, X, Z)) * sectionUnit;
  }
  const cornerLimit = 3.62;
  function cutEnvelope(x, z) {
    return Math.max(
      coreSide(x, z),
      Math.abs(x) - halfHeight,
      Math.abs(z) - halfHeight,
      (Math.abs(x) + Math.abs(z) - cornerLimit) * Math.SQRT1_2
    );
  }
  return {
    envelope: cutEnvelope,
    crown,
    sectionScale: createBodyProfile(p),
    metric,
    requestedTopSlope: p.topSlope,
    effectiveTopSlope,
    compose: (perimeter) => createWallComposition(p, perimeter, 4.2)
  };
}

/**
 * Builds a closed procedural rock inside the requested metre-sized OBB.
 * @param {object} parameters OBB dimensions in metres, roof angles in degrees,
 * and independent bottom/shoulder/top section scales.
 * @returns Owned geometry buffers, actual bounds, fixed envelopeBounds and generation statistics.
 */
export function buildRock(parameters = {}) {
  const start = performance.now(),
    p = { ...DEFAULT_ROCK, ...parameters };
  for (const key of ["topScale", "shoulderScale"]) p[key] = clamp(finite(p[key], DEFAULT_ROCK[key]), 0.08, 1);
  p.bottomScale = clamp(finite(p.bottomScale, DEFAULT_ROCK.bottomScale), 0, 1);
  p.shoulderHeight = clamp(finite(p.shoulderHeight, DEFAULT_ROCK.shoulderHeight), 0.15, 0.9);
  // UI ranges are not geometry limits: published Seed OBBs can be larger or smaller.
  for (const key of ["obbWidth", "obbHeight", "obbDepth"]) {
    p[key] = finite(p[key], 4.2);
    if (!(p[key] > 0)) throw new RangeError("Rock OBB dimensions must be positive");
  }
  for (const key of ["topRoughness", "wallStrength", "wallOverlap", "wallStagger", "wallProtrusion"])
    p[key] = clamp(finite(p[key], DEFAULT_ROCK[key]));
  p.wallLength = clamp(finite(p.wallLength, DEFAULT_ROCK.wallLength), 0.5, 3);
  p.wallTilt = clamp(finite(p.wallTilt, DEFAULT_ROCK.wallTilt), -35, 35);
  const slope = finite(p.topSlope, 0);
  p.topSlope = clamp(Math.abs(slope), 0, 75);
  p.topDirection = (((finite(p.topDirection, 0) + (slope < 0 ? 180 : 0)) % 360) + 360) % 360;
  p.wallCount = Math.round(
    clamp(
      finite(
        parameters.wallCount,
        parameters.complexity == null ? DEFAULT_ROCK.wallCount : 4 + 2 * Number(parameters.complexity)
      ),
      4,
      28
    )
  );
  p.seed = Math.round(finite(p.seed, 4659)) || 1;
  p.resolution = Math.round(clamp(finite(p.resolution, 32), 24, 96));
  p.wear = clamp(finite(p.wear, 0.35));
  p.outlineIrregularity = clamp(finite(p.outlineIrregularity, 0));
  p.aspect = 1;
  const source = makeRockField(p),
    mesh = buildBoundedRockSurface(source, p);
  /** @type {[number[], number[]]} */
  const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity]
  ];
  for (let i = 0; i < mesh.positions.length; i++) {
    const k = i % 3,
      v = mesh.positions[i];
    bounds[0][k] = Math.min(bounds[0][k], v);
    bounds[1][k] = Math.max(bounds[1][k], v);
  }
  /** @type {[number[], number[]]} */
  const envelopeBounds = [
    [-p.obbWidth / 2, -p.obbHeight / 2, -p.obbDepth / 2],
    [p.obbWidth / 2, p.obbHeight / 2, p.obbDepth / 2]
  ];
  return {
    ...mesh,
    bounds,
    envelopeBounds,
    stats: {
      ...mesh.stats,
      triangles: mesh.indices.length / 3,
      vertices: mesh.positions.length / 3,
      bakeMs: performance.now() - start,
      features: p.wallCount,
      requestedTopSlope: source.requestedTopSlope,
      effectiveTopSlope: source.effectiveTopSlope
    }
  };
}
