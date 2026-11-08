import type { IslandPlan, PlanLandscape, PlanPoint, PlanRock } from "../../semantic-study/IslandPlanModel";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import { inheritPlanningHeightmap, planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import type { SemanticResult } from "../../semantic-study/WorldPlanningContract";
import { exportPlanningRecipe, type PlanningDocument } from "../PlanningDocument";
import { PLANNING_COMPONENTS, planningRegistry } from "../PlanningComponents";
import { resolveComponent } from "../SpatialDocument";
import type { PlanningResource } from "../PlanningResources";
import { applyLandscapeEdits } from "./DerivedEdits";
import { applyLayoutGroupEdits, volumeEnvelope, type LayoutGroup, type VolumeEdit } from "./LayoutKernel";
import { boxOutline, type Volume } from "./Volumes";
import { spatialRevealInputSignature } from "./SpatialEditInputs";
import { updateSpatialInstanceConnections } from "./SpatialInstanceConnections";
import { guidanceRockBox } from "../guidance/GuidanceRock";
import {
  applyLandscapeRockGeneration,
  applyRockObbSizes
} from "../../integrations/terrain/rock-formation/Authoring.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)] as const)
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
/** Author inputs other than direct single-object geometry. Empty materialized
 * entity shells do not turn a sparse instance edit into a planning change. */
function instanceInputs(document: PlanningDocument): string {
  const { revision, entities, placementState, authoredResources, ...other } = document;
  return JSON.stringify(
    canonical({
      ...other,
      authoredResources: (authoredResources ?? []).filter((resource) => !isInstanceResource(resource)),
      entities: Object.fromEntries(
        Object.entries(entities).flatMap(([id, entity]) => {
          const components = canonical(
            Object.fromEntries(
              Object.entries(entity.components)
                .filter(([type]) => {
                  const definition = PLANNING_COMPONENTS.find((item) => item.type === type);
                  return (
                    type !== "solid" && type !== "guidanceMember" && !definition?.presentation && !definition?.runtime
                  );
                })
                .map(([type, component]) => [
                  type,
                  {
                    ...component,
                    values: Object.fromEntries(
                      Object.entries(component.values).filter(
                        ([key]) =>
                          PLANNING_COMPONENTS.find((definition) => definition.type === type)?.fields.find(
                            (field) => field.key === key
                          )?.affectsLayout !== false
                      )
                    )
                  }
                ])
            )
          );
          return components ? [[id, { components, parent: entity.parent }]] : [];
        })
      )
    })
  );
}
function isInstanceResource(resource: PlanningResource): boolean {
  return (
    resource.resourceType === "object-removal" ||
    (resource.resourceType === "vegetation-brush" &&
      resource.properties.distributionKind === "single" &&
      ["tree", "shrub"].includes(resource.properties.category))
  );
}
/** Session may materialize native authoring after the spatial solve. Refresh only
 * this input key on the detached publication candidate, before committing it. */
export function refreshSpatialInstanceInputs(plan: IslandPlan, document: PlanningDocument): void {
  if (plan.spatialLayout)
    plan.spatialLayout = {
      ...plan.spatialLayout,
      instanceInputSignature: instanceInputs(document),
      revealInputSignature: spatialRevealInputSignature(document)
    };
}
function instanceEdits(document: PlanningDocument): Record<string, VolumeEdit> {
  return Object.fromEntries(
    Object.values(document.entities)
      .filter((entity) => entity.components.solid)
      .map((entity) => {
        const resolved = resolveComponent(document, entity.id, "solid", planningRegistry);
        return [
          entity.id,
          Object.fromEntries(
            Object.entries(resolved.values).filter(
              ([key]) => key !== "maxGroundSlopeDegrees" && resolved.sources[key]?.length
            )
          )
        ];
      })
      .filter(([, values]) => Object.keys(values).length)
  );
}
interface VolumeLookup {
  volumes: Map<string, { group: number; member: number; volume: Volume }>;
  buildings: Map<string, number>;
  rocks: Map<string, number>;
  regions: Map<string, number>;
}
const volumeLookups = new WeakMap<LayoutGroup[], VolumeLookup>();
const landscapeLookups = new WeakMap<PlanLandscape[], Map<string, number>>();
const guidanceLookups = new WeakMap<PlanRock[], Map<string, PlanRock>>();
function guidanceLookup(base: PlanRock[] | undefined): Map<string, PlanRock> {
  if (!base) return new Map();
  let result = guidanceLookups.get(base);
  if (!result) {
    result = new Map(base.map((rock) => [rock.id, rock]));
    guidanceLookups.set(base, result);
  }
  return result;
}
function lookup(plan: IslandPlan): VolumeLookup {
  const groups = plan.spatialLayout!.baselineGroups!;
  let result = volumeLookups.get(groups);
  if (!result) {
    result = {
      volumes: new Map(
        groups.flatMap((group, groupIndex) =>
          group.volumes.map((volume, member) => [volume.id, { group: groupIndex, member, volume }] as const)
        )
      ),
      buildings: new Map(plan.buildings.map((value, index) => [value.id, index])),
      rocks: new Map(plan.rocks.map((value, index) => [value.id, index])),
      regions: new Map(plan.regions.map((value, index) => [value.id, index]))
    };
    volumeLookups.set(groups, result);
  }
  return result;
}
function landscapeLookup(base: PlanLandscape[]): Map<string, number> {
  let result = landscapeLookups.get(base);
  if (!result) {
    result = new Map(base.map((value, index) => [value.id, index]));
    landscapeLookups.set(base, result);
  }
  return result;
}
function projectInstances(
  plan: IslandPlan,
  edits: Record<string, VolumeEdit>,
  ids: readonly string[],
  ground: (p: PlanPoint) => number
): number[] {
  const state = plan.spatialLayout!,
    baseline = state.baselineGroups!,
    index = lookup(plan);
  const landscapeBase = state.baselineLandscapes ?? [],
    landscapeIndex = landscapeLookup(landscapeBase);
  const guidance = guidanceLookup(state.baselineGuidanceRocks);
  let landscapesCopied = false,
    buildingsCopied = false,
    rocksCopied = false,
    regionsCopied = false;
  const copiedGroups = new Set<number>();
  const editedRocks = new Set<number>();
  for (const id of ids) {
    const edit = edits[id] ?? {},
      entry = index.volumes.get(id),
      landscapeAt = landscapeIndex.get(id);
    if (entry) {
      const baseGroup = baseline[entry.group];
      const volume = Object.keys(edit).length
        ? applyLayoutGroupEdits({ ...baseGroup, volumes: [entry.volume] }, { [id]: edit }, ground).volumes[0]
        : entry.volume;
      if (!copiedGroups.has(entry.group)) {
        state.groups[entry.group] = { ...state.groups[entry.group], volumes: [...state.groups[entry.group].volumes] };
        copiedGroups.add(entry.group);
      }
      state.groups[entry.group].volumes[entry.member] = volume;
      const primary = volume.boxes[0],
        shape = volumeEnvelope(volume),
        baseHeight = Math.min(...volume.boxes.map((box) => box.elevation));
      const boxes = volume.boxes.map((box, part) => ({
        id: `${id}:part:${part}`,
        label: id,
        center: box.center,
        sizeX: box.width,
        sizeZ: box.depth,
        sizeY: box.height,
        yaw: box.yaw,
        elevation: box.elevation,
        collision: true,
        occlusion: true
      }));
      const buildingAt = index.buildings.get(id),
        rockAt = index.rocks.get(id),
        regionAt = index.regions.get(id);
      if (buildingAt !== undefined) {
        if (!buildingsCopied) {
          plan.buildings = [...plan.buildings];
          buildingsCopied = true;
        }
        plan.buildings[buildingAt] = {
          ...plan.buildings[buildingAt],
          ...(boxes.length === 1 ? primary : { ...shape, yaw: 0 }),
          outline: boxes.length === 1 ? boxOutline(primary) : envelope(shape.center, shape.width, shape.depth, 0),
          baseHeight,
          ...(boxes.length > 1 ? { boxes } : {})
        };
      }
      if (rockAt !== undefined) {
        if (!rocksCopied) {
          plan.rocks = [...plan.rocks];
          rocksCopied = true;
        }
        const outline = envelope(shape.center, shape.width, shape.depth, 0);
        const { rockObbSource, ...rock } = plan.rocks[rockAt];
        plan.rocks[rockAt] = { ...rock, ...shape, yaw: primary.yaw, baseHeight, outline, obb: outline, boxes };
        editedRocks.add(rockAt);
      }
      if (regionAt !== undefined) {
        if (!regionsCopied) {
          plan.regions = [...plan.regions];
          regionsCopied = true;
        }
        plan.regions[regionAt] = {
          ...plan.regions[regionAt],
          outline: envelope(shape.center, shape.width, shape.depth, 0)
        };
      }
    }
    if (landscapeAt !== undefined) {
      if (!landscapesCopied) {
        plan.landscapes = [...(plan.landscapes ?? [])];
        landscapesCopied = true;
      }
      const one = { ...plan, landscapes: [landscapeBase[landscapeAt]] };
      if (Object.keys(edit).length) applyLandscapeEdits(one, { [id]: edit }, ground);
      plan.landscapes![landscapeAt] = one.landscapes[0];
    }
    const guidanceBase = guidance.get(id),
      rockAt = index.rocks.get(id);
    if (guidanceBase && rockAt !== undefined) {
      if (!rocksCopied) {
        plan.rocks = [...plan.rocks];
        rocksCopied = true;
      }
      editedRocks.add(rockAt);
      if (!Object.keys(edit).length) {
        plan.rocks[rockAt] = guidanceBase;
        continue;
      }
      for (const [key, value] of Object.entries(edit))
        if (
          value !== undefined &&
          (!Number.isFinite(value) || (["width", "depth", "height"].includes(key) && value <= 0))
        )
          throw new Error("单体编辑需要有限坐标及正尺寸");
      const rock: PlanRock = {
        ...guidanceBase,
        center: { x: edit.x ?? guidanceBase.center.x, z: edit.z ?? guidanceBase.center.z },
        width: edit.width ?? guidanceBase.width,
        depth: edit.depth ?? guidanceBase.depth,
        height: edit.height ?? guidanceBase.height,
        yaw: edit.yawDegrees === undefined ? guidanceBase.yaw : (edit.yawDegrees * Math.PI) / 180
      };
      rock.outline = rock.obb = envelope(rock.center, rock.width, rock.depth, rock.yaw);
      rock.boxes = [guidanceRockBox(rock, ground)];
      rock.baseHeight = rock.boxes[0].elevation;
      plan.rocks[rockAt] = rock;
    }
  }
  return [...editedRocks];
}
function projectRockSizes(plan: IslandPlan, document: PlanningDocument, indices?: readonly number[]): void {
  const rocks = indices ? indices.map((index) => plan.rocks[index]) : plan.rocks;
  const projection = { ...plan, rocks };
  applyRockObbSizes(projection, document);
  if (indices)
    indices.forEach((index, ordinal) => {
      plan.rocks[index] = projection.rocks[ordinal];
    });
  else plan.rocks = projection.rocks;
  plan.landscapes = projection.landscapes;
}

/** Reapply scenery intent after a water-only ecology solve without moving global solids. */
export function applyLandscapeInstanceEdits(
  plan: IslandPlan,
  document: PlanningDocument,
  ground: (p: PlanPoint) => number
): void {
  if (plan.spatialLayout) plan.spatialLayout = { ...plan.spatialLayout, baselineLandscapes: plan.landscapes ?? [] };
  applyLandscapeEdits(plan, instanceEdits(document), ground);
  applyLandscapeRockGeneration(plan, document);
}

/** Apply authored POI solids and roads before their dependent environment is generated.
 * @param plan Generated geometry with immutable baseline groups and automatic roads.
 * @param document Sparse project authoring parameters.
 * @param ground Final ground sampler used by authored solids.
 */
export function applySpatialStructureEdits(
  plan: IslandPlan,
  document: PlanningDocument,
  ground: (p: PlanPoint) => number
): void {
  const state = plan.spatialLayout;
  if (!state?.baselineGroups) return;
  const edits = instanceEdits(document);
  plan.spatialLayout = {
    ...state,
    groups: [...state.baselineGroups],
    instanceEdits: edits,
    authoredRoadPaths: Object.fromEntries(
      Object.entries(exportPlanningRecipe(document).edits).flatMap(([id, edit]) =>
        edit.road?.keypoints?.length ? [[id, edit.road.keypoints]] : []
      )
    ),
    instanceConnections: state.instanceConnections ?? {
      routes: plan.routes,
      graph: plan.roadGraph,
      network: plan.roadNetwork,
      ports: plan.planning?.ports ?? []
    }
  };
  const members = lookup(plan).volumes;
  projectInstances(
    plan,
    edits,
    Object.keys(edits).filter((id) => members.has(id)),
    ground
  );
  updateSpatialInstanceConnections(plan);
}

/** Apply authored scenery after environment generation without changing its road inputs.
 * @param plan Final structural geometry and generated scenery.
 * @param document Sparse project authoring parameters.
 * @param ground Final ground sampler used by authored scenery.
 */
export function applySpatialSceneryEdits(
  plan: IslandPlan,
  document: PlanningDocument,
  ground: (p: PlanPoint) => number
): void {
  const state = plan.spatialLayout;
  if (!state?.baselineGroups) return;
  const edits = instanceEdits(document);
  const inputSignature = instanceInputs(document);
  plan.spatialLayout = {
    ...state,
    baselineLandscapes: plan.landscapes ?? [],
    instanceInputSignature: inputSignature,
    revealInputSignature: spatialRevealInputSignature(document),
    instanceEdits: edits
  };
  const members = lookup(plan).volumes;
  projectInstances(
    plan,
    edits,
    Object.keys(edits).filter((id) => !members.has(id)),
    ground
  );
  projectRockSizes(plan, document);
}

/** Reapply all author overrides to a reveal-only publication with unchanged structural inputs.
 * @param plan Generated publication candidate.
 * @param document Sparse project authoring parameters.
 * @param ground Final ground sampler.
 */
export function applySpatialInstanceEdits(
  plan: IslandPlan,
  document: PlanningDocument,
  ground: (p: PlanPoint) => number
): void {
  applySpatialStructureEdits(plan, document, ground);
  applySpatialSceneryEdits(plan, document, ground);
}

/** Apply sparse geometry and its connection dependencies without rerunning placement.
 * Reset reads the same immutable base as cold generation.
 * @returns A local publication candidate, or undefined when a planning solve is needed.
 */
export function tryEditSpatialInstances(
  document: PlanningDocument,
  previous?: SemanticResult
): SemanticResult | undefined {
  const state = previous?.plan.spatialLayout;
  if (
    !previous?.accepted ||
    !state?.baselineGroups ||
    !state.baselineLandscapes ||
    state.instanceInputSignature !== instanceInputs(document)
  )
    return;
  const edits = instanceEdits(document),
    before = state.instanceEdits ?? {};
  const changedInstances = [...new Set([...Object.keys(before), ...Object.keys(edits)])].filter(
    (id) => JSON.stringify(canonical(before[id])) !== JSON.stringify(canonical(edits[id]))
  );
  const oldResources = new Map(
    (previous.plan.authoredResources ?? []).map((resource) => [resource.resourceId, resource])
  );
  const newResources = new Map((document.authoredResources ?? []).map((resource) => [resource.resourceId, resource]));
  const resourceChanges = [...new Set([...oldResources.keys(), ...newResources.keys()])].filter(
    (id) => JSON.stringify(canonical(oldResources.get(id))) !== JSON.stringify(canonical(newResources.get(id)))
  );
  if (
    resourceChanges.some((id) =>
      [oldResources.get(id), newResources.get(id)].some((resource) => resource && !isInstanceResource(resource))
    )
  )
    return;
  if (!changedInstances.length && !resourceChanges.length) return;
  const index = lookup(previous.plan),
    landscapes = landscapeLookup(state.baselineLandscapes),
    guidance = guidanceLookup(state.baselineGuidanceRocks);
  if (changedInstances.some((id) => !index.volumes.has(id) && !landscapes.has(id) && !guidance.has(id))) return;
  const changedIds = [
    ...new Set([
      ...changedInstances,
      ...resourceChanges,
      ...resourceChanges.flatMap((id) =>
        [oldResources.get(id), newResources.get(id)].flatMap((resource) =>
          resource?.resourceType === "object-removal" ? [resource.properties.objectId] : []
        )
      )
    ])
  ];
  const started = performance.now();
  const plan: IslandPlan = {
    ...previous.plan,
    spatialLayout: {
      ...state,
      groups: [...state.groups],
      instanceEdits: edits,
      authoredRoadPaths: Object.fromEntries(
        Object.entries(exportPlanningRecipe(document).edits).flatMap(([id, edit]) =>
          edit.road?.keypoints?.length ? [[id, edit.road.keypoints]] : []
        )
      ),
      revealInputSignature: spatialRevealInputSignature(document)
    },
    authoredResources: structuredClone(document.authoredResources ?? []),
    planning: previous.plan.planning && { ...previous.plan.planning, changedIds }
  };
  inheritPlanningHeightmap(plan, previous.plan);
  const editedRocks = projectInstances(plan, edits, changedInstances, (point) =>
    planningGroundSurface(plan).sample(point)
  );
  projectRockSizes(plan, document, editedRocks);
  const changedRoads = updateSpatialInstanceConnections(plan);
  // Road-dependent ecology and guidance must consume the same final pavement.
  if (changedRoads.length) return;
  changedIds.push(...changedRoads);
  const checks = [
    ...previous.checks.filter((check) => check.rule !== "instance-road-connection"),
    ...(plan.spatialLayout?.instanceConnectionChecks ?? [])
  ];
  if (plan.planning) plan.planning = { ...plan.planning, checks };
  return {
    ...previous,
    plan,
    checks,
    recipe: exportPlanningRecipe(document),
    changedIds,
    parameterCorrections: undefined,
    timings: { "instance.edit": performance.now() - started, total: performance.now() - started },
    execution: "local",
    contentUpdate: "instance"
  };
}
