import {
  AssetType,
  Camera,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureUsage
} from "@galacean/engine-core";
import "@galacean/engine-loader";
import { Color } from "@galacean/engine-math";
import { WebGLEngine, WebGLMode } from "@galacean/engine-rhi-webgl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let shaderId = 0;
describe.each([
  { name: "WebGL1 without EXT_sRGB", mode: WebGLMode.WebGL1, missingSRGB: true },
  { name: "WebGL1 with EXT_sRGB", mode: WebGLMode.WebGL1, missingSRGB: false },
  { name: "WebGL2", mode: WebGLMode.WebGL2, missingSRGB: false }
])("sRGB uploads: $name", ({ mode, missingSRGB }) => {
  let engine: WebGLEngine;
  let gl: WebGLRenderingContext;
  let camera: Camera;
  let renderer: MeshRenderer;
  let output: Texture2D;

  beforeEach(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    gl = canvas.getContext(mode === WebGLMode.WebGL2 ? "webgl2" : "webgl");
    const getExtension = gl.getExtension.bind(gl);
    vi.spyOn(gl, "getExtension").mockImplementation((name) =>
      (missingSRGB && name === "EXT_sRGB") || name.includes("compressed_texture_astc") ? null : getExtension(name)
    );
    if (!missingSRGB && mode === WebGLMode.WebGL1) expect(getExtension("EXT_sRGB")).not.toBeNull();
    engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: mode } });
    const root = engine.sceneManager.activeScene.createRootEntity();
    const cameraEntity = root.createChild();
    cameraEntity.transform.setPosition(0, 0, 3);
    camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    output = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8, false, false);
    camera.renderTarget = new RenderTarget(engine, 32, 32, output, null);
    renderer = root.createChild().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
  });

  afterEach(() => {
    engine?.destroy();
    vi.restoreAllMocks();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });

  function sample(texture: Texture2D | TextureCube, expression = "texture2D(customTex, vec2(0.5))", toggle?: string) {
    const shader = Shader.create(
      `srgb-upload-${shaderId++}`,
      `attribute vec3 POSITION; uniform mat4 renderer_MVPMat;
       void main() { gl_Position = renderer_MVPMat * vec4(POSITION, 1.0); }`,
      `#include <common>\nuniform ${texture instanceof TextureCube ? "samplerCube" : "sampler2D"} customTex;
       ${toggle ? `uniform bool ${toggle};` : ""}
       void main() { gl_FragColor = ${expression}; }`
    );
    const material = new Material(engine, shader);
    material.shaderData.setTexture("customTex", texture);
    if (toggle) material.shaderData.setInt(toggle, 1);
    renderer.setMaterial(material);
    camera.render();
    const pixel = new Uint8Array(4);
    output.getPixelBuffer(16, 16, 1, 1, pixel);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    return Array.from(pixel);
  }

  function near(actual: number[], expected: number[], tolerance = 2) {
    expected.forEach((value, i) => expect(Math.abs(actual[i] - value)).toBeLessThanOrEqual(tolerance));
  }

  function imageData() {
    return new ImageData(new Uint8ClampedArray([128, 64, 255, 128, 255, 128, 64, 255]), 1, 2);
  }

  function canvasImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 2;
    canvas.getContext("2d").putImageData(imageData(), 0, 0);
    return canvas;
  }

  it.each([TextureFormat.R8G8B8, TextureFormat.R8G8B8A8])(
    "converts offset buffers and partial updates without mutating input (%s)",
    (format) => {
      const channels = format === TextureFormat.R8G8B8 ? 3 : 4;
      const texture = new Texture2D(engine, 2, 2, format, false, true);
      texture.filterMode = TextureFilterMode.Point;
      texture.setPixelBuffer(new Uint8Array(4 * channels).fill(255));
      const backing = new Uint8Array([17, 128, 64, 255, 127, 18]);
      const input = backing.subarray(1, 1 + channels);
      const before = backing.slice();
      texture.setPixelBuffer(input, 0, 1, 0, 1, 1);
      expect(backing).toEqual(before);
      expect(texture.isSRGBColorSpace).toBe(true);
      near(sample(texture, "texture2D(customTex, vec2(0.75, 0.25))"), [55, 13, 255, channels === 4 ? 127 : 255]);
      near(sample(texture, "texture2D(customTex, vec2(0.25, 0.75))"), [255, 255, 255, 255]);
    }
  );

  it("does not decode linear input or decode sRGB input a second time in the legacy helper", () => {
    for (const srgb of [false, true]) {
      const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, srgb);
      texture.setPixelBuffer(new Uint8Array([128, 128, 128, 255]));
      near(sample(texture, "texture2DSRGB(customTex, vec2(0.5))"), [
        srgb ? 55 : 128,
        srgb ? 55 : 128,
        srgb ? 55 : 128,
        255
      ]);
    }
  });

  it.each(["userToggle", "customTex_SRGBDecode"])("preserves user-owned boolean %s", (toggle) => {
    const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
    texture.setPixelBuffer(new Uint8Array([128, 128, 128, 255]));
    near(
      sample(texture, `vec4(texture2D(customTex, vec2(0.5)).rgb * (${toggle} ? 0.5 : 1.0), 1.0)`, toggle),
      [64, 64, 64, 255]
    );
  });

  it.each(["image", "canvas", "imageData", "bitmap"])(
    "matches browser image upload orientation and alpha rules (%s)",
    async (kind) => {
      const canvas = canvasImage();
      let source: TexImageSource = canvas;
      if (kind === "imageData") source = imageData();
      if (kind === "image") {
        const image = new Image();
        image.src = canvas.toDataURL();
        await image.decode();
        source = image;
      }
      if (kind === "bitmap")
        source = await createImageBitmap(canvas, { imageOrientation: "flipY", premultiplyAlpha: "premultiply" });
      try {
        const linear = new Texture2D(engine, 1, 2, TextureFormat.R8G8B8A8, false, false);
        const srgb = new Texture2D(engine, 1, 2, TextureFormat.R8G8B8A8, false, true);
        linear.filterMode = srgb.filterMode = TextureFilterMode.Point;
        for (const flipY of [false, true])
          for (const premultiply of [false, true]) {
            linear.setImageSource(source, 0, flipY, premultiply);
            srgb.setImageSource(source, 0, flipY, premultiply);
            for (const v of [0.25, 0.75]) {
              const expression = `texture2D(customTex, vec2(0.5, ${v}))`;
              const original = sample(linear, expression);
              const expected = original.map((value, i) =>
                i === 3 ? value : Math.round(Color.sRGBToLinearSpace(value / 255) * 255)
              );
              near(sample(srgb, expression), expected);
            }
          }
      } finally {
        if (source instanceof ImageBitmap) source.close();
      }
    }
  );

  it("supports RGB image uploads, image subregions and repeated dynamic uploads", () => {
    const source = canvasImage();
    const partial = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8, false, true);
    partial.filterMode = TextureFilterMode.Point;
    partial.setPixelBuffer(new Uint8Array(12).fill(255));
    partial.setImageSource(source, 0, false, false, 1, 0);
    near(sample(partial, "texture2D(customTex, vec2(0.75, 0.75))"), [255, 55, 13, 255]);
    near(sample(partial, "texture2D(customTex, vec2(0.25, 0.75))"), [255, 255, 255, 255]);
    const dynamic = new Texture2D(engine, 1, 2, TextureFormat.R8G8B8A8, false, true, TextureUsage.Dynamic);
    dynamic.filterMode = TextureFilterMode.Point;
    dynamic.setImageSource(source);
    near(sample(dynamic, "texture2D(customTex, vec2(0.5, 0.75))"), [255, 55, 13, 255]);
    source.getContext("2d").fillStyle = "white";
    source.getContext("2d").fillRect(0, 0, 1, 2);
    dynamic.setImageSource(source);
    near(sample(dynamic), [255, 255, 255, 255]);
  });

  it("converts cube images and partial cube buffer updates", () => {
    const cube = new TextureCube(engine, 2, TextureFormat.R8G8B8A8, false, true);
    cube.filterMode = TextureFilterMode.Point;
    for (let face = 0; face < 6; face++) cube.setPixelBuffer(face, new Uint8Array(16).fill(255));
    cube.setImageSource(TextureCubeFace.PositiveX, canvasImage(), 0, false, false, 1, 0);
    near(sample(cube, "textureCube(customTex, vec3(1.0, -0.5, -0.5))"), [255, 55, 13, 255]);
    const source = new Uint8Array([128, 128, 128, 255]);
    cube.setPixelBuffer(TextureCubeFace.PositiveX, source, 0, 1, 1, 1, 1);
    near(sample(cube, "textureCube(customTex, vec3(1.0, -0.5, -0.5))"), [55, 55, 55, 255]);
    expect(source).toEqual(new Uint8Array([128, 128, 128, 255]));
  });

  it("restores framebuffer and pack state and releases temporary upload resources", () => {
    const texture = new Texture2D(engine, 1, 2, TextureFormat.R8G8B8A8, false, true);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 8);
    const createTexture = vi.spyOn(gl, "createTexture");
    const deleteTexture = vi.spyOn(gl, "deleteTexture");
    const createFramebuffer = vi.spyOn(gl, "createFramebuffer");
    const deleteFramebuffer = vi.spyOn(gl, "deleteFramebuffer");
    for (let i = 0; i < 3; i++) texture.setImageSource(canvasImage());
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(framebuffer);
    expect(gl.getParameter(gl.PACK_ALIGNMENT)).toBe(8);
    expect(createTexture).toHaveBeenCalledTimes(missingSRGB ? 3 : 0);
    expect(deleteTexture).toHaveBeenCalledTimes(missingSRGB ? 3 : 0);
    expect(createFramebuffer).toHaveBeenCalledTimes(missingSRGB ? 3 : 0);
    expect(deleteFramebuffer).toHaveBeenCalledTimes(missingSRGB ? 3 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.deleteFramebuffer(framebuffer);
    near(sample(texture, "texture2D(customTex, vec2(0.5, 0.75))"), [255, 55, 13, 255]);
  });

  it("converts explicitly uploaded mip levels", () => {
    const texture = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8, true, true);
    texture.filterMode = TextureFilterMode.Point;
    for (let level = 0; level < 3; level++) {
      const size = 4 >> level;
      const pixels = new Uint8Array(size * size * 4).fill(level === 1 ? 128 : 255);
      for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
      texture.setPixelBuffer(pixels, level);
    }
    near(sample(texture, "texture2DLodEXT(customTex, vec2(0.5), 1.0)"), [55, 55, 55, 255]);
  });

  it.runIf(missingSRGB)("generates mipmaps from linearized pixels", () => {
    const texture = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8A8, true, true);
    texture.setPixelBuffer(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]));
    texture.generateMipmaps();
    near(sample(texture, "texture2DLodEXT(customTex, vec2(0.5), 1.0)"), [128, 128, 128, 255]);
  });

  it("returns readback in the declared input color space without touching trailing output bytes", () => {
    const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, true);
    texture.setPixelBuffer(new Uint8Array([128, 64, 255, 127]));
    const backing = new Uint8Array(8).fill(19);
    texture.getPixelBuffer(backing.subarray(1, 7));
    near(Array.from(backing.subarray(1, 5)), [128, 64, 255, 127]);
    expect(Array.from(backing.subarray(5))).toEqual([19, 19, 19]);
    expect(backing[0]).toBe(19);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("restores loader textures through the same upload conversion", async () => {
    const loaded = await engine.resourceManager.load<Texture2D>({
      url: canvasImage().toDataURL(),
      type: AssetType.Texture2D,
      params: { mipmap: true }
    });
    expect(loaded.mipmapCount).toBe(missingSRGB || mode === WebGLMode.WebGL2 ? 2 : 1);
    loaded.filterMode = TextureFilterMode.Point;
    const before = new Uint8Array(4);
    loaded.getPixelBuffer(0, 1, 1, 1, before);
    near(Array.from(before), [255, 128, 64, 255]);
    const lost = new Promise<void>((resolve) => engine.on("devicelost", () => resolve()));
    engine.forceLoseDevice();
    await lost;
    const restored = new Promise<void>((resolve) => engine.on("devicerestored", () => resolve()));
    // Restore only after the browser has finished dispatching the loss event.
    await new Promise((resolve) => setTimeout(resolve, 100));
    engine.forceRestoreDevice();
    await restored;
    expect(gl.getError()).toBe(gl.NO_ERROR);
    const pixel = new Uint8Array(4);
    loaded.getPixelBuffer(0, 1, 1, 1, pixel);
    near(Array.from(pixel), [255, 128, 64, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
