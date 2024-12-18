import { Color } from "@galacean/engine";
import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Engine,
  Entity,
  PostProcess,
  PostProcessPass,
  RenderTarget,
  Scene,
  Texture2D,
  TonemappingEffect
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

class CustomPass extends PostProcessPass {
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {}
}

describe("PostProcess", () => {
  let engine: Engine;
  let scene: Scene;
  let uberPass: PostProcessPass = null;
  let postEntity: Entity = null;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    scene = engine.sceneManager.scenes[0];
    const passes = scene.postProcessManager.postProcessPasses;
    uberPass = passes[0];
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = true;
  });

  afterAll(() => {
    engine.destroy();
  });

  beforeEach(() => {
    postEntity = scene.createRootEntity("post-process");
  });

  afterEach(() => {
    postEntity.destroy();
  });

  it("Post Process isActive", () => {
    const ppManager = scene.postProcessManager;
    const pp = postEntity.addComponent(PostProcess);

    expect(ppManager.isActive).to.false;

    // Test effect
    const bloomEffect = pp.addEffect(BloomEffect);
    expect(ppManager.isActive).to.true;

    bloomEffect.enabled = false;
    expect(ppManager.isActive).to.false;

    bloomEffect.enabled = true;
    expect(ppManager.isActive).to.true;

    // Test PostProcess disable
    pp.enabled = false;
    expect(ppManager.isActive).to.false;

    pp.enabled = true;
    expect(ppManager.isActive).to.true;

    // Test pass isActive
    uberPass.isActive = false;
    expect(ppManager.isActive).to.false;

    uberPass.isActive = true;
    expect(ppManager.isActive).to.true;

    // Test effect remove
    const removedBloomEffect = pp.removeEffect(BloomEffect);
    expect(removedBloomEffect).to.instanceOf(BloomEffect);
    expect(ppManager.isActive).to.false;

    // Test component destroy
    pp.destroy();
    expect(ppManager.isActive).to.false;

    // Test entity destroy
    {
      const pp = postEntity.addComponent(PostProcess);
      pp.addEffect(TonemappingEffect);

      expect(ppManager.isActive).to.true;

      postEntity.destroy();
      expect(ppManager.isActive).to.false;
    }
  });

  it("Post Process Effect", () => {
    const pp = postEntity.addComponent(PostProcess);

    expect(pp.getEffect(BloomEffect)).to.undefined;
    // @ts-ignore
    expect(pp._effects.length).to.equal(0);

    const bloomEffect = pp.addEffect(BloomEffect);
    expect(bloomEffect).to.instanceOf(BloomEffect);

    const bloomEffectRepeat = pp.addEffect(BloomEffect);
    expect(bloomEffectRepeat).to.undefined;

    // @ts-ignore
    expect(pp._effects.length).to.equal(1);
    expect(pp.removeEffect(TonemappingEffect)).to.undefined;

    // Test Bloom parameters
    expect(bloomEffect.highQualityFiltering.value).to.false;
    expect(bloomEffect.downScale.value).to.equal(BloomDownScaleMode.Half);
    expect(bloomEffect.dirtTexture.value).to.null;
    expect(bloomEffect.threshold.value).to.equal(0.9);
    expect(bloomEffect.scatter.value).to.equal(0.7);
    expect(bloomEffect.intensity.value).to.equal(0);
    expect(bloomEffect.dirtIntensity.value).to.equal(0);
    expect(bloomEffect.tint.value).to.include(new Color(1, 1, 1, 1));

    // Test remove effect
    const removedBloomEffect = pp.removeEffect(BloomEffect);
    expect(removedBloomEffect).to.instanceOf(BloomEffect);
    expect(removedBloomEffect).to.equal(bloomEffect);
    // @ts-ignore
    expect(pp._effects.length).to.equal(0);
  });

  it("Post Process", () => {
    const ppManager = scene.postProcessManager;

    // @ts-ignore
    const activePostProcesses = ppManager._activePostProcesses;

    expect(activePostProcesses.length).to.equal(0);

    const pp1 = postEntity.addComponent(PostProcess);
    const pp2 = postEntity.addComponent(PostProcess);
    pp1.addEffect(BloomEffect);

    expect(pp1.priority).to.equal(0);
    expect(activePostProcesses.length).to.equal(2);
    expect(activePostProcesses[1]).to.eq(pp2);

    // Test priority
    pp1.priority = 10;
    engine.update();
    expect(activePostProcesses[1]).to.eq(pp1);

    pp1.enabled = false;
    expect(activePostProcesses.length).to.equal(1);

    pp1.enabled = true;
    expect(activePostProcesses.length).to.equal(2);
  });

  it("Blend global effect", () => {
    const ppManager = scene.postProcessManager;
    const pp1 = postEntity.addComponent(PostProcess);
    const pp2 = postEntity.addComponent(PostProcess);
    const bloom1 = pp1.addEffect(BloomEffect);
    const bloom2 = pp2.addEffect(BloomEffect);

    engine.update();
    expect(ppManager.isActive).to.true;
    const bloomBlend = uberPass.getBlendEffect(BloomEffect);
    expect(bloomBlend).to.instanceOf(BloomEffect);
    expect(bloomBlend.intensity.value).to.equal(0);

    bloom2.intensity.value = 10;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(10);

    pp1.priority = 10;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(0);

    pp1.enabled = false;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(10);

    pp1.enabled = true;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(0);

    pp2.priority = 20;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(10);
  });
});
