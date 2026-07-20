/** Deterministic RGBA8 flow/depth/signed-distance atlas compilation. */
import { HeightfieldReadonlyUint8Buffer } from "./HeightfieldNumericBuffer";
import type { HeightfieldWaterLocalMapAtlas } from "./HeightfieldWaterCompiledTypes";
import { HEIGHTFIELD_WATER_ATLAS_MAX_EDGE } from "./constants";
import type { PreparedHeightfieldWaterData } from "./internalTypes";

const DISTANCE_INFINITY = 1e20;

function squaredDistanceTransform1D(source: Float64Array, output: Float64Array): void {
  const length = source.length;
  const locations = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  let envelopeIndex = 0;
  locations[0] = 0;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;
  for (let point = 1; point < length; point++) {
    let separation =
      (source[point] + point * point - (source[locations[envelopeIndex]] + locations[envelopeIndex] ** 2)) /
      (2 * point - 2 * locations[envelopeIndex]);
    while (separation <= boundaries[envelopeIndex]) {
      envelopeIndex--;
      separation =
        (source[point] + point * point - (source[locations[envelopeIndex]] + locations[envelopeIndex] ** 2)) /
        (2 * point - 2 * locations[envelopeIndex]);
    }
    envelopeIndex++;
    locations[envelopeIndex] = point;
    boundaries[envelopeIndex] = separation;
    boundaries[envelopeIndex + 1] = Number.POSITIVE_INFINITY;
  }
  envelopeIndex = 0;
  for (let point = 0; point < length; point++) {
    while (boundaries[envelopeIndex + 1] < point) envelopeIndex++;
    const distance = point - locations[envelopeIndex];
    output[point] = distance * distance + source[locations[envelopeIndex]];
  }
}

function squaredDistanceTransform(mask: Uint8Array, width: number, height: number, target: number): Float64Array {
  const intermediate = new Float64Array(width * height);
  const output = new Float64Array(width * height);
  const rowSource = new Float64Array(width);
  const rowOutput = new Float64Array(width);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) rowSource[x] = mask[z * width + x] === target ? 0 : DISTANCE_INFINITY;
    squaredDistanceTransform1D(rowSource, rowOutput);
    intermediate.set(rowOutput, z * width);
  }
  const columnSource = new Float64Array(height);
  const columnOutput = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) columnSource[z] = intermediate[z * width + x];
    squaredDistanceTransform1D(columnSource, columnOutput);
    for (let z = 0; z < height; z++) output[z * width + x] = columnOutput[z];
  }
  return output;
}

function encodeSignedUnit(value: number): number {
  return Math.max(0, Math.min(255, Math.round((value * 0.5 + 0.5) * 255)));
}

function encodeUnit(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function compileHeightfieldWaterLocalMap(
  prepared: PreparedHeightfieldWaterData,
  aggregationScale: number
): HeightfieldWaterLocalMapAtlas {
  const { descriptor, wetMask, bedHeights, surfaceHeights, flowVectorsXZ } = prepared;
  const { grid, quality, material } = descriptor;
  const maxEdge = HEIGHTFIELD_WATER_ATLAS_MAX_EDGE[quality];
  const resolutionScale = Math.min(1, maxEdge / Math.max(grid.width, grid.height));
  const width = Math.max(1, Math.round(grid.width * resolutionScale));
  const height = Math.max(1, Math.round(grid.height * resolutionScale));
  const atlasMask = new Uint8Array(width * height);
  const atlasFlow = new Float32Array(width * height * 2);
  const atlasDepth = new Float32Array(width * height);
  let flowDecodeScale = 0;
  let maxDepth = 0;
  for (let sourceIndex = 0; sourceIndex < wetMask.length; sourceIndex++) {
    if (wetMask[sourceIndex] === 0) continue;
    flowDecodeScale = Math.max(
      flowDecodeScale,
      Math.abs(flowVectorsXZ[sourceIndex * 2]),
      Math.abs(flowVectorsXZ[sourceIndex * 2 + 1])
    );
    maxDepth = Math.max(maxDepth, Math.max(0, surfaceHeights[sourceIndex] - bedHeights[sourceIndex]));
  }

  for (let atlasZ = 0; atlasZ < height; atlasZ++) {
    const sourceMinZ = Math.floor((atlasZ * grid.height) / height);
    const sourceMaxZ = Math.max(sourceMinZ + 1, Math.ceil(((atlasZ + 1) * grid.height) / height));
    for (let atlasX = 0; atlasX < width; atlasX++) {
      const sourceMinX = Math.floor((atlasX * grid.width) / width);
      const sourceMaxX = Math.max(sourceMinX + 1, Math.ceil(((atlasX + 1) * grid.width) / width));
      let wetCount = 0;
      let flowX = 0;
      let flowZ = 0;
      let depth = 0;
      for (let sourceZ = sourceMinZ; sourceZ < Math.min(grid.height, sourceMaxZ); sourceZ++) {
        for (let sourceX = sourceMinX; sourceX < Math.min(grid.width, sourceMaxX); sourceX++) {
          const sourceIndex = sourceZ * grid.width + sourceX;
          if (wetMask[sourceIndex] === 0) continue;
          wetCount++;
          flowX += flowVectorsXZ[sourceIndex * 2];
          flowZ += flowVectorsXZ[sourceIndex * 2 + 1];
          depth += Math.max(0, surfaceHeights[sourceIndex] - bedHeights[sourceIndex]);
        }
      }
      const atlasIndex = atlasZ * width + atlasX;
      if (wetCount > 0) {
        atlasMask[atlasIndex] = 1;
        atlasFlow[atlasIndex * 2] = flowX / wetCount;
        atlasFlow[atlasIndex * 2 + 1] = flowZ / wetCount;
        atlasDepth[atlasIndex] = depth / wetCount;
      }
    }
  }

  // One dry texel of padding makes a finite shoreline even when every source texel is wet.
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const paddedMask = new Uint8Array(paddedWidth * paddedHeight);
  for (let z = 0; z < height; z++)
    paddedMask.set(atlasMask.subarray(z * width, (z + 1) * width), (z + 1) * paddedWidth + 1);
  const distanceToDry = squaredDistanceTransform(paddedMask, paddedWidth, paddedHeight, 0);
  const distanceToWet = squaredDistanceTransform(paddedMask, paddedWidth, paddedHeight, 1);
  const metresPerAtlasPixel = Math.min(
    (grid.width * grid.cellSizeXZ[0]) / width,
    (grid.height * grid.cellSizeXZ[1]) / height
  );
  const signedDistanceRange = Math.max(
    1,
    material.shoreFoamWidth * 2,
    Math.max(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * aggregationScale * 2
  );
  const pixels = new Uint8Array(width * height * 4);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const atlasIndex = z * width + x;
      const paddedIndex = (z + 1) * paddedWidth + x + 1;
      const isWet = atlasMask[atlasIndex] === 1;
      const signedDistance =
        (isWet ? Math.sqrt(distanceToDry[paddedIndex]) : -Math.sqrt(distanceToWet[paddedIndex])) * metresPerAtlasPixel;
      const pixelOffset = atlasIndex * 4;
      pixels[pixelOffset] = flowDecodeScale > 0 ? encodeSignedUnit(atlasFlow[atlasIndex * 2] / flowDecodeScale) : 128;
      pixels[pixelOffset + 1] =
        flowDecodeScale > 0 ? encodeSignedUnit(atlasFlow[atlasIndex * 2 + 1] / flowDecodeScale) : 128;
      pixels[pixelOffset + 2] = maxDepth > 0 ? encodeUnit(atlasDepth[atlasIndex] / maxDepth) : 0;
      pixels[pixelOffset + 3] = encodeSignedUnit(Math.max(-1, Math.min(1, signedDistance / signedDistanceRange)));
    }
  }

  const worldWidth = grid.width * grid.cellSizeXZ[0];
  const worldHeight = grid.height * grid.cellSizeXZ[1];
  const gridMinX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
  const gridMinZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
  return Object.freeze({
    width,
    height,
    pixels: new HeightfieldReadonlyUint8Buffer(pixels),
    worldToUv: Object.freeze([
      1 / worldWidth,
      1 / worldHeight,
      -gridMinX / worldWidth,
      -gridMinZ / worldHeight
    ] as const),
    flowDecodeScale,
    maxDepth,
    signedDistanceRange
  });
}
