import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = ts.createSourceFile(
  "SeedWorldShaderWarmup.ts",
  readFileSync(new URL("../../../packages/world-planning/src/world/SeedWorldShaderWarmup.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const append = source.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "appendShaderVariants"
)!;
const code = ts.transpileModule(`${append.getText(source)};return appendShaderVariants;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const collect = new Function("ShaderMacro", "RenderQueueType", code)(
  { _getMacrosElements: (_macros, out) => out.push({ name: "REAL_MATERIAL_MACRO" }) },
  { Transparent: 2 }
);
const stages = [
  "Forward",
  "ShadowCaster",
  "DepthOnly",
  "ScreenSpaceReflectionSurface",
  "ScreenSpaceReflectionContributionColor",
  "ScreenSpaceReflectionContributionDepth"
];
function variants(queue: number, contribute: boolean, castShadows = true) {
  const shader = {
    name: "PBR",
    subShaders: [
      {
        passes: stages.map((stage) => ({
          getTagValue: () => stage,
          _renderState: { _getRenderQueueByShaderData: () => queue },
          _renderStateDataMap: {}
        }))
      }
    ]
  };
  const result: { pi: number }[] = [];
  collect(shader, {}, result, castShadows, false, { contributeScreenSpaceReflection: contribute, shaderData: {} });
  return result.map((v) => stages[v.pi]);
}
describe("warmup matches reflection contribution admission", () => {
  it.each([0, 1, 2])("does not prepare contribution passes for a non-contributor (queue %i)", (queue) => {
    expect(variants(queue, false)).toEqual(stages.slice(0, 4));
  });
  it.each([0, 1])("does not prepare transparent contribution capture for queue %i", (queue) => {
    expect(variants(queue, true)).toEqual(stages.slice(0, 4));
  });
  it("retains both contribution passes for an opted-in transparent material", () => {
    expect(variants(2, true)).toEqual(stages);
  });
  it("keeps the existing shadow admission independent of reflection contribution", () => {
    expect(variants(2, true, false)).toEqual(stages.filter((stage) => stage !== "ShadowCaster"));
  });
});
