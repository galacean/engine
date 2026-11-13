import {
  AssetType,
  BlinnPhongMaterial,
  Camera,
  Engine,
  GLTFResource,
  Material,
  MeshRenderer,
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

  it.each(["BuiltinIdentityCleanup", "__proto__"])(
    "rejects a destroyed shared shader named %s while preserving a live namesake",
    async (name) => {
      const shaders = Engine._builtinShaders;
      const builtin = Shader._createFromPrecompiled({ name, platformTarget: 0, subShaders: [] });
      const custom = Shader._createFromPrecompiled({ name, platformTarget: 0, subShaders: [] });
      let anotherEngine: WebGLEngine | undefined;
      try {
        Engine._builtinShaders = { ...shaders, pbr: builtin };
        anotherEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
        builtin.destroy();
        expect(() => new PBRMaterial(anotherEngine!)).toThrow("destroyed shader");
        expect(Shader.find(name)).toBe(custom);
      } finally {
        Engine._builtinShaders = shaders;
        anotherEngine?.destroy();
        builtin.destroy();
        custom.destroy();
      }
    }
  );

  it("uses shared material and render-pass shader references independently of their names", async () => {
    const shaders = Engine._builtinShaders;
    const shader = createNamesake("Injected/UnrelatedName");
    const namesake = createNamesake(shader.name);
    let anotherEngine: WebGLEngine | undefined;
    try {
      Engine._builtinShaders = {
        ...shaders,
        pbr: shader,
        particle: shader,
        backgroundTexture: shader,
        uber: shader,
        bloom: shader,
        finalSRGB: shader,
        finalAntiAliasing: shader,
        scalableAmbientOcclusion: shader,
        ui: shader,
        spine: shader
      };
      anotherEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const material = new PBRMaterial(anotherEngine);
      const particleMaterial = new ParticleMaterial(anotherEngine);
      const spineMaterial = new SpineMaterial(anotherEngine);
      expect(material.shader).toBe(shader);
      expect(particleMaterial.shader).toBe(shader);
      expect(spineMaterial.shader).toBe(shader);
      expect(anotherEngine._getUIDefaultMaterial().shader).toBe(shader);
      expect(anotherEngine.sceneManager.activeScene!.background._material.shader).toBe(shader);
      expect(anotherEngine._basicResources.particleMagentaMaterial.shader).toBe(shader);
      const camera = anotherEngine.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
      const pipeline = camera._renderPipeline;
      expect(pipeline["_saoPass"]["_material"].shader).toBe(shader);
      expect(pipeline["_finalPass"]["_sRGBmaterial"].shader).toBe(shader);
      expect(pipeline["_finalPass"]["_antiAliasingMaterial"].shader).toBe(shader);
      const uberPass = anotherEngine.postProcessPasses[0];
      expect(uberPass["_uberMaterial"].shader).toBe(shader);
      expect(uberPass["_bloomMaterial"].shader).toBe(shader);
      expect(Shader.find(shader.name)).toBe(namesake);
      const sharedMaterial = new PBRMaterial(engine);
      expect(sharedMaterial.shader).toBe(shader);
      sharedMaterial.destroy();
      material.destroy();
      particleMaterial.destroy();
      spineMaterial.destroy();
    } finally {
      Engine._builtinShaders = shaders;
      anotherEngine?.destroy();
      namesake.destroy(true);
      shader.destroy(true);
    }
  });

  it("preserves in-use shader protection and rejects a force-destroyed shared shader", async () => {
    const shaders = Engine._builtinShaders;
    const shader = createNamesake("Injected/InUse");
    let anotherEngine: WebGLEngine | undefined;
    try {
      Engine._builtinShaders = { ...shaders, pbr: shader };
      anotherEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const material = new PBRMaterial(anotherEngine);
      const entity = anotherEngine.sceneManager.activeScene!.createRootEntity();
      entity.addComponent(MeshRenderer).setMaterial(material);
      expect(shader.destroy()).toBe(false);
      expect(material.shader).toBe(shader);
      expect(shader.destroy(true)).toBe(true);
      expect(() => new PBRMaterial(anotherEngine!)).toThrow("destroyed shader");
      expect(Shader.find(shader.name)).toBeUndefined();
    } finally {
      Engine._builtinShaders = shaders;
      anotherEngine?.destroy();
      shader.destroy(true);
    }
  });
});
