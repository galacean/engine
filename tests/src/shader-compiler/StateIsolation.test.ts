/**
 * Guards the shared-mutable-state risk: the compiler reuses a singleton parser + VisitorContext +
 * static scratch + the `processingPassText` global, all reset per compile. A missed reset (or a
 * reset skipped by an early-return / throw) leaks state across shaders. These tests compile
 * distinct shaders interleaved and after a throwing compile, asserting each result is unaffected
 * by what was compiled before.
 */
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

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

// Missing entries take the soft-return path; compiling it must not leak visitor state.
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
    const brokenOut = compile(c, broken);
    // Codegen keeps the pipeline shape while emitting empty stage sources.
    expect(brokenOut!.vertex).to.equal("");
    expect(brokenOut!.fragment).to.equal("");
    const after = compile(c, shaderA);
    expect(after!.vertex).to.equal(clean!.vertex);
    expect(after!.fragment).to.equal(clean!.fragment);
  });
});
