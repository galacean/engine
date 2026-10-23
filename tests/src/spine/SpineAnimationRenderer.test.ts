import { describe, beforeAll, expect, it } from "vitest";
import { Entity, Material, Shader, ShaderMacro, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";

describe("SpineAnimationRenderer", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("initializes with default config", () => {
    const renderer = new Entity(engine).addComponent(SpineAnimationRenderer);
    expect(renderer.defaultConfig.animationName).to.be.null;
    expect(renderer.defaultConfig.skinName).to.equal("default");
    expect(renderer.tintBlack).to.be.false;
  });

  it("tintBlack setter flags a buffer resize", () => {
    const renderer = new Entity(engine).addComponent(SpineAnimationRenderer);
    renderer.tintBlack = true;
    expect(renderer.tintBlack).to.be.true;
    expect((renderer as any)._needResizeBuffer).to.be.true;
  });

  it("shares the default material without sharing renderer features", () => {
    const a = new Entity(engine).addComponent(SpineAnimationRenderer);
    const b = new Entity(engine).addComponent(SpineAnimationRenderer);
    a.tintBlack = true;
    expect(a.getMaterial()).to.equal(b.getMaterial());
    expect(a.getMaterial().shaderData.getMacros().includes(ShaderMacro.getByName("RENDERER_TINT_BLACK"))).to.be.false;
    expect(a.shaderData.getMacros().includes(ShaderMacro.getByName("RENDERER_TINT_BLACK"))).to.be.true;
    expect(b.shaderData.getMacros().includes(ShaderMacro.getByName("RENDERER_TINT_BLACK"))).to.be.false;
  });

  it("clones playback speed and custom material selection", () => {
    const entity = new Entity(engine);
    const renderer = entity.addComponent(SpineAnimationRenderer);
    renderer.timeScale = 0.25;
    renderer.tintBlack = true;
    const material = new Material(engine, Shader.find("2D/Spine"));
    renderer.setMaterial(material);
    const clone = entity.clone().getComponent(SpineAnimationRenderer);
    expect(clone.timeScale).to.equal(0.25);
    expect(clone.getMaterial()).to.equal(material);
    expect(clone.shaderData.getMacros().includes(ShaderMacro.getByName("RENDERER_TINT_BLACK"))).to.be.true;
    entity.destroy();
    engine.resourceManager.gc();
    expect(material.destroyed).to.be.false;
    clone.entity.destroy();
  });

  it("cloning an entity whose renderer has no skeleton does not throw", () => {
    const entity = new Entity(engine);
    entity.addComponent(SpineAnimationRenderer).setMaterials([]);
    const clone = entity.clone().getComponent(SpineAnimationRenderer);
    expect(clone.getMaterials()).to.have.length(0);
  });
});
