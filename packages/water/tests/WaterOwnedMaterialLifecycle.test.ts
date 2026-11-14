import { expect, it, vi } from "vitest";
import { Camera, Material, MeshRenderer, Script, Shader, Texture2D, WebGLEngine } from "@galacean/engine";
import { RiverRuntimeController } from "../src/water/runtime/river/RiverRuntimeController";
import { destroyWaterOwnedMaterial } from "../src/water/runtime/resources/destroyWaterOwnedMaterial";

it.each([false, true])(
  "releases texture and Shader borrows when retiring a private material (in frame: %s)",
  async (inFrame) => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const scene = engine.sceneManager.activeScene!;
      scene.createRootEntity("Camera").addComponent(Camera);
      const root = scene.createRootEntity("Owned water renderers");
      const shader = Shader.create("owned-water-test", [...Shader.find("Unlit")!.subShaders]);
      const baseline = shader._getReferCount();
      const texture = new Texture2D(engine, 2, 2);
      const author = new Material(engine, shader);
      author.shaderData.setTexture("material_BaseTexture", texture);
      // A different owner is still using the caller's material and texture.
      const external = scene.createRootEntity("Another material user").addComponent(MeshRenderer);
      external.setMaterial(author);
      const owned = new Material(engine, shader);
      owned.shaderData.setTexture("material_BaseTexture", texture);
      root.addComponent(MeshRenderer).setMaterial(owned);
      root.createChild("Second renderer").addComponent(MeshRenderer).setMaterial(owned);
      expect(texture.refCount).toBe(3);
      const retire = () => {
        destroyWaterOwnedMaterial(owned, root);
        destroyWaterOwnedMaterial(owned, root);
        root.destroy();
      };
      if (inFrame) {
        class RetireInFrame extends Script {
          override onUpdate() {
            this.enabled = false;
            retire();
          }
        }
        scene.createRootEntity("Retire").addComponent(RetireInFrame);
        engine.update();
      } else retire();
      expect(texture.refCount).toBe(1);
      expect(texture.destroyed).toBe(false);
      expect(author.shaderData.getTexture("material_BaseTexture")).toBe(texture);
      expect(shader._getReferCount()).toBe(baseline + 1);
      external.setMaterial(null);
      author.destroy();
      expect(texture.refCount).toBe(0);
      expect(shader._getReferCount()).toBe(baseline);
      expect(texture.destroyed).toBe(false);
    } finally {
      engine.destroy();
    }
  }
);

it.each([false, true])("releases a River material batch and Junction borrows (in frame: %s)", async (inFrame) => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const scene = engine.sceneManager.activeScene!;
    scene.createRootEntity("Camera").addComponent(Camera);
    const root = scene.createRootEntity("River runtime");
    const controller = new RiverRuntimeController(engine, root);
    const shader = Shader.create("river-batch-test", [...Shader.find("Unlit")!.subShaders]);
    const baseline = shader._getReferCount();
    const texture = new Texture2D(engine, 2, 2);
    const author = new Material(engine, shader);
    author.shaderData.setTexture("material_BaseTexture", texture);
    const unrelated = new Material(engine, shader);
    const external = scene.createRootEntity("Author user").addComponent(MeshRenderer);
    external.setMaterial(author);
    const reaches = [0, 1].map((index) => {
      const reachRoot = root.createChild(`Reach ${index}`);
      const surface = new Material(engine, shader),
        surfaceLocalMap = new Material(engine, shader);
      for (const material of [surface, surfaceLocalMap])
        material.shaderData.setTexture("material_BaseTexture", texture);
      reachRoot.addComponent(MeshRenderer).setMaterials([surface, surfaceLocalMap]);
      return { root: reachRoot, materials: { surface, surfaceLocalMap } };
    });
    const junction = root.createChild("Junction").addComponent(MeshRenderer);
    junction.setMaterials([reaches[0].materials.surfaceLocalMap, author, unrelated]);
    const scan = vi.spyOn(root, "getComponentsIncludeChildren");
    expect(texture.refCount).toBe(7);
    const retire = () => {
      // Real native resource/refcount behavior, with no shader/mesh construction involved.
      (controller as any)._destroyReachMaterials(reaches, root);
      expect(scan).toHaveBeenCalledTimes(1);
      expect(junction.getMaterials()).toEqual([null, author, unrelated]);
      expect(texture.refCount).toBe(2);
      expect(shader._getReferCount()).toBe(baseline + 3);
      for (const reach of reaches)
        for (const material of Object.values(reach.materials)) {
          expect(material.refCount).toBe(0);
          expect(material.pendingDestroy).toBe(inFrame);
          expect(material.destroyed).toBe(!inFrame);
        }
      root.destroy();
    };
    if (inFrame) {
      class RetireInFrame extends Script {
        override onUpdate() {
          this.enabled = false;
          retire();
        }
      }
      scene.createRootEntity("Retire").addComponent(RetireInFrame);
      engine.update();
    } else retire();
    for (const reach of reaches)
      for (const material of Object.values(reach.materials)) {
        expect(material.pendingDestroy).toBe(false);
        expect(material.destroyed).toBe(true);
      }
    expect(texture.refCount).toBe(1);
    expect(texture.destroyed).toBe(false);
    expect(author.destroyed).toBe(false);
    expect(unrelated.destroyed).toBe(false);
    expect(shader._getReferCount()).toBe(baseline + 1);
    external.setMaterial(null);
    author.destroy();
    unrelated.destroy();
    expect(texture.refCount).toBe(0);
    expect(shader._getReferCount()).toBe(baseline);
    shader.destroy();
  } finally {
    engine.destroy();
  }
});

it("rolls back textures and Shader borrows when Ocean construction fails after material creation", async () => {
  const { ShaderCompiler } = await import("@galacean/engine-shader-compiler");
  const { compileWaterShape, createWaterCreationPreset, registerNativeWater } = await import(
    "../src/water/native/index"
  );
  const { OceanNearshoreCompiler } = await import("../src/water/compiler/ocean/OceanNearshoreCompiler");
  const { OceanNearshoreFieldResource } = await import("../src/water/runtime/ocean/OceanNearshoreFieldResource");
  const { OceanWaterRuntimeController } = await import("../src/water/runtime/ocean/OceanWaterRuntimeController");
  const { describeOceanTextures } = await import("../src/water/runtime/ocean/OceanTextures");
  registerNativeWater();
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
  try {
    const preset = createWaterCreationPreset("ocean");
    const asset = compileWaterShape(preset.shape, preset.terrain, "constructor-failure");
    const source = (asset.source as any).descriptor.config;
    const compiled = OceanNearshoreCompiler.compile(source.nearshoreDescriptor);
    expect(compiled.valid).toBe(true);
    const resource = OceanNearshoreFieldResource.create(compiled.data!);
    const root = engine.sceneManager.activeScene!.createRootEntity("Failed candidate");
    // The low-level controller also defends its contract after creating its private materials.
    const shader = Shader.create("OceanMissingFar", [Shader.find("Water/Ocean.v1")!.subShaders[0]]);
    const normal = new Texture2D(engine, 4, 4, undefined, false, false);
    const baseline = shader._getReferCount();
    expect(
      () =>
        new OceanWaterRuntimeController(
          engine,
          root,
          {
            ...source,
            waterBodyId: "failed",
            surfaceCenterXZ: [0, 0],
            size: 64,
            surfaceTopology: "finite",
            capabilityMode: "render-and-query",
            sceneFogEnabled: false,
            surfaceShader: shader,
            textures: describeOceanTextures([normal, normal, null, null, null])
          },
          { physicalSurfaceHash: resource.identity.physicalSurfaceHash, nearshoreResource: resource },
          () => ({ x: 0, y: 10, z: 12 })
        )
    ).toThrow("WaterFar");
    expect(root.children).toHaveLength(0);
    expect(resource.referenceCount).toBe(0);
    expect(normal.refCount).toBe(0);
    expect(normal.destroyed).toBe(false);
    expect(shader._getReferCount()).toBe(baseline);
    resource.dispose();
    shader.destroy();
  } finally {
    engine.destroy();
  }
});
