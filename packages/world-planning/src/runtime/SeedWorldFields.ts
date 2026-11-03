import { sampleFloat32GridTriangle as sampleTerrainGrid } from "@galacean/engine-terrain/geometry/GridInterpolation";
import {
  sampleSeedWorldCoastSignedFieldMetres,
  sampleSeedWorldMountainUpliftMetres,
  SeedWorldLandCover,
  type SeedWorldPlan
} from "../world/SeedWorldPlanner.ts";
import {
  compileSeedWorldRiverCurves,
  rasterizeSeedWorldRiverField,
  sampleSeedWorldRiverCurve,
  type SeedWorldRiverCurve,
  type SeedWorldRiverCurveSample,
  type SeedWorldRiverField
} from "./SeedWorldRiverCurves.ts";
import {
  sampleSeedWorldWetlandSignedDistanceMetres,
  SEED_WORLD_WETLAND_BANK_EXPANSION_METRES,
  SEED_WORLD_WETLAND_SDF_TRANSITION_METRES
} from "../world/SeedWorldWetland.ts";
import { resolveSeedWorldRiparianMoisture } from "@galacean/engine-terrain/world/SeedWorldSoilMoisture";
import { resolveSeedWorldRiparianSoilWeight } from "./SeedWorldSurfaceIntent.ts";
import { compileSeedWorldGeologyHeightfield } from "./SeedWorldGeologyLayout.ts";
import { compileSeedWorldRoadSurfaceCoverage } from "../world/SeedWorldFeatureGeometry.ts";

const SEED_WORLD_BASE_ELEVATION_METRES = 42;
/** Authoritative Ocean surface elevation used by terrain and Hydrology coastline classification. */
export const SEED_WORLD_SEA_LEVEL_METRES = -5;
/** Fixed authored terrain datum so sea-level previews do not move the seabed together with the water. */
const SEED_WORLD_AUTHORED_COAST_TERRAIN_DATUM_METRES = 0;
const SEED_WORLD_DEEP_OCEAN_FLOOR_METRES = -120;
const SEED_WORLD_COAST_LAND_TRANSITION_START_METRES = 0;
const SEED_WORLD_COAST_LAND_TRANSITION_END_METRES = 128;
const SEED_WORLD_OCEAN_DEPTH_DISTANCE_METRES = 480;
const SEED_WORLD_TERRAIN_STYLE_RESOLUTION = 385;
/** World-space support of the offline linear filter applied only to baked mountain uplift. */
export const SEED_WORLD_MOUNTAIN_LINEAR_SMOOTHING_METRES = 16;
const SEED_WORLD_BANK_SLOPE_RESPONSE_START_DEGREES = 8;
const SEED_WORLD_BANK_SLOPE_RESPONSE_FULL_DEGREES = 30;
const SEED_WORLD_BANK_FLAT_FEATHER_SCALE = 1.35;
const SEED_WORLD_BANK_STEEP_FEATHER_SCALE = 0.65;
const SEED_WORLD_BANK_NOISE_MINIMUM_WAVELENGTH_METRES = 96;
const SEED_WORLD_BANK_NOISE_HEIGHT_SAMPLE_MULTIPLIER = 8;
const SEED_WORLD_BANK_NOISE_FEATHER_AMPLITUDE = 0.65;
/** Slope angle where dry grass begins yielding to the authored cliff layer. */
export const SEED_WORLD_ROCKY_SLOPE_START_DEGREES = 34;
/** Slope angle where the authored cliff layer fully owns otherwise grassy terrain. */
export const SEED_WORLD_ROCKY_SLOPE_FULL_DEGREES = 52;
// The final wetland/support fields are baked at 2m and the height lattice at 1m.
// Keep their curve chord below one support texel so bends do not become polygonal banks.
const SEED_WORLD_HIGH_RES_RIVER_CURVE_SPACING_METRES = 1.5;
/**
 * Wetland support at which the terrain has completed its C2 descent and can safely carry standing water.
 * @remarks Keeping this equal to the basin's full-support threshold prevents visible land islands under water.
 */
export const SEED_WORLD_WETLAND_WATER_MINIMUM_WEIGHT = 0.75;
/** Maximum wetland support still considered dry grassland for an inspection-camera anchor. */
export const SEED_WORLD_DRY_GRASS_WETLAND_WEIGHT_MAXIMUM = 0.05;

/**
 * Continuous shallow-basin parameters shared by Hfinal and standing water.
 * @remarks The Root Seed chooses the wetland support; this profile only controls how that support is shaped.
 */
export interface SeedWorldWetlandBasinStyle {
  /**
   * Absolute world-space elevation shared by every inland wetland surface.
   * @remarks Terrain excavation must descend below this datum; it is independent from the Ocean sea level.
   */
  readonly waterLevelMetres: number;
  /** Terrain depth immediately inside the wetland boundary. */
  readonly edgeDepthMetres: number;
  /** Terrain depth in a fully developed wetland interior. */
  readonly coreDepthMetres: number;
  /** Exterior SDF distance over which land eases into the basin. */
  readonly shoulderMetres: number;
  /** Interior SDF distance over which the shallow bank reaches its core depth. */
  readonly transitionMetres: number;
  /** Interior shelf response; greater values retain a broad shallow shelf. */
  readonly shelfExponent: number;
}

/** Default basin profile calibrated against the Integrated central water region. */
export const SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE = Object.freeze<SeedWorldWetlandBasinStyle>({
  waterLevelMetres: 0,
  edgeDepthMetres: 1.2,
  coreDepthMetres: 12,
  shoulderMetres: 10,
  transitionMetres: 10,
  shelfExponent: 1.6
});

/** Debug-tunable, band-limited FBM parameters applied before mountain brushes. */
export interface SeedWorldFbmParameters {
  /** Broad rolling-ground wavelength in metres. */
  readonly rollingWavelengthMetres: number;
  /** Broad rolling-ground height amplitude in metres. */
  readonly rollingAmplitudeMetres: number;
  /** Broad rolling-ground octave count. */
  readonly rollingOctaves: number;
  /** Fine ground-detail wavelength in metres. */
  readonly detailWavelengthMetres: number;
  /** Fine ground-detail height amplitude in metres. */
  readonly detailAmplitudeMetres: number;
  /** Fine ground-detail octave count. */
  readonly detailOctaves: number;
  /** Domain-warp wavelength in metres. */
  readonly warpWavelengthMetres: number;
  /** Domain-warp horizontal displacement in metres. */
  readonly warpAmplitudeMetres: number;
  /** Domain-warp octave count. */
  readonly warpOctaves: number;
}

/** Initial FBM profile shown by the experimental debug panel. */
export const SEED_WORLD_DEFAULT_FBM = Object.freeze<SeedWorldFbmParameters>({
  rollingWavelengthMetres: 720,
  rollingAmplitudeMetres: 36,
  rollingOctaves: 4,
  detailWavelengthMetres: 180,
  detailAmplitudeMetres: 10,
  detailOctaves: 3,
  warpWavelengthMetres: 1_200,
  warpAmplitudeMetres: 180,
  warpOctaves: 3
});

/** Height range shared by generated TerrainClipmap Region sources. */
export const SEED_WORLD_HEIGHT_RANGE = Object.freeze({ minimum: -128, maximum: 1_600 });
/** Floating-point allowance for the bilinear decode operations over the published R16 height range. */
export const SEED_WORLD_HEIGHT_INTERPOLATION_EPSILON_METRES =
  (SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum) * Number.EPSILON * 64;
/** Full one-metre lattice used by the interactive 3D world. */
export const SEED_WORLD_HEIGHT_RESOLUTION = 3_073;
/** Four-layer material and process fields use this globally tiled resolution. */
export const SEED_WORLD_SURFACE_RESOLUTION = 1_536;

interface SeedWorldWetlandBasinField {
  readonly resolution: number;
  /** Signed distance in metres after terrain-aware shoulder shaping. */
  readonly signedDistanceMetres: Float32Array;
  /** Canonical wetland support retained independently from renderer bank shaping. */
  readonly canonicalWeight: Uint8Array;
  /** Discharge-derived core depth sampled from the same owning curve segment. */
  readonly coreDepthMetres: Float32Array;
  /** Terrain-constrained dry-bank transition from the same owning curve segment. */
  readonly bankFeatherMetres: Float32Array;
  /** Per-sample water datum inherited from the connected wetland's natural low point. */
  readonly waterLevelMetres: Float32Array;
}

/**
 * Compiles the road-independent natural terrain lattice used by both planning and final WorldFields.
 * @param plan Authoritative geology, hydrology, and pre-road ecology intent.
 * @param resolution Number of samples along each square axis.
 * @param fbm Shared band-limited terrain profile.
 * @returns World-metre natural height samples before any road-local shaping.
 * @throws {RangeError} When the resolution or FBM profile is invalid.
 */
export function compileSeedWorldNaturalHeightField(
  plan: SeedWorldPlan,
  resolution: number,
  fbm: SeedWorldFbmParameters = SEED_WORLD_DEFAULT_FBM,
  wetlandBasinStyle: SeedWorldWetlandBasinStyle = SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE
): Float32Array {
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError("Seed World natural height fields require at least two samples per axis");
  }
  validateSeedWorldFbmParameters(fbm, plan.sizeMetres);
  validateWetlandBasinStyle(wetlandBasinStyle);
  const riverCurves = compileSeedWorldRiverCurves(plan);
  const naturalLandField = compileNaturalLandField(plan, resolution, fbm);
  return compileTerrainHeights(
    plan,
    resolution,
    wetlandBasinStyle,
    compileWetlandBasinField(plan, riverCurves, resolution, wetlandBasinStyle, naturalLandField),
    naturalLandField
  );
}

/** Options retained for deterministic smaller compiler tests. */
export interface SeedWorldFieldCompileOptions {
  /** Optional height-lattice resolution. */
  readonly heightResolution?: number;
  /** Optional material/process lattice resolution. */
  readonly surfaceResolution?: number;
  /** Optional experimental FBM profile; the Root Seed remains the only random source. */
  readonly fbm?: SeedWorldFbmParameters;
  /** Optional shared wetland-basin profile; it changes geometry and water placement without a random stream. */
  readonly wetlandBasinStyle?: SeedWorldWetlandBasinStyle;
  /** Optional canonical river curves compiled once by an upstream Worker stage. */
  readonly riverCurves?: readonly SeedWorldRiverCurve[];
}

/** Immutable runtime fields compiled once from one semantic world plan. */
export interface SeedWorldFields {
  /** Optional lower-left world coordinate; legacy Seed worlds are centered. */
  readonly worldOrigin?: readonly [x: number, z: number];
  /** Optional R16 decode owned by an external terrain source. */
  readonly heightDecode?: Readonly<{ offset: number; scale: number }>;
  /** Root Seed which generated this immutable field set. */
  readonly rootSeed: number;
  /** World edge length in metres. */
  readonly sizeMetres: number;
  /** Number of samples on each height axis. */
  readonly heightResolution: number;
  /** Number of samples on each material/process axis. */
  readonly surfaceResolution: number;
  /** Baked material heightmap; surfaceHeights, when present, owns geometric sampling. */
  readonly heightSamples: Uint16Array;
  /** Canonical Float32 fixed-surface vertices when supplied by the planning producer. */
  readonly surfaceHeights?: Float32Array;
  /** Base RGBA8 Terrain weights: grass, wetland/ocean, reserved final-slope channel, and road respectively. */
  readonly materialWeights: Uint8Array;
  /** Final-R16 slope response: 28 degrees starts the transition and 42 degrees is fully rocky. */
  readonly rockySlopeWeight: Uint8Array;
  /** Ocean and river ownership used by water clearance and population sampling. */
  readonly waterMask: Uint8Array;
  /** Accumulation field. */
  readonly flow: Uint8Array;
  /** Erosion/deposition response field. */
  readonly sediment: Uint8Array;
  /** Soil moisture response field. */
  readonly wetness: Uint8Array;
  /** Road-cleared inland-wetland influence compiled from the canonical river-bank SDF; ocean is excluded. */
  readonly wetlandWeight: Uint8Array;
  /** Signed world-metre distance to the canonical river/basin water boundary. */
  readonly riverBankDistanceMetres: Float32Array;
  /** Optional published distance to any actual water footprint, including the coast. */
  readonly waterBoundaryDistanceMetres?: Float32Array;
  /** Absolute world-space water elevation shared by wetland excavation and the global water plane. */
  readonly wetlandWaterLevelMetres: Float32Array;
  /** Habitat classification field. */
  readonly habitat: Uint8Array;
  /** Basin profile used to derive both Hfinal wetland depth and standing-water elevation. */
  readonly wetlandBasinStyle: SeedWorldWetlandBasinStyle;
  /** Canonical smooth river paths shared with the Water adapter. */
  readonly riverCurves: readonly SeedWorldRiverCurve[];
  /** Exact world-space curve samples reused by every raster, 2D overlay, and clearance index. */
  readonly riverCurveSamples: readonly (readonly SeedWorldRiverCurveSample[])[];
  /** Style-independent hydrology geometry hash shared by 2D, Terrain, Water, and ecology. */
  readonly hydrologyGeometryHash: number;
  /** Style- and output-grid-dependent evidence over the hydrology bake. */
  readonly hydrologyBakeHash: number;
  /** Compact deterministic evidence over every emitted raster. */
  readonly hash: number;
}

/**
 * Copies every mutable raster owned by one immutable WorldFields value.
 * Vector Topology data is already immutable and can be shared safely.
 */
export function cloneSeedWorldFields(fields: SeedWorldFields): SeedWorldFields {
  return Object.freeze({
    ...fields,
    heightSamples: new Uint16Array(fields.heightSamples),
    ...(fields.surfaceHeights ? { surfaceHeights: new Float32Array(fields.surfaceHeights) } : {}),
    materialWeights: new Uint8Array(fields.materialWeights),
    rockySlopeWeight: new Uint8Array(fields.rockySlopeWeight),
    waterMask: new Uint8Array(fields.waterMask),
    flow: new Uint8Array(fields.flow),
    sediment: new Uint8Array(fields.sediment),
    wetness: new Uint8Array(fields.wetness),
    wetlandWeight: new Uint8Array(fields.wetlandWeight),
    riverBankDistanceMetres: new Float32Array(fields.riverBankDistanceMetres),
    ...(fields.waterBoundaryDistanceMetres
      ? { waterBoundaryDistanceMetres: new Float32Array(fields.waterBoundaryDistanceMetres) }
      : {}),
    wetlandWaterLevelMetres: new Float32Array(fields.wetlandWaterLevelMetres),
    habitat: new Uint8Array(fields.habitat)
  });
}

/** Habitat and terrain samples consumed by Cell-local population generation. */
export interface SeedWorldPopulationSample {
  /** Final terrain height in metres. */
  readonly height: number;
  /** Normalized final-Heightmap slope angle in the `[0, 1]` range. */
  readonly slope: number;
  /** Signed final-Heightmap curvature response in the `[-1, 1]` range. */
  readonly curvature: number;
  /** Continuous final-Heightmap rocky-slope ownership in the `[0, 1]` range. */
  readonly rockySlopeWeight: number;
  /** Final grass Texture Layer ownership in the `[0, 1]` range. */
  readonly grassSurfaceWeight: number;
  /** Process flow value. */
  readonly flow: number;
  /** Process moisture value. */
  readonly moisture: number;
  /** Continuous wetland support before the discrete water mask is applied. */
  readonly wetlandWeight: number;
  /** Distance to the canonical river network in metres. */
  readonly riverDistanceMetres: number;
  /** Distance to the nearest real lake, sea, or river boundary in metres. */
  readonly waterBoundaryDistanceMetres: number;
  /** Distance to the planned road network in metres. */
  readonly roadDistanceMetres: number;
  /** Habitat classification. */
  readonly landCover: SeedWorldLandCover;
  /** Whether the point belongs to a water surface. */
  readonly water: boolean;
}

/**
 * Compiles terrain, process, material, and water fields from one world plan.
 * @param plan Authoritative semantic plan.
 * @param options Optional deterministic resolution reduction used only by tests.
 * @returns Volatile in-memory field data; no asset files are created.
 * @throws {RangeError} When resolutions or the FBM profile cannot represent the requested field.
 */
export function compileSeedWorldFields(
  plan: SeedWorldPlan,
  options: SeedWorldFieldCompileOptions = {}
): SeedWorldFields {
  const heightResolution = options.heightResolution ?? SEED_WORLD_HEIGHT_RESOLUTION;
  const surfaceResolution = options.surfaceResolution ?? SEED_WORLD_SURFACE_RESOLUTION;
  const fbm = options.fbm ?? SEED_WORLD_DEFAULT_FBM;
  const wetlandBasinStyle = options.wetlandBasinStyle ?? SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE;
  validateResolutions(heightResolution, surfaceResolution);
  validateSeedWorldFbmParameters(fbm, plan.sizeMetres);
  validateWetlandBasinStyle(wetlandBasinStyle);
  const heightSamples = new Uint16Array(heightResolution * heightResolution);
  const materialWeights = new Uint8Array(surfaceResolution * surfaceResolution * 4);
  const rockySlopeWeight = new Uint8Array(surfaceResolution * surfaceResolution);
  const waterMask = new Uint8Array(surfaceResolution * surfaceResolution);
  const flow = new Uint8Array(surfaceResolution * surfaceResolution);
  const sediment = new Uint8Array(surfaceResolution * surfaceResolution);
  const wetness = new Uint8Array(surfaceResolution * surfaceResolution);
  const wetlandWeight = new Uint8Array(surfaceResolution * surfaceResolution);
  const riverBankDistanceMetres = new Float32Array(surfaceResolution * surfaceResolution);
  const wetlandWaterLevelMetres = new Float32Array(surfaceResolution * surfaceResolution);
  const habitat = new Uint8Array(surfaceResolution * surfaceResolution);
  const riverCurves = options.riverCurves ?? compileSeedWorldRiverCurves(plan);
  const riverCurveSamples = Object.freeze(
    riverCurves.map((curve) =>
      sampleSeedWorldRiverCurve(curve, plan.sizeMetres, SEED_WORLD_HIGH_RES_RIVER_CURVE_SPACING_METRES)
    )
  );
  const terrainStyleResolution = Math.min(heightResolution, SEED_WORLD_TERRAIN_STYLE_RESOLUTION);
  // Keep FBM band-limited at the style lattice, then apply coast and wetland support
  // at the published height lattice. A wetland basin is a feature SDF, not 8m detail
  // inside the FBM field; applying it after interpolation keeps Hfinal, water, and
  // material boundaries on the same continuous support.
  const naturalLandField = compileNaturalLandField(plan, terrainStyleResolution, fbm);
  const wetlandBasin = compileWetlandBasinField(
    plan,
    riverCurves,
    Math.max(surfaceResolution, terrainStyleResolution),
    wetlandBasinStyle,
    naturalLandField
  );
  for (let y = 0; y < heightResolution; y++) {
    const normalizedY = y / (heightResolution - 1);
    for (let x = 0; x < heightResolution; x++) {
      const normalizedX = x / (heightResolution - 1);
      const heightIndex = y * heightResolution + x;
      const naturalLandHeightMetres = samplePlanFloat(
        naturalLandField.heightMetres,
        terrainStyleResolution,
        normalizedX,
        normalizedY
      );
      const styleOffsetMetres = samplePlanFloat(
        naturalLandField.styleOffsetMetres,
        terrainStyleResolution,
        normalizedX,
        normalizedY
      );
      const naturalHeightMetres = applyNaturalTerrainFeatures(
        plan,
        normalizedX,
        normalizedY,
        naturalLandHeightMetres,
        styleOffsetMetres,
        wetlandBasinStyle,
        wetlandBasin
      );
      heightSamples[heightIndex] = encodeHeight(naturalHeightMetres);
    }
  }
  let hash = 0x811c9dc5;
  for (const sample of heightSamples) hash = hashUint32(hash, sample);
  hash = hashWetlandBasinStyle(hash, wetlandBasinStyle);

  const surfaceRiverField = rasterizeSeedWorldRiverField(riverCurves, {
    resolution: surfaceResolution,
    sizeMetres: plan.sizeMetres,
    sampleOffset: 0.5,
    bankExpansionMetres: SEED_WORLD_WETLAND_BANK_EXPANSION_METRES,
    distanceFieldMarginMetres: SEED_WORLD_WETLAND_SDF_TRANSITION_METRES,
    curveSampleSpacingMetres: SEED_WORLD_HIGH_RES_RIVER_CURVE_SPACING_METRES,
    curveSamples: riverCurveSamples
  });
  for (let index = 0; index < riverBankDistanceMetres.length; index++) {
    const distance = surfaceRiverField.bankDistanceMetres[index]!;
    riverBankDistanceMetres[index] = Number.isFinite(distance) ? distance : plan.sizeMetres;
  }
  const roadField = rasterizeRoadField(plan, surfaceResolution);
  for (let y = 0; y < surfaceResolution; y++) {
    const normalizedY = (y + 0.5) / surfaceResolution;
    for (let x = 0; x < surfaceResolution; x++) {
      const normalizedX = (x + 0.5) / surfaceResolution;
      const index = y * surfaceResolution + x;
      const centerHeight = sampleHeightBilinear(heightSamples, heightResolution, normalizedX, normalizedY);
      const shape = sampleHeightShapeAtNormalizedPosition(
        heightSamples,
        heightResolution,
        plan.sizeMetres,
        normalizedX,
        normalizedY,
        centerHeight
      );
      rockySlopeWeight[index] = Math.round(seedWorldRockySlopeWeight(shape.slope) * 255);
      const canonicalWetlandWeight = sampleWetlandBasinWeight(wetlandBasin, normalizedX, normalizedY);
      const surface = evaluateNaturalSurface(
        plan,
        normalizedX,
        normalizedY,
        shape,
        riverFieldSample(surfaceRiverField, index),
        sampleWetlandBasinMaterialWeight(wetlandBasin, wetlandBasinStyle, normalizedX, normalizedY),
        canonicalWetlandWeight,
        roadField[index]
      );
      const materialOffset = index * 4;
      writeMaterialWeights(materialWeights, materialOffset, surface.materialWeights);
      waterMask[index] = surface.water ? 255 : 0;
      flow[index] = Math.round(surface.flow * 255);
      sediment[index] = Math.round(surface.sediment * 255);
      wetness[index] = Math.round(surface.wetness * 255);
      wetlandWeight[index] = Math.round(surface.wetland * 255);
      wetlandWaterLevelMetres[index] = sampleWetlandBasinWaterLevel(wetlandBasin, normalizedX, normalizedY);
      habitat[index] = surface.landCover;
      for (let channel = 0; channel < 4; channel++) {
        hash = hashUint32(hash, materialWeights[materialOffset + channel]);
      }
      hash = hashUint32(hash, waterMask[index]);
      hash = hashUint32(hash, flow[index]);
      hash = hashUint32(hash, sediment[index]);
      hash = hashUint32(hash, wetness[index]);
      hash = hashUint32(hash, wetlandWeight[index]);
      hash = hashUint32(hash, Math.round(riverBankDistanceMetres[index]! * 1_000));
      hash = hashUint32(hash, rockySlopeWeight[index]);
      hash = hashUint32(hash, Math.round(wetlandWaterLevelMetres[index] * 1_000));
      hash = hashUint32(hash, habitat[index]);
    }
  }

  return {
    rootSeed: plan.rootSeed,
    sizeMetres: plan.sizeMetres,
    heightResolution,
    surfaceResolution,
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
    wetlandBasinStyle,
    riverCurves,
    riverCurveSamples,
    hydrologyGeometryHash: 0,
    hydrologyBakeHash: 0,
    hash: hash >>> 0
  };
}

/**
 * Area-filters material and process fields into one smaller runtime coverage grid.
 * @param fields Source fields whose Heightmap remains unchanged.
 * @param surfaceResolution Target Alphamap and DensityField resolution.
 * @returns Independent runtime fields sharing the source Heightmap and canonical vector features.
 * @throws {RangeError} When the target does not evenly divide the source surface lattice.
 */
export function resampleSeedWorldSurfaceFields(fields: SeedWorldFields, surfaceResolution: number): SeedWorldFields {
  if (
    !Number.isInteger(surfaceResolution) ||
    surfaceResolution < 3 ||
    fields.surfaceResolution % surfaceResolution !== 0
  ) {
    throw new RangeError("Seed World runtime surface resolution must evenly divide the compiled surface lattice");
  }
  if (surfaceResolution === fields.surfaceResolution) return fields;

  const factor = fields.surfaceResolution / surfaceResolution;
  const sampleCount = factor * factor;
  const cellCount = surfaceResolution * surfaceResolution;
  const materialWeights = new Uint8Array(cellCount * 4);
  const rockySlopeWeight = new Uint8Array(cellCount);
  const waterMask = new Uint8Array(cellCount);
  const flow = new Uint8Array(cellCount);
  const sediment = new Uint8Array(cellCount);
  const wetness = new Uint8Array(cellCount);
  const wetlandWeight = new Uint8Array(cellCount);
  const riverBankDistanceMetres = new Float32Array(cellCount);
  const wetlandWaterLevelMetres = new Float32Array(cellCount);
  const habitat = new Uint8Array(cellCount);

  for (let outputY = 0; outputY < surfaceResolution; outputY++) {
    for (let outputX = 0; outputX < surfaceResolution; outputX++) {
      const outputIndex = outputY * surfaceResolution + outputX;
      const byteSums = [0, 0, 0, 0];
      let rockySlopeSum = 0;
      let flowSum = 0;
      let sedimentSum = 0;
      let wetnessSum = 0;
      let wetlandSum = 0;
      let riverBankDistanceSum = 0;
      let waterLevelSum = 0;
      for (let localY = 0; localY < factor; localY++) {
        const sourceY = outputY * factor + localY;
        for (let localX = 0; localX < factor; localX++) {
          const sourceX = outputX * factor + localX;
          const sourceIndex = sourceY * fields.surfaceResolution + sourceX;
          const materialOffset = sourceIndex * 4;
          for (let channel = 0; channel < 4; channel++) {
            byteSums[channel] += fields.materialWeights[materialOffset + channel]!;
          }
          rockySlopeSum += fields.rockySlopeWeight[sourceIndex]!;
          flowSum += fields.flow[sourceIndex]!;
          sedimentSum += fields.sediment[sourceIndex]!;
          wetnessSum += fields.wetness[sourceIndex]!;
          wetlandSum += fields.wetlandWeight[sourceIndex]!;
          riverBankDistanceSum += fields.riverBankDistanceMetres[sourceIndex]!;
          waterLevelSum += fields.wetlandWaterLevelMetres[sourceIndex]!;
        }
      }
      writeAveragedMaterialWeights(materialWeights, outputIndex * 4, byteSums, sampleCount);
      rockySlopeWeight[outputIndex] = Math.round(rockySlopeSum / sampleCount);
      flow[outputIndex] = Math.round(flowSum / sampleCount);
      sediment[outputIndex] = Math.round(sedimentSum / sampleCount);
      wetness[outputIndex] = Math.round(wetnessSum / sampleCount);
      wetlandWeight[outputIndex] = Math.round(wetlandSum / sampleCount);
      riverBankDistanceMetres[outputIndex] = riverBankDistanceSum / sampleCount;
      wetlandWaterLevelMetres[outputIndex] = waterLevelSum / sampleCount;

      const centerX = Math.min(fields.surfaceResolution - 1, outputX * factor + Math.floor(factor * 0.5));
      const centerY = Math.min(fields.surfaceResolution - 1, outputY * factor + Math.floor(factor * 0.5));
      const centerIndex = centerY * fields.surfaceResolution + centerX;
      waterMask[outputIndex] = fields.waterMask[centerIndex]!;
      habitat[outputIndex] = fields.habitat[centerIndex]!;
    }
  }

  let hash = 0x811c9dc5;
  for (const sample of fields.heightSamples) hash = hashUint32(hash, sample);
  hash = hashWetlandBasinStyle(hash, fields.wetlandBasinStyle);
  for (let index = 0; index < cellCount; index++) {
    const materialOffset = index * 4;
    for (let channel = 0; channel < 4; channel++) hash = hashUint32(hash, materialWeights[materialOffset + channel]!);
    hash = hashUint32(hash, waterMask[index]!);
    hash = hashUint32(hash, flow[index]!);
    hash = hashUint32(hash, sediment[index]!);
    hash = hashUint32(hash, wetness[index]!);
    hash = hashUint32(hash, wetlandWeight[index]!);
    hash = hashUint32(hash, Math.round(riverBankDistanceMetres[index]! * 1_000));
    hash = hashUint32(hash, rockySlopeWeight[index]!);
    hash = hashUint32(hash, Math.round(wetlandWaterLevelMetres[index]! * 1_000));
    hash = hashUint32(hash, habitat[index]!);
  }

  return Object.freeze({
    ...fields,
    surfaceResolution,
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
    hash: hash >>> 0
  });
}

/** Retained input/output storage for repeated world-height queries. */
export class SeedWorldHeightSample {
  x = 0;
  z = 0;
  height = 0;
}

/** Lower X boundary; existing Seed worlds default to a centered domain. */
export function seedWorldOriginX(fields: Pick<SeedWorldFields, "sizeMetres" | "worldOrigin">): number {
  return fields.worldOrigin?.[0] ?? -fields.sizeMetres / 2;
}
/** Lower Z boundary shared by terrain, population residency and culling. */
export function seedWorldOriginZ(fields: Pick<SeedWorldFields, "sizeMetres" | "worldOrigin">): number {
  return fields.worldOrigin?.[1] ?? -fields.sizeMetres / 2;
}
/** Decode a canonical R16 sample using its producer's metadata or the legacy Seed range. */
export function decodeSeedWorldHeight(fields: Pick<SeedWorldFields, "heightDecode">, encoded: number): number {
  return (
    (fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum) +
    (encoded / 65535) *
      (fields.heightDecode?.scale ?? SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum)
  );
}
/** Sample inclusive final terrain; outside the authored world returns undefined. */
export function sampleSeedWorldHeight(
  fields: Pick<
    SeedWorldFields,
    "sizeMetres" | "worldOrigin" | "heightDecode" | "heightSamples" | "heightResolution" | "surfaceHeights"
  >,
  worldX: number,
  worldZ: number
): number | undefined {
  const x = (worldX - seedWorldOriginX(fields)) / fields.sizeMetres,
    z = (worldZ - seedWorldOriginZ(fields)) / fields.sizeMetres;
  const epsilon = Number.EPSILON * 8;
  if (x < -epsilon || x > 1 + epsilon || z < -epsilon || z > 1 + epsilon) return undefined;
  if (fields.surfaceHeights)
    return sampleTerrainGrid(
      {
        origin: [seedWorldOriginX(fields), seedWorldOriginZ(fields)],
        spacing: fields.sizeMetres / (fields.heightResolution - 1),
        spacingZ: fields.sizeMetres / (fields.heightResolution - 1),
        columns: fields.heightResolution,
        rows: fields.heightResolution
      },
      worldX,
      worldZ,
      (ix, iz) => fields.surfaceHeights![iz * fields.heightResolution + ix]
    );
  return decodeSeedWorldHeight(fields, samplePlanFloat(fields.heightSamples, fields.heightResolution, x, z));
}
/** Samples into retained coordinates/height storage; outside the world leaves height unchanged. */
export function sampleSeedWorldHeightInto(fields: SeedWorldFields, sample: SeedWorldHeightSample): boolean {
  const height = sampleSeedWorldHeight(fields, sample.x, sample.z);
  if (height === undefined) return false;
  sample.height = height;
  return true;
}

/**
 * Samples semantic population inputs without materializing a density texture.
 * @param plan Authoritative semantic plan.
 * @param fields Generated field set.
 * @param worldX World X coordinate in metres.
 * @param worldZ World Z coordinate in metres.
 * @returns Population inputs, or `undefined` outside the world bounds.
 */
export function sampleSeedWorldPopulation(
  plan: Pick<SeedWorldPlan, "sizeMetres" | "resolution" | "roadDistance"> &
    Partial<Pick<SeedWorldPlan, "coastShape">> & { readonly worldOrigin?: readonly [number, number] },
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number
): SeedWorldPopulationSample | undefined {
  const normalized = normalizeWorldPosition(fields.sizeMetres, worldX, worldZ, fields.worldOrigin);
  if (!normalized) return undefined;
  const riverDistance = Math.max(
    0,
    samplePlanFloat(fields.riverBankDistanceMetres, fields.surfaceResolution, normalized.x, normalized.y)
  );
  const waterBoundaryDistance = sampleSeedWorldWaterBoundaryDistanceMetres(plan, fields, worldX, worldZ)!;
  const roadDistance = sampleSeedWorldRoadDistanceMetres(plan, worldX, worldZ)!;
  const surfaceIndex = normalizedToSurfaceIndex(fields.surfaceResolution, normalized.x, normalized.y);
  const height = sampleSeedWorldHeight(fields, worldX, worldZ);
  if (height === undefined) return undefined;
  const shape = sampleHeightShape(fields, worldX, worldZ, height);
  return {
    height,
    slope: shape.slope,
    curvature: shape.curvature,
    rockySlopeWeight: fields.rockySlopeWeight[surfaceIndex] / 255,
    grassSurfaceWeight: fields.materialWeights[surfaceIndex * 4] / 255,
    flow: fields.flow[surfaceIndex] / 255,
    moisture: fields.wetness[surfaceIndex] / 255,
    wetlandWeight: fields.wetlandWeight[surfaceIndex] / 255,
    riverDistanceMetres: riverDistance,
    waterBoundaryDistanceMetres: waterBoundaryDistance,
    roadDistanceMetres: roadDistance,
    landCover: fields.habitat[surfaceIndex] as SeedWorldLandCover,
    water: fields.waterMask[surfaceIndex] !== 0
  };
}

/** Samples the nearest lake, sea, or river boundary distance without evaluating terrain shape. */
export function sampleSeedWorldWaterBoundaryDistanceMetres(
  plan: Pick<SeedWorldPlan, "sizeMetres"> & Partial<Pick<SeedWorldPlan, "coastShape">>,
  fields: Pick<
    SeedWorldFields,
    "sizeMetres" | "surfaceResolution" | "riverBankDistanceMetres" | "worldOrigin" | "waterBoundaryDistanceMetres"
  >,
  worldX: number,
  worldZ: number
): number | undefined {
  const normalized = normalizeWorldPosition(fields.sizeMetres, worldX, worldZ, fields.worldOrigin);
  if (!normalized || plan.sizeMetres !== fields.sizeMetres) return undefined;
  if (fields.waterBoundaryDistanceMetres)
    return Math.max(
      0,
      samplePlanFloat(fields.waterBoundaryDistanceMetres, fields.surfaceResolution, normalized.x, normalized.y)
    );
  const inlandWaterDistance = samplePlanFloat(
    fields.riverBankDistanceMetres,
    fields.surfaceResolution,
    normalized.x,
    normalized.y
  );
  const coastDistance = plan.coastShape ? sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, normalized) : Infinity;
  return Math.max(0, Math.min(inlandWaterDistance, coastDistance));
}

/** Samples planned road-centre distance in world metres without evaluating terrain shape. */
export function sampleSeedWorldRoadDistanceMetres(
  plan: Pick<SeedWorldPlan, "sizeMetres" | "resolution" | "roadDistance"> & {
    readonly worldOrigin?: readonly [number, number];
  },
  worldX: number,
  worldZ: number
): number | undefined {
  const normalized = normalizeWorldPosition(plan.sizeMetres, worldX, worldZ, plan.worldOrigin);
  if (!normalized) return undefined;
  return (
    samplePlanFloat(plan.roadDistance, plan.resolution, normalized.x, normalized.y) *
    (plan.sizeMetres / (plan.resolution - 1))
  );
}

function sampleHeightShape(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  centerHeight: number
): { readonly slope: number; readonly curvature: number } {
  const normalized = normalizeWorldPosition(fields.sizeMetres, worldX, worldZ, fields.worldOrigin);
  if (!normalized) return { slope: 0, curvature: 0 };
  if (fields.surfaceHeights) {
    const step = Math.max(8, fields.sizeMetres / (fields.heightResolution - 1)),
      ox = seedWorldOriginX(fields),
      oz = seedWorldOriginZ(fields),
      sample = (x: number, z: number) =>
        sampleSeedWorldHeight(fields, clamp(x, ox, ox + fields.sizeMetres), clamp(z, oz, oz + fields.sizeMetres))!;
    const left = sample(worldX - step, worldZ),
      right = sample(worldX + step, worldZ),
      near = sample(worldX, worldZ - step),
      far = sample(worldX, worldZ + step);
    return {
      slope: Math.atan(Math.hypot((right - left) / (2 * step), (far - near) / (2 * step))) / (Math.PI * 0.5),
      curvature: clamp(((left + right + near + far) * 0.25 - centerHeight) / step, -1, 1)
    };
  }
  return sampleHeightShapeAtNormalizedPosition(
    fields.heightSamples,
    fields.heightResolution,
    fields.sizeMetres,
    normalized.x,
    normalized.y,
    centerHeight,
    fields.heightDecode
  );
}

function sampleHeightShapeAtNormalizedPosition(
  heightSamples: Uint16Array,
  heightResolution: number,
  sizeMetres: number,
  normalizedX: number,
  normalizedY: number,
  centerHeight: number,
  heightDecode?: Readonly<{ offset: number; scale: number }>
): { readonly height: number; readonly slope: number; readonly curvature: number } {
  const sampleSpacingMetres = sizeMetres / (heightResolution - 1);
  const stepMetres = Math.max(8, sampleSpacingMetres);
  const stepNormalized = stepMetres / sizeMetres;
  const left = sampleHeightBilinear(
    heightSamples,
    heightResolution,
    normalizedX - stepNormalized,
    normalizedY,
    heightDecode
  );
  const right = sampleHeightBilinear(
    heightSamples,
    heightResolution,
    normalizedX + stepNormalized,
    normalizedY,
    heightDecode
  );
  const near = sampleHeightBilinear(
    heightSamples,
    heightResolution,
    normalizedX,
    normalizedY - stepNormalized,
    heightDecode
  );
  const far = sampleHeightBilinear(
    heightSamples,
    heightResolution,
    normalizedX,
    normalizedY + stepNormalized,
    heightDecode
  );
  const gradientX = (right - left) / (2 * stepMetres);
  const gradientZ = (far - near) / (2 * stepMetres);
  const slope = Math.atan(Math.hypot(gradientX, gradientZ)) / (Math.PI * 0.5);
  const neighbourAverage = (left + right + near + far) * 0.25;
  const curvature = clamp((neighbourAverage - centerHeight) / stepMetres, -1, 1);
  return { height: centerHeight, slope, curvature };
}

/**
 * Converts one normalized final-Heightmap slope angle into continuous rocky-surface ownership.
 * @param normalizedSlope Slope angle normalized so one is ninety degrees.
 * @returns Rocky ownership in the `[0, 1]` range.
 */
export function seedWorldRockySlopeWeight(normalizedSlope: number): number {
  return smoothstep(
    SEED_WORLD_ROCKY_SLOPE_START_DEGREES / 90,
    SEED_WORLD_ROCKY_SLOPE_FULL_DEGREES / 90,
    normalizedSlope
  );
}

/**
 * Returns transferable buffers for worker publication without leaking implementation details to callers.
 * @param fields Generated field set.
 * @returns Transferable raster buffers.
 */
export function seedWorldFieldTransferables(fields: SeedWorldFields): Transferable[] {
  return [
    fields.heightSamples.buffer,
    ...(fields.surfaceHeights ? [fields.surfaceHeights.buffer] : []),
    fields.materialWeights.buffer,
    fields.rockySlopeWeight.buffer,
    fields.waterMask.buffer,
    fields.flow.buffer,
    fields.sediment.buffer,
    fields.wetness.buffer,
    fields.wetlandWeight.buffer,
    fields.riverBankDistanceMetres.buffer,
    fields.wetlandWaterLevelMetres.buffer,
    fields.habitat.buffer
  ];
}

function evaluateNaturalSurface(
  plan: SeedWorldPlan,
  normalizedX: number,
  normalizedY: number,
  shape: Readonly<{ readonly height: number; readonly slope: number; readonly curvature: number }>,
  river: {
    readonly channel: number;
    readonly bankDistanceMetres: number;
    readonly flow: number;
    readonly water: boolean;
  },
  materialWetland: number,
  canonicalWetland: number,
  road: number
): {
  readonly materialWeights: readonly [number, number, number, number];
  readonly water: boolean;
  readonly flow: number;
  readonly sediment: number;
  readonly wetness: number;
  readonly wetland: number;
  readonly landCover: SeedWorldLandCover;
} {
  const flow = Math.max(samplePlanFloat(plan.flow, plan.resolution, normalizedX, normalizedY), river.flow);
  const moisture = samplePlanFloat(plan.moisture, plan.resolution, normalizedX, normalizedY);
  const landCover = samplePlanNearest(plan.landCover, plan.resolution, normalizedX, normalizedY) as SeedWorldLandCover;
  const coastFieldMetres = plan.geologyLayout
    ? shape.height - SEED_WORLD_SEA_LEVEL_METRES
    : sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, {
        x: normalizedX,
        y: normalizedY
      });
  const oceanWeight = plan.geologyLayout
    ? 1 - smoothstep(-2, 8, coastFieldMetres)
    : resolveSeedWorldRiparianSoilWeight(coastFieldMetres);
  const landWeight = 1 - oceanWeight;
  const channel = river.channel;
  const roadWeight = road * landWeight;
  const riverSoilWeight = resolveSeedWorldRiparianSoilWeight(river.bankDistanceMetres) * landWeight;
  const soilWeight = Math.max(oceanWeight, riverSoilWeight) * (1 - roadWeight);
  const grassWeight = 1 - roadWeight - soilWeight;
  const deposition = (materialWetland * 9 + channel * 5) * (0.35 + moisture * 0.65);
  const sediment = clamp01(deposition / 12);
  return {
    materialWeights: [grassWeight, soilWeight, 0, roadWeight],
    water: river.water || coastFieldMetres < 0,
    flow,
    sediment,
    wetness: resolveSeedWorldRiparianMoisture({
      baselineMoisture: clamp01(moisture + oceanWeight),
      inlandWaterDistanceMetres: river.bankDistanceMetres,
      slope: shape.slope,
      flow,
      sediment
    }),
    wetland: canonicalWetland * landWeight * (1 - roadWeight),
    landCover: landCover === SeedWorldLandCover.Wetland ? SeedWorldLandCover.Grassland : landCover
  };
}

function compileTerrainHeights(
  plan: SeedWorldPlan,
  resolution: number,
  wetlandBasinStyle: SeedWorldWetlandBasinStyle,
  wetlandBasin: SeedWorldWetlandBasinField,
  naturalLandField: SeedWorldNaturalLandField
): Float32Array {
  const heights = new Float32Array(resolution * resolution);
  for (let y = 0; y < resolution; y++) {
    const normalizedY = y / (resolution - 1);
    for (let x = 0; x < resolution; x++) {
      const normalizedX = x / (resolution - 1);
      const index = y * resolution + x;
      heights[index] = applyNaturalTerrainFeatures(
        plan,
        normalizedX,
        normalizedY,
        naturalLandField.heightMetres[index]!,
        naturalLandField.styleOffsetMetres[index]!,
        wetlandBasinStyle,
        wetlandBasin
      );
    }
  }
  return heights;
}

interface SeedWorldNaturalLandField {
  readonly heightMetres: Float32Array;
  readonly styleOffsetMetres: Float32Array;
}

function compileNaturalLandField(
  plan: SeedWorldPlan,
  resolution: number,
  style: SeedWorldFbmParameters
): SeedWorldNaturalLandField {
  const heightMetres = new Float32Array(resolution * resolution);
  const styleOffsetMetres = new Float32Array(resolution * resolution);
  if (plan.geologyLayout) {
    const field = compileSeedWorldGeologyHeightfield(plan.geologyLayout, resolution, style);
    heightMetres.set(field.heights);
    styleOffsetMetres.set(field.foundationHeights);
    return { heightMetres, styleOffsetMetres };
  }
  const mountainUpliftMetres = new Float32Array(resolution * resolution);
  const seed = plan.stageSeeds.geology;
  for (let y = 0; y < resolution; y++) {
    const normalizedY = y / (resolution - 1);
    const worldZ = normalizedY * plan.sizeMetres - plan.sizeMetres * 0.5;
    for (let x = 0; x < resolution; x++) {
      const normalizedX = x / (resolution - 1);
      const worldX = normalizedX * plan.sizeMetres - plan.sizeMetres * 0.5;
      const warpX =
        centeredFbm(
          worldX / style.warpWavelengthMetres,
          worldZ / style.warpWavelengthMetres,
          seed ^ 0x8a5c_31d7,
          style.warpOctaves
        ) * style.warpAmplitudeMetres;
      const warpZ =
        centeredFbm(
          worldX / style.warpWavelengthMetres,
          worldZ / style.warpWavelengthMetres,
          seed ^ 0x4f13_b9a1,
          style.warpOctaves
        ) * style.warpAmplitudeMetres;
      const warpedX = worldX + warpX;
      const warpedZ = worldZ + warpZ;
      const rolling = centeredFbm(
        warpedX / style.rollingWavelengthMetres,
        warpedZ / style.rollingWavelengthMetres,
        seed ^ 0x6d9f_2b45,
        style.rollingOctaves
      );
      const detail = centeredFbm(
        warpedX / style.detailWavelengthMetres,
        warpedZ / style.detailWavelengthMetres,
        seed ^ 0x19c3_75ef,
        style.detailOctaves
      );
      const styleOffset = rolling * style.rollingAmplitudeMetres + detail * style.detailAmplitudeMetres;
      const point = { x: normalizedX, y: normalizedY };
      const index = y * resolution + x;
      styleOffsetMetres[index] = styleOffset;
      mountainUpliftMetres[index] = sampleSeedWorldMountainUpliftMetres(plan, point);
    }
  }
  const sampleSpacingMetres = plan.sizeMetres / (resolution - 1);
  const smoothingRadiusSamples = Math.round(SEED_WORLD_MOUNTAIN_LINEAR_SMOOTHING_METRES / sampleSpacingMetres);
  const smoothedMountainUpliftMetres = smoothScalarFieldLinear(
    mountainUpliftMetres,
    resolution,
    smoothingRadiusSamples
  );
  for (let index = 0; index < heightMetres.length; index++) {
    heightMetres[index] =
      SEED_WORLD_BASE_ELEVATION_METRES + styleOffsetMetres[index]! + smoothedMountainUpliftMetres[index]!;
  }
  return { heightMetres, styleOffsetMetres };
}

function smoothScalarFieldLinear(samples: Float32Array, resolution: number, radiusSamples: number): Float32Array {
  const horizontal = new Float32Array(samples.length);
  const smoothed = new Float32Array(samples.length);
  const sampleAxis = (source: Float32Array, target: Float32Array, horizontalAxis: boolean): void => {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        let weightedSum = 0;
        let weightSum = 0;
        for (let offset = -radiusSamples; offset <= radiusSamples; offset++) {
          const sampleX = horizontalAxis ? clampInteger(x + offset, 0, resolution - 1) : x;
          const sampleY = horizontalAxis ? y : clampInteger(y + offset, 0, resolution - 1);
          const weight = radiusSamples + 1 - Math.abs(offset);
          weightedSum += source[sampleY * resolution + sampleX]! * weight;
          weightSum += weight;
        }
        target[y * resolution + x] = weightedSum / weightSum;
      }
    }
  };
  sampleAxis(samples, horizontal, true);
  sampleAxis(horizontal, smoothed, false);
  return smoothed;
}

function applyNaturalTerrainFeatures(
  plan: SeedWorldPlan,
  normalizedX: number,
  normalizedY: number,
  naturalLandHeightMetres: number,
  styleOffsetMetres: number,
  wetlandBasinStyle: SeedWorldWetlandBasinStyle,
  wetlandBasin: SeedWorldWetlandBasinField
): number {
  const point = { x: normalizedX, y: normalizedY };
  const basin = sampleWetlandBasinProfile(wetlandBasin, wetlandBasinStyle, normalizedX, normalizedY);
  // River erosion is relative to the local terrain. Clamping every reach to the
  // horizontal water datum turns an elevated reach into a near-vertical canyon.
  const riverLandHeightMetres = naturalLandHeightMetres - basin.erosionDepthMetres;
  if (plan.geologyLayout) return riverLandHeightMetres;
  const coastFieldMetres = sampleSeedWorldCoastSignedFieldMetres(plan.coastShape, point);
  const offshore = smoothstep(0, SEED_WORLD_OCEAN_DEPTH_DISTANCE_METRES, -coastFieldMetres);
  const oceanFloorMetres = mix(
    SEED_WORLD_AUTHORED_COAST_TERRAIN_DATUM_METRES - 2,
    SEED_WORLD_DEEP_OCEAN_FLOOR_METRES + styleOffsetMetres * 0.08,
    offshore
  );
  const landBlend = smoothstep(
    SEED_WORLD_COAST_LAND_TRANSITION_START_METRES,
    SEED_WORLD_COAST_LAND_TRANSITION_END_METRES,
    coastFieldMetres
  );
  return mix(oceanFloorMetres, riverLandHeightMetres, landBlend);
}

function compileWetlandBasinField(
  plan: SeedWorldPlan,
  riverCurves: readonly SeedWorldRiverCurve[],
  resolution: number,
  style: SeedWorldWetlandBasinStyle,
  naturalLandField: SeedWorldNaturalLandField
): SeedWorldWetlandBasinField {
  const riverField = rasterizeSeedWorldRiverField(riverCurves, {
    resolution,
    sizeMetres: plan.sizeMetres,
    bankExpansionMetres: SEED_WORLD_WETLAND_BANK_EXPANSION_METRES,
    // The basin shoulder is evaluated from this same signed field. Clipping it to the
    // narrower material blend leaves +Infinity beside a nonzero shoulder sample.
    distanceFieldMarginMetres:
      style.shoulderMetres * (SEED_WORLD_BANK_FLAT_FEATHER_SCALE + SEED_WORLD_BANK_NOISE_FEATHER_AMPLITUDE),
    curveSampleSpacingMetres: SEED_WORLD_HIGH_RES_RIVER_CURVE_SPACING_METRES
  });
  const signedDistanceMetres = new Float32Array(resolution * resolution);
  const canonicalWeight = new Uint8Array(resolution * resolution);
  const coreDepthMetres = new Float32Array(resolution * resolution);
  const bankFeatherMetres = new Float32Array(resolution * resolution);
  const waterLevelMetres = new Float32Array(resolution * resolution);
  const depthScale = style.coreDepthMetres / SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE.coreDepthMetres;
  const naturalResolution = Math.round(Math.sqrt(naturalLandField.heightMetres.length));
  const naturalSampleSpacingMetres = plan.sizeMetres / (naturalResolution - 1);
  const noiseWavelengthMetres = Math.max(
    SEED_WORLD_BANK_NOISE_MINIMUM_WAVELENGTH_METRES,
    naturalSampleSpacingMetres * SEED_WORLD_BANK_NOISE_HEIGHT_SAMPLE_MULTIPLIER
  );
  const bankSeed = plan.stageSeeds.hydrology ^ 0x4c91_7a2d;
  const styleScale = style.shoulderMetres / SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE.shoulderMetres;
  for (let y = 0; y < resolution; y++) {
    const normalizedY = y / (resolution - 1);
    const worldZ = normalizedY * plan.sizeMetres - plan.sizeMetres * 0.5;
    for (let x = 0; x < resolution; x++) {
      const normalizedX = x / (resolution - 1);
      const worldX = normalizedX * plan.sizeMetres - plan.sizeMetres * 0.5;
      const index = y * resolution + x;
      const canonicalSignedDistance = sampleSeedWorldWetlandSignedDistanceMetres(riverField.bankDistanceMetres[index]);
      const authoredFeather = riverField.bankFeatherMetres[index];
      if (!Number.isFinite(canonicalSignedDistance) || authoredFeather <= 0) {
        signedDistanceMetres[index] = canonicalSignedDistance;
        continue;
      }
      const slopeDegrees = sampleNaturalLandSlopeDegrees(
        naturalLandField.heightMetres,
        naturalResolution,
        plan.sizeMetres,
        normalizedX,
        normalizedY
      );
      const slopeResponse = smoothstep(
        SEED_WORLD_BANK_SLOPE_RESPONSE_START_DEGREES,
        SEED_WORLD_BANK_SLOPE_RESPONSE_FULL_DEGREES,
        slopeDegrees
      );
      const adjustedFeather =
        authoredFeather * mix(SEED_WORLD_BANK_FLAT_FEATHER_SCALE, SEED_WORLD_BANK_STEEP_FEATHER_SCALE, slopeResponse);
      const noise = centeredFbm(worldX / noiseWavelengthMetres, worldZ / noiseWavelengthMetres, bankSeed, 2);
      const noiseOffset =
        noise * authoredFeather * SEED_WORLD_BANK_NOISE_FEATHER_AMPLITUDE * mix(1, 0.65, slopeResponse);
      const disturbedSignedDistance = canonicalSignedDistance - noiseOffset;
      signedDistanceMetres[index] =
        canonicalSignedDistance <= 0
          ? Math.min(canonicalSignedDistance, disturbedSignedDistance)
          : disturbedSignedDistance;
      bankFeatherMetres[index] = adjustedFeather;
      const canonicalFeather = authoredFeather * styleScale;
      const canonicalSupport =
        canonicalSignedDistance <= 0 ? 1 : 1 - smootherstep(0, canonicalFeather, canonicalSignedDistance);
      canonicalWeight[index] = Math.round(clamp01(canonicalSupport) * 255);
      coreDepthMetres[index] = Math.max(style.edgeDepthMetres, riverField.depthMetres[index] * depthScale);
    }
  }
  waterLevelMetres.fill(style.waterLevelMetres);
  return { resolution, signedDistanceMetres, canonicalWeight, coreDepthMetres, bankFeatherMetres, waterLevelMetres };
}

function sampleWetlandBasinProfile(
  field: SeedWorldWetlandBasinField,
  style: SeedWorldWetlandBasinStyle,
  normalizedX: number,
  normalizedY: number
): { readonly weight: number; readonly erosionDepthMetres: number } {
  const signedDistanceMetres = samplePlanFloat(field.signedDistanceMetres, field.resolution, normalizedX, normalizedY);
  if (!Number.isFinite(signedDistanceMetres)) return { weight: 0, erosionDepthMetres: 0 };
  const authoredBankFeatherMetres = samplePlanFloat(
    field.bankFeatherMetres,
    field.resolution,
    normalizedX,
    normalizedY
  );
  const bankFeatherMetres =
    authoredBankFeatherMetres * (style.shoulderMetres / SEED_WORLD_DEFAULT_WETLAND_BASIN_STYLE.shoulderMetres);
  const weight =
    signedDistanceMetres <= 0
      ? 1
      : bankFeatherMetres > 0
        ? 1 - smootherstep(0, bankFeatherMetres, signedDistanceMetres)
        : 0;
  const depthProgress =
    signedDistanceMetres >= 0
      ? 0
      : smootherstep(0, style.transitionMetres, -signedDistanceMetres) ** style.shelfExponent;
  const coreDepthMetres = samplePlanFloat(field.coreDepthMetres, field.resolution, normalizedX, normalizedY);
  const erosionDepthMetres =
    mix(style.edgeDepthMetres, Math.max(style.edgeDepthMetres, coreDepthMetres), depthProgress) * weight;
  return { weight, erosionDepthMetres };
}

function sampleWetlandBasinWeight(field: SeedWorldWetlandBasinField, normalizedX: number, normalizedY: number): number {
  return samplePlanFloat(field.canonicalWeight, field.resolution, normalizedX, normalizedY) / 255;
}

function sampleWetlandBasinMaterialWeight(
  field: SeedWorldWetlandBasinField,
  style: SeedWorldWetlandBasinStyle,
  normalizedX: number,
  normalizedY: number
): number {
  return sampleWetlandBasinProfile(field, style, normalizedX, normalizedY).weight;
}

function sampleWetlandBasinWaterLevel(
  field: SeedWorldWetlandBasinField,
  normalizedX: number,
  normalizedY: number
): number {
  return samplePlanFloat(field.waterLevelMetres, field.resolution, normalizedX, normalizedY);
}

function sampleNaturalLandSlopeDegrees(
  heightMetres: Float32Array,
  resolution: number,
  sizeMetres: number,
  normalizedX: number,
  normalizedY: number
): number {
  const spacingMetres = sizeMetres / (resolution - 1);
  const offset = 1 / (resolution - 1);
  const left = samplePlanFloat(heightMetres, resolution, normalizedX - offset, normalizedY);
  const right = samplePlanFloat(heightMetres, resolution, normalizedX + offset, normalizedY);
  const back = samplePlanFloat(heightMetres, resolution, normalizedX, normalizedY - offset);
  const front = samplePlanFloat(heightMetres, resolution, normalizedX, normalizedY + offset);
  return (
    (Math.atan(Math.hypot((right - left) / (2 * spacingMetres), (front - back) / (2 * spacingMetres))) * 180) / Math.PI
  );
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

function centeredFbm(x: number, y: number, seed: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += valueNoise(x * frequency, y * frequency, seed + Math.imul(octave, 0x9e37_79b1)) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return (sum / weight) * 2 - 1;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = quintic(x - x0);
  const ty = quintic(y - y0);
  const top = mix(latticeNoise(x0, y0, seed), latticeNoise(x0 + 1, y0, seed), tx);
  const bottom = mix(latticeNoise(x0, y0 + 1, seed), latticeNoise(x0 + 1, y0 + 1, seed), tx);
  return mix(top, bottom, ty);
}

function latticeNoise(x: number, y: number, seed: number): number {
  return avalanche32((Math.imul(x, 0x1f12_3bb5) ^ Math.imul(y, 0x5f35_6495) ^ seed) >>> 0) / 0xffff_ffff;
}

function avalanche32(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rasterizeRoadField(plan: SeedWorldPlan, resolution: number): Float32Array {
  return compileSeedWorldRoadSurfaceCoverage(plan, resolution, 4);
}

function writeMaterialWeights(
  target: Uint8Array,
  offset: number,
  weights: readonly [number, number, number, number]
): void {
  let remaining = 255;
  for (let index = 0; index < 3; index++) {
    const value = Math.min(remaining, Math.round(clamp01(weights[index]) * 255));
    target[offset + index] = value;
    remaining -= value;
  }
  target[offset + 3] = remaining;
}

function writeAveragedMaterialWeights(
  target: Uint8Array,
  offset: number,
  channelSums: readonly number[],
  sampleCount: number
): void {
  const fractions: Array<{ readonly channel: number; readonly fraction: number }> = [];
  let remaining = 255;
  for (let channel = 0; channel < 4; channel++) {
    const average = channelSums[channel]! / sampleCount;
    const value = Math.floor(average);
    target[offset + channel] = value;
    remaining -= value;
    fractions.push({ channel, fraction: average - value });
  }
  fractions.sort((left, right) => right.fraction - left.fraction || left.channel - right.channel);
  for (let index = 0; index < remaining; index++) target[offset + fractions[index]!.channel]++;
}

function riverFieldSample(
  field: SeedWorldRiverField,
  index: number
): {
  readonly channel: number;
  readonly bankDistanceMetres: number;
  readonly flow: number;
  readonly water: boolean;
} {
  return {
    channel: field.channel[index],
    bankDistanceMetres: field.bankDistanceMetres[index],
    flow: field.flow[index],
    water: field.water[index] !== 0
  };
}

/**
 * Rejects FBM profiles whose values or shortest octave cannot be represented by the baked Heightmap.
 * @param parameters Candidate debug profile.
 * @param sizeMetres World edge length in metres.
 * @throws {RangeError} When values are invalid or contain an undersampled octave.
 */
export function validateSeedWorldFbmParameters(parameters: SeedWorldFbmParameters, sizeMetres: number): void {
  const scalars = [
    parameters.rollingWavelengthMetres,
    parameters.rollingAmplitudeMetres,
    parameters.detailWavelengthMetres,
    parameters.detailAmplitudeMetres,
    parameters.warpWavelengthMetres,
    parameters.warpAmplitudeMetres
  ];
  if (scalars.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Seed World FBM amplitudes and wavelengths must be finite non-negative numbers");
  }
  if (
    parameters.rollingWavelengthMetres <= 0 ||
    parameters.detailWavelengthMetres <= 0 ||
    parameters.warpWavelengthMetres <= 0
  ) {
    throw new RangeError("Seed World FBM wavelengths must be positive");
  }
  const octaveCounts = [parameters.rollingOctaves, parameters.detailOctaves, parameters.warpOctaves];
  if (octaveCounts.some((value) => !Number.isInteger(value) || value < 1 || value > 8)) {
    throw new RangeError("Seed World FBM octave counts must be integers from 1 to 8");
  }
  const minimumFeatureMetres = (sizeMetres / (SEED_WORLD_TERRAIN_STYLE_RESOLUTION - 1)) * 4;
  const bands = [
    [parameters.rollingWavelengthMetres, parameters.rollingOctaves],
    [parameters.detailWavelengthMetres, parameters.detailOctaves],
    [parameters.warpWavelengthMetres, parameters.warpOctaves]
  ] as const;
  if (bands.some(([wavelength, octaves]) => wavelength / 2 ** (octaves - 1) < minimumFeatureMetres)) {
    throw new RangeError(`Seed World FBM minimum octave wavelength must be at least ${minimumFeatureMetres}m`);
  }
}

/**
 * Validates the shared wetland-basin shape used by Terrain and standing water.
 * @param style Candidate basin profile.
 * @throws {RangeError} When a depth, transition, or exponent cannot form a continuous basin.
 */
export function validateWetlandBasinStyle(style: SeedWorldWetlandBasinStyle): void {
  const values = [
    style.waterLevelMetres,
    style.edgeDepthMetres,
    style.coreDepthMetres,
    style.shoulderMetres,
    style.transitionMetres,
    style.shelfExponent
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Seed World wetland basin values must be finite");
  }
  if (style.edgeDepthMetres < 0 || style.coreDepthMetres < style.edgeDepthMetres) {
    throw new RangeError("Seed World wetland core depth must be at least the edge depth");
  }
  if (style.shoulderMetres <= 0 || style.transitionMetres <= 0 || style.shelfExponent <= 0) {
    throw new RangeError("Seed World wetland basin shoulder, transition, and shelf exponent must be positive");
  }
}

function validateResolutions(heightResolution: number, surfaceResolution: number): void {
  if (
    !Number.isInteger(heightResolution) ||
    heightResolution < 4 ||
    (heightResolution - 1) % 3 !== 0 ||
    !Number.isInteger(surfaceResolution) ||
    surfaceResolution < 3 ||
    surfaceResolution % 3 !== 0
  ) {
    throw new RangeError("Seed World fields require a 3x3-compatible height and surface resolution");
  }
}

function normalizeWorldPosition(
  sizeMetres: number,
  worldX: number,
  worldZ: number,
  worldOrigin?: readonly [number, number]
): { readonly x: number; readonly y: number } | undefined {
  const originX = worldOrigin?.[0] ?? -sizeMetres * 0.5;
  const originZ = worldOrigin?.[1] ?? -sizeMetres * 0.5;
  const x = (worldX - originX) / sizeMetres,
    y = (worldZ - originZ) / sizeMetres;
  const epsilon = Number.EPSILON * 8;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < -epsilon || x > 1 + epsilon || y < -epsilon || y > 1 + epsilon)
    return undefined;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

function sampleHeightBilinear(
  samples: Uint16Array,
  resolution: number,
  normalizedX: number,
  normalizedY: number,
  heightDecode?: Readonly<{ offset: number; scale: number }>
): number {
  return decodeSeedWorldHeight({ heightDecode }, samplePlanFloat(samples, resolution, normalizedX, normalizedY));
}

function decodeHeight(value: number): number {
  return (
    SEED_WORLD_HEIGHT_RANGE.minimum +
    (value / 65535) * (SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum)
  );
}

function samplePlanFloat(
  samples: ArrayLike<number>,
  resolution: number,
  normalizedX: number,
  normalizedY: number
): number {
  const x = clamp(normalizedX, 0, 1) * (resolution - 1);
  const y = clamp(normalizedY, 0, 1) * (resolution - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const y1 = Math.min(resolution - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = mix(samples[y0 * resolution + x0], samples[y0 * resolution + x1], tx);
  const bottom = mix(samples[y1 * resolution + x0], samples[y1 * resolution + x1], tx);
  return mix(top, bottom, ty);
}

function samplePlanNearest(
  samples: ArrayLike<number>,
  resolution: number,
  normalizedX: number,
  normalizedY: number
): number {
  const x = Math.round(clamp(normalizedX, 0, 1) * (resolution - 1));
  const y = Math.round(clamp(normalizedY, 0, 1) * (resolution - 1));
  return samples[y * resolution + x];
}

function normalizedToSurfaceIndex(resolution: number, normalizedX: number, normalizedY: number): number {
  const x = Math.min(resolution - 1, Math.floor(clamp(normalizedX, 0, 1) * resolution));
  const y = Math.min(resolution - 1, Math.floor(clamp(normalizedY, 0, 1) * resolution));
  return y * resolution + x;
}

function encodeHeight(height: number): number {
  const normalized =
    (height - SEED_WORLD_HEIGHT_RANGE.minimum) / (SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum);
  return Math.round(clamp01(normalized) * 65535);
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x01000193) >>> 0;
}

function hashWetlandBasinStyle(hash: number, style: SeedWorldWetlandBasinStyle): number {
  const values = [
    style.waterLevelMetres,
    style.edgeDepthMetres,
    style.coreDepthMetres,
    style.shoulderMetres,
    style.transitionMetres,
    style.shelfExponent
  ];
  for (const value of values) hash = hashUint32(hash, Math.round(value * 1_000));
  return hash;
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
