import { TerrainAnalyticFieldProvider } from "./PromptNoiseField.ts";
import type { PromptNoiseWorldPlanV1 } from "./PromptNoiseWorldContract.ts";

/** Width and height of the temporary Water sampling window. */
export const PROMPT_NOISE_WATER_GRID_SIZE = 97;

/** World-space distance between temporary Water samples. */
export const PROMPT_NOISE_WATER_CELL_SIZE = 6;

/** Worker-produced analytic water samples consumed by Water. */
export interface PromptNoiseWaterWindow {
  readonly logicalMinimumX: number;
  readonly logicalMinimumZ: number;
  readonly wetTexelIndices: Uint32Array;
  readonly surfaceHeights: Float32Array;
  readonly bedHeights: Float32Array;
  readonly flowVectorsXZ: Float32Array;
  readonly sourceBytes: number;
}

/**
 * Samples the active analytic water window without creating renderer resources.
 * @param plan Current immutable prompt-noise world plan.
 * @param logicalCamera Logical camera position in metres.
 * @returns Typed arrays transferable from a Worker to Water.
 */
export function generatePromptNoiseWaterWindow(
  plan: PromptNoiseWorldPlanV1,
  logicalCamera: readonly [x: number, z: number]
): PromptNoiseWaterWindow {
  const field = new TerrainAnalyticFieldProvider(plan);
  const logicalMinimumX = Math.floor(
    (logicalCamera[0] - (PROMPT_NOISE_WATER_GRID_SIZE - 1) * PROMPT_NOISE_WATER_CELL_SIZE * 0.5) /
      PROMPT_NOISE_WATER_CELL_SIZE
  ) * PROMPT_NOISE_WATER_CELL_SIZE;
  const logicalMinimumZ = Math.floor(
    (logicalCamera[1] - (PROMPT_NOISE_WATER_GRID_SIZE - 1) * PROMPT_NOISE_WATER_CELL_SIZE * 0.5) /
      PROMPT_NOISE_WATER_CELL_SIZE
  ) * PROMPT_NOISE_WATER_CELL_SIZE;
  const wetTexelIndices: number[] = [];
  const surfaceHeights: number[] = [];
  const bedHeights: number[] = [];
  const flowVectorsXZ: number[] = [];
  for (let row = 0; row < PROMPT_NOISE_WATER_GRID_SIZE; row++) {
    const z = logicalMinimumZ + row * PROMPT_NOISE_WATER_CELL_SIZE;
    for (let column = 0; column < PROMPT_NOISE_WATER_GRID_SIZE; column++) {
      const x = logicalMinimumX + column * PROMPT_NOISE_WATER_CELL_SIZE;
      const sample = field.sample(x, z);
      if (!sample.water) continue;
      wetTexelIndices.push(row * PROMPT_NOISE_WATER_GRID_SIZE + column);
      surfaceHeights.push(sample.waterLevel);
      bedHeights.push(sample.height);
      flowVectorsXZ.push(0, 0);
    }
  }
  const indices = new Uint32Array(wetTexelIndices);
  const surfaces = new Float32Array(surfaceHeights);
  const beds = new Float32Array(bedHeights);
  const flows = new Float32Array(flowVectorsXZ);
  return {
    logicalMinimumX,
    logicalMinimumZ,
    wetTexelIndices: indices,
    surfaceHeights: surfaces,
    bedHeights: beds,
    flowVectorsXZ: flows,
    sourceBytes: indices.byteLength + surfaces.byteLength + beds.byteLength + flows.byteLength
  };
}
