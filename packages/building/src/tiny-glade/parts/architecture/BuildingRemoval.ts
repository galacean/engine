import type { Entity } from "@galacean/engine";
import { BuildingGroupComponent } from "./BuildingGroupComponent";
import { BuildingPartComponent } from "./BuildingPartComponent";
import { partFrame } from "./BuildingPartCollection";
import { validateBuildingDraft, type BuildingRelation } from "./BuildingDraft";

type Member = BuildingGroupComponent | BuildingPartComponent;

/** Structural profiles are edited/deleted as a group; attachments and generic parts individually. */
export function removesBuildingGroup(member: Member): boolean {
  return (
    member instanceof BuildingGroupComponent ||
    ["wallProfile", "wallStrip", "roofProfile", "foundationProfile"].includes(
      member.definition?.support.generator ?? ""
    )
  );
}

/** Plan before mutating. Runtime CRUD and persisted editor transactions consume
 * the same targets and relation edits, including hidden/disabled author members. */
export function planBuildingRemoval(members: readonly Member[], requested: readonly Member[]) {
  const available = new Set(members),
    targets = new Set(requested);
  const groups = new Map<Entity, Set<string>>();
  for (const member of requested) {
    if (!available.has(member)) throw Error("Building removal target is not an authored member");
    if (!member.definition || !removesBuildingGroup(member)) continue;
    const frame = partFrame(member),
      ids = groups.get(frame) ?? new Set<string>();
    ids.add(member instanceof BuildingGroupComponent ? member.definition.id : member.definition.group);
    groups.set(frame, ids);
  }
  for (const member of members) {
    if (!member.definition) continue;
    const id = member instanceof BuildingGroupComponent ? member.definition.id : member.definition.group;
    if (groups.get(partFrame(member))?.has(id)) targets.add(member);
  }
  const removed = new Map<Entity, Set<string>>();
  for (const member of targets) {
    if (!(member instanceof BuildingPartComponent) || !member.definition) continue;
    const frame = partFrame(member),
      ids = removed.get(frame) ?? new Set<string>();
    ids.add(member.definition.id);
    removed.set(frame, ids);
  }
  const relations = new Map<BuildingPartComponent, BuildingRelation[]>();
  const affectedFrames = new Set([...targets].map(partFrame));
  for (const frame of affectedFrames) {
    const survivors = members.filter((m) => !targets.has(m) && partFrame(m) === frame);
    const parts = survivors.filter((m): m is BuildingPartComponent => m instanceof BuildingPartComponent);
    for (const part of parts) {
      const ids = removed.get(frame),
        before = part.relations;
      const after = before.filter((r) => !ids?.has(r.from.part) && !ids?.has(r.to.part));
      if (after.length !== before.length) relations.set(part, after);
    }
    validateBuildingDraft({
      groups: survivors
        .filter((m): m is BuildingGroupComponent => m instanceof BuildingGroupComponent)
        .flatMap((m) => (m.definition ? [m.definition] : [])),
      parts: parts.flatMap((m) => (m.definition ? [m.definition] : [])),
      relations: parts.flatMap((m) => relations.get(m) ?? m.relations)
    });
  }
  return { targets, relations };
}
