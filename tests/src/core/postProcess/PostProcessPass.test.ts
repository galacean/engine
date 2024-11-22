import {
  BloomEffect,
  Camera,
  Engine,
  PostProcessPass,
  PostProcessPassEvent,
  PostProcessUberPass,
  RenderTarget,
  Scene,
  Texture2D
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";

class CustomPass extends PostProcessPass {
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {}
}

describe("PostProcessPass", () => {
  let engine: Engine;
  let engine2: Engine;
  let scene1: Scene;
  let scene2: Scene;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine2 = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    scene1 = engine.sceneManager.scenes[0];
    scene2 = new Scene(engine);
    engine.sceneManager.addScene(scene2);
    engine.run();
  });

  it("internal uber pass", () => {
    const passes1 = scene1.postProcessManager.postProcessPasses;
    const passes2 = scene2.postProcessManager.postProcessPasses;
    const uberPass1 = passes1[0];
    const uberPass2 = passes2[0];

    expect(passes1.length).to.eq(1);
    expect(uberPass1).to.instanceOf(PostProcessUberPass);
    expect(passes2.length).to.eq(1);
    expect(uberPass2).to.instanceOf(PostProcessUberPass);
  });

  it("can't cross engine", () => {
    const passes = scene1.postProcessManager.postProcessPasses;
    const uberPass = passes[0];

    expect(() => {
      engine2.sceneManager.scenes[0].postProcessManager.addPostProcessPass(uberPass);
    }).toThrowError();
  });

  it("add pass", () => {
    const passes1 = scene1.postProcessManager.postProcessPasses;
    const passes2 = scene2.postProcessManager.postProcessPasses;
    const uberPass1 = passes1[0];

    // Add same pass should not work
    scene1.postProcessManager.addPostProcessPass(uberPass1);
    expect(passes1.length).to.eq(1);

    // move uberPass from scene1 to scene2
    scene2.postProcessManager.addPostProcessPass(uberPass1);
    expect(passes1.length).to.eq(0);
    expect(passes2.length).to.eq(2);

    // revert uberPass
    scene1.postProcessManager.addPostProcessPass(uberPass1);
    expect(passes1.length).to.eq(1);
    expect(passes2.length).to.eq(1);
  });

  it("destroy", () => {
    const passes1 = scene1.postProcessManager.postProcessPasses;
    const customPass = new CustomPass(engine);

    scene1.postProcessManager.addPostProcessPass(customPass);
    expect(passes1.length).to.eq(2);

    customPass.destroy();
    expect(passes1.length).to.eq(1);
  });

  it("active pass", () => {
    // @ts-ignore
    const passes1 = scene1.postProcessManager._activePostProcessPasses;
    const customPass = new CustomPass(engine);

    expect(passes1.length).to.eq(1);
    scene1.postProcessManager.addPostProcessPass(customPass);
    expect(passes1.length).to.eq(2);

    customPass.isActive = false;
    expect(passes1.length).to.eq(1);

    customPass.isActive = true;
    expect(passes1.length).to.eq(2);

    customPass.isActive = false;
    customPass.destroy();
    expect(passes1.length).to.eq(1);
  });

  it("pass event", () => {
    // @ts-ignore
    const passes1 = scene1.postProcessManager._activePostProcessPasses;
    const uberPass = scene1.postProcessManager.postProcessPasses[0];
    const customPass = new CustomPass(engine);
    scene1.postProcessManager.addPostProcessPass(customPass);

    expect(customPass.event).to.eq(PostProcessPassEvent.AfterUber);
    expect(passes1[0] === uberPass).to.be.true;

    customPass.event = PostProcessPassEvent.BeforeUber;
    // @ts-ignore
    scene1.postProcessManager._sortActivePostProcessPass();
    expect(passes1[0] === customPass).to.be.true;

    customPass.destroy();
    expect(passes1[0] === uberPass).to.be.true;

    const bloomBlend = customPass.getBlendEffect(BloomEffect);
    expect(bloomBlend).toBeUndefined;
  });
});
