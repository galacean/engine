import { describe, expect, it } from "vitest";
import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files";
import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";
import { AgentNativeFiles } from "@galacean/engine-ai-chat/ai-chat/agent-native-files";
import { buildAgentMessages, buildAgentSystemPrompt, buildAgentToolDefinitions } from "@galacean/engine-ai-chat/ai-chat/agent-protocol";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries";
import { engineRuntimeFiles } from "@galacean/engine-runtime-editor/runtime-editor-agent/engine-runtime-files";
import { WATER_QUERY_CONTRACTS } from "@galacean/engine-world-planning/spatial/runtime/WaterQueryContract.ts";
import { seedWorldNativeKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldAgentDefinition.ts";
import {
  createSeedWorldKnowledge,
  createSeedWorldWaterAgentKnowledge
} from "../../demos/seed-world/agent-adapter/SeedWorldKnowledge.ts";
import { SEED_WORLD_API_NAMES } from "../../demos/seed-world/agent-adapter/contracts/SeedWorldContractRegistry.ts";
import searchCloudSkill from "../../../packages/runtime-editor/src/retrieval-agent/search-cloud.md?raw";
import { FARMING_SYSTEM_EDITOR_DECLARATION } from "@galacean/engine-farming/farming/native/FarmingAPIDeclarations";
import { FARMING_METHOD_DOCS } from "@galacean/engine-farming/farming/native/FarmingMethodDocs";
import { farmingSkill, farmingSkillDocuments } from "@galacean/engine-farming/farming/native/FarmingSkill";

function buildFullKnowledgeCatalog() {
  const base = seedWorldNativeKnowledge(createSeedWorldKnowledge([...SEED_WORLD_API_NAMES]));
  const waterKnowledge = createSeedWorldWaterAgentKnowledge(
    WATER_QUERY_CONTRACTS.map((item) => item.name),
    { includeDigRiver: true }
  );
  const documentsByPath = new Map<string, string>();
  for (const doc of base.documents ?? []) documentsByPath.set(doc.path, doc.content);
  for (const doc of waterKnowledge.documents ?? []) documentsByPath.set(doc.path, doc.content);
  documentsByPath.set("skills/assets/search-cloud/SKILL.md", searchCloudSkill);
  // Match production FarmingComponentEditor: overview.md describes the retired FarmingAreaComponent proxy.
  for (const doc of [
    ...farmingSkillDocuments.filter((d) => d.path !== "skills/farming/references/overview.md"),
    ...FARMING_METHOD_DOCS
  ]) {
    documentsByPath.set(doc.path, doc.content);
  }

  const skillsByName = new Map((base.skills ?? []).map((s) => [s.name, s]));
  for (const s of waterKnowledge.skills ?? []) skillsByName.set(s.name, s);
  const parsedFarming = parseAgentSkill(farmingSkill);
  skillsByName.set(parsedFarming.name, parsedFarming);

  const modulesById = new Map((base.modules ?? []).map((m) => [m.id, m]));
  for (const m of waterKnowledge.modules ?? []) modulesById.set(m.id, m);
  modulesById.set("farming/FarmingSystem.d.ts", {
    id: "farming/FarmingSystem.d.ts",
    source: FARMING_SYSTEM_EDITOR_DECLARATION,
    imports: [],
    toolNames: []
  });

  return {
    ...base,
    hostNotes: [
      base.hostNotes ?? "",
      "云端资产检索见 [云端搜索](skills/assets/search-cloud/SKILL.md)。"
    ].join("\n\n"),
    skills: [...skillsByName.values()],
    documents: [...documentsByPath.entries()].map(([path, content]) => ({ path, content })),
    modules: [...modulesById.values()]
  };
}

describe("Seed World Agent Knowledge Static Audit (Offline CI Gate)", () => {
  const catalog = buildFullKnowledgeCatalog();
  const files = createAgentProjectFiles(catalog, [engineRuntimeFiles()]);
  const allPaths = files.list();
  const pathSet = new Set(allPaths);
  const skillMarkdowns = allPaths.filter((p) => p.startsWith("skills/") && p.endsWith(".md"));

  it("keeps every skill and reference markdown reachable from top-level skills (0 orphans)", () => {
    const hopDepth = new Map<string, number>();
    const queue: string[] = [];
    for (const skill of catalog.skills) {
      const entry = `skills/${skill.name}/SKILL.md`;
      if (pathSet.has(entry) && !hopDepth.has(entry)) {
        hopDepth.set(entry, 0);
        queue.push(entry);
      }
    }
    // Host-mounted optional extensions (e.g. retrieval search-cloud) route from hostNotes at hop 0.
    for (const match of (catalog.hostNotes ?? "").matchAll(/\]\(<?([^)>\s]+)>?\)/g)) {
      const target = match[1]!.split("#")[0]!;
      if (target && pathSet.has(target) && target.startsWith("skills/") && !hopDepth.has(target)) {
        hopDepth.set(target, 0);
        queue.push(target);
      }
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const depth = hopDepth.get(cur)!;
      const content = files.read(cur);
      for (const match of content.matchAll(/\]\(<?([^)>\s]+)>?\)/g)) {
        const target = match[1]!.split("#")[0]!;
        if (target && pathSet.has(target) && target.startsWith("skills/") && !hopDepth.has(target)) {
          hopDepth.set(target, depth + 1);
          queue.push(target);
        }
      }
    }

    const unreachable = skillMarkdowns.filter((p) => !hopDepth.has(p)).sort();
    // M2 tightened: 0 unreachable orphan documents
    expect(unreachable).toEqual([]);
  });

  it("exposes water.digRiver in water/SKILL.md API_INDEX and links every world tool declaration", () => {
    const withDigRiver = createSeedWorldWaterAgentKnowledge(
      SEED_WORLD_API_NAMES.filter((name) => name.startsWith("water.") && name !== "water.digRiver"),
      { includeDigRiver: true }
    );
    const withIndex = withDigRiver.skills[0]?.content.split("## 接口索引")[1] ?? "";
    expect(withIndex).toContain("[tools.water.digRiver](declare/editor/world/tools/water.digRiver.d.ts)");
    expect(withDigRiver.modules.some((m) => m.id === "declare/world/tools/water.digRiver.d.ts")).toBe(false);
    expect(withDigRiver.modules.some((m) => m.id === "declare/world/common/AgentTools.d.ts")).toBe(false);
    expect(withDigRiver.entries.some((e) => e.name === "water.digRiver")).toBe(false);

    const withoutDigRiver = createSeedWorldWaterAgentKnowledge(
      SEED_WORLD_API_NAMES.filter((name) => name.startsWith("water.") && name !== "water.digRiver"),
      { includeDigRiver: false }
    );
    const withoutIndex = withoutDigRiver.skills[0]?.content.split("## 接口索引")[1] ?? "";
    expect(withoutIndex).not.toContain("[tools.water.digRiver]");
    expect(withoutDigRiver.modules.some((m) => m.id === "declare/world/tools/water.digRiver.d.ts")).toBe(false);
    expect(withoutDigRiver.modules.some((m) => m.id === "declare/world/common/AgentTools.d.ts")).toBe(false);

    const waterSkill = files.read("skills/water/SKILL.md");
    expect(waterSkill).toContain("tools.water.digRiver");
    expect(waterSkill).toContain("declare/editor/world/tools/water.digRiver.d.ts");

    const allSkillText = skillMarkdowns.map((p) => files.read(p)).join("\n");
    const worldToolDeclares = allPaths.filter(
      (p) => p.startsWith("declare/editor/world/tools/") && p.endsWith(".d.ts")
    );
    const unreferencedTools = worldToolDeclares.filter((p) => !allSkillText.includes(p));
    expect(unreferencedTools).toEqual([]);
  });

  it("requires every SKILL.md mentioning editor.* APIs to link declare/editor/native/api.d.ts", () => {
    const missingNativeLink: string[] = [];
    for (const p of skillMarkdowns) {
      if (!p.endsWith("/SKILL.md")) continue;
      const content = files.read(p);
      if (/\beditor\.(?:entity|component|asset|scene|history|project|script)\b/.test(content)) {
        if (!content.includes("declare/editor/native/api.d.ts")) {
          missingNativeLink.push(p);
        }
      }
    }
    // M2 tightened: every SKILL.md mentioning editor.* links declare/editor/native/api.d.ts
    expect(missingNativeLink.sort()).toEqual([]);
  });

  it("inlines native/source.d.ts when reading native/api.d.ts and discloses any omitted dependencies explicitly", async () => {
    const def = {
      toolNames: [...SEED_WORLD_API_NAMES],
      skills: catalog.skills,
      scriptApi: {
        hostNotes: catalog.hostNotes ?? "",
        entries: [],
        modules: catalog.modules
      }
    };
    const readCold = async (filePath: string) => {
      const fileTools = new AgentNativeFiles(
        () => files,
        () => def,
        new Map(),
        () => "",
        60_000,
        () => new Set()
      );
      return fileTools.execute(
        "read",
        { file_path: filePath, offset: null, column: null, limit: null },
        "audit",
        new AbortController().signal
      );
    };

    const apiRead = await readCold("declare/editor/native/api.d.ts");
    expect(apiRead.content).toContain('<dependency path="declare/editor/native/source.d.ts">');

    // M1 gate: vegetation.update.d.ts must fit in a single page and inline its core dependencies without pagination
    const vegRead = await readCold("declare/editor/world/tools/vegetation.update.d.ts");
    const vegVal = vegRead.result.ok ? (vegRead.result.value as { next?: unknown; omittedDependencies?: readonly unknown[] }) : undefined;
    expect(vegVal?.next ?? null).toBeNull();
    expect(vegVal?.omittedDependencies ?? []).toEqual([]);

    // Any editor .d.ts that skips dependencies due to budget or pagination must explicitly emit <omitted_dependencies>
    const editorDts = allPaths.filter((p) => p.startsWith("declare/editor/") && p.endsWith(".d.ts"));
    const silentSkips: string[] = [];
    for (const p of editorDts) {
      const res = await readCold(p);
      const val = res.result.ok ? (res.result.value as { omittedDependencies?: readonly unknown[] }) : undefined;
      const omitted = val?.omittedDependencies ?? [];
      if (omitted.length > 0 && !res.content.includes("<omitted_dependencies>")) {
        silentSkips.push(p);
      }
    }
    expect(silentSkips).toEqual([]);
  });

  it("prevents stale legacy terminology regressions and bounds initial payload size", () => {
    const targetPaths = allPaths.filter((p) => p.startsWith("skills/") || p.startsWith("declare/editor/"));
    const hits = { APISearch: 0, AssetCatalog: 0, bareSlashAssets: 0 };
    for (const p of targetPaths) {
      const text = files.read(p);
      if (text.includes("APISearch")) hits.APISearch++;
      if (text.includes("AssetCatalog")) hits.AssetCatalog++;
      if (/(?:^|[\s`（(])\/assets(?:\b|\/)/.test(text)) hits.bareSlashAssets++;
    }
    expect(hits.APISearch).toBe(0);
    // M1 tightened: legacy AssetCatalog and bare /assets terms eliminated (0)
    expect(hits.AssetCatalog).toBe(0);
    expect(hits.bareSlashAssets).toBe(0);

    const def = {
      toolNames: [...SEED_WORLD_API_NAMES],
      skills: catalog.skills,
      captureSnapshot: async () => ({
        image: { blob: new Blob(), width: 1, height: 1 },
        metadata: {}
      }),
      imageResources: {
        pick: () => ({})
      },
      scriptApi: {
        hostNotes: catalog.hostNotes ?? "",
        entries: [],
        modules: catalog.modules
      }
    };
    const systemPrompt = buildAgentSystemPrompt(def);
    const messages = buildAgentMessages({
      systemPrompt,
      skills: catalog.skills,
      hostNotes: catalog.hostNotes,
      taskId: "audit",
      userInput: "test",
      inputSource: "text",
      worldThumbnail: {}
    });
    const tools = buildAgentToolDefinitions(def);
    const messageBytes = messages.reduce((sum, m) => sum + Buffer.byteLength(String(m.content ?? ""), "utf8"), 0);
    const toolBytes = tools.reduce((sum, t) => sum + Buffer.byteLength(JSON.stringify(t), "utf8"), 0);

    // M3 tightened: full toolset including snapshot + slimmed pick stays under 27KB
    expect(messageBytes + toolBytes).toBeLessThanOrEqual(27_000);
  });

  it("typechecks every published js code example across all skills/**/*.md against the live declaration surface", () => {
    const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
    const failures: Array<{ path: string; blockIndex: number; message: string }> = [];
    let checkedBlocks = 0;

    for (const p of skillMarkdowns) {
      const content = files.read(p);
      const blocks = [...content.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g)];
      blocks.forEach((match, blockIndex) => {
        checkedBlocks++;
        let preamble = "";
        if (p === "skills/water/SKILL.md") {
          preamble = 'const scene = "Scenes/Main.scene";\n';
        } else if (p === "skills/assets/use-model/SKILL.md" && blockIndex === 1) {
          preamble = "const x = 0, y = 0, z = 0;\n";
        } else if (p === "skills/farming/references/operations.md" && blockIndex === 0) {
          preamble =
            'const system = (await editor.component.query({type:"FarmingSystem"})).items[0]; const farmId = "f"; const plotId = "p"; const cropId = "c";\n';
        }
        const err = checker.check(preamble + match[1], catalog.modules);
        if (err) {
          failures.push({ path: p, blockIndex, message: err.message });
        }
      });
    }

    expect(checkedBlocks).toBeGreaterThanOrEqual(8);
    expect(failures).toEqual([]);
  });

  it("forbids legacy world.* tools and world-objects skill across registry, declarations, and skills", () => {
    expect(SEED_WORLD_API_NAMES.filter((name) => name.startsWith("world."))).toEqual([]);
    expect(allPaths.filter((p) => p.includes("world-objects") || p.includes("/tools/world."))).toEqual([]);
    const staleRefs: string[] = [];
    for (const p of allPaths.filter((x) => x.startsWith("skills/") || x.startsWith("declare/editor/world/"))) {
      const content = files.read(p);
      if (/\bworld\.(?:query|inspect|delete|tag|selection|parameters|animals)\b|world-objects/.test(content)) {
        staleRefs.push(p);
      }
    }
    expect(staleRefs).toEqual([]);
    expect(catalog.hostNotes).not.toMatch(/\bworld\.(?:query|inspect|delete|tag|selection|parameters|animals)\b|world-objects/);
  });

  it("keeps generic runtime-editor skills decoupled from host-specific scene path literals", () => {
    const genericEditorSkillPaths = skillMarkdowns.filter((p) =>
      /^skills\/(?:scene-nodes|components|assets|scripting|history)\//.test(p)
    );
    const hostSceneLeaks: string[] = [];
    for (const p of genericEditorSkillPaths) {
      const text = files.read(p);
      if (/\b(?:Scenes\/Main\.scene|Scene\/SeedWorld\.scene)\b/.test(text)) {
        hostSceneLeaks.push(p);
      }
    }
    expect(hostSceneLeaks).toEqual([]);
  });
});
