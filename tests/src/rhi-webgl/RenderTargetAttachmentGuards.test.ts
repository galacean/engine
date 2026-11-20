import {
  AntiAliasing,
  BloomEffect,
  Camera,
  Color,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  RenderTarget,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
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

    const scene = engine.sceneManager.activeScene;
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
    const bloom = pp.addEffect(BloomEffect);
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

    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0.25, 0.5, 0.75, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;

    const cube = new TextureCube(engine, 16, TextureFormat.R8G8B8A8, true, false);
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

    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor = new Color(0.75, 0.25, 0.5, 1);

    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;

    const tex2d = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8, true, false);
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
});
