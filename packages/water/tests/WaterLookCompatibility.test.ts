import { afterEach, expect, it, vi } from "vitest";
import {
  AssetType,
  Camera,
  Material,
  MeshRenderer,
  Texture2D,
  TextureCube,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  compileWaterShape,
  createWaterCreationPreset,
  createWaterMaterialDefaults,
  createWaterQualitySettings,
  registerNativeWater,
  WaterBodyComponent,
  WaterBodyResource,
  WaterLookResource,
  WaterQualityResource,
  WaterSystem,
  type WaterBodyConfiguration
} from "../src/water/native/index";
import { defaultLook } from "../src/water/native/WaterMaterialFile";
import { OceanTextureLibrary } from "../src/water/runtime/ocean/OceanTextureLibrary";
import { registerLakeWaterLook } from "../src/water/presets/lake/LakeWaterLook";
import { registerRiverWaterBodyPresets } from "../src/water/authoring/river/RiverWaterBodyAuthoring";
import { registerFarmlandsRiverLook } from "../src/water/authoring/river/FarmlandsRiverLook";

afterEach(() => vi.restoreAllMocks());

const properties = {
  lake: ["material_AppearanceV2Detail0Texture", "material_AppearanceV2Detail1Texture"],
  river: [
    "material_AppearanceV2Detail0Texture",
    "material_AppearanceV2Detail1Texture",
    "material_AppearanceV2CausticsTexture"
  ],
  ocean: [
    "material_SmoothWavesTexture",
    "material_RoughWavesTexture",
    "material_CausticsTexture",
    "material_FoamTexture",
    "material_IntersectionNoiseTexture"
  ]
};

async function fixture(kind: "lake" | "river" | "ocean") {
  registerNativeWater();
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
  const scene = engine.sceneManager.activeScene!;
  const system = scene.createRootEntity("Water").addComponent(WaterSystem);
  system.camera = scene.createRootEntity("Camera").addComponent(Camera);
  system.camera.entity.transform.setPosition(0, 10, 12);
  system.camera.entity.transform.lookAt(new Vector3());
  const preset = createWaterCreationPreset(kind);
  const config: WaterBodyConfiguration = {
    asset: new WaterBodyResource(engine, compileWaterShape(preset.shape, preset.terrain, `look-${kind}`)),
    look: new WaterLookResource(engine, defaultLook(kind, false)),
    quality: new WaterQualityResource(engine, {
      schemaVersion: 2,
      id: `look-${kind}`,
      ...createWaterQualitySettings(kind)
    }),
    representationState: preset.shape.kind === "ocean" ? preset.shape.layout : undefined
  };
  const body = scene.createRootEntity(kind).addComponent(WaterBodyComponent);
  const renderMaterials = () =>
    scene.rootEntities
      .flatMap((root) => root.getComponentsIncludeChildren(MeshRenderer, []))
      .filter((renderer) => system.resolveRenderOwner(renderer.entity) === body)
      .map((renderer) => renderer.getMaterial()!)
      .filter((material) => material.name !== "Ocean Far");
  return {
    engine,
    system,
    body,
    config,
    renderMaterials,
    async publish(configuration = config) {
      const candidate = await system.prepareBatch([{ body, configuration }]);
      await candidate.commit().retiredCleanup;
      engine.update();
    },
    async material() {
      return engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: "data:application/json," + encodeURIComponent(JSON.stringify(createWaterMaterialDefaults(kind)))
      });
    },
    async close() {
      try {
        await body.dispose();
        await system.dispose();
      } finally {
        engine.destroy();
      }
    }
  };
}

it.each(["cube", "color space"] as const)(
  "rejects a mixed Look/Material with invalid %s without pinning rejected candidates",
  async (invalid) => {
    const f = await fixture("lake");
    try {
      const material = await f.material();
      const texture = invalid === "cube" ? new TextureCube(f.engine, 4) : new Texture2D(f.engine, 4, 4);
      material.shaderData.setTexture("material_Water_appearance_appearance_detailLayers_0_texture", texture);
      const configuration = { ...f.config, material };
      const resources = [f.config.asset, f.config.look!, f.config.quality, material, texture];
      const references = resources.map((resource) => resource.refCount);
      const shaderReferences = material.shader._getReferCount();
      for (let attempt = 0; attempt < 3; attempt++)
        await expect(f.system.prepareBatch([{ body: f.body, configuration }])).rejects.toThrow(
          invalid === "cube" ? "Texture2D" : "color space"
        );
      expect(resources.map((resource) => resource.refCount)).toEqual(references);
      expect(material.shader._getReferCount()).toBe(shaderReferences);
      expect(f.body.configuration).toBeUndefined();
      expect(f.system.activeRuntimeHost?.getBodyHandle(f.body.waterId)?.active ?? false).toBe(false);
    } finally {
      await f.close();
    }
  }
);

it.each(["lake", "river", "ocean"] as const)(
  "publishes the legacy %s Look textures and keeps an overriding Material's slots empty",
  async (kind) => {
    const f = await fixture(kind);
    try {
      const empty = await f.material();
      const fetches = vi.spyOn(globalThis, "fetch");
      const expectEmpty = () => {
        expect(f.renderMaterials().length).toBeGreaterThan(0);
        for (const property of properties[kind])
          expect(
            f.renderMaterials().every((material) => material.shaderData.getTexture(property) == null),
            property
          ).toBe(true);
        expect(fetches.mock.calls.some(([url]) => String(url).includes("Water/Textures/"))).toBe(false);
      };
      await f.publish({ ...f.config, look: undefined, material: empty });
      expectEmpty();
      await f.publish();
      expect(f.body.lastError).toBeUndefined();
      expect(f.system.sample(0, 0).water).toBe(true);
      const materials = f.renderMaterials();
      expect(materials.length).toBeGreaterThan(0);
      for (const property of properties[kind])
        expect(
          materials.some((material) => material.shaderData.getTexture(property) instanceof Texture2D),
          property
        ).toBe(true);
      fetches.mockClear();
      // Both fields are accepted; Material is the effective input, including its explicit empty slots.
      await f.publish({ ...f.config, material: empty });
      expectEmpty();
    } finally {
      await f.close();
    }
  },
  60000
);

it("releases only its Ocean Look borrow across runtime unload, restore and disposal", async () => {
  const f = await fixture("ocean");
  const external = await OceanTextureLibrary.create(f.engine);
  const textures = Object.values(external.textures).filter((value): value is Texture2D => value instanceof Texture2D);
  try {
    await f.publish();
    expect(f.renderMaterials()[0].shaderData.getTexture("material_SmoothWavesTexture")).toBe(
      external.textures.smoothWaves
    );
    await f.system.setRuntimeEnabled(false);
    for (const texture of textures) {
      expect(texture.refCount).toBe(1);
      expect(texture.destroyed).toBe(false);
    }
    await f.system.setRuntimeEnabled(true);
    f.engine.update();
    expect(f.system.sample(0, 0).water).toBe(true);
    expect(f.renderMaterials()[0].shaderData.getTexture("material_SmoothWavesTexture")).toBe(
      external.textures.smoothWaves
    );
    await f.body.dispose();
    await f.system.dispose();
    for (const texture of textures) {
      expect(texture.refCount).toBe(1);
      expect(texture.destroyed).toBe(false);
    }
    external.destroy();
    for (const texture of textures) expect(texture.refCount).toBe(0);
  } finally {
    external.destroy();
    await f.close();
  }
}, 60000);

it("preserves canonical preset registrations supplied by the host initialization hook", async () => {
  const f = await fixture("lake");
  try {
    f.system.configureRuntime({}, undefined, {
      initialize(host) {
        host.registerAuthoring(registerLakeWaterLook);
        host.registerAuthoring(registerRiverWaterBodyPresets);
        host.registerAuthoring(registerFarmlandsRiverLook);
      }
    });
    await f.publish();
    expect(f.body.lastError).toBeUndefined();
    expect(f.system.sample(0, 0).water).toBe(true);
    expect(f.renderMaterials()[0].shaderData.getTexture(properties.lake[0])).toBeInstanceOf(Texture2D);
  } finally {
    await f.close();
  }
});

it("joins and releases an Ocean Look texture load that completes after runtime cancellation", async () => {
  const f = await fixture("ocean");
  const library = await OceanTextureLibrary.create(f.engine);
  const textures = Object.values(library.textures).filter((value): value is Texture2D => value instanceof Texture2D);
  let complete!: (library: OceanTextureLibrary) => void;
  const loading = new Promise<OceanTextureLibrary>((resolve) => (complete = resolve));
  const create = vi.spyOn(OceanTextureLibrary, "create").mockReturnValueOnce(loading);
  const destroy = vi.spyOn(library, "destroy");
  try {
    const preparing = f.system.prepareBatch([{ body: f.body, configuration: f.config }]);
    void preparing.catch(() => {});
    await expect.poll(() => create.mock.calls.length).toBe(1);
    const unloading = f.system.setRuntimeEnabled(false);
    complete(library);
    await expect(preparing).rejects.toMatchObject({ name: "AbortError" });
    await unloading;
    expect(destroy).toHaveBeenCalledTimes(1);
    for (const texture of textures) expect(texture.refCount).toBe(0);
    expect(f.body.configuration).toBeUndefined();
    expect(f.system.runtimeState.phase).toBe("disabled");
  } finally {
    complete(library);
    await f.close();
    library.destroy();
  }
}, 60000);
