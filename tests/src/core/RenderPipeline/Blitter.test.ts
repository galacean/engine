import {
  Blitter,
  BloomEffect,
  Camera,
  CameraClearFlags,
  ColorWriteMask,
  Material,
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

describe("Blitter & RHI invalidateRenderTarget", () => {
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

  it("invalidateRenderTarget emits spec-compliant attachment enums with zero GL errors", () => {
    // @ts-ignore
    const rhi = engine._hardwareRenderer;
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");

    const colorTex0 = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const colorTex1 = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const depthTex = new Texture2D(engine, 32, 32, TextureFormat.Depth24, false, false);
    const singleRT = new RenderTarget(engine, 32, 32, colorTex0, TextureFormat.Depth24Stencil8, 1);
    const mrtRT = new RenderTarget(engine, 32, 32, [colorTex0, colorTex1], null, 1);
    const depthOnlyRT = new RenderTarget(engine, 32, 32, null, depthTex, 1);

    try {
      const fullViewport = new Vector4(0, 0, 1, 1);
      while (gl.getError() !== gl.NO_ERROR);

      // CameraClearFlags.None is a no-op
      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.None);
      expect(invSpy).not.toHaveBeenCalled();

      // Default framebuffer (null): uses COLOR / DEPTH / STENCIL
      rhi.activeRenderTarget(null, fullViewport, false, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(null, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      invSpy.mockClear();
      rhi.invalidateRenderTarget(null, CameraClearFlags.All);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR, gl.DEPTH, gl.STENCIL]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Single-color offscreen FBO: fast path COLOR_ATTACHMENT0 & full All
      rhi.activeRenderTarget(singleRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      invSpy.mockClear();
      rhi.invalidateRenderTarget(singleRT, CameraClearFlags.All);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([
        gl.COLOR_ATTACHMENT0,
        gl.DEPTH_ATTACHMENT,
        gl.STENCIL_ATTACHMENT
      ]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // MRT offscreen FBO: COLOR_ATTACHMENT0..N-1
      rhi.activeRenderTarget(mrtRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(mrtRT, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Depth-only FBO: Color is a no-op, Depth invalidates DEPTH_ATTACHMENT
      rhi.activeRenderTarget(depthOnlyRT, fullViewport, true, 0);
      invSpy.mockClear();
      rhi.invalidateRenderTarget(depthOnlyRT, CameraClearFlags.Color);
      expect(invSpy).not.toHaveBeenCalled();

      rhi.invalidateRenderTarget(depthOnlyRT, CameraClearFlags.Depth);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Non-null _mainFrameBuffer (WebXR FBO): uses COLOR_ATTACHMENT0 instead of COLOR
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

      // NullGraphicDevice no-op
      // @ts-ignore
      expect(() => headless._hardwareRenderer.invalidateRenderTarget(null, CameraClearFlags.All)).not.toThrow();
    } finally {
      invSpy.mockRestore();
      singleRT.destroy();
      mrtRT.destroy();
      depthOnlyRT.destroy();
      colorTex0.destroy();
      colorTex1.destroy();
      depthTex.destroy();
    }
  });

  it("Blitter.blitTexture invalidates color only on full-viewport opaque single-color non-MSAA offscreen targets", () => {
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
    const customMat = new Material(engine, baseShader);
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

      // 1. Full-viewport opaque single-color non-MSAA offscreen RT -> invalidates COLOR_ATTACHMENT0
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const outPixels = new Uint8Array(16 * 16 * 4);
      dstTex0.getPixelBuffer(outPixels);
      expect([outPixels[0], outPixels[1], outPixels[2], outPixels[3]]).toEqual([200, 100, 50, 255]);

      // 2. Sub-viewport -> must NOT invalidate (preserves untouched left-half pixels)
      const greenPixels = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < 16 * 16; i++) {
        greenPixels[i * 4] = 10;
        greenPixels[i * 4 + 1] = 220;
        greenPixels[i * 4 + 2] = 30;
        greenPixels[i * 4 + 3] = 255;
      }
      srcTex.setPixelBuffer(greenPixels);
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, new Vector4(0.5, 0, 0.5, 1));
      expect(invSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      // Left-half pixel (x=2, y=8) stays original (200, 100, 50, 255); right-half pixel (x=12, y=8) updated to green
      const leftIdx = (8 * 16 + 2) * 4;
      const rightIdx = (8 * 16 + 12) * 4;
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([10, 220, 30, 255]);

      // 3. Default framebuffer (null) -> must NOT invalidate
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, null);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError(), "step 3 null").toBe(gl.NO_ERROR);

      // 4. MSAA RenderTarget -> must NOT invalidate
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, msaaRT);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError(), "step 4 msaa").toBe(gl.NO_ERROR);

      // 5. MRT RenderTarget -> must NOT invalidate
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, mrtRT, 0, undefined, mrtMat);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError(), "step 5 mrt").toBe(gl.NO_ERROR);

      // 6. Blended pass -> must NOT invalidate
      passRenderState.blendState.targetBlendState.enabled = true;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, customMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.blendState.targetBlendState.enabled = savedBlendEnabled;
      expect(gl.getError(), "step 6 blend").toBe(gl.NO_ERROR);

      // 7. Partial colorWriteMask -> must NOT invalidate
      passRenderState.blendState.targetBlendState.colorWriteMask = ColorWriteMask.Red;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, customMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.blendState.targetBlendState.colorWriteMask = savedColorMask;
      expect(gl.getError(), "step 7 mask").toBe(gl.NO_ERROR);

      // 8. Depth test enabled -> must NOT invalidate
      passRenderState.depthState.enabled = true;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, customMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.depthState.enabled = savedDepthEnabled;
      expect(gl.getError(), "step 8 depth").toBe(gl.NO_ERROR);

      // 9. Stencil test enabled -> must NOT invalidate
      passRenderState.stencilState.enabled = true;
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, customMat);
      expect(invSpy).not.toHaveBeenCalled();
      passRenderState.stencilState.enabled = savedStencilEnabled;

      expect(gl.getError(), "step 9 stencil").toBe(gl.NO_ERROR);
    } finally {
      // @ts-ignore
      engine._renderContext.camera = null;
      passRenderState.blendState.targetBlendState.enabled = savedBlendEnabled;
      passRenderState.blendState.targetBlendState.colorWriteMask = savedColorMask;
      passRenderState.depthState.enabled = savedDepthEnabled;
      passRenderState.stencilState.enabled = savedStencilEnabled;
      invSpy.mockRestore();
      customMat.destroy();
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

  it("invalidates offscreen Bloom and post-process passes during engine.update() with zero GL errors", () => {
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");
    const scene = engine.sceneManager.scenes[0];
    const ppEntity = scene.createRootEntity("post-process");
    const pp = ppEntity.addComponent(PostProcess);
    const bloom = pp.addEffect(BloomEffect);
    bloom.intensity.value = 1;
    camera.enablePostProcess = true;

    try {
      while (gl.getError() !== gl.NO_ERROR);
      invSpy.mockClear();
      engine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      expect(invSpy.mock.calls.length).toBeGreaterThan(0);
      for (const [, attachments] of invSpy.mock.calls) {
        expect(Array.from(attachments)).toEqual([gl.COLOR_ATTACHMENT0]);
      }
    } finally {
      camera.enablePostProcess = false;
      ppEntity.destroy();
      invSpy.mockRestore();
    }
  });
});
