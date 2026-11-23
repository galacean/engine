import {
  Blitter,
  BloomEffect,
  Camera,
  CameraClearFlags,
  Material,
  MeshRenderer,
  MSAASamples,
  PostProcess,
  PrimitiveMesh,
  RenderPassDescriptor,
  RenderTarget,
  RenderTargetLoadAction,
  RenderTargetStoreAction,
  Shader,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { HeadlessEngine } from "@galacean/engine-rhi-null";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Blitter & RHI TBDR Load/Store Actions", () => {
  let engine: WebGLEngine;
  let headless: HeadlessEngine;
  let gl: WebGL2RenderingContext;
  let camera: Camera;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    headless = await HeadlessEngine.create();
    // @ts-ignore
    gl = engine._hardwareRenderer.gl;
    const scene = engine.sceneManager.scenes[0];
    const camEntity = scene.createRootEntity("camera");
    camEntity.transform.setPosition(0, 0, 10);
    camera = camEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    engine.update();
  });

  afterAll(() => {
    engine?.destroy();
    headless?.destroy();
  });

  it("scissor compares against active render target bounds instead of canvas size", () => {
    // @ts-ignore
    const rhi = engine._hardwareRenderer;
    const scissorSpy = vi.spyOn(gl, "scissor");

    const smallTex = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const largeTex = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8_UNorm, false, false);
    const smallRT = new RenderTarget(engine, 32, 32, smallTex, null, 1);
    const largeRT = new RenderTarget(engine, 128, 128, largeTex, null, 1);

    try {
      const fullViewport = new Vector4(0, 0, 1, 1);
      const quarterViewport = new Vector4(0, 0, 0.5, 0.5);

      // 1. Full-viewport activation on a 32x32 offscreen RT (canvas is 64x64) keeps SCISSOR_TEST disabled
      scissorSpy.mockClear();
      rhi.activeRenderTarget(smallRT, fullViewport, true, 0);
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);
      expect(scissorSpy).not.toHaveBeenCalled();

      // 2. Sub-viewport on 128x128 RT whose pixel rect (0,0,64,64) equals canvas size still enables SCISSOR_TEST
      scissorSpy.mockClear();
      rhi.activeRenderTarget(largeRT, quarterViewport, true, 0);
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
      expect(scissorSpy).toHaveBeenCalledWith(0, 0, 64, 64);

      // 3. Switching to 64x64 default canvas with identical rect (0,0,64,64) disables SCISSOR_TEST (now full target)
      rhi.activeRenderTarget(null, fullViewport, false, 0);
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);

      // 4. Switching back to 128x128 RT with identical rect (0,0,64,64) re-enables SCISSOR_TEST (now sub-target)
      scissorSpy.mockClear();
      rhi.activeRenderTarget(largeRT, quarterViewport, true, 0);
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
      expect(scissorSpy).toHaveBeenCalledWith(0, 0, 64, 64);

      // 5. Full-viewport on 128x128 RT disables SCISSOR_TEST
      rhi.activeRenderTarget(largeRT, fullViewport, true, 0);
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      scissorSpy.mockRestore();
      smallRT.destroy();
      largeRT.destroy();
      smallTex.destroy();
      largeTex.destroy();
    }
  });

  it("beginRenderPass/endRenderPass apply Load/Store actions with independent depth/stencil, gl.clear on Load, invalidateFramebuffer on Store, Adreno split, and backbuffer/driver guards", () => {
    // @ts-ignore
    const rhi = engine._hardwareRenderer;
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");
    const clearSpy = vi.spyOn(gl, "clear");
    const desc = new RenderPassDescriptor();

    const colorTex0 = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const colorTex1 = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const depthTex = new Texture2D(engine, 32, 32, TextureFormat.Depth24, false, false);
    const singleRT = new RenderTarget(engine, 32, 32, colorTex0, TextureFormat.Depth24Stencil8, 1);
    const colorOnlyRT = new RenderTarget(engine, 32, 32, colorTex0, null, 1);
    const mrtRT = new RenderTarget(engine, 32, 32, [colorTex0, colorTex1], null, 1);
    const depthOnlyRT = new RenderTarget(engine, 32, 32, null, depthTex, 1);

    try {
      const fullViewport = new Vector4(0, 0, 1, 1);
      const halfViewport = new Vector4(0.5, 0, 0.5, 1);
      while (gl.getError() !== gl.NO_ERROR);

      // Default Load/Store is a no-op with no GL error
      invSpy.mockClear();
      clearSpy.mockClear();
      rhi.beginRenderPass(desc.reset(singleRT, fullViewport, true));
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Default WebGL backbuffer (null with _mainFrameBuffer === null): Load Clear works, Store Discard is skipped
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(null, fullViewport, false);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      desc.clearColor.set(0.1, 0.2, 0.3, 1);
      desc.colorStoreAction = RenderTargetStoreAction.Discard;
      desc.depthLoadAction = RenderTargetLoadAction.Clear;
      desc.depthStoreAction = RenderTargetStoreAction.Discard;
      desc.stencilLoadAction = RenderTargetLoadAction.Clear;
      desc.stencilStoreAction = RenderTargetStoreAction.Discard;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

      // Sub-viewport beginRenderPass honors Clear clipped by SCISSOR_TEST (for split-screen cameras)
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(singleRT, halfViewport, true);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);

      // Single-color Depth24Stencil8 FBO: color Load Clear -> gl.clear(COLOR_BUFFER_BIT) with SCISSOR_TEST off, never invalidateFramebuffer
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(singleRT, fullViewport, true);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Independent depth Clear (stencil Load) -> clears ONLY DEPTH_BUFFER_BIT
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(singleRT, fullViewport, true);
      desc.depthLoadAction = RenderTargetLoadAction.Clear;
      desc.clearDepth = 0.5;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Independent stencil Clear (depth Load) -> clears ONLY STENCIL_BUFFER_BIT
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(singleRT, fullViewport, true);
      desc.stencilLoadAction = RenderTargetLoadAction.Clear;
      desc.clearStencil = 7;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.STENCIL_BUFFER_BIT);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Independent depth Store + stencil Discard -> invalidates ONLY STENCIL_ATTACHMENT on endRenderPass
      invSpy.mockClear();
      desc.reset(singleRT, fullViewport, true);
      desc.depthStoreAction = RenderTargetStoreAction.Store;
      desc.stencilStoreAction = RenderTargetStoreAction.Discard;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.STENCIL_ATTACHMENT]);

      // Independent depth Discard + stencil Store -> invalidates ONLY DEPTH_ATTACHMENT on endRenderPass
      invSpy.mockClear();
      desc.reset(singleRT, fullViewport, true);
      desc.depthStoreAction = RenderTargetStoreAction.Discard;
      desc.stencilStoreAction = RenderTargetStoreAction.Store;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);

      // Combined color + depth + stencil Clear with depth + stencil Discard (Adreno split into 2 invalidateFramebuffer calls)
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(singleRT, fullViewport, true);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      desc.depthLoadAction = RenderTargetLoadAction.Clear;
      desc.stencilLoadAction = RenderTargetLoadAction.Clear;
      desc.depthStoreAction = RenderTargetStoreAction.Discard;
      desc.stencilStoreAction = RenderTargetStoreAction.Discard;
      rhi.beginRenderPass(desc);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      rhi.endRenderPass();
      expect(invSpy).toHaveBeenCalledTimes(2);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);

      // Second endRenderPass is a safe no-op
      invSpy.mockClear();
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();

      // Explicit flush() closes an open render pass and applies its StoreAction
      desc.reset(singleRT, fullViewport, true);
      desc.colorStoreAction = RenderTargetStoreAction.Discard;
      rhi.beginRenderPass(desc);
      invSpy.mockClear();
      rhi.flush();
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);

      // Color-only FBO: depth/stencil Clear & Discard are filtered out completely
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(colorOnlyRT, fullViewport, true);
      desc.depthLoadAction = RenderTargetLoadAction.Clear;
      desc.depthStoreAction = RenderTargetStoreAction.Discard;
      desc.stencilLoadAction = RenderTargetLoadAction.Clear;
      desc.stencilStoreAction = RenderTargetStoreAction.Discard;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();

      // MRT offscreen FBO: colorLoadAction.Clear clears all color attachments via gl.clear(COLOR_BUFFER_BIT)
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(mrtRT, fullViewport, true);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Depth24-only FBO: color Clear is a no-op; depth Clear clears only DEPTH_BUFFER_BIT
      invSpy.mockClear();
      clearSpy.mockClear();
      desc.reset(depthOnlyRT, fullViewport, true);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();

      desc.reset(depthOnlyRT, fullViewport, true);
      desc.depthLoadAction = RenderTargetLoadAction.Clear;
      desc.stencilLoadAction = RenderTargetLoadAction.Clear;
      rhi.beginRenderPass(desc);
      rhi.endRenderPass();
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Non-null _mainFrameBuffer (WebXR FBO): color Load Clear and Store Discard both execute
      const prevMainFBO = rhi._mainFrameBuffer;
      // @ts-ignore
      rhi._mainFrameBuffer = singleRT._platformRenderTarget._frameBuffer;
      try {
        invSpy.mockClear();
        clearSpy.mockClear();
        desc.reset(null, fullViewport, false);
        desc.colorLoadAction = RenderTargetLoadAction.Clear;
        desc.colorStoreAction = RenderTargetStoreAction.Discard;
        rhi.beginRenderPass(desc);
        rhi.endRenderPass();
        expect(clearSpy).toHaveBeenCalledTimes(1);
        expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
        expect(invSpy).toHaveBeenCalledTimes(1);
        expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
        expect(gl.getError()).toBe(gl.NO_ERROR);
      } finally {
        rhi._mainFrameBuffer = prevMainFBO;
      }

      // Disabled invalidateFramebuffer driver path (e.g. Mesa Intel) skips Store invalidate while Load Clear still works
      const prevSupport = rhi._supportsInvalidateFramebuffer;
      rhi._supportsInvalidateFramebuffer = false;
      try {
        invSpy.mockClear();
        clearSpy.mockClear();
        desc.reset(singleRT, fullViewport, true);
        desc.colorLoadAction = RenderTargetLoadAction.Clear;
        desc.colorStoreAction = RenderTargetStoreAction.Discard;
        desc.depthLoadAction = RenderTargetLoadAction.Clear;
        desc.depthStoreAction = RenderTargetStoreAction.Discard;
        desc.stencilLoadAction = RenderTargetLoadAction.Clear;
        desc.stencilStoreAction = RenderTargetStoreAction.Discard;
        rhi.beginRenderPass(desc);
        rhi.endRenderPass();
        expect(invSpy).not.toHaveBeenCalled();
        expect(clearSpy).toHaveBeenCalledTimes(1);
      } finally {
        rhi._supportsInvalidateFramebuffer = prevSupport;
      }

      // NullGraphicDevice beginRenderPass/endRenderPass no-op
      expect(() => {
        // @ts-ignore
        headless._hardwareRenderer.beginRenderPass(desc.reset(null, fullViewport, false));
        // @ts-ignore
        headless._hardwareRenderer.endRenderPass();
      }).not.toThrow();
    } finally {
      invSpy.mockRestore();
      clearSpy.mockRestore();
      singleRT.destroy();
      colorOnlyRT.destroy();
      mrtRT.destroy();
      depthOnlyRT.destroy();
      colorTex0.destroy();
      colorTex1.destroy();
      depthTex.destroy();
    }
  });

  it("Blitter.blitTexture defaults safely to Load, applies explicit Clear with guards, and Blitter.draw composes inside an active RenderPass", () => {
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");
    const clearSpy = vi.spyOn(gl, "clear");

    const srcTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const srcPixels = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      srcPixels[i * 4] = 200;
      srcPixels[i * 4 + 1] = 100;
      srcPixels[i * 4 + 2] = 50;
      srcPixels[i * 4 + 3] = 255;
    }
    srcTex.setPixelBuffer(srcPixels);

    const dstTex0 = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const dstTex1 = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const dstRT = new RenderTarget(engine, 16, 16, dstTex0, null, 1);
    const msaaRT = new RenderTarget(engine, 16, 16, dstTex0, null, 4);
    const mrtRT = new RenderTarget(engine, 16, 16, [dstTex0, dstTex1], null, 1);

    const discardShader = Shader.create(`Shader "Test/BlitDiscardHalf" {
      SubShader "Default" {
        Pass "0" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          VertexShader = vert;
          FragmentShader = frag;
          struct Attributes { vec4 POSITION_UV; };
          struct Varyings { vec2 v_uv; };
          Varyings vert(Attributes attr) {
            Varyings v;
            gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
            v.v_uv = attr.POSITION_UV.zw;
            return v;
          }
          void frag(Varyings v) {
            if (v.v_uv.x < 0.5) discard;
            gl_FragColor = vec4(10.0 / 255.0, 220.0 / 255.0, 30.0 / 255.0, 1.0);
          }
        }
      }
    }`);
    const discardMat = new Material(engine, discardShader);

    const mrtShader = Shader.create(`Shader "Test/BlitMRT" {
      SubShader "Default" {
        Pass "0" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          VertexShader = vert;
          FragmentShader = frag;
          struct Attributes { vec4 POSITION_UV; };
          void vert(Attributes attr) { gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0); }
          void frag() {
            gl_FragData[0] = vec4(1.0, 0.0, 0.0, 1.0);
            gl_FragData[1] = vec4(0.0, 1.0, 0.0, 1.0);
          }
        }
      }
    }`);
    const mrtMat = new Material(engine, mrtShader);

    const blendShader = Shader.create(`Shader "Test/BlitBlend" {
      SubShader "Default" {
        Pass "0" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          BlendState = {
            Enabled = true;
            SourceColorBlendFactor = BlendFactor.SourceAlpha;
            DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
            ColorBlendOperation = BlendOperation.Add;
            SourceAlphaBlendFactor = BlendFactor.Zero;
            DestinationAlphaBlendFactor = BlendFactor.One;
            AlphaBlendOperation = BlendOperation.Add;
          }
          VertexShader = vert;
          FragmentShader = frag;
          struct Attributes { vec4 POSITION_UV; };
          void vert(Attributes attr) { gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0); }
          void frag() { gl_FragColor = vec4(0.0, 1.0, 0.0, 0.5); }
        }
      }
    }`);
    const blendMat = new Material(engine, blendShader);

    const redOnlyShader = Shader.create(`Shader "Test/BlitRedOnly" {
      SubShader "Default" {
        Pass "0" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          BlendState = {
            Enabled = false;
            ColorWriteMask = ColorWriteMask.Red;
          }
          VertexShader = vert;
          FragmentShader = frag;
          struct Attributes { vec4 POSITION_UV; };
          void vert(Attributes attr) { gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0); }
          void frag() { gl_FragColor = vec4(40.0 / 255.0, 0.0, 0.0, 1.0); }
        }
      }
    }`);
    const redOnlyMat = new Material(engine, redOnlyShader);

    try {
      // @ts-ignore
      engine._renderContext.camera = camera;
      while (gl.getError() !== gl.NO_ERROR);

      // 1. Public Blitter.blitTexture defaults to Load (never clears or invalidates implicitly)
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // 2. Explicit Clear on full-viewport single-color offscreen RT calls gl.clear(COLOR_BUFFER_BIT) with SCISSOR_TEST off, never invalidateFramebuffer
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, null, 0, undefined, RenderTargetLoadAction.Clear);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const outPixels = new Uint8Array(16 * 16 * 4);
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(0, 4))).toEqual([200, 100, 50, 255]);

      // 3. Custom material with fragment discard via public Blitter.blitTexture preserves untouched left-half pixels
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, discardMat);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      const leftIdx = (8 * 16 + 2) * 4;
      const rightIdx = (8 * 16 + 12) * 4;
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([10, 220, 30, 255]);

      // 4. Explicit Clear on sub-viewport is safely skipped by RHI (preserves untouched left half)
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, null, 0, undefined, RenderTargetLoadAction.Clear);
      const bluePixels = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < 16 * 16; i++) {
        bluePixels[i * 4] = 20;
        bluePixels[i * 4 + 1] = 40;
        bluePixels[i * 4 + 2] = 240;
        bluePixels[i * 4 + 3] = 255;
      }
      srcTex.setPixelBuffer(bluePixels);
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(
        engine,
        srcTex,
        dstRT,
        0,
        new Vector4(0.5, 0, 0.5, 1),
        null,
        0,
        undefined,
        RenderTargetLoadAction.Clear
      );
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([20, 40, 240, 255]);

      // 5. Explicit Clear on default framebuffer (null) -> skipped by RHI
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, null, 0, undefined, null, 0, undefined, RenderTargetLoadAction.Clear);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();

      // 6. Explicit Clear on MRT RenderTarget -> guarded to Load so COLOR_ATTACHMENT1+ is preserved
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, mrtRT, 0, undefined, mrtMat, 0, undefined, RenderTargetLoadAction.Clear);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();

      // 7. Explicit Clear on full-viewport single-color MSAA RenderTarget -> clears MSAA color without invalidateFramebuffer
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, msaaRT, 0, undefined, null, 0, undefined, RenderTargetLoadAction.Clear);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);

      // 8. Blended shader passed with explicit Clear -> automatically downgraded to Load, preserving destination blend base
      srcTex.setPixelBuffer(srcPixels); // (200, 100, 50, 255)
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, null, 0, undefined, RenderTargetLoadAction.Clear);
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, blendMat, 0, undefined, RenderTargetLoadAction.Clear);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      // 0.5 * (0,255,0) + 0.5 * (200,100,50) = (~100, ~177, ~25, 255)
      expect(outPixels[0]).toBeGreaterThanOrEqual(95);
      expect(outPixels[0]).toBeLessThanOrEqual(105);
      expect(outPixels[1]).toBeGreaterThanOrEqual(170);
      expect(outPixels[1]).toBeLessThanOrEqual(185);
      expect(outPixels[2]).toBeGreaterThanOrEqual(20);
      expect(outPixels[2]).toBeLessThanOrEqual(30);

      // 9. Partial ColorWriteMask shader passed with explicit Clear -> automatically downgraded to Load, preserving G/B/A
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, null, 0, undefined, RenderTargetLoadAction.Clear);
      invSpy.mockClear();
      clearSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, redOnlyMat, 0, undefined, RenderTargetLoadAction.Clear);
      expect(invSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(0, 4))).toEqual([40, 100, 50, 255]);

      // Restore full colorWriteMask for subsequent tests
      Blitter.blitTexture(engine, srcTex, dstRT);

      // 10. Blitter.draw executes multiple fullscreen draws inside one explicit beginRenderPass/endRenderPass without splitting the pass
      const dsRT = new RenderTarget(engine, 16, 16, dstTex0, TextureFormat.Depth24Stencil8, 1);
      try {
        // @ts-ignore
        const context = engine._renderContext;
        const passDesc = new RenderPassDescriptor();
        passDesc.reset(dsRT);
        passDesc.colorLoadAction = RenderTargetLoadAction.Clear;
        passDesc.depthStoreAction = RenderTargetStoreAction.Discard;
        passDesc.stencilStoreAction = RenderTargetStoreAction.Discard;

        srcTex.setPixelBuffer(srcPixels); // (200, 100, 50, 255)
        invSpy.mockClear();
        clearSpy.mockClear();
        context.beginRenderPass(passDesc);
        Blitter.draw(engine, srcTex, 0, null, 0);
        // Must NOT flush store actions or clear again between draws in the same render pass
        expect(invSpy).not.toHaveBeenCalled();
        expect(clearSpy).toHaveBeenCalledTimes(1);
        Blitter.draw(engine, srcTex, 0, blendMat, 0);
        expect(invSpy).not.toHaveBeenCalled();
        expect(clearSpy).toHaveBeenCalledTimes(1);
        context.endRenderPass();

        // Store actions fire once at endRenderPass
        expect(invSpy).toHaveBeenCalledTimes(2);
        expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
        expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);

        dstTex0.getPixelBuffer(outPixels);
        // 0.5 * (0,255,0) + 0.5 * (200,100,50) = (~100, ~177, ~25, 255)
        expect(outPixels[0]).toBeGreaterThanOrEqual(95);
        expect(outPixels[0]).toBeLessThanOrEqual(105);
        expect(outPixels[1]).toBeGreaterThanOrEqual(170);
        expect(outPixels[1]).toBeLessThanOrEqual(185);
        expect(outPixels[2]).toBeGreaterThanOrEqual(20);
        expect(outPixels[2]).toBeLessThanOrEqual(30);
      } finally {
        dsRT.destroy();
      }

      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      // @ts-ignore
      engine._renderContext.camera = null;
      invSpy.mockRestore();
      clearSpy.mockRestore();
      discardMat.destroy();
      discardShader.destroy();
      mrtMat.destroy();
      mrtShader.destroy();
      blendMat.destroy();
      blendShader.destroy();
      redOnlyMat.destroy();
      redOnlyShader.destroy();
      dstRT.destroy();
      msaaRT.destroy();
      mrtRT.destroy();
      srcTex.destroy();
      dstTex0.destroy();
      dstTex1.destroy();
    }
  });

  it("drives MSAA resolve ordering, cold Frame-1 single-bind clear, and pixel-verified opaque+transparent StoreActions end-to-end", () => {
    const fullViewport = new Vector4(0, 0, 1, 1);

    // 1. Direct StoreAndResolve vs Resolve + depth/stencil Discard ordering via beginRenderPass/endRenderPass on MSAA RenderTarget
    const msaaTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const msaaRT = new RenderTarget(engine, 16, 16, msaaTex, TextureFormat.Depth24Stencil8, 4);
    try {
      // @ts-ignore
      const rhi = engine._hardwareRenderer;
      const desc = new RenderPassDescriptor();
      while (gl.getError() !== gl.NO_ERROR);

      desc.reset(msaaRT, fullViewport, true);
      desc.colorLoadAction = RenderTargetLoadAction.Clear;
      desc.clearColor.set(0.25, 0.5, 0.75, 1.0);
      desc.colorStoreAction = RenderTargetStoreAction.StoreAndResolve;
      desc.depthStoreAction = RenderTargetStoreAction.Store;
      desc.stencilStoreAction = RenderTargetStoreAction.Store;
      rhi.beginRenderPass(desc);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const invSpy = vi.spyOn(gl, "invalidateFramebuffer");
      try {
        // Mid-pass StoreAndResolve must NOT invalidate anything
        rhi.endRenderPass();
        expect(invSpy).not.toHaveBeenCalled();
        expect(gl.getError()).toBe(gl.NO_ERROR);
      } finally {
        invSpy.mockRestore();
      }

      // Final pass Resolve + depth/stencil Discard: depth/stencil MUST invalidate on FRAMEBUFFER BEFORE DRAW_FRAMEBUFFER switches,
      // and MSAA color MUST invalidate on READ_FRAMEBUFFER AFTER gl.blitFramebuffer (matches Unity TextureReadbackGLES.cpp)
      desc.reset(msaaRT, fullViewport, true);
      desc.colorStoreAction = RenderTargetStoreAction.Resolve;
      desc.depthStoreAction = RenderTargetStoreAction.Discard;
      desc.stencilStoreAction = RenderTargetStoreAction.Discard;
      rhi.beginRenderPass(desc);
      const events: string[] = [];
      const invOrderSpy = vi.spyOn(gl, "invalidateFramebuffer").mockImplementation(function (
        this: WebGL2RenderingContext,
        target: GLenum,
        attachments: Iterable<GLenum>
      ) {
        events.push(`inv:${target}:${Array.from(attachments).join(",")}`);
        return WebGL2RenderingContext.prototype.invalidateFramebuffer.call(this, target, attachments);
      });
      const bindOrderSpy = vi.spyOn(gl, "bindFramebuffer").mockImplementation(function (
        this: WebGL2RenderingContext,
        target: GLenum,
        fb: WebGLFramebuffer | null
      ) {
        events.push(`bind:${target}:${fb ? "fbo" : "null"}`);
        return WebGL2RenderingContext.prototype.bindFramebuffer.call(this, target, fb);
      });
      const blitOrderSpy = vi.spyOn(gl, "blitFramebuffer").mockImplementation(function (
        this: WebGL2RenderingContext,
        ...args: Parameters<WebGL2RenderingContext["blitFramebuffer"]>
      ) {
        events.push("blit");
        return WebGL2RenderingContext.prototype.blitFramebuffer.apply(this, args);
      });
      try {
        rhi.endRenderPass();
        expect(gl.getError()).toBe(gl.NO_ERROR);
        expect(events).toEqual([
          `inv:${gl.FRAMEBUFFER}:${gl.DEPTH_ATTACHMENT}`,
          `inv:${gl.FRAMEBUFFER}:${gl.STENCIL_ATTACHMENT}`,
          `bind:${gl.READ_FRAMEBUFFER}:fbo`,
          `bind:${gl.DRAW_FRAMEBUFFER}:fbo`,
          "blit",
          `inv:${gl.READ_FRAMEBUFFER}:${gl.COLOR_ATTACHMENT0}`,
          `bind:${gl.FRAMEBUFFER}:null`
        ]);
      } finally {
        invOrderSpy.mockRestore();
        bindOrderSpy.mockRestore();
        blitOrderSpy.mockRestore();
      }

      const resolved = new Uint8Array(16 * 16 * 4);
      msaaTex.getPixelBuffer(resolved);
      expect(resolved[0]).toBeGreaterThanOrEqual(63);
      expect(resolved[0]).toBeLessThanOrEqual(65);
      expect(resolved[1]).toBeGreaterThanOrEqual(127);
      expect(resolved[1]).toBeLessThanOrEqual(129);
      expect(resolved[2]).toBeGreaterThanOrEqual(190);
      expect(resolved[2]).toBeLessThanOrEqual(192);
      expect(resolved[3]).toBe(255);
    } finally {
      msaaRT.destroy();
      msaaTex.destroy();
    }

    // 2. Full engine.update() with overlapping opaque red + transparent green quads, PostProcess + Bloom, non-MSAA and 4x MSAA + OpaqueTexture
    const scene = engine.sceneManager.scenes[0];
    scene.background.solidColor.set(0, 0, 0, 1);

    const opaqueEntity = scene.createRootEntity("opaque-red");
    const opaqueRenderer = opaqueEntity.addComponent(MeshRenderer);
    opaqueRenderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
    const opaqueMat = new UnlitMaterial(engine);
    opaqueMat.baseColor.set(1, 0, 0, 1);
    opaqueRenderer.setMaterial(opaqueMat);

    const transEntity = scene.createRootEntity("transparent-green");
    transEntity.transform.setPosition(0, 0, 1);
    const transRenderer = transEntity.addComponent(MeshRenderer);
    transRenderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
    const transMat = new UnlitMaterial(engine);
    transMat.isTransparent = true;
    transMat.baseColor.set(0, 1, 0, 0.5);
    transRenderer.setMaterial(transMat);

    const ppEntity = scene.createRootEntity("post-process");
    const pp = ppEntity.addComponent(PostProcess);
    const bloom = pp.addEffect(BloomEffect);
    bloom.intensity.value = 0;

    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");

    try {
      camera.clearFlags = CameraClearFlags.All;
      camera.enableHDR = false;

      // 2a. Non-MSAA + PostProcess + Bloom: flushes transient depth/stencil StoreAction.DontCare on FRAMEBUFFER
      camera.renderTarget = null;
      bloom.intensity.value = 1;
      camera.enablePostProcess = true;
      camera.msaaSamples = MSAASamples.None;
      camera.opaqueTextureEnabled = false;
      while (gl.getError() !== gl.NO_ERROR);
      invSpy.mockClear();
      engine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const nonMsaaCalls = invSpy.mock.calls.map(([target, attachments]) => ({
        target,
        attachments: Array.from(attachments)
      }));
      expect(nonMsaaCalls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.DEPTH_ATTACHMENT] });
      expect(nonMsaaCalls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.STENCIL_ATTACHMENT] });
      // LoadAction.Clear uses gl.clear(COLOR_BUFFER_BIT) instead of gl.invalidateFramebuffer(COLOR_ATTACHMENT0)
      expect(nonMsaaCalls).not.toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });

      // 2b. Cold Frame-1 4x MSAA + clearFlags.All: zero GL error and single MSAA bind before clear (no _frameBuffer ping-pong)
      camera.renderTarget = null;
      camera.msaaSamples = MSAASamples.FourX;
      camera.opaqueTextureEnabled = false;
      // Record cold first frame for 4x MSAA (never warmed up before!)
      const bindSpy = vi.spyOn(gl, "bindFramebuffer");
      const clearSpy = vi.spyOn(gl, "clear");
      const order: string[] = [];
      bindSpy.mockImplementation(function (this: WebGL2RenderingContext, target: GLenum, fb: WebGLFramebuffer | null) {
        order.push(`bind:${target}:${fb ? "fbo" : "null"}`);
        return WebGL2RenderingContext.prototype.bindFramebuffer.call(this, target, fb);
      });
      clearSpy.mockImplementation(function (this: WebGL2RenderingContext, mask: GLbitfield) {
        order.push(`clear:${mask}`);
        return WebGL2RenderingContext.prototype.clear.call(this, mask);
      });
      try {
        while (gl.getError() !== gl.NO_ERROR);
        engine.update();
        expect(gl.getError()).toBe(gl.NO_ERROR);
        const clearIdx = order.findIndex((e) => e.startsWith("clear:"));
        expect(clearIdx).toBeGreaterThan(0);
        // Immediately before clear is a single bind to MSAA FBO; after clear comes MSAA resolve (READ_FRAMEBUFFER), never another FRAMEBUFFER rebind
        expect(order[clearIdx - 1]).toBe(`bind:${gl.FRAMEBUFFER}:fbo`);
        expect(order[clearIdx + 1]).toBe(`bind:${gl.READ_FRAMEBUFFER}:fbo`);
      } finally {
        bindSpy.mockRestore();
        clearSpy.mockRestore();
      }

      // 2c. 4x MSAA + OpaqueTexture on engine-owned internalColorTarget (camera.renderTarget = null):
      //     mid-pass StoreAndResolve preserves opaque red MSAA samples; final Resolve discards depth/stencil & MSAA color and outputs opaque red + 50% transparent green
      camera.renderTarget = null;
      camera.enablePostProcess = false;
      camera.msaaSamples = MSAASamples.FourX;
      camera.opaqueTextureEnabled = true;
      invSpy.mockClear();
      engine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const msaaCalls = invSpy.mock.calls.map(([target, attachments]) => ({
        target,
        attachments: Array.from(attachments)
      }));
      expect(msaaCalls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.DEPTH_ATTACHMENT] });
      expect(msaaCalls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.STENCIL_ATTACHMENT] });
      expect(msaaCalls).toContainEqual({ target: gl.READ_FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });
      expect(msaaCalls).not.toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });

      // Verify opaqueTexture captured pure red opaque quad (mid-pass StoreAndResolve)
      const opaqueTex = camera.shaderData.getTexture(Camera._cameraOpaqueTextureProperty) as Texture2D;
      expect(opaqueTex).toBeTruthy();
      const opaquePixels = new Uint8Array(opaqueTex.width * opaqueTex.height * 4);
      opaqueTex.getPixelBuffer(opaquePixels);
      const opaqueCenter = ((opaqueTex.height >> 1) * opaqueTex.width + (opaqueTex.width >> 1)) * 4;
      expect(opaquePixels[opaqueCenter]).toBeGreaterThan(240);
      expect(opaquePixels[opaqueCenter + 1]).toBeLessThan(15);
      expect(opaquePixels[opaqueCenter + 2]).toBeLessThan(15);

      // Verify final canvas output preserves opaque red underneath 50% alpha transparent green (both R and G clearly present)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const finalPixels = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, finalPixels);
      expect(finalPixels[0]).toBeGreaterThan(100);
      expect(finalPixels[1]).toBeGreaterThan(100);
      expect(finalPixels[2]).toBeLessThan(15);

      // 2d. CameraClearFlags.None overlay with PostProcess (keepColorFlag background copy runs outside RenderPass)
      camera.clearFlags = CameraClearFlags.None;
      camera.enablePostProcess = true;
      camera.msaaSamples = MSAASamples.None;
      camera.opaqueTextureEnabled = false;
      bloom.intensity.value = 0;
      opaqueEntity.isActive = false;
      transEntity.isActive = false;
      while (gl.getError() !== gl.NO_ERROR);
      engine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const preservedPixels = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, preservedPixels);
      expect(preservedPixels[0]).toBeGreaterThan(80);
      expect(preservedPixels[1]).toBeGreaterThan(80);
    } finally {
      camera.clearFlags = CameraClearFlags.All;
      camera.renderTarget = null;
      camera.enablePostProcess = false;
      camera.msaaSamples = MSAASamples.None;
      camera.opaqueTextureEnabled = false;
      ppEntity.destroy();
      opaqueEntity.destroy();
      transEntity.destroy();
      opaqueMat.destroy();
      transMat.destroy();
      invSpy.mockRestore();
    }
  });
});
