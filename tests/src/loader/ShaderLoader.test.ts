import {
  AssetPromise,
  AssetType,
  Camera,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderFactory,
  Texture2D,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import "@galacean/engine-loader";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;

beforeEach(async () => {
  engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  engine.destroy();
});

// Frozen outputs from the published alpha.59 GLES300 compiler (target 1),
// dev/2.0 at 3ea2e78f2 and the explicit-block compiler at 5b0ead9cc (both target 0).
it.each([
  ["released-alpha59", "camera_LegacyTint"],
  ["legacy-seed-text", "camera_LegacyTint"],
  ["legacy-global-uniform", "camera_LegacyTint"],
  ["legacy-explicit-uniform", "historicalTint"]
])("draws single and instanced meshes from historical %s.shaderc", async (fixture, property) => {
  const parse = vi.spyOn(ShaderCompiler.prototype, "_parseShaderPass");
  const url = new URL(`/fixtures/shader-loader/${fixture}.shaderc`, location.origin).href;
  const shader = await engine.resourceManager.load<Shader>({ url, type: AssetType.Shader });
  const scene = engine.sceneManager.activeScene;
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(0, 0, 3);
  camera.isOrthographic = true;
  camera.orthographicSize = 1;
  const data = fixture === "legacy-explicit-uniform" ? scene.shaderData : camera.shaderData;
  data.setVector4(property, new Vector4(1, 0, 1, 1));
  const color = new Texture2D(engine, 16, 16, undefined, false);
  camera.renderTarget = new RenderTarget(engine, 16, 16, color);
  const renderer = scene.createRootEntity().addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new Material(engine, shader);
  renderer.setMaterial(material);
  const pixel = new Uint8Array(4);
  if (fixture === "released-alpha59" || fixture === "legacy-seed-text") {
    camera.render();
    color.getPixelBuffer(8, 8, 1, 1, pixel);
    expect(Array.from(pixel)).toEqual([0, 0, 255, 255]);
    material.shaderData.enableMacro("LEGACY_SHOW_TINT");
  }
  camera.render();
  color.getPixelBuffer(8, 8, 1, 1, pixel);
  expect(Array.from(pixel)).toEqual([255, 0, 255, 255]);
  renderer.entity.transform.setPosition(-0.55, 0, 0);
  const second = scene.createRootEntity().addComponent(MeshRenderer);
  second.entity.transform.setPosition(0.55, 0, 0);
  second.mesh = renderer.mesh;
  second.setMaterial(renderer.getMaterial());
  const draws = vi.spyOn(engine._hardwareRenderer.gl, "drawElementsInstanced");
  camera.render();
  expect(draws.mock.calls.some((call) => call[4] === 2)).toBe(true);
  for (const x of [4, 12]) {
    color.getPixelBuffer(x, 8, 1, 1, pixel);
    expect(Array.from(pixel)).toEqual([255, 0, 255, 255]);
  }
  expect(parse).not.toHaveBeenCalled();
});

describe("ShaderLoader source locations", () => {
  it.each([
    ["relative", "assets/"],
    ["root", "/assets/"],
    ["protocol", "//unused.example/assets/"]
  ])("loads and compiles an absolute HTTP shader with a %s base", async (name, base) => {
    const url = new URL(`/fixtures/shader-loader/${name}.shader`, location.origin).href;
    engine.resourceManager.baseUrl = base;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`ShaderLoaderAbsoluteURL-${name}`);

    const shader = await engine.resourceManager.load<Shader>({ url, type: AssetType.Shader });
    expect(shader.name).toBe(`ShaderLoaderAbsoluteURL-${name}`);
    expect(shader.compileVariant(engine, [])).toBe(true);
  });

  it.each([
    ["relative resource", "assets/", "Shaders/Main.shader", "assets/Shaders/Main.shader", "Shaders/Common.glsl"],
    ["root base", "/assets/", "Shaders/Main.shader", "/assets/Shaders/Main.shader", "Shaders/Common.glsl"],
    ["root resource", null, "/Shaders/Main.shader", "/Shaders/Main.shader", "Shaders/Common.glsl"],
    [
      "absolute base",
      "https://cdn.example/assets/",
      "Shaders/Main.shader",
      "https://cdn.example/assets/Shaders/Main.shader",
      "Shaders/Common.glsl"
    ],
    [
      "same origin absolute resource",
      "https://cdn.example/assets/",
      "https://cdn.example/assets/Shaders/Main.shader",
      "https://cdn.example/assets/Shaders/Main.shader",
      "Shaders/Common.glsl"
    ],
    [
      "different origin",
      "https://other.example/assets/",
      "https://cdn.example/Shaders/Main.shader",
      "https://cdn.example/Shaders/Main.shader",
      "https://cdn.example/Shaders/Common.glsl"
    ],
    [
      "relative base absolute resource",
      "assets/",
      "https://cdn.example/Shaders/Main.shader?v=1#source",
      "https://cdn.example/Shaders/Main.shader?v=1#source",
      "https://cdn.example/Shaders/Common.glsl"
    ],
    [
      "no base",
      null,
      "https://cdn.example/Shaders/Main.shader",
      "https://cdn.example/Shaders/Main.shader",
      "https://cdn.example/Shaders/Common.glsl"
    ]
  ])("preserves request and include resolution for %s", async (_label, base, url, requestURL, includeKey) => {
    const name = `ShaderLoaderInclude-${Math.random()}`;
    const source = `Shader "${name}" { SubShader "s" { Pass "p" {
#include "./Common.glsl"
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = includedColor(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    ShaderFactory.registerInclude(includeKey!, "vec4 includedColor() { return vec4(0.25); }");
    engine.resourceManager.baseUrl = base;
    const request = vi
      .spyOn(engine.resourceManager, "_requestByRemoteUrl")
      .mockReturnValue(AssetPromise.resolve(source));
    try {
      const shader = await engine.resourceManager.load<Shader>({ url: url!, type: AssetType.Shader });
      expect(request).toHaveBeenCalledWith(requestURL, expect.objectContaining({ type: "text" }));
      expect(shader.compileVariant(engine, [])).toBe(true);
    } finally {
      ShaderFactory.unregisterInclude(includeKey!);
    }
  });
});
