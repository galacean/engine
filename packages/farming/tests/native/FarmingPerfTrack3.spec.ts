import {
  BufferMesh,
  Camera,
  MeshRenderer,
  PBRMaterial,
  Shader,
  Texture2D,
  TextureFormat,
  Vector3
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShaderMacroProcessor } from "../../../core/src/shader/ShaderMacroProcessor";
import { HeadlessEngine } from "../../../rhi-null/src/HeadlessEngine";
import { SoilRenderBatches } from "../../src/farming/presentation/soil/SoilRenderBatches";
import { SoilVisualProvider } from "../../src/farming/presentation/soil/SoilVisualProvider";
import { SOIL_MOISTURE_SHADER } from "../../src/farming/presentation/soil/SoilMoistureShader";
import { PLANT_HARVEST_SHADER } from "../../src/farming/presentation/PlantHarvestShader";
import { HarvestProduce } from "../../src/farming/presentation/harvest/HarvestProduce";
import {
  buildMoistureStencils,
  sampleMoisture,
  sampleMoistureInto
} from "../../src/farming/presentation/soil/SoilMoistureSamples";
import { SoilBoundaryPreview } from "../../src/farming/presentation/soil/SoilBoundaryPreview";
import { createFarmingPlotSurface } from "../../src/farming/presentation/soil/FarmingPlotSurface";
import { FarmingWorldPresentation } from "../../src/farming/presentation/FarmingWorldPresentation";
import { FarmingTargetHint } from "../../src/farming/presentation/FarmingTargetHint";
import { FarmingService } from "../../src/farming/application/FarmingService";
import { ManualFarmClock } from "../../src/farming/application/FarmClock";
import { MemoryFarmRepository } from "../../src/farming/persistence/MemoryFarmRepository";
import { createPlantingCatalog } from "../../src/farming/content/PlantingCatalog";
import { type SurfaceTriangle } from "../../src/farming/geometry/SurfaceTriangles";
import { createPlantRenderState } from "../../src/farming/presentation/PlantRenderState";
import { createPlantInstance } from "../../src/farming/procedural/runtime/createPlantInstance";
import { ProceduralPlant } from "../../src/farming/procedural/runtime/ProceduralPlant";
import { plantDefinitionKey, plantResourcePoolDiagnostics } from "../../src/farming/procedural/runtime/PlantResourcePool";
import { maturePlantResourceDiagnostics } from "../../src/farming/procedural/runtime/MaturePlantResources";
import { parsePlantGrowthRecipe } from "../../src/farming/procedural/core/validation";
import { PlantPresenter } from "../../src/farming/presentation/PlantPresenter";
import { DEFAULT_PLANT_SHAPE } from "../../src/farming/procedural/core/PlantGrowthRecipe";
import type { FarmSnapshot, PlotState } from "../../src/farming/domain/FarmState";
import { rosetteRecipe, fixtureMetadata } from "../fixtures/procedural-fixtures";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../fixtures/fixtures";

function buildSoilGridTriangles(
  side: number,
  originX: number,
  originZ: number,
  cellSize: number,
  heightFn: (x: number, z: number) => number
): SurfaceTriangle[] {
  const triangles: SurfaceTriangle[] = [];
  const step = cellSize / side;
  const p = (ix: number, iz: number): readonly [number, number, number] => {
    const x = originX + ix * step;
    const z = originZ + iz * step;
    return [x, heightFn(x, z), z];
  };
  for (let z = 0; z < side; z++) {
    for (let x = 0; x < side; x++) {
      const a = p(x, z);
      const b = p(x + 1, z);
      const c = p(x, z + 1);
      const d = p(x + 1, z + 1);
      triangles.push([a, c, d], [a, d, b]);
    }
  }
  return triangles;
}

async function createCompiledHeadlessEngine(maxTextureSize = 4096): Promise<HeadlessEngine> {
  const engine = await HeadlessEngine.create({
    shaderCompiler: new ShaderCompiler(),
    glTFLoader: { meshOpt: { workerCount: 0 } }
  });
  const device = (
    engine as unknown as { _hardwareRenderer: { supportsRendering: boolean; capability: { maxTextureSize: number } } }
  )._hardwareRenderer;
  device.supportsRendering = true;
  device.capability.maxTextureSize = maxTextureSize;
  return engine;
}

describe("Track 3 Performance Optimizations (P1-4, P1-5, P1-6)", () => {
  const engines: HeadlessEngine[] = [];
  const disposables: { dispose(): void }[] = [];
  const textures: Texture2D[] = [];
  const materials: PBRMaterial[] = [];

  beforeEach(() => {
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queueMicrotask(() => cb(performance.now()));
      return 1;
    });
    const fakeDocument = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      hidden: false,
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData() {}
        })
      })
    });
    vi.stubGlobal("document", fakeDocument);
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const d of disposables.splice(0)) d.dispose();
    for (const t of textures.splice(0)) if (!t.destroyed) t.destroy(true);
    for (const m of materials.splice(0)) if (!m.destroyed) m.destroy(true);
    for (const e of engines.splice(0)) e.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("P1-4: SoilRenderBatches Exact Index Weld & SoilMoistureShader VS State Fetch", () => {
    it("welds flat 8x8 bed vertices strictly from 384 -> 81 and restores BufferMesh cleanly on WebGL restore", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const root = scene.createRootEntity("soil-test");
      const material = new PBRMaterial(engine);
      materials.push(material);
      const batches = new SoilRenderBatches(engine, root, material);
      disposables.push(batches);

      const grid = { originX: 0, originZ: 0, cellSize: 1.25, maximumSlopeDegrees: 45 };
      const plotEntity = root.createChild("plot-0-0");
      plotEntity.transform.setWorldPosition(0.625, 0, 0.625);
      const plot = batches.add(plotEntity, grid, { groundId: "g", cellX: 0, cellZ: 0 });

      const triangles = buildSoilGridTriangles(8, -0.625, -0.625, 1.25, () => 0);
      expect(triangles).toHaveLength(128);
      plot.setSurface(triangles, 1.25);
      plot.setCoverage(new Uint8Array(65 * 65).fill(255));
      plot.enabled = true;
      plot.refreshVisibility();
      batches.flush();

      const chunkRenderers = root.getComponentsIncludeChildren(MeshRenderer, []);
      expect(chunkRenderers).toHaveLength(1);
      const mesh = chunkRenderers[0].mesh as BufferMesh;
      expect(mesh).toBeInstanceOf(BufferMesh);
      expect(mesh.indexBufferBinding!.buffer.byteLength / 2).toBe(384);
      expect(mesh.vertexBufferBindings[0]!.buffer.byteLength / 64).toBe(81);
      expect(mesh.bounds.min.x).toBeCloseTo(0, 4);
      expect(mesh.bounds.max.x).toBeCloseTo(1.25, 4);

      const pool = (engine.resourceManager as unknown as {
        _contentRestorerPool?: Record<number, { resource: unknown; restoreContent: () => void }>;
      })._contentRestorerPool;
      const meshRestorer = pool?.[mesh.instanceId];
      expect(meshRestorer).toBeDefined();
      expect(() => meshRestorer!.restoreContent()).not.toThrow();

      const uploadsBefore = batches.diagnostics.geometryUploads;
      plot.setSurface(triangles, 1.25);
      batches.flush();
      expect(batches.diagnostics.geometryUploads).toBe(uploadsBefore);
    });

    it("preserves distinct per-triangle flat normals on sloped / ridged terrain without false welding", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const root = scene.createRootEntity("soil-ridge");
      const material = new PBRMaterial(engine);
      materials.push(material);
      const batches = new SoilRenderBatches(engine, root, material);
      disposables.push(batches);

      const grid = { originX: 0, originZ: 0, cellSize: 1.25, maximumSlopeDegrees: 45 };
      const plotEntity = root.createChild("plot-ridge");
      plotEntity.transform.setWorldPosition(0.625, 0, 0.625);
      const plot = batches.add(plotEntity, grid, { groundId: "g", cellX: 0, cellZ: 0 });

      const ridged = buildSoilGridTriangles(8, -0.625, -0.625, 1.25, (x, z) => Math.abs(x) * 0.4 + Math.sin(z * 3) * 0.15);
      plot.setSurface(ridged, 1.25);
      plot.setCoverage(new Uint8Array(65 * 65).fill(255));
      plot.enabled = true;
      plot.refreshVisibility();
      batches.flush();

      const mesh = root.getComponentsIncludeChildren(MeshRenderer, [])[0].mesh as BufferMesh;
      const vertCount = mesh.vertexBufferBindings[0]!.buffer.byteLength / 64;
      expect(mesh.indexBufferBinding!.buffer.byteLength / 2).toBe(384);
      expect(vertCount).toBeGreaterThan(81);
    });

    it("audits SoilMoistureShader varyings (12 baseline / 15 worst-case <= 15 WebGL2 min), VS state fetch, vertexColor retention, and hidden-plot collapse", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      expect(() => Shader.find("Farming/SoilMoisture") ?? Shader.create(SOIL_MOISTURE_SHADER)).not.toThrow();

      expect(SOIL_MOISTURE_SHADER).not.toContain("organMask");
      expect(SOIL_MOISTURE_SHADER).not.toContain("soilSlot");
      expect(SOIL_MOISTURE_SHADER).not.toContain("flat ");

      const varyingsStart = SOIL_MOISTURE_SHADER.indexOf("struct Varyings");
      const varyingsEnd = SOIL_MOISTURE_SHADER.indexOf("};", varyingsStart);
      const varyingsBlock = SOIL_MOISTURE_SHADER.slice(varyingsStart, varyingsEnd);
      expect(varyingsBlock).toContain("vec4 vertexColor;");
      expect(varyingsBlock).toContain("vec4 soilMeta;");
      expect(varyingsBlock).toContain("vec3 soilRow0;");
      expect(varyingsBlock).toContain("vec3 soilRow1;");
      expect(varyingsBlock).toContain("vec3 soilRow2;");
      expect(varyingsBlock).toContain("float soilCoverage;");

      const countVaryingDecls = (defines: ReadonlySet<string>): number => {
        const evalCond = (rawCond: string): boolean => {
          let cond = rawCond.trim();
          while (cond.startsWith("(") && cond.endsWith(")")) cond = cond.slice(1, -1).trim();
          if (cond.includes("&&")) return cond.split("&&").every((part) => evalCond(part));
          if (cond.startsWith("defined(")) return defines.has(cond.slice(8, -1).trim());
          if (cond === "SCENE_FOG_MODE != 0") return defines.has("SCENE_FOG_MODE");
          if (cond === "SCENE_SHADOW_CASCADED_COUNT == 1") return defines.has("SCENE_SHADOW_CASCADED_COUNT_1");
          return defines.has(cond);
        };
        const stack: boolean[] = [true];
        let count = 0;
        for (const rawLine of varyingsBlock.split("\n")) {
          const line = rawLine.trim();
          if (!line || line.startsWith("struct ")) continue;
          if (line.startsWith("#ifdef ")) {
            stack.push(stack[stack.length - 1] && defines.has(line.slice(7).trim()));
          } else if (line.startsWith("#else")) {
            const parent = stack[stack.length - 2] ?? true;
            stack[stack.length - 1] = parent && !stack[stack.length - 1];
          } else if (line.startsWith("#endif")) {
            stack.pop();
          } else if (line.startsWith("#if ")) {
            stack.push(stack[stack.length - 1] && evalCond(line.slice(4).trim()));
          } else if (stack[stack.length - 1] && /^(vec[234]|float)\s+\w+;/.test(line)) {
            count++;
          }
        }
        return count;
      };

      const baselineDefines = new Set([
        "RENDERER_ENABLE_VERTEXCOLOR",
        "FARM_SOIL_BATCH",
        "SCENE_FOG_MODE",
        "RENDERER_HAS_NORMAL",
        "NEED_VERTEX_TANGENT"
      ]);
      expect(countVaryingDecls(baselineDefines)).toBe(12);

      const worstCaseDefines = new Set([
        ...baselineDefines,
        "SCENE_USE_PROBE_VOLUME",
        "SCENE_PROBE_VOLUME_PER_VERTEX",
        "NEED_CALCULATE_SHADOWS",
        "SCENE_SHADOW_CASCADED_COUNT_1"
      ]);
      const worstCaseVaryings = countVaryingDecls(worstCaseDefines);
      expect(worstCaseVaryings).toBe(15);
      expect(worstCaseVaryings).toBeLessThanOrEqual(15);

      const vsStart = SOIL_MOISTURE_SHADER.indexOf("Varyings PBRVertex(");
      const fsStart = SOIL_MOISTURE_SHADER.indexOf("void PBRFragment(");
      const vertexBody = SOIL_MOISTURE_SHADER.slice(vsStart, fsStart);
      const fragmentBody = SOIL_MOISTURE_SHADER.slice(fsStart);

      expect(vertexBody).toContain("texture2D(soil_BatchStates, stateUV)");
      expect(vertexBody).toContain("gl_Position = vec4(2.0, 2.0, 2.0, 1.0);");
      expect(fragmentBody).not.toContain("soil_BatchStates");
      expect(fragmentBody).toContain("varyings.soilRow0");
      expect(fragmentBody).toContain("vec2 tile = floor(varyings.soilMeta.xy + 0.5);");
    });

    it("CR-006: keeps geometryDirty and geometryDirtyList consistent when flushGeometry throws mid-batch", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const root = scene.createRootEntity("soil-flush-rollback");
      const material = new PBRMaterial(engine);
      materials.push(material);
      const batches = new SoilRenderBatches(engine, root, material);
      disposables.push(batches);

      const grid = { originX: 0, originZ: 0, cellSize: 1.25, maximumSlopeDegrees: 45 };
      const e0 = root.createChild("plot-chunk-0");
      e0.transform.setWorldPosition(0.625, 0, 0.625);
      const p0 = batches.add(e0, grid, { groundId: "g", cellX: 0, cellZ: 0 });
      const e1 = root.createChild("plot-chunk-1");
      e1.transform.setWorldPosition(5.625, 0, 0.625);
      const p1 = batches.add(e1, grid, { groundId: "g", cellX: 4, cellZ: 0 });

      const triangles = buildSoilGridTriangles(4, -0.625, -0.625, 1.25, () => 0);
      p0.setSurface(triangles, 1.25);
      p0.setCoverage(new Uint8Array(65 * 65).fill(255));
      p0.enabled = true;
      p0.refreshVisibility();

      p1.setSurface(triangles, 1.25);
      p1.setCoverage(new Uint8Array(65 * 65).fill(255));
      p1.enabled = true;
      p1.refreshVisibility();

      const origAddRestorer = engine.resourceManager.addContentRestorer.bind(engine.resourceManager);
      let meshRestorerCalls = 0;
      const restorerSpy = vi.spyOn(engine.resourceManager, "addContentRestorer").mockImplementation((restorer) => {
        if (restorer.resource instanceof BufferMesh) {
          meshRestorerCalls++;
          if (meshRestorerCalls === 2) throw new Error("injected restorer failure");
        }
        return origAddRestorer(restorer);
      });

      expect(() => batches.flush()).toThrow("injected restorer failure");
      expect(batches.diagnostics.geometryUploads).toBe(1);

      restorerSpy.mockRestore();
      // Re-dirty chunk1 explicitly; must not create a duplicate dirty queue entry.
      p1.setSurface(triangles, 1.25);
      batches.flush();
      expect(batches.diagnostics.geometryUploads).toBe(2);
    });
  });

  describe("P1-5: Zero-GC Moisture Sampling & 3s Tick Invariance", () => {
    it("sampleMoistureInto matches sampleMoisture bit-for-bit with zero array reallocations", () => {
      const plots = [
        { plotId: "p0", groundId: "g", cellX: 0, cellZ: 0, ground: { availability: "available", waterMask: 0b1111 } },
        { plotId: "p1", groundId: "g", cellX: 1, cellZ: 0, ground: { availability: "available", waterMask: 0b1111 } }
      ] as unknown as PlotState[];
      const previewCell = { plotId: "p_preview", groundId: "g", cellX: 0, cellZ: 1 };
      const stencils = buildMoistureStencils(plots, previewCell);
      const stencil = stencils.get("p0")!;
      const values = new Map<string, number>([
        ["p0", 0.2],
        ["p1", 0.9],
        ["p_preview", 0.6]
      ]);
      const out = new Array<number>(9).fill(0);

      for (const previewOpt of [undefined, { plotId: "p_preview", weight: 0.4 }, { plotId: "p_preview", weight: 0 }]) {
        const expected = sampleMoisture(stencil, values, previewOpt);
        sampleMoistureInto(stencil, values, out, previewOpt);
        expect(out).toEqual(expected);
      }

      const typedOut = new Float32Array(9);
      sampleMoistureInto(stencil, values, typedOut, { plotId: "p_preview", weight: 0.75 });
      const expectedTyped = sampleMoisture(stencil, values, { plotId: "p_preview", weight: 0.75 });
      for (let i = 0; i < 9; i++) expect(typedOut[i]).toBeCloseTo(expectedTyped[i], 6);
    });

    it("skips boundary mask rebuilds on unchanged 3s ticks and caches FarmingWorldPresentation crop/stretch state", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      vi.stubGlobal("window", { setInterval, clearInterval });
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      vi.spyOn(FarmingTargetHint, "create").mockReturnValue(undefined!);
      const scene = engine.sceneManager.activeScene!;
      const camEntity = scene.createRootEntity("cam");
      camEntity.transform.setPosition(0.625, 2.5, 4);
      const cam = camEntity.addComponent(Camera);
      cam.enabled = false;

      const tex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false);
      textures.push(tex);
      vi.spyOn(engine.resourceManager, "load").mockResolvedValue(tex as never);

      const clock = new ManualFarmClock(1000);
      const repository = new MemoryFarmRepository();
      const definitions = TEST_FARMING_DEFINITIONS;
      const service = new FarmingService({
        repository,
        definitions,
        groundProvider: TEST_GROUND_PROVIDER,
        clock,
        farmId: "perf-farm",
        layoutId: "perf-farm",
        layoutVersion: 1,
        plots: [{ id: "p0", label: "P0", target: { groundId: "soil", cellX: 0, cellZ: 0 } }],
        autoAdvance: true
      });
      await service.initialize();
      await service.updatePlot("p0", { preparation: "leveled" });
      await service.execute({
        type: "plant",
        farmId: "perf-farm",
        plotId: "p0",
        seedId: "berry-seed",
        commandId: "cmd-plant",
        expectedRevision: service.getSnapshot().revision
      });

      const groundView = TEST_GROUND_PROVIDER.capture();
      const sampleSpy = vi.fn(groundView.sample);
      const capturedView = { ...groundView, sample: sampleSpy };
      const groundProvider = {
        capture: () => capturedView,
        subscribe: () => () => {}
      };

      const root = scene.createRootEntity("farm-pres");
      const presentation = new FarmingWorldPresentation(root, cam, service, groundProvider, definitions);
      disposables.push(presentation);
      disposables.push(service);

      const previewSpy = vi.spyOn(
        (presentation as unknown as { boundaryPreview: SoilBoundaryPreview }).boundaryPreview,
        "refresh"
      );
      const soilsSetFieldSpy = vi.spyOn(
        (presentation as unknown as { soils: { setField: (...args: unknown[]) => void } }).soils,
        "setField"
      );
      const stringifySpy = vi.spyOn(JSON, "stringify");

      // Advance simulation by 3s (moisture/crop time tick without adding/moving plots or ground change).
      previewSpy.mockClear();
      soilsSetFieldSpy.mockClear();
      stringifySpy.mockClear();
      sampleSpy.mockClear();
      clock.advanceBy(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await service.whenIdle();

      const presentationStringifyCalls = stringifySpy.mock.calls.filter(([arg]) => {
        const text = typeof arg === "object" && arg !== null ? Object.keys(arg).join(",") : String(arg);
        return text.includes("plot") || Array.isArray(arg) && arg.some((el) => typeof el === "object" && el !== null && "plotId" in el);
      });
      expect(presentationStringifyCalls).toHaveLength(0);
      expect(sampleSpy).not.toHaveBeenCalled();
      expect(previewSpy).toHaveBeenCalledTimes(1);
      expect(previewSpy.mock.results[0].value).toEqual([]);
      expect(soilsSetFieldSpy).toHaveBeenCalledTimes(1);
    });

    it("SoilBoundaryPreview.refresh returns empty affected list when layout and preview are unchanged", () => {
      const preview = new SoilBoundaryPreview();
      const plots = [
        {
          plotId: "p0",
          groundId: "g",
          cellX: 0,
          cellZ: 0,
          label: "P0",
          shapeSeed: 1,
          occupantId: null,
          ground: { availability: "available", reason: null, checkedAtSystemTimeMs: 0, groundRevision: 0 },
          soil: { preparation: "leveled", moistureUnits: 25, lastIrrigatedSimulationMs: null, phTenths: 65 }
        }
      ] as unknown as PlotState[];
      const surfaces = new Map<string, ReturnType<typeof createFarmingPlotSurface>>();
      expect(preview.refresh(plots, surfaces, undefined, false)).toEqual([]);
      expect(preview.refresh(plots, surfaces, undefined, false)).toEqual([]);
    });

    it("CR-002: SoilVisualProvider.setField does not early-exit when renderers swaps an un-stenciled key for a stenciled key of equal size", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const root = scene.createRootEntity("soil-provider-root");

      const tex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false);
      textures.push(tex);
      vi.spyOn(engine.resourceManager, "load").mockResolvedValue(tex as never);

      const provider = new SoilVisualProvider(engine, 1.25);
      disposables.push(provider);

      const grid = { originX: 0, originZ: 0, cellSize: 1.25, maximumSlopeDegrees: 45 };
      const makeCell = (plotId: string, cellX: number, cellZ: number) => ({
        plotId,
        groundId: "g",
        cellX,
        cellZ,
        label: plotId,
        shapeSeed: 1,
        occupantId: null,
        ground: { availability: "available" as const, waterMask: 0b1111, reason: null, checkedAtSystemTimeMs: 0, groundRevision: 0 },
        soil: { preparation: "leveled" as const, moistureUnits: 50, lastIrrigatedSimulationMs: null, phTenths: 65 }
      });

      const eA = root.createChild("eA");
      const eB = root.createChild("eB");
      const eExtra = root.createChild("eExtra");
      const rA = provider.createPlot(root, eA, grid, { groundId: "g", cellX: 0, cellZ: 0 }, 0.9);
      const rB = provider.createPlot(root, eB, grid, { groundId: "g", cellX: 1, cellZ: 0 }, 0.1);
      const rExtra = provider.createPlot(root, eExtra, grid, { groundId: "g", cellX: 5, cellZ: 5 }, 0.1);

      const snapshot = {
        plots: [makeCell("plotA", 0, 0), makeCell("plotB", 1, 0)]
      } as unknown as FarmSnapshot;

      // Call 1: renderers contains plotA (in stencils) and untracked (not in stencils), size === 2.
      provider.setField(snapshot, new Map([["plotA", rA], ["untracked", rExtra]]));
      provider.update(1);
      expect(provider.getAppearance(rB)!.samples.every((s) => Math.abs(s - 0.1) < 1e-6)).toBe(true);

      // Call 2: topology unchanged, renderers size still 2, untracked replaced by plotB (now in stencils).
      provider.setField(snapshot, new Map([["plotA", rA], ["plotB", rB]]));
      provider.update(1);

      //plotB should now receive interpolated moisture (> 0.1) from neighbor plotA (0.9) on the shared left edge.
      const samplesB = provider.getAppearance(rB)!.samples;
      expect(Math.max(...samplesB)).toBeGreaterThan(0.25);
    });
  });

  describe("P1-6: Growing Crops GPU Instancing (Tier A + Tier B)", () => {
    it("shares Tier A species material/static buffers across growing & mature crops, shares Tier B quantized growth meshes, and cleans up with zero leaks", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const camEntity = scene.createRootEntity("cam");
      camEntity.addComponent(Camera).enabled = false;
      const host = scene.createRootEntity("crops");

      const baseRecipe = rosetteRecipe();
      const recipe = {
        ...baseRecipe,
        schemaVersion: 1,
        leafTemplates: [],
        supports: [{ id: "stake", center: [0, 0.3, 0] as const, size: [0.02, 0.6, 0.02] as const, uv: [0.1, 0.1] as const }],
        volumes: []
      };
      const baseMeta = fixtureMetadata(recipe.id);
      const plantDef = Object.freeze({
        ...baseMeta,
        material: Object.freeze({
          ...baseMeta.material,
          tintColors: Object.freeze([
            Object.freeze({ age: 0, value: Object.freeze([0.3, 0.7, 0.2] as const) }),
            Object.freeze({ age: 1, value: Object.freeze([0.9, 0.4, 0.1] as const) })
          ])
        }),
        recipe,
        atlasUrl: "/mock-plant-atlas.png"
      });

      const baseCrop = TEST_FARMING_DEFINITIONS.catalog.crops[0];
      const crop = {
        ...baseCrop,
        appearance: {
          ...baseCrop.appearance,
          plantId: plantDef.id,
          plantRevision: plantDef.revision,
          recipeRevision: plantDef.recipe.revision,
          ageByStage: [
            { stageId: "seeded", age: 0 },
            { stageId: "growing", age: 0 },
            { stageId: "mature", age: 1 }
          ]
        }
      };
      const catalog = createPlantingCatalog([crop], [plantDef]);

      const tex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false);
      textures.push(tex);
      vi.spyOn(engine.resourceManager, "load").mockResolvedValue(tex as never);

      const immediateSchedule: Parameters<typeof createPlantInstance>[4] = async (work) => work();

      // Both growing crops quantize to the exact same Math.round(age * 1000) bucket (age = 0.500 -> bucket 500).
      const s1 = createPlantRenderState(catalog, crop.id, "crop-1", 0.75);
      const s2 = createPlantRenderState(catalog, crop.id, "crop-2", 0.7502);
      const sMature = createPlantRenderState(catalog, crop.id, "crop-3", 1);

      const i1 = await createPlantInstance(catalog, engine, host, s1, undefined, immediateSchedule);
      const i2 = await createPlantInstance(catalog, engine, host, s2, undefined, immediateSchedule);
      const i3 = await createPlantInstance(catalog, engine, host, sMature, undefined, immediateSchedule);

      const q1 = i1.query();
      const q2 = i2.query();
      const q3 = i3.query();

      expect(q1.resources.mode).toBe("dynamic");
      expect(q2.resources.mode).toBe("dynamic");
      expect(q3.resources.mode).toBe("shared");

      // Tier A: Material and static UV/COLOR_0/Index GPU buffers shared across BOTH growing & mature crops.
      expect(q1.resources.materialId).toBe(q2.resources.materialId);
      expect(q1.resources.materialId).toBe(q3.resources.materialId);
      const mesh1 = i1.plant.mesh as BufferMesh;
      const mesh2 = i2.plant.mesh as BufferMesh;
      const mesh3 = i3.plant.mesh as BufferMesh;
      expect(mesh1.vertexBufferBindings[1]!.buffer).toBe(mesh3.vertexBufferBindings[1]!.buffer);
      expect(mesh1.indexBufferBinding!.buffer).toBe(mesh3.indexBufferBinding!.buffer);
      expect(i1.plant.support.children[0].getComponent(MeshRenderer)!.mesh).toBe(
        i3.plant.support.children[0].getComponent(MeshRenderer)!.mesh
      );

      // Tier B: Growing instances at the same 0.001-quantized age bucket share the exact same Mesh & dynamic Buffer.
      expect(q1.resources.meshId).toBe(q2.resources.meshId);
      expect(mesh1.vertexBufferBindings[0]!.buffer).toBe(mesh2.vertexBufferBindings[0]!.buffer);
      expect(plantResourcePoolDiagnostics(engine).growthReferences).toBe(2);
      expect(plantResourcePoolDiagnostics(engine).growthMeshes).toBe(1);

      // Zero-GC organ tint update reuses persistent Vector4 instance in place.
      const tintVecBefore = i1.plant.renderer.shaderData.getVector4("renderer_OrganTint");
      i1.update(createPlantRenderState(catalog, crop.id, "crop-1", 0.875));
      expect(i1.plant.renderer.shaderData.getVector4("renderer_OrganTint")).toBe(tintVecBefore);
      expect(i1.query().resources.meshId).not.toBe(q2.resources.meshId);
      expect(plantResourcePoolDiagnostics(engine).growthMeshes).toBe(2);

      // Transition i1 & i2 to same bucket, verify copy-on-write on setAnchorOffsets does not mutate i2.
      i2.update(createPlantRenderState(catalog, crop.id, "crop-2", 0.875));
      expect(i1.query().resources.meshId).toBe(i2.query().resources.meshId);
      expect(i1.plant.setAnchorOffsets(new Map([["base", [0.1, 0, 0]]]))).toBe(true);
      expect(i1.plant.hasAnchorOffsets).toBe(true);
      expect(i1.query().resources.meshId).not.toBe(i2.query().resources.meshId);

      // Regress mature i3 -> growing -> returns to Tier B pool & drops MaturePlantResources refCount cleanly.
      i3.update(createPlantRenderState(catalog, crop.id, "crop-3", 0.875));
      expect(i3.query().resources.mode).toBe("dynamic");
      expect(i3.query().resources.meshId).toBe(i2.query().resources.meshId);
      expect(maturePlantResourceDiagnostics(engine).entries).toBe(0);

      // AbortSignal cancellation during in-flight creation leaks zero pooled entries.
      const controller = new AbortController();
      const pendingPromise = createPlantInstance(
        catalog,
        engine,
        host,
        createPlantRenderState(catalog, crop.id, "crop-abort", 0.3),
        controller.signal,
        async (work, phase) => {
          if (phase === "gpu") controller.abort();
          return work();
        }
      );
      await expect(pendingPromise).rejects.toThrow();

      i1.dispose();
      i2.dispose();
      i3.dispose();
      expect(plantResourcePoolDiagnostics(engine)).toEqual({
        materials: 0,
        materialReferences: 0,
        staticGeometries: 0,
        staticReferences: 0,
        growthMeshes: 0,
        growthReferences: 0
      });
      expect(maturePlantResourceDiagnostics(engine).entries).toBe(0);
    });

    it("CR-003: shares Tier A static geometry across different shapes and reuses sole-owner Tier B BufferMesh/VBO in-place across staggered growth steps", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const camEntity = scene.createRootEntity("cam");
      camEntity.addComponent(Camera).enabled = false;
      const host = scene.createRootEntity("crops-cr003");

      const baseRecipe = rosetteRecipe();
      const recipe = {
        ...baseRecipe,
        schemaVersion: 1,
        leafTemplates: [],
        supports: [{ id: "stake", center: [0, 0.3, 0] as const, size: [0.02, 0.6, 0.02] as const, uv: [0.1, 0.1] as const }],
        volumes: []
      };
      const plantDef = Object.freeze({
        ...fixtureMetadata(recipe.id),
        recipe,
        atlasUrl: "/mock-plant-atlas.png"
      });
      const baseCrop = TEST_FARMING_DEFINITIONS.catalog.crops[0];
      const crop = {
        ...baseCrop,
        appearance: {
          ...baseCrop.appearance,
          plantId: plantDef.id,
          plantRevision: plantDef.revision,
          recipeRevision: plantDef.recipe.revision,
          ageByStage: [
            { stageId: "seeded", age: 0 },
            { stageId: "growing", age: 0 },
            { stageId: "mature", age: 1 }
          ]
        }
      };
      const catalog = createPlantingCatalog([crop], [plantDef]);

      const tex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false);
      textures.push(tex);
      vi.spyOn(engine.resourceManager, "load").mockResolvedValue(tex as never);
      const immediateSchedule: Parameters<typeof createPlantInstance>[4] = async (work) => work();

      const shapeA = { leafSpread: 0.85, stemBend: 1.0, fruitScale: 1.0 };
      const shapeB = { leafSpread: 1.25, stemBend: 1.2, fruitScale: 0.8 };
      const sA = { ...createPlantRenderState(catalog, crop.id, "solo-a", 0.2), shape: shapeA };
      const sB = { ...createPlantRenderState(catalog, crop.id, "solo-b", 0.6), shape: shapeB };

      const iA = await createPlantInstance(catalog, engine, host, sA, undefined, immediateSchedule);
      const iB = await createPlantInstance(catalog, engine, host, sB, undefined, immediateSchedule);

      // Tier A is keyed solely by definitionKey across arbitrary shapes.
      expect(plantResourcePoolDiagnostics(engine).staticGeometries).toBe(1);
      const meshA0 = iA.plant.mesh as BufferMesh;
      const meshB0 = iB.plant.mesh as BufferMesh;
      expect(meshA0.vertexBufferBindings[1]!.buffer).toBe(meshB0.vertexBufferBindings[1]!.buffer);
      expect(meshA0.indexBufferBinding!.buffer).toBe(meshB0.indexBufferBinding!.buffer);
      expect(iA.plant.support.children[0].getComponent(MeshRenderer)!.mesh).toBe(
        iB.plant.support.children[0].getComponent(MeshRenderer)!.mesh
      );

      // Tier B sole owner stepping across 5 growth ages reuses the exact same BufferMesh and dynamic VBO in-place.
      const dynBufA0 = meshA0.vertexBufferBindings[0]!.buffer;
      for (const nextProgress of [0.25, 0.3, 0.35, 0.4]) {
        iA.update({ ...createPlantRenderState(catalog, crop.id, "solo-a", nextProgress), shape: shapeA });
        expect(iA.plant.mesh).toBe(meshA0);
        expect(meshA0.vertexBufferBindings[0]!.buffer).toBe(dynBufA0);
        expect(dynBufA0.destroyed).toBe(false);
        expect(plantResourcePoolDiagnostics(engine).growthMeshes).toBe(2);
        expect(plantResourcePoolDiagnostics(engine).growthReferences).toBe(2);
      }
      const expectedAgeAt04 = iA.query().age;

      // Out-of-range shape on setGrowth throws cleanly without mutating key/geometry/pool.
      expect(() => iA.plant.setGrowth(0.45, { leafSpread: 99, stemBend: 1, fruitScale: 1 })).toThrow();
      expect(iA.plant.mesh).toBe(meshA0);
      expect(iA.plant.geometry.age).toBeCloseTo(expectedAgeAt04, 3);

      // When iB arrives at iA's current bucket (0.4, shapeA), it shares iA's in-place re-keyed BufferMesh.
      iB.update({ ...createPlantRenderState(catalog, crop.id, "solo-b", 0.4), shape: shapeA });
      expect(iB.plant.mesh).toBe(meshA0);
      expect(plantResourcePoolDiagnostics(engine).growthMeshes).toBe(1);
      expect(plantResourcePoolDiagnostics(engine).growthReferences).toBe(2);

      // Now that refCount === 2, advancing iA splits cleanly into a second pooled mesh without mutating iB.
      iA.update({ ...createPlantRenderState(catalog, crop.id, "solo-a", 0.55), shape: shapeA });
      expect(iA.plant.mesh).not.toBe(meshA0);
      expect(iB.plant.mesh).toBe(meshA0);
      expect(plantResourcePoolDiagnostics(engine).growthMeshes).toBe(2);

      iA.dispose();
      iB.dispose();
      expect(plantResourcePoolDiagnostics(engine)).toEqual({
        materials: 0,
        materialReferences: 0,
        staticGeometries: 0,
        staticReferences: 0,
        growthMeshes: 0,
        growthReferences: 0
      });
    });

    it("CR-001: keeps species material ownership atomic when setGrowth throws (both pooled and non-pooled clone paths)", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const camEntity = scene.createRootEntity("cam");
      camEntity.addComponent(Camera).enabled = false;
      const host = scene.createRootEntity("crops-cr001");

      const baseRecipe = rosetteRecipe();
      const recipe = {
        ...baseRecipe,
        schemaVersion: 1,
        leafTemplates: [],
        supports: [{ id: "stake", center: [0, 0.3, 0] as const, size: [0.02, 0.6, 0.02] as const, uv: [0.1, 0.1] as const }],
        volumes: []
      };
      const plantDef = Object.freeze({
        ...fixtureMetadata(recipe.id),
        recipe,
        atlasUrl: "/mock-plant-atlas.png"
      });
      const baseCrop = TEST_FARMING_DEFINITIONS.catalog.crops[0];
      const crop = {
        ...baseCrop,
        appearance: {
          ...baseCrop.appearance,
          plantId: plantDef.id,
          plantRevision: plantDef.revision,
          recipeRevision: plantDef.recipe.revision,
          ageByStage: [
            { stageId: "seeded", age: 0 },
            { stageId: "growing", age: 0 },
            { stageId: "mature", age: 1 }
          ]
        }
      };
      const catalog = createPlantingCatalog([crop], [plantDef]);

      const tex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false);
      textures.push(tex);
      vi.spyOn(engine.resourceManager, "load").mockResolvedValue(tex as never);
      const immediateSchedule: Parameters<typeof createPlantInstance>[4] = async (work) => work();

      // Part 1: Borrowed mature plant calling invalid setGrowth keeps pool refs intact and cleans up to 0.
      const matureInst = await createPlantInstance(
        catalog,
        engine,
        host,
        createPlantRenderState(catalog, crop.id, "mature-borrowed", 1),
        undefined,
        immediateSchedule
      );
      expect(matureInst.plant.shared).toBe(true);
      expect(() => matureInst.plant.setGrowth(0.5, { leafSpread: 99, stemBend: 1, fruitScale: 1 })).toThrow();
      expect(matureInst.plant.shared).toBe(true);
      matureInst.dispose();
      expect(plantResourcePoolDiagnostics(engine)).toEqual({
        materials: 0,
        materialReferences: 0,
        staticGeometries: 0,
        staticReferences: 0,
        growthMeshes: 0,
        growthReferences: 0
      });
      expect(maturePlantResourceDiagnostics(engine).entries).toBe(0);

      // Part 2: Non-pooled cloned material fallback must not bind destroyed source material on retry after failed setGrowth.
      const validatedRecipe = parsePlantGrowthRecipe(recipe);
      const standaloneMat = new PBRMaterial(engine);
      materials.push(standaloneMat);
      const sourcePlant = new ProceduralPlant(validatedRecipe, engine, host, standaloneMat);
      let borrowedReleased = false;
      const borrowedPlant = new ProceduralPlant(
        validatedRecipe,
        engine,
        host,
        standaloneMat,
        undefined,
        {
          plant: sourcePlant,
          release: () => {
            borrowedReleased = true;
            sourcePlant.dispose();
            standaloneMat.destroy(true);
          }
        },
        DEFAULT_PLANT_SHAPE,
        { definitionKey: plantDefinitionKey(plantDef), poolGrowth: true }
      );

      expect(() => borrowedPlant.setGrowth(0.5, { leafSpread: 99, stemBend: 1, fruitScale: 1 })).toThrow();
      expect(borrowedReleased).toBe(false);
      expect(borrowedPlant.renderer.getMaterial()).toBe(standaloneMat);

      borrowedPlant.setGrowth(0.5, DEFAULT_PLANT_SHAPE);
      expect(borrowedReleased).toBe(true);
      expect(standaloneMat.destroyed).toBe(true);
      const liveMat = borrowedPlant.renderer.getMaterial()!;
      expect(liveMat).not.toBe(standaloneMat);
      expect(liveMat.destroyed).toBe(false);

      borrowedPlant.dispose();
      expect(liveMat.destroyed).toBe(true);
      expect(plantResourcePoolDiagnostics(engine)).toEqual({
        materials: 0,
        materialReferences: 0,
        staticGeometries: 0,
        staticReferences: 0,
        growthMeshes: 0,
        growthReferences: 0
      });
    });

    it("CR-P2/P3 regressions: PlantPresenter uses updateValidated fast path without full update/Zod, ProceduralPlant fast-paths unchanged bucket+shape, and hintTargetKey caches unchanged coordinates", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const scene = engine.sceneManager.activeScene!;
      const host = scene.createRootEntity("fastpath-host");
      const camEntity = scene.createRootEntity("fastpath-cam");
      camEntity.transform.setPosition(0.625, 2.5, 4);
      const cam = camEntity.addComponent(Camera);
      cam.enabled = false;

      const recipe = parsePlantGrowthRecipe(rosetteRecipe());
      const plantDef = Object.freeze({
        ...fixtureMetadata(recipe.id),
        recipe,
        atlasUrl: "/mock-plant-atlas.png"
      });
      const baseCrop = TEST_FARMING_DEFINITIONS.catalog.crops[0];
      const crop = {
        ...baseCrop,
        appearance: {
          ...baseCrop.appearance,
          plantId: plantDef.id,
          plantRevision: plantDef.revision,
          recipeRevision: plantDef.recipe.revision,
          ageByStage: [
            { stageId: "seeded", age: 0 },
            { stageId: "growing", age: 0 },
            { stageId: "mature", age: 1 }
          ]
        }
      };
      const catalog = createPlantingCatalog([crop], [plantDef]);

      const tex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false);
      textures.push(tex);
      vi.spyOn(engine.resourceManager, "load").mockResolvedValue(tex as never);

      // 1. P2-1: PlantPresenter.apply uses updateValidated instead of instance.update(...)
      const loadErrors: string[] = [];
      const presenter = new PlantPresenter(
        engine,
        catalog,
        () => host,
        (id, state, msg) => {
          if (state === "error") loadErrors.push(`${id}:${msg ?? ""}`);
        },
        {
          interpolationMs: 200,
          schedule: { budgetMs: 100, selectedHz: 1000, nearHz: 1000, farHz: 1000 }
        }
      );
      disposables.push(presenter);

      const s0 = createPlantRenderState(catalog, crop.id, "fast-inst-1", 0.2);
      presenter.sync([s0], false, 0);
      const entries = (presenter as unknown as {
        entries: Map<string, { instance?: Awaited<ReturnType<typeof createPlantInstance>>; task?: unknown }>;
      }).entries;
      for (let i = 0; i < 32; i++) {
        presenter.update(0, () => 1);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const current = entries.get("fast-inst-1");
        if (current?.instance && current?.task) break;
      }
      expect(loadErrors).toEqual([]);
      const entry = entries.get("fast-inst-1");
      expect(entry?.instance).toBeDefined();
      expect(entry?.task).toBeDefined();
      presenter.update(10, () => 1);
      const inst = entry!.instance!;

      expect(inst.updateValidated).toBeTypeOf("function");
      const fullUpdateSpy = vi.spyOn(inst, "update");
      const fastUpdateSpy = vi.spyOn(inst as Required<typeof inst>, "updateValidated");

      presenter.sync([{ ...s0, progress: 0.6 }], false, 100);
      presenter.update(180, () => 1);
      expect(fullUpdateSpy).not.toHaveBeenCalled();
      expect(fastUpdateSpy).toHaveBeenCalled();
      expect(inst.query().state.progress).toBeGreaterThan(0.2);
      expect(inst.query().state.progress).toBeLessThan(0.6);
      expect(() =>
        inst.update({ ...s0, progress: 0.5, shape: { leafSpread: 99, stemBend: 1, fruitScale: 1 } })
      ).toThrow();
      expect(() => inst.updateValidated!(s0, Number.NaN)).toThrow();

      // 2. P2-2: ProceduralPlant.setGrowth fast-path avoids material/string key work on same bucket + numeric shape
      const { plant } = inst;
      plant.setGrowth(0.4, DEFAULT_PLANT_SHAPE);
      const acquireMatSpy = vi.spyOn(
        plant as unknown as { acquireSpeciesMaterialInto: (...args: unknown[]) => void },
        "acquireSpeciesMaterialInto"
      );
      const countBefore = plant.updateCount;
      plant.setGrowth(0.4004, {
        leafSpread: DEFAULT_PLANT_SHAPE.leafSpread,
        stemBend: DEFAULT_PLANT_SHAPE.stemBend,
        fruitScale: DEFAULT_PLANT_SHAPE.fruitScale
      });
      expect(plant.updateCount).toBe(countBefore);
      expect(acquireMatSpy).not.toHaveBeenCalled();

      // 3. P3-5: FarmingWorldPresentation reuses target string on unchanged hint coordinates
      const definitions = TEST_FARMING_DEFINITIONS;
      const clock = new ManualFarmClock(1000);
      const service = new FarmingService({
        repository: new MemoryFarmRepository(),
        definitions,
        groundProvider: TEST_GROUND_PROVIDER,
        clock,
        farmId: "hint-farm",
        layoutId: "hint-farm",
        layoutVersion: 1,
        plots: [{ id: "p0", label: "P0", target: { groundId: "soil", cellX: 0, cellZ: 0 } }]
      });
      await service.initialize();
      disposables.push(service);
      vi.spyOn(FarmingTargetHint, "create").mockReturnValue(undefined!);
      const presentation = new FarmingWorldPresentation(host, cam, service, TEST_GROUND_PROVIDER, definitions);
      disposables.push(presentation);
      const hintQuerySpy = vi.fn((_ray: unknown, _distance: number, _target: string) => false);
      presentation.setPlayerOcclusionQuery(undefined, hintQuerySpy);
      const p1 = new Vector3(0.625, 0, -3.125);
      (presentation as unknown as { hintOccluded: (p: Vector3) => boolean }).hintOccluded(p1);
      (presentation as unknown as { hintOccluded: (p: Vector3) => boolean }).hintOccluded(p1);
      expect(hintQuerySpy).toHaveBeenCalledTimes(2);
      expect(Object.is(hintQuerySpy.mock.calls[0][2], hintQuerySpy.mock.calls[1][2])).toBe(true);
      (presentation as unknown as { hintOccluded: (p: Vector3) => boolean }).hintOccluded(new Vector3(1.25, 0, -3.125));
      expect(hintQuerySpy.mock.calls[2][2]).toBe("1.25,0,-3.125");
    });

    it("compiles SoilMoisture, PlantHarvest, and BasketReveal shaders with dead uniforms and samplers pruned", async () => {
      const engine = await createCompiledHeadlessEngine();
      engines.push(engine);
      const root = engine.sceneManager.activeScene!.createRootEntity("farming-shader-prune-test");

      const soilShader = Shader.find("Farming/SoilMoisture") ?? Shader.create(SOIL_MOISTURE_SHADER);
      const soilForward = soilShader.subShaders[0].passes.find((pass) => pass.name === "Forward Pass")!;
      const soilBatchFs = ShaderMacroProcessor.evaluate(
        soilForward._fragmentShaderInstructions,
        new Map<string, string>([
          ["GRAPHICS_API_WEBGL2", ""],
          ["FARM_SOIL_BATCH", ""],
          ["RENDERER_ENABLE_VERTEXCOLOR", ""]
        ])
      );
      expect(soilBatchFs).not.toContain("soil_Row0");
      expect(soilBatchFs).not.toContain("soil_BoundaryProgress");
      expect(soilBatchFs).not.toContain("soil_CultivationProgress");
      const soilSingleFs = ShaderMacroProcessor.evaluate(
        soilForward._fragmentShaderInstructions,
        new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]])
      );
      expect(soilSingleFs).toContain("soil_Row0");
      expect(soilSingleFs).toContain("soil_CultivationProgress");

      const harvestShader = Shader.find("Farming/HarvestDissolve") ?? Shader.create(PLANT_HARVEST_SHADER);
      for (const passName of ["ShadowCaster", "DepthOnly"] as const) {
        const pass = harvestShader.subShaders[0].passes.find((entry) => entry.name === passName)!;
        const opaqueFs = ShaderMacroProcessor.evaluate(
          pass._fragmentShaderInstructions,
          new Map<string, string>([
            ["GRAPHICS_API_WEBGL2", ""],
            ["MATERIAL_HAS_BASETEXTURE", ""]
          ])
        );
        expect(opaqueFs).not.toContain("material_BaseTexture");
        expect(opaqueFs).not.toContain("material_BaseColor");
        expect(opaqueFs).not.toContain("material_AlphaCutoff");

        const cutoutFs = ShaderMacroProcessor.evaluate(
          pass._fragmentShaderInstructions,
          new Map<string, string>([
            ["GRAPHICS_API_WEBGL2", ""],
            ["MATERIAL_IS_ALPHA_CUTOFF", ""],
            ["MATERIAL_HAS_BASETEXTURE", ""]
          ])
        );
        expect(cutoutFs).toContain("material_BaseTexture");
        expect(cutoutFs).toContain("material_AlphaCutoff");
      }

      const produce = new HarvestProduce(root, {
        eventId: 1,
        cropId: "tomato",
        quantity: 1,
        slot: 0,
        revealAt: 0
      });
      disposables.push(produce);
      const basketShader = Shader.find("Farming/BasketReveal")!;
      expect(basketShader).toBeTruthy();
      for (const pass of basketShader.subShaders[0].passes) {
        const fs = ShaderMacroProcessor.evaluate(
          pass._fragmentShaderInstructions,
          new Map<string, string>([["GRAPHICS_API_WEBGL2", ""]])
        );
        expect(fs).not.toContain("harvest_NoiseTexture");
      }
    });
  });
});
