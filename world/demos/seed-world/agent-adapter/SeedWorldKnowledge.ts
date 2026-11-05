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
  "world_state.snapshot.viewer.atSubmission 是当前 inputId 提交时冻结的位姿和拍摄时间，不是对话开始的时间。没有生效的输入时，它为 null。viewer.current 在每次模型请求时采样。用户可能在执行期间移动或转向。相对指令按提交时的参照解析。验证已创建的对象时，核对身份和目标位置。截图使用自己的 metadata.viewer 和 capturedAt。对象不在当前画面中，不能证明创建失败。不要为了验证而重新创建对象，也不要为了验证而移动用户的相机。",
  "execute 中的世界接口都在 `tools` 下，例如 `await tools.world.parameters.query(...)`。组件扩展使用 `await editor.component.query(...)` 和返回代理上声明的方法。按方法声明中打印的完整写法调用：`spatial.resolve` 的写法是 `tools.spatial.resolve`，不是 `tools.world.spatial.resolve`。Skill 目录只是主题，不是运行时命名空间。",
  "只有 declare/editor/ 中声明的接口可以在当前宿主调用。read 返回 `next` 表示内容还没读完。依赖返回结构前，先按该 offset 继续读取。"
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
