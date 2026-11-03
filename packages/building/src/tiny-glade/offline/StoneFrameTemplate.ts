import type { ConstructionDrawTemplate } from "./CapturedConstructionAssets";
import { stoneFrameInstanceStride, stoneFrameProgramName } from "../runtime/ConstructionStoneFrameTemplate";
/** Assemble static mesh bindings without copying instance state or choosing wall colours.
 * All named texture/uniform assets must exist in the caller's library. In particular,
 * the native optional wooden-wall branch requires a real halftimber colour texture;
 * this utility never substitutes brick/timber samples for a missing binding.
 */
export function createStoneFrameTemplate(input: {
  attributes: ConstructionDrawTemplate["attributes"];
  indices: string;
  indexCount: number;
  colorLibraryFile: string;
  halfTimberTexture: string;
  /** Host palette owner; native bindings have a separate half-timber selector. */
  timberColorRole?: "halfTimberColors" | "woodenColors";
}): ConstructionDrawTemplate {
  const { attributes, indices, indexCount, colorLibraryFile, halfTimberTexture } = input;
  const expected = new Map([
    [0, 3],
    [2, 3],
    [3, 2]
  ]);
  if (attributes.length !== expected.size || attributes.some((a) => a.size !== expected.get(a.location) || a.integer))
    throw Error("Stone frame requires original position@0, normal@2 and UV@3 attributes");
  if (new Set(attributes.map((a) => a.location)).size !== expected.size)
    throw Error("Duplicate stone-frame attribute location");
  if (
    !indices ||
    !colorLibraryFile ||
    !halfTimberTexture ||
    !Number.isSafeInteger(indexCount) ||
    indexCount <= 0 ||
    indexCount % 3
  )
    throw Error("Stone frame requires geometry and explicit native material resources");
  return {
    family: "stone-decoration",
    program: stoneFrameProgramName,
    attributes: attributes.map((a) => ({ ...a })),
    indices,
    indexCount,
    instanceStride: stoneFrameInstanceStride,
    directInstances: false,
    resources: {
      storage_0_0: { kind: "storage", role: "instances" },
      storage_6_0: { kind: "storage", role: "indirection" },
      storage_19_0: { kind: "storage", role: "wallColors" },
      storage_21_0: { kind: "storage", role: "identities" },
      storage_20_0: { kind: "storage", role: input.timberColorRole ?? "halfTimberColors" },
      ViewConstants_natural: { kind: "uniform", role: "view", minByteLength: 1024 },
      FrameConstants_natural: { kind: "uniform", role: "frame", minByteLength: 352 },
      ColorLibraryData_natural: { kind: "uniform", file: colorLibraryFile, minByteLength: 592 },
      roof_colors_tex: { kind: "texture", texture: "roof_colors", array: true },
      wall_color_data_brick_colors: { kind: "texture", texture: "brick_colors", array: true },
      halftimber_colors_tex: { kind: "texture", texture: halfTimberTexture, array: true }
    }
  };
}

export { stoneFrameProgramName } from "../runtime/ConstructionStoneFrameTemplate";
