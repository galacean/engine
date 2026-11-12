import { afterEach, expect, it, vi } from "vitest";
import type { IslandPlan } from "../../../packages/world-planning/src/semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types.ts";

const physics = vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  return { meshes: [] as any[], colliders: [] as any[], shapes: [] as any[], fail: false };
});
vi.mock("@galacean/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@galacean/engine")>()),
  ModelMesh: class {
    positions?: unknown;
    indices?: unknown;
    destroyed = false;
    constructor() {
      physics.meshes.push(this);
    }
    setPositions(value: unknown) {
      this.positions = value;
    }
    setIndices(value: unknown) {
      this.indices = value;
    }
    destroy() {
      this.destroyed = true;
    }
  },
  StaticCollider: class {
    destroyed = false;
    shapes: unknown[] = [];
    constructor() {
      physics.colliders.push(this);
    }
    addShape(shape: unknown) {
      this.shapes.push(shape);
    }
    destroy() {
      this.destroyed = true;
    }
  },
  MeshColliderShape: class {
    isConvex = true;
    material = {};
    input?: unknown;
    constructor() {
      physics.shapes.push(this);
    }
    set mesh(value: unknown) {
      if (physics.fail) throw Error("cook failed");
      this.input = value;
    }
  }
}));
import {
  createRockCollider,
  disabledRockCollisionOwners,
  rockCollisionIndices
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Collider.ts";

const formation = (): RockFormationMesh => ({
  id: "f",
  origin: [10, 20, 30],
  owners: ["r:obb:a", "r:obb:b", "r:obb:a"],
  mesh: {
    positions: new Float32Array([0, 3, 0, 1, 3, 0, 0, 4, 1, 2, 3, 0]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2, 0, 0, 0])
  },
  stats: { bodies: 1, vertices: 1, generationMs: 0 }
});
afterEach(() => {
  physics.meshes = [];
  physics.colliders = [];
  physics.shapes = [];
  physics.fail = false;
});

it("uses deformed triangles, omits zero-area faces and respects individual OBB collision flags", () => {
  const surface = formation(),
    before = surface.mesh.indices.slice();
  const plan = {
    rocks: [
      {
        id: "r",
        boxes: [
          { id: "a", collision: true },
          { id: "b", collision: false }
        ]
      }
    ]
  } as unknown as IslandPlan;
  const disabled = disabledRockCollisionOwners(plan);
  expect(rockCollisionIndices(surface, disabled)).toEqual(new Uint32Array([0, 1, 2]));
  expect(surface.mesh.indices).toEqual(before);
});

it("rejects malformed/non-finite geometry instead of publishing an incomplete collider", () => {
  const surface = formation();
  surface.mesh.positions[0] = NaN;
  expect(() => rockCollisionIndices(surface, new Set())).toThrow("Non-finite");
  surface.mesh.positions[0] = 0;
  surface.mesh.indices[0] = 999;
  expect(() => rockCollisionIndices(surface, new Set())).toThrow("triangle index");
  surface.owners = [];
  expect(() => rockCollisionIndices(surface, new Set())).toThrow("mesh arrays");
});

it("creates a readable non-convex CPU mesh on the formation entity without an extra GPU upload", () => {
  const entity = {
    addComponent(Type: any) {
      return new Type();
    }
  };
  const collider = createRockCollider({} as never, entity as never, formation(), new Set());
  expect(collider?.triangles).toBe(2);
  expect(physics.shapes[0].isConvex).toBe(false);
  expect(physics.shapes[0].input).toBe(physics.meshes[0]);
  expect(physics.meshes[0].positions[0]).toMatchObject({ x: 0, y: 3, z: 0 });
  expect(physics.meshes[0].indices).toEqual(new Uint32Array([0, 1, 2, 1, 3, 2]));
  collider!.dispose();
  expect(physics.meshes[0].destroyed).toBe(true);
  expect(physics.colliders[0].destroyed).toBe(true);
});

it("releases both owners when cooking fails and skips collision-free surfaces", () => {
  const entity = {
    addComponent(Type: any) {
      return new Type();
    }
  };
  expect(
    createRockCollider({} as never, entity as never, formation(), new Set(["r:obb:a", "r:obb:b"]))
  ).toBeUndefined();
  expect(physics.meshes).toHaveLength(0);
  physics.fail = true;
  expect(() => createRockCollider({} as never, entity as never, formation(), new Set())).toThrow("cook failed");
  expect(physics.meshes[0].destroyed).toBe(true);
  expect(physics.colliders[0].destroyed).toBe(true);
});
