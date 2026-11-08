import type { Entity } from "@galacean/engine";
import { BuildingGroupComponent } from "./BuildingGroupComponent";
import { BuildingPartComponent } from "./BuildingPartComponent";
import { connectionParts, partFrame } from "./BuildingPartCollection";
import { validateBuildingDraft } from "./BuildingCpu";
import type { ConnectionDef } from "../../core";
import { WALL_MOUNTS } from "../../partTypes/Openings";

type Member = BuildingGroupComponent | BuildingPartComponent;

/** The parts that shape a building (walls, roofs, finishes) are deleted with their group;
 * mounted parts such as windows are deleted on their own. */
export function removesBuildingGroup(member: Member): boolean {
  return (
    member instanceof BuildingGroupComponent ||
    !(WALL_MOUNTS as readonly string[]).includes(member.definition?.type ?? "")
  );
}

/** Plan before mutating. Runtime CRUD and persisted editor transactions consume
 * the same targets and connection edits, including hidden/disabled author members. */
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
  const connections = new Map<BuildingPartComponent, ConnectionDef[]>();
  const affectedFrames = new Set([...targets].map(partFrame));
  for (const frame of affectedFrames) {
    const survivors = members.filter((m) => !targets.has(m) && partFrame(m) === frame);
    const parts = survivors.filter((m): m is BuildingPartComponent => m instanceof BuildingPartComponent);
    for (const part of parts) {
      const ids = removed.get(frame),
        before = part.connections;
      const after = before.filter((c) => !connectionParts(c).some((id) => ids?.has(id)));
      if (after.length !== before.length) connections.set(part, after);
    }
    validateBuildingDraft({
      groups: survivors
        .filter((m): m is BuildingGroupComponent => m instanceof BuildingGroupComponent)
        .flatMap((m) => (m.definition ? [m.definition] : [])),
      parts: parts.flatMap((m) => (m.definition ? [m.definition] : [])),
      connections: parts.flatMap((m) => connections.get(m) ?? m.connections)
    });
  }
  return { targets, connections };
}
