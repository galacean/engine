import {
  compileSeedWorldDebrisDecorations,
  compileSeedWorldDecorations,
  compileSeedWorldMushroomDecorations,
  type SeedWorldFeatureDecorationInstance,
  type SeedWorldPresentationDecorationInstance
} from "@galacean/engine-world-planning/world/SeedWorldDecorations";
import { bakeTerrainNormalSamples } from "@galacean/engine-terrain/terrain/clipmap/TerrainNormalAtlas";
import { loadTerrainCompilerBinary } from "@galacean/engine-terrain/terrain/loader/TerrainCompilerBinaryLoader";
import {
  seedWorldPresentationRasterTransferables,
  type SeedWorldAuthoritativePresentationSourceV2,
  type SeedWorldCompileResult,
  type SeedWorldLakeShorePlacementBodyV1,
  type SeedWorldPresentationCompileResult
} from "./SeedWorldFieldWorkerProtocol.ts";
import {
  resampleSeedWorldSurfaceFields,
  SEED_WORLD_HEIGHT_RANGE,
  seedWorldFieldTransferables,
  type SeedWorldFbmParameters,
  type SeedWorldFields
} from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  compileSeedWorldHydrologyCoverageMask,
  seedWorldHydrologyBakeTransferables,
  type SeedWorldHydrologyBakeStyle,
  type SeedWorldHydrologyWaterBody
} from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import { SeedWorldHydrologyCompiler } from "./SeedWorldHydrologyCompiler.ts";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import {
  compileSeedWorldPopulationPreview,
  createSeedWorldRootPopulationPlan,
  seedWorldPopulationPreviewTransferables
} from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import { compileSeedWorldSurfaceMaterialIntent, seedWorldSurfaceIntentTransferables } from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceIntent";
import type { SeedWorldTerrainGenerationSettings } from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";
import { compileSeedWorldLakeFloraDecorations } from "./SeedWorldLakeFlora.ts";
import {
  bakeSeedWorldSurfaceColorField,
  SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION
} from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField";

let grassColorFieldTemplateSamplesPromise: Promise<Uint8Array> | undefined;

interface PlannedHydrologyLayoutCompileRequest {
  readonly kind: "planned-hydrology-layout-v1";
  readonly id: number;
  readonly plan: SeedWorldPlan;
  readonly fbm: SeedWorldFbmParameters;
  readonly terrainSettings: SeedWorldTerrainGenerationSettings;
  readonly hydrologyStyle?: SeedWorldHydrologyBakeStyle;
  readonly grassColorFieldUrl: string;
  readonly debugTimings: boolean;
}

interface AuthoritativePresentationCompileRequest {
  readonly kind: "authoritative-presentation-v2";
  readonly id: number;
  readonly plan: SeedWorldPlan;
  readonly terrainSettings: SeedWorldTerrainGenerationSettings;
  readonly source: SeedWorldAuthoritativePresentationSourceV2;
  readonly grassColorFieldUrl: string;
  readonly debugTimings: boolean;
}

type CompileRequest = PlannedHydrologyLayoutCompileRequest | AuthoritativePresentationCompileRequest;

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<CompileRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

const hydrologyCompiler = new SeedWorldHydrologyCompiler();

worker.onmessage = async (event) => {
  const request = event.data;
  const { id, plan, terrainSettings } = request;
  const requestStartedAt = performance.now();
  try {
    if (plan.sizeMetres !== terrainSettings.worldSizeMetres) {
      throw new RangeError("Seed World terrain settings do not match the generated Plan extent");
    }
    if (request.kind === "authoritative-presentation-v2") {
      const result = await compileAuthoritativePresentation(
        plan,
        terrainSettings,
        request.source,
        request.grassColorFieldUrl,
        request.debugTimings
      );
      postPresentationResult(id, result);
      logWorkerTiming(request.debugTimings, "authoritative-worker-complete", {
        rootSeed: plan.rootSeed,
        totalMilliseconds: performance.now() - requestStartedAt
      });
      return;
    }
    const hydrologyStartedAt = performance.now();
    const hydrologyResult = hydrologyCompiler.compile(plan, request.fbm, terrainSettings, request.hydrologyStyle);
    const hydrologyMilliseconds = performance.now() - hydrologyStartedAt;
    const resolvedPlan = hydrologyResult.plan;
    const riverCurves = hydrologyResult.bake.fields.riverCurves;
    const coverageStartedAt = performance.now();
    const hydrologyCoverage = compileSeedWorldHydrologyCoverageMask(hydrologyResult.bake.waterBodies, {
      geometryHash: hydrologyResult.topology.geometryHash,
      resolution: hydrologyResult.bake.fields.surfaceResolution
    });
    const coverageMilliseconds = performance.now() - coverageStartedAt;
    worker.postMessage(
      {
        id,
        layoutFeatures: Object.freeze({
          plan: resolvedPlan,
          rootSeed: resolvedPlan.rootSeed,
          sizeMetres: resolvedPlan.sizeMetres,
          riverCurves,
          riverCurveSamples: hydrologyResult.bake.fields.riverCurveSamples,
          hydrologyGeometryHash: hydrologyResult.topology.geometryHash,
          hydrologyCoverage,
          hydrologyBodies: Object.freeze(
            hydrologyResult.bake.waterBodies.map((body) =>
              Object.freeze({
                id: body.id,
                areaSquareMetres: body.areaSquareMetres,
                waterLevelMetres: body.waterLevelMetres
              })
            )
          ),
          hydrologyStyle: hydrologyResult.bake.style
        })
      },
      []
    );
    logWorkerTiming(request.debugTimings, "layout-features-ready", {
      rootSeed: plan.rootSeed,
      hydrologyMilliseconds,
      hydrology: hydrologyResult.diagnostics,
      coverageMilliseconds,
      elapsedMilliseconds: performance.now() - requestStartedAt,
      lakeSearch: hydrologyResult.topology.lakeSearchDiagnostics
    });
    const sourceFields = hydrologyResult.bake.fields;
    const resampleStartedAt = performance.now();
    const fields = resampleSeedWorldSurfaceFields(sourceFields, terrainSettings.coverageResolution);
    const resampleMilliseconds = performance.now() - resampleStartedAt;
    const presentationStartedAt = performance.now();
    const presentation = await compilePresentation(
      resolvedPlan,
      fields,
      terrainSettings,
      "seed-world-planned-layout",
      hydrologyResult.bake.waterBodies,
      undefined,
      request.grassColorFieldUrl,
      request.debugTimings
    );
    const presentationMilliseconds = performance.now() - presentationStartedAt;
    const result: SeedWorldCompileResult = Object.freeze({
      ...presentation,
      hydrology: Object.freeze({
        geometryHash: hydrologyResult.topology.geometryHash,
        bakeHash: hydrologyResult.bake.bakeHash,
        style: hydrologyResult.bake.style,
        waterBodies: hydrologyResult.bake.waterBodies,
        diagnostics: hydrologyResult.diagnostics
      })
    });
    postPresentationResult(id, result, seedWorldHydrologyBakeTransferables(hydrologyResult.bake));
    logWorkerTiming(request.debugTimings, "layout-worker-complete", {
      rootSeed: plan.rootSeed,
      hydrologyMilliseconds,
      coverageMilliseconds,
      resampleMilliseconds,
      presentationMilliseconds,
      totalMilliseconds: performance.now() - requestStartedAt
    });
  } catch (error) {
    worker.postMessage(
      {
        id,
        error: error instanceof Error ? error.message : String(error)
      },
      []
    );
  }
};

worker.postMessage({ ready: true }, []);

async function compileAuthoritativePresentation(
  plan: SeedWorldPlan,
  terrainSettings: SeedWorldTerrainGenerationSettings,
  source: SeedWorldAuthoritativePresentationSourceV2,
  grassColorFieldUrl: string,
  debugTimings: boolean
): Promise<SeedWorldPresentationCompileResult> {
  const startedAt = performance.now();
  validateAuthoritativePresentationSource(plan, terrainSettings, source);
  const sourcePreparationStartedAt = performance.now();
  const baseFields = resampleSeedWorldSurfaceFields(source.plannedFields, terrainSettings.coverageResolution);
  const fields = applyAuthoritativePresentationFields(baseFields, source);
  const sourcePreparationMilliseconds = performance.now() - sourcePreparationStartedAt;
  const result = await compilePresentation(
    plan,
    fields,
    terrainSettings,
    "seed-world-authoritative-hfinal",
    source.plannedHydrologyWaterBodies,
    source.lakeShorePlacementBodies,
    grassColorFieldUrl,
    debugTimings
  );
  logWorkerTiming(debugTimings, "authoritative-presentation-complete", {
    rootSeed: plan.rootSeed,
    sourcePreparationMilliseconds,
    totalMilliseconds: performance.now() - startedAt
  });
  return result;
}

function validateAuthoritativePresentationSource(
  plan: SeedWorldPlan,
  terrainSettings: SeedWorldTerrainGenerationSettings,
  source: SeedWorldAuthoritativePresentationSourceV2
): void {
  if (source.schemaVersion !== 2) throw new Error("Unsupported authoritative presentation source schema.");
  if (!/^[0-9a-f]{64}$/.test(source.artifactContentHash) || !/^[0-9a-f]{64}$/.test(source.terrainSourceHash)) {
    throw new Error("Authoritative presentation requires canonical Hydrology and Terrain hashes.");
  }
  if (source.hfinalSamples.length !== terrainSettings.heightResolution ** 2) {
    throw new Error("Authoritative presentation Hfinal does not match the selected Terrain profile.");
  }
  const fields = source.plannedFields;
  if (fields.rootSeed !== plan.rootSeed || fields.sizeMetres !== plan.sizeMetres) {
    throw new Error("Authoritative presentation fields do not belong to the selected World Plan.");
  }
  if (
    fields.heightResolution !== terrainSettings.heightResolution ||
    fields.heightSamples.length !== terrainSettings.heightResolution ** 2
  ) {
    throw new Error("Authoritative presentation planned Height does not match the selected Terrain profile.");
  }
  if (
    fields.surfaceResolution < terrainSettings.coverageResolution ||
    fields.surfaceResolution % terrainSettings.coverageResolution !== 0
  ) {
    throw new Error("Authoritative presentation planned fields cannot resolve the selected coverage profile.");
  }
  if (fields.hydrologyGeometryHash !== source.plannedHydrologyGeometryHash) {
    throw new Error("Authoritative presentation Topology differs from the planning-page Topology.");
  }
  if (fields.hydrologyBakeHash !== source.plannedHydrologyBakeHash) {
    throw new Error("Authoritative presentation Bake differs from the planning-page Bake.");
  }
  for (const body of source.plannedHydrologyWaterBodies) {
    if (body.geometryHash !== source.plannedHydrologyGeometryHash) {
      throw new Error(`Authoritative presentation body '${body.id}' differs from the planning-page Topology.`);
    }
  }
  for (const body of source.lakeShorePlacementBodies) {
    if (
      body.schemaVersion !== 1 ||
      !/^[0-9a-f]{64}$/.test(body.bodySourceHash) ||
      !Number.isInteger(body.resolution) ||
      body.resolution < 2 ||
      body.eligibleMask.length !== body.resolution ** 2 ||
      !source.plannedHydrologyWaterBodies.some(
        (plannedBody) => plannedBody.id === body.basinId && plannedBody.resolution === body.resolution
      )
    ) {
      throw new Error(`Authoritative presentation Lake placement body '${body.basinId}' is invalid.`);
    }
  }
  const cellCount = fields.surfaceResolution ** 2;
  const expectedLengths = [
    [fields.materialWeights.length, cellCount * 4, "material weights"],
    [fields.rockySlopeWeight.length, cellCount, "rocky slope"],
    [fields.waterMask.length, cellCount, "water mask"],
    [fields.flow.length, cellCount, "flow"],
    [fields.sediment.length, cellCount, "sediment"],
    [fields.wetness.length, cellCount, "wetness"],
    [fields.wetlandWeight.length, cellCount, "wetland weight"],
    [fields.riverBankDistanceMetres.length, cellCount, "river-bank distance"],
    [fields.wetlandWaterLevelMetres.length, cellCount, "wetland water level"],
    [fields.habitat.length, cellCount, "habitat"]
  ] as const;
  for (const [actual, expected, label] of expectedLengths) {
    if (actual !== expected) throw new Error(`Authoritative presentation ${label} field has invalid dimensions.`);
  }
}

function applyAuthoritativePresentationFields(
  base: SeedWorldFields,
  source: SeedWorldAuthoritativePresentationSourceV2
): SeedWorldFields {
  const identity32 = Number.parseInt(source.artifactContentHash.slice(0, 8), 16) >>> 0;
  return Object.freeze({
    ...base,
    heightSamples: source.hfinalSamples,
    hydrologyGeometryHash: source.plannedHydrologyGeometryHash,
    hydrologyBakeHash: source.plannedHydrologyBakeHash,
    hash: identity32
  });
}

async function compilePresentation(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  terrainSettings: SeedWorldTerrainGenerationSettings,
  normalSourceId: string,
  hydrologyWaterBodies?: readonly SeedWorldHydrologyWaterBody[],
  lakePlacementBodies?: readonly SeedWorldLakeShorePlacementBodyV1[],
  grassColorFieldUrl = "",
  debugTimings = false
): Promise<SeedWorldPresentationCompileResult> {
  const startedAt = performance.now();
  const surfaceIntentStartedAt = performance.now();
  const surfaceIntent = compileSeedWorldSurfaceMaterialIntent(plan, fields, terrainSettings.coverageResolution);
  const surfaceIntentMilliseconds = performance.now() - surfaceIntentStartedAt;
  const decorationsStartedAt = performance.now();
  const decorations = compileSeedWorldDecorations(plan, fields, hydrologyWaterBodies);
  const decorationsMilliseconds = performance.now() - decorationsStartedAt;
  const debrisStartedAt = performance.now();
  const debris = compileSeedWorldDebrisDecorations(plan, fields, decorations, hydrologyWaterBodies);
  const debrisMilliseconds = performance.now() - debrisStartedAt;
  const mushroomsStartedAt = performance.now();
  const mushrooms = compileSeedWorldMushroomDecorations(plan, fields, decorations);
  const mushroomsMilliseconds = performance.now() - mushroomsStartedAt;
  const lotusStartedAt = performance.now();
  const occupiedDecorations: readonly SeedWorldFeatureDecorationInstance[] = Object.freeze([
    ...decorations,
    ...debris,
    ...mushrooms
  ]);
  const lotus = compileSeedWorldLakeFloraDecorations(
    plan,
    fields,
    hydrologyWaterBodies,
    lakePlacementBodies,
    occupiedDecorations
  );
  const lotusMilliseconds = performance.now() - lotusStartedAt;
  const featureDecorations: readonly SeedWorldPresentationDecorationInstance[] = Object.freeze(
    [...occupiedDecorations, ...lotus].sort((left, right) => left.id.localeCompare(right.id))
  );
  const populationStartedAt = performance.now();
  // Geology layouts replace semantic mountain decorations with solved rock OBBs downstream.
  // Only retained feature rocks belong in the population-stage obstacle set; the final OBB
  // clearance pass owns exact mountain-tree intersections.
  const populationRockDecorations = plan.geologyLayout
    ? decorations.filter((decoration) => decoration.sourceKind !== "mountain")
    : decorations;
  const populationPreview = compileSeedWorldPopulationPreview(plan, fields, undefined, populationRockDecorations);
  const rootPopulationPlan = createSeedWorldRootPopulationPlan(plan);
  const rootPopulationPreview =
    rootPopulationPlan === plan
      ? populationPreview
      : compileSeedWorldPopulationPreview(rootPopulationPlan, fields, undefined, populationRockDecorations);
  const populationMilliseconds = performance.now() - populationStartedAt;
  const terrainNormalsStartedAt = performance.now();
  const terrainNormalSamples = bakeTerrainNormalSamples({
    id: normalSourceId,
    worldPosition: [-fields.sizeMetres * 0.5, 0, -fields.sizeMetres * 0.5],
    worldSize: [fields.sizeMetres, 1, fields.sizeMetres],
    heightSampleSize: [fields.heightResolution, fields.heightResolution],
    heightDecodeOffset: SEED_WORLD_HEIGHT_RANGE.minimum,
    heightDecodeScale: SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum,
    heightSamples: fields.heightSamples
  });
  const terrainNormalsMilliseconds = performance.now() - terrainNormalsStartedAt;
  const surfaceColorStartedAt = performance.now();
  grassColorFieldTemplateSamplesPromise ??= loadGrassColorFieldTemplateSamples(grassColorFieldUrl);
  const grassColorFieldTemplateSamples = await grassColorFieldTemplateSamplesPromise;
  const surfaceColorSamples = bakeSeedWorldSurfaceColorField(plan.rootSeed, grassColorFieldTemplateSamples);
  const surfaceColorMilliseconds = performance.now() - surfaceColorStartedAt;
  const debugTimingsMilliseconds = debugTimings
    ? Object.freeze({
        surfaceIntent: surfaceIntentMilliseconds,
        decorations: decorationsMilliseconds,
        debris: debrisMilliseconds,
        mushrooms: mushroomsMilliseconds,
        lotus: lotusMilliseconds,
        population: populationMilliseconds,
        terrainNormals: terrainNormalsMilliseconds,
        surfaceColor: surfaceColorMilliseconds,
        total: performance.now() - startedAt
      })
    : undefined;
  logWorkerTiming(debugTimings, "presentation-phases", {
    rootSeed: plan.rootSeed,
    source: normalSourceId,
    phasesMilliseconds: debugTimingsMilliseconds,
    totalMilliseconds: debugTimingsMilliseconds?.total
  });
  return Object.freeze({
    terrainSettings,
    plan,
    fields,
    terrainNormalSamples,
    surfaceColorSamples,
    decorations,
    featureDecorations,
    rootPopulationPreview,
    populationPreview,
    surfaceIntent,
    debugTimingsMilliseconds
  });
}

function postPresentationResult(
  id: number,
  result: SeedWorldPresentationCompileResult,
  additionalTransferables: readonly Transferable[] = []
): void {
  worker.postMessage({ id, result }, [
    ...new Set<Transferable>([
      ...seedWorldFieldTransferables(result.fields),
      ...seedWorldPopulationPreviewTransferables(result.rootPopulationPreview),
      ...seedWorldPopulationPreviewTransferables(result.populationPreview),
      ...seedWorldSurfaceIntentTransferables(result.surfaceIntent),
      ...seedWorldPresentationRasterTransferables(result),
      ...additionalTransferables
    ])
  ]);
}

async function loadGrassColorFieldTemplateSamples(assetUrl: string): Promise<Uint8Array> {
  const resolvedUrl = new URL(assetUrl);
  if (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:") {
    throw new Error("Seed World grass colour field asset URL must use HTTP(S)");
  }
  const samples = await loadTerrainCompilerBinary(resolvedUrl);
  if (samples.length !== SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION ** 2) {
    throw new Error("Seed World grass colour field asset does not contain one 256-square R8 sample per texel");
  }
  return samples;
}

function logWorkerTiming(enabled: boolean, event: string, details: Readonly<Record<string, unknown>>): void {
  if (!enabled) return;
  console.info(`[seed-world-planner][timing][worker] ${event} ${JSON.stringify(details)}`);
}
