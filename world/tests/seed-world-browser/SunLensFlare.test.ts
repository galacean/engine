import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  DepthTextureMode,
  DirectLight,
  MeshRenderer,
  MSAASamples,
  PostProcess,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  SunLensFlareEffect,
  Texture2D,
  TextureFormat,
  TonemappingEffect,
  TonemappingMode,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  warmupSeedWorldShaderVariants
} from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";

const SIZE = 128;

function sampleRgb(pixels: Uint8Array, u: number, v: number): [number, number, number] {
  const x = Math.min(SIZE - 1, Math.max(0, Math.round(u * (SIZE - 1))));
  // Offscreen RenderTarget stores image top at texture row 0 (flipYBlitMesh maps v=0 to gl_Position.y=-1).
  const y = Math.min(SIZE - 1, Math.max(0, Math.round(v * (SIZE - 1))));
  const offset = (y * SIZE + x) * 4;
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
}

function maxLuminanceInRect(pixels: Uint8Array, u0: number, v0: number, u1: number, v1: number): number {
  const xStart = Math.max(0, Math.floor(Math.min(u0, u1) * (SIZE - 1)));
  const xEnd = Math.min(SIZE - 1, Math.ceil(Math.max(u0, u1) * (SIZE - 1)));
  const yStart = Math.max(0, Math.floor(Math.min(v0, v1) * (SIZE - 1)));
  const yEnd = Math.min(SIZE - 1, Math.ceil(Math.max(v0, v1) * (SIZE - 1)));
  let peak = 0;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const offset = (y * SIZE + x) * 4;
      const lum = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      if (lum > peak) peak = lum;
    }
  }
  return peak;
}

function maxChannelSpreadInRect(pixels: Uint8Array, u0: number, v0: number, u1: number, v1: number): number {
  const xStart = Math.max(0, Math.floor(Math.min(u0, u1) * (SIZE - 1)));
  const xEnd = Math.min(SIZE - 1, Math.ceil(Math.max(u0, u1) * (SIZE - 1)));
  const yStart = Math.max(0, Math.floor(Math.min(v0, v1) * (SIZE - 1)));
  const yEnd = Math.min(SIZE - 1, Math.ceil(Math.max(v0, v1) * (SIZE - 1)));
  let maxDiff = 0;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const offset = (y * SIZE + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const diff = Math.max(r, g, b) - Math.min(r, g, b);
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  return maxDiff;
}

function getUberPass(engine: WebGLEngine): any {
  return ((engine as any)._getActivePostProcessPasses() as any[]).find(
    (pass) => "_sunLensFlareLastCompositedViaBloom" in pass
  );
}

describe("SunLensFlareEffect GPU rendering", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    engine = await WebGLEngine.create({ canvas });
  });

  afterAll(() => {
    engine.destroy();
  });

  it("renders glare and optical-axis ghosts, stays dark when facing away, and respects depth occlusion", () => {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.02, 0.03, 0.05, 1);

    const sunEntity = scene.createRootEntity("Sun");
    const sun = sunEntity.addComponent(DirectLight);
    // Sun sits upper-left along (-0.24, 0.24, -1), so light propagates toward (0.24, -0.24, 1).
    const dirToSun = new Vector3(-0.24, 0.24, -1).normalize();
    sunEntity.transform.setPosition(0, 0, 0);
    sunEntity.transform.lookAt(new Vector3(-dirToSun.x, -dirToSun.y, -dirToSun.z));
    scene.sun = sun;

    const cameraEntity = scene.createRootEntity("Camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.fieldOfView = 60;
    camera.nearClipPlane = 0.1;
    camera.farClipPlane = 1000;
    camera.enableHDR = true;
    camera.enablePostProcess = true;
    cameraEntity.transform.setPosition(0, 0, 0);
    cameraEntity.transform.lookAt(new Vector3(0, 0, -1));

    const postEntity = scene.createRootEntity("PostProcess");
    const postProcess = postEntity.addComponent(PostProcess);
    postProcess.isGlobal = true;
    const flare = postProcess.addEffect(SunLensFlareEffect)!;
    flare.intensity.value = 1.0;
    flare.glareIntensity.value = 1.0;
    flare.ghostIntensity.value = 1.2;
    flare.depthOcclusion.value = true;
    flare.temporalSmoothing.value = 0;
    const tonemapping = postProcess.addEffect(TonemappingEffect)!;
    tonemapping.mode.value = TonemappingMode.ACES;

    const colorTex = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, true);
    const rt = new RenderTarget(engine, SIZE, SIZE, colorTex, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    const pixels = new Uint8Array(SIZE * SIZE * 4);
    const screenState = { visible: false, sunU: 0.5, sunV: 0.5, effectiveIntensity: 0, aspectRatio: 1 };
    const uberPass = getUberPass(engine);
    expect(uberPass).toBeDefined();

    // 1. Unoccluded view facing the sun: expect bright glare at sunUv and visible ghosts across center.
    SunLensFlareEffect._resolveScreenState(camera, scene, flare, screenState);
    expect(screenState.visible).toBe(true);
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);

    const sunCenterRgb = sampleRgb(pixels, screenState.sunU, screenState.sunV);
    const sunPeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    // Opposite quadrant across screen center should contain optical-axis ghosts.
    const ghostPeak = maxLuminanceInRect(pixels, 0.52, 0.52, 0.92, 0.92);
    // Corner away from sun & axis should preserve baseline background (no -0.04 black crush).
    const cornerRgb = sampleRgb(pixels, 0.95, 0.05);

    expect(sunCenterRgb[0]).toBeGreaterThan(120);
    expect(sunPeak).toBeGreaterThan(150);
    expect(ghostPeak).toBeGreaterThan(45);
    expect(cornerRgb[2]).toBeGreaterThan(20);
    // Optimization #1: Sole depth consumer uses 64x64 local sun depth patch instead of full-screen forward-resolve.
    expect((camera as any)._depthTextureSource).toBe("none");
    expect(uberPass._sunLensFlareLastDepthMode).toBe("patch");

    // Verify shared camera depth texture reuse when DepthTextureMode.PrePass is active.
    camera.depthTextureMode = DepthTextureMode.PrePass;
    engine.update();
    expect((camera as any)._depthTextureSource).toBe("prepass");
    expect(uberPass._sunLensFlareLastDepthMode).toBe("shared");
    camera.depthTextureMode = DepthTextureMode.None;

    // 2. Opaque occluder placed directly in front of the sun must hide glare & ghosts via depth occlusion.
    const occluderEntity = scene.createRootEntity("Occluder");
    const occluder = occluderEntity.addComponent(MeshRenderer);
    occluder.mesh = PrimitiveMesh.createCuboid(engine, 3, 3, 0.2);
    const occluderMat = new UnlitMaterial(engine);
    occluderMat.baseColor = new Color(0.02, 0.03, 0.05, 1);
    occluder.setMaterial(occluderMat);
    occluderEntity.transform.setPosition(dirToSun.x * 5, dirToSun.y * 5, dirToSun.z * 5);
    occluderEntity.transform.lookAt(new Vector3(0, 0, 0));

    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const occludedSunPeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    const occludedGhostPeak = maxLuminanceInRect(pixels, 0.52, 0.52, 0.92, 0.92);
    expect(occludedSunPeak).toBeLessThan(65);
    expect(occludedGhostPeak).toBeLessThan(65);

    // Disabling depth occlusion restores the flare even with the occluder present.
    flare.depthOcclusion.value = false;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const unoccludedOverridePeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    expect(unoccludedOverridePeak).toBeGreaterThan(150);

    // 3. Verify GPU Transform Feedback temporal smoothing damps abrupt occlusion transitions across frames.
    flare.depthOcclusion.value = true;
    flare.temporalSmoothing.value = 0.08;
    occluderEntity.isActive = false;
    (engine.time as any)._actualDeltaTime = 0.016;
    for (let i = 0; i < 4; i++) {
      scene.postProcessManager._update(camera);
      camera.render();
    }
    occluderEntity.isActive = true;
    (engine.time as any)._actualDeltaTime = 0.016;
    scene.postProcessManager._update(camera);
    camera.render();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const smoothedAfterOneFrame = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    expect(smoothedAfterOneFrame).toBeGreaterThan(100);

    for (let i = 0; i < 30; i++) {
      (engine.time as any)._actualDeltaTime = 0.016;
      scene.postProcessManager._update(camera);
      camera.render();
    }
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const smoothedConverged = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    expect(smoothedConverged).toBeLessThan(65);

    // 4. Verify Optimization #2: HDR Bloom reuse merges additive quads directly into Bloom's _mipUpRT[0] (0 flare RT VRAM).
    const bloom = postProcess.addEffect(BloomEffect)!;
    bloom.enabled = true;
    bloom.downScale.value = BloomDownScaleMode.Quarter;
    bloom.intensity.value = 0.35;
    bloom.threshold.value = 10.0;
    flare.temporalSmoothing.value = 0;
    occluderEntity.isActive = false;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);

    expect(uberPass._sunLensFlareLastCompositedViaBloom).toBe(true);
    expect(uberPass._sunLensFlareRT).toBeNull();
    const bloomMergedSunPeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    const bloomMergedGhostPeak = maxLuminanceInRect(pixels, 0.52, 0.52, 0.92, 0.92);
    expect(bloomMergedSunPeak).toBeGreaterThan(150);
    expect(bloomMergedGhostPeak).toBeGreaterThan(45);

    // Verify ColorAdjustments stage parity between Bloom-reuse and standalone RT fallback (monochrome grading).
    const colorAdjustments = postProcess.addEffect(ColorAdjustmentsEffect)!;
    colorAdjustments.saturation.value = -100;
    flare.ghostChromaticity.value = 1.0;

    bloom.intensity.value = 0.35; // BloomReuse path
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    expect(uberPass._sunLensFlareLastCompositedViaBloom).toBe(true);
    expect(maxChannelSpreadInRect(pixels, 0.52, 0.52, 0.92, 0.92)).toBeLessThanOrEqual(2);

    bloom.intensity.value = 0.04; // Standalone RT fallback path
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    expect(uberPass._sunLensFlareLastCompositedViaBloom).toBe(false);
    expect(maxChannelSpreadInRect(pixels, 0.52, 0.52, 0.92, 0.92)).toBeLessThanOrEqual(2);
    colorAdjustments.enabled = false;

    // Occluder still hides Bloom-merged flare via Transform Feedback + 64x64 depth patch.
    bloom.intensity.value = 0.35;
    occluderEntity.isActive = true;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const bloomMergedOccludedPeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    expect(bloomMergedOccludedPeak).toBeLessThan(65);
    bloom.enabled = false;

    // 5. Facing 180 degrees away from the sun disables the flare cleanly.
    flare.depthOcclusion.value = true;
    occluderEntity.isActive = false;
    cameraEntity.transform.lookAt(new Vector3(0, 0, 1));
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const awayPeak = maxLuminanceInRect(pixels, 0.05, 0.05, 0.95, 0.95);
    expect(awayPeak).toBeLessThan(65);

    // Confirm zero WebGL errors across TF, instanced quads, 64x64 depth patch, and Bloom RT reuse.
    const gl = (engine as any)._hardwareRenderer.gl as WebGL2RenderingContext;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    occluderMat.destroy();
    rt.destroy(true);
    scene.destroy();
  });

  it("isolates per-camera temporal smoothing across multiple cameras and cleans up TF/VAOs on camera destroy", () => {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.02, 0.03, 0.05, 1);

    const sunEntity = scene.createRootEntity("Sun");
    const sun = sunEntity.addComponent(DirectLight);
    const dirToSun = new Vector3(-0.24, 0.24, -1).normalize();
    sunEntity.transform.lookAt(new Vector3(-dirToSun.x, -dirToSun.y, -dirToSun.z));
    scene.sun = sun;

    const camA = scene.createRootEntity("CamA").addComponent(Camera);
    camA.enableHDR = true;
    camA.enablePostProcess = true;
    camA.entity.transform.lookAt(new Vector3(0, 0, -1));
    const texA = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, true);
    const rtA = new RenderTarget(engine, SIZE, SIZE, texA, TextureFormat.Depth24, 1);
    camA.renderTarget = rtA;

    const camB = scene.createRootEntity("CamB").addComponent(Camera);
    camB.enableHDR = true;
    camB.enablePostProcess = true;
    camB.entity.transform.lookAt(new Vector3(0, 0, 1)); // Facing away from sun
    const texB = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, true);
    const rtB = new RenderTarget(engine, SIZE, SIZE, texB, TextureFormat.Depth24, 1);
    camB.renderTarget = rtB;

    const post = scene.createRootEntity("Post").addComponent(PostProcess);
    post.isGlobal = true;
    const flare = post.addEffect(SunLensFlareEffect)!;
    flare.intensity.value = 1.0;
    flare.depthOcclusion.value = true;
    flare.temporalSmoothing.value = 0.08;
    post.addEffect(TonemappingEffect)!.mode.value = TonemappingMode.ACES;

    const occluderEntity = scene.createRootEntity("Occluder");
    const occluder = occluderEntity.addComponent(MeshRenderer);
    occluder.mesh = PrimitiveMesh.createCuboid(engine, 3, 3, 0.2);
    const occluderMat = new UnlitMaterial(engine);
    occluderMat.baseColor = new Color(0.02, 0.03, 0.05, 1);
    occluder.setMaterial(occluderMat);
    occluderEntity.transform.setPosition(dirToSun.x * 5, dirToSun.y * 5, dirToSun.z * 5);
    occluderEntity.transform.lookAt(new Vector3(0, 0, 0));

    const pixels = new Uint8Array(SIZE * SIZE * 4);
    const screenState = { visible: false, sunU: 0.5, sunV: 0.5, effectiveIntensity: 0, aspectRatio: 1 };
    SunLensFlareEffect._resolveScreenState(camA, scene, flare, screenState);

    // Interleave CamA and CamB every frame; CamB must NOT clobber CamA's temporal smoothing history.
    occluderEntity.isActive = false;
    for (let i = 0; i < 4; i++) {
      (engine.time as any)._actualDeltaTime = 0.016;
      scene.postProcessManager._update(camA);
      camA.render();
      scene.postProcessManager._update(camB);
      camB.render();
    }
    occluderEntity.isActive = true;
    (engine.time as any)._actualDeltaTime = 0.016;
    scene.postProcessManager._update(camA);
    camA.render();
    texA.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const multiCamSmoothedPeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    expect(multiCamSmoothedPeak).toBeGreaterThan(100);

    const pipelineA = (camA as any)._renderPipeline;
    expect(pipelineA._sunLensFlareCameraState).not.toBeNull();
    const cameraStateA = pipelineA._sunLensFlareCameraState;

    scene.destroy();
    // Camera-scoped TF simulator & VAOs are deterministically destroyed with BasicRenderPipeline.
    expect(pipelineA._sunLensFlareCameraState).toBeNull();
    expect(cameraStateA._visibilityTF).toBeNull();
    expect(cameraStateA._primitives.size).toBe(0);

    const gl = (engine as any)._hardwareRenderer.gl as WebGL2RenderingContext;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    occluderMat.destroy();
    rtA.destroy(true);
    rtB.destroy(true);
  });

  it("handles MSAA 4x standalone depth resolve without WebGL errors", () => {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.02, 0.03, 0.05, 1);

    const sunEntity = scene.createRootEntity("Sun");
    const sun = sunEntity.addComponent(DirectLight);
    const dirToSun = new Vector3(-0.24, 0.24, -1).normalize();
    sunEntity.transform.lookAt(new Vector3(-dirToSun.x, -dirToSun.y, -dirToSun.z));
    scene.sun = sun;

    const camera = scene.createRootEntity("MsaaCam").addComponent(Camera);
    camera.enableHDR = true;
    camera.enablePostProcess = true;
    camera.msaaSamples = MSAASamples.FourX;
    camera.entity.transform.lookAt(new Vector3(0, 0, -1));

    const post = scene.createRootEntity("Post").addComponent(PostProcess);
    post.isGlobal = true;
    const flare = post.addEffect(SunLensFlareEffect)!;
    flare.intensity.value = 1.0;
    flare.depthOcclusion.value = true;
    flare.temporalSmoothing.value = 0;
    post.addEffect(TonemappingEffect)!.mode.value = TonemappingMode.ACES;

    const colorTex = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, true);
    const rt = new RenderTarget(engine, SIZE, SIZE, colorTex, TextureFormat.Depth24, 4);
    camera.renderTarget = rt;

    const pixels = new Uint8Array(SIZE * SIZE * 4);
    const screenState = { visible: false, sunU: 0.5, sunV: 0.5, effectiveIntensity: 0, aspectRatio: 1 };
    SunLensFlareEffect._resolveScreenState(camera, scene, flare, screenState);

    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const unoccludedPeak = maxLuminanceInRect(
      pixels,
      screenState.sunU - 0.05,
      screenState.sunV - 0.05,
      screenState.sunU + 0.05,
      screenState.sunV + 0.05
    );
    expect(unoccludedPeak).toBeGreaterThan(150);
    expect((camera as any)._depthTextureSource).toBe("forward-resolve");

    const gl = (engine as any)._hardwareRenderer.gl as WebGL2RenderingContext;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    rt.destroy(true);
    scene.destroy();
  });

  it("skips WebGL2-only SunLensFlareVisibility TF shader when warming up on WebGL1", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const webgl1Engine = await WebGLEngine.create({
      canvas,
      graphicDeviceOptions: { webGLMode: WebGLMode.WebGL1 }
    });
    expect((webgl1Engine as any)._hardwareRenderer.isWebGL2).toBe(false);

    const scene = new Scene(webgl1Engine);
    webgl1Engine.sceneManager.activeScene = scene;
    const cam = scene.createRootEntity("Cam").addComponent(Camera);
    cam.enablePostProcess = true;

    const variants = collectSeedWorldRendererVariants(webgl1Engine, scene, cam, [], {
      postProcessState: {
        enabled: true,
        bloom: false,
        bloomHighQuality: false,
        bloomDirt: false,
        colorAdjustments: false,
        sunLensFlare: true,
        tonemappingMode: 1
      }
    });
    const flareVariants = variants.filter(
      (v) => v.shader === "PostProcess/SunLensFlare" || v.shader === "PostProcess/SunLensFlareVisibility"
    );
    expect(flareVariants.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(true);
    expect(flareVariants.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(false);

    const report = await warmupSeedWorldShaderVariants(webgl1Engine, flareVariants);
    expect(report.issues).toEqual([]);
    expect(report.compiled).toBeGreaterThan(0);

    // Control (WebGL2): both PostProcess/SunLensFlare and PostProcess/SunLensFlareVisibility (empty macros) are collected and warm up cleanly.
    const webgl2Scene = new Scene(engine);
    engine.sceneManager.activeScene = webgl2Scene;
    const webgl2Cam = webgl2Scene.createRootEntity("WebGL2Cam").addComponent(Camera);
    webgl2Cam.enablePostProcess = true;
    const webgl2Variants = collectSeedWorldRendererVariants(engine, webgl2Scene, webgl2Cam, [], {
      postProcessState: {
        enabled: true,
        bloom: false,
        bloomHighQuality: false,
        bloomDirt: false,
        colorAdjustments: false,
        sunLensFlare: true,
        tonemappingMode: 1
      }
    });
    const webgl2VisVariant = webgl2Variants.find((v) => v.shader === "PostProcess/SunLensFlareVisibility");
    expect(webgl2VisVariant).toBeDefined();
    expect(webgl2VisVariant!.macros).toEqual([]);
    const webgl2Report = await warmupSeedWorldShaderVariants(
      engine,
      webgl2Variants.filter(
        (v) => v.shader === "PostProcess/SunLensFlare" || v.shader === "PostProcess/SunLensFlareVisibility"
      )
    );
    expect(webgl2Report.issues).toEqual([]);
    webgl2Scene.destroy();

    scene.destroy();
    webgl1Engine.destroy();
  });
});
