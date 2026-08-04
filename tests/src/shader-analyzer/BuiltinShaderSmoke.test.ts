/** Built-in shaders must retain their reviewed diagnostic contract. */

import { ShaderFactory } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { shaders as builtinShaders } from "@galacean/engine-shader/sources";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

const shipping = builtinShaders.filter((s) => s.path.endsWith(".shader"));

describe("built-in shader analyze() smoke", () => {
  it("bundles the built-in shader corpus", () => {
    expect(shipping.length).to.be.greaterThan(5);
  });

  for (const shader of shipping) {
    it(`${shader.path} — diagnostics match the reviewed contract`, () => {
      const analyzer = new ShaderAnalyzer();
      const { diagnostics } = analyzer.analyze(shader.source, { includeMap: ShaderFactory.includeMap });
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      expect(errors).to.deep.equal([]);
      expect(diagnostics.some((diagnostic) => diagnostic.code === "AmbiguousMacroBranchResolution")).to.equal(false);
    });
  }
});
