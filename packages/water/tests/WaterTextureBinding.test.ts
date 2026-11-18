import { expect, it } from "vitest";
import {
  AssetType,
  BlinnPhongMaterial,
  PrimitiveMesh,
  DirectLight,
  BufferAsset,
  Camera,
  JSONAsset,
  Logger,
  Material,
  MeshRenderer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  createWaterCreationPreset,
  createWaterMaterialDefaults,
  createWaterQualitySettings,
  encodeWaterTerrainAssets,
  registerNativeWater,
  WaterBodyComponent,
  WaterSystem,
  WATER_MATERIAL_TEXTURE_SLOTS
} from "../src/water/native/index";

const boundSlot = (profile: string, index: number) =>
  profile === "ocean"
    ? [
        "material_SmoothWavesTexture",
        "material_RoughWavesTexture",
        "material_CausticsTexture",
        "material_FoamTexture",
        "material_IntersectionNoiseTexture"
      ][index]
    : index === 2
      ? "material_AppearanceV2CausticsTexture"
      : `material_AppearanceV2Detail${index}Texture`;

async function fixture(profile: "lake" | "river" | "ocean") {
  registerNativeWater();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const scene = engine.sceneManager.activeScene;
  const system = scene.createRootEntity("Water").addComponent(WaterSystem);
  system.camera = scene.createRootEntity("Camera").addComponent(Camera);
  system.camera.entity.transform.setPosition(0, 10, 12);
  system.camera.entity.transform.lookAt(new Vector3());
  const file = createWaterMaterialDefaults(profile);
  const material = await engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
  });
  const preset = createWaterCreationPreset(profile);
  const encoded = encodeWaterTerrainAssets(preset.terrain);
  const description = new JSONAsset(engine),
    heights = new BufferAsset(engine);
  description.data = encoded.description;
  heights.buffer = encoded.heights.buffer;
  const authoring = {
    shape: preset.shape,
    terrain: { mode: "asset" as const, description, heights },
    material,
    quality: createWaterQualitySettings(profile)
  };
  const body = scene.createRootEntity(profile).addComponent(WaterBodyComponent);
  body.authoring = authoring;
  await body.ready;
  await system.ready;
  const renderMaterials = () => [
    ...new Set(
      scene.rootEntities
        .flatMap((root) => root.getComponentsIncludeChildren(MeshRenderer, []))
        .filter((renderer) => system.resolveRenderOwner(renderer.entity) === body)
        .map((renderer) => renderer.getMaterial()!)
    )
  ];
  return {
    engine,
    canvas,
    scene,
    system,
    body,
    material,
    authoring,
    renderMaterials,
    async refresh() {
      engine.update();
      await body.refresh();
      await system.ready;
      await body.ready;
      engine.update();
    },
    async close() {
      await system.dispose();
      engine.destroy();
    }
  };
}

it.each(["lake", "river", "ocean"] as const)(
  "publishes %s texture bind, replace and clear through actual render materials",
  async (profile) => {
    const f = await fixture(profile);
    const errors: string[] = [];
    const original = Logger.error,
      enabled = Logger.isEnabled;
    Logger.enable();
    Logger.error = (...args) => errors.push(args.join(" "));
    try {
      expect(f.renderMaterials().length).toBeGreaterThan(0);
      for (const [index, slot] of WATER_MATERIAL_TEXTURE_SLOTS[profile].entries()) {
        const a = new Texture2D(f.engine, 4, 4, TextureFormat.R8G8B8A8, false, slot.isSRGBColorSpace);
        a.setPixelBuffer(new Uint8Array(64).fill(128));
        const b = new Texture2D(f.engine, 8, 4, TextureFormat.R8G8B8A8, false, slot.isSRGBColorSpace);
        b.setPixelBuffer(new Uint8Array(128).fill(64));
        const property = boundSlot(profile, index);
        for (const texture of [a, b, null]) {
          f.material.shaderData.setTexture(slot.slot, texture!);
          await f.refresh();
          expect(f.body.lastError).toBeUndefined();
          const materials = f.renderMaterials();
          const near = materials.filter((m) => m.name !== "Ocean Far");
          expect(near.length).toBeGreaterThan(0);
          for (const material of near) expect(material.shaderData.getTexture(property) ?? null).toBe(texture);
          if (profile === "ocean" && index === 1) {
            const far = materials.filter((m) => m.name === "Ocean Far");
            expect(far.length).toBeGreaterThan(0);
            for (const material of far) {
              expect(material.shaderData.getTexture(property)).toBeUndefined();
              const filter = material.shaderData.getVector2("material_OceanFarReflectionFilter");
              expect(filter.y > 0).toBe(texture !== null);
              expect(near[0].shaderData.getVector2("material_OceanFarReflectionFilter")).toEqual(filter);
            }
          }
          if (texture === null && profile !== "ocean" && index < 2)
            for (const material of near)
              expect(material.shaderData.getFloat(`material_AppearanceV2Detail${index}Enabled`)).toBe(0);
          if (texture === b) {
            const before = f.renderMaterials();
            b.setPixelBuffer(new Uint8Array(128).fill(200));
            f.engine.update();
            expect(f.renderMaterials()).toEqual(before);
            b.filterMode = TextureFilterMode.Point;
            await f.refresh();
            expect(b.filterMode).toBe(TextureFilterMode.Point);
            expect(f.renderMaterials().some((m) => m.shaderData.getTexture(property) === b)).toBe(true);
          }
        }
        expect(a.destroyed || b.destroyed).toBe(false);
        expect(a.refCount).toBe(0);
        expect(b.refCount).toBe(0);
      }
      expect(errors).toEqual([]);
    } finally {
      Logger.error = original;
      if (!enabled) Logger.disable();
      await f.close();
    }
  },
  120000
);

it.each(["lake", "river", "ocean"] as const)(
  "preserves authored %s bindings across quality changes and failed publication",
  async (profile) => {
    const f = await fixture(profile);
    const textures = WATER_MATERIAL_TEXTURE_SLOTS[profile].map(
      (slot) => new Texture2D(f.engine, 4, 4, undefined, false, slot.isSRGBColorSpace)
    );
    try {
      WATER_MATERIAL_TEXTURE_SLOTS[profile].forEach((slot, i) =>
        f.material.shaderData.setTexture(slot.slot, textures[i])
      );
      for (const surfaceShading of ["high", "low", "medium", "high"] as const) {
        const before = f.renderMaterials();
        const accepted = f.body.configuration;
        f.body.authoring = { ...f.authoring, quality: createWaterQualitySettings(profile, { surfaceShading }) };
        if (profile === "river" && surfaceShading !== "high") {
          await expect(f.body.ready).rejects.toThrow("River only supports High quality");
          expect(f.body.configuration).toBe(accepted);
          expect(f.body.authoring!.quality.surfaceShading).toBe(surfaceShading);
          expect(f.renderMaterials()).toEqual(before);
          for (const [index, slot] of WATER_MATERIAL_TEXTURE_SLOTS.river.entries()) {
            expect(f.material.shaderData.getTexture(slot.slot)).toBe(textures[index]);
            expect(before.every((m) => m.shaderData.getTexture(boundSlot(profile, index)) === textures[index])).toBe(
              true
            );
          }
          continue;
        }
        await f.body.ready;
        await f.system.ready;
        f.engine.update();
        WATER_MATERIAL_TEXTURE_SLOTS[profile].forEach((slot, i) =>
          expect(f.material.shaderData.getTexture(slot.slot)).toBe(textures[i])
        );
        const near = f.renderMaterials().filter((m) => m.name !== "Ocean Far");
        expect(near.length).toBeGreaterThan(0);
        expect(near.some((m) => m.shaderData.getTexture(boundSlot(profile, 0)) === textures[0])).toBe(true);
        if (surfaceShading === "high")
          textures.forEach((texture, i) =>
            expect(near.some((m) => m.shaderData.getTexture(boundSlot(profile, i)) === texture)).toBe(true)
          );
      }
      const published = f.renderMaterials();
      const invalid = new Texture2D(f.engine, 4, 4, undefined, false, true);
      f.material.shaderData.setTexture(WATER_MATERIAL_TEXTURE_SLOTS[profile][0].slot, invalid);
      await expect(f.body.refresh()).rejects.toThrow("linear");
      expect(f.renderMaterials()).toEqual(published);
      expect(published.some((m) => m.shaderData.getTexture(boundSlot(profile, 0)) === textures[0])).toBe(true);
      f.material.shaderData.setTexture(WATER_MATERIAL_TEXTURE_SLOTS[profile][0].slot, textures[0]);
      await f.refresh();
      await f.body.dispose();
      expect(textures.every((texture) => !texture.destroyed)).toBe(true);
    } finally {
      await f.close();
    }
  },
  120000
);

it.each(["lake", "river", "ocean"] as const)(
  "changes rendered %s pixels for each authored texture slot",
  async (profile) => {
    const f = await fixture(profile);
    const evidence: { slot: string; replacementPixels: number; clearedPixels: number }[] = [];
    try {
      f.engine.time.timeScale = 0;
      if (profile === "river") {
        f.body.authoring = { ...f.authoring, shape: { ...f.authoring.shape, speed: 1 } as any };
        await f.body.ready;
        await f.system.ready;
      }
      const light = f.scene.createRootEntity("Sun").addComponent(DirectLight);
      light.entity.transform.setRotation(-60, 20, 0);
      light.intensity = 1.5;
      f.scene.sun = light;
      if (profile === "river") {
        f.material.shaderData.setFloat("material_AppearanceV2DetailNormalStrength", 1);
        f.material.shaderData.setFloat("material_Water_appearance_appearance_detailLayers_1_strength", 1);
      }
      const ground = f.scene.createRootEntity("Visible bed");
      ground.transform.setPosition(0, -0.15, 0);
      const renderer = ground.addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createPlane(f.engine, 100, 100);
      const groundMaterial = new BlinnPhongMaterial(f.engine);
      groundMaterial.baseColor.set(0.55, 0.48, 0.3, 1);
      renderer.setMaterial(groundMaterial);
      const gl = f.canvas.getContext("webgl2")!;
      const render = () => {
        f.engine.update();
        const data = new Uint8Array(64 * 64 * 4);
        gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, data);
        expect(gl.getError()).toBe(0);
        return data;
      };
      const different = (a: Uint8Array, b: Uint8Array) => {
        let pixels = 0;
        for (let i = 0; i < a.length; i += 4)
          if (Math.max(...[0, 1, 2].map((c) => Math.abs(a[i + c] - b[i + c]))) > 1) pixels++;
        return pixels;
      };
      for (const slot of WATER_MATERIAL_TEXTURE_SLOTS[profile]) {
        const texture = new Texture2D(f.engine, 4, 4, TextureFormat.R8G8B8A8, false, slot.isSRGBColorSpace);
        const flat = slot.group === "normal" ? [128, 128, 255, 255] : [0, 0, 0, 255];
        const changed = slot.group === "normal" ? [245, 90, 160, 255] : [255, 255, 255, 255];
        texture.setPixelBuffer(new Uint8Array(Array.from({ length: 16 }, () => flat).flat()));
        f.material.shaderData.setTexture(slot.slot, texture);
        await f.refresh();
        for (let frame = 0; frame < 4; frame++) render();
        const before = render();
        expect(different(before, render()), `${slot.slot} unchanged-frame control`).toBe(0);
        texture.setPixelBuffer(new Uint8Array(Array.from({ length: 16 }, () => changed).flat()));
        const after = render();
        expect(different(after, render()), `${slot.slot} updated-frame control`).toBe(0);
        if (import.meta.env.WATER_PIXEL_EVIDENCE)
          await fetch("/__water-evidence", {
            method: "POST",
            body: JSON.stringify({
              name: `${profile}-${slot.group}-${evidence.length}-bound`,
              data: f.canvas.toDataURL()
            })
          });
        f.material.shaderData.setTexture(slot.slot, null);
        await f.refresh();
        const empty = render();
        expect(different(empty, render()), `${slot.slot} cleared-frame control`).toBe(0);
        if (import.meta.env.WATER_PIXEL_EVIDENCE)
          await fetch("/__water-evidence", {
            method: "POST",
            body: JSON.stringify({
              name: `${profile}-${slot.group}-${evidence.length}-empty`,
              data: f.canvas.toDataURL()
            })
          });
        evidence.push({
          slot: slot.slot,
          replacementPixels: different(before, after),
          clearedPixels: different(after, empty)
        });
        texture.destroy();
      }
      console.log("water-pixel-evidence", profile, JSON.stringify(evidence));
      for (const result of evidence) {
        expect(result.replacementPixels, result.slot).toBeGreaterThan(0);
        expect(result.clearedPixels, result.slot).toBeGreaterThan(0);
      }
    } finally {
      await f.close();
    }
  },
  120000
);

it("refreshes every consumer of a shared Material on the next frame and preserves independent bindings", async () => {
  const f = await fixture("lake");
  try {
    const slot = WATER_MATERIAL_TEXTURE_SLOTS.lake[0].slot;
    const oldTexture = new Texture2D(f.engine, 4, 4, undefined, false, false);
    const nextTexture = new Texture2D(f.engine, 4, 4, undefined, false, false);
    const staleTexture = new Texture2D(f.engine, 4, 4, undefined, false, false);
    const latestTexture = new Texture2D(f.engine, 4, 4, undefined, false, false);
    f.material.shaderData.setTexture(slot, oldTexture);
    await f.refresh();
    const shared = f.scene.createRootEntity("Shared material body").addComponent(WaterBodyComponent);
    shared.authoring = f.authoring;
    await shared.ready;
    const independentMaterial = f.material.clone();
    const independent = f.scene.createRootEntity("Independent material body").addComponent(WaterBodyComponent);
    independent.authoring = { ...f.authoring, material: independentMaterial };
    await independent.ready;
    const materialFor = (body: WaterBodyComponent) =>
      f.scene.rootEntities
        .flatMap((root) => root.getComponentsIncludeChildren(MeshRenderer, []))
        .find((renderer) => f.system.resolveRenderOwner(renderer.entity) === body)
        ?.getMaterial();
    const textureFor = (body: WaterBodyComponent) =>
      materialFor(body)?.shaderData.getTexture("material_AppearanceV2Detail0Texture");
    f.material.shaderData.setTexture(slot, nextTexture);
    f.engine.update();
    await expect.poll(() => textureFor(f.body)).toBe(nextTexture);
    await expect.poll(() => textureFor(shared)).toBe(nextTexture);
    expect(textureFor(independent)).toBe(oldTexture);
    const previousMaterials = [materialFor(f.body), materialFor(shared)];
    nextTexture.filterMode = TextureFilterMode.Point;
    f.engine.update();
    await expect
      .poll(() => {
        f.engine.update();
        return materialFor(f.body) !== previousMaterials[0];
      })
      .toBe(true);
    await expect.poll(() => materialFor(shared) !== previousMaterials[1]).toBe(true);
    expect(textureFor(f.body)).toBe(nextTexture);
    expect(textureFor(shared)).toBe(nextTexture);
    expect(textureFor(independent)).toBe(oldTexture);
    expect(nextTexture.filterMode).toBe(TextureFilterMode.Point);
    const previousReady = f.body.ready;
    f.material.shaderData.setTexture(slot, staleTexture);
    f.engine.update();
    for (let turn = 0; turn < 30 && f.body.ready === previousReady; turn++) await Promise.resolve();
    expect(f.body.ready).not.toBe(previousReady);
    const candidate = f.body.ready;
    expect(textureFor(f.body)).toBe(nextTexture);
    f.material.shaderData.setTexture(slot, latestTexture);
    await expect(candidate).rejects.toThrow("stale");
    expect(textureFor(f.body)).not.toBe(staleTexture);
    expect(textureFor(shared)).not.toBe(staleTexture);
    await expect
      .poll(() => {
        f.engine.update();
        return textureFor(f.body);
      })
      .toBe(latestTexture);
    await expect.poll(() => textureFor(shared)).toBe(latestTexture);
    expect(nextTexture.refCount).toBe(0);
    expect(staleTexture.refCount).toBe(0);
    expect(textureFor(independent)).toBe(oldTexture);
    f.material.shaderData.setTexture(slot, null);
    f.engine.update();
    await expect.poll(() => textureFor(f.body)).toBeNull();
    await expect.poll(() => textureFor(shared)).toBeNull();
    expect(textureFor(independent)).toBe(oldTexture);
    expect(oldTexture.destroyed || nextTexture.destroyed).toBe(false);
    await f.system.dispose();
    await f.system.dispose();
    await Promise.all([f.body.dispose(), shared.dispose(), independent.dispose()]);
    expect(oldTexture.refCount).toBe(0);
    expect(nextTexture.refCount).toBe(0);
    expect(staleTexture.refCount).toBe(0);
    expect(latestTexture.refCount).toBe(0);
    expect([oldTexture, nextTexture, staleTexture, latestTexture].every((texture) => !texture.destroyed)).toBe(true);
  } finally {
    await f.close();
  }
}, 60000);
