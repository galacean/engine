import { Shader, ShaderFactory, ShaderLanguage, ShaderMacroCollection, WebGLEngine } from "@galacean/engine";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { describe, expect, it } from "vitest";

const declarations = `uniform Camera {
  vec3 eye;
  float exposure;
  float planes[2];
  vec3 points[2];
  mat3 normal;
  mat4 views[2];
};`;

function shader(block: string, vertex = "vec4(eye, 1.0)", fragment = "vec4(exposure)") {
  return `Shader "blocks" { SubShader "s" { Pass "p" {
    ${block}
    void vert() { gl_Position = ${vertex}; }
    void frag() { gl_FragColor = ${fragment}; }
    VertexShader = vert;
    FragmentShader = frag;
  } } }`;
}

describe("explicit uniform blocks", () => {
  it("keeps the complete std140 layout identical across live and offline compilation and both stages", () => {
    const source = shader(`#ifndef CAMERA_INCLUDED\n#define CAMERA_INCLUDED\n${declarations}\n#endif`);
    const compiler = new ShaderCompiler();
    const parsed = compiler._parseShaderSource(source).subShaders[0].passes[0];
    const live = compiler._parseShaderPass(
      parsed.contents,
      parsed.vertexEntry,
      parsed.fragmentEntry,
      ShaderLanguage.GLSLES300
    )!;
    const offline = JSON.parse(JSON.stringify(new ShaderPrecompiler().precompile(source))).subShaders[0].passes[0];
    expect(offline.uniformBlocks).toEqual(live.uniformBlocks);
    const [block] = live.uniformBlocks!;
    expect(block.name).toBe("Camera");
    expect(block.byteLength).toBe(256);
    expect(block.members.map((m) => [m.name, m.offset, m.arrayLength, m.arrayStride, m.matrixStride])).toEqual([
      ["eye", 0, 0, 0, 0],
      ["exposure", 12, 0, 0, 0],
      ["planes", 16, 2, 16, 0],
      ["points", 48, 2, 16, 0],
      ["normal", 80, 0, 0, 16],
      ["views", 128, 2, 64, 16]
    ]);
    for (const instructions of [offline.vertexShaderInstructions, offline.fragmentShaderInstructions]) {
      const glsl = ShaderMacroProcessor.evaluate(instructions, new Map());
      expect(glsl).toContain(`layout(std140) uniform ${block.bindingName} {`);
      expect(glsl).toContain("highp mat4 views[2];");
      expect(glsl).not.toMatch(/uniform\s+(?:highp\s+)?(?:float|vec3)\s+(?:eye|exposure)/);
    }
  });

  it("omits unreferenced blocks and keeps legacy passes free of reflection payload", () => {
    const precompiler = new ShaderPrecompiler();
    for (const block of ["", declarations]) {
      const pass = precompiler.precompile(shader(block, "vec4(0.)", "vec4(1.)")).subShaders[0].passes[0];
      expect(JSON.parse(JSON.stringify(pass))).not.toHaveProperty("uniformBlocks");
    }
  });

  it("links existing loose uniforms alongside the public Transform and Fog includes", async () => {
    const source = shader(
      `#define SCENE_FOG_MODE 1
       #include "ShaderLibrary/Common/Transform.glsl"
       #include "ShaderLibrary/Common/Fog.glsl"
       vec3 camera_Up;
       vec4 scene_SunlightColor;
       float gs_Camera;
       float Scene;
       struct Camera { vec3 eye; };
       vec3 readEye() {
         Camera local;
         local.eye = camera_Up * gs_Camera;
         return local.eye;
       }`,
      "camera_VPMat * vec4(readEye(), 1.0)",
      "fog(scene_SunlightColor * Scene, camera_Up)"
    );
    const precompiler = new ShaderPrecompiler();
    precompiler.setIncludeMap(ShaderFactory.includeMap);
    const compiled = precompiler.precompile(source);
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const asset = Shader._createFromPrecompiled(compiled);
    try {
      const program = asset.subShaders[0].passes[0]._getShaderProgram(engine, new ShaderMacroCollection());
      program.bind();
      const gl = engine._hardwareRenderer.gl;
      const native: WebGLProgram = gl.getParameter(gl.CURRENT_PROGRAM);
      expect(gl.getProgramParameter(native, gl.LINK_STATUS)).toBe(true);
      const autoLayout = asset.subShaders[0].passes[0]
        ["_compileShaderSource"](engine, new ShaderMacroCollection(), false)
        .uniformBlocks!.filter((entry) => entry.name === "Auto");
      for (const name of ["camera_Up", "scene_SunlightColor", "gs_Camera", "Scene"]) {
        const owner = autoLayout.find((block) => block.members.some((field) => field.name === name));
        expect(owner, name).toBeDefined();
        const [index] = gl.getUniformIndices(native, [name])!;
        expect(index, name).not.toBe(gl.INVALID_INDEX);
        const [block] = gl.getActiveUniforms(native, [index], gl.UNIFORM_BLOCK_INDEX);
        expect(block, name).toBe(gl.getUniformBlockIndex(native, owner!.bindingName!));
      }
      const blocks = compiled.subShaders[0].passes[0].uniformBlocks!;
      expect(blocks.map((block) => block.name).sort()).toEqual(["Camera", "Scene"]);
      for (const block of blocks) {
        const bindingName = block.bindingName ?? block.name;
        expect(bindingName).not.toBe(block.name);
        expect(bindingName).not.toBe("gs_Camera");
        const index = gl.getUniformBlockIndex(native, bindingName);
        expect(index).not.toBe(gl.INVALID_INDEX);
        expect(gl.getActiveUniformBlockParameter(native, index, gl.UNIFORM_BLOCK_BINDING)).toBe(
          block.name === "Scene" ? 1 : 2
        );
      }
    } finally {
      asset.destroy(true);
      engine.destroy();
    }
  });

  it.each(["source", "runtime"])("preserves a %s Camera macro around the Transform include", (origin) => {
    const prefix = origin === "source" ? "#define Camera 3\n" : "";
    const source = shader(
      prefix + '#include "ShaderLibrary/Common/Transform.glsl"',
      "camera_VPMat * vec4(1.0)",
      "vec4(1.0)"
    );
    const precompiler = new ShaderPrecompiler();
    precompiler.setIncludeMap(ShaderFactory.includeMap);
    const pass = precompiler.precompile(source).subShaders[0].passes[0];
    const [camera] = pass.uniformBlocks!;
    expect(camera.name).toBe("Camera");
    expect(camera.bindingName).toBeTruthy();
    expect(camera.bindingName).not.toBe("Camera");
    const macros = origin === "runtime" ? new Map([["Camera", "3"]]) : new Map<string, string>();
    const glsl = ShaderMacroProcessor.evaluate(pass.vertexShaderInstructions!, macros);
    expect(glsl).toContain(`layout(std140) uniform ${camera.bindingName} {`);
    expect(glsl).toContain("highp mat4 camera_VPMat;");
  });

  it("preserves block offsets when a pass overrides one inherited member with a loose uniform", () => {
    const source = shader("float eye;", "vec4(eye + exposure)", "vec4(exposure)").replace(
      "SubShader",
      declarations + "\nSubShader"
    );
    const pass = new ShaderPrecompiler().precompile(source).subShaders[0].passes[0];
    expect(pass.uniformBlocks![0].members[1].offset).toBe(12);
    for (const instructions of [pass.vertexShaderInstructions!, pass.fragmentShaderInstructions!]) {
      const glsl = ShaderMacroProcessor.evaluate(instructions, new Map());
      expect(glsl).toContain("highp vec3 gs_Camera_eye;");
      expect(glsl).not.toContain("highp vec3 eye;");
    }
  });

  it("forwards a complete overriding block before an inherited helper that reads it", () => {
    const source = shader(declarations, "vec4(readEye(), exposure)", "vec4(exposure)").replace(
      "SubShader",
      "vec3 eye; vec3 readEye() { return eye; }\nSubShader"
    );
    const pass = new ShaderPrecompiler().precompile(source).subShaders[0].passes[0];
    const glsl = ShaderMacroProcessor.evaluate(pass.vertexShaderInstructions!, new Map());
    const declaration = `layout(std140) uniform ${pass.uniformBlocks![0].bindingName} {`;
    expect(glsl.split(declaration)).toHaveLength(2);
    expect(glsl.indexOf(declaration)).toBeLessThan(glsl.indexOf("vec3 readEye"));
    expect(glsl).not.toContain("uniform vec3 eye");
  });

  it.each([
    ["uniform Camera { sampler2D bad; };", /Unsupported uniform block member type/],
    ["uniform Camera { vec3 bad[]; };", /positive literal/],
    ["uniform Camera { float bad = 2.; };", /unqualified type/],
    ["uniform Unknown { float bad; };", /named Scene or Camera/]
  ])("rejects invalid layout %s before driver compilation", (block, error) => {
    expect(() => new ShaderPrecompiler().precompile(shader(block, "vec4(0.)", "vec4(1.)"))).toThrow(error);
  });
});
