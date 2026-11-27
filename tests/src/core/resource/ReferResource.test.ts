import {
  AmbientLight,
  BlendShape,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Font,
  FontStyle,
  Material,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  ReferResource,
  Sprite,
  SpriteAtlas,
  SpriteRenderer,
  Texture2D,
  TextureCube,
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

  it("keeps a live mesh's buffer writable when a renderer replaces a forcibly destroyed mesh", () => {
    const entity = engine.sceneManager.activeScene!.createRootEntity();
    const renderer = entity.addComponent(MeshRenderer);
    const original = new ModelMesh(engine);
    const replacement = new ModelMesh(engine);
    const vertices = new Float32Array([0, 1, 2]);
    const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices);
    original.setVertexBufferBinding(buffer, 12);
    replacement.setVertexBufferBinding(buffer, 12);

    renderer.mesh = original;
    original.destroy(true);
    const clone = entity.clone();
    expect(original.refCount).toBe(0);
    clone.destroy();

    renderer.mesh = replacement;
    engine.resourceManager.gc();
    expect(buffer.refCount).toBe(1);
    buffer.setData(vertices);
    entity.destroy();
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

  it("roots Material isGCIgnored textures (including in-place texture arrays) during gc() without blocking manual destroy", () => {
    const texBase = new Texture2D(engine, 4, 4);
    const texA = new Texture2D(engine, 4, 4);
    const mat = new PBRMaterial(engine);
    const texArray = [texA];
    mat.baseTexture = texBase;
    mat.shaderData.setTextureArray("u_TestTextures", texArray);
    mat.isGCIgnored = true;

    engine.resourceManager.gc();
    expect(mat.destroyed).eq(false);
    expect(texBase.destroyed).eq(false);
    expect(texA.destroyed).eq(false);
    expect(mat.refCount).eq(0);
    expect(texBase.refCount).eq(0);

    // Mutating the same array in place and re-setting must follow the current array contents on gc()
    const texB = new Texture2D(engine, 4, 4);
    texArray[0] = texB;
    mat.shaderData.setTextureArray("u_TestTextures", texArray);
    engine.resourceManager.gc();
    expect(texA.destroyed).eq(true);
    expect(texB.destroyed).eq(false);

    // Unpinned unused material does not block direct manual texture.destroy()
    mat.isGCIgnored = false;
    expect(texBase.destroy()).eq(true);
    expect(texBase.destroyed).eq(true);

    engine.resourceManager.gc();
    expect(mat.destroyed).eq(true);
    expect(texB.destroyed).eq(true);
  });

  it("retains Sprite and AmbientLight textures when referenced or pinned and releases cleanly", () => {
    const scene = engine.sceneManager.activeScene!;
    const entity = scene.createRootEntity("sprite-gc-test");
    const renderer = entity.addComponent(SpriteRenderer);
    const activeTex = new Texture2D(engine, 4, 4);
    const activeSprite = new Sprite(engine, activeTex);
    renderer.sprite = activeSprite;

    // Active SpriteRenderer must keep Sprite.texture alive across gc()
    expect(activeTex.refCount).to.be.greaterThan(0);
    engine.resourceManager.gc();
    expect(activeSprite.destroyed).eq(false);
    expect(activeTex.destroyed).eq(false);

    entity.destroy();
    expect(activeTex.refCount).eq(0);
    engine.resourceManager.gc();
    expect(activeSprite.destroyed).eq(true);
    expect(activeTex.destroyed).eq(true);

    // Pinned off-scene Sprite retains texture and follows texture swaps
    const tex1 = new Texture2D(engine, 4, 4);
    const sprite = new Sprite(engine, tex1);
    sprite.isGCIgnored = true;

    engine.resourceManager.gc();
    expect(sprite.destroyed).eq(false);
    expect(tex1.destroyed).eq(false);

    const tex2 = new Texture2D(engine, 4, 4);
    sprite.texture = tex2;
    engine.resourceManager.gc();
    expect(tex1.destroyed).eq(true);
    expect(tex2.destroyed).eq(false);

    sprite.isGCIgnored = false;
    engine.resourceManager.gc();
    expect(sprite.destroyed).eq(true);
    expect(tex2.destroyed).eq(true);

    // AmbientLight pinned off-scene retains specularTexture; clearing on active scene releases refCount
    const cube1 = new TextureCube(engine, 4);
    const ambient = new AmbientLight(engine);
    ambient.specularTexture = cube1;
    ambient.isGCIgnored = true;
    engine.resourceManager.gc();
    expect(ambient.destroyed).eq(false);
    expect(cube1.destroyed).eq(false);

    ambient.isGCIgnored = false;
    const prevAmbient = scene.ambientLight;
    scene.ambientLight = ambient;
    expect(cube1.refCount).to.be.greaterThan(0);

    ambient.specularTexture = null;
    expect(cube1.refCount).eq(0);
    engine.resourceManager.gc();
    expect(cube1.destroyed).eq(true);

    scene.ambientLight = prevAmbient;
    engine.resourceManager.gc();
    expect(ambient.destroyed).eq(true);

    // Force-destroying a mounted AmbientLight clears scene.shaderData and releases specularTexture refCount
    const cube2 = new TextureCube(engine, 4);
    const mountedAmbient = new AmbientLight(engine);
    mountedAmbient.specularTexture = cube2;
    scene.ambientLight = mountedAmbient;
    expect(scene.shaderData.getTexture("scene_EnvSpecularSampler")).eq(cube2);
    expect(scene.shaderData.getMacros().some((m) => m.name === "SCENE_USE_SPECULAR_ENV")).eq(true);

    mountedAmbient.destroy(true);
    expect(mountedAmbient.destroyed).eq(true);
    expect(mountedAmbient.refCount).eq(0);
    expect(cube2.refCount).eq(0);
    expect(scene.shaderData.getTexture("scene_EnvSpecularSampler")).eq(null);
    expect(scene.shaderData.getMacros().some((m) => m.name === "SCENE_USE_SPECULAR_ENV")).eq(false);

    engine.resourceManager.gc();
    expect(cube2.destroyed).eq(true);

    // Replacing scene.ambientLight after force destroy must not drive destroyed ambient refCount negative
    scene.ambientLight = prevAmbient;
    expect(mountedAmbient.refCount).eq(0);
  });

  it("collects unreferenced Font together with its internal isGCIgnored FontAtlas texture during gc()", () => {
    const font = Font.createFromOS(engine, "GCFontAtlasTest")!;
    const subFont = font._getSubFont(16, FontStyle.None);
    (subFont as any)._createFontAtlas();
    const fontAtlas = (subFont as any)._fontAtlases[0];
    const atlasTexture = fontAtlas.texture as Texture2D;

    expect(fontAtlas.isGCIgnored).eq(true);
    expect(atlasTexture.isGCIgnored).eq(true);

    engine.resourceManager.gc();
    expect(font.destroyed).eq(true);
    expect(fontAtlas.destroyed).eq(true);
    expect(atlasTexture.destroyed).eq(true);
  });

  it("retains multi-page SpriteAtlas sprites and textures without hijacking isGCIgnored", () => {
    const page0 = new Texture2D(engine, 4, 4);
    const page1 = new Texture2D(engine, 4, 4);
    const atlas = new SpriteAtlas(engine);
    const sprite0 = new Sprite(engine, page0, null, null, null, "s0");
    const sprite1 = new Sprite(engine, page1, null, null, null, "s1");
    page0._associationSuperResource(atlas);
    page1._associationSuperResource(atlas);
    atlas._addSprite(sprite0);
    atlas._addSprite(sprite1);

    expect(sprite0.isGCIgnored).eq(false);
    expect(sprite1.isGCIgnored).eq(false);

    // Pinning one sprite keeps the atlas, sibling sprites, and all page textures alive across gc()
    sprite0.isGCIgnored = true;
    engine.resourceManager.gc();
    expect(atlas.destroyed).eq(false);
    expect(sprite0.destroyed).eq(false);
    expect(sprite1.destroyed).eq(false);
    expect(page0.destroyed).eq(false);
    expect(page1.destroyed).eq(false);

    // Destroying atlas detaches pinned sprite0 (kept with page0) and destroys unpinned sprite1
    atlas.destroy();
    expect(atlas.destroyed).eq(true);
    expect(sprite0.destroyed).eq(false);
    expect(sprite0._atlas).eq(null);
    expect(sprite1.destroyed).eq(true);

    engine.resourceManager.gc();
    expect(sprite0.destroyed).eq(false);
    expect(page0.destroyed).eq(false);
    expect(page1.destroyed).eq(true);

    sprite0.isGCIgnored = false;
    engine.resourceManager.gc();
    expect(sprite0.destroyed).eq(true);
    expect(page0.destroyed).eq(true);
  });
});
