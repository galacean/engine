import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  ColliderShapeUpAxis,
  ControllerCollisionFlag,
  MeshColliderShapeCookingFlag,
  Quaternion,
  Vector3
} from "@galacean/engine";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { rockCollisionIndices } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Collider.ts";
import type { RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types.ts";
import { generateRockFormation } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Generate.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";

vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
});

let physics: PhysXPhysics;
beforeAll(async () => {
  const load = createRequire(import.meta.url)("../../../packages/physics-physx/libs/physx.release.js");
  physics = new PhysXPhysics(PhysXRuntimeMode.WebAssembly);
  // Pure Node harness: initialize the local WASM backend directly, without browser/DOM/WebGL emulation.
  (physics as unknown as { _init(module: unknown): void })._init(await load());
});
afterAll(() => physics?.destroy());

function fixture(disabled = new Set<string>(), z = 0) {
  const formation: RockFormationMesh = {
    id: "surface",
    origin: [10, 5, 30],
    mesh: {
      positions: new Float32Array([-4, 0, -4, 4, 0, -4, 4, 0, 4, -4, 0, 4, 1, 0, -2, 1, 4, -2, 1, 4, 2, 1, 0, 2]),
      indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6])
    },
    owners: ["floor", "floor", "wall", "wall"],
    stats: { bodies: 0, vertices: 0, generationMs: 0 }
  };
  const scene = physics.createPhysicsScene(physics.createPhysicsManager() as never);
  const material = physics.createPhysicsMaterial(0.15, 0.05, 0, 0, 0);
  const vertices: Vector3[] = [];
  for (let i = 0; i < formation.mesh.positions.length; i += 3)
    vertices.push(
      new Vector3(formation.mesh.positions[i], formation.mesh.positions[i + 1], formation.mesh.positions[i + 2])
    );
  const shape = physics.createMeshColliderShape(
    1,
    vertices,
    rockCollisionIndices(formation, disabled),
    false,
    material as never,
    MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding
  )!;
  expect(shape).not.toBeNull();
  const collider = physics.createStaticCollider(new Vector3(...formation.origin), new Quaternion());
  collider.addShape(shape);
  scene.addCollider(collider);
  const capsule = physics.createCapsuleColliderShape(2, 0.5, 0.8, material as never);
  capsule.setUpAxis(ColliderShapeUpAxis.Y);
  capsule.setContactOffset(0.025);
  const controller = physics.createCharacterController();
  controller.setWorldPosition(new Vector3(10, 6, 30 + z));
  // Active Engine components enter their Scene before their capsule is attached.
  scene.addCharacterController(controller);
  controller.addShape(capsule);
  controller.setSlopeLimit(50);
  controller.setStepOffset(0.32);
  scene.update(1 / 60);
  return {
    controller,
    scene,
    dispose() {
      scene.removeCharacterController(controller);
      controller.destroy();
      capsule.destroy();
      scene.removeCollider(collider);
      collider.destroy();
      shape.destroy();
      material.destroy();
      scene.destroy();
    }
  };
}

it("cooks the indexed surface and blocks a full-height capsule at the translated mesh wall", () => {
  const f = fixture(),
    p = new Vector3();
  try {
    let flags = 0;
    for (let i = 0; i < 30; i++) {
      flags |= f.controller.move(new Vector3(0.1, -0.05, 0), 0.0005, 1 / 60);
      f.scene.update(1 / 60);
    }
    f.controller.getWorldPosition(p);
    expect(p.x).toBeGreaterThan(10.4);
    expect(p.x).toBeLessThan(10.51);
    expect(p.y).toBeGreaterThan(5.89);
    expect(p.y).toBeLessThan(5.96);
    expect(flags & ControllerCollisionFlag.Sides).toBeTruthy();
    expect(flags & ControllerCollisionFlag.Down).toBeTruthy();
  } finally {
    f.dispose();
  }
});

it("passes through an actual mesh opening and honors a disabled wall owner without OBB blocking", () => {
  for (const f of [fixture(new Set(), 3), fixture(new Set(["wall"]))]) {
    try {
      for (let i = 0; i < 20; i++) {
        f.controller.move(new Vector3(0.1, -0.05, 0), 0.0005, 1 / 60);
        f.scene.update(1 / 60);
      }
      const p = new Vector3();
      f.controller.getWorldPosition(p);
      expect(p.x).toBeGreaterThan(11.9);
      expect(p.y).toBeGreaterThan(5.89);
    } finally {
      f.dispose();
    }
  }
});

it("cooks the actual reduced procedural surface used for both planned and ground rocks", () => {
  const surface = generateRockFormation({id:"rock", seed:17, origin:[0,0,0],
    guides:[{id:"a",ownerId:"a",center:[0,18,0],size:[48,36,40],axes:[[1,0,0],[0,1,0],[0,0,1]]}],
  }, readRockFormationSettings({entities:{}} as never));
  expect(surface.mesh.indices.length/3).toBeLessThan(surface.stats.rawTriangles!);
  const positions: Vector3[] = [];
  for (let i = 0; i < surface.mesh.positions.length; i += 3)
    positions.push(
      new Vector3(surface.mesh.positions[i], surface.mesh.positions[i + 1], surface.mesh.positions[i + 2])
    );
  const material = physics.createPhysicsMaterial(0.15, 0.05, 0, 0, 0);
  const shape = physics.createMeshColliderShape(
    10,
    positions,
    rockCollisionIndices(surface, new Set()),
    false,
    material as never,
    MeshColliderShapeCookingFlag.Cleaning | MeshColliderShapeCookingFlag.VertexWelding
  );
  try {
    expect(shape).not.toBeNull();
  } finally {
    shape?.destroy();
    material.destroy();
  }
});
