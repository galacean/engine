import type { ProfileWallGeometry } from "./ProfileWallGeometry";
import { nativeWallCells } from "./ConstructionArrangement.ts";
import type { CompiledConstructionDecorations } from "./ConstructionDecorations.ts";
import type { ConstructionJunctionGroup } from "./ConstructionJunctionLayout.ts";
import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";

/** Structural trim uses the same replaceable-unit/edit-anchor path as junctions.
 * Native brick bytes remain the default, independent of the wall's row rule. */
export function profileArchGroups(
  owner: Pick<ProfileWallGeometry, "id" | "slot" | "profile">,
  decorations: CompiledConstructionDecorations,
  binding?: MasonryBinding
): ConstructionJunctionGroup[] {
  const instances = decorations.archInstances;
  if (!instances?.length) return [];
  if (!binding) return [];
  return constructionArchInstanceGroups(decorations).map(([decorationId, units]) => ({
    ownerId: owner.id,
    decorationId,
    binding,
    slot: owner.slot,
    role: "wall_arch" as const,
    sourceUnit: "brick" as const,
    sourceDrawId: "decoration-arches/" + JSON.stringify([owner.id, decorationId]),
    cells: nativeWallCells(binding.geometry_id, units, owner.profile),
    records: units.map((i) => i.packed64)
  }));
}

/** Group immutable producer records by attachment identity, never parse IDs. */
export function constructionArchInstanceGroups(decorations: CompiledConstructionDecorations) {
  const instances = decorations.archInstances ?? [];
  const byDecoration = new Map<string, typeof instances>();
  for (const instance of instances) {
    let group = byDecoration.get(instance.decorationId);
    if (!group) byDecoration.set(instance.decorationId, (group = []));
    group.push(instance);
  }
  return [...byDecoration];
}
