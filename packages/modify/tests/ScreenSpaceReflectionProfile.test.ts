import {
  Camera,
  CameraClearFlags,
  Color,
  CompareFunction,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderStateElementKey,
  Scene,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionContent as Content,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureFormat,
  RenderTarget,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect, it } from "vitest";
const SIZE = 256;
const FRAMES = 12;
interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}
it("records SSR stages and compares the old and new Surface depth policies", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.4, 0.4, 0.4, 1);
    scene.screenSpaceReflection.apply({
      activationMode: Activation.ForceOn,
      receiverPolicy: Policy.ExplicitOnly,
      reflectionContent: Content.OpaqueAndTransparent,
      resolutionScale: 0.5,
      upsamplingMode: Upsampling.GaussianBilateral
    });
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(3, 2.5, 6);
    camera.entity.transform.lookAt(new Vector3());
    camera.renderTarget = new RenderTarget(
      engine,
      SIZE,
      SIZE,
      new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false),
      TextureFormat.Depth24
    );
    const floor = scene.createRootEntity().addComponent(MeshRenderer);
    floor.mesh = PrimitiveMesh.createPlane(engine, 20, 20);
    const mirror = new PBRMaterial(engine);
    mirror.roughness = 0.05;
    mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
    floor.setMaterial(mirror);
    for (let i = 0; i < 8; i++) {
      const box = scene.createRootEntity().addComponent(MeshRenderer);
      box.mesh = PrimitiveMesh.createCuboid(engine, 2, 1, 2);
      box.entity.transform.setPosition(((i % 4) - 2) * 2, 0.5, Math.floor(i / 4) * 2);
      const mat = new PBRMaterial(engine);
      mat.screenSpaceReflection = { mode: "Off", intensity: 0 };
      mat.emissiveColor.set(0.8, 0.1, 0.1, 1);
      box.setMaterial(mat);
      if (i === 0) {
        mat.isTransparent = true;
        mat.baseColor.a = 0.5;
        mat.contributeScreenSpaceReflection = true;
      }
    }
    const rhi = (
      engine as unknown as {
        _hardwareRenderer: {
          gl: WebGL2RenderingContext;
          blitInternalRTByBlitFrameBuffer(...args: unknown[]): void;
          clearRenderTarget(...args: unknown[]): void;
        };
      }
    )._hardwareRenderer;
    const gl = rhi.gl;
    const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const pipeline = (
      camera as unknown as {
        _renderPipeline: {
          constructor: { _screenSpaceReflectionSurfaceStates: Record<number, number | boolean> };
          _screenSpaceReflectionPass: { beginSurface(...args: unknown[]): boolean };
        };
      }
    )._renderPipeline;
    const pass = pipeline._screenSpaceReflectionPass;
    const beginSurface = pass.beginSurface;
    const copyDepth = rhi.blitInternalRTByBlitFrameBuffer;
    const clear = rhi.clearRenderTarget;
    const surfaceStates = pipeline.constructor._screenSpaceReflectionSurfaceStates;
    const originalStates = { ...surfaceStates };
    const originalProfiler = camera.screenSpaceReflection.profiler;
    const pendingQueries = new Set<WebGLQuery>();
    let activeQuery: WebGLQuery | null = null;
    const reports: object[] = [];
    try {
      for (let i = 0; i < 40; i++) {
        engine.update();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      for (const policy of [
        "independent-depth",
        "opaque-depth-copy",
        "opaque-depth-copy",
        "independent-depth"
      ] as const) {
        // Controlled counterfactual: reproduce the old empty Surface depth policy, keeping all other fixes identical.
        pass.beginSurface = function (...args) {
          if (policy === "opaque-depth-copy") return Reflect.apply(beginSurface, this, args);
          rhi.blitInternalRTByBlitFrameBuffer = () => {};
          rhi.clearRenderTarget = (...clearArgs) => {
            clearArgs[1] = CameraClearFlags.ColorDepth;
            Reflect.apply(clear, rhi, clearArgs);
          };
          try {
            return Reflect.apply(beginSurface, this, args);
          } finally {
            rhi.blitInternalRTByBlitFrameBuffer = copyDepth;
            rhi.clearRenderTarget = clear;
          }
        };
        pipeline.constructor._screenSpaceReflectionSurfaceStates[RenderStateElementKey.DepthStateCompareFunction] =
          policy === "independent-depth" ? CompareFunction.Less : CompareFunction.LessEqual;
        for (let i = 0; i < 3; i++) engine.update();
        const samples: { stage: string; cpu: number; query: WebGLQuery | null; gpu?: number }[] = [];
        let current: (typeof samples)[number] | undefined;
        let start = 0;
        camera.screenSpaceReflection.profiler = {
          beginSample(stage) {
            expect(current, "profiler scopes must not overlap").toBeUndefined();
            current = { stage, cpu: 0, query: extension ? gl.createQuery() : null };
            if (current.query) {
              pendingQueries.add(current.query);
              activeQuery = current.query;
              gl.beginQuery(extension!.TIME_ELAPSED_EXT, current.query);
            }
            start = performance.now();
          },
          endSample() {
            expect(current, "endSample must have a matching beginSample").toBeDefined();
            const sample = current!;
            sample.cpu = performance.now() - start;
            if (sample.query) gl.endQuery(extension!.TIME_ELAPSED_EXT);
            activeQuery = null;
            samples.push(sample);
            current = undefined;
          }
        };
        for (let i = 0; i < FRAMES; i++) {
          engine.update();
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        camera.screenSpaceReflection.profiler = null;
        const metrics = { ...camera.screenSpaceReflection.metrics };
        expect(current, "all profiler scopes must be closed after a frame").toBeUndefined();
        expect(metrics.effective).toBe(true);
        expect(metrics.tracePassCount).toBeGreaterThan(0);
        expect(metrics.contributionColorDrawCount).toBeGreaterThan(0);
        expect(metrics.contributionDepthDrawCount).toBeGreaterThan(0);
        expect(samples.filter(({ stage }) => stage === "trace")).toHaveLength(FRAMES * metrics.tracePassCount);
        expect(samples.filter(({ stage }) => stage === "surface")).toHaveLength(FRAMES);
        expect(samples.filter(({ stage }) => stage === "composite")).toHaveLength(FRAMES * metrics.compositePassCount);
        expect(samples.map(({ stage }) => stage)).toEqual(
          expect.arrayContaining(["contribution-color", "contribution-depth"])
        );
        if (extension) {
          for (
            let attempt = 0;
            attempt < 100 && samples.some((s) => s.query && !gl.getQueryParameter(s.query, gl.QUERY_RESULT_AVAILABLE));
            attempt++
          )
            await new Promise((resolve) => setTimeout(resolve, 10));
          const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
          for (const sample of samples) {
            if (sample.query && !disjoint && gl.getQueryParameter(sample.query, gl.QUERY_RESULT_AVAILABLE))
              sample.gpu = gl.getQueryParameter(sample.query, gl.QUERY_RESULT) / 1e6;
            if (sample.query) {
              gl.deleteQuery(sample.query);
              pendingQueries.delete(sample.query);
            }
          }
        }
        const stages = [...new Set(samples.map((s) => s.stage))].map((stage) => {
          const rows = samples.filter((s) => s.stage === stage);
          return {
            stage,
            samples: rows.length,
            cpuMs: rows.reduce((sum, s) => sum + s.cpu, 0) / rows.length,
            gpuMs: rows.every((s) => s.gpu !== undefined)
              ? rows.reduce((sum, s) => sum + s.gpu!, 0) / rows.length
              : null
          };
        });
        reports.push({
          policy,
          frames: FRAMES,
          stages,
          metrics,
          samples: samples.map(({ stage, cpu, gpu }) => ({ stage, cpu, gpu }))
        });
      }
    } finally {
      camera.screenSpaceReflection.profiler = originalProfiler;
      pass.beginSurface = beginSurface;
      rhi.blitInternalRTByBlitFrameBuffer = copyDepth;
      rhi.clearRenderTarget = clear;
      for (const key of Object.keys(surfaceStates)) delete surfaceStates[Number(key)];
      Object.assign(surfaceStates, originalStates);
      if (activeQuery) gl.endQuery(extension!.TIME_ELAPSED_EXT);
      for (const query of pendingQueries) gl.deleteQuery(query);
    }
    expect(surfaceStates).toEqual(originalStates);
    expect(pass.beginSurface).toBe(beginSurface);
    expect(camera.screenSpaceReflection.profiler).toBe(originalProfiler);
    console.info(
      "SSR_PROFILE=" + JSON.stringify({ renderer, timerAvailable: !!extension, width: SIZE, height: SIZE, reports })
    );
    expect(gl.getError()).toBe(0);
  } finally {
    engine.destroy();
  }
});
