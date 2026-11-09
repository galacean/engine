import { DiagnosticSeverity, DiagnosticType, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYGROUND_SAMPLE,
  PLAYGROUND_SAMPLE_LABELS,
  PLAYGROUND_SAMPLES
} from "../../../examples/src/shader-playground/samples";

// These excerpts identify the offending source tokens independently of the analyzer's range mapping.
const TOKEN_EXPECTATIONS: Record<string, Partial<Record<DiagnosticType, string>>> = {
  [DiagnosticType.PreprocessorError]: { [DiagnosticType.PreprocessorError]: "defined" },
  [DiagnosticType.UseBeforeDeclaration]: { [DiagnosticType.UseBeforeDeclaration]: "value" },
  [DiagnosticType.LocalFunctionPrototype]: { [DiagnosticType.LocalFunctionPrototype]: "int g()" },
  [DiagnosticType.InvalidAssignmentTarget]: { [DiagnosticType.InvalidAssignmentTarget]: "1" },
  [DiagnosticType.InvalidVoidVariable]: { [DiagnosticType.InvalidVoidVariable]: "value" },
  [DiagnosticType.LegacyFragmentOutputConflict]: { [DiagnosticType.LegacyFragmentOutputConflict]: "gl_FragData" },
  [DiagnosticType.BareGlFragData]: { [DiagnosticType.BareGlFragData]: "gl_FragData" },
  [DiagnosticType.NonConstFragmentOutputIndex]: { [DiagnosticType.NonConstFragmentOutputIndex]: "target" },
  [DiagnosticType.InvalidBuiltinStage]: { [DiagnosticType.InvalidBuiltinStage]: "gl_FragCoord" },
  [DiagnosticType.InvalidRenderStateProperty]: { [DiagnosticType.InvalidRenderStateProperty]: "NotARealProperty" },
  "经典回归 / 反例：片元阶段读取 gl_VertexID": { [DiagnosticType.InvalidBuiltinStage]: "gl_VertexID" },
  "Include / 项目相对 sourceFile": { [DiagnosticType.Redefinition]: "includedValue" },
  "Include / 绝对 sourceFile URL": { [DiagnosticType.Redefinition]: "includedValue" }
};

const INCLUDE_FILES: Record<string, string> = {
  "Include / 项目相对 sourceFile": "Assets/Shaders/Broken.glsl",
  "Include / 绝对 sourceFile URL": "file:///project/Assets/Shaders/Broken.glsl"
};

describe("shader playground diagnostic contracts", () => {
  it("provides a dedicated sample for every public diagnostic type", () => {
    for (const code of Object.values(DiagnosticType)) {
      const sample = PLAYGROUND_SAMPLES[code];
      expect(sample, code).toBeDefined();
      expect(sample.expectedCodes, code).toContain(code);
    }
  });

  it("exposes every sample exactly once in the selector", () => {
    const keys = Object.values(PLAYGROUND_SAMPLE_LABELS);
    expect(keys.length).toBe(new Set(keys).size);
    expect([...keys].sort()).toEqual(Object.keys(PLAYGROUND_SAMPLES).sort());
    expect(PLAYGROUND_SAMPLES[DEFAULT_PLAYGROUND_SAMPLE]).toBeDefined();
  });

  it.each(Object.entries(PLAYGROUND_SAMPLES))("%s has the stated diagnostics and source locations", (key, sample) => {
    expect(sample.note.trim().length).toBeGreaterThan(0);
    expect(sample.expectedCodes.length).toBe(new Set(sample.expectedCodes).size);
    for (const code of sample.expectedCodes) expect(Object.values(DiagnosticType)).toContain(code);

    const { diagnostics } = ShaderAnalyzer.analyze(sample.source, sample.options);
    const actualCodes = [...new Set(diagnostics.map((diagnostic) => diagnostic.code))].sort();
    expect(actualCodes).toEqual([...sample.expectedCodes].sort());
    // Each macro-stage negative has one effective restricted operation, not separate call/argument failures.
    if (key.startsWith("宏展开阶段 /")) expect(diagnostics).toHaveLength(sample.expectedCodes.length);

    for (const diagnostic of diagnostics) {
      expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostic.message.trim().length).toBeGreaterThan(0);
      const sourceFile = INCLUDE_FILES[key] ?? sample.options?.sourceFile;
      const source = INCLUDE_FILES[key] ? sample.options!.includeMap![sourceFile!]! : sample.source;
      expect(diagnostic.sourceFile).toBe(sourceFile);
      expect(diagnostic.relatedSource).toBe(source);

      const { start, end } = diagnostic.range;
      expect(start.offset).toBeGreaterThanOrEqual(0);
      expect(end.offset).toBeGreaterThanOrEqual(start.offset);
      expect(end.offset).toBeLessThanOrEqual(source.length);
      for (const position of [start, end]) {
        expect(Number.isInteger(position.offset)).toBe(true);
        const lines = source.slice(0, position.offset).split("\n");
        expect(position.line).toBe(lines.length);
        expect(position.column).toBe(lines[lines.length - 1].length + 1);
      }

      // Only MissingEntry has no offending token in these fixtures: its range is an insertion point.
      if (diagnostic.code !== DiagnosticType.MissingEntry) expect(end.offset).toBeGreaterThan(start.offset);
      const expectedToken = TOKEN_EXPECTATIONS[key]?.[diagnostic.code];
      if (expectedToken) expect(source.slice(start.offset, end.offset)).toBe(expectedToken);
      if (INCLUDE_FILES[key]) {
        expect(start.offset).toBe(source.lastIndexOf("includedValue"));
        expect(start.line).toBe(2);
      }
    }
  });
});
