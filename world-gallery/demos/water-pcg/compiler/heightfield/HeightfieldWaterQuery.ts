/** Engine-independent static base-surface queries over compiled heightfield-water data. */
import type {
  HeightfieldWaterCompiledData,
  HeightfieldWaterQuerySample,
  HeightfieldWaterVector3
} from "./HeightfieldWaterCompiledTypes";

function vector3(x: number, y: number, z: number): HeightfieldWaterVector3 {
  return Object.freeze([x, y, z] as const);
}

function outsideSample(shoreDistance: number): HeightfieldWaterQuerySample {
  return Object.freeze({
    inside: false,
    componentIndex: -1,
    surfaceHeight: Number.NaN,
    normal: vector3(0, 1, 0),
    depth: 0,
    shoreDistance,
    flowVectorXZ: Object.freeze([0, 0] as const)
  });
}

function sampleAtlasShoreDistance(data: HeightfieldWaterCompiledData, worldX: number, worldZ: number): number {
  const atlas = data.localMapAtlas;
  const pixels = atlas.pixels.toTypedArray();
  const u = worldX * atlas.worldToUv[0] + atlas.worldToUv[2];
  const v = worldZ * atlas.worldToUv[1] + atlas.worldToUv[3];
  const pixelX = Math.max(0, Math.min(atlas.width - 1, u * atlas.width - 0.5));
  const pixelZ = Math.max(0, Math.min(atlas.height - 1, v * atlas.height - 0.5));
  const x0 = Math.floor(pixelX);
  const z0 = Math.floor(pixelZ);
  const x1 = Math.min(atlas.width - 1, x0 + 1);
  const z1 = Math.min(atlas.height - 1, z0 + 1);
  const tx = pixelX - x0;
  const tz = pixelZ - z0;
  const decode = (x: number, z: number): number =>
    ((pixels[(z * atlas.width + x) * 4 + 3] / 255) * 2 - 1) * atlas.signedDistanceRange;
  const top = decode(x0, z0) * (1 - tx) + decode(x1, z0) * tx;
  const bottom = decode(x0, z1) * (1 - tx) + decode(x1, z1) * tx;
  return top * (1 - tz) + bottom * tz;
}

export function sampleHeightfieldWaterBase(
  data: HeightfieldWaterCompiledData,
  worldX: number,
  worldZ: number
): HeightfieldWaterQuerySample {
  const query = data.queryGrid;
  const { grid } = query;
  const gridMinX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
  const gridMinZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
  const containingX = Math.floor((worldX - gridMinX) / grid.cellSizeXZ[0]);
  const containingZ = Math.floor((worldZ - gridMinZ) / grid.cellSizeXZ[1]);
  const shoreDistance = sampleAtlasShoreDistance(data, worldX, worldZ);
  if (containingX < 0 || containingZ < 0 || containingX >= grid.width || containingZ >= grid.height) {
    return outsideSample(shoreDistance);
  }
  const wetMask = query.wetMask.toTypedArray();
  const componentIndices = query.componentIndices.toTypedArray();
  const surfaceHeights = query.surfaceHeights.toTypedArray();
  const bedHeights = query.bedHeights.toTypedArray();
  const flowVectors = query.flowVectorsXZ.toTypedArray();
  const containingIndex = containingZ * grid.width + containingX;
  if (wetMask[containingIndex] === 0) return outsideSample(shoreDistance);
  const componentIndex = componentIndices[containingIndex];

  const gridX = (worldX - grid.originXZ[0]) / grid.cellSizeXZ[0];
  const gridZ = (worldZ - grid.originXZ[1]) / grid.cellSizeXZ[1];
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const tx = gridX - x0;
  const tz = gridZ - z0;
  const candidates = [
    [x0, z0, (1 - tx) * (1 - tz)],
    [x0 + 1, z0, tx * (1 - tz)],
    [x0, z0 + 1, (1 - tx) * tz],
    [x0 + 1, z0 + 1, tx * tz]
  ] as const;
  let totalWeight = 0;
  let surfaceHeight = 0;
  let bedHeight = 0;
  let flowX = 0;
  let flowZ = 0;
  for (const [x, z, weight] of candidates) {
    if (x < 0 || z < 0 || x >= grid.width || z >= grid.height) continue;
    const index = z * grid.width + x;
    if (componentIndices[index] !== componentIndex) continue;
    totalWeight += weight;
    surfaceHeight += surfaceHeights[index] * weight;
    bedHeight += bedHeights[index] * weight;
    flowX += flowVectors[index * 2] * weight;
    flowZ += flowVectors[index * 2 + 1] * weight;
  }
  if (totalWeight <= 1e-8) {
    surfaceHeight = surfaceHeights[containingIndex];
    bedHeight = bedHeights[containingIndex];
    flowX = flowVectors[containingIndex * 2];
    flowZ = flowVectors[containingIndex * 2 + 1];
    totalWeight = 1;
  }
  surfaceHeight /= totalWeight;
  bedHeight /= totalWeight;
  flowX /= totalWeight;
  flowZ /= totalWeight;

  const sameComponentHeight = (x: number, z: number): number | undefined => {
    if (x < 0 || z < 0 || x >= grid.width || z >= grid.height) return undefined;
    const index = z * grid.width + x;
    return componentIndices[index] === componentIndex ? surfaceHeights[index] : undefined;
  };
  const centerHeight = surfaceHeights[containingIndex];
  const left = sameComponentHeight(containingX - 1, containingZ);
  const right = sameComponentHeight(containingX + 1, containingZ);
  const up = sameComponentHeight(containingX, containingZ - 1);
  const down = sameComponentHeight(containingX, containingZ + 1);
  const gradientX =
    ((right ?? centerHeight) - (left ?? centerHeight)) /
    (grid.cellSizeXZ[0] * (left !== undefined && right !== undefined ? 2 : 1));
  const gradientZ =
    ((down ?? centerHeight) - (up ?? centerHeight)) /
    (grid.cellSizeXZ[1] * (up !== undefined && down !== undefined ? 2 : 1));
  const normalLength = Math.hypot(gradientX, 1, gradientZ);

  return Object.freeze({
    inside: true,
    componentIndex,
    surfaceHeight,
    normal: vector3(-gradientX / normalLength, 1 / normalLength, -gradientZ / normalLength),
    depth: Math.max(0, surfaceHeight - bedHeight),
    shoreDistance,
    flowVectorXZ: Object.freeze([flowX, flowZ] as const)
  });
}
