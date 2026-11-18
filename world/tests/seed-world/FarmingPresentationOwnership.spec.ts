import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Camera,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Scene,
  Script,
  Texture2D,
  type Buffer,
  type ModelMesh
} from "@galacean/engine";
import { FarmingAreaComponent } from "@galacean/engine-farming/farming/native";
import { SeedSackMaterials } from "@galacean/engine-farming/farming/presentation/SeedSackMaterials";
import { HeadlessEngine } from "../../../packages/rhi-null/src";
import { SOWING_MOTION } from "../../../packages/farming/src/farming/presentation/sowing/SowingMotion";
import { NativePreviewHost } from "../../demos/farming/native-preview/NativePreviewHost";

class OwnershipFrame extends Script {
  action?: () => void;
  override onUpdate(): void {
    const action = this.action;
    this.action = undefined;
    action?.();
  }
}

async function withHost(run: (host: NativePreviewHost) => Promise<void>) {
  const engine = await HeadlessEngine.create();
  const host = new NativePreviewHost(engine);
  try {
    await run(host);
  } finally {
    try {
      await host.dispose();
    } finally {
      engine.destroy();
    }
  }
}

beforeEach(() => {
  const canvas = { ownerDocument: new EventTarget() };
  vi.stubGlobal("document", Object.assign(new EventTarget(), { getElementById: () => canvas }));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

it("releases only farm-owned SeedSack label variants on a real engine", async () => {
  const engine = await HeadlessEngine.create();
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    const renderer = scene.createRootEntity("Label").addComponent(MeshRenderer);
    const source = new PBRMaterial(engine),
      texture = new Texture2D(engine, 2, 2),
      mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    source.baseTexture = texture;
    renderer.mesh = mesh;
    renderer.setMaterial(source);
    const materials = new SeedSackMaterials();
    materials.apply(renderer, "wheat-seed");
    const idle = renderer.getMaterial()!;
    materials.apply(renderer, "tomato-seed");
    const live = renderer.getMaterial()!;
    engine.resourceManager.gc();
    expect(idle.destroyed || live.destroyed || source.destroyed).toBe(false);
    materials.dispose();
    materials.dispose();
    expect(idle.destroyed && live.destroyed).toBe(true);
    expect(renderer.getMaterial()).toBe(source);
    expect(source.destroyed || texture.destroyed || mesh.destroyed).toBe(false);
  } finally {
    engine.destroy();
  }
});

it("releases sowing and cargo ownership through the real frame-tail queue", () =>
  withHost(async (host) => {
    await host.initialize();
    const { engine, area, scene } = host;
    for (const root of scene.rootEntities)
      for (const camera of root.getComponentsIncludeChildren(Camera, [])) camera.enabled = false;
    const sowing = area.sowingPresenter!;
    const plant = async (cell: number) => {
      const result = await area.service.execute({
        type: "plant",
        seedId: "tomato-seed",
        plotId: `native-ground/x${cell}z0`,
        commandId: `plant-${cell}`,
        farmId: area.farmId,
        expectedRevision: area.service.getSnapshot().revision
      });
      expect(result.ok, result.error?.message).toBe(true);
      const job = sowing.root.children.at(-1)!;
      expect(job && !job.pendingDestroy && !job.destroyed).toBe(true);
      return job;
    };
    const first = await plant(0);
    const renderer = first.getComponentsIncludeChildren(MeshRenderer, [])[0];
    const mesh = renderer.mesh as ModelMesh;
    const material = renderer.getMaterial()!;
    const vertex = mesh.vertexBufferBindings.find((binding) => binding)!.buffer;
    const index = (mesh as ModelMesh & { _primitive: { indexBufferBinding: { _buffer: Buffer } } })._primitive
      .indexBufferBinding._buffer;
    const ttl = SOWING_MOTION.duration + first.children.length * SOWING_MOTION.seedDelay;
    expect(vertex.destroyed || index.destroyed).toBe(false);
    const destroyCalls = [vertex, index].map((buffer) => {
      const platform = buffer._platformBuffer;
      const destroy = platform.destroy.bind(platform);
      let calls = 0;
      platform.destroy = () => {
        calls++;
        destroy();
      };
      return () => calls;
    });
    sowing.update(ttl);
    expect(first.destroyed && !mesh.destroyed && !material.destroyed).toBe(true);
    engine.resourceManager.gc();
    expect(mesh.destroyed || material.destroyed || vertex.destroyed || index.destroyed).toBe(false);

    const second = await plant(1);
    const secondRenderer = second.getComponentsIncludeChildren(MeshRenderer, [])[0];
    expect(secondRenderer.mesh).toBe(mesh);
    expect(secondRenderer.getMaterial()).toBe(material);
    sowing.update(SOWING_MOTION.duration - 0.1);
    await plant(2);

    const generated = await area.service.execute({
      type: "spawn-item",
      itemType: "harvest-basket",
      count: 1,
      groundId: "native-ground",
      position: [6, 0, 6],
      commandId: "generate-basket",
      farmId: area.farmId,
      expectedRevision: area.service.getSnapshot().revision
    });
    expect(generated.ok, generated.error?.message).toBe(true);
    const cargo = host.items.root
      .getComponentsIncludeChildren(MeshRenderer, [])
      .find((candidate) => candidate.entity.name === "Persistent contents")!;
    const cargoMaterial = cargo.getMaterial()!;
    expect(cargoMaterial.destroyed).toBe(false);

    const frame = scene.createRootEntity("Ownership verification frame").addComponent(OwnershipFrame);
    let frameChecks: boolean[] | undefined;
    frame.action = () => {
      sowing.update(ttl - SOWING_MOTION.duration + 0.2);
      const unlinked = second.pendingDestroy && !secondRenderer.mesh && !secondRenderer.getMaterial();
      sowing.dispose();
      sowing.dispose();
      host.items.dispose();
      host.items.dispose();
      frameChecks = [unlinked, mesh.pendingDestroy, material.pendingDestroy, !cargo.getMaterial()];
    };
    engine.update();
    expect(frameChecks?.every(Boolean)).toBe(true);
    expect(mesh.destroyed && material.destroyed && vertex.destroyed && index.destroyed && cargoMaterial.destroyed).toBe(
      true
    );
    expect(destroyCalls.every((calls) => calls() === 1)).toBe(true);
  }));

it("releases standalone JSON assets for restore, failure, pending startup, and interrupted restore", async () => {
  await withHost(async (host) => {
    await host.initialize();
    const original = host.area.configuration!;
    await host.restore(await host.sceneFile());
    const borrowed = host.area.configuration!;
    expect(original.catalog.destroyed && original.rules.destroyed).toBe(true);
    expect(borrowed.catalog !== original.catalog && borrowed.rules !== original.rules).toBe(true);
    await host.dispose();
    expect(borrowed.catalog.destroyed || borrowed.rules.destroyed).toBe(false);
  });

  const configure = FarmingAreaComponent.prototype.configure;
  try {
    await withHost(async (host) => {
      let acquired: Parameters<typeof configure>[0] | undefined;
      const failure = new Error("test initialization failure");
      vi.spyOn(FarmingAreaComponent.prototype, "configure").mockImplementation(function (config) {
        acquired = config;
        return Promise.reject(failure);
      });
      await expect(host.initialize()).rejects.toBe(failure);
      await host.dispose();
      expect(acquired!.catalog.destroyed && acquired!.rules.destroyed).toBe(true);
    });
    await withHost(async (host) => {
      const entered = Promise.withResolvers<Parameters<typeof configure>[0]>();
      const resume = Promise.withResolvers<void>();
      vi.mocked(FarmingAreaComponent.prototype.configure).mockImplementation(async function (this: FarmingAreaComponent, config) {
        const ready = configure.call(this, config);
        entered.resolve(config);
        await ready;
        await resume.promise;
      });
      const initializing = expect(host.initialize()).rejects.toMatchObject({ name: "AbortError" });
      const resources = await entered.promise;
      const disposal = host.dispose();
      resume.resolve();
      await disposal;
      await initializing;
      expect(resources.catalog.destroyed && resources.rules.destroyed).toBe(true);
    });
  } finally {
    vi.restoreAllMocks();
  }

  await withHost(async (host) => {
    await host.initialize();
    const checkpoint = await host.sceneFile();
    const previous = host.scene;
    const entered = Promise.withResolvers<FarmingAreaComponent>();
    const resume = Promise.withResolvers<void>();
    const ready = vi.spyOn(FarmingAreaComponent.prototype, "ready", "get").mockImplementation(function (
      this: FarmingAreaComponent
    ) {
      entered.resolve(this);
      return resume.promise;
    });
    try {
      const rejected = expect(host.restore(checkpoint)).rejects.toMatchObject({ name: "AbortError" });
      const area = await entered.promise;
      const candidate = area.entity.scene!;
      const { catalog, rules } = area.configuration!;
      await expect(host.restore(checkpoint)).rejects.toThrow("already in progress");
      const closing = host.dispose();
      expect(host.dispose()).toBe(closing);
      resume.resolve();
      await rejected;
      await closing;
      expect(host.scene).toBe(previous);
      expect(candidate.destroyed).toBe(true);
      expect(catalog.destroyed || rules.destroyed).toBe(false);
    } finally {
      resume.resolve();
      ready.mockRestore();
    }
  });
});
