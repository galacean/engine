import { afterEach, describe, expect, it } from "vitest";
import { WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  Camera,
  Engine,
  MeshRenderer,
  ParticleCompositeCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleStopMode,
  PrimitiveMesh,
  RealtimeIBLBaker,
  RenderTarget,
  Shader,
  ShaderData,
  ShaderDataGroup,
  SunLensFlareEffect,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  UnlitMaterial,
  Vector4,
  VertexElement,
  VertexElementFormat,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";

import {
  EngineRoofFeedback
} from "../../../packages/building/src/building/runtime/EngineRoofFeedback";
import {
  buildBrickStorageFromFeedback
} from "../../../packages/building/src/building/runtime/BrickPackKernel";
import { GridUnitKernel } from "../../../packages/building/src/building/render/GridUnitKernel";

describe.skipIf(!navigator.gpu)("WebGPU native ComputeShader vs WebGL2 TransformFeedback parity", () => {
  const engines: Engine[] = [];

  afterEach(() => {
    for (const engine of engines) engine.destroy();
    engines.length = 0;
  });

  it("RealtimeSphericalHarmonicsGPU matches SH projection and blend between WebGL2 TF and WebGPU ComputeShader", async () => {
    const gl = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gl);
    const gpu = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gpu);
    const device = (gpu._hardwareRenderer as WebGPUGraphicDevice).device;
    device.pushErrorScope("validation");

    const faceColors: Array<[TextureCubeFace, [number, number, number, number]]> = [
      [TextureCubeFace.PositiveX, [255, 64, 32, 255]],
      [TextureCubeFace.NegativeX, [32, 200, 64, 255]],
      [TextureCubeFace.PositiveY, [64, 96, 255, 255]],
      [TextureCubeFace.NegativeY, [180, 140, 40, 255]],
      [TextureCubeFace.PositiveZ, [220, 40, 180, 255]],
      [TextureCubeFace.NegativeZ, [40, 220, 220, 255]]
    ];

    async function run(engine: Engine) {
      const cube = new TextureCube(engine, 4, TextureFormat.R8G8B8A8_UNorm, false, false);
      for (const [face, rgba] of faceColors) {
        const px = new Uint8Array(4 * 4 * 4);
        for (let i = 0; i < 16; i++) {
          px[i * 4] = rgba[0];
          px[i * 4 + 1] = rgba[1];
          px[i * 4 + 2] = rgba[2];
          px[i * 4 + 3] = rgba[3];
        }
        cube.setPixelBuffer(face, px);
      }
      const initial = new Float32Array(27);
      for (let i = 0; i < 27; i++) initial[i] = (i + 1) * 0.1;

      const baker = new RealtimeIBLBaker(engine.sceneManager.activeScene, { resolution: 32, sampleCount: 32 });
      const sh = (baker as unknown as { _gpuSphericalHarmonics: any })._gpuSphericalHarmonics;
      sh.resetCurrent(initial);
      sh.project(cube, 0);
      const projected = new Float32Array(36);
      await sh.currentBuffer.getDataAsync(projected);

      // Blend between initial buffer and newly projected buffer
      sh.resetCurrent(initial);
      const zeroBuf = sh.currentBuffer;
      sh.project(cube, 0);
      const projBuf = sh.currentBuffer;
      expect(projBuf).not.toBe(zeroBuf);

      sh.prepareBlend(zeroBuf, projBuf);
      const blendedBuf = sh.blend(0.35);
      const blended = new Float32Array(36);
      await blendedBuf.getDataAsync(blended);

      baker.destroy();
      cube.destroy();
      return { projected, blended };
    }

    const glRes = await run(gl);
    const gpuRes = await run(gpu);
    expect((await device.popErrorScope())?.message).toBeUndefined();

    expect(glRes.projected.some((v) => Math.abs(v) > 0.1)).toBe(true);
    for (let i = 0; i < 36; i++) {
      expect(gpuRes.projected[i], `projected[${i}]`).toBeCloseTo(glRes.projected[i], 4);
      expect(gpuRes.blended[i], `blended[${i}]`).toBeCloseTo(glRes.blended[i], 4);
    }
  });

  it("SunLensFlareCameraState visibility matches between WebGL2 TF and WebGPU ComputeShader with real depth texture", async () => {
    const gl = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gl);
    const gpu = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gpu);
    const device = (gpu._hardwareRenderer as WebGPUGraphicDevice).device;
    device.pushErrorScope("validation");

    async function run(engine: Engine) {
      // Render a scene with an opaque occluder covering the center of a 32x32 depth RT
      const root = engine.sceneManager.activeScene.createRootEntity();
      const camera = root.createChild().addComponent(Camera);
      camera.entity.transform.setPosition(0, 0, 5);
      const colorTex = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
      const depthTex = new Texture2D(engine, 32, 32, TextureFormat.Depth24Stencil8, false, false);
      camera.renderTarget = new RenderTarget(engine, 32, 32, colorTex, depthTex);

      const occluder = root.createChild();
      const mr = occluder.addComponent(MeshRenderer);
      mr.mesh = PrimitiveMesh.createPlane(engine, 1.0, 1.0);
      occluder.transform.setRotation(90, 0, 0);
      mr.setMaterial(new UnlitMaterial(engine));
      camera.render();
      // Unbind camera's render target so WebGL2 TF can sample `depthTex` without FBO feedback loop
      engine._hardwareRenderer.activeRenderTarget(null, new Vector4(0, 0, 32, 32), false);

      const visPass =
        (engine._builtinShaders.byName[SunLensFlareEffect._visibilityShaderName] ??
          Shader.find(SunLensFlareEffect._visibilityShaderName))?.subShaders[0]?.passes[0] ?? null;
      const state = (camera as unknown as { _renderPipeline: { _getOrCreateSunLensFlareCameraState(): any } })
        ._renderPipeline._getOrCreateSunLensFlareCameraState();
      const shaderData = new ShaderData(ShaderDataGroup.Renderer);
      const feedbackElements = [new VertexElement("a_PrevVisibility", 0, VertexElementFormat.Float, 0)];
      shaderData.setTexture(SunLensFlareEffect._tfDepthTextureProperty, depthTex);
      shaderData.setVector4(SunLensFlareEffect._tfDepthRectProperty, new Vector4(1, 1, 0, 0));

      // 1. Sample clear sky corner (0.05, 0.05) with blendFactor=1.0 -> visible (~1.0)
      shaderData.setVector4(SunLensFlareEffect._tfParams0Property, new Vector4(0.05, 0.05, 1.0, 0.012));
      shaderData.setVector4(SunLensFlareEffect._tfParams1Property, new Vector4(0.999998, 1.0, 0, 0));
      const b1 = state.updateVisibility(engine, visPass, shaderData, feedbackElements)!;
      const v1 = new Float32Array(1);
      await b1.buffer.getDataAsync(v1);

      // 2. Sample occluded center (0.5, 0.5) with blendFactor=0.5 -> temporal blend from 1.0 toward 0.0 (~0.5)
      shaderData.setVector4(SunLensFlareEffect._tfParams0Property, new Vector4(0.5, 0.5, 1.0, 0.012));
      shaderData.setVector4(SunLensFlareEffect._tfParams1Property, new Vector4(0.999998, 0.5, 0, 0));
      const b2 = state.updateVisibility(engine, visPass, shaderData, feedbackElements)!;
      const v2 = new Float32Array(1);
      await b2.buffer.getDataAsync(v2);

      state.destroy();
      return { sky: v1[0], occludedBlend: v2[0] };
    }

    const glRes = await run(gl);
    const gpuRes = await run(gpu);
    expect((await device.popErrorScope())?.message).toBeUndefined();

    expect(glRes.sky).toBeCloseTo(1.0, 3);
    expect(gpuRes.sky).toBeCloseTo(1.0, 3);
    expect(gpuRes.occludedBlend).toBeCloseTo(glRes.occludedBlend, 3);
    expect(gpuRes.occludedBlend).toBeLessThan(0.6);
  });

  it("Benchmark: Galacean 65,536-particle simulation parity & throughput (WebGL2 TF vs WebGPU ComputeShader)", async () => {
    const gl = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gl);
    const gpu = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gpu);
    const device = (gpu._hardwareRenderer as WebGPUGraphicDevice).device;
    device.pushErrorScope("validation");

    const COUNT = 65_536;
    const STEPS = 10;

    async function runParticleBench(engine: Engine, isWebGPU: boolean) {
      const entity = engine.sceneManager.activeScene.createRootEntity();
      const renderer = entity.addComponent(ParticleRenderer);
      renderer.setMaterial(new ParticleMaterial(engine));
      const g = renderer.generator;
      g.stop(false, ParticleStopMode.StopEmittingAndClear);
      g.main.maxParticles = COUNT;
      g.randomSeed = 777;
      g.emission.rateOverTime.constant = 0;
      g.main.simulationSpace = ParticleSimulationSpace.World;
      g.main.startLifetime.constant = 10;
      g.main.startSpeed.constant = 1.5;
      g.noise.strengthX.constant = 0.25;
      g.noise.enabled = true;
      g.limitVelocityOverLifetime.speed = new ParticleCompositeCurve(1.2);
      g.limitVelocityOverLifetime.dampen = 0.25;
      g.limitVelocityOverLifetime.enabled = true;
      g.velocityOverLifetime.orbitalY = new ParticleCompositeCurve(0.5);
      g.velocityOverLifetime.enabled = true;

      g.emit(COUNT);
      // Warmup 1 step (compiles program/pipeline)
      g._update(1 / 60);
      if (isWebGPU) {
        engine._hardwareRenderer.flush();
        await (engine._hardwareRenderer as WebGPUGraphicDevice).device.queue.onSubmittedWorkDone();
      } else {
        engine._hardwareRenderer.flush();
      }

      const start = performance.now();
      for (let s = 0; s < STEPS; s++) {
        g._update(1 / 60);
      }
      engine._hardwareRenderer.flush();
      if (isWebGPU) {
        await (engine._hardwareRenderer as WebGPUGraphicDevice).device.queue.onSubmittedWorkDone();
      } else {
        // Sync WebGL2 queue via 1-particle readback
        const sync = new Float32Array(6);
        await g._feedbackSimulator!.readBinding.buffer.getDataAsync(sync, 0);
      }
      const avgMs = (performance.now() - start) / STEPS;

      // Read first 16 particles for cross-backend numerical parity
      const sample = new Float32Array(16 * 6);
      await g._feedbackSimulator!.readBinding.buffer.getDataAsync(sample, 0);
      return { avgMs, sample };
    }

    const glRes = await runParticleBench(gl, false);
    const gpuRes = await runParticleBench(gpu, true);
    expect((await device.popErrorScope())?.message).toBeUndefined();

    for (let i = 0; i < glRes.sample.length; i++) {
      expect(gpuRes.sample[i], `particle float ${i}`).toBeCloseTo(glRes.sample[i], 2);
    }
    console.log(
      `[BENCH 4 | Galacean Particle 65,536 (Noise+Limit+Orbital)] WebGL2_TF=${glRes.avgMs.toFixed(3)}ms | WebGPU_ComputeShader=${gpuRes.avgMs.toFixed(3)}ms | ratio=${(glRes.avgMs / gpuRes.avgMs).toFixed(2)}x`
    );
  });

  it("Building kernels (EngineRoofFeedback, BrickPackKernel, GridUnitKernel) match bit-for-bit between WebGL2 TF and WebGPU ComputeShader", async () => {
    const gl = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    engines.push(gl);
    const gpu = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
    engines.push(gpu);
    const device = (gpu._hardwareRenderer as WebGPUGraphicDevice).device;
    device.pushErrorScope("validation");

    // 1. EngineRoofFeedback (2 records x 64 bytes = 128 bytes)
    const initRoof = new Uint32Array(32);
    const fView = new Float32Array(initRoof.buffer);
    fView[3] = 5.0; // record0.w = height 5.0
    initRoof[7] = 0x38000000; // record1.w upper half = 0.5
    initRoof[13] = 0x12345678; // record3.y = hash
    fView[19] = 3.0; // second record height 3.0
    initRoof[23] = 0x3c000000;
    initRoof[29] = 0x9abcdef0;

    async function runRoof(engine: Engine) {
      const fb = new EngineRoofFeedback(engine, initRoof);
      const binding = fb.step({
        first_instance: 0,
        instance_count: 2,
        dt: 0.016,
        wall_height_delta: -0.2,
        roof_pivot_y: 2.0,
        animation_t: 0.25
      });
      const out = new Uint32Array(32);
      await binding.buffer.getDataAsync(out);
      fb.destroy();
      return out;
    }
    const glRoof = await runRoof(gl);
    const gpuRoof = await runRoof(gpu);
    expect(Array.from(gpuRoof)).toEqual(Array.from(glRoof));

    // 2. BrickPackKernel on WebGPU ComputeShader (pack 2 bricks -> 8 RGBA32UI texels)
    const packData = new Float32Array(40);
    for (let i = 0; i < 40; i++) packData[i] = (i - 20) * 0.25;
    const gpuTex = buildBrickStorageFromFeedback(gpu, { kind: "pack", count: 2, slot: 3, data: packData });
    const gpuPack = new Uint32Array(8 * 4);
    await gpuTex.getPixelBufferAsync(0, 0, 8, 1, gpuPack);
    gpuTex.destroy();
    const packBits = new Uint32Array(packData.buffer);
    // Brick 0: result1.yzw = origin (packData[9..11]), result3.z = slot (3)
    expect(gpuPack[5]).toBe(packBits[9]);
    expect(gpuPack[6]).toBe(packBits[10]);
    expect(gpuPack[7]).toBe(packBits[11]);
    expect(gpuPack[14]).toBe(3);
    // Brick 1: result1.yzw = origin (packData[29..31]), result3.z = slot (3)
    expect(gpuPack[16 + 5]).toBe(packBits[29]);
    expect(gpuPack[16 + 6]).toBe(packBits[30]);
    expect(gpuPack[16 + 7]).toBe(packBits[31]);
    expect(gpuPack[16 + 14]).toBe(3);

    // 3. GridUnitKernel bit-for-bit parity between WebGL2 TF and WebGPU ComputeShader
    const gridInput = {
      bounds: [0, 2, 0, 1] as [number, number, number, number],
      grid: [0.5, 0.25, 0.25, 0] as [number, number, number, number],
      columns: [4, 0, 0, 4] as [number, number, number, number],
      oddEnd: 4,
      length: 2,
      strip: [0, 0, 1, 0] as [number, number, number, number],
      nominal: [0.5, 0.25, 0.2] as [number, number, number],
      rangeMin: [0.5, 0.5, 0.5] as [number, number, number],
      rangeMax: [1.5, 1.5, 1.5] as [number, number, number],
      gap: [0.02, 0.02, 0.25, 1] as [number, number, number, number],
      groundY: 1.5,
      slot: 1,
      seedState: 42,
      count: 16
    };
    async function runGrid(engine: Engine) {
      const k = new GridUnitKernel(engine, gridInput);
      const binding = k.run();
      const out = new Uint32Array(gridInput.count * 16);
      await binding.buffer.getDataAsync(out);
      k.destroy();
      return out;
    }
    const glGrid = await runGrid(gl);
    const gpuGrid = await runGrid(gpu);
    expect(glGrid.some((v) => v !== 0)).toBe(true);
    expect(Array.from(gpuGrid)).toEqual(Array.from(glGrid));

    expect((await device.popErrorScope())?.message).toBeUndefined();
  });
});
