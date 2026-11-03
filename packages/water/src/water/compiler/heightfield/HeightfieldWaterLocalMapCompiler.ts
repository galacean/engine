import { compileHeightfieldWaterShoreDistances } from "./HeightfieldWaterShoreDistanceCompiler";
import { sampleWaterTerrainHeight } from "../../authoring/terrain/WaterTerrainSnapshot";
import { sampleLakeSignedShoreDistance } from "../lake/LakeBoundaryCompiler";
import type { SampledLakeBoundary } from "../../authoring/lake/LakeBoundary";
/** Deterministic RGBA8 flow/depth/signed-distance atlas compilation. */
import type { HeightfieldWaterBasinTerrainCoverageV1 } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import { HeightfieldReadonlyUint8Buffer } from "./HeightfieldNumericBuffer";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import type { HeightfieldWaterLocalMapAtlas } from "./HeightfieldWaterCompiledTypes";
import { HEIGHTFIELD_WATER_ATLAS_MAX_EDGE } from "./constants";
import type { PreparedHeightfieldWaterData } from "./internalTypes";

const MINIMUM_TERRAIN_SLOPE = 0.01;

interface BasinTerrainCoverageAtlasFields {
  readonly maximumDepth: number;
  readonly signedVerticalDepth: Float32Array;
  readonly supportMask: Uint8Array;
}

export function resolveHeightfieldWaterLocalMapDimensions(
  prepared: PreparedHeightfieldWaterData
): Readonly<{ width: number; height: number; pixelCount: number }> {
  return resolveHeightfieldWaterLocalMapDimensionsForDescriptor(prepared.descriptor);
}

/** Descriptor-only allocation count, safe to call before PreparedData exists. */
export function resolveHeightfieldWaterLocalMapDimensionsForDescriptor(
  descriptor: HeightfieldWaterDescriptorV1
): Readonly<{ width: number; height: number; pixelCount: number }> {
  const terrainCoverage =
    descriptor.renderSurface && descriptor.renderSurface.coverage !== "geometry"
      ? descriptor.renderSurface.coverage
      : undefined;
  const mapGrid = terrainCoverage?.grid ?? descriptor.grid;
  const maxEdge = HEIGHTFIELD_WATER_ATLAS_MAX_EDGE[descriptor.quality];
  const resolutionScale = Math.min(1, maxEdge / Math.max(mapGrid.width, mapGrid.height));
  const width = Math.max(1, Math.round(mapGrid.width * resolutionScale));
  const height = Math.max(1, Math.round(mapGrid.height * resolutionScale));
  return Object.freeze({ width, height, pixelCount: width * height });
}

function encodeSignedUnit(value: number): number {
  return Math.max(0, Math.min(255, Math.round((value * 0.5 + 0.5) * 255)));
}

function encodeUnit(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function compileHeightfieldWaterLocalMap(
  prepared: PreparedHeightfieldWaterData,
  aggregationScale: number,
  sampledLakeBoundary?: SampledLakeBoundary
): HeightfieldWaterLocalMapAtlas {
  const { descriptor, wetMask, bedHeights, surfaceHeights, flowVectorsXZ } = prepared;
  const { grid, spatialField } = descriptor;
  const authoredBoundary = sampledLakeBoundary?.queryCoverage === "boundary" ? sampledLakeBoundary : undefined;
  const terrainCoverage =
    descriptor.renderSurface && descriptor.renderSurface.coverage !== "geometry"
      ? descriptor.renderSurface.coverage
      : undefined;
  const mapGrid = terrainCoverage?.grid ?? grid;
  const { width, height } = resolveHeightfieldWaterLocalMapDimensions(prepared);
  const atlasMask = new Uint8Array(width * height);
  const atlasFlow = new Float32Array(width * height * 2);
  const atlasDepth = new Float32Array(width * height);
  let flowDecodeScale = 0;
  let maxDepth = 0;
  let basinTerrainFields: BasinTerrainCoverageAtlasFields | undefined;
  if (terrainCoverage) {
    basinTerrainFields = populateBasinTerrainCoverageAtlas(atlasMask, atlasDepth, width, height, terrainCoverage);
    maxDepth = basinTerrainFields.maximumDepth;
  } else {
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
  }

  if (descriptor.bedTerrain && descriptor.lakeBoundary) {
    // GPU data remains a quantized raster field. Sample the canonical mixed-topology bed
    // at each texel centre; never reinterpret refinement vertices as bilinear cells.
    const minX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
    const minZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
    const sx = (grid.width * grid.cellSizeXZ[0]) / width,
      sz = (grid.height * grid.cellSizeXZ[1]) / height;
    for (let z = 0; z < height; z++)
      for (let x = 0; x < width; x++) {
        const bed = sampleWaterTerrainHeight(descriptor.bedTerrain, minX + (x + 0.5) * sx, minZ + (z + 0.5) * sz);
        const depth = bed === undefined ? 0 : Math.max(0, descriptor.lakeBoundary.waterLevel - bed);
        atlasDepth[z * width + x] = depth;
        maxDepth = Math.max(maxDepth, depth);
      }
  }

  // Render-only surfaces derive coverage from the same triangles as the mesh.
  // One conservative texel dilation keeps bilinear SDF sampling from clipping
  // the geometric edge. Query wetness remains the original semantic mask in
  // HeightfieldWaterQueryGrid.
  if (!authoredBoundary && descriptor.renderSurface?.coverage === "geometry") {
    rasterizeRenderSurfaceCoverage(
      atlasMask,
      width,
      height,
      descriptor.renderSurface.triangleVertices,
      grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5,
      grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5,
      grid.width * grid.cellSizeXZ[0],
      grid.height * grid.cellSizeXZ[1]
    );
  }

  const atlasCellSizeX = (mapGrid.width * mapGrid.cellSizeXZ[0]) / width;
  const atlasCellSizeZ = (mapGrid.height * mapGrid.cellSizeXZ[1]) / height;
  // Authored Lakes use exact sampled shoreline distances; raster coverage is unnecessary.
  const rasterSignedDistances = authoredBoundary
    ? undefined
    : basinTerrainFields
      ? compileBasinTerrainSignedDistances(
          basinTerrainFields.signedVerticalDepth,
          basinTerrainFields.supportMask,
          width,
          height,
          atlasCellSizeX,
          atlasCellSizeZ
        )
      : compileBinarySignedDistances(atlasMask, width, height, atlasCellSizeX, atlasCellSizeZ);
  const signedDistanceRange = Math.max(
    spatialField.signedDistanceRange,
    Math.max(mapGrid.cellSizeXZ[0], mapGrid.cellSizeXZ[1]) * aggregationScale * 2
  );
  const pixels = new Uint8Array(width * height * 4);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const atlasIndex = z * width + x;
      const signedDistance = authoredBoundary
        ? sampleLakeSignedShoreDistance(
            authoredBoundary.rings,
            mapGrid.originXZ[0] - mapGrid.cellSizeXZ[0] * 0.5 + (x + 0.5) * atlasCellSizeX,
            mapGrid.originXZ[1] - mapGrid.cellSizeXZ[1] * 0.5 + (z + 0.5) * atlasCellSizeZ
          )
        : rasterSignedDistances![atlasIndex];
      const pixelOffset = atlasIndex * 4;
      pixels[pixelOffset] = flowDecodeScale > 0 ? encodeSignedUnit(atlasFlow[atlasIndex * 2] / flowDecodeScale) : 128;
      pixels[pixelOffset + 1] =
        flowDecodeScale > 0 ? encodeSignedUnit(atlasFlow[atlasIndex * 2 + 1] / flowDecodeScale) : 128;
      pixels[pixelOffset + 2] = maxDepth > 0 ? encodeUnit(atlasDepth[atlasIndex] / maxDepth) : 0;
      pixels[pixelOffset + 3] = encodeSignedUnit(Math.max(-1, Math.min(1, signedDistance / signedDistanceRange)));
    }
  }

  const worldWidth = mapGrid.width * mapGrid.cellSizeXZ[0];
  const worldHeight = mapGrid.height * mapGrid.cellSizeXZ[1];
  const gridMinX = mapGrid.originXZ[0] - mapGrid.cellSizeXZ[0] * 0.5;
  const gridMinZ = mapGrid.originXZ[1] - mapGrid.cellSizeXZ[1] * 0.5;
  return Object.freeze({
    width,
    height,
    pixels: new HeightfieldReadonlyUint8Buffer(pixels, WaterBufferOwnership.Transfer),
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

function populateBasinTerrainCoverageAtlas(
  mask: Uint8Array,
  depths: Float32Array,
  width: number,
  height: number,
  coverage: HeightfieldWaterBasinTerrainCoverageV1
): BasinTerrainCoverageAtlasFields {
  const sourceWidth = coverage.grid.width;
  const sourceHeight = coverage.grid.height;
  const signedVerticalDepth = new Float32Array(width * height);
  const supportMask = new Uint8Array(width * height);
  let maximumDepth = 0;
  for (let atlasZ = 0; atlasZ < height; atlasZ++) {
    const sourceMinZ = Math.floor((atlasZ * sourceHeight) / height);
    const sourceMaxZ = Math.max(sourceMinZ + 1, Math.ceil(((atlasZ + 1) * sourceHeight) / height));
    for (let atlasX = 0; atlasX < width; atlasX++) {
      const sourceMinX = Math.floor((atlasX * sourceWidth) / width);
      const sourceMaxX = Math.max(sourceMinX + 1, Math.ceil(((atlasX + 1) * sourceWidth) / width));
      let supportCount = 0;
      let depthSum = 0;
      for (let sourceZ = sourceMinZ; sourceZ < Math.min(sourceHeight, sourceMaxZ); sourceZ++) {
        for (let sourceX = sourceMinX; sourceX < Math.min(sourceWidth, sourceMaxX); sourceX++) {
          const sourceIndex = sourceZ * sourceWidth + sourceX;
          if (coverage.basinSupport[sourceIndex] === 0) continue;
          supportCount++;
          const depth = coverage.waterLevel - coverage.terrainHeights[sourceIndex]! - coverage.minimumVisibleDepth;
          depthSum += depth;
          maximumDepth = Math.max(maximumDepth, Math.max(0, depth));
        }
      }
      if (supportCount === 0) continue;
      const atlasIndex = atlasZ * width + atlasX;
      const meanDepth = depthSum / supportCount;
      supportMask[atlasIndex] = 1;
      signedVerticalDepth[atlasIndex] = meanDepth;
      if (meanDepth > 0) {
        mask[atlasIndex] = 1;
        depths[atlasIndex] = meanDepth;
      }
    }
  }
  return Object.freeze({ maximumDepth, signedVerticalDepth, supportMask });
}

function compileBinarySignedDistances(
  mask: Uint8Array,
  width: number,
  height: number,
  cellSizeX: number,
  cellSizeZ: number
): Float32Array {
  // Same exposed-cell-edge convention and anisotropic metre weights as CPU queries.
  return compileHeightfieldWaterShoreDistances(mask, {
    originXZ: [0, 0],
    width,
    height,
    cellSizeXZ: [cellSizeX, cellSizeZ]
  });
}

function compileBasinTerrainSignedDistances(
  signedVerticalDepth: Float32Array,
  supportMask: Uint8Array,
  width: number,
  height: number,
  cellSizeX: number,
  cellSizeZ: number
): Float32Array {
  const supportDistances = compileBinarySignedDistances(supportMask, width, height, cellSizeX, cellSizeZ);
  const distances = new Float32Array(width * height);
  const sampleDepth = (x: number, z: number, fallback: number): number => {
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedZ = Math.max(0, Math.min(height - 1, z));
    const index = clampedZ * width + clampedX;
    return supportMask[index] === 1 ? signedVerticalDepth[index]! : fallback;
  };
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      if (supportMask[index] === 0) {
        distances[index] = supportDistances[index]!;
        continue;
      }
      const center = signedVerticalDepth[index]!;
      const gradientX = (sampleDepth(x + 1, z, center) - sampleDepth(x - 1, z, center)) / (2 * cellSizeX);
      const gradientZ = (sampleDepth(x, z + 1, center) - sampleDepth(x, z - 1, center)) / (2 * cellSizeZ);
      const terrainSlope = Math.max(MINIMUM_TERRAIN_SLOPE, Math.hypot(gradientX, gradientZ));
      const terrainIntersectionDistance = center / terrainSlope;
      distances[index] = Math.min(terrainIntersectionDistance, supportDistances[index]!);
    }
  }
  return distances;
}

function rasterizeRenderSurfaceCoverage(
  mask: Uint8Array,
  width: number,
  height: number,
  triangleVertices: Float32Array,
  minimumWorldX: number,
  minimumWorldZ: number,
  worldWidth: number,
  worldHeight: number
): void {
  mask.fill(0);
  const covered = new Uint8Array(mask.length);
  const toAtlasX = (worldX: number): number => ((worldX - minimumWorldX) / worldWidth) * width;
  const toAtlasZ = (worldZ: number): number => ((worldZ - minimumWorldZ) / worldHeight) * height;
  for (let offset = 0; offset < triangleVertices.length; offset += 9) {
    const ax = toAtlasX(triangleVertices[offset]!);
    const az = toAtlasZ(triangleVertices[offset + 2]!);
    const bx = toAtlasX(triangleVertices[offset + 3]!);
    const bz = toAtlasZ(triangleVertices[offset + 5]!);
    const cx = toAtlasX(triangleVertices[offset + 6]!);
    const cz = toAtlasZ(triangleVertices[offset + 8]!);
    const minimumX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const minimumZ = Math.max(0, Math.floor(Math.min(az, bz, cz)));
    const maximumX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)) - 1);
    const maximumZ = Math.min(height - 1, Math.ceil(Math.max(az, bz, cz)) - 1);
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        if (triangleIntersectsUnitCell(ax, az, bx, bz, cx, cz, x, z)) covered[z * width + x] = 1;
      }
    }
  }
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let isCovered = false;
      for (let dz = -1; dz <= 1 && !isCovered; dz++) {
        const sourceZ = z + dz;
        if (sourceZ < 0 || sourceZ >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const sourceX = x + dx;
          if (sourceX < 0 || sourceX >= width) continue;
          if (covered[sourceZ * width + sourceX]) {
            isCovered = true;
            break;
          }
        }
      }
      if (isCovered) mask[z * width + x] = 1;
    }
  }
}

function triangleIntersectsUnitCell(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  cellX: number,
  cellZ: number
): boolean {
  const maximumX = cellX + 1;
  const maximumZ = cellZ + 1;
  if (
    pointInRectangle(ax, az, cellX, cellZ, maximumX, maximumZ) ||
    pointInRectangle(bx, bz, cellX, cellZ, maximumX, maximumZ) ||
    pointInRectangle(cx, cz, cellX, cellZ, maximumX, maximumZ)
  ) {
    return true;
  }
  if (
    pointInTriangle(cellX, cellZ, ax, az, bx, bz, cx, cz) ||
    pointInTriangle(maximumX, cellZ, ax, az, bx, bz, cx, cz) ||
    pointInTriangle(cellX, maximumZ, ax, az, bx, bz, cx, cz) ||
    pointInTriangle(maximumX, maximumZ, ax, az, bx, bz, cx, cz)
  ) {
    return true;
  }
  return (
    triangleEdgeIntersectsUnitCell(ax, az, bx, bz, cellX, cellZ, maximumX, maximumZ) ||
    triangleEdgeIntersectsUnitCell(bx, bz, cx, cz, cellX, cellZ, maximumX, maximumZ) ||
    triangleEdgeIntersectsUnitCell(cx, cz, ax, az, cellX, cellZ, maximumX, maximumZ)
  );
}

function triangleEdgeIntersectsUnitCell(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number
): boolean {
  return (
    segmentsIntersect(ax, az, bx, bz, minimumX, minimumZ, maximumX, minimumZ) ||
    segmentsIntersect(ax, az, bx, bz, maximumX, minimumZ, maximumX, maximumZ) ||
    segmentsIntersect(ax, az, bx, bz, maximumX, maximumZ, minimumX, maximumZ) ||
    segmentsIntersect(ax, az, bx, bz, minimumX, maximumZ, minimumX, minimumZ)
  );
}

function pointInRectangle(
  x: number,
  z: number,
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number
): boolean {
  return x >= minimumX && x <= maximumX && z >= minimumZ && z <= maximumZ;
}

function pointInTriangle(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number
): boolean {
  const first = cross2d(bx - ax, bz - az, x - ax, z - az);
  const second = cross2d(cx - bx, cz - bz, x - bx, z - bz);
  const third = cross2d(ax - cx, az - cz, x - cx, z - cz);
  return (first >= 0 && second >= 0 && third >= 0) || (first <= 0 && second <= 0 && third <= 0);
}

function segmentsIntersect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const abC = cross2d(bx - ax, bz - az, cx - ax, cz - az);
  const abD = cross2d(bx - ax, bz - az, dx - ax, dz - az);
  const cdA = cross2d(dx - cx, dz - cz, ax - cx, az - cz);
  const cdB = cross2d(dx - cx, dz - cz, bx - cx, bz - cz);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

function cross2d(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}
