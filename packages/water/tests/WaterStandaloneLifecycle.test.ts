import generatedLake from "./fixtures/terrain-hydrology-lake.json";
import { compileWaterShape, type WaterShapeAuthoring } from "../src/water/native/WaterAuthoring";
import type { WaterTerrainSnapshot } from "../src/water/authoring/terrain/WaterTerrainSnapshot";
import type { HeightfieldWaterDescriptorV1 } from "../src/water/authoring/heightfield/HeightfieldWaterDescriptor";
import { WaterQualityTier } from "../src/water/authoring/wave/enums/WaterQualityTier";
import { createLakeSpatialFieldBudget } from "../src/water/presets/lake/LakeWaterLook";
import { expect, it, vi } from "vitest";
import {
  AssetType,
  BufferAsset,
  Camera,
  JSONAsset,
  Material,
  MeshRenderer,
  ScreenSpaceReflection,
  ScreenSpaceReflectionActivationMode,
  ScreenSpaceReflectionReceiverMode,
  Shader,
  Vector3,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  WaterBodyComponent,
  WaterSystem,
  registerNativeWater,
  encodeWaterTerrainAssets
} from "../src/water/native/index";
import { createWaterMaterialDefaults } from "../src/water/native/WaterMaterial";
import { BUILTIN_WATER_PROJECT_URL } from "../src/water/native/WaterBuiltinAssets";
import { createWaterQualitySettings } from "../src/water/native/WaterQualitySettings";
import { lake, terrain } from "./WaterFixtures";

async function fixture(profile: "lake" | "river") {
  registerNativeWater();
  const compiler = new ShaderCompiler();
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), shaderCompiler: compiler });
  const scene = engine.sceneManager.activeScene;
  const system = scene.createRootEntity("Water owner").addComponent(WaterSystem);
  system.camera = scene.createRootEntity("Camera").addComponent(Camera);
  system.camera.entity.transform.setPosition(4, 7, 10);
  system.camera.entity.transform.lookAt(new Vector3(4, 0, 4));
  system.beginInputUpdate();
  const file = createWaterMaterialDefaults(profile);
  expect(file.shader).toBe(`Water/${profile === "river" ? "River" : "Lake"}.v1`);
  expect(file).not.toHaveProperty("shaderRef");
  expect(
    Object.values(file.shaderData)
      .filter((entry) => entry.type === "Texture")
      .every((entry) => entry.value === null)
  ).toBe(true);
  const material = await engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
  });
  const encoded = encodeWaterTerrainAssets({
    ...terrain,
    origin: profile === "river" ? [-16, -16] : [-32, -32],
    columns: profile === "river" ? 33 : 65,
    rows: profile === "river" ? 33 : 65,
    heights: Array(profile === "river" ? 33 * 33 : 65 * 65).fill(-2)
  });
  const description = new JSONAsset(engine),
    heights = new BufferAsset(engine);
  description.data = encoded.description;
  heights.buffer = encoded.heights.buffer;
  const authoring = {
    shape:
      profile === "lake"
        ? {
            ...lake,
            referenceLevel: 0,
            shoreline: [
              [-6, -6],
              [6, -6],
              [6, 6],
              [-6, 6]
            ].map(([x, z], index) => ({ id: `p${index}`, ring: "shore", x, z }))
          }
        : {
            kind: "river" as const,
            speed: 1,
            course: {
              id: "standalone-river",
              points: [
                { id: "head", x: -6, z: -6, elevation: 0, width: 4, depth: 2 },
                { id: "tail", x: 6, z: 6, elevation: 0, width: 4, depth: 2 }
              ]
            }
          },
    terrain: { mode: "asset" as const, description, heights },
    material,
    quality: createWaterQualitySettings(profile)
  };
  let paused = true;
  const resume = () => {
    if (paused) {
      paused = false;
      system.endInputUpdate(true, false);
    }
  };
  return {
    engine,
    scene,
    system,
    material,
    authoring,
    resume,
    async close() {
      resume();
      await system.dispose();
      engine.destroy();
    }
  };
}

it("creates a standalone river from a name-only authoring Material through WaterBodyComponent", async () => {
  const f = await fixture("river");
  const create = vi.spyOn(Shader, "create");
  try {
    expect(f.material.shader.name).toBe("Water/River.v1");
    const body = f.scene.createRootEntity("River").addComponent(WaterBodyComponent);
    body.authoring = f.authoring;
    await (await f.system.prepareBatch([{ body, configuration: body._compileAuthoring() }])).commit().retiredCleanup;
    const shaders = create.mock.calls.map(([source]) => source);
    expect(shaders.some((source) => typeof source === "string" && source.includes("RiverSurface"))).toBe(true);
    const renderers: MeshRenderer[] = [];
    for (const root of f.scene.rootEntities) root.getComponentsIncludeChildren(MeshRenderer, renderers);
    expect(renderers.some((renderer) => renderer.getMaterial()?.shader === f.material.shader)).toBe(true);
    expect(f.system.sample(4, 4).water).toBe(true);
    f.engine.update();
  } finally {
    create.mockRestore();
    await f.close();
  }
});

it("synchronizes a staged lake material with SSR activation and recovery", async () => {
  const f = await fixture("lake");
  try {
    const camera = f.system.camera!;
    camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOn;
    const body = f.scene.createRootEntity("Reflection lake").addComponent(WaterBodyComponent);
    body.authoring = f.authoring;
    await (await f.system.prepareBatch([{ body, configuration: body._compileAuthoring() }])).commit().retiredCleanup;
    const renderers: MeshRenderer[] = [];
    for (const root of f.scene.rootEntities) root.getComponentsIncludeChildren(MeshRenderer, renderers);
    const renderer = renderers.find((renderer) => f.system.resolveRenderOwner(renderer.entity) === body)!;
    expect(renderer).toBeDefined();
    const material = renderer.getMaterial()!;
    for (const active of [true, false, true]) {
      camera.screenSpaceReflection.activationMode = active
        ? ScreenSpaceReflectionActivationMode.ForceOn
        : ScreenSpaceReflectionActivationMode.ForceOff;
      for (let frame = 0; frame < 3; frame++) f.engine.update();
      expect(ScreenSpaceReflection.getMaterialReceiverMode(material)).toBe(
        active ? ScreenSpaceReflectionReceiverMode.TransparentSampleOnly : ScreenSpaceReflectionReceiverMode.Disabled
      );
      expect(f.system.sample(0, 0).water).toBe(true);
    }
  } finally {
    await f.close();
  }
});

it.each(["connection", "target"] as const)("keeps a lake usable after deleting its %s", async (removed) => {
  const f = await fixture("lake");
  try {
    const a = f.scene.createRootEntity("Lake A").addComponent(WaterBodyComponent);
    const b = f.scene.createRootEntity("Lake B").addComponent(WaterBodyComponent);
    a.authoring = f.authoring;
    b.authoring = {
      ...f.authoring,
      shape: {
        ...f.authoring.shape,
        kind: "lake",
        shoreline: (f.authoring.shape as typeof lake).shoreline.map((point) => ({ ...point, x: point.x + 10 }))
      }
    };
    a.authoring = {
      ...a.authoring!,
      connections: [
        {
          id: "join",
          target: b,
          section: [
            [5, 2],
            [5, -2]
          ],
          transitionLengths: [2, 2]
        }
      ]
    };
    await (
      await f.system.prepareBatch([a, b].map((body) => ({ body, configuration: body._compileAuthoring() })))
    ).commit().retiredCleanup;
    expect((a.configuration!.asset.data.source as any).descriptor.connections).toHaveLength(1);
    if (removed === "connection") a.authoring = { ...a.authoring!, connections: [] };
    else {
      b.entity.destroy();
    }
    f.resume();
    await f.system.flushAuthoring();
    expect((a.configuration!.asset.data.source as any).descriptor.connections ?? []).toEqual([]);
    expect(f.system.sample(4, 4).water).toBe(true);
    f.engine.update();
    if (removed === "target") await b.dispose();
  } finally {
    await f.close();
  }
});

it("rejects a partial null-target connection without replacing accepted authoring", async () => {
  const f = await fixture("lake");
  try {
    const a = f.scene.createRootEntity("Lake A").addComponent(WaterBodyComponent);
    const b = f.scene.createRootEntity("Lake B").addComponent(WaterBodyComponent);
    a.authoring = f.authoring;
    b.authoring = { ...f.authoring, shape: { ...lake, referenceLevel: 0 } };
    const link = {
      id: "join",
      target: b,
      section: [
        [4, 3],
        [4, 5]
      ] as const,
      transitionLengths: [1, 1] as const
    };
    a.authoring = { ...a.authoring!, connections: [link] };
    expect(() => {
      a.authoring = { ...a.authoring!, connections: [{ ...link, target: null as unknown as WaterBodyComponent }] };
    }).toThrow("sections and transition lengths");
    expect(a.authoring!.connections![0].target).toBe(b);
    a.authoring = { ...a.authoring!, connections: [] };
    expect(a.authoring!.connections).toEqual([]);
  } finally {
    await f.close();
  }
});

it("renders a shared builtin lake at independent tiers and restores high after low and disable", async () => {
  const f = await fixture("lake");
  const normal = new Texture2D(f.engine, 4, 4, undefined, false, false);
  for (const index of [0, 1])
    f.material.shaderData.setTexture(`material_Water_appearance_appearance_detailLayers_${index}_texture`, normal);
  try {
    const a = f.scene.createRootEntity("Quality lake A").addComponent(WaterBodyComponent);
    const b = f.scene.createRootEntity("Quality lake B").addComponent(WaterBodyComponent);
    b.authoring = { ...f.authoring, quality: { ...f.authoring.quality, surfaceShading: "high" } };
    let highShader: Shader | undefined;
    const materialFor = (owner: WaterBodyComponent) => {
      const renderers: MeshRenderer[] = [];
      for (const root of f.scene.rootEntities) root.getComponentsIncludeChildren(MeshRenderer, renderers);
      const renderer = renderers.find((renderer) => f.system.resolveRenderOwner(renderer.entity) === owner);
      expect(renderer).toBeDefined();
      return renderer!.getMaterial()!;
    };
    for (const surfaceShading of ["high", "low", "medium", "high"] as const) {
      a.authoring = { ...f.authoring, quality: { ...f.authoring.quality, surfaceShading } };
      await (
        await f.system.prepareBatch([a, b].map((body) => ({ body, configuration: body._compileAuthoring() })))
      ).commit().retiredCleanup;
      const aMaterial = materialFor(a),
        bMaterial = materialFor(b);
      expect(bMaterial.shader).toBe(f.material.shader);
      if (surfaceShading === "high") {
        highShader ??= aMaterial.shader;
        expect(aMaterial.shader).toBe(highShader);
        expect(aMaterial.shader).toBe(f.material.shader);
      } else expect(aMaterial.shader).not.toBe(f.material.shader);
      const secondTexture = aMaterial.shaderData.getTexture("material_AppearanceV2Detail1Texture");
      expect(!!secondTexture).toBe(surfaceShading !== "low");
      expect(!!bMaterial.shaderData.getTexture("material_AppearanceV2Detail1Texture")).toBe(true);
      f.engine.update();
      expect(f.system.sample(0, 0).water).toBe(true);
      expect(a.lastError).toBeUndefined();
    }
    f.resume();
    await f.system.flushAuthoring();
    a.authoring = { ...f.authoring, quality: { ...f.authoring.quality, surfaceShading: "low" } };
    await f.system.flushAuthoring();
    await f.system.setRuntimeEnabled(false);
    await f.system.setRuntimeEnabled(true);
    expect(materialFor(a).shader).not.toBe(highShader);
    expect(materialFor(a).shaderData.getTexture("material_AppearanceV2Detail1Texture")).toBeFalsy();
    a.authoring = { ...f.authoring, quality: { ...f.authoring.quality, surfaceShading: "high" } };
    await f.system.flushAuthoring();
    expect(materialFor(a).shader).toBe(highShader);
    f.engine.update();
  } finally {
    await f.close();
  }
});

it("activates a connected native river and Ocean, and removes the Ocean port on disconnect", async () => {
  const f = await fixture("river");
  try {
    const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
    f.engine.resourceManager.registerVirtualResources(
      manifest.files.map((file: { path: string }) => ({
        ...file,
        path: new URL(file.path, BUILTIN_WATER_PROJECT_URL).href
      }))
    );
    const file = await (await fetch(new URL("Water/Materials/ocean.mat", BUILTIN_WATER_PROJECT_URL))).json();
    const material = await f.engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
    });
    const encoded = encodeWaterTerrainAssets({
      id: "connected-bed",
      revision: 1,
      origin: [-64, -64],
      spacing: 1,
      columns: 129,
      rows: 129,
      heights: Array(129 * 129).fill(-2)
    });
    const description = new JSONAsset(f.engine),
      heights = new BufferAsset(f.engine);
    description.data = encoded.description;
    heights.buffer = encoded.heights.buffer;
    const accepted = { mode: "asset" as const, description, heights };
    const ocean = f.scene.createRootEntity("Connected Ocean").addComponent(WaterBodyComponent);
    ocean.authoring = {
      ...f.authoring,
      shape: {
        kind: "ocean",
        waterLevel: 0,
        boundaryConnected: true,
        layout: {
          schemaVersion: 1,
          kind: "ocean-surface-layout",
          centerXZ: [0, 0],
          size: 130,
          surfaceTopology: "finite",
          finitePatchGridSize: 16
        }
      },
      material,
      terrain: accepted,
      quality: createWaterQualitySettings("ocean", { geometry: "low", surfaceShading: "low", query: "dense" })
    };
    const river = f.scene.createRootEntity("Connected River").addComponent(WaterBodyComponent);
    river.authoring = {
      ...f.authoring,
      terrain: accepted,
      connections: [
        {
          id: "mouth",
          target: ocean,
          section: [
            [3, 5],
            [5, 3]
          ],
          transitionLengths: [2, 2]
        }
      ]
    };
    f.resume();
    await f.system.flushAuthoring();
    await Promise.all([river.ready, ocean.ready]);
    expect(river.lastError).toBeUndefined();
    expect(ocean.lastError).toBeUndefined();
    const connectedSource = ocean.configuration!.asset.data.source as any;
    expect(connectedSource.descriptor.connections).toBeUndefined();
    expect(connectedSource.descriptor.config.connections).toHaveLength(1);
    f.engine.update();
    expect(f.system.sample(4, 4).water).toBe(true);
    river.authoring = { ...river.authoring!, connections: [] };
    await f.system.flushAuthoring();
    await Promise.all([river.ready, ocean.ready]);
    expect(ocean.lastError).toBeUndefined();
    expect((ocean.configuration!.asset.data.source as any).descriptor.config.connections).toBeUndefined();
    expect(f.system.sample(10, 10).water).toBe(true);
    f.engine.update();
  } finally {
    await f.close();
  }
});

it("activates the real RG16 generated Lake with its data-derived precision budget", async () => {
  const f = await fixture("lake");
  try {
    const bed = generatedLake.bed as unknown as WaterTerrainSnapshot;
    const shape = generatedLake.shape as WaterShapeAuthoring;
    const asset = compileWaterShape(shape, bed, generatedLake.id);
    const source = asset.source as any,
      representation = asset.representationData as any;
    const descriptor = {
      ...source.descriptor,
      spatialField: representation.spatialField,
      renderSurface: representation.renderSurface,
      quality: WaterQualityTier.High
    } as HeightfieldWaterDescriptorV1;
    const budget = createLakeSpatialFieldBudget(descriptor);
    expect(budget.maximumGpuDepthDecodeError).toBeGreaterThan(0.02);
    const encoded = encodeWaterTerrainAssets(bed);
    const description = new JSONAsset(f.engine),
      heights = new BufferAsset(f.engine);
    description.data = encoded.description;
    heights.buffer = encoded.heights.buffer;
    const body = f.scene.createRootEntity("Generated Lake").addComponent(WaterBodyComponent);
    body.authoring = {
      ...f.authoring,
      shape,
      terrain: { mode: "asset", description, heights },
      quality: createWaterQualitySettings("lake", { spatialField: budget })
    };
    f.resume();
    await f.system.flushAuthoring();
    await body.ready;
    expect(body.lastError).toBeUndefined();
    f.engine.update();
  } finally {
    await f.close();
  }
});
