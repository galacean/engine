import { describe, beforeAll, expect, it } from "vitest";
import { Entity, Texture2D, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
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
});
