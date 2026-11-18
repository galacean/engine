import {afterEach, vi} from "vitest";
import {historyFixture} from "../../../../packages/runtime-editor/tests/runtime-history-fixture";
import {seedWorldProjectFormats} from "../../../demos/seed-world/SeedWorldProjectFormats";
vi.hoisted(() => { (globalThis as any).window ??= {}; });
const cleanups: (() => void)[] = [];
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks();});
import { createSeedWorldTools } from "../../../demos/seed-world/agent-adapter/SeedWorldToolCatalog";
import { state } from "../../../../packages/world-planning/tests/editor/seed-world-fixture";
import { SeedWorldAgentApplication } from "../../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";
import { createSeedWorldAgentDefinition } from "../../../demos/seed-world/agent-adapter/SeedWorldAgentDefinition";
import { createSeedWorldEngineDraft } from "../../../demos/seed-world/agent-adapter/SeedWorldEngineDraft";
import type { SeedWorldEnginePort } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort.ts";
import { executeAgentEdit } from "@galacean/engine-ai-chat/ai-chat/agent-edit-execution.ts";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import { JavaScriptAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values.ts";
import type { AgentTool, AgentScriptToolBinding } from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";

const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
const checkerAdapter = { check: async (source: string, declarations: Parameters<typeof checker.check>[1]) => checker.check(source, declarations) };

export async function setup(origin?: readonly [number, number], overridePort?: SeedWorldEnginePort) {
  let live = state();
  if (origin) live = {...live, world: {...live.world, origin}};
  const effects: unknown[] = [];
  const unsupported = () => { throw new Error("Unsupported legacy resource"); };
  const port: SeedWorldEnginePort = overridePort ?? {
    readWorldState: () => structuredClone(live),
    readAuthoringSnapshot: () => ({ activeRevision: 0, draftRevision: 0, authoringStateHash: "initial", resources: [], removedObjectIds: [] }),
    queryWorldPoints: () => [], queryWorldRegions: () => [],
    queryWorldObjects: () => ({ worldId: "seed-world-1", worldRevision: 0, inspectedObjectCount: 0, objects: [] }),
    getWorldObject: unsupported, resolveSpatialTarget: unsupported,
    readTerrainPatchConstraints: () => ({ heightSampleSpacingMetres: 1, minimumRadiusMetres: 1 }),
    teleport: ({x, z, heightOffset}) => {
      live = {...live, camera: {...live.camera, position: [x, heightOffset, z]}};
      return {cameraPosition: live.camera.position};
    },
    updateEnvironment: async input => {
      effects.push(input);
      live = { ...live, lighting: { ...live.lighting, timeHours: input.timeHours ?? live.lighting.timeHours } };
      return { requested: input, state: live };
    },
    mutateWorldResource: unsupported, mutateWorldResources: unsupported
  };
  if (!overridePort) port.beginEdit = (id, settings) => createSeedWorldEngineDraft(port, {
    environment: (current, input) => ({
      state: { ...current, lighting: { ...current.lighting, timeHours: input.timeHours ?? current.lighting.timeHours } },
      forward: input, previous: { timeHours: current.lighting.timeHours, transitionDuration: 0, waitForIbl: false }
    }),
    teleport: ({x, z, heightOffset}) => ({cameraPosition: [x, heightOffset, z]}),
    restoreCamera: camera => { live = {...live, camera: structuredClone(camera)}; }, validateMount: unsupported
  }, id, settings);
  port.readEditorDefaults ??= () => ({waterColors: [], camera: structuredClone(port.readWorldState()!.camera), environment: {timeHours: port.readWorldState()!.lighting.timeHours, transitionDuration: 0, waitForIbl: false}});
  const native = await historyFixture(seedWorldProjectFormats);
  cleanups.push(native.dispose);
  const application = new SeedWorldAgentApplication(port);
  cleanups.push(application.connectProject(native.project));
  const definition = createSeedWorldAgentDefinition(application, native.editor);
  let serial = 0;
  const bind = (tools: readonly AgentTool[]): AgentScriptToolBinding[] => tools.map(tool => ({
    name: tool.name, effect: tool.effect,
    invoke: async (input, signal) => {
      try { return { ok: true, value: toAgentValue(tool.parseOutput(await tool.execute(tool.parseInput(input), { signal }))) }; }
      catch (error) { return { ok: false, error: { code: "TOOL_EXECUTION_FAILED", message: String(error) } }; }
    }
  }));
  const run = (body: string) => {
    const id = `edit-${++serial}`;
    return executeAgentEdit(new JavaScriptAgentScriptRuntime(), checkerAdapter,
      { id, source: ` ${body} `, signal: new AbortController().signal,
        toolBindings: bind([...createSeedWorldTools(application), ...native.editor.tools]), maxToolCalls: 20, timeoutMs: 5_000 }, definition.scriptApi.modules,
      async signal => { const transaction = await definition.beginEdit!(id, signal); return { transaction, toolBindings: bind(transaction.tools) }; });
  };
  return { run, application, definition, effects, port, native };
}
