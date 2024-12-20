import {
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

  afterAll(() => {
    engine.destroy();
    engine2.destroy();
  });

  it("internal uber pass", () => {
    const passes1 = engine.postProcessPasses;
    const passes2 = engine2.postProcessPasses;
    const uberPass1 = passes1[0];
    const uberPass2 = passes2[0];

    expect(passes1.length).to.eq(1);
    expect(uberPass1).to.instanceOf(PostProcessUberPass);
    expect(passes2.length).to.eq(1);
    expect(uberPass2).to.instanceOf(PostProcessUberPass);
  });

  it("can't cross engine", () => {
    const passes = engine.postProcessPasses;
    const uberPass = passes[0];

    expect(() => {
      engine2.addPostProcessPass(uberPass);
    }).toThrowError();
  });

  it("add pass", () => {
    const passes = engine.postProcessPasses;
    const customPass = new CustomPass(engine);
    const uberPass = passes[0];

    // Add same pass should not work
    engine.addPostProcessPass(uberPass);
    expect(passes.length).to.eq(1);

    // Add custom pass
    engine.addPostProcessPass(customPass);
    expect(passes.length).to.eq(2);

    // Set isActive
    customPass.isActive = false;
    expect(passes.length).to.eq(2);

    // Destroy
    customPass.destroy();
    expect(passes.length).to.eq(1);
  });

  it("active pass", () => {
    const customPass = new CustomPass(engine);

    // @ts-ignore
    expect(engine._getActivePostProcessPasses().length).to.eq(1);
    engine.addPostProcessPass(customPass);
    // @ts-ignore
    expect(engine._getActivePostProcessPasses().length).to.eq(2);

    customPass.isActive = false;
    // @ts-ignore
    expect(engine._getActivePostProcessPasses().length).to.eq(1);

    customPass.isActive = true;
    // @ts-ignore
    expect(engine._getActivePostProcessPasses().length).to.eq(2);

    customPass.isActive = false;
    // @ts-ignore
    expect(engine._getActivePostProcessPasses().length).to.eq(1);
  });

  it("pass event", () => {
    const uberPass = engine.postProcessPasses[0];
    const customPass = new CustomPass(engine);
    engine.addPostProcessPass(customPass);

    expect(customPass.event).to.eq(PostProcessPassEvent.AfterUber);
    // @ts-ignore
    expect(engine._getActivePostProcessPasses()[0] === uberPass).to.be.true;

    customPass.event = PostProcessPassEvent.BeforeUber;
    // @ts-ignore
    expect(engine._getActivePostProcessPasses()[0] === customPass).to.be.true;

    customPass.destroy();
    // @ts-ignore
    expect(engine._getActivePostProcessPasses()[0] === uberPass).to.be.true;
  });
});
