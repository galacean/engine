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
    getInstanceMaterial() {
      return this.material;
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
import { planningWhiteboxes } from "../../../packages/world-planning/src/semantic-study/PlanningWhiteboxes.ts";
import {
  applyRockCollisionPolicyToPlan,
  DEFAULT_ROCK_COLLISION_POLICY,
  resolveRockCollision,
  resolveRockCollisionPolicy
} from "../../../packages/world-planning/src/spatial/RockCollisionPolicy.ts";
import {
  applyRockObbSizes,
  rockObbId
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Authoring.ts";
import { guidanceRockBox } from "../../../packages/world-planning/src/spatial/guidance/GuidanceRock.ts";
import { applyLandscapeEdits } from "../../../packages/world-planning/src/spatial/layout/DerivedEdits.ts";
import { projectLayoutGroups } from "../../../packages/world-planning/src/spatial/layout/LayoutPlanAdapter.ts";
import {
  rockVariantFit,
  rockVariantFittedTopHeight
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Variants.ts";
import { createTemplatePlanningDocument } from "../../../packages/world-planning/src/spatial/WorldTemplateAuthoring.ts";
import { generatePlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningRuntime.ts";
import { PlanningAnimalHabitat } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat.ts";
import type { PlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";

const formation = (): RockFormationMesh => ({
  id: "f",
  origin: [10, 20, 30],
  owners: ["r:obb:a", "r:obb:b", "r:obb:a"],
  mesh: {
    positions: new Float32Array([0, 3, 0, 1, 3, 0, 0, 4, 1, 2, 3, 0]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2, 0, 0, 0])
  },
  stats: { bodies: 1, vertices: 1 }
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

it("applies configurable rock collision policy cleanly while keeping collider and whitebox consumers switch-only", () => {
  expect(DEFAULT_ROCK_COLLISION_POLICY).toEqual({ minHorizontalM: 2.0 });
  // Footprint-only default policy
  expect(resolveRockCollision({ width: 1.9, depth: 1.9, height: 1.8 })).toBe(false);
  expect(resolveRockCollision({ width: 2.0, depth: 1.0, height: 0.8 })).toBe(true);
  expect(resolveRockCollision({ width: 1.0, depth: 2.0, height: 0.8 })).toBe(true);
  // Explicit switch always takes precedence
  expect(resolveRockCollision({ width: 1.0, depth: 1.0, height: 0.5 }, DEFAULT_ROCK_COLLISION_POLICY, true)).toBe(true);
  expect(resolveRockCollision({ width: 5.0, depth: 5.0, height: 4.0 }, DEFAULT_ROCK_COLLISION_POLICY, false)).toBe(
    false
  );
  // Per-template custom threshold override
  const strictPolicy = resolveRockCollisionPolicy({ minHorizontalM: 3.0, minHeightM: 1.5 });
  expect(resolveRockCollision({ width: 2.5, depth: 2.0, height: 1.2 }, strictPolicy)).toBe(false);
  expect(resolveRockCollision({ width: 1.0, depth: 1.0, height: 1.6 }, strictPolicy)).toBe(true);

  const plan = {
    poiDistribution: true,
    rocks: [],
    buildings: [],
    landscapes: [
      {
        id: "pebble",
        ownerId: "pebble",
        kind: "rock",
        center: { x: 0, z: 0 },
        width: 1.2,
        depth: 1.0,
        height: 0.7,
        yaw: 0,
        baseHeight: 0
      },
      {
        id: "boulder",
        ownerId: "boulder",
        kind: "rock",
        center: { x: 5, z: 0 },
        width: 2.4,
        depth: 1.8,
        height: 1.1,
        yaw: 0,
        baseHeight: 0
      },
      {
        id: "pillar",
        ownerId: "pillar",
        kind: "rock",
        center: { x: 10, z: 0 },
        width: 1.0,
        depth: 1.0,
        height: 2.5,
        yaw: 0,
        baseHeight: 0,
        collision: true
      },
      {
        id: "forced-off",
        ownerId: "forced-off",
        kind: "rock",
        center: { x: 15, z: 0 },
        width: 4.0,
        depth: 4.0,
        height: 3.0,
        yaw: 0,
        baseHeight: 0,
        collision: false
      }
    ]
  } as unknown as IslandPlan;

  applyRockCollisionPolicyToPlan(plan, DEFAULT_ROCK_COLLISION_POLICY);
  const disabled = disabledRockCollisionOwners(plan);
  expect([...disabled].sort()).toEqual(["forced-off", "pebble"]);

  const whiteboxCollisions = Object.fromEntries(
    planningWhiteboxes(plan, () => 0).map((part) => [part.id, part.boxes[0]!.collision])
  );
  expect(whiteboxCollisions).toEqual({
    pebble: false,
    boulder: true,
    pillar: true,
    "forced-off": false
  });
});

it("re-evaluates rock collision on AI/editor OBB resizes, landscape edits, and guidance rocks, and fits XZ footprint without shrinking", () => {
  const obbId = rockObbId("rock-1", "part-0");
  const basePlan = {
    parameters: {},
    rocks: [
      {
        id: "rock-1",
        groupId: "rock-1",
        center: { x: 0, z: 0 },
        width: 4,
        depth: 4,
        height: 3,
        yaw: 0,
        outline: [],
        obb: [],
        boxes: [
          {
            id: "part-0",
            label: "part-0",
            center: { x: 0, z: 0 },
            sizeX: 4,
            sizeY: 3,
            sizeZ: 4,
            yaw: 0,
            elevation: 0,
            collision: true,
            occlusion: true
          }
        ]
      }
    ],
    buildings: [],
    landscapes: [
      {
        id: "ls-rock",
        ownerId: "ls-rock",
        kind: "rock",
        center: { x: 10, z: 10 },
        width: 1.2,
        depth: 1.1,
        height: 0.8,
        yaw: 0,
        baseHeight: 0,
        outline: [],
        collisionRadius: 0.8,
        collision: false
      }
    ]
  } as unknown as IslandPlan;

  // Shrink below threshold -> disables both PhysX owner and whitebox OBB
  const shrinkDoc = {
    entities: {
      [obbId]: {
        components: {
          rockObb: { values: { width: 1.2, depth: 1.1, height: 0.8 } }
        }
      }
    }
  } as unknown as PlanningDocument;
  applyRockObbSizes(basePlan, shrinkDoc);
  expect(basePlan.rocks[0].boxes![0].collision).toBe(false);
  expect(disabledRockCollisionOwners(basePlan).has(obbId)).toBe(true);
  expect(planningWhiteboxes(basePlan, () => 0)[0].boxes[0].collision).toBe(false);

  // Enlarge back above threshold -> re-enables both PhysX owner and whitebox OBB
  const growDoc = {
    entities: {
      [obbId]: {
        components: {
          rockObb: { values: { width: 2.5, depth: 1.5, height: 1.0 } }
        }
      }
    }
  } as unknown as PlanningDocument;
  applyRockObbSizes(basePlan, growDoc);
  expect(basePlan.rocks[0].boxes![0].collision).toBe(true);
  expect(disabledRockCollisionOwners(basePlan).has(obbId)).toBe(false);
  expect(planningWhiteboxes(basePlan, () => 0)[0].boxes[0].collision).toBe(true);

  // Enlarge a small landscape rock via AI/editor edit -> auto-enables collision
  applyLandscapeEdits(basePlan as any, { "ls-rock": { width: 2.6, depth: 2.2 } }, () => 0);
  expect(basePlan.landscapes![0].collision).toBe(true);

  // Guidance rock boxes follow the same configurable policy
  expect(
    guidanceRockBox(
      { id: "g-small", center: { x: 0, z: 0 }, width: 1.4, depth: 1.2, height: 0.9, yaw: 0 } as any,
      () => 0
    ).collision
  ).toBe(false);
  expect(
    guidanceRockBox(
      { id: "g-large", center: { x: 0, z: 0 }, width: 2.2, depth: 1.6, height: 1.0, yaw: 0 } as any,
      () => 0
    ).collision
  ).toBe(true);

  // Footprint-only rock fitting expands Y-bottlenecked rocks to fill XZ footprint and never shrinks any axis
  const m = rockVariantFit(
    {
      id: "wide-low-hill",
      seed: 1,
      surfaceGrass: true,
      origin: [0, 0, 0],
      guides: [
        {
          id: "g",
          ownerId: "g",
          center: [0, 6, 0],
          size: [100, 12, 50],
          axes: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ]
        }
      ]
    },
    {
      id: "a",
      groundInset: 0.1,
      bounds: [
        [-5, 0, -5],
        [5, 5, 5]
      ]
    } as any
  );
  const fitX = Math.hypot(m[0], m[2]);
  const fitZ = Math.hypot(m[8], m[10]);
  const fitY = m[5];
  // XZ fits 50/10 = 5.0 uniformly across all 3 axes (no non-uniform distortion)
  expect(fitX).toBeCloseTo(5.0, 5);
  expect(fitZ).toBeCloseTo(5.0, 5);
  expect(fitY).toBeCloseTo(5.0, 5);
});

it("preserves explicit authored rock collision overrides across edits and matches policy on initial POI rocks", () => {
  const { plan } = generatePlanningDocument(createTemplatePlanningDocument(3414254481, "titan-wasteland"));
  const pillar = plan.landscapes!.find((item) => item.id.endsWith("island-pillar-sw"))!;
  expect(pillar).toBeDefined();
  expect(pillar.collision).toBe(true);
  expect(pillar.collisionOverride).toBe(true);

  // Editing height on an explicit collision:true slender pillar (1.0 x 1.0 m) must preserve collision: true.
  applyLandscapeEdits(plan, { [pillar.id]: { height: 2.6 } }, () => 0);
  const editedPillar = plan.landscapes!.find((item) => item.id === pillar.id)!;
  expect(editedPillar.height).toBe(2.6);
  expect(editedPillar.collision).toBe(true);
  expect(editedPillar.collisionOverride).toBe(true);

  // Initial POI layout projection applies the same rock size policy as subsequent edits.
  const layoutPlan = {
    parameters: { width: 1024, depth: 1024, seed: 1 },
    buildings: [],
    rocks: [],
    mountains: [],
    plazas: [],
    regions: [],
    routes: [],
    planning: { ports: [], modules: [] }
  } as unknown as IslandPlan;
  projectLayoutGroups(
    layoutPlan,
    [
      {
        id: "poi-test",
        center: { x: 100, z: 100 },
        rule: { pattern: "region", radiusM: 20, openRadiusM: 0, pathWidthM: 2 } as any,
        ports: [],
        paths: [],
        volumes: [
          {
            id: "poi-small-rock",
            boxes: [{ center: { x: 100, z: 100 }, width: 1.2, depth: 1.1, height: 0.9, yaw: 0, elevation: 0 }]
          },
          {
            id: "poi-large-rock",
            boxes: [{ center: { x: 110, z: 100 }, width: 3.0, depth: 2.5, height: 2.0, yaw: 0, elevation: 0 }]
          }
        ]
      } as any
    ],
    { "poi-test": "rock" },
    false
  );
  expect(layoutPlan.rocks.find((r) => r.id === "poi-small-rock")!.boxes![0].collision).toBe(false);
  expect(layoutPlan.rocks.find((r) => r.id === "poi-large-rock")!.boxes![0].collision).toBe(true);
});

it("syncs uniform-XZ fitted rock top height into animal air obstacle checks", () => {
  const { plan } = generatePlanningDocument(createTemplatePlanningDocument(3414254481, "titan-wasteland"));
  const cliff = plan.rocks.find((r) => r.id.endsWith("canyon-basin-far-c"))!;
  expect(cliff).toBeDefined();
  const baseY = cliff.baseHeight ?? 0;
  expect(cliff.height).toBeCloseTo(8.5, 5);

  const habitat = new PlanningAnimalHabitat(
    plan,
    {
      sampleHeightInterpolated: () => baseY,
      sampleContactIsWater: () => false
    },
    { spawnRadius: 2000, roamRadius: 2000 }
  );

  // Flight probe crossing at +14m above base (above planned 8.5m OBB, inside ~20.07m fitted rock top) must be blocked.
  const cx = cliff.center.x,
    cz = cliff.center.z;
  expect(
    habitat.canTraverseAir({ x: cx - 30, y: baseY + 14, z: cz }, { x: cx + 30, y: baseY + 14, z: cz }, 0.5, 1.0)
  ).toBe(false);

  // Flight probe safely above the ~20.07m fitted rock top must remain passable.
  expect(
    habitat.canTraverseAir({ x: cx - 30, y: baseY + 25, z: cz }, { x: cx + 30, y: baseY + 25, z: cz }, 0.5, 1.0)
  ).toBe(true);

  // Shorter fitted cliff (`left-cliff-step-1`) must not leave an air wall between fitted top (~27.89m) and taller planned OBB (~39.10m).
  const shorterCliff = plan.rocks.find((r) => r.id.endsWith("left-cliff-step-1"))!;
  expect(shorterCliff).toBeDefined();
  const sBaseY = shorterCliff.baseHeight ?? 0;
  const isolatedPlan = { ...plan, rocks: [shorterCliff], buildings: [], landscapes: [], courtyards: [], fences: [] };
  const isolatedHabitat = new PlanningAnimalHabitat(
    isolatedPlan,
    {
      sampleHeightInterpolated: () => sBaseY,
      sampleContactIsWater: () => false
    },
    { spawnRadius: 2000, roamRadius: 2000 }
  );
  const sx = shorterCliff.center.x,
    sz = shorterCliff.center.z;
  expect(
    isolatedHabitat.canTraverseAir({ x: sx, y: sBaseY + 15, z: sz }, { x: sx + 1, y: sBaseY + 15, z: sz }, 0.5, 1.0)
  ).toBe(false);
  expect(
    isolatedHabitat.canTraverseAir(
      { x: sx, y: sBaseY + 27.85, z: sz },
      { x: sx + 1, y: sBaseY + 27.85, z: sz },
      0.5,
      1.0
    )
  ).toBe(true);
});

it("evaluates minHeightM against uniform-XZ fitted exposed height instead of raw planned height", () => {
  const plan = {
    parameters: { seed: 999, width: 1024, depth: 1024, worldTemplate: { id: "oil-paint" } },
    poiDistribution: true,
    rocks: [],
    buildings: [],
    landscapes: [
      {
        id: "narrow-tall-non-pillar",
        ownerId: "narrow-tall-non-pillar",
        kind: "rock",
        center: { x: 10, z: 10 },
        // Raw planned height (1.4m) >= 0.9m, but <= 1.5 * width so it fits uniformly by XZ (exposed height < 0.9m).
        width: 1.0,
        depth: 0.9,
        height: 1.4,
        yaw: 0,
        baseHeight: 0
      },
      {
        id: "true-slender-pillar",
        ownerId: "true-slender-pillar",
        kind: "rock",
        center: { x: 20, z: 10 },
        // height (2.2m) > 1.5 * max(width, depth), so rockVariantFit treats it as a standing pillar.
        width: 1.0,
        depth: 1.0,
        height: 2.2,
        yaw: 0,
        baseHeight: 0
      }
    ]
  } as unknown as IslandPlan;

  const narrowFitted = rockVariantFittedTopHeight(plan, "narrow-tall-non-pillar", 1.0, 1.4, 0.9, false)!;
  const pillarFitted = rockVariantFittedTopHeight(plan, "true-slender-pillar", 1.0, 2.2, 1.0, false)!;
  expect(narrowFitted).toBeLessThan(0.9);
  expect(pillarFitted).toBeGreaterThanOrEqual(0.9);

  applyRockCollisionPolicyToPlan(plan, { minHorizontalM: 1.5, minHeightM: 0.9 });
  expect(plan.landscapes![0].collision).toBe(false);
  expect(plan.landscapes![1].collision).toBe(true);
});

it("adds and removes dynamic companion-stone obstacles in PlanningAnimalHabitat", () => {
  const plan = {
    parameters: { seed: 1, width: 512, depth: 512 },
    spawn: { x: 50, z: 50 },
    rocks: [],
    buildings: [],
    landscapes: [],
    waters: [],
    courtyards: [],
    fences: [],
    bridges: []
  } as unknown as IslandPlan;

  const habitat = new PlanningAnimalHabitat(
    plan,
    {
      sampleHeightInterpolated: () => 0,
      sampleContactIsWater: () => false
    },
    { spawnRadius: 200, roamRadius: 200 }
  );

  // Open ground before streaming companion stones
  expect(habitat.canTraverse({ x: 45, z: 50 }, { x: 55, z: 50 }, 0.4, 1.0)).toBe(true);

  // Register a colliding 2.2m companion stone blocking the path
  habitat.setDynamicSolids("companion-stone:0/0", [
    { id: "stone-1", x: 50, z: 50, yaw: 0, width: 2.2, depth: 2.0, bottom: 0, top: 1.5 }
  ]);
  expect(habitat.canTraverse({ x: 45, z: 50 }, { x: 55, z: 50 }, 0.4, 1.0)).toBe(false);

  // Evicting the cell removes the dynamic solid and restores traversal
  habitat.setDynamicSolids("companion-stone:0/0", undefined);
  expect(habitat.canTraverse({ x: 45, z: 50 }, { x: 55, z: 50 }, 0.4, 1.0)).toBe(true);
});
