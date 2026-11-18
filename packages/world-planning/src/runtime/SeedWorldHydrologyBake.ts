import { SEED_WORLD_HEIGHT_RANGE, seedWorldRockySlopeWeight, type SeedWorldFields } from "./SeedWorldFields.ts";
import { type SeedWorldHydrologyBodyGeometry, type SeedWorldHydrologyTopology } from "./SeedWorldHydrologyTopology.ts";
import { compileSeedWorldHydrologyBasinSignedDistanceField } from "./SeedWorldHydrologyGeometry.ts";
import { type SeedWorldPlan } from "../world/SeedWorldPlanner.ts";
import {
  rasterizeSeedWorldRiverField,
  type SeedWorldRiverCurve,
  type SeedWorldRiverCurveSample,
  type SeedWorldRiverField
} from "./SeedWorldRiverCurves.ts";
import { SEED_WORLD_MINIMUM_OWNED_WATER_DEPTH_METRES } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import { resolveSeedWorldRiparianMoisture } from "@galacean/engine-terrain/world/SeedWorldSoilMoisture";
import { resolveSeedWorldRiparianSoilWeight } from "./SeedWorldSurfaceIntent.ts";

/** Default dimensionless depth multiplier shared by basin and branch excavation. */
export const SEED_WORLD_DEFAULT_HYDROLOGY_DEPTH_SCALE = 2.2;
/**
 * Production world-space C2 transition from the complete water footprint back to untouched H0.
 * This presentation width must not reselect or resize layout-owned Lake topology.
 */
export const SEED_WORLD_DEFAULT_HYDROLOGY_BANK_SHOULDER_METRES = 64;
const MINIMUM_BED_DEPTH_METRES = 1.5;
const BASIN_BED_TRANSITION_RATIO = 0.5;
const CURVE_SAMPLE_SPACING_METRES = 2;

/** Style-only hydrology parameters that never select a different basin or branch. */
export interface SeedWorldHydrologyBakeStyle {
  /** Dimensionless multiplier applied to basin and branch depth. */
  readonly depthScale: number;
  /** World-space distance used to blend the excavated footprint back into H0. */
  readonly bankShoulderMetres: number;
}

/** Default static-basin bake style. */
export const SEED_WORLD_DEFAULT_HYDROLOGY_BAKE_STYLE = Object.freeze<SeedWorldHydrologyBakeStyle>({
  depthScale: SEED_WORLD_DEFAULT_HYDROLOGY_DEPTH_SCALE,
  bankShoulderMetres: SEED_WORLD_DEFAULT_HYDROLOGY_BANK_SHOULDER_METRES
});

/** One connected constant-Y water body baked from a style-independent topology body. */
export interface SeedWorldHydrologyWaterBody {
  /** Stable body identity inherited from topology. */
  readonly id: string;
  /** Source topology hash shared with Height, Alpha, wetness, and 2D. */
  readonly geometryHash: number;
  /** One exact world-space Y used by the whole connected body. */
  readonly waterLevelMetres: number;
  /** World-space distance that the planar surface extends underneath the dry bank. */
  readonly surfaceUnderlapMetres: number;
  /** Full-world row-major water ownership at `resolution`. */
  readonly wetMask: Uint8Array;
  /** Coverage-filtered water footprint used by the exact 2D preview. */
  readonly coverage: Uint8Array;
  /** Signed world-metre distance to this exact baked water footprint. */
  readonly signedDistanceMetres: Float32Array;
  /** Width and height of the body mask. */
  readonly resolution: number;
  /** Styled curves carrying final width, depth, flow, and bed values. */
  readonly curves: readonly SeedWorldRiverCurve[];
  /** Approximate connected surface area represented by `wetMask`. */
  readonly areaSquareMetres: number;
  /** Greatest final terrain depth below the body water datum. */
  readonly maximumDepthMetres: number;
  /** Mean final terrain depth below the body water datum. */
  readonly averageDepthMetres: number;
  /** Number of wet samples whose terrain is not below the water datum. */
  readonly terrainProtrusionCount: number;
}

/** Complete style bake consumed by Fields, 2D, Water, and population compilation. */
export interface SeedWorldHydrologyBake {
  /** Source topology; object identity may be reused by Worker cache hits. */
  readonly topology: SeedWorldHydrologyTopology;
  /** Validated style used for this bake. */
  readonly style: SeedWorldHydrologyBakeStyle;
  /** Final immutable Terrain and ecology fields. */
  readonly fields: SeedWorldFields;
  /** Constant-Y water bodies compiled from the same topology and style. */
  readonly waterBodies: readonly SeedWorldHydrologyWaterBody[];
  /** Compact evidence that changes with style or output lattice but not camera/runtime state. */
  readonly bakeHash: number;
}

/** Exact combined inland-water footprint used by the 2D planning layer. */
export interface SeedWorldHydrologyCoverageMask {
  /** Geometry identity shared with the source water bodies. */
  readonly geometryHash: number;
  /** Width and height of `wetMask`. */
  readonly resolution: number;
  /** Row-major non-zero ownership of every basin and branch surface. */
  readonly wetMask: Uint8Array;
  /** Row-major fractional coverage in `[0, 255]` from the same continuous geometry. */
  readonly coverage: Uint8Array;
}

/** Grid identity used to publish an empty optional-Lake coverage field. */
export interface SeedWorldEmptyHydrologyCoverageContract {
  /** Geometry identity of the empty topology. */
  readonly geometryHash: number;
  /** Width and height of the empty coverage field. */
  readonly resolution: number;
}

/**
 * Bakes one cached hydrology topology into Height, material, moisture, and water fields.
 * @param plan Existing semantic plan used only for dry-climate baseline and road ownership.
 * @param sourceFields River-free H0 and surface fields at the requested output quality.
 * @param topology Style-independent basin and branch geometry selected from the same H0.
 * @param style Depth and shoulder parameters that do not change topology.
 * @returns Frozen final fields and constant-Y bodies sharing one topology hash.
 * @throws {RangeError} When style, extent, seed, or source grids do not match.
 */
export function bakeSeedWorldHydrology(
  plan: SeedWorldPlan,
  sourceFields: SeedWorldFields,
  topology: SeedWorldHydrologyTopology,
  style: SeedWorldHydrologyBakeStyle = SEED_WORLD_DEFAULT_HYDROLOGY_BAKE_STYLE
): SeedWorldHydrologyBake {
  validateBakeInputs(plan, sourceFields, topology, style);
  const heightMetres = decodeHeightField(sourceFields.heightSamples);
  const styledBodies = topology.bodies.map((body) => compileStyledBody(body, style.depthScale));
  const heightRiverFields = styledBodies.map((body) =>
    rasterizeBodyRiverField(
      body.curves,
      body.curveSamples,
      sourceFields.heightResolution,
      sourceFields.sizeMetres,
      0,
      style.bankShoulderMetres
    )
  );
  const heightBasinSignedDistances = styledBodies.map((body) =>
    compileSeedWorldHydrologyBasinSignedDistanceField(
      body.geometry.basinContour,
      sourceFields.sizeMetres,
      sourceFields.heightResolution,
      "vertex",
      new Float64Array(sourceFields.heightResolution ** 2)
    )
  );
  const terrainSupportInsetMetres =
    (Math.SQRT2 * sourceFields.sizeMetres) / (2 * (sourceFields.heightResolution - 1)) +
    (Math.SQRT2 * sourceFields.sizeMetres) / (2 * sourceFields.surfaceResolution);
  for (let y = 0; y < sourceFields.heightResolution; y++) {
    for (let x = 0; x < sourceFields.heightResolution; x++) {
      const index = y * sourceFields.heightResolution + x;
      heightMetres[index] = resolveHeightSampleCarves(
        heightMetres[index]!,
        styledBodies,
        heightRiverFields,
        heightBasinSignedDistances,
        index,
        terrainSupportInsetMetres,
        style
      );
    }
  }
  const heightSamples = encodeHeightField(heightMetres);
  const publishedHeightMetres = decodeHeightField(heightSamples);

  const surfaceRiverFields = styledBodies.map((body) =>
    rasterizeBodyRiverField(
      body.curves,
      body.curveSamples,
      sourceFields.surfaceResolution,
      sourceFields.sizeMetres,
      0.5,
      style.bankShoulderMetres
    )
  );
  const surfaceBasinSignedDistances = styledBodies.map((body) =>
    compileSeedWorldHydrologyBasinSignedDistanceField(
      body.geometry.basinContour,
      sourceFields.sizeMetres,
      sourceFields.surfaceResolution,
      "cell-centre",
      new Float32Array(sourceFields.surfaceResolution ** 2)
    )
  );
  const materialWeights = new Uint8Array(sourceFields.materialWeights);
  const rockySlopeWeight = new Uint8Array(sourceFields.rockySlopeWeight.length);
  const waterMask = new Uint8Array(sourceFields.waterMask);
  const flow = new Uint8Array(sourceFields.flow);
  const sediment = new Uint8Array(sourceFields.sediment);
  const wetness = new Uint8Array(sourceFields.wetness.length);
  const wetlandWeight = new Uint8Array(sourceFields.wetlandWeight.length);
  const riverBankDistanceMetres = new Float32Array(sourceFields.surfaceResolution ** 2);
  riverBankDistanceMetres.fill(sourceFields.sizeMetres);
  const wetlandWaterLevelMetres = new Float32Array(sourceFields.wetlandWaterLevelMetres);
  const habitat = new Uint8Array(sourceFields.habitat);
  const surfaceSupportRadiusMetres = (Math.SQRT2 * sourceFields.sizeMetres) / (2 * sourceFields.surfaceResolution);
  const bodySignedDistances = surfaceBasinSignedDistances.map((signedDistance, bodyIndex) => {
    const river = surfaceRiverFields[bodyIndex]!;
    for (let index = 0; index < signedDistance.length; index++) {
      signedDistance[index] = Math.min(signedDistance[index]!, river.bankDistanceMetres[index]!);
    }
    return signedDistance;
  });
  const bodyMasks = styledBodies.map((body, bodyIndex) => {
    const rawMask = new Uint8Array(sourceFields.surfaceResolution ** 2);
    const river = surfaceRiverFields[bodyIndex]!;
    const signedDistances = bodySignedDistances[bodyIndex]!;
    for (let y = 0; y < sourceFields.surfaceResolution; y++) {
      const normalizedY = (y + 0.5) / sourceFields.surfaceResolution;
      for (let x = 0; x < sourceFields.surfaceResolution; x++) {
        const normalizedX = (x + 0.5) / sourceFields.surfaceResolution;
        const index = y * sourceFields.surfaceResolution + x;
        if (signedDistances[index]! > surfaceSupportRadiusMetres && river.water[index] === 0) continue;
        const terrainHeight = sampleBilinear(
          publishedHeightMetres,
          sourceFields.heightResolution,
          normalizedX,
          normalizedY
        );
        if (terrainHeight <= body.geometry.waterLevelMetres - SEED_WORLD_MINIMUM_OWNED_WATER_DEPTH_METRES) {
          rawMask[index] = 1;
        }
      }
    }
    return retainLargestConnectedComponent(rawMask, sourceFields.surfaceResolution, body.geometry.id);
  });
  const bodyCoverages = bodySignedDistances.map((signedDistance) => {
    const coverage = new Uint8Array(signedDistance.length);
    for (let index = 0; index < coverage.length; index++) {
      coverage[index] = Math.round(
        (1 - smootherstep(-surfaceSupportRadiusMetres, surfaceSupportRadiusMetres, signedDistance[index]!)) * 255
      );
    }
    return coverage;
  });

  for (let y = 0; y < sourceFields.surfaceResolution; y++) {
    const normalizedY = (y + 0.5) / sourceFields.surfaceResolution;
    for (let x = 0; x < sourceFields.surfaceResolution; x++) {
      const normalizedX = (x + 0.5) / sourceFields.surfaceResolution;
      const index = y * sourceFields.surfaceResolution + x;
      let wetlandCoverage = 0;
      let owningBodyIndex = -1;
      let owningChannel = 0;
      for (let bodyIndex = 0; bodyIndex < styledBodies.length; bodyIndex++) {
        const body = styledBodies[bodyIndex]!;
        const river = surfaceRiverFields[bodyIndex]!;
        const signedDistance = bodySignedDistances[bodyIndex]![index]!;
        riverBankDistanceMetres[index] = Math.min(riverBankDistanceMetres[index]!, signedDistance);
        const coverage = signedDistance <= 0 ? 1 : 1 - smootherstep(0, style.bankShoulderMetres, signedDistance);
        wetlandCoverage = Math.max(wetlandCoverage, coverage, river.channel[index]!);
        const ownsWater = bodyMasks[bodyIndex]![index] !== 0;
        if (ownsWater) {
          if (river.channel[index]! >= owningChannel) {
            owningBodyIndex = bodyIndex;
            owningChannel = river.channel[index]!;
          }
        }
        flow[index] = Math.max(flow[index]!, Math.round(river.flow[index]! * 255));
        sediment[index] = Math.max(
          sediment[index]!,
          Math.round(clamp01((coverage * 0.65 + river.channel[index]! * 0.35) * 255))
        );
      }

      const offset = index * 4;
      const roadWeight = materialWeights[offset + 3]! / 255;
      const rockWeight = materialWeights[offset + 2]! / 255;
      const existingSoilWeight = materialWeights[offset + 1]! / 255;
      const available = Math.max(0, 1 - roadWeight - rockWeight);
      const riparianSoilWeight = resolveSeedWorldRiparianSoilWeight(riverBankDistanceMetres[index]!);
      const soilWeight = Math.min(available, Math.max(existingSoilWeight, riparianSoilWeight * (1 - roadWeight)));
      writeNormalizedWeights(materialWeights, offset, [available - soilWeight, soilWeight, rockWeight, roadWeight]);
      const terrainSlope = sampleTerrainSlope(
        heightSamples,
        sourceFields.heightResolution,
        sourceFields.sizeMetres,
        normalizedX,
        normalizedY
      );
      wetness[index] = Math.round(
        resolveSeedWorldRiparianMoisture({
          baselineMoisture: sampleBilinear(plan.moisture, plan.resolution, normalizedX, normalizedY),
          inlandWaterDistanceMetres: riverBankDistanceMetres[index]!,
          slope: terrainSlope,
          flow: flow[index]! / 255,
          sediment: sediment[index]! / 255
        }) * 255
      );
      wetlandWeight[index] = Math.round(clamp01(wetlandCoverage * (1 - roadWeight)) * 255);
      if (owningBodyIndex >= 0) {
        waterMask[index] = 255;
        wetlandWaterLevelMetres[index] = styledBodies[owningBodyIndex]!.geometry.waterLevelMetres;
      }
      rockySlopeWeight[index] = Math.round(seedWorldRockySlopeWeight(terrainSlope) * 255);
    }
  }

  const riverCurves = Object.freeze(styledBodies.flatMap((body) => body.curves));
  let fieldsHash = hashUint16Field(heightSamples);
  fieldsHash = hashUint32(fieldsHash, topology.geometryHash);
  fieldsHash = hashStyle(fieldsHash, style);
  for (const values of [materialWeights, rockySlopeWeight, waterMask, flow, sediment, wetness, wetlandWeight]) {
    for (const value of values) fieldsHash = hashUint32(fieldsHash, value);
  }
  for (const value of riverBankDistanceMetres) fieldsHash = hashNumber(fieldsHash, value);
  for (const value of wetlandWaterLevelMetres) fieldsHash = hashNumber(fieldsHash, value);
  const fields: SeedWorldFields = Object.freeze({
    ...sourceFields,
    heightSamples,
    materialWeights,
    rockySlopeWeight,
    waterMask,
    flow,
    sediment,
    wetness,
    wetlandWeight,
    riverBankDistanceMetres,
    wetlandWaterLevelMetres,
    habitat,
    riverCurves,
    riverCurveSamples: Object.freeze(styledBodies.flatMap((body) => body.curveSamples)),
    hydrologyGeometryHash: topology.geometryHash,
    hydrologyBakeHash: fieldsHash >>> 0,
    hash: fieldsHash >>> 0
  });
  const waterBodies = Object.freeze(
    styledBodies.map((body, bodyIndex) =>
      finalizeWaterBody(
        body,
        bodyMasks[bodyIndex]!,
        bodyCoverages[bodyIndex]!,
        bodySignedDistances[bodyIndex]!,
        sourceFields.surfaceResolution,
        sourceFields.sizeMetres,
        publishedHeightMetres,
        sourceFields.heightResolution,
        topology.geometryHash,
        terrainSupportInsetMetres
      )
    )
  );
  return Object.freeze({
    topology,
    style: Object.freeze({ ...style }),
    fields,
    waterBodies,
    bakeHash: fieldsHash >>> 0
  });
}

function retainLargestConnectedComponent(mask: Uint8Array, resolution: number, bodyId: string): Uint8Array {
  const visited = new Uint8Array(mask.length);
  let largest: number[] = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    const component = [seed];
    visited[seed] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const index = component[cursor]!;
      const x = index % resolution;
      const y = Math.floor(index / resolution);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < resolution ? index + 1 : -1,
        y > 0 ? index - resolution : -1,
        y + 1 < resolution ? index + resolution : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && mask[neighbour] && !visited[neighbour]) {
          visited[neighbour] = 1;
          component.push(neighbour);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  if (largest.length === 0) throw new Error(`Hydrology body '${bodyId}' has no connected water-ready footprint.`);
  const result = new Uint8Array(mask.length);
  for (const index of largest) result[index] = 1;
  return result;
}

/** Returns buffers owned exclusively by the hydrology bake for Worker transfer. */
export function seedWorldHydrologyBakeTransferables(bake: SeedWorldHydrologyBake): Transferable[] {
  return bake.waterBodies.flatMap((body) => [
    body.wetMask.buffer,
    body.coverage.buffer,
    body.signedDistanceMetres.buffer
  ]);
}

/**
 * Combines disconnected hydrology bodies without changing their exact water ownership.
 * @param bodies Worker-baked bodies sharing one resolution and geometry hash.
 * @param emptyContract Required grid identity when no optional Lake was published.
 * @returns A new mask suitable for 2D structured cloning without detaching Water buffers.
 * @throws {RangeError} When an empty or populated body grid does not match its contract.
 */
export function compileSeedWorldHydrologyCoverageMask(
  bodies: readonly SeedWorldHydrologyWaterBody[],
  emptyContract?: Readonly<SeedWorldEmptyHydrologyCoverageContract>
): SeedWorldHydrologyCoverageMask {
  const first = bodies[0];
  if (!first) {
    if (
      !emptyContract ||
      !Number.isInteger(emptyContract.resolution) ||
      emptyContract.resolution <= 0 ||
      !Number.isSafeInteger(emptyContract.geometryHash)
    ) {
      throw new RangeError("Empty Seed World hydrology coverage requires a valid grid identity.");
    }
    return Object.freeze({
      geometryHash: emptyContract.geometryHash,
      resolution: emptyContract.resolution,
      wetMask: new Uint8Array(emptyContract.resolution ** 2),
      coverage: new Uint8Array(emptyContract.resolution ** 2)
    });
  }
  const wetMask = new Uint8Array(first.wetMask.length);
  const coverage = new Uint8Array(first.coverage.length);
  for (const body of bodies) {
    if (
      body.geometryHash !== first.geometryHash ||
      body.resolution !== first.resolution ||
      body.wetMask.length !== wetMask.length ||
      body.coverage.length !== coverage.length
    ) {
      throw new RangeError("Seed World hydrology bodies must share one coverage-grid contract.");
    }
    for (let index = 0; index < wetMask.length; index++) {
      if (body.wetMask[index]) wetMask[index] = 1;
      coverage[index] = Math.max(coverage[index]!, body.coverage[index]!);
    }
  }
  return Object.freeze({ geometryHash: first.geometryHash, resolution: first.resolution, wetMask, coverage });
}

interface StyledBody {
  readonly geometry: SeedWorldHydrologyBodyGeometry;
  readonly curves: readonly SeedWorldRiverCurve[];
  readonly curveSamples: readonly (readonly SeedWorldRiverCurveSample[])[];
}

function compileStyledBody(geometry: SeedWorldHydrologyBodyGeometry, depthScale: number): StyledBody {
  const curves = Object.freeze(
    geometry.curves.map((curve) =>
      Object.freeze({
        id: curve.id,
        controls: Object.freeze(
          curve.controls.map((control) =>
            Object.freeze({
              ...control,
              depthMetres: control.depthMetres * depthScale,
              bedElevationMetres: geometry.waterLevelMetres - control.depthMetres * depthScale
            })
          )
        )
      })
    )
  );
  const curveSamples = Object.freeze(
    geometry.curveSamples.map((samples) =>
      Object.freeze(
        samples.map((sample) =>
          Object.freeze({
            ...sample,
            depthMetres: sample.depthMetres * depthScale,
            bedElevationMetres: geometry.waterLevelMetres - sample.depthMetres * depthScale
          })
        )
      )
    )
  );
  return Object.freeze({ geometry, curves, curveSamples });
}

function rasterizeBodyRiverField(
  curves: readonly SeedWorldRiverCurve[],
  curveSamples: readonly (readonly SeedWorldRiverCurveSample[])[],
  resolution: number,
  sizeMetres: number,
  sampleOffset: number,
  shoulderMetres: number
): SeedWorldRiverField {
  return rasterizeSeedWorldRiverField(curves, {
    resolution,
    sizeMetres,
    sampleOffset,
    distanceFieldMarginMetres: shoulderMetres,
    curveSampleSpacingMetres: CURVE_SAMPLE_SPACING_METRES,
    curveSamples
  });
}

function resolveHeightSampleCarves(
  sourceHeight: number,
  bodies: readonly StyledBody[],
  riverFields: readonly SeedWorldRiverField[],
  basinSignedDistanceFields: readonly Float64Array[],
  sampleIndex: number,
  terrainSupportInsetMetres: number,
  style: SeedWorldHydrologyBakeStyle
): number {
  let deepestCoreHeight = Number.POSITIVE_INFINITY;
  let deepestShoulderHeight = Number.POSITIVE_INFINITY;
  let hasCore = false;
  let hasShoulder = false;
  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
    const body = bodies[bodyIndex]!;
    const river = riverFields[bodyIndex]!;
    const basinSignedDistance = basinSignedDistanceFields[bodyIndex]![sampleIndex]!;
    const riverSignedDistance = river.bankDistanceMetres[sampleIndex]!;
    const signedDistance = Math.min(basinSignedDistance, riverSignedDistance);
    const carveDistanceMetres = signedDistance - terrainSupportInsetMetres;
    if (carveDistanceMetres >= style.bankShoulderMetres) continue;
    const candidateHeight = resolveBodyCarveHeight(
      sourceHeight,
      body.geometry.waterLevelMetres,
      carveDistanceMetres,
      basinSignedDistance,
      riverSignedDistance,
      river,
      sampleIndex,
      style
    );
    if (signedDistance <= 0) {
      hasCore = true;
      deepestCoreHeight = Math.min(deepestCoreHeight, candidateHeight);
    } else {
      hasShoulder = true;
      deepestShoulderHeight = Math.min(deepestShoulderHeight, candidateHeight);
    }
  }
  if (hasCore && hasShoulder) return Math.min(sourceHeight, deepestCoreHeight, deepestShoulderHeight);
  if (hasCore) return Math.min(sourceHeight, deepestCoreHeight);
  if (hasShoulder) return Math.min(sourceHeight, deepestShoulderHeight);
  return sourceHeight;
}

function resolveBodyCarveHeight(
  sourceHeight: number,
  waterLevelMetres: number,
  signedDistanceMetres: number,
  basinSignedDistanceMetres: number,
  riverSignedDistanceMetres: number,
  river: SeedWorldRiverField,
  riverIndex: number,
  style: SeedWorldHydrologyBakeStyle
): number {
  if (signedDistanceMetres >= 0) {
    const bankProgress = smootherstep(0, style.bankShoulderMetres, signedDistanceMetres);
    return Math.min(sourceHeight, mix(waterLevelMetres, sourceHeight, bankProgress));
  }

  const riverOwnsDistance = riverSignedDistanceMetres <= basinSignedDistanceMetres;
  const riverDepthMetres = river.depthMetres[riverIndex]!;
  const bedDepthMetres = riverOwnsDistance
    ? Math.max(MINIMUM_BED_DEPTH_METRES, riverDepthMetres)
    : MINIMUM_BED_DEPTH_METRES * style.depthScale;
  const bedTransitionMetres = riverOwnsDistance
    ? resolveRiverBedTransitionMetres(river, riverIndex, style.bankShoulderMetres)
    : style.bankShoulderMetres * BASIN_BED_TRANSITION_RATIO;
  const bedProgress = smootherstep(0, bedTransitionMetres, -signedDistanceMetres);
  const resolvedDepthMetres = bedDepthMetres * bedProgress;
  return Math.min(sourceHeight, waterLevelMetres - resolvedDepthMetres);
}

function resolveRiverBedTransitionMetres(
  river: SeedWorldRiverField,
  riverIndex: number,
  bankShoulderMetres: number
): number {
  const centreDistanceMetres = river.centreDistanceMetres[riverIndex]!;
  const signedDistanceMetres = river.bankDistanceMetres[riverIndex]!;
  const localHalfWidthMetres = centreDistanceMetres - signedDistanceMetres;
  if (!Number.isFinite(localHalfWidthMetres) || localHalfWidthMetres <= 0) {
    return bankShoulderMetres * BASIN_BED_TRANSITION_RATIO;
  }
  return Math.min(bankShoulderMetres * BASIN_BED_TRANSITION_RATIO, localHalfWidthMetres);
}

function finalizeWaterBody(
  body: StyledBody,
  wetMask: Uint8Array,
  coverage: Uint8Array,
  signedDistanceMetres: Float32Array,
  resolution: number,
  sizeMetres: number,
  heightMetres: Float32Array,
  heightResolution: number,
  topologyGeometryHash: number,
  surfaceUnderlapMetres: number
): SeedWorldHydrologyWaterBody {
  let wetCount = 0;
  let depthSum = 0;
  let maximumDepthMetres = 0;
  let terrainProtrusionCount = 0;
  for (let y = 0; y < resolution; y++) {
    const normalizedY = (y + 0.5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const index = y * resolution + x;
      if (!wetMask[index]) continue;
      const terrainHeight = sampleBilinear(heightMetres, heightResolution, (x + 0.5) / resolution, normalizedY);
      const depth = body.geometry.waterLevelMetres - terrainHeight;
      if (depth <= 0) terrainProtrusionCount++;
      maximumDepthMetres = Math.max(maximumDepthMetres, depth);
      depthSum += Math.max(0, depth);
      wetCount++;
    }
  }
  return Object.freeze({
    id: body.geometry.id,
    geometryHash: topologyGeometryHash,
    waterLevelMetres: body.geometry.waterLevelMetres,
    surfaceUnderlapMetres,
    wetMask,
    coverage,
    signedDistanceMetres,
    resolution,
    curves: body.curves,
    areaSquareMetres: wetCount * Math.pow(sizeMetres / resolution, 2),
    maximumDepthMetres,
    averageDepthMetres: wetCount > 0 ? depthSum / wetCount : 0,
    terrainProtrusionCount
  });
}

function validateBakeInputs(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  topology: SeedWorldHydrologyTopology,
  style: SeedWorldHydrologyBakeStyle
): void {
  if (plan.rootSeed !== fields.rootSeed || plan.rootSeed !== topology.rootSeed) {
    throw new RangeError("Seed World hydrology plan, topology, and fields must share one Root Seed.");
  }
  if (plan.sizeMetres !== fields.sizeMetres || plan.sizeMetres !== topology.sizeMetres) {
    throw new RangeError("Seed World hydrology plan, topology, and fields must share one world extent.");
  }
  if (!Number.isFinite(style.depthScale) || style.depthScale <= 0) {
    throw new RangeError("Seed World hydrology depth scale must be finite and positive.");
  }
  if (!Number.isFinite(style.bankShoulderMetres) || style.bankShoulderMetres <= 0) {
    throw new RangeError("Seed World hydrology bank shoulder must be finite and positive.");
  }
}

function sampleTerrainSlope(
  samples: Uint16Array,
  resolution: number,
  sizeMetres: number,
  normalizedX: number,
  normalizedY: number
): number {
  const offset = 1 / (resolution - 1);
  const spacingMetres = sizeMetres / (resolution - 1);
  const decode = (x: number, y: number): number =>
    SEED_WORLD_HEIGHT_RANGE.minimum +
    (sampleBilinear(samples, resolution, x, y) / 65535) *
      (SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum);
  const dx =
    (decode(normalizedX + offset, normalizedY) - decode(normalizedX - offset, normalizedY)) / (2 * spacingMetres);
  const dz =
    (decode(normalizedX, normalizedY + offset) - decode(normalizedX, normalizedY - offset)) / (2 * spacingMetres);
  return Math.atan(Math.hypot(dx, dz)) / (Math.PI * 0.5);
}

function decodeHeightField(samples: Uint16Array): Float32Array {
  const result = new Float32Array(samples.length);
  const range = SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum;
  for (let index = 0; index < samples.length; index++) {
    result[index] = SEED_WORLD_HEIGHT_RANGE.minimum + (samples[index]! / 65535) * range;
  }
  return result;
}

function encodeHeightField(values: Float32Array): Uint16Array {
  const result = new Uint16Array(values.length);
  const range = SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum;
  for (let index = 0; index < values.length; index++) {
    result[index] = Math.round(clamp01((values[index]! - SEED_WORLD_HEIGHT_RANGE.minimum) / range) * 65535);
  }
  return result;
}

function writeNormalizedWeights(target: Uint8Array, offset: number, weights: readonly number[]): void {
  const positive = weights.map((value) => Math.max(0, value));
  const sum = positive.reduce((total, value) => total + value, 0) || 1;
  const bytes = positive.map((value) => Math.floor((value / sum) * 255));
  let remainder = 255 - bytes.reduce((total, value) => total + value, 0);
  const order = positive.map((value, index) => ({ index, value })).sort((left, right) => right.value - left.value);
  for (let index = 0; remainder > 0; index = (index + 1) % order.length) {
    bytes[order[index]!.index]++;
    remainder--;
  }
  for (let channel = 0; channel < 4; channel++) target[offset + channel] = bytes[channel]!;
}

function sampleBilinear(
  samples: ArrayLike<number>,
  resolution: number,
  normalizedX: number,
  normalizedY: number
): number {
  const x = clamp01(normalizedX) * (resolution - 1);
  const y = clamp01(normalizedY) * (resolution - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const y1 = Math.min(resolution - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  return mix(
    mix(samples[y0 * resolution + x0]!, samples[y0 * resolution + x1]!, tx),
    mix(samples[y1 * resolution + x0]!, samples[y1 * resolution + x1]!, tx),
    ty
  );
}

function hashStyle(hash: number, style: SeedWorldHydrologyBakeStyle): number {
  hash = hashNumber(hash, style.depthScale);
  return hashNumber(hash, style.bankShoulderMetres);
}

function hashUint16Field(values: Uint16Array): number {
  let hash = 0x811c9dc5;
  for (const value of values) hash = hashUint32(hash, value);
  return hash >>> 0;
}

function hashNumber(hash: number, value: number): number {
  return hashUint32(hash, Math.round(value * 1_000));
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x01000193) >>> 0;
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
