import presetRuntimeGuide from "../systems/runtime.md?raw";
import { engineRuntimeFiles } from "@galacean/engine-runtime-editor/runtime-editor-agent/engine-runtime-files";
import type { AgentApplicationDefinition } from "@galacean/engine-ai-chat/ai-chat/index";
import type { SeedWorldAgentApplication } from "./SeedWorldAgentApplication.ts";
import { SEED_WORLD_API_NAMES } from "./contracts/SeedWorldContractRegistry.ts";
import { seedWorldKnowledge } from "./SeedWorldKnowledge.ts";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { withNativeEditingKnowledge } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-knowledge";
import { beginSeedWorldProjectEdit } from "./SeedWorldProjectEdit.ts";
import { createSeedWorldTools } from "./SeedWorldToolCatalog.ts";
import { createSeedWorldKnowledge } from "./SeedWorldKnowledge.ts";

export function createSeedWorldAgentDefinition(
  application: SeedWorldAgentApplication,
  nativeEditor?: RuntimeNativeEditor
): AgentApplicationDefinition {
  const toolNames = createSeedWorldTools(application).map(tool => tool.name);
  const components = application.parameterAuthoring?.describe() as { type: string }[] | undefined;
  return {
    scriptApi: nativeEditor ? seedWorldNativeKnowledge(createSeedWorldKnowledge(toolNames, components?.map(component => component.type)))
      : createSeedWorldKnowledge(toolNames, components?.map(component => component.type)),
    projectFiles: [engineRuntimeFiles(nativeEditor?.scriptEnvironment), ...(nativeEditor?.projectFiles ?? [])],
    runtimeDiagnostics: nativeEditor ? () => nativeEditor.runtimeDiagnostics() : undefined,
    toolNames: [...toolNames, ...(nativeEditor?.tools.map(tool => tool.name) ?? [])],
    beginEdit: (executionId, signal) => nativeEditor
      ? beginSeedWorldProjectEdit(application, nativeEditor, executionId, signal)
      : application.beginEdit(executionId, signal),
    provideWorldThumbnail: () => application.getWorldThumbnail()
  };
}

/** Application-owned composition of world and native editing declarations. */
export function seedWorldNativeKnowledge(knowledge: typeof seedWorldKnowledge) {
  const catalog = withNativeEditingKnowledge(knowledge);
  return { ...catalog, catalog: catalog.catalog + "\n- [Preset systems in Script assets](../engine/knowledge/preset-systems.md)\n",
    documents: [...(catalog.documents ?? []), {path: "engine/knowledge/preset-systems.md", content: presetRuntimeGuide}], modules: [...catalog.modules, {
    id: "declare/world/native.d.ts",
    source: 'import "../native/api"; export {};',
    imports: ["declare/native/api.d.ts"]
  }] };
}
