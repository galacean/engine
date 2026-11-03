import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { AgentViewPointer } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { SeedWorldAgentApplication } from "../agent-adapter/SeedWorldAgentApplication.ts";
import type { SeedWorldPickSnapshot } from "@galacean/engine-world-planning/world/SeedWorldPickSnapshot";

/** Snapshot owns geometry identity; the active application validates continued authoring identity. */
export function seedWorldViewPointer(
  snapshot: SeedWorldPickSnapshot,
  application: Pick<SeedWorldAgentApplication, "observationRevision" | "resolvePickedObject">,
  revision: number
): AgentViewPointer {
  return {
    byteLength: snapshot.byteLength,
    dispose: () => snapshot.dispose(),
    point: (x, y) => {
      if (application.observationRevision !== revision)
        throw Object.assign(new Error("World changed since capture; observe_view again before locating objects"), { code: "POINTER_WORLD_CHANGED" });
      const hit = snapshot.point(x, y);
      if (!hit.objectId) return {
        status: "unidentified",
        reason: "No registered object identity at this pixel. It may be background, an uncovered object, or a boundary; this is not evidence of absence.",
        ...(hit.position ? { hitPosition: hit.position } : {})
      };
      const object = application.resolvePickedObject(hit.objectId);
      if (!object) return {
        status: "unmapped", objectId: hit.objectId,
        reason: "A rendered object was identified, but it has no current authoring identity. Do not invent an editable Ref."
      };
      return toAgentValue({
        ref: object.ref, type: object.type, status: "identified", hitPosition: hit.position
      });
    }
  };
}
