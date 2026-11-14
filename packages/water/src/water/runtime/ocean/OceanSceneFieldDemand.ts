/** Conservative Camera Scene Color/Depth demand for the detailed Ocean closure. */
import { OCEAN_RENDER_BUDGET } from "../../authoring/ocean/presets/OceanLook";
import type { OceanNearshoreStaticAtlas } from "../../compiler/ocean/OceanNearshoreCompiledTypes";

export const OCEAN_SCENE_FIELD_DEMAND_BUDGET = Object.freeze({
  detailedClosureEndMetres: OCEAN_RENDER_BUDGET.farFieldClosureTransitionEndMetres,
  /** A complete half-Snap beyond the detailed closure is required before releasing full-screen fields. */
  releaseMarginMetres: OCEAN_RENDER_BUDGET.nearFieldSnapSizeMetres * 0.5,
  /** Reacquire one quarter-Snap before the detailed closure can become visible. */
  reacquireMarginMetres: OCEAN_RENDER_BUDGET.nearFieldSnapSizeMetres * 0.25
});

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
  const pixels = atlas.pixels;
  const top =
    (pixels.at((z0 * atlas.width + x0) * 4 + 3) ?? 128) * (1 - tx) +
    (pixels.at((z0 * atlas.width + x1) * 4 + 3) ?? 128) * tx;
  const bottom =
    (pixels.at((z1 * atlas.width + x0) * 4 + 3) ?? 128) * (1 - tx) +
    (pixels.at((z1 * atlas.width + x1) * 4 + 3) ?? 128) * tx;
  return decodeSignedShoreDistance(top * (1 - tz) + bottom * tz, atlas.shoreDistanceRange);
}

/** Allocation-free production resolver whose result is overwritten by each call */
export class OceanSceneFieldDemandResolver {
  private readonly _atlas: Readonly<OceanNearshoreStaticAtlas>;
  private readonly _horizontalDisplacementMetres: number;
  private readonly _verticalDisplacementMetres: number;
  private readonly _horizontalSamplingErrorMetres: number;
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
      horizontalDryDistanceMetres = Math.max(
        0,
        -sampledShoreDistance - this._horizontalSamplingErrorMetres - this._horizontalDisplacementMetres
      );
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
