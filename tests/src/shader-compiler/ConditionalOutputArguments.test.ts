import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { getParsedShaderPassPayload } from "@galacean/engine-shader-parser/internal";
import { getBranchReachability, ParserSemanticValidation } from "@galacean/engine-shader-parser/internal/analyzer";
import { describe, expect, it } from "vitest";

function shader(qualifier = "out", prefix = "", call = "modify(v.xx);"): string {
  return `Shader "conditional-output" { SubShader "s" { Pass "p" {
${prefix}
#ifdef WRITE
void modify(${qualifier} vec2 target) { target = vec2(1.0); }
#else
void modify(in vec2 target) { }
#endif
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
void frag() { vec2 v = vec2(0.25); ${call} gl_FragColor = vec4(v, 0.0, 1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function live(source: string, target: ShaderLanguage) {
  const compiler = new ShaderCompiler();
  const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
  return compiler._parseShaderPass(
    pass.contents,
    pass.vertexEntry,
    pass.fragmentEntry,
    target,
    undefined,
    pass.contentScopeStarts
  );
}

describe("conditional output argument obligations", () => {
  it.each(["out", "inout"])("retains the proven %s candidate branch in the parser issue", (qualifier) => {
    const source = shader(qualifier);
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["InvalidAssignmentTarget"]);
    const diagnostic = analysis.diagnostics[0];
    expect(source.slice(diagnostic.range.start.offset, diagnostic.range.end.offset)).toBe("v.xx");
    const ir = getParsedShaderPassPayload(analysis.passes[0]).data.ir!;
    const issues = ParserSemanticValidation.collect(ir.program).filter(
      (issue) => issue.code === "InvalidAssignmentTarget"
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].branch!.length).toBeGreaterThan(0);
    expect(getBranchReachability(issues[0].branch!)).toBe("reachable");
  });

  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    for (const qualifier of ["out", "inout"]) {
      it.each(["", "#define WRITE 1"])(
        `rejects an invalid source configuration in handoff/offline (${target}, ${qualifier}, %s)`,
        (prefix) => {
          const source = shader(qualifier, prefix);
          const analysis = ShaderAnalyzer.analyze(source);
          expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["InvalidAssignmentTarget"]);
          expect(new ShaderCompiler().generate(analysis.passes[0], target)).toBeUndefined();
          expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("modifiable l-value");
          const program = live(source, target)!;
          expect(program).toBeDefined();
          const fragment = ShaderMacroProcessor.evaluate(
            program.fragmentShaderInstructions!,
            new Map([["WRITE", "1"]])
          );
          expect(fragment).toMatch(new RegExp(`modify\\s*\\(\\s*${qualifier}\\s+vec2`));
          expect(fragment).toMatch(/modify\s*\(\s*v\s*\.\s*xx\s*\)/);
        }
      );

      it.each([
        ["input variant", "#undef WRITE", "modify(v.xx);"],
        ["modifiable output", "#define WRITE 1", "modify(v.xy);"],
        ["exclusive call branch", "", "\n#ifndef WRITE\nmodify(v.xx);\n#endif\n"]
      ])(`preserves %s through all entry paths (${target}, ${qualifier})`, (_name, prefix, call) => {
        const source = shader(qualifier, prefix, call);
        const analysis = ShaderAnalyzer.analyze(source);
        expect(analysis.diagnostics).toEqual([]);
        const handoff = new ShaderCompiler().generate(analysis.passes[0], target)!;
        const runtime = live(source, target)!;
        const offline = new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0];
        expect(offline.isUsePass).toBe(false);
        if (offline.isUsePass) throw new Error("Expected compiled pass");
        for (const macro of [new Map<string, string>(), new Map([["WRITE", "1"]])]) {
          const expected = ShaderMacroProcessor.evaluate(runtime.fragmentShaderInstructions!, macro);
          expect(ShaderMacroProcessor.evaluate(handoff.fragmentShaderInstructions!, macro)).toBe(expected);
          expect(ShaderMacroProcessor.evaluate(offline.fragmentShaderInstructions!, macro)).toBe(expected);
        }
      });
    }
  }

  it("does not invent an output qualifier for an unresolved callee", () => {
    const source = shader("out", "", "external(v.xx);");
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });

  it("does not infer a selected overload from an unknown argument type", () => {
    const source = shader()
      .replace("#ifdef WRITE", "void modify(float value) {}\n#ifdef WRITE")
      .replace("modify(v.xx);", "modify(EXTERNAL);");
    expect(ShaderAnalyzer.analyze(source).diagnostics).toEqual([]);
  });
});

describe.runIf(typeof document !== "undefined")("conditional output variants on WebGL", () => {
  it.each([ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300])(
    "rejects only the active non-modifiable output variant for target %s",
    (target) => {
      const gl = document
        .createElement("canvas")
        .getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl") as
        | WebGLRenderingContext
        | WebGL2RenderingContext;
      expect(gl).not.toBeNull();
      try {
        for (const qualifier of ["out", "inout"]) {
          for (const writable of [false, true]) {
            const program = live(shader(qualifier, "", `modify(v.${writable ? "xy" : "xx"});`), target)!;
            for (const write of [false, true]) {
              const macros = write ? new Map([["WRITE", "1"]]) : new Map<string, string>();
              const objects = [] as WebGLShader[];
              const linked = gl.createProgram()!;
              try {
                for (const [kind, instructions] of [
                  [gl.VERTEX_SHADER, program.vertexShaderInstructions!],
                  [gl.FRAGMENT_SHADER, program.fragmentShaderInstructions!]
                ] as const) {
                  const object = gl.createShader(kind)!;
                  objects.push(object);
                  const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
                  gl.shaderSource(
                    object,
                    `${version}precision highp float;\n${ShaderMacroProcessor.evaluate(instructions, macros)}`
                  );
                  gl.compileShader(object);
                  const valid = kind === gl.VERTEX_SHADER || !write || writable;
                  expect(gl.getShaderParameter(object, gl.COMPILE_STATUS), gl.getShaderInfoLog(object) ?? "").toBe(
                    valid
                  );
                  if (valid) gl.attachShader(linked, object);
                }
                if (!write || writable) {
                  gl.linkProgram(linked);
                  expect(gl.getProgramParameter(linked, gl.LINK_STATUS), gl.getProgramInfoLog(linked) ?? "").toBe(true);
                  gl.viewport(0, 0, 1, 1);
                  gl.useProgram(linked);
                  gl.clearColor(0, 0, 0, 0);
                  gl.clear(gl.COLOR_BUFFER_BIT);
                  gl.drawArrays(gl.POINTS, 0, 1);
                  const pixel = new Uint8Array(4);
                  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                  expect(gl.getError()).toBe(gl.NO_ERROR);
                  const expected = write ? 255 : 64;
                  expect(Math.abs(pixel[0] - expected)).toBeLessThanOrEqual(1);
                  expect(Math.abs(pixel[1] - expected)).toBeLessThanOrEqual(1);
                  expect(pixel[3]).toBe(255);
                }
              } finally {
                for (const object of objects) gl.deleteShader(object);
                gl.deleteProgram(linked);
              }
            }
          }
        }
      } finally {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    }
  );
});
