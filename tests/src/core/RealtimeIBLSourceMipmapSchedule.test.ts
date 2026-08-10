import { describe, expect, it } from "vitest";
import { createRealtimeIBLSourceMipmapSchedule } from "../../../packages/core/src/lighting/environment/RealtimeIBLSourceMipmapSchedule";

describe("Realtime IBL source mip schedule", () => {
  it("keeps dependent mips ordered while packing small levels under texel and draw budgets", () => {
    const schedule = createRealtimeIBLSourceMipmapSchedule({
      resolution: 128,
      mipCount: 8,
      maximumDrawCount: 24
    });

    expect(schedule.map((frame) => frame.mips)).toEqual([[1], [2, 3], [4, 5], [6, 7]]);
    expect(schedule.flatMap((frame) => frame.mips)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Math.max(...schedule.map((frame) => frame.estimatedTexelWork))).toBe(schedule[0].estimatedTexelWork);
    expect(Math.max(...schedule.map((frame) => frame.estimatedDrawCount))).toBe(24);
  });

  it("rejects a draw budget that cannot complete both cubemap passes for one mip", () => {
    expect(() => createRealtimeIBLSourceMipmapSchedule({ resolution: 128, mipCount: 8, maximumDrawCount: 11 })).toThrow(
      "at least 12"
    );
  });
});
