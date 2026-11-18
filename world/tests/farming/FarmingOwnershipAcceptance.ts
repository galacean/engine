import {
  Camera,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Scene,
  Script,
  Texture2D,
  WebGLEngine,
  type Buffer,
  type Engine,
  type ModelMesh
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { FarmingAreaComponent } from "@galacean/engine-farming/farming/native";
import { SOWING_MOTION } from "../../../packages/farming/src/farming/presentation/sowing/SowingMotion";
import { NativePreviewHost } from "../../demos/farming/native-preview/NativePreviewHost.ts";
import { SeedSackMaterials } from "@galacean/engine-farming/farming/presentation/SeedSackMaterials";

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

type CreateEngine = () => Promise<Engine>;
const createWebGL: CreateEngine = () =>
  WebGLEngine.create({ canvas: document.createElement("canvas"), shaderCompiler: new ShaderCompiler() });

async function withHost(createEngine: CreateEngine, run: (host: NativePreviewHost) => Promise<void>) {
  const engine = await createEngine();
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

class OwnershipFrame extends Script {
  action?: () => void;
  override onUpdate(): void {
    const action = this.action;
    this.action = undefined;
    action?.();
  }
}

export async function checkSeedSackOwnership(createEngine: CreateEngine): Promise<void> {
  const engine = await createEngine();
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    const renderer = scene.createRootEntity("Label").addComponent(MeshRenderer);
    const source = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 2, 2);
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    source.baseTexture = texture;
    renderer.mesh = mesh;
    renderer.setMaterial(source);
    const materials = new SeedSackMaterials();
    materials.apply(renderer, "wheat-seed");
    const idle = renderer.getMaterial()!;
    materials.apply(renderer, "tomato-seed");
    const live = renderer.getMaterial()!;
    engine.resourceManager.gc();
    requireCondition(
      !idle.destroyed && !live.destroyed && !source.destroyed,
      "Idle and live label variants survive GC"
    );
    materials.dispose();
    materials.dispose();
    requireCondition(
      idle.destroyed && live.destroyed && renderer.getMaterial() === source,
      "Disposal unbinds and destroys both variants"
    );
    requireCondition(!source.destroyed && !texture.destroyed && !mesh.destroyed, "Borrowed label assets remain live");
  } finally {
    engine.destroy();
  }
}

export function checkPresentationOwnership(createEngine = createWebGL): Promise<void> {
  return withHost(createEngine, async (host) => {
    await host.initialize();
    const { engine, area, scene } = host;
    // This regression exercises the real update and frame-tail queue without drawing a camera.
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
      requireCondition(result.ok, `Plant for ownership regression: ${result.error?.message}`);
      const job = sowing.root.children.at(-1);
      requireCondition(job && !job.pendingDestroy && !job.destroyed, "Sowing must acquire renderer leases");
      return job;
    };
    const first = await plant(0);
    const renderer = first.getComponentsIncludeChildren(MeshRenderer, [])[0];
    const mesh = renderer.mesh as ModelMesh;
    const material = renderer.getMaterial()!;
    const vertex = mesh.vertexBufferBindings.find((binding) => binding)?.buffer;
    const index = (mesh as ModelMesh & { _primitive: { indexBufferBinding: { _buffer: Buffer } } })._primitive
      .indexBufferBinding._buffer;
    const ttl = SOWING_MOTION.duration + first.children.length * SOWING_MOTION.seedDelay;
    requireCondition(
      vertex && index && !vertex.destroyed && !index.destroyed,
      "Cache owns live vertex and index buffers"
    );
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
    requireCondition(
      first.destroyed && !mesh.destroyed && !material.destroyed,
      "Frame-external expiry releases only the borrower"
    );
    engine.resourceManager.gc();
    requireCondition(
      !mesh.destroyed && !material.destroyed && !vertex.destroyed && !index.destroyed,
      "Idle seed caches survive GC"
    );

    const second = await plant(1);
    const secondRenderer = second.getComponentsIncludeChildren(MeshRenderer, [])[0];
    requireCondition(
      secondRenderer.mesh === mesh && secondRenderer.getMaterial() === material,
      "Sowing reuses its idle cache"
    );
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
    requireCondition(generated.ok, `Generate basket: ${generated.error?.message}`);
    const cargo = host.items.root
      .getComponentsIncludeChildren(MeshRenderer, [])
      .find((candidate) => candidate.entity.name === "Persistent contents");
    const cargoMaterial = cargo?.getMaterial();
    requireCondition(
      cargo && cargoMaterial && !cargoMaterial.destroyed,
      "Cargo material survives GC before the first basket"
    );

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
    requireCondition(frameChecks?.every(Boolean), "Frame update unlinks queued renderers before releasing ownership");
    requireCondition(
      mesh.destroyed && material.destroyed && vertex.destroyed && index.destroyed,
      "Frame tail releases seed mesh, material and both buffers"
    );
    requireCondition(
      destroyCalls.every((calls) => calls() === 1),
      "Both platform buffers are destroyed exactly once"
    );
    requireCondition(cargoMaterial.destroyed, "Frame tail releases cargo material");
  });
}

export async function checkStandaloneResourceOwnership(createEngine = createWebGL): Promise<void> {
  await withHost(createEngine, async (host) => {
    await host.initialize();
    const original = host.area.configuration!;
    const checkpoint = await host.sceneFile();
    await host.restore(checkpoint);
    const borrowed = host.area.configuration!;
    requireCondition(
      original.catalog.destroyed && original.rules.destroyed,
      "Successful restore releases only the old owned JSONAsset pair"
    );
    requireCondition(
      borrowed.catalog !== original.catalog && borrowed.rules !== original.rules,
      "Restoration borrows the loaded asset pair"
    );
    await host.dispose();
    requireCondition(
      !borrowed.catalog.destroyed && !borrowed.rules.destroyed,
      "Standalone host does not destroy ResourceManager assets"
    );
  });
  const configure = FarmingAreaComponent.prototype.configure;
  try {
    await withHost(createEngine, async (host) => {
      let acquired: Parameters<typeof configure>[0] | undefined;
      const failure = new Error("test initialization failure");
      FarmingAreaComponent.prototype.configure = function (config) {
        acquired = config;
        return Promise.reject(failure);
      };
      const outcome = await host.initialize().catch((error: unknown) => error);
      requireCondition(outcome === failure && acquired, "The original initialization failure is observable");
      await host.dispose();
      requireCondition(
        acquired.catalog.destroyed && acquired.rules.destroyed,
        "The failed initialization releases owned JSONAsset objects"
      );
    });
    await withHost(createEngine, async (host) => {
      const entered = Promise.withResolvers<Parameters<typeof configure>[0]>();
      const resume = Promise.withResolvers<void>();
      FarmingAreaComponent.prototype.configure = async function (config) {
        const ready = configure.call(this, config);
        entered.resolve(config);
        await ready;
        await resume.promise;
      };
      const initializing = host.initialize().catch((error: unknown) => error);
      const resources = await entered.promise;
      const disposal = host.dispose();
      resume.resolve();
      await disposal;
      const canceled = await initializing;
      requireCondition(
        canceled instanceof DOMException && canceled.name === "AbortError",
        "Pending startup cannot mount visuals after disposal"
      );
      requireCondition(
        resources.catalog.destroyed && resources.rules.destroyed,
        "Pending startup releases owned resources after the system stops"
      );
    });
  } finally {
    FarmingAreaComponent.prototype.configure = configure;
  }
}
