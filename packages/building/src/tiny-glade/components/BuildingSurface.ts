import {
  parseMasonryDocument,
  type MasonryBinding,
  type MasonryDocument,
  type MasonryOverride
} from "../runtime/MasonryDocument";
import { defaultBuildingRoof } from "./BuildingConfiguration";

export type BuildingSurfaceRole = "roof" | "wall" | "foundation" | "surface";
export type BuildingSurfacePlacement = Omit<MasonryBinding, "id" | "geometry_id">;
export type BuildingSurfaceRegion = Omit<MasonryOverride, "id" | "binding_id">;
export interface BuildingSurfaceInput {
  readonly role: BuildingSurfaceRole;
  readonly placement: BuildingSurfacePlacement;
  /** False retains base geometry but omits optional wall/foundation material units. */
  readonly placementEnabled?: boolean;
  readonly regions: readonly BuildingSurfaceRegion[];
}
export function defaultSurfacePlacement(): BuildingSurfacePlacement {
  return {
    rule: { type: "auto" },
    unit_id: "brick",
    footprint: { width: 0.5, height: 0.4375, depth: 0.1 },
    seed: "source"
  };
}
function validationDocument(
  placement: BuildingSurfacePlacement,
  regions: readonly BuildingSurfaceRegion[]
): MasonryDocument {
  const enclosure = placement?.rule?.type === "posts_and_rails";
  return parseMasonryDocument({
    version: 1,
    construction: {
      version: 1,
      environment: { type: "host_terrain" },
      identity_order: ["validation"],
      buildings: [
        {
          id: "validation",
          height: 4,
          material: 0,
          rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
          roof: defaultBuildingRoof(),
          ...(enclosure ? { kind: "fence" } : {})
        }
      ]
    },
    bindings: [{ ...placement, id: "placement", geometry_id: "validation-" + (enclosure ? "surface" : "roof") }],
    overrides: regions.map((region, index) => ({ ...region, id: `region/${index}`, binding_id: "placement" }))
  });
}
/** Validate through the existing material/region contract; never retain caller objects. */
export function surfacePlacementValue(value: BuildingSurfacePlacement): BuildingSurfacePlacement {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["rule", "unit_id", "footprint", "seed"].includes(key))
  )
    throw Error("Surface placement requires only rule, unit_id, footprint and seed");
  const { id, geometry_id, ...placement } = validationDocument(value, []).bindings[0];
  return placement;
}
export function surfaceRegionValues(value: readonly BuildingSurfaceRegion[]): BuildingSurfaceRegion[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).some((key) => !["region", "effect"].includes(key))
    )
  )
    throw Error("Surface regions require only region and effect");
  return validationDocument(defaultSurfacePlacement(), value).overrides.map(({ id, binding_id, ...region }) => region);
}

/** A surface customizes one of its body's existing generated surfaces. Removing
 * the modifier restores the body's base placement; it does not delete the body. */
export function applyBuildingSurfaces<T extends BuildingSurfaceInput>(
  document: MasonryDocument,
  buildingId: string,
  surfaces: readonly T[],
  identity: (surface: T) => string
): MasonryDocument {
  const roles = new Set<BuildingSurfaceRole>();
  for (const surface of surfaces) {
    if (roles.has(surface.role)) throw Error(`Duplicate active building surface: ${surface.role}`);
    roles.add(surface.role);
    const geometry = `${buildingId}-${surface.role}`;
    const index = document.bindings.findIndex((binding) => binding.geometry_id === geometry);
    if (index < 0) throw Error(`Building has no ${surface.role} surface`);
    const id = identity(surface);
    if (!id) throw Error("Building surface requires its Scene component identity");
    if (surface.placementEnabled === false) {
      if (surface.role !== "wall" && surface.role !== "foundation")
        throw Error("Only optional wall and foundation placement can be disabled");
      document.bindings.splice(index, 1);
      continue;
    }
    document.bindings[index] = { ...surfacePlacementValue(surface.placement), id, geometry_id: geometry };
    document.overrides.push(
      ...surfaceRegionValues(surface.regions).map((region, i) => ({
        ...region,
        id: `${id}/region/${i}`,
        binding_id: id
      }))
    );
  }
  // Host-specific constraints (roof boundary, strip-only rails) are checked on
  // the actual body, after the complete authored component set is collected.
  return parseMasonryDocument(document);
}
