import { describe, it, expect, beforeAll } from "vitest";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";

describe("PhysX Downgrade Mode", () => {
  let physics: PhysXPhysics;

  beforeAll(async () => {
    physics = new PhysXPhysics(PhysXRuntimeMode.JavaScript);
    await physics.initialize();
  }, 30000);

  it("should load PhysX in JavaScript mode", () => {
    expect(physics).toBeDefined();
  });

  it("should have basic physics APIs", () => {
    const physX = (physics as any)._physX;
    expect(physX.PxBoxGeometry).toBeDefined();
    expect(physX.PxSphereGeometry).toBeDefined();
    expect(physX.PxCapsuleGeometry).toBeDefined();
  });

  it("should have cooking APIs for MeshCollider", () => {
    const cooking = (physics as any)._pxCooking;
    expect(cooking.createTriMesh).toBeDefined();
    expect(cooking.createConvexMesh).toBeDefined();
  });

  it("should create physics manager", () => {
    const manager = physics.createPhysicsManager();
    expect(manager).toBeDefined();
  });
});
