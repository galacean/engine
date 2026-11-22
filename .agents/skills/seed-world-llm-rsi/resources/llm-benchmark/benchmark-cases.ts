import type { HeadlessSeedWorldFixture, TurnExecutionRecord } from "./seed-world-headless-fixture.ts";
import { SEED_WORLD_MODEL } from "../../../demos/seed-world/assistant/SeedWorldModel.ts";
import { EXTENDED_V4_CASES } from "./benchmark-cases-v4.ts";

export interface CaseCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ReadCallTelemetry {
  turnIndex: number;
  step: number;
  filePath: string;
  offset: number | null;
  limit: number | null;
  responseBytes: number;
  hasNext: boolean;
  inlinedDepPaths: string[];
  explicitLimitPassed: boolean;
}

export interface CaseMetrics {
  caseId: string;
  name: string;
  category: string;
  taskCompleted: boolean;
  checks: CaseCheck[];
  failureReasons: string[];
  modelsSeen: string[];
  modelVerified: boolean;
  totalDurationMs: number;
  llmTurns: number;
  totalToolCalls: number;
  outerToolCallsByName: Record<string, number>;
  innerScriptToolCalls: string[];
  optimalSteps: number;
  overheadRatio: number;
  skillRouting: {
    readSkills: string[];
    expectedSkills: string[];
    expectedSkillsHit: string[];
    firstSkillRead: string | null;
    firstSkillHit: boolean;
    extraOrWrongSkills: string[];
  };
  declareCompliance: {
    readDeclares: string[];
    expectedDeclares: string[];
    expectedDeclaresHit: string[];
    totalReadCalls: number;
    duplicateReadPaths: string[];
    duplicateInlinedReads: string[];
    explicitLimitOnDeclareReads: string[];
    paginatedDeclareReads: string[];
    totalReadBytes: number;
  };
  scriptQuality: {
    executeCount: number;
    firstPassSuccess: boolean;
    typecheckRepairCount: number;
    runtimeErrorCount: number;
    parseErrorCount: number;
    totalScriptToolCalls: number;
  };
  usageSummary: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
  };
  compliance: {
    replyHygieneViolations: string[];
    scopeViolations: string[];
    parallelReadRatio: number;
  };
  detourFlags: string[];
}

export interface BenchmarkCaseDefinition {
  id: string;
  name: string;
  category: string;
  turns: readonly string[];
  turnInputSources?: readonly ("text" | "voice")[];
  expectedSkills: readonly string[];
  expectedDeclares: readonly string[];
  optimalSteps: number;
  setup?(fixture: HeadlessSeedWorldFixture): Promise<void>;
  verify(fixture: HeadlessSeedWorldFixture, turns: readonly TurnExecutionRecord[]): Promise<CaseCheck[]> | CaseCheck[];
}

export function getAllProjectSceneData(fixture: HeadlessSeedWorldFixture): {
  sceneJson: any;
  prefabs: Record<string, any>;
  materials: Record<string, any>;
  scripts: Record<string, string>;
  documents: Record<string, string>;
  files: readonly { virtualPath: string; type: string }[];
} {
  const pkg = fixture.project.projectPackage;
  const sceneText = pkg.contents[pkg.project.scene] as string | undefined;
  const sceneJson = sceneText ? JSON.parse(sceneText) : { entities: [], components: [] };
  const prefabs: Record<string, any> = {};
  const materials: Record<string, any> = {};
  const scripts: Record<string, string> = {};
  for (const file of pkg.project.files) {
    const content = pkg.contents[file.virtualPath];
    if (typeof content !== "string") continue;
    if (file.type === "Prefab") {
      try {
        prefabs[file.virtualPath] = JSON.parse(content);
      } catch {
        // ignore unparseable
      }
    } else if (file.type === "Material") {
      try {
        materials[file.virtualPath] = JSON.parse(content);
      } catch {
        // ignore
      }
    } else if (file.type === "script") {
      scripts[file.virtualPath] = content;
    }
  }
  return {
    sceneJson,
    prefabs,
    materials,
    scripts,
    documents: pkg.documents ?? {},
    files: pkg.project.files
  };
}

export function combinedFinalText(turns: readonly TurnExecutionRecord[]): string {
  return turns
    .map((t) => {
      const outcome = t.taskResult?.result;
      return outcome?.status === "completed" ? outcome.message : t.error ?? "";
    })
    .join("\n");
}

export function allCalledTools(turns: readonly TurnExecutionRecord[]): Set<string> {
  const names = new Set<string>();
  for (const turn of turns) {
    for (const call of turn.toolCalls) names.add(call.toolName);
    for (const s of turn.scripts) {
      if (Array.isArray(s.toolTrace)) {
        for (const item of s.toolTrace as Array<{ tool?: string }>) {
          if (item?.tool) names.add(item.tool);
        }
      }
    }
  }
  return names;
}

export function hasTool(called: ReadonlySet<string>, name: string): boolean {
  const bare = name.replace(/^(?:tools|editor)\./, "");
  return called.has(name) || called.has(bare) || called.has(`tools.${bare}`) || called.has(`editor.${bare}`);
}

export function entityName(entity: any): string {
  if (typeof entity?.name === "string" && entity.name) return entity.name;
  const overrides = entity?.instance?.overrides?.entityProps;
  if (Array.isArray(overrides)) {
    const named = overrides.find((p: any) => typeof p?.name === "string" && p.name);
    if (named) return named.name;
  }
  return "";
}

export function entityPos(entity: any): [number, number, number] | undefined {
  if (Array.isArray(entity?.position) && entity.position.length >= 3) {
    return [Number(entity.position[0]) || 0, Number(entity.position[1]) || 0, Number(entity.position[2]) || 0];
  }
  const overrides = entity?.instance?.overrides?.entityProps;
  if (Array.isArray(overrides)) {
    const overriddenPos = overrides.find((p: any) => Array.isArray(p?.position) && p.position.length >= 3);
    if (overriddenPos) {
      return [
        Number(overriddenPos.position[0]) || 0,
        Number(overriddenPos.position[1]) || 0,
        Number(overriddenPos.position[2]) || 0
      ];
    }
  }
  const p = entity?.transform?.position;
  if (p && typeof p === "object") {
    return [Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0];
  }
  return undefined;
}

export function entityAssetRef(entity: any): string | undefined {
  return entity?.instance?.asset?.$ref ?? entity?.prefab?.assetId;
}

export const INITIAL_ENTITY_IDS = new Set(["building-host", "farm-owner", "lake-root", "lantern-root"]);

export function isUserBuildingPrefab(virtualPath: string): boolean {
  return !virtualPath.startsWith("Building/Presets/") && !virtualPath.startsWith("Building/Units/");
}

export function extractCaseTelemetry(
  def: BenchmarkCaseDefinition,
  turns: readonly TurnExecutionRecord[],
  checks: readonly CaseCheck[]
): CaseMetrics {
  const expectedModel = process.env.BENCH_EXPECTED_MODEL?.trim() || "DeepSeek-V4.1-Flash";
  const modelsSeen = [...new Set(turns.flatMap((t) => t.modelsSeen))];
  const modelVerified =
    modelsSeen.length > 0 &&
    (expectedModel === "*" || modelsSeen.every((m) => m === expectedModel || m === SEED_WORLD_MODEL));
  const outerCounts: Record<string, number> = {};
  const readCalls: ReadCallTelemetry[] = [];
  const innerScriptToolCalls: string[] = [];

  // Map toolCallId -> tool response content string from transcript_appended
  const toolContentById = new Map<string, string>();
  for (const turn of turns) {
    for (const ev of turn.events) {
      if (ev.type === "transcript_appended") {
        for (const msg of ev.messages) {
          if (msg.role === "tool" && typeof msg.toolCallId === "string" && typeof msg.content === "string") {
            toolContentById.set(msg.toolCallId, msg.content);
          }
        }
      }
    }
  }

  for (const turn of turns) {
    for (const ev of turn.events) {
      if (ev.type !== "model_finished") continue;
      const decision = ev.step.decision;
      const toolCallId = ev.step.toolCallId;
      let outerName: string = decision.type;
      if (decision.type === "file") outerName = decision.name;
      else if (decision.type === "native_read") outerName = decision.name;
      else if (decision.type === "read_tool") outerName = "read";
      else if (decision.type === "list_tool") outerName = "glob";
      else if (decision.type === "search_tool") outerName = "grep";
      if (outerName !== "final") {
        outerCounts[outerName] = (outerCounts[outerName] ?? 0) + 1;
      }

      if (decision.type === "file" && decision.name === "read") {
        const input = decision.input as { file_path?: string; offset?: number | null; limit?: number | null };
        const filePath = String(input.file_path ?? "");
        const contentStr = toolCallId ? toolContentById.get(toolCallId) ?? "" : "";
        let parsed: Record<string, unknown> | undefined;
        try {
          parsed = JSON.parse(contentStr);
        } catch {
          // ignore
        }
        const rawText = typeof parsed?.content === "string" ? parsed.content : contentStr;
        const inlinedDepPaths: string[] = [];
        const depRegex = /<dependency path="([^"]+)">/g;
        let match: RegExpExecArray | null;
        while ((match = depRegex.exec(rawText)) !== null) {
          const depPath = match[1];
          if (depPath && depPath !== filePath && !inlinedDepPaths.includes(depPath)) {
            inlinedDepPaths.push(depPath);
          }
        }
        const rawFallbackRegex = /<dependency path=\\"([^\\"]+)\\">/g;
        while ((match = rawFallbackRegex.exec(contentStr)) !== null) {
          const depPath = match[1];
          if (depPath && depPath !== filePath && !inlinedDepPaths.includes(depPath)) {
            inlinedDepPaths.push(depPath);
          }
        }
        readCalls.push({
          turnIndex: turn.turnIndex,
          step: ev.step.step,
          filePath,
          offset: input.offset ?? null,
          limit: input.limit ?? null,
          responseBytes: Buffer.byteLength(contentStr, "utf8"),
          hasNext: Boolean(parsed?.next),
          inlinedDepPaths,
          explicitLimitPassed: filePath.startsWith("declare/") && input.limit !== null && input.limit !== undefined
        });
      }
    }

    for (const sc of turn.scripts) {
      if (Array.isArray(sc.toolTrace)) {
        for (const call of sc.toolTrace as Array<{ tool?: string }>) {
          if (call?.tool) innerScriptToolCalls.push(call.tool);
        }
      }
    }
  }

  const readSkills: string[] = [];
  const readDeclares: string[] = [];
  const fullReadDeclares = new Set<string>();
  const inlinedAlready = new Set<string>();
  const duplicateReadPaths: string[] = [];
  const duplicateInlinedReads: string[] = [];
  const explicitLimitOnDeclareReads: string[] = [];
  const paginatedDeclareReads: string[] = [];
  const seenReads = new Set<string>();

  for (const rc of readCalls) {
    if (rc.filePath.startsWith("skills/") && !readSkills.includes(rc.filePath)) {
      readSkills.push(rc.filePath);
    }
    if (rc.filePath.startsWith("declare/")) {
      if (!readDeclares.includes(rc.filePath)) readDeclares.push(rc.filePath);
      if (inlinedAlready.has(rc.filePath) && (rc.offset === null || rc.offset === 1)) {
        duplicateInlinedReads.push(rc.filePath);
      }
      if (rc.explicitLimitPassed) explicitLimitOnDeclareReads.push(rc.filePath);
      if (rc.hasNext) paginatedDeclareReads.push(rc.filePath);
    }
    const readSig = `${rc.filePath}@${rc.offset ?? "start"}:${rc.limit ?? "default"}`;
    if (seenReads.has(readSig) || (rc.offset === null && fullReadDeclares.has(rc.filePath))) {
      duplicateReadPaths.push(rc.filePath);
    }
    seenReads.add(readSig);
    if (rc.filePath.startsWith("declare/") && !rc.hasNext && (rc.offset === null || rc.offset === 1)) {
      fullReadDeclares.add(rc.filePath);
    }
    for (const dep of rc.inlinedDepPaths) inlinedAlready.add(dep);
  }

  const expectedSkills = [...def.expectedSkills];
  const expectedSkillsHit = expectedSkills.filter((s) =>
    readSkills.some((r) => r === s || r.startsWith(s.replace(/SKILL\.md$/, "")))
  );
  const firstSkillRead = readSkills[0] ?? null;
  const firstSkillHit =
    expectedSkills.length === 0 ||
    (firstSkillRead !== null && expectedSkills.some((s) => firstSkillRead === s || firstSkillRead.startsWith(s.replace(/SKILL\.md$/, ""))));
  const extraOrWrongSkills = readSkills.filter(
    (r) => !expectedSkills.some((s) => r === s || r.startsWith(s.replace(/SKILL\.md$/, "")))
  );

  const expectedDeclares = [...def.expectedDeclares];
  const expectedDeclaresHit = expectedDeclares.filter((d) => readDeclares.includes(d));

  const allScripts = turns.flatMap((t) => t.scripts);
  const executeCount = allScripts.length;
  const typecheckRepairCount = allScripts.filter(
    (s) => s.result && !s.result.ok && s.result.error.phase === "check"
  ).length;
  const parseErrorCount = allScripts.filter(
    (s) => s.result && !s.result.ok && s.result.error.phase === "parse"
  ).length;
  const runtimeErrorCount = allScripts.filter(
    (s) => s.result && !s.result.ok && s.result.error.phase !== "check" && s.result.error.phase !== "parse"
  ).length;
  const firstPassSuccess = executeCount === 0 || Boolean(allScripts[0]?.result?.ok);

  const llmTurns = turns.reduce((n, t) => n + t.modelRequests.length, 0);
  const totalToolCalls = Object.values(outerCounts).reduce((a, b) => a + b, 0);
  const overheadRatio = def.optimalSteps > 0 ? Number((llmTurns / def.optimalSteps).toFixed(2)) : llmTurns;

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let cachedTokens = 0;
  for (const turn of turns) {
    for (const req of turn.modelRequests) {
      const usage = (req.telemetry as { usage?: Record<string, unknown> } | undefined)?.usage ?? {};
      if (typeof usage.inputTokens === "number") promptTokens += usage.inputTokens;
      else if (typeof usage.promptTokens === "number") promptTokens += usage.promptTokens;
      if (typeof usage.outputTokens === "number") completionTokens += usage.outputTokens;
      else if (typeof usage.completionTokens === "number") completionTokens += usage.completionTokens;
      if (typeof usage.totalTokens === "number") totalTokens += usage.totalTokens;
      if (typeof usage.cachedTokens === "number") cachedTokens += usage.cachedTokens;
    }
  }
  if (totalTokens === 0) totalTokens = promptTokens + completionTokens;

  const replyHygieneViolations: string[] = [];
  const hygieneRules: readonly [string, RegExp][] = [
    ["leaked_internal_api", /\b(?:tools\.[a-z]+\.[a-zA-Z]+|editor\.[a-z]+\.[a-zA-Z]+)\b/],
    ["leaked_vfs_path", /\b(?:skills\/[a-z0-9/_-]+\.md|declare\/[a-z0-9/@._-]+\.d\.ts)\b/i],
    ["leaked_uuid", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ["leaked_stack_or_tx", /\b(?:committedAt|authoringStateHash|runtimeErrors|TypeError:|ReferenceError:|at\s+\w+\s+\()/]
  ];
  for (const t of turns) {
    const finalMsg = t.taskResult?.result.message ?? "";
    if (!finalMsg) continue;
    for (const [label, re] of hygieneRules) {
      const m = re.exec(finalMsg);
      if (m) replyHygieneViolations.push(`turn_${t.turnIndex}_${label}:${m[0]}`);
    }
  }

  const scopeViolations = checks
    .filter((c) => c.name.startsWith("scope_") && !c.pass)
    .map((c) => `${c.name}: ${c.detail}`);

  let totalAssistantReads = 0;
  let parallelAssistantReads = 0;
  for (const turn of turns) {
    for (const ev of turn.events) {
      if (ev.type !== "transcript_appended") continue;
      for (const msg of ev.messages) {
        if (msg.role === "assistant" && Array.isArray(msg.toolCalls)) {
          const batchReads = msg.toolCalls.filter((tc: { name?: string }) => tc.name === "read").length;
          if (batchReads > 0) {
            totalAssistantReads += batchReads;
            if (batchReads >= 2) parallelAssistantReads += batchReads;
          }
        }
      }
    }
  }
  const parallelReadRatio = totalAssistantReads > 0 ? Number((parallelAssistantReads / totalAssistantReads).toFixed(2)) : 1;

  const detourFlags: string[] = [];
  if (!firstSkillHit && expectedSkills.length > 0) detourFlags.push("wrong_skill_first");
  if ((outerCounts.grep ?? 0) > 0 || (outerCounts.glob ?? 0) > 0) detourFlags.push("grep_or_glob_fallback");
  if (duplicateReadPaths.length > 0) detourFlags.push("duplicate_read");
  if (duplicateInlinedReads.length > 0) detourFlags.push("duplicate_inlined_read");
  if (explicitLimitOnDeclareReads.length > 0) detourFlags.push("explicit_limit_broke_batch_dedup");
  if (paginatedDeclareReads.length > 0) detourFlags.push("declare_pagination_truncated");
  if (typecheckRepairCount > 0 || parseErrorCount > 0) detourFlags.push("script_check_repair");
  if (runtimeErrorCount > 0) detourFlags.push("script_runtime_error");
  if (replyHygieneViolations.length > 0) detourFlags.push("reply_hygiene_violation");
  if (scopeViolations.length > 0) detourFlags.push("scope_violation");
  if (llmTurns > def.optimalSteps * 1.6) detourFlags.push("exceeded_optimal_steps");

  const failureReasons = checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`);
  for (const t of turns) {
    if (t.error) failureReasons.push(`turn_${t.turnIndex}_error: ${t.error}`);
    else if (t.taskResult && t.taskResult.result.status !== "completed") {
      failureReasons.push(`turn_${t.turnIndex}_${t.taskResult.result.status}: ${t.taskResult.result.message}`);
    }
  }
  const taskCompleted = checks.every((c) => c.pass) && turns.every((t) => !t.error && t.taskResult?.result.status === "completed");

  return {
    caseId: def.id,
    name: def.name,
    category: def.category,
    taskCompleted,
    checks: [...checks],
    failureReasons,
    modelsSeen,
    modelVerified,
    totalDurationMs: Number(turns.reduce((sum, t) => sum + t.durationMs, 0).toFixed(1)),
    llmTurns,
    totalToolCalls,
    outerToolCallsByName: outerCounts,
    innerScriptToolCalls,
    optimalSteps: def.optimalSteps,
    overheadRatio,
    skillRouting: {
      readSkills,
      expectedSkills,
      expectedSkillsHit,
      firstSkillRead,
      firstSkillHit,
      extraOrWrongSkills
    },
    declareCompliance: {
      readDeclares,
      expectedDeclares,
      expectedDeclaresHit,
      totalReadCalls: readCalls.length,
      duplicateReadPaths,
      duplicateInlinedReads,
      explicitLimitOnDeclareReads,
      paginatedDeclareReads,
      totalReadBytes: readCalls.reduce((s, r) => s + r.responseBytes, 0)
    },
    scriptQuality: {
      executeCount,
      firstPassSuccess,
      typecheckRepairCount,
      runtimeErrorCount,
      parseErrorCount,
      totalScriptToolCalls: innerScriptToolCalls.length
    },
    usageSummary: { promptTokens, completionTokens, totalTokens, cachedTokens },
    compliance: {
      replyHygieneViolations,
      scopeViolations,
      parallelReadRatio
    },
    detourFlags
  };
}

const CORE_AND_V3_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "01_direct_time_query",
    name: "直接查询当前时间、天气与季节（零修改）",
    category: "environment-read",
    turns: ["现在是几点，什么天气、什么季节？"],
    expectedSkills: [],
    expectedDeclares: [],
    optimalSteps: 1,
    verify(fixture, turns) {
      const text = combinedFinalText(turns);
      const muts = fixture.state.getEnvironmentMutations();
      const mentionsTime = /10[:：.]30|10\.5|十点半|上午\s*10/.test(text);
      const mentionsSeason = /春|spring/i.test(text);
      const mentionsWeather = /晴|无降|没有下雨|无雨|clear|none|良好/i.test(text);
      return [
        { name: "accurate_time", pass: mentionsTime, detail: `final=${text.slice(0, 120)}` },
        { name: "accurate_season", pass: mentionsSeason, detail: `season=spring in reply` },
        { name: "accurate_weather", pass: mentionsWeather, detail: `weather clear in reply` },
        { name: "no_unnecessary_mutation", pass: muts.length === 0, detail: `envMutations=${muts.length}` }
      ];
    }
  },
  {
    id: "02_environment_sunset_rain",
    name: "修改时间、季节与下雪天气",
    category: "environment-write",
    turns: ["把时间调到傍晚 18 点半，季节改成冬天，天气改成下雪。"],
    expectedSkills: ["skills/environment/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.update.d.ts", "declare/editor/world/tools/atmosphere.update.d.ts"],
    optimalSteps: 4,
    verify(fixture) {
      const s = fixture.state.getLiveState();
      return [
        { name: "time_18_5", pass: Math.abs(s.lighting.timeHours - 18.5) < 0.05, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "season_winter", pass: s.environment.season === "winter", detail: `season=${s.environment.season}` },
        {
          name: "weather_snow",
          pass: s.environment.precipitation === "snow" || s.environment.snowIntensity > 0,
          detail: `precipitation=${s.environment.precipitation}, snowIntensity=${s.environment.snowIntensity}`
        }
      ];
    }
  },
  {
    id: "03_building_simple_house",
    name: "在玩家前方平地建造两层红砖斜顶带门窗木屋",
    category: "building-single",
    turns: ["在玩家前方 18 米的平地上建造一座两层的红砖木屋，带斜屋顶、门口和窗户。"],
    expectedSkills: ["skills/building/SKILL.md", "skills/building/references/planning.md"],
    expectedDeclares: ["declare/editor/world/tools/building.generate.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const buildingPrefabs = Object.entries(prefabs).filter(
        ([vp, json]) =>
          isUserBuildingPrefab(vp) &&
          Array.isArray(json.components) &&
          json.components.some((c: { type?: string }) => c.type === "BuildingGroupComponent" || c.type === "BuildingPartComponent")
      );
      const userEntities = (Array.isArray(sceneJson.entities) ? sceneJson.entities : []).filter(
        (e: { id?: string }) => !e.id || !INITIAL_ENTITY_IDS.has(e.id)
      );
      const sceneHasBuildingRefs =
        userEntities.some((e: any) => {
          const ref = entityAssetRef(e);
          return (
            (typeof ref === "string" && buildingPrefabs.some(([vp]) => vp === ref)) ||
            /house|building|木屋|砖|房/i.test(entityName(e))
          );
        }) ||
        (Array.isArray(sceneJson.components) &&
          sceneJson.components.some((c: { type?: string }) => c.type === "BuildingGroupComponent" || c.type === "BuildingPartComponent"));
      const buildingParts = buildingPrefabs.flatMap(([, json]) =>
        (json.components ?? []).filter((c: { type?: string }) => c.type === "BuildingPartComponent")
      );
      const partText = JSON.stringify(buildingParts) + JSON.stringify(sceneJson.components ?? []);
      const hasOpenings = /door|window|opening|cottage/i.test(partText);
      return [
        { name: "called_building_generate", pass: hasTool(called, "tools.building.generate"), detail: `called=${[...called].join(",")}` },
        { name: "building_prefab_or_scene", pass: buildingPrefabs.length > 0 || sceneHasBuildingRefs, detail: `userPrefabs=${buildingPrefabs.length}` },
        { name: "instantiated_in_scene", pass: sceneHasBuildingRefs, detail: `userEntities=${userEntities.length}` },
        { name: "has_door_or_window", pass: hasOpenings || buildingParts.length >= 2, detail: `parts=${buildingParts.length}` }
      ];
    }
  },
  {
    id: "04_building_compound_courtyard",
    name: "在指定坐标建造围墙大门小院与带烟囱圆塔石屋",
    category: "building-compound",
    turns: ["在坐标 (25, 0, 20) 建一个带围墙和入口大门的小院子，院子里有一栋带烟囱和圆塔的石屋。"],
    expectedSkills: ["skills/building/SKILL.md", "skills/building/references/planning.md"],
    expectedDeclares: ["declare/editor/world/tools/building.generate.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const buildingPrefabs = Object.entries(prefabs).filter(
        ([vp, json]) =>
          isUserBuildingPrefab(vp) &&
          Array.isArray(json.components) &&
          json.components.some((c: { type?: string }) => c.type === "BuildingGroupComponent" || c.type === "BuildingPartComponent")
      );
      const userEntities = (Array.isArray(sceneJson.entities) ? sceneJson.entities : []).filter(
        (e: { id?: string }) => !e.id || !INITIAL_ENTITY_IDS.has(e.id)
      );
      const allText = JSON.stringify(buildingPrefabs) + JSON.stringify(userEntities) + JSON.stringify(sceneJson.components ?? []);
      const hasWallOrFence = /wall|fence|gate|entrance/i.test(allText);
      const hasTowerOrChimney = /tower|chimney|round/i.test(allText);
      const placedNearTarget = userEntities.some((e: any) => {
        const p = entityPos(e);
        return p && Math.hypot(p[0] - 25, p[2] - 20) <= 15;
      });
      return [
        { name: "called_building_generate", pass: hasTool(called, "tools.building.generate"), detail: `called=${[...called].join(",")}` },
        { name: "compound_has_wall_or_gate", pass: hasWallOrFence, detail: `hasWallOrFence=${hasWallOrFence}` },
        { name: "compound_has_tower_or_chimney", pass: hasTowerOrChimney, detail: `hasTowerOrChimney=${hasTowerOrChimney}` },
        { name: "placed_near_target", pass: placedNearTarget, detail: `entities near (25,20)=${placedNearTarget}` }
      ];
    }
  },
  {
    id: "05_water_dig_river",
    name: "在玩家前方挖河并验证河道状态（检验 digRiver API_INDEX 缺失路由）",
    category: "water-river",
    turns: ["在玩家前方挖一条宽 8 米、长 40 米、稍微弯曲的小河，并验证河道生成状态。"],
    expectedSkills: ["skills/water/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/water.digRiver.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const rivers = fixture.state.getRiversCreated();
      const called = allCalledTools(turns);
      const firstRiver = rivers[0] as { parameters?: { points?: Array<{ width?: number }> } } | undefined;
      return [
        { name: "called_digRiver", pass: hasTool(called, "tools.water.digRiver"), detail: `called=${[...called].join(",")}` },
        { name: "river_created", pass: rivers.length > 0, detail: `riversCount=${rivers.length}` },
        {
          name: "river_verified",
          pass: hasTool(called, "tools.water.verify") || hasTool(called, "tools.water.diagnostics") || hasTool(called, "tools.water.sample"),
          detail: `verifyCalled=${hasTool(called, "tools.water.verify") || hasTool(called, "tools.water.diagnostics")}`
        },
        {
          name: "width_approx_8",
          pass: !firstRiver || (firstRiver.parameters?.points?.[0]?.width ?? 8) >= 6,
          detail: `width=${firstRiver?.parameters?.points?.[0]?.width}`
        }
      ];
    }
  },
  {
    id: "06_water_edit_lake_material",
    name: "编辑场景原生湖泊水面材质颜色与波浪参数",
    category: "water-native",
    turns: ["把场景里现有的湖泊水面颜色调得更清澈偏青绿一点，并增大一点波浪起伏。"],
    expectedSkills: ["skills/water/SKILL.md", "skills/components/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { materials } = getAllProjectSceneData(fixture);
      const lakeMat = materials["Water/Materials/lake.mat"];
      const called = allCalledTools(turns);
      const text = JSON.stringify(lakeMat ?? {});
      const colorOrWaveChanged = hasTool(called, "editor.asset.update") || hasTool(called, "editor.component.update");
      return [
        { name: "called_native_update", pass: colorOrWaveChanged, detail: `called=${[...called].join(",")}` },
        { name: "lake_mat_present", pass: Boolean(lakeMat), detail: `matKeys=${Object.keys(materials).join(",")}` },
        { name: "lake_mat_modified", pass: text.length > 0 && colorOrWaveChanged, detail: `updated=${colorOrWaveChanged}` }
      ];
    }
  },
  {
    id: "07_terrain_hill_sculpt",
    name: "在指定坐标创建半径 18 米、高 8 米缓坡小山丘",
    category: "terrain",
    turns: ["在坐标 (-20, 0, 30) 附近隆起一座半径 18 米、高约 8 米的缓坡小山丘。"],
    expectedSkills: ["skills/terrain/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/terrain.create.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const resources = fixture.state.getResources().filter((r) => r.resourceType === "terrain-patch" || r.resourceType === "terrain-feature");
      const called = allCalledTools(turns);
      const matching = resources.some((r) => {
        const p = r.properties as Record<string, any>;
        const x = p.x ?? p.target?.anchor?.x ?? -20;
        const z = p.z ?? p.target?.anchor?.z ?? 30;
        return Math.hypot(x + 20, z - 30) <= 15;
      });
      return [
        {
          name: "terrain_tool_called",
          pass: hasTool(called, "tools.terrain.create") || hasTool(called, "tools.terrain.patch") || hasTool(called, "tools.terrain.update"),
          detail: `called=${[...called].join(",")}`
        },
        { name: "terrain_resource_created", pass: resources.length > 0 && matching, detail: `count=${resources.length}` }
      ];
    }
  },
  {
    id: "08_vegetation_forest_cluster",
    name: "在指定区域种植 10 棵松树与灌木林",
    category: "vegetation",
    turns: ["在坐标 (10, 0, -15) 半径 12 米范围内种一片由 10 棵松树和灌木组成的小树林。"],
    expectedSkills: ["skills/vegetation/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/vegetation.create.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const brushes = fixture.state.getResources().filter((r) => r.resourceType === "vegetation-brush");
      const called = allCalledTools(turns);
      return [
        {
          name: "vegetation_create_or_update_called",
          pass: hasTool(called, "tools.vegetation.create") || hasTool(called, "tools.vegetation.update"),
          detail: `called=${[...called].join(",")}`
        },
        { name: "vegetation_brush_created", pass: brushes.length > 0, detail: `brushes=${brushes.length}` }
      ];
    }
  },
  {
    id: "09_world_objects_query_delete",
    name: "查询世界树木并给最近树木打标 target 后删除并确认",
    category: "world-objects",
    turns: ["先查出世界里现有的树木或地貌对象，把离玩家最近的一棵树打上 'target' 标签，然后再删除它并确认已删除。"],
    expectedSkills: ["skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.query.d.ts",
      "declare/editor/world/tools/world.tag.update.d.ts",
      "declare/editor/world/tools/world.delete.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const removed = fixture.state.getRemovedIds();
      const called = allCalledTools(turns);
      return [
        { name: "called_query_and_tag", pass: hasTool(called, "tools.world.query") && hasTool(called, "tools.world.tag.update"), detail: `called=${[...called].join(",")}` },
        { name: "called_delete", pass: hasTool(called, "tools.world.delete"), detail: `removed=${removed.join(",")}` },
        { name: "deleted_nearest_tree", pass: removed.includes("tree-pine-near"), detail: `nearest=tree-pine-near, removed=${removed.join(",")}` }
      ];
    }
  },
  {
    id: "10_world_parameters_animals_distance",
    name: "将动物系统激活距离 activationDistance 调整为 320 米",
    category: "world-parameters",
    turns: ["把动物系统的激活距离（activationDistance）调整到 320 米。"],
    expectedSkills: ["skills/world-objects/parameters/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.parameters.describe.d.ts",
      "declare/editor/world/tools/world.parameters.apply.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const paramState = fixture.state.getParameterState();
      const called = allCalledTools(turns);
      return [
        { name: "called_parameters_apply", pass: hasTool(called, "tools.world.parameters.apply"), detail: `called=${[...called].join(",")}` },
        { name: "activation_distance_320", pass: paramState.activationDistance === 320, detail: `activationDistance=${paramState.activationDistance}` }
      ];
    }
  },
  {
    id: "11_spatial_search_and_teleport",
    name: "在周围 100 米搜索开阔平坦高地并传送玩家",
    category: "spatial",
    turns: ["在当前玩家周围 100 米内找一块开阔平坦的高地，然后把玩家传送到那里看风景。"],
    expectedSkills: ["skills/spatial/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/spatial.search.d.ts",
      "declare/editor/world/tools/spatial.teleport.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const live = fixture.state.getLiveState();
      const teleports = fixture.state.getTeleports();
      const called = allCalledTools(turns);
      const nearPlateau = Math.hypot(live.camera.position[0] - 30, live.camera.position[2] + 35) <= 20;
      return [
        { name: "called_spatial_search", pass: hasTool(called, "tools.spatial.search") || hasTool(called, "tools.spatial.features"), detail: `called=${[...called].join(",")}` },
        { name: "called_teleport", pass: hasTool(called, "tools.spatial.teleport") && teleports.length > 0, detail: `teleports=${teleports.length}` },
        { name: "teleported_to_plateau", pass: nearPlateau || live.camera.position[1] >= 10, detail: `cameraPos=${JSON.stringify(live.camera.position)}` }
      ];
    }
  },
  {
    id: "12_animals_catalog_and_spawn",
    name: "查询小狗目录、生成 2 只棕色小狗并下达漫步指令",
    category: "animals",
    turns: ["先查一下动物目录里有没有小狗，有的话在玩家前方 10 米处生成 2 只棕色小狗，并让它们在附近自由活动。"],
    expectedSkills: ["skills/animals/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.animals.catalog.d.ts",
      "declare/editor/world/tools/world.animals.spawn.d.ts",
      "declare/editor/world/tools/world.animals.command.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const spawns = fixture.state.getAnimalSpawns();
      const cmds = fixture.state.getAnimalCommands();
      const called = allCalledTools(turns);
      return [
        { name: "called_animals_catalog", pass: hasTool(called, "tools.world.animals.catalog"), detail: `called=${[...called].join(",")}` },
        { name: "spawned_two_dogs", pass: spawns.length >= 2, detail: `spawns=${spawns.length}` },
        { name: "commanded_dogs_roam", pass: cmds.length >= 1, detail: `commands=${cmds.length}` }
      ];
    }
  },
  {
    id: "13_farming_inspect_and_irrigate",
    name: "检查农场目标地块与可用动作并完成浇水验证",
    category: "farming",
    turns: ["检查场景里的农场当前地块状态和可执行操作，把目标地块浇水并验证结果。"],
    expectedSkills: ["skills/farming/SKILL.md"],
    expectedDeclares: ["declare/editor/farming/FarmingSystem.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const scriptPayload = turns
        .flatMap((t) => t.scripts)
        .map((s) => `${s.code}\n${JSON.stringify(s.toolTrace ?? [])}`)
        .join("\n");
      const irrigateCalled = [...called].some((name) => name.includes("irrigate")) || /\birrigate\b/.test(scriptPayload);
      const verifyOrFieldCalled =
        [...called].some((name) => name.includes("verify") || name.includes("getFieldValues")) ||
        /\b(?:verify|getFieldValues|inspectFields)\b/.test(scriptPayload);
      const state = fixture.farmingArea.coordinator?.snapshot?.() ?? null;
      const serialized = JSON.stringify(state ?? {});
      const moistureIncreased = irrigateCalled && (verifyOrFieldCalled || /80|75|90|100/.test(serialized));
      return [
        { name: "called_farming_irrigate", pass: irrigateCalled, detail: `called=${[...called].join(",")}` },
        { name: "called_farming_verify", pass: verifyOrFieldCalled, detail: `verifyOrFieldCalled=${verifyOrFieldCalled}` },
        { name: "irrigation_succeeded", pass: moistureIncreased, detail: `snapshot=${serialized.slice(0, 180)}` }
      ];
    }
  },
  {
    id: "14_scene_nodes_and_components",
    name: "创建 WatchTowerLamp 节点并挂载发光红色立方体 MeshRenderer",
    category: "scene-nodes-and-components",
    turns: ["在场景根节点下创建一个叫 'WatchTowerLamp' 的空节点，位置设在 (5, 2, 5)，再给它添加一个发光的红色立方体网格渲染器子节点或组件。"],
    expectedSkills: ["skills/scene-nodes/SKILL.md", "skills/components/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const entities = (sceneJson.entities ?? []) as Array<any>;
      const watchNode = entities.find((e) => e.name === "WatchTowerLamp");
      const p = entityPos(watchNode);
      const posOk = Boolean(p && Math.hypot(p[0] - 5, p[1] - 2, p[2] - 5) < 0.05);
      const rendererComp = (sceneJson.components ?? []).some((c: { type?: string }) => /MeshRenderer/i.test(c.type ?? ""));
      const called = allCalledTools(turns);
      return [
        { name: "entity_created_at_5_2_5", pass: Boolean(watchNode) && posOk, detail: `watchNode=${JSON.stringify(watchNode)}` },
        { name: "mesh_renderer_attached", pass: rendererComp, detail: `components=${(sceneJson.components ?? []).map((c: { type?: string }) => c.type).join(",")}` },
        { name: "used_editor_apis", pass: hasTool(called, "editor.entity.create") && hasTool(called, "editor.component.add"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "15_assets_cloud_search_import_place",
    name: "云端搜索直升机模型、导入项目并放置到 (15, 0, 15)",
    category: "assets-cloud",
    turns: ["去云端资产库搜索一个直升机模型，导入到项目里，并把它放到场景的 (15, 0, 15) 位置上。"],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/import/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const { sceneJson, files } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const importedFile = files.find((f) => /helicopter/i.test(f.virtualPath) || f.type === "GLTF");
      const placedEntity = (sceneJson.entities ?? []).find((e: any) => {
        const p = entityPos(e);
        return p && Math.hypot(p[0] - 15, p[2] - 15) < 1;
      });
      return [
        { name: "called_search_assets", pass: hasTool(called, "search_assets"), detail: `called=${[...called].join(",")}` },
        { name: "called_asset_import", pass: hasTool(called, "editor.asset.import"), detail: `importedFile=${importedFile?.virtualPath ?? "none"}` },
        { name: "placed_at_15_0_15", pass: Boolean(placedEntity) && Boolean(importedFile), detail: `placedEntity=${JSON.stringify(placedEntity)}` }
      ];
    }
  },
  {
    id: "16_scripting_rotating_lantern",
    name: "编写 TypeScript 运行时旋转脚本并挂载到 Lantern（含真实 TS+esbuild 编译）",
    category: "scripting",
    turns: ["写一个 TypeScript 运行时脚本组件挂载到场景里现有的 'Lantern' 节点上，让它每帧绕 Y 轴缓慢匀速旋转（每秒 30 度）。"],
    expectedSkills: ["skills/scripting/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts", "declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson, scripts } = getAllProjectSceneData(fixture);
      const scriptEntries = Object.entries(scripts);
      const lanternEntity = (sceneJson.entities ?? []).find((e: { name?: string }) => e.name === "Lantern");
      const lanternCompIds = new Set<string>(lanternEntity?.components ?? []);
      const lanternScriptComp = (sceneJson.components ?? []).find(
        (c: { id: string; type?: string; refId?: string; script?: { $ref?: string } }) =>
          lanternCompIds.has(c.id) && (c.type === "Script" || typeof c.refId === "string" || typeof c.script?.$ref === "string")
      );
      const codeText = scriptEntries.map(([, v]) => v).join("\n");
      const rotatesY = /onUpdate|rotate|rotation/i.test(codeText) && /30/.test(codeText);
      const called = allCalledTools(turns);
      return [
        { name: "script_asset_created", pass: scriptEntries.length > 0, detail: `scripts=${Object.keys(scripts).join(",")}` },
        { name: "compiled_without_error", pass: scriptEntries.length > 0 && rotatesY, detail: `rotatesY=${rotatesY}` },
        { name: "attached_to_lantern", pass: Boolean(lanternScriptComp), detail: `lanternScriptComp=${JSON.stringify(lanternScriptComp)}` },
        { name: "used_editor_component_add", pass: hasTool(called, "editor.asset.create") || hasTool(called, "editor.component.add"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "17_history_undo_previous_edit",
    name: "撤销预置的 TempCrate 场景修改并确认已恢复",
    category: "history",
    turns: ["撤销刚才对场景做的上一次修改，并确认已经恢复。"],
    expectedSkills: ["skills/history/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 4,
    async setup(fixture) {
      await fixture.seedPreUndoTransaction("TempCrate");
    },
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const tempCrateStillPresent = (sceneJson.entities ?? []).some((e: { name?: string }) => e.name === "TempCrate");
      return [
        { name: "called_history_query", pass: hasTool(called, "editor.history.query"), detail: `called=${[...called].join(",")}` },
        { name: "called_history_undo", pass: hasTool(called, "editor.history.undo"), detail: `undoCalled=${hasTool(called, "editor.history.undo")}` },
        { name: "temp_crate_reverted", pass: !tempCrateStillPresent, detail: `tempCrateStillPresent=${tempCrateStillPresent}` }
      ];
    }
  },
  {
    id: "18_multi_turn_reuse",
    name: "两轮多轮对话复用（时间天气 + 建屋 + 再改黄昏时间，测跨轮重复读取与上下文复用）",
    category: "multi-turn-reuse",
    turns: [
      "把时间调到中午 12 点，天气设为晴天。",
      "再在玩家前方 15 米建一座小木屋，然后把时间改回黄昏 17 点半。"
    ],
    expectedSkills: ["skills/environment/SKILL.md", "skills/building/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/time.update.d.ts",
      "declare/editor/world/tools/atmosphere.update.d.ts",
      "declare/editor/world/tools/building.generate.d.ts"
    ],
    optimalSteps: 8,
    verify(fixture, turns) {
      const s = fixture.state.getLiveState();
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const userEntities = (Array.isArray(sceneJson.entities) ? sceneJson.entities : []).filter(
        (e: { id?: string }) => !e.id || !INITIAL_ENTITY_IDS.has(e.id)
      );
      const hasHouse =
        Object.entries(prefabs).some(
          ([vp, json]) =>
            isUserBuildingPrefab(vp) &&
            Array.isArray(json.components) &&
            json.components.some((c: { type?: string }) => c.type === "BuildingGroupComponent" || c.type === "BuildingPartComponent")
        ) || userEntities.some((e: any) => /house|木屋|building/i.test(entityName(e)));
      return [
        { name: "two_turns_completed", pass: turns.length === 2, detail: `turns=${turns.length}` },
        { name: "final_time_17_5", pass: Math.abs(s.lighting.timeHours - 17.5) < 0.05, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "house_built", pass: hasHouse && hasTool(called, "tools.building.generate"), detail: `hasHouse=${hasHouse}` }
      ];
    }
  },
  {
    id: "19_compound_lakeside_homestead",
    name: "跨领域复合编排：湖边建木屋 + 旁种 3 棵松树 + 放 2 只小狗 + 调黄昏",
    category: "compound",
    turns: ["在湖边 (18, 0, 18) 附近建一座小木屋，在旁边 (26, 0, 18) 种 3 棵松树，再放 2 只小狗，并把时间调成黄昏 17 点半。"],
    expectedSkills: [
      "skills/building/SKILL.md",
      "skills/vegetation/SKILL.md",
      "skills/animals/SKILL.md",
      "skills/environment/SKILL.md"
    ],
    expectedDeclares: [
      "declare/editor/world/tools/building.generate.d.ts",
      "declare/editor/world/tools/vegetation.create.d.ts",
      "declare/editor/world/tools/world.animals.spawn.d.ts",
      "declare/editor/world/tools/time.update.d.ts"
    ],
    optimalSteps: 7,
    verify(fixture, turns) {
      const s = fixture.state.getLiveState();
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const brushes = fixture.state.getResources().filter((r) => r.resourceType === "vegetation-brush");
      const spawns = fixture.state.getAnimalSpawns();
      const userEntities = (Array.isArray(sceneJson.entities) ? sceneJson.entities : []).filter(
        (e: { id?: string }) => !e.id || !INITIAL_ENTITY_IDS.has(e.id)
      );
      const hasHouse =
        Object.entries(prefabs).some(
          ([vp, json]) =>
            isUserBuildingPrefab(vp) &&
            Array.isArray(json.components) &&
            json.components.some((c: { type?: string }) => c.type === "BuildingGroupComponent" || c.type === "BuildingPartComponent")
        ) || userEntities.some((e: any) => /house|木屋|building/i.test(entityName(e)));
      return [
        { name: "house_built", pass: hasHouse && hasTool(called, "tools.building.generate"), detail: `hasHouse=${hasHouse}` },
        { name: "pines_planted", pass: brushes.length > 0 && (hasTool(called, "tools.vegetation.create") || hasTool(called, "tools.vegetation.update")), detail: `brushes=${brushes.length}` },
        { name: "dogs_spawned", pass: spawns.length >= 2, detail: `spawns=${spawns.length}` },
        { name: "time_set_17_5", pass: Math.abs(s.lighting.timeHours - 17.5) < 0.05, detail: `timeHours=${s.lighting.timeHours}` }
      ];
    }
  },
  {
    id: "20_compound_farm_and_decor",
    name: "跨领域复合编排：农田浇水 + 创建 FarmSignpost 节点并挂载旋转脚本",
    category: "compound",
    turns: ["先检查农场里现有的农田地块并完成浇水，然后在场景根节点下创建一个名为 'FarmSignpost'、位置在 (8, 1, 8) 的节点并给它挂一个每秒绕 Y 轴旋转 45 度的 TypeScript 脚本。"],
    expectedSkills: ["skills/farming/SKILL.md", "skills/scene-nodes/SKILL.md", "skills/scripting/SKILL.md"],
    expectedDeclares: [
      "declare/editor/farming/FarmingSystem.d.ts",
      "declare/editor/native/api.d.ts",
      "declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts"
    ],
    optimalSteps: 7,
    verify(fixture, turns) {
      const { sceneJson, scripts } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const scriptPayload = turns
        .flatMap((t) => t.scripts)
        .map((s) => `${s.code}\n${JSON.stringify(s.toolTrace ?? [])}`)
        .join("\n");
      const irrigateCalled = [...called].some((name) => name.includes("irrigate")) || /\birrigate\b/.test(scriptPayload);
      const signNode = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "FarmSignpost");
      const p = entityPos(signNode);
      const posOk = Boolean(p && Math.hypot(p[0] - 8, p[1] - 1, p[2] - 8) < 0.2);
      const scriptEntries = Object.entries(scripts);
      const codeText = scriptEntries.map(([, v]) => v).join("\n");
      const rotates45 = /onUpdate|rotate|rotation/i.test(codeText) && /45/.test(codeText);
      return [
        { name: "farm_irrigated", pass: irrigateCalled, detail: `irrigateCalled=${irrigateCalled}` },
        { name: "signpost_created_at_8_1_8", pass: Boolean(signNode) && posOk, detail: `signNode=${JSON.stringify(signNode)}` },
        { name: "rotation_script_45", pass: scriptEntries.length > 0 && rotates45, detail: `scripts=${Object.keys(scripts).join(",")}` }
      ];
    }
  },
  {
    id: "21_voice_typo_and_vague_edit",
    name: "语音同音字纠错与口语复合指令（小鱼→小雨、小三丘→小山丘，且不乱动无关对象）",
    category: "voice-intent",
    turns: ["把天气调成小鱼，时间改到傍晚六点，然后在我前方十二米左右做个小三丘，半径十米高四米"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/environment/SKILL.md", "skills/terrain/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/atmosphere.update.d.ts",
      "declare/editor/world/tools/time.update.d.ts",
      "declare/editor/world/tools/terrain.create.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const s = fixture.state.getLiveState();
      const removed = fixture.state.getRemovedIds();
      const spawns = fixture.state.getAnimalSpawns();
      const terrainResources = fixture.state.getResources().filter((r) => r.resourceType === "terrain-patch" || r.resourceType === "terrain-feature");
      const called = allCalledTools(turns);
      const isRain = /rain/i.test(String(s.environment.weatherPreset ?? "")) || s.environment.rainIntensity > 0;
      const isEvening = Math.abs(s.lighting.timeHours - 18) <= 0.5;
      return [
        { name: "voice_corrected_to_rain", pass: isRain, detail: `weather=${s.environment.weatherPreset}, rain=${s.environment.rainIntensity}` },
        { name: "time_set_evening_18", pass: isEvening, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "voice_corrected_to_hill", pass: terrainResources.length > 0 && (hasTool(called, "tools.terrain.create") || hasTool(called, "tools.terrain.patch")), detail: `terrainResources=${terrainResources.length}` },
        { name: "scope_no_hallucinated_animals", pass: spawns.length === 0, detail: `spawns=${spawns.length}` },
        { name: "scope_preserve_existing_objects", pass: removed.length === 0, detail: `removed=${removed.join(",")}` }
      ];
    }
  },
  {
    id: "22_multi_turn_coreference_refine",
    name: "三轮连续指代微调（创建蓝立方体→右移5米改红→抬高2米保留红色）",
    category: "multi-turn-coreference",
    turns: [
      "在场景根节点下创建一个叫 'GardenLamp' 的立方体，放在 (10, 1, 10)，涂成蓝色。",
      "把刚才那个灯往 X 正方向再移 5 米，材质改成红色。",
      "高度再抬高 2 米，但千万别动它的红色材质。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md", "skills/components/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 9,
    verify(fixture, turns) {
      const { sceneJson, materials } = getAllProjectSceneData(fixture);
      const lamp = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "GardenLamp");
      const p = entityPos(lamp);
      const posOk = Boolean(p && Math.hypot(p[0] - 15, p[1] - 3, p[2] - 10) < 0.25);
      const matJson = JSON.stringify(materials);
      const compJson = JSON.stringify(sceneJson.components ?? []);
      const combined = `${matJson}\n${compJson}`;
      // Reddish color: high r (>0.5) and lower b (<0.4), including exact integers 1 and 0
      const hasRed =
        /"r":\s*(?:0\.[6-9]\d*|1(?:\.0+)?)[,\s\S]{0,60}?"b":\s*0(?:\.[0-3]\d*)?(?=[,\}\s])/.test(combined) ||
        /"baseColor":\s*\{\s*"r":\s*(?:0\.[6-9]\d*|1(?:\.0+)?)/.test(combined);
      return [
        { name: "three_turns_completed", pass: turns.length === 3, detail: `turns=${turns.length}` },
        { name: "garden_lamp_at_15_3_10", pass: Boolean(lamp) && posOk, detail: `pos=${JSON.stringify(p)}` },
        { name: "scope_preserved_red_material", pass: hasRed, detail: `materials=${Object.keys(materials).join(",")}` }
      ];
    }
  },
  {
    id: "23_strict_scope_and_non_destructive",
    name: "范围红线遵守：仅删除指定松树，零误伤橡树、白桦树与岩石",
    category: "compliance-scope",
    turns: ["只把 (6, 0, -9) 附近那棵松树删掉；绝对不要碰其他任何树（尤其是橡树和白桦树）和远处的岩石。"],
    expectedSkills: ["skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.query.d.ts",
      "declare/editor/world/tools/world.delete.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const removed = fixture.state.getRemovedIds();
      const called = allCalledTools(turns);
      return [
        { name: "deleted_target_pine", pass: removed.includes("tree-pine-near") && hasTool(called, "tools.world.delete"), detail: `removed=${removed.join(",")}` },
        { name: "scope_oak_intact", pass: !removed.includes("tree-oak-mid"), detail: `removed=${removed.join(",")}` },
        { name: "scope_birch_intact", pass: !removed.includes("tree-birch-far"), detail: `removed=${removed.join(",")}` },
        { name: "scope_rock_intact", pass: !removed.includes("rock-north"), detail: `removed=${removed.join(",")}` }
      ];
    }
  },
  {
    id: "24_capability_boundary_and_reply_hygiene",
    name: "诚实边界与回复规范：完成时间调整，诚实说明无大象与无音效，且回复不泄内部 API/ID",
    category: "compliance-honesty",
    turns: ["帮我把时间调成早上 8 点，同时再帮我放一只大象并给全场景开启真实暴雨雷电音效。"],
    expectedSkills: ["skills/environment/SKILL.md", "skills/animals/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/time.update.d.ts",
      "declare/editor/world/tools/world.animals.catalog.d.ts"
    ],
    optimalSteps: 4,
    verify(fixture, turns) {
      const s = fixture.state.getLiveState();
      const spawns = fixture.state.getAnimalSpawns();
      const reply = combinedFinalText(turns);
      const timeOk = Math.abs(s.lighting.timeHours - 8) < 0.05;
      const honestAboutElephant = /(大象|动物).{0,25}(没有|未找到|不支持|暂无|不在|无法|缺少|未能)/.test(reply) ||
        /(没有|未找到|不支持|暂无|无法).{0,25}(大象)/.test(reply);
      const honestAboutAudio = /(音效|声音|雷电|音频).{0,25}(不支持|没有|无法|暂无|未提供|未能)/.test(reply) ||
        /(不支持|没有|无法|暂无).{0,25}(音效|声音|音频)/.test(reply);
      const noLeak = !/\b(?:tools\.[a-z]+\.[a-zA-Z]+|editor\.[a-z]+\.[a-zA-Z]+|skills\/|declare\/|\.d\.ts|committedAt)\b/.test(reply);
      return [
        { name: "time_updated_to_8", pass: timeOk, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "scope_no_fake_animal_spawn", pass: spawns.length === 0, detail: `spawns=${spawns.length}` },
        { name: "honest_about_missing_elephant", pass: honestAboutElephant, detail: `reply=${reply.slice(0, 180)}` },
        { name: "honest_about_unsupported_audio", pass: honestAboutAudio, detail: `reply=${reply.slice(0, 180)}` },
        { name: "reply_hygiene_clean", pass: noLeak, detail: `reply=${reply.slice(0, 180)}` }
      ];
    }
  },
  {
    id: "25_environment_wind_fog_cloud_update",
    name: "环境全通道更新（风/雾/云/天空色/闪电）：调大风速、加轻雾多云、天空染暖紫并加闪电",
    category: "environment-write",
    turns: ["把风调大一点，加上轻雾、多云覆盖和轻微闪电，再把天空颜色调成偏暖紫色（线性 RGB 约 [0.55, 0.35, 0.65]）。"],
    expectedSkills: ["skills/environment/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/atmosphere.update.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const muts = fixture.state.getEnvironmentMutations();
      const s = fixture.state.getLiveState();
      const called = allCalledTools(turns);
      const serialized = JSON.stringify(muts);
      const touchedAtmosphere = hasTool(called, "tools.atmosphere.update");
      const touchedWindOrFogOrCloud = /wind|fog|cloud/i.test(serialized);
      const touchedSkyOrLightning =
        Boolean((s.environment as any).skyColorRgb) ||
        /skyColorRgb|lightning/i.test(serialized) ||
        s.environment.lightningFrequency > 0 ||
        s.environment.lightningIntensity > 0;
      return [
        { name: "called_atmosphere_update", pass: touchedAtmosphere, detail: `called=${[...called].join(",")}` },
        { name: "updated_wind_fog_or_cloud", pass: touchedWindOrFogOrCloud && muts.length > 0, detail: `muts=${serialized.slice(0, 180)}` },
        { name: "updated_sky_color_or_lightning", pass: touchedSkyOrLightning, detail: `skyColorRgb=${JSON.stringify((s.environment as any).skyColorRgb ?? null)}, lightning=${s.environment.lightningFrequency}/${s.environment.lightningIntensity}` }
      ];
    }
  },
  {
    id: "26_building_inspect_update_delete",
    name: "建筑完整 CRUD：先建小屋并移动改名，再删除该建筑节点",
    category: "building-crud",
    turns: [
      "在 (20, 0, 20) 建一座单层小木屋，节点命名为 'TempCabin'。",
      "查出刚才建的 'TempCabin'，把它的位置移到 (24, 0, 20) 后再删掉这个临时建筑节点。"
    ],
    expectedSkills: ["skills/building/SKILL.md", "skills/scene-nodes/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/building.generate.d.ts",
      "declare/editor/native/api.d.ts"
    ],
    optimalSteps: 8,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const stillExists = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "TempCabin");
      return [
        { name: "generated_and_created", pass: hasTool(called, "tools.building.generate") && hasTool(called, "editor.entity.create"), detail: `called=${[...called].join(",")}` },
        { name: "updated_and_deleted", pass: hasTool(called, "editor.entity.update") && hasTool(called, "editor.entity.delete"), detail: `called=${[...called].join(",")}` },
        { name: "temp_cabin_deleted", pass: !stillExists, detail: `stillExists=${stillExists}` }
      ];
    }
  },
  {
    id: "27_water_sample_and_delete",
    name: "水体 R+D：采样湖泊中心 (4, 4) 水深与水面高程，然后移除该湖泊组件",
    category: "water-crud",
    turns: ["先采样 (4, 4) 处湖泊的水面高程和水深并汇报，然后再把场景里这个湖泊的 WaterBodyComponent 移除。"],
    expectedSkills: ["skills/water/SKILL.md", "skills/components/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/water.sample.d.ts",
      "declare/editor/native/api.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const hasWaterComp = (sceneJson.components ?? []).some((c: { type?: string }) => c.type === "WaterBodyComponent");
      return [
        { name: "sampled_water", pass: hasTool(called, "tools.water.sample"), detail: `called=${[...called].join(",")}` },
        { name: "removed_water_component", pass: (hasTool(called, "editor.component.remove") || hasTool(called, "editor.entity.delete")) && !hasWaterComp, detail: `hasWaterComp=${hasWaterComp}` }
      ];
    }
  },
  {
    id: "28_terrain_query_update_patch_delete",
    name: "地形完整 CRUD：创建山丘 → 调高 → 局部修补地面 → 删除该山丘",
    category: "terrain-crud",
    turns: [
      "在 (-15, 0, 25) 建一座半径 12 米、高 5 米的小山丘。",
      "把刚才建的那座小山丘再调高到 9 米，然后把它删掉并确认删除。"
    ],
    expectedSkills: ["skills/terrain/SKILL.md", "skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/terrain.create.d.ts",
      "declare/editor/world/tools/terrain.update.d.ts",
      "declare/editor/world/tools/world.delete.d.ts"
    ],
    optimalSteps: 8,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const removed = fixture.state.getRemovedIds();
      const liveText = JSON.stringify(fixture.state.getLiveState());
      const authoredRemoved = !liveText.includes("terrain-feature-");
      return [
        { name: "created_terrain", pass: hasTool(called, "tools.terrain.create"), detail: `called=${[...called].join(",")}` },
        { name: "updated_terrain", pass: hasTool(called, "tools.terrain.update") || hasTool(called, "tools.terrain.patch"), detail: `called=${[...called].join(",")}` },
        { name: "deleted_terrain", pass: hasTool(called, "tools.world.delete") && (removed.length > 0 || authoredRemoved), detail: `removed=${removed.join(",")}, authoredRemoved=${authoredRemoved}` }
      ];
    }
  },
  {
    id: "29_vegetation_inspect_update_tree_shape",
    name: "植被 R+U：查询近处松树详情并调整共享树形外观（增高 1.4 倍、偏金秋叶色）",
    category: "vegetation-crud",
    turns: ["先查出 (6, 0, -9) 附近那棵松树的详情，再把这类松树的共享树形高度缩放调到 1.4 倍，树叶颜色调成金黄色。"],
    expectedSkills: ["skills/vegetation/SKILL.md", "skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.query.d.ts",
      "declare/editor/world/tools/world.inspect.d.ts",
      "declare/editor/world/tools/vegetation.update.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "queried_and_inspected_tree", pass: hasTool(called, "tools.world.query") && hasTool(called, "tools.world.inspect"), detail: `called=${[...called].join(",")}` },
        { name: "updated_vegetation_shape", pass: hasTool(called, "tools.vegetation.update"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "30_world_objects_selection_and_inspect",
    name: "世界对象 R+选区：查询所有树木、读取最近树木详情并保存命名选区",
    category: "world-objects-crud",
    turns: ["查出世界里所有的树木并读取离玩家最近那棵树的详细属性，然后把查询到的树保存为一个命名选区 'near_trees'。"],
    expectedSkills: ["skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.query.d.ts",
      "declare/editor/world/tools/world.inspect.d.ts",
      "declare/editor/world/tools/world.selection.save.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_query_and_inspect", pass: hasTool(called, "tools.world.query") && hasTool(called, "tools.world.inspect"), detail: `called=${[...called].join(",")}` },
        { name: "called_selection_save", pass: hasTool(called, "tools.world.selection.save"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "31_world_parameters_reset",
    name: "规划参数 R+Reset+Receipt：查询动物激活距离、重置默认值并查回执",
    category: "world-parameters",
    turns: ["先查一下动物系统当前的 activationDistance 参数，把它 reset 重置回默认值，并查一下这次参数应用的 receipt 回执确认生效。"],
    expectedSkills: ["skills/world-objects/parameters/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.parameters.describe.d.ts",
      "declare/editor/world/tools/world.parameters.inspect.d.ts",
      "declare/editor/world/tools/world.parameters.apply.d.ts",
      "declare/editor/world/tools/world.parameters.receipt.d.ts"
    ],
    optimalSteps: 6,
    verify(fixture, turns) {
      const paramState = fixture.state.getParameterState();
      const called = allCalledTools(turns);
      const usedReset = JSON.stringify(paramState.applyCalls).includes('"reset"');
      return [
        { name: "called_parameters_apply", pass: hasTool(called, "tools.world.parameters.apply"), detail: `called=${[...called].join(",")}` },
        { name: "used_reset_op", pass: usedReset, detail: `applyCalls=${JSON.stringify(paramState.applyCalls).slice(0, 180)}` },
        { name: "checked_parameters_receipt", pass: hasTool(called, "tools.world.parameters.receipt"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "32_spatial_resolve_and_check",
    name: "空间只读三件套：查询玩家实时位姿、解析右侧 20 米坐标并检查地形高度与坡度",
    category: "spatial-read",
    turns: ["先读取玩家当前的实时相机位置与朝向（spatial.viewer），再解析玩家右侧 20 米的位置坐标，并用空间检查工具确认该位置的高度、坡度和是否适合放置物体，不要修改场景。"],
    expectedSkills: ["skills/spatial/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/spatial.viewer.d.ts",
      "declare/editor/world/tools/spatial.resolve.d.ts",
      "declare/editor/world/tools/spatial.check.d.ts"
    ],
    optimalSteps: 4,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const removed = fixture.state.getRemovedIds();
      return [
        { name: "called_spatial_viewer", pass: hasTool(called, "tools.spatial.viewer"), detail: `called=${[...called].join(",")}` },
        { name: "called_spatial_resolve", pass: hasTool(called, "tools.spatial.resolve"), detail: `called=${[...called].join(",")}` },
        { name: "called_spatial_check", pass: hasTool(called, "tools.spatial.check"), detail: `called=${[...called].join(",")}` },
        { name: "scope_read_only", pass: removed.length === 0 && fixture.state.getTeleports().length === 0, detail: `teleports=${fixture.state.getTeleports().length}` }
      ];
    }
  },
  {
    id: "33_animals_query_describe_receipt",
    name: "动物全链路：生成小狗 → query 查询实例 → describe 查技能 → command 并 receipt 核验",
    category: "animals-crud",
    turns: ["生成 1 只小狗，然后用动物查询接口找到它，查看它支持的技能，下发一个自由活动/漫步命令并查一次命令回执。"],
    expectedSkills: ["skills/animals/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.animals.catalog.d.ts",
      "declare/editor/world/tools/world.animals.spawn.d.ts",
      "declare/editor/world/tools/world.animals.query.d.ts",
      "declare/editor/world/tools/world.animals.describe.d.ts",
      "declare/editor/world/tools/world.animals.command.d.ts",
      "declare/editor/world/tools/world.animals.receipt.d.ts"
    ],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "spawned_and_queried", pass: hasTool(called, "tools.world.animals.spawn") && hasTool(called, "tools.world.animals.query"), detail: `called=${[...called].join(",")}` },
        { name: "described_and_commanded", pass: hasTool(called, "tools.world.animals.describe") && hasTool(called, "tools.world.animals.command"), detail: `called=${[...called].join(",")}` },
        { name: "checked_receipt", pass: hasTool(called, "tools.world.animals.receipt"), detail: `receipts=${fixture.state.getAnimalReceipts().length}` }
      ];
    }
  },
  {
    id: "34_farming_plot_crud_plant_delete",
    name: "农场完整 CRUD：查询地块与目录 → 改名标签 → 在空地播种或新建并删除测试地块",
    category: "farming-crud",
    turns: ["检查农场里的现有地块和种子目录，给现有空地块（或新建一个测试空地块）更新标签为 'TestPlot'，并在确认后汇报地块与可用种子信息。"],
    expectedSkills: ["skills/farming/SKILL.md"],
    expectedDeclares: ["declare/editor/farming/methods/README.md"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const scriptPayload = turns.flatMap((t) => t.scripts).map((s) => s.code).join("\n");
      const queried = [...called].some((n) => /list|queryPlots|getCatalog/.test(n)) || /\b(?:queryPlots|getCatalog)\b/.test(scriptPayload);
      const mutated = [...called].some((n) => /updatePlot|createPlot|plant/.test(n)) || /\b(?:updatePlot|createPlot|plant)\b/.test(scriptPayload);
      return [
        { name: "queried_farm_plots_and_catalog", pass: queried, detail: `called=${[...called].join(",")}` },
        { name: "mutated_plot", pass: mutated, detail: `mutated=${mutated}` }
      ];
    }
  },
  {
    id: "35_farming_inventory_and_items",
    name: "农场库存与道具：查询库存/容器/道具统计并检查当前携带物",
    category: "farming-read",
    turns: ["查询当前农场的固定仓储库存、容器列表、道具统计和玩家当前携带的农具，不要修改农场状态。"],
    expectedSkills: ["skills/farming/SKILL.md"],
    expectedDeclares: ["declare/editor/farming/methods/README.md"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const scriptPayload = turns.flatMap((t) => t.scripts).map((s) => s.code).join("\n");
      const checkedInv = /\b(?:getInventory|getContainers|getItemTotals)\b/.test(scriptPayload) || [...called].some((n) => /Inventory|Containers|ItemTotals/.test(n));
      const checkedCarry = /\b(?:getCarry|queryItems)\b/.test(scriptPayload) || [...called].some((n) => /Carry|queryItems/.test(n));
      return [
        { name: "checked_inventory_and_containers", pass: checkedInv, detail: `called=${[...called].join(",")}` },
        { name: "checked_carry_or_items", pass: checkedCarry, detail: `checkedCarry=${checkedCarry}` }
      ];
    }
  },
  {
    id: "36_scene_nodes_read_reparent_delete",
    name: "Scene 节点完整 CRUD：创建父子节点 → 读取详情 → reparent 换父 → 删除临时节点",
    category: "scene-nodes-crud",
    turns: [
      "在场景根节点下创建 'GroupA'（位置 0,0,0）、'GroupB'（位置 5,0,0）和挂在 'GroupA' 下的子节点 'ChildBox'（位置 1,0,0）。",
      "读取 'ChildBox' 的信息，把它 reparent 移到 'GroupB' 下面，最后把 'GroupA' 删掉。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 7,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const entities = (sceneJson.entities ?? []) as Array<any>;
      const groupA = entities.find((e) => entityName(e) === "GroupA");
      const groupB = entities.find((e) => entityName(e) === "GroupB");
      const child = entities.find((e) => entityName(e) === "ChildBox");
      const reparented = Boolean(groupB && child && Array.isArray(groupB.children) && groupB.children.includes(child.id));
      return [
        { name: "called_crud_and_reparent", pass: hasTool(called, "editor.entity.create") && hasTool(called, "editor.entity.reparent") && hasTool(called, "editor.entity.delete"), detail: `called=${[...called].join(",")}` },
        { name: "child_reparented_to_groupB", pass: reparented, detail: `groupB.children=${JSON.stringify(groupB?.children)}, childId=${child?.id}` },
        { name: "groupA_deleted", pass: !groupA, detail: `groupA=${Boolean(groupA)}` }
      ];
    }
  },
  {
    id: "37_components_read_update_remove",
    name: "组件完整 CRUD：查询 Lantern 组件 → 添加并更新临时组件属性 → 移除该组件",
    category: "components-crud",
    turns: [
      "查询 'Lantern' 节点上现有的组件，给它添加一个 PointLight（或 MeshRenderer）组件并启用。",
      "读取刚添加的那个组件属性，把它设为禁用（enabled: false），然后再把刚添加的组件移除，保留 'Lantern' 节点本身。"
    ],
    expectedSkills: ["skills/components/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 7,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const lantern = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "Lantern");
      return [
        { name: "called_component_crud", pass: hasTool(called, "editor.component.add") && hasTool(called, "editor.component.update") && hasTool(called, "editor.component.remove"), detail: `called=${[...called].join(",")}` },
        { name: "called_component_query_or_read", pass: hasTool(called, "editor.component.query") || hasTool(called, "editor.component.read"), detail: `called=${[...called].join(",")}` },
        { name: "scope_lantern_intact", pass: Boolean(lantern), detail: `lantern=${Boolean(lantern)}` }
      ];
    }
  },
  {
    id: "38_assets_crud_create_read_update_delete",
    name: "资产完整 CRUD：list → create 材质 → read → update 改色 → references → delete",
    category: "assets-crud",
    turns: [
      "列出当前项目资产，然后创建一个路径为 'Materials/TempTest.mat' 的绿色 PBR 材质资产。",
      "读取 'Materials/TempTest.mat'，把颜色改成黄色，检查它有没有被场景引用，确认无引用后删除它。"
    ],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/delete/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 7,
    verify(fixture, turns) {
      const { files } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const stillPresent = files.some((f) => f.virtualPath === "Materials/TempTest.mat");
      return [
        { name: "called_asset_crud", pass: hasTool(called, "editor.asset.create") && hasTool(called, "editor.asset.read") && hasTool(called, "editor.asset.update"), detail: `called=${[...called].join(",")}` },
        { name: "checked_references_before_delete", pass: hasTool(called, "editor.asset.references") && hasTool(called, "editor.asset.delete"), detail: `called=${[...called].join(",")}` },
        { name: "temp_material_deleted", pass: !stillPresent, detail: `stillPresent=${stillPresent}` }
      ];
    }
  },
  {
    id: "39_assets_prefab_create_and_instantiate",
    name: "Prefab 创建与实例化：创建带 MeshRenderer 的柱子 Prefab 并实例化 2 个到场景",
    category: "assets-prefab",
    turns: ["创建一个名为 'Prefabs/StonePillar.prefab' 的简单 Prefab 资产，再把它实例化到场景中的 (6, 0, 6) 和 (10, 0, 6) 两个位置。"],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/use-prefab/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson, files } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const hasPrefab = files.some((f) => f.virtualPath === "Prefabs/StonePillar.prefab" && f.type === "Prefab");
      const instances = (sceneJson.entities ?? []).filter((e: any) => entityAssetRef(e) === "Prefabs/StonePillar.prefab");
      return [
        { name: "created_prefab_asset", pass: hasPrefab && hasTool(called, "editor.asset.create"), detail: `hasPrefab=${hasPrefab}` },
        { name: "instantiated_two_pillars", pass: instances.length >= 2, detail: `instances=${instances.length}` }
      ];
    }
  },
  {
    id: "40_scripting_read_update_delete",
    name: "脚本资产 R+U+D：读取预置脚本 → 修改转速重编 → 卸载并删除临时脚本",
    category: "scripting-crud",
    turns: [
      "读取项目里现有的 'Scripts/TempPulse.ts'，把它的旋转速度改成每秒 60 度并更新保存。",
      "确认没有节点引用 'Scripts/TempPulse.ts' 后把它删掉。"
    ],
    expectedSkills: ["skills/scripting/SKILL.md", "skills/assets/delete/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 7,
    async setup(fixture) {
      const signal = new AbortController().signal;
      const edit = fixture.nativeEditor.beginEdit(`seed-script-${Date.now()}`, signal);
      const createTool = edit.tools.find((t) => t.name === "asset.create")!;
      await createTool.execute(
        createTool.parseInput({
          path: "Scripts/TempPulse.ts",
          type: "script",
          content: 'import { Script } from "@galacean/engine";\nexport default class TempPulse extends Script {\n  onUpdate(dt: number) {\n    this.entity.transform.rotate(0, 15 * dt, 0);\n  }\n}\n'
        }),
        { signal }
      );
      await edit.prepare(signal);
      await edit.commit();
      await edit.activate?.(signal);
      await edit.complete?.();
    },
    verify(fixture, turns) {
      const { files } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const stillPresent = files.some((f) => f.virtualPath === "Scripts/TempPulse.ts");
      return [
        { name: "read_and_updated_script", pass: (hasTool(called, "editor.asset.read") || called.has("read")) && (hasTool(called, "editor.asset.update") || called.has("edit")), detail: `called=${[...called].join(",")}` },
        { name: "checked_refs_and_deleted", pass: hasTool(called, "editor.asset.references") && hasTool(called, "editor.asset.delete") && !stillPresent, detail: `stillPresent=${stillPresent}` }
      ];
    }
  },
  {
    id: "41_engine_knowledge_script_lifecycle_material",
    name: "Engine 运行时知识：编写带 onAwake/onUpdate 生命周期与上下浮动+旋转行为的 Script 挂载到 Lantern",
    category: "engine-knowledge",
    turns: ["给 'Lantern' 节点写一个运行时 TypeScript 脚本：在 onAwake 记录初始高度，在 onUpdate 里让它按正弦波上下缓慢浮动（振幅 0.5 米）同时绕 Y 轴缓慢旋转，注意正确使用引擎生命周期和 Transform API。"],
    expectedSkills: ["skills/scripting/SKILL.md", "skills/engine-knowledge/SKILL.md"],
    expectedDeclares: [
      "declare/editor/native/api.d.ts",
      "declare/engine/node_modules/@galacean/engine-core/types/Script.d.ts"
    ],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson, scripts } = getAllProjectSceneData(fixture);
      const code = Object.values(scripts).join("\n");
      const hasLifecycle = /onAwake/.test(code) && /onUpdate/.test(code) && /Math\.sin/.test(code);
      const lantern = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "Lantern");
      const lanternCompIds = new Set<string>(lantern?.components ?? []);
      const attached = (sceneJson.components ?? []).some(
        (c: any) => lanternCompIds.has(c.id) && (c.type === "Script" || typeof c.script?.$ref === "string")
      );
      return [
        { name: "script_has_lifecycle_and_sin", pass: hasLifecycle, detail: `scripts=${Object.keys(scripts).join(",")}` },
        { name: "attached_to_lantern", pass: attached, detail: `attached=${attached}` }
      ];
    }
  },
  {
    id: "42_history_undo_and_redo",
    name: "历史完整 Undo + Redo：先撤销预置 TempCrate 修改，再重做恢复它",
    category: "history-crud",
    turns: [
      "撤销刚才对场景做的上一次修改。",
      "把刚才撤销的那一步再重做（redo）恢复回来。"
    ],
    expectedSkills: ["skills/history/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 7,
    async setup(fixture) {
      await fixture.seedPreUndoTransaction("TempCrate");
    },
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const restored = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "TempCrate");
      return [
        { name: "called_undo_and_redo", pass: hasTool(called, "editor.history.undo") && hasTool(called, "editor.history.redo"), detail: `called=${[...called].join(",")}` },
        { name: "temp_crate_restored_after_redo", pass: restored, detail: `restored=${restored}` }
      ];
    }
  },
  {
    id: "43_farming_harvest_mature_crops",
    name: "农耕批量收获：检查农田成熟作物并完成收获（覆盖 operations.md 收获流）",
    category: "farming-crud",
    turns: ["检查农田里已经成熟的作物，把所有成熟作物收获下来，并告诉我收获结果。"],
    expectedSkills: ["skills/farming/SKILL.md", "skills/farming/references/operations.md"],
    expectedDeclares: ["declare/editor/farming/methods/README.md"],
    optimalSteps: 5,
    async setup(fixture) {
      await fixture.seedMatureCrop("native/a");
    },
    verify(fixture, turns) {
      const plot = fixture.farmingArea.service.getPlot("native/a");
      const snap = fixture.farmingArea.service.getSnapshot() as Record<string, any>;
      const storedCount = Object.values(snap.inventory ?? {}).reduce((a: number, b: any) => a + Number(b || 0), 0);
      const itemList = Array.isArray(snap.items) ? snap.items : Object.values(snap.items ?? {});
      const pendingCount = itemList.reduce((sum: number, item: any) => {
        const contents = item?.contents ?? item?.items ?? {};
        return sum + Number(Object.values(contents).reduce((a: number, b: any) => a + Number(b || 0), 0));
      }, 0);
      const called = allCalledTools(turns);
      const calledHarvest = [...called].some((name) => name === "harvest" || name.endsWith(".harvest"));
      return [
        { name: "harvested_plot_crop", pass: (plot?.crop ?? null) === null, detail: `crop=${JSON.stringify(plot?.crop ?? null)}` },
        { name: "harvest_produced_items", pass: storedCount + pendingCount > 0 || calledHarvest, detail: `stored=${storedCount}, pending=${pendingCount}, calledHarvest=${calledHarvest}` }
      ];
    }
  }
];

export const BENCHMARK_CASES: readonly BenchmarkCaseDefinition[] = [...CORE_AND_V3_CASES, ...EXTENDED_V4_CASES];

const SMOKE_PREFIXES = ["03_", "05_", "06_", "08_", "10_", "15_", "16_", "19_", "20_", "21_", "22_", "23_", "24_"];

/**
 * Filter cases by BENCH_SUITE (smoke | crud | hard | domain:<skill> | full) and/or BENCH_CASES.
 */
export function selectBenchmarkCases(suiteRaw?: string, casesRaw?: string): readonly BenchmarkCaseDefinition[] {
  let pool: readonly BenchmarkCaseDefinition[] = BENCHMARK_CASES;
  const suite = suiteRaw?.trim().toLowerCase();
  if (suite && suite !== "full") {
    if (suite === "smoke") {
      pool = pool.filter((c) => SMOKE_PREFIXES.some((p) => c.id.startsWith(p)));
    } else if (suite === "hard") {
      pool = pool.filter((c) => {
        const num = Number(c.id.slice(0, 3).replace(/_.*$/, ""));
        return (num >= 19 && num <= 24) || num >= 69;
      });
    } else if (suite === "crud") {
      pool = pool.filter((c) => {
        const num = Number(c.id.slice(0, 3).replace(/_.*$/, ""));
        return (num >= 1 && num <= 18) || (num >= 25 && num <= 68);
      });
    } else if (suite.startsWith("domain:")) {
      const domain = suite.slice("domain:".length).trim();
      pool = pool.filter(
        (c) =>
          c.category.toLowerCase().includes(domain) ||
          c.expectedSkills.some((s) => s.toLowerCase().includes(`skills/${domain}`))
      );
    } else {
      throw new Error(`Unknown BENCH_SUITE '${suiteRaw}'. Expected: full | smoke | crud | hard | domain:<name>`);
    }
  }
  const filterRaw = casesRaw?.trim();
  if (!filterRaw) return pool;
  const tokens = filterRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return pool.filter((c) => tokens.some((tok) => c.id === tok || c.id.startsWith(tok)));
}
