/**
 * Built-in shader smoke test — every shipping shader must not fire any diagnostic that this
 * PR introduces or tightens. Pre-existing false-positives from before this PR's baseline are
 * allowlisted with a documented reason; the point of the test is to catch regressions of the
 * F1 kind (analyzer misfiring on production ship code) at CI time.
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

/**
 * Diagnostic codes this PR introduces or materially tightens. Any of these firing on a shipping
 * shader is a regression. Additions/extensions in the current PR sequence:
 * - `InvalidAssignmentTarget` (new in dfba45b5d, extended by 3292dbeae for uniform / sampler /
 *   postfix++). F1 lived in this bucket.
 * - `InvalidSwizzle` receiver-type check (G3+G4 in 3292dbeae).
 * - `InvalidBinaryOperands` operand-type / family-mismatch extensions (G1/G5/G6/G7/G8).
 * - `BareGlFragData` (new).
 * - `LocalFunctionPrototype` (new).
 */
const PR_INTRODUCED_CODES = new Set([
  "InvalidAssignmentTarget",
  "InvalidSwizzle",
  "InvalidBinaryOperands",
  "BareGlFragData",
  "LocalFunctionPrototype"
]);

beforeAll(async () => {
  await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

const shipping = builtinShaders.filter((s) => s.path.endsWith(".shader"));

describe("built-in shader analyze() smoke — this-PR-only regression fence", () => {
  it("bundles the built-in shader corpus", () => {
    expect(shipping.length).to.be.greaterThan(5);
  });

  for (const shader of shipping) {
    it(`${shader.path} — no PR-introduced error-severity diagnostic fires`, () => {
      const analyzer = new ShaderAnalyzer();
      const { diagnostics } = analyzer.analyze(shader.source, { includeMap: ShaderFactory.includeMap });
      const regressed = diagnostics.filter((d) => d.severity === "error" && PR_INTRODUCED_CODES.has(d.code));
      const detail = regressed
        .slice(0, 5)
        .map((d) => `${d.code} @ ${d.range.start.line}:${d.range.start.column} — ${d.message.slice(0, 100)}`)
        .join("\n  ");
      expect(
        regressed.length,
        `${shader.path} regressed with ${regressed.length} PR-introduced error(s):\n  ${detail}`
      ).to.equal(0);
    });
  }
});
