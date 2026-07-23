import type { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { WaterSurfaceCurrentFieldProvider } from "../../runtime/interaction/WaterSurfaceCurrentFieldProvider";
import { createWaterLocalFieldSample } from "../../runtime/interaction/WaterLocalFieldProvider";
import type { WaterSurfaceProvider, WaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";

describe("WaterSurfaceCurrentFieldProvider", () => {
  it("copies the authoritative horizontal surface velocity into a caller-owned local-field sample", () => {
    const surface: WaterSurfaceProvider = {
      sampleSurface(position: Vector3, out: WaterSurfaceSample): boolean {
        if (Math.abs(position.x) > 2 || Math.abs(position.z) > 1) return false;
        out.waterVelocity.set(0.7, -0.2, -0.35);
        return true;
      }
    };
    const provider = new WaterSurfaceCurrentFieldProvider(surface);
    const sample = createWaterLocalFieldSample();

    expect(provider.sampleLocalField(1, 0.5, sample)).toBe(true);
    expect(sample.currentLargeX).toBeCloseTo(0.7);
    expect(sample.currentLargeZ).toBeCloseTo(-0.35);
    expect(sample.displacementY).toBe(0);

    expect(provider.sampleLocalField(3, 0, sample)).toBe(false);
    expect(sample.currentLargeX).toBe(0);
    expect(sample.currentLargeZ).toBe(0);
  });
});
