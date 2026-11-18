import type { Vector3 } from "@galacean/engine-math";
import type { OceanNearshoreStaticAtlas } from "../../compiler/ocean/OceanNearshoreCompiledTypes";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import { containsWaterBounds } from "../body/WaterBodyRuntime";
import {
  resetWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../query/WaterSurfaceProvider";
import {
  WATER_SPATIAL_FIELD_VERSION,
  WaterSpatialFieldChannel,
  WaterSpatialFieldRegion,
  createWaterSpatialFieldSample,
  resetWaterSpatialFieldSample,
  waterSpatialFieldSnapshot,
  type WaterSpatialFieldProvider,
  type WaterSpatialFieldMetadata,
  type WaterSpatialFieldSample
} from "../spatial/WaterSpatialFieldProvider";
import { resolveFiniteOceanOutsideWetness } from "./FiniteOceanSurfaceGeometry";
import { assertWaterQueryBounds } from "../spatial/WaterBoundsQuery";

/**
 * Published Ocean datum and footprint, independent of camera/frustum/visibility.
 * Uses the compiled shore atlas's zero contour (50% coverage), excluding its
 * screen-dependent antialias fringe. Depth uses the source's final bed nodes,
 * bilinearly sampled without RGBA8 quantization. DeepOcean outside the atlas
 * uses its existing shader depth proxy; it does not imply a measured seabed.
 * Gerstner presentation displacement is excluded from navigation contacts.
 */
export class OceanWaterSurfaceProvider implements WaterSurfaceProvider, WaterSpatialFieldProvider {
  readonly metadata: WaterSpatialFieldMetadata;
  private readonly fieldSample = createWaterSpatialFieldSample();
  private active = true;
  constructor(
    private readonly bodyId: string,
    private readonly descriptor: Readonly<OceanNearshoreDescriptorV1>,
    private readonly atlas: Readonly<OceanNearshoreStaticAtlas>,
    private readonly bounds: Readonly<WaterBoundsXZ>,
    private readonly waterLevel: () => number,
    identity: Readonly<{ sourceHash: string; compiledHash: string }> = {
      sourceHash: descriptor.id,
      compiledHash: descriptor.id
    }
  ) {
    const edge = (policy: string) => (policy === "deep-ocean" ? ("wet" as const) : ("dry" as const));
    this.metadata = Object.freeze({
      version: WATER_SPATIAL_FIELD_VERSION,
      sourceSchemaVersion: descriptor.schemaVersion,
      ...identity,
      storage: "ocean-published-bed-and-shore-atlas",
      channels: WaterSpatialFieldChannel.Bathymetry | WaterSpatialFieldChannel.ShoreSignedDistance,
      bounds,
      outsidePolicy: Object.freeze({
        negativeX: edge(descriptor.outsidePolicy.negativeX),
        positiveX: edge(descriptor.outsidePolicy.positiveX),
        negativeZ: edge(descriptor.outsidePolicy.negativeZ),
        positiveZ: edge(descriptor.outsidePolicy.positiveZ)
      }),
      maximumHorizontalError: Math.hypot(...descriptor.grid.cellSizeXZ) * 0.5 + atlas.shoreDistanceRange / 254,
      maximumDepthError: 0
    });
  }

  sampleSurface(position: Vector3, out: WaterSurfaceSample): boolean {
    resetWaterSurfaceSample(out);
    if (
      !Number.isFinite(position.y) ||
      !this.sampleSpatialField(position.x, position.z, this.fieldSample) ||
      !this.fieldSample.wet
    )
      return false;
    out.waterBodyId = this.bodyId;
    out.surfacePosition.set(position.x, this.fieldSample.surfaceHeight, position.z);
    out.waterDepth = this.fieldSample.waterDepth;
    return true;
  }

  capture() {
    if (!this.active) throw new Error("Ocean Spatial Field has been retired.");
    const level = this.waterLevel();
    return waterSpatialFieldSnapshot(
      new OceanWaterSurfaceProvider(this.bodyId, this.descriptor, this.atlas, this.bounds, () => level, this.metadata)
    );
  }

  sampleSpatialField(x: number, z: number, out: WaterSpatialFieldSample): boolean {
    resetWaterSpatialFieldSample(out);
    const level = this.waterLevel();
    if (
      !this.active ||
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(level) ||
      !containsWaterBounds(this.bounds, x, z)
    )
      return false;
    const outsideWet = resolveFiniteOceanOutsideWetness(this.descriptor, x, z);
    out.surfaceHeight = level;
    if (outsideWet !== undefined) {
      out.validChannels = WaterSpatialFieldChannel.ShoreSignedDistance;
      out.wet = outsideWet;
      out.region = outsideWet ? WaterSpatialFieldRegion.OutsideWet : WaterSpatialFieldRegion.OutsideDry;
      out.waterDepth = outsideWet ? Math.max(this.atlas.maximumDepth, 0.0001) : 0;
      out.shoreSignedDistance = (outsideWet ? 1 : -1) * this.atlas.shoreDistanceRange;
      // No Bathymetry channel or invented bedHeight outside the final grid.
    } else {
      const { grid } = this.descriptor;
      const gx = Math.max(0, Math.min(grid.width - 1, (x - grid.originXZ[0]) / grid.cellSizeXZ[0]));
      const gz = Math.max(0, Math.min(grid.height - 1, (z - grid.originXZ[1]) / grid.cellSizeXZ[1]));
      const x0 = Math.floor(gx),
        z0 = Math.floor(gz),
        x1 = Math.min(x0 + 1, grid.width - 1),
        z1 = Math.min(z0 + 1, grid.height - 1);
      const tx = gx - x0,
        tz = gz - z0;
      const i00 = z0 * grid.width + x0,
        i10 = z0 * grid.width + x1,
        i01 = z1 * grid.width + x0,
        i11 = z1 * grid.width + x1;
      const pixels = this.atlas.pixels;
      const shoreCode = bilinear(
        pixels.at(i00 * 4 + 3)!,
        pixels.at(i10 * 4 + 3)!,
        pixels.at(i01 * 4 + 3)!,
        pixels.at(i11 * 4 + 3)!,
        tx,
        tz
      );
      const bed = this.descriptor.bedHeights;
      out.bedHeight = bilinear(bed[i00], bed[i10], bed[i01], bed[i11], tx, tz);
      if (!Number.isFinite(out.bedHeight)) return false;
      out.waterDepth = Math.max(0, level - out.bedHeight);
      out.shoreSignedDistance = ((shoreCode - 128) / 127) * this.atlas.shoreDistanceRange;
      out.wet = shoreCode >= 128 && out.waterDepth > (this.descriptor.wetSource.minimumDepth ?? 0);
      out.region = out.wet ? WaterSpatialFieldRegion.InsideWet : WaterSpatialFieldRegion.InsideDry;
      out.validChannels = WaterSpatialFieldChannel.Bathymetry | WaterSpatialFieldChannel.ShoreSignedDistance;
      out.insideField = true;
    }
    out.resolved = true;
    return true;
  }

  destroy(): void {
    this.active = false;
  }

  maximumSurfaceHeightInBounds(bounds: WaterBoundsXZ): number | null {
    assertWaterQueryBounds(bounds);
    const level = this.waterLevel();
    if (!this.active || !Number.isFinite(level)) throw new Error("Ocean static bounds query is unavailable.");
    const minX = Math.max(bounds.minX, this.bounds.minX),
      maxX = Math.min(bounds.maxX, this.bounds.maxX);
    const minZ = Math.max(bounds.minZ, this.bounds.minZ),
      maxZ = Math.min(bounds.maxZ, this.bounds.maxZ);
    if (minX > maxX || minZ > maxZ) return null;
    const g = this.descriptor.grid;
    const partitions = (low: number, high: number, origin: number, pitch: number, count: number) => {
      const values = [low];
      const first = Math.max(0, Math.ceil((low - origin) / pitch)),
        last = Math.min(count - 1, Math.floor((high - origin) / pitch));
      for (let i = first; i <= last; i++) {
        const v = origin + i * pitch;
        if (v > low && v < high) values.push(v);
      }
      values.push(high);
      return values;
    };
    const xs = partitions(minX, maxX, g.originXZ[0], g.cellSizeXZ[0], g.width);
    const zs = partitions(minZ, maxZ, g.originXZ[1], g.cellSizeXZ[1], g.height);
    for (let iz = 0; iz < zs.length - 1; iz++)
      for (let ix = 0; ix < xs.length - 1; ix++) {
        const x0 = xs[ix],
          x1 = xs[ix + 1],
          z0 = zs[iz],
          z1 = zs[iz + 1];
        if (resolveFiniteOceanOutsideWetness(this.descriptor, (x0 + x1) / 2, (z0 + z1) / 2) === true) return level;
        let shoreMaximum = -Infinity,
          bedMinimum = Infinity;
        for (const x of [x0, x1])
          for (const z of [z0, z1]) {
            // Grid extrema cannot exclude a wet point in this bilinear cell. Outside corners use their own policy.
            const outside = resolveFiniteOceanOutsideWetness(this.descriptor, x, z);
            if (outside === true) return level;
            if (outside === false) continue;
            const gx = Math.max(0, Math.min(g.width - 1, (x - g.originXZ[0]) / g.cellSizeXZ[0]));
            const gz = Math.max(0, Math.min(g.height - 1, (z - g.originXZ[1]) / g.cellSizeXZ[1]));
            const ax = Math.floor(gx),
              az = Math.floor(gz),
              bx = Math.min(g.width - 1, ax + 1),
              bz = Math.min(g.height - 1, az + 1);
            const indices = [az * g.width + ax, az * g.width + bx, bz * g.width + ax, bz * g.width + bx];
            shoreMaximum = Math.max(
              shoreMaximum,
              bilinear(
                ...(indices.map((i) => this.atlas.pixels.at(i * 4 + 3)!) as [number, number, number, number]),
                gx - ax,
                gz - az
              )
            );
            bedMinimum = Math.min(
              bedMinimum,
              bilinear(
                ...(indices.map((i) => this.descriptor.bedHeights[i]) as [number, number, number, number]),
                gx - ax,
                gz - az
              )
            );
          }
        if (shoreMaximum >= 128 && level - bedMinimum > (this.descriptor.wetSource.minimumDepth ?? 0)) return level;
      }
    return null;
  }
}

function bilinear(a: number, b: number, c: number, d: number, tx: number, tz: number): number {
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
