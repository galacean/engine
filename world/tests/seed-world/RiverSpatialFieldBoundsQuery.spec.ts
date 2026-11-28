import { describe, expect, it, vi } from "vitest";
import { compileWaterPlanarTransform } from "../../../packages/water/src/water/runtime/body/WaterPlanarTransform";
import { TransformedRiverWaterSpatialFieldProvider } from "../../../packages/water/src/water/runtime/river/RiverWaterSpatialFieldProvider";
import {
  WATER_SPATIAL_FIELD_OUTSIDE_UNRESOLVED,
  WATER_SPATIAL_FIELD_VERSION,
  WaterSpatialFieldChannel,
  type WaterSpatialFieldProvider
} from "../../../packages/water/src/water/runtime/spatial/WaterSpatialFieldProvider";

function makeBaseSource(withBoundsQuery: boolean): WaterSpatialFieldProvider {
  return {
    metadata: Object.freeze({
      version: WATER_SPATIAL_FIELD_VERSION,
      sourceSchemaVersion: 1,
      sourceHash: "test",
      compiledHash: "test",
      storage: "river-query-index",
      channels: WaterSpatialFieldChannel.Bathymetry | WaterSpatialFieldChannel.ShoreSignedDistance,
      bounds: Object.freeze({ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }),
      outsidePolicy: WATER_SPATIAL_FIELD_OUTSIDE_UNRESOLVED,
      maximumHorizontalError: 0.25,
      maximumDepthError: 0
    }),
    sampleSpatialField: () => false,
    ...(withBoundsQuery
      ? {
          maximumSurfaceHeightInBounds: vi.fn((bounds) => {
            if (bounds.maxX < -5 || bounds.minX > 5 || bounds.maxZ < -5 || bounds.minZ > 5) return null;
            return 2.5;
          })
        }
      : {})
  };
}

describe("TransformedRiverWaterSpatialFieldProvider bounds query contract", () => {
  it("omits maximumSurfaceHeightInBounds when the underlying source has no bounds query", () => {
    const transform = compileWaterPlanarTransform({ position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] });
    const transformed = new TransformedRiverWaterSpatialFieldProvider(makeBaseSource(false), [0, 0], transform);
    expect(transformed.maximumSurfaceHeightInBounds).toBeUndefined();
  });

  it("transforms world bounds into body-local coordinates and adds vertical offset when supported", () => {
    const source = makeBaseSource(true);
    const transform = compileWaterPlanarTransform({ position: [100, 4, -50], yawDegrees: 90, scaleXZ: [1, 1] });
    const transformed = new TransformedRiverWaterSpatialFieldProvider(source, [10, 20], transform);
    expect(typeof transformed.maximumSurfaceHeightInBounds).toBe("function");

    // World origin of the river body is at (110, 4, -30)
    const hit = transformed.maximumSurfaceHeightInBounds!({ minX: 108, maxX: 112, minZ: -32, maxZ: -28 });
    expect(hit).toBeCloseTo(6.5, 6);

    const miss = transformed.maximumSurfaceHeightInBounds!({ minX: 200, maxX: 204, minZ: 200, maxZ: 204 });
    expect(miss).toBeNull();
  });
});
