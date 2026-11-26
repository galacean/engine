import type { ShaderInstruction } from "@galacean/engine-design";

/**
 * The serialized Seed terrain and water instructions sample screen textures using
 * GL clip coordinates. Specialize only literal instructions, preserving VM jump
 * targets, bindings, and the unmodified asset stored in the resource manager.
 */
export function productFragmentInstructions(name: string, instructions: ShaderInstruction[]): ShaderInstruction[] {
  if (
    !/^(?:Water\/|AIWorld\/(?:HeightfieldWater|Ocean)|Terrain\/(?:Grass|Surface|Vegetation|Terrain)(?:\/asset\/[a-f0-9]{64})?$)/.test(
      name
    )
  ) {
    return instructions;
  }
  return instructions.map((instruction) => {
    if (instruction[0] !== 0 || typeof instruction[1] !== "string") return instruction;
    const source = instruction[1];
    const oriented = source
      .replace(
        /(vec2\s+(screenU[vV])\s*=[^;]*?\b(?:clipPosition|positionCS)\s*\.\s*xy[^;]*;)/g,
        "$1 $2.y = 1.0 - $2.y;"
      )
      .replace(/(vec2\s+(refractionNormalDelta|refractionOffset)\s*=[^;]+;)/g, "$1 $2.y = -$2.y;")
      .replace(/(vec2\s+ndc\s*=\s*uv\s*\*\s*2\.0\s*-\s*1\.0\s*;)/g, "$1 ndc.y = -ndc.y;");
    return oriented === source ? instruction : [0, oriented];
  });
}
