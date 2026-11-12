import { finalizePlanningFarm } from "../farming/PlanningFarmingFinalization";
import { applyMojaveDesertAppearance } from "./MojaveDesertLayout";
import { PLANNING_REFERENCE } from "../../planning-data/PlanningReference";
import { planWorldTemplateSite, resolveConfiguredTemplateSpawn } from "../WorldTemplatePlanning";
import { resolveWorldTemplateScene, resolveWorldTemplateView } from "../WorldTemplateView";
import { WORLD_TEMPLATE_ART } from "../WorldTemplateArtDirection";
import { PLANNING_RUNTIME_OPTIONS } from "../runtime/RuntimeOptions";
import { worldTemplateEcology } from "../WorldTemplateEcology";
import { worldTemplate } from "../WorldTemplateCatalog";
import {
  compileCompositionGroup,
  compileCompositionReliefGroups,
  publishCompositionPaths,
  publishCompositionTrees,
  compositionHydrology
} from "../SpatialComposition";
import { compositionOutline } from "../SpatialCompositionGeometry";
import { generateLakeRegions, LAKE_DEFAULTS } from "../hydrology/LakeRegions";
import { generateRiverRegions, RIVER_DEFAULTS } from "../hydrology/RiverRegions";
import { RIVER_BANK_PROFILE_VERSION } from "../../semantic-study/PlanningRiverBank";
import {
  riverRoadQueries,
  straightenRiverCrossings,
  publishRiverCrossings,
  bridgeGround
} from "../hydrology/RiverCrossings";
import {
  captureBridgeRoadBaseline,
  publishPlanningSuspensionBridges,
  type BridgeRoadBaseline
} from "../hydrology/PlanningSuspensionBridges";
import { volumeGap } from "./VolumeSpacing";
import { attachRoadBranches, auditRoadTermini, pruneUnservedRoadTails } from "./RoadAttachments";
import { poiTerritories, poiTerritoryLandOutline, POI_TERRITORY_VERSION } from "../ecology/PoiTerritories";
import {
  landscapeSampling,
  revealLandscapeBasemap,
  type LandscapeBasemap
} from "../../semantic-study/ContextLandscape";
import {
  updateSpatialEcology,
  updateSpatialGuidance,
  revealSpatialEcology,
  type EnvironmentContext
} from "./EnvironmentStages";
import {
  cachedPlanningHeightmap,
  inheritPlanningHeightmap,
  planningGroundSurface
} from "../../semantic-study/PlanningHeightmap";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import {
  SEMANTIC_DEFAULTS,
  type SemanticResult,
  type SemanticRecipe,
  type PlanningCheck
} from "../../semantic-study/WorldPlanningContract";
import { createSpatialWorldBase, generateSpatialLand, generateSpatialTerrain } from "./SpatialTerrain";
import {
  POI_DISTRIBUTION_VERSION,
  solvePoiDistribution,
  distributePois,
  defaultPoiLayout,
  type PoiSite
} from "../../semantic-study/PoiDistribution";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import {
  planGlobalRoadNetwork,
  publishGlobalRoadMetadata,
  finalRoadGradeChecks
} from "../../semantic-study/GlobalRoadNetwork";
import { wayfindingPolicy } from "../guidance/WayfindingPolicy";
import { withoutVisualGuidance } from "../guidance/VisualGuidance";
import { exportPlanningRecipe, type PlanningDocument } from "../PlanningDocument";
import { resolveComponent } from "../SpatialDocument";
import { planningRegistry, PLANNING_COMPONENTS, planningFieldEditEffect } from "../PlanningComponents";
import { publishNaturalVegetation } from "../../planning-data/NaturalVegetationProfile";
import {
  applySpatialInstanceEdits,
  applySpatialStructureEdits,
  applySpatialSceneryEdits,
  tryEditSpatialInstances
} from "./SpatialInstanceEdits";
import { spatialRevealInputSignature } from "./SpatialEditInputs";
import { layoutExtent, layoutRule, layoutRandom, layoutExclusions, type LayoutRule } from "./LayoutRules";
import { VolumeIndex, boxOutline, bounds, intersects, sameVolumeFootprint, type VolumeExclusion } from "./Volumes";
import {
  solveLayoutGroup,
  connectLayoutGroup,
  layoutConnectionSignature,
  RoadObstacleIndex,
  findLocalPath,
  type LayoutGroup,
  type VolumeEdit
} from "./LayoutKernel";
import { projectLayoutGroups, type LayoutAppearance } from "./LayoutPlanAdapter";
import profile from "./space-rules.json";
import { changedSpatialOutputs } from "./DerivedEdits";
import { initialLayoutConfiguration } from "./LayoutProfiles";
import { compileRoadGraphSplines } from "./RoadGraphSplines";
import { pruneUnusedAccessPaths, resolveRoadTopology, rebuildPhysicalRoadTopology } from "./RoadTopology";
import { ROAD_GEOMETRY_VERSION } from "./RoadGeometry";
import { planningTerrainAuthoringInputs } from "../PlanningResources";
import {
  preparePlanningFarmLayout,
  publishPlanningFarmGeometry,
  excludePlanningFarmLandscape
} from "../farming/PlanningFarmingLayout";

/** Session-local derived cache; persisted projects contain only author parameters. */
export interface SpatialLayoutState {
  worldSignature: string;
  terrainSignature?: string;
  riverSignature?: string;
  hydrologyInputSignature?: string;
  /** Seed-generated anchors before local overrides; reset must not reuse a previously edited centre. */
  siteOrigins?: Record<string, Pick<PoiSite, "center" | "domainId">>;
  groups: LayoutGroup[];
  /** Generated, unedited volumes are the only inputs to generation constraints. */
  baselineGroups?: LayoutGroup[];
  /** Complete compliant scenery before authoring visibility or instance transforms. */
  landscapeBase?: LandscapeBasemap;
  /** Visible generated scenery before any explicit single-object transform. */
  baselineLandscapes?: IslandPlan["landscapes"];
  /** Generated guidance solids before explicit instance/box edits; used for cold and incremental replay. */
  baselineGuidanceRocks?: IslandPlan["rocks"];
  instanceInputSignature?: string;
  revealInputSignature?: string;
  instanceEdits?: Record<string, VolumeEdit>;
  instanceConnections?: import("./SpatialInstanceConnections").InstanceConnectionBaseline;
  instanceConnectionChecks?: PlanningCheck[];
  authoredRoadPaths?: Record<string, { id: string; x: number; z: number }[]>;
  /** Upper-level element bindings; the geometry kernel does not interpret their names. */
  elementProfiles?: Record<string, string>;
  /** Search inputs exclude ambient trees; the final facility check still runs on every planned publication. */
  farmSearch?: { signature: string; result: ReturnType<typeof preparePlanningFarmLayout> };
  exclusions?: VolumeExclusion[];
  roads?: {
    crossingBaseline?: BridgeRoadBaseline;
    signature: string;
    routes: IslandPlan["routes"];
    network: IslandPlan["roadNetwork"];
    graph?: IslandPlan["roadGraph"];
    junctions?: NonNullable<IslandPlan["planning"]>["ports"];
  };
}
/** Deterministic initial parameter sampling. Profile ranges are distributions, not editing constraints. */
export function initialLayoutRule(seed: number, site: PoiSite): LayoutRule {
  return initialLayoutConfiguration(seed, site).rule;
}
/** Copy the writable transaction shell; stages replace geometry rather than mutating accepted outputs. */
function forkSpatialPlan(previous: IslandPlan): IslandPlan {
  const plan = withoutVisualGuidance(
    previous.spatialLayout?.baselineLandscapes
      ? { ...previous, landscapes: previous.spatialLayout.baselineLandscapes }
      : previous
  );
  return {
    ...plan,
    parameters: { ...plan.parameters },
    planning: plan.planning && {
      ...plan.planning,
      profiles: [...plan.planning.profiles],
      relations: [...plan.planning.relations],
      modules: [...plan.planning.modules],
      ports: [...plan.planning.ports]
    },
    poiDistribution: plan.poiDistribution && {
      ...plan.poiDistribution,
      sites: plan.poiDistribution.sites.map((site) => ({ ...site, center: { ...site.center } }))
    },
    landscapes: plan.landscapes?.slice()
  };
}
/** Separate registered reveal values and omit runtime-only choices; other recipe values remain planning inputs.
 * Canonical comparison ignores serialization key order and empty authoring shells.
 */
function recipeEditInputs(recipe: SemanticRecipe): { planning: string; reveal: string } {
  const input = structuredClone(recipe);
  const reveal: Record<string, unknown> = {};
  const take = (target: unknown, path: string, scope: string, isReveal = true) => {
    const keys = path.split(".");
    let value = target as Record<string, unknown> | undefined;
    for (const key of keys.slice(0, -1)) value = value?.[key] as Record<string, unknown> | undefined;
    if (value) {
      const key = keys[keys.length - 1];
      if (isReveal) reveal[JSON.stringify([scope, path])] = value[key];
      delete value[key];
    }
  };
  for (const definition of PLANNING_COMPONENTS)
    for (const field of definition.fields) {
      const isReveal = planningFieldEditEffect(definition.type, field.key) === "reveal";
      if (!isReveal && field.affectsLayout !== false) continue;
      const global = definition.global?.[field.key],
        local = definition.local?.[field.key];
      if (global) take(input.parameters, global, "world", isReveal);
      if (local) for (const [id, edit] of Object.entries(input.edits)) take(edit, local, id, isReveal);
    }
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const entries = Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)] as const)
        .filter(([, item]) => item !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return value;
  };
  return { planning: JSON.stringify(canonical(input)), reveal: JSON.stringify(canonical(reveal)) };
}

/** Reveal fixed candidates without entering layout; newly visible trees retain exact habitat validation. */
export function tryRevealSpatialWorld(
  document: PlanningDocument,
  previous?: SemanticResult,
  compiledRecipe?: SemanticRecipe
): SemanticResult | undefined {
  const base = previous?.plan.spatialLayout?.landscapeBase;
  if (!previous?.accepted || !base) return;
  if (previous.plan.spatialLayout!.revealInputSignature !== spatialRevealInputSignature(document)) return;
  const source = compiledRecipe ?? exportPlanningRecipe(document);
  const recipe: SemanticRecipe = { ...source, parameters: { ...SEMANTIC_DEFAULTS, ...source.parameters } };
  const before = recipeEditInputs(previous.recipe),
    after = recipeEditInputs(recipe);
  if (
    before.reveal === after.reveal ||
    before.planning !== after.planning ||
    JSON.stringify(document.authoredResources ?? []) !== JSON.stringify(previous.plan.authoredResources ?? [])
  )
    return;
  const started = performance.now(),
    config = worldTemplateEcology(
      recipe.parameters.worldTemplate?.id,
      recipe.parameters.poiLayout ?? defaultPoiLayout()
    );
  const plan: IslandPlan = {
    ...previous.plan,
    landscapes: previous.plan.spatialLayout?.baselineLandscapes ?? previous.plan.landscapes,
    planning: previous.plan.planning && { ...previous.plan.planning }
  };
  inheritPlanningHeightmap(plan, previous.plan);
  plan.landscapes = revealLandscapeBasemap(plan, base, config.landscape, recipe.edits);
  excludePlanningFarmLandscape(plan);
  plan.naturalVegetation = publishNaturalVegetation(plan, config.landscape, recipe.edits);
  applyMojaveDesertAppearance(plan, recipe);
  const height = cachedPlanningHeightmap(previous.plan);
  inheritPlanningHeightmap(plan, previous.plan);
  // A worker publication may have no main-thread raster. Resolve only requested contact samples.
  applySpatialInstanceEdits(plan, document, height?.sample ?? ((point) => planningGroundSurface(plan).sample(point)));
  const changedIds = changedSpatialOutputs(previous.plan, plan);
  if (plan.planning) plan.planning.changedIds = changedIds;
  return {
    recipe,
    plan,
    accepted: true,
    checks: previous.checks,
    changedIds,
    notes: previous.notes,
    timings: { "ecology.reveal": performance.now() - started, total: performance.now() - started },
    execution: "landscape",
    contentUpdate: "reveal"
  };
}

/** Placement capacities before connection and environment generation. */
export interface SpatialPlacementProbe {
  candidates: NonNullable<IslandPlan["poiDistribution"]>["candidates"];
  groups: LayoutGroup[];
  elementProfiles: Record<string, string>;
}

/** Compile material-independent spatial parameters and validate the complete publication.
 * @param document Authored spatial parameters.
 * @param previous Accepted output used as a local repair baseline.
 * @param progress Optional stage notifications.
 * @param options Optional environment generation.
 * @returns Complete generated world and its validation results.
 */
export function generateSpatialWorld(
  document: PlanningDocument,
  previous?: SemanticResult,
  progress?: (stage: string) => void,
  options: { environment?: boolean } = {}
): SemanticResult {
  const stages = spatialWorldStages(document, previous, progress, options);
  let step = stages.next();
  while (!step.done) step = stages.next();
  return step.value;
}

/** Evaluate placement capacities using the same solver, without compiling roads or publishing a world.
 * @param document Inputs without authored resource or solid-instance overrides.
 * @returns Full, uncapped member capacities and their POI identities.
 */
export function probeSpatialPlacement(document: PlanningDocument): SpatialPlacementProbe {
  const stages = spatialWorldStages(document, undefined, undefined, { environment: false });
  const step = stages.next();
  if (step.done) throw Error("Placement probe did not reach the placement stage");
  return step.value;
}

function* spatialWorldStages(
  document: PlanningDocument,
  previous?: SemanticResult,
  progress?: (stage: string) => void,
  options: { environment?: boolean } = {}
): Generator<SpatialPlacementProbe, SemanticResult, void> {
  const started = performance.now(),
    recipe = exportPlanningRecipe(document),
    p = { ...SEMANTIC_DEFAULTS, ...recipe.parameters };
  recipe.parameters = p;
  if (options.environment !== false) {
    const edited = tryEditSpatialInstances(document, previous);
    if (edited) return edited;
    const revealed = tryRevealSpatialWorld(document, previous, recipe);
    if (revealed) return revealed;
  }
  progress?.("生成陆域与地势");
  const config = worldTemplateEcology(p.worldTemplate?.id, p.poiLayout ?? defaultPoiLayout()),
    checks: PlanningCheck[] = [],
    notes: string[] = [],
    timings: Record<string, number> = {};
  const value = (id: string, type: string) => {
    if (!document.entities[id]?.components[type]) return {};
    const resolved = resolveComponent(document, id, type, planningRegistry);
    return ["layout", "solid", "anchor", "poi", "roadWidth"].includes(type)
      ? Object.fromEntries(Object.entries(resolved.values).filter(([key]) => resolved.sources[key]?.length))
      : resolved.values;
  };
  const worldSignature = JSON.stringify([
    "rock-boundaries-removed-v1",
    profile.version,
    POI_TERRITORY_VERSION,
    POI_DISTRIBUTION_VERSION,
    p.seed,
    p.landformSeed,
    p.reliefNearAmplitudeM,
    p.reliefAmplitudeM,
    p.reliefFarAmplitudeM,
    p.reliefScaleM,
    p.worldTemplate,
    p.spatialComposition,
    p.landMode,
    p.landCoverage,
    p.landAspect,
    p.landOrientation,
    p.complexity,
    p.offshoreCoverage,
    p.islandRichness,
    config.spacingM,
    config.candidates,
    Object.entries(recipe.edits)
      .filter(([id]) => id.startsWith("offshore-") || id === "land-main")
      .map(([id, e]) => [id, { size: e.size, complexity: e.complexity, placement: e.placement }])
      .filter(([, e]) => Object.values(e!).some((v) => v !== undefined))
  ]);
  const compatible =
    previous?.plan.spatialLayout?.worldSignature === worldSignature &&
    !!previous.plan.spatialLayout.siteOrigins &&
    !!previous.plan.spatialLayout.baselineGroups;
  const plan = compatible ? forkSpatialPlan(previous!.plan) : createSpatialWorldBase(recipe);
  const publishedResources = structuredClone(document.authoredResources ?? []);
  // Authored local terrain (brushes and semantic features) edits existing ground,
  // not the procedural layout recipe. Both paths share the same preservation boundary.
  // Solve hydrology, volume identities and road routing against the unpatched base
  // on both cold replay and incremental edits; apply patches to published ground below.
  plan.authoredResources = publishedResources.filter(
    (r) => r.resourceType !== "terrain-patch" && r.resourceType !== "terrain-feature"
  );
  const patchChanged =
    JSON.stringify(
      publishedResources.filter((r) => r.resourceType === "terrain-patch" || r.resourceType === "terrain-feature")
    ) !==
    JSON.stringify(
      (previous?.plan.authoredResources ?? []).filter(
        (r) => r.resourceType === "terrain-patch" || r.resourceType === "terrain-feature"
      )
    );
  const saved = compatible ? previous!.plan.spatialLayout : undefined;
  // Accepted geometry is immutable. Reuse a complete publication together so roads,
  // bridges and navigation metadata retain their shared identities.
  const crossingBaseline = saved?.roads?.crossingBaseline;
  const retainedRoads = compatible
    ? {
        routes: crossingBaseline?.routes ?? plan.routes,
        graph: crossingBaseline?.graph ?? plan.roadGraph,
        network: saved?.instanceConnections?.network ?? plan.roadNetwork,
        bridges: crossingBaseline?.bridges ?? plan.bridges,
        approaches: crossingBaseline?.approaches ?? plan.roadApproaches,
        junctions: plan.planning!.ports.filter((p) => p.id.startsWith("road-junction:")),
        module: plan.planning!.modules.find((m) => m.id === "world-routes")
      }
    : undefined;
  // Derived approach grading must not become input to the next road solve.
  plan.roadApproaches = [];
  let stage = performance.now();
  const mark = (name: string) => {
    const now = performance.now();
    timings[name] = now - stage;
    stage = now;
  };
  if (!compatible) generateSpatialLand(plan, recipe, notes);
  generateSpatialTerrain(plan, recipe);
  progress?.("划分 POI 管理区域");
  // Water uses region ownership; assign regional content only after carving the final natural surface.
  if (!compatible) {
    plan.poiDistribution = distributePois(
      {
        width: 1024,
        depth: 1024,
        seed: p.seed,
        domains: [
          { id: "land-main", outline: plan.land },
          ...plan.islands.map((outline, i) => ({ id: `offshore-${i}`, outline }))
        ]
      },
      config
    );
  }
  plan.poiDistribution = solvePoiDistribution(
    { ...plan.poiDistribution!, minAreaM2: config.minAreaM2 },
    Object.fromEntries(
      plan.poiDistribution!.candidates.map((candidate) => {
        const anchor = value(candidate.id, "anchor"),
          poi = value(candidate.id, "poi");
        return [
          candidate.id,
          {
            ...(anchor.x === undefined ? {} : { x: Number(anchor.x) }),
            ...(anchor.z === undefined ? {} : { z: Number(anchor.z) }),
            ...(poi.sizeWeight === undefined ? {} : { sizeWeight: Number(poi.sizeWeight) })
          }
        ];
      })
    )
  );
  const siteOrigins = Object.fromEntries(
    plan.poiDistribution.candidates.map((c) => [c.id, { center: { ...c.origin }, domainId: c.domainId }])
  );
  const domains = plan.poiDistribution!.domains.map((d) => ({ ...d, query: createPlanningRingQuery(d.outline) }));
  const configuredSpawn = resolveConfiguredTemplateSpawn(plan);
  const spawnOutline =
    configuredSpawn &&
    boxOutline({
      center: configuredSpawn.position,
      width: 2 * PLANNING_REFERENCE.actor.radiusM,
      depth: 2 * PLANNING_REFERENCE.actor.radiusM,
      elevation: 0,
      height: PLANNING_REFERENCE.actor.heightM,
      yaw: 0
    });
  if (spawnOutline && !domains.some((domain) => domain.query.containsPolygon(spawnOutline)))
    throw new Error("模板出生点必须位于陆地");
  const templateFootprints = spawnOutline
    ? planWorldTemplateSite({ ...plan, waters: [] }, createPlanningGroundSampler(plan, { natural: true }))?.footprints
    : undefined;
  const reservedOutlines = spawnOutline
    ? [spawnOutline, ...(templateFootprints ?? []).map((item) => item.outline)]
    : [];
  const waterReservations = reservedOutlines.map(createPlanningRingQuery);
  const spawnReservation = waterReservations[0];
  const generatedWater = compositionHydrology(plan);
  const riverConfig = { ...RIVER_DEFAULTS, ...p.rivers };
  const localRivers = Object.fromEntries(
    Object.entries(recipe.edits)
      .filter(([, e]) => e.rivers)
      .map(([id, e]) => [id, e.rivers!])
  );
  const lakeConfig = { ...LAKE_DEFAULTS, ...p.lakes };
  const localLakes = Object.fromEntries(
    Object.entries(recipe.edits)
      .filter(([, e]) => e.lakes)
      .map(([id, e]) => [id, e.lakes!])
  );
  // Composition suggests initial water. Native Source edits and deletions take precedence.
  for (const [id, values] of Object.entries(generatedWater.rivers)) localRivers[id] ??= values;
  for (const [id, values] of Object.entries(generatedWater.lakes)) localLakes[id] ??= values;
  // Automatic hydrology samples natural Terrain before it publishes any cuts.
  // Authored patches and basin geometry belong to that physical input; appearance
  // does not. Reuse this projection for Terrain invalidation so a colour edit
  // cannot invalidate either side of the same physical dependency.
  const terrainInputs = planningTerrainAuthoringInputs(plan.authoredResources);
  const hydrologyInputSignature = JSON.stringify([
    terrainInputs,
    lakeConfig,
    localLakes,
    plan.poiDistribution!.minAreaM2,
    plan.parameters,
    plan.land,
    plan.islands,
    reservedOutlines,
    { ...riverConfig, waterY: riverConfig.automaticLevel ? undefined : riverConfig.waterY },
    localRivers,
    plan.poiDistribution!.sites.map((s) => [s.id, s.center, s.domainId, s.weightM2, s.active])
  ]);
  progress?.("生成河流与河床");
  if (hydrologyInputSignature === saved?.hydrologyInputSignature)
    checks.push(
      ...previous!.checks.filter((c) =>
        ["river-extent", "river-water-level", "river-generation", "lake-generation"].includes(c.rule)
      )
    );
  else {
    checks.push(...generateRiverRegions(plan, riverConfig, localRivers, waterReservations));
    checks.push(...generateLakeRegions(plan, lakeConfig, localLakes, waterReservations));
  }
  const terrainSignature = JSON.stringify([plan.parameters, terrainInputs]);
  const riverSignature = JSON.stringify([
    RIVER_BANK_PROFILE_VERSION,
    plan.waters,
    plan.planning!.profiles.filter((p) => plan.waters.some((water) => water.id === p.ownerId))
  ]);
  const baseTerrainChanged = terrainSignature !== saved?.terrainSignature;
  const riversChanged = riverSignature !== saved?.riverSignature;
  const terrainChanged = baseTerrainChanged || riversChanged;
  const riverRings = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const riverRoads = riverRoadQueries(plan);
  const affectedRiverQueries = riversChanged
    ? [...plan.waters, ...(previous?.plan.waters ?? [])].map((w) => ({
        ring: createPlanningRingQuery(w.outline),
        width: (w.bankWidthM ?? 12) + 2
      }))
    : [];
  const riverAffected = (outline: PlanPoint[]) =>
    affectedRiverQueries.some(
      ({ ring, width }) => ring.overlapsPolygon(outline) || outline.some((p) => ring.within(p, width))
    );
  const groups: LayoutGroup[] = [],
    previousGroups = new Map((saved?.baselineGroups ?? saved?.groups)?.map((g) => [g.id, g])),
    changedGroups = new Set<string>();
  plan.spatialLayout = { worldSignature, groups };
  let ground = createPlanningGroundSampler(plan, { natural: true });
  plan.worldTemplateSite = planWorldTemplateSite(plan, ground);
  plan.planning!.reservations = plan.planning!.reservations.filter((area) => area.ownerId !== "world-template");
  for (const item of plan.worldTemplateSite?.footprints ?? [])
    plan.planning!.reservations.push({
      id: `world-template:activity:${item.id}`,
      ownerId: "world-template",
      kind: "activity",
      outline: item.outline,
      relatedIds: []
    });
  const templateAreas = (plan.worldTemplateSite?.footprints ?? []).map((item) => createPlanningRingQuery(item.outline));
  const generatedOutline =
    p.spatialComposition?.enabled && p.spatialComposition.replacePopulation
      ? compositionOutline(p.spatialComposition)
      : undefined;
  const compositionArea = generatedOutline && createPlanningRingQuery(generatedOutline);
  const insideDomain = (outline: PlanPoint[]) => domains.some((d) => d.query.containsPolygon(outline));
  const inside = (outline: PlanPoint[]) => insideDomain(outline) && !compositionArea?.overlapsPolygon(outline);
  let roadExcludedAreas: ReturnType<typeof createPlanningRingQuery>[] = [
    ...templateAreas,
    ...(compositionArea ? [compositionArea] : [])
  ];
  const respectsRoadAreas = (outline: PlanPoint[]) => !roadExcludedAreas.some((area) => area.overlapsPolygon(outline));
  const roadInside = (outline: PlanPoint[]) =>
    inside(outline) && respectsRoadAreas(outline) && !riverRoads.some((w) => w.ring.overlapsPolygon(outline));
  const elementProfiles: Record<string, string> = {},
    appearances: Record<string, LayoutAppearance> = {};
  const territoryOutlines = new Map(poiTerritories(plan).map((t) => [t.poiId, poiTerritoryLandOutline(plan, t)]));
  // Rock seeds share the whole map, including sea; partition across islands so
  // a lone offshore anchor does not independently populate the entire world.
  const rockRegions = new Map(poiTerritories(plan, false).map((t) => [t.poiId, t.outline]));
  const layoutInputSignature = (
    center: PlanPoint,
    id: string,
    rule: LayoutRule,
    overrides: Record<string, VolumeEdit>,
    components: Record<string, Record<string, unknown>>
  ) =>
    JSON.stringify([
      center,
      territoryOutlines.get(id),
      rule,
      overrides,
      layoutRule(rule.pattern).version,
      components,
      "region-population-v1"
    ]);
  // Farming consumes final world/spawn geometry; it never reserves or rerolls a POI.
  delete plan.farming;
  const template = worldTemplate(p.worldTemplate?.id);
  const grassOnly = template?.vegetation === "grass";
  const specifications = plan
    .poiDistribution!.sites.filter((site) => site.active)
    .flatMap((site) => {
      const { elementProfile, ...authored } = { ...value("world", "layout"), ...value(site.id, "layout") },
        configuration = initialLayoutConfiguration(
          p.seed,
          site,
          authored.pattern as string | undefined,
          elementProfile as string | undefined
        );
      if (grassOnly && configuration.presentation === "rock") return [];
      const rule = {
        ...configuration.rule,
        ...authored,
        pattern: authored.pattern ?? configuration.rule.pattern,
        roadAccess: true
      } as LayoutRule;
      if (!layoutRule(rule.pattern).parameterKeys?.includes("openRadiusM")) rule.openRadiusM = 0;
      elementProfiles[site.id] = configuration.elementProfile;
      appearances[site.id] = configuration.presentation as LayoutAppearance;
      if (configuration.presentation === "rock") territoryOutlines.set(site.id, rockRegions.get(site.id) ?? []);
      rule.radiusM = layoutExtent(site.center, territoryOutlines.get(site.id) ?? []);
      const { radiusM: derivedExtent, roadAccess: implicitAccess, spacingM: legacySpacing, ...authoredRule } = rule;
      planningRegistry.validate("layout", authoredRule);
      for (const [low, high] of planningRegistry.get("layout").ranges ?? [])
        if (Number(rule[low as keyof LayoutRule]) > Number(rule[high as keyof LayoutRule]))
          throw new Error("空间规则尺寸范围倒置");
      const components = Object.fromEntries(
        Object.keys(document.entities[site.id]?.components ?? {})
          .filter((type) => !["layout", "landscape", "flowers", "anchor", "poi", "solid"].includes(type))
          .map((type) => [type, value(site.id, type)])
      );
      const inputSignature = JSON.stringify([
        "content-binding-slope-v3",
        configuration.elementProfile,
        configuration.presentation,
        layoutInputSignature(site.center, site.id, rule, {}, components)
      ]);
      const region = territoryOutlines.get(site.id) ?? [];
      const old = previousGroups.get(site.id);
      const construction =
        old?.inputSignature === inputSignature && old.construction
          ? old.construction
          : layoutRule(rule.pattern).build({
              owner: site.id,
              center: { ...site.center },
              region: structuredClone(region),
              parameters: Object.freeze({ ...rule }),
              components: structuredClone(components),
              random: layoutRandom(p.seed, site.id, 0, 0, rule.variationSeed)
            });
      return [{ site, rule, inputSignature, components, construction, exclusions: configuration.exclusions }];
    });
  const territories = new Map([...territoryOutlines].map(([id, outline]) => [id, createPlanningRingQuery(outline)]));
  const relations = layoutExclusions(
    specifications.map(({ site, rule, exclusions, construction }) => ({
      id: site.id,
      rule,
      exclusions,
      volumeIds: construction.members.map((_, i) => `${site.id}:volume:${i}`)
    }))
  );
  const index = new VolumeIndex(relations);
  // Crossing footprints make mutually exclusive neighbours part of the same
  // generation dependency. Include rejected candidates: a removed blocker can
  // make them feasible. Replay affected owners in the same order as a cold solve.
  const rebuild = new Set(
    specifications
      .filter((s) => terrainChanged || previousGroups.get(s.site.id)?.inputSignature !== s.inputSignature)
      .map((s) => s.site.id)
  );
  const footprints = new Map(
    specifications.map((s) => [
      s.site.id,
      bounds([
        ...s.construction.members.flatMap((boxes) => boxes.flatMap(boxOutline)),
        ...(previousGroups.get(s.site.id)?.construction?.members ?? []).flatMap((boxes) => boxes.flatMap(boxOutline))
      ])
    ])
  );
  const volumeOwners = new Map<string, string>(
    specifications.flatMap((s) =>
      s.construction.members.map((_, i) => [`${s.site.id}:volume:${i}`, s.site.id] as const)
    )
  );
  const neighbours = new Map(specifications.map((s) => [s.site.id, new Set<string>()]));
  for (const relation of relations) {
    const a = new Set(relation.a.map((id) => volumeOwners.get(id)!));
    const b = new Set(relation.b.map((id) => volumeOwners.get(id)!));
    for (const left of a)
      for (const right of b) {
        neighbours.get(left)!.add(right);
        neighbours.get(right)!.add(left);
      }
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const a of specifications) {
      if (!rebuild.has(a.site.id)) continue;
      for (const b of specifications) {
        if (rebuild.has(b.site.id)) continue;
        const excluded = neighbours.get(a.site.id)!.has(b.site.id);
        if (excluded && intersects(footprints.get(a.site.id)!, footprints.get(b.site.id)!)) {
          rebuild.add(b.site.id);
          expanded = true;
        }
      }
    }
  }
  // Only independent owners are fixed; dependent owners must use canonical order.
  for (const spec of specifications) {
    const old = previousGroups.get(spec.site.id);
    if (old && !rebuild.has(spec.site.id)) for (const volume of old.volumes) index.set(volume);
  }
  mark("domain");
  progress?.("更新空间体量");
  for (const { site, rule, inputSignature, components, construction } of specifications) {
    const old = previousGroups.get(site.id);
    if (
      old?.inputSignature === inputSignature &&
      !rebuild.has(site.id) &&
      !baseTerrainChanged &&
      !old.volumes.some(
        (v) =>
          v.boxes.some((b) => riverRings.some((w) => w.overlapsPolygon(boxOutline(b)))) || index.conflicts(v).length
      ) &&
      !old.volumes.some((v) => v.boxes.some((b) => riverAffected(boxOutline(b))))
    ) {
      groups.push(old);
      for (const v of old.volumes) index.set(v);
      continue;
    }
    changedGroups.add(site.id);
    // Regions distribute rock candidates; their footprints may cross coasts and
    // ownership boundaries. Buildings retain their existing containment checks.
    const rock = appearances[site.id] === "rock";
    const insideGroup = (points: PlanPoint[]) => rock || !!territories.get(site.id)?.containsPolygon(points);
    const clear = (outline: PlanPoint[]) =>
      (rock || !!domains.find((d) => d.id === site.domainId)?.query.containsPolygon(outline)) &&
      !riverRings.some((w) => w.overlapsPolygon(outline));
    const clearGeneratedFootprint = (outline: PlanPoint[]) =>
      clear(outline) &&
      !spawnReservation?.overlapsPolygon(outline) &&
      !templateAreas.some((area) => area.overlapsPolygon(outline)) &&
      !compositionArea?.overlapsPolygon(outline);
    // Reconstruct the same unedited baseline for cold and incremental generation.
    // Overrides resolve against this baseline, never against edit-history-dependent positions.
    const candidateBounds = bounds(territoryOutlines.get(site.id) ?? []);
    const baseline = solveLayoutGroup(
      site.id,
      site.center,
      rule,
      p.seed,
      index,
      insideGroup,
      ground,
      undefined,
      {},
      inputSignature,
      components,
      clearGeneratedFootprint,
      candidateBounds,
      construction
    );
    groups.push(baseline);
  }
  const compositionGroups = grassOnly
    ? []
    : [compileCompositionGroup(plan, ground), ...compileCompositionReliefGroups(plan)].filter(
        (group): group is LayoutGroup => !!group
      );
  for (const composition of compositionGroups) {
    groups.push(composition);
    appearances[composition.id] = "rock";
  }
  yield { candidates: plan.poiDistribution!.candidates, groups, elementProfiles };
  const oldVolumes = new Map(
    (saved?.baselineGroups ?? saved?.groups)?.flatMap((g) => g.volumes.map((v) => [v.id, v] as const))
  );
  const currentVolumes = new Map(groups.flatMap((g) => g.volumes.map((v) => [v.id, v] as const)));
  const changedVolumes = [...currentVolumes.values()].filter(
    (v) => v !== oldVolumes.get(v.id) && JSON.stringify(v) !== JSON.stringify(oldVolumes.get(v.id))
  );
  const removedVolumes = [...oldVolumes.values()].filter((v) => !currentVolumes.has(v.id));
  const changedFootprints = changedVolumes.filter((v) => !sameVolumeFootprint(v, oldVolumes.get(v.id)));
  const changedRoadBounds = [
    ...changedFootprints,
    ...removedVolumes,
    ...changedFootprints.flatMap((v) => oldVolumes.get(v.id) ?? [])
  ].flatMap((v) => v.boxes.map((b) => bounds(boxOutline(b))));
  const roadObstacles = new RoadObstacleIndex(groups.flatMap((g) => g.volumes));
  const internalWidths = Object.fromEntries(
    Object.entries(recipe.edits).flatMap(([id, e]) => (e.road?.widthM !== undefined ? [[id, e.road.widthM]] : []))
  );
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (config.network.enabled === false) {
      groups[i] = { ...group, paths: [], connectionBounds: undefined, connectionSignature: undefined };
      continue;
    }
    if (compositionGroups.includes(group)) continue;
    if (!group.volumes.length && compositionArea?.inside(group.center)) {
      groups[i] = { ...group, paths: [], ports: [] };
      continue;
    }
    if (
      terrainChanged ||
      changedGroups.has(group.id) ||
      !group.connectionBounds ||
      changedRoadBounds.some((box) => intersects(box, group.connectionBounds!)) ||
      group.connectionSignature !==
        layoutConnectionSignature(group.id, internalWidths, p.poiLayout?.network?.widthM ?? group.rule.pathWidthM)
    ) {
      const solved = roadObstacles.trackQueries(() =>
        connectLayoutGroup(
          group,
          p.seed,
          roadObstacles,
          roadInside,
          internalWidths,
          p.poiLayout?.network?.widthM,
          (outline) => inside(outline) && !riverRings.some((w) => w.overlapsPolygon(outline))
        )
      );
      groups[i] = { ...solved.value, connectionBounds: solved.bounds };
    }
  }
  for (const group of groups) {
    if (group.rule.pattern === "connected" && group.rule.branchShape === "curve") continue;
    const requested = group.rule.spacingMinM ?? group.rule.spacingM ?? 0;
    let actual = Infinity;
    for (let i = 0; i < group.volumes.length; i++)
      for (let j = i + 1; j < group.volumes.length; j++) {
        actual = Math.min(actual, volumeGap(group.volumes[i], group.volumes[j]));
      }
    if (actual + 1e-4 < requested)
      checks.push({
        id: `spacing:${group.id}`,
        rule: "layout-spacing",
        owners: [group.id],
        status: "unknown",
        required: false,
        message: `请求沿排列间距至少 ${requested} 米，实际最小 ${actual.toFixed(2)} 米；已在本 POI 局部协调，保留成员与邻居，间距目标未完全满足`,
        measured: actual,
        limit: requested
      });
  }
  for (const group of groups)
    if (group.construction?.limited && group.volumes.length < (group.rule.memberMax ?? Infinity))
      checks.push({
        id: `budget:${group.id}`,
        rule: "generation-budget",
        owners: [group.id],
        status: "unknown",
        required: false,
        message: `当前尺寸或间距产生过多候选，已达到单区域计算预算；生成 ${group.volumes.length} 个体量，参数未被修改，这不是区域容量上限`,
        measured: group.volumes.length,
        limit: group.construction.members.length
      });
  for (const group of groups) {
    if (group.volumes.length < (group.rule.memberMin ?? 0))
      checks.push({
        id: `member-count:${group.id}`,
        rule: "layout-member-count",
        owners: [group.id],
        status: "fail",
        required: false,
        message: `期望至少 ${group.rule.memberMin} 个成员，实际生成 ${group.volumes.length} 个；请检查尺寸、实际坡度、陆域和显式互斥，参数未缩小且没有强制填充`,
        measured: group.volumes.length,
        limit: group.rule.memberMin
      });
    if (group.rule.roadMode === "none" || layoutRule(group.rule.pattern).connections !== "tree") continue;
    const reached = new Set(
      group.ports
        .filter((p) => p.access)
        .slice(0, 1)
        .map((p) => p.id)
    );
    for (let i = 0; i < group.paths.length; i++)
      for (const path of group.paths)
        if (reached.has(path.from) || reached.has(path.to)) {
          reached.add(path.from);
          reached.add(path.to);
        }
    const missing = group.rule.roadMode === "backbone" ? [] : group.volumes.filter((v) => !reached.has(v.id + ":port"));
    if (missing.length)
      checks.push({
        id: `connectivity:${group.id}`,
        rule: "internal-connectivity",
        owners: [group.id, ...missing.map((v) => v.id)],
        status: "fail",
        required: false,
        message: `${missing.length} 个体量尚未连入内部路网`,
        measured: missing.length,
        limit: 0
      });
    for (const path of group.paths) {
      const requested = internalWidths[path.id] ?? group.rule.pathWidthM;
      if (path.width < requested - 1e-6)
        checks.push({
          id: `width:${path.id}`,
          rule: "internal-width",
          owners: [path.id],
          status: "unknown",
          required: false,
          message: `局部净空不足，道路宽度从请求 ${requested} 米协调为 ${path.width} 米`,
          measured: path.width,
          limit: requested
        });
    }
  }
  mark("volumes");
  progress?.("更新道路连接");
  const roadSignature = () =>
    JSON.stringify([
      "explicit-access-v8-independent-farm",
      ROAD_GEOMETRY_VERSION,
      p.worldTemplate,
      p.spatialComposition,
      p.poiLayout?.network,
      p.wayfinding?.sBend,
      groups.map((g) => [g.id, g.ports.some((port) => port.access)]),
      Object.entries(recipe.edits).flatMap(([id, e]) =>
        id.startsWith("world-route-") && (e.road || e.wayfinding?.sBend !== undefined)
          ? [[id, e.road, e.wayfinding?.sBend]]
          : []
      )
    ]);
  const reuseRoads =
    !!saved?.roads &&
    !terrainChanged &&
    roadSignature() === saved.roads.signature &&
    !changedFootprints.length &&
    !removedVolumes.length &&
    !!retainedRoads?.graph &&
    groups.every((g) => {
      const old = previousGroups.get(g.id);
      return (
        old === g ||
        (!!old &&
          JSON.stringify([g.ports, g.paths, g.rule.openRadiusM]) ===
            JSON.stringify([old.ports, old.paths, old.rule.openRadiusM]))
      );
    });
  plan.routes = [];
  plan.spatialLayout.elementProfiles = elementProfiles;
  projectLayoutGroups(plan, groups, appearances, !reuseRoads);
  if (generatedOutline)
    plan.regions.push({
      id: "landscape-composition:region",
      label: "参数化景观区域",
      kind: "open",
      outline: generatedOutline,
      roadExcluded: true
    });
  roadExcludedAreas = [
    ...templateAreas,
    ...plan.regions.filter((region) => region.roadExcluded).map((region) => createPlanningRingQuery(region.outline))
  ];
  if (reuseRoads) {
    plan.roadNetwork = retainedRoads!.network;
    plan.routes = retainedRoads!.routes;
    publishCompositionPaths(plan, false);
    // Group projection includes optional cached paths. Publish only accepted
    // path references, exactly as the cold topology/pruning pass does.
    const candidatePaths = new Set(groups.flatMap((group) => group.paths.map((path) => path.id)));
    const publishedPaths = new Set(plan.routes.map((route) => route.id));
    plan.planning!.modules = plan.planning!.modules.map((module) => ({
      ...module,
      memberIds: module.memberIds?.filter((id) => !candidatePaths.has(id) || publishedPaths.has(id))
    }));
    plan.roadGraph = retainedRoads!.graph;
    plan.bridges = retainedRoads!.bridges;
    plan.roadApproaches = retainedRoads!.approaches;
    plan.planning!.ports.push(...retainedRoads!.junctions);
    if (retainedRoads!.module) plan.planning!.modules.push(retainedRoads!.module);
    // Reusing geometry also retains unresolved entrance diagnostics. Otherwise
    // an ecology-only edit silently hides warnings that a cold replay still reports.
    checks.push(
      ...previous!.checks.filter((c) => c.id.startsWith("network-connectivity-") || c.id.startsWith("network-gate-"))
    );
  } else {
    // Roads depend only on the final ports and footprints; old bends are not author input.
    delete plan.roadNetwork;
    delete plan.roadGraph;
    const networkStarted = performance.now();
    checks.push(
      ...planGlobalRoadNetwork(
        plan,
        { ...config.network, wayfinding: wayfindingPolicy(p.wayfinding) },
        undefined,
        recipe.edits,
        { publishMetadata: false, deferCurves: true }
      ).map((c) => ({ ...c, required: false }))
    );
    timings["roads.network"] = performance.now() - networkStarted;
    const topologyStarted = performance.now();
    pruneUnusedAccessPaths(plan);
    resolveRoadTopology(plan, (_, outline) => roadInside(outline) && !roadObstacles.collides(outline), true, true);
    timings["roads.topology"] = performance.now() - topologyStarted;
    const crossingStarted = performance.now();
    straightenRiverCrossings(
      plan,
      (_, outline) => inside(outline) && respectsRoadAreas(outline) && !roadObstacles.collides(outline),
      true
    );
    timings["roads.crossings"] = performance.now() - crossingStarted;
    const attachmentsStarted = performance.now();
    // Bank fitting can displace a selected entrance. Only that lost destination
    // justifies the existing bounded repair; ordinary anonymous tails do not.
    const usedEntrances = new Set(plan.roadNetwork!.edges.flatMap((edge) => [edge.a, edge.b]));
    const missingEntrance = plan.roadNetwork!.nodes.some(
      (node) =>
        usedEntrances.has(node.id) &&
        !plan.roadGraph!.nodes.some(
          (vertex) => Math.hypot(vertex.position.x - node.position.x, vertex.position.z - node.position.z) < 1e-3
        )
    );
    if (missingEntrance) {
      const roadDomain = (outline: PlanPoint[]) =>
        inside(outline) && respectsRoadAreas(outline) && !riverRings.some((w) => w.overlapsPolygon(outline));
      attachRoadBranches(
        plan,
        (from, to, width) => findLocalPath(from, to, width, roadObstacles, roadDomain, 60),
        (_, outline) => roadDomain(outline) && !roadObstacles.collides(outline),
        [],
        (point, width) => !riverRings.some((w) => w.inside(point) || w.distance(point, width * 2 + 0.001) <= width * 2)
      );
    }
    // A leaf without a content destination adds no connectivity between useful
    // endpoints. Remove it instead of searching/fitting a return road merely to
    // make an unused guide end cease being a leaf. Final audits remain mandatory.
    pruneUnservedRoadTails(plan, (_, outline) => inside(outline) && !roadObstacles.collides(outline));
    timings["roads.attachments"] = performance.now() - attachmentsStarted;
    const splineStarted = performance.now();
    compileRoadGraphSplines(
      plan,
      (_, outline) => inside(outline) && respectsRoadAreas(outline) && !roadObstacles.collides(outline)
    );
    if (config.network.enabled !== false && p.spatialComposition?.enabled && p.spatialComposition.roadWidthM) {
      const compositionDomain = (outline: PlanPoint[]) =>
        insideDomain(outline) &&
        !templateAreas.some((area) => area.overlapsPolygon(outline)) &&
        !riverRings.some((area) => area.overlapsPolygon(outline));
      publishCompositionPaths(
        plan,
        true,
        (_, outline) => compositionDomain(outline) && !roadObstacles.collides(outline),
        (from, to, width) =>
          findLocalPath(from, to, width, roadObstacles, compositionDomain, p.spatialComposition!.widthM!)
      );
      if (
        !rebuildPhysicalRoadTopology(
          plan,
          (_, outline) =>
            insideDomain(outline) &&
            !templateAreas.some((area) => area.overlapsPolygon(outline)) &&
            !roadObstacles.collides(outline)
        )
      )
        throw new Error("景观步道与已发布地形或体量冲突");
    }
    timings["roads.splines"] = performance.now() - splineStarted;
  }
  for (let i = checks.length - 1; i >= 0; i--)
    if (checks[i].id.startsWith("world-route-") && checks[i].id.endsWith("-grade")) checks.splice(i, 1);
  if (!reuseRoads) {
    // Finish all branch geometry before publishing crossings and bridge approaches.
    publishRiverCrossings(plan);
  }
  const naturalCrossings = reuseRoads && crossingBaseline ? crossingBaseline : captureBridgeRoadBaseline(plan);
  const bridgeInput = (r: typeof recipe) =>
    JSON.stringify([
      r.parameters.suspensionBridge,
      Object.entries(r.edits)
        .filter(([, e]) => e.suspensionBridge)
        .map(([id, e]) => [id, e.suspensionBridge])
    ]);
  if (reuseRoads && bridgeInput(recipe) === bridgeInput(previous!.recipe)) {
    // Unchanged authoring reuses the complete publication, including object identity.
    const prior = previous!.plan;
    plan.routes = prior.spatialLayout?.instanceConnections?.routes ?? prior.routes;
    plan.roadGraph = prior.spatialLayout?.instanceConnections?.graph ?? prior.roadGraph;
    plan.roadNetwork = prior.spatialLayout?.instanceConnections?.network ?? prior.roadNetwork;
    plan.bridges = prior.bridges;
    plan.roadApproaches = prior.roadApproaches;
    const ports = new Map(
      (prior.spatialLayout?.instanceConnections?.ports ?? prior.planning!.ports).map((port) => [port.id, port.position])
    );
    plan.planning!.ports = plan.planning!.ports.map((port) => {
      const position = ports.get(port.id);
      return position ? { ...port, position } : port;
    });
    checks.push(...previous!.checks.filter((c) => c.rule === "suspension-bridge"));
  } else {
    checks.push(
      ...publishPlanningSuspensionBridges(
        plan,
        naturalCrossings,
        p.suspensionBridge ?? {},
        Object.fromEntries(
          Object.entries(recipe.edits)
            .filter(([, e]) => e.suspensionBridge)
            .map(([id, e]) => [id, e.suspensionBridge!])
        ),
        (_, outline) => inside(outline) && respectsRoadAreas(outline) && !roadObstacles.collides(outline),
        previous?.plan
      )
    );
    publishGlobalRoadMetadata(plan, config.network);
  }
  for (const route of plan.routes) {
    const actual = Math.min(...(route.navigationLinks ?? []).map((l) => l.width));
    if (actual + 0.01 < route.width)
      checks.push({
        id: `width:${route.id}`,
        rule: "road-clearance",
        owners: [route.id],
        required: false,
        status: "unknown",
        message: `共享通道局部净空仅允许 ${actual.toFixed(2)} 米路宽；保留连接与体量`,
        measured: actual,
        limit: route.width
      });
  }
  ground = createPlanningGroundSampler(plan);
  let roadSupport: ReturnType<typeof bridgeGround> | undefined;
  for (const node of reuseRoads ? [] : (plan.roadGraph?.nodes ?? [])) {
    const port = plan.planning!.ports.find((p) => p.id === node.id);
    if (port?.id.startsWith("road-junction:")) {
      port.height = (roadSupport ??= bridgeGround(plan, ground))(node.position);
      port.surfaceId = "ground";
    }
  }
  mark("roads");
  const automaticRoads = {
    crossingBaseline: naturalCrossings,
    signature: roadSignature(),
    routes: plan.routes,
    graph: plan.roadGraph,
    junctions: plan.planning!.ports.filter((p) => p.id.startsWith("road-junction:")),
    network: plan.roadNetwork
  };
  plan.spatialLayout = { ...plan.spatialLayout!, baselineGroups: groups, exclusions: relations };
  applySpatialStructureEdits(plan, document, ground);
  checks.push(...auditRoadTermini(plan), ...finalRoadGradeChecks(plan));
  const publishedGroups = plan.spatialLayout.groups;
  plan.authoredResources = publishedResources;
  ground = createPlanningGroundSampler(plan);
  let landscapeBase: LandscapeBasemap | undefined;
  // Water hosts retain road-solving dependencies, but need no ecology or guidance generation.
  if (options.environment !== false) {
    progress?.("准备地形接地采样");
    planningGroundSurface(plan);
    mark("terrain.surface");
    progress?.("更新局部生态");
    const environment: EnvironmentContext = {
      plan,
      recipe,
      document,
      previous,
      compatible,
      terrainChanged: terrainChanged || patchChanged,
      value,
      ground,
      timings
    };
    const priorVolumes = new Map(
      previous?.plan.spatialLayout?.groups.flatMap((group) =>
        group.volumes.map((volume) => [volume.id, volume] as const)
      )
    );
    const finalVolumes = new Map(
      publishedGroups.flatMap((group) => group.volumes.map((volume) => [volume.id, volume] as const))
    );
    const area = updateSpatialEcology(
      environment,
      [...finalVolumes.values()].filter((volume) => !sameVolumeFootprint(volume, priorVolumes.get(volume.id))),
      [...priorVolumes.values()].filter((volume) => !finalVolumes.has(volume.id))
    );
    const sampling = landscapeSampling(plan, config.landscape);
    if (sampling.limited)
      checks.push({
        id: "landscape-sampling-budget",
        owners: ["world"],
        rule: "computation-budget",
        required: false,
        status: "unknown",
        message: `景观采样预算：请求 ${sampling.requestedDensity} 处/1000㎡，本次实际 ${sampling.actualDensity.toFixed(2)}；保留请求参数，未拒绝布局`
      });
    mark("ecology");
    progress?.("更新视觉引导");
    checks.push(...updateSpatialGuidance(environment, area));
    mark("guidance");
    landscapeBase = revealSpatialEcology(environment);
    publishCompositionTrees(plan, ground, config.landscape, recipe.edits);
    applyMojaveDesertAppearance(plan, recipe);
  }
  // Spawn belongs to a populated village when one exists; layout order also includes rock POIs.
  const first =
    publishedGroups.find((g) => appearances[g.id] === "building" && g.volumes.length && g.ports.length) ??
    publishedGroups.find((g) => g.ports.length);
  if (first) {
    const entrance = plan.roadNetwork?.nodes.find(
      (n) => n.poiId === first.id && plan.roadNetwork!.edges.some((e) => e.a === n.id || e.b === n.id)
    );
    const port =
      first.ports.find((p) => p.id === entrance?.portId) ??
      first.ports.find((p) => p.id === first.volumes[0]?.id + ":port") ??
      first.ports[0];
    plan.spawn = { ...port.position };
  }
  if (configuredSpawn) plan.spawn = { ...configuredSpawn.position };
  const templateSite = plan.worldTemplateSite;
  if (
    options.environment !== false &&
    templateSite &&
    (configuredSpawn || WORLD_TEMPLATE_ART[templateSite.templateId].plannedSubjects)
  ) {
    const surface = planningGroundSurface(plan);
    const sample = (x: number, z: number) => surface.sample({ x, z });
    const scene = resolveWorldTemplateScene(plan, sample)!;
    const { pose } = resolveWorldTemplateView(
      scene,
      1,
      PLANNING_RUNTIME_OPTIONS.verticalFieldOfView,
      PLANNING_REFERENCE.actor.heightM,
      sample
    );
    templateSite.spawnView = pose;
    plan.spawn = { x: pose.eye[0], z: pose.eye[2] };
  }
  const guidanceIds = new Set(plan.visualGuidance?.flatMap((g) => g.memberIds));
  plan.spatialLayout = {
    ...plan.spatialLayout,
    worldSignature,
    terrainSignature,
    riverSignature,
    hydrologyInputSignature,
    siteOrigins,
    groups: publishedGroups,
    baselineGroups: groups,
    baselineGuidanceRocks: plan.rocks.filter((rock) => guidanceIds.has(rock.id)),
    landscapeBase,
    elementProfiles,
    exclusions: relations,
    roads: automaticRoads
  };
  if (p.farming?.enabled !== false && template?.farming !== false) {
    const farmSearchStarted = performance.now();
    const farmSignature = JSON.stringify([
      worldSignature,
      terrainSignature,
      riverSignature,
      plan.spawn,
      p.farming,
      document.authoredResources,
      plan.poiDistribution,
      groups.map((g) => g.volumes),
      plan.buildings,
      plan.rocks,
      plan.regions,
      plan.plazas,
      plan.fences,
      plan.waters,
      plan.bridges,
      plan.roadApproaches,
      plan.planning!.profiles,
      plan.routes
    ]);
    const farmResult =
      saved?.farmSearch?.signature === farmSignature
        ? { ...saved.farmSearch.result, planningRevision: document.revision }
        : preparePlanningFarmLayout(plan, publishedGroups, document.revision, p.farming ?? {});
    plan.spatialLayout.farmSearch = { signature: farmSignature, result: farmResult };
    plan.farming = farmResult;
    timings["farming.initialSearch"] = performance.now() - farmSearchStarted;
    const finalFarmStarted = performance.now();
    const unoccupiedLandscapes = plan.landscapes;
    excludePlanningFarmLandscape(plan);
    finalizePlanningFarm(plan);
    if (plan.farming.placementCheck.state === "ready") publishPlanningFarmGeometry(plan);
    else plan.landscapes = unoccupiedLandscapes;
    timings["farming.finalValidation"] = performance.now() - finalFarmStarted;
    timings["farming.total"] = timings["farming.initialSearch"] + timings["farming.finalValidation"];
    if (!previous)
      console.info("[Planner][Farming] 初始化选址", {
        seed: p.seed,
        poiId: plan.farming.poiId,
        plotCount: plan.farming.placement?.plots.length ?? 0,
        containerCount: plan.farming.placement?.storage.containers.length ?? 0,
        sampled: plan.farming.search?.sampled ?? 0,
        initialCandidates: plan.farming.search?.inspected ?? 0,
        searchedPois: plan.farming.search?.regionIds.length ?? 0,
        placement: plan.farming.placementCheck.state,
        spawnDistanceM: plan.farming.entrance
          ? Math.hypot(plan.farming.entrance.x - plan.spawn.x, plan.farming.entrance.z - plan.spawn.z)
          : null,
        initialSearchMs: timings["farming.initialSearch"],
        finalValidationMs: timings["farming.finalValidation"],
        totalMs: timings["farming.total"]
      });
    for (const [dimension, result] of Object.entries({
      placement: plan.farming.placementCheck,
      access: plan.farming.accessCheck
    }))
      for (const issue of result.issues)
        checks.push({
          id: `farming:${dimension}:${issue.code}:${issue.target}`,
          rule: `farming-${dimension}`,
          owners: plan.farming.poiId ? [plan.farming.poiId] : ["world"],
          required: false,
          status: "unknown",
          message: issue.message
        });
  }

  const verification = new VolumeIndex(relations);
  const volumes = groups.flatMap((g) => g.volumes);
  volumes.forEach((v) => verification.set(v));
  for (const v of volumes) {
    const conflicts = verification.conflicts(v);
    if (conflicts.length)
      checks.push({
        id: `collision:${v.id}`,
        rule: "volume-exclusion",
        owners: [v.id, ...conflicts],
        required: true,
        status: "fail",
        message: "声明互斥的体量发生相交"
      });
  }
  const accepted = !checks.some((c) => c.required && c.status === "fail");
  applySpatialSceneryEdits(
    plan,
    document,
    cachedPlanningHeightmap(plan)?.sample ?? ((point) => planningGroundSurface(plan).sample(point))
  );
  checks.push(...(plan.spatialLayout?.instanceConnectionChecks ?? []));
  const changedIds = changedSpatialOutputs(previous?.plan, plan);
  plan.planning!.checks = checks;
  plan.planning!.status = accepted ? "valid" : "invalid";
  plan.planning!.changedIds = changedIds;
  timings.total = performance.now() - started;
  return {
    recipe,
    plan,
    checks,
    accepted,
    changedIds,
    notes,
    timings,
    execution: compatible ? "local" : "full"
  };
}
