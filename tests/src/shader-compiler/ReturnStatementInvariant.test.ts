import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

/**
 * Codegen invariant lock: `FunctionDefinition.returnStatement` may only be recorded when the
 * enclosing function is non-void AND has a value return. The fragment-entry rewrite path
 * (`GLESVisitor._fragmentMain` → `visitJumpStatement`) reads it as an Expression at
 * `children[1]`; a bare `return;` inside a `void` fragment has a `;` token there, not an
 * expression, and the rewrite would emit malformed GLSL (`gl_FragColor = ;`) if the invariant
 * were relaxed to record void returns as well (as B2a briefly did).
 *
 * The built-in shaders never author `void frag(){ if (...) return; ... }`, so precompile /
 * e2e didn't catch it — this test covers the user-authored case directly.
 */
const shaderCompiler = new ShaderCompiler();

const SHADER_SOURCE = `Shader "return-invariant" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;
      float u_flag;
      struct Attributes { vec3 POSITION; };

      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() {
        if (u_flag > 0.5) return;
        gl_FragColor = vec4(1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

describe("ReturnStatementInvariant", () => {
  it("void frag with a bare `return;` emits a well-formed `gl_FragColor` block", () => {
    const shaderSource = shaderCompiler._parseShaderSource(SHADER_SOURCE);
    const passSource = shaderSource.subShaders[0].passes[0];

    let programSource: ReturnType<ShaderCompiler["_parseShaderPass"]>;
    expect(() => {
      programSource = shaderCompiler._parseShaderPass(
        passSource.contents,
        passSource.vertexEntry,
        passSource.fragmentEntry,
        0 /* GLSLES100 */
      );
    }).to.not.throw();

    expect(programSource, "codegen must produce a program for a legal shader").to.be.ok;
    const { vertex, fragment } = programSource!;

    // The bare `return;` in `void frag()` must fall through to the default JumpStatement path
    // (a plain `return;`). It must NOT be rewritten as a `gl_FragColor = <expr>;` assignment —
    // there's no expression to assign, so the rewrite would emit a malformed statement.
    expect(fragment).to.match(/\breturn\s*;/);
    expect(fragment).to.not.match(/gl_FragColor\s*=\s*;/);
    expect(fragment).to.not.match(/gl_FragColor\s*=\s*[)\]}]/); // no orphan closer / garbage RHS
    expect(fragment).to.not.include("undefined");

    // Sanity: the legitimate `gl_FragColor = vec4(...);` assignment still made it through.
    expect(fragment).to.match(/gl_FragColor\s*=\s*vec4/);

    // Sanity: vertex was also emitted (compilation didn't half-fail).
    expect(vertex).to.be.a("string").and.not.empty;
  });
});
