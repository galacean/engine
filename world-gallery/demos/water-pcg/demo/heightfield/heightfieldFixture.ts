import { HeightfieldWaterSchemaVersion } from "../../authoring/heightfield/HeightfieldWaterEnums";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";

export const HEIGHTFIELD_FIXTURE_SIZE = {
  width: 192,
  height: 128,
  cellSize: 1
} as const;

export const HEIGHTFIELD_FIXTURE_LANDMARKS = {
  islandCenter: [-8, 8] as const,
  islandRadius: [4.5, 7] as const,
  pondCenter: [58, -24] as const,
  pondRadius: [15, 11] as const
} as const;

const ISLAND_FLOW_INFLUENCE_RADIUS = 2.15;
const ISLAND_FLOW_TANGENT_WEIGHT = 0.84;
const ISLAND_FLOW_SPEED_BOOST = 0.16;

export interface HeightfieldFixtureStats {
  readonly wetTexelCount: number;
  readonly mainBodyTexelCount: number;
  readonly pondTexelCount: number;
  readonly islandDryTexelCount: number;
  readonly minSurfaceHeight: number;
  readonly maxSurfaceHeight: number;
  readonly minBedDepth: number;
  readonly maxBedDepth: number;
  readonly flowingTexelCount: number;
  readonly stillTexelCount: number;
}

export interface HeightfieldWaterFixture {
  readonly descriptor: HeightfieldWaterDescriptorV1;
  readonly stats: HeightfieldFixtureStats;
}

interface WetSample {
  readonly kind: "main" | "pond";
  readonly surfaceHeight: number;
  readonly bedHeight: number;
  readonly flowX: number;
  readonly flowZ: number;
}

function getMainCenterX(z: number): number {
  return -23 + 26 * Math.sin((z + 7) / 24);
}

function getMainHalfWidth(z: number): number {
  return 11 + 3.5 * Math.cos((z - 6) / 19);
}

function isInsideIsland(x: number, z: number): boolean {
  const [centerX, centerZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.islandCenter;
  const [radiusX, radiusZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.islandRadius;
  const normalizedX = (x - centerX) / radiusX;
  const normalizedZ = (z - centerZ) / radiusZ;
  return normalizedX * normalizedX + normalizedZ * normalizedZ < 1;
}

function deflectFlowAroundIsland(
  x: number,
  z: number,
  baseDirectionX: number,
  baseDirectionZ: number,
  flowSpeed: number
): readonly [number, number] {
  const [centerX, centerZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.islandCenter;
  const [radiusX, radiusZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.islandRadius;
  const normalizedX = (x - centerX) / radiusX;
  const normalizedZ = (z - centerZ) / radiusZ;
  const normalizedRadius = Math.hypot(normalizedX, normalizedZ);
  if (normalizedRadius >= ISLAND_FLOW_INFLUENCE_RADIUS) {
    return [baseDirectionX * flowSpeed, baseDirectionZ * flowSpeed];
  }

  const normalXRaw = (x - centerX) / (radiusX * radiusX);
  const normalZRaw = (z - centerZ) / (radiusZ * radiusZ);
  const inverseNormalLength = 1 / Math.max(Math.hypot(normalXRaw, normalZRaw), 0.0001);
  const normalX = normalXRaw * inverseNormalLength;
  const normalZ = normalZRaw * inverseNormalLength;
  const leftBranch = x < centerX;
  const tangentX = leftBranch ? -normalZ : normalZ;
  const tangentZ = leftBranch ? normalX : -normalX;
  const influenceLinear = Math.max(
    0,
    Math.min(1, (ISLAND_FLOW_INFLUENCE_RADIUS - normalizedRadius) / (ISLAND_FLOW_INFLUENCE_RADIUS - 1))
  );
  const influence = influenceLinear * influenceLinear * (3 - influenceLinear * 2);
  const tangentWeight = influence * ISLAND_FLOW_TANGENT_WEIGHT;
  const deflectedX = baseDirectionX * (1 - tangentWeight) + tangentX * tangentWeight;
  const deflectedZ = baseDirectionZ * (1 - tangentWeight) + tangentZ * tangentWeight;
  const inverseDirectionLength = 1 / Math.max(Math.hypot(deflectedX, deflectedZ), 0.0001);
  const pressuredSpeed = flowSpeed * (1 + influence * ISLAND_FLOW_SPEED_BOOST);
  return [deflectedX * inverseDirectionLength * pressuredSpeed, deflectedZ * inverseDirectionLength * pressuredSpeed];
}

function sampleMainBody(x: number, z: number): WetSample | undefined {
  if (z < -57 || z > 57) return undefined;
  const centerX = getMainCenterX(z);
  const halfWidth = getMainHalfWidth(z);
  const across = (x - centerX) / halfWidth;
  if (Math.abs(across) > 1 || isInsideIsland(x, z)) return undefined;

  // Height is deliberately non-planar in both axes. Its low frequency keeps the
  // fixture continuous while making the base-surface curvature obvious in a 3/4 view.
  const surfaceHeight = 5.35 + (z + 57) * 0.021 + 0.72 * Math.sin((x + 18) / 23) + 0.34 * Math.cos((z - 4) / 17);
  const centerWeight = Math.pow(1 - Math.abs(across), 1.35);
  const depth = 0.38 + centerWeight * (2.65 + 0.38 * Math.sin((z + 11) / 13));
  const derivativeXByZ = (26 / 24) * Math.cos((z + 7) / 24);
  const inverseTangentLength = 1 / Math.hypot(derivativeXByZ, 1);
  const flowSpeed = 0.9 + centerWeight * 0.75;
  const [flowX, flowZ] = deflectFlowAroundIsland(
    x,
    z,
    -derivativeXByZ * inverseTangentLength,
    -inverseTangentLength,
    flowSpeed
  );

  return {
    kind: "main",
    surfaceHeight,
    bedHeight: surfaceHeight - depth,
    // Downstream runs toward -Z, following the analytic S centreline.
    flowX,
    flowZ
  };
}

function samplePond(x: number, z: number): WetSample | undefined {
  const [centerX, centerZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.pondCenter;
  const [radiusX, radiusZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.pondRadius;
  const normalizedX = (x - centerX) / radiusX;
  const normalizedZ = (z - centerZ) / radiusZ;
  const radiusSquared = normalizedX * normalizedX + normalizedZ * normalizedZ;
  if (radiusSquared > 1) return undefined;

  const surfaceHeight = 7.2 + 0.16 * radiusSquared;
  const depth = 0.36 + 2.35 * Math.pow(1 - radiusSquared, 1.25);
  return {
    kind: "pond",
    surfaceHeight,
    bedHeight: surfaceHeight - depth,
    flowX: 0,
    flowZ: 0
  };
}

/** Builds the deterministic authoring fixture used by the standalone heightfield demo and tests. */
export function createHeightfieldWaterFixture(
  quality: WaterQualityTier = WaterQualityTier.Medium
): HeightfieldWaterFixture {
  const { width, height, cellSize } = HEIGHTFIELD_FIXTURE_SIZE;
  const originXZ = [-(width - 1) * cellSize * 0.5, -(height - 1) * cellSize * 0.5] as const;
  const wetTexelIndices: number[] = [];
  const surfaceHeights: number[] = [];
  const bedHeights: number[] = [];
  const flowVectorsXZ: number[] = [];
  let mainBodyTexelCount = 0;
  let pondTexelCount = 0;
  let islandDryTexelCount = 0;
  let minSurfaceHeight = Number.POSITIVE_INFINITY;
  let maxSurfaceHeight = Number.NEGATIVE_INFINITY;
  let minBedDepth = Number.POSITIVE_INFINITY;
  let maxBedDepth = Number.NEGATIVE_INFINITY;
  let flowingTexelCount = 0;
  let stillTexelCount = 0;

  for (let row = 0; row < height; row++) {
    const z = originXZ[1] + row * cellSize;
    for (let column = 0; column < width; column++) {
      const x = originXZ[0] + column * cellSize;
      const mainSample = sampleMainBody(x, z);
      const sample = mainSample ?? samplePond(x, z);
      if (!sample) {
        if (isInsideIsland(x, z) && Math.abs(x - getMainCenterX(z)) <= getMainHalfWidth(z)) {
          islandDryTexelCount++;
        }
        continue;
      }

      wetTexelIndices.push(row * width + column);
      surfaceHeights.push(sample.surfaceHeight);
      bedHeights.push(sample.bedHeight);
      flowVectorsXZ.push(sample.flowX, sample.flowZ);
      if (sample.kind === "main") mainBodyTexelCount++;
      else pondTexelCount++;

      const depth = sample.surfaceHeight - sample.bedHeight;
      minSurfaceHeight = Math.min(minSurfaceHeight, sample.surfaceHeight);
      maxSurfaceHeight = Math.max(maxSurfaceHeight, sample.surfaceHeight);
      minBedDepth = Math.min(minBedDepth, depth);
      maxBedDepth = Math.max(maxBedDepth, depth);
      if (Math.hypot(sample.flowX, sample.flowZ) > 0.001) flowingTexelCount++;
      else stillTexelCount++;
    }
  }

  const descriptor: HeightfieldWaterDescriptorV1 = {
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    id: "heightfield-s-curve-island-and-pond",
    grid: {
      originXZ,
      cellSizeXZ: [cellSize, cellSize],
      width,
      height
    },
    wetTexelIndices: new Uint32Array(wetTexelIndices),
    surfaceHeights: new Float32Array(surfaceHeights),
    bedHeights: new Float32Array(bedHeights),
    flowVectorsXZ: new Float32Array(flowVectorsXZ),
    waveAsset: {
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.DirectionalGerstner,
      generator: {
        waveCount: 12,
        seed: 0x45f13,
        // A river reads better with coherent, short ripples than with ocean-scale
        // swells. High still keeps all 12 bands while Medium retains the six
        // strongest macro bands and lets the material supply the fine flow detail.
        randomness: 0.64,
        minWavelength: 0.72,
        maxWavelength: 9.6,
        wavelengthFalloff: 1.18,
        minAmplitude: 0.006,
        maxAmplitude: 0.12,
        amplitudeFalloff: 1.36,
        dominantWindAngle: -1.15,
        dominantAngularSpread: 0.46,
        smallWaveSteepness: 0.12,
        largeWaveSteepness: 0.36,
        steepnessFalloff: 1.08
      }
    },
    quality,
    material: {
      // Muted glacial blue-green keeps the authored bed visible in the shallows
      // without turning the whole channel into an opaque cyan ribbon.
      shallowColor: [0.028, 0.36, 0.4, 0.7],
      deepColor: [0.004, 0.032, 0.065, 0.94],
      opacity: 0.8,
      shoreFoamWidth: 0.85,
      microNormalStrength: 0.9,
      // Macro Gerstner motion only breaks the silhouette. The scrolling dual-
      // phase flow normals provide the dominant visible movement, as in Waterways.
      waveStrength: 0.34
    }
  };

  return {
    descriptor,
    stats: {
      wetTexelCount: wetTexelIndices.length,
      mainBodyTexelCount,
      pondTexelCount,
      islandDryTexelCount,
      minSurfaceHeight,
      maxSurfaceHeight,
      minBedDepth,
      maxBedDepth,
      flowingTexelCount,
      stillTexelCount
    }
  };
}
