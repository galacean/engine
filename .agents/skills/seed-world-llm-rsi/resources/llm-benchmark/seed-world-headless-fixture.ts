import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { vi } from "vitest";
import { AssetPromise, AssetType, Scene, Shader, Texture2D, Texture2DArray, Vector3, type Engine, type Entity } from "@galacean/engine";
import { KTX2Container } from "../../../../packages/loader/src/ktx2/KTX2Container.ts";
import { KTX2Loader } from "../../../../packages/loader/src/ktx2/KTX2Loader.ts";
import { ProjectRegexScanner } from "@galacean/engine-project/project-files/project-regex-scanner.ts";
import { HeadlessEngine } from "../../../../packages/rhi-null/src/index.ts";
import "@galacean/engine-building/building/parts/index";
import "@galacean/engine-building/building/parts/BuildingParts";
import "@galacean/engine-building/building/components/BuildingGeneratorComponent";
import { registerBuildingAssetComponents } from "@galacean/engine-building/building/resources/BuildingAssetKit";
import { builtinBuildingAssetFiles } from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { builtinBuildingPresetFiles } from "@galacean/engine-building/building/resources/BuiltinBuildingPresets";
import {
  FarmingAPI,
  FarmingAreaComponent,
  FarmingSystem,
  createFarmingResources,
  registerNativeFarming
} from "@galacean/engine-farming/farming/native/index";
import { ManualFarmClock } from "../../../../packages/farming/src/farming/application/FarmClock";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../../../../packages/farming/tests/fixtures/fixtures";
import { WaterBodyComponent, registerNativeWater, type WaterSystem } from "@galacean/engine-water/water/native/index";
import { builtinWaterDefaultFiles } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { AgentLoop } from "@galacean/engine-ai-chat/ai-chat/agent-loop.ts";
import { AIChatSession } from "@galacean/engine-ai-chat/ai-chat/ai-chat-session.ts";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import { JavaScriptAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";
import type {
  AgentConfiguration,
  AgentEvent,
  AgentMessage,
  AgentScriptResult,
  AgentStepRecord,
  AgentTaskResult,
  AgentValue
} from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import type { RetrievalClient } from "@galacean/engine-retrieval/retrieval/index.ts";
import type {
  AssetCandidate,
  AssetResourceSet,
  DescriptionsInput,
  DescriptionsResult,
  SearchInput,
  SearchResult
} from "@galacean/engine-retrieval/retrieval/src/contracts.ts";
import { createFarmingComponentExtension } from "@galacean/engine-runtime-editor/farming/FarmingComponentEditor.ts";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session.ts";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor.ts";
import { buildRuntimeScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-builder.ts";
import { checkRuntimeScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-compiler.ts";
import { RuntimeScriptModules } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-modules.ts";
import { RuntimeScriptWorker } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-worker.ts";
import { runtimeHostDeclarations } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-host-declarations.ts";
import engineRuntimeFilesJson from "../../../../packages/runtime-editor/src/runtime-editor/generated/engine-runtime-files.json";
import { createRetrievalAssetSource } from "@galacean/engine-runtime-editor/retrieval-agent/asset-source.ts";
import { createRetrievalAgentExtension } from "@galacean/engine-runtime-editor/retrieval-agent/index.ts";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectStorage,
  type RuntimeProjectManifest,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import type { PlanningParameterCommand } from "@galacean/engine-world-planning/spatial/PlanningSession.ts";
import { PLANT_MATERIAL_SLOTS, plantMaterialField } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters.ts";
import type { PlanningWaterCreation } from "@galacean/engine-world-planning/spatial/PlanningWaterAuthoring.ts";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel.ts";
import * as planningHeightmaps from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { createNativeWaterAgentPackage } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterAgent.ts";
import { WATER_QUERY_CONTRACTS } from "@galacean/engine-world-planning/spatial/runtime/WaterQueryContract.ts";
import type {
  SeedWorldAuthoringResource,
  SeedWorldEnginePort,
  SeedWorldLiveState,
  SeedWorldObject,
  SeedWorldResolvedSpatialTarget,
  SeedWorldResourceMutation,
  SeedWorldSpatialTarget
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort.ts";
import { SeedWorldAgentApplication } from "../../../demos/seed-world/agent-adapter/SeedWorldAgentApplication.ts";
import { createSeedWorldEngineDraft } from "../../../demos/seed-world/agent-adapter/SeedWorldEngineDraft.ts";
import { createSeedWorldWaterAgentKnowledge } from "../../../demos/seed-world/agent-adapter/SeedWorldKnowledge.ts";
import * as planningResources from "../../../demos/seed-world/agent-adapter/SeedWorldPlanningResources.ts";
import type { SeedWorldPlanningService } from "../../../demos/seed-world/agent-adapter/SeedWorldPlanningService.ts";
import type { SeedWorldAnimalService } from "../../../demos/seed-world/agent-adapter/ports/SeedWorldAnimalService.ts";
import type { SeedWorldParameterAuthoring } from "../../../demos/seed-world/agent-adapter/tools/parameter-tools.ts";
import { createSeedWorldChatAgentConfiguration } from "../../../demos/seed-world/assistant/SeedWorldChatPanel.ts";
import { SEED_WORLD_MODEL } from "../../../demos/seed-world/assistant/SeedWorldModel.ts";
import { seedWorldProjectFormats } from "../../../demos/seed-world/SeedWorldProjectFormats.ts";
import { seedWorldScriptModules } from "../../../demos/seed-world/systems/SeedWorldScriptModules.ts";
import { installAsap8082WindowShim } from "./asap-8082-transport.ts";

const require = createRequire(import.meta.url);
const WORKTREE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WATER_ASSETS_DIR = path.join(WORKTREE_ROOT, "packages/water/src/water/native/assets");
const LIB_DOM_TEXT = fs.readFileSync(require.resolve("typescript/lib/lib.dom.d.ts"), "utf8");
const LIB_DOM_ITERABLE_TEXT = fs.readFileSync(require.resolve("typescript/lib/lib.dom.iterable.d.ts"), "utf8");

function writeBoxGeometryToBuffer(
  view: DataView,
  byteOffset: number,
  min: readonly [number, number, number],
  max: readonly [number, number, number]
): number {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const corners: readonly [number, number, number][] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1]
  ];
  let off = byteOffset;
  for (const [x, y, z] of corners) {
    view.setFloat32(off, x, true);
    view.setFloat32(off + 4, y, true);
    view.setFloat32(off + 8, z, true);
    off += 12;
  }
  for (const [x, y, z] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    view.setFloat32(off, dx / len, true);
    view.setFloat32(off + 4, dy / len, true);
    view.setFloat32(off + 8, dz / len, true);
    off += 12;
  }
  const indices = [
    0, 2, 1, 0, 3, 2, // -Z
    4, 5, 6, 4, 6, 7, // +Z
    0, 4, 7, 0, 7, 3, // -X
    1, 2, 6, 1, 6, 5, // +X
    3, 7, 6, 3, 6, 2, // +Y
    0, 1, 5, 0, 5, 4  // -Y
  ];
  for (const idx of indices) {
    view.setUint16(off, idx, true);
    off += 2;
  }
  return off - byteOffset;
}

function createHelicopterGlbFixture(): Uint8Array {
  const binBytes = new Uint8Array(528);
  const binView = new DataView(binBytes.buffer);
  const stride1 = writeBoxGeometryToBuffer(binView, 0, [-1.7, 0.0, -4.6], [1.7, 2.4, 4.6]);
  const stride2 = writeBoxGeometryToBuffer(binView, stride1, [-1.7, 0.0, -1.7], [1.7, 0.2, 1.7]);
  const totalBin = stride1 + stride2;

  const gltfJson = {
    asset: { version: "2.0", generator: "seed-world-helicopter-fixture" },
    scene: 0,
    scenes: [{ name: "Helicopter", nodes: [0] }],
    nodes: [
      { name: "HelicopterRoot", children: [1, 2, 3] },
      { name: "HelicopterBody", mesh: 0 },
      { name: "MainRotor", mesh: 1, translation: [0, 2.6, 0] },
      { name: "TailRotor", mesh: 1, translation: [0, 1.4, -4.4], scale: [0.3, 0.3, 0.3] }
    ],
    materials: [
      {
        name: "HelicopterFuselageMat",
        pbrMetallicRoughness: { baseColorFactor: [0.22, 0.26, 0.32, 1], metallicFactor: 0.5, roughnessFactor: 0.4 }
      },
      {
        name: "HelicopterRotorMat",
        pbrMetallicRoughness: { baseColorFactor: [0.08, 0.08, 0.1, 1], metallicFactor: 0.7, roughnessFactor: 0.3 }
      }
    ],
    meshes: [
      {
        name: "HelicopterFuselageMesh",
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }]
      },
      {
        name: "HelicopterRotorMesh",
        primitives: [{ attributes: { POSITION: 3, NORMAL: 4 }, indices: 5, material: 1 }]
      }
    ],
    buffers: [{ byteLength: totalBin }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: 96, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: 192, byteLength: 72, target: 34963 },
      { buffer: 0, byteOffset: stride1, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: stride1 + 96, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: stride1 + 192, byteLength: 72, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-1.7, 0.0, -4.6], max: [1.7, 2.4, 4.6] },
      { bufferView: 1, componentType: 5126, count: 8, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
      { bufferView: 3, componentType: 5126, count: 8, type: "VEC3", min: [-1.7, 0.0, -1.7], max: [1.7, 0.2, 1.7] },
      { bufferView: 4, componentType: 5126, count: 8, type: "VEC3" },
      { bufferView: 5, componentType: 5123, count: 36, type: "SCALAR" }
    ]
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltfJson), "utf8");
  const jsonPaddedLen = Math.ceil(jsonRaw.length / 4) * 4;
  const jsonChunk = Buffer.alloc(jsonPaddedLen, 0x20);
  jsonRaw.copy(jsonChunk);

  const totalLen = 12 + 8 + jsonPaddedLen + 8 + totalBin;
  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0); // "glTF"
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonPaddedLen, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonChunk.copy(out, 20);
  const binHeaderOffset = 20 + jsonPaddedLen;
  out.writeUInt32LE(totalBin, binHeaderOffset);
  out.writeUInt32LE(0x004e4942, binHeaderOffset + 4); // "BIN\0"
  Buffer.from(binBytes).copy(out, binHeaderOffset + 8);
  return new Uint8Array(out);
}

const HELICOPTER_GLB_BYTES = createHelicopterGlbFixture();
const HELICOPTER_DESC_PATH = "/oss/assets/model/vehicle/helicopter/describe.json";
const HELICOPTER_GLB_PATH = "/oss/assets/model/vehicle/helicopter/helicopter.glb";
const HELICOPTER_CANDIDATE: AssetCandidate = {
  descriptionPath: HELICOPTER_DESC_PATH,
  assetPaths: ["assets/model/vehicle/helicopter/helicopter.glb"],
  assetType: "model",
  assetSubType: "vehicle",
  name: "直升机 (Helicopter)",
  descriptionExcerpt: "现代双叶螺旋桨直升机静态三维模型，带起落架与驾驶舱。",
  appearanceExcerpt: "深灰金属机身配蓝色玻璃座舱与黑色旋翼。",
  usageExcerpt: "使用 editor.asset.import 导入 helicopter.glb 后通过 Prefab/Entity 放置到场景中。"
};

const SHARED_TYPECHECK_LIBRARIES = {
  ...agentTypecheckLibraries,
  "/lib.dom.d.ts": LIB_DOM_TEXT,
  "/lib.dom.iterable.d.ts": LIB_DOM_ITERABLE_TEXT
};

let engineLoadersRegistered = false;
function ensureEngineLoadersRegistered(): void {
  if (engineLoadersRegistered) return;
  engineLoadersRegistered = true;
  registerBuildingAssetComponents();
  registerNativeFarming();
  registerNativeWater();
}

function resolveLocalFilePath(rawUrl: string): string | undefined {
  let decodedPath: string | undefined;
  if (rawUrl.startsWith("file://")) {
    try {
      decodedPath = fileURLToPath(rawUrl);
    } catch {
      return undefined;
    }
  } else if (rawUrl.startsWith("/@fs/")) {
    decodedPath = decodeURIComponent(rawUrl.slice("/@fs".length));
  } else if (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) {
    decodedPath = decodeURIComponent(rawUrl);
  }
  if (!decodedPath) return undefined;
  if (decodedPath.startsWith("/@fs/")) {
    decodedPath = decodedPath.slice("/@fs".length);
  }
  if (fs.existsSync(decodedPath)) return decodedPath;
  const fromWorktree = path.join(WORKTREE_ROOT, decodedPath.replace(/^\/+/, ""));
  if (fs.existsSync(fromWorktree)) return fromWorktree;
  return undefined;
}

function installLocalFetchShim(): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
      return originalFetch(input, init);
    }
    const localPath = resolveLocalFilePath(rawUrl);
    if (!localPath) {
      return originalFetch(input, init);
    }
    const bytes = await fsp.readFile(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const contentType =
      ext === ".json" || ext === ".mat" || ext === ".prefab" || ext === ".scene" || ext === ".mesh" || ext === ".shaderc"
        ? "application/json"
        : "application/octet-stream";
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-type": contentType }
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function syntheticHeightAt(x: number, z: number): number {
  const plateauDist = Math.hypot(x - 30, z + 35);
  if (plateauDist <= 14) return 12;
  if (plateauDist < 26) {
    const t = 1 - (plateauDist - 14) / 12;
    return 12 * (t * t * (3 - 2 * t));
  }
  return 0;
}

function syntheticSlopeAt(x: number, z: number): number {
  const plateauDist = Math.hypot(x - 30, z + 35);
  if (plateauDist <= 14) return 0.02;
  if (plateauDist < 26) return 0.35;
  return 0.05;
}

function isInsideInitialLake(x: number, z: number): boolean {
  return x >= 1 && x <= 7 && z >= 1 && z <= 7;
}

export interface RecordedToolCallEvent {
  turnIndex: number;
  step: number;
  callId: string;
  toolName: string;
  input: AgentValue;
  result?: unknown;
  ok?: boolean;
  error?: unknown;
  responseBytes?: number;
  durationMs: number;
}

export interface RecordedModelRequestEvent {
  turnIndex: number;
  step: number;
  attempt: number;
  messageCount: number;
  payloadBytes: number;
  toolsCount: number;
  modelName?: string;
  requestedModel?: string;
  finishReason?: string;
  durationMs?: number;
  telemetry?: unknown;
  validationStatus?: string;
  rawContent?: string;
  error?: string;
}

export interface RecordedScriptEvent {
  turnIndex: number;
  step: number;
  code: string;
  result?: AgentScriptResult;
  toolTrace?: readonly unknown[];
}

export interface TurnExecutionRecord {
  turnIndex: number;
  prompt: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  taskResult?: AgentTaskResult;
  error?: string;
  modelsSeen: string[];
  modelRequests: RecordedModelRequestEvent[];
  toolCalls: RecordedToolCallEvent[];
  scripts: RecordedScriptEvent[];
  events: AgentEvent[];
}

export interface HeadlessSeedWorldFixture {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly project: RuntimeProjectSession;
  readonly nativeEditor: RuntimeNativeEditor;
  readonly application: SeedWorldAgentApplication;
  readonly configuration: AgentConfiguration;
  readonly agentLoop: AgentLoop;
  readonly session: AIChatSession;
  readonly farmingSystem: FarmingSystem;
  readonly farmingArea: FarmingAreaComponent;
  readonly state: {
    getLiveState(): SeedWorldLiveState;
    getResources(): readonly SeedWorldAuthoringResource[];
    getObjects(): readonly SeedWorldObject[];
    getRemovedIds(): readonly string[];
    getEnvironmentMutations(): readonly Record<string, unknown>[];
    getRiversCreated(): readonly PlanningWaterCreation[];
    getParameterState(): { activationDistance: number; versionToken: string; applyCalls: unknown[]; plantMaterialOverrides: Record<string, number> };
    getAnimalSpawns(): readonly Record<string, unknown>[];
    getAnimalCommands(): readonly Record<string, unknown>[];
    getAnimalReceipts(): readonly Record<string, unknown>[];
    getTeleports(): readonly Record<string, unknown>[];
    getAgentConfiguration(): AgentConfiguration;
    setAgentConfiguration(next: AgentConfiguration): void;
  };
  runTurn(prompt: string, turnIndex?: number, options?: { inputSource?: "text" | "voice" }): Promise<TurnExecutionRecord>;
  seedPreUndoTransaction(entityName?: string): Promise<string>;
  seedMatureCrop(plotId?: string): Promise<void>;
  seedYoungCrop(plotId?: string): Promise<void>;
  seedAuthoredTree(position?: [number, number, number]): void;
  dispose(): Promise<void>;
}

function waterAgentKnowledge() {
  return createSeedWorldWaterAgentKnowledge(
    WATER_QUERY_CONTRACTS.map((item) => item.name),
    { includeDigRiver: true }
  );
}

function hash64(seed: number): string {
  return seed.toString(16).padStart(64, "0").slice(-64);
}

function createViewSnapshotsMock() {
  const headlessUnavailableError = () =>
    new Error("View snapshots are unavailable in this headless environment; rely on scene, asset, and runtime inspection tools to verify.");
  const budget = {
    limit: 64 * 1024 * 1024,
    stats: { total: 0, image: 0, identity: 0, temporary: 0 },
    reserve: () => () => {}
  };
  return {
    budget,
    diagnostics: toAgentValue(budget.stats),
    beginTurn() {},
    resetConversation() {},
    hasImage() {
      return false;
    },
    paths() {
      return [];
    },
    acquireAttachments() {
      return {
        export: async () => [],
        release() {}
      };
    },
    acquireImage() {
      throw headlessUnavailableError();
    },
    async snapshot() {
      throw headlessUnavailableError();
    },
    async pick() {
      throw headlessUnavailableError();
    }
  };
}

function installLocalWorkerShim(): () => void {
  const prevWorker = (globalThis as { Worker?: unknown }).Worker;
  if (prevWorker !== undefined) return () => {};

  class HeadlessNodeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    private readonly kind: "regex" | "unknown";
    private scanner: ProjectRegexScanner | undefined;
    private terminated = false;

    constructor(scriptURL: string | URL) {
      const urlText = typeof scriptURL === "string" ? scriptURL : scriptURL.href;
      if (urlText.includes("ProjectRegex.worker")) {
        this.kind = "regex";
        queueMicrotask(() => {
          if (!this.terminated) {
            this.onmessage?.({ data: { type: "ready" } } as MessageEvent);
          }
        });
      } else {
        this.kind = "unknown";
        queueMicrotask(() => {
          if (!this.terminated) {
            this.onerror?.({ message: `Unsupported worker in headless Node: ${urlText}`, preventDefault() {} } as unknown as ErrorEvent);
          }
        });
      }
    }

    postMessage(data: Record<string, unknown>) {
      if (this.terminated || this.kind !== "regex") return;
      queueMicrotask(() => {
        if (this.terminated) return;
        try {
          if (data.type === "compile") {
            this.scanner = new ProjectRegexScanner(String(data.query ?? ""), Boolean(data.caseSensitive));
            this.onmessage?.({ data: { type: "result", hits: [] } } as MessageEvent);
          } else {
            if (!this.scanner) throw new Error("Regex not initialized");
            const hits = this.scanner.push(
              String(data.text ?? ""),
              Boolean(data.first),
              Boolean(data.end),
              Number(data.limit ?? 50)
            );
            this.onmessage?.({ data: { type: "result", hits } } as MessageEvent);
          }
        } catch (err) {
          this.onmessage?.({
            data: { type: "error", message: String(err instanceof Error ? err.message : err).slice(0, 240) }
          } as MessageEvent);
        }
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  (globalThis as { Worker?: unknown }).Worker = HeadlessNodeWorker;
  return () => {
    (globalThis as { Worker?: unknown }).Worker = prevWorker;
  };
}

export async function createHeadlessSeedWorldFixture(options: {
  caseId: string;
  transformConfiguration?: (base: AgentConfiguration) => AgentConfiguration;
} = { caseId: "default" }): Promise<HeadlessSeedWorldFixture> {
  ensureEngineLoadersRegistered();
  const restoreFetch = installLocalFetchShim();
  const restoreWorker = installLocalWorkerShim();
  const asapShim = installAsap8082WindowShim({
    sessionId: `bench-${options.caseId}-${Date.now().toString(36)}`
  });

  // Guard headless null RHI shader compilation edge cases during asset loading
  const origShaderCreate = Shader.create.bind(Shader);
  const shaderCreateSpy = vi.spyOn(Shader, "create").mockImplementation(((name: string, vs?: string, fs?: string) => {
    try {
      return (origShaderCreate as Function)(name, vs, fs);
    } catch {
      return Shader.find("blinn-phong") ?? Shader.find("unlit");
    }
  }) as typeof Shader.create);

  const ktx2LoadSpy = vi.spyOn(KTX2Loader.prototype, "load").mockImplementation(function (item, resourceManager) {
    return new AssetPromise<Texture2D | Texture2DArray>(async (resolve) => {
      let layerCount = 0;
      try {
        const remoteUrl = resourceManager._getRemoteUrl(item.url!);
        const res = await fetch(remoteUrl);
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          layerCount = new KTX2Container(bytes).layerCount;
        }
      } catch {
        // Fallback to filename heuristic if remote bytes unavailable
        if (/colors|timberframe|mortar/.test(item.url ?? "")) layerCount = 1;
      }
      if (layerCount > 0) {
        const arr = new Texture2DArray(resourceManager.engine, 1, 1, layerCount);
        arr.name = item.url ?? "headless-ktx2-array";
        resolve(arr);
      } else {
        const tex = new Texture2D(resourceManager.engine, 1, 1);
        tex.name = item.url ?? "headless-ktx2";
        resolve(tex);
      }
    });
  });

  const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
  Object.defineProperty((engine as unknown as { _hardwareRenderer: Record<string, unknown> })._hardwareRenderer, "isWebGL2", {
    value: true,
    configurable: true
  });

  let revision = 3;
  let resourceSerial = 0;
  let liveState: SeedWorldLiveState = {
    world: { rootSeed: 42, sizeMetres: 1024, origin: [-512, -512] },
    camera: { mode: "roam", position: [0, 2, 0], forward: [0, 0, -1] },
    plan: { summitCount: 1, riverReachCount: 1, roadCount: 1, poiCount: 1 },
    population: {
      residentCellCount: 1,
      residentAcceptedCounts: { tree: 3, shrub: 0, flower: 0, grass: 0 },
      submittedCounts: { tree: 3, shrub: 0, flower: 0, grass: 0 }
    },
    decorations: { rocks: 1, mushrooms: 0, lotus: 0 },
    water: { ready: true, visible: true, bodyCount: 1, chunkCount: 4, hostRevision: 1 },
    lighting: {
      timeHours: 10.5,
      phase: "day",
      playing: false,
      iblPhase: "ready",
      iblProgress: 1,
      iblPublishedRevision: 1,
      iblBakingEnabled: true
    },
    environment: {
      season: "spring",
      seasonTransitionProgress: 1,
      precipitation: "none",
      rainIntensity: 0,
      snowIntensity: 0,
      cloudCoverage: 0.2,
      fogIntensity: 0.05,
      windSpeed: 2.5,
      windIntensity: 0.2,
      windDirectionDegrees: 0,
      windGustiness: 0.1,
      windTurbulence: 0.15,
      lightningFrequency: 0,
      lightningIntensity: 0
    }
  };

  const resources: SeedWorldAuthoringResource[] = [
    {
      resourceType: "water-body",
      resourceId: "authored-lake-1",
      contentHash: hash64(3),
      properties: {
        kind: "lake",
        x: 4,
        z: 4,
        radiusMetres: 4,
        depthMetres: 2,
        shorelineIrregularity: 0.2,
        canonicalWaterLevelMetres: 0.5,
        minimumWaterLevelMetres: -1.5,
        maximumWaterLevelMetres: 1.5,
        waterLevelMetres: 0.5,
        seed: 1
      }
    }
  ];

  const objects: SeedWorldObject[] = [
    {
      worldId: "seed-world-42",
      objectId: "tree-pine-near",
      objectKind: "tree",
      worldRevision: 3,
      position: [6, 0, -9],
      footprintMetres: [2, 2],
      source: { kind: "population", sourceId: "natural-forest" },
      properties: { treeSpeciesProfileKey: "pine", treeRecipeId: "pine", treeEffectIndex: 1, yawRadians: 0, scale: [1, 1, 1] }
    },
    {
      worldId: "seed-world-42",
      objectId: "tree-oak-mid",
      objectKind: "tree",
      worldRevision: 3,
      position: [14, 0, -20],
      footprintMetres: [2, 2],
      source: { kind: "population", sourceId: "natural-forest" },
      properties: { treeSpeciesProfileKey: "oak", treeRecipeId: "oak", treeEffectIndex: 2, yawRadians: 0.5, scale: [1, 1, 1] }
    },
    {
      worldId: "seed-world-42",
      objectId: "tree-birch-far",
      objectKind: "tree",
      worldRevision: 3,
      position: [-25, 0, 22],
      footprintMetres: [2, 2],
      source: { kind: "population", sourceId: "natural-forest" },
      properties: { treeSpeciesProfileKey: "birch", treeRecipeId: "birch", treeEffectIndex: 3, yawRadians: 1.2, scale: [1, 1, 1] }
    },
    {
      worldId: "seed-world-42",
      objectId: "rock-north",
      objectKind: "rock",
      worldRevision: 3,
      position: [0, 8, -45],
      footprintMetres: [24, 24],
      source: { kind: "authoring", sourceId: "initial-hill-1" },
      properties: { elevationMetres: 8, radiusMetres: 12 }
    }
  ];

  const removedIds = new Set<string>();
  const environmentMutations: Record<string, unknown>[] = [];
  const riversCreated: PlanningWaterCreation[] = [];
  const teleports: Record<string, unknown>[] = [];
  const animalSpawns: Record<string, unknown>[] = [];
  const animalCommands: Record<string, unknown>[] = [];
  const animalReceipts: Record<string, unknown>[] = [];
  let activationDistance = 256;
  let paramVersionToken = "v1";
  let paramVersionCounter = 1;
  const paramApplyCalls: unknown[] = [];
  const plantMaterialOverrides: Record<string, number> = {};
  const plantMaterialDefaults: Record<string, number> = {};
  const plantMaterialFields: Array<Record<string, unknown>> = [];
  for (const slot of PLANT_MATERIAL_SLOTS) {
    const rgb = slot.defaultColor ?? [0.5, 0.5, 0.5];
    (["r", "g", "b"] as const).forEach((ch, idx) => {
      const key = plantMaterialField(slot.assetId, slot.materialId, ch);
      plantMaterialDefaults[key] = Number(rgb[idx] ?? 0.5);
      plantMaterialFields.push({
        key,
        label: `${slot.label} (${ch})`,
        type: "number",
        description: `Linear ${ch} channel`,
        editEffect: "instance",
        min: 0,
        max: 1,
        step: 0.01,
        worldWritable: true,
        default: plantMaterialDefaults[key]
      });
    });
  }

  const applyEnvironmentPatch = (input: Record<string, unknown>) => {
    environmentMutations.push(structuredClone(input));
    const environment = { ...liveState.environment };
    if (typeof input.season === "string") environment.season = input.season as typeof environment.season;
    const preset = input.weatherPreset as string | undefined;
    if (preset === "clear") {
      Object.assign(environment, {
        precipitation: "none",
        rainIntensity: 0,
        snowIntensity: 0,
        cloudCoverage: 0.1,
        fogIntensity: 0,
        lightningFrequency: 0,
        lightningIntensity: 0
      });
    } else if (preset === "rain" || preset === "storm") {
      Object.assign(environment, {
        precipitation: "rain",
        rainIntensity: preset === "storm" ? 1 : 0.7,
        snowIntensity: 0,
        cloudCoverage: 0.9,
        lightningFrequency: preset === "storm" ? 0.65 : 0,
        lightningIntensity: preset === "storm" ? 1 : 0
      });
    } else if (preset === "snow" || preset === "blizzard") {
      Object.assign(environment, {
        precipitation: "snow",
        snowIntensity: preset === "blizzard" ? 1 : 0.75,
        rainIntensity: 0,
        cloudCoverage: 0.85,
        lightningFrequency: 0,
        lightningIntensity: 0
      });
    } else if (preset === "overcast" || preset === "fog") {
      Object.assign(environment, {
        cloudCoverage: 0.9,
        fogIntensity: preset === "fog" ? 0.85 : environment.fogIntensity
      });
    }
    if (typeof input.precipitation === "string") {
      environment.precipitation = input.precipitation as typeof environment.precipitation;
    } else if (input.precipitation && typeof input.precipitation === "object") {
      const precip = input.precipitation as {
        type?: string;
        kind?: string;
        intensity?: number;
        rainIntensity?: number;
        snowIntensity?: number;
      };
      const precipKind = precip.type ?? precip.kind;
      if (typeof precipKind === "string") {
        environment.precipitation = precipKind as typeof environment.precipitation;
      }
      if (typeof precip.intensity === "number") {
        if (precipKind === "snow") {
          environment.snowIntensity = precip.intensity;
          environment.rainIntensity = 0;
        } else if (precipKind === "rain") {
          environment.rainIntensity = precip.intensity;
          environment.snowIntensity = 0;
        } else if (precipKind === "none") {
          environment.rainIntensity = 0;
          environment.snowIntensity = 0;
        }
      }
      if (typeof precip.rainIntensity === "number") environment.rainIntensity = precip.rainIntensity;
      if (typeof precip.snowIntensity === "number") environment.snowIntensity = precip.snowIntensity;
    }
    if (typeof input.rainIntensity === "number") environment.rainIntensity = input.rainIntensity;
    if (typeof input.snowIntensity === "number") environment.snowIntensity = input.snowIntensity;
    if (typeof input.cloudCoverage === "number") environment.cloudCoverage = input.cloudCoverage;
    if (typeof input.fogIntensity === "number") environment.fogIntensity = input.fogIntensity;
    const atmosphere = input.atmosphere as { cloudCoverage?: number; cloudiness?: number; fogIntensity?: number; skyColorRgb?: readonly [number, number, number] | null } | undefined;
    if (atmosphere && typeof atmosphere === "object") {
      if (typeof atmosphere.cloudCoverage === "number") environment.cloudCoverage = atmosphere.cloudCoverage;
      if (typeof atmosphere.cloudiness === "number") environment.cloudCoverage = atmosphere.cloudiness;
      if (typeof atmosphere.fogIntensity === "number") environment.fogIntensity = atmosphere.fogIntensity;
      if (atmosphere.skyColorRgb === null) {
        delete (environment as Record<string, unknown>).skyColorRgb;
      } else if (Array.isArray(atmosphere.skyColorRgb) && atmosphere.skyColorRgb.length === 3) {
        (environment as Record<string, unknown>).skyColorRgb = [...atmosphere.skyColorRgb];
      }
    }
    if (input.skyColorRgb === null) {
      delete (environment as Record<string, unknown>).skyColorRgb;
    } else if (Array.isArray(input.skyColorRgb) && input.skyColorRgb.length === 3) {
      (environment as Record<string, unknown>).skyColorRgb = [...input.skyColorRgb];
    }
    const lightning = input.lightning as { frequency?: number; intensity?: number } | undefined;
    if (lightning && typeof lightning === "object") {
      if (typeof lightning.frequency === "number") environment.lightningFrequency = lightning.frequency;
      if (typeof lightning.intensity === "number") environment.lightningIntensity = lightning.intensity;
    }
    const weatherChannels = input.weatherChannels as Record<string, unknown> | undefined;
    if (weatherChannels && typeof weatherChannels === "object") {
      const numericKeys = [
        "rainIntensity",
        "snowIntensity",
        "cloudCoverage",
        "fogIntensity",
        "windSpeed",
        "windDirectionDegrees",
        "windGustiness",
        "windTurbulence",
        "lightningFrequency",
        "lightningIntensity"
      ] as const;
      for (const k of numericKeys) {
        if (typeof weatherChannels[k] === "number") {
          (environment as Record<string, unknown>)[k] = weatherChannels[k];
        }
      }
      if (typeof weatherChannels.snowIntensity === "number" && weatherChannels.snowIntensity > 0) {
        environment.precipitation = "snow";
      } else if (typeof weatherChannels.rainIntensity === "number" && weatherChannels.rainIntensity > 0) {
        environment.precipitation = "rain";
      } else if (weatherChannels.snowIntensity === 0 && weatherChannels.rainIntensity === 0 && preset === undefined && input.precipitation === undefined) {
        environment.precipitation = "none";
      }
    }
    const wind = input.wind as Record<string, number> | undefined;
    if (wind) {
      if (typeof wind.speedMetresPerSecond === "number") environment.windSpeed = wind.speedMetresPerSecond;
      if (typeof wind.directionDegrees === "number") environment.windDirectionDegrees = wind.directionDegrees;
      if (typeof wind.gustiness === "number") environment.windGustiness = wind.gustiness;
      if (typeof wind.turbulence === "number") environment.windTurbulence = wind.turbulence;
    }
    const timeHours = typeof input.timeHours === "number" ? input.timeHours : liveState.lighting.timeHours;
    const phase =
      timeHours >= 5 && timeHours < 7
        ? "dawn"
        : timeHours >= 7 && timeHours < 17
          ? "day"
          : timeHours >= 17 && timeHours < 19.5
            ? "dusk"
            : "night";
    liveState = {
      ...liveState,
      lighting: { ...liveState.lighting, timeHours, phase },
      environment
    };
  };

  const realizeVegetation = (resourceId: string, val: any): number => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const s = objects[i]!.source;
      if (s.kind === "authoring" && s.sourceId === resourceId) objects.splice(i, 1);
    }
    const count = val.requestedPlantCount ?? (val.distributionKind === "area" ? 10 : 1);
    for (let i = 0; i < count; i++) {
      objects.push({
        worldId: "seed-world-42",
        objectId: `pop:${resourceId}:${val.category}:${i}`,
        objectKind: val.category,
        worldRevision: revision,
        position: [val.x + (i % 4) - 1.5, 0, val.z + Math.floor(i / 4) - 1.5],
        footprintMetres: [1.5, 1.5],
        source: { kind: "authoring", sourceId: resourceId },
        properties: {
          ...(val.category === "tree" ? { treeSpeciesProfileKey: val.species ?? "pine" } : {}),
          yawRadians: 0,
          scale: [1, 1, 1]
        }
      });
    }
    return count;
  };

  const mutateResources = async (mutations: readonly Readonly<SeedWorldResourceMutation>[]) => {
    revision += 1;
    const results = mutations.map((mutation) => {
      if (mutation.resourceType === "tree-variation") {
        const val = mutation.value as { recipeId?: string; variationIndex?: number; controls?: Record<string, unknown> };
        for (const obj of objects) {
          const props = obj.properties as Record<string, unknown>;
          if (
            obj.objectKind === "tree" &&
            props.treeRecipeId === val.recipeId &&
            props.treeEffectIndex === Number(val.variationIndex ?? 0) + 1
          ) {
            props.treeShape = { ...((props.treeShape as Record<string, unknown>) ?? {}), ...(val.controls ?? {}) };
          }
        }
        return {
          action: mutation.action,
          resourceType: mutation.resourceType,
          resourceId: JSON.stringify([mutation.value.recipeId, mutation.value.variationIndex])
        };
      }
      if (mutation.action === "create") {
        const resourceId =
          mutation.resourceType === "object-removal" ? mutation.value.objectId : `${mutation.resourceType}-${++resourceSerial}`;
        if (mutation.resourceType === "object-removal") {
          removedIds.add(resourceId);
          return { action: mutation.action, resourceType: mutation.resourceType, resourceId };
        }
        const resource: SeedWorldAuthoringResource = {
          resourceType: mutation.resourceType,
          resourceId,
          contentHash: hash64(revision),
          properties: { ...mutation.value }
        } as SeedWorldAuthoringResource;
        resources.push(resource);
        let realizedPlantCount: number | undefined;
        if (mutation.resourceType === "vegetation-brush" && (mutation.value.category === "tree" || mutation.value.category === "shrub")) {
          realizedPlantCount = realizeVegetation(resourceId, mutation.value);
        }
        return {
          action: mutation.action,
          resourceType: mutation.resourceType,
          resourceId,
          resource,
          ...(realizedPlantCount !== undefined ? { realizedPlantCount } : {})
        };
      }
      const idx = resources.findIndex((r) => r.resourceId === mutation.resourceId);
      if (idx < 0) throw new Error(`Missing resource '${mutation.resourceId}'`);
      if (mutation.action === "delete") {
        resources.splice(idx, 1);
        return { action: mutation.action, resourceType: mutation.resourceType, resourceId: mutation.resourceId };
      }
      const updated = {
        ...resources[idx]!,
        contentHash: hash64(revision),
        properties: { ...resources[idx]!.properties, ...mutation.patch }
      } as SeedWorldAuthoringResource;
      resources[idx] = updated;
      let realizedPlantCount: number | undefined;
      if (
        updated.resourceType === "vegetation-brush" &&
        ((updated.properties as any)?.category === "tree" || (updated.properties as any)?.category === "shrub")
      ) {
        realizedPlantCount = realizeVegetation(mutation.resourceId, updated.properties);
      }
      return {
        action: mutation.action,
        resourceType: mutation.resourceType,
        resourceId: mutation.resourceId,
        resource: updated,
        ...(realizedPlantCount !== undefined ? { realizedPlantCount } : {})
      };
    });
    return {
      transactionId: `tx-${revision}`,
      action: mutations.length === 1 ? mutations[0]!.action : ("batch" as const),
      results,
      authoring: { activeRevision: revision, acceptedDraftRevision: revision, authoringStateHash: hash64(revision) }
    };
  };

  const port: SeedWorldEnginePort = {
    readWorldState: () => structuredClone(liveState),
    readEditorDefaults: () => ({
      waterColors: [],
      camera: structuredClone(liveState.camera),
      environment: {
        timeHours: liveState.lighting.timeHours,
        transitionDuration: 0,
        waitForIbl: false
      }
    }),
    readAuthoringSnapshot: () => ({
      activeRevision: revision,
      draftRevision: revision,
      authoringStateHash: hash64(revision),
      resources: structuredClone(resources),
      removedObjectIds: [...removedIds]
    }),
    queryWorldPoints: (input) => {
      const effectiveHeightAt = (x: number, z: number): number => {
        let h = syntheticHeightAt(x, z);
        for (const r of resources) {
          const p = r.properties as Record<string, any> | undefined;
          if (!p) continue;
          const pos = Array.isArray((r as { position?: unknown }).position)
            ? ((r as { position?: readonly number[] }).position as readonly number[])
            : undefined;
          const cx =
            typeof p.x === "number"
              ? p.x
              : typeof p.centerX === "number"
                ? p.centerX
                : typeof pos?.[0] === "number"
                  ? pos[0]
                  : undefined;
          const cz =
            typeof p.z === "number"
              ? p.z
              : typeof p.centerZ === "number"
                ? p.centerZ
                : typeof pos?.[2] === "number"
                  ? pos[2]
                  : undefined;
          if (cx === undefined || cz === undefined) continue;
          const dist = Math.hypot(x - cx, z - cz);
          if (r.resourceType === "terrain-feature") {
            const halfSpan =
              typeof p.lengthMetres === "number" || typeof p.widthMetres === "number"
                ? Math.max(Number(p.lengthMetres ?? 0), Number(p.widthMetres ?? 0)) * 0.5
                : undefined;
            const radius = Number(
              p.radiusMetres ?? p.radius ?? p.influenceMajorRadiusMetres ?? p.overallRadiusMetres ?? halfSpan ?? 20
            );
            const hillRelief =
              typeof p.pedestalLiftMetres === "number" || typeof p.peakReliefMetres === "number"
                ? Number(p.pedestalLiftMetres ?? 0) + Number(p.peakReliefMetres ?? 0)
                : undefined;
            const height = Number(
              p.elevationDeltaMetres ??
                hillRelief ??
                p.peakHeightMetres ??
                p.heightMetres ??
                p.baseElevationMetres ??
                p.amplitude ??
                0
            );
            if (radius > 0 && dist < radius && Number.isFinite(height)) {
              const t = 1 - dist / radius;
              h += height * t * t * (3 - 2 * t);
            }
          } else if (r.resourceType === "terrain-patch") {
            const radius = Number(p.radiusMetres ?? p.radius ?? 10);
            const delta = Number(p.deltaMetres ?? p.delta ?? p.heightDeltaMetres ?? (p.operation === "lower" ? -2 : 2));
            if (radius > 0 && dist < radius && Number.isFinite(delta)) {
              const t = 1 - dist / radius;
              h += delta * t * t * (3 - 2 * t);
            }
          }
        }
        return h;
      };
      if (input.mode === "sample") {
        return {
          samples: input.positions.map((pos: { x: number; z: number } | readonly [number, number]) => {
            const x = Array.isArray(pos) ? Number(pos[0]) : Number((pos as { x: number }).x);
            const z = Array.isArray(pos) ? Number(pos[1]) : Number((pos as { z: number }).z);
            const h = effectiveHeightAt(x, z);
            const water = isInsideInitialLake(x, z);
            return {
              insideWorld: Math.abs(x) <= 512 && Math.abs(z) <= 512,
              position: [x, h, z],
              height: h,
              elevation: h,
              slope: syntheticSlopeAt(x, z),
              water,
              ...(water ? { waterSurfaceElevationMetres: 0.5 } : {}),
              moisture: 0.4,
              riverDistanceMetres: 20,
              roadDistanceMetres: 20
            };
          })
        };
      }
      const constraints = (input as { constraints?: { water?: boolean } }).constraints;
      if (constraints?.water === true) {
        return {
          inspectedPointCount: 64,
          matchedPointCount: 1,
          effectiveSpacingMetres: (input as { spacingMetres?: number }).spacingMetres ?? 10,
          points: [
            {
              position: [4, 0.5, 4],
              elevation: 0.5,
              slope: 0,
              moisture: 1.0,
              water: true,
              riverDistanceMetres: 0,
              roadDistanceMetres: 15
            }
          ]
        };
      }
      return {
        inspectedPointCount: 64,
        matchedPointCount: 2,
        effectiveSpacingMetres: (input as { spacingMetres?: number }).spacingMetres ?? 10,
        points: [
          {
            position: [30, 12, -35],
            elevation: 12,
            slope: 0.02,
            moisture: 0.3,
            water: false,
            riverDistanceMetres: 40,
            roadDistanceMetres: 25
          },
          {
            position: [28, 12, -33],
            elevation: 12,
            slope: 0.03,
            moisture: 0.3,
            water: false,
            riverDistanceMetres: 38,
            roadDistanceMetres: 24
          }
        ]
      };
    },
    queryWorldRegions: (kind) => {
      if (kind === "summit") return { features: [{ id: "summit-1", position: [30, 12, -35], elevation: 12 }] };
      if (kind === "plateau") return { features: [{ id: "plateau-1", position: [30, 12, -35], elevation: 12 }] };
      return { features: [] };
    },
    queryWorldObjects: (input) => ({
      worldId: "seed-world-42",
      worldRevision: revision,
      inspectedObjectCount: objects.length,
      objects: objects
        .filter((obj) => !removedIds.has(obj.objectId))
        .filter((obj) => input.kinds.includes(obj.objectKind))
        .filter((obj) => {
          const spatial = input.spatial;
          if (!spatial || spatial.anchor.kind !== "position") return true;
          return (
            Math.hypot(obj.position[0] - spatial.anchor.x, obj.position[2] - spatial.anchor.z) <=
            (spatial.maximumDistanceMetres ?? Number.POSITIVE_INFINITY)
          );
        })
        .slice(0, input.limit)
    }),
    getWorldObject: (id) => {
      const obj = objects.find((item) => item.objectId === id && !removedIds.has(id));
      if (!obj) throw new Error(`Missing world object '${id}'`);
      return obj;
    },
    resolveSpatialTarget: (target: Readonly<SeedWorldSpatialTarget>): SeedWorldResolvedSpatialTarget => {
      const anchorPos =
        target.anchor.kind === "position"
          ? [target.anchor.x, target.anchor.z]
          : target.anchor.kind === "viewer"
            ? [
                liveState.camera.position[0] + liveState.camera.forward[0] * (target.relation.kind === "inFront" ? target.relation.distanceMetres : 0),
                liveState.camera.position[2] + liveState.camera.forward[2] * (target.relation.kind === "inFront" ? target.relation.distanceMetres : 0)
              ]
            : [0, 0];
      const [x, z] = anchorPos;
      return {
        geometry: target.relation.kind === "around" ? "area" : "point",
        position: [x, syntheticHeightAt(x, z), z],
        radiusMetres: target.relation.kind === "around" ? target.relation.radiusMetres : undefined,
        anchor: { kind: target.anchor.kind },
        relation: target.relation,
        worldRevision: revision
      };
    },
    readTerrainPatchConstraints: () => ({ heightSampleSpacingMetres: 2, minimumRadiusMetres: 2 * Math.SQRT2 * 2 }),
    teleport: ({ x, z, heightOffset }) => {
      const y = syntheticHeightAt(x, z) + heightOffset;
      liveState = { ...liveState, camera: { ...liveState.camera, position: [x, y, z] } };
      teleports.push({ x, y, z, heightOffset });
      return { cameraPosition: [x, y, z] };
    },
    updateEnvironment: async (input) => {
      applyEnvironmentPatch(input as Record<string, unknown>);
      return { requested: { ...input }, state: structuredClone(liveState) };
    },
    mutateWorldResource: (mutation) => mutateResources([mutation]),
    mutateWorldResources: (mutations) => mutateResources(mutations),
    previewTreeVariationEdit: () => ({ minimum: [0, 0, 0] as const, maximum: [20, 20, 20] as const })
  };

  port.beginEdit = (id, settings) =>
    createSeedWorldEngineDraft(
      port,
      {
        environment: (current, input) => {
          applyEnvironmentPatch(input as Record<string, unknown>);
          return {
            state: structuredClone(liveState),
            forward: input,
            previous: { timeHours: current.lighting.timeHours, transitionDuration: 0, waitForIbl: false }
          };
        },
        teleport: ({ x, z, heightOffset }) => {
          const groundY = syntheticHeightAt(x, z);
          const y = groundY + heightOffset;
          liveState = { ...liveState, camera: { ...liveState.camera, position: [x, y, z] } };
          teleports.push({ x, y, z, heightOffset });
          return { cameraPosition: [x, y, z], navigationSurfaceHeight: groundY };
        },
        restoreCamera: (cam) => {
          liveState = { ...liveState, camera: structuredClone(cam) };
        },
        validateMount: () => {}
      },
      id,
      settings
    );

  const planningHeightmapSpy = vi
    .spyOn(planningHeightmaps, "planningHeightmap")
    .mockImplementation(
      () =>
        ({
          sample: ({ x, z }: { x: number; z: number }) => syntheticHeightAt(x, z)
        }) as unknown as planningHeightmaps.PlanningHeightmap
    );

  const createResourcePortSpy = vi
    .spyOn(planningResources, "createPlanningResourcePort")
    .mockImplementation((base) => {
      const overrides: Partial<SeedWorldEnginePort> = {
        mutateWorldResource: (mutation, signal) => port.mutateWorldResource(mutation, signal),
        mutateWorldResources: (mutations, signal) => port.mutateWorldResources(mutations, signal),
        validateWorldResources: async () => {}
      };
      return new Proxy(base, {
        get(target, property) {
          const override = Reflect.get(overrides, property);
          if (override !== undefined) return override;
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    });

  // Planning mock supporting water.digRiver + RiverPlacementTest + PlanningDocument lifecycle
  const makePlanningDoc = () => ({
    version: 1 as const,
    revision,
    passthrough: {},
    entities: { world: { id: "world", components: {} } },
    authoredResources: [],
    plan: {
      land: [
        { x: -200, z: -200 },
        { x: 200, z: -200 },
        { x: 200, z: 200 },
        { x: -200, z: 200 }
      ],
      islands: [],
      waters: [...riversCreated],
      routes: [],
      places: [],
      bridges: [],
      sights: [],
      spawn: { x: 0, z: 0 },
      prompt: "",
      regions: [],
      buildings: [],
      ridges: [],
      supports: [],
      slopes: [],
      courtyards: [],
      fences: [],
      roadApproaches: [],
      flowerRegions: [],
      landscapes: [],
      rocks: [],
      mountains: [],
      authoredResources: [],
      raster: { heightSamples: 1024, alphaSamples: 1024, spacing: 1 },
      parameters: { width: 1024, depth: 1024, seed: 42, terrainPatches: [] },
      worldTemplateSite: { footprints: [] }
    } as unknown as IslandPlan,
    rivers: structuredClone(riversCreated)
  });
  let planningDocState = makePlanningDoc();
  const planningService = {
    invalidateAssets: () => false,
    document: () => structuredClone(planningDocState),
    riverPlacementTest: () => () => true,
    async createWater(input: PlanningWaterCreation) {
      riversCreated.push(structuredClone(input));
      revision += 1;
      planningDocState = makePlanningDoc();
      liveState = {
        ...liveState,
        water: { ...liveState.water, bodyCount: liveState.water.bodyCount + 1, hostRevision: liveState.water.hostRevision + 1 }
      };
      return { status: "accepted", id: input.id };
    },
    beginEdit() {
      const snapshotDoc = structuredClone(planningDocState);
      const snapshotResources = structuredClone(resources);
      const snapshotRemoved = [...removedIds];
      const snapshotObjects = structuredClone(objects);
      const snapshotRivers = structuredClone(riversCreated);
      const snapshotRevision = revision;
      const snapshotLiveState = structuredClone(liveState);
      let edited = false;
      const sessionObj: Record<string, unknown> = {
        get result() {
          return { plan: planningDocState.plan };
        },
        get document() {
          return planningDocState;
        },
        export: () => structuredClone(planningDocState),
        load: async (doc?: Record<string, unknown>) => {
          if (doc) {
            planningDocState = { ...makePlanningDoc(), ...structuredClone(doc) };
          }
          return { status: "accepted", revision, changedIds: [], diagnostics: [] };
        },
        forkAuthoringDraft: () => sessionObj
      };
      const editService: unknown = {
        invalidateAssets: () => false,
        document: () => structuredClone(planningDocState),
        riverPlacementTest: () => () => true,
        async createWater(input: PlanningWaterCreation) {
          edited = true;
          return planningService.createWater(input);
        }
      };
      const hasPlanningEdits = () =>
        edited ||
        JSON.stringify(snapshotDoc) !== JSON.stringify(planningDocState) ||
        JSON.stringify(snapshotResources) !== JSON.stringify(resources) ||
        snapshotRemoved.length !== removedIds.size ||
        snapshotRivers.length !== riversCreated.length;
      return {
        before: snapshotDoc,
        service: editService,
        session: sessionObj,
        document: () => {
          planningDocState.revision = revision;
          return structuredClone(planningDocState);
        },
        hasEdits: hasPlanningEdits,
        invalidateResources: () => {},
        prepare: async () => {},
        commit: () => {},
        activate: async () => {},
        discard: () => {
          resources.splice(0, resources.length, ...snapshotResources);
          removedIds.clear();
          for (const id of snapshotRemoved) removedIds.add(id);
          objects.splice(0, objects.length, ...snapshotObjects);
          riversCreated.splice(0, riversCreated.length, ...snapshotRivers);
          revision = snapshotRevision;
          liveState = snapshotLiveState;
          planningDocState = snapshotDoc;
        }
      };
    }
  } as unknown as SeedWorldPlanningService;

  const parameterAuthoring: SeedWorldParameterAuthoring = {
    forSession: () => parameterAuthoring,
    describe: (component?: string) => {
      const animalsSchema = {
        type: "animals",
        label: "动物系统",
        description: "动物种群与实体激活范围配置",
        version: 1,
        fields: [
          {
            key: "activationDistance",
            label: "激活距离",
            type: "number",
            description: "动物模型激活与加载的最大距离",
            editEffect: "instance",
            unit: "m",
            min: 32,
            max: 1024,
            step: 1,
            worldWritable: true,
            default: 256
          }
        ],
        scopes: { world: true, instances: [] }
      };
      const plantMaterialSchema = {
        type: "plantMaterial",
        label: "植被共享材质",
        description: "世界级植被部位共享材质线性 RGB 参数",
        version: 1,
        fields: plantMaterialFields,
        scopes: { world: true, instances: [] }
      };
      const all = [animalsSchema, plantMaterialSchema];
      return component ? all.filter((s) => s.type === component) : all;
    },
    query: (filter) => {
      const comp = filter && (filter as { component?: string }).component;
      if (comp && comp !== "animals" && comp !== "plantMaterial") {
        return [];
      }
      return [
        {
          id: "world",
          name: "World",
          kind: "world",
          authoredFields: {
            animals: ["activationDistance"],
            plantMaterial: Object.keys(plantMaterialOverrides)
          },
          components: ["animals", "plantMaterial"]
        }
      ];
    },
    inspect: (id: string) => {
      if (id !== "world") throw new Error(`Unknown entity '${id}'`);
      const pmValues: Record<string, number> = { ...plantMaterialDefaults, ...plantMaterialOverrides };
      const pmSources: Record<string, string[]> = {};
      for (const k of Object.keys(plantMaterialDefaults)) {
        pmSources[k] = k in plantMaterialOverrides ? ["world"] : ["default"];
      }
      return {
        id: "world",
        name: "World",
        kind: "world",
        versionToken: paramVersionToken,
        components: [
          {
            type: "animals",
            values: { activationDistance },
            sources: { activationDistance: ["world"] },
            local: { activationDistance },
            limits: { activationDistance: { min: 32, max: 1024 } }
          },
          {
            type: "plantMaterial",
            values: pmValues,
            sources: pmSources,
            local: { ...plantMaterialOverrides },
            limits: {}
          }
        ]
      };
    },
    apply: async (commands: PlanningParameterCommand[], versionToken: string) => {
      if (versionToken !== paramVersionToken) {
        return {
          status: "rejected",
          versionToken: paramVersionToken,
          changedIds: [],
          diagnostics: [{ status: "conflict", required: true, message: "Stale versionToken" }],
          message: "Stale versionToken"
        };
      }
      paramApplyCalls.push(structuredClone(commands));
      for (const cmd of commands) {
        if (cmd.entity === "world" && cmd.component === "animals") {
          if (cmd.op === "set" && typeof cmd.values.activationDistance === "number") {
            activationDistance = cmd.values.activationDistance;
          } else if (cmd.op === "reset") {
            activationDistance = 256;
          }
        } else if (cmd.entity === "world" && cmd.component === "plantMaterial") {
          if (cmd.op === "set" && cmd.values) {
            for (const [k, v] of Object.entries(cmd.values)) {
              if (typeof v === "number") plantMaterialOverrides[k] = v;
            }
          } else if (cmd.op === "reset") {
            const fields = (cmd as { fields?: readonly string[] }).fields;
            if (Array.isArray(fields) && fields.length) {
              for (const k of fields) delete plantMaterialOverrides[k];
            } else {
              for (const k of Object.keys(plantMaterialOverrides)) delete plantMaterialOverrides[k];
            }
          }
        }
      }
      paramVersionCounter += 1;
      paramVersionToken = `v${paramVersionCounter}`;
      return {
        status: "accepted",
        versionToken: paramVersionToken,
        changedIds: ["world"],
        diagnostics: [{ status: "applied", required: false }],
        message: `activationDistance=${activationDistance}, plantMaterialOverrides=${Object.keys(plantMaterialOverrides).length}`
      };
    }
  };

  let spawnedAnimalCounter = 0;
  const spawnedAnimalsList: Array<{
    speciesId: string;
    id: string;
    typeId: string;
    label: string;
    loaded: boolean;
    visible: boolean;
    position: [number, number, number];
  }> = [];

  const dogCatalogEntry = {
    typeId: "cute_zoo_dog",
    label: "小狗 · Cute Zoo",
    aliases: ["小狗", "狗", "dog", "puppy", "cute_zoo_dog"],
    pack: "cute-zoo" as const,
    speciesId: "dog",
    modelUrl: "https://cdn.example.test/animals/cute_zoo_dog.glb",
    appearances: [{ id: "brown", label: "棕色", modelUrl: "https://cdn.example.test/animals/cute_zoo_dog_brown.glb" }]
  };

  const animalService: SeedWorldAnimalService = {
    catalog: (query) => {
      const q = (query.search ?? "").trim().toLowerCase();
      const matched = !q || dogCatalogEntry.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase())) || dogCatalogEntry.label.toLowerCase().includes(q);
      const entries = matched ? [dogCatalogEntry] : [];
      return {
        summary: {
          scope: "all-matches",
          unit: "model-type",
          total: entries.length,
          speciesCount: entries.length,
          appearanceCount: entries.length,
          returned: entries.length,
          hasMore: false
        },
        entries,
        matchedCount: entries.length,
        offset: query.offset ?? 0
      };
    },
    spawn: async (input) => {
      animalSpawns.push(structuredClone(input));
      const id = `animal-dog-${++spawnedAnimalCounter}`;
      const pos: [number, number, number] = [input.position?.x ?? 0, 0, input.position?.z ?? -10];
      spawnedAnimalsList.push({
        speciesId: "dog",
        id,
        typeId: input.typeId,
        label: dogCatalogEntry.label,
        loaded: true,
        visible: true,
        position: pos
      });
      return {
        requestId: input.requestId,
        status: "accepted",
        id,
        typeId: input.typeId,
        appearanceId: input.appearanceId ?? "brown"
      };
    },
    query: (input) => {
      const filtered = spawnedAnimalsList.filter((a) => !input.typeId || a.typeId === input.typeId);
      return {
        enabled: true,
        animals: filtered,
        matchedCount: filtered.length,
        offset: input.offset ?? 0
      };
    },
    describe: ({ id }) => ({
      id,
      available: true,
      skills: [
        { skillId: "roam", label: "自由漫步", repeat: true, background: true, requiresTarget: false },
        { skillId: "idle", label: "原地待机", repeat: true, background: false, requiresTarget: false }
      ],
      targets: [
        {
          query: "around",
          label: "附近区域",
          description: "在指定坐标半径内漫步",
          parameters: [
            { name: "x", type: "number", required: true, description: "中心 X" },
            { name: "z", type: "number", required: true, description: "中心 Z" },
            { name: "radius", type: "number", required: false, description: "半径" }
          ]
        }
      ]
    }),
    command: (cmd) => {
      animalCommands.push(structuredClone(cmd));
      const rec = {
        id: cmd.id,
        requestId: cmd.requestId,
        skillId: cmd.skillId,
        target: cmd.target,
        status: "running" as const
      };
      animalReceipts.push(rec);
      return rec;
    },
    receipt: ({ id, requestId }) => ({
      id,
      requestId,
      status: "completed"
    })
  };

  // Load initial scene with lake prefab component props + building/farming/lantern nodes
  const lakePrefabJson = JSON.parse(fs.readFileSync(path.join(WATER_ASSETS_DIR, "Water/Presets/lake.prefab"), "utf8"));
  const lakeComponentProps = structuredClone(lakePrefabJson.components[0].props);
  const lakeMatText = fs.readFileSync(path.join(WATER_ASSETS_DIR, "Water/Materials/lake.mat"), "utf8");
  const manualBedJsonText = fs.readFileSync(path.join(WATER_ASSETS_DIR, "Water/Terrain/manual-bed.json"), "utf8");
  const manualBedBinBytes = new Uint8Array(fs.readFileSync(path.join(WATER_ASSETS_DIR, "Water/Terrain/manual-bed.bin")));

  const mainSceneContent = {
    asset: { version: "2.0" },
    scene: {
      rootEntities: ["building-host", "farm-owner", "lake-root", "lantern-root"],
      background: { mode: 0, color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }
    },
    entities: [
      { id: "building-host", name: "BuildingHost", position: [0, 0, 0], components: [] },
      { id: "farm-owner", name: "FarmRoot", position: [0, 0, 0], components: ["farm-system"] },
      { id: "lake-root", name: "LakeWater", position: [0, 0, 0], components: ["lake-body"] },
      { id: "lantern-root", name: "Lantern", position: [3, 1, -4], components: [] }
    ],
    components: [
      { id: "farm-system", type: "FarmingSystem", props: {} },
      { id: "lake-body", type: "WaterBodyComponent", props: lakeComponentProps }
    ]
  };

  const baseFiles: RuntimeProjectManifest["files"] = [
    {
      virtualPath: "Scenes/Main.scene",
      path: "Scenes/Main.scene",
      type: "Scene",
      dependencies: ["Water/Materials/lake.mat", "Water/Terrain/manual-bed.json", "Water/Terrain/manual-bed.bin"]
    },
    {
      virtualPath: "Water/Materials/lake.mat",
      path: "Water/Materials/lake.mat",
      type: "Material",
      dependencies: ["Water/Textures/grasslands-water-normal-1024.ktx2"]
    },
    { virtualPath: "Water/Terrain/manual-bed.json", path: "Water/Terrain/manual-bed.json", type: "JSON", dependencies: [] },
    { virtualPath: "Water/Terrain/manual-bed.bin", path: "Water/Terrain/manual-bed.bin", type: "Buffer", dependencies: [] },
    ...(options.caseId === "63_assets_list_filter_info_inspect"
      ? [{ virtualPath: "Models/sample-prop.glb", path: "Models/sample-prop.glb", type: "GLTF" as const, dependencies: [] }]
      : [])
  ];

  const existingVPaths = new Set(baseFiles.map((f) => f.virtualPath));
  const mergedFiles: RuntimeProjectManifest["files"] = [
    ...baseFiles,
    ...builtinBuildingAssetFiles
      .filter((f) => !existingVPaths.has(f.virtualPath))
      .map((f) => ({ ...f, dependencies: f.dependencies ?? [] })),
    ...builtinBuildingPresetFiles
      .filter((f) => !existingVPaths.has(f.virtualPath))
      .map((f) => ({ ...f, dependencies: f.dependencies ?? [] })),
    ...builtinWaterDefaultFiles
      .filter((f) => !existingVPaths.has(f.virtualPath) && f.virtualPath !== "Water/Materials/lake.mat")
      .map((f) => ({ ...f, dependencies: f.dependencies ?? [] }))
  ];

  const initialPack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "Scenes/Main.scene", files: mergedFiles },
    contents: {
      "Scenes/Main.scene": JSON.stringify(mainSceneContent),
      "Water/Materials/lake.mat": lakeMatText,
      "Water/Terrain/manual-bed.json": manualBedJsonText,
      "Water/Terrain/manual-bed.bin": manualBedBinBytes,
      ...(options.caseId === "63_assets_list_filter_info_inspect"
        ? { "Models/sample-prop.glb": createHelicopterGlbFixture() }
        : {})
    },
    documents: {}
  };

  const storageSpy = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => structuredClone(initialPack),
    save: async () => {},
    close: () => {}
  } as unknown as RuntimeProjectStorage);

  const workerCompileSpy = vi.spyOn(RuntimeScriptWorker.prototype, "compile").mockImplementation(
    async (sources, signal, entries, analyzeOnly = false, externals = {}, declarations = {}) => {
      signal?.throwIfAborted();
      const checked = checkRuntimeScripts(
        sources,
        {
          ...(engineRuntimeFilesJson as Record<string, string>),
          ...runtimeHostDeclarations(Object.keys(externals)),
          ...declarations
        },
        SHARED_TYPECHECK_LIBRARIES,
        entries,
        analyzeOnly
      );
      if (analyzeOnly) {
        return {
          entries: {},
          files: {},
          dependencies: checked.dependencies,
          resolutions: checked.resolutions
        };
      }
      const built = await buildRuntimeScripts(
        checked,
        externals,
        (opts) => esbuild.build(opts as esbuild.BuildOptions) as unknown as Promise<esbuild.BuildResult>
      );
      return { ...built, resolutions: checked.resolutions };
    }
  );

  // Node 24 cannot dynamic-import blob:nodedata URLs produced by URL.createObjectURL in RuntimeScriptModules.file();
  // convert to data:text/javascript;base64,... while preserving galacean.runtime-script-hosts mapping.
  type ScriptModuleFileRecord = { code: string; url: string };
  const scriptModulesProto = RuntimeScriptModules.prototype as unknown as {
    file(this: RuntimeScriptModules, p: string): ScriptModuleFileRecord;
  };
  const origScriptFile = scriptModulesProto.file;
  const scriptFileSpy = vi.spyOn(scriptModulesProto, "file").mockImplementation(function (this: RuntimeScriptModules, p: string) {
    const mod = origScriptFile.call(this, p);
    if (mod.url.startsWith("blob:")) {
      const hostsKey = Symbol.for("galacean.runtime-script-hosts");
      const hostsMap = (globalThis as unknown as Record<symbol, Map<string, unknown>>)[hostsKey];
      const oldUrl = mod.url;
      const ext = hostsMap?.get(oldUrl);
      const dataUrl = `data:text/javascript;base64,${Buffer.from(mod.code, "utf8").toString("base64")}`;
      if (hostsMap && ext !== undefined) {
        hostsMap.delete(oldUrl);
        hostsMap.set(dataUrl, ext);
      }
      URL.revokeObjectURL(oldUrl);
      mod.url = dataUrl;
    }
    return mod;
  });

  const project = await RuntimeProjectSession.open(
    `bench-${options.caseId}-${crypto.randomUUID()}`,
    initialPack.project,
    "https://seed-world.local/",
    { scriptModules: seedWorldScriptModules }
  );
  project.registerAssetFormats(seedWorldProjectFormats);
  await project.initializeDependencies();
  const virtualResources = await project.resources();
  engine.resourceManager.registerVirtualResources(virtualResources);
  const scene = await engine.resourceManager.load<Scene>({
    type: AssetType.Scene,
    url: project.projectPackage.project.scene
  });
  engine.sceneManager.activeScene = scene;

  // Retrieval stub (Case 15)
  const CORPUS_HASH = "a".repeat(64);
  const retrievalStub: Pick<RetrievalClient, "searchAssets" | "readAssetDescriptions" | "readText" | "resourceSet"> = {
    async searchAssets(input: SearchInput): Promise<SearchResult> {
      const q = input.query.toLowerCase();
      const matches = /直升机|helicopter|aircraft|飞行|plane/.test(q) ? [HELICOPTER_CANDIDATE] : [];
      return {
        matches,
        scanned: 1,
        matchedCount: matches.length,
        truncated: false,
        nextOffset: null,
        corpusHash: CORPUS_HASH
      };
    },
    async readAssetDescriptions(input: DescriptionsInput): Promise<DescriptionsResult> {
      const matches = input.descriptionPaths
        .filter((p) => p === HELICOPTER_DESC_PATH)
        .map((descriptionPath) => ({
          descriptionPath,
          metadata: {
            name: HELICOPTER_CANDIDATE.name,
            assetType: "model",
            dimensionsMetres: { width: 3.4, height: 2.8, length: 9.2 },
            usage: HELICOPTER_CANDIDATE.usageExcerpt,
            mainAssetPath: HELICOPTER_GLB_PATH
          }
        }));
      return { matches, nextOffset: null, corpusHash: CORPUS_HASH };
    },
    async readText() {
      return "# 直升机模型\n使用 editor.asset.import 导入 `/oss/assets/model/vehicle/helicopter/helicopter.glb`。";
    },
    async resourceSet(source: string): Promise<AssetResourceSet> {
      return {
        root: "/oss/assets/model/vehicle/helicopter",
        candidate: HELICOPTER_CANDIDATE,
        resources: [
          { path: HELICOPTER_GLB_PATH, url: "https://cdn.example.test/helicopter/helicopter.glb" },
          { path: HELICOPTER_DESC_PATH, url: "https://cdn.example.test/helicopter/describe.json" }
        ].filter((r) => source === "/oss/assets/model/vehicle/helicopter" || r.path === source || r.path === HELICOPTER_DESC_PATH)
      };
    }
  };
  const retrievalSource = createRetrievalAssetSource(retrievalStub as Pick<RetrievalClient, "resourceSet">, {
    read: async (url) => {
      if (url.endsWith(".glb")) return HELICOPTER_GLB_BYTES;
      return new TextEncoder().encode(JSON.stringify({ name: HELICOPTER_CANDIDATE.name }));
    }
  });

  const nativeEditor = new RuntimeNativeEditor(project, scene, seedWorldProjectFormats, [retrievalSource]);

  // Configure live FarmingSystem + FarmingAreaComponent (Case 13)
  const farmOwnerEntity = scene.rootEntities.find((e) => e.name === "FarmRoot") ?? scene.createRootEntity("FarmRoot");
  const farmingSystem =
    farmOwnerEntity.getComponent(FarmingSystem) ?? farmOwnerEntity.addComponent(FarmingSystem);
  const farmingClock = new ManualFarmClock(1000);
  farmingSystem.configureRuntime(() => ({
    storagePresentation: false,
    groundProvider: TEST_GROUND_PROVIDER,
    clock: farmingClock
  }));
  const farmingDefinitions = {
    ...TEST_FARMING_DEFINITIONS,
    actionPolicy: { allowIrrigateEmptyPlot: true }
  };
  const farmingResources = createFarmingResources(engine, farmingDefinitions);
  const farmAreaHost = scene.createRootEntity("FarmAreaHost");
  const farmingArea = farmAreaHost.addComponent(FarmingAreaComponent);
  await farmingArea.configure({
    farmId: "native-farm",
    layoutId: "native-layout",
    layoutVersion: 1,
    plots: [{ id: "native/a", label: "主农田地块 A" }],
    ...farmingResources
  });
  farmingArea.coordinator.presentation = {
    prepare: async () => true,
    getTarget: () => ({ plotId: "native/a", ground: null })
  };

  // WaterSystem mock for Case 05 / 06 / 47 water.diagnostics + sample
  const initialLakeEntity = scene.rootEntities.find((e) => e.name === "LakeWater");
  const initialLakeBody = initialLakeEntity?.getComponent(WaterBodyComponent) as
    | (WaterBodyComponent & { _configuration?: unknown })
    | null
    | undefined;
  if (initialLakeBody && !initialLakeBody.configuration) {
    initialLakeBody._configuration = { kind: "lake" };
  }
  const waterSystemMock = {
    destroyed: false,
    get revision() {
      return liveState.water.hostRevision;
    },
    get runtimeState() {
      return { phase: "ready" as const, ready: true, bodyCount: liveState.water.bodyCount };
    },
    getBodyState: (waterId: string) => ({ active: true, ready: true, published: true, revision: 1, waterId }),
    sample: (x: number, z: number, waterId?: string) => {
      const matchedRiver = riversCreated.find((river) => {
        if (river.kind !== "river") return false;
        const pts = (river.parameters as { points?: readonly { x: number; z: number; width?: number }[] })?.points;
        if (!Array.isArray(pts) || pts.length === 0) return false;
        if (pts.length === 1) {
          const halfW = (pts[0].width ?? 6) * 0.5;
          return Math.hypot(x - pts[0].x, z - pts[0].z) <= halfW;
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const lenSq = dx * dx + dz * dz;
          const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lenSq)) : 0;
          const dist = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
          const halfW = Math.max(a.width ?? 6, b.width ?? 6) * 0.5;
          if (dist <= halfW) return true;
        }
        return false;
      });
      const inWater = Boolean(waterId) || Boolean(matchedRiver) || isInsideInitialLake(x, z);
      if (!inWater) {
        return {
          water: false,
          revision: liveState.water.hostRevision,
          status: "resolved" as const
        };
      }
      return {
        water: true,
        revision: liveState.water.hostRevision,
        status: "resolved" as const,
        id: waterId ?? matchedRiver?.id ?? "lake-body",
        surfaceElevationMetres: 0.5,
        surfaceModel: "planar",
        depth: { value: 1.8, quality: "actual" as const },
        bed: { value: -1.3, quality: "actual" as const },
        shoreDistance: { value: 2.0, quality: "actual" as const },
        velocity: { value: [0.2, 0.1], quality: "actual" as const }
      };
    },
    sampleSurface: () => ({ waterDepth: 1.8, surfaceY: 0.5, bedY: -1.3, velocityX: 0.2, velocityZ: 0.1, shoreDistance: 2.0 }),
    sampleDrops: () => ({ revision: liveState.water.hostRevision, drops: [] }),
    getDiagnostics: () => ({ ready: true, bodyCount: liveState.water.bodyCount, errors: [] })
  } as unknown as WaterSystem;

  const application = new SeedWorldAgentApplication(
    port,
    planningService,
    () => [],
    parameterAuthoring,
    undefined,
    animalService
  );
  const disposeProjectConnection = application.connectProject(project);

  // RuntimeInspection wrapper synthesizing BuildingManager on BuildingHost
  const baseInspection = nativeEditor.inspection;
  const SYNTHETIC_BUILDING_MANAGER_ID = 9_900_001;
  application.runtimeInspection = {
    scene: baseInspection.scene,
    id: (obj) => baseInspection.id(obj),
    target: (c, i, k) => baseInspection.target(c, i, k),
    inspectEntity: (id: number) => {
      const res = baseInspection.inspectEntity(id);
      if (res.entity && res.entity.name === "BuildingHost" && !res.entity.components.includes(SYNTHETIC_BUILDING_MANAGER_ID)) {
        res.entity.components.push(SYNTHETIC_BUILDING_MANAGER_ID);
      }
      return res;
    },
    children: (entityId?: number, offset?: number, limit?: number) => {
      const res = baseInspection.children(entityId, offset, limit);
      for (const item of res.items) {
        if (item.entity && item.entity.name === "BuildingHost" && !item.entity.components.includes(SYNTHETIC_BUILDING_MANAGER_ID)) {
          item.entity.components.push(SYNTHETIC_BUILDING_MANAGER_ID);
        }
      }
      return res;
    },
    queryComponents: (entityId: number, type?: string) => {
      const res = baseInspection.queryComponents(entityId, type);
      const inspected = baseInspection.inspectEntity(entityId);
      if (inspected.entity?.name === "BuildingHost" && (!type || type === "BuildingManager")) {
        res.items.push({
          componentId: SYNTHETIC_BUILDING_MANAGER_ID,
          entityId,
          type: "BuildingManager",
          enabled: true,
          properties: ["buildStatus"]
        });
      }
      return res;
    },
    readComponent: (id: number, fields: readonly string[]) => {
      if (id === SYNTHETIC_BUILDING_MANAGER_ID) {
        const values: Record<string, AgentValue> = {};
        if (fields.includes("buildStatus")) {
          values.buildStatus = toAgentValue({
            bound: true,
            pending: false,
            generation: 1,
            errors: { length: 0, items: [], truncated: false },
            diagnostics: { length: 0, items: [], truncated: false }
          });
        }
        return {
          status: "found",
          component: {
            componentId: SYNTHETIC_BUILDING_MANAGER_ID,
            entityId: scene.rootEntities.find((e) => e.name === "BuildingHost")?.instanceId ?? 0,
            type: "BuildingManager",
            enabled: true,
            properties: ["buildStatus"]
          },
          values
        };
      }
      return baseInspection.readComponent(id, fields);
    }
  } as unknown as typeof baseInspection;

  application.viewSnapshots = createViewSnapshotsMock() as unknown as SeedWorldAgentApplication["viewSnapshots"];

  const editorExtensions = [
    createNativeWaterAgentPackage(
      { editor: nativeEditor, project, system: () => waterSystemMock, hostTerrain: true, oceanDatum: 0 },
      waterAgentKnowledge()
    ),
    createFarmingComponentExtension(nativeEditor.projection),
    createRetrievalAgentExtension(retrievalStub)
  ];

  const baseConfig = createSeedWorldChatAgentConfiguration({
    application,
    nativeEditor,
    editorExtensions
  });
  let currentConfig: AgentConfiguration = options.transformConfiguration ? options.transformConfiguration(baseConfig) : baseConfig;

  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  const agentLoop = new AgentLoop({
    ...currentConfig,
    getConfiguration: () => currentConfig,
    scriptRuntime: new JavaScriptAgentScriptRuntime(),
    scriptChecker: {
      check: async (source, declarations) => checker.check(source, declarations),
      dispose: () => checker.dispose()
    },
    maxToolCallsPerScript: 128,
    scriptTimeoutMs: 60_000
  });
  const session = new AIChatSession({ agent: agentLoop });

  const runTurn = async (
    prompt: string,
    turnIndex = 0,
    options?: { inputSource?: "text" | "voice" }
  ): Promise<TurnExecutionRecord> => {
    const startedAt = new Date().toISOString();
    const startMs = performance.now();
    const events: AgentEvent[] = [];
    const modelRequests: RecordedModelRequestEvent[] = [];
    const toolCalls: RecordedToolCallEvent[] = [];
    const scripts: RecordedScriptEvent[] = [];
    const pendingToolStarts = new Map<string, { at: number; toolName: string; input: AgentValue; step: number }>();

    const unsubscribe = session.subscribe((event) => {
      events.push(structuredClone(event) as AgentEvent);
      if (event.type === "model_request") {
        modelRequests.push({
          turnIndex,
          step: event.step,
          attempt: event.attempt,
          messageCount: event.messages.length,
          payloadBytes: Buffer.byteLength(JSON.stringify(event.messages), "utf8"),
          toolsCount: event.tools?.length ?? 0
        });
      } else if (event.type === "model_finished") {
        const lastAttempt = event.step.attempts[event.step.attempts.length - 1];
        for (let i = modelRequests.length - 1; i >= 0; i--) {
          if (modelRequests[i]!.step === event.step.step && !modelRequests[i]!.modelName) {
            modelRequests[i]!.modelName = lastAttempt?.debug?.modelName;
            modelRequests[i]!.requestedModel = lastAttempt?.debug?.requestedModel;
            modelRequests[i]!.finishReason = lastAttempt?.finishReason;
            modelRequests[i]!.durationMs = lastAttempt?.durationMilliseconds;
            modelRequests[i]!.telemetry = lastAttempt?.telemetry;
            modelRequests[i]!.validationStatus = lastAttempt?.debug?.validationStatus;
            modelRequests[i]!.rawContent = lastAttempt?.rawContent;
            modelRequests[i]!.error = lastAttempt?.error ?? undefined;
            break;
          }
        }
      } else if (event.type === "tool_started") {
        const key = `${event.step}:${event.toolCallId ?? event.call ?? toolCalls.length}:${event.tool}`;
        pendingToolStarts.set(key, {
          at: performance.now(),
          toolName: event.tool,
          input: event.input,
          step: event.step
        });
      } else if (event.type === "tool_finished") {
        const key = `${event.step}:${event.toolCallId ?? event.call ?? toolCalls.length}:${event.tool}`;
        const started = pendingToolStarts.get(key);
        pendingToolStarts.delete(key);
        const resultPayload = event.result.ok ? event.result.value : event.result.error;
        toolCalls.push({
          turnIndex,
          step: event.step,
          callId: event.toolCallId ?? String(event.call ?? toolCalls.length),
          toolName: event.tool,
          input: started?.input ?? null,
          result: event.result.ok ? event.result.value : undefined,
          ok: event.result.ok,
          error: event.result.ok ? undefined : event.result.error,
          responseBytes: Buffer.byteLength(JSON.stringify(resultPayload ?? null), "utf8"),
          durationMs: started ? performance.now() - started.at : 0
        });
      } else if (event.type === "script_started") {
        scripts.push({ turnIndex, step: event.step, code: event.code });
      } else if (event.type === "script_trace") {
        for (let i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i]!.step === event.step && !scripts[i]!.toolTrace) {
            scripts[i]!.toolTrace = event.trace.toolCalls;
            break;
          }
        }
      } else if (event.type === "script_finished") {
        for (let i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i]!.step === event.step && !scripts[i]!.result) {
            scripts[i]!.result = event.result;
            break;
          }
        }
      }
    });

    let taskResult: AgentTaskResult | undefined;
    let errorMessage: string | undefined;
    try {
      const submission = session.submit(prompt, {
        model: SEED_WORLD_MODEL,
        debugMode: true,
        inputSource: options?.inputSource ?? "text",
        context: {
          user_selection_at_submission: null,
          viewer_at_submission: toAgentValue(application.getViewerSnapshot())
        }
      });
      taskResult = await submission.completion;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      unsubscribe();
    }

    const modelsSeen = [
      ...new Set(modelRequests.map((m) => m.modelName).filter((m): m is string => typeof m === "string" && m.length > 0))
    ];
    return {
      turnIndex,
      prompt,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: performance.now() - startMs,
      taskResult,
      error: errorMessage,
      modelsSeen,
      modelRequests,
      toolCalls,
      scripts,
      events
    };
  };

  const seedPreUndoTransaction = async (entityName = "TempCrate"): Promise<string> => {
    const signal = new AbortController().signal;
    const txId = `pre-undo-${crypto.randomUUID().slice(0, 8)}`;
    const edit = nativeEditor.beginEdit(txId, signal);
    const createTool = edit.tools.find((t) => t.name === "entity.create")!;
    await createTool.execute(
      createTool.parseInput({
        scene: "Scenes/Main.scene",
        name: entityName,
        position: [12, 0, 12]
      }),
      { signal }
    );
    await edit.prepare(signal);
    await edit.commit();
    await edit.activate?.(signal);
    await edit.complete?.();
    return txId;
  };

  async function seedMatureCrop(plotId = "native/a") {
    const api = new FarmingAPI(farmingSystem);
    const farmId = farmingArea.farmId;
    await api.execute({ operation: "plant", input: { farmId, plotId, seedId: "berry-seed" } } as any);
    await api.execute({ operation: "irrigate", input: { farmId, plotId } } as any);
    farmingClock.advanceBy(15000);
    await farmingArea.service.checkpoint();
  }

  async function seedYoungCrop(plotId = "native/a") {
    const api = new FarmingAPI(farmingSystem);
    const farmId = farmingArea.farmId;
    await api.execute({ operation: "plant", input: { farmId, plotId, seedId: "berry-seed" } } as any);
    await farmingArea.service.checkpoint();
  }

  function seedAuthoredTree(position: [number, number, number] = [8, 0, -9]) {
    objects.push({
      worldId: "seed-world-42",
      objectId: "authored-tree-player-1",
      objectKind: "tree",
      worldRevision: 4,
      position,
      footprintMetres: [2, 2],
      source: { kind: "authoring", sourceId: "authored-tree-player-1" },
      properties: { treeSpeciesProfileKey: "pine", yawRadians: 0, scale: [1, 1, 1] }
    });
  }

  return {
    engine,
    scene,
    project,
    nativeEditor,
    application,
    configuration: currentConfig,
    agentLoop,
    session,
    farmingSystem,
    farmingArea,
    state: {
      getLiveState: () => structuredClone(liveState),
      getResources: () => structuredClone(resources),
      getObjects: () => structuredClone(objects),
      getRemovedIds: () => [...removedIds],
      getEnvironmentMutations: () => structuredClone(environmentMutations),
      getRiversCreated: () => structuredClone(riversCreated),
      getParameterState: () => ({
        activationDistance,
        versionToken: paramVersionToken,
        applyCalls: structuredClone(paramApplyCalls),
        plantMaterialOverrides: { ...plantMaterialOverrides }
      }),
      getAnimalSpawns: () => structuredClone(animalSpawns),
      getAnimalCommands: () => structuredClone(animalCommands),
      getAnimalReceipts: () => structuredClone(animalReceipts),
      getTeleports: () => structuredClone(teleports),
      getAgentConfiguration: () => currentConfig,
      setAgentConfiguration: (next: AgentConfiguration) => {
        currentConfig = next;
      }
    },
    runTurn,
    seedPreUndoTransaction,
    seedMatureCrop,
    seedYoungCrop,
    seedAuthoredTree,
    async dispose() {
      session.dispose();
      agentLoop.dispose();
      try {
        await farmingSystem.dispose();
      } catch {
        // ignore headless cleanup errors
      }
      disposeProjectConnection();
      nativeEditor.dispose();
      project.dispose();
      planningHeightmapSpy.mockRestore();
      createResourcePortSpy.mockRestore();
      scriptFileSpy.mockRestore();
      workerCompileSpy.mockRestore();
      storageSpy.mockRestore();
      ktx2LoadSpy.mockRestore();
      shaderCreateSpy.mockRestore();
      asapShim.restore();
      restoreWorker();
      restoreFetch();
    }
  };
}
