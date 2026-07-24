import { describe, expect, it } from "vitest";
import type { CompiledOceanObstacle } from "../../compiler/ocean/OceanNearshoreCompiledTypes";
import {
  createOceanObstacleBoundarySample,
  OceanObstacleFieldResource
} from "../../runtime/ocean/OceanObstacleFieldResource";

describe("OceanObstacleFieldResource", () => {
  it("samples circle and rotated ellipse boundaries with outward unit normals", () => {
    const obstacles: readonly CompiledOceanObstacle[] = [
      {
        id: "circle",
        index: 0,
        descriptor: {
          id: "circle",
          shape: "circle",
          centerXZ: [2, 3],
          radius: 2,
          height: 4
        },
        bounds: [0, 1, 4, 5]
      },
      {
        id: "ellipse",
        index: 1,
        descriptor: {
          id: "ellipse",
          shape: "ellipse",
          centerXZ: [-1, 2],
          radiiXZ: [3, 1],
          rotationRadians: Math.PI * 0.5,
          height: 5
        },
        bounds: [-2, -1, 0, 5]
      }
    ];
    const resource = new OceanObstacleFieldResource(obstacles);
    const sample = createOceanObstacleBoundarySample();

    expect(resource.sampleBoundary(0, 0, sample)).toBe(true);
    expect(sample.worldX).toBeCloseTo(4);
    expect(sample.worldZ).toBeCloseTo(3);
    expect(Math.hypot(sample.normalX, sample.normalZ)).toBeCloseTo(1);
    expect(resource.containsPoint(0, 2, 3)).toBe(true);
    expect(resource.containsPoint(0, 5, 3)).toBe(false);

    expect(resource.sampleBoundary(1, 0, sample)).toBe(true);
    expect(sample.worldX).toBeCloseTo(-1);
    expect(sample.worldZ).toBeCloseTo(5);
    expect(Math.hypot(sample.normalX, sample.normalZ)).toBeCloseTo(1);
    expect(resource.containsPoint(1, -1, 2)).toBe(true);

    resource.dispose();
    expect(resource.isDisposed).toBe(true);
  });
});
