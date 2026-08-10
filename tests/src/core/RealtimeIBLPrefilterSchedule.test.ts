import { describe, expect, it } from "vitest";
import { createRealtimeIBLPrefilterSchedule } from "../../../packages/core/src/lighting/environment/RealtimeIBLPrefilterSchedule";

describe("Realtime IBL GGX prefilter schedule", () => {
  it("keeps every surface batch ordered while balancing the default shader workload", () => {
    const frameCount = 12;
    const sampleBatchSize = 32;
    const sampleCount = 64;
    const mipCount = 8;
    const schedule = createRealtimeIBLPrefilterSchedule({
      resolution: 128,
      mipCount,
      sampleCount,
      sampleBatchSize,
      frameCount
    });
    const batchesPerSurface = sampleCount / sampleBatchSize;
    const batchesBySurface = new Map<string, number[]>();

    expect(schedule).toHaveLength(frameCount);
    for (let frameIndex = 0; frameIndex < schedule.length; frameIndex++) {
      const frame = schedule[frameIndex];
      expect(frame.items.length).toBeGreaterThan(0);
      for (let itemIndex = 0; itemIndex < frame.items.length; itemIndex++) {
        const item = frame.items[itemIndex];
        const surface = `${item.mip}:${item.face}`;
        const batches = batchesBySurface.get(surface) ?? [];
        batches.push(item.batchIndex);
        batchesBySurface.set(surface, batches);
        expect(item.resolveSurface).toBe(item.batchIndex === batchesPerSurface - 1);
      }
    }

    expect(batchesBySurface.size).toBe((mipCount - 1) * 6);
    const expectedBatches = Array.from({ length: batchesPerSurface }, (_, index) => index);
    for (const batches of batchesBySurface.values()) {
      expect(batches).toEqual(expectedBatches);
    }

    const totalSampleWork = schedule.reduce((total, frame) => total + frame.estimatedSampleWork, 0);
    const idealSampleWork = totalSampleWork / frameCount;
    const sampleWork = schedule.map((frame) => frame.estimatedSampleWork);
    const drawCounts = schedule.map((frame) => frame.estimatedDrawCount);
    expect(Math.max(...sampleWork) / idealSampleWork).toBeLessThan(1.13);
    expect(Math.min(...sampleWork) / idealSampleWork).toBeGreaterThan(0.8);
    expect(Math.max(...drawCounts) - Math.min(...drawCounts)).toBeLessThanOrEqual(2);
  });
});
