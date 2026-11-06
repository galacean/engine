import type { SampledLakeBoundary } from "../../authoring/lake/LakeBoundary";
import { compileHeightfieldWaterShoreDistances } from "./HeightfieldWaterShoreDistanceCompiler";
/** Four-neighbour component resolution and dense CPU query-grid preparation. */
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { HeightfieldWaterBudgetConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterCompiledComponent } from "./HeightfieldWaterCompiledTypes";
import {
  HeightfieldReadonlyFloat32Buffer,
  HeightfieldReadonlyInt32Buffer,
  HeightfieldReadonlyUint32Buffer,
  HeightfieldReadonlyUint8Buffer
} from "./HeightfieldNumericBuffer";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import { HEIGHTFIELD_WATER_DEFAULT_DEPTH } from "./constants";
import { HeightfieldWaterGeneratedBudgetExceededError, type PreparedHeightfieldWaterData } from "./internalTypes";

function freezeVector2(x: number, y: number): readonly [number, number] {
  return Object.freeze([x, y] as const);
}

function freezeVector3(x: number, y: number, z: number): readonly [number, number, number] {
  return Object.freeze([x, y, z] as const);
}

export function prepareHeightfieldWaterData(
  descriptor: HeightfieldWaterDescriptorV1,
  budget?: Readonly<Pick<HeightfieldWaterBudgetConfig, "maxComponentCount">>
): PreparedHeightfieldWaterData {
  const { width, height, originXZ, cellSizeXZ } = descriptor.grid;
  const texelCount = width * height;
  const wetMask = new Uint8Array(texelCount);
  const wetOrdinalByTexel = new Int32Array(texelCount);
  const componentIndices = new Int32Array(texelCount);
  wetOrdinalByTexel.fill(-1);
  componentIndices.fill(-1);

  for (let ordinal = 0; ordinal < descriptor.wetTexelIndices.length; ordinal++) {
    const texelIndex = descriptor.wetTexelIndices[ordinal];
    wetMask[texelIndex] = 1;
    wetOrdinalByTexel[texelIndex] = ordinal;
  }

  const componentTexels: number[][] = [];
  for (const seedIndex of descriptor.wetTexelIndices) {
    if (componentIndices[seedIndex] >= 0) continue;
    const nextComponentCount = componentTexels.length + 1;
    if (budget && nextComponentCount > budget.maxComponentCount) {
      throw new HeightfieldWaterGeneratedBudgetExceededError(
        "maxComponentCount",
        nextComponentCount,
        budget.maxComponentCount
      );
    }
    const componentIndex = componentTexels.length;
    const texels: number[] = [seedIndex];
    componentIndices[seedIndex] = componentIndex;
    for (let cursor = 0; cursor < texels.length; cursor++) {
      const texelIndex = texels[cursor];
      const x = texelIndex % width;
      const z = Math.floor(texelIndex / width);
      const neighbours = [
        x > 0 ? texelIndex - 1 : -1,
        x + 1 < width ? texelIndex + 1 : -1,
        z > 0 ? texelIndex - width : -1,
        z + 1 < height ? texelIndex + width : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && wetMask[neighbour] === 1 && componentIndices[neighbour] < 0) {
          componentIndices[neighbour] = componentIndex;
          texels.push(neighbour);
        }
      }
    }
    texels.sort((a, b) => a - b);
    componentTexels.push(texels);
  }

  // Allocate value fields only after the component budget is proven. This
  // keeps an intentionally tiny component budget from paying the full dense
  // surface/bed/flow allocation cost.
  const surfaceHeights = new Float32Array(texelCount);
  const bedHeights = new Float32Array(texelCount);
  const flowVectorsXZ = new Float32Array(texelCount * 2);
  surfaceHeights.fill(Number.NaN);
  bedHeights.fill(Number.NaN);
  for (let ordinal = 0; ordinal < descriptor.wetTexelIndices.length; ordinal++) {
    const texelIndex = descriptor.wetTexelIndices[ordinal];
    surfaceHeights[texelIndex] = descriptor.surfaceHeights[ordinal];
    bedHeights[texelIndex] =
      descriptor.bedHeights?.[ordinal] ?? descriptor.surfaceHeights[ordinal] - HEIGHTFIELD_WATER_DEFAULT_DEPTH;
    flowVectorsXZ[texelIndex * 2] = descriptor.flowVectorsXZ?.[ordinal * 2] ?? 0;
    flowVectorsXZ[texelIndex * 2 + 1] = descriptor.flowVectorsXZ?.[ordinal * 2 + 1] ?? 0;
  }

  const gridMinX = originXZ[0] - cellSizeXZ[0] * 0.5;
  const gridMinZ = originXZ[1] - cellSizeXZ[1] * 0.5;
  const components: HeightfieldWaterCompiledComponent[] = componentTexels.map((texels, componentIndex) => {
    let minX = width;
    let minZ = height;
    let maxX = 0;
    let maxZ = 0;
    let minSurfaceHeight = Number.POSITIVE_INFINITY;
    let maxSurfaceHeight = Number.NEGATIVE_INFINITY;
    for (const texelIndex of texels) {
      const x = texelIndex % width;
      const z = Math.floor(texelIndex / width);
      minX = Math.min(minX, x);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxZ = Math.max(maxZ, z);
      minSurfaceHeight = Math.min(minSurfaceHeight, surfaceHeights[texelIndex]);
      maxSurfaceHeight = Math.max(maxSurfaceHeight, surfaceHeights[texelIndex]);
    }
    return Object.freeze({
      id: `${descriptor.id}:component:${componentIndex}`,
      index: componentIndex,
      wetTexelCount: texels.length,
      wetTexelIndices: new HeightfieldReadonlyUint32Buffer(texels),
      minTexel: freezeVector2(minX, minZ),
      maxTexel: freezeVector2(maxX, maxZ),
      bounds: Object.freeze({
        min: freezeVector3(gridMinX + minX * cellSizeXZ[0], minSurfaceHeight, gridMinZ + minZ * cellSizeXZ[1]),
        max: freezeVector3(
          gridMinX + (maxX + 1) * cellSizeXZ[0],
          maxSurfaceHeight,
          gridMinZ + (maxZ + 1) * cellSizeXZ[1]
        )
      }),
      minSurfaceHeight,
      maxSurfaceHeight
    });
  });

  return Object.freeze({
    descriptor,
    wetMask,
    wetOrdinalByTexel,
    componentIndices,
    surfaceHeights,
    bedHeights,
    flowVectorsXZ,
    components: Object.freeze(components)
  });
}

export function createHeightfieldWaterQueryGrid(
  prepared: PreparedHeightfieldWaterData,
  boundary?: SampledLakeBoundary
) {
  return Object.freeze({
    grid: prepared.descriptor.grid,
    ...(prepared.descriptor.bedTerrain ? { bedTerrain: prepared.descriptor.bedTerrain } : {}),
    wetMask: new HeightfieldReadonlyUint8Buffer(prepared.wetMask, WaterBufferOwnership.Transfer),
    ...(boundary?.queryCoverage === "boundary"
      ? {}
      : {
          shoreDistances: new HeightfieldReadonlyFloat32Buffer(
            compileHeightfieldWaterShoreDistances(prepared.wetMask, prepared.descriptor.grid),
            WaterBufferOwnership.Transfer
          )
        }),
    componentIndices: new HeightfieldReadonlyInt32Buffer(prepared.componentIndices, WaterBufferOwnership.Transfer),
    surfaceHeights: new HeightfieldReadonlyFloat32Buffer(prepared.surfaceHeights, WaterBufferOwnership.Transfer),
    bedHeights: new HeightfieldReadonlyFloat32Buffer(prepared.bedHeights, WaterBufferOwnership.Transfer),
    flowVectorsXZ: new HeightfieldReadonlyFloat32Buffer(prepared.flowVectorsXZ, WaterBufferOwnership.Transfer)
  });
}
