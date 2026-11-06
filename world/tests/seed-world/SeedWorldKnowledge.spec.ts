import { posix } from "node:path";
import { buildingPartSkill } from "@galacean/engine-building/building/parts/BuildingKnowledge.ts";
import {seedWorldNativeKnowledge} from "../../demos/seed-world/agent-adapter/SeedWorldAgentDefinition";
import {AgentJavaScriptChecker} from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import {agentTypecheckLibraries} from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import { engineRuntimeFiles } from "@galacean/engine-runtime-editor/runtime-editor-agent/engine-runtime-files.ts";
import { describe, expect, it, vi } from "vitest";
vi.hoisted(() => { (globalThis as any).window ??= {}; });
import { seedWorldKnowledge, createSeedWorldKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldKnowledge";
import { collectPlanningSystemKnowledge, PLANNING_SYSTEM_DECLARATIONS, validatePlanningSystemExecution } from "../../demos/seed-world/agent-adapter/SeedWorldSystemDeclarations";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents.ts";
import { seedWorldScriptModules } from "../../demos/seed-world/systems/SeedWorldScriptModules";
import { createRuntimeScriptEnvironment } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-environment.ts";

describe("Seed World progressive knowledge", () => {
  it("describes frozen input anchors consistently in the declarations read by the model", () => {
    const files = createAgentProjectFiles(seedWorldNativeKnowledge(seedWorldKnowledge), []);
    for (const name of ["common/Anchor.d.ts", "common/Selector.d.ts", "tools/world.query.d.ts"]) {
      const path = files.list().find(path => path.endsWith("/" + name))!;
      const declaration = files.read(path);
      expect(declaration).toContain("用户输入提交时的位置和朝向");
      expect(declaration).toContain("任务期间不随玩家移动而改变");
      expect(declaration).toContain("无活动输入时使用实时位姿");
      expect(declaration).toContain("不是图片拍摄位姿");
      expect(declaration).not.toContain("使用当前玩家位置和朝向");
    }
    const search = files.read(files.list().find(path => path.endsWith("/tools/spatial.search.d.ts"))!);
    expect(search).toContain("活动输入提交时的位置");
  });
  it("keeps object inspection discoverable through the native knowledge index", () => {
    const files = createAgentProjectFiles(seedWorldNativeKnowledge(seedWorldKnowledge), []);
    expect(files.read("skills/world-objects/SKILL.md")).toContain("world.inspect");
  });
  it("publishes directly readable links across world, native, runtime and building knowledge", async () => {
    const catalogs = [seedWorldNativeKnowledge(seedWorldKnowledge)];
    const files = createAgentProjectFiles({
      catalog: catalogs.map(c => c.catalog).join("\n"),
      documents: catalogs.flatMap(c => c.documents ?? []),
      modules: catalogs.flatMap(c => c.modules),
      skills: catalogs.flatMap(c => c.skills ?? []),
      entries: catalogs.flatMap(c => c.entries)
    }, [engineRuntimeFiles(createRuntimeScriptEnvironment({ "@galacean/editor-assets": {}, zod: {} }, seedWorldScriptModules))]);
    let count = 0;
    for (const path of files.list().filter(path => (path.startsWith("editor/") || path.startsWith("engine/") || path.startsWith("skills/")) && path.endsWith(".md"))) {
      const content = files.read(path);
      for (const match of content.matchAll(/\[[^\]]+\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
        const target = match[1];
        if (/^(?:[a-z]+:|#)/i.test(target) || target === "skills/assets/search-cloud/SKILL.md") continue;
        expect(files.kind(target), `${path} -> ${target}`).toBe("file");
        await expect(files.readFilesAsync([target]), `${path} -> ${target}`).resolves.toHaveLength(1);
        count++;
      }
    }
    expect(count).toBeGreaterThan(30);
  });
  it("advertises only the current building generator without retired authoring APIs", () => {
    expect(buildingPartSkill).toContain("BuildingGroupComponent");
    expect(buildingPartSkill).toContain("tools.building.generate");
    expect(seedWorldKnowledge.entries.filter(entry => entry.name.startsWith("building.")).map(entry => entry.name))
      .toEqual(["building.generate"]);
    expect(buildingPartSkill).not.toContain("HouseComponent");
  });
});

describe("system-owned component knowledge", () => {
  const parameterTools = ["world.parameters.describe", "world.parameters.query", "world.parameters.inspect", "world.parameters.apply"];

  it("publishes fixed-candidate density and non-quota flower semantics through native discovery", () => {
    const guide = createSeedWorldKnowledge(parameterTools, ["landscape", "flowers"]).documents
      .find(doc => doc.path === "skills/vegetation/references/components.md")!.content;
    expect(guide).toContain("landscape.vegetation.flowers 同样有效");
    expect(guide).toContain("不因数量不足重试补足");
    expect(guide).toContain("显露比例和单体作者记录是独立的原子能力");
    expect(guide).not.toContain("是兼容保留值");
    expect(guide).not.toContain("实例生成仍需满足道路、水域、实体占地与植株间距");
    const fields = planningRegistry.get("landscape").fields;
    expect(fields.filter(field => field.key.startsWith("vegetation.")).map(field => field.key))
      .toEqual(["trees", "grass", "shrubs", "herbs", "cover", "flowers", "litter"].map(key => `vegetation.${key}`));
    expect(fields.filter(field => field.key.startsWith("plantSizes."))).toHaveLength(10);
    expect(fields.find(field => field.key === "vegetation.flowers")!.description).toContain("固定生成候选");
    expect(planningRegistry.get("flowers").fields.find(field => field.key === "densityPerM2")!.description).toContain("不计算或补足目标株数");
  });

  it("can publish only native declarations without injecting system creative guides", () => {
    const api = createSeedWorldKnowledge(parameterTools, ["lighting", "grassAppearance"], { guides: false });
    const normal = createSeedWorldKnowledge(parameterTools, ["lighting", "grassAppearance"]);
    expect(api.documents).toEqual([]);
    expect(api.modules).toEqual(normal.modules);
    expect(api.entries).toEqual(normal.entries);
    expect(api.skills ?? []).toEqual([]);
  });

  it("provides the same system knowledge to both entry points, filtered by actual components", () => {
    const components = ["lighting", "flowers", "plantMaterial"];
    const systems = collectPlanningSystemKnowledge(components);
    const knowledge = createSeedWorldKnowledge(parameterTools, components);
    for (const system of systems) {
      const document = knowledge.documents.find(doc => doc.path === `skills/${system.skill}/references/components.md`)!;
      for (const instruction of system.knowledge) expect(document.content).toContain(instruction);
      expect(system.components.every(component => components.includes(component))).toBe(true);
    }
    const atmosphere = knowledge.documents.find(doc => doc.path === "skills/environment/references/components.md")!.content;
    expect(atmosphere).toContain("Components: `lighting`");
    expect(atmosphere).not.toContain("postProcess 是世界画面的后处理能力");
    expect(JSON.parse(JSON.stringify(systems))).toEqual(systems);
  });

  it("does not advertise planning systems in an app without parameter APIs", () => {
    const knowledge = createSeedWorldKnowledge(["world.query", "world.inspect"], ["lighting"]);
    expect(knowledge.documents.find(doc => doc.path === "skills/environment/references/components.md")).toBeUndefined();
    expect((knowledge.skills ?? []).map(skill => skill.name)).not.toContain("environment");
    expect(collectPlanningSystemKnowledge([])).toEqual([]);
    expect(collectPlanningSystemKnowledge(["not-a-registered-system"])).toEqual([]);
  });

  it("binds each system to existing component schemas without duplicating field rules", () => {
    const declared = PLANNING_SYSTEM_DECLARATIONS.flatMap(system => system.components);
    expect(new Set(declared.map(component => component.type)).size).toBe(declared.length);
    for (const component of declared) {
      expect(planningRegistry.get(component.type).fields.length).toBeGreaterThan(0);
      expect(component).not.toHaveProperty("fields");
    }
    const systems = collectPlanningSystemKnowledge(declared.map(component => component.type));
    const knowledge = createSeedWorldKnowledge(["world.parameters.describe"], declared.map(component => component.type));
    for (const system of systems) {
      const guide = knowledge.documents.find(document => document.path === `skills/${system.skill}/references/components.md`);
      expect(guide, `${system.id} must reach an actual Agent guide`).toBeDefined();
      for (const instruction of system.knowledge) expect(guide!.content).toContain(instruction);
    }
  });

  it("keeps disabled-consumer checks in the owning system and accepts enabling in the same batch", () => {
    const lighting = { direct: false, environment: false, fog: false, shadows: false };
    expect(validatePlanningSystemExecution("lighting", { sunIntensity: 1 }, lighting)).toContain("direct");
    expect(validatePlanningSystemExecution("lighting", { sunIntensity: 1, direct: true }, { ...lighting, direct: true })).toBeUndefined();
    expect(validatePlanningSystemExecution("lighting", { ambientIntensity: 1 }, lighting)).toContain("environment");
    expect(validatePlanningSystemExecution("lighting", { fogDensity: 0.1 }, lighting)).toContain("fog");
    expect(validatePlanningSystemExecution("lighting", { shadowStrength: 0.5 }, lighting)).toContain("shadows");
    expect(validatePlanningSystemExecution("postProcess", { saturation: 10 }, { enabled: false })).toContain("enabled");
    expect(validatePlanningSystemExecution("postProcess", { enabled: true, saturation: 10 }, { enabled: true })).toBeUndefined();
    expect(validatePlanningSystemExecution("postProcess", { enabled: false }, { enabled: false })).toBeUndefined();
    expect(validatePlanningSystemExecution("flowers", { coverage: 0 }, { coverage: 0 })).toBeUndefined();
  });
});

it("keeps planning discovery, declarations and runtime tool availability identical", () => {
  const names = ["world.query", "world.inspect", "world.parameters.describe", "world.parameters.query", "world.parameters.inspect", "world.parameters.apply"];
  const knowledge = createSeedWorldKnowledge(names);
  expect(knowledge.modules.flatMap(module => module.toolNames).sort()).toEqual([...names].sort());
  const ids = new Set(knowledge.modules.map(module => module.id));
  for (const entry of knowledge.entries) expect(ids.has(entry.moduleId)).toBe(true);
  for (const module of knowledge.modules) for (const dependency of module.imports) expect(ids.has(dependency)).toBe(true);
  expect(knowledge.entries.some(entry => entry.name === "vegetation.create")).toBe(false);
  expect(JSON.stringify([...knowledge.documents, ...(knowledge.skills ?? [])])).not.toContain("[vegetation.create]");
  expect((knowledge.skills ?? []).map(skill => skill.name)).not.toContain("building");
  const hostFiles = new Set(createAgentProjectFiles(knowledge, [engineRuntimeFiles()]).list());
  for (const skill of knowledge.skills ?? []) expect(hostFiles.has(`skills/${skill.name}/SKILL.md`)).toBe(true);
  const generation = createSeedWorldKnowledge(["world.parameters.describe", "world.parameters.query", "world.parameters.inspect", "world.parameters.apply"]);
  expect(generation.modules.some(module => module.id.startsWith("declare/world/assets/"))).toBe(false);
  expect(generation.documents.find(doc => doc.path === "skills/world-objects/references/asset-types.md")?.content ?? "").not.toContain("[BuildingAsset]");
});


it("exposes preset editing while excluding system package authoring in SeedWorld",()=>{
  const checker=new AgentJavaScriptChecker(agentTypecheckLibraries);
  try {
    const catalog=seedWorldNativeKnowledge(seedWorldKnowledge);
    expect(catalog.entries.some(entry=>entry.name.startsWith("editor.package."))).toBe(false);
    expect(catalog.documents.some(doc=>doc.path.startsWith("knowledge/systems/"))).toBe(false);
    const modules=catalog.modules;
    expect(checker.check(`
      const assets = await editor.asset.list({});
      const time = await tools.time.get();
      return {assets,time};
    `,modules)).toBeUndefined();
    expect(checker.check(' await editor.package.install({source:"remote/example",path:"Packages/test"}); ',modules)?.code).toBe("SCRIPT_CHECK_FAILED");
  } finally {checker.dispose();}
});
