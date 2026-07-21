/**
 * Built-in shader smoke test — every shipping shader must remain free of analyzer errors. New
 * ambiguity warnings are also fenced explicitly; established branch-type warnings remain allowed.
 *
 * F1 background: `_nonAssignableReason` in `dfba45b5d` was extended by this PR with more
 * qualifier branches. It categorically rejected `MacroCallSymbol` on the LHS — but a macro's
 * l-value-ness depends on its expansion (`#define lumaN luma4B.z` in FXAA3_11.glsl is a legal
 * swizzle l-value; driver accepts `lumaN = lumaW;`). Result: analyzer flagged the shipping
 * FinalAntiAliasing.shader with false-positive `InvalidAssignmentTarget`. This test would
 * have caught it — prior verification only ran precompile (codegen), missing analyze().
 */

import { ShaderFactory } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { shaders as builtinShaders } from "@galacean/engine-shader/sources";
import { beforeAll, describe, expect, it } from "vitest";

const FORBIDDEN_WARNING_CODES = new Set(["AmbiguousMacroBranchResolution"]);

beforeAll(async () => {
  await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

const shipping = builtinShaders.filter((s) => s.path.endsWith(".shader"));

describe("built-in shader analyze() smoke", () => {
  it("bundles the built-in shader corpus", () => {
    expect(shipping.length).to.be.greaterThan(5);
  });

  for (const shader of shipping) {
    it(`${shader.path} — no error or new ambiguity warning fires`, () => {
      const analyzer = new ShaderAnalyzer();
      const { diagnostics } = analyzer.analyze(shader.source, { includeMap: ShaderFactory.includeMap });
      const regressed = diagnostics.filter((d) => d.severity === "error" || FORBIDDEN_WARNING_CODES.has(d.code));
      const detail = regressed
        .slice(0, 5)
        .map((d) => `${d.code} @ ${d.range.start.line}:${d.range.start.column} — ${d.message.slice(0, 100)}`)
        .join("\n  ");
      expect(
        regressed.length,
        `${shader.path} regressed with ${regressed.length} forbidden diagnostic(s):\n  ${detail}`
      ).to.equal(0);
    });
  }
});
