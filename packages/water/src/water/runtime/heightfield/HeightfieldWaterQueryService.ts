import { prepareWaterTerrainSampling, sampleWaterTerrainHeight } from "../../authoring/terrain/WaterTerrainSnapshot";
import { sampleWaterConnection, sampleWaterConnectionShore } from "../../authoring/connections/WaterConnection";
import { sampleLakeSignedShoreDistance } from "../../compiler/lake/LakeBoundaryCompiler";
/** Static base-surface queries; canonical bed indices are prepared before sampling. */
import type {
  HeightfieldWaterCompiledData,
  HeightfieldWaterQueryGrid
} from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import { compileWaterPlanarTransform, type CompiledWaterPlanarTransformV1 } from "../body/WaterPlanarTransform";
import type { HeightfieldWaterBaseQueryResult } from "./types";

const OUTSIDE_COMPONENT_INDEX = -1;
const IDENTITY_HEIGHTFIELD_WATER_TRANSFORM = compileWaterPlanarTransform({
  position: [0, 0, 0],
  yawDegrees: 0,
  scaleXZ: [1, 1]
});

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
  private readonly _available: boolean;
  private readonly _wetMask: Uint8Array;
  private readonly _componentIndices: Int32Array;
  private readonly _surfaceHeights: Float32Array;
  private readonly _bedHeights: Float32Array;
  private readonly _flowVectorsXZ: Float32Array;
  private readonly _shoreDistances?: Float32Array;

  constructor(
    private readonly _data: HeightfieldWaterCompiledData,
    private readonly _planarTransform: Readonly<CompiledWaterPlanarTransformV1> = IDENTITY_HEIGHTFIELD_WATER_TRANSFORM
  ) {
    const query = _data.queryGrid;
    this._available = query !== undefined;
    this._wetMask = query?.wetMask.borrowTypedArray() ?? new Uint8Array(0);
    this._componentIndices = query?.componentIndices.borrowTypedArray() ?? new Int32Array(0);
    this._surfaceHeights = query?.surfaceHeights.borrowTypedArray() ?? new Float32Array(0);
    this._bedHeights = query?.bedHeights.borrowTypedArray() ?? new Float32Array(0);
    this._flowVectorsXZ = query?.flowVectorsXZ.borrowTypedArray() ?? new Float32Array(0);
    this._shoreDistances = query?.shoreDistances?.borrowTypedArray();
    if (query?.bedTerrain) prepareWaterTerrainSampling(query.bedTerrain);
    if (
      query &&
      _data.lakeBoundary?.queryCoverage !== "boundary" &&
      this._shoreDistances?.length !== query.wetMask.length
    )
      throw new Error("Heightfield physical query requires its canonical source-grid shoreline.");
  }

  get available(): boolean {
    return this._available;
  }

  get planarTransform(): Readonly<CompiledWaterPlanarTransformV1> {
    return this._planarTransform;
  }

  /** Asset-local sampling seam shared by surface and spatial providers. */
  sampleBaseSurfaceLocal(
    localX: number,
    localZ: number,
    out: HeightfieldWaterBaseQueryResult
  ): HeightfieldWaterBaseQueryResult {
    this._reset(out);
    if (!this._available || !Number.isFinite(localX) || !Number.isFinite(localZ)) return out;
    const query = this._data.queryGrid;
    if (!query) return out;
    const connection = sampleWaterConnection(this._data.connections, localX, localZ);
    if (!connection.covered) return out;
    const boundary = this._data.lakeBoundary;
    const lakeShoreDistance =
      boundary?.queryCoverage === "boundary"
        ? sampleLakeSignedShoreDistance(boundary.rings, localX, localZ)
        : undefined;
    if (lakeShoreDistance !== undefined) {
      out.signedShoreDistance = lakeShoreDistance;
      if (out.signedShoreDistance < -(boundary?.terrainShorelineTolerance ?? 0)) return out;
    }
    const gridX = (localX - query.grid.originXZ[0]) / query.grid.cellSizeXZ[0];
    const gridZ = (localZ - query.grid.originXZ[1]) / query.grid.cellSizeXZ[1];
    if (gridX < -0.5 || gridZ < -0.5 || gridX >= query.grid.width - 0.5 || gridZ >= query.grid.height - 0.5) {
      return out;
    }
    const texelX = Math.floor(gridX + 0.5);
    const texelZ = Math.floor(gridZ + 0.5);
    const texelIndex = texelZ * query.grid.width + texelX;
    if (this._wetMask[texelIndex] === 0) {
      out.signedShoreDistance = sampleWaterConnectionShore(
        this._data.connections,
        localX,
        localZ,
        lakeShoreDistance ?? this._sampleSourceShoreDistance(query, gridX, gridZ)
      );
      return out;
    }

    const componentIndex = this._componentIndices[texelIndex];
    const surfaceHeight = this._sampleScalar(query, this._surfaceHeights, gridX, gridZ, componentIndex);
    const bedHeight = query.bedTerrain
      ? (sampleWaterTerrainHeight(query.bedTerrain, localX, localZ) ?? Number.NaN)
      : this._sampleScalar(query, this._bedHeights, gridX, gridZ, componentIndex);
    const flowX = this._sampleFlow(query, gridX, gridZ, componentIndex, 0);
    const flowZ = this._sampleFlow(query, gridX, gridZ, componentIndex, 1);
    const gradientX = this._surfaceGradient(query, texelX, texelZ, componentIndex, true);
    const gradientZ = this._surfaceGradient(query, texelX, texelZ, componentIndex, false);
    const normalLength = Math.hypot(gradientX, 1, gradientZ);

    if (
      !Number.isFinite(surfaceHeight) ||
      !Number.isFinite(bedHeight) ||
      (boundary?.queryCoverage === "boundary" && bedHeight >= surfaceHeight)
    ) {
      if (boundary?.terrainShorelineTolerance !== undefined && lakeShoreDistance !== undefined)
        out.signedShoreDistance = -Math.abs(lakeShoreDistance);
      return out;
    }
    // Approximate contour distance, authoritative wet-side sign.
    if (boundary?.terrainShorelineTolerance !== undefined && lakeShoreDistance !== undefined)
      out.signedShoreDistance = Math.abs(lakeShoreDistance);
    out.inside = true;
    out.componentIndex = componentIndex;
    out.surfaceHeight = surfaceHeight;
    out.surfaceNormal[0] = -gradientX / normalLength;
    out.surfaceNormal[1] = 1 / normalLength;
    out.surfaceNormal[2] = -gradientZ / normalLength;
    out.depth = Math.max(0, surfaceHeight - bedHeight);
    out.signedShoreDistance = sampleWaterConnectionShore(
      this._data.connections,
      localX,
      localZ,
      boundary?.terrainShorelineTolerance !== undefined && lakeShoreDistance !== undefined
        ? Math.abs(lakeShoreDistance)
        : (lakeShoreDistance ?? this._sampleSourceShoreDistance(query, gridX, gridZ))
    );
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

  /** Bilinear source-centre field; subcell error is bounded by the source half-cell
   * diagonal plus Float32 storage rounding. Wetness remains the exact cell mask. The finite domain is an explicit
   * dry exterior, so clamping interpolation may not extend a shoreline past its edge.
   */
  private _sampleSourceShoreDistance(query: HeightfieldWaterQueryGrid, gridX: number, gridZ: number): number {
    const {
      width,
      height,
      cellSizeXZ: [sx, sz]
    } = query.grid;
    const x = Math.max(0, Math.min(width - 1, gridX)),
      z = Math.max(0, Math.min(height - 1, gridZ));
    const x0 = Math.floor(x),
      z0 = Math.floor(z),
      x1 = Math.min(width - 1, x0 + 1),
      z1 = Math.min(height - 1, z0 + 1);
    const tx = x - x0,
      tz = z - z0,
      distances = this._shoreDistances!;
    const interpolated =
      (distances[z0 * width + x0] * (1 - tx) + distances[z0 * width + x1] * tx) * (1 - tz) +
      (distances[z1 * width + x0] * (1 - tx) + distances[z1 * width + x1] * tx) * tz;
    const edge = Math.min(
      (gridX + 0.5) * sx,
      (width - 0.5 - gridX) * sx,
      (gridZ + 0.5) * sz,
      (height - 0.5 - gridZ) * sz
    );
    const wet = this._wetMask[Math.floor(gridZ + 0.5) * width + Math.floor(gridX + 0.5)] === 1;
    return wet ? Math.min(Math.abs(interpolated), edge) : -Math.abs(interpolated);
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
