import {
  ShaderCoreInfo,
  TreeNode,
  parseShaderPass,
  type ShaderClueIR
} from "@galacean/engine-shader-parser/internal/verbose";
import { describe, expect, it } from "vitest";

interface NeutralBackendSnapshot {
  entries: { vertex: string; fragment: string };
  io: { attributes: string[]; varyings: string[]; mrt: string[] };
  sourceFiles: string[];
  conditionalMacros: string[];
}

function inspectNeutralIR(ir: ShaderClueIR, coreInfo: ShaderCoreInfo): NeutralBackendSnapshot {
  const conditionalMacros = new Set<string>();
  const visit = (node: TreeNode): void => {
    for (const constraint of node._branch) {
      const condition = constraint.condition;
      if (condition?.kind === "defined" || condition?.kind === "comparison") {
        conditionalMacros.add(condition.name);
      } else if (condition?.kind === "expression") {
        for (const name of condition.names) conditionalMacros.add(name);
      } else {
        conditionalMacros.add(constraint.name);
      }
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) visit(child);
    }
  };
  visit(ir.program);

  return {
    entries: { vertex: coreInfo.vertexEntry.name, fragment: coreInfo.fragmentEntry.name },
    io: {
      attributes: coreInfo.io.attributeStructs.map((node) => node.ident!.lexeme),
      varyings: coreInfo.io.varyingStructs.map((node) => node.ident!.lexeme),
      mrt: coreInfo.io.mrtStructs.map((node) => node.ident!.lexeme)
    },
    sourceFiles: [...new Set(ir.sourceMap.map((segment) => segment.file).filter((file): file is string => !!file))],
    conditionalMacros: [...conditionalMacros].sort()
  };
}

describe("neutral shader IR", () => {
  it("exposes include, conditional, entry, and IO facts without a GLES or analyzer dependency", () => {
    const source = `
#include "common.glsl"
struct Varyings { vec4 color; };
#if defined(USE_TINT)
vec4 tintColor;
#endif
Varyings vert(Attributes input) {
  Varyings output;
  gl_Position = vec4(input.position, 1.0);
  output.color = vec4(1.0);
  return output;
}
void frag(Varyings input) { gl_FragColor = input.color; }
`;
    const parsed = parseShaderPass(source, { "common.glsl": "struct Attributes { vec3 position; };" }, new Map());
    expect(parsed.errors).to.have.lengthOf(0);
    expect(parsed.ir).to.not.equal(null);

    const ir = parsed.ir!;
    const coreInfo = ShaderCoreInfo.create(ir, "vert", "frag");
    expect(inspectNeutralIR(ir, coreInfo)).to.deep.equal({
      entries: { vertex: "vert", fragment: "frag" },
      io: { attributes: ["Attributes"], varyings: ["Varyings"], mrt: [] },
      sourceFiles: ["common.glsl"],
      conditionalMacros: ["USE_TINT"]
    });
    expect(ir.program.shaderData).to.equal(ir.shaderData);
  });
});
