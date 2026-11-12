import {
  AssetPromise,
  AssetType,
  Loader,
  ResourceManager,
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureWrapMode,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { KTX2Loader, KTX2TargetFormat } from "@galacean/engine-loader";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

let engine: WebGLEngine;
let serial = 0;
const loaderType = "ResourceLoadingCompatibility";

beforeAll(async () => {
  engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
});
afterEach(() => {
  delete ResourceManager._loaders[loaderType];
  vi.restoreAllMocks();
});
afterAll(() => engine.destroy());

function controlledLoad() {
  let resolve!: (texture: Texture2D) => void;
  let complete!: (loaded: number, total: number) => void;
  let detail!: (url: string, loaded: number, total: number) => void;
  const cancel = vi.fn();
  const pending = new AssetPromise<Texture2D>((yes, _no, progress, resourceProgress, onCancel) => {
    resolve = yes;
    complete = progress;
    detail = resourceProgress;
    onCancel(cancel);
  });
  ResourceManager._loaders[loaderType] = { useCache: true, load: () => pending } as Loader<Texture2D>;
  return { resolve, complete, detail, cancel, url: `compatibility/resource-${serial++}` };
}

it("forwards load progress and publishes sampler overrides before returning or caching a texture", async () => {
  const load = controlledLoad();
  const manager = engine.resourceManager;
  const complete = vi.fn(),
    detail = vi.fn();
  load.complete(1, 4);
  const task = manager
    .load<Texture2D>({
      type: loaderType,
      url: load.url,
      params: { wrapModeU: TextureWrapMode.Clamp, filterMode: TextureFilterMode.Point }
    })
    .onProgress(complete, detail);
  load.complete(2, 4);
  load.detail("texture.bin", 20, 40);
  const texture = new Texture2D(engine, 1, 1);
  try {
    load.resolve(texture);
    expect(await task).toBe(texture);
    expect(complete.mock.calls).toEqual([
      [1, 4],
      [2, 4]
    ]);
    expect(detail).toHaveBeenCalledWith("texture.bin", 20, 40);
    expect(texture.wrapModeU).toBe(TextureWrapMode.Clamp);
    expect(texture.filterMode).toBe(TextureFilterMode.Point);
    expect(manager.getFromCache(load.url)).toBe(texture);
  } finally {
    texture.destroy();
  }
});

it.each(["promise", "manager"] as const)("forwards %s cancellation to the original loader", async (through) => {
  const load = controlledLoad();
  const manager = engine.resourceManager;
  const task = manager.load<Texture2D>({ type: loaderType, url: load.url });
  const rejected = expect(task).rejects.toBe("canceled");
  if (through === "promise") task.cancel();
  else manager.cancelNotLoaded(load.url);
  await rejected;
  expect(load.cancel).toHaveBeenCalledOnce();
  expect(manager.getFromCache(load.url)).toBeNull();
  expect(manager["_loadingPromises"][load.url]).toBeUndefined();
});

it.each([0, 1, 2])(
  "preserves KTX2 sampler edits and decoded pixels on content restore (layers=%i)",
  async (layerCount) => {
    const manager = engine.resourceManager;
    const pixels = new Uint8Array(Math.max(1, layerCount) * 4);
    for (let layer = 0; layer < Math.max(1, layerCount); layer++) {
      pixels.set([10 + layer, 20, 30, 255], layer * 4);
    }
    // Supply decoded data locally; exercise the real loader, texture upload and restorer
    // without making this regression depend on an external transcoder download.
    vi.spyOn(manager, "_requestByRemoteUrl").mockImplementation(() => AssetPromise.resolve(new ArrayBuffer(0)));
    vi.spyOn(KTX2Loader, "_parseBuffer").mockResolvedValue({
      engine,
      ktx2Container: { isSRGB: false, layerCount },
      result: {
        width: 1,
        height: 1,
        hasAlpha: true,
        format: 0,
        faceCount: 1,
        faces: [[{ width: 1, height: 1, data: pixels }]]
      },
      targetFormat: KTX2TargetFormat.R8G8B8A8,
      params: new Uint8Array([TextureWrapMode.Repeat, TextureWrapMode.Clamp, TextureFilterMode.Bilinear, 1])
    } as Awaited<ReturnType<typeof KTX2Loader._parseBuffer>>);
    const texture = await manager.load<Texture2D | Texture2DArray>({
      type: AssetType.KTX2,
      url: `compatibility/array-${serial++}.ktx2`,
      params: { wrapModeU: TextureWrapMode.Mirror, filterMode: TextureFilterMode.Point }
    });
    try {
      expect(texture instanceof Texture2DArray).toBe(layerCount > 0);
      expect(texture.wrapModeU).toBe(TextureWrapMode.Mirror);
      expect(texture.wrapModeV).toBe(TextureWrapMode.Clamp);
      expect(texture.filterMode).toBe(TextureFilterMode.Point);
      texture.wrapModeU = TextureWrapMode.Clamp;
      const restorer = manager["_contentRestorerPool"][texture.instanceId];
      expect(restorer).toBeDefined();
      await restorer.restoreContent();
      expect(texture.wrapModeU).toBe(TextureWrapMode.Clamp);
      expect(texture.wrapModeV).toBe(TextureWrapMode.Clamp);
      expect(texture.filterMode).toBe(TextureFilterMode.Point);
      for (let layer = 0; layer < Math.max(1, layerCount); layer++) {
        const actual = new Uint8Array(4);
        if (texture instanceof Texture2DArray) texture.getPixelBuffer(layer, actual);
        else texture.getPixelBuffer(actual);
        expect(Array.from(actual)).toEqual([10 + layer, 20, 30, 255]);
      }
    } finally {
      texture.destroy();
    }
  }
);
