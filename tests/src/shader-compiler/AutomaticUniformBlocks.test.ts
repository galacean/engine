import {
  finalizeShaderUniforms,
  UnresolvedUniformArrayLength,
  type IShaderUniformSelection
} from "@galacean/engine-design";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderLanguage } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";

function shaderSource(declarations: string, expression: string): string {
  return `Shader "Tests/AutomaticUniforms" { SubShader "s" { Pass "p" {
    ${declarations}
    void vert() { gl_Position = vec4(0.0); }
    void frag() { gl_FragColor = ${expression}; }
    VertexShader = vert;
    FragmentShader = frag;
  } } }`;
}

function variant(
  declarations: string,
  expression: string,
  macros = new Map<string, string>(),
  maxBlockBytes = 16384,
  resolveConstant?: (name: string) => number | undefined
) {
  const pass = new ShaderPrecompiler().precompile(shaderSource(declarations, expression)).subShaders[0].passes[0];
  const vertexSites: IShaderUniformSelection[] = [];
  const fragmentSites: IShaderUniformSelection[] = [];
  const vertex = ShaderMacroProcessor.evaluate(
    pass.vertexShaderInstructions!,
    macros,
    pass.uniformPlan!.vertex,
    vertexSites
  );
  const fragment = ShaderMacroProcessor.evaluate(
    pass.fragmentShaderInstructions!,
    macros,
    pass.uniformPlan!.fragment,
    fragmentSites
  );
  for (const selected of fragmentSites) expect(fragment.slice(selected.start, selected.end)).toBe(selected.text);
  const result = finalizeShaderUniforms(vertex, fragment, vertexSites, fragmentSites, {
    maxBlockBytes,
    maxBindings: 24,
    resolveConstant
  });
  return { ...result, original: { vertexSource: vertex, fragmentSource: fragment } };
}

function withLinkedProgram(
  result: { vertexSource: string; fragmentSource: string },
  check: (gl: WebGL2RenderingContext, program: WebGLProgram) => void
): void {
  const gl = document.createElement("canvas").getContext("webgl2")!;
  const program = gl.createProgram()!;
  const shaders = [];
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, result.vertexSource],
      [gl.FRAGMENT_SHADER, result.fragmentSource]
    ] as const) {
      const shader = gl.createShader(kind)!;
      shaders.push(shader);
      gl.shaderSource(shader, "#version 300 es\nprecision highp float;\nprecision highp int;\n" + source);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
    check(gl, program);
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

describe("compiler-selected automatic uniform blocks", () => {
  it("reflects the selected members of nested numeric struct arrays at driver byte offsets", () => {
    const declarations = `
      struct Basis { mat3 frame; };
      struct Item { vec3 tint; float gain; Basis basis;
      #ifdef USE_WEIGHTS
        vec2 weights[2];
      #endif
      };
      const int ITEM_COUNT = 2;
      Item items[ITEM_COUNT];`;
    for (const enabled of [false, true]) {
      const result = variant(
        declarations,
        "vec4(items[1].basis.frame[1].x * items[0].gain + items[1].tint.x)",
        enabled ? new Map([["USE_WEIGHTS", ""]]) : new Map()
      );
      expect(result.looseUniforms).toHaveLength(0);
      const [block] = result.uniformBlocks;
      expect(block.byteLength).toBe(enabled ? 192 : 128);
      expect(block.members.some((m) => m.name === "items[1].weights")).toBe(enabled);
      withLinkedProgram(result, (gl, program) => {
        const index = gl.getUniformBlockIndex(program, block.bindingName!);
        expect(gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE)).toBe(block.byteLength);
        const active: Uint32Array = gl.getActiveUniformBlockParameter(
          program,
          index,
          gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES
        );
        const offsets = gl.getActiveUniforms(program, Array.from(active), gl.UNIFORM_OFFSET);
        for (let i = 0; i < active.length; i++) {
          const name = gl
            .getActiveUniform(program, active[i])!
            .name.replace(block.bindingName + ".", "")
            .replace(/\[0\]$/, "");
          expect(block.members.find((item) => item.name === name)?.offset, name).toBe(offsets[i]);
        }
      });
    }
  });

  it("keeps mixed sampler structs legal and reflects their ordinary and sampler leaves, including array elements", () => {
    const result = variant(
      `
      struct Surface { vec4 color; sampler2D image; };
      const int COUNT = 1 + 1;
      Surface surfaces[COUNT];
      float brightness;`,
      "brightness * (surfaces[0].color * texture2D(surfaces[1].image, vec2(0.5)) + surfaces[1].color * texture2D(surfaces[0].image, vec2(0.5)))"
    );
    expect(result.looseUniforms.map((field) => [field.name, field.type])).toEqual([
      ["surfaces[0].color", "vec4"],
      ["surfaces[0].image", "sampler2D"],
      ["surfaces[1].color", "vec4"],
      ["surfaces[1].image", "sampler2D"]
    ]);
    expect(result.uniformBlocks[0].members[0].name).toBe("brightness");
    withLinkedProgram(result, (gl, program) => {
      for (const field of result.looseUniforms)
        expect(gl.getUniformLocation(program, field.name), field.name).not.toBeNull();
      expect(gl.getUniformLocation(program, "brightness")).toBeNull();
    });
  });

  it("resolves macro and constant array lengths, preserving an array larger than the device block limit", () => {
    const result = variant(
      "const int COUNT = BASE + 1; float samples[COUNT * 2];",
      "vec4(samples[5])",
      new Map([["BASE", "2"]]),
      64
    );
    expect(result.uniformBlocks).toHaveLength(0);
    expect(result.looseUniforms).toEqual([{ name: "samples", type: "float", arrayLength: 6 }]);
    withLinkedProgram(result, (gl, program) => expect(gl.getUniformLocation(program, "samples[5]")).not.toBeNull());
  });

  it.each(["int(ceil(1.5))", "clamp(4, 1, max(1, 2))", "int(vec3(2.0).x)", "int(ceil(scale))", "int(mat3(2.0)[0][0])"])(
    "packs a GLSL constant-expression array with length %s",
    (expression) => {
      const result = variant(
        `const float scale = 1.5; const int size = ${expression}; vec4 samples[size];`,
        "samples[1]"
      );
      expect(result.uniformBlocks[0].members[0].arrayLength).toBe(2);
      withLinkedProgram(result, (gl, program) => {
        const block = gl.getUniformBlockIndex(program, result.uniformBlocks[0].bindingName!);
        expect(gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_DATA_SIZE)).toBe(32);
      });
    }
  );

  it("preserves the original numeric array upload when its legal GLSL expression cannot be constant-folded", () => {
    const result = variant(
      "const int size = int(length(cross(vec3(2,0,0),vec3(0,2,0)))); vec4 samples[size];",
      "samples[3]"
    );
    expect(result.uniformBlocks).toHaveLength(0);
    expect(result.looseUniforms).toEqual([{ name: "samples", type: "vec4", arrayLength: -1 }]);
    withLinkedProgram(result, (gl, program) => expect(gl.getUniformLocation(program, "samples[3]")).not.toBeNull());
  });

  it.each([
    ["determinant(mat2(3,1,1,1))", 2],
    ["determinant(mat3(2))", 8],
    ["determinant(mat4(2))", 16],
    ["(mat2(1,2,3,4) * vec2(1,0)).y", 2],
    ["(vec2(1,0) * mat2(1,2,3,4)).y", 3],
    ["(mat2x3(1,2,3,4,5,6)*mat3x2(1,0,0,1,1,1))[2][1]", 7]
  ] as const)("matches the driver's original loose array length for %s", (expression, count) => {
    const result = variant(`const int size = int(${expression}); vec4 samples[size];`, "samples[size-1]");
    expect(result.uniformBlocks[0].members[0].arrayLength).toBe(count);
    withLinkedProgram(result.original, (gl, program) => {
      const [index] = gl.getUniformIndices(program, ["samples[0]"])!;
      expect(gl.getActiveUniform(program, index)!.size).toBe(count);
    });
  });

  it("diagnoses an unrepresentable selected opaque declaration", () => {
    const text = "uniform sampler2D images[UNRESOLVED];";
    const selected: IShaderUniformSelection = {
      site: { kind: "uniform", instruction: 0, name: "images", type: "sampler2D" },
      start: 0,
      end: text.length,
      text
    };
    expect(() => finalizeShaderUniforms("", text, [], [selected], { maxBlockBytes: 16384, maxBindings: 24 })).toThrow(
      UnresolvedUniformArrayLength
    );
  });

  it.each([
    ["sampler2D images[EXTERNAL_SIZE];", "texture2D(images[1],vec2(0.5))", false],
    [
      "const int n = int(length(cross(vec3(2,0,0),vec3(0,2,0)))); sampler2D images[n];",
      "texture2D(images[1],vec2(0.5))",
      false
    ],
    ["const int n = int(determinant(mat2(2.0))); sampler2D images[n];", "texture2D(images[1],vec2(0.5))", true],
    [
      "struct Leaf {float value;}; struct Branch { Leaf leaves[256]; }; Branch tree[256];",
      "vec4(tree[0].leaves[0].value)",
      false
    ],
    [
      "struct Entry {float weight; sampler2D image;}; const int n=1+1; Entry entries[n];",
      "texture2D(entries[0].image,vec2(entries[1].weight))",
      true
    ],
    [
      "struct Entry {float weight; sampler2D image;}; Entry entries[EXTERNAL_SIZE];",
      "texture2D(entries[0].image,vec2(entries[1].weight))",
      false
    ],
    ["vec4 palette[EXTERNAL_SIZE];", "palette[1]", true]
  ] as const)("chooses the same format for live and JSON-serialized %s", (declarations, expression, planned) => {
    const source = shaderSource("uniform Scene {float strength;};\n" + declarations, `strength * (${expression})`);
    const compiler = new ShaderCompiler();
    const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
    const live = compiler._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES300
    )!;
    const serialized = JSON.parse(JSON.stringify(new ShaderPrecompiler().precompile(source))).subShaders[0].passes[0];
    expect(!!live.uniformPlan).toBe(planned);
    expect(!!serialized.uniformPlan).toBe(planned);
    expect(serialized.uniformBlocks[0].name).toBe("Scene");
    expect(serialized.fragmentShaderInstructions).toEqual(live.fragmentShaderInstructions);
  });

  it("reads a device-defined GLSL constant on demand for sampler arrays", () => {
    const names: string[] = [];
    const result = variant(
      "const int size = min(2, gl_MaxDrawBuffers); sampler2D images[size];",
      "texture2D(images[1], vec2(0.5))",
      new Map(),
      16384,
      (name) => {
        names.push(name);
        return 4;
      }
    );
    expect(names).toEqual(["gl_MaxDrawBuffers"]);
    expect(result.looseUniforms).toEqual([{ name: "images", type: "sampler2D", arrayLength: 2 }]);
    withLinkedProgram(result, (gl, program) => expect(gl.getUniformLocation(program, "images[1]")).not.toBeNull());
  });

  it("shares a range between compatible stage-private uniforms at their driver offsets", () => {
    const vertex = "uniform mat4 model;";
    const fragment = "uniform vec4 tint;";
    const result = finalizeShaderUniforms(
      vertex + "\nvoid main() { gl_Position = model * vec4(1.0); }",
      fragment + "\nout vec4 color; void main() { color = tint; }",
      [
        {
          site: { kind: "uniform", instruction: 0, type: "mat4", name: "model" },
          start: 0,
          end: vertex.length,
          text: vertex
        }
      ],
      [
        {
          site: { kind: "uniform", instruction: 0, type: "vec4", name: "tint" },
          start: 0,
          end: fragment.length,
          text: fragment
        }
      ],
      { maxBlockBytes: 16384, maxBindings: 24 }
    );
    expect(result.uniformBlocks).toHaveLength(1);
    expect(result.uniformBlocks[0].members.map((member) => member.offset)).toEqual([0, 64]);
    withLinkedProgram(result, (gl, program) => {
      expect(gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS)).toBe(1);
      const indices = gl.getUniformIndices(program, ["model", "tint"])!;
      expect(gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET)).toEqual([0, 64]);
    });
  });

  it("keeps a vertex-only uniform out of the fragment stage's type namespace", () => {
    function select(name: string): IShaderUniformSelection {
      const text = `uniform float ${name};`;
      return { site: { kind: "uniform", instruction: 0, type: "float", name }, start: 0, end: text.length, text };
    }
    const vertex = select("Tint");
    const fragment = select("gain");
    const result = finalizeShaderUniforms(
      vertex.text + "\nvoid main() { gl_Position = vec4(Tint); }",
      fragment.text +
        "\nstruct Tint {float value;}; out vec4 color; void main() { Tint t=Tint(gain); color = vec4(t.value); }",
      [vertex],
      [fragment],
      { maxBlockBytes: 16384, maxBindings: 24 }
    );
    expect(result.uniformBlocks).toHaveLength(2);
    withLinkedProgram(result, (gl, program) => {
      for (const block of result.uniformBlocks)
        expect(gl.getUniformBlockIndex(program, block.bindingName!)).not.toBe(gl.INVALID_INDEX);
    });
  });
});
