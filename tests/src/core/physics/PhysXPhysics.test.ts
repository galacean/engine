import { BoxColliderShape, DynamicCollider, Engine } from "@galacean/engine-core";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("PhysXPhysics", () => {
  let engine: Engine;
  let physics: PhysXPhysics;

  beforeAll(async () => {
    physics = new PhysXPhysics({ tolerancesScale: { length: 2, speed: 20 } });
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
  });

  afterAll(() => {
    engine.destroy();
    physics.destroy();
  });

  it("validates and snapshots tolerancesScale at construction", () => {
    expect(() => new PhysXPhysics({ tolerancesScale: { length: 0 } })).toThrow();
    expect(() => new PhysXPhysics({ tolerancesScale: { length: null as unknown as number } })).toThrow();

    const tolerancesScale = { length: 2, speed: 20 };
    const uninitializedPhysics = new PhysXPhysics({ tolerancesScale });
    tolerancesScale.length = 3;

    expect(uninitializedPhysics.getDefaultContactOffset()).toBeCloseTo(0.04);
  });

  it("applies tolerancesScale to native physics and core defaults", () => {
    const nativeScale = physics._pxPhysics.getTolerancesScale();
    expect(nativeScale.length).toBeCloseTo(2);
    expect(nativeScale.speed).toBeCloseTo(20);

    const entity = engine.sceneManager.activeScene.createRootEntity("scaledDefaults");
    const collider = entity.addComponent(DynamicCollider);
    const shape = new BoxColliderShape();
    collider.addShape(shape);

    expect(shape.contactOffset).toBeCloseTo(0.04);
    expect(collider.sleepThreshold).toBeCloseTo(0.02);
  });
});
