import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { describe, expect, it } from "vitest";

const positionCollision = `Shader "Repro/PositionNameCollision" {
  Editor {}
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
      };
      struct Varyings {
        vec4 position;
      };

      mat4 renderer_MVPMat;

      Varyings vert(Attributes attributes) {
        Varyings varyings;
        vec3 position = attributes.POSITION;
        varyings.position = renderer_MVPMat * vec4(position, 1.0);
        gl_Position = varyings.position;
        return varyings;
      }

      void frag(Varyings varyings) {
        gl_FragColor = vec4(0.0, 0.5, 1.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

function valueShader(body: string, helper = ""): string {
  return `Shader "interface-values" { SubShader "s" { Pass "p" {
    struct Varyings { float a; };
    ${helper}
    Varyings vert() {
      gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
      gl_PointSize = 1.0;
      ${body}
    }
    void frag(Varyings v) { gl_FragColor = vec4(v.a, 0.0, 0.0, 1.0); }
    VertexShader = vert;
    FragmentShader = frag;
  } } }`;
}

const cases: {
  name: string;
  source: string;
  pixel: number[];
  macros?: Map<string, string>;
  targets?: ShaderLanguage[];
  paths?: CompilationPath[];
}[] = [
  {
    name: "reserved interface type names are legalized",
    source: valueShader("Varyings v; v.a = 0.25; return v;").replaceAll("Varyings", "common"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "reserved entry names are legalized",
    source: valueShader("Varyings v; v.a = 0.25; return v;")
      .replace("Varyings vert()", "Varyings common()")
      .replace("VertexShader = vert", "VertexShader = common"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "constructor values reach the fragment interface",
    source: valueShader("Varyings v = Varyings(0.25); return v;"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "members of function results retain input dependencies",
    source: valueShader(
      "Varyings v; v.a = 0.25; return v;",
      "Varyings identity(Varyings value) { return value; }"
    ).replace("vec4(v.a,", "vec4(identity(v).a,"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "unused array fields do not invalidate GLES100 interface returns",
    source: valueShader("Varyings v; v.a = 0.25; return v;")
      .replace("struct Varyings", "const int count = 2; struct Varyings")
      .replace("float a;", "float a; float unused[count];"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "unused nested array fields do not invalidate GLES100 interface returns",
    source: valueShader("Varyings v; v.a = 0.25; return v;")
      .replace("struct Varyings", "struct Detail { float unused[2]; }; struct Varyings")
      .replace("float a;", "float a; Detail detail;"),
    pixel: [64, 0, 0, 255],
    // The authoring analyzer rejects nested IO types; runtime compilation historically accepts unused fields.
    paths: ["runtime", "precompiled"]
  },
  {
    name: "a variant with no interface members still has a legal internal type",
    source: valueShader("Varyings v; return v;")
      .replace("float a;", "\n#ifdef HAS_A\nfloat a;\n#endif\n")
      .replace("vec4(v.a,", "vec4(0.25,"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "reserved source variable names retain independent interface values",
    source: valueShader(`Varyings common;
      Varyings partition;
      Varyings active;
      Varyings resource;
      Varyings gl_local;
      common.a = 0.03125;
      partition.a = 0.03125;
      active.a = 0.0625;
      resource.a = 0.0625;
      gl_local.a = common.a + partition.a + active.a + resource.a + 0.0625;
      return gl_local;`),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "issue 3160 original position collision",
    source: positionCollision,
    pixel: [0, 128, 255, 255]
  },
  {
    name: "issue 3160 renamed-local control",
    source: positionCollision
      .replace("vec3 position = attributes.POSITION;", "vec3 localPosition = attributes.POSITION;")
      .replace("vec4(position, 1.0)", "vec4(localPosition, 1.0)"),
    pixel: [0, 128, 255, 255]
  },
  {
    name: "same-type local shadowing does not redirect interface writes",
    source: valueShader(`Varyings v;
      v.a = 0.0;
      float a = 0.25;
      v.a = 0.5;
      v.a = a;
      return v;`),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "separate structure instances retain separate values",
    source: valueShader(`Varyings x;
      Varyings y;
      x.a = 0.25;
      y.a = 1.0;
      return x;`),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "input parameter writes do not mutate the caller",
    source: valueShader(
      `Varyings x;
      x.a = 0.25;
      overwrite(x);
      return x;`,
      "void overwrite(Varyings value) { value.a = 1.0; }"
    ),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "generated interface names do not collide with source identifiers",
    source: valueShader(
      `Varyings interface_value;
      float io_a_1 = 0.125;
      interface_value.a = io_a + io_a_1;
      return interface_value;`,
      `const float io_a = 0.125;
      float read_Varyings() { return 1.0; }
      float write_Varyings(Varyings value) { return value.a; }`
    ).replace("vec4(v.a, 0.0, 0.0, 1.0)", "vec4(write_Varyings(v) * read_Varyings(), 0.0, 0.0, 1.0)"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "macro formal parameters do not inherit renamed local bindings",
    source: valueShader(`Varyings output;
      Varyings other;
      output.a = 0.75;
      other.a = 0.25;
      #define GET(output) (output)
      output.a = GET(other).a;
      return output;`),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "global reserved identifiers remain bound through object macros",
    source: valueShader("Varyings x; x.a = 0.25; return x;", "Varyings output;\n#define OWNER output")
      .replace("void frag(Varyings v)", "void frag()")
      .replace("vec4(v.a,", "vec4(OWNER.a,"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "inout parameters preserve writes to the selected instance",
    source: valueShader(
      `Varyings x;
      Varyings y;
      x.a = 0.0;
      y.a = 1.0;
      overwrite(x);
      return x;`,
      "void overwrite(inout Varyings value) { value.a = 0.25; }"
    ),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "helper early returns preserve returned structures",
    source: valueShader(
      "return choose(true);",
      `Varyings choose(bool first) {
        Varyings x;
        x.a = 0.25;
        if (first) return x;
        x.a = 1.0;
        return x;
      }`
    ),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "global fragment interface variables receive vertex outputs",
    source: valueShader("Varyings x; x.a = 0.25; return x;", "Varyings owner;\n#define OWNER owner")
      .replace("void frag(Varyings v)", "void frag()")
      .replace("vec4(v.a,", "vec4(OWNER.a,"),
    pixel: [64, 0, 0, 255]
  },
  {
    name: "array members retain per-element values at stage boundaries",
    source: valueShader("Varyings x; x.a[0] = 0.25; x.a[1] = 0.75; return x;")
      .replace("float a;", "float a[2];")
      .replace("vec4(v.a,", "vec4(v.a[0],"),
    pixel: [64, 0, 0, 255],
    // GLSL ES 1.00 forbids function returns of structures containing arrays.
    targets: [ShaderLanguage.GLSLES300]
  },
  ...[false, true].map((enabled) => ({
    name: `conditional global fragment interface variant ${enabled}`,
    source: valueShader(
      "Varyings x; x.a = 0.25; return x;",
      "\n#ifdef USE_A\nVaryings ownerA;\n#else\nVaryings ownerB;\n#endif\n"
    )
      .replace("void frag(Varyings v)", "void frag()")
      .replace(
        "gl_FragColor = vec4(v.a, 0.0, 0.0, 1.0);",
        "\n#ifdef USE_A\ngl_FragColor = vec4(ownerA.a, 0.0, 0.0, 1.0);\n#else\ngl_FragColor = vec4(ownerB.a, 0.0, 0.0, 1.0);\n#endif\n"
      ),
    macros: enabled ? new Map([["USE_A", "1"]]) : new Map<string, string>(),
    pixel: [64, 0, 0, 255]
  })),
  ...[false, true].map((enabled) => ({
    name: `conditional interface member variant ${enabled}`,
    source: valueShader(`Varyings x;
      x.a = 0.25;
      return x;`).replace(
      "struct Varyings { float a; };",
      "struct Varyings {\n#ifdef FIELD\nfloat a;\n#else\nfloat a;\n#endif\n};"
    ),
    macros: enabled ? new Map([["FIELD", "1"]]) : new Map<string, string>(),
    pixel: [64, 0, 0, 255]
  })),
  ...[false, true].map((enabled) => ({
    name: `member declaration retains macro state before ${enabled ? "undef" : "define"}`,
    source: valueShader(`Varyings x;
      x.a = 0.25;
      ${enabled ? "x.b = 0.75;" : ""}
      return x;`).replace(
      "struct Varyings { float a; };",
      `${enabled ? "#define FIELD 1" : "#undef FIELD"}
      struct Varyings {
        float a;
        #ifdef FIELD
        float b;
        #endif
      };
      ${enabled ? "#undef FIELD" : "#define FIELD 1"}`
    ),
    pixel: [64, 0, 0, 255]
  }))
];

type CompilationPath = "runtime" | "analyzed" | "precompiled";

function compile(
  source: string,
  target: ShaderLanguage,
  path: CompilationPath,
  compiler = new ShaderCompiler(),
  precompiler = new ShaderPrecompiler()
) {
  if (path === "precompiled") {
    const pass = precompiler.precompile(source, target).subShaders[0].passes[0];
    if (pass.isUsePass) throw new Error("Expected compiled pass");
    return pass;
  }
  if (path === "analyzed") {
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).toEqual([]);
    const program = compiler.generate(analysis.passes[0], target);
    expect(program).toBeDefined();
    return program!;
  }
  const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
  const program = compiler._parseShaderPass(
    pass.contents,
    pass.vertexEntry,
    pass.fragmentEntry,
    target,
    undefined,
    pass.contentScopeStarts
  );
  expect(program).toBeDefined();
  return program!;
}

describe.runIf(typeof document !== "undefined")("interface value semantics on WebGL", () => {
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    for (const path of ["runtime", "analyzed", "precompiled"] as const) {
      it.each(
        cases.filter(
          (fixture) =>
            (!fixture.targets || fixture.targets.includes(target)) && (!fixture.paths || fixture.paths.includes(path))
        )
      )(`${path}, target ${target}: $name`, ({ source, pixel: expected, macros = new Map() }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const gl = canvas.getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl", {
          antialias: false
        }) as WebGLRenderingContext | WebGL2RenderingContext;
        expect(gl).not.toBeNull();
        const shaders: WebGLShader[] = [];
        const linked = gl.createProgram()!;
        let vertices: WebGLBuffer | null = null;
        try {
          const program = compile(source, target, path);
          for (const [kind, instructions] of [
            [gl.VERTEX_SHADER, program.vertexShaderInstructions!],
            [gl.FRAGMENT_SHADER, program.fragmentShaderInstructions!]
          ] as const) {
            const shader = gl.createShader(kind)!;
            shaders.push(shader);
            const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
            const generated = ShaderMacroProcessor.evaluate(instructions, macros);
            gl.shaderSource(shader, `${version}precision highp float;\n${generated}`);
            gl.compileShader(shader);
            expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
            gl.attachShader(linked, shader);
          }
          gl.linkProgram(linked);
          expect(gl.getProgramParameter(linked, gl.LINK_STATUS), gl.getProgramInfoLog(linked) ?? "").toBe(true);
          gl.useProgram(linked);
          const position = gl.getAttribLocation(linked, "POSITION");
          if (position >= 0) {
            vertices = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
          }
          const mvp = gl.getUniformLocation(linked, "renderer_MVPMat");
          if (mvp !== null) gl.uniformMatrix4fv(mvp, false, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
          gl.viewport(0, 0, 1, 1);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(position >= 0 ? gl.TRIANGLES : gl.POINTS, 0, position >= 0 ? 3 : 1);
          const pixel = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          expect(gl.getError()).toBe(gl.NO_ERROR);
          for (let channel = 0; channel < 4; channel++) {
            expect(
              Math.abs(pixel[channel] - expected[channel]),
              `RGBA ${Array.from(pixel)}, channel ${channel}`
            ).toBeLessThanOrEqual(1);
          }
        } finally {
          for (const shader of shaders) gl.deleteShader(shader);
          gl.deleteBuffer(vertices);
          gl.deleteProgram(linked);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      });
      it(`${path}, target ${target}: repeated compilation does not retain name allocations`, () => {
        const compiler = new ShaderCompiler();
        const precompiler = new ShaderPrecompiler();
        const source = cases.find(
          (fixture) => fixture.name === "generated interface names do not collide with source identifiers"
        )!.source;
        const first = compile(source, target, path, compiler, precompiler);
        const expected = JSON.stringify([first.vertexShaderInstructions, first.fragmentShaderInstructions]);
        compile(positionCollision, target, path, compiler, precompiler);
        const repeated = compile(source, target, path, compiler, precompiler);
        expect(JSON.stringify([repeated.vertexShaderInstructions, repeated.fragmentShaderInstructions])).toBe(expected);
      });
    }
  }
});
