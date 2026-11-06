import {
  ShaderCoreInfo,
  ShaderSourceParser,
  ShaderStructRole,
  parseShaderPass
} from "@galacean/engine-shader-parser/internal/analyzer";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

/**
 * Expectation-driven tests for the parser's IO semantic analysis. Each case asserts
 * the diagnostics the analysis SHOULD produce per RFC — one code per real problem,
 * correct code. Valid shaders (incl. the kind dev/2.0 compiles) must stay clean.
 */

const ioDiagnosticCodes = new Set([
  "InvalidIOStruct",
  "InvalidEntryReturnType",
  "StructRoleConflict",
  "GlFragColorWithMrt",
  "LegacyFragmentOutputConflict",
  "InvalidMrtOutput",
  "NestedIOStruct",
  "MissingVertexPosition",
  "NonFlatIntegerVarying",
  "EntryNotFound"
]);

/** Run the standalone analyzer and return IO diagnostic codes with multiplicity. */
function ioCodes(source: string): string[] {
  return ShaderAnalyzer.analyze(source)
    .diagnostics.map((diagnostic) => diagnostic.code)
    .filter((code) => ioDiagnosticCodes.has(code))
    .sort();
}

function wrap(pass: string): string {
  return `Shader "io" { SubShader "Default" { Pass "test" {\n${pass}\n} } }`;
}

const cases: { name: string; source: string; expected: string[] }[] = [
  {
    name: "valid: plain frag, no IO struct → clean",
    expected: [],
    source: wrap(`
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: full varying IO → clean",
    expected: [],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 v_color; };
      Varyings vert(Attributes attr) { Varyings o; o.v_color = vec4(1.0); gl_Position = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.v_color; }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "InvalidIOStruct: vertex returns undefined varying struct (once)",
    expected: ["InvalidIOStruct"],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      Varyings vert(Attributes attr) { Varyings o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "InvalidEntryReturnType: vertex returns non-struct/void (once)",
    expected: ["InvalidEntryReturnType"],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      float vert(Attributes attr) { gl_Position = vec4(0.0); return 1.0; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "InvalidIOStruct: vertex attribute param undefined struct (once)",
    expected: ["InvalidIOStruct"],
    source: wrap(`
      void vert(Attributes attr) { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "InvalidEntryReturnType: fragment returns non-struct/vec4 (once)",
    expected: ["InvalidEntryReturnType"],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      float frag() { return 1.0; }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "StructRoleConflict: same struct as Varying and Attribute — reported ONCE",
    expected: ["StructRoleConflict"],
    source: wrap(`
      struct IO { vec4 v; };
      IO vert(IO attr) { IO o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "GlFragColorWithMrt: fragment returns MRT yet writes gl_FragColor",
    expected: ["GlFragColorWithMrt"],
    source: wrap(`
      struct MRT { layout(location = 0) vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "LegacyFragmentOutputConflict: one variant writes both legacy output forms",
    expected: ["LegacyFragmentOutputConflict"],
    source: wrap(`
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); gl_FragData[0] = vec4(1.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: mutually exclusive macro variants choose one legacy output form",
    expected: [],
    source: wrap(`
      void vert() { gl_Position = vec4(0.0); }
      void frag() {
        #ifdef USE_MRT
          gl_FragData[0] = vec4(1.0);
        #else
          gl_FragColor = vec4(0.0);
        #endif
      }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    // Array integer varying: `prop.typeInfo.type` remains `Keyword.INT` even when the member is
    // `int arr[4]`, so `TypeSystem.isIntegerType` fires — verified end-to-end here.
    name: "NonFlatIntegerVarying: integer array varying (int arr[4]) must be flat",
    expected: ["NonFlatIntegerVarying"],
    source: wrap(`
      struct Varyings { vec4 pos; int arr[4]; };
      Varyings vert() { Varyings o; gl_Position = vec4(0.0); return o; }
      void frag(Varyings i) { gl_FragColor = vec4(float(i.arr[0])); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    // Multi-level nesting: `Vary.b` is caught (`typeof prop.typeInfo.type === "string"`); the
    // Reporting the parent is sufficient; nested members are not diagnosed again.
    name: "NestedIOStruct: multi-level (Vary → B → A) → single report on B.b",
    expected: ["NestedIOStruct"],
    source: wrap(`
      struct A { int x; };
      struct B { A a; };
      struct Vary { B b; };
      Vary vert() { Vary o; gl_Position = vec4(0.0); return o; }
      void frag(Vary i) { gl_FragColor = vec4(float(i.b.a.x)); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    // Array-of-struct as a member: `prop.typeInfo.type` is the struct name (string) regardless of
    // arrayness — same check catches it.
    name: "NestedIOStruct: array of struct member (Inner arr[2]) is flagged",
    expected: ["NestedIOStruct"],
    source: wrap(`
      struct Inner { vec4 v; };
      struct Vary { Inner arr[2]; };
      Vary vert() { Vary o; gl_Position = vec4(0.0); return o; }
      void frag(Vary i) { gl_FragColor = i.arr[0].v; }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "MissingVertexPosition: a write in an unreachable helper does not satisfy the vertex entry",
    expected: ["MissingVertexPosition"],
    source: wrap(`
      void unused() { gl_Position = vec4(0.0); }
      void vert() {}
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: a write in a helper reachable from the vertex entry satisfies gl_Position",
    expected: [],
    source: wrap(`
      void writePosition() { gl_Position = vec4(0.0); }
      void vert() { writePosition(); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "MissingVertexPosition: a direct write in only one macro arm does not cover every variant",
    expected: ["MissingVertexPosition"],
    source: wrap(`
      void vert() {
      #ifdef WRITE_POSITION
        gl_Position = vec4(0.0);
      #endif
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "unknown: an opaque macro condition does not invent a missing-write error",
    expected: [],
    source: wrap(`
      void vert() {
      #if FIRST_VALUE + SECOND_VALUE > 1
        gl_Position = vec4(0.0);
      #endif
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: complementary direct-write arms cover every vertex variant",
    expected: [],
    source: wrap(`
      void vert() {
      #ifdef FIRST_POSITION
        gl_Position = vec4(0.0);
      #else
        gl_Position = vec4(1.0);
      #endif
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "MissingVertexPosition: one macro-selected helper overload does not write the position",
    expected: ["MissingVertexPosition"],
    source: wrap(`
      #ifdef FIRST_HELPER
      void writePosition() {}
      #else
      void writePosition() { gl_Position = vec4(0.0); }
      #endif
      void vert() { writePosition(); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: complementary call and direct-write arms cover every vertex variant",
    expected: [],
    source: wrap(`
      void writePosition() { gl_Position = vec4(0.0); }
      void vert() {
      #ifdef USE_HELPER
        writePosition();
      #else
        gl_Position = vec4(1.0);
      #endif
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: an out parameter writes gl_Position at the call site",
    expected: [],
    source: wrap(`
      void writePosition(out vec4 target) { target = vec4(0.0); }
      void vert() { writePosition(gl_Position); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: an inout parameter writes gl_Position at the call site",
    expected: [],
    source: wrap(`
      void writePosition(inout vec4 target) { target = vec4(0.0); }
      void vert() { writePosition(gl_Position); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "MissingVertexPosition: a conditional out-parameter call does not cover every variant",
    expected: ["MissingVertexPosition"],
    source: wrap(`
      void writePosition(out vec4 target) { target = vec4(0.0); }
      void vert() {
      #ifdef WRITE_POSITION
        writePosition(gl_Position);
      #endif
      }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "MissingVertexPosition: only one macro-selected parameter qualifier writes the argument",
    expected: ["MissingVertexPosition"],
    source: wrap(`
      #ifdef OUTPUT_PARAMETER
      void updatePosition(out vec4 target) { target = vec4(0.0); }
      #else
      void updatePosition(in vec4 target) { vec4 copy = target; }
      #endif
      void vert() { updatePosition(gl_Position); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "MissingVertexPosition: an in parameter does not write gl_Position",
    expected: ["MissingVertexPosition"],
    source: wrap(`
      void readPosition(in vec4 target) { vec4 copy = target; }
      void vert() { readPosition(gl_Position); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  }
];

describe("ShaderIOAnalyzer (expectation-driven)", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(ioCodes(c.source)).to.deep.equal([...c.expected].sort());
    });
  }
});

/** Analyze one pass and return its `io` result — used to inspect struct/prop arrays post-conflict. */
function analyzeSinglePass(source: string): { io: any; codes: string[] } {
  const shaderSource = ShaderSourceParser.parse(source);
  const pass = shaderSource.subShaders[0].passes.find((p) => !p.isUsePass)!;
  const parsed = parseShaderPass(pass.contents, {}, new Map());
  const { io } = ShaderCoreInfo.create(parsed.ir!, pass.vertexEntry, pass.fragmentEntry);
  return { io, codes: ioCodes(source) };
}

describe("ShaderIOAnalyzer role-conflict recovery", () => {
  it("StructRoleConflict (Varying+Attribute): the offending struct is dropped from every role array", () => {
    // `IO` used as both vertex return (Varying) and vertex param (Attribute) — codegen would
    // emit ambiguous `in IO` and `out IO` for the same struct name; the analyzer must clear
    // the struct from both role arrays so codegen never sees it.
    const { io, codes } = analyzeSinglePass(
      `Shader "x" { SubShader "s" { Pass "p" {
        struct IO { vec4 v; };
        IO vert(IO attr) { IO o; gl_Position = vec4(0.0); return o; }
        void frag() { gl_FragColor = vec4(0.0); }
        VertexShader = vert;
        FragmentShader = frag;
      } } }`
    );
    expect(codes).to.include("StructRoleConflict");
    expect(io.attributeStructs, "attributeStructs must be empty after conflict").to.have.lengthOf(0);
    expect(io.varyingStructs, "varyingStructs must be empty after conflict").to.have.lengthOf(0);
    expect(io.attributeList, "attributeList props follow the struct removal").to.have.lengthOf(0);
    expect(io.varyingList, "varyingList props follow the struct removal").to.have.lengthOf(0);
    expect(io.structVariableRoles.size, "variable roles follow the struct removal").to.equal(0);
  });

  it("StructRoleConflict (Varying+MRT): the offending struct is dropped from every role array", () => {
    // `IO` used as vertex return (Varying) and fragment return (MRT).
    const { io, codes } = analyzeSinglePass(
      `Shader "x" { SubShader "s" { Pass "p" {
        struct IO { vec4 v; };
        struct Attr { vec3 p; };
        IO vert(Attr a) { IO o; gl_Position = vec4(0.0); return o; }
        IO frag(IO i) { return i; }
        VertexShader = vert;
        FragmentShader = frag;
      } } }`
    );
    // The frag(IO i)/return IO chain also creates a Varying/MRT conflict; either report is fine.
    expect(codes).to.include("StructRoleConflict");
    expect(io.varyingStructs, "varyingStructs empty after conflict").to.have.lengthOf(0);
    expect(io.mrtStructs, "mrtStructs empty after conflict").to.have.lengthOf(0);
    expect([...io.structVariableRoles.values()], "only the independent attribute keeps its role").to.deep.equal([
      ShaderStructRole.Attribute
    ]);
  });
});
