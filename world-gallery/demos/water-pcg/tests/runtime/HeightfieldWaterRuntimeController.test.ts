import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  uploadHeightfieldWaterMesh: vi.fn(() => ({
    surfaceMesh: { isGCIgnored: false, destroy: vi.fn() }
  })),
  createHeightfieldWaterLocalMapTexture: vi.fn(() => ({
    isGCIgnored: false,
    destroy: vi.fn()
  })),
  createHeightfieldWaterMaterial: vi.fn(
    (_engine: unknown, quality: unknown, waveSet: unknown) => ({
      quality,
      waveSet,
      material: { isGCIgnored: false, destroy: vi.fn() }
    })
  ),
  updateHeightfieldWaterMaterial: vi.fn(),
  setHeightfieldWaterDebugMode: vi.fn(),
  setHeightfieldWaterFeatureFlags: vi.fn(),
  setHeightfieldWaterSurfaceTimeOverride: vi.fn()
}));

vi.mock("../../runtime/heightfield/HeightfieldWaterMeshUploader", () => ({
  uploadHeightfieldWaterMesh: runtimeMocks.uploadHeightfieldWaterMesh
}));
vi.mock("../../runtime/heightfield/HeightfieldWaterLocalMapTextureFactory", () => ({
  createHeightfieldWaterLocalMapTexture: runtimeMocks.createHeightfieldWaterLocalMapTexture
}));
vi.mock("../../runtime/heightfield/HeightfieldWaterMaterialFactory", () => ({
  createHeightfieldWaterMaterial: runtimeMocks.createHeightfieldWaterMaterial,
  updateHeightfieldWaterMaterial: runtimeMocks.updateHeightfieldWaterMaterial,
  setHeightfieldWaterDebugMode: runtimeMocks.setHeightfieldWaterDebugMode,
  setHeightfieldWaterFeatureFlags: runtimeMocks.setHeightfieldWaterFeatureFlags,
  setHeightfieldWaterSurfaceTimeOverride: runtimeMocks.setHeightfieldWaterSurfaceTimeOverride
}));

import type { Engine, Entity } from "@galacean/engine-core";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import { HeightfieldWaterResource } from "../../runtime/heightfield/HeightfieldWaterResource";
import {
  HeightfieldWaterRuntimeController,
  HeightfieldWaterRuntimeSubmissionCancelledError
} from "../../runtime/heightfield/HeightfieldWaterRuntimeController";
import { HeightfieldWaterDebugMode } from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";

class FakeRenderer {
  mesh?: unknown;
  readonly entity: FakeEntity;
  readonly shaderData = { setVector4: vi.fn() };
  readonly setMaterial = vi.fn();

  constructor(entity: FakeEntity) {
    this.entity = entity;
  }
}

class FakeEntity {
  isActive = true;
  destroyed = false;
  readonly children: FakeEntity[] = [];
  readonly renderers: FakeRenderer[] = [];
  readonly transform = { setPosition: vi.fn() };

  constructor(readonly name: string) {}

  createChild(name: string): FakeEntity {
    const child = new FakeEntity(name);
    this.children.push(child);
    return child;
  }

  addComponent(): FakeRenderer {
    const renderer = new FakeRenderer(this);
    this.renderers.push(renderer);
    return renderer;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function createRuntime(): {
  readonly controller: HeightfieldWaterRuntimeController;
  readonly root: FakeEntity;
  readonly gc: ReturnType<typeof vi.fn>;
} {
  const root = new FakeEntity("root");
  const gc = vi.fn();
  const engine = { resourceManager: { gc } } as unknown as Engine;
  return {
    controller: new HeightfieldWaterRuntimeController(engine, root as unknown as Entity),
    root,
    gc
  };
}

function compileResource(quality: WaterQualityTier): HeightfieldWaterResource {
  return HeightfieldWaterResource.create(
    HeightfieldWaterCompiler.compile(createHeightfieldWaterFixture(quality).descriptor).data!
  );
}

describe("HeightfieldWaterRuntimeController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads in budgeted slices under a hidden root and exposes no per-frame upload path", async () => {
    const { controller, root } = createRuntime();
    const resource = compileResource(WaterQualityTier.Medium);
    let time = 0;
    const yieldToMainThread = vi.fn(async () => undefined);

    const activation = await controller.replaceActiveIncremental("fixture", resource, {
      frameBudgetMs: 4,
      now: () => (time += 5),
      yieldToMainThread
    });

    expect(root.children[0].isActive).toBe(true);
    expect(activation.submittedChunkCount).toBe(resource.data.chunks.length);
    expect(activation.meshUploadCount).toBe(resource.data.chunks.length);
    expect(activation.yieldCount).toBe(resource.data.chunks.length - 1);
    expect(yieldToMainThread).toHaveBeenCalledTimes(activation.yieldCount);
    expect(controller.meshUploadCount).toBe(resource.data.chunks.length);
    expect(controller.activeChunkCount).toBe(resource.data.chunks.length);
    expect(resource.referenceCount).toBe(1);

    const uploadCount = controller.meshUploadCount;
    controller.setDebugMode(HeightfieldWaterDebugMode.Flow);
    controller.setFeatureFlags({ waves: false, microNormals: true, foam: false });
    controller.setSurfaceTimeOverride(86400);
    controller.updateMaterial(resource.data.material);
    expect(controller.meshUploadCount).toBe(uploadCount);
    expect(runtimeMocks.uploadHeightfieldWaterMesh).toHaveBeenCalledTimes(uploadCount);

    controller.destroy();
    expect(resource.referenceCount).toBe(0);
  });

  it("keeps the active set visible and releases the hidden set when a replacement is cancelled", async () => {
    const { controller, root } = createRuntime();
    const activeResource = compileResource(WaterQualityTier.Low);
    const cancelledResource = compileResource(WaterQualityTier.High);
    await controller.replaceActiveIncremental("fixture", activeResource, {
      now: () => 0,
      yieldToMainThread: async () => undefined
    });
    const activeRoot = root.children[0];

    await expect(
      controller.replaceActiveIncremental("fixture", cancelledResource, { shouldCancel: () => true })
    ).rejects.toBeInstanceOf(HeightfieldWaterRuntimeSubmissionCancelledError);

    expect(controller.activeData?.sourceHash).toBe(activeResource.data.sourceHash);
    expect(activeRoot.isActive).toBe(true);
    expect(activeRoot.destroyed).toBe(false);
    expect(root.children[1].isActive).toBe(false);
    expect(root.children[1].destroyed).toBe(true);
    expect(cancelledResource.referenceCount).toBe(0);

    controller.destroy();
  });

  it("atomically replaces the old set and flushes deferred GPU resources only on request", async () => {
    const { controller, root, gc } = createRuntime();
    const first = compileResource(WaterQualityTier.Low);
    const second = compileResource(WaterQualityTier.Medium);
    await controller.replaceActiveIncremental("fixture", first, { now: () => 0 });
    const firstRoot = root.children[0];
    await controller.replaceActiveIncremental("fixture", second, { now: () => 0 });

    expect(firstRoot.destroyed).toBe(true);
    expect(first.referenceCount).toBe(0);
    expect(second.referenceCount).toBe(1);
    expect(controller.activeData?.sourceHash).toBe(second.data.sourceHash);
    expect(gc).not.toHaveBeenCalled();
    controller.flushDeferredResources();
    expect(gc).toHaveBeenCalledOnce();
    controller.flushDeferredResources();
    expect(gc).toHaveBeenCalledOnce();

    controller.destroy();
  });
});
