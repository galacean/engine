import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../semantic-study/WorldPlanningTerrain";
import { envelope } from "../semantic-study/IslandPlanAtoms";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import { ribbonOutline } from "../semantic-study/WorldRibbon";
import { watercourseGeometry } from "@galacean/engine-water/water/index";
import { createNaturalTreeDimensions, naturalVegetationAt } from "../planning-data/NaturalVegetationProfile";
import { poiLandscapeConfig, sampleLandscapeHabitat, type LandscapeConfig } from "../semantic-study/ContextLandscape";
import type { SemanticEdit } from "../semantic-study/WorldPlanningContract";
import { SETTLEMENT_PROFILE } from "../planning-data/SettlementProfile";
import { territoryLookup } from "./ecology/PoiTerritories";
import { boxGroundBottom } from "./layout/VolumeTerrain";
import { PLANT_TREE_SPECIES } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import { registerLayoutRule, layoutRule, layoutRandom, type LayoutRule } from "./layout/LayoutRules";
import { solveLayoutGroup, type LayoutGroup } from "./layout/LayoutKernel";
import { VolumeIndex, type VolumeBox } from "./layout/Volumes";
import { compileRoadPath, type RoadClearance } from "./layout/RoadGeometry";
import {
  compositionAxis,
  compositionLane,
  compositionOutline,
  compositionPoint,
  compositionReliefBoxes,
  compositionSubjectTerraceBox
} from "./SpatialCompositionGeometry";
import { spatialCompositionParameters } from "./SpatialCompositionParameters";
import { worldTemplate } from "./WorldTemplateCatalog";
import { buildWorldTemplateGeometry, templateNodeFootprint } from "./WorldTemplateGeometry";
import type { RiverParameters } from "./hydrology/RiverRegions";
import type { LakeParameters } from "./hydrology/LakeRegions";

export const COMPOSITION_OWNER = "landscape-composition";
export const COMPOSITION_RELIEF_OWNER = `${COMPOSITION_OWNER}:relief`;
export const COMPOSITION_SUBJECT_TERRACE_OWNER = `${COMPOSITION_OWNER}:subject-terrace`;
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
  const terraceRadius = q.subjectTerraceHeightM > 0 ? q.subjectTerraceRadiusM : 0;
  const front = Math.min(
    -terraceRadius,
    ...primary.map((node) => node.position[2] - (node.footprint?.[1] ?? node.scale[2]) / 2)
  );
  const end = {
    x: 0,
    z: Math.min(0, front - q.forecourtDepthM - q.bankWidthM - q.streamWidthM / 2 - q.roadWidthM / 2)
  };
  if (q.enabled && (q.roadWidthM || q.streamWidthM) && q.frontDepthM + end.z <= 0)
    throw new Error("前景纵深不足以容纳主体占地与步道、水岸净空");
  return { q, nodes, end, terraceRadius };
}

/** Ephemeral native Watercourse/Lake inputs. Nothing is added to author edits or resources. */
export function compositionHydrology(plan: IslandPlan): {
  rivers: Record<string, Partial<RiverParameters>>;
  lakes: Record<string, Partial<LakeParameters>>;
} {
  const { q, end, nodes, terraceRadius } = context(plan),
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
      const band = Math.min(q.widthM / 2, q.reliefBandWidthM || steps * q.terraceTreadM);
      // Let the lower reach cut through the first shelf, so the native rock
      // footprints leave an opening toward the valley and the falling water.
      const channel = q.widthM / 2 - band + (q.reliefSurface === "rocks" ? band / (2 * steps) : 0);
      const occupied = nodes
        .filter((node) => node.grounded)
        .flatMap((node) => templateNodeFootprint(node).map((point) => side * -point.x));
      const edge = Math.max(
        channel,
        Math.max(terraceRadius, ...occupied) + q.waterfallWidthM / 2 + q.bankWidthM + q.roadWidthM
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

const reliefPattern = "terraced-rocks";
registerLayoutRule({
  id: reliefPattern,
  version: 1,
  label: "程序化岩台",
  connections: "none",
  parameterKeys: [],
  build: ({ components }) => ({ members: compositionReliefBoxes(components.landscapeComposition as never) })
});

/** Rock relief enters the existing worker, material, grass, picking and collision
 * publication as an ordinary layout group, with no extra renderer. */
export function compileCompositionReliefGroups(plan: IslandPlan): LayoutGroup[] {
  const q = spatialCompositionParameters(plan.parameters.spatialComposition),
    relief = compositionReliefBoxes(q),
    terrace = compositionSubjectTerraceBox(q);
  if (!relief.length && !terrace) return [];
  const ground = createPlanningGroundSampler(plan, { natural: true });
  const waterAreas = plan.waters
    .flatMap((water) => {
      if (water.course?.drops.length) {
        // Raised reaches are supported by the rocks. Only ground-level reaches
        // exclude rock footprints; deleting the upstream rock would suspend water.
        return watercourseGeometry(water.course)
          .paths.filter((path) => path.some((point) => point.elevation <= ground(point) + point.depth))
          .map((path) =>
            ribbonOutline(
              path,
              path.map((point) => point.width + 2 * (water.bankWidthM ?? 0)),
              undefined,
              true
            )
          );
      }
      return [
        water.kind === "river" && water.centerline && water.widths
          ? ribbonOutline(
              water.centerline,
              water.widths.map((width, i) => width + 2 * (water.bankWidths?.[i] ?? water.bankWidthM ?? 0)),
              undefined,
              true
            )
          : water.outline
      ];
    })
    .map(createPlanningRingQuery);
  const solve = (owner: string, members: VolumeBox[][], blocked: typeof waterAreas, radiusM: number) => {
    const boxes = members.flat();
    const rule: LayoutRule = {
      pattern: reliefPattern,
      radiusM,
      widthMinM: Math.min(...boxes.map((box) => box.width)),
      widthMaxM: Math.max(...boxes.map((box) => box.width)),
      depthMinM: Math.min(...boxes.map((box) => box.depth)),
      depthMaxM: Math.max(...boxes.map((box) => box.depth)),
      heightMinM: Math.min(...boxes.map((box) => box.height)),
      heightMaxM: Math.max(...boxes.map((box) => box.height)),
      spacingMinM: -q.terraceTreadM * q.terrainRoughness,
      spacingMaxM: -q.terraceTreadM * q.terrainRoughness,
      orientationVariation: 0,
      pathWidthM: 1,
      openRadiusM: 0,
      roadMode: "none",
      roadAccess: false,
      maxGroundSlopeDegrees: 90
    };
    return solveLayoutGroup(
      owner,
      { x: q.centerX, z: q.centerZ },
      rule,
      q.seed,
      new VolumeIndex(),
      () => true,
      ground,
      undefined,
      {},
      JSON.stringify(q),
      { landscapeComposition: q },
      (footprint) => !blocked.some((area) => area.overlapsPolygon(footprint)),
      undefined,
      { members }
    );
  };
  const groups: LayoutGroup[] = [];
  if (relief.length) {
    const subjects = (plan.worldTemplateSite?.footprints ?? []).map((item) => createPlanningRingQuery(item.outline));
    // Keep candidate order stable when water clearance rejects a member.
    groups.push(
      solve(
        COMPOSITION_RELIEF_OWNER,
        relief,
        [...waterAreas, ...subjects],
        Math.hypot(q.widthM, q.frontDepthM + q.backDepthM)
      )
    );
  }
  // The subject terrace deliberately shares the footprint of the objects it supports.
  if (terrace) {
    const radius = Math.hypot(terrace.width, terrace.depth) / 2;
    groups.push(solve(COMPOSITION_SUBJECT_TERRACE_OWNER, [[terrace]], waterAreas, radius));
  }
  return groups;
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

function reliefTreeCandidates(plan: IslandPlan, ground: (p: PlanPoint) => number) {
  const q = spatialCompositionParameters(plan.parameters.spatialComposition);
  const result: { id: string; center: PlanPoint; yaw: number; surfaceHeight: number; reliefHeight: number }[] = [];
  if (!q.enabled || !q.treeSpacingM || !q.reliefTreeDensity) return result;
  const shelves = plan.rocks
    .filter((rock) => rock.groupId === COMPOSITION_RELIEF_OWNER)
    .flatMap((rock) =>
      (rock.boxes ?? []).map((box) => ({
        id: `${rock.id}:${box.id}`,
        box,
        top: (box.elevation ?? rock.baseHeight ?? 0) + box.sizeY,
        footprint: createPlanningRingQuery(envelope(box.center, box.sizeX, box.sizeZ, box.yaw))
      }))
    );
  for (const { id: shelfId, box, top } of shelves) {
    const nx = Math.max(1, Math.floor(box.sizeX / q.treeSpacingM)),
      nz = Math.max(1, Math.floor(box.sizeZ / q.treeSpacingM)),
      c = Math.cos(box.yaw),
      s = Math.sin(box.yaw);
    for (let x = 0; x < nx; x++)
      for (let z = 0; z < nz; z++) {
        const id = `${shelfId}:${x}:${z}`;
        const jitter = (axis: string) => (settlementRandom(q.seed, `${id}:${axis}`) - 0.5) * q.terrainRoughness;
        const px = box.sizeX * ((x + 0.5 + jitter("x")) / nx - 0.5),
          pz = box.sizeZ * ((z + 0.5 + jitter("z")) / nz - 0.5);
        const center = { x: box.center.x + px * c - pz * s, z: box.center.z + px * s + pz * c };
        if (top <= ground(center) || shelves.some((other) => other.top > top && other.footprint.inside(center)))
          continue;
        result.push({
          id,
          center,
          yaw: settlementRandom(q.seed, `${id}:yaw`) * Math.PI * 2,
          surfaceHeight: top,
          reliefHeight: box.sizeY
        });
      }
  }
  return result;
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
  const owner = territoryLookup(plan);
  const species = q.treeAssetId && PLANT_TREE_SPECIES.find((species) => species.assetId === q.treeAssetId);
  if (q.treeAssetId && !species) throw new Error(`缺少原生树木资产：${q.treeAssetId}`);
  const palette = q.treeSpeciesGroup
    ? PLANT_TREE_SPECIES.filter((member) => member.speciesGroup === q.treeSpeciesGroup)
    : PLANT_TREE_SPECIES;
  if (!species && !palette.length) throw new Error(`缺少原生乔木物种组：${q.treeSpeciesGroup}`);
  const treeDimensions = species
    ? (_id: string, height: number) => ({
        assetId: species.assetId,
        width: (height * species.sourceDimensionsM[0]) / species.sourceDimensionsM[1],
        depth: (height * species.sourceDimensionsM[2]) / species.sourceDimensionsM[1]
      })
    : createNaturalTreeDimensions(q.seed, palette);
  const blocked = [
    ...plan.waters.map((w) => w.outline),
    ...plan.routes.flatMap((route) => (route.outline ? [route.outline] : [])),
    ...plan.buildings.map((item) => item.outline),
    ...(plan.worldTemplateSite?.footprints ?? []).map((item) => item.outline)
  ].map(createPlanningRingQuery);
  const rocks = plan.rocks.map((item) => createPlanningRingQuery(item.outline));
  const land = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  const candidates = [
    ...bankCandidates(plan, q.treeSpacingM, q.treeBandWidthM).map((candidate) => ({
      ...candidate,
      surfaceHeight: undefined,
      reliefHeight: undefined
    })),
    ...reliefTreeCandidates(plan, ground)
  ];
  for (const candidate of candidates) {
    const { center, yaw } = candidate,
      elevated = candidate.surfaceHeight !== undefined,
      treeOwner = elevated ? COMPOSITION_RELIEF_OWNER : COMPOSITION_OWNER,
      id = `${treeOwner}:tree:${candidate.id}`;
    const site = owner(center)[0]?.site,
      growth = site ? poiLandscapeConfig(config, site, edits[site.id], edits[site.domainId]) : config;
    const abundance =
      growth.density * (config.multiplier ?? 1) * (density(center).trees ?? 0) * (elevated ? q.reliefTreeDensity : 1);
    if (settlementRandom(q.seed, id + ":density") >= abundance) continue;
    const minimum = growth.treeHeightMinM,
      maximum = Math.max(minimum, Math.min(growth.treeHeightMaxM, candidate.reliefHeight ?? Infinity));
    const height = minimum + (maximum - minimum) * settlementRandom(q.seed, id + ":height");
    const shape = treeDimensions(id, height, center),
      spread = elevated ? 1 : q.treeHorizontalScale,
      width = shape.width * spread,
      depth = shape.depth * spread,
      trunkRadius = SETTLEMENT_PROFILE.landscape.trunkRadius * spread;
    const trunk = envelope(center, trunkRadius * 2, trunkRadius * 2, yaw);
    if (
      (!elevated && !land.some((area) => area.containsPolygon(trunk))) ||
      blocked.some((area) => area.overlapsPolygon(trunk)) ||
      (!elevated && rocks.some((area) => area.overlapsPolygon(trunk)))
    )
      continue;
    const support = elevated ? (_p: PlanPoint) => candidate.surfaceHeight! : ground;
    const habitat = sampleLandscapeHabitat(center, trunkRadius, "tree", support);
    if (
      habitat.altitudeM > growth.maxAltitudeM ||
      habitat.slopeDegrees > growth.maxSlopeDegrees ||
      settlementRandom(q.seed, id + ":habitat") >= habitat.suitability
    )
      continue;
    plan.landscapes!.push({
      id,
      ownerId: treeOwner,
      sourceId: candidate.id,
      kind: "tree",
      role: "ambient",
      ...(elevated ? { context: "landform" as const } : {}),
      center,
      width,
      depth,
      height,
      ...(spread !== 1 ? { treeHorizontalScale: spread } : {}),
      yaw,
      baseHeight: boxGroundBottom({ center, width: trunkRadius * 2, depth: trunkRadius * 2, yaw }, support),
      outline: envelope(center, width, depth, yaw),
      habitat,
      collisionRadius: trunkRadius,
      canopyRadius: Math.hypot(width, depth) / 2,
      assetId: shape.assetId
    });
  }
}
