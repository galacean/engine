import {
  Blitter,
  BloomEffect,
  Camera,
  CameraClearFlags,
  ColorWriteMask,
  Material,
  MSAASamples,
  PostProcess,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFormat,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { HeadlessEngine } from "@galacean/engine-rhi-null";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Blitter & RHI TBDR invalidateRenderTarget", () => {
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
    camera = scene.createRootEntity("camera").addComponent(Camera);
    engine.update();
  });

  afterAll(() => {
    engine?.destroy();
    headless?.destroy();
  });

  it("invalidateRenderTarget filters existing attachments, splits depth/stencil, and skips default backbuffer", () => {
    // @ts-ignore
    const rhi = engine._hardwareRenderer;
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");

    const colorTex0 = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const colorTex1 = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const depthTex = new Texture2D(engine, 32, 32, TextureFormat.Depth24, false, false);
    const singleRT = new RenderTarget(engine, 32, 32, colorTex0, TextureFormat.Depth24Stencil8, 1);
    const colorOnlyRT = new RenderTarget(engine, 32, 32, colorTex0, null, 1);
    const mrtRT = new RenderTarget(engine, 32, 32, [colorTex0, colorTex1], null, 1);
    const depthOnlyRT = new RenderTarget(engine, 32, 32, null, depthTex, 1);

    try {
      const fullViewport = new Vector4(0, 0, 1, 1);
      while (gl.getError() !== gl.NO_ERROR);

      // CameraClearFlags.None is a no-op
      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.None);
      expect(invSpy).not.toHaveBeenCalled();

      // Default WebGL backbuffer (null with _mainFrameBuffer === null) is skipped
      rhi.activeRenderTarget(null, fullViewport, false, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(null, CameraClearFlags.All);
      expect(invSpy).not.toHaveBeenCalled();

      // Single-color Depth24Stencil8 FBO: fast path COLOR_ATTACHMENT0; Depth+Stencil split across two calls (Adreno safety)
      rhi.activeRenderTarget(singleRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.DepthStencil);
      expect(invSpy).toHaveBeenCalledTimes(2);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.All);
      expect(invSpy).toHaveBeenCalledTimes(2);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT]);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Color-only FBO: DepthStencil is filtered out completely
      rhi.activeRenderTarget(colorOnlyRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(colorOnlyRT, CameraClearFlags.DepthStencil);
      expect(invSpy).not.toHaveBeenCalled();

      // MRT offscreen FBO: COLOR_ATTACHMENT0..N-1
      rhi.activeRenderTarget(mrtRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(mrtRT, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Depth24-only FBO: Color is a no-op; DepthStencil invalidates only DEPTH_ATTACHMENT (no missing STENCIL_ATTACHMENT)
      rhi.activeRenderTarget(depthOnlyRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(depthOnlyRT, CameraClearFlags.Color);
      expect(invSpy).not.toHaveBeenCalled();

      rhi.invalidateRenderTarget(depthOnlyRT, CameraClearFlags.DepthStencil);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Non-null _mainFrameBuffer (WebXR FBO): uses COLOR_ATTACHMENT0
      const prevMainFBO = rhi._mainFrameBuffer;
      // @ts-ignore
      rhi._mainFrameBuffer = singleRT._platformRenderTarget._frameBuffer;
      try {
        rhi.activeRenderTarget(null, fullViewport, false, 0);
        invSpy.mockClear();
        rhi.invalidateRenderTarget(null, CameraClearFlags.Color);
        expect(invSpy).toHaveBeenCalledTimes(1);
        expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
        expect(gl.getError()).toBe(gl.NO_ERROR);
      } finally {
        rhi._mainFrameBuffer = prevMainFBO;
      }

      // Disabled driver path (e.g. Mesa Intel) is a no-op
      const prevSupport = rhi._supportsInvalidateFramebuffer;
      rhi._supportsInvalidateFramebuffer = false;
      try {
        rhi.activeRenderTarget(singleRT, fullViewport, true, 0);
        invSpy.mockClear();
        rhi.invalidateRenderTarget(singleRT, CameraClearFlags.All);
        expect(invSpy).not.toHaveBeenCalled();
      } finally {
        rhi._supportsInvalidateFramebuffer = prevSupport;
      }

      // NullGraphicDevice no-op
      // @ts-ignore
      expect(() => headless._hardwareRenderer.invalidateRenderTarget(null, CameraClearFlags.All)).not.toThrow();
    } finally {
      invSpy.mockRestore();
      singleRT.destroy();
      colorOnlyRT.destroy();
      mrtRT.destroy();
      depthOnlyRT.destroy();
      colorTex0.destroy();
      colorTex1.destroy();
      depthTex.destroy();
    }
  });

  it("Blitter.blitTexture invalidates only built-in full-overwrite passes and preserves custom discard shaders", () => {
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");

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

    const baseShader = Shader.find("Blit/Blit")!;
    const builtinMat = new Material(engine, baseShader);
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

    const passRenderState = baseShader.subShaders[0].passes[0]._renderState;
    const savedBlendEnabled = passRenderState.blendState.targetBlendState.enabled;
    const savedColorMask = passRenderState.blendState.targetBlendState.colorWriteMask;
    const savedDepthEnabled = passRenderState.depthState.enabled;
    const savedStencilEnabled = passRenderState.stencilState.enabled;

    try {
      // @ts-ignore
      engine._renderContext.camera = camera;
      while (gl.getError() !== gl.NO_ERROR);

      // 1. Default built-in Blit/Blit on full-viewport single-color non-MSAA offscreen RT -> invalidates COLOR_ATTACHMENT0
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const outPixels = new Uint8Array(16 * 16 * 4);
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(0, 4))).toEqual([200, 100, 50, 255]);

      // 2. Custom material that discards left half -> must NOT invalidate and must preserve prefilled left-half pixels
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, discardMat);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      dstTex0.getPixelBuffer(outPixels);
      const leftIdx = (8 * 16 + 2) * 4;
      const rightIdx = (8 * 16 + 12) * 4;
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([10, 220, 30, 255]);

      // 3. Sub-viewport with built-in blit -> must NOT invalidate (preserves untouched left half)
      Blitter.blitTexture(engine, srcTex, dstRT);
      const bluePixels = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < 16 * 16; i++) {
        bluePixels[i * 4] = 20;
        bluePixels[i * 4 + 1] = 40;
        bluePixels[i * 4 + 2] = 240;
        bluePixels[i * 4 + 3] = 255;
      }
      srcTex.setPixelBuffer(bluePixels);
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, new Vector4(0.5, 0, 0.5, 1));
      expect(invSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([20, 40, 240, 255]);

      // 4. Default framebuffer (null) -> must NOT invalidate
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, null);
      expect(invSpy).not.toHaveBeenCalled();

      // 5. MSAA RenderTarget -> must NOT invalidate
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, msaaRT);
      expect(invSpy).not.toHaveBeenCalled();

      // 6. MRT RenderTarget -> must NOT invalidate
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, mrtRT, 0, undefined, mrtMat);
      expect(invSpy).not.toHaveBeenCalled();

      // 7. Blended pass on built-in shader -> must NOT invalidate
      passRenderState.blendState.targetBlendState.enabled = true;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, builtinMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.blendState.targetBlendState.enabled = savedBlendEnabled;

      // 8. Partial colorWriteMask on built-in shader -> must NOT invalidate
      passRenderState.blendState.targetBlendState.colorWriteMask = ColorWriteMask.Red;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, builtinMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.blendState.targetBlendState.colorWriteMask = savedColorMask;

      // 9. Depth test enabled on built-in shader -> must NOT invalidate
      passRenderState.depthState.enabled = true;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, builtinMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.depthState.enabled = savedDepthEnabled;

      // 10. Stencil test enabled on built-in shader -> must NOT invalidate
      passRenderState.stencilState.enabled = true;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, builtinMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.stencilState.enabled = savedStencilEnabled;

      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      // @ts-ignore
      engine._renderContext.camera = null;
      passRenderState.blendState.targetBlendState.enabled = savedBlendEnabled;
      passRenderState.blendState.targetBlendState.colorWriteMask = savedColorMask;
      passRenderState.depthState.enabled = savedDepthEnabled;
      passRenderState.stencilState.enabled = savedStencilEnabled;
      invSpy.mockRestore();
      builtinMat.destroy();
      discardMat.destroy();
      discardShader.destroy();
      mrtMat.destroy();
      mrtShader.destroy();
      dstRT.destroy();
      msaaRT.destroy();
      mrtRT.destroy();
      srcTex.destroy();
      dstTex0.destroy();
      dstTex1.destroy();
    }
  });

  it("emits TBDR StoreAction::DontCare for transient depth/stencil and final MSAA resolve alongside LoadAction::DontCare", () => {
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");

    // 1. Direct GLRenderTarget.blitRenderTarget(discardMSAA) contract
    const msaaTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const msaaRT = new RenderTarget(engine, 16, 16, msaaTex, TextureFormat.Depth24Stencil8, 4);
    try {
      // @ts-ignore
      const rhi = engine._hardwareRenderer;
      rhi.activeRenderTarget(msaaRT, new Vector4(0, 0, 1, 1), true, 0);
      gl.clearColor(0.25, 0.5, 0.75, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      while (gl.getError() !== gl.NO_ERROR);

      // Mid-pass resolve (discardMSAA = false) must NOT invalidate READ_FRAMEBUFFER
      invSpy.mockClear();
      msaaRT._blitRenderTarget(false);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Final resolve (discardMSAA = true) invalidates READ_FRAMEBUFFER COLOR_ATTACHMENT0 while preserving resolved pixels
      invSpy.mockClear();
      msaaRT._blitRenderTarget(true);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(invSpy.mock.calls[0][0]).toBe(gl.READ_FRAMEBUFFER);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

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

    // 2. Full engine.update() with PostProcess + Bloom + MSAA + OpaqueTexture
    const scene = engine.sceneManager.scenes[0];
    const ppEntity = scene.createRootEntity("post-process");
    const pp = ppEntity.addComponent(PostProcess);
    const bloom = pp.addEffect(BloomEffect);
    bloom.intensity.value = 1;
    camera.enablePostProcess = true;
    camera.msaaSamples = MSAASamples.FourX;
    camera.opaqueTextureEnabled = true;

    try {
      while (gl.getError() !== gl.NO_ERROR);
      invSpy.mockClear();
      engine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const calls = invSpy.mock.calls.map(([target, attachments]) => ({
        target,
        attachments: Array.from(attachments)
      }));
      // StoreAction::DontCare on internalColorTarget transient depth & stencil RBO (split calls)
      expect(calls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.DEPTH_ATTACHMENT] });
      expect(calls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.STENCIL_ATTACHMENT] });
      // StoreAction::DontCare on final MSAA resolve (READ_FRAMEBUFFER)
      expect(calls).toContainEqual({ target: gl.READ_FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });
      // LoadAction::DontCare on offscreen Bloom/post-process/opaque-texture blits
      expect(calls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });
    } finally {
      camera.enablePostProcess = false;
      camera.msaaSamples = MSAASamples.None;
      camera.opaqueTextureEnabled = false;
      ppEntity.destroy();
      invSpy.mockRestore();
    }
  });
});
