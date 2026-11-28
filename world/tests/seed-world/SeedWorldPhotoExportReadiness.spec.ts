import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const source = ts.createSourceFile(
  "PhotoGraphics.ts",
  readFileSync(
    new URL("../../../packages/world-planning/src/world/SeedWorldPhotoGraphics.ts", import.meta.url),
    "utf8"
  ),
  ts.ScriptTarget.Latest,
  true
);
const declaration = source.statements.find(
  (n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "exportPhotoImage"
)!;
const code = ts.transpileModule(declaration.getText(source).replace("export ", "") + "\nreturn exportPhotoImage;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
function fixture() {
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => (finish = resolve));
  const release = vi.fn(),
    destroy = vi.fn(),
    render = vi.fn(),
    read = vi.fn(async () => {});
  const engine = { sceneManager: { addScene: vi.fn(), removeScene: vi.fn() } };
  class Resource {
    destroyed = false;
    destroy() {
      this.destroyed = true;
      destroy();
    }
    getPixelBufferAsync = read;
    setPositions() {}
    setUVs() {}
    setIndices() {}
    addSubMesh() {}
    uploadData() {}
    bounds = { min: { set() {} }, max: { set() {} } };
  }
  const camera = { render };
  class Scene {
    ambientLight = new Resource();
    rootEntities = [];
    createRootEntity(name: string) {
      return {
        transform: { setPosition() {} },
        addComponent: () => (name === "Export view" ? camera : { setMaterial() {}, setMaterials() {} })
      };
    }
    destroy = destroy;
  }
  const warmup = vi.fn(async (_engine, _scene, _camera, _roots, options) => {
    await waiting;
    options.signal?.throwIfAborted();
  });
  const dependencies = {
    Scene,
    Camera: class {},
    Texture2D: Resource,
    TextureFormat: { R8G8B8A8: 0, Depth24Stencil8: 1 },
    RenderTarget: Resource,
    ModelMesh: Resource,
    Vector3: class {},
    Vector2: class {},
    MeshRenderer: class {},
    Color: class {},
    flatMaterial: () => new Resource(),
    strokeMesh: () => new Resource(),
    inkColor: () => ({}),
    warmupSeedWorldRendererVariants: warmup,
    destroyOwnedMesh: (r: Resource) => r.destroy(),
    destroyPhotoResources: (rs: Resource[], end: () => void) => {
      rs.forEach((r) => r?.destroy());
      end();
    },
    encodeImage: vi.fn(async () => ({ mimeType: "image/jpeg", data: "pixels" })),
    document: {
      createElement: () => ({
        getContext: () => ({ createImageData: () => ({ data: new Uint8Array(16) }), putImageData() {} })
      })
    }
  };
  const capture = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return {
    capture: (signal?: AbortSignal) =>
      capture({ texture: { engine }, width: 2, height: 2 }, [], { reserve: () => release }, signal),
    engine,
    warmup,
    finish,
    render,
    read,
    release,
    destroy
  };
}
it("does not expose or render the export scene until the exact programs are ready", async () => {
  const f = fixture(),
    result = f.capture();
  expect(f.warmup).toHaveBeenCalledOnce();
  expect(f.engine.sceneManager.addScene).not.toHaveBeenCalled();
  expect(f.render).not.toHaveBeenCalled();
  f.finish();
  await expect(result).resolves.toEqual({ mimeType: "image/jpeg", data: "pixels" });
  expect(f.render).toHaveBeenCalledOnce();
  expect(f.read).toHaveBeenCalledOnce();
  expect(f.release).toHaveBeenCalledOnce();
});
it("releases export resources and its image budget when cancelled during program preparation", async () => {
  const f = fixture(),
    controller = new AbortController(),
    pending = f.capture(controller.signal);
  controller.abort(new Error("cancelled export"));
  f.finish();
  await expect(pending).rejects.toThrow("cancelled export");
  expect(f.render).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  expect(f.engine.sceneManager.addScene).not.toHaveBeenCalled();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.destroy).toHaveBeenCalled();
});
