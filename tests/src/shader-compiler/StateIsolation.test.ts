/**
 * Guards request isolation across parser and backend sessions. These tests compile distinct
 * shaders interleaved and after a throwing compile, asserting each result is unaffected by what
 * was compiled before.
 */
import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ASTNode, ParserObjectPool, TreeNode, parseRuntimeShaderPass } from "@galacean/engine-shader-parser/internal";
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
