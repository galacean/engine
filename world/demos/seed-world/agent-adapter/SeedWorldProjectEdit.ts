import { PLANNING_PROJECT_TYPE, PLANNING_PROJECT_PATH } from "../src/planning/spatial/runtime/PlanningProjectStorage.ts";
import type { AgentEditTransaction } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { SeedWorldAgentApplication } from "./SeedWorldAgentApplication.ts";

import { SEED_WORLD_EDITOR_PATH } from "../SeedWorldProjectFormats.ts";
import { planningSourceDocument, mergePlanningAuthoring, writePlanningProjectSource } from "../src/planning/spatial/runtime/PlanningProjectSource.ts";
/** Commit authoring once, then order world and Scene activation within the shared runtime boundary. */
export function beginSeedWorldProjectEdit(
  application: Pick<SeedWorldAgentApplication, "beginEdit" | "stageProjectEdit">,
  editor: Pick<RuntimeNativeEditor, "beginEdit">,
  executionId: string,
  signal: AbortSignal
): AgentEditTransaction & Required<Pick<AgentEditTransaction, "activate">> &
  Pick<ReturnType<SeedWorldAgentApplication["beginEdit"]>, "runPlanning"> {
  const native = editor.beginEdit(executionId, signal, () => {
    if (!world.hasChanges()) return [];
    return [
      {
        file: {
          virtualPath: SEED_WORLD_EDITOR_PATH,
          path: "runtime-world:editor",
          type: "SeedWorldEditor"
        },
        content: JSON.stringify(world.getPreparedDocument())
      },
    ];
  });
  const world = application.beginEdit(executionId, signal);
  const abort = () => world.discard();
  signal.addEventListener("abort", abort, { once: true });
  let tail: Promise<unknown> = Promise.resolve();
  let suppliedProjection = false;
  return {
    documents: native.documents,
    runPlanning: operation => world.runPlanning(operation),

    hasChanges: () => world.hasChanges() || native.hasChanges(),
    completeRead: () => world.completeRead?.(),
    tools: [...world.tools, ...native.tools].map((tool) => ({
      ...tool,
      execute: (input, context) => {
        const result = tail.then(() => tool.execute(input, context));
        tail = result.catch(() => undefined);
        return result;
      }
    })),
    prepare: async (prepareSignal) => {
      await tail;
      await world.prepare(prepareSignal);
      const planning = world.getPreparedPlanningDocument();
      if (world.hasChanges() && planning) await native.run(({ draft, edited }) => {
        const current = planningSourceDocument(draft.preview());
        if (current) {
          writePlanningProjectSource(draft, draft.preview().project.scene,
            mergePlanningAuthoring(world.beforePlanningDocument ?? current, current, planning));
        } else {
          const content = JSON.stringify(planning);
          if (draft.list().some(file => file.virtualPath === PLANNING_PROJECT_PATH)) draft.update(PLANNING_PROJECT_PATH, content);
          else draft.create({ virtualPath: PLANNING_PROJECT_PATH, path: "runtime-world:planning", type: PLANNING_PROJECT_TYPE }, content);
        }
        edited();
      });
      await native.prepare(prepareSignal);
    },
    commit: async () => {
      signal.throwIfAborted();
      // Publication is atomic and may finish after cancellation. Its prepared
      // world projection must survive until activation or terminal cleanup.
      signal.removeEventListener("abort", abort);
      try { return await native.commit(); }
      catch (error) { world.discard(); throw error; }
    },
    activate: async (activationSignal) => {
      activationSignal.throwIfAborted();
      const release = world.hasChanges() && !suppliedProjection ? application.stageProjectEdit(world) : () => {};
      suppliedProjection = true;
      if (!world.hasChanges()) world.discard();
      try { await native.activate(activationSignal); }
      finally { release(); }
    },
    discard: () => {
      signal.removeEventListener("abort", abort);
      world.discard();
      native.discard();
    },
    complete: async () => {
      signal.removeEventListener("abort", abort);
      try { await world.discard(); }
      finally { await native.complete?.(); }
    }
  };
}
