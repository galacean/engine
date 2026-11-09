import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../semantic-study/WorldPlanningTerrain";
import { envelope } from "../semantic-study/IslandPlanAtoms";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import { naturalTreeDimensions, naturalVegetationAt } from "../planning-data/NaturalVegetationProfile";
import { poiLandscapeConfig, sampleLandscapeHabitat, type LandscapeConfig } from "../semantic-study/ContextLandscape";
import type { SemanticEdit } from "../semantic-study/WorldPlanningContract";
import { SETTLEMENT_PROFILE } from "../planning-data/SettlementProfile";
import { territoryLookup } from "./ecology/PoiTerritories";
import { boxGroundBottom } from "./layout/VolumeTerrain";
import { PLANT_TREE_SPECIES } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import { registerLayoutRule, layoutRule, layoutRandom, type LayoutRule } from "./layout/LayoutRules";
import { solveLayoutGroup, type LayoutGroup } from "./layout/LayoutKernel";
import { VolumeIndex } from "./layout/Volumes";
import { compileRoadPath, type RoadClearance } from "./layout/RoadGeometry";
import { compositionAxis, compositionLane, compositionOutline, compositionPoint } from "./SpatialCompositionGeometry";
import { spatialCompositionParameters } from "./SpatialCompositionParameters";
import { worldTemplate } from "./WorldTemplateCatalog";
import { buildWorldTemplateGeometry } from "./WorldTemplateGeometry";
import type { RiverParameters } from "./hydrology/RiverRegions";
import type { LakeParameters } from "./hydrology/LakeRegions";

export const COMPOSITION_OWNER = "landscape-composition";
function context(plan: IslandPlan) {
  const q = spatialCompositionParameters(plan.parameters.spatialComposition);
  const template = worldTemplate(plan.parameters.worldTemplate?.id);
  const geometry = template
    ? buildWorldTemplateGeometry(template, plan.parameters.seed, { ...q, headingDegrees: 0 })
    : undefined;
  const nodes = geometry?.nodes ?? [];
  const primary = nodes.filter((node) => node.grounded && geometry!.focusIds.includes(node.id));
  // Keep the water and main axis in front of occupied subjects; their actual
  // footprint supplies the setback, without per-template offsets or cases.
  const front = primary.length ? Math.min(...primary.map((node) => node.position[2] - node.scale[2] / 2)) : 0;
  const end = {
    x: 0,
    z: Math.min(0, front - q.forecourtDepthM - q.bankWidthM - q.streamWidthM / 2 - q.roadWidthM / 2)
  };
  if (q.enabled && (q.roadWidthM || q.streamWidthM) && q.frontDepthM + end.z <= 0)
    throw new Error("前景纵深不足以容纳主体占地与步道、水岸净空");
  return { q, nodes, end };
}

/** Ephemeral native Watercourse/Lake inputs. Nothing is added to author edits or resources. */
export function compositionHydrology(plan: IslandPlan): {
  rivers: Record<string, Partial<RiverParameters>>;
  lakes: Record<string, Partial<LakeParameters>>;
} {
  const { q, end, nodes } = context(plan),
    rivers: Record<string, Partial<RiverParameters>> = {},
    lakes: Record<string, Partial<LakeParameters>> = {};
  if (!q.enabled) return { rivers, lakes };
  if (q.streamWidthM > 0) {
    const length = q.frontDepthM + end.z,
      segments = Math.max(1, Math.ceil(length / (q.roadWavelengthM / 8)));
    const offset = q.roadWidthM / 2 + q.bankWidthM + q.streamWidthM / 2;
    for (const side of [-1, 1]) {
      const points = Array.from({ length: segments + 1 }, (_, i) => {
        const t = 1 - i / segments,
          p = compositionLane(q, t, side * offset, end);
        return { id: `p${i}`, ...compositionPoint(q, p.x, p.z), width: q.streamWidthM, depth: q.streamDepthM };
      });
      rivers[`river:authored:${COMPOSITION_OWNER}:${side}`] = {
        enabled: true,
        levelMode: "minimum",
        points,
        bankWidthM: q.bankWidthM
      };
    }
    const relief = Math.max(q.leftReliefM, q.rightReliefM),
      side = q.rightReliefM >= q.leftReliefM ? 1 : -1;
    if (q.waterfallWidthM > 0 && relief > 0) {
      const steps = Math.ceil(relief / q.terraceStepHeightM);
      // The outlet stays outside actual grounded subjects and their circulation
      // clearance. A shelf's inner edge alone can enclose a destination behind water.
      const occupied = nodes
        .filter((node) => node.grounded)
        .map((node) => side * -node.position[0] + node.scale[0] / 2);
      const edge = Math.max(
        q.widthM / 2 - Math.min(q.widthM / 2, steps * q.terraceTreadM),
        ...occupied.map((extent) => extent + q.waterfallWidthM / 2 + q.bankWidthM + q.roadWidthM)
      );
      if (edge >= q.widthM / 2 - q.terraceTreadM / 2) throw new Error("布局宽度不足以容纳主体、水道和通行净空");
      const bank = compositionLane(q, 1, side * offset, end);
      const points = [
        [side * (q.widthM / 2 - q.terraceTreadM / 2), q.backDepthM / 2],
        [side * edge, q.backDepthM / 2],
        [side * edge, end.z],
        [bank.x, bank.z]
      ].map(([x, z], i) => ({
        id: `p${i}`,
        ...compositionPoint(q, x, z),
        width: q.waterfallWidthM,
        depth: q.streamDepthM
      }));
      rivers[`river:authored:${COMPOSITION_OWNER}:drop`] = {
        enabled: true,
        levelMode: "minimum",
        points,
        bankWidthM: q.bankWidthM,
        sections: [{ id: "drop", from: "p0", to: "p1", form: "waterfall", carve: true }]
      };
    }
  }
  if (q.basinRadiusM > 0) {
    const shoreline = Array.from({ length: 96 }, (_, i) => ({
      id: `rim:${i}`,
      ring: "shore",
      ...compositionPoint(
        q,
        Math.cos((i * Math.PI) / 48) * q.basinRadiusM,
        Math.sin((i * Math.PI) / 48) * q.basinRadiusM
      )
    }));
    const ground = createPlanningGroundSampler(
      { ...plan, waters: [], planning: { ...plan.planning!, profiles: [] } },
      { natural: true }
    );
    lakes[`lake:authored:${COMPOSITION_OWNER}`] = {
      enabled: true,
      shoreline,
      referenceLevel: Math.min(...shoreline.map(ground)) - 0.1,
      radiusM: q.basinRadiusM,
      depthM: q.basinDepthM,
      bankWidthM: q.bankWidthM,
      allowCarving: true
    };
  }
  return { rivers, lakes };
}

function bankCandidates(plan: IslandPlan, spacing: number, band: number) {
  const { q, end } = context(plan);
  if (!q.enabled || spacing <= 0) return [];
  const offset = q.roadWidthM / 2 + q.bankWidthM + q.streamWidthM + spacing / 2;
  const rows = Math.max(1, Math.ceil(band / spacing));
  const length = q.frontDepthM + q.backDepthM,
    segments = Math.ceil(length / spacing),
    result: { id: string; center: PlanPoint; yaw: number }[] = [];
  const region = createPlanningRingQuery(compositionOutline(q)!);
  for (const side of [-1, 1])
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < segments; i++) {
        const id = `${side}:${row}:${i}`,
          jitter = (field: string) => settlementRandom(q.seed, `${COMPOSITION_OWNER}:${field}:${id}`);
        const z = -q.frontDepthM + (length * (i + jitter("along"))) / segments,
          t = (z + q.frontDepthM) / (q.frontDepthM + end.z),
          lateral = side * (offset + row * spacing + (jitter("across") - 0.5) * Math.min(band, spacing));
        const point = t <= 1 ? compositionLane(q, t, lateral, end) : { x: end.x + lateral, z },
          center = compositionPoint(q, point.x, point.z);
        if (region.inside(center)) result.push({ id, center, yaw: jitter("yaw") * Math.PI * 2 });
      }
  return result;
}
const pattern = "shoreline-spacing";
registerLayoutRule({
  id: pattern,
  version: 1,
  label: "沿岸间距生成",
  connections: "none",
  parameterKeys: [],
  build: ({ components }) => {
    const input = components.landscapeComposition!,
      q = spatialCompositionParameters(input as never);
    const plan = {
      parameters: { spatialComposition: q, seed: q.seed, worldTemplate: components.worldTemplate }
    } as unknown as IslandPlan;
    return {
      members: bankCandidates(plan, q.rockSpacingM, q.rockDepthM).map((candidate) => [
        {
          center: candidate.center,
          width: q.rockWidthM,
          depth: q.rockDepthM,
          height: q.rockHeightM,
          elevation: 0,
          yaw: candidate.yaw
        }
      ])
    };
  }
});

export function compileCompositionGroup(plan: IslandPlan, ground: (p: PlanPoint) => number): LayoutGroup | undefined {
  const q = spatialCompositionParameters(plan.parameters.spatialComposition),
    outline = compositionOutline(q);
  if (!outline || !q.rockSpacingM) return;
  const center = { x: q.centerX, z: q.centerZ },
    components = { landscapeComposition: q, worldTemplate: { id: plan.parameters.worldTemplate?.id ?? "" } };
  const rule: LayoutRule = {
    pattern,
    radiusM: Math.hypot(q.widthM, q.frontDepthM + q.backDepthM),
    widthMinM: q.rockWidthM,
    widthMaxM: q.rockWidthM,
    depthMinM: q.rockDepthM,
    depthMaxM: q.rockDepthM,
    heightMinM: q.rockHeightM,
    heightMaxM: q.rockHeightM,
    spacingMinM: q.rockSpacingM,
    spacingMaxM: q.rockSpacingM,
    orientationVariation: 0,
    pathWidthM: 1,
    openRadiusM: 0,
    roadMode: "none",
    roadAccess: false,
    maxGroundSlopeDegrees: 90
  };
  const construction = layoutRule(pattern).build({
    owner: COMPOSITION_OWNER,
    center,
    region: outline,
    parameters: rule,
    components,
    random: layoutRandom(q.seed, COMPOSITION_OWNER, 0, 0)
  });
  const blocked = [
    ...plan.waters.map((w) => w.outline),
    ...(plan.worldTemplateSite?.footprints ?? []).map((item) => item.outline)
  ].map(createPlanningRingQuery);
  return solveLayoutGroup(
    COMPOSITION_OWNER,
    center,
    rule,
    q.seed,
    new VolumeIndex(),
    () => true,
    ground,
    undefined,
    {},
    JSON.stringify(q),
    components,
    (footprint) => !blocked.some((area) => area.overlapsPolygon(footprint)),
    undefined,
    construction
  );
}

/** The published route is compiled once by native RoadSpline and enters ordinary
 * topology, terrain, vegetation and navigation. Endpoints are real navigation areas. */
export function publishCompositionPaths(
  plan: IslandPlan,
  publishPaths = true,
  clear?: RoadClearance,
  connect?: (from: PlanPoint, to: PlanPoint, width: number) => PlanPoint[] | undefined
): void {
  const { q, end, nodes } = context(plan);
  if (!q.enabled || !q.roadWidthM) return;
  const length = q.frontDepthM + end.z,
    segments = Math.max(1, Math.ceil(length / (q.roadWavelengthM / 8)));
  const points = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments,
      p = compositionAxis(q, t, end);
    return { ...compositionPoint(q, p.x, p.z), width: q.roadWidthM * (1 + (q.roadEndWidthRatio - 1) * t) };
  });
  if (q.destinationId) {
    const destination = nodes.find((node) => node.id === q.destinationId);
    if (!destination) throw new Error(`步道目的地不存在：${q.destinationId}`);
    const target = compositionPoint(
      q,
      -destination.position[0],
      destination.position[2] - destination.scale[2] / 2 - q.roadWidthM
    );
    // Native pathfinding owns clearance around occupied subjects. The destination
    // is an asset identity, never an authored endpoint coordinate.
    if (publishPaths && connect) {
      const branch = connect(points.at(-1)!, target, q.roadWidthM * q.roadEndWidthRatio);
      if (!branch) throw new Error(`步道目的地无法连通：${q.destinationId}`);
      points.push(...branch.slice(1).map((p) => ({ ...p, width: q.roadWidthM * q.roadEndWidthRatio })));
    } else points.push({ ...target, width: q.roadWidthM * q.roadEndWidthRatio });
  }
  const id = `${COMPOSITION_OWNER}:path`,
    from = `${id}:arrival`,
    to = `${id}:destination`;
  for (const [areaId, point] of [
    [from, points[0]],
    [to, points.at(-1)!]
  ] as const) {
    const outline = envelope(point, point.width, point.width, 0);
    plan.regions.push({ id: areaId, label: "步道入口", kind: "open", outline, navigationArea: outline });
    plan.planning!.ports.push({
      id: `${areaId}:port`,
      ownerId: areaId,
      position: { x: point.x, z: point.z },
      height: 0,
      width: point.width,
      kind: "entrance",
      destinationAreaId: areaId
    });
  }
  if (!publishPaths) return;
  const domain =
    clear ??
    ((_points: PlanPoint[], outline: PlanPoint[]) =>
      outline.every((p) => p.x >= 0 && p.z >= 0 && p.x <= plan.parameters.width && p.z <= plan.parameters.depth));
  const route = compileRoadPath(
    { id, from: `${from}:port`, to: `${to}:port`, width: q.roadWidthM },
    points,
    domain,
    0,
    1,
    { sBend: 0 }
  );
  if (!route) throw new Error("景观步道无法通过当前占地净空，请调整布局尺寸或弯曲参数");
  plan.routes.push(route);
}

/** Deterministic strata produce candidates; native density, species, actual
 * trunk footprints and water/road clearance decide which candidates survive. */
export function publishCompositionTrees(
  plan: IslandPlan,
  ground: (p: PlanPoint) => number,
  config: LandscapeConfig,
  edits: Record<string, SemanticEdit> = {}
): void {
  const q = spatialCompositionParameters(plan.parameters.spatialComposition),
    density = naturalVegetationAt(plan);
  const owner = territoryLookup(plan),
    trunkRadius = SETTLEMENT_PROFILE.landscape.trunkRadius;
  const species = q.treeAssetId && PLANT_TREE_SPECIES.find((species) => species.assetId === q.treeAssetId);
  if (q.treeAssetId && !species) throw new Error(`缺少原生树木资产：${q.treeAssetId}`);
  const blocked = [
    ...plan.waters.map((w) => w.outline),
    ...plan.routes.flatMap((route) => (route.outline ? [route.outline] : [])),
    ...plan.buildings.map((item) => item.outline),
    ...plan.rocks.map((item) => item.outline),
    ...(plan.worldTemplateSite?.footprints ?? []).map((item) => item.outline)
  ].map(createPlanningRingQuery);
  const land = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  for (const candidate of bankCandidates(plan, q.treeSpacingM, q.treeBandWidthM)) {
    const { center, yaw } = candidate,
      id = `${COMPOSITION_OWNER}:tree:${candidate.id}`;
    const site = owner(center)[0]?.site,
      growth = site ? poiLandscapeConfig(config, site, edits[site.id], edits[site.domainId]) : config;
    const abundance = growth.density * (config.multiplier ?? 1) * (density(center).trees ?? 0);
    if (settlementRandom(q.seed, id + ":density") >= abundance) continue;
    const minimum = growth.treeHeightMinM,
      maximum = growth.treeHeightMaxM;
    const height = minimum + (maximum - minimum) * settlementRandom(q.seed, id + ":height");
    const shape = species
      ? {
          assetId: species.assetId,
          width: (height * species.sourceDimensionsM[0]) / species.sourceDimensionsM[1],
          depth: (height * species.sourceDimensionsM[2]) / species.sourceDimensionsM[1]
        }
      : naturalTreeDimensions(q.seed, id, height, center);
    const trunk = envelope(center, trunkRadius * 2, trunkRadius * 2, yaw);
    if (!land.some((area) => area.containsPolygon(trunk)) || blocked.some((area) => area.overlapsPolygon(trunk)))
      continue;
    const habitat = sampleLandscapeHabitat(center, trunkRadius, "tree", ground);
    if (
      habitat.altitudeM > growth.maxAltitudeM ||
      habitat.slopeDegrees > growth.maxSlopeDegrees ||
      settlementRandom(q.seed, id + ":habitat") >= habitat.suitability
    )
      continue;
    plan.landscapes!.push({
      id,
      ownerId: COMPOSITION_OWNER,
      sourceId: candidate.id,
      kind: "tree",
      role: "ambient",
      center,
      width: shape.width,
      depth: shape.depth,
      height,
      yaw,
      baseHeight: boxGroundBottom({ center, width: trunkRadius * 2, depth: trunkRadius * 2, yaw }, ground),
      outline: envelope(center, shape.width, shape.depth, yaw),
      habitat,
      collisionRadius: trunkRadius,
      canopyRadius: Math.hypot(shape.width, shape.depth) / 2,
      assetId: shape.assetId
    });
  }
}
