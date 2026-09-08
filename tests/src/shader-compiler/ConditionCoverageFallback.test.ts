import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it } from "vitest";

type Macros = Record<string, string>;
interface Program {
  path: string;
  target: ShaderLanguage;
  macros: Macros;
  vertex: string;
  fragment: string;
}
const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();
afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function conditions(count: number) {
  const flags = Array.from({ length: count }, (_, index) => `defined(F${index})`);
  const weighted = `(${flags.map((flag, index) => `(${flag} << ${index})`).join(" + ")})`;
  return { weighted, nonzero: `${weighted} != 0`, disjunction: flags.join(" || ") };
}

function macrosFor(mask: number, count: number): Macros {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => index)
      .filter((index) => (mask & (1 << index)) !== 0)
      .map((index) => [`F${index}`, "0"])
  );
}

function shader(
  outer: string,
  inner: string,
  options: { mutation?: string; unconditionalCall?: boolean } = {}
): string {
  return `Shader "coverage-fallback" {
#if ${outer}
vec4 selectedColor() { return vec4(0.25); }
#endif
SubShader "s" { Pass "p" {
${options.mutation ?? ""}
#if ${inner}
vec4 selectedColor() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
void frag() {
${options.unconditionalCall ? "gl_FragColor = selectedColor();" : `#if ${inner}\ngl_FragColor = selectedColor();\n#else\ngl_FragColor = vec4(0.75);\n#endif`}
}
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function* compiledPrograms(source: string, runtimeOnly = false) {
  const compiler = new ShaderCompiler();
  const analysis = runtimeOnly ? undefined : ShaderAnalyzer.analyze(source);
  if (analysis) expect(analysis.diagnostics).toEqual([]);
  const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    const generated = [
      ...(analysis ? [["analyzer", compiler.generate(analysis.passes[0], target)] as const] : []),
      [
        "live",
        compiler._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          target,
          undefined,
          pass.contentScopeStarts
        )
      ] as const,
      ...(runtimeOnly
        ? []
        : [["offline", new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]] as const])
    ];
    for (const [path, program] of generated) {
      expect(program, path).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
      yield { path, target, program };
    }
  }
}

function evaluate(
  compiled: ReturnType<typeof compiledPrograms> extends Generator<infer Item> ? Item : never,
  macros: Macros
): Program {
  return {
    path: compiled.path,
    target: compiled.target,
    macros,
    vertex: ShaderMacroProcessor.evaluate(compiled.program.vertexShaderInstructions!, new Map(Object.entries(macros))),
    fragment: ShaderMacroProcessor.evaluate(
      compiled.program.fragmentShaderInstructions!,
      new Map(Object.entries(macros))
    )
  };
}

function expectSelected(program: Program, value: number, declarations = 1): void {
  const label = `${program.path}, target ${program.target}, macros ${JSON.stringify(program.macros)}`;
  expect(program.fragment.match(/vec4\s+selectedColor\s*\([^)]*\)\s*\{/g) ?? [], label).toHaveLength(declarations);
  if (value !== 0.25) expect(program.fragment, label).not.toContain("0.25");
  expectDriverAcceptance(program, value);
}

function expectDriverAcceptance(program: Program, renderedValue?: number, uniformName?: string): void {
  let gl = contexts.get(program.target);
  if (!gl) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    gl = canvas.getContext(program.target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl", {
      antialias: false,
      preserveDrawingBuffer: true
    }) as WebGLRenderingContext | WebGL2RenderingContext;
    expect(gl).not.toBeNull();
    contexts.set(program.target, gl);
  }
  const label = `${program.path}, target ${program.target}, macros ${JSON.stringify(program.macros)}`;
  const version = program.target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
  const drawBuffers = program.target === ShaderLanguage.GLSLES100 && program.fragment.includes("gl_FragData");
  if (drawBuffers) expect(gl.getExtension("WEBGL_draw_buffers"), label).not.toBeNull();
  const linked = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, program.vertex],
      [gl.FRAGMENT_SHADER, program.fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      const extension = drawBuffers && type === gl.FRAGMENT_SHADER ? "#extension GL_EXT_draw_buffers : require\n" : "";
      gl.shaderSource(shader, `${version}${extension}precision mediump float;\n${source}`);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), `${label}: ${gl.getShaderInfoLog(shader)}`).toBe(true);
      gl.attachShader(linked, shader);
    }
    gl.linkProgram(linked);
    expect(gl.getProgramParameter(linked, gl.LINK_STATUS), `${label}: ${gl.getProgramInfoLog(linked)}`).toBe(true);
    if (renderedValue !== undefined) {
      gl.useProgram(linked);
      if (uniformName) {
        const location = gl.getUniformLocation(linked, uniformName);
        expect(location, label).not.toBeNull();
        gl.uniform4f(location, renderedValue, renderedValue, renderedValue, renderedValue);
      }
      gl.viewport(0, 0, 1, 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, 1);
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      expect(gl.getError(), label).toBe(gl.NO_ERROR);
      expect(Array.from(pixel), label).toEqual(Array(4).fill(Math.round(renderedValue * 255)));
    }
  } finally {
    gl.deleteProgram(linked);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

describe("shader generation after condition coverage proof exhaustion", () => {
  for (const count of [8, 12, 20]) {
    it.each([false, true])(
      `emits one final implementation for ${count}-flag bitmask/disjunction equivalence, reversed: %s`,
      (reversed) => {
        const { nonzero, disjunction } = conditions(count);
        const source = shader(reversed ? disjunction : nonzero, reversed ? nonzero : disjunction);
        const masks = [0, 1, 1 << Math.floor(count / 2), 1 << (count - 1), (1 << count) - 1];
        for (const compiled of compiledPrograms(source)) {
          for (const mask of masks) {
            // Every flag owns a distinct bit below bit 20, so the independent integer mask is
            // nonzero exactly when at least one flag is present; no signed overflow is possible.
            expectSelected(evaluate(compiled, macrosFor(mask, count)), mask ? 0.5 : 0.75, mask ? 1 : 0);
          }
        }
      }
    );
  }

  it("generates equivalent large modulo predicates without requiring the proof solver to finish", () => {
    const { weighted } = conditions(20);
    // The current bounded solver returns unknown for both forms. The result is still determined
    // by integer congruence, since 0 <= W <= 2^20 - 1 and adding three cannot overflow.
    const source = shader(`(${weighted} % 3) == 1`, `((${weighted} + 3) % 3) == 1`);
    const masks = [0, 1, 2, 3, 4, 7, 1 << 19, (1 << 19) + 2, (1 << 20) - 1];
    for (const compiled of compiledPrograms(source)) {
      for (const mask of masks) {
        const active = mask % 3 === 1;
        expectSelected(evaluate(compiled, macrosFor(mask, 20)), active ? 0.5 : 0.75, active ? 1 : 0);
      }
    }
  });

  it("keeps unrelated macro changes from breaking equivalent unknown coverage", () => {
    const { nonzero, disjunction } = conditions(12);
    const source = shader(nonzero, disjunction, { mutation: "#undef OTHER\n#define OTHER 1" });
    for (const compiled of compiledPrograms(source)) {
      for (const mask of [0, 1, 1 << 11]) {
        expectSelected(evaluate(compiled, macrosFor(mask, 12)), mask ? 0.5 : 0.75, mask ? 1 : 0);
      }
    }
  });

  it.each([
    { directive: "#undef F0", mask: 1, expected: 0.25 },
    { directive: "#define F0 0", mask: 0, expected: 0.5 }
  ])("preserves declaration-time macro versions across conditional $directive", ({ directive, mask, expected }) => {
    const { nonzero, disjunction } = conditions(12);
    const source = shader(nonzero, disjunction, {
      mutation: `#ifdef CHANGE\n${directive}\n#endif`,
      unconditionalCall: true
    });
    for (const compiled of compiledPrograms(source, true)) {
      expectSelected(evaluate(compiled, { ...macrosFor(mask, 12), CHANGE: "0" }), expected);
    }
  });

  it("retains the inherited exclusive variant when a large unknown coverage relation has a real gap", () => {
    const source = shader(conditions(20).nonzero, conditions(19).disjunction, { unconditionalCall: true });
    for (const compiled of compiledPrograms(source, true)) {
      expectSelected(evaluate(compiled, macrosFor(1 << 19, 20)), 0.25);
    }
  });

  it("preserves the authoring rejection and runtime exclusive variant of a provable coverage gap", () => {
    const source = shader("defined(A)", "defined(A) && defined(B)", { unconditionalCall: true });
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toContain("Redefinition");
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("Redefinition");
    }
    for (const compiled of compiledPrograms(source, true)) {
      expectSelected(evaluate(compiled, { A: "0" }), 0.25);
    }
  });

  it.each([
    { operation: "/", expression: "(1 / defined(D)) == 1", message: "Division by zero" },
    { operation: "%", expression: "(1 % defined(D)) == 0", message: "Modulo by zero" }
  ])("preserves active $operation errors while generating the valid variants correctly", ({ expression, message }) => {
    const { nonzero } = conditions(12);
    const source = shader(nonzero, `(${nonzero}) && (${expression})`);
    for (const compiled of compiledPrograms(source)) {
      expectSelected(evaluate(compiled, {}), 0.75, 0);
      expectSelected(evaluate(compiled, { F0: "0", D: "0" }), 0.5);
      expect(() => evaluate(compiled, { F0: "0" })).toThrow(message);
    }
  });
});

describe("deferred ownership across GLES declaration consumers", () => {
  const point = "gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0;";
  const { nonzero, disjunction } = conditions(12);
  const rows = [0, 1, 1 << 11];

  it("selects the later cross-scope vertex entry when its equivalent guard remains unknown", () => {
    const source = `Shader "deferred-entry-owner" {
#if ${nonzero}
void vert() { gl_Position = vec4(2.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
#endif
SubShader "s" { Pass "p" {
#if ${disjunction}
void vert() { ${point} }
#else
void vert() { ${point} }
#endif
void frag() { gl_FragColor = vec4(0.5); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const compiled of compiledPrograms(source)) {
      for (const mask of rows) {
        const program = evaluate(compiled, macrosFor(mask, 12));
        expect(program.vertex.match(/void\s+main\s*\(/g)).toHaveLength(1);
        expect(program.vertex).not.toContain("2.0");
        expectDriverAcceptance(program, 0.5);
      }
    }
  });

  it.each([
    {
      name: "forward function",
      inherited: "vec4 selectedColor() { return vec4(0.25); }\nvec4 inheritedCaller() { return selectedColor(); }",
      replacement: "vec4 selectedColor() { return vec4(0.5); }",
      call: "inheritedCaller()"
    },
    {
      name: "uniform used by an earlier helper",
      inherited: "float selectedUniform;\nvec4 inheritedCaller() { return vec4(selectedUniform); }",
      replacement: "vec4 selectedUniform;",
      call: "inheritedCaller()"
    },
    {
      name: "ordinary struct used by an earlier helper",
      inherited: "struct Payload { vec4 value; };\nPayload inheritedCopy(Payload item) { return item; }",
      replacement: "struct Payload { vec4 value; };",
      call: "readPayload()",
      caller: "vec4 readPayload() { Payload item; item.value = vec4(0.5); return inheritedCopy(item).value; }"
    },
    {
      name: "ordinary return type in a forward prototype",
      inherited:
        "struct Payload { vec4 value; };\nPayload selectedColor() { Payload item; item.value = vec4(0.25); return item; }\nvec4 inheritedCaller() { return selectedColor().value; }",
      replacement:
        "struct Payload { vec4 value; };\nPayload selectedColor() { Payload item; item.value = vec4(0.5); return item; }",
      call: "inheritedCaller()"
    },
    {
      name: "ordinary parameter type in a forward prototype",
      inherited:
        "struct Payload { vec4 value; };\nvec4 selectedColor(Payload item) { return vec4(0.25); }\nvec4 inheritedCaller() { Payload item; item.value = vec4(0.5); return selectedColor(item); }",
      replacement: "struct Payload { vec4 value; };\nvec4 selectedColor(Payload item) { return item.value; }",
      call: "inheritedCaller()"
    }
  ])(
    "resolves the final $name owner before its inherited consumer",
    ({ name, inherited, replacement, call, caller }) => {
      const source = `Shader "deferred-declaration-consumer" {
#if ${nonzero}
${inherited}
#endif
SubShader "s" { Pass "p" {
#if ${disjunction}
${replacement}
${caller ?? ""}
#endif
void vert() { ${point} }
void frag() {
#if ${disjunction}
gl_FragColor = ${call};
#else
gl_FragColor = vec4(0.75);
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`;
      for (const compiled of compiledPrograms(source)) {
        for (const mask of rows) {
          const active = mask !== 0;
          const program = evaluate(compiled, macrosFor(mask, 12));
          expect(program.fragment).not.toContain("0.25");
          if (name === "forward function") {
            expect(program.fragment.match(/vec4\s+selectedColor\s*\([^)]*\)\s*\{/g) ?? []).toHaveLength(active ? 1 : 0);
            // Drivers validate that the surviving signature is declared before inheritedCaller.
          } else if (name.startsWith("uniform")) {
            expect(program.fragment.match(/uniform\s+vec4\s+selectedUniform\s*;/g) ?? []).toHaveLength(active ? 1 : 0);
            expect(program.fragment).not.toMatch(/uniform\s+float\s+selectedUniform/);
          } else {
            expect(program.fragment.match(/struct\s+Payload\s*\{/g) ?? []).toHaveLength(active ? 1 : 0);
          }
          expectDriverAcceptance(
            program,
            active ? 0.5 : 0.75,
            active && name.startsWith("uniform") ? "selectedUniform" : undefined
          );
        }
      }
    }
  );

  it("selects one IO struct owner before lowering its fields into stage varyings", () => {
    const source = `Shader "deferred-varying-owner" {
#if ${nonzero}
struct Varyings { vec4 tint; };
#endif
SubShader "s" { Pass "p" {
#if ${disjunction}
struct Varyings { vec4 tint; };
Varyings vert() { Varyings value; value.tint = vec4(0.5); ${point} return value; }
void frag(Varyings value) { gl_FragColor = value.tint; }
#else
void vert() { ${point} }
void frag() { gl_FragColor = vec4(0.75); }
#endif
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const compiled of compiledPrograms(source)) {
      for (const mask of rows) {
        const active = mask !== 0;
        const program = evaluate(compiled, macrosFor(mask, 12));
        expect(program.vertex.match(/(?:varying|out)\s+vec4\s+tint\s*;/g) ?? []).toHaveLength(active ? 1 : 0);
        expect(program.fragment.match(/(?:varying|in)\s+vec4\s+tint\s*;/g) ?? []).toHaveLength(active ? 1 : 0);
        expect(program.vertex + program.fragment).not.toMatch(/struct\s+Varyings/);
        expectDriverAcceptance(program, active ? 0.5 : 0.75);
      }
    }
  });
});

describe("deferred fragment output ownership", () => {
  for (const count of [8, 12]) {
    it.each([
      { builtin: "gl_FragData[0]", reversed: false },
      { builtin: "gl_FragData[0]", reversed: true },
      { builtin: "gl_FragColor", reversed: false },
      { builtin: "gl_FragColor", reversed: true }
    ])(`keeps one output for ${count}-flag $builtin/MRT overrides, reversed: $reversed`, ({ builtin, reversed }) => {
      const { nonzero, disjunction } = conditions(count);
      const direct = (value: string) => `void frag() { ${builtin} = vec4(${value}); }`;
      const mrt = (value: string) =>
        `struct Outputs { layout(location = 0) vec4 outputColor; };\nOutputs frag() { Outputs value; value.outputColor = vec4(${value}); return value; }`;
      const source = `Shader "deferred-fragment-output" {
#if ${nonzero}
${reversed ? mrt("0.25") : direct("0.25")}
#endif
SubShader "s" { Pass "p" {
#if ${disjunction}
${reversed ? direct("0.5") : mrt("0.5")}
#else
${reversed ? direct("0.75") : mrt("0.75")}
#endif
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
VertexShader = vert; FragmentShader = frag;
} } }`;
      for (const compiled of compiledPrograms(source)) {
        for (const mask of [0, 1, 1 << (count - 1)]) {
          const program = evaluate(compiled, macrosFor(mask, count));
          expect(program.fragment.match(/void\s+main\s*\(/g)).toHaveLength(1);
          expect(program.fragment).not.toContain("0.25");
          expectDriverAcceptance(program, mask ? 0.5 : 0.75);
          if (program.target === ShaderLanguage.GLSLES300) {
            expect(program.fragment.match(/\bout\s+vec4\s+\w+\s*;/g)).toHaveLength(1);
          }
        }
      }
    });
  }
});

describe("dependencies of deferred declaration owners", () => {
  it.each([false, true])(
    "retains an inherited helper only when the selected implementation needs it; shared: %s",
    (shared) => {
      const { nonzero, disjunction } = conditions(12);
      const helper = shared ? "sharedValue" : "inheritedOnly";
      const source = `Shader "deferred-owner-dependencies" {
#if ${nonzero}
struct Payload { vec4 oldField; vec4 newField; };
vec4 ${helper}(Payload item) { return item.${shared ? "newField" : "oldField"}; }
vec4 selectedColor() {
  Payload item; item.oldField = vec4(0.25); item.newField = vec4(0.25);
  return ${helper}(item);
}
#endif
SubShader "s" { Pass "p" {
#if ${disjunction}
struct Payload { vec4 newField; };
vec4 selectedColor() {
  Payload item; item.newField = vec4(0.5);
  return ${shared ? `${helper}(item)` : "item.newField"};
}
#endif
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
void frag() {
#if ${disjunction}
gl_FragColor = selectedColor();
#else
gl_FragColor = vec4(0.75);
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`;
      for (const compiled of compiledPrograms(source)) {
        for (const mask of [0, 1, 1 << 11]) {
          const program = evaluate(compiled, macrosFor(mask, 12));
          expect(program.fragment).not.toContain("oldField");
          expect(program.fragment.match(new RegExp(`vec4\\s+${helper}\\s*\\(`, "g")) ?? []).toHaveLength(
            shared && mask ? 1 : 0
          );
          expect(program.fragment.match(/struct\s+Payload\s*\{/g) ?? []).toHaveLength(mask ? 1 : 0);
          expectSelected(program, mask ? 0.5 : 0.75, mask ? 1 : 0);
        }
      }
    }
  );
});

describe("macro-derived outputs of deferred fragment owners", () => {
  it.each(["gl_FragData[0]", "gl_FragColor"])(
    "retains an inherited WRITE definition without retaining its discarded %s output",
    (builtin) => {
      const { nonzero, disjunction } = conditions(12);
      const source = `Shader "deferred-macro-output" {
#if ${nonzero}
void frag() {
#define WRITE ${builtin}
WRITE = vec4(0.25);
}
#endif
SubShader "s" { Pass "p" {
#if ${disjunction}
struct Outputs { layout(location = 0) vec4 outputColor; };
Outputs frag() {
  Outputs value;
#ifdef WRITE
  value.outputColor = vec4(0.5);
#else
  value.outputColor = vec4(0.125);
#endif
  return value;
}
#else
struct Outputs { layout(location = 0) vec4 outputColor; };
Outputs frag() { Outputs value; value.outputColor = vec4(0.75); return value; }
#endif
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
VertexShader = vert; FragmentShader = frag;
} } }`;
      for (const compiled of compiledPrograms(source)) {
        for (const mask of [0, 1, 1 << 11]) {
          const program = evaluate(compiled, macrosFor(mask, 12));
          expect(program.fragment.match(/void\s+main\s*\(/g)).toHaveLength(1);
          expect(program.fragment).not.toMatch(/0\.25|0\.125/);
          expectDriverAcceptance(program, mask ? 0.5 : 0.75);
          if (program.target === ShaderLanguage.GLSLES300) {
            expect(program.fragment.match(/\bout\s+vec4\s+\w+\s*;/g)).toHaveLength(1);
            expect(program.fragment).not.toMatch(/GS_glFragColor|GS_glFragData/);
          }
        }
      }
    }
  );
});
