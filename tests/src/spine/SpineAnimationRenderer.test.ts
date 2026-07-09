import { describe, beforeAll, expect, it } from "vitest";
import { Entity, Material, Shader, Texture2D, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
import { SpineMaterial } from "../../../packages/spine/src/renderer/SpineMaterial";
import { SpineBlendMode } from "../../../packages/spine/src/enums/SpineBlendMode";

describe("SpineAnimationRenderer", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("initializes with default config", () => {
    const renderer = new Entity(engine).addComponent(SpineAnimationRenderer);
    expect(renderer.defaultConfig.animationName).to.be.null;
    expect(renderer.defaultConfig.skinName).to.equal("default");
    expect(renderer.premultipliedAlpha).to.be.false;
    expect(renderer.tintBlack).to.be.false;
  });

  it("tintBlack setter flags a buffer resize", () => {
    const renderer = new Entity(engine).addComponent(SpineAnimationRenderer);
    renderer.tintBlack = true;
    expect(renderer.tintBlack).to.be.true;
    expect((renderer as any)._needResizeBuffer).to.be.true;
  });

  it("_getMaterial caches by texture + blendMode", () => {
    const renderer = new Entity(engine).addComponent(SpineAnimationRenderer);
    const texture = new Texture2D(engine, 4, 4);
    const normal = renderer._getMaterial(texture, SpineBlendMode.Normal);
    // Same texture + blendMode must hit the cache (regression guard for the Map[key] bug).
    expect(renderer._getMaterial(texture, SpineBlendMode.Normal)).to.equal(normal);
    // Different blendMode must produce a different material.
    expect(renderer._getMaterial(texture, SpineBlendMode.Additive)).to.not.equal(normal);
  });

  it("_getMaterial does not share a material across tintBlack variants", () => {
    const renderer = new Entity(engine).addComponent(SpineAnimationRenderer);
    const texture = new Texture2D(engine, 4, 4);
    const plain = renderer._getMaterial(texture, SpineBlendMode.Normal);
    renderer.tintBlack = true;
    const tinted = renderer._getMaterial(texture, SpineBlendMode.Normal);
    // Sharing one material would let renderers that differ only in tintBlack clobber
    // each other's RENDERER_TINT_BLACK macro every frame.
    expect(tinted).to.not.equal(plain);
    expect(renderer._getMaterial(texture, SpineBlendMode.Normal)).to.equal(tinted);
    renderer.tintBlack = false;
    expect(renderer._getMaterial(texture, SpineBlendMode.Normal)).to.equal(plain);
  });

  it("destroy tolerates user-set materials and removes cached entries by key", () => {
    const entity = new Entity(engine);
    const renderer = entity.addComponent(SpineAnimationRenderer);
    const texture = new Texture2D(engine, 4, 4);
    const cached = renderer._getMaterial(texture, SpineBlendMode.Normal) as SpineMaterial;
    renderer.setMaterial(0, cached);
    // setMaterial is public API — destroy must not assume every entry is a SpineMaterial.
    renderer.setMaterial(1, new Material(engine, Shader.find("2D/Spine")));
    const cacheKey = cached._cacheKey;
    expect(SpineAnimationRenderer._materialCacheMap.has(cacheKey)).to.be.true;
    expect(() => entity.destroy()).to.not.throw();
    expect(SpineAnimationRenderer._materialCacheMap.has(cacheKey)).to.be.false;
  });

  it("cloning an entity whose renderer has no skeleton does not throw", () => {
    const entity = new Entity(engine);
    entity.addComponent(SpineAnimationRenderer);
    expect(() => entity.clone()).to.not.throw();
  });
});
