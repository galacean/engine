import { expect, it } from "vitest";
import { Texture2D, TextureFormat, UnlitMaterial, WebGLEngine } from "@galacean/engine";
import { prepareWaterMaterial, waterMaterialFactories } from "../src/water/native/WaterMaterial";

it("releases a borrowed native texture without destroying its asset", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const texture = new Texture2D(engine, 8, 8);
    engine.resourceManager._addAsset("data:application/octet-stream;base64,AA==#borrowed", texture);
    const material = new UnlitMaterial(engine);
    material.baseTexture = texture;
    await prepareWaterMaterial(material);
    const factory = waterMaterialFactories(material)[0];
    const before = texture.refCount;
    const resource = await factory.load({ signal: new AbortController().signal } as any);
    expect(texture.refCount).toBe(before + 1);
    await factory.destroy!(resource);
    expect(texture.refCount).toBe(before);
    expect(texture.destroyed).toBe(false);
    material.destroy();
  } finally {
    engine.destroy();
  }
});

it("keeps different mip chains out of the same native Water resource cache entry", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const materials: UnlitMaterial[] = [];
  try {
    const ids: string[] = [];
    for (const mipmap of [true, false, true]) {
      const texture = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8, mipmap, false);
      // Both resources address identical bytes. Only the generated mip chain differs.
      engine.resourceManager._addAsset(`data:application/octet-stream;base64,AA==#${mipmap}`, texture);
      const material = new UnlitMaterial(engine);
      materials.push(material);
      material.baseTexture = texture;
      await prepareWaterMaterial(material);
      ids.push(waterMaterialFactories(material)[0].descriptor.id);
    }
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toBe(ids[2]);
  } finally {
    materials.forEach((material) => material.destroy());
    engine.destroy();
  }
});
