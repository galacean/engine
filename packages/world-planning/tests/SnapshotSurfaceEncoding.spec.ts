import { expect, it } from "vitest";
import { Matrix, Vector3 } from "@galacean/engine-math";
import { snapshotEstimatedPosition, snapshotIdentityBits, snapshotPixelIdentity, type SnapshotSurfaceProjection } from "../src/world/SnapshotSurfaceEncoding";

function pixel(id: number, depth: number, p: SnapshotSurfaceProjection): Uint8Array {
  const code = Math.round(Math.log2(depth / p.near) / Math.log2(p.far / p.near) * (2 ** (32 - p.identityBits) - 1));
  const word = id + code * 2 ** p.identityBits;
  return Uint8Array.from([0, 8, 16, 24].map(shift => Math.floor(word / 2 ** shift) % 256));
}
function projection(orthographic = false): SnapshotSurfaceProjection {
  const matrix = new Matrix();
  if (orthographic) Matrix.ortho(-4, 4, -3, 3, 0.1, 12000, matrix);
  else Matrix.perspective(Math.PI / 3, 4 / 3, 0.1, 12000, matrix);
  return { identityBits: 14, near: 0.1, far: 12000, inverseProjection: Array.from(matrix.invert().elements),
    cameraWorld: Array.from(new Matrix().elements), viewport: [0, 0, 1, 1] };
}
it("allocates identity bits for packed instances and preserves all four unsigned bytes", () => {
  for (const count of [0, 10000, 16383, 16384, 65535, 65536, 1000000, 0xffffff]) {
    const bits = snapshotIdentityBits(count), p = { ...projection(), identityBits: bits };
    expect(bits).toBeGreaterThanOrEqual(14);
    expect(2 ** bits).toBeGreaterThan(count);
    for (const id of [0, Math.min(1, count), count]) for (const depth of [p.near, 6000, p.far])
      expect(snapshotPixelIdentity(pixel(id, depth, p), 0, bits)).toBe(id);
  }
  expect(() => snapshotIdentityBits(0x1000000)).toThrow("identity range");
  expect(() => snapshotIdentityBits(-1)).toThrow();
});
it("reconstructs perspective and orthographic surfaces from a frozen camera within depth quantization", () => {
  for (const ortho of [false, true]) {
    const p = projection(ortho);
    const world = new Matrix(); Matrix.translation(new Vector3(20, 3, 40), world);
    p.cameraWorld = Array.from(world.elements);
    const bytes = pixel(10000, 100, p);
    const point = snapshotEstimatedPosition(bytes, 0, 399, 299, 800, 600, p)!;
    expect(point[2]).toBeCloseTo(-60, 1);
    const nx = (399.5 / 800) * 2 - 1, ny = 1 - (299.5 / 600) * 2;
    const expectedX = 20 + nx * (ortho ? 4 : 100 * Math.tan(Math.PI / 6) * 4 / 3);
    const expectedY = 3 + ny * (ortho ? 3 : 100 * Math.tan(Math.PI / 6));
    expect(point[0]).toBeCloseTo(expectedX, 3);
    expect(point[1]).toBeCloseTo(expectedY, 3);
    // Neither background nor an unregistered occluder receives a made-up position.
    expect(snapshotEstimatedPosition(pixel(0, 100, p), 0, 399, 299, 800, 600, p)).toBeUndefined();
  }
});
it("uses the recorded viewport rather than the whole image", () => {
  const p = projection(); p.viewport = [0.25, 0.25, 0.5, 0.5];
  const point = snapshotEstimatedPosition(pixel(7, 20, p), 0, 399.5, 299.5, 800, 600, p)!;
  expect(point[0]).toBeCloseTo(0, 5); expect(point[1]).toBeCloseTo(0, 5);
  expect(point[2]).toBeCloseTo(-20, 1);
});

it("keeps nearby depth useful when grass instance slots require 17 identity bits", () => {
  const p = { ...projection(), identityBits: 17 };
  for (const depth of [1, 10, 50, 100]) {
    const point = snapshotEstimatedPosition(pixel(87453, depth, p), 0, 399.5, 299.5, 800, 600, p)!;
    const maxRelativeError = 2 ** (Math.log2(p.far / p.near) / (2 ** 15 - 1) / 2) - 1;
    expect(Math.abs(-point[2] - depth)).toBeLessThanOrEqual(depth * maxRelativeError + 1e-8);
  }
});
