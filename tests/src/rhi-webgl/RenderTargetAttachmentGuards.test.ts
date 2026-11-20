import {
  AntiAliasing,
  BloomEffect,
  Camera,
  CameraClearFlags,
  Color,
  Material,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  UnlitMaterial,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, describe, expect, it } from "vitest";

describe("RenderTarget attachment guard regressions", () => {
  let engine: WebGLEngine | null = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it("supports Camera.render() with a depth-only RenderTarget even when HDR/FXAA/PostProcess/OpaqueTexture are enabled", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.antiAliasing = AntiAliasing.FXAA;
    camera.enablePostProcess = true;
    camera.opaqueTextureEnabled = true;
    cameraEntity.transform.setPosition(0, 0, 3);

    const postEntity = scene.createRootEntity("post-process");
    const pp = postEntity.addComponent(PostProcess);
    pp.isGlobal = true;
    const bloom = pp.addEffect(BloomEffect)!;
    bloom.intensity.value = 1;

    const cubeEntity = scene.createRootEntity("cube");
    const renderer = cubeEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(new UnlitMaterial(engine));

    const depthTexture = new Texture2D(engine, 64, 64, TextureFormat.Depth24, false);
    const depthOnlyTarget = new RenderTarget(engine, 64, 64, null, depthTexture);
    camera.renderTarget = depthOnlyTarget;

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    try {
      expect(() => camera.render()).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      camera.renderTarget = null;
      depthOnlyTarget.destroy();
      depthTexture.destroy();
    }
  });

  it("supports rendering to non-zero mip levels of a color-only TextureCube RenderTarget without depth attachment", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0.25, 0.5, 0.75, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;

    const cube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const target = new RenderTarget(engine, 16, 16, cube, null);
    target.autoGenerateMipmaps = false;
    camera.renderTarget = target;

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    try {
      expect(() => camera.render(TextureCubeFace.PositiveX, 0)).not.toThrow();
      expect(() => camera.render(TextureCubeFace.PositiveX, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const mip0 = new Uint8Array(4);
      const mip1 = new Uint8Array(4);
      cube.getPixelBuffer(TextureCubeFace.PositiveX, 0, 0, 1, 1, 0, mip0);
      cube.getPixelBuffer(TextureCubeFace.PositiveX, 0, 0, 1, 1, 1, mip1);
      expect(Array.from(mip1)).toEqual(Array.from(mip0));
      expect(mip1[2]).toBeGreaterThan(mip1[0]);
    } finally {
      camera.renderTarget = null;
      target.destroy();
      cube.destroy();
    }
  });

  it("supports rendering to non-zero mip levels of a color-only Texture2D RenderTarget without depth attachment", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0.75, 0.25, 0.5, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;

    const tex2d = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const target = new RenderTarget(engine, 16, 16, tex2d, null);
    target.autoGenerateMipmaps = false;
    camera.renderTarget = target;

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    try {
      expect(() => camera.render(undefined, 0)).not.toThrow();
      expect(() => camera.render(undefined, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const mip0 = new Uint8Array(4);
      const mip1 = new Uint8Array(4);
      tex2d.getPixelBuffer(0, 0, 1, 1, 0, mip0);
      tex2d.getPixelBuffer(0, 0, 1, 1, 1, mip1);
      expect(Array.from(mip1)).toEqual(Array.from(mip0));
      expect(mip1[0]).toBeGreaterThan(mip1[1]);
    } finally {
      camera.renderTarget = null;
      target.destroy();
      tex2d.destroy();
    }
  });

  it("releases pooled color-pass RenderTargets when switching from a normal RenderTarget to a depth-only RenderTarget", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.antiAliasing = AntiAliasing.FXAA;
    camera.enablePostProcess = true;
    camera.opaqueTextureEnabled = true;
    cameraEntity.transform.setPosition(0, 0, 3);

    const postEntity = scene.createRootEntity("post-process");
    const pp = postEntity.addComponent(PostProcess);
    pp.isGlobal = true;
    const bloom = pp.addEffect(BloomEffect)!;
    bloom.intensity.value = 1;

    const cubeEntity = scene.createRootEntity("cube");
    const renderer = cubeEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(new UnlitMaterial(engine));

    const colorTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false);
    const normalTarget = new RenderTarget(engine, 64, 64, colorTexture, TextureFormat.Depth24);
    const depthTexture = new Texture2D(engine, 64, 64, TextureFormat.Depth24, false);
    const depthOnlyTarget = new RenderTarget(engine, 64, 64, null, depthTexture);

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    // @ts-ignore
    const pipeline = camera._renderPipeline as any;
    // @ts-ignore
    const postProcessManager = scene.postProcessManager as any;

    try {
      camera.renderTarget = normalTarget;
      expect(() => camera.render()).not.toThrow();
      expect(pipeline._opaqueTexturePass._renderTarget).not.toBeNull();
      expect(pipeline._finalPass._srgbRenderTarget).not.toBeNull();

      camera.renderTarget = depthOnlyTarget;
      expect(() => camera.render()).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      expect(pipeline._opaqueTexturePass._renderTarget).toBeNull();
      expect(pipeline._opaqueTexturePass._cameraColorTexture).toBeNull();
      expect(pipeline._finalPass._srgbRenderTarget).toBeNull();
      expect(postProcessManager._swapRenderTarget ?? null).toBeNull();
      expect(postProcessManager._outputRenderTarget ?? null).toBeNull();
    } finally {
      camera.renderTarget = null;
      normalTarget.destroy();
      colorTexture.destroy();
      depthOnlyTarget.destroy();
      depthTexture.destroy();
    }
  });

  it("supports depth-only MSAA RenderTarget resolve and non-zero mip switching with depth RenderBuffer", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;
    cameraEntity.transform.setPosition(0, 0, 3);

    const cubeEntity = scene.createRootEntity("cube");
    const renderer = cubeEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(new UnlitMaterial(engine));

    const depthTexture = new Texture2D(engine, 64, 64, TextureFormat.Depth24, false);
    const msaaDepthTarget = new RenderTarget(engine, 64, 64, null, depthTexture, 4);

    const colorTexture = new Texture2D(engine, 16, 8, TextureFormat.R8G8B8A8_UNorm, true, false);
    const depthRboTarget = new RenderTarget(engine, 16, 8, colorTexture, TextureFormat.Depth16, 1);
    depthRboTarget.autoGenerateMipmaps = false;

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    // @ts-ignore
    const glMsaaDepth = msaaDepthTarget._platformRenderTarget as any;

    try {
      camera.renderTarget = msaaDepthTarget;
      expect(() => camera.render()).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      expect(glMsaaDepth._blitDrawBuffers).toBeNull();
      expect(glMsaaDepth._MSAAColorRenderBuffers).toBeNull();

      camera.renderTarget = depthRboTarget;
      expect(() => camera.render(undefined, 0)).not.toThrow();
      expect(() => camera.render(undefined, 3)).not.toThrow();
      expect(() => camera.render(undefined, 4)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      camera.renderTarget = null;
      msaaDepthTarget.destroy();
      expect(glMsaaDepth._oriDrawBuffers).toBeNull();
      expect(glMsaaDepth._blitDrawBuffers).toBeNull();
      expect(glMsaaDepth._depthRenderBufferInternalFormat).toBe(0);
      depthTexture.destroy();
      depthRboTarget.destroy();
      colorTexture.destroy();
    }
  });

  it("renders color-only Texture2D and TextureCube mip 1 with HDR and FXAA preserving orientation and pixels", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0.1, 0.2, 0.8, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 3);

    // Asymmetric red bar in the upper half (+Y) so cube-face orientation mismatches are caught immediately.
    const barEntity = scene.createRootEntity("upper-bar");
    barEntity.transform.setPosition(0, 0.9, 0);
    const barRenderer = barEntity.addComponent(MeshRenderer);
    barRenderer.mesh = PrimitiveMesh.createCuboid(engine, 4, 1.4, 0.2);
    const redMat = new UnlitMaterial(engine);
    redMat.baseColor = new Color(1, 0, 0, 1);
    barRenderer.setMaterial(redMat);

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    // 1. 16x16 color-only Texture2D mip 1 with enableHDR = true
    const hdrTex2d = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const hdrTarget2d = new RenderTarget(engine, 16, 16, hdrTex2d, null);
    hdrTarget2d.autoGenerateMipmaps = false;

    // 2. 16x16 color-only Texture2D mip 1 with antiAliasing = AntiAliasing.FXAA
    const fxaaTex2d = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const fxaaTarget2d = new RenderTarget(engine, 16, 16, fxaaTex2d, null);
    fxaaTarget2d.autoGenerateMipmaps = false;

    // 3. 16x16 color-only TextureCube face + mip 1: direct baseline vs HDR vs FXAA
    const baseCube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const baseCubeTarget = new RenderTarget(engine, 16, 16, baseCube, null);
    baseCubeTarget.autoGenerateMipmaps = false;

    const hdrCube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const hdrCubeTarget = new RenderTarget(engine, 16, 16, hdrCube, null);
    hdrCubeTarget.autoGenerateMipmaps = false;

    const fxaaCube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const fxaaCubeTarget = new RenderTarget(engine, 16, 16, fxaaCube, null);
    fxaaCubeTarget.autoGenerateMipmaps = false;

    try {
      // Texture2D mip 1 with HDR
      camera.enableHDR = true;
      camera.antiAliasing = AntiAliasing.None;
      camera.renderTarget = hdrTarget2d;
      expect(() => camera.render(undefined, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const hdrTop = new Uint8Array(4);
      const hdrBot = new Uint8Array(4);
      hdrTex2d.getPixelBuffer(4, 1, 1, 1, 1, hdrTop);
      hdrTex2d.getPixelBuffer(4, 6, 1, 1, 1, hdrBot);
      // In 2D RT, upper half (y=1) is red bar and lower half (y=6) is blue background
      expect(hdrTop[0]).toBeGreaterThan(200);
      expect(hdrTop[2]).toBeLessThan(50);
      expect(hdrBot[2]).toBeGreaterThan(150);
      expect(hdrBot[0]).toBeLessThan(80);

      // Texture2D mip 1 with FXAA
      camera.enableHDR = false;
      camera.antiAliasing = AntiAliasing.FXAA;
      camera.renderTarget = fxaaTarget2d;
      expect(() => camera.render(undefined, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const fxaaTop = new Uint8Array(4);
      const fxaaBot = new Uint8Array(4);
      fxaaTex2d.getPixelBuffer(4, 1, 1, 1, 1, fxaaTop);
      fxaaTex2d.getPixelBuffer(4, 6, 1, 1, 1, fxaaBot);
      expect(fxaaTop[0]).toBeGreaterThan(200);
      expect(fxaaTop[2]).toBeLessThan(50);
      expect(fxaaBot[2]).toBeGreaterThan(150);
      expect(fxaaBot[0]).toBeLessThan(120);

      // TextureCube PositiveX mip 1: direct baseline
      camera.enableHDR = false;
      camera.antiAliasing = AntiAliasing.None;
      camera.renderTarget = baseCubeTarget;
      expect(() => camera.render(TextureCubeFace.PositiveX, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const baseRow1 = new Uint8Array(4);
      const baseRow6 = new Uint8Array(4);
      baseCube.getPixelBuffer(TextureCubeFace.PositiveX, 4, 1, 1, 1, 1, baseRow1);
      baseCube.getPixelBuffer(TextureCubeFace.PositiveX, 4, 6, 1, 1, 1, baseRow6);
      const baseRedAtRow6 = baseRow6[0] > baseRow6[2];
      expect(baseRow1[0] > baseRow1[2]).toBe(!baseRedAtRow6);

      // TextureCube PositiveX mip 1: HDR
      camera.enableHDR = true;
      camera.antiAliasing = AntiAliasing.None;
      camera.renderTarget = hdrCubeTarget;
      expect(() => camera.render(TextureCubeFace.PositiveX, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const hdrCubeRow1 = new Uint8Array(4);
      const hdrCubeRow6 = new Uint8Array(4);
      hdrCube.getPixelBuffer(TextureCubeFace.PositiveX, 4, 1, 1, 1, 1, hdrCubeRow1);
      hdrCube.getPixelBuffer(TextureCubeFace.PositiveX, 4, 6, 1, 1, 1, hdrCubeRow6);
      expect(hdrCubeRow6[0] > hdrCubeRow6[2]).toBe(baseRedAtRow6);
      expect(hdrCubeRow1[0] > hdrCubeRow1[2]).toBe(!baseRedAtRow6);

      // TextureCube PositiveX mip 1: FXAA
      camera.enableHDR = false;
      camera.antiAliasing = AntiAliasing.FXAA;
      camera.renderTarget = fxaaCubeTarget;
      expect(() => camera.render(TextureCubeFace.PositiveX, 1)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const fxaaCubeRow1 = new Uint8Array(4);
      const fxaaCubeRow6 = new Uint8Array(4);
      fxaaCube.getPixelBuffer(TextureCubeFace.PositiveX, 4, 1, 1, 1, 1, fxaaCubeRow1);
      fxaaCube.getPixelBuffer(TextureCubeFace.PositiveX, 4, 6, 1, 1, 1, fxaaCubeRow6);
      expect(fxaaCubeRow6[0] > fxaaCubeRow6[2]).toBe(baseRedAtRow6);
      expect(fxaaCubeRow1[0] > fxaaCubeRow1[2]).toBe(!baseRedAtRow6);
    } finally {
      camera.renderTarget = null;
      hdrTarget2d.destroy();
      hdrTex2d.destroy();
      fxaaTarget2d.destroy();
      fxaaTex2d.destroy();
      baseCubeTarget.destroy();
      baseCube.destroy();
      hdrCubeTarget.destroy();
      hdrCube.destroy();
      fxaaCubeTarget.destroy();
      fxaaCube.destroy();
    }
  });

  it("writes expected pixels to mip 3 (2x1) of a non-square 16x4 Texture2D RenderTarget", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0.25, 0.75, 0.5, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;

    const tex = new Texture2D(engine, 16, 4, TextureFormat.R8G8B8A8_UNorm, true, false);
    const target = new RenderTarget(engine, 16, 4, tex, null);
    target.autoGenerateMipmaps = false;
    camera.renderTarget = target;

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    try {
      expect(() => camera.render(undefined, 3)).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Mip 3 of 16x4 is 2x1; viewport/scissor must clamp height to 1 rather than 0.
      const pixels = new Uint8Array(2 * 1 * 4);
      tex.getPixelBuffer(0, 0, 2, 1, 3, pixels);
      for (let i = 0; i < 2; i++) {
        const base = i * 4;
        expect(pixels[base]).toBeGreaterThan(40);
        expect(pixels[base + 1]).toBeGreaterThan(170);
        expect(pixels[base + 2]).toBeGreaterThan(100);
        expect(pixels[base + 3]).toBe(255);
      }
    } finally {
      camera.renderTarget = null;
      target.destroy();
      tex.destroy();
    }
  });

  it("resolves stencil values for a depth-only 4x MSAA Depth24Stencil8 RenderTarget", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0, 0, 0, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;
    cameraEntity.transform.setPosition(0, 0, 3);

    const quadEntity = scene.createRootEntity("quad");
    const quadRenderer = quadEntity.addComponent(MeshRenderer);
    quadRenderer.mesh = PrimitiveMesh.createCuboid(engine, 4, 4, 0.2);

    const writeStencilShader = Shader.create(`
      Shader "test-msaa-write-stencil-7" {
        SubShader "Default" {
          Pass "Forward" {
            StencilState stencilState {
              Enabled = true;
              Mask = 255;
              WriteMask = 255;
              ReferenceValue = 7;
              CompareFunctionFront = CompareFunction.Always;
              CompareFunctionBack = CompareFunction.Always;
              PassOperationFront = StencilOperation.Replace;
              PassOperationBack = StencilOperation.Replace;
            }
            StencilState = stencilState;
            mat4 renderer_MVPMat;
            struct a2v { vec4 POSITION; };
            struct v2f { vec4 pos; };
            v2f vert(a2v v) {
              v2f o;
              gl_Position = renderer_MVPMat * v.POSITION;
              o.pos = gl_Position;
              return o;
            }
            void frag(v2f i) {
              gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
            }
            VertexShader = vert;
            FragmentShader = frag;
          }
        }
      }
    `);
    const verifyStencilShader = Shader.create(`
      Shader "test-msaa-verify-stencil-7" {
        SubShader "Default" {
          Pass "Forward" {
            DepthState depthState {
              Enabled = false;
              WriteEnabled = false;
            }
            DepthState = depthState;
            StencilState stencilState {
              Enabled = true;
              Mask = 255;
              WriteMask = 0;
              ReferenceValue = 7;
              CompareFunctionFront = CompareFunction.Equal;
              CompareFunctionBack = CompareFunction.Equal;
              PassOperationFront = StencilOperation.Keep;
              PassOperationBack = StencilOperation.Keep;
            }
            StencilState = stencilState;
            mat4 renderer_MVPMat;
            struct a2v { vec4 POSITION; };
            struct v2f { vec4 pos; };
            v2f vert(a2v v) {
              v2f o;
              gl_Position = renderer_MVPMat * v.POSITION;
              o.pos = gl_Position;
              return o;
            }
            void frag(v2f i) {
              gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
            }
            VertexShader = vert;
            FragmentShader = frag;
          }
        }
      }
    `);

    const writeStencilMat = new Material(engine, writeStencilShader);
    const verifyStencilMat = new Material(engine, verifyStencilShader);

    const depthStencilTex = new Texture2D(engine, 16, 16, TextureFormat.Depth24Stencil8, false);
    const msaaDepthTarget = new RenderTarget(engine, 16, 16, null, depthStencilTex, 4);
    const probeColorTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const probeTarget = new RenderTarget(engine, 16, 16, probeColorTex, depthStencilTex, 1);

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    try {
      // Seed the resolved Depth24Stencil8 texture's stencil buffer with 1.
      // @ts-ignore
      const probeFBO = probeTarget._platformRenderTarget._frameBuffer as WebGLFramebuffer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, probeFBO);
      gl.clearStencil(1);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.clearStencil(0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Render into the depth-only 4x MSAA target writing stencil = 7, which resolves into depthStencilTex.
      quadRenderer.setMaterial(writeStencilMat);
      camera.clearFlags = CameraClearFlags.DepthStencil;
      camera.renderTarget = msaaDepthTarget;
      expect(() => camera.render()).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      // Probe depthStencilTex with stencil == 7; only passes if MSAA stencil resolve copied 7 over 1.
      quadRenderer.setMaterial(verifyStencilMat);
      camera.clearFlags = CameraClearFlags.Color;
      camera.renderTarget = probeTarget;
      expect(() => camera.render()).not.toThrow();
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const center = new Uint8Array(4);
      probeColorTex.getPixelBuffer(8, 8, 1, 1, 0, center);
      expect(center[1]).toBeGreaterThan(240);
      expect(center[0]).toBeLessThan(15);
      expect(center[2]).toBeLessThan(15);
    } finally {
      camera.renderTarget = null;
      msaaDepthTarget.destroy();
      probeTarget.destroy();
      probeColorTex.destroy();
      depthStencilTex.destroy();
      writeStencilMat.destroy();
      verifyStencilMat.destroy();
      writeStencilShader.destroy();
      verifyStencilShader.destroy();
    }
  });

  it("matches direct pixel rows for a TextureCube face with a half-height viewport under HDR and FXAA", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);

    const directCube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const directTarget = new RenderTarget(engine, 16, 16, directCube, null);
    const hdrCube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const hdrTarget = new RenderTarget(engine, 16, 16, hdrCube, null);
    const fxaaCube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const fxaaTarget = new RenderTarget(engine, 16, 16, fxaaCube, null);

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    const clearBlackAndRenderHalf = (target: RenderTarget, enableHDR: boolean, aa: AntiAliasing) => {
      camera.enableHDR = false;
      camera.antiAliasing = AntiAliasing.None;
      camera.viewport = new Vector4(0, 0, 1, 1);
      scene.background.solidColor = new Color(0, 0, 0, 1);
      camera.renderTarget = target;
      camera.render(TextureCubeFace.PositiveX, 0);

      camera.enableHDR = enableHDR;
      camera.antiAliasing = aa;
      camera.viewport = new Vector4(0, 0, 1, 0.5);
      scene.background.solidColor = new Color(0, 1, 0, 1);
      camera.render(TextureCubeFace.PositiveX, 0);
    };

    try {
      clearBlackAndRenderHalf(directTarget, false, AntiAliasing.None);
      clearBlackAndRenderHalf(hdrTarget, true, AntiAliasing.None);
      clearBlackAndRenderHalf(fxaaTarget, false, AntiAliasing.FXAA);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      for (const cube of [directCube, hdrCube, fxaaCube]) {
        const lowerRow = new Uint8Array(4);
        const upperRow = new Uint8Array(4);
        cube.getPixelBuffer(TextureCubeFace.PositiveX, 8, 2, 1, 1, 0, lowerRow);
        cube.getPixelBuffer(TextureCubeFace.PositiveX, 8, 12, 1, 1, 0, upperRow);
        expect(upperRow[1]).toBeGreaterThan(200);
        expect(lowerRow[1]).toBeLessThan(20);
      }
    } finally {
      camera.renderTarget = null;
      directTarget.destroy();
      directCube.destroy();
      hdrTarget.destroy();
      hdrCube.destroy();
      fxaaTarget.destroy();
      fxaaCube.destroy();
    }
  });

  it("samples source mip 1 into camera_OpaqueTexture when opaqueTextureEnabled is used on direct RGBA8 Texture2D", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;

    const tex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const target = new RenderTarget(engine, 16, 16, tex, null);
    target.autoGenerateMipmaps = false;
    camera.renderTarget = target;

    const gl = canvas.getContext("webgl2")!;
    gl.getError();

    try {
      // Populate mip 0 with red.
      scene.background.solidColor = new Color(1, 0, 0, 1);
      camera.opaqueTextureEnabled = false;
      camera.render(undefined, 0);

      // Render mip 1 with blue and opaqueTextureEnabled = true (direct RGBA8 path, no internalColorTarget).
      scene.background.solidColor = new Color(0, 0, 1, 1);
      camera.opaqueTextureEnabled = true;
      camera.render(undefined, 1);
      expect(gl.getError()).toBe(gl.NO_ERROR);

      const opaqueTex = camera.shaderData.getTexture("camera_OpaqueTexture") as Texture2D | null;
      expect(opaqueTex).not.toBeNull();
      const pixel = new Uint8Array(4);
      opaqueTex!.getPixelBuffer(0, 0, 1, 1, 0, pixel);
      expect(pixel[2]).toBeGreaterThan(200);
      expect(pixel[0]).toBeLessThan(20);
    } finally {
      camera.renderTarget = null;
      target.destroy();
      tex.destroy();
    }
  });
});
