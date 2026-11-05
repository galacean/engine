import { SEED_WORLD_API_CONTRACTS } from "./contracts/SeedWorldContractRegistry.ts";
import { SEED_WORLD_API_DECLARATION_MODULES, SEED_WORLD_API_SEARCH_ENTRIES } from "./contracts/generated/SeedWorldApiSearchRegistry.ts";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { collectPlanningSystemKnowledge } from "./SeedWorldSystemDeclarations.ts";
import type { AgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";
import animalsSkill from "@galacean/engine-animals/skills/animals/SKILL.md?raw";
import environmentSkill from "@galacean/engine-environment/skills/environment/SKILL.md?raw";
import terrainSkill from "@galacean/engine-terrain/skills/terrain/SKILL.md?raw";
import vegetationSkill from "@galacean/engine-vegetation/skills/vegetation/SKILL.md?raw";
import waterSkill from "@galacean/engine-water/skills/water/SKILL.md?raw";
const localFiles = import.meta.glob("./skills/**/SKILL.md", { eager: true, as: "raw" }) as Record<string, string>;
/** System-owned Skills live in their packages; this Demo adds its API index and registered components. */
const files: Readonly<Record<string, string>> = {
  ...localFiles,
  "./skills/animals/SKILL.md": animalsSkill,
  "./skills/environment/SKILL.md": environmentSkill,
  "./skills/terrain/SKILL.md": terrainSkill,
  "./skills/vegetation/SKILL.md": vegetationSkill,
  "./skills/water/SKILL.md": waterSkill
};
const SKILL_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  "world-objects": ["world"],
  spatial: ["spatial"],
  environment: ["time", "atmosphere"],
  terrain: ["terrain"],
  water: ["water"],
  vegetation: ["vegetation"],
  animals: ["animals"]
};
const HOST_NOTES = [
  "world_state.snapshot.viewer.atSubmission is the frozen pose and capture time for the active inputId, not the start of the chat; it is null when no input reference is active. viewer.current is sampled for this model request. The user can move or turn during execution. Resolve relative instructions from their submission reference; verify created objects by identity and intended placement. A screenshot uses its own metadata.viewer and capturedAt. An object outside the current image is not evidence of failed creation. Do not recreate it or move the user's camera merely to verify it.\n\n- [世界编辑总览](knowledge/world/README.md)\n",
  "In execute, world APIs live under `tools`, for example `await tools.world.parameters.query(...)`. Component extensions use `await editor.component.query(...)` and the methods declared on the returned proxy. Use the complete invocation printed in each method declaration: `spatial.resolve` is `tools.spatial.resolve`, not `tools.world.spatial.resolve`. Skill directories are topics, not runtime namespaces.",
  "Only APIs linked from a Skill's API index and present in declare/editor/ are callable on this host. A paginated read is incomplete when it returns `next`; follow that offset before relying on a return structure."
].join("\n\n");
export function createSeedWorldKnowledge(
  toolNames: readonly string[], componentTypes?: Iterable<string>, options: { guides?: boolean } = {}
) {
  const available = new Set(toolNames);
  const declared = new Map(SEED_WORLD_API_DECLARATION_MODULES.map(module => [module.id, module]));
  const reachable = new Set<string>();
  const visit = (id: string): void => {
    if (reachable.has(id)) return;
    const module = declared.get(id);
    if (!module) throw new Error(`Missing Agent declaration dependency: ${id}`);
    reachable.add(id);
    module.imports.forEach(visit);
  };
  for (const module of declared.values()) {
    if (module.toolNames.length && module.toolNames.every(name => available.has(name))) visit(module.id);
    // world.inspect returns the open AssetDetailsByType map augmented by the asset modules.
    if (available.has("world.inspect") && module.id.startsWith("assets/")) visit(module.id);
  }
  const modules = [...declared.values()].filter(module => reachable.has(module.id));
  const moduleIds = new Set(modules.map(module => module.id));
  const api = {
    entries: SEED_WORLD_API_SEARCH_ENTRIES.filter(entry => moduleIds.has(entry.moduleId)).map(entry => ({ ...entry, moduleId: "declare/world/" + entry.moduleId })),
    modules: modules.map(module => ({ ...module, id: "declare/world/" + module.id, imports: module.imports.map(id => "declare/world/" + id) }))
  };
  if (options.guides === false) return {
    hostNotes: "# Native API Reference\n\n" + api.entries.map(entry => `- [${entry.name}](${entry.moduleId})`).join("\n"),
    documents: [],
    ...api
  };
  const systems = available.has("world.parameters.describe")
    ? collectPlanningSystemKnowledge(componentTypes ?? planningRegistry.describe().map(component => component.type))
    : [];
  const skills: AgentSkill[] = [];
  const documents: { path: string; content: string }[] = [];
  for (const [path, source] of Object.entries(files)) {
    const relative = path.slice("./skills/".length);
    const name = relative.split("/")[0];
    if (relative !== `${name}/SKILL.md`) continue;
    const domains = SKILL_DOMAINS[name];
    const apis = SEED_WORLD_API_CONTRACTS.filter(api => domains.includes(api.domain) && available.has(api.name));
    const owned = systems.filter(system => system.skill === name);
    if (!apis.length && !owned.length) continue;
    const index = apis.map(api => `- [tools.${api.name}](declare/editor/world/tools/${api.name}.d.ts): ${api.description}`).join("\n");
    const componentPath = `skills/${name}/references/components.md`;
    if (owned.length) documents.push({
      path: componentPath,
      content: `# 组件知识\n\n` + owned.map(system =>
        `## ${system.title}\n\nComponents: ${system.components.map(type => `\`${type}\``).join(", ")}\n\n${system.knowledge.join("\n\n")}`).join("\n\n") + "\n"
    });
    skills.push(parseAgentSkill(source
      .replace("<!-- API_INDEX: generated from executable contracts at load time. -->", index)
      .replace("<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->", owned.length ? `系统组件的用法见[组件知识](${componentPath})。` : "")));
    if (name === "world-objects") {
      documents.push({
        path: "skills/world-objects/references/asset-types.md",
        content: "# 资产类型\n\n" + SEED_WORLD_API_SEARCH_ENTRIES.filter(entry => moduleIds.has(entry.moduleId) && entry.moduleId.startsWith("assets/")).map(entry =>
          `- [${entry.name}](declare/editor/world/${entry.moduleId}): ${entry.description}`).join("\n") + "\n"
      });
      if (available.has("world.parameters.describe")) documents.push({
        path: "skills/world-objects/parameters/SKILL.md",
        content: files["./skills/world-objects/parameters/SKILL.md"]
      });
    }
  }
  return { hostNotes: HOST_NOTES, skills, documents, ...api };
}
export const seedWorldKnowledge = createSeedWorldKnowledge(SEED_WORLD_API_CONTRACTS.map(api => api.name));
