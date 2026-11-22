import { BlendShape, Material, ModelMesh, ReferResource, Texture2D } from "@galacean/engine-core";
import { Vector3, WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

class TestSuperResource extends ReferResource {
  constructor(engine: WebGLEngine) {
    super(engine);
  }
}

describe("ReferResource", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.run();
  });

  it("pending destroy should still destroy even if refCount increases during delay", () => {
    const texture = new Texture2D(engine, 1, 1);

    // @ts-ignore
    engine._frameInProcess = true;
    texture.destroy();
    // @ts-ignore
    engine._frameInProcess = false;

    expect(texture.pendingDestroy).eq(true);

    // During pending period, refCount increases (someone references it again)
    // @ts-ignore
    texture._addReferCount(1);
    expect(texture.refCount).eq(1);

    // End-of-frame: should still destroy (destroy decision is final)
    // @ts-ignore
    engine._processPendingDestroyObjects();

    expect(texture.destroyed).eq(true);
  });

  it("pending force destroy should not fail due to lost force flag at end of frame", () => {
    const texture = new Texture2D(engine, 1, 1);
    // @ts-ignore
    texture._addReferCount(3);

    // In-frame: destroy(true) bypasses refCount check, but gets deferred
    // @ts-ignore
    engine._frameInProcess = true;
    texture.destroy(true);
    // @ts-ignore
    engine._frameInProcess = false;

    expect(texture.pendingDestroy).eq(true);
    expect(texture.destroyed).eq(false);

    // End-of-frame: _processPendingDestroyObjects calls destroy() without args,
    // force flag must not be lost, otherwise refCount=3 would block destruction
    // @ts-ignore
    engine._processPendingDestroyObjects();

    expect(texture.destroyed).eq(true);
  });

  it("propagates superResource isGCIgnored transitively during resourceManager.gc()", () => {
    const outer = new TestSuperResource(engine);
    const inner = new TestSuperResource(engine);
    const texture = new Texture2D(engine, 1, 1);
    outer.isGCIgnored = true;
    inner._associationSuperResource(outer);
    texture._associationSuperResource(inner);

    engine.resourceManager.gc();
    expect(outer.destroyed).eq(false);
    expect(inner.destroyed).eq(false);
    expect(texture.destroyed).eq(false);

    outer.isGCIgnored = false;
    engine.resourceManager.gc();
    expect(outer.destroyed).eq(true);
    expect(inner.destroyed).eq(true);
    expect(texture.destroyed).eq(true);
  });

  it("preserves built-in post-process and fallback BlinnPhong materials across gc()", () => {
    const fallbackMaterial = (engine as any)._basicResources._getBlinnPhongMaterial() as Material;
    const startupMaterials = engine.resourceManager.findResourcesByType(Material);
    expect(startupMaterials.length).toBeGreaterThan(0);

    engine.resourceManager.gc();

    expect(fallbackMaterial.destroyed).eq(false);
    for (const material of startupMaterials) {
      expect(material.destroyed).eq(false);
    }
  });

  it("protects ModelMesh internal GPU resources during gc() and releases them on destroy()", () => {
    const mesh = new ModelMesh(engine, "owned-gpu-mesh");
    mesh.isGCIgnored = true;
    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
    mesh.setIndices(new Uint16Array([0, 1, 2]));
    const blendShape = new BlendShape("morph");
    blendShape.addFrame(1, [new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0)]);
    mesh.addBlendShape(blendShape);
    mesh.uploadData(true);

    const primitive = mesh._primitive;
    const vertexBuffer = mesh.vertexBufferBindings[0]!.buffer;
    const indexBuffer = primitive.indexBufferBinding!.buffer;
    const blendShapeTexture = mesh._blendShapeManager._vertexTexture;
    const blendShapeBuffers = [...mesh._blendShapeManager._vertexBuffers];

    engine.resourceManager.gc();
    expect(mesh.destroyed).eq(false);
    expect(primitive.destroyed).eq(false);
    expect(vertexBuffer.destroyed).eq(false);
    expect(indexBuffer.destroyed).eq(false);
    if (blendShapeTexture) expect(blendShapeTexture.destroyed).eq(false);
    for (const buffer of blendShapeBuffers) expect(buffer.destroyed).eq(false);

    mesh.destroy();
    expect(mesh.destroyed).eq(true);
    expect(primitive.destroyed).eq(true);
    expect(vertexBuffer.destroyed).eq(true);
    expect(indexBuffer.destroyed).eq(true);
    if (blendShapeTexture) expect(blendShapeTexture.destroyed).eq(true);
    for (const buffer of blendShapeBuffers) expect(buffer.destroyed).eq(true);
  });
});
