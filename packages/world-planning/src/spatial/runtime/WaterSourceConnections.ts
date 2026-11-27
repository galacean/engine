import type { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import type { WaterSourceAuthoring } from "./NativeWaterEditor";

/** Only references to previously existing, now removed Water identities are repaired.
 * Resolve in the previous template scope: a removed Prefab member no longer resolves in the draft. */
export function cleanRemovedWaterConnections(before: RuntimeSceneEdit, current: RuntimeSceneEdit): boolean {
  const remaining = new Set(current.queryComponents({ type: "WaterBodyComponent" }).map(({ id }) => id));
  const removed = new Set(
    before
      .queryComponents({ type: "WaterBodyComponent" })
      .map(({ id }) => id)
      .filter((id) => !remaining.has(id))
  );
  if (!removed.size) return false;
  let changed = false;
  for (const { id } of current.queryComponents({ type: "WaterBodyComponent" })) {
    const input = current.readComponent(id).props?.authoring as unknown as WaterSourceAuthoring | undefined;
    if (!Array.isArray(input?.connections)) continue;
    const previousInput = before.queryComponents({ id, type: "WaterBodyComponent" }).length
      ? (before.readComponent(id).props?.authoring as unknown as WaterSourceAuthoring)
      : undefined;
    const connections = input.connections.filter((connection) => {
      if (
        !previousInput?.connections?.some(
          (old) => old.id === connection.id && JSON.stringify(old.target) === JSON.stringify(connection.target)
        )
      )
        return true;
      if (!connection?.target || current.resolveComponentReference(connection.target, id)) return true;
      const previous = before.resolveComponentReference(connection.target, id);
      return !previous || !removed.has(previous);
    });
    if (connections.length === input.connections.length) continue;
    current.updateComponent(id, { authoring: { ...input, connections } as unknown as GalaceanSourceValueRecord });
    changed = true;
  }
  return changed;
}
