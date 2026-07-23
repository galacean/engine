import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { SurfaceDepthWaterVolumeProvider } from "../../runtime/body/SurfaceDepthWaterVolumeProvider";
import { createWaterVolumeSample } from "../../runtime/body/WaterVolumeProvider";
import { resetWaterSurfaceSample, type WaterSurfaceProvider } from "../../runtime/query/WaterSurfaceProvider";

function createSurfaceProvider(getHeight: () => number, depth: number): WaterSurfaceProvider {
  return {
    sampleSurface(position, out): boolean {
      resetWaterSurfaceSample(out);
      if (Math.abs(position.x) > 5 || Math.abs(position.z) > 5) return false;
      out.waterBodyId = "finite-water";
      out.surfacePosition.set(position.x, getHeight(), position.z);
      out.waterDepth = depth;
      return true;
    }
  };
}

describe("SurfaceDepthWaterVolumeProvider", () => {
  it("distinguishes above-water, contained, and below-bottom positions", () => {
    const provider = new SurfaceDepthWaterVolumeProvider(createSurfaceProvider(() => 2, 3));
    const sample = createWaterVolumeSample();

    expect(provider.sampleVolume(new Vector3(0, 2.1, 0), sample)).toBe(true);
    expect(sample).toMatchObject({ insideFootprint: true, insideVolume: false, surfaceHeight: 2, bottomHeight: -1 });
    expect(sample.signedSurfaceDistance).toBeCloseTo(0.1);

    expect(provider.sampleVolume(new Vector3(0, 0.5, 0), sample)).toBe(true);
    expect(sample.insideVolume).toBe(true);
    expect(sample.submergedDepth).toBeCloseTo(1.5);

    expect(provider.sampleVolume(new Vector3(0, -1.1, 0), sample)).toBe(true);
    expect(sample.insideVolume).toBe(false);
    expect(sample.submergedDepth).toBe(3);
  });

  it("follows the wrapped dynamic surface without allocating a replacement output", () => {
    let height = 1;
    const provider = new SurfaceDepthWaterVolumeProvider(createSurfaceProvider(() => height, 2));
    const sample = createWaterVolumeSample();

    expect(provider.sampleVolume(new Vector3(0, 0, 0), sample)).toBe(true);
    const outputIdentity = sample;
    expect(sample.surfaceHeight).toBe(1);
    height = 1.5;
    expect(provider.sampleVolume(new Vector3(0, 0, 0), sample)).toBe(true);
    expect(sample).toBe(outputIdentity);
    expect(sample.surfaceHeight).toBe(1.5);
    expect(sample.bottomHeight).toBe(-0.5);
  });

  it("rejects points outside the footprint and non-finite finite-depth data", () => {
    const outside = new SurfaceDepthWaterVolumeProvider(createSurfaceProvider(() => 1, 2));
    const invalidDepth = new SurfaceDepthWaterVolumeProvider(createSurfaceProvider(() => 1, Number.POSITIVE_INFINITY));
    const sample = createWaterVolumeSample();

    expect(outside.sampleVolume(new Vector3(6, 0, 0), sample)).toBe(false);
    expect(sample.insideFootprint).toBe(false);
    expect(invalidDepth.sampleVolume(new Vector3(0, 0, 0), sample)).toBe(false);
    expect(sample.insideVolume).toBe(false);
  });
});
