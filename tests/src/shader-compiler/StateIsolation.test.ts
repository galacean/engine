/**
 * Guards request isolation across parser and backend sessions. These tests compile distinct
 * shaders interleaved and after a throwing compile, asserting each result is unaffected by what
 * was compiled before.
 */
import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  ASTNode,
  BaseToken,
  EMPTY_BRANCH,
  getParsedShaderPassPayload,
  ParserObjectPool,
  ShaderRange,
  TreeNode,
  parseRuntimeShaderPass
} from "@galacean/engine-shader-parser/internal";
import { describe, expect, it, vi } from "vitest";

const shaderA = `
struct Attributes { vec3 POSITION; };
struct Varyings { vec4 color; };
Varyings vert(Attributes attr) { Varyings o; o.color = vec4(attr.POSITION, 1.0); return o; }
void frag(Varyings i) { gl_FragColor = i.color; }`;

const shaderB = `
struct Attr2 { vec3 POSITION; vec2 UV; };
struct V2 { vec4 a; vec4 b; };
V2 vert(Attr2 attr) { V2 o; o.a = vec4(attr.POSITION, 1.0); o.b = vec4(attr.UV, 0.0, 1.0); return o; }
void frag(V2 i) { gl_FragColor = i.a + i.b; }`;

// Missing entries are rejected before backend generation
const broken = `struct Attributes { vec3 POSITION; }; void notAnEntry() {}`;

const conditionalShader = `Shader "ConditionReuse" {
  SubShader "Default" {
    Pass "p" {
      #if FOO + 1 > 1
        float branchValue = 1.0;
      #endif
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

function compile(c: ShaderCompiler, src: string) {
  return c._parseShaderPass(src, "vert", "frag", ShaderLanguage.GLSLES300, "");
}

describe("compiler state isolation (no cross-shader leak)", () => {
  it("interleaved compiles are deterministic (A, B, A → both A identical)", () => {
    const c = new ShaderCompiler();
    const a1 = compile(c, shaderA);
    compile(c, shaderB);
    const a2 = compile(c, shaderA);
    expect(a2!.vertex).to.equal(a1!.vertex);
    expect(a2!.fragment).to.equal(a1!.fragment);
  });

  it("retains macro-aliased function dependencies across pooled parses", () => {
    const source = `
#define SHADE shade
float shade() { return 1.0; }
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(SHADE()); }`;
    const compiler = new ShaderCompiler();

    const first = compile(compiler, source);
    const second = compile(compiler, source);

    expect(first!.fragment).to.contain("float shade");
    expect(second!.fragment).to.equal(first!.fragment);
  });

  it("reuses ShaderLab lexer objects without mutating retained entry ranges", () => {
    const compiler = new ShaderCompiler();
    const firstPass = compiler._parseShaderSource(conditionalShader).subShaders[0].passes[0];
    const firstVertexStart = { ...firstPass.vertexEntryLocation!.start };
    const sourcePool = (compiler as unknown as { _sourceParserObjectPool: { _tokens: { values: unknown[] } } })
      ._sourceParserObjectPool;
    const tokenHighWater = sourcePool._tokens.values.length;

    compiler._parseShaderSource(conditionalShader);

    expect(tokenHighWater).toBeGreaterThan(0);
    expect(sourcePool._tokens.values).toHaveLength(tokenHighWater);
    expect(firstPass.vertexEntryLocation!.start).toEqual(firstVertexStart);
  });

  it("a degraded compile (missing entries) does not corrupt the next valid compile", () => {
    const c = new ShaderCompiler();
    const clean = compile(c, shaderA);
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    try {
      expect(compile(c, broken)).to.be.undefined;
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
    const after = compile(c, shaderA);
    expect(after!.vertex).to.equal(clean!.vertex);
    expect(after!.fragment).to.equal(clean!.fragment);
  });

  it("does not retain a fixed array size when a pooled node becomes unsized", () => {
    const pool = new ParserObjectPool();
    const parse = (declaration: string) =>
      parseRuntimeShaderPass(
        `${declaration}\nvoid vert() { gl_Position = vec4(0.0); }\nvoid frag() { gl_FragColor = vec4(1.0); }`,
        Object.create(null),
        new Map(),
        undefined,
        pool
      );

    parse("float values[4];");
    const unsized = parse("float values[];");
    const arraySpecifier = findNode(unsized.ir!.program, ASTNode.ArraySpecifier);

    expect(arraySpecifier).toBeDefined();
    expect(arraySpecifier!.size).toBeUndefined();
  });

  it("recomputes branch facts when pooled tokens and nodes are reused", () => {
    const pool = new ParserObjectPool();
    const range = new ShaderRange();
    const position = pool.createPosition(0, 0, 0);
    range.set(position, position);

    const conditionalToken = pool.createToken();
    conditionalToken.set(0, "value", range);
    conditionalToken.branch = Object.freeze([{ name: "USE_VALUE", defined: true }]);
    const conditionalNode = pool.createNode(ASTNode.ExpressionStatement);
    conditionalNode.set(range, [conditionalToken]);
    expect(conditionalNode._branch).toHaveLength(1);

    pool.reset();
    const unconditionalToken = pool.createToken();
    unconditionalToken.set(0, "value", range);
    expect(unconditionalToken.branch).toBe(EMPTY_BRANCH);
    const unconditionalNode = pool.createNode(ASTNode.ExpressionStatement);
    unconditionalNode.set(range, [unconditionalToken]);
    expect(unconditionalNode).toBe(conditionalNode);
    expect(unconditionalNode._branch).toBe(EMPTY_BRANCH);
  });

  it("retains macro branch facts in the lean runtime parser", () => {
    const parsed = parseRuntimeShaderPass(
      `#ifdef USE_HELPER
void helper() {}
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }`,
      Object.create(null),
      new Map()
    );
    const helper = findNodes(parsed.ir!.program, ASTNode.FunctionDefinition).find(
      (fn) => fn.protoType.ident.lexeme === "helper"
    );
    expect(helper?._branch).toHaveLength(1);
    expect(helper?._branch[0].name).toBe("USE_HELPER");
  });

  it("reuses parser-owned preprocessor trees during backend instruction encoding", () => {
    const analysis = ShaderAnalyzer.analyze(conditionalShader);
    const pass = analysis.passes[0];
    const cacheGet = vi.spyOn(getParsedShaderPassPayload(pass).data.preprocessorExpressions, "get");

    const generated = new ShaderCompiler().generate(pass, ShaderLanguage.GLSLES100);

    expect(generated).toBeDefined();
    expect(cacheGet).toHaveBeenCalledWith("FOO + 1 > 1");
  });
});

function findNode<T extends TreeNode>(root: TreeNode, type: new () => T): T | undefined {
  if (root instanceof type) return root;
  for (const child of root.children) {
    if (child instanceof TreeNode) {
      const match = findNode(child, type);
      if (match) return match;
    }
  }
}

function findNodes<T extends TreeNode>(root: TreeNode, type: new () => T, output: T[] = []): T[] {
  if (root instanceof type) output.push(root);
  for (const child of root.children) {
    if (child instanceof TreeNode) findNodes(child, type, output);
  }
  return output;
}
