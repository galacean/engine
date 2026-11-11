import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { Preprocessor } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it } from "vitest";

function includes(depth: number, copies: number, leaf = "\n"): Record<string, string> {
  const chunks: Record<string, string> = {};
  for (let level = 0; level < depth; level++) {
    chunks[`chunk${level}`] = `#include "chunk${level + 1}"\n`.repeat(copies);
  }
  chunks[`chunk${depth}`] = leaf;
  return chunks;
}

describe("bounded shader include expansion", () => {
  it.each([
    ["nesting", includes(140, 1), "nesting"],
    ["repeated source segments", includes(20, 2), "source segments"],
    ["expanded text", includes(15, 2, `/*${"x".repeat(2048)}*/`), "characters"]
  ])("reports %s limits without returning a partial shader", (_name, chunks, message) => {
    for (const trackSourceMap of [true, false]) {
      const result = Preprocessor.parseWithErrors(
        '#include "chunk0"',
        "shaders://root/",
        chunks as Record<string, string>,
        new Map(),
        "root.shader",
        trackSourceMap
      );
      expect(result.content).toBe("");
      expect(result.errors).toHaveLength(1);
      const error = result.errors[0];
      expect(error.name).toBe("PreprocessorError");
      expect(error.message).toContain(message as string);
      expect(error.file).toMatch(/^chunk\d+$/);
      const location = error.location;
      const offset = "start" in location ? location.start.index : location.index;
      expect(error.source!.slice(offset)).toMatch(/^#include/);
    }
  });

  it("returns an editor diagnostic and remains usable after a rejected include graph", () => {
    const source = `Shader "includes" { SubShader "s" { Pass "p" {
#include "chunk0"
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const rejected = ShaderAnalyzer.analyze(source, { includeMap: includes(140, 1) });
    expect(rejected.diagnostics).toHaveLength(1);
    expect(rejected.diagnostics[0].code).toBe("PreprocessorError");
    expect(rejected.diagnostics[0].sourceFile).toMatch(/^chunk\d+$/);
    const recovered = ShaderAnalyzer.analyze(source, { includeMap: includes(4, 2) });
    expect(recovered.diagnostics).toEqual([]);
    expect(recovered.passes).toHaveLength(1);
  });

  it("counts physical continuation segments consistently with and without source maps", () => {
    const source = "\\\n".repeat(70000) + "float value;";
    for (const trackSourceMap of [true, false]) {
      const result = Preprocessor.parseWithErrors(
        source,
        "shaders://root/",
        {},
        new Map(),
        "root.shader",
        trackSourceMap
      );
      expect(result.content).toBe("");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("source segments");
    }
  });

  it("retains include attribution when reusing a cache after runtime preprocessing", () => {
    const cache = new Map();
    const chunks = { common: "float value;" };
    const source = '#include "common"';
    Preprocessor.parseWithErrors(source, "shaders://root/", chunks, cache, "root.shader", false);
    const mapped = Preprocessor.parseWithErrors(source, "shaders://root/", chunks, cache, "root.shader", true);
    expect(mapped.sourceMap).toHaveLength(1);
    expect(mapped.sourceMap[0].sourceFile).toBe("common");
    expect(mapped.sourceMap[0].source).toBe(chunks.common);
  });
});
