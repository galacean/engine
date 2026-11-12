import { AssetType, Material, Shader, ShaderFactory, Texture2D, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;
let shaderName: string;
const urls: string[] = [];

function resource(data: unknown, extension: string): string {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  urls.push(url);
  return `${url}#.${extension}`;
}

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  shaderName = `WorldMaterialCompatibility-${Math.random()}`;
  Shader._createFromPrecompiled({ name: shaderName, platformTarget: 0, subShaders: [] });
});

afterAll(() => {
  engine.destroy();
  urls.forEach((url) => URL.revokeObjectURL(url));
});

it.each(["Select", "Toggle", "Matrix", "TextureArray"])(
  "loads supported fields and ignores %s metadata as the old World loader does",
  async (type) => {
    const material = await engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: resource(
        {
          name: "legacy-world-material",
          shader: shaderName,
          shaderData: {
            material_Exposure: { type: "Float", value: 1.3 },
            sunMode: { type, value: 2 }
          },
          macros: [{ name: "MATERIAL_SUN_HIGH_QUALITY" }]
        },
        "mat"
      )
    });
    try {
      expect(material.shader).toBe(Shader.find(shaderName));
      expect(material.shaderData.getFloat("material_Exposure")).toBe(1.3);
      expect(material.shaderData.getInt("sunMode")).toBeUndefined();
      expect(material.shaderData.getMacros().map((macro) => macro.name)).toContain("MATERIAL_SUN_HIGH_QUALITY");
    } finally {
      material.destroy();
    }
  }
);

it("loads a referenced shader when the material includes ignored editor metadata", async () => {
  const name = `WorldReferencedMaterial-${Math.random()}`;
  const virtualPath = `WorldMaterialCompatibility/${name}`;
  engine.resourceManager.registerVirtualResources([
    {
      virtualPath,
      path: resource({ name, platformTarget: 0, subShaders: [] }, "shader"),
      type: AssetType.Shader
    }
  ]);
  const material = await engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: resource(
      {
        name: "referenced-world-material",
        shader: name,
        shaderRef: { url: virtualPath },
        shaderData: { sunMode: { type: "Select", value: 2 } },
        macros: []
      },
      "mat"
    )
  });
  try {
    expect(material.shader).toBe(Shader.find(name));
    expect(material.shaderData.getInt("sunMode")).toBeUndefined();
  } finally {
    material.destroy();
  }
});

it("keeps explicit shader resources authoritative when authored names collide", async () => {
  const name = `WorldNamesakeMaterial-${Math.random()}`;
  const registered = Shader._createFromPrecompiled({ name, platformTarget: 0, subShaders: [] });
  const paths = ["first", "second"].map((variant) => `WorldMaterialCompatibility/${name}/${variant}`);
  const precompiler = new ShaderPrecompiler();
  engine.resourceManager.registerVirtualResources(
    paths.map((virtualPath, index) => ({
      virtualPath,
      path: resource(
        precompiler.precompile(
          `Shader "${name}" { SubShader "Default" { Pass "Forward" {
            void vert() { gl_Position = vec4(0.0); }
            void frag() { gl_FragColor = vec4(${index}.0, 0.0, 0.0, 1.0); }
            VertexShader = vert; FragmentShader = frag;
          } } }`,
          0
        ),
        "shader"
      ),
      type: AssetType.Shader
    }))
  );
  const materials: Material[] = [];
  try {
    for (const path of [...paths, paths[0]]) {
      materials.push(
        await engine.resourceManager.load<Material>({
          type: AssetType.Material,
          url: resource(
            {
              name: path,
              shader: name,
              shaderRef: { url: path },
              shaderData: { sunMode: { type: "Select", value: 2 } },
              macros: [],
              contributeScreenSpaceReflection: true
            },
            "mat"
          )
        })
      );
    }
    expect(materials[0].shader).not.toBe(registered);
    expect(materials[1].shader).not.toBe(materials[0].shader);
    expect(materials[2].shader).toBe(materials[0].shader);
    for (let index = 0; index < paths.length; index++) {
      expect(materials[index].shader).toBe(engine.resourceManager.getFromCache(paths[index]));
      expect(materials[index].shader.name).toBe(name);
      expect(materials[index].shader.compileVariant(engine, [])).toBe(true);
      expect(materials[index].shaderData.getInt("sunMode")).toBeUndefined();
      expect(materials[index].contributeScreenSpaceReflection).toBe(true);
    }
  } finally {
    const shaders = new Set([registered, ...materials.map((material) => material.shader)]);
    materials.forEach((material) => material.destroy());
    shaders.forEach((shader) => shader.destroy(true));
  }
});

it("continues sharing identical precompiled World programs across resource URLs", async () => {
  const name = `WorldSharedShader-${Math.random()}`;
  const data = { name, platformTarget: 0, subShaders: [] };
  const firstURL = resource(data, "shader");
  const secondURL = resource(data, "shader");
  const first = await engine.resourceManager.load<Shader>({ url: firstURL, type: AssetType.Shader });
  const second = await engine.resourceManager.load<Shader>({ url: secondURL, type: AssetType.Shader });
  try {
    expect(second).toBe(first);
    expect(first.name).toBe(name);
    expect(engine.resourceManager.getFromCache(firstURL)).toBe(first);
    expect(engine.resourceManager.getFromCache(secondURL)).toBe(first);
  } finally {
    first.destroy(true);
  }
});

it("uses the registered fallback only for an unmapped World shader reference", async () => {
  const material = await engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: resource(
      {
        name: "unmapped-reference-fallback",
        shader: shaderName,
        shaderRef: { url: `WorldMaterialCompatibility/unmapped-${Math.random()}` },
        shaderData: { material_Exposure: { type: "Float", value: 1.5 } },
        macros: []
      },
      "mat"
    )
  });
  try {
    expect(material.shader).toBe(Shader.find(shaderName));
    expect(material.shaderData.getFloat("material_Exposure")).toBe(1.5);
  } finally {
    material.destroy();
  }
});

it.each([AssetType.JSON, AssetType.Shader])(
  "does not hide an invalid mapped %s shader reference with a fallback",
  async (type) => {
    const virtualPath = `WorldMaterialCompatibility/invalid-${type}-${Math.random()}`;
    engine.resourceManager.registerVirtualResources([{ virtualPath, path: resource({ invalid: true }, "json"), type }]);
    await expect(
      engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: resource(
          {
            name: "invalid-reference",
            shader: shaderName,
            shaderRef: { url: virtualPath },
            shaderData: {},
            macros: []
          },
          "mat"
        )
      })
    ).rejects.toBeDefined();
  }
);

it("shares source programs only when their canonical include namespaces match", async () => {
  const name = `WorldSourceShader-${Math.random()}`;
  const paths = [`${name}/left/Main.shader`, `${name}/left/Main.shader`, `${name}/right/Main.shader`];
  const includes = [`${name}/left/Common.glsl`, `${name}/right/Common.glsl`];
  includes.forEach((key, index) =>
    ShaderFactory.registerInclude(key, `vec4 includedColor() { return vec4(${index === 0 ? "0.25" : "0.75"}); }`)
  );
  const source = `Shader "${name}" { SubShader "Default" { Pass "Forward" {
    #include "./Common.glsl"
    void vert() { gl_Position = vec4(0.0); }
    void frag() { gl_FragColor = includedColor(); }
    VertexShader = vert; FragmentShader = frag;
  } } }`;
  const remoteURL = URL.createObjectURL(new Blob([source], { type: "text/plain" }));
  urls.push(remoteURL);
  const engines: WebGLEngine[] = [];
  const shaders = [Shader._createFromPrecompiled({ name, platformTarget: 0, subShaders: [] })];
  try {
    for (const virtualPath of paths) {
      const sourceEngine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        shaderCompiler: new ShaderCompiler()
      });
      engines.push(sourceEngine);
      sourceEngine.resourceManager.registerVirtualResources([{ virtualPath, path: remoteURL, type: AssetType.Shader }]);
      const shader = await sourceEngine.resourceManager.load<Shader>(virtualPath);
      shaders.push(shader);
      expect(shader.name).toBe(name);
      expect(shader.compileVariant(sourceEngine, [])).toBe(true);
    }
    expect(shaders[1]).not.toBe(shaders[0]);
    expect(shaders[2]).toBe(shaders[1]);
    expect(shaders[3]).not.toBe(shaders[1]);
  } finally {
    engines.forEach((sourceEngine) => sourceEngine.destroy());
    new Set(shaders).forEach((shader) => shader.destroy(true));
    includes.forEach((key) => ShaderFactory.unregisterInclude(key));
  }
});

it.each([
  { label: "null shaderData entry", shaderData: { broken: null }, macros: [] },
  { label: "malformed vector", shaderData: { broken: { type: "Vector3", value: null } }, macros: [] },
  { label: "null macros", shaderData: {}, macros: null },
  { label: "null texture reference", shaderData: { broken: { type: "Texture", value: null } }, macros: [] }
])("MaterialLoader rejects a $label without retaining materials on retry", async ({ shaderData, macros }) => {
  const url = resource({ name: "invalid-material", shader: shaderName, shaderData, macros }, "mat");
  const initialMaterials = engine.resourceManager.findResourcesByType(Material);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(engine.resourceManager.load({ url, type: AssetType.Material })).rejects.toBeDefined();
      expect(engine.resourceManager.findResourcesByType(Material).map((material) => material.instanceId)).toEqual(
        initialMaterials.map((material) => material.instanceId)
      );
      expect(engine.resourceManager.getFromCache(url)).toBeNull();
    }
  } finally {
    // Keep a failing regression test from contaminating later cases.
    for (const material of engine.resourceManager.findResourcesByType(Material)) {
      if (!initialMaterials.includes(material)) material.destroy();
    }
  }
});

it("MaterialLoader loads a texture alongside ignored editor metadata", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const texturePath = `WorldMaterialCompatibility/texture-${Math.random()}`;
  engine.resourceManager.registerVirtualResources([
    { virtualPath: texturePath, path: canvas.toDataURL("image/png"), type: AssetType.Texture }
  ]);
  const material = await engine.resourceManager.load<Material>({
    type: AssetType.Material,
    url: resource(
      {
        name: "textured-world-material",
        shader: shaderName,
        shaderData: {
          sunMode: { type: "Select", value: 2 },
          material_BaseTexture: { type: "Texture", value: { url: texturePath } }
        },
        macros: []
      },
      "mat"
    )
  });
  const texture = material.shaderData.getTexture("material_BaseTexture");
  try {
    expect(texture).toBeInstanceOf(Texture2D);
    expect(texture.width).toBe(1);
    expect(texture.height).toBe(1);
    expect(material.shaderData.getInt("sunMode")).toBeUndefined();
  } finally {
    material.destroy();
    texture?.destroy();
  }
});
