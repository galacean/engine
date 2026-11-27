import {
  BackgroundMode,
  Blitter,
  Camera,
  DepthTextureMode,
  Entity,
  PBRMaterial,
  PrimitiveMesh,
  MeshRenderer,
  RenderTarget,
  ScreenSpaceReflectionQuality,
  Shader,
  ShaderMacro,
  SkyBoxMaterial,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BasicRenderPipeline direct SSR & SAO integration", () => {
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
    camEntity.transform.setPosition(0, 1.5, 4);
    camEntity.transform.lookAt(new Vector3(0, 0, 0));
    camera = camEntity.addComponent(Camera);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (!engine.destroyed) {
      engine.destroy();
    }
  });

  it("eagerly creates _ssrPass without GPU allocations when disabled, shares DepthPrepass in DepthNormals mode for SSR + SAO, and cleans up on disable", () => {
    const scene = engine.sceneManager.activeScene;
    const pipeline = camera._renderPipeline as any;
    const depthSpy = vi.spyOn(pipeline._depthPrepass, "onRender");

    camera.depthTextureMode = DepthTextureMode.None;
    scene.ambientOcclusion.enabled = false;

    // Baseline: eager _ssrPass stays Disabled with no DepthOnly prepass when SSR is off
    engine.update();
    expect(depthSpy).not.toHaveBeenCalled();
    expect(pipeline._ssrPass).not.toBeNull();
    expect(pipeline._ssrPass._state).toBe("disabled");

    // Enabling SSR forces the shared DepthPrepass in DepthNormals mode (both color NormalRoughness and Depth)
    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    const floorEnt = root.createChild("floor");
    const floorMR = floorEnt.addComponent(MeshRenderer);
    floorMR.mesh = PrimitiveMesh.createPlane(engine, 6, 6);
    floorMR.setMaterial(floorMat);

    scene.screenSpaceReflection.enabled = true;
    engine.update();
    expect(pipeline._ssrPass._state).not.toBe("disabled");
    expect(depthSpy).toHaveBeenCalledTimes(1);
    expect(pipeline._depthPrepass.renderTarget?.getColorTexture(0)).not.toBeUndefined();
    expect(pipeline._depthPrepass.renderTarget?.depthTexture).not.toBeNull();

    // Enabling SAO alongside SSR still executes only one shared DepthPrepass per frame
    depthSpy.mockClear();
    scene.ambientOcclusion.enabled = true;
    engine.update();
    expect(depthSpy).toHaveBeenCalledTimes(1);
    const saoPass = pipeline._saoPass;
    expect(saoPass._saoRenderTarget).not.toBeNull();
    expect(camera.shaderData.getTexture("camera_AOTexture")).not.toBeNull();

    // Disabling SSR while SAO remains active reverts DepthPrepass back to depth-only (no color attachment)
    depthSpy.mockClear();
    scene.screenSpaceReflection.enabled = false;
    engine.update();
    expect(depthSpy).toHaveBeenCalledTimes(1);
    expect(pipeline._ssrPass._state).toBe("disabled");
    expect(pipeline._depthPrepass.renderTarget?.getColorTexture(0)).toBeNull();

    depthSpy.mockClear();
    scene.ambientOcclusion.enabled = false;
    engine.update();
    expect(depthSpy).not.toHaveBeenCalled();
    expect(saoPass._saoRenderTarget).toBeNull();
    expect(saoPass._blurRenderTarget).toBeNull();
  });

  it("cleans up transient SSR macros and bindings at frame-end, and destroys SSR on camera destroy", () => {
    const scene = engine.sceneManager.activeScene;
    const pipeline = camera._renderPipeline as any;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    const floorEnt = root.createChild("floor");
    const floorMR = floorEnt.addComponent(MeshRenderer);
    floorMR.mesh = PrimitiveMesh.createPlane(engine, 6, 6);
    floorMR.setMaterial(floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    engine.update();
    engine.update();
    const ssrPass = pipeline._ssrPass;
    expect(ssrPass._history.hasColorHistory).toBe(true);
    expect(camera.shaderData.getTexture("camera_SSRTexture")).toBeNull();
    expect(engine._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_ENABLE_SSR"))).toBe(false);
    expect(pipeline._internalColorTarget).toBeNull();

    const ssrMaterial = ssrPass._material;
    expect(ssrMaterial.destroyed).toBe(false);
    expect(pipeline._depthPrepass.renderTarget).not.toBeNull();
    camera.destroy();
    expect(ssrMaterial.destroyed).toBe(true);
    expect(pipeline._depthPrepass.renderTarget).toBeNull();
    expect(pipeline._ssrPass).toBeNull();
  });

  it("restores Blitter flipProjection and clears source texture binding after blit", () => {
    const pipeline = camera._renderPipeline as any;
    const context = engine._renderContext;

    camera.depthTextureMode = DepthTextureMode.None;
    const srcTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const dstTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const dstRT = new RenderTarget(engine, 16, 16, dstTex, null);

    // Trigger Blitter offscreen blit inside SSR preparation path via camera render
    const ssrPass = pipeline._ssrPass;
    const prepareSpy = vi.spyOn(ssrPass, "onPreForward").mockImplementation(() => {
      Blitter.blitTexture(engine, srcTex, dstRT);
    });
    const scene = engine.sceneManager.activeScene;
    scene.screenSpaceReflection.enabled = true;
    engine.update();
    expect(camera.shaderData.getVector4("camera_ProjectionParams").x).toBe(-1);
    camera.isOrthographic = true;
    engine.update();
    expect(camera.shaderData.getVector4("camera_ProjectionParams").x).toBe(-1);
    camera.isOrthographic = false;
    prepareSpy.mockRestore();
    scene.screenSpaceReflection.enabled = false;

    context.camera = camera;
    context.flipProjection = false;
    Blitter.blitTexture(engine, srcTex, dstRT);
    expect(context.flipProjection).toBe(false);
    expect((Blitter as any)._rendererShaderData.getTexture("renderer_BlitTexture")).toBeNull();
    context.camera = null!;
    dstRT.destroy(true);
    dstTex.destroy(true);
    srcTex.destroy(true);
  });

  it("scopes Forward SSR macros strictly to opaque and alpha-test queues without leaking to Sky, OpaqueTexturePass, transparent queue, or FinalPass", () => {
    const scene = engine.sceneManager.activeScene;
    const ssrForwardMacros = [
      ShaderMacro.getByName("CAMERA_ENABLE_SSR"),
      ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE"),
      ShaderMacro.getByName("CAMERA_DEPTH_NORMALS_PACKED_OCT8"),
      ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD")
    ];
    const hasAnySSRForwardMacro = (macros: any) => ssrForwardMacros.some((macro) => macros.isEnable(macro));

    const skyTex = new TextureCube(engine, 4);
    const skyMat = new SkyBoxMaterial(engine);
    skyMat.texture = skyTex;
    scene.background.mode = BackgroundMode.Sky;
    scene.background.sky.material = skyMat;
    scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    const opaqueMat = new PBRMaterial(engine);
    opaqueMat.roughness = 0.05;
    const opaqueEnt = root.createChild("opaqueFloor");
    const opaqueMR = opaqueEnt.addComponent(MeshRenderer);
    opaqueMR.mesh = PrimitiveMesh.createPlane(engine, 6, 6);
    opaqueMR.setMaterial(opaqueMat);

    const alphaTestMat = new PBRMaterial(engine);
    alphaTestMat.alphaCutoff = 0.5;
    alphaTestMat.roughness = 0.1;
    const alphaEnt = root.createChild("alphaTestBox");
    alphaEnt.transform.setPosition(1, 0.5, 0);
    const alphaMR = alphaEnt.addComponent(MeshRenderer);
    alphaMR.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    alphaMR.setMaterial(alphaTestMat);

    const transparentMat = new PBRMaterial(engine);
    transparentMat.isTransparent = true;
    transparentMat.roughness = 0.1;
    const transparentEnt = root.createChild("transparentBox");
    transparentEnt.transform.setPosition(-1, 0.5, 0);
    const transparentMR = transparentEnt.addComponent(MeshRenderer);
    transparentMR.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    transparentMR.setMaterial(transparentMat);

    camera.opaqueTextureEnabled = true;
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;

    const pbrForwardPass = Shader.find("PBR")!.subShaders[0].passes.find(
      (p) => p.getTagValue("pipelineStage") === "Forward"
    )!;
    const skyPass = skyMat.shader.subShaders[0].passes[0];
    const blitPass = (engine as any)._basicResources.blitMaterial.shader.subShaders[0].passes[0];
    const finalPass = Shader.find("PostProcess/FinalSRGB")!.subShaders[0].passes[0];

    const transparentMacro = ShaderMacro.getByName("MATERIAL_IS_TRANSPARENT");
    const alphaCutoffMacro = ShaderMacro.getByName("MATERIAL_IS_ALPHA_CUTOFF");
    const enableSSRMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
    const bilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");

    const origPBR = pbrForwardPass._getShaderProgram.bind(pbrForwardPass);
    const origSky = skyPass._getShaderProgram.bind(skyPass);
    const origBlit = blitPass._getShaderProgram.bind(blitPass);
    const origFinal = finalPass._getShaderProgram.bind(finalPass);

    const seen = {
      opaqueSSR: false,
      alphaTestSSR: false,
      transparentCalled: false,
      transparentLeaked: false,
      skyCalled: false,
      skyLeaked: false,
      blitCalled: false,
      blitLeaked: false,
      finalCalled: false,
      finalLeaked: false
    };

    vi.spyOn(pbrForwardPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      if (macros.isEnable(transparentMacro)) {
        seen.transparentCalled = true;
        if (hasAnySSRForwardMacro(macros)) seen.transparentLeaked = true;
      } else if (macros.isEnable(alphaCutoffMacro)) {
        if (macros.isEnable(enableSSRMacro) && macros.isEnable(bilateralMacro)) seen.alphaTestSSR = true;
      } else {
        if (macros.isEnable(enableSSRMacro) && macros.isEnable(bilateralMacro)) seen.opaqueSSR = true;
      }
      return origPBR(eng, macros);
    });
    vi.spyOn(skyPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      seen.skyCalled = true;
      if (hasAnySSRForwardMacro(macros)) seen.skyLeaked = true;
      return origSky(eng, macros);
    });
    vi.spyOn(blitPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      seen.blitCalled = true;
      if (hasAnySSRForwardMacro(macros)) seen.blitLeaked = true;
      return origBlit(eng, macros);
    });
    vi.spyOn(finalPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      seen.finalCalled = true;
      if (hasAnySSRForwardMacro(macros)) seen.finalLeaked = true;
      return origFinal(eng, macros);
    });

    // Frame 1: WarmupColor, Frame 2: FirstTrace, Frame 3: ActiveSteady
    engine.update();
    engine.update();
    engine.update();

    expect(seen.opaqueSSR).toBe(true);
    expect(seen.alphaTestSSR).toBe(true);
    expect(seen.transparentCalled).toBe(true);
    expect(seen.transparentLeaked).toBe(false);
    expect(seen.skyCalled).toBe(true);
    expect(seen.skyLeaked).toBe(false);
    expect(seen.blitCalled).toBe(true);
    expect(seen.blitLeaked).toBe(false);
    expect(seen.finalCalled).toBe(true);
    expect(seen.finalLeaked).toBe(false);

    skyMat.destroy();
    skyTex.destroy(true);
  });

  it("skips SSR pre-forward, resolve blit, post-transparent, and frame-end hooks when onPrepare returns false", () => {
    const scene = engine.sceneManager.activeScene;
    const pipeline = camera._renderPipeline as any;
    const ssrPass = pipeline._ssrPass;

    const colorTex = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
    const customRT = new RenderTarget(engine, 64, 64, colorTex, TextureFormat.Depth24Stencil8);
    const unlitMat = new UnlitMaterial(engine);
    camera.renderTarget = customRT;
    scene.screenSpaceReflection.enabled = true;

    const resolveSpy = vi.spyOn(customRT, "_blitRenderTarget");
    const preForwardSpy = vi.spyOn(ssrPass, "onPreForward");
    const beginSamplingSpy = vi.spyOn(ssrPass, "beginForwardSampling");
    const endSamplingSpy = vi.spyOn(ssrPass, "endForwardSampling");
    const postTransparentSpy = vi.spyOn(ssrPass, "onPostTransparent");
    const frameEndSpy = vi.spyOn(ssrPass, "onFrameEnd");

    camera.setReplacementShader(unlitMat.shader);
    engine.update();
    expect(ssrPass._state).toBe("skipped");
    // Only the end-of-pass cameraRenderTarget resolve runs; skipped SSR must not resolve early before post-transparent.
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(preForwardSpy).not.toHaveBeenCalled();
    expect(beginSamplingSpy).not.toHaveBeenCalled();
    expect(endSamplingSpy).not.toHaveBeenCalled();
    expect(postTransparentSpy).not.toHaveBeenCalled();
    expect(frameEndSpy).not.toHaveBeenCalled();

    resolveSpy.mockClear();
    camera.resetReplacementShader();
    camera.render(TextureCubeFace.PositiveX);
    expect(ssrPass._state).toBe("skipped");
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(preForwardSpy).not.toHaveBeenCalled();
    expect(beginSamplingSpy).not.toHaveBeenCalled();
    expect(endSamplingSpy).not.toHaveBeenCalled();
    expect(postTransparentSpy).not.toHaveBeenCalled();
    expect(frameEndSpy).not.toHaveBeenCalled();

    unlitMat.destroy();
    customRT.destroy(true);
    colorTex.destroy(true);
  });
});
