import { AssetType, Material, Shader, ShaderFactory, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;
let materialShaderName: string;

function createBlobURL(data: unknown, extension: string): string {
  return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })) + `#.${extension}`;
}

function registerShaderResource(shaderName: string, shaderPath = `MaterialLoaderTest/${shaderName}`): string {
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
  it("preserves relative source includes for independent shaders with the same name", async () => {
    const name = `ShaderLoaderSource-${Math.random()}`;
    const includeKey = `${name}/Common.glsl`;
    ShaderFactory.registerInclude(includeKey, "vec4 includedColor() { return vec4(0.25); }");
    const sourceEngine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    const source = `Shader "${name}" { SubShader "s" { Pass "p" {
#include "./Common.glsl"
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = includedColor(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const urls = [0, 1].map(() => URL.createObjectURL(new Blob([source], { type: "text/plain" })));
    const paths = [`${name}/Main.shader`, `${name}/Duplicate.shader`];
    try {
      sourceEngine.resourceManager.registerVirtualResources(
        paths.map((virtualPath, index) => ({ virtualPath, path: urls[index], type: AssetType.Shader }))
      );
      const shader = await sourceEngine.resourceManager.load<Shader>(paths[0]);
      expect(shader).toBeInstanceOf(Shader);
      expect(shader.compileVariant(sourceEngine, [])).toBe(true);
      const namesake = await sourceEngine.resourceManager.load<Shader>(paths[1]);
      expect(namesake).not.toBe(shader);
      expect(namesake.compileVariant(sourceEngine, [])).toBe(true);
      expect(sourceEngine.resourceManager.getFromCache(paths[0])).toBe(shader);
      expect(sourceEngine.resourceManager.getFromCache(paths[1])).toBe(namesake);
      shader.destroy(true);
      namesake.destroy(true);
    } finally {
      sourceEngine.destroy();
      ShaderFactory.unregisterInclude(includeKey);
      urls.forEach((url) => URL.revokeObjectURL(url));
    }
  });

  it("caches precompiled shaders by resource URL even when their names match", async () => {
    const name = `ShaderLoaderDuplicate-${Math.random()}`;
    const source = { name, platformTarget: 0, subShaders: [] };

    const urls = [createBlobURL(source, "shader"), createBlobURL(source, "shader")];
    const shaders = await Promise.all(
      urls.map((url) => engine.resourceManager.load<Shader>({ url, type: AssetType.Shader }))
    );
    expect(shaders[0]).toBeInstanceOf(Shader);
    expect(shaders[1]).toBeInstanceOf(Shader);
    expect(shaders[0]).not.toBe(shaders[1]);
    expect(engine.resourceManager.getFromCache(urls[0])).toBe(shaders[0]);
    expect(engine.resourceManager.getFromCache(urls[1])).toBe(shaders[1]);
    shaders.forEach((shader) => shader.destroy());
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

  it("deserializes each scalar, vector and color representation", async () => {
    const material = await loadMaterial({
      name: "typed-properties",
      shader: materialShaderName,
      shaderData: {
        float: { type: "Float", value: 0.25 },
        integer: { type: "Integer", value: 7 },
        enabled: { type: "Boolean", value: true },
        disabled: { type: "Boolean", value: false },
        vector2: { type: "Vector2", value: { x: 1, y: 2 } },
        vector3: { type: "Vector3", value: { x: 3, y: 4, z: 5 } },
        vector4: { type: "Vector4", value: { x: 6, y: 7, z: 8, w: 9 } },
        color: { type: "Color", value: { r: 0.1, g: 0.2, b: 0.3, a: 0.4 } }
      },
      macros: []
    });

    expect(material.shaderData.getFloat("float")).toBe(0.25);
    expect(material.shaderData.getInt("integer")).toBe(7);
    expect(material.shaderData.getInt("enabled")).toBe(1);
    expect(material.shaderData.getInt("disabled")).toBe(0);
    expect(material.shaderData.getVector2("vector2")).toMatchObject({ x: 1, y: 2 });
    expect(material.shaderData.getVector3("vector3")).toMatchObject({ x: 3, y: 4, z: 5 });
    expect(material.shaderData.getVector4("vector4")).toMatchObject({ x: 6, y: 7, z: 8, w: 9 });
    expect(material.shaderData.getColor("color")).toMatchObject({ r: 0.1, g: 0.2, b: 0.3, a: 0.4 });
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

  it("binds each material to its explicit shader resource when names collide", async () => {
    const name = `MaterialLoaderNamesakes-${Math.random()}`;
    const registered = Shader._createFromPrecompiled({ name, platformTarget: 0, subShaders: [] });
    const paths = [registerShaderResource(name, `${name}/first`), registerShaderResource(name, `${name}/second`)];
    const materials = await Promise.all(
      paths.map((url) =>
        loadMaterial({
          name: url,
          shader: name,
          shaderRef: { url },
          shaderData: {},
          macros: []
        })
      )
    );

    expect(materials[0].shader).not.toBe(registered);
    expect(materials[1].shader).not.toBe(registered);
    expect(materials[0].shader).not.toBe(materials[1].shader);
    for (let i = 0; i < paths.length; i++) {
      expect(materials[i].shader).toBe(engine.resourceManager.getFromCache(paths[i]));
    }
    expect(
      (
        await loadMaterial({
          name: "first-again",
          shader: name,
          shaderRef: { url: paths[0] },
          shaderData: {},
          macros: []
        })
      ).shader
    ).toBe(materials[0].shader);
  });

  it("loads a material by shader reference without a shader name", async () => {
    const path = registerShaderResource(`MaterialLoaderReferenceOnly-${Math.random()}`);
    const material = await loadMaterial({
      name: "reference-only",
      shaderRef: { url: path },
      shaderData: {},
      macros: []
    });
    expect(material.shader).toBe(engine.resourceManager.getFromCache(path));
  });

  it("rejects a missing explicit shader reference even when the shader name exists", async () => {
    await expect(
      loadMaterial({
        name: "missing-reference",
        shader: materialShaderName,
        shaderRef: { url: "MaterialLoaderTest/missing" },
        shaderData: {},
        macros: []
      })
    ).rejects.toThrow('shader reference "MaterialLoaderTest/missing" did not resolve to a Shader');
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
        shader: materialShaderName,
        shaderRef: { url: textPath },
        shaderData: {},
        macros: []
      })
    ).rejects.toThrow(`shader reference "${textPath}" did not resolve to a Shader`);
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
