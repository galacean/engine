/** Caller-owned, allocation-free bilinear sampling over one compiled nearshore field. */
import { OceanNearshoreOutsidePolicy } from "../../authoring/ocean/OceanNearshoreTypes";
import type { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";

export enum OceanNearshoreSampleRegion {
  Invalid = 0,
  InsideWet = 1,
  InsideDry = 2,
  OutsideDeepOcean = 3,
  OutsideDry = 4
}

export interface OceanNearshoreFieldSample {
  region: OceanNearshoreSampleRegion;
  insideField: boolean;
  wet: boolean;
  fieldU: number;
  fieldV: number;
  bedHeight: number;
  waterDepth: number;
  shoreDistance: number;
  shoreNormalX: number;
  shoreNormalZ: number;
  baseCurrentX: number;
  baseCurrentZ: number;
}

export function createOceanNearshoreFieldSample(): OceanNearshoreFieldSample {
  return {
    region: OceanNearshoreSampleRegion.Invalid,
    insideField: false,
    wet: false,
    fieldU: 0,
    fieldV: 0,
    bedHeight: 0,
    waterDepth: 0,
    shoreDistance: 0,
    shoreNormalX: 0,
    shoreNormalZ: 0,
    baseCurrentX: 0,
    baseCurrentZ: 0
  };
}

export function resetOceanNearshoreFieldSample(
  sample: OceanNearshoreFieldSample
): void {
  sample.region = OceanNearshoreSampleRegion.Invalid;
  sample.insideField = false;
  sample.wet = false;
  sample.fieldU = 0;
  sample.fieldV = 0;
  sample.bedHeight = 0;
  sample.waterDepth = 0;
  sample.shoreDistance = 0;
  sample.shoreNormalX = 0;
  sample.shoreNormalZ = 0;
  sample.baseCurrentX = 0;
  sample.baseCurrentZ = 0;
}

function interpolate(
  value00: number,
  value10: number,
  value01: number,
  value11: number,
  fractionX: number,
  fractionZ: number
): number {
  const negativeZ = value00 + (value10 - value00) * fractionX;
  const positiveZ = value01 + (value11 - value01) * fractionX;
  return negativeZ + (positiveZ - negativeZ) * fractionZ;
}

export class OceanNearshoreFieldProvider {
  private _destroyed = false;

  constructor(readonly resource: OceanNearshoreFieldResource) {
    resource.retain();
  }

  sample(
    worldX: number,
    worldZ: number,
    outSample: OceanNearshoreFieldSample
  ): OceanNearshoreSampleRegion {
    resetOceanNearshoreFieldSample(outSample);
    if (this._destroyed) {
      throw new Error("Ocean nearshore field provider has been destroyed.");
    }
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      return OceanNearshoreSampleRegion.Invalid;
    }
    const data = this.resource.data;
    const { grid, outsidePolicy } = data;
    const gridX = (worldX - grid.originXZ[0]) / grid.cellSizeXZ[0];
    const gridZ = (worldZ - grid.originXZ[1]) / grid.cellSizeXZ[1];
    const outsideNegativeX = gridX < -0.5;
    const outsidePositiveX = gridX > grid.width - 0.5;
    const outsideNegativeZ = gridZ < -0.5;
    const outsidePositiveZ = gridZ > grid.height - 0.5;
    if (
      outsideNegativeX ||
      outsidePositiveX ||
      outsideNegativeZ ||
      outsidePositiveZ
    ) {
      const dry =
        (outsideNegativeX &&
          outsidePolicy.negativeX === OceanNearshoreOutsidePolicy.Dry) ||
        (outsidePositiveX &&
          outsidePolicy.positiveX === OceanNearshoreOutsidePolicy.Dry) ||
        (outsideNegativeZ &&
          outsidePolicy.negativeZ === OceanNearshoreOutsidePolicy.Dry) ||
        (outsidePositiveZ &&
          outsidePolicy.positiveZ === OceanNearshoreOutsidePolicy.Dry);
      outSample.region = dry
        ? OceanNearshoreSampleRegion.OutsideDry
        : OceanNearshoreSampleRegion.OutsideDeepOcean;
      outSample.wet = !dry;
      outSample.waterDepth = dry ? 0 : Number.POSITIVE_INFINITY;
      outSample.bedHeight = dry ? data.waterLevel : Number.NEGATIVE_INFINITY;
      outSample.shoreDistance = dry
        ? -data.staticAtlas.shoreDistanceRange
        : data.staticAtlas.shoreDistanceRange;
      return outSample.region;
    }

    const sampleX = Math.min(grid.width - 1, Math.max(0, gridX));
    const sampleZ = Math.min(grid.height - 1, Math.max(0, gridZ));
    const x0 = Math.floor(sampleX);
    const z0 = Math.floor(sampleZ);
    const x1 = Math.min(grid.width - 1, x0 + 1);
    const z1 = Math.min(grid.height - 1, z0 + 1);
    const fractionX = sampleX - x0;
    const fractionZ = sampleZ - z0;
    const index00 = z0 * grid.width + x0;
    const index10 = z0 * grid.width + x1;
    const index01 = z1 * grid.width + x0;
    const index11 = z1 * grid.width + x1;
    const resource = this.resource;

    outSample.insideField = true;
    outSample.fieldU = worldX * data.staticAtlas.worldToUv[0] + data.staticAtlas.worldToUv[2];
    outSample.fieldV = worldZ * data.staticAtlas.worldToUv[1] + data.staticAtlas.worldToUv[3];
    outSample.bedHeight = interpolate(
      resource.bedHeightAt(index00),
      resource.bedHeightAt(index10),
      resource.bedHeightAt(index01),
      resource.bedHeightAt(index11),
      fractionX,
      fractionZ
    );
    outSample.waterDepth = interpolate(
      resource.waterDepthAt(index00),
      resource.waterDepthAt(index10),
      resource.waterDepthAt(index01),
      resource.waterDepthAt(index11),
      fractionX,
      fractionZ
    );
    outSample.shoreDistance = interpolate(
      resource.shoreDistanceAt(index00),
      resource.shoreDistanceAt(index10),
      resource.shoreDistanceAt(index01),
      resource.shoreDistanceAt(index11),
      fractionX,
      fractionZ
    );
    outSample.shoreNormalX = interpolate(
      resource.shoreNormalXAt(index00),
      resource.shoreNormalXAt(index10),
      resource.shoreNormalXAt(index01),
      resource.shoreNormalXAt(index11),
      fractionX,
      fractionZ
    );
    outSample.shoreNormalZ = interpolate(
      resource.shoreNormalZAt(index00),
      resource.shoreNormalZAt(index10),
      resource.shoreNormalZAt(index01),
      resource.shoreNormalZAt(index11),
      fractionX,
      fractionZ
    );
    const shoreNormalLength = Math.hypot(
      outSample.shoreNormalX,
      outSample.shoreNormalZ
    );
    if (shoreNormalLength > 1e-8) {
      outSample.shoreNormalX /= shoreNormalLength;
      outSample.shoreNormalZ /= shoreNormalLength;
    }
    outSample.baseCurrentX = interpolate(
      resource.baseCurrentXAt(index00),
      resource.baseCurrentXAt(index10),
      resource.baseCurrentXAt(index01),
      resource.baseCurrentXAt(index11),
      fractionX,
      fractionZ
    );
    outSample.baseCurrentZ = interpolate(
      resource.baseCurrentZAt(index00),
      resource.baseCurrentZAt(index10),
      resource.baseCurrentZAt(index01),
      resource.baseCurrentZAt(index11),
      fractionX,
      fractionZ
    );
    outSample.wet = outSample.shoreDistance > 0 && outSample.waterDepth > 0;
    outSample.region = outSample.wet
      ? OceanNearshoreSampleRegion.InsideWet
      : OceanNearshoreSampleRegion.InsideDry;
    return outSample.region;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.resource.release();
  }
}
