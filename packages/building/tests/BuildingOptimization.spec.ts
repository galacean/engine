import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Camera,
  CullMode,
  Entity,
  Layer,
  MeshRenderer,
  PointLight,
  Scene,
  Script,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderFactory,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderProperty,
  VertexElementFormat,
  type Engine,
  type Material
} from "@galacean/engine";
import { LightManager } from "../../core/src/lighting/LightManager";
import { BUILDING_RENDER_LAYER } from "../src/building/runtime/BuildingRenderLayer";
import { EffectiveSurface } from "../src/building/core/geometry";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { constructionAssets } from "./fixtures/constructionAssets";
import { BuildingGlobalProxy } from "../src/building/runtime/BuildingGlobalProxy";
import { createBuildingDistanceView } from "../src/building/runtime/BuildingDistanceView";
import { mergePlannedMasonryVertexData } from "../src/building/runtime/MasonryDistanceVertexData";
import { masonryAppearance } from "../src/building/runtime/MasonryAppearance";
import { buildingGroupKey, buildingPartKey } from "../src/building/runtime/BuildingObjectIdentity";
import { MaterialUnitLod } from "../src/building/runtime/MaterialUnitLod.js";
import { WoodUnitLod } from "../src/building/runtime/WoodUnitLod.js";
import { f32BitsToHalf, packUnits } from "../src/building/runtime/UnitPacking.js";
import { EngineResidentScene, VIEW_CONSTANTS_CAMERA_PATCH } from "../src/building/runtime/EngineResidentScene";
import { ConstructionDecorationLights } from "../src/building/runtime/ConstructionDecorationLights";
import { scaledNativeAttribute } from "../src/building/resources/BuildingGeometry";
import type { ConstructionPreview, ConstructionPreviewPart } from "../src/building/runtime/ConstructionPreview";
import { registerConstructionSceneLighting } from "../src/building/runtime/ConstructionSceneLighting";
import { constructionPlasterGLSL } from "../src/building/runtime/ConstructionPlasterShader";
import { injectWallRoofJoint } from "../src/building/runtime/ConstructionWallRoofJointShader";
import lodDither from "../src/building/runtime/MasonryLodDither.glsl?raw";
import distanceSurfaceShader from "../src/building/runtime/MasonryDistanceSurface.shader?raw";
import farProxyShader from "../src/building/runtime/MasonryFarProxy.shader?raw";
import globalProxyShader from "../src/building/runtime/MasonryGlobalProxy.shader?raw";

function createMockEngine(): Engine {
  const noop = () => {};
  const mockRhi = {
    supportsRendering: true,
    canIUse: () => true,
    supportsTextureFormat: () => true,
    capability: {},
    createPlatformBuffer: () => ({ bind: noop, setData: noop, getData: noop, destroy: noop }),
    createPlatformTexture: () => ({ destroy: noop, setImageSource: noop, setPixelBuffer: noop }),
    createPlatformTexture2D: () => ({
      destroy: noop,
      setImageSource: noop,
      setPixelBuffer: noop,
      setWrapModeU: noop,
      setWrapModeV: noop,
      setFilterMode: noop,
      setAnisoLevel: noop,
      setDepthCompareFunction: noop,
      generateMipmaps: noop
    }),
    createPlatformPrimitive: () => ({ draw: noop, destroy: noop })
  };
  return {
    _hardwareRenderer: mockRhi,
    _isDeviceLost: false,
    _frameInProcess: false,
    _processingPendingDestroys: false,
    _pendingDestroyObjects: [] as unknown[],
    _renderingStatistics: { _bufferMemory: 0, _textureMemory: 0 },
    canvas: { width: 1280, height: 720 },
    resourceManager: {
      _deleteAsset: noop,
      addContentRestorer: noop,
      _addContentRestorer: noop,
      _deleteContentRestorer: noop,
      _addReferResource: noop,
      _deleteReferResource: noop,
      _addGraphicResource: noop,
      _deleteGraphicResource: noop
    }
  } as unknown as Engine;
}

function createMockScene(engine: Engine): Scene {
  const noop = () => {};
  return Object.assign(Object.create(Scene.prototype), {
    _engine: engine,
    _rootEntities: [],
    _isActiveInEngine: true,
    _componentsManager: {
      getActiveChangedTempList: () => [],
      putActiveChangedTempList: noop,
      addRenderer: noop,
      removeRenderer: noop,
      addOnStartScript: noop,
      removeOnStartScript: noop,
      addOnUpdateScript: noop,
      removeOnUpdateScript: noop,
      addOnLateUpdateScript: noop,
      removeOnLateUpdateScript: noop
    }
  }) as Scene;
}

function quadPart(
  owner: string,
  pickId: string | undefined,
  opts: { decoration?: boolean; plaster?: ConstructionPreviewPart["plaster"]; xOffset?: number } = {}
): ConstructionPreviewPart {
  const x = opts.xOffset ?? 0;
  return {
    owner,
    material: "brick",
    placement: "unit",
    pickId,
    decoration: opts.decoration,
    plaster: opts.plaster,
    color: [0.8, 0.7, 0.6],
    positions: [x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ],
    colors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    emission: [0, 0, 0, 0]
  };
}

function makeUnitBoxPart(owner: string): ConstructionPreviewPart {
  const faces: readonly { n: [number, number, number]; corners: [number, number, number][] }[] = [
    {
      n: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 2, 0],
        [1, 2, 1],
        [1, 0, 1]
      ]
    },
    {
      n: [-1, 0, 0],
      corners: [
        [0, 0, 1],
        [0, 2, 1],
        [0, 2, 0],
        [0, 0, 0]
      ]
    },
    {
      n: [0, 1, 0],
      corners: [
        [0, 2, 1],
        [1, 2, 1],
        [1, 2, 0],
        [0, 2, 0]
      ]
    },
    {
      n: [0, -1, 0],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1]
      ]
    },
    {
      n: [0, 0, 1],
      corners: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 2, 1],
        [0, 2, 1]
      ]
    },
    {
      n: [0, 0, -1],
      corners: [
        [1, 0, 0],
        [0, 0, 0],
        [0, 2, 0],
        [1, 2, 0]
      ]
    }
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[][] = [];
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    for (const c of f.corners) {
      positions.push(c[0], c[1], c[2]);
      normals.push(f.n[0], f.n[1], f.n[2]);
    }
    uvs.push([0, 0], [1, 0], [1, 1], [0, 1]);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    owner,
    material: "brick",
    placement: "unit",
    color: [0.5, 0.5, 0.5],
    positions,
    normals,
    indices,
    uvs
  };
}

function makeSupportCell(id: string) {
  return {
    id,
    logical_id: id,
    surface_id: "wall",
    anchor_uv: [0, 0],
    center: [0, 0, 0],
    tangent: [1, 0, 0],
    bitangent: [0, 1, 0],
    normal: [0, 0, 1],
    size: [0.5, 0.25, 0.2]
  };
}

describe("Building system optimization invariants", () => {
  const activeScenes: Scene[] = [];
  let prevCompiler: ShaderCompiler | undefined;
  let compilerHooked = false;

  afterEach(() => {
    for (const scene of activeScenes.splice(0)) {
      BuildingGlobalProxy.existing(scene)?.destroy();
      for (const root of [...scene.rootEntities]) root.destroy();
    }
    if (compilerHooked) {
      (Shader as unknown as { _shaderCompiler: ShaderCompiler | undefined })._shaderCompiler = prevCompiler;
      compilerHooked = false;
    }
  });

  function installCompiler(): void {
    registerConstructionSceneLighting();
    if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"])
      ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
    if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"])
      ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(ShaderFactory.includeMap);
    const shaderCtor = Shader as unknown as { _shaderCompiler: ShaderCompiler | undefined };
    if (!compilerHooked) {
      prevCompiler = shaderCtor._shaderCompiler;
      compilerHooked = true;
    }
    shaderCtor._shaderCompiler = compiler;
  }

  describe("UnitPacking", () => {
    it("matches Node crypto SHA-256 seeds bit-for-bit across ASCII, long, and UTF-8 strings", async () => {
      const inputs = [
        "",
        "a",
        "house/wall/0/1/0/0",
        "very-long-building-cell-identifier-crossing-two-sha256-blocks-0123456789abcdef-fedcba9876543210",
        "屋顶/砖墙/🧱🏠/αβγδ"
      ];
      const packed = await packUnits({
        cells: inputs.map((id) => makeSupportCell(id)),
        slot: 3,
        materials: ["wooden_plank"]
      });
      // `materials` filter omits unselected buffers.
      expect(packed.brick.byteLength).toBe(0);
      expect(packed.roof_tile.byteLength).toBe(0);
      expect(packed.wooden_plank.byteLength).toBe(inputs.length * 80);

      const view = new DataView(packed.wooden_plank.buffer);
      for (let i = 0; i < inputs.length; i++) {
        const expected = createHash("sha256").update(inputs[i]!, "utf8").digest().readUInt32LE(0) & 0x7fffffff;
        expect(view.getInt32(i * 80 + 48, true)).toBe(expected);
        expect(view.getInt32(i * 80 + 52, true)).toBe(expected);
      }

      // roof_raw_records validates missing entries and byteLength !== 64.
      await expect(
        packUnits({
          cells: [makeSupportCell("tile-a")],
          slot: 0,
          materials: ["roof_tile"],
          roof_raw_records: new Map()
        })
      ).rejects.toThrow("Invalid roof_raw_records entry for cell tile-a");
      await expect(
        packUnits({
          cells: [makeSupportCell("tile-a")],
          slot: 0,
          materials: ["roof_tile"],
          roof_raw_records: new Map([["tile-a", new Uint8Array(32)]])
        })
      ).rejects.toThrow("Invalid roof_raw_records entry for cell tile-a");
    });

    it("converts IEEE-754 float32 bits to float16 across sign, subnormals, rounding ties, overflow, and NaN", () => {
      const refBitsToHalf = (bits: number): number => {
        const sign = (bits >>> 16) & 0x8000,
          exponent = (bits >>> 23) & 255,
          fraction = bits & 0x7fffff;
        const round = (v: number, shift: number) => {
          const d = 2 ** shift,
            q = Math.floor(v / d),
            r = v - q * d;
          return q + Number(r > d / 2 || (r === d / 2 && (q & 1) !== 0));
        };
        if (exponent === 255) return sign | 0x7c00 | (fraction ? (fraction >>> 13) | 0x200 : 0);
        if (exponent >= 143) return sign | 0x7c00;
        if (exponent < 102) return sign;
        if (exponent <= 112) return sign | round(0x800000 | fraction, 126 - exponent);
        return sign | (((exponent - 112) << 10) + round(fraction, 13));
      };
      const testBits = [
        0x00000000, // +0
        0x80000000, // -0
        0x3f800000, // 1.0
        0xbf800000, // -1.0
        0x3f801000, // exact even tie -> down
        0x3f803000, // exact odd tie -> up
        0x33800000, // smallest subnormal 2^-24
        0x33400000, // underflow to +0
        0x387ff000, // subnormal-to-normal round up (exponent 112)
        0x477fe000, // 65504 max finite half
        0x47800000, // 65536 overflow -> Inf
        0x7f800000, // +Inf
        0xff800000, // -Inf
        0x7fc00001 // qNaN with payload
      ];
      for (const b of testBits) {
        expect(f32BitsToHalf(b)).toBe(refBitsToHalf(b));
      }
    });
  });

  describe("MaterialUnitLod", () => {
    it("takes O(1) early-out when forced >= 0 is unchanged and applies 6-plane frustum culling when free", () => {
      // Unit 0 in front of camera at z=0; Unit 1 far outside frustum right at x=500; Unit 2 behind camera at z=30.
      const bounds = new Float32Array([0, 0, 0, 1, 500, 0, 0, 1, 0, 0, 30, 1]);
      const force = new Uint8Array([0, 0, 0]);
      const lod = new MaterialUnitLod(bounds, force, 10, 20);
      const viewA = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1]);
      const viewB = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -18, 1]);

      // 6 standard frustum planes (nx, ny, nz, d) enclosing [-10, 10]^3 around origin -> Unit 0 only.
      const frustumPlanes = new Float32Array([
        1, 0, 0, 10, -1, 0, 0, 10, 0, 1, 0, 10, 0, -1, 0, 10, 0, 0, 1, 10, 0, 0, -1, 10
      ]);
      expect(lod.update(viewA, 720, false, 1, -1, frustumPlanes)).toBe(true);
      expect(lod.highCount).toBe(1);
      expect(lod.high[0]).toBe(0);

      // Forced >= 0 includes all 3 units regardless of frustum, and returns false on subsequent camera move.
      expect(lod.update(viewA, 720, false, 1, 0, frustumPlanes)).toBe(true);
      expect(lod.highCount).toBe(3);
      expect(lod.lowCount).toBe(0);
      expect(lod.update(viewB, 720, false, 1, 0, frustumPlanes)).toBe(false);
      // Changing forced level triggers rebuild cleanly.
      expect(lod.update(viewB, 720, false, 1, 1, frustumPlanes)).toBe(true);
      expect(lod.highCount).toBe(0);
      expect(lod.lowCount).toBe(3);
    });
  });

  describe("BuildingDistanceView batching, macros, and cleanup", () => {
    it("batches static LOD1 decorations with per-part UV1.x pickIds, toggles Early-Z macros cleanly, and disposes on release", async () => {
      installCompiler();
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const parent = scene.createRootEntity("bldg");
      const assets = constructionAssets();
      const dec1 = quadPart("houseA", "dec-1", { decoration: true, xOffset: 0 });
      const dec2 = quadPart("houseA", "dec-2", { decoration: true, xOffset: 3 });
      const plaster = quadPart("houseA", undefined, {
        plaster: { wear: 0.25, wallLength: 4, color: 0, edgeDistances: [0.5, 0.5, 0.5, 0.5] },
        xOffset: 6
      });
      const preview: ConstructionPreview = {
        bounds: { min: [0, 0, -0.1], max: [7, 1, 0.1] },
        parts: [dec1, dec2, plaster],
        stones: [],
        decorationParts: [],
        frames: [],
        woodArchFrames: [],
        woodArchPillars: [],
        archGroups: [],
        retainedWallUnits: []
      };
      const mergedData = mergePlannedMasonryVertexData([
        { part: dec1, pickIndex: 0 },
        { part: dec2, pickIndex: 1 }
      ]);
      expect(mergedData.count).toBe(8);
      // UV1.x sits at float index 12 of stride 14 floats.
      expect(mergedData.data[12]).toBe(0);
      expect(mergedData.data[4 * 14 + 12]).toBe(1);

      const view = await createBuildingDistanceView(
        engine,
        parent,
        {
          colorOwners: [{ id: "houseA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
          paletteSlots: [{ seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }]
        },
        preview,
        assets,
        undefined,
        undefined,
        { unifiedGlobalProxy: false }
      );
      await view.warmupDetailedVisual();

      const picks: any[] = [];
      view.setFarProxyActive(false);
      view.setVisualVisible(true);
      view.visitPickBatches((b) => picks.push(b));

      // Two decorations batched into 1 draw + 1 plaster draw = 2 draws (instead of 3 unbatched).
      expect(picks).toHaveLength(2);
      // The detailed, shadow and standalone far draws are separate children of this view.
      expect(
        view.root.getComponentsIncludeChildren(MeshRenderer, []).every((r) => r.entity.layer === BUILDING_RENDER_LAYER)
      ).toBe(true);
      const decBatch = picks.find((b) => b.count === 2)!;
      expect(decBatch).toBeDefined();
      expect(decBatch.resolve(0)).toBe(buildingPartKey("dec-1"));
      expect(decBatch.resolve(1)).toBe(buildingPartKey("dec-2"));
      const plasterBatch = picks.find((b) => b.count === 1)!;
      expect(plasterBatch.resolve(0)).toBe(buildingGroupKey("houseA"));

      const decMat: Material = decBatch.renderer.getMaterial()!;
      const plasterMat: Material = plasterBatch.renderer.getMaterial()!;
      const macroPlaster = ShaderMacro.getByName("MASONRY_PLASTER");
      const macroDither = ShaderMacro.getByName("MASONRY_SURFACE_DITHER");
      expect(plasterMat.shaderData._macroCollection.isEnable(macroPlaster)).toBe(true);
      expect(decMat.shaderData._macroCollection.isEnable(macroPlaster)).toBe(false);

      // Priority ordering: decorations before plaster.
      expect(decBatch.renderer.priority).toBeLessThan(plasterBatch.renderer.priority);

      // Dither macro is enabled only while fading.
      expect(decMat.shaderData._macroCollection.isEnable(macroDither)).toBe(false);
      view.setFade(0.5);
      expect(decMat.shaderData._macroCollection.isEnable(macroDither)).toBe(true);
      expect(plasterMat.shaderData._macroCollection.isEnable(macroDither)).toBe(true);
      view.setFade(1);
      expect(decMat.shaderData._macroCollection.isEnable(macroDither)).toBe(false);

      // Refuses to strip LOD1 while actively viewing LOD1 (visualVisible && !farProxyMode).
      view.releaseDetailedVisual();
      await Promise.resolve();
      expect(decMat.destroyed).toBe(false);
      expect(plasterMat.destroyed).toBe(false);

      // Entering LOD2 releases stale GPU materials cleanly.
      view.setFarProxyActive(true);
      view.releaseDetailedVisual();
      await Promise.resolve();
      expect(decMat.destroyed).toBe(true);
      expect(plasterMat.destroyed).toBe(true);

      // Option A: stepping back to LOD1 re-hydrates visualRoot and restores pickable draws cleanly.
      view.setFarProxyActive(false);
      await Promise.resolve();
      await view.warmupDetailedVisual();
      const restoredPicks: any[] = [];
      view.visitPickBatches((b) => restoredPicks.push(b));
      expect(restoredPicks).toHaveLength(2);
      expect(restoredPicks.find((b) => b.count === 2)?.resolve(0)).toBe(buildingPartKey("dec-1"));
      expect(restoredPicks.find((b) => b.count === 1)?.resolve(0)).toBe(buildingGroupKey("houseA"));
      view.destroy();
    });

    it("re-hydrates LOD1 after release when setOwnerVisible hides one owner of a multi-owner building", async () => {
      installCompiler();
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const parent = scene.createRootEntity("MultiOwnerBldg");
      const assets = constructionAssets();
      const preview: ConstructionPreview = {
        bounds: { min: [0, 0, -0.1], max: [5, 2, 1.1] },
        parts: [makeUnitBoxPart("groupA"), makeUnitBoxPart("groupB")],
        stones: [],
        decorationParts: [],
        frames: [],
        woodArchFrames: [],
        woodArchPillars: [],
        archGroups: [],
        retainedWallUnits: []
      };
      const view = await createBuildingDistanceView(
        engine,
        parent,
        {
          colorOwners: [
            { id: "groupA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
            { id: "groupB", seed: 2, wallColor: 1, roofColor: 0, woodColor: 0 }
          ],
          paletteSlots: [
            { seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
            { seed: 2, wallColor: 1, roofColor: 0, woodColor: 0 }
          ]
        },
        preview,
        assets,
        undefined,
        undefined,
        { unifiedGlobalProxy: true }
      );
      await view.warmupDetailedVisual();
      view.setVisualVisible(true);
      view.setFarProxyActive(true);
      // Simulate releaseDetailedVisual() + same-frame setOwnerVisible() inside Engine.update().
      (engine as unknown as { _frameInProcess: boolean })._frameInProcess = true;
      const oldChildren = [...view.root.findByName("Visual surfaces")!.children];
      view.releaseDetailedVisual();
      expect(oldChildren.length).toBeGreaterThan(0);
      expect(oldChildren.every((c) => c.pendingDestroy && !c.isActive)).toBe(true);

      // Hiding one owner falls back from GlobalProxy -> visualRoot synchronously on the SAME frame (0 blank frame)
      // and must re-hydrate groupB cleanly without resurrecting pendingDestroy children.
      view.setOwnerVisible("groupA", false);
      const visualRoot = view.root.findByName("Visual surfaces")!;
      expect(visualRoot.isActive).toBe(true);
      const picksSameFrame: string[] = [];
      view.visitPickBatches((b) => picksSameFrame.push(b.resolve(0)!));
      expect(picksSameFrame).toEqual([buildingGroupKey("groupB")]);
      expect(oldChildren.every((c) => c.pendingDestroy && !c.isActive)).toBe(true);
      (engine as unknown as { _frameInProcess: boolean })._frameInProcess = false;

      await Promise.resolve();
      await view.warmupDetailedVisual();
      const picksAfterHide: string[] = [];
      view.visitPickBatches((b) => picksAfterHide.push(b.resolve(0)!));
      expect(picksAfterHide).toEqual([buildingGroupKey("groupB")]);

      // Refuses to strip LOD1 while any owner remains hidden.
      view.releaseDetailedVisual();
      await Promise.resolve();
      const picksStillAlive: string[] = [];
      view.visitPickBatches((b) => picksStillAlive.push(b.resolve(0)!));
      expect(picksStillAlive).toEqual([buildingGroupKey("groupB")]);
      view.destroy();
    });

    it("keeps GlobalProxy visible without a blank frame while detailed visual builds and plays uniform entrance on GlobalProxy", async () => {
      installCompiler();
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const parent = scene.createRootEntity("SmoothTransitionBldg");
      const assets = constructionAssets();
      const preview: ConstructionPreview = {
        bounds: { min: [0, 0, -0.1], max: [4, 3, 1.1] },
        parts: [makeUnitBoxPart("houseA")],
        stones: [],
        decorationParts: [],
        frames: [],
        woodArchFrames: [],
        woodArchPillars: [],
        archGroups: [],
        retainedWallUnits: []
      };
      const view = await createBuildingDistanceView(
        engine,
        parent,
        {
          colorOwners: [{ id: "houseA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
          paletteSlots: [{ seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }]
        },
        preview,
        assets,
        undefined,
        undefined,
        { unifiedGlobalProxy: true }
      );
      const proxy = BuildingGlobalProxy.existing(scene)!;
      expect(proxy).toBeDefined();
      view.setVisualVisible(true);
      proxy.flushIfDirty();

      const visualRoot = view.root.findByName("Visual surfaces")!;
      const renderers: MeshRenderer[] = [];
      proxy.root.getComponentsIncludeChildren(MeshRenderer, renderers);
      const boxRenderer = renderers.find((r) => r.entity.name.startsWith("GlobalProxyBoxes_"))!;
      const boxMat = boxRenderer.getMaterial()!;
      const macroEntrance = ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE");

      // Uniform entrance stays on GlobalProxy (no mass LOD1 materialization) and enables GLOBAL_PROXY_ENTRANCE.
      view.setEntrance(new Map([["houseA", { progress: 0.35, minimumY: 0, height: 3 }]]));
      await Promise.resolve();
      expect(visualRoot.isActive).toBe(false);
      expect(visualRoot.children.length).toBe(0);
      expect(boxMat.shaderData._macroCollection.isEnable(macroEntrance)).toBe(true);

      // Verify Masonry/GlobalProxy compiles cleanly with GLOBAL_PROXY_ENTRANCE enabled (both DepthOnly & Forward).
      const globalShader = Shader.find("Masonry/GlobalProxy")!;
      const macros = new ShaderMacroCollection();
      macros.enable(ShaderMacro.getByName("GLOBAL_PROXY_INSTANCED"));
      macros.enable(macroEntrance);
      for (const pass of globalShader.subShaders[0]!.passes) {
        const compiled = (
          pass as unknown as {
            _compileShaderSource(
              e: Engine,
              mc: ShaderMacroCollection
            ): { vertexSource: string; fragmentSource: string };
          }
        )._compileShaderSource(engine, macros);
        expect(compiled.vertexSource.length).toBeGreaterThan(0);
        expect(compiled.fragmentSource.length).toBeGreaterThan(0);
        if (pass.name === "DepthOnly" || pass.name === "Forward") {
          expect(compiled.vertexSource).toContain("material_ProxyEntrance");
          expect(compiled.fragmentSource).toContain("v.entrance.x");
        }
      }

      // Settling entrance disables GLOBAL_PROXY_ENTRANCE cleanly.
      view.setEntrance(new Map([["houseA", { progress: 1, minimumY: 0, height: 3 }]]));
      expect(boxMat.shaderData._macroCollection.isEnable(macroEntrance)).toBe(false);

      // Switching from GlobalProxy -> detailed visual must NOT hide GlobalProxy before visualRoot is ready!
      view.setFarProxyActive(false);
      // Immediately (same frame before microtask / async textures resolve): GlobalProxy stays visible, visualRoot stays inactive.
      expect(view.isVisualVisible).toBe(true);
      expect(visualRoot.isActive).toBe(false);
      const statesBeforeReady = boxMat.shaderData.getFloatArray("material_ProxyState")!;
      expect(statesBeforeReady[0]).toBe(1);

      // Once ensureDetailedVisual resolves, visualRoot activates and GlobalProxy hides atomically.
      await Promise.resolve();
      await view.warmupDetailedVisual();
      expect(visualRoot.isActive).toBe(true);
      expect(visualRoot.children.length).toBeGreaterThan(0);
      expect(statesBeforeReady[0]).toBe(0);
      view.destroy();
    });

    it("rolls back ensureDetailedVisual cleanly on transient context-loss failure without unhandled rejections or cache poisoning, and recovers on devicerestored", async () => {
      installCompiler();
      let contextLost = true;
      let createTextureFailures = 0;
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const engine = createMockEngine() as Engine & {
        on(event: string, fn: (...args: unknown[]) => void): void;
        off(event: string, fn: (...args: unknown[]) => void): void;
        _hardwareRenderer: { isContextLost?: () => boolean; createPlatformTexture2D: (...args: unknown[]) => unknown };
      };
      engine._hardwareRenderer.isContextLost = () => contextLost;
      engine.on = (event, fn) => {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(fn);
      };
      engine.off = (event, fn) => {
        listeners.get(event)?.delete(fn);
      };
      const emit = (event: string) => {
        for (const fn of [...(listeners.get(event) ?? [])]) fn();
      };

      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const assets = constructionAssets();

      // Case 1: Async DecorationNativeView / EngineResidentScene.load() rejects while WebGL context is lost.
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        const parentA = scene.createRootEntity("ContextLostAsyncBldg");
        const viewA = await createBuildingDistanceView(
          engine,
          parentA,
          {
            colorOwners: [
              { id: "houseA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
              { id: "houseB", seed: 2, wallColor: 0, roofColor: 0, woodColor: 0 }
            ],
            paletteSlots: [
              { seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
              { seed: 2, wallColor: 0, roofColor: 0, woodColor: 0 }
            ]
          },
          {
            bounds: { min: [0, 0, -0.5], max: [2, 2, 0.5] },
            parts: [quadPart("houseA", undefined), quadPart("houseB", undefined, { xOffset: 3 })],
            stones: [],
            decorationParts: [
              {
                ownerId: "houseA",
                pickId: "win-1",
                material: 0,
                positions: [0.5, 0.5, 0.1, 1.5, 0.5, 0.1, 1.5, 1.5, 0.1, 0.5, 1.5, 0.1],
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                colors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                indices: [0, 1, 2, 0, 2, 3],
                emission: [0, 0, 0, 0],
                center: [1, 1, 0.1],
                kind: 1
              } as unknown as ConstructionPreview["decorationParts"][number]
            ],
            frames: [],
            woodArchFrames: [],
            woodArchPillars: [],
            archGroups: [],
            retainedWallUnits: []
          },
          assets,
          undefined,
          undefined,
          { unifiedGlobalProxy: true }
        );
        const baseRestoreListenersA = listeners.get("devicerestored")?.size ?? 0;
        viewA.setVisualVisible(true);
        viewA.setFarProxyActive(false);
        await new Promise((r) => setTimeout(r, 25));

        const visualRootA = viewA.root.findByName("Visual surfaces")!;
        // Zero unhandled rejections, partial visualRoot children rolled back, GlobalProxy remains visible.
        expect(unhandled).toHaveLength(0);
        expect(visualRootA.children).toHaveLength(0);
        expect(visualRootA.isActive).toBe(false);
        expect(viewA.isVisualVisible).toBe(true);
        expect(listeners.get("devicerestored")?.size ?? 0).toBe(baseRestoreListenersA + 1);

        // Cooldown prevents retry storms when syncVisualRoots runs again while context is still lost.
        viewA.setOwnerVisible("houseB", false);
        await new Promise((r) => setTimeout(r, 10));
        expect(unhandled).toHaveLength(0);
        expect(visualRootA.children).toHaveLength(0);

        // Explicit warmupDetailedVisual() still surfaces the error and rolls back cleanly without poisoning cache.
        await expect(viewA.warmupDetailedVisual()).rejects.toThrow("interrupted by device loss");
        expect(visualRootA.children).toHaveLength(0);

        // Destroying the view detaches both the armed devicerestored listener and its GlobalProxy slot cleanly.
        viewA.destroy();
        expect(listeners.get("devicerestored")?.size ?? 0).toBe(0);

        // Case 2: Transient failure recovers automatically on devicerestored and activates visualRoot cleanly.
        contextLost = false;
        const origCreateTex = engine._hardwareRenderer.createPlatformTexture2D;
        createTextureFailures = 1;
        engine._hardwareRenderer.createPlatformTexture2D = (...args: unknown[]) => {
          if (createTextureFailures > 0) {
            createTextureFailures--;
            throw new Error("transient GPU texture allocation failure");
          }
          return origCreateTex(...args);
        };
        const parentB = scene.createRootEntity("RecoverOnRestoreBldg");
        const viewB = await createBuildingDistanceView(
          engine,
          parentB,
          {
            colorOwners: [{ id: "houseA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
            paletteSlots: [{ seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }]
          },
          {
            bounds: { min: [0, 0, -0.1], max: [4, 2, 0.1] },
            parts: [
              {
                ...quadPart("houseA", undefined),
                lodAppearance: {
                  width: 2,
                  height: 2,
                  data: new Uint8Array(16),
                  uvTransform: [1, 1, 0, 0]
                } as unknown as ConstructionPreviewPart["lodAppearance"]
              }
            ],
            stones: [],
            decorationParts: [],
            frames: [],
            woodArchFrames: [],
            woodArchPillars: [],
            archGroups: [],
            retainedWallUnits: []
          },
          assets,
          undefined,
          undefined,
          { unifiedGlobalProxy: true }
        );
        const visualRootB = viewB.root.findByName("Visual surfaces")!;
        const baseRestoreListenersB = listeners.get("devicerestored")?.size ?? 0;
        viewB.setVisualVisible(true);
        viewB.setFarProxyActive(false);
        await new Promise((r) => setTimeout(r, 15));

        // First attempt failed synchronously on texture alloc -> rolled back cleanly, GlobalProxy still visible, listener armed.
        expect(unhandled).toHaveLength(0);
        expect(visualRootB.children).toHaveLength(0);
        expect(visualRootB.isActive).toBe(false);
        expect(viewB.isVisualVisible).toBe(true);
        expect(listeners.get("devicerestored")?.size ?? 0).toBe(baseRestoreListenersB + 1);

        // devicerestored clears cooldown, retries automatically, and swaps atomically to visualRoot
        // (verified BEFORE calling warmupDetailedVisual so automatic restore is strictly falsifiable).
        emit("devicerestored");
        await new Promise((r) => setTimeout(r, 20));
        expect(unhandled).toHaveLength(0);
        expect(visualRootB.isActive).toBe(true);
        expect(visualRootB.children.length).toBeGreaterThan(0);
        expect(listeners.get("devicerestored")?.size ?? 0).toBe(baseRestoreListenersB);
        viewB.destroy();

        // Case 3: Timer-based wakeup recovers automatically after 2000ms cooldown even when devicerestored never fires
        // (e.g., fast devicelost+devicerestored race or non-context-loss transient error on a stationary camera).
        vi.useFakeTimers();
        try {
          createTextureFailures = 1;
          const parentC = scene.createRootEntity("RecoverOnTimerBldg");
          const viewC = await createBuildingDistanceView(
            engine,
            parentC,
            {
              colorOwners: [{ id: "houseA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
              paletteSlots: [{ seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }]
            },
            {
              bounds: { min: [0, 0, -0.1], max: [4, 2, 0.1] },
              parts: [
                {
                  ...quadPart("houseA", undefined),
                  lodAppearance: {
                    width: 2,
                    height: 2,
                    data: new Uint8Array(16),
                    uvTransform: [1, 1, 0, 0]
                  } as unknown as ConstructionPreviewPart["lodAppearance"]
                }
              ],
              stones: [],
              decorationParts: [],
              frames: [],
              woodArchFrames: [],
              woodArchPillars: [],
              archGroups: [],
              retainedWallUnits: []
            },
            assets,
            undefined,
            undefined,
            { unifiedGlobalProxy: true }
          );
          const visualRootC = viewC.root.findByName("Visual surfaces")!;
          viewC.setVisualVisible(true);
          viewC.setFarProxyActive(false);
          await vi.advanceTimersByTimeAsync(10);
          expect(visualRootC.isActive).toBe(false);
          expect(visualRootC.children).toHaveLength(0);

          // Advance past 2000ms cooldown without emitting devicerestored -> retry timer wakes syncVisualRoots().
          await vi.advanceTimersByTimeAsync(2050);
          expect(unhandled).toHaveLength(0);
          expect(visualRootC.isActive).toBe(true);
          expect(visualRootC.children.length).toBeGreaterThan(0);
          viewC.destroy();
        } finally {
          vi.useRealTimers();
        }

        // Case 4: Partial setEntrance Map on a multi-owner building treats omitted owners as settled (non-uniform)
        // and does not enable GLOBAL_PROXY_ENTRANCE on GlobalProxy.
        const parentD = scene.createRootEntity("PartialEntranceBldg");
        const viewD = await createBuildingDistanceView(
          engine,
          parentD,
          {
            colorOwners: [
              { id: "groupA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
              { id: "groupB", seed: 2, wallColor: 0, roofColor: 0, woodColor: 0 }
            ],
            paletteSlots: [
              { seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
              { seed: 2, wallColor: 0, roofColor: 0, woodColor: 0 }
            ]
          },
          {
            bounds: { min: [0, 0, -0.1], max: [5, 2, 1.1] },
            parts: [makeUnitBoxPart("groupA"), makeUnitBoxPart("groupB")],
            stones: [],
            decorationParts: [],
            frames: [],
            woodArchFrames: [],
            woodArchPillars: [],
            archGroups: [],
            retainedWallUnits: []
          },
          assets,
          undefined,
          undefined,
          { unifiedGlobalProxy: true }
        );
        const proxyD = BuildingGlobalProxy.existing(scene)!;
        viewD.setVisualVisible(true);
        proxyD.flushIfDirty();
        viewD.setEntrance(new Map([["groupA", { progress: 0.35, minimumY: 0, height: 2 }]]));
        const proxyRenderersD: MeshRenderer[] = [];
        proxyD.root.getComponentsIncludeChildren(MeshRenderer, proxyRenderersD);
        const boxMatD = proxyRenderersD.find((r) => r.entity.name.startsWith("GlobalProxyBoxes_"))!.getMaterial()!;
        expect(boxMatD.shaderData._macroCollection.isEnable(ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE"))).toBe(
          false
        );
        expect(viewD.root.findByName("Visual surfaces")!.isActive).toBe(true);
        viewD.destroy();
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });

  describe("BuildingGlobalProxy CullMode, dither macro, warmup materials, and color refresh", () => {
    it("sets CullMode.Back on boxMat, toggles GLOBAL_PROXY_DITHER only when fading, and refreshes colors across cells", () => {
      installCompiler();
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const proxy = BuildingGlobalProxy.forScene(scene);
      const appearance = masonryAppearance({});

      const frameA = scene.createRootEntity("bldgA");
      frameA.transform.setPosition(10, 0, 10);
      const rootA = frameA.createChild("viewA");
      const boxWall = makeUnitBoxPart("wall");
      const slot = proxy.register({
        root: rootA,
        frame: frameA,
        parts: [boxWall],
        colorOwners: [{ id: "wall", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
        appearance,
        hiddenOwners: new Set()
      });
      slot.updateState(true, true, 1, false);
      proxy.flushIfDirty();

      const renderers: MeshRenderer[] = [];
      proxy.root.getComponentsIncludeChildren(MeshRenderer, renderers);
      const boxRenderer = renderers.find((r) => r.entity.name.startsWith("GlobalProxyBoxes_"))!;
      expect(boxRenderer.entity.layer).toBe(BUILDING_RENDER_LAYER);
      const boxMat = boxRenderer.getMaterial()!;

      const cullProp = ShaderProperty.getByName("rasterStateCullMode");
      expect(boxMat.shaderData.getInt(cullProp)).toBe(CullMode.Back);

      const macroProxyDither = ShaderMacro.getByName("GLOBAL_PROXY_DITHER");
      const macroResidentDither = ShaderMacro.getByName("RENDERER_MASONRY_DITHER");
      expect(boxMat.shaderData._macroCollection.isEnable(macroProxyDither)).toBe(false);
      expect(boxMat.shaderData._macroCollection.isEnable(macroResidentDither)).toBe(false);

      slot.updateState(true, true, 0.4, false);
      expect(boxMat.shaderData._macroCollection.isEnable(macroProxyDither)).toBe(true);
      expect(boxMat.shaderData._macroCollection.isEnable(macroResidentDither)).toBe(false);

      slot.updateState(true, true, 1, false);
      expect(boxMat.shaderData._macroCollection.isEnable(macroProxyDither)).toBe(false);

      // Inactive (non-far) sibling slot animating entrance must NOT enable GLOBAL_PROXY_ENTRANCE for settled far slots.
      const macroProxyEntrance = ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE");
      const frameB = scene.createRootEntity("bldgB");
      frameB.transform.setPosition(12, 0, 12);
      const rootB = frameB.createChild("viewB");
      const slotB = proxy.register({
        root: rootB,
        frame: frameB,
        parts: [makeUnitBoxPart("wallB")],
        colorOwners: [{ id: "wallB", seed: 2, wallColor: 0, roofColor: 0, woodColor: 0 }],
        appearance,
        hiddenOwners: new Set()
      });
      slotB.updateState(false, true, 1, false);
      slotB.updateEntrance(0.4, 0, 2);
      expect(boxMat.shaderData._macroCollection.isEnable(macroProxyEntrance)).toBe(false);
      slotB.updateState(true, false, 1, false);
      expect(boxMat.shaderData._macroCollection.isEnable(macroProxyEntrance)).toBe(true);
      slotB.updateEntrance(1, 0, 2);
      expect(boxMat.shaderData._macroCollection.isEnable(macroProxyEntrance)).toBe(false);
      slotB.destroy();

      // Cross-cell move + refreshColors relocates slot into a new cell bucket and preserves picking.
      const beforeBuckets = (proxy as unknown as { buckets: Array<{ cellKey: number; slots: unknown[] }> }).buckets.map(
        (b) => ({ cellKey: b.cellKey, count: b.slots.length })
      );
      frameA.transform.setPosition(200, 0, 200);
      slot.refreshColors();
      proxy.flushIfDirty();
      const afterBuckets = (proxy as unknown as { buckets: Array<{ cellKey: number; slots: unknown[] }> }).buckets.map(
        (b) => ({ cellKey: b.cellKey, count: b.slots.length })
      );
      expect(afterBuckets.filter((b) => b.count > 0)).toHaveLength(1);
      expect(afterBuckets.find((b) => b.count > 0)!.cellKey).not.toBe(beforeBuckets[0]!.cellKey);
      const movedIds: string[] = [];
      proxy.visitPickBatches((b) => {
        for (let i = 0; i < b.count; i++) movedIds.push(b.resolve(i)!);
      }, frameA);
      expect(movedIds).toEqual([buildingGroupKey("wall")]);
    });

    it("includes structMat (with GLOBAL_PROXY_PLASTER) in getWarmupExtraMaterials even when anyFar is false", () => {
      installCompiler();
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const proxy = BuildingGlobalProxy.forScene(scene);
      const appearance = masonryAppearance(engine);

      const frame = scene.createRootEntity("plasterCell");
      const root = frame.createChild("view");
      const plaster = quadPart("housePlaster", undefined, {
        plaster: { wear: 0.25, wallLength: 4, color: 0, edgeDistances: [0.5, 0.5, 0.5, 0.5] }
      });
      const slot = proxy.register({
        root,
        frame,
        parts: [plaster],
        colorOwners: [{ id: "housePlaster", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
        appearance,
        hiddenOwners: new Set()
      });
      // Keep anyFar = false so chunks currently bind structShadowOnlyMat.
      slot.updateState(false, false, 1, false);
      const extra = proxy.getWarmupExtraMaterials();
      const plasterMacro = ShaderMacro.getByName("GLOBAL_PROXY_PLASTER");
      const foundStructMat = [...extra.values()].flat().find((m) => m.shader.name === "Masonry/GlobalProxy");
      expect(foundStructMat).toBeDefined();
      expect(foundStructMat!.shaderData._macroCollection.isEnable(plasterMacro)).toBe(true);
    });
  });

  describe("Shader Early-Z & DepthOnly parity contracts", () => {
    it("removes no-op gl_FragDepth from wood shaders, aligns DepthOnly CullMode, and discards before shading", () => {
      const assetsDir = fileURLToPath(new URL("../src/building/assets/native/Shaders/", import.meta.url));
      const wood = readFileSync(assetsDir + "wood.shaderc", "utf8");
      const woodRoof = readFileSync(assetsDir + "wood_roof.shaderc", "utf8");
      const brick = readFileSync(assetsDir + "brick.shaderc", "utf8");
      expect(wood).not.toContain("gl_FragDepth");
      expect(wood).not.toContain("_6333");
      expect(woodRoof).not.toContain("gl_FragDepth");
      expect(woodRoof).not.toContain("_6333");
      expect(brick).toContain("& 1024) != 0) ? 0.0 :");

      // DepthOnly CullMode parity on DistanceSurface and GlobalProxy.
      expect(
        distanceSurfaceShader.match(/RasterState\s*=\s*\{\s*CullMode\s*=\s*rasterStateCullMode;\s*\}/g)
      ).toHaveLength(2);
      expect(globalProxyShader.match(/RasterState\s*=\s*\{\s*CullMode\s*=\s*rasterStateCullMode;\s*\}/g)).toHaveLength(
        2
      );

      // World-pick discards worn plaster before writing pick output; forward shading computes
      // plasterFinish() under uniform control flow (GLSL ES 3.00 §3.9.2 / §8.13.1) before discard
      // and skips downstream lighting/IBL shading.
      const finishCall = distanceSurfaceShader.indexOf("albedo=plasterFinish(");
      const forwardDiscard = distanceSurfaceShader.indexOf("if(plasterDetail.x<.5)discard;", finishCall);
      const lightCall = distanceSurfaceShader.indexOf("masonryResidentSceneLight(");
      expect(finishCall).toBeGreaterThan(-1);
      expect(forwardDiscard).toBeGreaterThan(finishCall);
      expect(forwardDiscard).toBeLessThan(lightCall);

      const plasterRenderSrc = readFileSync(
        fileURLToPath(new URL("../src/building/runtime/ConstructionPlasterRender.ts", import.meta.url)),
        "utf8"
      );
      const prFinishCall = plasterRenderSrc.indexOf("plasterFinish(");
      const prDiscard = plasterRenderSrc.indexOf("if(finish.x<.5)discard;");
      const prLightCall = plasterRenderSrc.indexOf("masonryResidentSceneLight(");
      expect(prDiscard).toBeGreaterThan(prFinishCall);
      expect(prDiscard).toBeLessThan(prLightCall);

      // Both non-SDF and SDF wall/roof joints clip after original_main() so derivative / implicit-LOD
      // texture lookups inside original_main() remain in uniform control flow.
      const dummyVert = "void original_main(){gl_Position = vec4(_1185, 1.0) * current_view.world_to_sample;}";
      const nonSdf = injectWallRoofJoint(dummyVert, "void original_main(){}void main(){original_main();}", true);
      expect(nonSdf.fragment).toContain("void main(){original_main();vec3 wallJointPoint=masonryWallJointRest;");
      const sdf = injectWallRoofJoint(
        dummyVert,
        "vec3 masonrySdfHitLocal;void original_main(){}void main(){original_main();}",
        true
      );
      expect(sdf.fragment).toContain(
        "void main(){original_main();vec3 wallJointPoint=masonryWallJointRest+masonrySdfHitLocal"
      );
    });

    it("initializes ProbeVolume SurfaceData and Varyings fields and matches PBR direct diffuse in masonryFarProxyLight", () => {
      installCompiler();
      const engine = createMockEngine();
      const farShader = Shader.find("Masonry/FarProxy") ?? Shader.create(farProxyShader);
      const pass = farShader.subShaders[0]!.passes.find((p) => p.name === "Forward")!;
      const mc = new ShaderMacroCollection();
      mc.enable(ShaderMacro.getByName("RENDERER_HAS_NORMAL"));
      mc.enable(ShaderMacro.getByName("SCENE_DIRECT_LIGHT_COUNT", "1"));
      mc.enable(ShaderMacro.getByName("SCENE_USE_PROBE_VOLUME"));
      mc.enable(ShaderMacro.getByName("SCENE_PROBE_VOLUME_PER_VERTEX"));
      const { fragmentSource } = (
        pass as unknown as {
          _compileShaderSource(e: Engine, macros: ShaderMacroCollection): { fragmentSource: string };
        }
      )._compileShaderSource(engine, mc);
      const fnMatch = /masonryFarProxyLight\s*\(/.exec(fragmentSource);
      expect(fnMatch).not.toBeNull();
      const start = fragmentSource.lastIndexOf("\n", fnMatch!.index) + 1;
      let depth = 0;
      let end = start;
      for (let i = fragmentSource.indexOf("{", fnMatch!.index); i < fragmentSource.length; i++) {
        if (fragmentSource[i] === "{") depth++;
        else if (fragmentSource[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      const fnBody = fragmentSource.slice(start, end);
      expect(fnBody).toContain("initMasonryLightingVaryings");
      expect(fnBody).toContain("s.position = positionWS");
      expect(fnBody).toContain("s.viewDir = normalize");
      expect(fragmentSource).toContain("lightingVaryings.probeIrradiance = vec3");
      expect(fragmentSource).toContain("lightingVaryings.probeWeight = 0.0");
      expect(fnBody).toContain("vec3 diffuseAlbedo = albedo * 0.96");
      expect(fnBody).toContain("bsdf.diffuseColor = diffuseAlbedo");
      expect(fnBody).not.toContain("0.318309886");
    });
  });

  describe("Lifecycle, entrance, and resource cleanup regression contracts", () => {
    it("refuses to strip LOD1 during unsettled entrance and never falls into an invisible dead zone", async () => {
      installCompiler();
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const parent = scene.createRootEntity("EntranceBuilding");
      const assets = constructionAssets();
      const preview: ConstructionPreview = {
        bounds: { min: [0, 0, 0], max: [1, 2, 1] },
        parts: [makeUnitBoxPart("houseA")],
        stones: [],
        decorationParts: [],
        frames: [],
        woodArchFrames: [],
        woodArchPillars: [],
        archGroups: [],
        retainedWallUnits: []
      };
      const view = await createBuildingDistanceView(
        engine,
        parent,
        {
          colorOwners: [{ id: "houseA", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }],
          paletteSlots: [{ seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }]
        },
        preview,
        assets,
        undefined,
        undefined,
        { unifiedGlobalProxy: true }
      );
      await view.warmupDetailedVisual();
      view.setVisualVisible(true);
      view.setFarProxyActive(false);
      view.setEntrance(new Map([["houseA", { progress: 0, minimumY: 0, height: 2 }]]));
      // Calling releaseDetailedVisual while entrance is unsettled must be ignored.
      view.releaseDetailedVisual();
      const visualRoot = view.root.findByName("Visual surfaces")!;
      expect(visualRoot.getComponentsIncludeChildren(MeshRenderer, []).length).toBeGreaterThan(0);
      expect(visualRoot.isActive).toBe(true);
      view.destroy();
    });

    it("detaches meshes and materials before destroying in BuildingGlobalProxy across devicerestored, empty-box rebuild, and destroy", () => {
      installCompiler();
      const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
      const engine = Object.assign(createMockEngine(), {
        on: (ev: string, fn: (...a: unknown[]) => void) => {
          if (!listeners.has(ev)) listeners.set(ev, new Set());
          listeners.get(ev)!.add(fn);
        },
        off: (ev: string, fn: (...a: unknown[]) => void) => {
          listeners.get(ev)?.delete(fn);
        }
      });
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const frame = scene.createRootEntity("GlobalProxyFrame");
      const root = frame.createChild("GlobalProxyRoot");
      const appearance = masonryAppearance(engine);
      const hiddenOwners = new Set<string>();
      const proxy = BuildingGlobalProxy.forScene(scene);

      const nonBoxPart: ConstructionPreviewPart = {
        owner: "struct_owner",
        material: "roof_tile",
        placement: "unit",
        color: [0.5, 0.25, 0.15],
        positions: [0, 2, 0, 2, 2, 0, 1, 4, 1],
        normals: [0, 0.707, 0.707, 0, 0.707, 0.707, 0, 0.707, 0.707],
        uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]) as unknown as number[][],
        indices: [0, 1, 2]
      };
      const slot = proxy.register({
        root,
        frame,
        parts: [makeUnitBoxPart("box_owner"), nonBoxPart],
        decorationParts: [],
        colorOwners: [
          { id: "box_owner", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 },
          { id: "struct_owner", seed: 2, wallColor: 0, roofColor: 0, woodColor: 0 }
        ],
        appearance,
        hiddenOwners
      });
      proxy.flushIfDirty();

      const buckets = (
        proxy as unknown as {
          buckets: Array<{
            boxMesh?: { destroyed: boolean };
            boxInstanceBuf?: { destroyed: boolean };
            boxRenderer: MeshRenderer;
            boxMat: { destroyed: boolean };
            structMat: { destroyed: boolean };
            structChunks: Array<{ mesh: { destroyed: boolean } }>;
          }>;
        }
      ).buckets;
      const b = buckets[0]!;
      const boxMesh1 = b.boxMesh!;
      const structMesh1 = b.structChunks[0]!.mesh;
      const boxMat = b.boxMat;
      const structMat = b.structMat;

      // devicerestored must properly detach and destroy previous meshes before rebuilding.
      for (const fn of listeners.get("devicerestored") ?? []) fn();
      expect(boxMesh1.destroyed).toBe(true);
      expect(structMesh1.destroyed).toBe(true);

      // Hiding all box owners must clear boxRenderer.mesh (no dangling reference to destroyed buffer).
      const boxMesh2 = b.boxMesh!;
      hiddenOwners.add("box_owner");
      slot.markTopologyDirty();
      proxy.flushIfDirty();
      expect(boxMesh2.destroyed).toBe(true);
      expect(b.boxRenderer.mesh).toBeNull();

      // Destroying the last slot tears down the bucket and must release both materials cleanly.
      slot.destroy();
      expect(boxMat.destroyed).toBe(true);
      expect(structMat.destroyed).toBe(true);
    });

    it("releases ConstructionCameraSync BoolUpdateFlag and detects custom viewMatrix and oblique projection edits", () => {
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const camEntity = scene.createRootEntity("MainCamera");
      const viewElems = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const projElems = new Float32Array([1.34, 0, 0, 0, 0, 2.1445, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]);
      const fakeCamera = {
        entity: camEntity,
        _isCustomViewMatrix: false,
        viewMatrix: { elements: viewElems },
        projectionMatrix: { elements: projElems },
        pixelViewport: { x: 0, y: 0, width: 1280, height: 720 },
        isOrthographic: false
      } as unknown as Camera & { _isCustomViewMatrix: boolean };
      const parent = scene.createRootEntity("BuildingHost");

      const flagCount = () =>
        (camEntity as unknown as { _updateFlagManager: { _updateFlags: unknown[] } })._updateFlagManager._updateFlags
          .length;
      const baseline = flagCount();
      for (let i = 0; i < 4; i++) {
        const resident = new EngineResidentScene(engine, parent);
        expect(resident.root.layer).toBe(BUILDING_RENDER_LAYER);
        (resident as unknown as { bindCamera(c: Camera): void }).bindCamera(fakeCamera);
        resident.destroy();
      }
      expect(flagCount()).toBe(baseline);

      const resident = new EngineResidentScene(engine, parent);
      resident.bindCamera(fakeCamera);
      const scripts: Script[] = [];
      camEntity.getComponents(Script, scripts);
      const sync = scripts[scripts.length - 1] as unknown as { bumpIfCameraChanged(c: Camera): number };
      const v0 = sync.bumpIfCameraChanged(fakeCamera);
      expect(sync.bumpIfCameraChanged(fakeCamera)).toBe(v0);

      // Custom viewMatrix edits bypass entity transform flags and must still bump camVersion.
      fakeCamera._isCustomViewMatrix = true;
      viewElems[12] = 5;
      const v1 = sync.bumpIfCameraChanged(fakeCamera);
      expect(v1).toBe(v0 + 1);

      // Resetting custom viewMatrix back to entity transform must detect viewMatrix change even without transform flag.
      fakeCamera._isCustomViewMatrix = false;
      viewElems[12] = 0;
      const v1b = sync.bumpIfCameraChanged(fakeCamera);
      expect(v1b).toBe(v1 + 1);
      expect(sync.bumpIfCameraChanged(fakeCamera)).toBe(v1b);

      // Asymmetric/oblique projection off-diagonal terms (pe[8], pe[12]) must bump camVersion.
      projElems[8] = 0.25;
      const v2 = sync.bumpIfCameraChanged(fakeCamera);
      expect(v2).toBe(v1b + 1);
      projElems[12] = 0.1;
      expect(sync.bumpIfCameraChanged(fakeCamera)).toBe(v2 + 1);
      resident.destroy();
    });

    it("uses exact pool keys for globals/frame and avoids double-counting shared pooled storage bytes", async () => {
      const engine = createMockEngine();
      const scene = createMockScene(engine);
      activeScenes.push(scene);
      const parent = scene.createRootEntity("StoragePoolHost");

      const frameBytesA = new Uint8Array(352);
      const frameBytesB = new Uint8Array(352);
      frameBytesB[351] = 1;
      const zeroDormers = new Uint8Array(64);

      const makeLoader = (frameBytes: Uint8Array) => async (name: string) =>
        (name === "globals/frame" ? frameBytes : zeroDormers).buffer.slice(0);

      const s1 = new EngineResidentScene(engine, parent, makeLoader(frameBytesA));
      const s2 = new EngineResidentScene(engine, parent, makeLoader(frameBytesB));

      type StorageAccess = { createStorage(name: string): Promise<unknown> };
      const tf1 = await (s1 as unknown as StorageAccess).createStorage("globals/frame");
      const tf2 = await (s2 as unknown as StorageAccess).createStorage("globals/frame");
      expect(tf1).not.toBe(tf2);
      expect(s1.metrics.residentBytes).toBe(352);
      expect(s2.metrics.residentBytes).toBe(352);

      const tz1 = await (s1 as unknown as StorageAccess).createStorage("globals/dormerCounts");
      const tz2 = await (s2 as unknown as StorageAccess).createStorage("globals/dormerCounts");
      expect(tz1).toBe(tz2);
      // Only the allocating scene records the shared pooled texture in residentBytes.
      expect(s1.metrics.residentBytes).toBe(352 + 64);
      expect(s2.metrics.residentBytes).toBe(352);

      // When s1 evicts/destroys while s2 remains alive, s1 releases its unique 352B frame and
      // transfers ownership of the shared 64B zero-dormer texture to s2.
      s1.destroy();
      expect(s1.metrics.residentBytes).toBe(0);
      expect(s2.metrics.residentBytes).toBe(352 + 64);

      s2.destroy();
      expect(s2.metrics.residentBytes).toBe(0);
    });

    it("re-anchors ConstructionDecorationLights emitters when parent hierarchy moves", () => {
      const engine = createMockEngine();
      const scene = Object.assign(createMockScene(engine), {
        _lightManager: { _attachPointLight() {}, _detachPointLight() {} },
        _shaderData: { setFloatArray() {}, setInt() {}, getMacros() {} }
      }) as unknown as Scene;
      activeScenes.push(scene);
      const camEntity = scene.createRootEntity("Cam");
      const fakeCamera = { entity: camEntity } as unknown as Camera;
      const host = scene.createRootEntity("Host");
      const pool = new ConstructionDecorationLights(host, 2);
      const lights = [
        {
          id: "lantern-1",
          ownerId: "houseA",
          position: [2, 3, 4] as [number, number, number],
          color: [1, 0.8, 0.5] as [number, number, number],
          intensity: 1,
          range: 5,
          height: 2,
          kind: "lantern" as const
        }
      ];

      pool.update(lights, fakeCamera, 1);
      const slot0 = pool.root.findByName("slot-0")!;
      expect(slot0.transform.worldPosition.x).toBeCloseTo(2);
      expect(slot0.transform.worldPosition.y).toBeCloseTo(3);
      expect(slot0.transform.worldPosition.z).toBeCloseTo(4);

      // Move parent without moving camera or changing light descriptors.
      host.transform.setPosition(10, 0, -5);
      pool.update(lights, fakeCamera, 1);
      expect(slot0.transform.worldPosition.x).toBeCloseTo(2);
      expect(slot0.transform.worldPosition.y).toBeCloseTo(3);
      expect(slot0.transform.worldPosition.z).toBeCloseTo(4);

      pool.dispose();
    });

    it("registers only emitting slots and publishes their packed scene indices", () => {
      const manager = new LightManager();
      const data = new ShaderData(ShaderDataGroup.Scene);
      const scene = Object.assign(createMockScene(createMockEngine()), {
        _lightManager: manager,
        _shaderData: data
      }) as unknown as Scene;
      activeScenes.push(scene);
      const camera = { entity: scene.createRootEntity("Cam") } as Camera;
      const pool = new ConstructionDecorationLights(scene.createRootEntity("Host"));
      const lights = Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        ownerId: "house-" + i,
        position: [i, 0, 0] as [number, number, number],
        color: [1, 0.8, 0.5] as [number, number, number],
        intensity: 1,
        range: 3.5
      }));
      const slots = pool.root.getComponentsIncludeChildren(PointLight, []);
      expect(slots).toHaveLength(4);
      expect(slots.every((slot) => slot.cullingMask === BUILDING_RENDER_LAYER && !slot.enabled)).toBe(true);

      const render = (count: number, ownedMask: number, legacyMask = ownedMask) => {
        manager._updateShaderData(data);
        camera.entity.getComponent(Script)!.onBeginRender(camera);
        const macros: ShaderMacro[] = [];
        data.getMacros(macros);
        const packedCount = macros.find((macro) => macro.name === "SCENE_POINT_LIGHT_COUNT");
        expect(packedCount?.value).toBe(count ? String(count) : undefined);
        expect(data.getInt("scene_MasonryPointMask")).toBe(ownedMask);
        expect(data.getInt("scene_MasonryLegacyMask")).toBe(legacyMask);
        expect(data.getInt("scene_MasonryFallbackMask")).toBe(0);
      };

      pool.update([], camera, 1, true);
      render(0, 0);
      pool.update(lights.slice(0, 1), camera, 0);
      render(0, 0);
      pool.update(lights.slice(0, 1), camera, 1);
      render(1, 1);
      slots[0].cullingMask = Layer.Layer0;
      render(1, 1, 0);
      slots[0].cullingMask = BUILDING_RENDER_LAYER;
      const external = scene.createRootEntity("External").addComponent(PointLight);
      for (const count of [2, 3, 4, 6]) {
        pool.update(lights.slice(0, count), camera, 1);
        const active = Math.min(count, 4);
        expect(pool.metrics.active).toBe(active);
        render(active + 1, ((1 << (active + 1)) - 1) & ~2);
      }
      // Removing slot zero moves the last registered emitter into its old scene index.
      pool.update(lights.slice(1, 4), camera, 1);
      render(4, 0b1101);
      external.enabled = false;
      render(3, 0b111);

      lights[1].color = [0, 0, 0];
      lights[2].intensity = 0;
      pool.update(lights.slice(1, 4), camera, 1);
      render(1, 1);
      camera.entity.transform.setPosition(100, 0, 0);
      pool.update(lights, camera, 0.1);
      render(1, 1); // Still visibly fading.
      pool.update(lights, camera, 1);
      render(0, 0);
      pool.dispose();
    });

    it("terminates cleanly on closedU EffectiveSurface with zero period", () => {
      const degenerateKind = {
        domain: () => ({ u: [0, 0] as [number, number], v: [0, 0.5] as [number, number], closedU: true }),
        frame: () => ({
          origin: [0, 0, 0] as [number, number, number],
          uAxis: [1, 0, 0] as [number, number, number],
          vAxis: [0, 1, 0] as [number, number, number],
          normal: [0, 0, 1] as [number, number, number]
        })
      } as unknown as ConstructorParameters<typeof EffectiveSurface>[0];
      const surface = new EffectiveSurface(degenerateKind, {}, [[0, 0.5, 0, 1.0]], [[0, 0.6, 0.2, 0.8]]);
      expect(surface.contains(0, 0.75)).toBe(true);
      expect(surface.contains(0.1, 0.75)).toBe(false);
      expect(surface.contains(0, Number.NaN)).toBe(false);
      expect(surface.contains(Number.NaN, 0.75)).toBe(false);
      expect(surface.covers([0, 0.55, 0.1, 0.9])).toBe(false);
      expect(surface.removedOver(0, 1)).toHaveLength(1);
    });

    it("quantizes float-noise scale keys in scaledNativeAttribute and catches f32 overflow in WoodUnitLod", () => {
      const rawPos = new Float32Array([1, 2, 3, 4, 5, 6]);
      const fakeMesh = {
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 5, z: 6 } },
        vertexElements: [{ attribute: "POSITION", format: VertexElementFormat.Vector3, bindingIndex: 0, offset: 0 }],
        vertexBufferBindings: [{ stride: 12, buffer: { data: new Uint8Array(rawPos.buffer) } }],
        indexBufferBinding: null,
        subMeshes: []
      } as unknown as Parameters<typeof scaledNativeAttribute>[0];
      const a = scaledNativeAttribute(fakeMesh, "POSITION", [1.0000000000000002, 2, 3], false);
      const b = scaledNativeAttribute(fakeMesh, "POSITION", [0.9999999999999999, 2, 3], false);
      expect(a).toBe(b);

      // Finite f32 columns whose derived cullRadius (0.5*(x+y+z)+0.35) overflows float32 must throw.
      const woodBytes = new Uint8Array(80);
      const f32 = new Float32Array(woodBytes.buffer);
      f32[0] = 3e38;
      f32[4] = 3e38;
      f32[8] = 3e38;
      expect(() => new WoodUnitLod(woodBytes)).toThrow("Wood LOD bounds exceed finite f32 range");

      // Single-source-of-truth ViewConstants_natural camera patch layout parity.
      expect(VIEW_CONSTANTS_CAMERA_PATCH.texelX * 4).toBe(VIEW_CONSTANTS_CAMERA_PATCH.wordOffset);
      expect(VIEW_CONSTANTS_CAMERA_PATCH.texelWidth * 4).toBe(VIEW_CONSTANTS_CAMERA_PATCH.wordCount);
      expect(VIEW_CONSTANTS_CAMERA_PATCH.minTextureWidth).toBe(
        VIEW_CONSTANTS_CAMERA_PATCH.texelX + VIEW_CONSTANTS_CAMERA_PATCH.texelWidth
      );
      const words = new Uint32Array(256);
      const patch = words.subarray(
        VIEW_CONSTANTS_CAMERA_PATCH.wordOffset,
        VIEW_CONSTANTS_CAMERA_PATCH.wordOffset + VIEW_CONSTANTS_CAMERA_PATCH.wordCount
      );
      for (let i = 0; i < VIEW_CONSTANTS_CAMERA_PATCH.wordCount; i++) {
        words[VIEW_CONSTANTS_CAMERA_PATCH.wordOffset + i] = 1000 + i;
      }
      expect(Array.from(patch)).toEqual(Array.from({ length: 16 }, (_, i) => 1000 + i));
    });
  });
});
