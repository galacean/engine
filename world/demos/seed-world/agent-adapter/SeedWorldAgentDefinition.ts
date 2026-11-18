import { buildingPartDocuments, buildingPartSkill } from "@galacean/engine-building/building/parts/BuildingKnowledge";
import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";
import presetSystemsGuide from "./skills/scripting/preset-systems.md?raw";
import worldRuntimeGuide from "./skills/scripting/world-runtime.md?raw";
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
  const seedWorldReferences = "\n\n## Seed World\n\n- 脚本中使用预置系统：[预置系统](skills/scripting/references/preset-systems.md)\n- 日夜、天气、风等世界运行时模块：[世界运行时](skills/scripting/references/world-runtime.md)\n";
  return { ...catalog,
    skills: [...(catalog.skills ?? []).map(skill => skill.name === "scripting" ? { ...skill, content: skill.content + seedWorldReferences } : skill), parseAgentSkill(buildingPartSkill)],
    documents: [...(catalog.documents ?? []), ...buildingPartDocuments,
      { path: "skills/scripting/references/preset-systems.md", content: presetSystemsGuide },
      { path: "skills/scripting/references/world-runtime.md", content: worldRuntimeGuide }],
    modules: [...catalog.modules, {
    id: "declare/world/native.d.ts",
    source: 'import "../native/api"; export {};',
    imports: ["declare/native/api.d.ts"]
  }] };
}
