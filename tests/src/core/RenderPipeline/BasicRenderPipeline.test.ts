import {
  Camera,
  DepthTextureMode,
  Entity,
  RenderTarget,
  Texture2D,
  TextureCubeFace,
  TextureFormat
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import type {
  PipelineFrameResources,
  PipelinePass,
  PipelineResourceRequirements
} from "../../../../packages/core/src/RenderPipeline/PipelinePass";
import type { CullingResults } from "../../../../packages/core/src/RenderPipeline/CullingResults";
import type { RenderContext } from "../../../../packages/core/src/RenderPipeline/RenderContext";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RequirementFlags = {
  None: 0 as PipelineResourceRequirements,
  FullDepth: (1 << 0) as PipelineResourceRequirements,
  OptionalFullDepth: (1 << 1) as PipelineResourceRequirements
};

describe("BasicRenderPipeline multi-stage PipelinePass contract", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let camera: Camera;

  beforeEach(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    engine = await WebGLEngine.create({ canvas });
    root = engine.sceneManager.activeScene.createRootEntity();
    const camEntity = root.createChild("cam");
    camEntity.transform.setPosition(0, 0, 5);
    camera = camEntity.addComponent(Camera);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    engine.destroy();
  });

  it("drives depth prepass from declared FullDepth requirements while treating OptionalFullDepth opportunistically", () => {
    const scene = engine.sceneManager.activeScene;
    camera.depthTextureMode = DepthTextureMode.None;
    camera.enableScreenSpaceReflection = false;
    scene.ambientOcclusion.enabled = false;

    const pipeline = camera._renderPipeline as any;
    const depthSpy = vi.spyOn(pipeline._depthOnlyPass, "onRender");

    // Baseline: no prepass-requiring stage passes active
    engine.update();
    expect(depthSpy).not.toHaveBeenCalled();

    // Standalone SSR declares OptionalFullDepth: must NOT force full-res DepthOnly prepass
    camera.enableScreenSpaceReflection = true;
    scene.screenSpaceReflection.enabled = true;
    engine.update();
    expect(pipeline._ssrPass).not.toBeNull();
    expect((pipeline._ssrPass as PipelinePass).getResourceRequirements?.(camera)).toBe(
      RequirementFlags.OptionalFullDepth
    );
    expect(depthSpy).not.toHaveBeenCalled();

    // Register a custom pass declaring FullDepth without editing BasicRenderPipeline.render
    camera.enableScreenSpaceReflection = false;
    scene.screenSpaceReflection.enabled = false;
    let enabled = true;
    let observedDepthTarget: RenderTarget | null = null;
    const observedEvents: string[] = [];

    const PipelinePassBase = Object.getPrototypeOf(pipeline._saoPass.constructor);
    class CustomPrepassEffect extends PipelinePassBase {
      override getResourceRequirements(): PipelineResourceRequirements {
        observedEvents.push("getResourceRequirements");
        return RequirementFlags.FullDepth;
      }
      override onPrepare(_context: RenderContext, _culling: CullingResults, resources: PipelineFrameResources): void {
        observedEvents.push(`onPrepare:${resources.isSubView}`);
      }
      override onPreForward(
        _context: RenderContext,
        _culling: CullingResults,
        resources: PipelineFrameResources
      ): void {
        observedDepthTarget = resources.fullDepthTarget;
        observedEvents.push("onPreForward");
      }
      override onPostTransparent(_context: RenderContext, resources: PipelineFrameResources): void {
        observedEvents.push(`onPostTransparent:${resources.resolvedColorTarget !== null}`);
      }
      override onDisable(): void {
        observedEvents.push("onDisable");
      }
      override onHistoryInvalidated(): void {
        observedEvents.push("onHistoryInvalidated");
      }
      override onDestroy(): void {
        observedEvents.push("onDestroy");
      }
    }

    const customPass = new CustomPrepassEffect(engine);
    pipeline._stagePassEntries.push({
      isEnabled: () => enabled,
      getOrCreate: () => customPass,
      getCurrent: () => customPass
    });

    camera.enableHDR = true; // Ensure internal resolvedColorTarget exists for PostTransparent stage
    engine.update();

    expect(depthSpy).toHaveBeenCalledTimes(1);
    expect(observedDepthTarget).not.toBeNull();
    expect(observedEvents).toEqual([
      "getResourceRequirements",
      "onPrepare:false",
      "onPreForward",
      "onPostTransparent:true"
    ]);

    // Sub-view flags propagate cleanly to onPrepare
    observedEvents.length = 0;
    const rtCube = new RenderTarget(
      engine,
      32,
      32,
      new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm),
      TextureFormat.Depth24
    );
    camera.renderTarget = rtCube;
    camera.render(TextureCubeFace.PositiveX, 1);
    expect(observedEvents[1]).toBe("onPrepare:true");
    camera.renderTarget = null;
    rtCube.destroy(true);

    // Disabling pass dispatches onDisable without running stage hooks or forcing depth prepass
    depthSpy.mockClear();
    observedEvents.length = 0;
    enabled = false;
    engine.update();
    expect(depthSpy).not.toHaveBeenCalled();
    expect(observedEvents).toEqual(["onDisable"]);

    // History invalidation and pipeline destruction dispatch generically
    observedEvents.length = 0;
    camera.notifyScreenSpaceReflectionCut();
    expect(observedEvents).toEqual(["onHistoryInvalidated"]);

    observedEvents.length = 0;
    camera.destroy();
    expect(observedEvents).toEqual(["onDestroy"]);
  });

  it("clears transient frame state when onPreForward throws, and cleans up SAO & lazy SSR lifecycle", () => {
    const pipeline = camera._renderPipeline as any;

    // Non-SSR camera preserves lazy _ssrPass = null even across notifyScreenSpaceReflectionCut()
    expect(pipeline._ssrPass).toBeNull();
    camera.notifyScreenSpaceReflectionCut();
    expect(pipeline._ssrPass).toBeNull();

    // Register a failing multi-stage pass and ensure finally cleanup executes deterministically
    const PipelinePassBase = Object.getPrototypeOf(pipeline._saoPass.constructor);
    class ThrowingStagePass extends PipelinePassBase {
      override getResourceRequirements(): PipelineResourceRequirements {
        return RequirementFlags.FullDepth;
      }
      override onPreForward(): void {
        throw new Error("Simulated stage failure");
      }
    }

    const throwingPass = new ThrowingStagePass(engine);
    pipeline._stagePassEntries.push({
      isEnabled: () => true,
      getOrCreate: () => throwingPass,
      getCurrent: () => throwingPass
    });

    expect(() => engine.update()).toThrow("Simulated stage failure");
    expect(pipeline._activeStagePasses.length).toBe(0);
    expect(pipeline._disabledStagePasses.length).toBe(0);
    expect(pipeline._frameResources.fullDepthTarget).toBeNull();
    expect(pipeline._frameResources.resolvedColorTarget).toBeNull();

    // Remove synthetic throwing entry so SAO lifecycle test proceeds cleanly
    pipeline._stagePassEntries.pop();

    // SAO enable -> disable -> destroy lifecycle unbinds camera_AOTexture and destroys SAO private material
    const scene = engine.sceneManager.activeScene;
    scene.ambientOcclusion.enabled = true;
    engine.update();
    const saoPass = pipeline._saoPass;
    expect(saoPass._saoRenderTarget).not.toBeNull();
    expect(camera.shaderData.getTexture("camera_AOTexture")).not.toBeNull();

    scene.ambientOcclusion.enabled = false;
    engine.update();
    expect(saoPass._saoRenderTarget).toBeNull();
    expect(saoPass._blurRenderTarget).toBeNull();
    expect(camera.shaderData.getPropertyValue((Camera as any)._cameraAOTextureProperty)).toBeNull();

    const saoMat = saoPass._material;
    expect(saoMat.destroyed).toBe(false);
    camera.destroy();
    expect(saoMat.destroyed).toBe(true);
  });
});
