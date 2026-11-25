import { Logger, Shader, ShaderLanguage, WebGLEngine } from "@galacean/engine";
import { DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { describe, expect, it } from "vitest";

Logger.enable();

const OIL_PAINT_PALETTE_SHADER = `Shader "NextGallery/OilPaint/PaletteArrayRepro" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = v;
      FragmentShader = f;
      struct In { vec3 POSITION; };
      struct Out { float unused; };
      Out v(In p) { Out o; gl_Position = vec4(p.POSITION, 1.0); return o; }
      const vec3 palette[2] = vec3[2](vec3(1.0), vec3(0.0));
      void f(Out o) { gl_FragColor = vec4(palette[1], 1.0); }
    }
  }
}`;

const TENNIS_PALETTE_SHADER = `Shader "NextGallery/Tennis/InkPaletteRepro" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;
      struct Attributes { vec3 POSITION; };
      struct Varyings { float band; };
      Varyings vert(Attributes a) {
        Varyings o;
        o.band = a.POSITION.x;
        gl_Position = vec4(a.POSITION, 1.0);
        return o;
      }
      const vec3 INK[8] = vec3[8](
        vec3(1.0, 0.84, 0.0), vec3(1.0, 0.45, 0.02), vec3(1.0, 0.16, 0.42), vec3(0.62, 0.14, 0.8),
        vec3(0.14, 0.28, 0.95), vec3(0.0, 0.76, 0.8), vec3(0.4, 0.85, 0.14), vec3(1.0, 0.95, 0.82)
      );
      vec3 ink(float n) { return INK[int(mod(n, 8.0))]; }
      void frag(Varyings i) { gl_FragColor = vec4(ink(i.band), 1.0); }
    }
  }
}`;

const INVARIANT_POSITION_SHADER = `Shader "NextGallery/Starry/InvariantPositionRepro" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;
      invariant gl_Position;
      struct Attributes { vec3 POSITION; };
      struct Varyings { float red; };
      Varyings vert(Attributes input) {
        Varyings output;
        output.red = 1.0;
        gl_Position = vec4(input.POSITION, 1.0);
        return output;
      }
      void frag(Varyings input) { gl_FragColor = vec4(input.red, 0.0, 0.0, 1.0); }
    }
  }
}`;

const GLOBAL_ARRAY_VARIANTS = [
  {
    name: "oil-paint const vec3 palette[2]",
    source: OIL_PAINT_PALETTE_SHADER,
    macroSets: [[]]
  },
  {
    name: "tennis const vec3 INK[8] with dynamic index",
    source: TENNIS_PALETTE_SHADER,
    macroSets: [[]]
  },
  {
    name: "unsized global array with sized and unsized array constructors",
    source: `Shader "GlobalDeclarations/UnsizedArray" {
      SubShader "Default" {
        Pass "Forward" {
          VertexShader = vert;
          FragmentShader = frag;
          const vec3 a[] = vec3[2](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));
          const vec3 b[] = vec3[](vec3(0.0, 0.0, 1.0), vec3(1.0, 1.0, 0.0));
          void vert() { gl_Position = vec4(0.0); }
          void frag() { gl_FragColor = vec4(a[0] + b[1], 1.0); }
        }
      }
    }`,
    macroSets: [[]]
  },
  {
    name: "type-side array specifier and comma-separated initialized global arrays",
    source: `Shader "GlobalDeclarations/TypeSideAndList" {
      SubShader "Default" {
        Pass "Forward" {
          VertexShader = vert;
          FragmentShader = frag;
          const vec3[2] primaryPalette = vec3[2](vec3(1.0), vec3(0.5));
          const vec3 secondaryA[2] = vec3[2](vec3(0.2), vec3(0.4)), secondaryB[2] = vec3[2](vec3(0.6), vec3(0.8));
          void vert() { gl_Position = vec4(0.0); }
          void frag() { gl_FragColor = vec4(primaryPalette[0] + secondaryA[1] + secondaryB[0], 1.0); }
        }
      }
    }`,
    macroSets: [[]]
  },
  {
    name: "macro-guarded initialized global array",
    source: `Shader "GlobalDeclarations/MacroArray" {
      SubShader "Default" {
        Pass "Forward" {
          VertexShader = vert;
          FragmentShader = frag;
          #ifdef USE_PALETTE
            const vec3 palette[2] = vec3[2](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));
          #endif
          void vert() { gl_Position = vec4(0.0); }
          void frag() {
            #ifdef USE_PALETTE
              gl_FragColor = vec4(palette[1], 1.0);
            #else
              gl_FragColor = vec4(1.0);
            #endif
          }
        }
      }
    }`,
    macroSets: [[], ["USE_PALETTE"]]
  }
];

const INVARIANT_VARIANTS = [
  {
    name: "starry-nightrider invariant gl_Position",
    source: INVARIANT_POSITION_SHADER,
    macroSets: [[]]
  },
  {
    name: "multiple invariant builtin declarations",
    source: `Shader "GlobalDeclarations/InvariantMultiple" {
      SubShader "Default" {
        Pass "Forward" {
          VertexShader = vert;
          FragmentShader = frag;
          invariant gl_Position;
          invariant gl_PointSize;
          void vert() {
            gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
            gl_PointSize = 1.0;
          }
          void frag() { gl_FragColor = vec4(1.0); }
        }
      }
    }`,
    macroSets: [[]]
  },
  {
    name: "macro-guarded invariant gl_Position",
    source: `Shader "GlobalDeclarations/MacroInvariant" {
      SubShader "Default" {
        Pass "Forward" {
          VertexShader = vert;
          FragmentShader = frag;
          #ifdef USE_INVARIANT
            invariant gl_Position;
          #endif
          void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }
          void frag() { gl_FragColor = vec4(1.0); }
        }
      }
    }`,
    macroSets: [[], ["USE_INVARIANT"]]
  }
];

describe("global initialized arrays and invariant declarations", () => {
  for (const mode of ["runtime", "precompiled"] as const) {
    it.each([...GLOBAL_ARRAY_VARIANTS, ...INVARIANT_VARIANTS])(
      `${mode} WebGL2 compilation: $name`,
      async ({ source, macroSets }) => {
        const previousCompiler = Shader._shaderCompiler;
        const compiler = new ShaderCompiler();
        const engine = await WebGLEngine.create({
          canvas: document.createElement("canvas"),
          shaderCompiler: compiler
        });
        let shader: Shader | undefined;
        try {
          Shader._shaderCompiler = compiler;
          shader =
            mode === "runtime"
              ? Shader.create(source, ShaderLanguage.GLSLES300)
              : Shader._createFromPrecompiled(
                  JSON.parse(JSON.stringify(new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES300)))
                );
          expect(shader).toBeDefined();
          for (const macros of macroSets) {
            expect(shader!.compileVariant(engine, macros), `macros: ${macros.join(", ")}`).toBe(true);
          }
        } finally {
          shader?.destroy();
          engine.destroy();
          Shader._shaderCompiler = previousCompiler;
        }
      }
    );
  }

  it("emits invariant gl_Position only in the vertex shader in both runtime and analyzer-backed generation", () => {
    const compiler = new ShaderCompiler();
    const parsedSource = compiler._parseShaderSource(INVARIANT_POSITION_SHADER);
    const passSource = parsedSource.subShaders[0].passes[0];
    const runtimeProgram = compiler._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      ShaderLanguage.GLSLES300
    );
    expect(runtimeProgram).toBeDefined();
    expect(runtimeProgram!.vertex).toContain("invariant gl_Position");
    expect(runtimeProgram!.fragment).not.toContain("invariant");

    const analysis = ShaderAnalyzer.analyze(INVARIANT_POSITION_SHADER);
    expect(analysis.diagnostics).toEqual([]);
    const generated = compiler.generate(analysis.passes[0], ShaderLanguage.GLSLES300);
    expect(generated).toBeDefined();
    expect(generated!.vertex).toContain("invariant gl_Position");
    expect(generated!.fragment).not.toContain("invariant");
  });

  it("analyzes valid global const arrays and invariant gl_Position without diagnostics", () => {
    for (const { source } of [...GLOBAL_ARRAY_VARIANTS, ...INVARIANT_VARIANTS]) {
      const result = ShaderAnalyzer.analyze(source);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it("validates array constructor element count, element type, constness, and bounds", () => {
    const wrongCount = ShaderAnalyzer.analyze(`Shader "GlobalDeclarations/WrongCount" {
      SubShader "Default" { Pass "Forward" {
        VertexShader = vert; FragmentShader = frag;
        const vec3 palette[2] = vec3[2](vec3(1.0));
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(palette[0], 1.0); }
      } }
    }`);
    expect(wrongCount.diagnostics.map((d) => d.code)).toContain(DiagnosticType.ConstructorArgCount);

    const wrongType = ShaderAnalyzer.analyze(`Shader "GlobalDeclarations/WrongType" {
      SubShader "Default" { Pass "Forward" {
        VertexShader = vert; FragmentShader = frag;
        const vec3 palette[2] = vec3[2](vec3(1.0), vec2(0.0));
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(palette[0], 1.0); }
      } }
    }`);
    expect(wrongType.diagnostics.map((d) => d.code)).toContain(DiagnosticType.ConstructorArgType);

    const nonConst = ShaderAnalyzer.analyze(`Shader "GlobalDeclarations/NonConst" {
      SubShader "Default" { Pass "Forward" {
        VertexShader = vert; FragmentShader = frag;
        vec3 u_color;
        const vec3 palette[2] = vec3[2](u_color, vec3(0.0));
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(palette[0], 1.0); }
      } }
    }`);
    expect(nonConst.diagnostics.map((d) => d.code)).toContain(DiagnosticType.NonConstInitializer);

    const outOfBounds = ShaderAnalyzer.analyze(`Shader "GlobalDeclarations/OutOfBounds" {
      SubShader "Default" { Pass "Forward" {
        VertexShader = vert; FragmentShader = frag;
        const vec3 palette[2] = vec3[2](vec3(1.0), vec3(0.0));
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(palette[2], 1.0); }
      } }
    }`);
    expect(outOfBounds.diagnostics.map((d) => d.code)).toContain(DiagnosticType.IndexOutOfBounds);
  });

  it("rejects non-invariant standalone qualifier declarations", () => {
    const result = ShaderAnalyzer.analyze(`Shader "GlobalDeclarations/InvalidStandaloneQualifier" {
      SubShader "Default" { Pass "Forward" {
        VertexShader = vert; FragmentShader = frag;
        const foo;
        void vert() { gl_Position = vec4(0.0); }
        void frag() { gl_FragColor = vec4(1.0); }
      } }
    }`);
    expect(result.diagnostics.map((d) => d.code)).toContain(DiagnosticType.SyntaxError);
  });
});
