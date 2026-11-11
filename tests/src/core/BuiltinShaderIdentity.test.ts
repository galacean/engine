import {
  AssetType,
  BlinnPhongMaterial,
  GLTFResource,
  Material,
  ParticleMaterial,
  PBRMaterial,
  Shader,
  SkyBoxMaterial,
  SkyProceduralMaterial,
  TrailMaterial,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import "@galacean/engine-ui";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpineMaterial } from "../../../packages/spine/src/renderer/SpineMaterial";

function createNamesake(name: string): Shader {
  return Shader.create(`Shader "${name}" {
    SubShader "Custom" {
      Pass "Custom" {
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(1.0); }
        VertexShader = vert;
        FragmentShader = frag;
      }
    }
  }`);
}

describe("Built-in shader identity", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
  });

  afterAll(() => engine.destroy());

  it.each([
    ["PBR", (engine: WebGLEngine) => new PBRMaterial(engine)],
    ["BlinnPhong", (engine: WebGLEngine) => new BlinnPhongMaterial(engine)],
    ["Unlit", (engine: WebGLEngine) => new UnlitMaterial(engine)],
    ["Sky/Skybox", (engine: WebGLEngine) => new SkyBoxMaterial(engine)],
    ["Sky/SkyProcedural", (engine: WebGLEngine) => new SkyProceduralMaterial(engine)],
    ["Effect/Trail", (engine: WebGLEngine) => new TrailMaterial(engine)],
    ["Effect/Particle", (engine: WebGLEngine) => new ParticleMaterial(engine)],
    ["2D/Spine", (engine: WebGLEngine) => new SpineMaterial(engine)]
  ] as const)("keeps %s material binding independent of later name registrations", (name, createMaterial) => {
    const builtin = Shader.find(name);
    const custom = createNamesake(name);
    const explicitMaterial = new Material(engine, custom);
    let material: Material | undefined;
    try {
      expect(Shader.find(name)).toBe(custom);
      expect(explicitMaterial.shader).toBe(custom);
      material = createMaterial(engine);
      expect(material.shader).toBe(builtin);
    } finally {
      material?.destroy();
      explicitMaterial.destroy();
      custom.destroy(true);
    }
    expect(Shader.find(name)).toBe(builtin);
  });

  it.each([
    ["Blit/Blit", "blitMaterial"],
    ["Blit/BlitScreen", "blitScreenMaterial"],
    ["2D/Sprite", "spriteDefaultMaterial"],
    ["2D/Text", "textDefaultMaterial"],
    ["2D/SpriteMask", "spriteMaskDefaultMaterial"],
    ["Unlit", "meshMagentaMaterial"],
    ["Effect/Particle", "particleMagentaMaterial"]
  ] as const)("keeps %s binding when an Engine is created after the custom shader", async (name, key) => {
    const builtin = Shader.find(name);
    const custom = createNamesake(name);
    let anotherEngine: WebGLEngine | undefined;
    try {
      anotherEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      expect(anotherEngine._basicResources[key].shader).toBe(builtin);
    } finally {
      anotherEngine?.destroy();
      custom.destroy(true);
    }
  });

  it("keeps the lazy UI default material bound to the built-in shader", () => {
    const builtin = Shader.find("2D/UIDefault");
    const custom = createNamesake("2D/UIDefault");
    try {
      expect(engine._getUIDefaultMaterial().shader).toBe(builtin);
    } finally {
      custom.destroy(true);
    }
  });

  it("loads glTF PBR materials with the built-in shader after a namesake is registered", async () => {
    const builtin = Shader.find("PBR");
    const custom = createNamesake("PBR");
    const url = URL.createObjectURL(
      new Blob([
        JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0, nodes: [], materials: [{}] })
      ])
    );
    let resource: GLTFResource | undefined;
    try {
      resource = await engine.resourceManager.load<GLTFResource>({ url, type: AssetType.GLTF });
      expect(resource.materials[0].shader).toBe(builtin);
    } finally {
      resource?.destroy();
      custom.destroy(true);
      URL.revokeObjectURL(url);
    }
  });

  it("removes only the destroyed built-in binding while preserving a live namesake", () => {
    const source = { name: "BuiltinIdentityCleanup", platformTarget: 0, subShaders: [] };
    const builtin = Shader._createFromPrecompiled(source, true);
    const custom = Shader._createFromPrecompiled(source);
    try {
      expect(Shader._findBuiltin(source.name)).toBe(builtin);
      builtin.destroy();
      expect(Shader._findBuiltin(source.name)).toBeUndefined();
      expect(Shader.find(source.name)).toBe(custom);
    } finally {
      builtin.destroy();
      custom.destroy();
    }
  });
});
