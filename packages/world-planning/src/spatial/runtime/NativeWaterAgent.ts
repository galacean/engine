import type * as z from "zod";
import type { AgentEditorExtension } from "@galacean/engine-ai-chat/ai-chat/agent-extensions";
import {
  AgentToolExecutionError,
  defineTool,
  type AgentScriptApiCatalog
} from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { toAgentToolOutput } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { WaterBodyComponent, type WaterSystem } from "@galacean/engine-water/water/native/index";
import { getWaterAuthoringCapabilities } from "@galacean/engine-water/water/native/WaterAuthoring";
import { waterMaterialProperties, type WaterMaterialFile } from "@galacean/engine-water/water/native/WaterMaterialFile";
import { WATER_QUERY_CONTRACTS } from "./WaterQueryContract";

export function createNativeWaterAgentPackage(
  port: {
    editor: RuntimeNativeEditor;
    project: RuntimeProjectSession;
    system(): WaterSystem | undefined;
    hostTerrain?: boolean;
    oceanDatum?: number;
  },
  scriptApi: AgentScriptApiCatalog
): AgentEditorExtension {
  const projection = port.editor.projection;
  const resolve = (target: { scene: string; id: string }) => {
    const identity = projection
      .queryComponents({ type: "WaterBodyComponent", id: target.id })
      .find((identity) => identity.scene === target.scene);
    if (!identity) throw new Error(`NOT_FOUND: Source Water '${target.scene}:${target.id}'.`);
    const body = projection.resolveComponent(identity);
    if (!(body instanceof WaterBodyComponent) || !body.authoring)
      throw new Error("NOT_FOUND: Source Water is unavailable.");
    return body;
  };
  const describe = (body: WaterBodyComponent) => {
    const identity = projection.identityOf(body)!;
    const owner = port.system();
    const published = !!body.configuration;
    return {
      target: { scene: identity.scene, id: identity.id },
      bodyRevision: body.revision,
      published,
      enabled: body.enabled && body.entity.isActiveInHierarchy,
      active: published ? (owner?.getBodyState(body.waterId).active ?? false) : false,
      ...(body.lastError ? { lastError: body.lastError } : {})
    };
  };
  const tools = WATER_QUERY_CONTRACTS.map((contract) =>
    defineTool({
      ...contract,
      input: contract.input as z.ZodType,
      output: contract.output as z.ZodType,
      execute: async (input, context) => {
        context.signal.throwIfAborted();
        try {
          const args = input as {
            target?: { scene: string; id: string };
            x?: number;
            y?: number;
            z?: number;
            expectedRevision?: number;
          };
          const system = port.system();
          if (!system || system.destroyed) throw new Error("MISSING_DEPENDENCY: WaterSystem is unavailable.");
          const body = args.target ? resolve(args.target) : undefined;
          let result: unknown;
          switch (contract.name) {
            case "water.capabilities": {
              let material:
                | { path: string; properties: Omit<ReturnType<typeof waterMaterialProperties>[number], "hidden">[] }
                | undefined;
              if (body) {
                const record = projection.readComponent(projection.identityOf(body)!);
                const authoring = record.props?.authoring as { material: { $ref: string } };
                const path = authoring.material.$ref;
                await port.project.fileProvider().prepare?.(path, context.signal);
                const content = port.project.projectPackage.contents[path];
                if (typeof content !== "string")
                  throw new Error(`MISSING_DEPENDENCY: Material '${path}' is unavailable.`);
                material = {
                  path,
                  properties: waterMaterialProperties(JSON.parse(content) as WaterMaterialFile)
                    .filter((field) => !field.hidden)
                    .map(({ hidden: _hidden, ...field }) => field)
                };
              }
              const kinds = body ? [body.authoring!.shape.kind] : (["lake", "river", "ocean"] as const);
              result = {
                editor: "public-source",
                activeOceansPerScene: 1,
                hostTerrain: port.hostTerrain ?? false,
                ...(port.oceanDatum === undefined ? {} : { oceanDatum: port.oceanDatum }),
                authoringFields: [
                  "shape",
                  "terrain",
                  "quality",
                  "material",
                  "connections",
                  "visible",
                  "priority",
                  "interaction"
                ],
                kinds: kinds.map((kind) => ({ kind, ...getWaterAuthoringCapabilities(kind) })),
                ...(material ? { material } : {})
              };
              break;
            }
            case "water.sample":
              result = system.sample(args.x!, args.z!, body?.waterId);
              break;
            case "water.sampleDrops":
              if (body && !body.configuration)
                throw new Error("MISSING_DEPENDENCY: Water has no published configuration.");
              result = system.sampleDrops(args.x!, args.y!, args.z!, body?.waterId);
              break;
            case "water.diagnostics":
              result = {
                revision: system.revision,
                runtime: { ...system.runtimeState },
                bodies: (body
                  ? [body]
                  : projection.queryComponents({ type: "WaterBodyComponent" }).map((identity) => resolve(identity))
                ).map(describe),
                diagnostics: port.editor.runtimeDiagnostics().filter((item) => item.id === "water-runtime")
              };
              break;
            case "water.verify": {
              if (system.runtimeState.phase === "error")
                throw new Error(`EXECUTION_FAILED: ${system.runtimeState.error ?? "Water runtime failed."}`);
              if (!body!.configuration) throw new Error("MISSING_DEPENDENCY: Water has no published configuration.");
              if (body!.lastError) throw new Error(`EXECUTION_FAILED: ${body!.lastError}`);
              if (args.expectedRevision !== undefined && args.expectedRevision !== body!.revision)
                throw new Error("CONFLICT: Published body revision does not match expectedRevision.");
              const error = port.editor.runtimeDiagnostics().find((item) => item.id === "water-runtime");
              if (error) throw new Error(`EXECUTION_FAILED: ${error.message}`);
              result = { ...describe(body!), revision: system.revision };
              break;
            }
          }
          context.signal.throwIfAborted();
          return toAgentToolOutput(result);
        } catch (error) {
          if (context.signal.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          const code = message.split(":", 1)[0];
          throw new AgentToolExecutionError({
            code: ["NOT_FOUND", "MISSING_DEPENDENCY", "CONFLICT", "EXECUTION_FAILED"].includes(code)
              ? code
              : "EXECUTION_FAILED",
            message,
            executed: false
          });
        }
      }
    })
  );
  return {
    tools,
    definition: {
      toolNames: tools.map((tool) => tool.name),
      scriptApi
    }
  };
}
