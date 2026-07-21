import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { InteractivePoolSurfaceProvider } from "../../runtime/interaction/InteractivePoolSurfaceProvider";
import { RectangularWaterHeightField } from "../../runtime/interaction/RectangularWaterHeightField";
import {
  createWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../../runtime/query/WaterSurfaceProvider";

function createField(): RectangularWaterHeightField {
  return new RectangularWaterHeightField({
    centerX: 4,
    centerZ: -3,
    lengthAxisX: 0,
    lengthAxisZ: 1,
    length: 12,
    width: 6,
    resolutionX: 25,
    resolutionZ: 13,
    waveSpeed: 4,
    damping: 0.55,
    maxDisplacement: 0.25
  });
}

describe("InteractivePoolSurfaceProvider", () => {
  it("adds the shared height, normal, vertical speed, and water depth to the base River sample", () => {
    const baseProvider: WaterSurfaceProvider = {
      sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
        if (worldPosition.x < 0) return false;
        outSample.waterBodyId = "pool";
        outSample.surfacePosition.set(worldPosition.x, 2, worldPosition.z);
        outSample.surfaceNormal.set(0.1, 0.99, 0).normalize();
        outSample.waterVelocity.set(0.04, 0.2, 0);
        outSample.waterDepth = 2.6;
        return true;
      }
    };
    const field = createField();
    field.registerInteraction(
      new Vector3(4.5, 2, -3),
      new Vector3(0, 1, 0),
      new Vector3(0, -5, 0),
      0.72,
      0.2,
      true
    );
    field.step(1 / 60);
    const provider = new InteractivePoolSurfaceProvider(baseProvider, field);
    const sample = createWaterSurfaceSample();
    const fieldSample = { height: 0, verticalVelocity: 0, gradientLocalX: 0, gradientLocalZ: 0 };
    expect(field.sampleWorld(4.5, -3, fieldSample)).toBe(true);

    expect(provider.sampleSurface(new Vector3(4.5, 0, -3), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("pool");
    expect(sample.surfacePosition.y).toBeCloseTo(2 + fieldSample.height, 7);
    expect(sample.waterVelocity).toMatchObject({ x: 0.04, z: 0 });
    expect(sample.waterVelocity.y).toBeCloseTo(0.2 + fieldSample.verticalVelocity, 7);
    expect(sample.waterDepth).toBeCloseTo(2.6 + fieldSample.height, 7);
    expect(sample.surfaceNormal.length()).toBeCloseTo(1, 7);
    expect(sample.surfaceNormal.x).not.toBeCloseTo(0.1 / Math.hypot(0.1, 0.99), 7);
  });

  it("preserves the base footprint decision and leaves base samples unchanged outside the field rectangle", () => {
    const baseProvider: WaterSurfaceProvider = {
      sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
        if (worldPosition.x < 0) return false;
        outSample.waterBodyId = "pool";
        outSample.surfacePosition.set(worldPosition.x, 2, worldPosition.z);
        outSample.surfaceNormal.set(0, 1, 0);
        outSample.waterVelocity.set(0.04, 0, 0);
        outSample.waterDepth = 2.6;
        return true;
      }
    };
    const provider = new InteractivePoolSurfaceProvider(baseProvider, createField());
    const sample = createWaterSurfaceSample();

    expect(provider.sampleSurface(new Vector3(-1, 0, 0), sample)).toBe(false);
    expect(provider.sampleSurface(new Vector3(20, 0, 20), sample)).toBe(true);
    expect(sample.surfacePosition.y).toBe(2);
    expect(sample.surfaceNormal).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(sample.waterVelocity).toMatchObject({ x: 0.04, y: 0, z: 0 });
    expect(sample.waterDepth).toBe(2.6);
  });
});
