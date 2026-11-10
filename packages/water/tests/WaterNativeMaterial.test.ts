import { AssetType, Material, Shader, Texture2D, WebGLEngine } from "@galacean/engine";
import { expect, it, vi } from "vitest";
import conversion from "../src/water/native/assets/conversion.json";
import { BUILTIN_WATER_PROJECT_URL } from "../src/water/native/WaterBuiltinAssets";
import { registerWaterBuiltinShaders, WATER_BUILTIN_SHADER_NAMES } from "../src/water/native/WaterBuiltinShaders";
import {
  createWaterMaterialDefaults,
  prepareWaterMaterial,
  resolveWaterMaterialLook,
  waterMaterialFactories,
  waterMaterialKey,
  waterMaterialTextures
} from "../src/water/native/WaterMaterial";
import { OceanTextureLibrary } from "../src/water/runtime/ocean/OceanTextureLibrary";
import { WaterRuntimeResourceRegistry } from "../src/water/runtime/resources/WaterRuntimeResourceRegistry";

async function materialFor(engine: WebGLEngine, profile: "lake" | "river" | "ocean", drops = false) {
  registerWaterBuiltinShaders();
  const file = createWaterMaterialDefaults(profile, drops);
  file.name += `/${crypto.randomUUID()}`;
  return engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
  });
}

it.each([
  ["lake", false, 2, 1],
  ["river", false, 3, 2],
  ["river", true, 11, 10],
  ["ocean", false, 5, 5]
] as const)(
  "resolves %s (drops %s) from built-in slots and conversion SHA identities",
  async (profile, drops, slots, textures) => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const material = await materialFor(engine, profile, drops);
      await prepareWaterMaterial(material);
      const bindings = waterMaterialTextures(material);
      expect(bindings).toHaveLength(slots);
      expect(waterMaterialFactories(material)).toHaveLength(textures);
      for (const { path, descriptor } of bindings) {
        expect(descriptor.contentHash).toBe(conversion.find((asset) => asset.target === path)!.sha256);
        expect(descriptor.id).toBe(`builtin-water-texture:${descriptor.contentHash}`);
      }
      const look = resolveWaterMaterialLook(material);
      if (profile === "lake") {
        const layer = look.appearance.appearance.detailLayers[0];
        expect(layer.textureContentHash).toBe(
          conversion.find((asset) => asset.target.endsWith("grasslands-water-normal-1024.ktx2"))!.sha256
        );
      }
      if (profile === "river") expect(!!look.look.riverDrops).toBe(drops);
      expect(
        material.shaderData
          .getProperties()
          .some((property) => material.shaderData.getTexture(property) instanceof Texture2D)
      ).toBe(false);
      material.destroy();
    } finally {
      engine.destroy();
    }
  }
);

it("ignores legacy/custom texture handles and warns once per Material without changing its key or look", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const material = await materialFor(engine, "lake");
    const key = waterMaterialKey(material),
      look = resolveWaterMaterialLook(material);
    const legacy = new Texture2D(engine, 8, 8);
    const slot = waterMaterialTextures(material)[0].slot;
    material.shaderData.setTexture(slot, legacy);
    material.shaderData.setTexture("handwritten_CustomTexture", legacy);
    await prepareWaterMaterial(material);
    await prepareWaterMaterial(material);
    expect(waterMaterialKey(material)).toBe(key);
    expect(resolveWaterMaterialLook(material)).toEqual(look);
    expect(warn).toHaveBeenCalledOnce();
    material.shaderData.setTexture(slot, new Texture2D(engine, 4, 4));
    expect(waterMaterialKey(material)).toBe(key);
    expect(warn).toHaveBeenCalledOnce();
    material.shaderData.setFloat("material_AppearanceV2DepthDistance", 0.123);
    expect(waterMaterialKey(material)).not.toBe(key);
    material.destroy();
  } finally {
    warn.mockRestore();
    engine.destroy();
  }
});

it.each([
  ["lake", false],
  ["river", false],
  ["river", true],
  ["ocean", false]
] as const)("invalidates the %s material key when its Shader changes (drops %s)", async (profile, drops) => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const material = await materialFor(engine, profile, drops);
    const original = material.shader;
    const key = waterMaterialKey(material);
    for (const name of [`${original.name}/replacement`, original.name]) {
      const replacement = Shader.create(name, [...original.subShaders]);
      try {
        material.shader = replacement;
        await prepareWaterMaterial(material);
        const changedKey = waterMaterialKey(material);
        expect(changedKey).not.toBe(key);
        expect(waterMaterialKey(material)).toBe(changedKey);
      } finally {
        material.shader = original;
        replacement.destroy();
      }
      expect(waterMaterialKey(material)).toBe(key);
    }
    material.destroy();
  } finally {
    engine.destroy();
  }
});

it("shares one built-in resource across materials and releases the registry's ownership on shutdown", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const registry = new WaterRuntimeResourceRegistry();
  try {
    const a = await materialFor(engine, "lake"),
      b = await materialFor(engine, "lake");
    expect(a).not.toBe(b);
    await prepareWaterMaterial(a);
    await prepareWaterMaterial(b);
    expect(waterMaterialKey(a)).toBe(waterMaterialKey(b));
    const fa = waterMaterialFactories(a)[0],
      fb = waterMaterialFactories(b)[0];
    const load = vi.fn(fa.load.bind(fa));
    registry.ensureRegistered({ ...fa, load });
    registry.ensureRegistered({ ...fb, load });
    const [first, second] = await Promise.all([
      registry.acquire<{ texture: Texture2D }>(fa.descriptor),
      registry.acquire<{ texture: Texture2D }>(fb.descriptor)
    ]);
    const texture = first!.resource.texture;
    expect(second!.resource.texture).toBe(texture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(texture.refCount).toBe(1);
    a.destroy();
    expect(texture.destroyed).toBe(false);
    await first!.destroy();
    await first!.destroy();
    await second!.destroy();
    // Shared resources stay in the scene registry until it is unloaded.
    expect(texture.refCount).toBe(1);
    await registry.destroy();
    expect(texture.refCount).toBe(0);
    expect(texture.destroyed).toBe(true);
    b.destroy();
  } finally {
    await registry.destroy();
    engine.destroy();
  }
});

it("does not acquire resources for aborted preparation and leaves cancellation cleanup to the registry", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const material = await materialFor(engine, "river");
    const controller = new AbortController();
    controller.abort();
    await expect(prepareWaterMaterial(material, controller.signal)).rejects.toThrow();
    material.destroy();
  } finally {
    engine.destroy();
  }
});

it("shares the Ocean preset paths with runtime-only owners and releases each owner's reference", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const libraries: OceanTextureLibrary[] = [];
  try {
    const material = await materialFor(engine, "ocean");
    const bindings = waterMaterialTextures(material);
    const a = await OceanTextureLibrary.create(engine);
    libraries.push(a);
    const b = await OceanTextureLibrary.create(engine);
    libraries.push(b);
    expect(b.textures.smoothWaves).toBe(a.textures.smoothWaves);
    const factories = waterMaterialFactories(material);
    const factory = factories.find((factory) => factory.descriptor.id === bindings[0].descriptor.id)!;
    const borrowed = (await factory.load({})) as { texture: Texture2D };
    expect(borrowed.texture).toBe(a.textures.smoothWaves);
    expect(borrowed.texture.refCount).toBe(3);
    await factory.destroy!(borrowed);
    a.destroy();
    expect(b.textures.smoothWaves.refCount).toBe(1);
    expect(b.textures.smoothWaves.destroyed).toBe(false);
    b.destroy();
    expect(b.textures.smoothWaves.refCount).toBe(0);
    expect(b.textures.smoothWaves.destroyed).toBe(true);
    material.destroy();
  } finally {
    libraries.forEach((library) => library.destroy());
    engine.destroy();
  }
});

it.each(["lake", "river", "river-drops", "ocean"] as const)(
  "loads the standalone %s example without Shader/texture asset dependencies",
  async (preset) => {
    registerWaterBuiltinShaders();
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const url = new URL(`Water/Materials/${preset}.mat`, BUILTIN_WATER_PROJECT_URL).href;
      const file = await (await fetch(url)).json();
      const profile = preset === "river-drops" ? "river" : preset;
      expect(file.shader).toBe(WATER_BUILTIN_SHADER_NAMES[profile]);
      expect(file).not.toHaveProperty("shaderRef");
      expect(Object.values(file.shaderData).every((entry: { type: string }) => entry.type !== "Texture")).toBe(true);
      const material = await engine.resourceManager.load<Material>({ url, type: AssetType.Material });
      await prepareWaterMaterial(material);
      expect(() => resolveWaterMaterialLook(material)).not.toThrow();
      expect(material.shader.name).toBe(file.shader);
      material.destroy();
    } finally {
      engine.destroy();
    }
  }
);
