import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAgentMessages, buildAgentSystemPrompt, buildAgentToolDefinitions, readSystemInjection } from "@galacean/engine-ai-chat/ai-chat/agent-protocol.ts";
import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import { AgentNativeFiles } from "@galacean/engine-ai-chat/ai-chat/agent-native-files.ts";
import { composeAgentConfiguration } from "@galacean/engine-ai-chat/ai-chat/agent-extensions.ts";
import { createFarmingComponentExtension } from "@galacean/engine-runtime-editor/farming/FarmingComponentEditor.ts";
import { createRetrievalAgentExtension } from "@galacean/engine-runtime-editor/retrieval-agent/index.ts";
import { createNativeWaterAgentPackage } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterAgent.ts";
import { WATER_QUERY_CONTRACTS } from "@galacean/engine-world-planning/spatial/runtime/WaterQueryContract.ts";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor.ts";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session.ts";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeScriptWorker } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-worker.ts";
import { Scene, type Engine } from "@galacean/engine";
import { createSeedWorldChatAgentConfiguration } from "../../../demos/seed-world/assistant/SeedWorldChatPanel.ts";
import { createSeedWorldWaterAgentKnowledge } from "../../../demos/seed-world/agent-adapter/SeedWorldKnowledge.ts";
import { SeedWorldAgentApplication } from "../../../demos/seed-world/agent-adapter/SeedWorldAgentApplication.ts";
import { seedWorldProjectFormats } from "../../../demos/seed-world/SeedWorldProjectFormats.ts";
import { seedWorldScriptModules } from "../../../demos/seed-world/systems/SeedWorldScriptModules.ts";
import { state as baseLiveState } from "../../../../packages/world-planning/tests/editor/seed-world-fixture.ts";
import type { SeedWorldEnginePort } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort.ts";

const OUT_PATH = path.join(os.tmpdir(), "seed-world-llm-bench", "static-audit.json");

describe("Seed World LLM Skill & Declare Static Audit", () => {
  it("audits production skills, initial payload, declaration inline graph, and static defects", async () => {
    const pack: RuntimeProjectPackage = {
      version: RUNTIME_PROJECT_SAVE_VERSION,
      project: {
        scene: "Scenes/Main.scene",
        files: [{ virtualPath: "Scenes/Main.scene", path: "Scenes/Main.scene", type: "Scene", dependencies: [] }]
      },
      contents: {
        "Scenes/Main.scene": JSON.stringify({
          asset: { version: "2.0" },
          scene: { rootEntities: [], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
          entities: [],
          components: []
        })
      }
    };
    vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
      load: async () => structuredClone(pack),
      save: async () => {},
      close() {}
    } as never);
    vi.spyOn(RuntimeScriptWorker.prototype, "compile").mockResolvedValue({
      entries: {},
      files: {},
      dependencies: {}
    } as never);
    const project = await RuntimeProjectSession.open(crypto.randomUUID(), pack.project, "https://example.test/", {
      scriptModules: seedWorldScriptModules
    });
    const engine = {
      resourceManager: {
        _deleteAsset() {},
        _deleteContentRestorer() {},
        registerVirtualResources() {},
        getResourceByRef: async () => ({})
      }
    } as unknown as Engine;
    const scene = Object.assign(Object.create(Scene.prototype), {
      _engine: engine,
      _rootEntities: [],
      _isActiveInEngine: true,
      _componentsManager: { getActiveChangedTempList: () => [], putActiveChangedTempList() {} }
    }) as Scene;
    const nativeEditor = new RuntimeNativeEditor(project, scene, seedWorldProjectFormats);

    const live = baseLiveState();
    const port: SeedWorldEnginePort = {
      readWorldState: () => structuredClone(live),
      readAuthoringSnapshot: () => ({ activeRevision: 0, draftRevision: 0, authoringStateHash: "init", resources: [], removedObjectIds: [] }),
      queryWorldPoints: () => [],
      queryWorldRegions: () => [],
      queryWorldObjects: () => ({ worldId: "seed-world-1", worldRevision: 0, inspectedObjectCount: 0, objects: [] }),
      getWorldObject: () => { throw new Error("not found"); },
      resolveSpatialTarget: () => { throw new Error("unsupported"); },
      readTerrainPatchConstraints: () => ({ heightSampleSpacingMetres: 1, minimumRadiusMetres: 1 }),
      teleport: () => ({ cameraPosition: [0, 2, 0] }),
      updateEnvironment: async () => ({}),
      mutateWorldResource: async () => ({}),
      mutateWorldResources: async () => ({})
    };

    const application = new SeedWorldAgentApplication(
      port,
      undefined,
      undefined,
      {
        describe: () => [{ type: "animals", label: "动物分布", description: "动物分布", version: 10, fields: [], scopes: { world: true, instances: [] } }],
        query: () => [],
        inspect: () => ({}),
        apply: async () => ({})
      },
      undefined,
      {
        catalog: () => ({ summary: { scope: "all-matches", unit: "model-type", total: 0, speciesCount: 0, appearanceCount: 0, returned: 0, hasMore: false }, entries: [], matchedCount: 0, offset: 0 }),
        spawn: async () => ({ requestId: "1", status: "rejected" as const }),
        query: () => ({ enabled: true, animals: [], matchedCount: 0, offset: 0 }),
        describe: () => ({ id: "a", available: false, skills: [], targets: [] }),
        command: async () => ({ id: "a", requestId: "1", status: "rejected" as const }),
        receipt: () => ({ id: "a", requestId: "1", status: "not_found" as const })
      }
    );
    application.connectProject(project);

    function waterAgentKnowledge() {
      return createSeedWorldWaterAgentKnowledge(
        WATER_QUERY_CONTRACTS.map(item => item.name),
        { includeDigRiver: true }
      );
    }

    const retrievalExtension = createRetrievalAgentExtension({
      searchAssets: async () => ({ matches: [], scanned: 0, matchedCount: 0, truncated: false, nextOffset: null, corpusHash: "a".repeat(64) }),
      readAssetDescriptions: async () => ({ matches: [], nextOffset: null, corpusHash: "a".repeat(64) }),
      readText: async () => ""
    });

    // Test whether exact SeedWorldDemo composition succeeds or throws!
    let seedWorldDemoCompositionError: string | null = null;
    let config;
    try {
      config = createSeedWorldChatAgentConfiguration({
        application,
        nativeEditor,
        editorExtensions: [
          createNativeWaterAgentPackage(
            { editor: nativeEditor, project, system: () => undefined, hostTerrain: true, oceanDatum: 0 },
            waterAgentKnowledge()
          ),
          createFarmingComponentExtension(nativeEditor.projection),
          retrievalExtension
        ]
      });
    } catch (err) {
      seedWorldDemoCompositionError = err instanceof Error ? err.message : String(err);
      // Fallback: inspect waterAgentKnowledge conflict by deduplicating shared common/ modules for the rest of the audit
      const baseTools = [...application ? [] : []];
      const waterPkg = createNativeWaterAgentPackage(
        { editor: nativeEditor, project, system: () => undefined, hostTerrain: true, oceanDatum: 0 },
        waterAgentKnowledge()
      );
      const baseCfg = createSeedWorldChatAgentConfiguration({
        application,
        nativeEditor,
        editorExtensions: [createFarmingComponentExtension(nativeEditor.projection), retrievalExtension]
      });
      const existingModIds = new Set(baseCfg.definition.scriptApi.modules.map(m => m.id));
      const dedupWaterPkg = {
        ...waterPkg,
        definition: {
          ...waterPkg.definition,
          scriptApi: {
            ...waterPkg.definition.scriptApi,
            modules: waterPkg.definition.scriptApi.modules.filter(m => !existingModIds.has(m.id))
          }
        }
      };
      config = composeAgentConfiguration(baseCfg, [dedupWaterPkg]);
    }

    const files = createAgentProjectFiles(config.definition.scriptApi, config.definition.projectFiles);
    const allPaths = files.list().sort();
    const systemPrompt = buildAgentSystemPrompt(config.definition);
    const tools = buildAgentToolDefinitions(config.definition);
    const messages = buildAgentMessages({
      systemPrompt,
      skills: config.definition.scriptApi.skills,
      hostNotes: config.definition.scriptApi.hostNotes,
      taskId: "audit-task",
      userInput: "建造一座房子",
      inputSource: "text",
      worldThumbnail: application.getWorldThumbnail()
    });

    const enc = new TextEncoder();
    const byteLen = (v: unknown) => enc.encode(typeof v === "string" ? v : JSON.stringify(v)).byteLength;

    const initialPayload = {
      systemPromptBytes: byteLen(systemPrompt),
      systemPromptChars: systemPrompt.length,
      messagesBreakdown: messages.map((m, idx) => ({
        index: idx,
        role: m.role,
        injectionType: readSystemInjection(typeof m.content === "string" ? m.content : "")?.type ?? null,
        bytes: byteLen(m.content),
        chars: typeof m.content === "string" ? m.content.length : 0
      })),
      toolsCount: tools.length,
      toolsTotalBytes: byteLen(tools),
      toolsBreakdown: tools.map(t => ({
        name: t.function.name,
        bytes: byteLen(t),
        descriptionBytes: byteLen(t.function.description)
      }))
    };

    const topSkills = (config.definition.scriptApi.skills ?? []).map(s => ({
      name: s.name,
      path: `skills/${s.name}/SKILL.md`,
      description: s.description,
      descriptionChars: s.description.length,
      bodyBytes: byteLen(s.content),
      bodyLines: s.content.split("\n").length
    }));

    const skillMarkdowns = allPaths.filter(p => p.startsWith("skills/") && p.endsWith(".md")).map(p => {
      const content = files.read(p);
      const links = [...content.matchAll(/\]\(<?([^)>\s]+)>?\)/g)].map(m => m[1].split("#")[0]).filter(t => t && !/^[a-z]+:/.test(t));
      return { path: p, bytes: byteLen(content), lines: content.split("\n").length, links };
    });

    // Compute hop depths from top-level skills AND hostNotes skill links (e.g. retrieval's search-cloud/SKILL.md)
    const hostNoteSkillLinks = [
      ...(config.definition.scriptApi.hostNotes ?? "").matchAll(/\]\(<?([^)>\s]+)>?\)/g)
    ]
      .map(m => m[1].split("#")[0])
      .filter(link => link.startsWith("skills/") && link.endsWith(".md"));
    const hopDepth: Record<string, number> = {};
    const queue: { p: string; d: number }[] = [
      ...topSkills.map(s => ({ p: s.path, d: 0 })),
      ...hostNoteSkillLinks.map(p => ({ p, d: 0 }))
    ];
    while (queue.length) {
      const { p, d } = queue.shift()!;
      if (hopDepth[p] !== undefined && hopDepth[p] <= d) continue;
      hopDepth[p] = d;
      const md = skillMarkdowns.find(m => m.path === p);
      if (md) {
        for (const link of md.links) {
          if (link.startsWith("skills/") && link.endsWith(".md")) queue.push({ p: link, d: d + 1 });
        }
      }
    }

    // Check cold read of every .d.ts under declare/editor/ and key declare/engine/ entry points
    const editorDtsPaths = allPaths.filter(p => p.startsWith("declare/editor/") && p.endsWith(".d.ts"));
    const engineDtsSamplePaths = allPaths.filter(p =>
      p.startsWith("declare/engine/") &&
      (p.endsWith("index.d.ts") || p.endsWith("Script.d.ts") || p.endsWith("Entity.d.ts") || p.endsWith("Transform.d.ts") || p.endsWith("Vector3.d.ts") || p.endsWith("European.d.ts") || p.endsWith("ProfileParameters.d.ts"))
    );

    const moduleById = new Map(config.definition.scriptApi.modules.map(m => [m.id, m]));
    const modulePathForId = (id: string) => `declare/editor/${id.replace(/^declare\//, "")}`;
    const moduleByPath = new Map(config.definition.scriptApi.modules.map(m => [modulePathForId(m.id), m]));

    const dtsAudits: any[] = [];
    for (const dtsPath of [...editorDtsPaths, ...engineDtsSamplePaths]) {
      // Fresh AgentNativeFiles per cold read!
      const fileTools = new AgentNativeFiles(
        () => files,
        () => config.definition,
        new Map(),
        () => "",
        60_000,
        () => new Set()
      );
      const outcome = await fileTools.execute("read", { file_path: dtsPath, offset: null, column: null, limit: null }, "audit", new AbortController().signal);
      const resValue = outcome.result.ok ? (outcome.result.value as any) : null;
      const inlinedDeps: string[] = resValue?.inlinedDependencies ?? [];
      const omittedDeps: string[] = resValue?.omittedDependencies ?? [];
      const content = files.read(dtsPath);
      const mod = moduleByPath.get(dtsPath);
      const declaredImports = (mod?.imports ?? []).map(id => modulePathForId(id));
      // Also inspect TS raw import statements for declare/engine/ or declare/editor/
      const rawImports = [...content.matchAll(/(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g)].map(m => m[1]);

      // Compute full transitive closure for scriptApi.modules
      const transitivePaths = new Set<string>();
      const bfs = [...declaredImports];
      while (bfs.length) {
        const cur = bfs.shift()!;
        if (transitivePaths.has(cur)) continue;
        transitivePaths.add(cur);
        const curMod = moduleByPath.get(cur);
        if (curMod) for (const nextId of curMod.imports) bfs.push(modulePathForId(nextId));
      }
      const skippedImports = [...transitivePaths].filter(p => !inlinedDeps.includes(p));

      // Also simulate strict: true default limit: 2000 behavior in batchClaimedDeclarations!
      // In agent-loop.ts:895: call.decision.input.limit == null -> false when LLM passes limit: 2000 explicitly!
      dtsAudits.push({
        path: dtsPath,
        bytes: byteLen(content),
        lines: content.split("\n").length,
        paginatedNext: resValue?.next ?? null,
        responseBytes: byteLen(outcome.content),
        rawImportCount: rawImports.length,
        declaredDirectImports: declaredImports,
        transitiveModuleDepsCount: transitivePaths.size,
        inlinedDeps,
        omittedDependencies: omittedDeps,
        skippedModuleDeps: skippedImports.map(p => ({
          path: p,
          bytes: files.kind(p) === "file" ? byteLen(files.read(p)) : -1
        }))
      });
    }

    // Audit water SKILL.md index discrepancy
    const waterSkillContent = files.kind("skills/water/SKILL.md") === "file" ? files.read("skills/water/SKILL.md") : null;
    const waterIndexMatch = waterSkillContent?.match(/## 接口索引\n\n([\s\S]*)$/)?.[1] ?? "";

    // Audit stale terminology across skills & declare
    const staleTerms = ["APISearch", "AssetCatalog", "assets/", "/assets"];
    const staleHits: Record<string, string[]> = {};
    for (const p of [...allPaths.filter(x => x.startsWith("skills/") || x.startsWith("declare/editor/"))]) {
      const txt = files.read(p);
      for (const term of staleTerms) {
        if (term === "assets/" && !p.startsWith("declare/")) continue;
        if (txt.includes(term)) {
          (staleHits[term] ??= []).push(p);
        }
      }
    }

    // Check inline duplication in generated .d.ts (e.g. world.query.d.ts vs Selector.d.ts)
    const largestEditorDts = dtsAudits
      .filter(d => d.path.startsWith("declare/editor/"))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 15);

    const audit = {
      generatedAt: new Date().toISOString(),
      seedWorldDemoCompositionError,
      counts: {
        totalVfsFiles: allPaths.length,
        topLevelSkills: topSkills.length,
        skillMarkdowns: skillMarkdowns.length,
        editorDeclarations: editorDtsPaths.length,
        engineDeclarations: allPaths.filter(p => p.startsWith("declare/engine/")).length
      },
      initialPayload,
      topSkills,
      skillMarkdowns: skillMarkdowns.map(m => ({ ...m, hopDepth: hopDepth[m.path] ?? -1 })),
      waterSkillAudit: {
        present: Boolean(waterSkillContent),
        mentionsDigRiverInProse: waterSkillContent?.includes("tools.water.digRiver") ?? false,
        mentionsDigRiverInApiIndex: waterIndexMatch.includes("tools.water.digRiver"),
        apiIndexText: waterIndexMatch
      },
      staleTermHits: staleHits,
      largestEditorDts,
      dtsWithSkippedDependencies: dtsAudits.filter(d => d.skippedModuleDeps.length > 0),
      dtsWithPagination: dtsAudits.filter(d => d.paginatedNext !== null),
      engineDtsAudits: dtsAudits.filter(d => d.path.startsWith("declare/engine/")),
      allEditorDtsSummary: dtsAudits.filter(d => d.path.startsWith("declare/editor/"))
    };

    const outPath = process.env.STATIC_AUDIT_OUT_PATH || OUT_PATH;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(audit, null, 2), "utf8");
    expect(fs.existsSync(outPath)).toBe(true);
    nativeEditor.dispose();
    project.dispose();
  }, 120_000);
});
