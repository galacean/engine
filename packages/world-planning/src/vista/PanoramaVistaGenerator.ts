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
 * 360° azimuthal boundary profile extracted from a finite world (such as SeedWorld's 3,072 m × 3,072 m domain).
 * Azimuth `az = atan2(x - worldCenterX, -(z - worldCenterZ))` spans `[-π, +π)` across `bins` uniformly spaced samples.
 */
export interface PanoramaVistaBoundaryProfile {
  readonly bins: number;
  readonly worldHalfSizeMetres: number;
  readonly worldCenterX: number;
  readonly worldCenterZ: number;
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
 * Samples terrain around the world boundary to guide the distant panorama.
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
   * - `G`: reserved
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

      const worldElev = h0 + observerAlt + 0.0786 * rr * rr;
      const rock = smoothVista(0.88, 0.68, il + (vn(x * 0.42 + 5, z * 0.42) - 0.5) * 0.16);
      const normElev = clampVista((worldElev - 80) / 2200, 0, 1);

      const o = (k * width + c) * 4;
      farA[o] = clampVista(Math.round(127.5 + 127.5 * gx * il), 0, 255);
      farA[o + 1] = clampVista(Math.round(127.5 + 127.5 * il), 0, 255);
      farA[o + 2] = clampVista(Math.round(127.5 + 127.5 * gz * il), 0, 255);
      farA[o + 3] = clampVista(Math.round(255 * (k === ks ? cov : 1)), 0, 255);

      farB[o] = clampVista(Math.round((255 * Math.log(rr / minDistanceKm)) / logRatio), 0, 255);
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
