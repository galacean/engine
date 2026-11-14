import {
  AssetType,
  Material,
  Shader,
  Texture2D,
  TextureCube,
  TextureFilterMode,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { expect, it } from "vitest";
import { registerWaterBuiltinShaders } from "../src/water/native/WaterBuiltinShaders";
import {
  WATER_MATERIAL_TEXTURE_SLOTS,
  createWaterMaterialDefaults,
  prepareWaterMaterial,
  resolveWaterMaterialLook,
  resolveWaterMaterialFileLook,
  waterMaterialFactories,
  waterMaterialKey,
  waterMaterialTextures
} from "../src/water/native/WaterMaterial";
import { WaterRuntimeResourceRegistry } from "../src/water/runtime/resources/WaterRuntimeResourceRegistry";
import { BUILTIN_WATER_PROJECT_URL } from "../src/water/native/WaterBuiltinAssets";

async function materialFor(engine: WebGLEngine, profile: "lake" | "river" | "ocean") {
  registerWaterBuiltinShaders();
  const file = createWaterMaterialDefaults(profile);
  file.name += `/${crypto.randomUUID()}`;
  return engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
  });
}

it.each(["lake", "river", "ocean"] as const)(
  "keeps %s defaults empty and accepts every ordinary native texture slot",
  async (profile) => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const material = await materialFor(engine, profile);
      const empty = waterMaterialKey(material);
      await prepareWaterMaterial(material);
      expect(waterMaterialTextures(material)).toHaveLength(0);
      expect(waterMaterialFactories(material)).toHaveLength(0);
      expect(() => resolveWaterMaterialLook(material)).not.toThrow();
      for (const slot of WATER_MATERIAL_TEXTURE_SLOTS[profile]) {
        const a = new Texture2D(engine, 7, 5, TextureFormat.R8G8B8A8, false, slot.isSRGBColorSpace);
        const b = new Texture2D(engine, 3, 9, TextureFormat.R8G8B8A8, false, slot.isSRGBColorSpace);
        material.shaderData.setTexture(slot.slot, a);
        await prepareWaterMaterial(material);
        expect(waterMaterialTextures(material)[0].texture).toBe(a);
        const key = waterMaterialKey(material);
        expect(key).not.toBe(empty);
        a.filterMode = TextureFilterMode.Point;
        expect(waterMaterialKey(material)).not.toBe(key);
        material.shaderData.setTexture(slot.slot, b);
        expect(waterMaterialTextures(material)[0].texture).toBe(b);
        expect(waterMaterialKey(material)).not.toBe(key);
        material.shaderData.setTexture(slot.slot, null!);
        await prepareWaterMaterial(material);
        expect(waterMaterialKey(material)).toBe(empty);
        expect(waterMaterialTextures(material)).toHaveLength(0);
        expect(a.destroyed || b.destroyed).toBe(false);
      }
    } finally {
      engine.destroy();
    }
  }
);

it("loads a normal PNG through the ordinary Texture2D and Material reference pipeline, including null", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    registerWaterBuiltinShaders();
    const canvas = document.createElement("canvas");
    canvas.width = 7;
    canvas.height = 3;
    canvas.getContext("2d")!.fillRect(0, 0, 7, 3);
    engine.resourceManager.registerVirtualResources([
      {
        virtualPath: "custom.png",
        path: canvas.toDataURL(),
        type: AssetType.Texture2D,
        params: { isSRGBColorSpace: false, mipmap: false }
      }
    ]);
    const file = createWaterMaterialDefaults("lake");
    const slot = WATER_MATERIAL_TEXTURE_SLOTS.lake[0].slot;
    file.shaderData[slot].value = { url: "custom.png" };
    expect(() => resolveWaterMaterialFileLook(file)).not.toThrow();
    const material = await engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
    });
    await prepareWaterMaterial(material);
    const texture = material.shaderData.getTexture(slot) as Texture2D;
    expect([texture.width, texture.height, texture.mipmapCount]).toEqual([7, 3, 1]);
    expect(waterMaterialTextures(material)[0].texture).toBe(texture);
    file.shaderData[slot].value = "not-a-native-reference";
    expect(() => resolveWaterMaterialFileLook(file)).toThrow(slot);
  } finally {
    engine.destroy();
  }
});

it("validates color space, texture kind and ownership without mutating shared sampling", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const other = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const material = await materialFor(engine, "lake");
    const slot = WATER_MATERIAL_TEXTURE_SLOTS.lake[0].slot;
    const bad = [
      new Texture2D(engine, 2, 2),
      new TextureCube(engine, 2),
      new Texture2D(other, 2, 2, undefined, false, false)
    ];
    for (const texture of bad) {
      material.shaderData.setTexture(slot, texture);
      await expect(prepareWaterMaterial(material)).rejects.toThrow(slot);
    }
    material.shaderData.setInt("material_WaterRiverDrops", 1);
    await expect(prepareWaterMaterial(material)).rejects.toThrow("NOT_SUPPORTED");
    expect(() => createWaterMaterialDefaults("river", true)).toThrow("NOT_SUPPORTED");
  } finally {
    engine.destroy();
    other.destroy();
  }
});

it("shares native references while releasing retired leases without destroying the caller's texture", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const registry = new WaterRuntimeResourceRegistry();
  try {
    const a = await materialFor(engine, "lake"),
      b = await materialFor(engine, "lake");
    const texture = new Texture2D(engine, 4, 4, undefined, false, false);
    const slot = WATER_MATERIAL_TEXTURE_SLOTS.lake[0].slot;
    a.shaderData.setTexture(slot, texture);
    b.shaderData.setTexture(slot, texture);
    const factory = waterMaterialFactories(a)[0];
    registry.ensureRegistered(factory);
    const first = await registry.acquire<{ texture: Texture2D }>(factory.descriptor);
    const second = await registry.acquire<{ texture: Texture2D }>(factory.descriptor);
    expect(first!.resource.texture).toBe(texture);
    expect(second!.resource.texture).toBe(texture);
    expect(texture.refCount).toBe(1);
    await first!.destroy();
    await first!.destroy();
    expect(texture.refCount).toBe(1);
    await second!.destroy();
    expect(texture.refCount).toBe(0);
    expect(texture.destroyed).toBe(false);
    expect(b.shaderData.getTexture(slot)).toBe(texture);
    await registry.destroy();
    expect(texture.destroyed).toBe(false);
    a.destroy();
    b.destroy();
  } finally {
    await registry.destroy();
    engine.destroy();
  }
});

it.each(["lake", "river", "ocean"] as const)(
  "invalidates %s when an equal-named Shader is replaced",
  async (profile) => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const material = await materialFor(engine, profile),
        original = material.shader,
        key = waterMaterialKey(material);
      const replacement = Shader.create(original.name, [...original.subShaders]);
      material.shader = replacement;
      expect(waterMaterialKey(material)).not.toBe(key);
      material.shader = original;
      replacement.destroy();
      expect(waterMaterialKey(material)).toBe(key);
    } finally {
      engine.destroy();
    }
  }
);

it("loads only the eight explicitly referenced example textures, with all ten slots", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    registerWaterBuiltinShaders();
    const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
    const files = manifest.files.map((file: any) => ({
      ...file,
      path: new URL(file.path, BUILTIN_WATER_PROJECT_URL).href
    }));
    expect(files.filter((file: any) => file.type === "KTX2")).toHaveLength(8);
    expect(files.some((file: any) => file.virtualPath.includes("river-drops"))).toBe(false);
    engine.resourceManager.registerVirtualResources(files);
    const resources = new Set<Texture2D>();
    for (const profile of ["lake", "river", "ocean"] as const) {
      const file = await (await fetch(new URL(`Water/Materials/${profile}.mat`, BUILTIN_WATER_PROJECT_URL))).json();
      for (const { slot } of WATER_MATERIAL_TEXTURE_SLOTS[profile])
        file.shaderData[slot].value = { url: file.shaderData[slot].value.url };
      const material = await engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
      });
      await prepareWaterMaterial(material);
      for (const { texture } of waterMaterialTextures(material)) resources.add(texture);
    }
    expect(resources.size).toBe(8);
  } finally {
    engine.destroy();
  }
}, 60000);
