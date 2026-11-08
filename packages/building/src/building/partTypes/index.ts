// Part-type layer: every part type the building system knows, registered together, and the
// footprints these types put on the ground.
import {
  createBuildingRegistry,
  type BuildingCoreDraft,
  type BuildingGroupDef,
  type BuildingPartDef,
  type BuildingRegistry
} from "../core";
import { registerHouseTypes } from "./House";
import { registerStripTypes } from "./Strip";
import { WALL_MOUNTS } from "./Openings";
import { ROOF_MOUNTS } from "./Dormers";

/** Part types of prefabs mounted on a building: on its walls or on its roof. Each is placed,
 * removed and kept on its own; a design that does not lay one drops it. */
export const MOUNTED_PART_TYPES: readonly string[] = [...WALL_MOUNTS, ...ROOF_MOUNTS];

/** Registers every building part type into a registry. */
export function registerBuildingTypes(registry: BuildingRegistry): BuildingRegistry {
  return registerStripTypes(registerHouseTypes(registry));
}
/** A registry with the core mechanism and every building part type. */
export function createBuildingTypeRegistry(): BuildingRegistry {
  return registerBuildingTypes(createBuildingRegistry());
}

/** A footprint on the ground: a rectangle (center, size, rotation of its x axis from +X
 * towards +Z) or a circle (center, radius, phase). */
export interface BuildingFootprint {
  readonly rectangle?: {
    readonly center: readonly [number, number];
    readonly size: readonly [number, number];
    readonly rotation: number;
  };
  readonly circle?: { readonly center: readonly [number, number]; readonly radius: number; readonly phase?: number };
}
type Footprints = { footprint: BuildingFootprint; set(next: BuildingFootprint): void }[];
/** The footprints of a group: a house's shared footprint, and the centerline rectangle of
 * each free-standing wall or fence. Other part types are placed relative to these. */
function footprints(group: BuildingGroupDef, parts: BuildingPartDef[]): Footprints {
  const out: Footprints = [];
  const house = group.shared?.house as { footprint?: BuildingFootprint } | undefined;
  if (house?.footprint)
    out.push({
      footprint: house.footprint,
      set: (next) => ((house as { footprint: BuildingFootprint }).footprint = next)
    });
  for (const part of parts) {
    const params = part.geometry?.params as { rectangle?: BuildingFootprint["rectangle"] } | undefined;
    if (part.geometry && ["strip", "fence"].includes(part.geometry.generator) && params?.rectangle)
      out.push({
        footprint: { rectangle: params.rectangle },
        set: (next) => ((params as { rectangle?: BuildingFootprint["rectangle"] }).rectangle = next.rectangle)
      });
  }
  return out;
}
/** The footprints a group puts on the ground, in its own coordinates. */
export function buildingFootprints(group: BuildingGroupDef, parts: readonly BuildingPartDef[]): BuildingFootprint[] {
  return footprints(structuredClone(group), structuredClone(parts) as BuildingPartDef[]).map((f) => f.footprint);
}
/** A group moved by a horizontal rigid transform (a column-major 4 × 4 matrix): its
 * footprints move and turn with it. Returns copies. */
export function placeBuildingGroup(
  group: BuildingGroupDef,
  parts: readonly BuildingPartDef[],
  m: ArrayLike<number>
): { group: BuildingGroupDef; parts: BuildingPartDef[] } {
  const next = { group: structuredClone(group), parts: structuredClone(parts) as BuildingPartDef[] };
  const turn = Math.atan2(m[2], m[0]);
  for (const { footprint, set } of footprints(next.group, next.parts)) {
    const shape = footprint.rectangle ?? footprint.circle!;
    const [x, z] = shape.center;
    const center: [number, number] = [m[0] * x + m[8] * z + m[12], m[2] * x + m[10] * z + m[14]];
    set(
      footprint.rectangle
        ? { rectangle: { ...footprint.rectangle, center, rotation: footprint.rectangle.rotation + turn } }
        : { circle: { ...footprint.circle!, center, phase: (footprint.circle!.phase ?? 0) + turn } }
    );
  }
  return next;
}
/** The ground a draft stands on, [minX, minZ, maxX, maxZ], with a margin around every
 * footprint. Undefined when the draft has no footprint. */
export function buildingDraftRegion(draft: BuildingCoreDraft, margin = 2): number[] | undefined {
  const region = [Infinity, Infinity, -Infinity, -Infinity];
  for (const group of draft.groups)
    for (const { footprint } of footprints(
      group,
      draft.parts.filter((p) => p.group === group.id)
    )) {
      const r = footprint.rectangle,
        c = footprint.circle;
      const center = (r ?? c)!.center;
      const [w, d] = r
        ? [
            (Math.abs(Math.cos(r.rotation)) * r.size[0] + Math.abs(Math.sin(r.rotation)) * r.size[1]) / 2,
            (Math.abs(Math.sin(r.rotation)) * r.size[0] + Math.abs(Math.cos(r.rotation)) * r.size[1]) / 2
          ]
        : [c!.radius, c!.radius];
      region[0] = Math.min(region[0], center[0] - w - margin);
      region[1] = Math.min(region[1], center[1] - d - margin);
      region[2] = Math.max(region[2], center[0] + w + margin);
      region[3] = Math.max(region[3], center[1] + d + margin);
    }
  return region.every(Number.isFinite) ? region : undefined;
}
