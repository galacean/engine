import { afterEach, describe, expect, it } from "vitest";
import { Entity, MeshRenderer, Scene, Shader, ShaderFactory, ShaderLanguage, type Engine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import { registerConstructionSceneLighting } from "../src/building/runtime/ConstructionSceneLighting";
import { constructionPlasterGLSL } from "../src/building/runtime/ConstructionPlasterShader";
import { masonryAppearance } from "../src/building/runtime/MasonryAppearance";
import { BuildingGlobalProxy } from "../src/building/runtime/BuildingGlobalProxy";
import globalProxyShaderSource from "../src/building/runtime/MasonryGlobalProxy.shader?raw";
import globalProxyShadowOnlyShaderSource from "../src/building/runtime/MasonryGlobalProxyShadowOnly.shader?raw";
import globalProxyShadowCasterGlsl from "../src/building/runtime/MasonryGlobalProxyShadowCaster.glsl?raw";
import lodDither from "../src/building/runtime/MasonryLodDither.glsl?raw";
import type { ConstructionPreviewPart } from "../src/building/runtime/ConstructionPreview";

function createMockEngine(): Engine {
  const noop = () => {};
  const mockRhi = {
    isWebGL2: true,
    canIUse: () => true,
    createPlatformBuffer: () => ({
      bind: noop,
      setData: noop,
      getData: noop,
      destroy: noop
    }),
    createPlatformPrimitive: () => ({
      draw: noop,
      destroy: noop
    })
  };
  return {
    _hardwareRenderer: mockRhi,
    _isDeviceLost: false,
    _renderingStatistics: { _bufferMemory: 0 },
    canvas: { width: 800, height: 600 },
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

function makeNonBoxWallPart(owner: string, xOffset = 0): ConstructionPreviewPart {
  return {
    owner,
    role: "brick",
    placement: "surface",
    color: [0.6, 0.5, 0.4],
    positions: [xOffset, 0, 0, xOffset + 4, 0, 0, xOffset + 4, 3, 0, xOffset, 3, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1]
  };
}

function makePlasterPart(owner: string): ConstructionPreviewPart {
  return {
    owner,
    role: "brick",
    placement: "surface",
    color: [0.8, 0.75, 0.7],
    positions: [0, 0, 0.1, 4, 0, 0.1, 4, 3, 0.1, 0, 3, 0.1],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    plaster: { wear: 0.3, wallLength: 4, edgeDistances: [1, 1, 1, 1] }
  };
}

function makeUnitBoxPart(owner: string): ConstructionPreviewPart {
  const faces: readonly { n: [number, number, number]; corners: [number, number, number][] }[] = [
    { n: [1, 0, 0], corners: [[1, 0, 0], [1, 2, 0], [1, 2, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 2, 1], [0, 2, 0], [0, 0, 0]] },
    { n: [0, 1, 0], corners: [[0, 2, 1], [1, 2, 1], [1, 2, 0], [0, 2, 0]] },
    { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 2, 1], [0, 2, 1]] },
    { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 2, 0], [1, 2, 0]] }
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    for (const c of f.corners) {
      positions.push(c[0], c[1], c[2]);
      normals.push(f.n[0], f.n[1], f.n[2]);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    owner,
    role: "brick",
    placement: "unit",
    color: [0.5, 0.5, 0.5],
    positions,
    normals,
    indices,
    uvs
  };
}

function registerIncludes(): ShaderCompiler {
  registerConstructionSceneLighting();
  if (!ShaderFactory.includeMap["Masonry/GlobalProxyShadowCaster.glsl"]) {
    ShaderFactory.registerInclude("Masonry/GlobalProxyShadowCaster.glsl", globalProxyShadowCasterGlsl);
  }
  if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"]) {
    ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
  }
  if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"]) {
    ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
  }
  const compiler = new ShaderCompiler();
  compiler._setIncludeMap(ShaderFactory.includeMap);
  return compiler;
}

describe("BuildingGlobalProxy shader & spatial bucketing contract", () => {
  const activeScenes: Scene[] = [];
  let previousCompiler: ShaderCompiler | undefined;
  let compilerOverridden = false;

  afterEach(() => {
    for (const s of activeScenes.splice(0)) {
      BuildingGlobalProxy.existing(s)?.destroy();
      for (const root of [...s.rootEntities]) root.destroy();
    }
    if (compilerOverridden) {
      (Shader as unknown as { _shaderCompiler: ShaderCompiler | undefined })._shaderCompiler = previousCompiler;
      compilerOverridden = false;
    }
  });

  function installShaderCompiler(): void {
    const compiler = registerIncludes();
    const shaderCtor = Shader as unknown as { _shaderCompiler: ShaderCompiler | undefined };
    if (!compilerOverridden) {
      previousCompiler = shaderCtor._shaderCompiler;
      compilerOverridden = true;
    }
    shaderCtor._shaderCompiler = compiler;
  }

  it("compiles Masonry/GlobalProxy (3 passes) and explicit Masonry/GlobalProxyShadowOnly (1 ShadowCaster pass only)", () => {
    const compiler = registerIncludes();

    const fullParsed = compiler._parseShaderSource(globalProxyShaderSource);
    expect(fullParsed.subShaders[0].passes).toHaveLength(3);

    const shadowOnlyParsed = compiler._parseShaderSource(globalProxyShadowOnlyShaderSource);
    expect(shadowOnlyParsed.subShaders[0].passes).toHaveLength(1);
    expect(shadowOnlyParsed.subShaders[0].passes[0].name).toBe("ShadowCaster");

    for (const parsed of [fullParsed, shadowOnlyParsed]) {
      const pass = parsed.subShaders[0].passes[0];
      for (const instanced of [false, true]) {
        const macros = new Map<string, string>([
          ["GRAPHICS_API_WEBGL2", ""],
          ["RENDERER_HAS_NORMAL", ""]
        ]);
        if (instanced) macros.set("GLOBAL_PROXY_INSTANCED", "");
        const compiled = compiler._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          ShaderLanguage.GLSLES300,
          undefined,
          pass.contentScopeStarts
        );
        expect(compiled).toBeDefined();
        const vs = ShaderMacroProcessor.evaluate([...compiled!.vertexShaderInstructions!], macros);
        const fs = ShaderMacroProcessor.evaluate([...compiled!.fragmentShaderInstructions!], macros);
        expect(vs).toContain("material_ProxyState");
        expect(fs.length).toBeGreaterThan(0);
      }
    }
  });

  it("buckets by 64m spatial cells, splits shadow/non-shadow chunks, toggles ShadowOnly material, preserves LOD2 picking, and prunes empty buckets", () => {
    installShaderCompiler();

    const engine = createMockEngine();
    const s = createMockScene(engine);
    activeScenes.push(s);

    const proxy = BuildingGlobalProxy.forScene(s);
    const appearance = masonryAppearance({});

    const frameNearA = s.createRootEntity("bldg-near-a");
    frameNearA.transform.setPosition(10, 0, 10);
    const rootNearA = frameNearA.createChild("view");

    const frameNearB = s.createRootEntity("bldg-near-b");
    frameNearB.transform.setPosition(30, 0, 20);
    const rootNearB = frameNearB.createChild("view");

    const frameFar = s.createRootEntity("bldg-far");
    frameFar.transform.setPosition(220, 0, 220);
    const rootFar = frameFar.createChild("view");

    const ownerPalette = [{ id: "wall", seed: 1, wallColor: 0, roofColor: 0, woodColor: 0 }];
    const slotNearA = proxy.register({
      root: rootNearA,
      frame: frameNearA,
      parts: [makeNonBoxWallPart("wall", 10), makePlasterPart("wall"), makeUnitBoxPart("wall")],
      colorOwners: ownerPalette,
      appearance,
      hiddenOwners: new Set()
    });
    const slotNearB = proxy.register({
      root: rootNearB,
      frame: frameNearB,
      parts: [makeNonBoxWallPart("wall")],
      colorOwners: ownerPalette,
      appearance,
      hiddenOwners: new Set()
    });
    const slotFar = proxy.register({
      root: rootFar,
      frame: frameFar,
      parts: [makeNonBoxWallPart("wall"), makePlasterPart("wall")],
      colorOwners: ownerPalette,
      appearance,
      hiddenOwners: new Set()
    });

    slotNearA.updateState(true, true, 1, false);
    slotNearB.updateState(true, true, 1, false);
    slotFar.updateState(true, true, 1, false);
    proxy.flushIfDirty();

    // 1. Spatial bucketing: NearA + NearB share cell 0:0, Far is in cell 3:3
    const structRenderers = proxy.root.children
      .filter((c) => c.name.startsWith("GlobalProxyStruct_"))
      .map((c) => c.getComponent(MeshRenderer)!);
    const boxRenderers = proxy.root.children
      .filter((c) => c.name.startsWith("GlobalProxyBoxes_") && c.isActive)
      .map((c) => c.getComponent(MeshRenderer)!);

    expect(structRenderers).toHaveLength(4);
    expect(structRenderers.filter((r) => r.castShadows)).toHaveLength(2);
    expect(structRenderers.filter((r) => !r.castShadows)).toHaveLength(2);
    expect(boxRenderers).toHaveLength(1);

    // 2. Tight local AABBs
    const nearShadowRenderer = structRenderers.find((r) => r.castShadows && r.mesh!.bounds.max.x < 100)!;
    const farShadowRenderer = structRenderers.find((r) => r.castShadows && r.mesh!.bounds.min.x > 200)!;
    expect(nearShadowRenderer).toBeDefined();
    expect(farShadowRenderer).toBeDefined();
    expect(boxRenderers[0]!.mesh!.bounds.max.x).toBeLessThan(12);

    // 3. LOD2 picking returns batches for both visible cells
    const pickedAll: string[] = [];
    proxy.visitPickBatches((batch) => {
      for (let i = 0; i < batch.count; i++) {
        const id = batch.resolve(i);
        if (id) pickedAll.push(id);
      }
    });
    expect(pickedAll.length).toBeGreaterThanOrEqual(3);

    // 4. Switch Far cell to LOD1 -> ShadowOnly material, non-shadow chunk disabled, omitted from LOD2 picking
    slotFar.updateState(false, true, 1, false);
    const farNoShadowRenderer = structRenderers.find((r) => !r.castShadows && r.mesh!.bounds.min.x > 200)!;
    expect(farNoShadowRenderer.enabled).toBe(false);
    expect(farShadowRenderer.enabled).toBe(true);
    expect(farShadowRenderer.castShadows).toBe(true);
    expect(farShadowRenderer.getMaterial()!.shader.name).toBe("Masonry/GlobalProxyShadowOnly");

    const pickedFarScoped: string[] = [];
    proxy.visitPickBatches((batch) => {
      for (let i = 0; i < batch.count; i++) {
        const id = batch.resolve(i);
        if (id) pickedFarScoped.push(id);
      }
    }, frameFar);
    expect(pickedFarScoped).toEqual([]);

    // Restore Far cell back to LOD2
    slotFar.updateState(true, true, 1, false);
    expect(farNoShadowRenderer.enabled).toBe(true);
    expect(farShadowRenderer.getMaterial()!.shader.name).toBe("Masonry/GlobalProxy");
    proxy.visitPickBatches((batch) => {
      for (let i = 0; i < batch.count; i++) {
        const id = batch.resolve(i);
        if (id) pickedFarScoped.push(id);
      }
    }, frameFar);
    expect(pickedFarScoped.length).toBeGreaterThan(0);

    // 5. Cross-cell migration via updateState prunes vacated empty bucket
    frameFar.transform.setPosition(400, 0, 400);
    slotFar.updateState(true, true, 1, false);
    proxy.flushIfDirty();
    const afterMoveStruct = proxy.root.children
      .filter((c) => c.name.startsWith("GlobalProxyStruct_"))
      .map((c) => c.getComponent(MeshRenderer)!);
    expect(afterMoveStruct).toHaveLength(4);
    expect(afterMoveStruct.some((r) => r.mesh!.bounds.min.x >= 400)).toBe(true);
    expect(afterMoveStruct.some((r) => r.mesh!.bounds.min.x >= 200 && r.mesh!.bounds.max.x < 300)).toBe(false);

    // 6. Cross-cell move followed by refreshColors() + flushIfDirty() WITHOUT calling updateState()
    // must still migrate NearB out of cell 0:0 instead of stretching cell 0:0's AABB.
    frameNearB.transform.setPosition(600, 0, 600);
    slotNearB.refreshColors();
    proxy.flushIfDirty();
    const afterRefreshMoveStruct = proxy.root.children
      .filter((c) => c.name.startsWith("GlobalProxyStruct_"))
      .map((c) => c.getComponent(MeshRenderer)!);
    const cell0Shadow = afterRefreshMoveStruct.find((r) => r.castShadows && r.mesh!.bounds.min.x < 64)!;
    const cell600Shadow = afterRefreshMoveStruct.find((r) => r.castShadows && r.mesh!.bounds.min.x >= 600)!;
    expect(cell0Shadow).toBeDefined();
    expect(cell0Shadow.mesh!.bounds.max.x).toBeLessThan(64);
    expect(cell600Shadow).toBeDefined();

    // 7. Unregistering all slots cleanly destroys proxy
    slotNearA.destroy();
    slotNearB.destroy();
    slotFar.destroy();
    expect(BuildingGlobalProxy.existing(s)).toBeUndefined();
  });
});
