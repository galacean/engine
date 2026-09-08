import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it } from "vitest";

type Macros = Record<string, string>;
type DeclarationKind = "helper" | "entry" | "uniform";

interface Guard {
  opening: string;
  closing: string;
}

interface Program {
  path: string;
  target: ShaderLanguage;
  macros: Macros;
  vertex: string;
  fragment: string;
}

const binaryRows: Macros[] = [{}, { A: "0" }, { B: "0" }, { A: "0", B: "0" }];
const ternaryRows: Macros[] = binaryRows.concat(binaryRows.map((row) => ({ ...row, C: "0" })));
const modeRows: Macros[] = [{}, { M: "0" }];
const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();

afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function expressionGuard(expression: string): Guard {
  return { opening: `#if ${expression}`, closing: "#endif" };
}

function guarded(guard: Guard, body: string): string {
  return `${guard.opening}\n${body}\n${guard.closing}`;
}

function shaderSource(
  kind: DeclarationKind,
  outer: Guard,
  inner: Guard,
  options: { prefix?: string; mutation?: string; unconditionalCall?: boolean } = {}
): string {
  const point = "gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0;";
  const declaration = (inherited: boolean) => {
    switch (kind) {
      case "helper":
        return `vec4 selectedColor() { return vec4(${inherited ? "0.25" : "0.5"}); }`;
      case "entry":
        return `void vert() { ${inherited ? "gl_Position = vec4(0.25);" : point} }`;
      case "uniform":
        return `${inherited ? "vec4" : "vec3"} selectedColor;`;
    }
  };
  const useColor = kind === "uniform" ? "vec4(selectedColor, 1.0)" : "selectedColor()";
  const fragment =
    kind === "entry"
      ? "gl_FragColor = vec4(0.5);"
      : options.unconditionalCall
        ? `gl_FragColor = ${useColor};`
        : `gl_FragColor = vec4(0.75);\n${guarded(inner, `gl_FragColor = ${useColor};`)}`;
  const passDeclaration =
    kind === "entry"
      ? `${inner.opening}\n${declaration(false)}\n#else\nvoid vert() { ${point} }\n${inner.closing}`
      : `${guarded(inner, declaration(false))}\nvoid vert() { ${point} }`;
  return `Shader "condition-implication-${kind}" {
${options.prefix ?? ""}
${guarded(outer, declaration(true))}
SubShader "s" { Pass "p" {
${options.mutation ?? ""}
${passDeclaration}
void frag() { ${fragment} }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function* programs(source: string, variants: Macros[], runtimeOnly = false): Generator<Program> {
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
      ],
      ...(runtimeOnly
        ? []
        : [["offline", new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]] as const])
    ] as const;
    for (const [path, program] of generated) {
      expect(program, path).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
      for (const macros of variants) {
        yield {
          path,
          target,
          macros,
          vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(Object.entries(macros))),
          fragment: ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map(Object.entries(macros)))
        };
      }
    }
  }
}

function expectDriverAcceptance(program: Program, renderedValue?: number): void {
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
  const linked = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, program.vertex],
      [gl.FRAGMENT_SHADER, program.fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, `${version}precision mediump float;\n${source}`);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), `${label}: ${gl.getShaderInfoLog(shader)}`).toBe(true);
      gl.attachShader(linked, shader);
    }
    gl.linkProgram(linked);
    expect(gl.getProgramParameter(linked, gl.LINK_STATUS), `${label}: ${gl.getProgramInfoLog(linked)}`).toBe(true);
    if (renderedValue !== undefined) {
      gl.useProgram(linked);
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

function expectReplacement(source: string, kind: DeclarationKind, rows: Macros[], truth: readonly boolean[]): void {
  expect(truth).toHaveLength(rows.length);
  for (const program of programs(source, rows)) {
    const active = truth[rows.indexOf(program.macros)];
    const label = `${program.path}, target ${program.target}, macros ${JSON.stringify(program.macros)}`;
    expect(program.vertex.match(/void\s+main\s*\(/g), label).toHaveLength(1);
    expect(program.vertex + program.fragment, label).not.toContain("0.25");
    if (kind === "uniform") {
      expect(program.fragment.match(/uniform\s+vec3\s+selectedColor\s*;/g) ?? [], label).toHaveLength(active ? 1 : 0);
      expect(program.fragment, label).not.toMatch(/uniform\s+vec4\s+selectedColor/);
    } else if (kind === "helper") {
      expect(program.fragment.match(/vec4\s+selectedColor\s*\(/g) ?? [], label).toHaveLength(active ? 1 : 0);
      expect(program.fragment, label).toContain(active ? "0.5" : "0.75");
    }
    expectDriverAcceptance(program, kind === "helper" ? (active ? 0.5 : 0.75) : undefined);
  }
}

describe("semantic condition implication in ShaderLab inheritance", () => {
  it.each([
    "defined(M) && 1",
    "defined(M) || 0",
    "defined(M) == 1",
    "1 == defined(M)",
    "defined(M) != 0",
    "!!defined(M)"
  ])("replaces inherited helpers in both directions of #ifdef M and %s", (expression) => {
    const direct = { opening: "#ifdef M", closing: "#endif" };
    const rewritten = expressionGuard(expression);
    for (const [outer, inner] of [
      [direct, rewritten],
      [rewritten, direct]
    ]) {
      expectReplacement(shaderSource("helper", outer, inner), "helper", modeRows, [false, true]);
    }
  });

  it.each([
    {
      name: "commuted and nested conjunction",
      outer: "defined(A) && (defined(B) && defined(C))",
      inner: "(defined(C) && defined(A)) && defined(B)",
      rows: ternaryRows,
      truth: [false, false, false, false, false, false, false, true]
    },
    {
      name: "De Morgan disjunction",
      outer: "defined(A) || defined(B)",
      inner: "!(!defined(B) && !defined(A))",
      rows: binaryRows,
      truth: [false, true, true, true]
    },
    {
      name: "De Morgan conjunction",
      outer: "defined(A) && defined(B)",
      inner: "!(!defined(B) || !defined(A))",
      rows: binaryRows,
      truth: [false, false, false, true]
    },
    {
      name: "arithmetic over defined results",
      outer: "defined(A) + defined(B) == 2",
      inner: "defined(A) && defined(B)",
      rows: binaryRows,
      truth: [false, false, false, true]
    }
  ])("preserves equivalent helpers for $name", ({ outer, inner, rows, truth }) => {
    for (const [from, to] of [
      [outer, inner],
      [inner, outer]
    ]) {
      expectReplacement(shaderSource("helper", expressionGuard(from), expressionGuard(to)), "helper", rows, truth);
    }
  });

  it.each([
    {
      name: "conjunction to one conjunct",
      outer: "defined(A) && defined(B)",
      inner: "defined(A)",
      outerTruth: [false, false, false, true],
      innerTruth: [false, true, false, true]
    },
    {
      name: "disjunction narrowed by a negative conjunct",
      outer: "(defined(A) || defined(B)) && !defined(A)",
      inner: "defined(B)",
      outerTruth: [false, false, true, false],
      innerTruth: [false, false, true, true]
    }
  ])("allows one-way coverage from $name", ({ outer, inner, outerTruth, innerTruth }) => {
    expect(outerTruth.every((active, row) => !active || innerTruth[row])).toBe(true);
    expect(innerTruth.some((active, row) => active && !outerTruth[row])).toBe(true);
    expectReplacement(
      shaderSource("helper", expressionGuard(outer), expressionGuard(inner)),
      "helper",
      binaryRows,
      innerTruth
    );
  });

  it("replaces an entry point with an equivalent Boolean comparison", () => {
    expectReplacement(
      shaderSource("entry", { opening: "#ifdef M", closing: "#endif" }, expressionGuard("defined(M) == 1")),
      "entry",
      modeRows,
      [false, true]
    );
  });

  it("replaces a uniform type under a De Morgan rewrite", () => {
    expectReplacement(
      shaderSource(
        "uniform",
        expressionGuard("defined(A) || defined(B)"),
        expressionGuard("!(!defined(A) && !defined(B))")
      ),
      "uniform",
      binaryRows,
      [false, true, true, true]
    );
  });

  it("carries preceding alternatives into an equivalent elif condition", () => {
    expectReplacement(
      shaderSource(
        "helper",
        { opening: "#if defined(A) || defined(B)\n#elif defined(C)", closing: "#endif" },
        { opening: "#if !(!defined(B) && !defined(A))\n#elif defined(C) && 1", closing: "#endif" }
      ),
      "helper",
      ternaryRows,
      [false, false, false, false, true, false, false, false]
    );
  });

  it("relates an else following multiple alternatives to their Boolean complement", () => {
    expectReplacement(
      shaderSource(
        "helper",
        { opening: "#ifdef A\n#elif defined(B)\n#else", closing: "#endif" },
        expressionGuard("!(defined(B) || defined(A))")
      ),
      "helper",
      binaryRows,
      [true, false, false, false]
    );
  });

  it("keeps safe defined formulas equivalent across unrelated macro mutations", () => {
    expectReplacement(
      shaderSource("helper", expressionGuard("defined(M)"), expressionGuard("defined(M) && 1"), {
        prefix: "#define OTHER 0",
        mutation: "#undef OTHER\n#define OTHER 1"
      }),
      "helper",
      modeRows,
      [false, true]
    );
  });

  it("rejects reversed partial coverage and preserves the inherited exclusive runtime variant", () => {
    const source = shaderSource("helper", expressionGuard("defined(A)"), expressionGuard("defined(A) && defined(B)"), {
      unconditionalCall: true
    });
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toContain("Redefinition");
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("Redefinition");
    }
    for (const program of programs(source, [{ A: "0" }], true)) {
      expect(program.fragment.match(/vec4\s+selectedColor\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain("0.25");
      expectDriverAcceptance(program, 0.25);
    }
  });

  it.each([
    { directive: "#undef M", macros: { M: "0", CHANGE: "0" } as Macros, expected: 0.25 },
    { directive: "#define M 1", macros: { CHANGE: "0" } as Macros, expected: 0.5 }
  ])("separates conditions before and after conditional $directive", ({ directive, macros, expected }) => {
    const source = shaderSource("helper", expressionGuard("defined(M)"), expressionGuard("defined(M) && 1"), {
      mutation: `#ifdef CHANGE\n${directive}\n#endif`,
      unconditionalCall: true
    });
    for (const program of programs(source, [macros], true)) {
      expect(program.fragment.match(/vec4\s+selectedColor\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain(String(expected));
      expectDriverAcceptance(program, expected);
    }
  });

  it("retains exclusive variants when elif arms have different preceding alternatives", () => {
    const source = shaderSource(
      "helper",
      { opening: "#ifdef A\n#elif defined(C)", closing: "#endif" },
      { opening: "#ifdef B\n#elif defined(C) && 1", closing: "#endif" },
      { unconditionalCall: true }
    );
    for (const program of programs(
      source,
      [
        { B: "0", C: "0" },
        { A: "0", C: "0" }
      ],
      true
    )) {
      const expected = "B" in program.macros ? 0.25 : 0.5;
      expect(program.fragment.match(/vec4\s+selectedColor\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain(String(expected));
      expectDriverAcceptance(program, expected);
    }
  });

  it("preserves macro replacement precedence when numeric-looking guards do not imply each other", () => {
    const source = shaderSource("helper", expressionGuard("A > 0"), expressionGuard("A != 0"), {
      unconditionalCall: true
    });
    for (const program of programs(source, [{ A: "1 == 2" }], true)) {
      expect(program.fragment.match(/vec4\s+selectedColor\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain("0.25");
      expectDriverAcceptance(program, 0.25);
    }
  });

  it.each(["(defined(M) << 31) < 0", "(~defined(M) & 1) == 0"])(
    "preserves signed 32-bit preprocessing for %s",
    (expression) => {
      expectReplacement(
        shaderSource("helper", expressionGuard("defined(M)"), expressionGuard(expression)),
        "helper",
        modeRows,
        [false, true]
      );
    }
  );

  it("preserves an inherited counterexample after condition proof exploration is exhausted", () => {
    const names = Array.from({ length: 9 }, (_, index) => `A${index}`);
    const source = shaderSource(
      "helper",
      expressionGuard("1"),
      expressionGuard(`(${names.map((name) => `defined(${name})`).join(" + ")}) != 9`),
      { unconditionalCall: true }
    );
    const allDefined = Object.fromEntries(names.map((name) => [name, "0"]));
    for (const program of programs(source, [allDefined], true)) {
      expect(program.fragment.match(/vec4\s+selectedColor\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain("0.25");
      expectDriverAcceptance(program, 0.25);
    }
  });

  it("replaces identical large formulas without enumerating every macro assignment", () => {
    const names = Array.from({ length: 12 }, (_, index) => `A${index}`);
    const guard = expressionGuard(`(${names.map((name) => `defined(${name})`).join(" + ")}) > 0`);
    expectReplacement(
      shaderSource("helper", guard, guard),
      "helper",
      [{}, { A0: "0" }, Object.fromEntries(names.map((name) => [name, "0"]))],
      [false, true, true]
    );
  });
});
