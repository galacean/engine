import type { Engine, Entity } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import {
  buildOceanSplashSpritePixels,
  OceanSplashVfxController,
  type OceanSplashEmitter,
  type OceanSplashEmitterFactory
} from "../../demo/ocean/OceanSplashVfxController";
import {
  WaterInteractionEventKind,
  WaterInteractionEventQueue
} from "../../runtime/interaction/WaterInteractionEventQueue";

interface FakeSplashEmitter extends OceanSplashEmitter {
  readonly positions: Array<readonly [number, number, number]>;
  clearCount: number;
  destroyCount: number;
}

function createParent(): Entity {
  const createEntity = (): Entity =>
    ({
      createChild: () => createEntity(),
      destroy: () => undefined
    }) as unknown as Entity;
  return createEntity();
}

function enqueue(
  queue: WaterInteractionEventQueue,
  emitterId: number,
  kind: WaterInteractionEventKind,
  strength: number
): void {
  queue.enqueue({
    emitterId,
    kind,
    worldX: emitterId,
    worldY: 0.5,
    worldZ: -emitterId,
    velocityX: 1,
    velocityY: 2,
    velocityZ: -1,
    radius: 1,
    strength,
    time: 2,
    priority: strength
  });
}

function createHarness(options?: {
  readonly enabled?: boolean;
  readonly maximumParticlesPerFrame?: number;
}): {
  readonly controller: OceanSplashVfxController;
  readonly queue: WaterInteractionEventQueue;
  readonly emitter: FakeSplashEmitter;
  readonly factoryCreateCount: () => number;
} {
  const queue = new WaterInteractionEventQueue(16);
  let alive = false;
  const emitter: FakeSplashEmitter = {
    capacity: 96,
    positions: [],
    clearCount: 0,
    destroyCount: 0,
    get isAlive() {
      return alive;
    },
    emitAt(worldX, worldY, worldZ, count) {
      this.positions.push([worldX, worldY, worldZ]);
      alive = count > 0;
      return count;
    },
    clear() {
      alive = false;
      this.clearCount++;
    },
    destroy() {
      alive = false;
      this.destroyCount++;
    }
  };
  let factoryCreateCount = 0;
  const factory: OceanSplashEmitterFactory = {
    create(_engine, _parent, capacity) {
      factoryCreateCount++;
      expect(capacity).toBe(96);
      return emitter;
    }
  };
  const controller = new OceanSplashVfxController(
    {} as Engine,
    createParent(),
    {
      getEventQueue: () => queue,
      emitterFactory: factory,
      enabled: options?.enabled,
      maximumParticlesPerFrame:
        options?.maximumParticlesPerFrame
    }
  );
  return {
    controller,
    queue,
    emitter,
    factoryCreateCount: () => factoryCreateCount
  };
}

describe("OceanSplashVfxController", () => {
  it("builds a soft bounded droplet sprite", () => {
    const size = 16;
    const pixels = buildOceanSplashSpritePixels(size);
    const centerOffset =
      (Math.floor(size / 2) * size + Math.floor(size / 2)) *
      4;
    const edgeOffset = (Math.floor(size / 2) * size) * 4;

    expect(pixels).toHaveLength(size * size * 4);
    expect(pixels[3]).toBe(0);
    expect(pixels[centerOffset + 3]).toBeGreaterThan(240);
    expect(pixels[edgeOffset + 3]).toBe(0);
    expect(() => buildOceanSplashSpritePixels(2)).toThrow(
      /at least four pixels/
    );
  });

  it("drains bounded Impact events through one fixed emitter and material", () => {
    const harness = createHarness();
    enqueue(harness.queue, 1, WaterInteractionEventKind.Impact, 0.4);
    enqueue(harness.queue, 2, WaterInteractionEventKind.Rain, 0.8);
    enqueue(harness.queue, 3, WaterInteractionEventKind.Impact, 1);

    harness.controller.update();

    expect(harness.factoryCreateCount()).toBe(1);
    expect(harness.queue.count).toBe(0);
    expect(harness.controller.metrics.emitterCreateCount).toBe(1);
    expect(harness.controller.metrics.materialCreateCount).toBe(1);
    expect(harness.controller.metrics.consumedImpactCount).toBe(2);
    expect(harness.controller.metrics.ignoredEventCount).toBe(1);
    expect(harness.controller.metrics.emissionCount).toBe(2);
    expect(harness.controller.metrics.emittedParticleCount).toBe(28);
    expect(harness.emitter.positions).toEqual([
      [1, 0.5, -1],
      [3, 0.5, -3]
    ]);
  });

  it("caps an entire frame and never creates resources per event", () => {
    const harness = createHarness({
      maximumParticlesPerFrame: 24
    });
    for (let index = 0; index < 16; index++) {
      enqueue(
        harness.queue,
        index,
        WaterInteractionEventKind.Impact,
        1
      );
    }

    harness.controller.update();

    expect(harness.controller.metrics.consumedImpactCount).toBe(16);
    expect(harness.controller.metrics.emittedParticleCount).toBe(24);
    expect(harness.controller.metrics.emissionCount).toBe(2);
    expect(harness.factoryCreateCount()).toBe(1);
    expect(harness.controller.metrics.activeEmitterCount).toBe(1);
    expect(harness.controller.metrics.activeMaterialCount).toBe(1);
  });

  it("clears queued events and live particles on disable, reset, and destroy", () => {
    const harness = createHarness();
    enqueue(harness.queue, 1, WaterInteractionEventKind.Impact, 1);
    harness.controller.update();
    expect(harness.controller.metrics.hasLiveParticles).toBe(true);

    enqueue(harness.queue, 2, WaterInteractionEventKind.Impact, 1);
    harness.controller.setEnabled(false);
    expect(harness.queue.count).toBe(0);
    expect(harness.controller.metrics.hasLiveParticles).toBe(false);

    enqueue(harness.queue, 3, WaterInteractionEventKind.Impact, 1);
    harness.controller.update();
    expect(harness.queue.count).toBe(0);
    expect(harness.controller.metrics.disabledEventDropCount).toBe(2);

    harness.controller.setEnabled(true);
    enqueue(harness.queue, 4, WaterInteractionEventKind.Impact, 0.5);
    harness.controller.update();
    harness.controller.reset();
    expect(harness.queue.count).toBe(0);
    expect(harness.controller.metrics.hasLiveParticles).toBe(false);

    harness.controller.destroy();
    expect(harness.emitter.destroyCount).toBe(1);
    expect(harness.controller.metrics.emitterCreateCount).toBe(
      harness.controller.metrics.emitterDestroyCount
    );
    expect(harness.controller.metrics.materialCreateCount).toBe(
      harness.controller.metrics.materialDestroyCount
    );
    expect(harness.controller.metrics.activeEmitterCount).toBe(0);
    expect(harness.controller.metrics.activeMaterialCount).toBe(0);
  });
});
