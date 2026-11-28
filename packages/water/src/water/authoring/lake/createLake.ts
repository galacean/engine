import type { HeightfieldWaterDescriptorV1 } from "../heightfield/HeightfieldWaterDescriptor";
import { HeightfieldWaterSchemaVersion } from "../heightfield/HeightfieldWaterEnums";
import type { LakeBoundaryV1 } from "./LakeBoundary";
import { validateHeightfieldWaterDescriptor } from "../../compiler/heightfield/HeightfieldWaterValidator";

export interface LakeAuthoringOptions
  extends Omit<
    HeightfieldWaterDescriptorV1,
    | "schemaVersion"
    | "lakeBoundary"
    | "wetTexelIndices"
    | "surfaceHeights"
    | "bedHeights"
    | "flowVectorsXZ"
    | "renderSurface"
  > {
  readonly boundary: Omit<LakeBoundaryV1, "queryCoverage">;
  /** Independent bed elevations on the supplied grid, including shoreline interpolation support. */
  readonly bedHeights: Float32Array;
  readonly flowVectorsXZ?: Float32Array;
}

/** Author a closed-spline Lake for the standard WaterBody source/representation and Heightfield backend. */
export function createLake(options: LakeAuthoringOptions): Readonly<HeightfieldWaterDescriptorV1> {
  const { boundary, ...descriptorFields } = options;
  const lakeBoundary: LakeBoundaryV1 = { ...boundary, queryCoverage: "boundary" };
  const gridSampleCount = descriptorFields.grid.width * descriptorFields.grid.height;
  // Validate allocations before creating the dense interpolation support.
  if (!Number.isSafeInteger(gridSampleCount) || gridSampleCount <= 0 || gridSampleCount > 1_048_576)
    throw new RangeError("Lake bathymetry grid exceeds the allocation limit.");
  const descriptor = {
    ...descriptorFields,
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    lakeBoundary,
    wetTexelIndices: Uint32Array.from({ length: gridSampleCount }, (_, i) => i),
    surfaceHeights: new Float32Array(gridSampleCount).fill(lakeBoundary.waterLevel)
  };
  const validation = validateHeightfieldWaterDescriptor(descriptor);
  if (!validation.valid || !validation.value)
    throw new Error(validation.diagnostics.map((d) => `${d.path}: ${d.message}`).join("; "));
  return Object.freeze(validation.value);
}
