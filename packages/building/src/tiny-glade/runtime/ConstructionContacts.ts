import { constructionWallEnvelope } from "./ConstructionWallEnvelope";
import { isFlatRoofHeight } from "./RoofMode";
import { constructionBuildingProfile } from "./ConstructionBuildingProfile";
import { constructionShape, constructionRoof, type ConstructionSource } from "./ConstructionSource";
import type { TerrainHeight } from "./PublishedWallProfile";
import { publishWallConnectionOwner, generateWallConnections } from "./WallConnectionPipeline";
import { generateInterRoofMerlons } from "./RecoveredInterRoofMerlons";
import { unitFootprintScale } from "./MaterialFootprint";
import type { MasonryBinding } from "./MasonryDocument";
/** Native contact material follows the resolved wall material; author source stays immutable. */
export function constructionContactSource(
  source: ConstructionSource,
  bindings: readonly { geometry_id: string; unit_id: string }[]
): ConstructionSource {
  return {
    ...source,
    buildings: source.buildings.map((b) => {
      const wall = bindings.find((v) => v.geometry_id === b.id + "-wall");
      return wall ? { ...b, material: wall.unit_id === "wooden_plank" ? 1 : 0 } : b;
    })
  };
}
/** The same published profiles/contact reservations feed every LOD. */
export function publishConstructionOwners(
  source: ConstructionSource,
  terrain: TerrainHeight,
  bindings: readonly MasonryBinding[] = []
) {
  const byId = new Map(source.buildings.map((b) => [b.id, b])),
    host = source.environment.type === "host_terrain";
  const ordered = source.identity_order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  // Topology identity is unique within the authored identity order. Random
  // appearance retains its own seed, including duplicate or zero seeds.
  const owners = ordered.map((building, slot) => {
    const nativeId = BigInt(source.identity_order.indexOf(building.id) + 1),
      seed = BigInt(building.seed ?? nativeId),
      shape = constructionShape(building);
    const binding = bindings.find((b) => b.geometry_id === building.id + "-wall");
    const wallEnvelope = constructionWallEnvelope(building, binding);
    const profile = constructionBuildingProfile(building, terrain, host, wallEnvelope);
    const wallSeed = binding && binding.seed !== "source" ? BigInt(binding.seed) : seed;
    const roofBinding = bindings.find((b) => b.geometry_id === building.id + "-roof");
    const roofUnitScale = unitFootprintScale(roofBinding?.footprint);
    const roofSeed = roofBinding && roofBinding.seed !== "source" ? BigInt(roofBinding.seed) : undefined;
    const unitScale = unitFootprintScale(binding?.footprint);
    const roof = constructionRoof(building, profile.topY, wallEnvelope);
    return {
      building,
      nativeId,
      seed,
      wallSeed,
      unitScale,
      wallEnvelope,
      roofUnitScale,
      roofSeed,
      slot,
      shape,
      profile,
      roof,
      wallRoofJoint: profile.wallRoofJoint
    };
  });
  return owners;
}
export type PublishedConstructionOwner = ReturnType<typeof publishConstructionOwners>[number];
export function generateConstructionContacts(
  owners: PublishedConstructionOwner[],
  terrain: TerrainHeight,
  host: boolean
) {
  const connections = generateWallConnections(
    owners
      .filter((o) => !o.building.kind)
      .map((o) =>
        publishWallConnectionOwner(
          {
            id: o.nativeId,
            seed: o.wallSeed,
            unitScale: o.unitScale,
            shape: o.shape,
            height: o.building.height,
            elevation: host ? -3.4028234663852886e38 : 0,
            material: o.building.material,
            style: 0,
            foundationOffset: 0,
            roof: { height01: o.building.roof.height, flatRoofStyle: o.building.roof.flat_rim as 0 | 1 | 2 | 3 }
          },
          terrain,
          isFlatRoofHeight(o.building.roof.height)
            ? {
                ...o.profile,
                top: o.profile.top.map(() => o.profile.topY),
                maxY: o.profile.topY,
                maxYGable: o.profile.topY
              }
            : o.profile
        )
      ),
    owners.filter((o) => !o.building.kind).map((o) => o.nativeId),
    terrain,
    new Map(owners.map((o) => [o.nativeId, o.slot]))
  );
  const merlons = generateInterRoofMerlons(owners);
  // Reservations have one source shared by wall units and decoration placement.
  const contactHoles = new Map(
    owners.map((o) => [
      o.nativeId,
      [...(connections.holes.get(o.nativeId) ?? []), ...(merlons.holes.get(o.nativeId) ?? [])]
    ])
  );
  return { connections, merlons, contactHoles };
}
