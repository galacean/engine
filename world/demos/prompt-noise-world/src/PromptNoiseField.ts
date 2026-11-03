import { hashPromptNoise, promptNoiseUnit } from "@galacean/engine-world-planning/generation/noise/PromptNoiseHash";
import type { PromptNoiseWaterBodyV1, PromptNoiseWorldPlanV1 } from "./PromptNoiseWorldContract.ts";

/** Complete analytic sample shared by navigation, water, surface, and placement. */
export interface PromptNoiseFieldSample {
  readonly height: number;
  readonly slope: number;
  readonly curvature: number;
  readonly moisture: number;
  readonly water: boolean;
  readonly waterBodyId?: string;
  readonly waterLevel: number;
  /** Positive inside water and negative on dry land. */
  readonly shoreSignedDistance: number;
  readonly surfaceWeights: readonly [soil: number, grass: number, rock: number, snow: number];
}

interface ValueNoiseSample {
  readonly value: number;
  readonly derivativeX: number;
  readonly derivativeZ: number;
}

interface WaterSample {
  readonly wet: boolean;
  readonly bodyId?: string;
  readonly waterLevel: number;
  readonly shoreSignedDistance: number;
  readonly bedHeight: number;
}

const HEIGHT_DERIVATIVE_STEP = 12;
const ARCHIPELAGO_CELL_SIZE = 720;
const ARCHIPELAGO_ISLANDS_PER_CELL = 3;

/** CPU authority for the infinite prompt-noise world field. */
export class TerrainAnalyticFieldProvider {
  /**
   * Creates one immutable-plan analytic evaluator.
   * @param plan Prompt, template, seed, terrain, water, and surface rules.
   */
  constructor(readonly plan: PromptNoiseWorldPlanV1) {}

  /**
   * Samples carved terrain height at an arbitrary world coordinate.
   * @param worldX Logical world X in metres.
   * @param worldZ Logical world Z in metres.
   * @returns Continuous terrain height in metres.
   */
  sampleHeight(worldX: number, worldZ: number): number {
    const rawHeight = this._sampleRawHeight(worldX, worldZ);
    return this._sampleWater(worldX, worldZ, rawHeight).bedHeight;
  }

  /**
   * Evaluates all fields required by surface, water, navigation, and decoration systems.
   * @param worldX Logical world X in metres.
   * @param worldZ Logical world Z in metres.
   * @returns Detached analytic sample with normalized four-layer weights.
   */
  sample(worldX: number, worldZ: number): PromptNoiseFieldSample {
    const height = this.sampleHeight(worldX, worldZ);
    const left = this.sampleHeight(worldX - HEIGHT_DERIVATIVE_STEP, worldZ);
    const right = this.sampleHeight(worldX + HEIGHT_DERIVATIVE_STEP, worldZ);
    const back = this.sampleHeight(worldX, worldZ - HEIGHT_DERIVATIVE_STEP);
    const front = this.sampleHeight(worldX, worldZ + HEIGHT_DERIVATIVE_STEP);
    const derivativeX = (right - left) / (HEIGHT_DERIVATIVE_STEP * 2);
    const derivativeZ = (front - back) / (HEIGHT_DERIVATIVE_STEP * 2);
    const slope = 1 - 1 / Math.sqrt(1 + derivativeX * derivativeX + derivativeZ * derivativeZ);
    const curvature = (left + right + back + front - height * 4) / (HEIGHT_DERIVATIVE_STEP ** 2);
    const moisture = clamp01(
      0.5 +
        fbm(worldX * 0.0016, worldZ * 0.0016, this.plan.stageSeeds.moisture, 4, false) * 0.42 -
        slope * 0.22
    );
    const rawHeight = this._sampleRawHeight(worldX, worldZ);
    const water = this._sampleWater(worldX, worldZ, rawHeight);
    return Object.freeze({
      height,
      slope,
      curvature,
      moisture,
      water: water.wet,
      waterBodyId: water.bodyId,
      waterLevel: water.waterLevel,
      shoreSignedDistance: water.shoreSignedDistance,
      surfaceWeights: this._surfaceWeights(height, slope, moisture, curvature)
    });
  }

  /**
   * Finds a dry walkable spawn near the template hint without changing generation state.
   * @returns World position `[x,y,z]` with the camera eye height applied.
   * @throws If no walkable sample exists in the deterministic search radius.
   */
  findSpawn(): readonly [x: number, y: number, z: number] {
    const [hintX, hintZ] = this.plan.spawnHint;
    for (let ring = 0; ring <= 24; ring++) {
      const radius = ring * 18;
      const count = Math.max(1, ring * 8);
      for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const x = hintX + Math.cos(angle) * radius;
        const z = hintZ + Math.sin(angle) * radius;
        const sample = this.sample(x, z);
        if (!sample.water && sample.slope < 0.32 && sample.height > sample.waterLevel + 1) {
          return Object.freeze([x, sample.height + 2.1, z] as const);
        }
      }
    }
    throw new Error(`Template ${this.plan.templateId} did not produce a walkable spawn`);
  }

  private _sampleRawHeight(worldX: number, worldZ: number): number {
    const terrain = this.plan.terrain;
    if (terrain.noiseProfile === "terrain3d-reference") {
      return terrain3dReferenceHeight(worldX, worldZ, terrain.terrain3dReference);
    }
    const warpX =
      fbm(worldX * terrain.frequency * 0.42, worldZ * terrain.frequency * 0.42, this.plan.stageSeeds.warp, 3, false) *
      terrain.warpStrength;
    const warpZ =
      fbm(
        worldX * terrain.frequency * 0.42 + 31.7,
        worldZ * terrain.frequency * 0.42 - 19.3,
        hashPromptNoise(this.plan.stageSeeds.warp, 91),
        3,
        false
      ) * terrain.warpStrength;
    const sampleX = (worldX + warpX) * terrain.frequency;
    const sampleZ = (worldZ + warpZ) * terrain.frequency;
    const hills = fbm(sampleX, sampleZ, this.plan.stageSeeds.height, terrain.octaves, true);
    const ridges = ridgedFbm(
      sampleX * terrain.ridgeFrequency,
      sampleZ * terrain.ridgeFrequency,
      hashPromptNoise(this.plan.stageSeeds.height, 77),
      terrain.ridgeOctaves
    );
    const bias = directionalBias(worldX, worldZ, terrain.directionalBias, terrain.directionalScale);
    const directionalRelief = 1 + bias * terrain.directionalStrength;
    let height =
      terrain.baseHeight +
      bias * terrain.directionalUplift +
      hills * terrain.relief * 0.58 * directionalRelief +
      ridges * terrain.relief * terrain.ridgeStrength * directionalRelief;
    if (terrain.archipelago) height += sampleArchipelagoHeight(worldX, worldZ, this.plan.stageSeeds.height);
    return height;
  }

  private _sampleWater(worldX: number, worldZ: number, rawHeight: number): WaterSample {
    let selected: WaterSample | undefined;
    for (const body of this.plan.water.bodies) {
      const sample = sampleBoundedWater(body, worldX, worldZ, rawHeight);
      if (sample.wet && (!selected || sample.shoreSignedDistance > selected.shoreSignedDistance)) selected = sample;
    }
    if (selected) return selected;
    if (this.plan.water.ocean) {
      const depth = this.plan.water.seaLevel - rawHeight;
      return {
        wet: depth > 0,
        bodyId: "ocean",
        waterLevel: this.plan.water.seaLevel,
        shoreSignedDistance: depth * 2,
        bedHeight: rawHeight
      };
    }
    const closestShore = this.plan.water.bodies.reduce((closest, body) => {
      const distance = boundedWaterSignedDistance(body, worldX, worldZ);
      return Math.max(closest, distance);
    }, Number.NEGATIVE_INFINITY);
    return {
      wet: false,
      waterLevel: Number.NEGATIVE_INFINITY,
      shoreSignedDistance: Number.isFinite(closestShore) ? closestShore : -1_000_000,
      bedHeight: rawHeight
    };
  }

  private _surfaceWeights(
    height: number,
    slope: number,
    moisture: number,
    curvature: number
  ): readonly [number, number, number, number] {
    const surface = this.plan.surface;
    const snow = smoothstep(surface.snowStart, surface.snowFull, height) * (1 - slope * 0.25);
    const rock = smoothstep(surface.rockSlopeStart, surface.rockSlopeFull, slope) * (1 - snow * 0.65);
    const grassHeight = 1 - smoothstep(surface.snowStart * 0.74, surface.snowStart, height);
    const grass =
      smoothstep(surface.grassMoisture - 0.24, surface.grassMoisture + 0.2, moisture) *
      (1 - smoothstep(0.18, 0.5, slope)) *
      grassHeight *
      clamp01(1 - Math.max(curvature, 0) * 0.08);
    const soil = Math.max(0.05, 1 - snow - rock - grass);
    const total = soil + grass + rock + snow;
    return Object.freeze([soil / total, grass / total, rock / total, snow / total] as const);
  }
}

function terrain3dReferenceHeight(
  worldX: number,
  worldZ: number,
  parameters: PromptNoiseWorldPlanV1["terrain"]["terrain3dReference"]
): number {
  const noiseX = ((worldX + 0.5) / 1024 + parameters.offset[0]) * parameters.scale * 0.1;
  const noiseZ = ((worldZ + 0.5) / 1024 + parameters.offset[2]) * parameters.scale * 0.1;
  return terrain3dReferenceFbm(noiseX, noiseZ, parameters.maximumOctaves) * parameters.height * 10 +
    parameters.offset[1] * 100;
}

function terrain3dReferenceFbm(x: number, z: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let derivativeX = 0;
  let derivativeZ = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const sample = terrain3dReferenceNoise(x, z);
    derivativeX += sample.derivativeX;
    derivativeZ += sample.derivativeZ;
    total += amplitude * sample.value / (1 + derivativeX * derivativeX + derivativeZ * derivativeZ);
    amplitude *= 0.5;
    const rotatedX = x * 0.8 + z * 0.6;
    const rotatedZ = x * -0.6 + z * 0.8;
    x = rotatedX * 2;
    z = rotatedZ * 2;
  }
  return total;
}

function terrain3dReferenceNoise(x: number, z: number): ValueNoiseSample {
  const fractionX = x - Math.floor(x);
  const fractionZ = z - Math.floor(z);
  const smoothX = fractionX ** 3 * (fractionX * (fractionX * 6 - 15) + 10);
  const smoothZ = fractionZ ** 3 * (fractionZ * (fractionZ * 6 - 15) + 10);
  const derivativeX = 30 * fractionX ** 2 * (fractionX - 1) ** 2;
  const derivativeZ = 30 * fractionZ ** 2 * (fractionZ - 1) ** 2;
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const a = terrain3dReferenceHash(cellX, cellZ);
  const b = terrain3dReferenceHash(cellX + 1, cellZ);
  const c = terrain3dReferenceHash(cellX, cellZ + 1);
  const d = terrain3dReferenceHash(cellX + 1, cellZ + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k3 = d - b - c + a;
  return {
    value: a + k1 * smoothX + k2 * smoothZ + k3 * smoothX * smoothZ,
    derivativeX: derivativeX * (k1 + k3 * smoothZ),
    derivativeZ: derivativeZ * (k2 + k3 * smoothX)
  };
}

function terrain3dReferenceHash(x: number, z: number): number {
  return fract(1e4 * Math.sin(17 * x + z * 0.1) * (0.1 + Math.abs(Math.sin(z * 13 + x))));
}

function sampleBoundedWater(
  body: PromptNoiseWaterBodyV1,
  worldX: number,
  worldZ: number,
  rawHeight: number
): WaterSample {
  const signedDistance = boundedWaterSignedDistance(body, worldX, worldZ);
  const wet = signedDistance > 0;
  const normalizedDepth = clamp01(signedDistance / Math.min(body.radius[0], body.radius[1]));
  const targetBed = body.waterLevel - body.depth * smoothstep(0, 0.62, normalizedDepth);
  return {
    wet,
    bodyId: body.id,
    waterLevel: body.waterLevel,
    shoreSignedDistance: signedDistance,
    bedHeight: wet ? Math.min(rawHeight, targetBed) : rawHeight
  };
}

function boundedWaterSignedDistance(
  body: PromptNoiseWaterBodyV1,
  worldX: number,
  worldZ: number
): number {
  const localX = (worldX - body.center[0]) / body.radius[0];
  const localZ = (worldZ - body.center[1]) / body.radius[1];
  const irregular =
    valueNoise(worldX * 0.021, worldZ * 0.021, body.seed).value * 2 - 1;
  const normalizedRadius = Math.hypot(localX, localZ) + irregular * body.irregularity;
  return (1 - normalizedRadius) * Math.min(body.radius[0], body.radius[1]);
}

function sampleArchipelagoHeight(worldX: number, worldZ: number, seed: number): number {
  const cellX = Math.floor(worldX / ARCHIPELAGO_CELL_SIZE);
  const cellZ = Math.floor(worldZ / ARCHIPELAGO_CELL_SIZE);
  let maximum = 0;
  for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const candidateCellX = cellX + offsetX;
      const candidateCellZ = cellZ + offsetZ;
      for (let island = 0; island < ARCHIPELAGO_ISLANDS_PER_CELL; island++) {
        const islandSeed = hashPromptNoise(seed, candidateCellX, candidateCellZ, island);
        const centerX =
          (candidateCellX + 0.16 + promptNoiseUnit(hashPromptNoise(islandSeed, 1)) * 0.68) * ARCHIPELAGO_CELL_SIZE;
        const centerZ =
          (candidateCellZ + 0.16 + promptNoiseUnit(hashPromptNoise(islandSeed, 2)) * 0.68) * ARCHIPELAGO_CELL_SIZE;
        const radiusX = 115 + promptNoiseUnit(hashPromptNoise(islandSeed, 3)) * 125;
        const radiusZ = 105 + promptNoiseUnit(hashPromptNoise(islandSeed, 4)) * 115;
        const distance = Math.hypot((worldX - centerX) / radiusX, (worldZ - centerZ) / radiusZ);
        const mask = 1 - smoothstep(0.48, 1, distance);
        const peak = 38 + promptNoiseUnit(hashPromptNoise(islandSeed, 5)) * 78;
        maximum = Math.max(maximum, mask * mask * peak);
      }
    }
  }
  return maximum;
}

function directionalBias(
  worldX: number,
  worldZ: number,
  direction: PromptNoiseWorldPlanV1["terrain"]["directionalBias"],
  scale: number
): number {
  if (direction === "north") return smoothstep(-scale, scale, worldZ);
  if (direction === "left") return 1 - smoothstep(-scale, scale, worldX);
  return 0;
}

function fbm(x: number, z: number, seed: number, octaves: number, suppressDerivatives: boolean): number {
  let total = 0;
  let amplitude = 1;
  let amplitudeTotal = 0;
  let derivativeX = 0;
  let derivativeZ = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const sample = valueNoise(x, z, hashPromptNoise(seed, octave));
    derivativeX += sample.derivativeX;
    derivativeZ += sample.derivativeZ;
    const centered = sample.value * 2 - 1;
    const suppression = suppressDerivatives ? 1 + derivativeX * derivativeX + derivativeZ * derivativeZ : 1;
    total += (amplitude * centered) / suppression;
    amplitudeTotal += amplitude;
    amplitude *= 0.5;
    const rotatedX = x * 0.8 - z * 0.6;
    const rotatedZ = x * 0.6 + z * 0.8;
    x = rotatedX * 2;
    z = rotatedZ * 2;
  }
  return total / Math.max(amplitudeTotal, Number.EPSILON);
}

function ridgedFbm(x: number, z: number, seed: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let amplitudeTotal = 0;
  for (let octave = 0; octave < Math.max(1, octaves); octave++) {
    const sample = valueNoise(x, z, hashPromptNoise(seed, octave));
    const ridge = Math.pow(1 - Math.abs(sample.value * 2 - 1), 3);
    total += ridge * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= 0.52;
    x *= 2.03;
    z *= 2.03;
  }
  return total / amplitudeTotal;
}

function valueNoise(x: number, z: number, seed: number): ValueNoiseSample {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const fractionX = x - cellX;
  const fractionZ = z - cellZ;
  const smoothX = quintic(fractionX);
  const smoothZ = quintic(fractionZ);
  const derivativeSmoothX = quinticDerivative(fractionX);
  const derivativeSmoothZ = quinticDerivative(fractionZ);
  const a = promptNoiseUnit(hashPromptNoise(seed, cellX, cellZ));
  const b = promptNoiseUnit(hashPromptNoise(seed, cellX + 1, cellZ));
  const c = promptNoiseUnit(hashPromptNoise(seed, cellX, cellZ + 1));
  const d = promptNoiseUnit(hashPromptNoise(seed, cellX + 1, cellZ + 1));
  const k0 = a;
  const k1 = b - a;
  const k2 = c - a;
  const k3 = d - b - c + a;
  return {
    value: k0 + k1 * smoothX + k2 * smoothZ + k3 * smoothX * smoothZ,
    derivativeX: derivativeSmoothX * (k1 + k3 * smoothZ),
    derivativeZ: derivativeSmoothZ * (k2 + k3 * smoothX)
  };
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function quinticDerivative(value: number): number {
  const offset = value - 1;
  return 30 * value * value * offset * offset;
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const normalized = clamp01((value - minimum) / Math.max(maximum - minimum, Number.EPSILON));
  return normalized * normalized * (3 - normalized * 2);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}
