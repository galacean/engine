import { nativeWallCells } from "./ConstructionArrangement";
import type { PublishedConstructionOwner } from "./ConstructionContacts";
import type { CompiledConstructionDecorations } from "./ConstructionDecorations";
import type { ConstructionJunctionGroup } from "./ConstructionJunctionLayout";
import type { MasonryBinding } from "./MasonryDocument";

/** Structural trim uses the same replaceable-unit/edit-anchor path as junctions.
 * Native brick bytes remain the default, independent of the wall's row rule. */
export function constructionArchGroups(
  owner: PublishedConstructionOwner,
  decorations: CompiledConstructionDecorations,
  bindings: readonly MasonryBinding[]
): ConstructionJunctionGroup[] {
  const instances = decorations.archInstances;
  if (!instances?.length) return [];
  const binding = bindings.find((b) => b.geometry_id === owner.building.id + "-wall");
  if (!binding) return [];
  return constructionArchInstanceGroups(decorations).map(([decorationId, units]) => ({
    ownerId: owner.building.id,
    decorationId,
    binding,
    slot: owner.slot,
    role: "wall_arch" as const,
    sourceUnit: "brick" as const,
    sourceDrawId: "decoration-arches/" + JSON.stringify([owner.building.id, decorationId]),
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
