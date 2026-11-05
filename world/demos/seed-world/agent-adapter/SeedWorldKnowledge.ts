import { SEED_WORLD_API_CONTRACTS } from "./contracts/SeedWorldContractRegistry.ts";
import { SEED_WORLD_API_DECLARATION_MODULES, SEED_WORLD_API_SEARCH_ENTRIES } from "./contracts/generated/SeedWorldApiSearchRegistry.ts";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { collectPlanningSystemKnowledge } from "./SeedWorldSystemDeclarations.ts";
const files = import.meta.glob("./knowledge/**/*.md", { eager: true, as: "raw" }) as Record<string, string>;
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
    catalog: "# Native API Reference\n\n" + api.entries.map(entry => `- [${entry.name}](${entry.moduleId})`).join("\n"),
    documents: [],
    ...api
  };
  const systems = available.has("world.parameters.describe")
    ? collectPlanningSystemKnowledge(componentTypes ?? planningRegistry.describe().map(component => component.type))
    : [];
  const documents = Object.entries(files).flatMap(([path, content]) => {
    const relative = path.slice("./knowledge/".length);
    const folder = relative.split("/")[0];
    const domain = folder === "object-management" ? "world" : folder;
    const hasApis = SEED_WORLD_API_CONTRACTS.some(api => api.domain === domain && available.has(api.name));
    if (relative !== "README.md" && !(relative === "runtime.md" && available.has("world.inspect")) && !hasApis && !systems.some(system => system.knowledgePath === relative)) return [];
    const index = SEED_WORLD_API_CONTRACTS.filter(api => api.domain === domain && available.has(api.name)).map(api =>
      `- [tools.${api.name}](../../../declare/world/tools/${api.name}.d.ts): ${api.description}`).join("\n");
    const types = SEED_WORLD_API_SEARCH_ENTRIES.filter(entry => moduleIds.has(entry.moduleId) && entry.moduleId.startsWith("assets/")).map(entry =>
      `- [${entry.name}](../../../declare/world/${entry.moduleId}): ${entry.description}`).join("\n");
    const componentKnowledge = systems.filter(system => system.knowledgePath === relative).map(system =>
      `### ${system.title}\n\nComponents: ${system.components.map(type => `\`${type}\``).join(", ")}\n\n${system.knowledge.join("\n\n")}`
    ).join("\n\n");
    return [{
      path: relative === "runtime.md" ? "engine/knowledge/world.md" : "knowledge/world/" + relative,
      content: content
        .replace("<!-- API_INDEX: generated from executable contracts at load time. -->", index + (domain === "world" ? "\n\n### Asset Types\n\n" + types : ""))
        .replace("<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->", componentKnowledge)
    }];
  });
  const paths = new Set(documents.map(document => document.path));
  const catalog = documents.find(doc => doc.path === "knowledge/world/README.md")!.content.split("\n").filter(line => {
    const link = /^- \[[^\]]+\]\(([^)]+)\)/.exec(line);
    return !link || paths.has("knowledge/world/" + link[1]);
  }).join("\n");
  documents.find(doc => doc.path === "knowledge/world/README.md")!.content = catalog;
  return {
    catalog: "# Runtime Project\n\n" +
      "world_state.snapshot.viewer.atSubmission is the frozen pose and capture time for the active inputId, not the start of the chat; it is null when no input reference is active. viewer.current is sampled for this model request. The user can move or turn during execution. Resolve relative instructions from their submission reference; verify created objects by identity and intended placement. A screenshot uses its own metadata.viewer and capturedAt. An object outside the current image is not evidence of failed creation. Do not recreate it or move the user's camera merely to verify it.\n\n- [世界编辑总览](knowledge/world/README.md)\n" +
      catalog.split("\n").filter(line => /^- \[/.test(line)).map(line => line.replace(/\]\(([^)]+)\)/g, "](knowledge/world/$1)")).join("\n") + "\n" +
      (available.has("world.inspect") ? "- [Engine runtime development](../engine/knowledge/README.md)\n- [World runtime access](../engine/knowledge/world.md)\n" : ""),
    documents,
    ...api
  };
}
export const seedWorldKnowledge = createSeedWorldKnowledge(SEED_WORLD_API_CONTRACTS.map(api => api.name));
