import { describe, expect, it } from "vitest";
import {
  findGeometryTriangleXZ,
  findReachSpanGeometryTriangleXZ
} from "@galacean/engine-water/water/runtime/river/RiverQueryGeometry";
import { riverGeometryTriangleDomain } from "@galacean/engine-water/water/runtime/river/RiverTriangleQuery";
import type { RiverGeometryData } from "@galacean/engine-water/water/compiler/river/types";

function geometry(width = 17, origin = 1000000, folded = false) {
  const positions = Array.from({ length: width * 3 }, (_, i) => {
    const row = Math.floor(i / width),
      column = i % width;
    const x = folded && column > 8 ? 16 - column : column;
    return [origin + x * 0.73 + row * 0.09, row * 0.02 + column * 0.001, row * 1.1] as const;
  });
  // A prefix and a truncated final span exercise native draw ranges.
  const values = [0, 0, 0];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < width - 1; col++) {
      const a = row * width + col,
        b = a + width;
      values.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const indices = new Uint32Array(values);
  return {
    positions,
    indices: { at: (i: number) => indices[i], borrowTypedArray: () => indices },
    drawStart: 3,
    drawCount: values.length - 6
  } as unknown as RiverGeometryData;
}

function compare(g: RiverGeometryData, span: number, x: number, z: number) {
  const width = g.positions.length / 3,
    count = (width - 1) * 6;
  const start = g.drawStart + span * count,
    end = Math.min(start + count, g.drawStart + g.drawCount);
  const before = {} as any,
    after = {} as any;
  const hit = findGeometryTriangleXZ(g, x, z, before, start, end);
  expect(findReachSpanGeometryTriangleXZ(g, 3, span, x, z, after)).toBe(hit);
  if (hit) expect(after).toEqual(before);
  return hit ? after : undefined;
}

describe("animal support river triangle lookup", () => {
  it.each([2, 5, 17, 33])("matches linear ownership and weights for width %s, including expanded edges", (width) => {
    const g = geometry(width);
    for (let i = 0; i < 500; i++) {
      const x = 1000000 - 0.2 + (((i * 73) % 503) / 503) * width * 0.8;
      const z = -0.2 + (((i * 47) % 509) / 509) * 2.6;
      compare(g, 0, x, z);
      compare(g, 1, x, z);
    }
    for (let offset = g.drawStart; offset + 2 < g.drawStart + g.drawCount; offset += 3) {
      const domain = riverGeometryTriangleDomain(g, offset)!;
      const span = Math.floor((offset - g.drawStart) / ((width - 1) * 6));
      for (const p of [...domain.source, ...domain.triangle]) {
        for (const shift of [-1e-9, 0, 1e-9]) compare(g, span, p[0] + shift, p[2] - shift);
      }
    }
  });

  it("retains first-triangle ownership where groups overlap", () => {
    const g = geometry(17, 0, true);
    for (let i = 0; i < 100; i++) compare(g, 0, i * 0.06, 0.5);
    expect(compare(g, 0, 1, 0.5)).toBeDefined();
  });

  it("skips degenerate groups and keeps replacement geometry independent", () => {
    const old = geometry(17, 0);
    const replacement = geometry(17, 10);
    const positions = replacement.positions as unknown as [number, number, number][];
    for (let row = 0; row < 3; row++) for (let col = 0; col <= 4; col++) positions[row * 17 + col] = [10, 0, row * 1.1];
    expect(compare(old, 0, 1, 0.5)).toBeDefined();
    expect(compare(replacement, 0, 1, 0.5)).toBeUndefined();
    expect(compare(replacement, 0, 17, 0.5)).toBeDefined();
    expect(compare(old, 0, 1, 0.5)).toBeDefined();
  });
});
