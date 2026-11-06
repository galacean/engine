import { seedWorldRenderWeights } from "@galacean/engine-world-planning/world/SeedWorldRenderWeights";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSeedWorldTerrainGenerationSettings } from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";

const runtimeState = vi.hoisted(() => ({
  clipmapCreates: [] as unknown[][],
  clipmapFarMaterials: [] as Array<{ readonly shaderData: Record<string, ReturnType<typeof vi.fn>> }>,
  clipmapDestroyCount: 0,
  layerDiffuseColors: [] as unknown[],
  macroVariationStates: [] as boolean[],
  rockCreates: [] as unknown[][],
  rockUpdateCount: 0,
  rockDestroyCount: 0,
  smallRockCreates: [] as unknown[][],
  smallRockUpdateCount: 0,
  smallRockDestroyCount: 0,
  mushroomCreates: [] as unknown[][],
  mushroomUpdateCount: 0,
  mushroomDestroyCount: 0,
  exactCellCreates: [] as unknown[][],
  exactCellUpdateCount: 0,
  populationCreates: [] as unknown[][],
  populationUpdates: [] as number[],
  populationGrassColorTunings: [] as unknown[],
  populationGrassRoadColors: [] as unknown[],
  populationCoverageSamplers: [] as Array<(x: number, z: number) => number>,
  reliefBindCalls: [] as unknown[],
  reliefDisposeCount: 0,
  populationVisibleWarmupCount: 0,
  populationDestroyCount: 0,
  textureCreates: [] as unknown[][],
  textureDestroyCount: 0,
  bufferDestroyCount: 0
}));

vi.mock("@galacean/engine", () => ({
  AssetType: { Buffer: "buffer", Material: "material", Texture: "texture" },
  Camera: class Camera {},
  Color: class Color {
    constructor(
      readonly r: number,
      readonly g: number,
      readonly b: number,
      readonly a: number
    ) {}
  },
  Entity: class Entity {},
  KTX2TargetFormat: { R8G8B8A8: "rgba8" },
  MeshRenderer: class MeshRenderer {},
  Script: class Script {
    destroy(): void {}
  },
  ShaderMacro: { getByName: (name: string) => name },
  ShaderProperty: { getByName: (name: string) => name },
  Texture2D: class Texture2D {
    name = "";
    filterMode: unknown;
    wrapModeU: unknown;
    wrapModeV: unknown;
    readonly setPixelBuffer = vi.fn();
    readonly generateMipmaps = vi.fn();

    constructor(...args: unknown[]) {
      runtimeState.textureCreates.push(args);
    }

    destroy(): void {
      runtimeState.textureDestroyCount++;
    }
  },
  TextureFilterMode: { Bilinear: "bilinear", Trilinear: "trilinear" },
  TextureFormat: { R8: "r8", R8G8: "rg8", R8G8B8A8: "rgba8" },
  TextureWrapMode: { Clamp: "clamp", Mirror: "mirror", Repeat: "repeat" },
  Vector2: class Vector2 {
    constructor(
      readonly x: number,
      readonly y: number
    ) {}
  },
  Vector4: class Vector4 {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly z: number,
      readonly w: number
    ) {}
  }
}));

vi.mock("@galacean/engine-terrain/terrain/clipmap/TerrainClipmap", () => ({
  TerrainClipmap: class TerrainClipmap {
    macroVariationEnabled = true;
    readonly material: unknown;
    readonly renderMaterials: readonly unknown[];

    constructor(...args: unknown[]) {
      runtimeState.clipmapCreates.push(args);
      this.material = args[4];
      const farMaterial = {
        shaderData: {
          enableMacro: vi.fn(),
          disableMacro: vi.fn(),
          setInt: vi.fn(),
          setColor: vi.fn(),
          setTexture: vi.fn(),
          setVector4: vi.fn(),
          setFloat: vi.fn(),
          setVector2: vi.fn()
        }
      };
      const farMaterialOptions = args[10] as { readonly configureMaterial?: (material: unknown) => void } | undefined;
      farMaterialOptions?.configureMaterial?.(this.material);
      farMaterialOptions?.configureMaterial?.(farMaterial);
      runtimeState.clipmapFarMaterials.push(farMaterial);
      this.renderMaterials = [this.material, farMaterial];
    }

    destroy(): void {
      runtimeState.clipmapDestroyCount++;
    }

    setMacroVariationEnabled(enabled: boolean): void {
      this.macroVariationEnabled = enabled;
      runtimeState.macroVariationStates.push(enabled);
    }
    setLayerDiffuseColors(patches: unknown): void {
      runtimeState.layerDiffuseColors.push(patches);
    }
  }
}));

vi.mock("@galacean/engine-world-planning/runtime/SeedWorldRockRuntime", () => ({
  SeedWorldRockRuntime: class SeedWorldRockRuntime {
    readonly placementCount: number;
    readonly exactInstances: readonly { readonly id: string; readonly category: string }[];

    constructor(...args: unknown[]) {
      runtimeState.rockCreates.push(args);
      const decorations = args[5] as readonly { readonly id: string; readonly category: string }[];
      this.placementCount = decorations.length;
      this.exactInstances = decorations.map(({ id, category }) => ({ id, category, controller: { update: vi.fn() } }));
    }

    update(): void {
      runtimeState.rockUpdateCount++;
    }

    destroy(): void {
      runtimeState.rockDestroyCount++;
    }
  }
}));

vi.mock("@galacean/engine-world-planning/runtime/SeedWorldSmallRockRuntime", () => ({
  SeedWorldSmallRockRuntime: class SeedWorldSmallRockRuntime {
    readonly placementCount = 1;
    readonly exactInstances = [{ id: "small-rock", category: "small-rock", controller: { update: vi.fn() } }];

    constructor(...args: unknown[]) {
      runtimeState.smallRockCreates.push(args);
    }

    update(): void {
      runtimeState.smallRockUpdateCount++;
    }

    destroy(): void {
      runtimeState.smallRockDestroyCount++;
    }
  }
}));

vi.mock("@galacean/engine-world-planning/world/SeedWorldMushroomRuntime", () => ({
  SeedWorldMushroomRuntime: class SeedWorldMushroomRuntime {
    readonly placementCount = 1;
    readonly exactInstances = [{ id: "mushroom", category: "mushroom", controller: { update: vi.fn() } }];

    constructor(...args: unknown[]) {
      runtimeState.mushroomCreates.push(args);
    }

    update(): void {
      runtimeState.mushroomUpdateCount++;
    }

    destroy(): void {
      runtimeState.mushroomDestroyCount++;
    }
  }
}));

vi.mock("@galacean/engine-world-planning/world/SeedWorldLotusRuntime", () => ({
  SeedWorldLotusRuntime: class SeedWorldLotusRuntime {
    readonly placementCount = 0;
    readonly exactInstances = [];

    destroy(): void {}
  }
}));

vi.mock("@galacean/engine-world-planning/world/SeedWorldExactInstanceCellRuntime", () => ({
  SeedWorldExactInstanceCellRuntime: class SeedWorldExactInstanceCellRuntime {
    constructor(...args: unknown[]) {
      runtimeState.exactCellCreates.push(args);
    }

    invalidate(): void {}

    update(): void {
      runtimeState.exactCellUpdateCount++;
    }
  }
}));

vi.mock("@galacean/engine-world-planning/runtime/SeedWorldSurfaceReliefRuntime", () => ({
  SeedWorldSurfaceReliefRuntime: {
    create: async () => ({
      gpuTextureBytes: 2 * 1024 * 1024,
      bind: (data: unknown) => runtimeState.reliefBindCalls.push(data),
      dispose: () => {
        runtimeState.reliefDisposeCount++;
      }
    })
  }
}));

vi.mock("@galacean/engine-world-planning/runtime/SeedWorldPopulationRuntime", () => ({
  SeedWorldPopulationRuntime: class SeedWorldPopulationRuntime {
    readonly observationAnchor = { x: 64, y: 12, z: -96 };

    constructor(...args: unknown[]) {
      runtimeState.populationCreates.push(args);
    }

    update(deltaTime: number): void {
      runtimeState.populationUpdates.push(deltaTime);
    }

    setGrassColorFieldTuning(tuning: unknown): void {
      runtimeState.populationGrassColorTunings.push(tuning);
    }

    setGrassTerrainSurface(): void {}

    setGrassSurfaceCoverageSampler(sampler: (x: number, z: number) => number): void {
      runtimeState.populationCoverageSamplers.push(sampler);
    }

    setGrassRoadColor(color: unknown): void {
      runtimeState.populationGrassRoadColors.push(color);
    }

    warmupVisibleDetails(): void {
      runtimeState.populationVisibleWarmupCount++;
    }

    destroy(): void {
      runtimeState.populationDestroyCount++;
    }
  }
}));

interface FakeEntity {
  readonly name: string;
  readonly children: FakeEntity[];
  isActiveInHierarchy: boolean;
  readonly destroy: ReturnType<typeof vi.fn>;
  createChild(name: string): FakeEntity;
}

describe("SeedWorldTerrainRuntime production ownership integration", () => {
  beforeEach(() => {
    for (const value of Object.values(runtimeState)) {
      if (Array.isArray(value)) value.length = 0;
    }
    runtimeState.clipmapDestroyCount = 0;
    runtimeState.layerDiffuseColors.length = 0;
    runtimeState.macroVariationStates.length = 0;
    runtimeState.rockUpdateCount = 0;
    runtimeState.rockDestroyCount = 0;
    runtimeState.smallRockUpdateCount = 0;
    runtimeState.smallRockDestroyCount = 0;
    runtimeState.mushroomUpdateCount = 0;
    runtimeState.mushroomDestroyCount = 0;
    runtimeState.exactCellUpdateCount = 0;
    runtimeState.populationVisibleWarmupCount = 0;
    runtimeState.populationDestroyCount = 0;
    runtimeState.reliefDisposeCount = 0;
    runtimeState.textureDestroyCount = 0;
    runtimeState.bufferDestroyCount = 0;
  });

  it("keeps the far composite inside every supported Clipmap LOD range", async () => {
    const { resolveSeedWorldTerrainFarCompositeLod } = await import(
      "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime"
    );

    expect(resolveSeedWorldTerrainFarCompositeLod(2)).toBe(1);
    expect(resolveSeedWorldTerrainFarCompositeLod(3)).toBe(2);
    expect(resolveSeedWorldTerrainFarCompositeLod(4)).toBe(2);
    expect(() => resolveSeedWorldTerrainFarCompositeLod(1)).toThrow(/at least two Clipmap LODs/u);
  });

  it("publishes independent bare-ground colours to near/far Terrain and restores source layers on reset", async () => {
    const { SeedWorldTerrainRuntime, SEED_WORLD_ROAD_COLOR_DEFAULT } = await import(
      "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime"
    );
    const material = {
      shaderData: {
        enableMacro: vi.fn(),
        disableMacro: vi.fn(),
        setInt: vi.fn(),
        setColor: vi.fn(),
        setTexture: vi.fn(),
        setVector4: vi.fn(),
        setFloat: vi.fn(),
        setVector2: vi.fn()
      }
    };
    const engine = { time: { elapsedTime: 0 }, resourceManager: { load: vi.fn(async () => material) } };
    const camera = {
      shaderData: {},
      entity: {
        transform: {
          worldPosition: { x: 0, y: 10, z: 0 },
          worldForward: { x: 0, y: 0, z: -1 }
        }
      }
    };
    const settings = resolveSeedWorldTerrainGenerationSettings(),
      fields = createFields();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(256 * 256).buffer }))
    );
    const runtime = await SeedWorldTerrainRuntime.create(
      engine as never,
      createEntity("Palette") as never,
      camera as never,
      {} as never,
      [],
      { rootSeed: fields.rootSeed } as never,
      fields as never,
      [],
      {
        treeScatterOperations: [],
        detailBrushOperations: [],
        treeInstances: [],
        detailDensityFields: [],
        hash: 0
      } as never,
      { resolution: 384, materialWeights: new Uint8Array(384 * 384 * 4), hash: 0 },
      settings,
      new Uint8Array(settings.heightResolution ** 2 * 2),
      0.5
    );
    try {
      const initial = runtime.getSurfaceColorTuning();
      expect(initial.groundColor).toBeUndefined();
      runtime.setSurfaceColorTuning({ ...initial, groundColor: [0, 0.7, 0.9], roadColor: [0.6, 0.4, 0.2] });
      expect(runtime.getSurfaceColorTuning().groundColor).toEqual([0, 0.7, 0.9]);
      expect(runtimeState.layerDiffuseColors.at(-1)).toEqual([
        { regionId: "seed-world", layerId: "layer-04", color: [0, 0.7, 0.9, 1] },
        { regionId: "seed-world", layerId: "layer-02", color: [0, 0.7, 0.9, 1] }
      ]);
      for (const target of [material, runtimeState.clipmapFarMaterials[0]]) {
        for (const layer of [1, 2])
          expect(target.shaderData.setColor).toHaveBeenCalledWith(
            `material_TerrainSeedLayerColor${layer}`,
            expect.objectContaining({ r: 0, g: 0.7, b: 0.9, a: 1 })
          );
        expect(target.shaderData.setColor).toHaveBeenCalledWith(
          "material_TerrainRoadColor",
          expect.objectContaining({ r: 0.6, g: 0.4, b: 0.2, a: 1 })
        );
      }
      runtime.resetSurfaceColorTuning();
      expect(runtime.getSurfaceColorTuning()).toEqual(initial);
      for (const target of [material, runtimeState.clipmapFarMaterials[0]])
        for (const layer of [1, 2]) {
          const writes = target.shaderData.setColor.mock.calls.filter(
            ([name]) => name === `material_TerrainSeedLayerColor${layer}`
          );
          expect(writes.at(-1)![1]).toMatchObject({
            r: SEED_WORLD_ROAD_COLOR_DEFAULT[0],
            g: SEED_WORLD_ROAD_COLOR_DEFAULT[1],
            b: SEED_WORLD_ROAD_COLOR_DEFAULT[2],
            a: 1
          });
        }
    } finally {
      await runtime.destroy();
    }
  });

  it("creates, updates, and destroys the Population child through the production Terrain runtime", async () => {
    const { SeedWorldTerrainRuntime, SEED_WORLD_ROAD_COLOR_DEFAULT } = await import(
      "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime"
    );
    expect(SEED_WORLD_ROAD_COLOR_DEFAULT).toEqual([0.5520114015120001, 0.44520119451622786, 0.2831487404299921]);
    const parent = createEntity("World runtime root");
    const camera = {
      id: "camera",
      shaderData: { id: "camera-shader-data" },
      entity: {
        transform: {
          worldPosition: { x: 0, y: 10, z: 0 },
          worldForward: { x: 0, y: 0, z: -1 }
        }
      }
    };
    const plan = { rootSeed: 1_729 };
    const fields = createFields();
    const sourceLibrary = {
      debrisSource: { id: "stones" },
      mushroom: { id: "mushroom-1" },
      rock: { id: "rock-clif-1" }
    };
    const treeAuthoringProfiles = [{ recipe: { id: "cartoon/tree/dead-tree/v1" } }];
    const decorations = [
      { category: "rock", id: "large-rock" },
      { category: "small-rock", id: "small-rock" }
    ];
    const surfaceIntent = {
      resolution: 384,
      materialWeights: new Uint8Array(384 * 384 * 4),
      hash: 0
    };
    const terrainSettings = resolveSeedWorldTerrainGenerationSettings();
    const terrainNormalSamples = new Uint8Array(terrainSettings.heightResolution ** 2 * 2);
    const surfaceColorSamples = new Uint8Array(256 * 256);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => surfaceColorSamples.buffer }))
    );
    const populationLayout = {
      treeScatterOperations: [],
      detailBrushOperations: [],
      treeInstances: [],
      detailDensityFields: [],
      hash: 0
    };

    const terrainMaterial = {
      shaderData: {
        enableMacro: vi.fn(),
        disableMacro: vi.fn(),
        setInt: vi.fn(),
        setColor: vi.fn(),
        setTexture: vi.fn(),
        setVector4: vi.fn(),
        setFloat: vi.fn(),
        setVector2: vi.fn()
      }
    };
    const engine = {
      time: { elapsedTime: 1 },
      resourceManager: {
        load: vi.fn().mockImplementation((descriptor: { type: string }) => {
          if (descriptor.type === "material") return Promise.resolve(terrainMaterial);
          throw new Error(`Unexpected resource load: ${descriptor.type}`);
        })
      }
    };
    const runtime = await SeedWorldTerrainRuntime.create(
      engine as never,
      parent as never,
      camera as never,
      sourceLibrary as never,
      treeAuthoringProfiles as never,
      plan as never,
      fields as never,
      decorations as never,
      populationLayout as never,
      surfaceIntent,
      terrainSettings,
      terrainNormalSamples,
      0.5
    );

    expect(runtimeState.populationCreates).toHaveLength(1);
    expect(runtimeState.populationCoverageSamplers).toHaveLength(1);
    expect(runtimeState.populationCoverageSamplers[0](0, 0)).toBe(0);
    expect(runtimeState.reliefBindCalls).toEqual([]);
    const [engineArg, populationRoot, cameraArg, libraryArg, profileArg, planArg, fieldsArg] =
      runtimeState.populationCreates[0];
    expect((populationRoot as FakeEntity).name).toBe("Population");
    expect(cameraArg).toBe(camera);
    expect(libraryArg).toBe(sourceLibrary);
    expect(profileArg).toBe(treeAuthoringProfiles);
    expect(planArg).toBe(plan);
    expect(fieldsArg).toBe(fields);
    expect(runtimeState.populationCreates[0][7]).toBe(populationLayout);
    expect(runtimeState.populationCreates[0][9]).toEqual(
      expect.objectContaining({
        texture: expect.any((await import("@galacean/engine")).Texture2D),
        tuning: expect.objectContaining({
          colorA: [0, 0.1609002947807312, 0.10072337836027145],
          colorB: [0.2549428939819336, 0.5400000214576721, 0],
          saturation: 1.1,
          uvScale: 1 / 57.91867446899414,
          angleRadians: 0,
          offset: [0.25, 0.75],
          softnessMetres: 0,
          vistaBlendStartMetres: 0,
          vistaBlendEndMetres: 169,
          remapLow: 0,
          remapHigh: 1
        })
      })
    );
    expect(runtimeState.populationCreates[0][10]).toEqual(SEED_WORLD_ROAD_COLOR_DEFAULT);
    expect(engineArg).toBeDefined();
    expect(runtimeState.smallRockCreates[0][3]).toBe(sourceLibrary.debrisSource);
    expect(runtimeState.rockCreates).toHaveLength(2);
    expect(runtimeState.rockCreates[0][5]).toEqual([{ category: "rock", id: "large-rock" }]);
    expect(runtimeState.rockCreates[1][5]).toEqual([]);
    expect(runtimeState.mushroomCreates).toHaveLength(1);
    expect(runtimeState.mushroomCreates[0][3]).toBe(sourceLibrary.mushroom);
    expect(runtime.observationAnchor).toEqual({ x: 64, y: 12, z: -96 });
    const layerSources = runtimeState.clipmapCreates[0][7] as Array<{
      readonly layers: readonly {
        readonly id: string;
        readonly tileSize: readonly [number, number];
        readonly diffuse: object;
      }[];
      readonly alphamaps: readonly { readonly layers: readonly string[] }[];
    }>;
    expect(layerSources[0].layers.map((layer) => layer.id)).toEqual(["layer-00", "layer-04", "layer-02"]);
    expect(layerSources[0].alphamaps[0].layers).toEqual(["layer-00", "layer-04", "layer-02", null]);
    expect(layerSources[0].layers.map((layer) => layer.tileSize)).toEqual([
      [2, 2],
      [2, 2],
      [2, 2]
    ]);
    expect(layerSources[0].layers[2].diffuse).toBe(layerSources[0].layers[1].diffuse);
    expect(layerSources).toHaveLength(1);
    expect(layerSources[0].alphamaps[0]).toEqual(
      expect.objectContaining({ sampleSize: [384, 384], weights: seedWorldRenderWeights(surfaceIntent as never) })
    );
    const clipmapDescriptor = runtimeState.clipmapCreates[0][3] as {
      readonly vertexSpacing: number;
      readonly sources: readonly { readonly normalSamples?: Uint8Array; readonly holes?: Uint8Array }[];
    };
    expect(clipmapDescriptor).toMatchObject({ vertexSpacing: 8 });
    expect(clipmapDescriptor).not.toHaveProperty("useBakedNormals");
    expect(clipmapDescriptor.sources).toHaveLength(1);
    expect(clipmapDescriptor.sources[0].normalSamples).toBe(terrainNormalSamples);
    expect(clipmapDescriptor.sources[0].holes).toBeUndefined();
    expect(runtimeState.clipmapCreates[0][5]).toBe(32);
    expect(runtimeState.clipmapCreates[0][6]).toBe(4);
    expect(runtimeState.textureCreates).not.toContainEqual([
      engine,
      terrainSettings.heightResolution,
      terrainSettings.heightResolution,
      "rgba8",
      false,
      false
    ]);
    expect(runtimeState.textureCreates).toContainEqual([engine, 256, 256, "r8", true, false]);
    expect(terrainMaterial.shaderData.setTexture).not.toHaveBeenCalledWith(
      "material_GrassShadingFieldTexture",
      expect.anything()
    );
    expect(terrainMaterial.shaderData.setVector4).toHaveBeenCalledWith(
      "material_GrassColorFieldParams",
      expect.objectContaining({ x: 0, y: 0, z: 1, w: 1.1 })
    );
    expect(terrainMaterial.shaderData.setTexture).toHaveBeenCalledWith(
      "material_GrassColorFieldTexture",
      expect.any((await import("@galacean/engine")).Texture2D)
    );
    const surfaceColorTexture = terrainMaterial.shaderData.setTexture.mock.calls.find(
      ([property]) => property === "material_GrassColorFieldTexture"
    )?.[1] as {
      readonly setPixelBuffer: ReturnType<typeof vi.fn>;
      readonly generateMipmaps: ReturnType<typeof vi.fn>;
      readonly filterMode: unknown;
      readonly wrapModeU: unknown;
      readonly wrapModeV: unknown;
    };
    expect(surfaceColorTexture.setPixelBuffer).toHaveBeenCalledWith(surfaceColorSamples);
    expect(surfaceColorTexture.generateMipmaps).toHaveBeenCalledOnce();
    expect(surfaceColorTexture).toMatchObject({ filterMode: "trilinear", wrapModeU: "clamp", wrapModeV: "clamp" });
    expect(terrainMaterial.shaderData.setVector4).toHaveBeenCalledWith(
      "material_GrassColorFieldTransform",
      expect.objectContaining({ x: 1, y: 1 / 57.91867446899414, z: 0, w: 1 / 3_072 })
    );
    expect(terrainMaterial.shaderData.setVector2).toHaveBeenCalledWith(
      "material_GrassColorFieldVistaBlend",
      expect.objectContaining({ x: 0, y: 169 })
    );
    expect(terrainMaterial.shaderData.setColor).toHaveBeenCalledWith(
      "material_GrassColorA",
      expect.objectContaining({
        r: 0,
        g: 0.1609002947807312,
        b: 0.10072337836027145,
        a: 1
      })
    );
    expect(terrainMaterial.shaderData.setColor).toHaveBeenCalledWith(
      "material_GrassColorB",
      expect.objectContaining({
        r: 0.2549428939819336,
        g: 0.5400000214576721,
        b: 0,
        a: 1
      })
    );
    expect(terrainMaterial.shaderData.setColor).toHaveBeenCalledWith(
      "material_TerrainRoadColor",
      expect.objectContaining({
        r: SEED_WORLD_ROAD_COLOR_DEFAULT[0],
        g: SEED_WORLD_ROAD_COLOR_DEFAULT[1],
        b: SEED_WORLD_ROAD_COLOR_DEFAULT[2],
        a: 1
      })
    );
    expect(terrainMaterial.shaderData.setFloat).not.toHaveBeenCalledWith(
      "material_GrassDistanceFadeEnable",
      expect.anything()
    );
    expect(terrainMaterial.shaderData.setFloat).not.toHaveBeenCalledWith(
      "material_GrassFadeDistance",
      expect.anything()
    );
    expect(terrainMaterial.shaderData.setFloat).not.toHaveBeenCalledWith("material_GrassFalloff", expect.anything());
    expect(terrainMaterial.shaderData.setVector4).toHaveBeenCalledWith(
      "material_GrassColorFieldOffset",
      expect.objectContaining({
        x: 0.25,
        y: 0.75,
        z: 0.5,
        w: 0.5
      })
    );
    expect(engine.resourceManager.load).not.toHaveBeenCalledWith(expect.objectContaining({ type: "buffer" }));
    expect(engine.resourceManager.load).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("macro-variation-noise.png") })
    );
    expect(runtimeState.clipmapCreates[0][9]).toBeUndefined();
    expect(runtimeState.clipmapCreates[0][10]).toBeUndefined();
    const farTerrainMaterial = runtimeState.clipmapFarMaterials[0];
    for (const material of [terrainMaterial, farTerrainMaterial]) {
      expect(material.shaderData.setFloat).toHaveBeenCalledWith("material_TerrainFarCompositeLod", 2);
      expect(material.shaderData.setVector2).toHaveBeenCalledWith(
        "material_GrassColorFieldVistaBlend",
        expect.objectContaining({ x: 0, y: 169 })
      );
      expect(material.shaderData.setVector4).toHaveBeenCalledWith(
        "material_TerrainSeedLayerSnowResponse",
        expect.objectContaining({ x: 0.72, y: 0.36, z: 0.18, w: 0 })
      );
    }
    expect(farTerrainMaterial.shaderData.setColor).toHaveBeenCalledWith(
      "material_TerrainSeedLayerColor1",
      expect.objectContaining({
        r: SEED_WORLD_ROAD_COLOR_DEFAULT[0],
        g: SEED_WORLD_ROAD_COLOR_DEFAULT[1],
        b: SEED_WORLD_ROAD_COLOR_DEFAULT[2],
        a: 1
      })
    );
    expect(farTerrainMaterial.shaderData.setColor).toHaveBeenCalledWith(
      "material_TerrainSeedLayerColor2",
      expect.objectContaining({
        r: SEED_WORLD_ROAD_COLOR_DEFAULT[0],
        g: SEED_WORLD_ROAD_COLOR_DEFAULT[1],
        b: SEED_WORLD_ROAD_COLOR_DEFAULT[2],
        a: 1
      })
    );
    const initialSurfaceTuning = runtime.getSurfaceColorTuning();
    const lastUniform = (setter: ReturnType<typeof vi.fn>, property: string) =>
      setter.mock.calls.filter(([name]) => name === property).at(-1)?.[1];
    Object.assign(terrainMaterial.shaderData, {
      getTexture: (name: string) => lastUniform(terrainMaterial.shaderData.setTexture, name),
      getVector2: (name: string) => lastUniform(terrainMaterial.shaderData.setVector2, name),
      getVector4: (name: string) => lastUniform(terrainMaterial.shaderData.setVector4, name),
      getColor: (name: string) => lastUniform(terrainMaterial.shaderData.setColor, name),
      getInt: () => undefined,
      getMacros: () => [],
      getFloat: () => undefined,
      getVector3: () => undefined,
      getFloatArray: () => [0, 0, fields.sizeMetres, fields.sizeMetres]
    });
    const sharedGrass = {
      shaderData: {
        enableMacro: vi.fn(),
        disableMacro: vi.fn(),
        setTexture: vi.fn(),
        setVector2: vi.fn(),
        setVector4: vi.fn(),
        setColor: vi.fn(),
        setInt: vi.fn(),
        setFloat: vi.fn(),
        setFloatArray: vi.fn(),
        setVector3: vi.fn()
      }
    };
    const releaseSharedGrass = runtime.registerGrassAppearanceMaterial(sharedGrass as never);
    const groundCover = {
      shaderData: {
        enableMacro: vi.fn(),
        disableMacro: vi.fn(),
        setTexture: vi.fn(),
        setVector2: vi.fn(),
        setVector4: vi.fn(),
        setColor: vi.fn(),
        setInt: vi.fn(),
        setFloat: vi.fn(),
        setFloatArray: vi.fn(),
        setVector3: vi.fn()
      }
    };
    const releaseGroundCover = runtime.registerGrassAppearanceMaterial(groundCover as never, 0.8);
    expect(groundCover.shaderData.setTexture).toHaveBeenCalledWith(
      "material_GrassColorFieldTexture",
      surfaceColorTexture
    );
    const expectCoverPalette = () => {
      for (const suffix of ["A", "B"]) {
        const ground = lastUniform(terrainMaterial.shaderData.setColor, `material_GrassColor${suffix}`);
        const cover = lastUniform(groundCover.shaderData.setColor, `material_GrassColor${suffix}`);
        for (const channel of ["r", "g", "b"]) expect(cover[channel]).toBeCloseTo(ground[channel] * 0.8, 12);
      }
    };
    expectCoverPalette();
    expect(sharedGrass.shaderData.setTexture).toHaveBeenCalledWith(
      "material_GrassColorFieldTexture",
      surfaceColorTexture
    );
    runtime.setSurfaceColorTuning({
      roadColor: initialSurfaceTuning.roadColor,
      grass: {
        ...initialSurfaceTuning.grass,
        enabled: false,
        vistaBlendStartMetres: 420,
        vistaBlendEndMetres: 1_200
      }
    });
    expect(runtime.getSurfaceColorTuning().grass.enabled).toBe(false);
    expect(runtime.getSurfaceColorTuning().grass.vistaBlendStartMetres).toBe(420);
    expect(runtime.getSurfaceColorTuning().grass.vistaBlendEndMetres).toBe(1_200);
    expect(sharedGrass.shaderData.setVector2).toHaveBeenCalledWith("material_GrassColorFieldVistaBlend", {
      x: 420,
      y: 1_200
    });
    expect(sharedGrass.shaderData.setVector4).toHaveBeenCalledWith(
      "material_GrassColorFieldTransform",
      expect.objectContaining({ x: 0 })
    );
    expect(runtimeState.macroVariationStates).toEqual([]);
    expect(terrainMaterial.shaderData.setVector4).toHaveBeenCalledWith(
      "material_GrassColorFieldTransform",
      expect.objectContaining({ x: 0, y: 1 / 57.91867446899414, z: 0, w: 1 / 3_072 })
    );
    expect(farTerrainMaterial.shaderData.setVector4).toHaveBeenCalledWith(
      "material_GrassColorFieldTransform",
      expect.objectContaining({ x: 0, y: 1 / 57.91867446899414, z: 0, w: 1 / 3_072 })
    );
    for (const material of [terrainMaterial, farTerrainMaterial]) {
      expect(material.shaderData.setVector2).toHaveBeenCalledWith(
        "material_GrassColorFieldVistaBlend",
        expect.objectContaining({ x: 420, y: 1_200 })
      );
    }
    expect(runtimeState.populationGrassColorTunings).toEqual([
      expect.objectContaining({
        enabled: false,
        uvScale: 1 / 57.91867446899414,
        angleRadians: 0,
        offset: [0.25, 0.75],
        softnessMetres: 0,
        vistaBlendStartMetres: 420,
        vistaBlendEndMetres: 1_200,
        remapLow: 0,
        saturation: 1.1
      })
    ]);
    runtime.setSurfaceColorTuning({
      roadColor: [0.1, 0.2, 0.3],
      grass: { ...runtime.getSurfaceColorTuning().grass, colorA: [0.1, 0.3, 0.4], colorB: [0.2, 0.5, 0.3] }
    });
    expectCoverPalette();
    expect(runtime.getSurfaceColorTuning()).toEqual(expect.objectContaining({ roadColor: [0.1, 0.2, 0.3] }));
    expect(terrainMaterial.shaderData.setColor).toHaveBeenLastCalledWith(
      "material_TerrainRoadColor",
      expect.objectContaining({ r: 0.1, g: 0.2, b: 0.3, a: 1 })
    );
    expect(farTerrainMaterial.shaderData.setColor).toHaveBeenCalledWith(
      "material_TerrainRoadColor",
      expect.objectContaining({ r: 0.1, g: 0.2, b: 0.3, a: 1 })
    );
    expect(runtimeState.populationGrassRoadColors).toEqual([SEED_WORLD_ROAD_COLOR_DEFAULT, [0.1, 0.2, 0.3]]);
    releaseSharedGrass();
    const releasedWrites = sharedGrass.shaderData.setVector4.mock.calls.length;
    runtime.resetSurfaceColorTuning();
    expectCoverPalette();
    releaseGroundCover();
    const coverWrites = groundCover.shaderData.setColor.mock.calls.length;
    runtime.resetSurfaceColorTuning();
    expect(groundCover.shaderData.setColor.mock.calls).toHaveLength(coverWrites);
    expect(sharedGrass.shaderData.setVector4.mock.calls).toHaveLength(releasedWrites);
    expect(runtime.getSurfaceColorTuning()).toEqual(
      expect.objectContaining({
        roadColor: SEED_WORLD_ROAD_COLOR_DEFAULT,
        grass: expect.objectContaining({
          enabled: true,
          colorA: [0, 0.1609002947807312, 0.10072337836027145],
          colorB: [0.2549428939819336, 0.5400000214576721, 0],
          saturation: 1.1,
          uvScale: 1 / 57.91867446899414,
          angleRadians: 0,
          offset: [0.25, 0.75],
          softnessMetres: 0,
          vistaBlendStartMetres: 0,
          vistaBlendEndMetres: 169,
          remapLow: 0,
          remapHigh: 1
        })
      })
    );
    expect(runtimeState.populationGrassRoadColors).toEqual([
      SEED_WORLD_ROAD_COLOR_DEFAULT,
      [0.1, 0.2, 0.3],
      SEED_WORLD_ROAD_COLOR_DEFAULT,
      SEED_WORLD_ROAD_COLOR_DEFAULT
    ]);

    runtime.warmupPopulationDetails();
    expect(runtimeState.populationVisibleWarmupCount).toBe(1);

    runtime.update(0.125);
    expect(runtimeState.reliefBindCalls).toEqual([camera.shaderData]);
    expect(runtimeState.populationUpdates).toEqual([0.125]);
    expect(
      (runtimeState.exactCellCreates[0][1] as { id: string; category: string }[]).map(({ id, category }) => ({
        id,
        category
      }))
    ).toEqual([
      { id: "large-rock", category: "rock" },
      { id: "small-rock", category: "small-rock" },
      { id: "mushroom", category: "mushroom" }
    ]);
    expect(runtimeState.exactCellUpdateCount).toBe(1);
    expect(runtimeState.rockUpdateCount).toBe(0);
    expect(runtimeState.smallRockUpdateCount).toBe(0);
    expect(runtimeState.mushroomUpdateCount).toBe(0);

    (runtime.decorations as unknown as FakeEntity).isActiveInHierarchy = false;
    runtime.update(0.25);
    expect(runtimeState.populationUpdates).toEqual([0.125, 0.25]);
    expect(runtimeState.exactCellUpdateCount).toBe(1);

    await runtime.destroy();
    await runtime.destroy();
    runtime.update(0.25);
    expect(runtimeState.populationUpdates).toEqual([0.125, 0.25]);
    expect(runtimeState.populationDestroyCount).toBe(1);
    expect(runtimeState.reliefDisposeCount).toBe(1);
    expect(runtimeState.reliefBindCalls).toEqual([camera.shaderData]);
    expect(runtimeState.rockDestroyCount).toBe(2);
    expect(runtimeState.smallRockDestroyCount).toBe(1);
    expect(runtimeState.mushroomDestroyCount).toBe(1);
    expect(runtimeState.clipmapDestroyCount).toBe(1);
    expect(runtimeState.textureDestroyCount).toBe(1);
    expect(runtimeState.bufferDestroyCount).toBe(0);
    expect(parent.children[0].destroy).toHaveBeenCalledOnce();
  });
});

function createEntity(name: string): FakeEntity {
  const children: FakeEntity[] = [];
  return {
    name,
    children,
    isActiveInHierarchy: true,
    destroy: vi.fn(),
    createChild(childName: string): FakeEntity {
      const child = createEntity(childName);
      children.push(child);
      return child;
    }
  };
}

function createFields() {
  return {
    rootSeed: 1_729,
    sizeMetres: 3_072,
    heightResolution: 385,
    surfaceResolution: 384,
    heightSamples: new Uint16Array(385 * 385)
  };
}
