import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import { HeightfieldWaterSchemaVersion } from "../../authoring/heightfield/HeightfieldWaterEnums";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterGridConfig,
  HeightfieldWaterMaterialConfig
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";

export interface HeightfieldWaterFixtureCell {
  readonly x: number;
  readonly z: number;
  readonly surfaceHeight: number;
  readonly bedHeight?: number;
  readonly flowXZ?: readonly [number, number];
}

export const heightfieldWaterMaterialFixture: HeightfieldWaterMaterialConfig = {
  shallowColor: [0.08, 0.48, 0.58, 0.72],
  deepColor: [0.01, 0.08, 0.2, 0.9],
  opacity: 0.78,
  shoreFoamWidth: 1.5,
  microNormalStrength: 0.7,
  waveStrength: 1
};

export function createHeightfieldWaterFixture(options: {
  readonly id?: string;
  readonly grid: HeightfieldWaterGridConfig;
  readonly cells: readonly HeightfieldWaterFixtureCell[];
  readonly quality?: WaterQualityTier;
  readonly includeBed?: boolean;
  readonly includeFlow?: boolean;
  readonly budget?: Partial<HeightfieldWaterBudgetConfig>;
}): HeightfieldWaterDescriptorV1 {
  const cells = options.cells.slice().sort((a, b) => a.z * options.grid.width + a.x - (b.z * options.grid.width + b.x));
  return {
    schemaVersion: HeightfieldWaterSchemaVersion.V1,
    id: options.id ?? "heightfield-fixture",
    grid: options.grid,
    wetTexelIndices: new Uint32Array(cells.map((cell) => cell.z * options.grid.width + cell.x)),
    surfaceHeights: new Float32Array(cells.map((cell) => cell.surfaceHeight)),
    bedHeights: options.includeBed
      ? new Float32Array(cells.map((cell) => cell.bedHeight ?? cell.surfaceHeight - 2))
      : undefined,
    flowVectorsXZ: options.includeFlow ? new Float32Array(cells.flatMap((cell) => cell.flowXZ ?? [0, 0])) : undefined,
    waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
    quality: options.quality ?? WaterQualityTier.High,
    material: heightfieldWaterMaterialFixture,
    budget: options.budget
  };
}

export const singleTexelHeightfieldFixture = createHeightfieldWaterFixture({
  id: "single-texel",
  grid: { originXZ: [0, 0], cellSizeXZ: [2, 2], width: 1, height: 1 },
  cells: [{ x: 0, z: 0, surfaceHeight: 3, bedHeight: 0, flowXZ: [2, -1] }],
  includeBed: true,
  includeFlow: true
});

export const diagonalHeightfieldFixture = createHeightfieldWaterFixture({
  id: "diagonal-components",
  grid: { originXZ: [0, 0], cellSizeXZ: [1, 1], width: 2, height: 2 },
  cells: [
    { x: 0, z: 0, surfaceHeight: 1 },
    { x: 1, z: 1, surfaceHeight: 2 }
  ]
});

export const ringHeightfieldFixture = createHeightfieldWaterFixture({
  id: "ring-with-hole",
  grid: { originXZ: [0, 0], cellSizeXZ: [1, 1], width: 5, height: 5 },
  cells: Array.from({ length: 25 }, (_value, index) => ({
    x: index % 5,
    z: Math.floor(index / 5),
    surfaceHeight: 1 + (index % 5) * 0.1,
    bedHeight: -1,
    flowXZ: [0.5, 0.25] as const
  })).filter((cell) => cell.x !== 2 || cell.z !== 2),
  includeBed: true,
  includeFlow: true
});

export const curvedHeightfieldFixture = createHeightfieldWaterFixture({
  id: "curved-surface",
  grid: { originXZ: [10, 20], cellSizeXZ: [2, 3], width: 3, height: 2 },
  cells: Array.from({ length: 6 }, (_value, index) => {
    const x = index % 3;
    const z = Math.floor(index / 3);
    return { x, z, surfaceHeight: 2 + x * 0.75 + z * 0.25, bedHeight: -1, flowXZ: [x, z] as const };
  }),
  includeBed: true,
  includeFlow: true
});
