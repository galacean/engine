import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it } from "vitest";

function shader(definitions: string, vertex: string, fragment = "gl_FragColor = vec4(1.0);"): string {
  return `Shader "macro-body-effects" { SubShader "s" { Pass "p" {
${definitions}
void vert() { ${vertex} }
void frag() { ${fragment} }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

const writes = [
  { name: "object body", definitions: "#define SET_POSITION gl_Position = vec4(0.0)", vertex: "SET_POSITION;" },
  { name: "function body", definitions: "#define SET_POSITION(v) gl_Position = v", vertex: "SET_POSITION(vec4(0.0));" },
  {
    name: "formal target",
    definitions: "#define SET(target, value) target = value",
    vertex: "SET(gl_Position, vec4(0.0));"
  },
  { name: "object alias", definitions: "#define POSITION gl_Position", vertex: "POSITION = vec4(0.0);" },
  { name: "function alias", definitions: "#define ID(x) x", vertex: "ID(gl_Position) = vec4(0.0);" },
  {
    name: "nested alias",
    definitions: "#define POSITION gl_Position\n#define SET_POSITION(v) POSITION = v",
    vertex: "SET_POSITION(vec4(0.0));"
  },
  {
    name: "parenthesized target",
    definitions: "#define SET_POSITION(v) ((gl_Position)) = v",
    vertex: "SET_POSITION(vec4(0.0));"
  },
  {
    name: "component target",
    definitions: "#define SET_POSITION gl_Position.xyzw = vec4(0.0)",
    vertex: "SET_POSITION;"
  },
  {
    name: "fragment output body",
    definitions: "#define SET_POSITION gl_Position = vec4(0.0)\n#define SET_COLOR gl_FragColor = vec4(1.0)",
    vertex: "SET_POSITION;",
    fragment: "SET_COLOR;"
  },
  {
    name: "indexed fragment output",
    definitions: "#define SET_POSITION gl_Position = vec4(0.0)\n#define SET_COLOR gl_FragData[0] = vec4(1.0)",
    vertex: "SET_POSITION;",
    fragment: "SET_COLOR;"
  },
  {
    name: "indexed fragment alias",
    definitions: "#define SET_POSITION gl_Position = vec4(0.0)\n#define COLOR gl_FragData[0]",
    vertex: "SET_POSITION;",
    fragment: "COLOR = vec4(1.0);"
  }
];

function programs(source: string, requireValid = true) {
  const analyzer = ShaderAnalyzer.analyze(source);
  if (requireValid) expect(analyzer.diagnostics).toEqual([]);
  const compiler = new ShaderCompiler();
  const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
  return [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300].flatMap((target) => {
    const paths = [
      ["analyzer", compiler.generate(analyzer.passes[0], target)],
      ["live", compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, target)],
      ["offline", new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]]
    ] as const;
    return paths.map(([path, program]) => {
      expect(program, path).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected generated pass");
      return { path, target, program };
    });
  });
}

describe("macro body assignment and reference effects", () => {
  it.each(writes)("preserves $name through all three compilation entries", ({ definitions, vertex, fragment }) => {
    for (const { path, program } of programs(shader(definitions, vertex, fragment))) {
      const expanded = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
      expect(expanded, path).toMatch(/gl_Position\s*(?:\.xyzw)?\s*(?:\)\s*)*=\s*vec4\s*\(/);
    }
  });

  it.each([false, true])("keeps source branch write coverage, exhaustive: %s", (exhaustive) => {
    const definitions = `#ifdef WRITE\n#define SET_POSITION gl_Position = vec4(0.0)\n#else\n#define SET_POSITION ${exhaustive ? "gl_Position = vec4(1.0)" : "vec4(1.0)"}\n#endif`;
    const source = shader(definitions, "SET_POSITION;");
    const diagnostics = ShaderAnalyzer.analyze(source).diagnostics;
    expect(diagnostics.some((diagnostic) => diagnostic.code === DiagnosticType.MissingVertexPosition)).toBe(
      !exhaustive
    );
    if (exhaustive) {
      for (const { program } of programs(source)) {
        for (const macros of [new Map<string, string>(), new Map([["WRITE", "1"]])]) {
          expect(ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, macros)).toContain("gl_Position");
        }
      }
    }
  });

  it.each([
    { definitions: "#define READ_POSITION gl_Position", vertex: "vec4 value = READ_POSITION;" },
    { definitions: "#define DROP(x) 1.0", vertex: "DROP(gl_Position = vec4(0.0));" },
    { definitions: "#define SET_POSITION gl_PointSize = 1.0", vertex: "SET_POSITION;" }
  ])("does not invent writes from references or discarded arguments", ({ definitions, vertex }) => {
    expect(
      ShaderAnalyzer.analyze(shader(definitions, vertex)).diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain(DiagnosticType.MissingVertexPosition);
  });

  it("retains macro-body fragment output references and distinguishes indexing", () => {
    const vertex = "gl_Position = vec4(0.0);";
    const legal = shader("#define SET_COLOR gl_FragData[0] = vec4(1.0)", vertex, "SET_COLOR;");
    expect(ShaderAnalyzer.analyze(legal).diagnostics).toEqual([]);
    const conflict = shader(
      "#define SET_COLOR gl_FragColor = vec4(1.0)\n#define SET_MRT gl_FragData[0] = vec4(1.0)",
      vertex,
      "SET_COLOR; SET_MRT;"
    );
    expect(ShaderAnalyzer.analyze(conflict).diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticType.LegacyFragmentOutputConflict
    );
    const bare = shader("#define SET_COLOR gl_FragData = vec4(1.0)", vertex, "SET_COLOR;");
    expect(ShaderAnalyzer.analyze(bare).diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticType.BareGlFragData
    );
  });

  it.each([
    { definitions: "#define OUTPUT gl_FragData", fragment: "OUTPUT[0] = vec4(1.0);" },
    { definitions: "#define ID(x) x", fragment: "ID(gl_FragData)[0] = vec4(1.0);" },
    { definitions: "#define SET(output) output[0] = vec4(1.0)", fragment: "SET(gl_FragData);" },
    { definitions: "#define OUTPUT gl_FragData[0]", fragment: "OUTPUT = vec4(1.0);" }
  ])("keeps indexing from macro bodies and their call sites", ({ definitions, fragment }) => {
    expect(ShaderAnalyzer.analyze(shader(definitions, "gl_Position = vec4(0.0);", fragment)).diagnostics).toEqual([]);
  });

  it("keeps conflicting macro output references separated by source branches", () => {
    const source = shader(
      "#ifdef MRT\n#define COLOR gl_FragData[0]\n#else\n#define COLOR gl_FragColor\n#endif",
      "gl_Position = vec4(0.0);",
      "COLOR = vec4(1.0);"
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it("keeps unprojected macro-call output parameter effects unknown", () => {
    const source = shader(
      "#define SET_POSITION assign(gl_Position)\nvoid assign(out vec4 position) { position = vec4(0.0); }",
      "SET_POSITION;"
    );
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });
});

describe.runIf(typeof document !== "undefined")("macro body effects and native GLSL", () => {
  const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();
  function context(target: ShaderLanguage) {
    let gl = contexts.get(target);
    if (!gl) {
      gl = document.createElement("canvas").getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl") as
        | WebGLRenderingContext
        | WebGL2RenderingContext;
      expect(gl).not.toBeNull();
      contexts.set(target, gl);
    }
    return gl;
  }
  afterAll(() => {
    for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
  });

  it.each(writes)("compiles expanded $name artifacts on GLES100/300", ({ definitions, vertex, fragment }) => {
    for (const { target, path, program } of programs(shader(definitions, vertex, fragment))) {
      const gl = context(target);
      for (const [type, instructions] of [
        [gl.VERTEX_SHADER, program.vertexShaderInstructions!],
        [gl.FRAGMENT_SHADER, program.fragmentShaderInstructions!]
      ] as const) {
        const object = gl.createShader(type)!;
        const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
        const expanded = ShaderMacroProcessor.evaluate(instructions, new Map());
        let extension = "";
        if (target === ShaderLanguage.GLSLES100 && type === gl.FRAGMENT_SHADER && expanded.includes("gl_FragData")) {
          expect(gl.getExtension("WEBGL_draw_buffers")).not.toBeNull();
          extension = "#extension GL_EXT_draw_buffers : require\n";
        }
        gl.shaderSource(object, `${version}${extension}precision highp float;\n${expanded}`);
        gl.compileShader(object);
        expect(gl.getShaderParameter(object, gl.COMPILE_STATUS), `${path}: ${gl.getShaderInfoLog(object)}`).toBe(true);
        gl.deleteShader(object);
      }
    }
  });

  it("pairs an illegal macro-body stage write with the accepted position-write controls", () => {
    const source = shader("#define SET_POSITION gl_FragCoord = vec4(0.0)", "SET_POSITION;");
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticType.InvalidBuiltinStage
    );
    for (const { target, path, program } of programs(source, false)) {
      const gl = context(target);
      const object = gl.createShader(gl.VERTEX_SHADER)!;
      const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
      const expanded = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
      expect(expanded, path).toContain("gl_FragCoord");
      gl.shaderSource(object, `${version}precision highp float;\n${expanded}`);
      gl.compileShader(object);
      expect(gl.getShaderParameter(object, gl.COMPILE_STATUS), `${path}: ${gl.getShaderInfoLog(object)}`).toBe(false);
      gl.deleteShader(object);
    }
  });
});
