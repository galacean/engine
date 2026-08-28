import { AssetType, Shader } from "@galacean/engine";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;
let materialShaderName: string;

function createBlobURL(data: unknown, extension: string): string {
  return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })) + `#.${extension}`;
}

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  materialShaderName = `MaterialLoaderTestShader-${Math.random()}`;
  Shader._createFromPrecompiled({ name: materialShaderName, platformTarget: 0, subShaders: [] });
});

afterAll(() => {
  engine.destroy();
});

describe("ShaderLoader", () => {
  it("rejects duplicate shader creation", async () => {
    const name = `ShaderLoaderDuplicate-${Math.random()}`;
    const source = { name, platformTarget: 0, subShaders: [] };

    expect(
      await engine.resourceManager.load<Shader>({ url: createBlobURL(source, "shader"), type: AssetType.Shader })
    ).toBeInstanceOf(Shader);
    await expect(
      engine.resourceManager.load<Shader>({ url: createBlobURL(source, "shader"), type: AssetType.Shader })
    ).rejects.toBeDefined();
  });
});

describe("MaterialLoader", () => {
  it("rejects a material without a resolvable shader", async () => {
    await expect(
      engine.resourceManager.load({
        url: createBlobURL({ name: "missing-shader", shader: "missing", shaderData: {}, macros: [] }, "mat"),
        type: AssetType.Material
      })
    ).rejects.toBeDefined();
  });

  it("rejects a shader reference that resolves to another resource type", async () => {
    const textPath = "MaterialLoaderTest/not-a-shader";
    engine.resourceManager.registerVirtualResources([
      { virtualPath: textPath, path: createBlobURL("not a shader", "txt"), type: AssetType.Text }
    ]);

    await expect(
      engine.resourceManager.load({
        url: createBlobURL(
          { name: "wrong-shader-ref", shader: "missing", shaderRef: { url: textPath }, shaderData: {}, macros: [] },
          "mat"
        ),
        type: AssetType.Material
      })
    ).rejects.toBeDefined();
  });

  it.each(["Matrix", "TextureArray"])("rejects unsupported %s shader data", async (type) => {
    await expect(
      engine.resourceManager.load({
        url: createBlobURL(
          {
            name: "unsupported-shader-data",
            shader: materialShaderName,
            shaderData: { value: { type, value: [] } },
            macros: []
          },
          "mat"
        ),
        type: AssetType.Material
      })
    ).rejects.toBeDefined();
  });
});
