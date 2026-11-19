import type { ShaderPass } from "@galacean/engine";

type Instructions = ConstructorParameters<typeof ShaderPass>[2];

const RAW_ALIAS_PREFIX = "BUILDING_RAW_";

/** Runtime macros that recovered GLSL tests with `#ifdef` lines. */
export const RAW_GLSL_MACROS = [
  "RENDERER_WORLD_PICK",
  "RENDERER_WORLD_PICK_DEPTH",
  "RENDERER_MASONRY_ENTRANCE",
  "RENDERER_MASONRY_DITHER"
] as const;

const RAW_MACRO_PATTERN = new RegExp(`\\b(?:${RAW_GLSL_MACROS.join("|")})\\b`, "g");

/**
 * Builds the instructions for recovered GLSL that keeps `#ifdef` lines for the GL driver.
 *
 * Text instructions are ordinary shader text: the engine expands every active macro name in them, so
 * `#ifdef NAME` would become `#ifdef `. Each gate tests the engine macro, and the text uses a private alias.
 * Only macros referenced by `source` emit gates, so unused active macros never perturb generated GLSL or
 * defeat `ShaderPass` source-level program deduplication.
 *
 * TEMPORARY: delete this with the old resident path.
 * @param gatedMacros - Macros to define for the GL driver when they are active.
 * @param source - Recovered GLSL source.
 * @param offset - Index of the first returned instruction, because gate jumps are absolute.
 * @returns The gates followed by the aliased source.
 */
export function rawGlslInstructions(
  gatedMacros: readonly (typeof RAW_GLSL_MACROS)[number][],
  source: string,
  offset = 0
): Instructions {
  const referenced = new Set<string>();
  const aliased = source.replace(RAW_MACRO_PATTERN, (macro) => {
    referenced.add(macro);
    return RAW_ALIAS_PREFIX + macro;
  });
  const activeGates = gatedMacros.filter((macro) => referenced.has(macro));
  const instructions: Instructions = [];
  activeGates.forEach((macro, index) => {
    instructions.push([1, macro, offset + 2 * (index + 1)], [0, `#define ${RAW_ALIAS_PREFIX}${macro}\n`]);
  });
  instructions.push([0, aliased]);
  return instructions;
}
