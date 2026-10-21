import { AssetPromise, AssetType, Shader, ShaderFactory, WebGLEngine } from "@galacean/engine";
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
