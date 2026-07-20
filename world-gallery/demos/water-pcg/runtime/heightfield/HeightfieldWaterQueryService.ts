/** Allocation-free static base-surface queries over the compiler's dense source grid. */
import type {
  HeightfieldWaterCompiledData,
  HeightfieldWaterQueryGrid
} from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { HeightfieldWaterBaseQueryResult } from "./types";

const OUTSIDE_COMPONENT_INDEX = -1;

export function createHeightfieldWaterBaseQueryResult(): HeightfieldWaterBaseQueryResult {
  return {
    inside: false,
    componentIndex: OUTSIDE_COMPONENT_INDEX,
    surfaceHeight: Number.NaN,
    surfaceNormal: [0, 1, 0],
    depth: 0,
    signedShoreDistance: Number.NEGATIVE_INFINITY,
    flowVectorXZ: [0, 0]
  };
}

export class HeightfieldWaterBaseQueryService {
  private readonly _wetMask: Uint8Array;
  private readonly _componentIndices: Int32Array;
  private readonly _surfaceHeights: Float32Array;
  private readonly _bedHeights: Float32Array;
  private readonly _flowVectorsXZ: Float32Array;
  private readonly _atlasPixels: Uint8Array;

  constructor(private readonly _data: HeightfieldWaterCompiledData) {
    const query = _data.queryGrid;
    this._wetMask = query.wetMask.toTypedArray();
    this._componentIndices = query.componentIndices.toTypedArray();
    this._surfaceHeights = query.surfaceHeights.toTypedArray();
    this._bedHeights = query.bedHeights.toTypedArray();
    this._flowVectorsXZ = query.flowVectorsXZ.toTypedArray();
    this._atlasPixels = _data.localMapAtlas.pixels.toTypedArray();
  }

  /** Samples the undisplaced water surface. Dynamic Gerstner displacement is intentionally excluded in V1. */
  sampleBaseSurface(
    worldX: number,
    worldZ: number,
    out: HeightfieldWaterBaseQueryResult
  ): HeightfieldWaterBaseQueryResult {
    this._reset(out);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return out;
    const query = this._data.queryGrid;
    const gridX = (worldX - query.grid.originXZ[0]) / query.grid.cellSizeXZ[0];
    const gridZ = (worldZ - query.grid.originXZ[1]) / query.grid.cellSizeXZ[1];
    if (gridX < -0.5 || gridZ < -0.5 || gridX >= query.grid.width - 0.5 || gridZ >= query.grid.height - 0.5) {
      return out;
    }
    const texelX = Math.floor(gridX + 0.5);
    const texelZ = Math.floor(gridZ + 0.5);
    const texelIndex = texelZ * query.grid.width + texelX;
    if (this._wetMask[texelIndex] === 0) {
      out.signedShoreDistance = this._sampleSignedShoreDistance(worldX, worldZ);
      return out;
    }

    const componentIndex = this._componentIndices[texelIndex];
    const surfaceHeight = this._sampleScalar(query, this._surfaceHeights, gridX, gridZ, componentIndex);
    const bedHeight = this._sampleScalar(query, this._bedHeights, gridX, gridZ, componentIndex);
    const flowX = this._sampleFlow(query, gridX, gridZ, componentIndex, 0);
    const flowZ = this._sampleFlow(query, gridX, gridZ, componentIndex, 1);
    const gradientX = this._surfaceGradient(query, texelX, texelZ, componentIndex, true);
    const gradientZ = this._surfaceGradient(query, texelX, texelZ, componentIndex, false);
    const normalLength = Math.hypot(gradientX, 1, gradientZ);

    out.inside = true;
    out.componentIndex = componentIndex;
    out.surfaceHeight = surfaceHeight;
    out.surfaceNormal[0] = -gradientX / normalLength;
    out.surfaceNormal[1] = 1 / normalLength;
    out.surfaceNormal[2] = -gradientZ / normalLength;
    out.depth = Math.max(0, surfaceHeight - bedHeight);
    out.signedShoreDistance = this._sampleSignedShoreDistance(worldX, worldZ);
    out.flowVectorXZ[0] = flowX;
    out.flowVectorXZ[1] = flowZ;
    return out;
  }

  private _sampleScalar(
    query: HeightfieldWaterQueryGrid,
    values: Float32Array,
    gridX: number,
    gridZ: number,
    componentIndex: number
  ): number {
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const tx = gridX - x0;
    const tz = gridZ - z0;
    let sum = 0;
    let totalWeight = 0;
    for (let zOffset = 0; zOffset <= 1; zOffset++) {
      const z = z0 + zOffset;
      const zWeight = zOffset === 0 ? 1 - tz : tz;
      for (let xOffset = 0; xOffset <= 1; xOffset++) {
        const x = x0 + xOffset;
        const weight = (xOffset === 0 ? 1 - tx : tx) * zWeight;
        if (x < 0 || z < 0 || x >= query.grid.width || z >= query.grid.height) continue;
        const index = z * query.grid.width + x;
        if (this._componentIndices[index] !== componentIndex || !Number.isFinite(values[index])) continue;
        sum += values[index] * weight;
        totalWeight += weight;
      }
    }
    if (totalWeight > 0.000001) return sum / totalWeight;
    return Number.NaN;
  }

  private _sampleFlow(
    query: HeightfieldWaterQueryGrid,
    gridX: number,
    gridZ: number,
    componentIndex: number,
    channel: 0 | 1
  ): number {
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const tx = gridX - x0;
    const tz = gridZ - z0;
    let sum = 0;
    let totalWeight = 0;
    for (let zOffset = 0; zOffset <= 1; zOffset++) {
      const z = z0 + zOffset;
      const zWeight = zOffset === 0 ? 1 - tz : tz;
      for (let xOffset = 0; xOffset <= 1; xOffset++) {
        const x = x0 + xOffset;
        const weight = (xOffset === 0 ? 1 - tx : tx) * zWeight;
        if (x < 0 || z < 0 || x >= query.grid.width || z >= query.grid.height) continue;
        const index = z * query.grid.width + x;
        if (this._componentIndices[index] !== componentIndex) continue;
        sum += this._flowVectorsXZ[index * 2 + channel] * weight;
        totalWeight += weight;
      }
    }
    return totalWeight > 0.000001 ? sum / totalWeight : 0;
  }

  private _surfaceGradient(
    query: HeightfieldWaterQueryGrid,
    x: number,
    z: number,
    componentIndex: number,
    alongX: boolean
  ): number {
    const centerIndex = z * query.grid.width + x;
    const center = this._surfaceHeights[centerIndex];
    const negativeX = alongX ? x - 1 : x;
    const negativeZ = alongX ? z : z - 1;
    const positiveX = alongX ? x + 1 : x;
    const positiveZ = alongX ? z : z + 1;
    const negative = this._sameComponentValue(query, negativeX, negativeZ, componentIndex, center);
    const positive = this._sameComponentValue(query, positiveX, positiveZ, componentIndex, center);
    const hasNegative =
      negativeX >= 0 &&
      negativeZ >= 0 &&
      negativeX < query.grid.width &&
      negativeZ < query.grid.height &&
      this._componentIndices[negativeZ * query.grid.width + negativeX] === componentIndex;
    const hasPositive =
      positiveX >= 0 &&
      positiveZ >= 0 &&
      positiveX < query.grid.width &&
      positiveZ < query.grid.height &&
      this._componentIndices[positiveZ * query.grid.width + positiveX] === componentIndex;
    const spacing = alongX ? query.grid.cellSizeXZ[0] : query.grid.cellSizeXZ[1];
    return (positive - negative) / (spacing * (hasNegative && hasPositive ? 2 : 1));
  }

  private _sameComponentValue(
    query: HeightfieldWaterQueryGrid,
    x: number,
    z: number,
    componentIndex: number,
    fallback: number
  ): number {
    if (x < 0 || z < 0 || x >= query.grid.width || z >= query.grid.height) return fallback;
    const index = z * query.grid.width + x;
    return this._componentIndices[index] === componentIndex ? this._surfaceHeights[index] : fallback;
  }

  private _sampleSignedShoreDistance(worldX: number, worldZ: number): number {
    const atlas = this._data.localMapAtlas;
    const u = Math.min(1, Math.max(0, worldX * atlas.worldToUv[0] + atlas.worldToUv[2]));
    const v = Math.min(1, Math.max(0, worldZ * atlas.worldToUv[1] + atlas.worldToUv[3]));
    const x = Math.min(atlas.width - 1, Math.max(0, Math.round(u * (atlas.width - 1))));
    const y = Math.min(atlas.height - 1, Math.max(0, Math.round(v * (atlas.height - 1))));
    const encoded = this._atlasPixels[(y * atlas.width + x) * 4 + 3] / 255;
    return (encoded * 2 - 1) * atlas.signedDistanceRange;
  }

  private _reset(out: HeightfieldWaterBaseQueryResult): void {
    out.inside = false;
    out.componentIndex = OUTSIDE_COMPONENT_INDEX;
    out.surfaceHeight = Number.NaN;
    out.surfaceNormal[0] = 0;
    out.surfaceNormal[1] = 1;
    out.surfaceNormal[2] = 0;
    out.depth = 0;
    out.signedShoreDistance = Number.NEGATIVE_INFINITY;
    out.flowVectorXZ[0] = 0;
    out.flowVectorXZ[1] = 0;
  }
}
