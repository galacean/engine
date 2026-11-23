import {
  BlendShape,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Material,
  ModelMesh,
  ReferResource,
  Texture2D,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
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

    // A destroyed superResource whose isGCIgnored stayed true must not retain children
    const deadOwner = new TestSuperResource(engine);
    const orphan = new Texture2D(engine, 1, 1);
    deadOwner.isGCIgnored = true;
    orphan._associationSuperResource(deadOwner);
    deadOwner.destroy(true);
    engine.resourceManager.gc();
    expect(orphan.destroyed).eq(true);
  });

  it("preserves built-in post-process and fallback BlinnPhong materials across gc()", () => {
    const fallbackMaterial = (engine as any)._basicResources._getBlinnPhongDefaultMaterial() as Material;
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

    // Owned GPU sub-resources are superResource-associated (not forced isGCIgnored) and protected from direct destroy()
    expect(primitive.isGCIgnored).eq(false);
    expect(vertexBuffer.isGCIgnored).eq(false);
    expect(indexBuffer.isGCIgnored).eq(false);
    expect(primitive.destroy()).eq(false);
    expect(vertexBuffer.destroy()).eq(false);
    expect(indexBuffer.destroy()).eq(false);

    // Once mesh is no longer retained, gc() collects the entire owned subtree
    mesh.isGCIgnored = false;
    engine.resourceManager.gc();
    expect(mesh.destroyed).eq(true);
    expect(primitive.destroyed).eq(true);
    expect(vertexBuffer.destroyed).eq(true);
    expect(indexBuffer.destroyed).eq(true);
    if (blendShapeTexture) expect(blendShapeTexture.destroyed).eq(true);
    for (const buffer of blendShapeBuffers) expect(buffer.destroyed).eq(true);
  });

  it("releases previous BlendShape GPU hosts cleanly across mode switches and clearBlendShapes()", () => {
    const mesh = new ModelMesh(engine, "blendshape-switch-mesh");
    mesh.isGCIgnored = true;
    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
    const addMorph = (name: string) => {
      const bs = new BlendShape(name);
      bs.addFrame(1, [new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0)]);
      mesh.addBlendShape(bs);
    };

    // Start in VertexBuffer mode (1 blend shape)
    addMorph("bs0");
    mesh.uploadData(false);
    const vbModeBuffers = [...mesh._blendShapeManager._vertexBuffers];
    expect(vbModeBuffers.length).toBeGreaterThan(0);
    expect(mesh._blendShapeManager._vertexTexture).toBeUndefined();

    // Add enough blend shapes to switch into Texture2DArray mode -> old vertex buffers must be unbound and destroyed
    for (let i = 1; i <= 10; i++) {
      addMorph(`bs${i}`);
    }
    mesh.uploadData(false);
    for (const buffer of vbModeBuffers) {
      expect(buffer.destroyed).eq(true);
      expect(mesh.vertexBufferBindings.some((binding) => binding?.buffer === buffer)).eq(false);
    }
    const texHost = mesh._blendShapeManager._vertexTexture;
    expect(texHost).toBeDefined();
    expect(texHost.destroyed).eq(false);

    // Switch back to VertexBuffer mode -> old Texture2DArray host must be destroyed
    mesh.clearBlendShapes();
    addMorph("bs_back");
    mesh.uploadData(false);
    expect(texHost.destroyed).eq(true);
    const secondVbBuffers = [...mesh._blendShapeManager._vertexBuffers];
    expect(secondVbBuffers.length).toBeGreaterThan(0);
    expect(secondVbBuffers[0].destroyed).eq(false);

    // Clear all blend shapes and upload -> releases VertexBuffer host and leaves no destroyed bindings
    mesh.clearBlendShapes();
    mesh.uploadData(false);
    for (const buffer of secondVbBuffers) {
      expect(buffer.destroyed).eq(true);
      expect(mesh.vertexBufferBindings.some((binding) => binding?.buffer === buffer)).eq(false);
    }

    // Referenced mesh: internal VB/IB/BlendShape replacements and force destroy release owned hosts via normal destroy()
    addMorph("bs_ref");
    mesh.setIndices(new Uint16Array([0, 1, 2]));
    mesh.uploadData(false);
    mesh._addReferCount(2);
    const refVb = mesh.vertexBufferBindings[0]!.buffer;
    const refIb = mesh._primitive.indexBufferBinding!.buffer;
    const refBsBuffers = [...mesh._blendShapeManager._vertexBuffers];
    expect(refVb.refCount).eq(2);
    expect(refIb.refCount).eq(2);
    expect(refBsBuffers[0].refCount).eq(2);

    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0)]);
    mesh.setIndices(new Uint16Array([0, 1, 2, 1, 3, 2]));
    mesh.clearBlendShapes();
    const bs4 = new BlendShape("bs_ref_4");
    bs4.addFrame(1, [new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0)]);
    mesh.addBlendShape(bs4);
    mesh.uploadData(false);
    expect(refVb.destroyed).eq(true);
    expect(refIb.destroyed).eq(true);
    for (const buffer of refBsBuffers) {
      expect(buffer.destroyed).eq(true);
    }

    const finalPrimitive = mesh._primitive;
    const finalVb = mesh.vertexBufferBindings[0]!.buffer;
    const finalIb = finalPrimitive.indexBufferBinding!.buffer;
    const finalBsBuffers = [...mesh._blendShapeManager._vertexBuffers];
    mesh.destroy(true);
    expect(mesh.destroyed).eq(true);
    expect(finalPrimitive.destroyed).eq(true);
    expect(finalVb.destroyed).eq(true);
    expect(finalIb.destroyed).eq(true);
    for (const buffer of finalBsBuffers) {
      expect(buffer.destroyed).eq(true);
    }
  });

  it("repopulates BlendShape GPU host data when recreated after setVertexElements()", () => {
    const mesh = new ModelMesh(engine, "blendshape-recreate-mesh");
    mesh.isGCIgnored = true;
    const positionBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      BufferUsage.Static
    );
    mesh.setVertexBufferBinding(new VertexBufferBinding(positionBuffer, 12), 0);
    mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
    const bs = new BlendShape("morph");
    bs.addFrame(1, [new Vector3(0, 2, 0), new Vector3(0, 2, 0), new Vector3(0, 2, 0)]);
    mesh.addBlendShape(bs);
    mesh.uploadData(false);

    const oldBuffer = mesh._blendShapeManager._vertexBuffers[0];
    expect(oldBuffer).toBeDefined();

    // Resetting vertex elements destroys BlendShape GPU resources while keeping BlendShape data clean
    mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
    expect(oldBuffer.destroyed).eq(true);

    mesh.uploadData(false);
    const recreatedBuffer = mesh._blendShapeManager._vertexBuffers[0];
    expect(recreatedBuffer).toBeDefined();
    expect(recreatedBuffer.destroyed).eq(false);
    const uploaded = new Float32Array(9);
    recreatedBuffer.getData(uploaded);
    expect(uploaded[1]).eq(2);
    expect(uploaded[4]).eq(2);
    expect(uploaded[7]).eq(2);

    mesh.isGCIgnored = false;
    mesh.destroy(true);
    positionBuffer.destroy(true);
  });
});
