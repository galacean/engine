import {
  Camera,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderLanguage,
  ShaderPass,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function source(name: string, color: string): string {
  return `Shader "${name}" {
    SubShader "Default" {
      Pass "Forward" {
        mat4 renderer_MVPMat;
        struct Attributes { vec4 POSITION; };
        void vert(Attributes v) { gl_Position = renderer_MVPMat * v.POSITION; }
        void frag() { gl_FragColor = vec4(${color}, 1.0); }
        VertexShader = vert;
        FragmentShader = frag;
      }
    }
  }`;
}

describe("Shader object identity", () => {
  let engine: WebGLEngine;
  let shaders: Shader[];

  beforeEach(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    shaders = [];
  });

  afterEach(() => {
    engine.destroy();
    for (const shader of shaders) shader.destroy(true);
  });

  it("keeps manual, source and precompiled namesakes independent", () => {
    const name = "ShaderIdentity/Creation";
    const manual = Shader.create(name, [new ShaderPass("Forward", [], [], ShaderLanguage.GLSLES100)]);
    const live = Shader.create(source(name, "1.0, 0.0, 0.0"));
    const precompiled = Shader._createFromPrecompiled(
      new ShaderPrecompiler().precompile(source(name, "0.0, 0.0, 1.0"), ShaderLanguage.GLSLES100)
    );
    shaders.push(manual, live, precompiled);

    expect(new Set(shaders).size).toBe(3);
    expect(Shader.find(name)).toBe(precompiled);
    live.destroy();
    expect(Shader.find(name)).toBe(precompiled);
    expect(precompiled.compileVariant(engine, [])).toBe(true);
    precompiled.destroy();
    expect(Shader.find(name)).toBe(manual);
    precompiled.destroy();
    expect(Shader.find(name)).toBe(manual);
    manual.destroy();
    expect(Shader.find(name)).toBeUndefined();
  });

  it("resolves UsePass through the same lookup policy", () => {
    const name = "ShaderIdentity/UsePassSource";
    const first = Shader.create(source(name, "1.0, 0.0, 0.0"));
    const second = Shader.create(source(name, "0.0, 0.0, 1.0"));
    const usePass = Shader.create(`Shader "ShaderIdentity/UsePass" {
      SubShader "Default" { UsePass "${name}/Default/Forward" }
    }`);
    shaders.push(first, second, usePass);

    expect(usePass.subShaders[0].passes[0]).toBe(second.subShaders[0].passes[0]);
    expect(usePass.compileVariant(engine, [])).toBe(true);
    usePass.destroy();
    expect(second.compileVariant(engine, [])).toBe(true);
    expect(Shader.find(name)).toBe(second);
  });

  it("renders distinct materials and clears every namesake's per-engine programs", async () => {
    const name = "ShaderIdentity/Render";
    const red = Shader.create(source(name, "1.0, 0.0, 0.0"));
    const blue = Shader._createFromPrecompiled(
      new ShaderPrecompiler().precompile(source(name, "0.0, 0.0, 1.0"), ShaderLanguage.GLSLES100)
    );
    shaders.push(red, blue);
    const secondEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const scene = engine.sceneManager.activeScene!;
      const camera = scene.createRootEntity("Camera").addComponent(Camera);
      camera.entity.transform.setPosition(0, 0, 5);
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      const texture = new Texture2D(engine, 64, 32, undefined, false);
      camera.renderTarget = new RenderTarget(engine, 64, 32, texture);
      const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      const redRenderer = scene.createRootEntity("Red").addComponent(MeshRenderer);
      redRenderer.entity.transform.setPosition(-1, 0, 0);
      redRenderer.mesh = mesh;
      const redMaterial = new Material(engine, red);
      redRenderer.setMaterial(redMaterial);
      const blueRenderer = scene.createRootEntity("Blue").addComponent(MeshRenderer);
      blueRenderer.entity.transform.setPosition(1, 0, 0);
      blueRenderer.mesh = mesh;
      blueRenderer.setMaterial(new Material(engine, blue));

      camera.render();
      const pixels = new Uint8Array(64 * 32 * 4);
      texture.getPixelBuffer(pixels);
      expect(Array.from(pixels.slice((16 * 64 + 16) * 4, (16 * 64 + 16) * 4 + 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(pixels.slice((16 * 64 + 48) * 4, (16 * 64 + 48) * 4 + 4))).toEqual([0, 0, 255, 255]);
      expect(red.destroy()).toBe(false);
      expect(redMaterial.clone().shader).toBe(red);

      for (const shader of shaders) {
        expect(shader.compileVariant(secondEngine, [])).toBe(true);
        expect(shader.subShaders[0].passes[0]._shaderProgramMaps).toHaveLength(2);
      }
      engine.destroy();
      for (const shader of shaders) {
        const maps = shader.subShaders[0].passes[0]._shaderProgramMaps;
        expect(maps).toHaveLength(1);
        expect(maps[0].engine).toBe(secondEngine);
        expect(shader.compileVariant(secondEngine, [])).toBe(true);
      }
    } finally {
      secondEngine.destroy();
    }
  });
});
