import {
  SEED_WORLD_SEA_LEVEL_METRES,
  sampleSeedWorldHeight,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "../runtime/SeedWorldFields.ts";
import {
  SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES,
  SeedWorldLandCover,
  type SeedWorldPlan
} from "../world/SeedWorldPlanner.ts";
import type { SeedWorldRuntimePlan } from "../world/SeedWorldRuntimePlan.ts";

const PI = Math.PI;
const TAU = Math.PI * 2;
const DEFAULT_VISTA_SEED = 261111;

export const clampVista = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const satVista = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerpVista = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothVista(a: number, b: number, x: number): number {
  const t = satVista((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function hashVistaU(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function hashVista2U(x: number, y: number): number {
  return hashVistaU(Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77));
}

export function createVistaKeyedNoise(seed: number) {
  const normalized = Math.floor(Math.abs(seed)) || DEFAULT_VISTA_SEED;
  const key = hashVistaU(normalized) ^ hashVistaU(DEFAULT_VISTA_SEED);

  const hash2 = (x: number, y: number, s: number): number => {
    const h = hashVistaU(Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s ^ key, 1442695041));
    return (h & 0xffffff) / 0x800000 - 1;
  };

  const vnoise2 = (x: number, y: number, s: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s);
    const b = hash2(ix + 1, iy, s);
    const c = hash2(ix, iy + 1, s);
    const d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };

  const vnoise2Unit = (x: number, z: number, s = 0): number => 0.5 + 0.5 * vnoise2(x, z, s);

  return { key, hash2, vnoise2, vnoise2Unit };
}

/**
 * 3D folded rock strata coordinate shared between CPU mesh bench carving and GPU fragment shader.
 */
export function evaluateVistaStrata(x: number, y: number, z: number, bedThickness = 64, foldStrength = 1.0): number {
  const bed = Math.max(16, bedThickness);
  const k = TAU / 1024;
  const u =
    y / bed +
    foldStrength *
      (0.84 * Math.sin(k * (x + z) + 1.1 * Math.sin(k * (x - z) + 0.7)) +
        0.32 * Math.sin(2 * k * x + 1.7 * Math.sin(k * z)) +
        0.2 * Math.sin(3 * k * z + 1.3 * Math.sin(k * x) + 1.1) +
        0.09 * Math.sin(4 * k * (x - z) + 2.0 * Math.sin(k * (x + z))));
  const ph = 2.1 * Math.sin(k * (x - z) + 0.4) + 1.3 * Math.sin(2 * k * z + 1.1 * Math.sin(k * x));
  return u + 0.22 * Math.sin(1.9634954 * u + 1.7 + ph) + 0.035 * Math.sin(5.1050881 * u + 0.6 - 0.8 * ph);
}

/**
 * Cold Smoke's jittered-grid slope-perpendicular cosine wave (`gullies()`).
 * Writes `[value (-1..1), d/dx, d/dz]` into `out`.
 */
function sampleVistaGullyWave(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  seed: number,
  key: number,
  out: [number, number, number]
): void {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix - 0.5;
  const fz = pz - iz - 0.5;
  let v = 0;
  let gx = 0;
  let gz = 0;
  let wt = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      let n = Math.imul(ix + i, 374761393) ^ Math.imul(iz + j, 668265263) ^ seed ^ key;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      n ^= n >>> 16;
      const qx = fx - i - ((n & 0xffff) / 65536 - 0.5) * 0.5;
      const qz = fz - j - ((n >>> 16) / 65536 - 0.5) * 0.5;
      const d = 1 - (qx * qx + qz * qz) / 1.5625;
      if (d <= 0) continue;
      const wgt = d * d * d;
      const ph = (qx * dx + qz * dz) * TAU;
      const sn = Math.sin(ph);
      v += Math.cos(ph) * wgt;
      gx -= sn * dx * wgt;
      gz -= sn * dz * wgt;
      wt += wgt;
    }
  }
  const invW = wt > 1e-8 ? 1 / wt : 0;
  out[0] = v * invW;
  out[1] = gx * invW;
  out[2] = gz * invW;
}

/**
 * 360° azimuthal boundary profile extracted from a finite world (such as SeedWorld's 3,072 m × 3,072 m domain).
 * Azimuth `az = atan2(x - worldCenterX, -(z - worldCenterZ))` spans `[-π, +π)` across `bins` uniformly spaced samples.
 */
export interface PanoramaVistaBoundaryProfile {
  readonly bins: number;
  readonly worldHalfSizeMetres: number;
  readonly worldCenterX: number;
  readonly worldCenterZ: number;
  /** Terrain elevation (in metres) at the square perimeter along each azimuth bin. */
  readonly edgeHeightMetres: Float32Array;
  /** Directional mountain prominence `[0..1.5]` derived from perimeter elevation, mountain brushes, and summits. */
  readonly mountainEnergy: Float32Array;
  /** Smoothed land mask `[0..1]` along each azimuth (`1` = inland/continental, `0` = open ocean coast). */
  readonly landMask: Float32Array;
  /** Smoothed forest affinity `[0..1]` along each azimuth. */
  readonly forestAffinity: Float32Array;
}

/**
 * Samples a periodic azimuthal array (`[-π, +π)`) with linear wrap-around interpolation.
 */
export function sampleAzimuthArray(values: Float32Array, azimuthRadians: number): number {
  const bins = values.length;
  if (bins === 0) return 0;
  const normalized = ((azimuthRadians + PI) / TAU) % 1;
  const u = (normalized < 0 ? normalized + 1 : normalized) * bins;
  const i0 = Math.floor(u) % bins;
  const i1 = (i0 + 1) % bins;
  const frac = u - Math.floor(u);
  return values[i0]! + (values[i1]! - values[i0]!) * frac;
}

/**
 * Projects a unit direction `(dx, dz)` onto the square boundary `max(|x|, |z|) = halfSize`.
 */
export function projectDirectionToSquarePerimeter(dx: number, dz: number, halfSize: number): readonly [number, number] {
  const maxAbs = Math.max(Math.abs(dx), Math.abs(dz), 1e-6);
  const scale = halfSize / maxAbs;
  return [dx * scale, dz * scale];
}

export type SeedWorldVistaPlanSource = SeedWorldPlan | SeedWorldRuntimePlan;

/**
 * Samples terrain around the world boundary to guide the transition skirt and distant panorama.
 */
export function extractSeedWorldBoundaryProfile(
  plan: SeedWorldVistaPlanSource,
  fields?: SeedWorldFields,
  bins = 256
): PanoramaVistaBoundaryProfile {
  if (!Number.isInteger(bins) || bins < 16) {
    throw new RangeError("PanoramaVistaBoundaryProfile requires at least 16 azimuth bins");
  }
  const sizeMetres = fields?.sizeMetres ?? plan.sizeMetres;
  const halfSize = sizeMetres * 0.5;
  const origin = "worldOrigin" in plan ? plan.worldOrigin : undefined;
  const originX = fields ? seedWorldOriginX(fields) : (origin?.[0] ?? -halfSize);
  const originZ = fields ? seedWorldOriginZ(fields) : (origin?.[1] ?? -halfSize);
  const worldCenterX = originX + halfSize;
  const worldCenterZ = originZ + halfSize;

  const edgeHeightMetres = new Float32Array(bins);
  const rawEnergy = new Float32Array(bins);
  const rawLand = new Float32Array(bins);
  const rawForest = new Float32Array(bins);

  const hasLegacyPlanGrid = "height" in plan && "landMask" in plan && "landCover" in plan && "resolution" in plan;

  const sampleCell = (relX: number, relZ: number) => {
    const nx = clampVista(relX / sizeMetres + 0.5, 0, 0.999999);
    const nz = clampVista(relZ / sizeMetres + 0.5, 0, 0.999999);
    if (hasLegacyPlanGrid) {
      const res = plan.resolution;
      const gx = Math.min(res - 1, Math.floor(nx * res));
      const gz = Math.min(res - 1, Math.floor(nz * res));
      const idx = gz * res + gx;
      return {
        heightNorm: plan.height[idx] ?? 0,
        land: plan.landMask[idx] ? 1 : 0,
        cover: plan.landCover[idx] ?? SeedWorldLandCover.Grassland
      };
    }
    if (fields) {
      const res = fields.surfaceResolution;
      const gx = Math.min(res - 1, Math.floor(nx * res));
      const gz = Math.min(res - 1, Math.floor(nz * res));
      const idx = gz * res + gx;
      const h = sampleSeedWorldHeight(fields, worldCenterX + relX, worldCenterZ + relZ) ?? SEED_WORLD_SEA_LEVEL_METRES;
      const isWater = (fields.waterMask[idx] ?? 0) > 127 || h <= 0;
      return {
        heightNorm: clampVista(h / SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES, 0, 1),
        land: isWater ? 0 : 1,
        cover: (fields.habitat[idx] as SeedWorldLandCover | undefined) ?? SeedWorldLandCover.Grassland
      };
    }
    return {
      heightNorm: 0.15,
      land: 1,
      cover: SeedWorldLandCover.Grassland
    };
  };

  for (let i = 0; i < bins; i++) {
    const az = ((i + 0.5) / bins - 0.5) * TAU;
    const dx = Math.sin(az);
    const dz = -Math.cos(az);
    const [bx, bz] = projectDirectionToSquarePerimeter(dx, dz, halfSize - 1);

    const planOuter = sampleCell(bx * 0.96, bz * 0.96);
    const planInner = sampleCell(bx * 0.78, bz * 0.78);
    const edgeH =
      fields !== undefined
        ? (sampleSeedWorldHeight(fields, worldCenterX + bx, worldCenterZ + bz) ?? SEED_WORLD_SEA_LEVEL_METRES)
        : planOuter.heightNorm * SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES;

    edgeHeightMetres[i] = edgeH;
    rawLand[i] = 0.65 * planOuter.land + 0.35 * planInner.land;
    rawForest[i] =
      (planOuter.cover === SeedWorldLandCover.Forest ? 0.65 : 0.25) +
      (planInner.cover === SeedWorldLandCover.Forest ? 0.35 : 0.1);

    let brushContribution = clampVista((edgeH - 32) / 150, 0, 1.1);

    if ("mountainRidges" in plan && Array.isArray(plan.mountainRidges)) {
      for (const ridge of plan.mountainRidges) {
        for (const brush of ridge.brushes) {
          const wx = (brush.center.x - 0.5) * sizeMetres;
          const wz = (brush.center.y - 0.5) * sizeMetres;
          const distFromOrigin = Math.hypot(wx, wz);
          if (distFromOrigin < 64) continue;
          const bAz = Math.atan2(wx, -wz);
          let dAz = Math.abs(az - bAz);
          if (dAz > PI) dAz = TAU - dAz;
          const angularHalfWidth = Math.max(0.18, (brush.majorRadiusMetres * 1.35) / Math.max(400, distFromOrigin));
          if (dAz < angularHalfWidth) {
            const wAng = Math.cos((dAz / angularHalfWidth) * PI * 0.5);
            const rimWeight = smoothVista(250, halfSize * 0.85, distFromOrigin);
            brushContribution +=
              wAng * wAng * rimWeight * (brush.upliftMetres / SEED_WORLD_MAXIMUM_MOUNTAIN_UPLIFT_METRES) * 0.65;
          }
        }
      }
    } else {
      for (const summit of plan.summits) {
        const wx = (summit.x - 0.5) * sizeMetres;
        const wz = (summit.y - 0.5) * sizeMetres;
        const distFromOrigin = Math.hypot(wx, wz);
        if (distFromOrigin < 64) continue;
        const bAz = Math.atan2(wx, -wz);
        let dAz = Math.abs(az - bAz);
        if (dAz > PI) dAz = TAU - dAz;
        const angularHalfWidth = 0.34;
        if (dAz < angularHalfWidth) {
          const wAng = Math.cos((dAz / angularHalfWidth) * PI * 0.5);
          brushContribution += wAng * wAng * clampVista(summit.elevation, 0.15, 1.0) * 0.45;
        }
      }
    }

    rawEnergy[i] = clampVista(0.28 + brushContribution, 0.15, 1.45);
  }

  // Periodic smoothing filter so mountain energy and coastal mask transition smoothly around 360°
  const smoothCircular = (src: Float32Array, radiusBins: number): Float32Array => {
    const dst = new Float32Array(bins);
    for (let i = 0; i < bins; i++) {
      let sum = 0;
      let wSum = 0;
      for (let k = -radiusBins; k <= radiusBins; k++) {
        const j = (((i + k) % bins) + bins) % bins;
        const w = Math.cos((k / (radiusBins + 1)) * PI * 0.5);
        sum += src[j]! * w;
        wSum += w;
      }
      dst[i] = sum / Math.max(wSum, 1e-6);
    }
    return dst;
  };

  return {
    bins,
    worldHalfSizeMetres: halfSize,
    worldCenterX,
    worldCenterZ,
    edgeHeightMetres,
    mountainEnergy: smoothCircular(rawEnergy, Math.max(3, Math.round(bins * 0.045))),
    landMask: smoothCircular(rawLand, Math.max(3, Math.round(bins * 0.04))),
    forestAffinity: smoothCircular(rawForest, Math.max(3, Math.round(bins * 0.04)))
  };
}

export interface PanoramaVistaOptions {
  /** Deterministic seed driving the distant mountain ranges (e.g. `plan.stageSeeds.geology ^ plan.rootSeed`). */
  readonly seed: number;
  /** Panoramic texture width in pixels (default `2048`). Covers the full 360° horizon (`-π .. +π`). */
  readonly width?: number;
  /** Panoramic texture height in pixels (default `256`). */
  readonly height?: number;
  /** Near ray-march start distance in kilometres (default `20`). */
  readonly minDistanceKm?: number;
  /** Far ray-march end distance in kilometres (default `160.0`). */
  readonly maxDistanceKm?: number;
  /** Number of log-spaced radial steps per azimuth column (default `240`). */
  readonly radialSteps?: number;
  /** Minimum elevation angle in radians at the bottom row of the panorama (default `-0.042`). */
  readonly minElevationRadians?: number;
  /** Maximum elevation angle in radians at the top row of the panorama (default `0.16`). */
  readonly maxElevationRadians?: number;
  /** Sun azimuth in radians used when baking the multi-step horizon self-shadow channel (default `2.45`). */
  readonly sunAzimuthRadians?: number;
  /** Observer reference elevation in metres (default `85`). */
  readonly observerAltitudeMetres?: number;
  /** Optional azimuthal boundary profile extracted from the finite world. */
  readonly boundaryProfile?: PanoramaVistaBoundaryProfile;
}

export interface PanoramaVistaBuffers {
  readonly width: number;
  readonly height: number;
  readonly minDistanceKm: number;
  readonly maxDistanceKm: number;
  readonly minElevationRadians: number;
  readonly maxElevationRadians: number;
  /**
   * `RGBA8` buffer (`width * height * 4`):
   * - `R, G, B`: encoded world-space surface normal `(nx, ny, nz)` in `[0..255]`
   * - `A`: anti-aliased sub-pixel ridge silhouette coverage `[0..255]`
   */
  readonly farA: Uint8Array;
  /**
   * `RGBA8` buffer (`width * height * 4`):
   * - `R`: normalized log-distance `log(r / minDistanceKm) / log(maxDistanceKm / minDistanceKm)` in `[0..255]`
   * - `G`: sun-direction horizon self-shadow tangent `clamp((hzn + 0.1) / 1.1)` in `[0..255]`
   * - `B`: bare rock cliff mask `[0..255]`
   * - `A`: normalized peak elevation `[0..255]` for dynamic seasonal snowline evaluation
   */
  readonly farB: Uint8Array;
}

/**
 * Generates a full 360° (`-π .. +π`, seamless horizontal wrap) ray-marched panoramic mountain vista G-buffer.
 * Adapts Cold Smoke's `Vista.buildFar` (`16_vista.js`) to a full 360° surround horizon coupled to SeedWorld's
 * geology seed and azimuthal boundary profile.
 */
export function generatePanoramaVistaBuffers(options: PanoramaVistaOptions): PanoramaVistaBuffers {
  const width = options.width ?? 2048;
  const height = options.height ?? 256;
  const minDistanceKm = options.minDistanceKm ?? 20;
  const maxDistanceKm = options.maxDistanceKm ?? 160.0;
  const radialSteps = options.radialSteps ?? 240;
  const minEl = options.minElevationRadians ?? -0.042;
  const maxEl = options.maxElevationRadians ?? 0.16;
  const spanEl = maxEl - minEl;
  const minTangent = Math.tan(minEl);
  const nearFadeEndKm = Math.min(minDistanceKm * 1.5, maxDistanceKm);
  const sunAz = options.sunAzimuthRadians ?? 2.45;
  const observerAlt = options.observerAltitudeMetres ?? 85;
  const profile = options.boundaryProfile;

  const noise = createVistaKeyedNoise(options.seed);
  const vn = (x: number, z: number) => noise.vnoise2Unit(x, z, 0);

  const OCT_FREQ = [0.22, 0.45, 0.93, 1.91, 3.92, 8.05];
  const OCT_AMP = [0.46, 0.25, 0.135, 0.072, 0.038, 0.02];
  const logRatio = Math.log(maxDistanceKm / minDistanceKm);
  const radialSpacing = Math.expm1(logRatio / (radialSteps - 1));
  const sampleSpacing = Math.max(TAU / width, radialSpacing);

  const farHeightMetres = (xKm: number, zKm: number, rKm: number, azEnergy: number): number => {
    const wx = xKm + 3.6 * (vn(xKm * 0.08 + 1.3, zKm * 0.08 + 4.7) - 0.5);
    const wz = zKm + 3.6 * (vn(xKm * 0.08 + 8.2, zKm * 0.08 + 2.1) - 0.5);
    const m = vn(wx * 0.046 + 5.1, wz * 0.046 + 3.3);
    const M = m * m * (3 - 2 * m);
    const v = Math.abs(vn(wx * 0.029 + 19.4, wz * 0.029 + 7.8) - 0.5) * 2;
    const G = smoothVista(0.05, 0.3, v);
    let R = 0;
    let w = 1;
    let px = wx;
    let pz = wz;
    const footprintKm = rKm * sampleSpacing;
    for (let i = 0; i < OCT_FREQ.length; i++) {
      const f = OCT_FREQ[i]!;
      // Fine terrain detail below the bake's sample spacing aliases into bands.
      const weight = 1 - smoothVista(0.18, 0.5, f * footprintKm);
      if (weight === 0) break;
      const n = 1 - Math.abs(2 * vn(px * f + i * 17.3, pz * f + i * 31.7) - 1);
      const r = n * n;
      R += r * OCT_AMP[i]! * w * weight;
      w = clampVista(r * 2.1, 0.22, 1.0);
      const t = px * 0.8 - pz * 0.6;
      pz = px * 0.6 + pz * 0.8;
      px = t;
    }

    const distanceGrowth = smoothVista(minDistanceKm * 0.8, 18.0, rKm);
    const energyScale = (0.78 + 0.58 * azEnergy) * (0.55 + 0.45 * distanceGrowth);
    const worldElevation = (220 + (820 + 2450 * Math.pow(M, 1.18)) * G * (0.3 + 0.96 * R)) * energyScale;

    const apparentHeight = worldElevation - observerAlt - 0.0786 * rKm * rKm;
    // Raise the terrain gradually from below the lowest ray at the inner edge.
    // A high first sample fills every lower row with a single distance and normal.
    const floorHeight = minTangent * rKm * 1000 - 1;
    return lerpVista(floorHeight, apparentHeight, smoothVista(minDistanceKm, nearFadeEndKm, rKm));
  };

  const rad = new Float64Array(radialSteps);
  for (let i = 0; i < radialSteps; i++) {
    rad[i] = minDistanceKm * Math.pow(maxDistanceKm / minDistanceKm, i / (radialSteps - 1));
  }

  // Row 0 = top of image (maxEl), row height - 1 = bottom of image (minEl)
  const tanRow = new Float64Array(height);
  for (let k = 0; k < height; k++) {
    tanRow[k] = Math.tan(maxEl - ((k + 0.5) / height) * spanEl);
  }
  const rowOf = (t: number) => ((maxEl - Math.atan(t)) / spanEl) * height - 0.5;

  const farA = new Uint8Array(width * height * 4);
  const farB = new Uint8Array(width * height * 4);
  const dist = new Float64Array(height);
  const sdx = Math.sin(sunAz);
  const sdz = -Math.cos(sunAz);
  const HS = [0.6, 1.5, 3.2, 6.8];

  for (let c = 0; c < width; c++) {
    // Full 360° azimuth [-π, +π) mapped across [0, width)
    const az = ((c + 0.5) / width - 0.5) * TAU;
    const dx = Math.sin(az);
    const dz = -Math.cos(az);
    const azEnergy = profile ? sampleAzimuthArray(profile.mountainEnergy, az) : 0.85;

    dist.fill(0);
    let maxT = minTangent;
    let tPrev = maxT;
    let rPrev = minDistanceKm;
    let kBot = height;

    for (let i = 0; i < radialSteps; i++) {
      const r = rad[i]!;
      const t = farHeightMetres(dx * r, dz * r, r, azEnergy) / (r * 1000);
      if (t > maxT) {
        const kTop = Math.max(0, Math.ceil(rowOf(t)));
        for (let k = Math.min(kBot, height) - 1; k >= kTop; k--) {
          const denom = t - tPrev;
          const f = Math.abs(denom) > 1e-9 ? clampVista((tanRow[k]! - tPrev) / denom, 0, 1) : 1;
          dist[k] = rPrev + (r - rPrev) * f;
        }
        if (kTop < kBot) kBot = kTop;
        maxT = t;
      }
      tPrev = t;
      rPrev = r;
    }

    const fr = rowOf(maxT) + 0.5;
    const ks = Math.floor(fr);
    const cov = ks + 1 - fr;
    if (ks >= 0 && ks < height - 1 && dist[ks] === 0 && dist[ks + 1]! > 0 && cov > 0.02) {
      dist[ks] = dist[ks + 1]!;
    }

    let top = -1;
    for (let k = 0; k < height; k++) {
      const rr = dist[k]!;
      if (rr <= 0) continue;
      if (top < 0) top = k;
      const x = dx * rr;
      const z = dz * rr;
      const e = Math.max(0.025, rr * sampleSpacing * 0.5);
      const h0 = farHeightMetres(x, z, rr, azEnergy);
      const east = farHeightMetres(x + e, z, Math.hypot(x + e, z), azEnergy);
      const west = farHeightMetres(x - e, z, Math.hypot(x - e, z), azEnergy);
      const south = farHeightMetres(x, z + e, Math.hypot(x, z + e), azEnergy);
      const north = farHeightMetres(x, z - e, Math.hypot(x, z - e), azEnergy);
      const gx = (west - east) / (2 * e * 1000);
      const gz = (north - south) / (2 * e * 1000);
      const il = 1 / Math.hypot(gx, 1, gz);

      let hzn = -0.1;
      for (let s = 0; s < 4; s++) {
        const stepKm = HS[s]!;
        const sx = x + sdx * stepKm;
        const sz = z + sdz * stepKm;
        const sr = Math.hypot(sx, sz);
        const q = (farHeightMetres(sx, sz, sr, azEnergy) - h0) / (stepKm * 1000);
        if (q > hzn) hzn = q;
      }

      const worldElev = h0 + observerAlt + 0.0786 * rr * rr;
      const rock = smoothVista(0.88, 0.68, il + (vn(x * 0.42 + 5, z * 0.42) - 0.5) * 0.16);
      const normElev = clampVista((worldElev - 80) / 2200, 0, 1);

      const o = (k * width + c) * 4;
      farA[o] = clampVista(Math.round(127.5 + 127.5 * gx * il), 0, 255);
      farA[o + 1] = clampVista(Math.round(127.5 + 127.5 * il), 0, 255);
      farA[o + 2] = clampVista(Math.round(127.5 + 127.5 * gz * il), 0, 255);
      farA[o + 3] = clampVista(Math.round(255 * (k === ks ? cov : 1)), 0, 255);

      farB[o] = clampVista(Math.round((255 * Math.log(rr / minDistanceKm)) / logRatio), 0, 255);
      farB[o + 1] = clampVista(Math.round((255 * (hzn + 0.1)) / 1.1), 0, 255);
      farB[o + 2] = clampVista(Math.round(255 * rock), 0, 255);
      farB[o + 3] = clampVista(Math.round(255 * normElev), 0, 255);
    }

    // Extend top crest values into empty sky rows above the silhouette (`farA.a == 0`) for clean bilinear filtering
    if (top > 0) {
      const s = (top * width + c) * 4;
      for (let k = top - 1; k >= 0; k--) {
        const o = (k * width + c) * 4;
        farA[o] = farA[s]!;
        farA[o + 1] = farA[s + 1]!;
        farA[o + 2] = farA[s + 2]!;
        farB[o] = farB[s]!;
        farB[o + 1] = farB[s + 1]!;
        farB[o + 2] = farB[s + 2]!;
        farB[o + 3] = farB[s + 3]!;
      }
    }
  }

  return {
    width,
    height,
    minDistanceKm,
    maxDistanceKm,
    minElevationRadians: minEl,
    maxElevationRadians: maxEl,
    farA,
    farB
  };
}

export interface VistaTransitionSkirtOptions {
  readonly seed: number;
  readonly boundaryProfile: PanoramaVistaBoundaryProfile;
  /** Optional exact boundary height sampler `(worldX, worldZ) => heightMetres` so the inner ring matches the terrain clipmap. */
  readonly sampleInnerBoundaryHeight?: (worldX: number, worldZ: number) => number | undefined;
  /** Outer radius of the transition skirt in metres from the world center (default `6800`). */
  readonly outerRadiusMetres?: number;
  /** Segments along each of the 4 square perimeter sides (default `48`, yielding `192` angular columns). */
  readonly segmentsPerSide?: number;
  /** Number of radial rings from the inner square edge to the outer circular horizon (default `28`). */
  readonly radialRings?: number;
  /** Sun azimuth in radians for baking vertex horizon self-shadow tangent (default `2.45`). */
  readonly sunAzimuthRadians?: number;
}

export interface VistaTransitionSkirtMeshData {
  readonly angularColumns: number;
  readonly radialRings: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Packed `[mountainWeight, concavity, cavityAO, sunHorizonTangent]` per vertex. */
  readonly channels: Float32Array;
  /** Packed `[slopeX, slopeZ]` per vertex. */
  readonly slopes: Float32Array;
  readonly indices: Uint32Array;
}

/**
 * Generates a seamless 3D transition skirt mesh bridging the square perimeter of a finite terrain clipmap
 * (`max(|x - centerX|, |z - centerZ|) = worldHalfSizeMetres`) out to a circular outer foothills & neighboring mountain ring (`outerRadiusMetres`).
 * Evaluates Cold Smoke's 3-octave ridged multifractal relief, 4-octave fall-line tributary gullies, and 3D folded rock strata.
 */
export function generateVistaTransitionSkirt(options: VistaTransitionSkirtOptions): VistaTransitionSkirtMeshData {
  const profile = options.boundaryProfile;
  const halfSize = profile.worldHalfSizeMetres;
  const centerX = profile.worldCenterX;
  const centerZ = profile.worldCenterZ;
  const outerRadius = Math.max(halfSize * 1.8, options.outerRadiusMetres ?? 6_800);
  const segPerSide = Math.max(8, options.segmentsPerSide ?? 48);
  const angularColumns = segPerSide * 4;
  // Ring 0 is a vertical drop lip tucked beneath the clipmap edge; Ring 1 is the exact seam; Rings 2..radialRings-1 march outward
  const radialRings = Math.max(8, options.radialRings ?? 28);
  const noise = createVistaKeyedNoise(options.seed);
  const gullyScratch: [number, number, number] = [0, 0, 0];

  // Build perimeter offsets `(bx, bz)` around the 4 sides of the square `[-halfSize, +halfSize]` in clockwise azimuth order
  const innerXZ: [number, number][] = new Array(angularColumns);
  const innerAz: number[] = new Array(angularColumns);
  const innerHeight: number[] = new Array(angularColumns);

  for (let col = 0; col < angularColumns; col++) {
    const side = Math.floor(col / segPerSide);
    const t = (col % segPerSide) / segPerSide;
    const u = (t - 0.5) * 2 * halfSize;
    let bx: number;
    let bz: number;
    if (side === 0) {
      // North edge (z = -halfSize, x from -halfSize to +halfSize)
      bx = u;
      bz = -halfSize;
    } else if (side === 1) {
      // East edge (x = +halfSize, z from -halfSize to +halfSize)
      bx = halfSize;
      bz = u;
    } else if (side === 2) {
      // South edge (z = +halfSize, x from +halfSize to -halfSize)
      bx = -u;
      bz = halfSize;
    } else {
      // West edge (x = -halfSize, z from +halfSize to -halfSize)
      bx = -halfSize;
      bz = -u;
    }
    const az = Math.atan2(bx, -bz);
    innerXZ[col] = [bx, bz];
    innerAz[col] = az;
    const sampled = options.sampleInnerBoundaryHeight?.(
      centerX + clampVista(bx, -halfSize, halfSize),
      centerZ + clampVista(bz, -halfSize, halfSize)
    );
    innerHeight[col] = sampled ?? sampleAzimuthArray(profile.edgeHeightMetres, az);
  }

  // Evaluate neighboring mountain height at any relative (x, z) outside the inner square
  const sampleFoothillRelief = (x: number, z: number): number => {
    const wx = x + 310 * noise.vnoise2(x / 1700 + 1.3, z / 1700 + 4.7, 60);
    const wz = z + 310 * noise.vnoise2(x / 1700 + 8.2, z / 1700 + 2.1, 61);
    const r0 = 1 - Math.abs(noise.vnoise2(wx / 1450, wz / 1450, 70));
    const r1 = 1 - Math.abs(noise.vnoise2(wx / 620 + 5.2, wz / 620 + 1.9, 71));
    const r2 = 1 - Math.abs(noise.vnoise2(wx / 260 + 9.4, wz / 260 + 3.1, 72));
    const peak = r0 * r0 * 0.55 + r0 * r1 * r1 * 0.32 + r0 * r1 * r2 * r2 * 0.13;
    return peak * peak * (2.2 - 1.2 * peak);
  };

  const evaluateSkirtHeightAndWeight = (
    relX: number,
    relZ: number,
    sNormalized: number,
    seamHeight: number,
    az: number
  ): { y: number; mountainWeight: number } => {
    const effectiveSeamHeight = seamHeight < SEED_WORLD_SEA_LEVEL_METRES ? SEED_WORLD_SEA_LEVEL_METRES : seamHeight;
    if (sNormalized <= 0) {
      return {
        y: effectiveSeamHeight,
        mountainWeight: clampVista((effectiveSeamHeight - 16) / 140, 0, 1)
      };
    }

    const azEnergy = sampleAzimuthArray(profile.mountainEnergy, az);
    // Natural meandering fjord/bay shoreline outside the island: submerged seabed shelf from s = 0..coastStart,
    // staying below the Y=0 ocean surface before rising into surrounding neighboring mountains.
    const coastWarp =
      0.11 * noise.vnoise2(relX / 1350 + 2.1, relZ / 1350 - 3.4, 51) +
      0.05 * noise.vnoise2(relX / 540 - 7.3, relZ / 540 + 1.8, 52);
    const inlandBridge = smoothVista(18.0, 65.0, effectiveSeamHeight);
    const coastStart = lerpVista(clampVista(0.24 + coastWarp, 0.14, 0.36), 0.0, inlandBridge);
    if (sNormalized <= coastStart) {
      const shelfY = lerpVista(
        effectiveSeamHeight,
        SEED_WORLD_SEA_LEVEL_METRES,
        smoothVista(0.0, Math.max(0.03, coastStart * 0.25), sNormalized)
      );
      return { y: shelfY, mountainWeight: 0 };
    }

    const landProgress = clampVista((sNormalized - coastStart) / Math.max(0.15, 1 - coastStart), 0, 1);
    const radialBlend = smoothVista(0.0, 0.25, landProgress);
    const farRiseEnvelope = smoothVista(0.02, 0.62, landProgress) * (1 - 0.22 * smoothVista(0.82, 1.0, landProgress));

    // Pass/fjord valleys between major outer massifs
    const passWave = Math.abs(noise.vnoise2(relX / 2400 + 9.2, relZ / 2400 - 4.1, 64));
    const massifGate = 0.32 + 0.68 * smoothVista(0.08, 0.42, passWave);
    const energy = (0.72 + 0.55 * azEnergy) * massifGate;

    const macroRise =
      energy *
      farRiseEnvelope *
      (210 + 580 * sampleFoothillRelief(relX, relZ) + 55 * noise.vnoise2(relX / 820, relZ / 820, 74));

    const eps = 36;
    const rPlusX = sampleFoothillRelief(relX + eps, relZ);
    const rMinusX = sampleFoothillRelief(relX - eps, relZ);
    const rPlusZ = sampleFoothillRelief(relX, relZ + eps);
    const rMinusZ = sampleFoothillRelief(relX, relZ - eps);
    const gx = ((rPlusX - rMinusX) / (2 * eps)) * 420 * energy + (relX / Math.max(400, Math.hypot(relX, relZ))) * 0.45;
    const gz = ((rPlusZ - rMinusZ) / (2 * eps)) * 420 * energy + (relZ / Math.max(400, Math.hypot(relX, relZ))) * 0.45;
    const sl = Math.hypot(gx, gz);
    const K = 1.7 * Math.min(1, 1.4 / (sl + 1e-6));
    const dx = gz * K;
    const dz = -gx * K;

    // 4-octave cascaded slope-perpendicular tributary gullies
    sampleVistaGullyWave(relX / 720 + 3.9, relZ / 720 + 8.2, dx, dz, 1213, noise.key, gullyScratch);
    const m = clampVista(farRiseEnvelope * energy * 1.25, 0, 1);
    let g = 54 * m * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * gullyScratch[0])));
    let ex = gullyScratch[1] * 0.5;
    let ez = gullyScratch[2] * 0.5;

    sampleVistaGullyWave(relX / 270, relZ / 270, dx + ez * 1.4, dz - ex * 1.4, 911, noise.key, gullyScratch);
    g += 22 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * gullyScratch[0])));
    ex += gullyScratch[1];
    ez += gullyScratch[2];

    sampleVistaGullyWave(
      relX / 128 + 17.3,
      relZ / 128 - 5.1,
      dx + ez * 1.4,
      dz - ex * 1.4,
      577,
      noise.key,
      gullyScratch
    );
    g += 10 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * gullyScratch[0])));

    const gullyOffset = radialBlend * smoothVista(0.15, 0.65, sl) * (0.35 + 0.65 * m) * g;

    const baseElevation = lerpVista(
      SEED_WORLD_SEA_LEVEL_METRES,
      lerpVista(effectiveSeamHeight, Math.max(18, effectiveSeamHeight * 0.65), smoothVista(0.0, 0.4, landProgress)),
      inlandBridge
    );
    let h = baseElevation + macroRise + gullyOffset;

    // 3D folded rock strata benches on elevated mountain walls
    const mw = clampVista(lerpVista(clampVista((effectiveSeamHeight - 16) / 140, 0, 1), m, radialBlend), 0, 1);
    if (mw > 0.04) {
      const t = evaluateVistaStrata(relX, h, relZ, 64, 1.0);
      const ft = Math.floor(t);
      const fr = t - ft;
      const kBench =
        mw *
        radialBlend *
        (0.12 +
          0.72 *
            smoothVista(
              -0.3,
              0.3,
              noise.vnoise2((relX + relZ) / 260 + ft * 3.31, (relX - relZ) / 700 + ft * 1.73, 79)
            ));
      h += (smoothVista(0.22, 0.78, fr) - fr) * 58 * kBench;
    }

    return { y: Math.max(SEED_WORLD_SEA_LEVEL_METRES, h), mountainWeight: mw };
  };

  const vertexCount = angularColumns * radialRings;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const channels = new Float32Array(vertexCount * 4);
  const slopes = new Float32Array(vertexCount * 2);
  const gridHeights = new Float32Array(vertexCount);
  const gridWeights = new Float32Array(vertexCount);

  for (let r = 0; r < radialRings; r++) {
    // r === 0: vertical skirt lip below seam; r === 1: exact seam (s = 0); r > 1: s in (0..1]
    const s = r <= 1 ? 0 : Math.pow((r - 1) / (radialRings - 2), 1.35);
    const roundness = smoothVista(0.0, 0.65, s);

    for (let c = 0; c < angularColumns; c++) {
      const [bx, bz] = innerXZ[c]!;
      const az = innerAz[c]!;
      const seamH = innerHeight[c]!;
      const innerR = Math.hypot(bx, bz);
      const targetR = lerpVista(innerR, outerRadius, s);

      // Morph smoothly from square perimeter direction to circular azimuth direction
      const sqDirX = bx / innerR;
      const sqDirZ = bz / innerR;
      const cirDirX = Math.sin(az);
      const cirDirZ = -Math.cos(az);
      let dirX = lerpVista(sqDirX, cirDirX, roundness);
      let dirZ = lerpVista(sqDirZ, cirDirZ, roundness);
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      dirX /= dirLen;
      dirZ /= dirLen;

      const relX = r <= 1 ? bx : dirX * targetR;
      const relZ = r <= 1 ? bz : dirZ * targetR;

      const evalResult = evaluateSkirtHeightAndWeight(relX, relZ, s, seamH, az);
      const effectiveSeamY = seamH < SEED_WORLD_SEA_LEVEL_METRES ? SEED_WORLD_SEA_LEVEL_METRES : seamH - 0.18;
      const wy = r === 0 ? Math.min(seamH, effectiveSeamY) - 22 : r === 1 ? effectiveSeamY : evalResult.y;

      const idx = r * angularColumns + c;
      const p3 = idx * 3;
      positions[p3] = centerX + relX;
      positions[p3 + 1] = wy;
      positions[p3 + 2] = centerZ + relZ;
      gridHeights[idx] = wy;
      gridWeights[idx] = evalResult.mountainWeight;
    }
  }

  // Compute central-difference normals, slopes, Laplacian concavity, cavity AO, and horizon shadow tangent
  const sunAz = options.sunAzimuthRadians ?? 2.45;
  const sunDirX = Math.sin(sunAz);
  const sunDirZ = -Math.cos(sunAz);

  for (let r = 0; r < radialRings; r++) {
    const rPrev = Math.max(1, r - 1);
    const rNext = Math.min(radialRings - 1, r + 1);
    for (let c = 0; c < angularColumns; c++) {
      const cPrev = (c - 1 + angularColumns) % angularColumns;
      const cNext = (c + 1) % angularColumns;
      const idx = r * angularColumns + c;

      const idxL = r * angularColumns + cPrev;
      const idxR = r * angularColumns + cNext;
      const idxD = rPrev * angularColumns + c;
      const idxU = rNext * angularColumns + c;

      const dAx = positions[idxR * 3]! - positions[idxL * 3]!;
      const dAy = positions[idxR * 3 + 1]! - positions[idxL * 3 + 1]!;
      const dAz = positions[idxR * 3 + 2]! - positions[idxL * 3 + 2]!;

      const dRx = positions[idxU * 3]! - positions[idxD * 3]!;
      const dRy = positions[idxU * 3 + 1]! - positions[idxD * 3 + 1]!;
      const dRz = positions[idxU * 3 + 2]! - positions[idxD * 3 + 2]!;

      // Cross product (radial × angular) pointing upward (+Y)
      let nx = dRy * dAz - dRz * dAy;
      let ny = dRz * dAx - dRx * dAz;
      let nz = dRx * dAy - dRy * dAx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;

      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;

      const invNy = 1 / Math.max(0.18, ny);
      const sx = -nx * invNy;
      const sz = -nz * invNy;
      slopes[idx * 2] = sx;
      slopes[idx * 2 + 1] = sz;

      const hc = gridHeights[idx]!;
      const hMean = 0.25 * (gridHeights[idxL]! + gridHeights[idxR]! + gridHeights[idxD]! + gridHeights[idxU]!);
      const stepScale = Math.max(18, Math.hypot(dAx, dAz) * 0.5);
      const conc = clampVista(((hMean - hc) / stepScale) * 9.5, -1.1, 1.3);
      const mw = gridWeights[idx]!;
      const ao = clampVista(1 - 0.44 * clampVista(conc, -0.4, 0.65) * Math.min(1, mw * 3.0), 0.35, 1.2);
      const sunFacingSlope = sx * sunDirX + sz * sunDirZ;
      const hz = clampVista(-sunFacingSlope * 0.45 + Math.max(0, conc) * 0.14, -0.25, 0.85);

      const c4 = idx * 4;
      channels[c4] = mw;
      channels[c4 + 1] = conc;
      channels[c4 + 2] = ao;
      channels[c4 + 3] = hz;
    }
  }

  const quadCount = angularColumns * (radialRings - 1);
  const indices = new Uint32Array(quadCount * 6);
  let ptr = 0;
  for (let r = 0; r < radialRings - 1; r++) {
    for (let c = 0; c < angularColumns; c++) {
      const cNext = (c + 1) % angularColumns;
      const i00 = r * angularColumns + c;
      const i10 = r * angularColumns + cNext;
      const i01 = (r + 1) * angularColumns + c;
      const i11 = (r + 1) * angularColumns + cNext;
      indices[ptr++] = i00;
      indices[ptr++] = i01;
      indices[ptr++] = i10;
      indices[ptr++] = i10;
      indices[ptr++] = i01;
      indices[ptr++] = i11;
    }
  }

  return {
    angularColumns,
    radialRings,
    positions,
    normals,
    channels,
    slopes,
    indices
  };
}
