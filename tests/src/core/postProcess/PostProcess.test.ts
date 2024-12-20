import { Color } from "@galacean/engine";
import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Engine,
  Entity,
  PostProcess,
  PostProcessEffect,
  PostProcessEffectParameter,
  PostProcessPass,
  RenderTarget,
  Scene,
  SphereColliderShape,
  StaticCollider,
  Texture2D,
  TonemappingEffect
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

class CustomPass extends PostProcessPass {
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {}
}

export class CustomEffect extends PostProcessEffect {
  intensity = new PostProcessEffectParameter(0, 0, 1, true);
}

describe("PostProcess", () => {
  let engine: Engine;
  let scene: Scene;
  let uberPass: PostProcessPass = null;
  let postEntity: Entity = null;
  let camera: Camera;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    scene = engine.sceneManager.scenes[0];
    const passes = engine.postProcessPasses;
    uberPass = passes[0];
    const cameraEntity = scene.createRootEntity("camera");
    camera = cameraEntity.addComponent(Camera);
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

    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    // Test effect
    const bloomEffect = pp.addEffect(BloomEffect);
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    bloomEffect.enabled = false;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    bloomEffect.enabled = true;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    bloomEffect.intensity.value = 1;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.true;

    // Test PostProcess disable
    pp.enabled = false;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    pp.enabled = true;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.true;

    // Test pass isActive
    uberPass.isActive = false;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    uberPass.isActive = true;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.true;

    // Test effect remove
    const removedBloomEffect = pp.removeEffect(BloomEffect);
    expect(removedBloomEffect).to.instanceOf(BloomEffect);
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    // Test component destroy
    pp.destroy();
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    // Test entity destroy
    {
      const pp = postEntity.addComponent(PostProcess);
      pp.addEffect(TonemappingEffect);
      engine.update();
      // @ts-ignore
      expect(ppManager._isValid()).to.true;

      postEntity.destroy();
      engine.update();
      // @ts-ignore
      expect(ppManager._isValid()).to.false;
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
    expect(activePostProcesses[1] === pp2).to.true;

    // Test priority
    pp1.priority = 10;
    engine.update();
    expect(activePostProcesses[1] === pp1).to.true;

    pp1.enabled = false;
    expect(activePostProcesses.length).to.equal(1);

    pp1.enabled = true;
    expect(activePostProcesses.length).to.equal(2);
  });

  it("Custom effect", () => {
    const pp = postEntity.addComponent(PostProcess);
    const customEffect = pp.addEffect(CustomEffect);

    expect(customEffect).to.instanceOf(CustomEffect);
    expect(customEffect.intensity.value).to.equal(0);

    // Clamp
    customEffect.intensity.value = 2;
    expect(customEffect.intensity.value).to.equal(1);

    customEffect.intensity.value = -2;
    expect(customEffect.intensity.value).to.equal(0);

    // isValid
    expect(customEffect.isValid()).to.true;
    customEffect.enabled = false;
    expect(customEffect.isValid()).to.false;
  });

  it("Post process effect parameter", () => {
    {
      const p1 = new PostProcessEffectParameter(1);
      const p2 = new PostProcessEffectParameter(2, 0, 1);
      const p3 = new PostProcessEffectParameter(-2, 0, 1);
      const p4 = new PostProcessEffectParameter(10, 0);
      const p5 = new PostProcessEffectParameter(-10, 0);
      const p6 = new PostProcessEffectParameter(0.5, 0, 1, true);

      expect(p1.value).to.equal(1);
      expect(p2.value).to.equal(1);
      expect(p3.value).to.equal(0);
      expect(p4.value).to.equal(10);
      expect(p5.value).to.equal(0);
      expect(p6.value).to.equal(0.5);
    }

    {
      const p1 = new PostProcessEffectParameter(false);
      const p2 = new PostProcessEffectParameter(true);
      const p3 = new PostProcessEffectParameter(true, true);

      expect(p1.value).to.equal(false);
      expect(p2.value).to.equal(true);
      expect(p3.value).to.equal(true);
    }
  });

  it("Global mode", () => {
    const ppManager = scene.postProcessManager;
    const pp1 = postEntity.addComponent(PostProcess);
    const pp2 = postEntity.addComponent(PostProcess);
    const bloom1 = pp1.addEffect(BloomEffect);
    const bloom2 = pp2.addEffect(BloomEffect);

    engine.update();

    const bloomBlend = ppManager.getBlendEffect(BloomEffect);
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

  it("Local mode", async () => {
    const pp1 = postEntity.addComponent(PostProcess);
    expect(pp1.blendDistance).to.equal(0);
    expect(pp1.isGlobal).to.equal(true);

    pp1.isGlobal = false;
    // Only support local PostProcess in physics enabled Scenes.
    expect(pp1.isGlobal).to.equal(true);

    {
      const engine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: new PhysXPhysics()
        // physics: new LitePhysics()
      });
      const scene = engine.sceneManager.scenes[0];
      const passes = engine.postProcessPasses;
      const ppManager = scene.postProcessManager;
      uberPass = passes[0];
      const cameraEntity = scene.createRootEntity("camera");
      const camera = cameraEntity.addComponent(Camera);
      camera.enablePostProcess = true;
      const postEntity = scene.createRootEntity("post-process");

      const pp1 = postEntity.addComponent(PostProcess);
      const pp2 = postEntity.addComponent(PostProcess);
      const bloom1 = pp1.addEffect(BloomEffect);
      const bloom2 = pp2.addEffect(BloomEffect);
      const intensity2 = 10;

      pp2.priority = 10;
      bloom2.intensity.value = intensity2;

      engine.update();
      const bloomBlend = ppManager.getBlendEffect(BloomEffect);

      expect(bloomBlend.intensity.value).to.equal(10);

      // Local mode
      const radius = 5;
      pp2.isGlobal = false;
      pp2.blendDistance = radius;
      const collider = postEntity.addComponent(StaticCollider);
      const physicsBox = new SphereColliderShape();
      physicsBox.radius = radius;
      collider.addShape(physicsBox);

      // Inside
      cameraEntity.transform.position.set(radius / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(intensity2);

      // Edge
      cameraEntity.transform.position.set(radius, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(intensity2);

      // Outer half in blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(intensity2 / 2);

      // Outside over blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(0);

      // Blend with local and global
      const intensity1 = 1;
      bloom1.intensity.value = intensity1;

      // Inside
      cameraEntity.transform.position.set(radius / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 1));

      // Edge
      cameraEntity.transform.position.set(radius, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 1));

      // Outer half in blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 0.5));

      // Outside over blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 0));

      engine.destroy();
    }
  });
});
