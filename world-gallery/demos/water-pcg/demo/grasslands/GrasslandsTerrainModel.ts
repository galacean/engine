import type { GrasslandsTerrainCrossSection, GrasslandsTerrainRecipe } from "./GrasslandsPcgTypes";

export interface GrasslandsTerrainProfile {
  readonly centerX: number;
  readonly leftHalfWidth: number;
  readonly rightHalfWidth: number;
  readonly bedDepth: number;
  readonly leftShoreX: number;
  readonly rightShoreX: number;
}

const TERRAIN_BANK_HEIGHT = 1.3;
const TERRAIN_BANK_SLOPE = 0.55;
const TERRAIN_BED_SHOULDER_START = 0.55;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const weight = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return weight * weight * (3 - 2 * weight);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, weight: number): number {
  const weight2 = weight * weight;
  const weight3 = weight2 * weight;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * weight + (2 * p0 - 5 * p1 + 4 * p2 - p3) * weight2 + (-p0 + 3 * p1 - 3 * p2 + p3) * weight3)
  );
}

function interpolateProperty(
  crossSections: readonly GrasslandsTerrainCrossSection[],
  startIndex: number,
  weight: number,
  read: (crossSection: GrasslandsTerrainCrossSection) => number,
  minimum: number
): number {
  const p0 = read(crossSections[Math.max(0, startIndex - 1)]);
  const p1 = read(crossSections[startIndex]);
  const p2 = read(crossSections[startIndex + 1]);
  const p3 = read(crossSections[Math.min(crossSections.length - 1, startIndex + 2)]);
  const interpolated = catmullRom(p0, p1, p2, p3, weight);
  return Math.max(minimum, clamp(interpolated, Math.min(p0, p1, p2, p3), Math.max(p0, p1, p2, p3)));
}

export function sampleGrasslandsTerrainProfile(terrain: GrasslandsTerrainRecipe, z: number): GrasslandsTerrainProfile {
  if (!Number.isFinite(z)) {
    throw new TypeError("Grasslands terrain Z coordinate must be finite.");
  }
  const crossSections = terrain.crossSections;
  if (crossSections.length < 2) {
    throw new Error("Grasslands terrain requires at least two analytic cross sections.");
  }
  const first = crossSections[0];
  const last = crossSections[crossSections.length - 1];
  let startIndex = 0;
  let weight = 0;
  if (z >= last.centerXZ[1]) {
    startIndex = crossSections.length - 2;
    weight = 1;
  } else if (z > first.centerXZ[1]) {
    for (let index = 0; index < crossSections.length - 1; index++) {
      const startZ = crossSections[index].centerXZ[1];
      const endZ = crossSections[index + 1].centerXZ[1];
      if (!(endZ > startZ)) {
        throw new Error("Grasslands terrain cross sections must be ordered by increasing Z.");
      }
      if (z <= endZ) {
        startIndex = index;
        weight = (z - startZ) / (endZ - startZ);
        break;
      }
    }
  }

  const centerX = interpolateProperty(crossSections, startIndex, weight, (section) => section.centerXZ[0], -Infinity);
  const leftHalfWidth = interpolateProperty(
    crossSections,
    startIndex,
    weight,
    (section) => section.leftHalfWidth,
    terrain.sampling.sandBandWidth * 2
  );
  const rightHalfWidth = interpolateProperty(
    crossSections,
    startIndex,
    weight,
    (section) => section.rightHalfWidth,
    terrain.sampling.sandBandWidth * 2
  );
  const bedDepth = Math.min(
    -terrain.minimumTerrainBedHeight,
    interpolateProperty(crossSections, startIndex, weight, (section) => section.bedDepth, 0.05)
  );
  return Object.freeze({
    centerX,
    leftHalfWidth,
    rightHalfWidth,
    bedDepth,
    leftShoreX: centerX - leftHalfWidth,
    rightShoreX: centerX + rightHalfWidth
  });
}

/**
 * Samples the one authoritative analytic ground surface used for both the
 * underwater bed and opaque banks. The shore curves are exact zero crossings.
 */
export function sampleGrasslandsTerrainModelHeight(terrain: GrasslandsTerrainRecipe, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("Grasslands terrain coordinates must be finite.");
  }
  const profile = sampleGrasslandsTerrainProfile(terrain, z);
  if (x < profile.leftShoreX) {
    return Math.min(TERRAIN_BANK_HEIGHT, (profile.leftShoreX - x) * TERRAIN_BANK_SLOPE);
  }
  if (x > profile.rightShoreX) {
    return Math.min(TERRAIN_BANK_HEIGHT, (x - profile.rightShoreX) * TERRAIN_BANK_SLOPE);
  }

  const halfWidth = x < profile.centerX ? profile.leftHalfWidth : profile.rightHalfWidth;
  const normalizedDistance = Math.abs(x - profile.centerX) / halfWidth;
  if (normalizedDistance >= 1) return 0;
  const shoulder = smoothstep(TERRAIN_BED_SHOULDER_START, 1, normalizedDistance);
  return Math.max(terrain.minimumTerrainBedHeight, -profile.bedDepth * (1 - shoulder));
}
