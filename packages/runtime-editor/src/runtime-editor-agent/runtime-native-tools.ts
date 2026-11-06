import {
  ProjectPathConflictError,
  ProjectPathReadOnlyError
} from "@galacean/engine-project/project-files/virtual-project-files";
import { importRuntimeAsset, type RuntimeAssetSource } from "../project/runtime-asset-import.ts";
import * as z from "zod";
import { AgentToolExecutionError, defineTool, type AgentTool } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { mapApiMethods } from "@galacean/engine-project/api-contract/api-method";
import { runtimeSceneApi } from "./runtime-scene-api";
import { RuntimeSceneEdit } from "../runtime-editor/scene/runtime-scene-edit";

const id = z.string().min(1);
const assetDocumentSchemas = {
  "history.query": z
    .object({
      direction: z.enum(["undo", "redo"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().max(256).optional()
    })
    .strict(),
  "history.read": z.object({ transactionId: id }).strict(),
  "history.undo": z.object({ transactionIds: z.array(id).min(1) }).strict(),
  "history.redo": z.object({ transactionIds: z.array(id).min(1) }).strict(),
  "asset.import": z.object({ source: id, path: id, type: z.string().min(1).optional() }).strict(),
  "asset.list": z.object({}).strict(),
  "asset.info": z.object({ path: id }).strict(),
  "asset.read": z.object({ path: id }).strict(),
  "asset.create": z.object({ path: id, type: id, content: z.string() }).strict(),
  "asset.update": z.object({ path: id, content: z.string() }).strict(),
  "asset.references": z.object({ path: id }).strict(),
  "asset.delete": z.object({ path: id }).strict()
};
const sceneMethods: Readonly<Record<string, (typeof runtimeSceneApi)[keyof typeof runtimeSceneApi]>> = runtimeSceneApi;
export const nativeToolSchemas = {
  ...assetDocumentSchemas,
  ...mapApiMethods(runtimeSceneApi, (method) => method.input)
};
export const nativeToolNames = Object.keys(nativeToolSchemas);

export function nativeProjectTools(
  getDraft: () => RuntimeProjectEdit,
  analyzeImports: (signal: AbortSignal) => Promise<void>,
  onEdit: () => void = () => {}
): AgentTool[] {
  return Object.entries(nativeToolSchemas).map(([name, input]) =>
    defineTool({
      name,
      input,
      output: z.unknown(),
      effect: sceneMethods[name]?.effect ?? (/\.(list|info|read|references|query)$/.test(name) ? "read" : "edit"),
      execute: (value, { signal }) => executeNativeProjectTool(name, value, getDraft(), analyzeImports, onEdit, signal)
    })
  );
}

export async function executeNativeProjectTool(
  name: string,
  value: unknown,
  draft: RuntimeProjectEdit,
  analyzeImports: (signal: AbortSignal) => Promise<void>,
  onEdit: () => void,
  signal: AbortSignal,
  sources: readonly RuntimeAssetSource[] = []
): Promise<unknown> {
  try {
    signal.throwIfAborted();
    if (!Object.hasOwn(nativeToolSchemas, name)) throw new Error(`Unknown native tool: ${name}`);
    const args = value as Record<string, any>;
    const find = (reference: string) => {
      const file = draft.list().find((file) => file.virtualPath === reference);
      if (!file) throw new Error(`Unknown asset '${reference}'`);
      return file;
    };
    let result: unknown = { updated: true };
    const sceneMethod = sceneMethods[name];
    if (sceneMethod) {
      result = sceneMethod.invoke({ scene: (path) => new RuntimeSceneEdit(draft, find(path).virtualPath) }, value);
      if (sceneMethod.effect === "read") return result;
    } else
      switch (name) {
        case "asset.import":
          result = await importRuntimeAsset(draft, sources, args as any, signal);
          break;
        case "asset.list":
          return draft.list().map((file) => ({
            path: file.virtualPath,
            type: file.type,
            ...(file.params ? { params: file.params } : {})
          }));
        case "asset.info":
          return draft.info(args.path);
        case "asset.read":
          return draft.readAsset(args.path);
        case "asset.references":
          await analyzeImports(signal);
          return { references: draft.references(find(args.path).virtualPath) };
        case "asset.create": {
          draft.create({ virtualPath: args.path, type: args.type, path: `runtime-asset:${args.path}` }, args.content);
          result = { path: args.path };
          break;
        }
        case "asset.update":
          draft.update(find(args.path).virtualPath, args.content);
          break;
        case "asset.delete":
          await analyzeImports(signal);
          draft.delete(find(args.path).virtualPath);
          break;
      }
    onEdit();
    return result;
  } catch (error) {
    if (error instanceof ProjectPathConflictError)
      throw new AgentToolExecutionError({
        code: error.code,
        message: error.message,
        executed: false,
        details: { path: error.path, existingPath: error.existingPath, existingKind: error.existingKind }
      });
    if (error instanceof ProjectPathReadOnlyError)
      throw new AgentToolExecutionError({
        code: error.code,
        message: error.message,
        executed: false,
        details: { path: error.path }
      });
    throw error;
  }
}
