/** Four-neighbour component resolution and dense CPU query-grid preparation. */
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { HeightfieldWaterCompiledComponent } from "./HeightfieldWaterCompiledTypes";
import {
  HeightfieldReadonlyFloat32Buffer,
  HeightfieldReadonlyInt32Buffer,
  HeightfieldReadonlyUint32Buffer,
  HeightfieldReadonlyUint8Buffer
} from "./HeightfieldNumericBuffer";
import { HEIGHTFIELD_WATER_DEFAULT_DEPTH } from "./constants";
import type { PreparedHeightfieldWaterData } from "./internalTypes";

function freezeVector2(x: number, y: number): readonly [number, number] {
  return Object.freeze([x, y] as const);
}

function freezeVector3(x: number, y: number, z: number): readonly [number, number, number] {
  return Object.freeze([x, y, z] as const);
}

export function prepareHeightfieldWaterData(descriptor: HeightfieldWaterDescriptorV1): PreparedHeightfieldWaterData {
  const { width, height, originXZ, cellSizeXZ } = descriptor.grid;
  const texelCount = width * height;
  const wetMask = new Uint8Array(texelCount);
  const wetOrdinalByTexel = new Int32Array(texelCount);
  const componentIndices = new Int32Array(texelCount);
  const surfaceHeights = new Float32Array(texelCount);
  const bedHeights = new Float32Array(texelCount);
  const flowVectorsXZ = new Float32Array(texelCount * 2);
  wetOrdinalByTexel.fill(-1);
  componentIndices.fill(-1);
  surfaceHeights.fill(Number.NaN);
  bedHeights.fill(Number.NaN);

  for (let ordinal = 0; ordinal < descriptor.wetTexelIndices.length; ordinal++) {
    const texelIndex = descriptor.wetTexelIndices[ordinal];
    wetMask[texelIndex] = 1;
    wetOrdinalByTexel[texelIndex] = ordinal;
    surfaceHeights[texelIndex] = descriptor.surfaceHeights[ordinal];
    bedHeights[texelIndex] =
      descriptor.bedHeights?.[ordinal] ?? descriptor.surfaceHeights[ordinal] - HEIGHTFIELD_WATER_DEFAULT_DEPTH;
    flowVectorsXZ[texelIndex * 2] = descriptor.flowVectorsXZ?.[ordinal * 2] ?? 0;
    flowVectorsXZ[texelIndex * 2 + 1] = descriptor.flowVectorsXZ?.[ordinal * 2 + 1] ?? 0;
  }

  const componentTexels: number[][] = [];
  for (const seedIndex of descriptor.wetTexelIndices) {
    if (componentIndices[seedIndex] >= 0) continue;
    const componentIndex = componentTexels.length;
    const texels: number[] = [];
    const queue: number[] = [seedIndex];
    componentIndices[seedIndex] = componentIndex;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const texelIndex = queue[cursor];
      texels.push(texelIndex);
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
          queue.push(neighbour);
        }
      }
    }
    texels.sort((a, b) => a - b);
    componentTexels.push(texels);
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

export function createHeightfieldWaterQueryGrid(prepared: PreparedHeightfieldWaterData) {
  return Object.freeze({
    grid: prepared.descriptor.grid,
    wetMask: new HeightfieldReadonlyUint8Buffer(prepared.wetMask),
    componentIndices: new HeightfieldReadonlyInt32Buffer(prepared.componentIndices),
    surfaceHeights: new HeightfieldReadonlyFloat32Buffer(prepared.surfaceHeights),
    bedHeights: new HeightfieldReadonlyFloat32Buffer(prepared.bedHeights),
    flowVectorsXZ: new HeightfieldReadonlyFloat32Buffer(prepared.flowVectorsXZ)
  });
}
