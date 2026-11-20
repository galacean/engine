import {
  Blitter,
  BloomEffect,
  Camera,
  CameraClearFlags,
  Material,
  MSAASamples,
  PostProcess,
  RenderBufferLoadAction,
  RenderBufferStoreAction,
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
    camera = scene.createRootEntity("camera").addComponent(Camera);
    engine.update();
  });

  afterAll(() => {
    engine?.destroy();
    headless?.destroy();
  });

  it("activeRenderTarget applies Load/Store actions with attachment filtering, Adreno split, and backbuffer/driver guards", () => {
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
      const halfViewport = new Vector4(0.5, 0, 0.5, 1);
      while (gl.getError() !== gl.NO_ERROR);

      // Default Load/Store is a no-op
      invSpy.mockClear();
      rhi.activeRenderTarget(singleRT, fullViewport, true, 0);
      expect(invSpy).not.toHaveBeenCalled();

      // Default WebGL backbuffer (null with _mainFrameBuffer === null) is skipped for both Load and Store DontCare
      invSpy.mockClear();
      rhi.activeRenderTarget(
        null,
        fullViewport,
        false,
        0,
        undefined,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.DontCare,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.DontCare
      );
      rhi.activeRenderTarget(singleRT, fullViewport, true, 0);
      expect(invSpy).not.toHaveBeenCalled();

      // Sub-viewport LoadAction.DontCare is skipped to protect pixels outside the viewport
      invSpy.mockClear();
      rhi.activeRenderTarget(
        singleRT,
        halfViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store
      );
      expect(invSpy).not.toHaveBeenCalled();

      // Single-color Depth24Stencil8 FBO: color Load DontCare -> COLOR_ATTACHMENT0; depth Load DontCare -> Adreno split
      invSpy.mockClear();
      rhi.activeRenderTarget(
        singleRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store
      );
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      invSpy.mockClear();
      rhi.activeRenderTarget(
        singleRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Store,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store
      );
      expect(invSpy).toHaveBeenCalledTimes(2);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      invSpy.mockClear();
      rhi.activeRenderTarget(
        singleRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.DontCare
      );
      expect(invSpy).toHaveBeenCalledTimes(2);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT]);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Switching away flushes pending depth StoreAction.DontCare once (and clears pending store state)
      invSpy.mockClear();
      rhi.activeRenderTarget(colorOnlyRT, fullViewport, true, 0);
      expect(invSpy).toHaveBeenCalledTimes(2);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);

      invSpy.mockClear();
      rhi.activeRenderTarget(colorOnlyRT, fullViewport, true, 0);
      expect(invSpy).not.toHaveBeenCalled();

      // StoreAction.DontCare also flushes before allocating a new RenderTarget FBO or explicit flush()
      rhi.activeRenderTarget(
        singleRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Store,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.DontCare
      );
      invSpy.mockClear();
      const tempRT = new RenderTarget(engine, 8, 8, null, TextureFormat.Depth24, 1);
      try {
        expect(invSpy).toHaveBeenCalledTimes(2);
        expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
        expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);
      } finally {
        tempRT.destroy();
      }

      rhi.activeRenderTarget(
        singleRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.DontCare
      );
      invSpy.mockClear();
      rhi.flush();
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);

      // Color-only FBO: depth Load/Store DontCare is filtered out completely
      invSpy.mockClear();
      rhi.activeRenderTarget(
        colorOnlyRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Store,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.DontCare
      );
      rhi.activeRenderTarget(null, fullViewport, false, 0);
      expect(invSpy).not.toHaveBeenCalled();

      // MRT offscreen FBO: COLOR_ATTACHMENT0..N-1
      invSpy.mockClear();
      rhi.activeRenderTarget(
        mrtRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store
      );
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Depth24-only FBO: color DontCare is a no-op; depth DontCare invalidates only DEPTH_ATTACHMENT
      invSpy.mockClear();
      rhi.activeRenderTarget(
        depthOnlyRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store
      );
      expect(invSpy).not.toHaveBeenCalled();

      rhi.activeRenderTarget(
        depthOnlyRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Store,
        RenderBufferLoadAction.DontCare,
        RenderBufferStoreAction.Store
      );
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Non-null _mainFrameBuffer (WebXR FBO): uses COLOR_ATTACHMENT0
      const prevMainFBO = rhi._mainFrameBuffer;
      // @ts-ignore
      rhi._mainFrameBuffer = singleRT._platformRenderTarget._frameBuffer;
      try {
        invSpy.mockClear();
        rhi.activeRenderTarget(
          null,
          fullViewport,
          false,
          0,
          undefined,
          RenderBufferLoadAction.DontCare,
          RenderBufferStoreAction.Store
        );
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
        invSpy.mockClear();
        rhi.activeRenderTarget(
          singleRT,
          fullViewport,
          true,
          0,
          undefined,
          RenderBufferLoadAction.DontCare,
          RenderBufferStoreAction.DontCare,
          RenderBufferLoadAction.DontCare,
          RenderBufferStoreAction.DontCare
        );
        rhi.activeRenderTarget(null, fullViewport, false, 0);
        expect(invSpy).not.toHaveBeenCalled();
      } finally {
        rhi._supportsInvalidateFramebuffer = prevSupport;
      }

      // NullGraphicDevice no-op
      expect(() =>
        // @ts-ignore
        headless._hardwareRenderer.activeRenderTarget(
          null,
          fullViewport,
          false,
          0,
          undefined,
          RenderBufferLoadAction.DontCare,
          RenderBufferStoreAction.DontCare
        )
      ).not.toThrow();
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

  it("Blitter.blitTexture defaults safely to Load and applies explicit DontCare only on full-viewport single-color offscreen RTs", () => {
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

    try {
      // @ts-ignore
      engine._renderContext.camera = camera;
      while (gl.getError() !== gl.NO_ERROR);

      // 1. Default colorLoadAction is Load (conservative: never invalidates implicitly)
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT);
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // 2. Explicit DontCare on full-viewport single-color offscreen RT invalidates COLOR_ATTACHMENT0
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, null, 0, undefined, RenderBufferLoadAction.DontCare);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const outPixels = new Uint8Array(16 * 16 * 4);
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(0, 4))).toEqual([200, 100, 50, 255]);

      // 3. Custom material with fragment discard using default Load preserves untouched left-half pixels
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, discardMat);
      expect(invSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      const leftIdx = (8 * 16 + 2) * 4;
      const rightIdx = (8 * 16 + 12) * 4;
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([10, 220, 30, 255]);

      // 4. Explicit DontCare on sub-viewport is safely skipped by RHI (preserves untouched left half)
      Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, null, 0, undefined, RenderBufferLoadAction.DontCare);
      const bluePixels = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < 16 * 16; i++) {
        bluePixels[i * 4] = 20;
        bluePixels[i * 4 + 1] = 40;
        bluePixels[i * 4 + 2] = 240;
        bluePixels[i * 4 + 3] = 255;
      }
      srcTex.setPixelBuffer(bluePixels);
      invSpy.mockClear();
      Blitter.blitTexture(
        engine,
        srcTex,
        dstRT,
        0,
        new Vector4(0.5, 0, 0.5, 1),
        null,
        0,
        undefined,
        RenderBufferLoadAction.DontCare
      );
      expect(invSpy).not.toHaveBeenCalled();
      dstTex0.getPixelBuffer(outPixels);
      expect(Array.from(outPixels.slice(leftIdx, leftIdx + 4))).toEqual([200, 100, 50, 255]);
      expect(Array.from(outPixels.slice(rightIdx, rightIdx + 4))).toEqual([20, 40, 240, 255]);

      // 5. Explicit DontCare on default framebuffer (null) -> skipped by RHI
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, null, 0, undefined, null, 0, undefined, RenderBufferLoadAction.DontCare);
      expect(invSpy).not.toHaveBeenCalled();

      // 6. Explicit DontCare on MRT RenderTarget -> guarded to Load so COLOR_ATTACHMENT1+ is preserved
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, mrtRT, 0, undefined, mrtMat, 0, undefined, RenderBufferLoadAction.DontCare);
      expect(invSpy).not.toHaveBeenCalled();

      // 7. Explicit DontCare on full-viewport single-color MSAA RenderTarget -> invalidates MSAA COLOR_ATTACHMENT0
      invSpy.mockClear();
      Blitter.blitTexture(engine, srcTex, msaaRT, 0, undefined, null, 0, undefined, RenderBufferLoadAction.DontCare);
      expect(invSpy).toHaveBeenCalledTimes(1);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.COLOR_ATTACHMENT0]);

      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      // @ts-ignore
      engine._renderContext.camera = null;
      invSpy.mockRestore();
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

  it("drives MSAA StoreAndResolve/Resolve, single-bind clear path, and transient depth StoreAction.DontCare end-to-end", () => {
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");
    const fullViewport = new Vector4(0, 0, 1, 1);

    // 1. Direct StoreAndResolve vs Resolve + depth DontCare on MSAA RenderTarget
    const msaaTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const msaaRT = new RenderTarget(engine, 16, 16, msaaTex, TextureFormat.Depth24Stencil8, 4);
    try {
      // @ts-ignore
      const rhi = engine._hardwareRenderer;
      rhi.activeRenderTarget(
        msaaRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.StoreAndResolve,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Store
      );
      gl.clearColor(0.25, 0.5, 0.75, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      while (gl.getError() !== gl.NO_ERROR);

      // Mid-pass StoreAndResolve must NOT invalidate READ_FRAMEBUFFER
      invSpy.mockClear();
      msaaRT._blitRenderTarget();
      expect(invSpy).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Final pass Resolve + depth DontCare invalidates depth/stencil before blit and MSAA color after blit
      rhi.activeRenderTarget(
        msaaRT,
        fullViewport,
        true,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Resolve,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.DontCare
      );
      invSpy.mockClear();
      msaaRT._blitRenderTarget();
      expect(invSpy).toHaveBeenCalledTimes(3);
      expect(invSpy.mock.calls[0][0]).toBe(gl.READ_FRAMEBUFFER);
      expect(Array.from(invSpy.mock.calls[0][1])).toEqual([gl.DEPTH_ATTACHMENT]);
      expect(invSpy.mock.calls[1][0]).toBe(gl.READ_FRAMEBUFFER);
      expect(Array.from(invSpy.mock.calls[1][1])).toEqual([gl.STENCIL_ATTACHMENT]);
      expect(invSpy.mock.calls[2][0]).toBe(gl.READ_FRAMEBUFFER);
      expect(Array.from(invSpy.mock.calls[2][1])).toEqual([gl.COLOR_ATTACHMENT0]);
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

    // 2. Full engine.update() with PostProcess + Bloom (non-MSAA and 4x MSAA + OpaqueTexture)
    const scene = engine.sceneManager.scenes[0];
    const ppEntity = scene.createRootEntity("post-process");
    const pp = ppEntity.addComponent(PostProcess);
    const bloom = pp.addEffect(BloomEffect);
    bloom.intensity.value = 1;
    camera.enablePostProcess = true;
    camera.clearFlags = CameraClearFlags.All;

    try {
      // 2a. Non-MSAA: flushes transient depth/stencil StoreAction.DontCare on FRAMEBUFFER before switching FBOs
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
      expect(nonMsaaCalls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });

      // 2b. 4x MSAA + clearFlags.All: single FBO bind before clear (no redundant bindFramebuffer ping-pong between clear and resolve)
      camera.msaaSamples = MSAASamples.FourX;
      camera.opaqueTextureEnabled = false;
      // Warm pooled targets first so steady-state frame has zero FBO allocations
      engine.update();
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
        engine.update();
        const clearIdx = order.findIndex((e) => e.startsWith("clear:"));
        expect(clearIdx).toBeGreaterThan(0);
        // Immediately before clear is a single bind to MSAA FBO; immediately after clear is MSAA resolve (READ_FRAMEBUFFER), not another FRAMEBUFFER ping-pong
        expect(order[clearIdx - 1]).toBe(`bind:${gl.FRAMEBUFFER}:fbo`);
        expect(order[clearIdx + 1]).toBe(`bind:${gl.READ_FRAMEBUFFER}:fbo`);
      } finally {
        bindSpy.mockRestore();
        clearSpy.mockRestore();
      }

      // 2c. 4x MSAA + OpaqueTexture: keeps MSAA on mid-pass resolve, discards depth/stencil & MSAA color on final resolve
      camera.opaqueTextureEnabled = true;
      invSpy.mockClear();
      engine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const msaaCalls = invSpy.mock.calls.map(([target, attachments]) => ({
        target,
        attachments: Array.from(attachments)
      }));
      expect(msaaCalls).toContainEqual({ target: gl.READ_FRAMEBUFFER, attachments: [gl.DEPTH_ATTACHMENT] });
      expect(msaaCalls).toContainEqual({ target: gl.READ_FRAMEBUFFER, attachments: [gl.STENCIL_ATTACHMENT] });
      expect(msaaCalls).toContainEqual({ target: gl.READ_FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });
      expect(msaaCalls).toContainEqual({ target: gl.FRAMEBUFFER, attachments: [gl.COLOR_ATTACHMENT0] });
    } finally {
      camera.enablePostProcess = false;
      camera.msaaSamples = MSAASamples.None;
      camera.opaqueTextureEnabled = false;
      ppEntity.destroy();
      invSpy.mockRestore();
    }
  });
});
