import { AssetType, Material, Shader, Texture2D, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

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

it.each([
  { label: "null shaderData entry", shaderData: { broken: null }, macros: [] },
  { label: "malformed vector", shaderData: { broken: { type: "Vector3", value: null } }, macros: [] },
  { label: "null macros", shaderData: {}, macros: null },
  {
    label: "unmapped texture reference",
    shaderData: { broken: { type: "Texture", value: { url: "WorldMaterialCompatibility/missing-texture" } } },
    macros: []
  },
  { label: "empty texture URL", shaderData: { broken: { type: "Texture", value: { url: "" } } }, macros: [] },
  {
    label: "malformed texture reference",
    shaderData: { broken: { type: "Texture", value: "texture.png" } },
    macros: []
  }
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

it("MaterialLoader preserves explicit empty texture slots without resolving dependencies", async () => {
  const resolve = vi.spyOn(engine.resourceManager, "getResourceByRef");
  let material: Material | undefined;
  try {
    material = await engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: resource(
        {
          name: "empty-world-material",
          shader: shaderName,
          shaderData: {
            material_BaseTexture: { type: "Texture", value: null },
            material_NormalTexture: { type: "Texture", value: null },
            material_Exposure: { type: "Float", value: 1.3 }
          },
          macros: [{ name: "MATERIAL_SUN_HIGH_QUALITY" }]
        },
        "mat"
      )
    });
    expect(material.shaderData.getTexture("material_BaseTexture")).toBeNull();
    expect(material.shaderData.getTexture("material_NormalTexture")).toBeNull();
    expect(material.shaderData.getFloat("material_Exposure")).toBe(1.3);
    expect(material.shaderData.getMacros().map((macro) => macro.name)).toContain("MATERIAL_SUN_HIGH_QUALITY");
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    resolve.mockRestore();
    material?.destroy();
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
          material_BaseTexture: { type: "Texture", value: { url: texturePath } },
          material_NormalTexture: { type: "Texture", value: null }
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
    expect(material.shaderData.getTexture("material_NormalTexture")).toBeNull();
    expect(material.shaderData.getInt("sunMode")).toBeUndefined();
  } finally {
    material.destroy();
    texture?.destroy();
  }
});

it("MaterialLoader rejects a non-Texture resource without retaining materials on retry", async () => {
  const texturePath = `WorldMaterialCompatibility/not-a-texture-${Math.random()}`;
  engine.resourceManager.registerVirtualResources([
    { virtualPath: texturePath, path: resource({ value: 1 }, "json"), type: AssetType.JSON }
  ]);
  const url = resource(
    {
      name: "invalid-texture-material",
      shader: shaderName,
      shaderData: {
        material_BaseTexture: { type: "Texture", value: { url: texturePath } },
        material_NormalTexture: { type: "Texture", value: null }
      },
      macros: []
    },
    "mat"
  );
  const initialMaterials = engine.resourceManager.findResourcesByType(Material);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(engine.resourceManager.load({ url, type: AssetType.Material })).rejects.toThrow(
        `texture reference "${texturePath}" did not resolve to a Texture.`
      );
      expect(engine.resourceManager.findResourcesByType(Material).map((material) => material.instanceId)).toEqual(
        initialMaterials.map((material) => material.instanceId)
      );
      expect(engine.resourceManager.getFromCache(url)).toBeNull();
    }
  } finally {
    for (const material of engine.resourceManager.findResourcesByType(Material)) {
      if (!initialMaterials.includes(material)) material.destroy();
    }
  }
});
