/** Conservative Camera Scene Color/Depth demand for the detailed Ocean closure. */
import { OCEAN_RENDER_BUDGET } from "../../authoring/ocean/presets/OceanLook";
import type { OceanNearshoreStaticAtlas } from "../../compiler/ocean/OceanNearshoreCompiledTypes";

export const OCEAN_SCENE_FIELD_DEMAND_BUDGET = Object.freeze({
  detailedClosureEndMetres: OCEAN_RENDER_BUDGET.farFieldClosureTransitionEndMetres,
  /** A complete half-Snap (16m) beyond the detailed closure releases full-screen fields earlier inland/far. */
  releaseMarginMetres: OCEAN_RENDER_BUDGET.nearFieldSnapSizeMetres * 0.5,
  /** Reacquire one quarter-Snap (8m) before the detailed closure can become visible. */
  reacquireMarginMetres: OCEAN_RENDER_BUDGET.nearFieldSnapSizeMetres * 0.25
});

const COARSE_DRY_DISTANCE_MAX_EDGE = 128;

/** 1D Felzenszwalb-Huttenlocher squared Euclidean distance transform with physical step size. */
function distanceTransform1D(
  input: Float32Array,
  output: Float32Array,
  length: number,
  stepMetres: number,
  v: Int32Array,
  z: Float64Array
): void {
  const stepSq = stepMetres * stepMetres;
  let k = -1;
  for (let q = 0; q < length; q++) {
    const fq = input[q]!;
    if (!Number.isFinite(fq)) continue;
    if (k < 0) {
      k = 0;
      v[0] = q;
      z[0] = Number.NEGATIVE_INFINITY;
      z[1] = Number.POSITIVE_INFINITY;
      continue;
    }
    let s = 0;
    while (k >= 0) {
      const p = v[k]!;
      s = ((fq - input[p]!) / stepSq + (q * q - p * p)) / (2 * (q - p));
      if (s > z[k]!) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  if (k < 0) {
    output.fill(Number.POSITIVE_INFINITY, 0, length);
    return;
  }
  let idx = 0;
  for (let q = 0; q < length; q++) {
    while (z[idx + 1]! < q) idx++;
    const p = v[idx]!;
    const delta = (q - p) * stepMetres;
    output[q] = delta * delta + input[p]!;
  }
}

interface CoarseDryDistanceField {
  readonly width: number;
  readonly height: number;
  readonly distances: Float32Array;
  readonly samplingErrorMetres: number;
}

/**
 * Builds a conservative lower-bound dry-to-wet Euclidean distance grid over the full atlas extent.
 * The RGBA8 atlas A-channel saturates at 64m for coastal precision, so inland cameras need this
 * unclamped conservative grid to enter far-only fill without prematurely disabling coastal waves.
 */
function buildCoarseDryDistanceField(
  atlas: Readonly<OceanNearshoreStaticAtlas>,
  cellSizeX: number,
  cellSizeZ: number
): CoarseDryDistanceField {
  const width = Math.min(atlas.width, COARSE_DRY_DISTANCE_MAX_EDGE);
  const height = Math.min(atlas.height, COARSE_DRY_DISTANCE_MAX_EDGE);
  const worldSpanX = cellSizeX * atlas.width;
  const worldSpanZ = cellSizeZ * atlas.height;
  const coarseCellX = worldSpanX / width;
  const coarseCellZ = worldSpanZ / height;
  const grid = new Float32Array(width * height);
  grid.fill(Number.POSITIVE_INFINITY);

  // Conservative downsample: any fine wet texel inside a coarse cell marks that coarse cell wet (0).
  const pixels = atlas.pixels.borrowTypedArray();
  const pixelCount = pixels.length;
  for (let z = 0; z < atlas.height; z++) {
    const cz = Math.min(height - 1, Math.floor((z * height) / atlas.height));
    const rowOffset = z * atlas.width;
    const coarseRowOffset = cz * width;
    for (let x = 0; x < atlas.width; x++) {
      const channelIndex = (rowOffset + x) * 4;
      if (channelIndex < pixelCount && pixels[channelIndex]! > 0) {
        const cx = Math.min(width - 1, Math.floor((x * width) / atlas.width));
        grid[coarseRowOffset + cx] = 0;
      }
    }
  }

  const maxDim = Math.max(width, height);
  const lineIn = new Float32Array(maxDim);
  const lineOut = new Float32Array(maxDim);
  const v = new Int32Array(maxDim);
  const zBuf = new Float64Array(maxDim + 1);

  for (let cz = 0; cz < height; cz++) {
    const rowOffset = cz * width;
    for (let cx = 0; cx < width; cx++) lineIn[cx] = grid[rowOffset + cx]!;
    distanceTransform1D(lineIn, lineOut, width, coarseCellX, v, zBuf);
    for (let cx = 0; cx < width; cx++) grid[rowOffset + cx] = lineOut[cx]!;
  }
  for (let cx = 0; cx < width; cx++) {
    for (let cz = 0; cz < height; cz++) lineIn[cz] = grid[cz * width + cx]!;
    distanceTransform1D(lineIn, lineOut, height, coarseCellZ, v, zBuf);
    for (let cz = 0; cz < height; cz++) {
      const toInteriorWet = Math.sqrt(lineOut[cz]!);
      // Outside the atlas may be DeepOcean; bound conservatively by distance to the nearest atlas border.
      const borderX = Math.min(cx, width - 1 - cx) * coarseCellX;
      const borderZ = Math.min(cz, height - 1 - cz) * coarseCellZ;
      const toAtlasBorder = Math.min(borderX, borderZ);
      grid[cz * width + cx] = Math.min(toInteriorWet, toAtlasBorder);
    }
  }

  return {
    width,
    height,
    distances: grid,
    samplingErrorMetres: Math.hypot(coarseCellX, coarseCellZ) + Math.hypot(cellSizeX, cellSizeZ)
  };
}

export interface OceanSceneFieldCameraPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OceanSceneFieldDemandResult {
  readonly required: boolean;
  readonly reason: "detailed-closure" | "far-only";
  readonly minimumWetSurfaceDistanceMetres: number;
  readonly conservativeHorizontalDryDistanceMetres: number;
  readonly conservativeVerticalDistanceMetres: number;
  readonly transitionThresholdMetres: number;
}

type MutableOceanSceneFieldDemandResult = {
  -readonly [Property in keyof OceanSceneFieldDemandResult]: OceanSceneFieldDemandResult[Property];
};

function decodeSignedShoreDistance(channel: number, range: number): number {
  return ((channel - 128) / 127) * range;
}

/** Mirrors bilinear/clamped GPU sampling. Outside the atlas deliberately fails closed. */
function sampleSignedShoreDistance(
  atlas: Readonly<OceanNearshoreStaticAtlas>,
  worldX: number,
  worldZ: number
): number | undefined {
  const u = worldX * atlas.worldToUv[0] + atlas.worldToUv[2];
  const v = worldZ * atlas.worldToUv[1] + atlas.worldToUv[3];
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined;

  const texelX = u * atlas.width - 0.5;
  const texelZ = v * atlas.height - 0.5;
  const sourceX0 = Math.floor(texelX);
  const sourceZ0 = Math.floor(texelZ);
  const x0 = Math.max(0, Math.min(atlas.width - 1, sourceX0));
  const z0 = Math.max(0, Math.min(atlas.height - 1, sourceZ0));
  const x1 = Math.max(0, Math.min(atlas.width - 1, sourceX0 + 1));
  const z1 = Math.max(0, Math.min(atlas.height - 1, sourceZ0 + 1));
  const tx = texelX - sourceX0;
  const tz = texelZ - sourceZ0;
  const pixels = atlas.pixels.borrowTypedArray();
  const pixelCount = pixels.length;
  const idx00 = (z0 * atlas.width + x0) * 4 + 3;
  const idx10 = (z0 * atlas.width + x1) * 4 + 3;
  const idx01 = (z1 * atlas.width + x0) * 4 + 3;
  const idx11 = (z1 * atlas.width + x1) * 4 + 3;
  const top = (idx00 < pixelCount ? pixels[idx00]! : 128) * (1 - tx) + (idx10 < pixelCount ? pixels[idx10]! : 128) * tx;
  const bottom =
    (idx01 < pixelCount ? pixels[idx01]! : 128) * (1 - tx) + (idx11 < pixelCount ? pixels[idx11]! : 128) * tx;
  return decodeSignedShoreDistance(top * (1 - tz) + bottom * tz, atlas.shoreDistanceRange);
}

/** Allocation-free production resolver whose result is overwritten by each call */
export class OceanSceneFieldDemandResolver {
  private readonly _atlas: Readonly<OceanNearshoreStaticAtlas>;
  private _horizontalDisplacementMetres: number;
  private _verticalDisplacementMetres: number;
  private readonly _horizontalSamplingErrorMetres: number;
  private readonly _coarseDryDistance: CoarseDryDistanceField;
  private readonly _result: MutableOceanSceneFieldDemandResult = {
    required: true,
    reason: "detailed-closure",
    minimumWetSurfaceDistanceMetres: 0,
    conservativeHorizontalDryDistanceMetres: 0,
    conservativeVerticalDistanceMetres: 0,
    transitionThresholdMetres: 0
  };

  constructor(
    atlas: Readonly<OceanNearshoreStaticAtlas>,
    maximumDisplacement: Readonly<{ readonly horizontalMagnitude: number; readonly vertical: number }>
  ) {
    const horizontalDisplacementMetres = maximumDisplacement.horizontalMagnitude;
    const verticalDisplacementMetres = maximumDisplacement.vertical;
    if (
      !Number.isFinite(horizontalDisplacementMetres) ||
      !Number.isFinite(verticalDisplacementMetres) ||
      horizontalDisplacementMetres < 0 ||
      verticalDisplacementMetres < 0
    ) {
      throw new RangeError("Ocean SceneField displacement bounds must be finite and non-negative.");
    }
    this._atlas = atlas;
    this._horizontalDisplacementMetres = horizontalDisplacementMetres;
    this._verticalDisplacementMetres = verticalDisplacementMetres;
    const cellSizeX = 1 / (atlas.worldToUv[0] * atlas.width);
    const cellSizeZ = 1 / (atlas.worldToUv[1] * atlas.height);
    this._horizontalSamplingErrorMetres = Math.hypot(cellSizeX, cellSizeZ) + atlas.shoreDistanceRange / 127;
    this._coarseDryDistance = buildCoarseDryDistanceField(atlas, cellSizeX, cellSizeZ);
  }

  setMaximumDisplacement(horizontalMagnitude: number, vertical: number): void {
    if (
      !Number.isFinite(horizontalMagnitude) ||
      !Number.isFinite(vertical) ||
      horizontalMagnitude < 0 ||
      vertical < 0
    ) {
      throw new RangeError("Ocean SceneField displacement bounds must be finite and non-negative.");
    }
    this._horizontalDisplacementMetres = horizontalMagnitude;
    this._verticalDisplacementMetres = vertical;
  }

  resolve(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    waterLevel: number,
    currentlyRequired: boolean
  ): Readonly<OceanSceneFieldDemandResult> {
    if (
      !Number.isFinite(cameraX) ||
      !Number.isFinite(cameraY) ||
      !Number.isFinite(cameraZ) ||
      !Number.isFinite(waterLevel)
    ) {
      throw new RangeError("Ocean SceneField demand inputs must be finite.");
    }

    const budget = OCEAN_SCENE_FIELD_DEMAND_BUDGET;
    const transitionThresholdMetres =
      budget.detailedClosureEndMetres + (currentlyRequired ? budget.releaseMarginMetres : budget.reacquireMarginMetres);
    const verticalDistanceMetres = Math.max(0, Math.abs(cameraY - waterLevel) - this._verticalDisplacementMetres);
    const sampledShoreDistance = sampleSignedShoreDistance(this._atlas, cameraX, cameraZ);
    let horizontalDryDistanceMetres = 0;
    if (sampledShoreDistance !== undefined && sampledShoreDistance < 0) {
      const atlasDryDistance = Math.max(
        0,
        -sampledShoreDistance - this._horizontalSamplingErrorMetres - this._horizontalDisplacementMetres
      );
      const u = cameraX * this._atlas.worldToUv[0] + this._atlas.worldToUv[2];
      const v = cameraZ * this._atlas.worldToUv[1] + this._atlas.worldToUv[3];
      const coarse = this._coarseDryDistance;
      const cx = Math.max(0, Math.min(coarse.width - 1, Math.floor(u * coarse.width)));
      const cz = Math.max(0, Math.min(coarse.height - 1, Math.floor(v * coarse.height)));
      const coarseDryDistance = Math.max(
        0,
        coarse.distances[cz * coarse.width + cx]! - coarse.samplingErrorMetres - this._horizontalDisplacementMetres
      );
      horizontalDryDistanceMetres = Math.max(atlasDryDistance, coarseDryDistance);
    }
    const minimumWetSurfaceDistanceMetres = Math.hypot(horizontalDryDistanceMetres, verticalDistanceMetres);
    const required = minimumWetSurfaceDistanceMetres <= transitionThresholdMetres;
    const result = this._result;
    result.required = required;
    result.reason = required ? "detailed-closure" : "far-only";
    result.minimumWetSurfaceDistanceMetres = minimumWetSurfaceDistanceMetres;
    result.conservativeHorizontalDryDistanceMetres = horizontalDryDistanceMetres;
    result.conservativeVerticalDistanceMetres = verticalDistanceMetres;
    result.transitionThresholdMetres = transitionThresholdMetres;
    return result;
  }
}
