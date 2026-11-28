import { Camera, WebGLEngine } from "@galacean/engine";
import { expect, it } from "vitest";
import { PipelinePassStage, type PipelinePass } from "../../../packages/core/src/RenderPipeline/PipelinePass";
import type { BasicRenderPipeline } from "../../../packages/core/src/RenderPipeline/BasicRenderPipeline";

it("observes pass registration changes at each invocation, including nested rendering", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const camera = engine.sceneManager.activeScene.createRootEntity().addComponent(Camera);
    const pipeline = camera._renderPipeline as unknown as BasicRenderPipeline;
    const stage = PipelinePassStage.AfterCulling;
    const calls: string[] = [];
    // The native override is loaded by the engine plugin in this browser build.
    const passEngine = engine as unknown as PipelinePass["engine"];
    const register = (onRender: PipelinePass["onRender"]) =>
      pipeline._registerPass(stage, { engine: passEngine, onRender });
    let lastFrame: Parameters<PipelinePass["onRender"]>;
    let changed = false;
    const first = register((context, results) => {
      lastFrame = [context, results];
      calls.push("first");
      if (changed) return;
      changed = true;
      second.unregister();
      second.unregister();
      register(() => calls.push("added"));
      pipeline["_renderRegisteredPasses"](stage, context, results);
    });
    const second = register(() => calls.push("removed"));
    register(() => calls.push("last"));
    engine.update();
    expect(calls).toEqual(["first", "first", "last", "added", "last"]);
    calls.length = 0;
    first.unregister();
    engine.update();
    expect(calls).toEqual(["last", "added"]);

    calls.length = 0;
    register(() => pipeline.destroy());
    register(() => calls.push("after destroy"));
    pipeline["_renderRegisteredPasses"](stage, ...lastFrame!);
    expect(calls).toEqual(["last", "added"]);
  } finally {
    engine.destroy();
  }
});
