import { resolveBuildingPolicy, sampleBuildingSize } from "./BuildingSizing";
import recipe from "./settlement-profile.json";
import building from "./units/building.json";
import village from "./units/village.json";
import road from "./units/road.json";
import landscape from "./units/landscape.json";
import tree from "./units/landscape.tree.json";
import rock from "./units/landscape.rock.json";
import { PLANNING_REFERENCE } from "./PlanningReference";

/** Module-owned source profiles. Shared actor facts do not rescale physical units. */
export const SETTLEMENT_MODULES = { building, village, road, landscape, tree, rock };

/** Compile module data for the existing planner without duplicating authored dimensions.
 * @param modules Authored size and placement rules, replaceable for experiments.
 * @param walkMps Design-time walking speed; not the actor's current velocity.
 * @returns Planner inputs with source profiles retained for export and cache identity.
 */
export function resolveSettlementProfile(modules = SETTLEMENT_MODULES, walkMps = PLANNING_REFERENCE.actor.walkMps) {
  const b = modules.building,
    v = modules.village,
    t = modules.tree,
    r = modules.rock;
  if (!Number.isFinite(walkMps) || walkMps <= 0) throw new Error("Design walk speed must be positive");
  const range = (value: { min: number; max: number }, name: string) => {
    if (!Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min <= 0 || value.max < value.min)
      throw new Error(`Invalid module range: ${name}`);
  };
  range(b.footprintM.width, "building.width");
  range(b.footprintM.depth, "building.depth");
  range(b.storeys.heightM, "building.storey");
  range(v.spacing.edgeGapWalkSeconds, "village.spacing");
  range(t.canopyRadiusM, "tree.canopy");
  range(t.heightM, "tree.height");
  range(r.widthM, "rock.width");
  range(r.heightM, "rock.height");
  range(r.depthPerWidth, "rock.aspect");
  if (
    !b.storeys.choices.length ||
    b.storeys.choices.some(
      (c) => !Number.isInteger(c.count) || c.count < 1 || !Number.isFinite(c.weight) || c.weight < 0
    ) ||
    b.storeys.choices.reduce((s, c) => s + c.weight, 0) <= 0
  )
    throw new Error("Invalid building storey distribution");
  if (
    b.door.heightM > b.storeys.heightM.min ||
    b.door.widthM > Math.min(b.footprintM.width.min, b.footprintM.depth.min)
  )
    throw new Error("Building door exceeds minimum envelope");
  return {
    ...recipe,
    moduleSources: modules,
    designWalkMps: walkMps,
    building: {
      ...b,
      widthMin: b.footprintM.width.min,
      widthMax: b.footprintM.width.max,
      depthMin: b.footprintM.depth.min,
      depthMax: b.footprintM.depth.max,
      doorWidth: b.door.widthM,
      doorHeight: b.door.heightM
    },
    village: {
      ...v,
      buildingGapMin: walkMps * v.spacing.edgeGapWalkSeconds.min,
      buildingGapMax: walkMps * v.spacing.edgeGapWalkSeconds.max
    },
    road: modules.road,
    landscape: {
      ...modules.landscape,
      treeRadiusMin: t.canopyRadiusM.min,
      treeRadiusMax: t.canopyRadiusM.max,
      treeHeightMin: t.heightM.min,
      treeHeightMax: t.heightM.max,
      trunkRadius: t.trunkRadiusM,
      rockWidthMin: r.widthM.min,
      rockWidthMax: r.widthM.max,
      rockHeightMin: r.heightM.min,
      rockHeightMax: r.heightM.max
    }
  };
}

/** Active compiled inputs; regeneration picks up edits to any module JSON. */
export const SETTLEMENT_PROFILE = resolveSettlementProfile();

/** Resolve a building inside authored bounds; size intent biases the distribution, not the bounds.
 * @param sample Stable keyed random values in [0,1].
 * @param sizeIntent Normalized preference for smaller or larger footprints.
 * @param profile Building-owned shape and storey data.
 * @returns A metre envelope and the storeys which sum exactly to its height.
 */
export function sampleSettlementBuilding(sample: (key: string) => number, sizeIntent: number, profile = building) {
  const total = profile.storeys.choices.reduce((sum, c) => sum + c.weight, 0);
  let remainder = sample("floors") * total,
    floors = profile.storeys.choices.at(-1)!.count;
  for (const choice of profile.storeys.choices) {
    remainder -= choice.weight;
    if (remainder < 0) {
      floors = choice.count;
      break;
    }
  }
  return sampleBuildingSize(
    sample,
    sizeIntent,
    resolveBuildingPolicy({
      widthMinM: profile.footprintM.width.min,
      widthMaxM: profile.footprintM.width.max,
      depthMinM: profile.footprintM.depth.min,
      depthMaxM: profile.footprintM.depth.max,
      floorHeightMinM: profile.storeys.heightM.min,
      floorHeightMaxM: profile.storeys.heightM.max,
      floorsMin: floors,
      floorsMax: floors
    })
  );
}
