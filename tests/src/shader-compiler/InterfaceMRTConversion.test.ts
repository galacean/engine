import { ShaderFactory, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { describe, expect, it } from "vitest";

const source = `Shader "mrt-interface-conversion" { SubShader "s" { Pass "p" {
  struct Outputs { layout(location = 0) vec4 color; };
  void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
  Outputs frag() {
    Outputs value;
    value.color = vec4(0.25, 0.0, 0.0, 1.0);
    return value;
  }
  VertexShader = vert;
  FragmentShader = frag;
} } }`;

describe("MRT interface backend conversion", () => {
  for (const [name, shader] of [
    ["MRT structure return", source],
    [
      "unused caller of the fragment entry",
      `Shader "unused-fragment-caller" { SubShader "s" { Pass "p" {
        void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
        void frag() { gl_FragData[0] = vec4(0.25, 0.0, 0.0, 1.0); }
        void unused() { frag(); }
        VertexShader = vert; FragmentShader = frag;
      } } }`
    ],
    [
      "helper writing a fragment output",
      `Shader "helper-fragment-output" { SubShader "s" { Pass "p" {
        void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
        void writeColor() { gl_FragData[0] = vec4(0.25, 0.0, 0.0, 1.0); }
        void frag() { writeColor(); }
        VertexShader = vert; FragmentShader = frag;
      } } }`
    ],
    [
      "void entry with conditional global structure input",
      `Shader "conditional-global-output-conversion" { SubShader "s" { Pass "p" {
        #define USE_INPUT 1
        struct Varyings { float value; };
        #if USE_INPUT
        Varyings sharedValue;
        #endif
        Varyings vert() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0;
          Varyings v; v.value = 0.25; return v;
        }
        void frag() {
          #if USE_INPUT
          gl_FragData[0] = vec4(sharedValue.value, 0.0, 0.0, 1.0);
          #else
          gl_FragData[0] = vec4(0.25, 0.0, 0.0, 1.0);
          #endif
        }
        VertexShader = vert; FragmentShader = frag;
      } } }`
    ],
    [
      "void entry with global structure input",
      `Shader "global-output-conversion" { SubShader "s" { Pass "p" {
        struct Varyings { float value; };
        Varyings sharedValue;
        Varyings vert() {
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0;
          Varyings v; v.value = 0.25; return v;
        }
        void frag() { gl_FragData[0] = vec4(sharedValue.value, 0.0, 0.0, 1.0); }
        VertexShader = vert; FragmentShader = frag;
      } } }`
    ],
    [
      "void entry with structure parameter",
      `Shader "direct-output-conversion" { SubShader "s" { Pass "p" {
      struct Varyings { float value; };
      Varyings vert() {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0;
        Varyings v; v.value = 0.25; return v;
      }
      void frag(Varyings v) { gl_FragData[0] = vec4(v.value, 0.0, 0.0, 1.0); }
      VertexShader = vert; FragmentShader = frag;
    } } }`
    ]
  ]) {
    for (const precompiled of [false, true]) {
      it(`keeps ${name} output writes at the stage boundary when loaded on WebGL2, precompiled=${precompiled}`, () => {
        const compiler = new ShaderCompiler();
        const pass = compiler._parseShaderSource(shader).subShaders[0].passes[0];
        const compiled = precompiled
          ? new ShaderPrecompiler().precompile(shader, ShaderLanguage.GLSLES100).subShaders[0].passes[0]
          : compiler._parseShaderPass(
              pass.contents,
              pass.vertexEntry,
              pass.fragmentEntry,
              ShaderLanguage.GLSLES100,
              undefined,
              pass.contentScopeStarts
            )!;
        if ("isUsePass" in compiled && compiled.isUsePass) throw new Error("Expected compiled pass");
        const gl = document.createElement("canvas").getContext("webgl2")!;
        expect(gl).not.toBeNull();
        const program = gl.createProgram()!;
        const shaders: WebGLShader[] = [];
        try {
          for (const [kind, instructions] of [
            [gl.VERTEX_SHADER, compiled.vertexShaderInstructions],
            [gl.FRAGMENT_SHADER, compiled.fragmentShaderInstructions]
          ] as const) {
            const shader = gl.createShader(kind)!;
            shaders.push(shader);
            const generated = ShaderMacroProcessor.evaluate(instructions!, new Map());
            const converted = ShaderFactory.convertTo300(generated, kind === gl.FRAGMENT_SHADER);
            gl.shaderSource(shader, `#version 300 es\nprecision highp float;\n${converted}`);
            gl.compileShader(shader);
            expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
            gl.attachShader(program, shader);
          }
          gl.linkProgram(program);
          expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
          gl.useProgram(program);
          gl.viewport(0, 0, 1, 1);
          gl.drawArrays(gl.POINTS, 0, 1);
          const pixel = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          expect(Array.from(pixel)).toEqual([64, 0, 0, 255]);
        } finally {
          gl.deleteProgram(program);
          for (const shader of shaders) gl.deleteShader(shader);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      });
    }
  }
});
