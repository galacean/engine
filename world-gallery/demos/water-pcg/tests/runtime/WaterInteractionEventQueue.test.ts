import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import {
  WaterInteractionEventKind,
  WaterInteractionEventQueue,
  createWaterInteractionEvent,
  type WaterInteractionEventInput
} from "../../runtime/interaction/WaterInteractionEventQueue";
import { WaterInteractionSinkAdapter } from "../../runtime/interaction/WaterInteractionSinkAdapter";

function event(
  emitterId: number,
  priority: number,
  overrides: Partial<WaterInteractionEventInput> = {}
): WaterInteractionEventInput {
  return {
    emitterId,
    kind: WaterInteractionEventKind.Impact,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    velocityX: 0,
    velocityY: -1,
    velocityZ: 0,
    radius: 1,
    strength: priority,
    time: 0,
    priority,
    ...overrides
  };
}

describe("WaterInteractionEventQueue", () => {
  it("bounds SoA storage and deterministically keeps stronger overflow events", () => {
    const queue = new WaterInteractionEventQueue(2);
    expect(queue.enqueue(event(1, 1))).toBe(true);
    expect(queue.enqueue(event(2, 2))).toBe(true);
    expect(queue.enqueue(event(3, 0.5))).toBe(false);
    expect(queue.enqueue(event(4, 3))).toBe(true);
    expect(queue.count).toBe(2);
    expect(queue.metrics).toMatchObject({
      acceptedCount: 3,
      droppedCount: 2,
      overflowCount: 2,
      replacedCount: 1,
      peakCount: 2
    });
    const output = createWaterInteractionEvent();
    const emitterIds: number[] = [];
    for (let index = 0; index < queue.count; index++) {
      queue.read(index, output);
      emitterIds.push(output.emitterId);
    }
    expect(emitterIds.sort((left, right) => left - right)).toEqual([2, 4]);
  });

  it("aggregates motion by emitter distance and rejects stationary wake injection", () => {
    const queue = new WaterInteractionEventQueue(8, 2);
    const first = event(7, 1, {
      kind: WaterInteractionEventKind.MotionTrail,
      velocityX: 1,
      worldX: 0,
      time: 1
    });
    expect(queue.enqueueMotionTrail(first, 0.5, 0.2)).toBe(true);
    expect(queue.enqueueMotionTrail({ ...first, worldX: 0.2, time: 2 }, 0.5, 0.2)).toBe(false);
    expect(queue.enqueueMotionTrail({ ...first, worldX: 0.6, time: 3 }, 0.5, 0.2)).toBe(true);
    expect(queue.enqueueMotionTrail({ ...first, worldX: 0.7, velocityX: 0, time: 4 }, 0.5, 0.2)).toBe(false);
    expect(queue.metrics).toMatchObject({
      motionTrailAcceptedCount: 2,
      aggregatedCount: 1,
      stationaryRejectedCount: 1
    });
  });

  it("bridges one-shot entry and moving trail events while forwarding deformation contacts", () => {
    const queue = new WaterInteractionEventQueue(8);
    const registerInteraction = vi.fn(() => true);
    const adapter = new WaterInteractionSinkAdapter({
      queue,
      emitterId: 11,
      deformationSink: { registerInteraction },
      minimumTrailDistance: 0.2,
      minimumTrailSpeed: 0.1
    });
    adapter.timeSeconds = 1;
    expect(
      adapter.registerInteraction(new Vector3(), new Vector3(0, 1, 0), new Vector3(1, -3, 0), 0.5, 0.25, true)
    ).toBe(true);
    adapter.timeSeconds = 2;
    adapter.registerInteraction(new Vector3(0.3, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 0, 0), 0.5, 0.5, false);
    adapter.timeSeconds = 3;
    adapter.registerInteraction(new Vector3(0.3, 0, 0), new Vector3(0, 1, 0), new Vector3(), 0.5, 0.5, false);

    expect(registerInteraction).toHaveBeenCalledTimes(3);
    expect(queue.metrics.entryAcceptedCount).toBe(1);
    expect(queue.metrics.motionTrailAcceptedCount).toBe(1);
    expect(queue.metrics.stationaryRejectedCount).toBe(1);
  });
});
