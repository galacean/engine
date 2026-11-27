import {
  bakeSeedWorldHydrology,
  SEED_WORLD_DEFAULT_HYDROLOGY_BAKE_STYLE,
  type SeedWorldHydrologyBake,
  type SeedWorldHydrologyBakeStyle
} from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import {
  compileSeedWorldNaturalHeightField,
  compileSeedWorldFields,
  type SeedWorldFbmParameters,
  type SeedWorldFields
} from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  compileSeedWorldHydrologyTopology,
  refineSeedWorldHydrologyTopology,
  SEED_WORLD_HYDROLOGY_PROFILE_VERSION,
  type SeedWorldHydrologyTopology
} from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyTopology";
import { SEED_WORLD_BASIN_ANALYSIS_RESOLUTION } from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyTopologyCore";
import {
  SEED_WORLD_LAKE_CANDIDATE_ACCEPTED,
  type SeedWorldLakeCandidateEvaluationResult
} from "@galacean/engine-water/world/SeedWorldLakeCandidate";
import { replanSeedWorldRoadsForWaterExclusion, type SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldTerrainGenerationSettings } from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";
import { preflightSeedWorldLakeCandidateV1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldHydrologyArtifact";
import { compileSeedWorldPlannedHydrologySolveResultV1 } from "./hydrology-v1/SeedWorldPlannedHydrologySolveResultV1.ts";
import { createSeedWorldWaterGridTransformV1 } from "@galacean/engine-water/world/SeedWorldWaterGrid";

const CACHE_ENTRY_LIMIT = 2;

/** Observable compile counts for fully preflighted Hydrology cache entries. */
export interface SeedWorldHydrologyCompilerDiagnostics {
  /** Priority-Flood/D∞ topology selections performed by this Worker-lifetime compiler. */
  readonly topologyCompilations: number;
  /** River-free output-quality fields compiled by this Worker-lifetime compiler. */
  readonly sourceFieldCompilations: number;
  /** Style bakes performed by this Worker-lifetime compiler. */
  readonly styleBakes: number;
  /** Whether the latest call reused an existing topology object. */
  readonly latestTopologyCacheHit: boolean;
  /** Whether the latest call reused an existing source-field object. */
  readonly latestSourceFieldsCacheHit: boolean;
  /** Wall-clock milliseconds spent in each deterministic phase of the latest compile. */
  readonly latestTimingsMilliseconds: Readonly<{
    naturalHeight: number;
    topology: number;
    sourceFields: number;
    styleBake: number;
    finalTerrainPreflight: number;
    refinement: number;
    total: number;
  }>;
}

/** One full initialization result produced without exposing topology cache internals. */
export interface SeedWorldHydrologyCompileResult {
  /** Runtime plan with roads replanned around final water and the superseded river array removed. */
  readonly plan: SeedWorldPlan;
  /** Exact river-free H0 used by the topology selector on the canonical Analysis Grid. */
  readonly analysisHeightMetres: Float32Array;
  /** Exact pre-water fields used as BaseTerrain for this hydrology generation. */
  readonly sourceFields: SeedWorldFields;
  /** Final-Terrain-preflighted topology shared by every downstream consumer. */
  readonly topology: SeedWorldHydrologyTopology;
  /** Style-dependent Height, Alpha, moisture, curves, and water bodies. */
  readonly bake: SeedWorldHydrologyBake;
  /** Snapshot proving which expensive phases ran for this request. */
  readonly diagnostics: SeedWorldHydrologyCompilerDiagnostics;
}

/** Final-Terrain projection applied before Fine-grid Lake candidate acceptance. */
export interface SeedWorldHydrologyFinalTerrainPreflight {
  /** Stable identity included in topology cache keys (for example AuthoringState hash). */
  readonly identity: string;
  /** Applies authoritative edits once to the shared Analysis-selected Hfinal batch. */
  readonly patchHfinalSamples?: (sourceSamples: Uint16Array) => Uint16Array;
}

interface TopologyCacheEntry {
  readonly key: string;
  readonly topology: SeedWorldHydrologyTopology;
  readonly resolvedPlan: SeedWorldPlan;
  readonly naturalPlan: SeedWorldPlan;
  readonly analysisHeightMetres: Float32Array;
  readonly sourceFields: SeedWorldFields;
}

/**
 * Worker-lifetime hydrology compiler that hides topology selection and style rebake caching.
 * @remarks Region and Cell streaming never call this class; one page Worker owns one instance.
 */
export class SeedWorldHydrologyCompiler {
  private readonly _entries = new Map<string, TopologyCacheEntry>();
  private _topologyCompilations = 0;
  private _sourceFieldCompilations = 0;
  private _styleBakes = 0;
  private _latestTopologyCacheHit = false;
  private _latestSourceFieldsCacheHit = false;
  private _latestTimingsMilliseconds: SeedWorldHydrologyCompilerDiagnostics["latestTimingsMilliseconds"] =
    Object.freeze({
      naturalHeight: 0,
      topology: 0,
      sourceFields: 0,
      styleBake: 0,
      finalTerrainPreflight: 0,
      refinement: 0,
      total: 0
    });

  /**
   * Compiles or reuses one final-Terrain-preflighted topology and its source fields, then bakes it.
   * @param plan Existing Root-Seed semantic plan.
   * @param fbm Band-limited H0 profile shared with Terrain generation.
   * @param terrainSettings Output Height and coverage lattice settings.
   * @param style Basin depth and shoulder style included in final-Terrain feasibility and cache identity.
   * @param finalTerrainPreflight Optional authoritative Hfinal edits and their stable cache identity.
   * @returns Frozen topology, baked fields, water bodies, and cache diagnostics.
   * @throws {Error} When topology selection or field baking cannot satisfy its invariants.
   */
  compile(
    plan: SeedWorldPlan,
    fbm: SeedWorldFbmParameters,
    terrainSettings: SeedWorldTerrainGenerationSettings,
    style: SeedWorldHydrologyBakeStyle = SEED_WORLD_DEFAULT_HYDROLOGY_BAKE_STYLE,
    finalTerrainPreflight?: Readonly<SeedWorldHydrologyFinalTerrainPreflight>
  ): SeedWorldHydrologyCompileResult {
    const compileStartedAt = performance.now();
    let naturalHeightMilliseconds = 0;
    let topologyMilliseconds = 0;
    let sourceFieldsMilliseconds = 0;
    let styleBakeMilliseconds = 0;
    let finalTerrainPreflightMilliseconds = 0;
    let refinementMilliseconds = 0;
    if (finalTerrainPreflight && finalTerrainPreflight.identity.trim().length === 0) {
      throw new TypeError("Seed World final-Terrain preflight requires a stable identity.");
    }
    const topologyKey = hydrologyTopologyCacheKey(
      plan,
      fbm,
      terrainSettings,
      style,
      finalTerrainPreflight?.identity ?? "unmodified-hfinal"
    );
    let entry = this._entries.get(topologyKey);
    let bake: SeedWorldHydrologyBake | undefined;
    this._latestTopologyCacheHit = entry !== undefined;
    this._latestSourceFieldsCacheHit = entry !== undefined;
    if (!entry) {
      const roadlessMask = new Uint8Array(plan.resolution * plan.resolution);
      const naturalPlan = Object.freeze({
        ...plan,
        rivers: Object.freeze([]),
        roads: Object.freeze([]),
        pois: Object.freeze([]),
        roadMask: roadlessMask,
        roadDistance: new Uint16Array(roadlessMask.length).fill(0xffff)
      });
      const naturalHeightStartedAt = performance.now();
      const analysisHeightMetres = compileSeedWorldNaturalHeightField(
        naturalPlan,
        SEED_WORLD_BASIN_ANALYSIS_RESOLUTION,
        fbm
      );
      naturalHeightMilliseconds = performance.now() - naturalHeightStartedAt;
      const topologyStartedAt = performance.now();
      const analysisTopology = compileSeedWorldHydrologyTopology({
        plan,
        naturalHeightMetres: analysisHeightMetres,
        candidatePreflight: () => SEED_WORLD_LAKE_CANDIDATE_ACCEPTED
      });
      topologyMilliseconds = performance.now() - topologyStartedAt;
      let topology = analysisTopology;
      const sourceFieldsStartedAt = performance.now();
      let resolved = compileResolvedHydrologySource(plan, analysisHeightMetres, fbm, terrainSettings, topology);
      sourceFieldsMilliseconds += performance.now() - sourceFieldsStartedAt;
      this._sourceFieldCompilations++;
      const styleBakeStartedAt = performance.now();
      bake = bakeSeedWorldHydrology(resolved.naturalPlan, resolved.sourceFields, topology, style);
      styleBakeMilliseconds += performance.now() - styleBakeStartedAt;
      this._styleBakes++;
      const preflightStartedAt = performance.now();
      const evaluations = preflightTopologyAgainstFinalTerrain(
        plan,
        analysisHeightMetres,
        terrainSettings,
        topology,
        bake,
        finalTerrainPreflight
      );
      finalTerrainPreflightMilliseconds = performance.now() - preflightStartedAt;
      const refinementStartedAt = performance.now();
      const refinedTopology = refineSeedWorldHydrologyTopology(topology, evaluations);
      if (refinedTopology !== topology) {
        topology = refinedTopology;
        const refinedSourceFieldsStartedAt = performance.now();
        resolved = compileResolvedHydrologySource(plan, analysisHeightMetres, fbm, terrainSettings, topology);
        sourceFieldsMilliseconds += performance.now() - refinedSourceFieldsStartedAt;
        this._sourceFieldCompilations++;
        const refinedBakeStartedAt = performance.now();
        bake = bakeSeedWorldHydrology(resolved.naturalPlan, resolved.sourceFields, topology, style);
        styleBakeMilliseconds += performance.now() - refinedBakeStartedAt;
        this._styleBakes++;
      }
      refinementMilliseconds = performance.now() - refinementStartedAt;
      entry = Object.freeze({
        key: topologyKey,
        topology,
        resolvedPlan: resolved.plan,
        naturalPlan: resolved.naturalPlan,
        analysisHeightMetres,
        sourceFields: resolved.sourceFields
      });
      this._entries.set(topologyKey, entry);
      this._topologyCompilations++;
      trimOldestEntry(this._entries);
    } else {
      this._entries.delete(topologyKey);
      this._entries.set(topologyKey, entry);
    }
    if (!bake) {
      const styleBakeStartedAt = performance.now();
      bake = bakeSeedWorldHydrology(entry.naturalPlan, entry.sourceFields, entry.topology, style);
      styleBakeMilliseconds = performance.now() - styleBakeStartedAt;
      this._styleBakes++;
    }
    this._latestTimingsMilliseconds = Object.freeze({
      naturalHeight: naturalHeightMilliseconds,
      topology: topologyMilliseconds,
      sourceFields: sourceFieldsMilliseconds,
      styleBake: styleBakeMilliseconds,
      finalTerrainPreflight: finalTerrainPreflightMilliseconds,
      refinement: refinementMilliseconds,
      total: performance.now() - compileStartedAt
    });
    return Object.freeze({
      plan: entry.resolvedPlan,
      analysisHeightMetres: entry.analysisHeightMetres,
      sourceFields: entry.sourceFields,
      topology: entry.topology,
      bake,
      diagnostics: this.diagnostics
    });
  }

  /** Returns current Worker-lifetime compile counters without exposing cached buffers. */
  get diagnostics(): SeedWorldHydrologyCompilerDiagnostics {
    return Object.freeze({
      topologyCompilations: this._topologyCompilations,
      sourceFieldCompilations: this._sourceFieldCompilations,
      styleBakes: this._styleBakes,
      latestTopologyCacheHit: this._latestTopologyCacheHit,
      latestSourceFieldsCacheHit: this._latestSourceFieldsCacheHit,
      latestTimingsMilliseconds: this._latestTimingsMilliseconds
    });
  }
}

interface ResolvedHydrologySource {
  readonly plan: SeedWorldPlan;
  readonly naturalPlan: SeedWorldPlan;
  readonly sourceFields: SeedWorldFields;
}

function preflightTopologyAgainstFinalTerrain(
  plan: SeedWorldPlan,
  analysisHeightMetres: Float32Array,
  terrainSettings: SeedWorldTerrainGenerationSettings,
  topology: SeedWorldHydrologyTopology,
  bake: SeedWorldHydrologyBake,
  finalTerrainPreflight?: Readonly<SeedWorldHydrologyFinalTerrainPreflight>
): readonly SeedWorldLakeCandidateEvaluationResult[] {
  if (topology.bodies.length === 0) return Object.freeze([]);
  let solveResult: ReturnType<typeof compileSeedWorldPlannedHydrologySolveResultV1> | undefined;
  try {
    const transform = createSeedWorldWaterGridTransformV1({
      hfinalResolution: terrainSettings.heightResolution as 97 | 193 | 385 | 769,
      ownershipResolution: terrainSettings.coverageResolution as 96 | 192 | 384 | 768 | 1536
    });
    solveResult = compileSeedWorldPlannedHydrologySolveResultV1({
      topology,
      bake,
      analysisHeightMetres,
      transform
    });
    const sourceHfinalSamples = new Uint16Array(bake.fields.heightSamples);
    const hfinalSamples = finalTerrainPreflight?.patchHfinalSamples
      ? finalTerrainPreflight.patchHfinalSamples(sourceHfinalSamples)
      : sourceHfinalSamples;
    if (!(hfinalSamples instanceof Uint16Array) || hfinalSamples.length !== transform.hfinalResolution ** 2) {
      throw new RangeError("Final-Terrain preflight must return one canonical Hfinal Uint16 sample array.");
    }
    return Object.freeze(
      topology.bodies.map((body) =>
        preflightSeedWorldLakeCandidateV1({
          worldIdentity: `seed-world:${plan.rootSeed >>> 0}`,
          transform,
          hfinalSamples,
          solveResult: solveResult!,
          candidateSolverBodyHandle: body.id
        })
      )
    );
  } finally {
    solveResult?.release();
  }
}

function compileResolvedHydrologySource(
  plan: SeedWorldPlan,
  analysisHeightMetres: Float32Array,
  fbm: SeedWorldFbmParameters,
  terrainSettings: SeedWorldTerrainGenerationSettings,
  topology: SeedWorldHydrologyTopology
): ResolvedHydrologySource {
  const resolvedPlan = plan.geologyLayout
    ? plan
    : replanSeedWorldRoadsForWaterExclusion(plan, analysisHeightMetres, topology.analysisGrid.resolution, {
        wetMask: combineTopologyWaterMasks(topology),
        resolution: topology.analysisGrid.resolution
      });
  const resolvedNaturalPlan = Object.freeze({
    ...resolvedPlan,
    rivers: Object.freeze([]),
    riverMask: plan.riverMask,
    riverDistance: plan.riverDistance
  });
  const sourceFields = compileSeedWorldFields(resolvedNaturalPlan, {
    fbm,
    riverCurves: Object.freeze([]),
    heightResolution: terrainSettings.heightResolution,
    surfaceResolution: terrainSettings.coverageBakeResolution
  });
  return Object.freeze({ plan: resolvedPlan, naturalPlan: resolvedNaturalPlan, sourceFields });
}

function combineTopologyWaterMasks(topology: SeedWorldHydrologyTopology): Uint8Array {
  const result = new Uint8Array(topology.analysisGrid.resolution * topology.analysisGrid.resolution);
  for (const body of topology.bodies) {
    for (let index = 0; index < result.length; index++) {
      if (body.wetMask[index]) result[index] = 1;
    }
  }
  return result;
}

function hydrologyTopologyCacheKey(
  plan: SeedWorldPlan,
  fbm: SeedWorldFbmParameters,
  settings: SeedWorldTerrainGenerationSettings,
  style: SeedWorldHydrologyBakeStyle,
  finalTerrainIdentity: string
): string {
  return [
    plan.rootSeed,
    plan.geologyLayout?.worldId ?? "legacy-geology",
    plan.version,
    plan.assetPlacementProfileVersion,
    SEED_WORLD_HYDROLOGY_PROFILE_VERSION,
    plan.sizeMetres,
    fbm.rollingWavelengthMetres,
    fbm.rollingAmplitudeMetres,
    fbm.rollingOctaves,
    fbm.detailWavelengthMetres,
    fbm.detailAmplitudeMetres,
    fbm.detailOctaves,
    fbm.warpWavelengthMetres,
    fbm.warpAmplitudeMetres,
    fbm.warpOctaves,
    settings.heightResolution,
    settings.coverageBakeResolution,
    settings.coverageResolution,
    style.depthScale,
    style.bankShoulderMetres,
    finalTerrainIdentity
  ].join(":");
}

function trimOldestEntry(entries: Map<string, TopologyCacheEntry>): void {
  while (entries.size > CACHE_ENTRY_LIMIT) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    entries.delete(oldest);
  }
}
