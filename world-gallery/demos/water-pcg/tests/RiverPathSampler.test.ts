import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverDiagnosticCode, RiverPathMode } from "../river/constants";
import { sampleRiverPath } from "../river/RiverPathSampler";
import { RiverConfig, RiverSamplePoint } from "../river/types";
import { longOverBudgetFixture, sharpBendFixture, variableProfileFixture } from "./fixtures/riverFixtures";

function expectPoint(sample: RiverSamplePoint, expected: [number, number, number]): void {
  expect([sample.position.x, sample.position.y, sample.position.z]).toEqual(expected);
}

function findAtPosition(samples: RiverSamplePoint[], position: [number, number, number]): RiverSamplePoint | undefined {
  return samples.find(
    (sample) =>
      Math.abs(sample.position.x - position[0]) < 1e-6 &&
      Math.abs(sample.position.y - position[1]) < 1e-6 &&
      Math.abs(sample.position.z - position[2]) < 1e-6
  );
}

function distanceToPolyline(point: Vector3, samples: RiverSamplePoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].position;
    const b = samples[i].position;
    const ab = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const ap = new Vector3(point.x - a.x, point.y - a.y, point.z - a.z);
    const lengthSquared = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    const t =
      lengthSquared > 0 ? Math.min(1, Math.max(0, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared)) : 0;
    best = Math.min(
      best,
      Math.hypot(point.x - (a.x + ab.x * t), point.y - (a.y + ab.y * t), point.z - (a.z + ab.z * t))
    );
  }
  return best;
}

describe("RiverPathSampler", () => {
  it.each([RiverPathMode.Polyline, RiverPathMode.CatmullRom, RiverPathMode.Bezier])(
    "preserves every anchor and exact local profile for %s",
    (mode) => {
      const config: RiverConfig = { ...variableProfileFixture, path: { ...variableProfileFixture.path, mode } };
      const result = sampleRiverPath(config);
      expectPoint(result.points[0], config.path.points[0].position);
      expectPoint(result.points[result.points.length - 1], config.path.points[2].position);
      for (const anchor of config.path.points) {
        const sample = findAtPosition(result.points, anchor.position);
        expect(sample).toBeDefined();
        expect(sample?.width).toBe(anchor.width);
        expect(sample?.depth).toBe(anchor.depth);
        expect(sample?.flowSpeed).toBe(anchor.flowSpeed);
        expect(sample?.bankFeather).toBe(anchor.bankFeather);
      }
    }
  );

  it("redistributes an over-budget path without truncating anchors or mouth", () => {
    const result = sampleRiverPath(longOverBudgetFixture);
    expect(result.points).toHaveLength(longOverBudgetFixture.quality.geometry.maxSegmentCount + 1);
    for (const anchor of longOverBudgetFixture.path.points) {
      expect(findAtPosition(result.points, anchor.position)).toBeDefined();
    }
    expectPoint(result.points[result.points.length - 1], [120, 0, 0]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      RiverDiagnosticCode.SamplingBudgetRedistributed
    );
  });

  it("preserves anchors when budget is below the anchor minimum", () => {
    const config: RiverConfig = {
      ...sharpBendFixture,
      quality: {
        ...sharpBendFixture.quality,
        geometry: { ...sharpBendFixture.quality.geometry, maxSegmentCount: 1 }
      }
    };
    const result = sampleRiverPath(config);
    expect(result.points).toHaveLength(3);
    for (const anchor of config.path.points) expect(findAtPosition(result.points, anchor.position)).toBeDefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      RiverDiagnosticCode.SamplingBudgetBelowAnchorCount
    );
  });

  it("keeps world-space spacing and Bezier chord error within tolerance", () => {
    const config: RiverConfig = {
      ...variableProfileFixture,
      path: { ...variableProfileFixture.path, segmentLength: 0.25 },
      quality: {
        ...variableProfileFixture.quality,
        geometry: { ...variableProfileFixture.quality.geometry, maxChordError: 0.04, maxSegmentCount: 512 }
      }
    };
    const result = sampleRiverPath(config);
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1].position;
      const b = result.points[i].position;
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThanOrEqual(0.27);
    }
    const p0 = config.path.points[0].position;
    const p1 = config.path.points[0].out ?? [0, 0, 0];
    const p2Offset = config.path.points[1].in ?? [0, 0, 0];
    const p3 = config.path.points[1].position;
    for (let step = 0; step <= 100; step++) {
      const t = step / 100;
      const u = 1 - t;
      const point = new Vector3(
        p0[0] * u * u * u + (p0[0] + p1[0]) * 3 * u * u * t + (p3[0] + p2Offset[0]) * 3 * u * t * t + p3[0] * t * t * t,
        p0[1] * u * u * u + (p0[1] + p1[1]) * 3 * u * u * t + (p3[1] + p2Offset[1]) * 3 * u * t * t + p3[1] * t * t * t,
        p0[2] * u * u * u + (p0[2] + p1[2]) * 3 * u * u * t + (p3[2] + p2Offset[2]) * 3 * u * t * t + p3[2] * t * t * t
      );
      expect(distanceToPolyline(point, result.points)).toBeLessThanOrEqual(0.04);
    }
  });
});
