import {
  AntiAliasing,
  BackgroundMode,
  BloomEffect,
  PostProcess,
  SkyBoxMaterial,
  Camera,
  CameraClearFlags,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  UnlitMaterial
} from "@galacean/engine-core";
import { WebGLEngine, WebGLMode } from "@galacean/engine-rhi-webgl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.each([
  { name: "WebGL1 without EXT_sRGB", mode: WebGLMode.WebGL1, missingSRGB: true },
  { name: "WebGL1 with EXT_sRGB", mode: WebGLMode.WebGL1, missingSRGB: false },
  { name: "WebGL2", mode: WebGLMode.WebGL2, missingSRGB: false }
])("$name", ({ mode, missingSRGB }) => {
  let engine: WebGLEngine;
  let gl: WebGLRenderingContext;
  let camera: Camera;
  let material: UnlitMaterial;
  let renderer: MeshRenderer;

  beforeEach(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    gl = canvas.getContext(mode === WebGLMode.WebGL2 ? "webgl2" : "webgl");
    expect(gl).not.toBeNull();
    const getExtension = gl.getExtension.bind(gl);
    vi.spyOn(gl, "getExtension").mockImplementation((name) => {
      // Keep this regression independent of ASTC profile discovery.
      return (missingSRGB && name === "EXT_sRGB") || name.includes("compressed_texture_astc")
        ? null
        : getExtension(name);
    });
    engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: mode } });
    engine.sceneManager.activeScene.background.solidColor.set(0, 0, 0, 1);
    if (!missingSRGB && mode === WebGLMode.WebGL1) expect(getExtension("EXT_sRGB")).not.toBeNull();
    const root = engine.sceneManager.activeScene.createRootEntity();
    const cameraEntity = root.createChild();
    cameraEntity.transform.setPosition(0, 0, 3);
    camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    renderer = root.createChild().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
    material = new UnlitMaterial(engine);
    renderer.setMaterial(material);
  });

  afterEach(() => {
    engine?.destroy();
    vi.restoreAllMocks();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });

  function texture(srgb: boolean, value = 128): Texture2D {
    const result = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, srgb);
    result.setPixelBuffer(new Uint8Array([value, value, value, 255]));
    return result;
  }

  function screenPixel(): Uint8Array {
    camera.render();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixel = new Uint8Array(4);
    gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    return pixel;
  }

  function expectGray(pixel: Uint8Array, value: number): void {
    for (let i = 0; i < 3; i++) expect(Math.abs(pixel[i] - value)).toBeLessThanOrEqual(2);
    expect(pixel[3]).toBe(255);
  }

  it("allocates sRGB input textures without changing their color space", () => {
    const image = texture(true);
    const cube = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false, true);
    for (let face = 0; face < 6; face++) {
      cube.setPixelBuffer(face as TextureCubeFace, new Uint8Array([128, 128, 128, 255]));
    }
    expect(image.isSRGBColorSpace).toBe(true);
    expect(cube.isSRGBColorSpace).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("decodes sRGB input once and preserves linear input when textures change", () => {
    material.baseTexture = texture(true);
    expectGray(screenPixel(), 128);
    material.baseTexture = texture(false);
    expectGray(screenPixel(), 188);
    material.baseTexture = texture(true);
    expectGray(screenPixel(), 128);
  });

  it("keeps the FXAA intermediate and final conversion consistent", () => {
    camera.antiAliasing = AntiAliasing.FXAA;
    material.baseTexture = texture(true);
    expectGray(screenPixel(), 128);
  });

  it("decodes PBR emissive textures according to the bound texture", () => {
    const pbr = new PBRMaterial(engine);
    pbr.baseColor.set(0, 0, 0, 1);
    pbr.emissiveColor.set(1, 1, 1, 1);
    renderer.setMaterial(pbr);
    pbr.emissiveTexture = texture(true);
    expectGray(screenPixel(), 128);
    pbr.emissiveTexture = texture(false);
    expectGray(screenPixel(), 188);
  });

  it("does not add software decode uniforms on any device", () => {
    const linkProgram = vi.spyOn(gl, "linkProgram");
    material.baseTexture = texture(true);
    expectGray(screenPixel(), 128);
    const decodeUniforms: string[] = [];
    for (const [program] of linkProgram.mock.calls) {
      for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
        const { name } = gl.getActiveUniform(program, i);
        if (name.endsWith("_SRGBDecode")) decodeUniforms.push(name);
      }
    }
    expect(decodeUniforms).toHaveLength(0);
  });

  it("follows custom sampler bindings across materials, clones and destroyed textures", () => {
    const shader =
      Shader.find("srgb-fallback-custom") ??
      Shader.create(
        "srgb-fallback-custom",
        `attribute vec3 POSITION;
         uniform mat4 renderer_MVPMat;
         void main() { gl_Position = renderer_MVPMat * vec4(POSITION, 1.0); }`,
        `#include <common>
         uniform sampler2D material_CustomTexture;
         void main() {
           vec4 color = texture2D(material_CustomTexture, vec2(0.5));
           gl_FragColor = vec4(color.rgb * 0.5, 1.0);
         }`
      );
    const srgb = new Material(engine, shader);
    const linear = new Material(engine, shader);
    const input = texture(true);
    srgb.shaderData.setTexture("material_CustomTexture", input);
    linear.shaderData.setTexture("material_CustomTexture", texture(false));
    renderer.setMaterial(srgb);
    expectGray(screenPixel(), 92);
    renderer.setMaterial(linear);
    expectGray(screenPixel(), 137);
    renderer.setMaterial(srgb.clone());
    expectGray(screenPixel(), 92);
    input.destroy(true);
    expectGray(screenPixel(), 188);
  });

  it("renders to and samples a linear render target without another decode", () => {
    const color = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8, false, false);
    const target = new RenderTarget(engine, 32, 32, color, null);
    camera.renderTarget = target;
    material.baseTexture = texture(true);
    camera.render();
    const pixel = new Uint8Array(4);
    color.getPixelBuffer(16, 16, 1, 1, pixel);
    expectGray(pixel, 55);
    camera.renderTarget = null;
    material.baseTexture = color;
    expectGray(screenPixel(), 128);
  });

  it("accepts sRGB render targets only when supported", () => {
    const color = texture(true);
    if (missingSRGB) {
      expect(() => new RenderTarget(engine, 1, 1, color, null)).toThrow(/sRGB.*RenderTarget|RenderTarget.*sRGB/);
    } else {
      const target = new RenderTarget(engine, 1, 1, color, null);
      // Inspect the attachment created by the public constructor.
      // @ts-ignore
      gl.bindFramebuffer(gl.FRAMEBUFFER, target._platformRenderTarget._frameBuffer);
      expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      target.destroy();
    }
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("preserves the screen background when the next camera does not clear color", () => {
    material.baseTexture = texture(true);
    expectGray(screenPixel(), 128);
    material.isTransparent = true;
    material.baseColor.a = 0;
    camera.clearFlags = CameraClearFlags.DepthStencil;
    expectGray(screenPixel(), 128);
  });

  it("blends transparent color in linear space", () => {
    material.baseTexture = texture(true, 255);
    material.isTransparent = true;
    material.baseColor.a = 0.5;
    expectGray(screenPixel(), 188);
  });

  it.each([false, true])("preserves bloom colors with high-quality filtering %s", (highQuality) => {
    const postProcess = camera.entity.addComponent(PostProcess);
    const bloom = postProcess.addEffect(BloomEffect);
    bloom.threshold.value = 0;
    bloom.intensity.value = 0.25;
    bloom.highQualityFiltering.value = highQuality;
    camera.enablePostProcess = true;
    material.baseTexture = texture(true);
    engine.update();
    // Constant input stays constant through the blur pyramid: linear(128/255) * 1.25.
    expectGray(screenPixel(), 142);
  });

  it("decodes an sRGB cube map once and leaves a linear cube map unchanged", () => {
    renderer.enabled = false;
    camera.isOrthographic = false;
    const background = engine.sceneManager.activeScene.background;
    background.mode = BackgroundMode.Sky;
    background.sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const skyMaterial = new SkyBoxMaterial(engine);
    background.sky.material = skyMaterial;
    for (const srgb of [true, false]) {
      const cube = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false, srgb);
      for (let face = 0; face < 6; face++) {
        cube.setPixelBuffer(face as TextureCubeFace, new Uint8Array([128, 128, 128, 255]));
      }
      skyMaterial.texture = cube;
      expectGray(screenPixel(), srgb ? 128 : 188);
    }
  });
});
