import { AssetType, Material, Shader, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;
let materialShaderName: string;

function createBlobURL(data: unknown, extension: string): string {
  return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })) + `#.${extension}`;
}

function registerShaderResource(shaderName: string): string {
  const shaderPath = `MaterialLoaderTest/${shaderName}`;
  engine.resourceManager.registerVirtualResources([
    {
      virtualPath: shaderPath,
      path: createBlobURL({ name: shaderName, platformTarget: 0, subShaders: [] }, "shader"),
      type: AssetType.Shader
    }
  ]);
  return shaderPath;
}

function loadMaterial(data: unknown) {
  return engine.resourceManager.load<Material>({ url: createBlobURL(data, "mat"), type: AssetType.Material });
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
  it("loads a material with a registered shader", async () => {
    const material = await loadMaterial({
      name: "registered-shader",
      shader: materialShaderName,
      shaderData: { value: { type: "Float", value: 1 } },
      macros: []
    });

    expect(material.shader).toBe(Shader.find(materialShaderName));
    expect(material.shaderData.getFloat("value")).toBe(1);
  });

  it("loads a material from a valid shader reference", async () => {
    const shaderName = `MaterialLoaderRef-${Math.random()}`;
    const shaderPath = registerShaderResource(shaderName);
    const material = await loadMaterial({
      name: "shader-ref",
      shader: shaderName,
      shaderRef: { url: shaderPath },
      shaderData: {},
      macros: []
    });

    expect(material.shader).toBe(Shader.find(shaderName));
  });

  it("rejects a material without a resolvable shader", async () => {
    await expect(
      loadMaterial({ name: "missing-shader", shader: "missing", shaderData: {}, macros: [] })
    ).rejects.toBeDefined();
  });

  it("rejects a shader reference that resolves to another resource type", async () => {
    const textPath = "MaterialLoaderTest/not-a-shader";
    engine.resourceManager.registerVirtualResources([
      { virtualPath: textPath, path: createBlobURL("not a shader", "txt"), type: AssetType.Text }
    ]);

    await expect(
      loadMaterial({
        name: "wrong-shader-ref",
        shader: "missing",
        shaderRef: { url: textPath },
        shaderData: {},
        macros: []
      })
    ).rejects.toBeDefined();
  });

  it("rejects a texture reference that resolves to another resource type", async () => {
    const textPath = "MaterialLoaderTest/not-a-texture";
    const textureProperty = `MaterialLoaderTexture-${Math.random()}`;
    engine.resourceManager.registerVirtualResources([
      { virtualPath: textPath, path: createBlobURL("not a texture", "txt"), type: AssetType.Text }
    ]);

    const materialCount = engine.resourceManager.findResourcesByType(Material).length;
    await expect(
      loadMaterial({
        name: "wrong-texture-ref",
        shader: materialShaderName,
        shaderData: { [textureProperty]: { type: "Texture", value: { url: textPath } } },
        macros: []
      })
    ).rejects.toBeDefined();
    expect(engine.resourceManager.findResourcesByType(Material)).toHaveLength(materialCount);
  });

  it.each(["Matrix", "TextureArray"])("rejects unsupported %s shader data", async (type) => {
    const materialCount = engine.resourceManager.findResourcesByType(Material).length;
    await expect(
      loadMaterial({
        name: "unsupported-shader-data",
        shader: materialShaderName,
        shaderData: { supported: { type: "Float", value: 1 }, value: { type, value: [] } },
        macros: []
      })
    ).rejects.toBeDefined();
    expect(engine.resourceManager.findResourcesByType(Material)).toHaveLength(materialCount);
  });

  it("rejects unsupported shader data before loading a shaderRef", async () => {
    const shaderName = `MaterialLoaderUnsupportedRef-${Math.random()}`;
    const shaderPath = registerShaderResource(shaderName);
    expect(Shader.find(shaderName)).toBeUndefined();
    expect(engine.resourceManager.getFromCache(shaderPath)).toBeNull();

    await expect(
      loadMaterial({
        name: "unsupported-shader-ref",
        shader: shaderName,
        shaderRef: { url: shaderPath },
        shaderData: { value: { type: "Matrix", value: [] } },
        macros: []
      })
    ).rejects.toBeDefined();

    expect(Shader.find(shaderName)).toBeUndefined();
    expect(engine.resourceManager.getFromCache(shaderPath)).toBeNull();
  });
});
