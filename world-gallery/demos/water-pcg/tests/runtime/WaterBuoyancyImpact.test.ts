import type { DynamicCollider, Entity } from "@galacean/engine-core";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";
import { WaterBuoyancy } from "../../runtime/buoyancy/WaterBuoyancy";
import type { WaterSurfaceInteractionSink } from "../../runtime/interaction/WaterSurfaceInteractionSink";
import type { WaterSurfaceProvider, WaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";

describe("WaterBuoyancy water-surface interaction", () => {
  it("emits one entry edge, persistent wet contact, and another entry after becoming dry", () => {
    const worldMatrix = new Matrix();
    Matrix.affineTransformation(new Vector3(1, 1, 1), new Quaternion(), new Vector3(0, 2, 0), worldMatrix);
    const collider = {
      enabled: true,
      isKinematic: false,
      mass: 40,
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
      centerOfMass: new Vector3(),
      applyForceAtPosition: vi.fn()
    };
    let surfaceHeight = 0;
    const provider: WaterSurfaceProvider = {
      sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
        outSample.waterBodyId = "pool";
        outSample.surfacePosition.set(worldPosition.x, surfaceHeight, worldPosition.z);
        outSample.surfaceNormal.set(0, 1, 0);
        outSample.waterVelocity.set(0, 0, 0);
        outSample.waterDepth = 3;
        return true;
      }
    };
    const interactions: Array<{ enteredWater: boolean; relativeVelocityY: number }> = [];
    const sink: WaterSurfaceInteractionSink = {
      registerInteraction(_position, _normal, relativeVelocity, _radius, _ratio, enteredWater): boolean {
        interactions.push({ enteredWater, relativeVelocityY: relativeVelocity.y });
        return true;
      }
    };
    const entity = {
      engine: {},
      scene: { physics: { gravity: new Vector3(0, -9.81, 0) } },
      transform: { worldMatrix, lossyWorldScale: new Vector3(1, 1, 1) },
      getComponent: vi.fn(() => collider as unknown as DynamicCollider),
      _isActiveInScene: false,
      isActiveInHierarchy: false
    } as unknown as Entity;
    const buoyancy = new WaterBuoyancy(entity);
    buoyancy.surfaceProvider = provider;
    buoyancy.interactionSink = sink;
    buoyancy.pontoons = [{ localPosition: new Vector3(), radius: 1, enabled: true }];
    buoyancy.onAwake();

    buoyancy.onPhysicsUpdate();
    expect(buoyancy.isInWater).toBe(false);
    expect(interactions).toHaveLength(0);

    surfaceHeight = 2;
    collider.linearVelocity.y = -4;
    buoyancy.onPhysicsUpdate();
    expect(interactions).toEqual([{ enteredWater: true, relativeVelocityY: -4 }]);

    collider.linearVelocity.y = 0;
    for (let step = 0; step < 120; step++) buoyancy.onPhysicsUpdate();
    expect(interactions).toHaveLength(121);
    expect(interactions.slice(1)).toEqual(
      Array.from({ length: 120 }, () => ({ enteredWater: false, relativeVelocityY: 0 }))
    );

    collider.linearVelocity.y = 0.2;
    buoyancy.onPhysicsUpdate();
    expect(interactions).toHaveLength(122);
    expect(interactions.at(-1)).toEqual({ enteredWater: false, relativeVelocityY: 0.2 });

    surfaceHeight = 0;
    collider.linearVelocity.y = 0;
    buoyancy.onPhysicsUpdate();
    expect(buoyancy.isInWater).toBe(false);

    surfaceHeight = 2;
    collider.linearVelocity.y = -2;
    buoyancy.onPhysicsUpdate();
    expect(interactions.filter((interaction) => interaction.enteredWater)).toHaveLength(2);
  });

  it("preserves the existing force/query path when no interaction sink is assigned", () => {
    const worldMatrix = new Matrix();
    Matrix.affineTransformation(new Vector3(1, 1, 1), new Quaternion(), new Vector3(), worldMatrix);
    const collider = {
      enabled: true,
      isKinematic: false,
      mass: 10,
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
      centerOfMass: new Vector3(),
      applyForceAtPosition: vi.fn()
    };
    const sampleSurface = vi.fn((worldPosition: Vector3, outSample: WaterSurfaceSample): boolean => {
      outSample.waterBodyId = "pool";
      outSample.surfacePosition.set(worldPosition.x, 0, worldPosition.z);
      outSample.surfaceNormal.set(0, 1, 0);
      outSample.waterVelocity.set(0, 0, 0);
      outSample.waterDepth = 3;
      return true;
    });
    const entity = {
      engine: {},
      scene: { physics: { gravity: new Vector3(0, -9.81, 0) } },
      transform: { worldMatrix, lossyWorldScale: new Vector3(1, 1, 1) },
      getComponent: vi.fn(() => collider as unknown as DynamicCollider),
      _isActiveInScene: false,
      isActiveInHierarchy: false
    } as unknown as Entity;
    const buoyancy = new WaterBuoyancy(entity);
    buoyancy.surfaceProvider = { sampleSurface };
    buoyancy.pontoons = [{ localPosition: new Vector3(), radius: 1, enabled: true }];
    buoyancy.onAwake();
    buoyancy.onPhysicsUpdate();

    expect(buoyancy.interactionSink).toBeNull();
    expect(sampleSurface).toHaveBeenCalledOnce();
    expect(collider.applyForceAtPosition).toHaveBeenCalledOnce();
    expect(buoyancy.lastStepQueryCount).toBe(1);
    expect(buoyancy.lastStepAppliedForceCount).toBe(1);
  });
});
