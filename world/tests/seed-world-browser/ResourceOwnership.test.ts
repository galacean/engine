import { expect, it, vi } from "vitest";
import {
  AmbientLight,
  AssetPromise,
  AssetType,
  ResourceManager,
  Texture2D,
  TextureCube,
  TextureWrapMode,
  WebGLEngine
} from "@galacean/engine";

it("preserves loader cancellation and progress when a virtual texture specifies sampler overrides", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const rm = engine.resourceManager;
  const path = "Textures/seed.ktx2";
  const cancel = vi.fn();
  let progress: (loaded: number, total: number) => void;
  const pending = new AssetPromise<Texture2D>((_resolve, _reject, setComplete, _setDetail, onCancel) => {
    progress = setComplete;
    onCancel(cancel);
  });
  const load = vi.spyOn(ResourceManager._loaders[AssetType.Texture], "load").mockReturnValueOnce(pending);
  try {
    const texture = new Texture2D(engine, 1, 1);
    rm.registerVirtualResources([
      {
        virtualPath: path,
        path: "blob:https://example.org/seed-texture",
        type: AssetType.Texture,
        params: { wrapModeU: TextureWrapMode.Mirror }
      }
    ]);
    const request = rm.load<Texture2D>(path);
    const onProgress = vi.fn();
    request.onProgress(onProgress);
    progress!(1, 2);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    rm.cancelNotLoaded(path);
    await expect(request).rejects.toBe("canceled");
    expect(cancel).toHaveBeenCalledOnce();
    expect(rm.getFromCache(path)).toBeNull();

    load.mockReturnValueOnce(AssetPromise.resolve(texture));
    expect(await rm.load(path)).toBe(texture);
    expect(texture.wrapModeU).toBe(TextureWrapMode.Mirror);
    expect(rm.getFromCache(path)).toBe(texture);
  } finally {
    load.mockRestore();
    engine.destroy();
  }
});

it("retains both environment cubes and releases their scene bindings on replacement and destruction", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const scene = engine.sceneManager.activeScene;
    const ambient = new AmbientLight(engine);
    const primary = new TextureCube(engine, 4);
    const secondary = new TextureCube(engine, 4);
    ambient.specularTexture = primary;
    ambient.secondarySpecularTexture = secondary;
    scene.ambientLight = ambient;
    engine.resourceManager.gc();
    expect(primary.destroyed).toBe(false);
    expect(secondary.destroyed).toBe(false);
    expect(scene.shaderData.getTexture("scene_EnvSpecularSampler2")).toBe(secondary);

    ambient.secondarySpecularTexture = primary;
    engine.resourceManager.gc();
    expect(secondary.destroyed).toBe(true);
    expect(primary.destroyed).toBe(false);
    ambient.destroy(true);
    expect(primary.refCount).toBe(0);
    expect(scene.shaderData.getTexture("scene_EnvSpecularSampler")).toBeNull();
    expect(scene.shaderData.getTexture("scene_EnvSpecularSampler2")).toBeNull();
    expect(scene.shaderData.getMacros().some((macro) => macro.name === "SCENE_USE_SPECULAR_ENV_BLEND")).toBe(false);
    engine.resourceManager.gc();
    expect(primary.destroyed).toBe(true);
  } finally {
    engine.destroy();
  }
});
