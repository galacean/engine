import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it } from "vitest";

const member = "vec2 uv;";
const struct = `struct Varyings { ${member} };`;

function shader(declarations: string): string {
  return `Shader "conditional-io-coverage" { SubShader "s" { Pass "p" {
${declarations}
Varyings owner;
#define OWNER owner
Varyings vert() {
  Varyings outputValue;
  outputValue.uv = vec2(0.5);
  gl_Position = vec4(0.0);
  return outputValue;
}
void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
}

const completeDeclarations = [
  ["source-defined struct guard", `#define VALUE 1\n#define FLAG VALUE\n#if FLAG\n${struct}\n#endif`],
  ["source-defined member guard", `#define FLAG(x) x\nstruct Varyings {\n#if FLAG(1)\n${member}\n#endif\n};`],
  ["sibling structs", `#ifdef USE_A\n${struct}\n#else\n${struct}\n#endif`],
  ["sibling members", `struct Varyings {\n#ifdef USE_A\n${member}\n#else\n${member}\n#endif\n};`],
  ["three struct arms", `#if MODE == 0\n${struct}\n#elif MODE == 1\n${struct}\n#else\n${struct}\n#endif`],
  [
    "three member arms",
    `struct Varyings {\n#if MODE == 0\n${member}\n#elif MODE == 1\n${member}\n#else\n${member}\n#endif\n};`
  ],
  [
    "nested struct and member arms",
    `#ifdef USE_A
struct Varyings {
#ifdef USE_B
${member}
#else
${member}
#endif
};
#else
${struct}
#endif`
  ],
  [
    "nested member arms",
    `struct Varyings {
#ifdef USE_A
#if MODE == 0
${member}
#elif MODE == 1
${member}
#else
${member}
#endif
#else
#ifdef USE_B
${member}
#else
${member}
#endif
#endif
};`
  ],
  ["constant final arm", `struct Varyings {\n#if USE_A\n${member}\n#elif 1\n${member}\n#endif\n};`]
] as const;

const variants: readonly (readonly [string, string])[][] = [
  [],
  [["USE_A", "1"]],
  [["USE_B", "1"]],
  [
    ["USE_A", "1"],
    ["USE_B", "1"]
  ],
  [
    ["USE_A", "1"],
    ["MODE", "1"]
  ],
  [
    ["USE_A", "1"],
    ["MODE", "2"]
  ]
];

describe("conditional stage-interface member coverage", () => {
  it.each([
    ...completeDeclarations.map(([name, declarations]) => [name, shader(declarations)]),
    [
      "equal identity macro definitions in if and elif arms",
      shader(struct)
        .replace(
          "#define OWNER owner",
          "#if MODE == 0\n#define OWNER(x) x\n#elif MODE == 1\n#define OWNER(x) x\n#else\n#define OWNER(x) (x)\n#endif"
        )
        .replace("OWNER.uv", "OWNER(owner).uv")
    ],
    [
      "identity macro use inside its elif definition arm",
      shader(struct)
        .replace("#define OWNER owner", "")
        .replace(
          "void frag() { gl_FragColor = vec4(OWNER.uv, 0.0, 1.0); }",
          `#if MODE == 0
#define OWNER(x) x
void frag() { gl_FragColor = vec4(OWNER(owner).uv, 0.0, 1.0); }
#elif MODE == 1
#define OWNER(x) x
void frag() { gl_FragColor = vec4(OWNER(owner).uv, 0.0, 1.0); }
#else
#define OWNER(x) x
void frag() { gl_FragColor = vec4(OWNER(owner).uv, 0.0, 1.0); }
#endif`
        )
    ]
  ])("preserves %s in every compilation path", (_name, source) => {
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).toEqual([]);
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const compiler = new ShaderCompiler();

    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const programs = [
        compiler.generate(analysis.passes[0], target),
        compiler._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          target,
          "",
          pass.contentScopeStarts
        ),
        new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]
      ];
      for (const program of programs) {
        expect(program).toBeDefined();
        if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected compiled pass.");
        for (const variant of variants) {
          const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(variant));
          const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map(variant));
          expect(vertex.match(/(?:varying|out)\s+vec2\s+uv\s*;/g)).toHaveLength(1);
          expect(fragment.match(/(?:varying|in)\s+vec2\s+uv\s*;/g)).toHaveLength(1);
          expect(fragment).toMatch(/vec4\s*\(\s*uv\s*,/);
          expect(fragment).not.toMatch(/\bowner\s*\.\s*uv/);
        }
      }
    }
  });

  it.each([
    ["missing else", `struct Varyings { float common;\n#ifdef USE_A\n${member}\n#endif\n};`],
    [
      "known inner guard with missing outer coverage",
      `#define INNER 1\nstruct Varyings { float common;\n#ifdef USE_A\n#if INNER\n${member}\n#endif\n#endif\n};`
    ],
    [
      "constant elif after an unknown arm with missing member",
      `struct Varyings {\n#if USE_A\nvec2 other;\n#elif 1\n${member}\n#endif\n};`
    ],
    ["missing sibling member", `struct Varyings {\n#ifdef USE_A\n${member}\n#else\nvec2 other;\n#endif\n};`],
    [
      "missing elif member",
      `struct Varyings {\n#if MODE == 0\n${member}\n#elif MODE == 1\nvec2 other;\n#else\n${member}\n#endif\n};`
    ],
    [
      "incomplete nested group",
      `struct Varyings { float common;\n#ifdef USE_A\n#ifdef USE_B\n${member}\n#endif\n#else\n${member}\n#endif\n};`
    ],
    [
      "mutated macro in independent groups",
      `struct Varyings { float common;
#ifdef FLAG
${member}
#endif
#undef FLAG
#define FLAG
#ifndef FLAG
${member}
#endif
};`
    ]
  ])("does not invent coverage for %s", (_name, declarations) => {
    const source = shader(declarations);
    const analysis = ShaderAnalyzer.analyze(source);
    const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
    const compiler = new ShaderCompiler();
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      expect(compiler.generate(analysis.passes[0], target)).toBeUndefined();
      expect(
        compiler._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          target,
          "",
          pass.contentScopeStarts
        )
      ).toBeUndefined();
      expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow();
    }
  });
});
