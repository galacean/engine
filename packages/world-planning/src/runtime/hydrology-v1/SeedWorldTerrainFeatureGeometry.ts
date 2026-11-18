import { roundTiesToEven } from "@galacean/engine-water/world/WaterMetricEncodingV1";
import { sampleSeedWorldHillAtomDeltaMetres } from "../../world/SeedWorldHillAtom.ts";
import type { SeedWorldTerrainPatchShapeV1 } from "../../world/SeedWorldWorldEdit.ts";

export interface SeedWorldTerrainPatchOffsetBoundsV1 {
  readonly minimumXOffsetMillimetres: number;
  readonly minimumZOffsetMillimetres: number;
  readonly maximumXOffsetMillimetres: number;
  readonly maximumZOffsetMillimetres: number;
}

/** Samples every persistent Terrain Patch shape from one deterministic implementation. */
export function sampleSeedWorldTerrainPatchShapeDeltaMillimetresV1(
  shape: Readonly<SeedWorldTerrainPatchShapeV1>,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number
): number {
  if (shape.kind === "radial-height") {
    const distance = Math.hypot(
      xOffsetMillimetres - shape.centerXOffsetMillimetres,
      zOffsetMillimetres - shape.centerZOffsetMillimetres
    );
    if (distance >= shape.radiusMillimetres) return 0;
    const normalizedDistance = distance / shape.radiusMillimetres;
    const weight = normalizedDistance <= 0.5 ? 1 : smooth01((1 - normalizedDistance) * 2);
    return roundTiesToEven(shape.heightDeltaMillimetres * weight, "radialTerrainPatchDelta");
  }
  if (shape.kind === "rect-height") {
    if (
      xOffsetMillimetres < shape.minXOffsetMillimetres ||
      zOffsetMillimetres < shape.minZOffsetMillimetres ||
      xOffsetMillimetres >= shape.maxXOffsetMillimetres ||
      zOffsetMillimetres >= shape.maxZOffsetMillimetres
    ) {
      return 0;
    }
    if (shape.edgeFeatherMillimetres === 0) return shape.heightDeltaMillimetres;
    const edgeDistance = Math.min(
      xOffsetMillimetres - shape.minXOffsetMillimetres,
      shape.maxXOffsetMillimetres - xOffsetMillimetres,
      zOffsetMillimetres - shape.minZOffsetMillimetres,
      shape.maxZOffsetMillimetres - zOffsetMillimetres
    );
    return roundTiesToEven(
      shape.heightDeltaMillimetres * smooth01(Math.min(1, edgeDistance / shape.edgeFeatherMillimetres)),
      "rectTerrainPatchDelta"
    );
  }
  if (shape.kind === "radial-water-basin") {
    const profile = sampleSeedWorldWaterBasinProfileV1(shape, xOffsetMillimetres, zOffsetMillimetres);
    if (profile === 0) return 0;
    return roundTiesToEven(-shape.depthMillimetres * profile, "waterBasinTerrainDelta");
  }
  if (shape.kind === "compact-cosine-hill") {
    return roundTiesToEven(
      sampleSeedWorldHillAtomDeltaMetres(
        {
          pedestalLiftMetres: shape.pedestalLiftMillimetres / 1_000,
          influenceMajorRadiusMetres: shape.influenceMajorRadiusMillimetres / 1_000,
          influenceMinorRadiusMetres: shape.influenceMinorRadiusMillimetres / 1_000,
          peakReliefMetres: shape.peakReliefMillimetres / 1_000,
          bodyMajorRadiusMetres: shape.bodyMajorRadiusMillimetres / 1_000,
          bodyMinorRadiusMetres: shape.bodyMinorRadiusMillimetres / 1_000
        },
        shape.headingMilliDegrees / 1_000,
        (xOffsetMillimetres - shape.centerXOffsetMillimetres) / 1_000,
        (zOffsetMillimetres - shape.centerZOffsetMillimetres) / 1_000
      ) * 1_000,
      "compactCosineHillDelta"
    );
  }
  return sampleProceduralLandformDelta(shape, xOffsetMillimetres, zOffsetMillimetres);
}

/** Normalized basin depth profile: one at the deepest interior and zero outside the irregular shore. */
export function sampleSeedWorldWaterBasinProfileV1(
  shape: Readonly<Extract<SeedWorldTerrainPatchShapeV1, { kind: "radial-water-basin" }>>,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number
): number {
  const dx = xOffsetMillimetres - shape.centerXOffsetMillimetres;
  const dz = zOffsetMillimetres - shape.centerZOffsetMillimetres;
  const xMetres = dx / 1_000;
  const zMetres = dz / 1_000;
  const radiusMetres = shape.radiusMillimetres / 1_000;
  const irregularity = shape.shorelineIrregularityPermille / 1_000;
  const angle = Math.atan2(zMetres, xMetres);
  const angular =
    Math.sin(angle * 3 + seededPhase(shape.seed, 1)) * 0.55 +
    Math.sin(angle * 5 + seededPhase(shape.seed, 2)) * 0.3 +
    Math.sin(angle * 9 + seededPhase(shape.seed, 3)) * 0.15;
  const broadNoise = valueNoise2(
    xMetres / Math.max(8, radiusMetres * 0.35),
    zMetres / Math.max(8, radiusMetres * 0.35),
    shape.seed
  );
  const localRadius = radiusMetres * (1 + irregularity * (angular * 0.18 + broadNoise * 0.1));
  const normalizedDistance = Math.hypot(xMetres, zMetres) / Math.max(0.001, localRadius);
  if (normalizedDistance >= 1) return 0;
  const interior = smooth01(1 - normalizedDistance);
  return Math.pow(interior, shape.featureKind === "pond" ? 1.15 : 0.9);
}

export function seedWorldTerrainPatchShapeOffsetBoundsV1(
  shape: Readonly<SeedWorldTerrainPatchShapeV1>
): Readonly<SeedWorldTerrainPatchOffsetBoundsV1> {
  if (shape.kind === "rect-height") {
    return Object.freeze({
      minimumXOffsetMillimetres: shape.minXOffsetMillimetres,
      minimumZOffsetMillimetres: shape.minZOffsetMillimetres,
      maximumXOffsetMillimetres: shape.maxXOffsetMillimetres,
      maximumZOffsetMillimetres: shape.maxZOffsetMillimetres
    });
  }
  if (shape.kind === "radial-height" || shape.kind === "radial-water-basin") {
    const padding =
      shape.kind === "radial-water-basin"
        ? Math.round(shape.radiusMillimetres * (1 + shape.shorelineIrregularityPermille / 4_000))
        : shape.radiusMillimetres;
    return radialOffsetBounds(shape.centerXOffsetMillimetres, shape.centerZOffsetMillimetres, padding);
  }
  if (shape.kind === "compact-cosine-hill") {
    return radialOffsetBounds(
      shape.centerXOffsetMillimetres,
      shape.centerZOffsetMillimetres,
      shape.influenceMajorRadiusMillimetres
    );
  }
  const halfLength = shape.lengthMillimetres * 0.5;
  const halfWidth = shape.widthMillimetres * 0.5;
  const conservativeRadius = Math.ceil(Math.hypot(halfLength, halfWidth) * 1.15);
  return radialOffsetBounds(shape.centerXOffsetMillimetres, shape.centerZOffsetMillimetres, conservativeRadius);
}

function sampleProceduralLandformDelta(
  shape: Readonly<Extract<SeedWorldTerrainPatchShapeV1, { kind: "procedural-landform" }>>,
  xOffsetMillimetres: number,
  zOffsetMillimetres: number
): number {
  const dx = (xOffsetMillimetres - shape.centerXOffsetMillimetres) / 1_000;
  const dz = (zOffsetMillimetres - shape.centerZOffsetMillimetres) / 1_000;
  const heading = (shape.headingMilliDegrees / 180_000) * Math.PI;
  const forwardX = Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const halfLength = shape.lengthMillimetres / 2_000;
  const halfWidth = shape.widthMillimetres / 2_000;
  let along = (dx * forwardX + dz * forwardZ) / Math.max(0.001, halfLength);
  let across = (dx * rightX + dz * rightZ) / Math.max(0.001, halfWidth);
  const asymmetry = shape.asymmetryPermille / 1_000;
  const lowNoise = valueNoise2(dx / Math.max(10, halfWidth * 0.55), dz / Math.max(10, halfLength * 0.55), shape.seed);
  across -= asymmetry * 0.22 * (Math.sin(along * Math.PI * 1.5 + seededPhase(shape.seed, 4)) + lowNoise * 0.6);
  along -= asymmetry * lowNoise * 0.12;
  const radialDistance = Math.hypot(across, along);
  const longitudinalFade = smooth01(1 - Math.abs(along));
  const sharpness = shape.sharpnessPermille / 1_000;
  let profile: number;
  switch (shape.featureKind) {
    case "mountain":
    case "hill":
    case "basin": {
      if (radialDistance >= 1) return 0;
      profile = Math.pow(smooth01(1 - radialDistance), 0.65 + sharpness * 2.7);
      break;
    }
    case "plateau": {
      if (radialDistance >= 1) return 0;
      const edgeWidth = 0.12 + (1 - sharpness) * 0.32;
      profile = smooth01(Math.min(1, (1 - radialDistance) / edgeWidth));
      break;
    }
    case "ridge":
    case "canyon":
    case "valley": {
      if (Math.abs(along) >= 1 || Math.abs(across) >= 1) return 0;
      const crossPower = shape.featureKind === "valley" ? 0.7 + sharpness * 1.1 : 1.1 + sharpness * 3.2;
      profile = Math.pow(smooth01(1 - Math.abs(across)), crossPower) * longitudinalFade;
      break;
    }
    case "slope": {
      if (Math.abs(along) >= 1 || Math.abs(across) >= 1) return 0;
      const sideFade = smooth01(1 - Math.abs(across));
      const endFade = smooth01(Math.min(1, (1 - Math.abs(along)) / 0.15));
      profile = (along + 1) * 0.5 * sideFade * endFade;
      break;
    }
  }
  const roughness = shape.roughnessPermille / 1_000;
  const erosion = shape.erosionPermille / 1_000;
  const detailNoise = fractalNoise2(dx / 14, dz / 14, shape.seed ^ 0x9e3779b9);
  const erosionNoise = Math.abs(fractalNoise2(dx / 28, dz / 28, shape.seed ^ 0x85ebca6b));
  const roughened = profile * (1 + detailNoise * roughness * 0.32);
  const eroded = Math.max(0, roughened - erosionNoise * erosion * profile * 0.18);
  return roundTiesToEven(shape.elevationDeltaMillimetres * eroded, "proceduralLandformDelta");
}

function radialOffsetBounds(centerX: number, centerZ: number, radius: number): SeedWorldTerrainPatchOffsetBoundsV1 {
  return Object.freeze({
    minimumXOffsetMillimetres: Math.max(0, centerX - radius),
    minimumZOffsetMillimetres: Math.max(0, centerZ - radius),
    maximumXOffsetMillimetres: centerX + radius,
    maximumZOffsetMillimetres: centerZ + radius
  });
}

function smooth01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function fractalNoise2(x: number, z: number, seed: number): number {
  return (
    valueNoise2(x, z, seed) * 0.58 +
    valueNoise2(x * 2.03, z * 2.03, seed ^ 0x27d4eb2d) * 0.29 +
    valueNoise2(x * 4.11, z * 4.11, seed ^ 0x165667b1) * 0.13
  );
}

function valueNoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth01(x - x0);
  const tz = smooth01(z - z0);
  const a = hashNoise(x0, z0, seed);
  const b = hashNoise(x0 + 1, z0, seed);
  const c = hashNoise(x0, z0 + 1, seed);
  const d = hashNoise(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function hashNoise(x: number, z: number, seed: number): number {
  let hash = (Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495) ^ seed) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return (hash / 0xffff_ffff) * 2 - 1;
}

function seededPhase(seed: number, salt: number): number {
  return (hashNoise(salt, salt * 17, seed) + 1) * 0.5 * Math.PI * 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
