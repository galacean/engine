import { SEED_WORLD_API_CONTRACTS } from "./contracts/SeedWorldContractRegistry.ts";
import { SEED_WORLD_API_DECLARATION_MODULES, SEED_WORLD_API_SEARCH_ENTRIES } from "./contracts/generated/SeedWorldApiSearchRegistry.ts";
import { SEED_WORLD_ASSET_TYPE_CATALOG, type SeedWorldAssetKind } from "@galacean/engine-world-planning/agent-adapter/contracts/SeedWorldAssetContracts";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { collectPlanningSystemKnowledge } from "./SeedWorldSystemDeclarations.ts";
import { TERRAIN_INSPECT_KINDS, VEGETATION_INSPECT_KINDS } from "./tools/tool-contract.ts";
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
  runtime: ["runtime"],
  spatial: ["spatial"],
  environment: ["time", "atmosphere", "environment"],
  terrain: ["terrain"],
  water: ["water"],
  vegetation: ["vegetation"],
  animals: ["animals"]
};
const assetDeclarationModules = (kinds: readonly SeedWorldAssetKind[]): ReadonlySet<string> =>
  new Set(kinds.map((kind) => `assets/${SEED_WORLD_ASSET_TYPE_CATALOG[kind].typeSymbol}.d.ts`));

const SKILL_ASSET_MODULES: Readonly<Record<string, { inspectTool: string; modules: ReadonlySet<string> }>> = {
  vegetation: {
    inspectTool: "vegetation.inspect",
    modules: assetDeclarationModules(VEGETATION_INSPECT_KINDS)
  },
  terrain: {
    inspectTool: "terrain.inspect",
    modules: assetDeclarationModules(TERRAIN_INSPECT_KINDS)
  }
};
function buildHostNotes(defaultScenePath?: string): string {
  const sceneHint =
    typeof defaultScenePath === "string" && defaultScenePath.trim().length > 0
      ? `（当前默认主场景虚拟路径为 ${JSON.stringify(defaultScenePath)}，无需先读 \`project.json\`）`
      : "（默认主场景路径见 `project.json` 的 `scene` 字段）";
  return [
    "world_state.snapshot.viewer.atSubmission 是当前 inputId 提交时冻结的位姿和拍摄时间，不是对话开始的时间。没有生效的输入时，它为 null。viewer.current 在每次模型请求时采样。用户可能在执行期间移动或转向。相对指令按提交时的参照解析。验证已创建的对象时，核对身份和目标位置。截图使用自己的 metadata.viewer 和 capturedAt。对象不在当前画面中，不能证明创建失败。不要为了验证而重新创建对象，也不要为了验证而移动用户的相机。",
    "execute 中的世界系统接口都在各自系统命名空间 `tools.<system>.*` 下，例如 `await tools.vegetation.query(...)`、`await tools.animals.config.get(...)`、`await tools.spatial.resolve(...)`。组件扩展使用 `await editor.component.query(...)` 和返回代理上声明的方法。按方法声明中打印的完整写法调用；Skill 目录只是主题，不是额外前缀。",
    `区分三层身份，切勿混传：① \`tools.vegetation.*\` / \`tools.terrain.*\` 使用资产 Ref（直接复用查询返回的 \`item.ref\`，不要手工拼装），各系统规划配置通过 \`tools.<system>.config.{get,update,reset}\` 读写；② \`editor.*\` 使用 Source 身份 \`{scene, id: string}\`${sceneHint}；③ \`tools.runtime.*\` 使用运行时数字 \`entityId\`/\`componentId\`。三层所有列表与查询接口统一返回 \`{ items }\`。`,
    "execute 的代码是 JavaScript，不能写类型注解。代码运行前会做类型检查：字段名以声明为准，可能为 null 的字段要先判断。只有 declare/editor/ 中声明的接口可以在当前宿主调用。read 返回 `next` 表示内容还没读完。依赖返回结构前，先按该 offset 继续读取。"
  ].join("\n\n");
}
export function createSeedWorldKnowledge(
  toolNames: readonly string[],
  componentTypes?: Iterable<string>,
  options: { guides?: boolean; defaultScenePath?: string } = {}
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
    for (const spec of Object.values(SKILL_ASSET_MODULES)) {
      if (available.has(spec.inspectTool) && spec.modules.has(module.id)) visit(module.id);
    }
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
  const hasAnyConfig = [...available].some(name => name.endsWith(".config.get"));
  const systems = hasAnyConfig
    ? collectPlanningSystemKnowledge(componentTypes ?? planningRegistry.describe().map(component => component.type))
    : [];
  const skills: AgentSkill[] = [];
  const documents: { path: string; content: string }[] = [];
  for (const [path, source] of Object.entries(files)) {
    const relative = path.slice("./skills/".length);
    const name = relative.split("/")[0];
    if (relative !== `${name}/SKILL.md`) continue;
    if (name === "water" && !available.has("water.capabilities")) continue;
    const domains = SKILL_DOMAINS[name];
    if (!domains) continue;
    const apis = SEED_WORLD_API_CONTRACTS.filter(api => domains.includes(api.domain) && available.has(api.name));
    const owned = available.has(`${name}.config.get`)
      ? systems.filter(system => system.skill === name)
      : [];
    if (!apis.length && !owned.length) continue;
    // The declaration holds the full contract; the index only helps choose which one to read.
    const index = apis.map(api => `- [tools.${api.name}](declare/editor/world/tools/${api.name}.d.ts): ${api.description.split(/[。；]/)[0]}`).join("\n");
    const componentPath = `skills/${name}/references/components.md`;
    for (const fact of owned.flatMap(system => system.facts)) documents.push({ path: `declare/editor/world/facts/${fact.path}`, content: fact.content });
    if (owned.length) documents.push({
      path: componentPath,
      content: `# 组件知识\n\n` + owned.map(system =>
        `## ${system.title}\n\nComponents: ${system.components.map(type => `\`${type}\``).join(", ")}\n\n${system.knowledge.join("\n\n")}`).join("\n\n") + "\n"
    });
    const assetSpec = SKILL_ASSET_MODULES[name];
    const assetEntries = assetSpec && available.has(assetSpec.inspectTool)
      ? SEED_WORLD_API_SEARCH_ENTRIES.filter(entry => moduleIds.has(entry.moduleId) && assetSpec.modules.has(entry.moduleId))
      : [];
    const assetTypesPath = `skills/${name}/references/asset-types.md`;
    if (assetEntries.length) {
      documents.push({
        path: assetTypesPath,
        content: "# 资产类型\n\n用 inspect 读取资产后，按 type 读对应声明中的完整字段。\n\n" +
          assetEntries.map(entry => `- [${entry.name}](declare/editor/world/${entry.moduleId})`).join("\n") + "\n"
      });
    }
    skills.push(parseAgentSkill(source
      .replace("<!-- API_INDEX: generated from executable contracts at load time. -->", index)
      .replace("<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->", owned.length ? `系统组件的用法见[组件知识](${componentPath})。` : "")
      .replace("<!-- ASSET_TYPES: generated from inspectable asset declarations at load time. -->", assetEntries.length ? `资产详细字段见[资产类型](${assetTypesPath})。` : "")));
  }
  return { hostNotes: buildHostNotes(options.defaultScenePath), skills, documents, ...api };
}

/** Compose Water extension knowledge, keeping host-owned `water.digRiver` and `water.config.*` visible in water SKILL.md without duplicating modules owned by the base World catalog. */
export function createSeedWorldWaterAgentKnowledge(
  queryToolNames: readonly string[],
  options: { includeDigRiver?: boolean; includeConfig?: boolean } = {}
) {
  const includeDigRiver = Boolean(options.includeDigRiver);
  const includeConfig = options.includeConfig ?? includeDigRiver;
  const hostOwnedNames = [
    ...(includeDigRiver ? ["water.digRiver"] : []),
    ...(includeConfig ? ["water.config.get", "water.config.update", "water.config.reset"] : [])
  ];
  const withHostIndex = createSeedWorldKnowledge([...hostOwnedNames, ...queryToolNames]);
  const queryOnly = createSeedWorldKnowledge(queryToolNames, undefined, { guides: false });
  return {
    ...withHostIndex,
    hostNotes: "",
    entries: queryOnly.entries,
    modules: queryOnly.modules.filter((module) => module.id !== "declare/world/common/AgentTools.d.ts")
  };
}

export const seedWorldKnowledge = createSeedWorldKnowledge(SEED_WORLD_API_CONTRACTS.map(api => api.name));
