// Preserved geometry/resource invariants from the retired planned-author tests.
// Initialization now uses the native initial recipe; no legacy author/edit format.
import { test } from "vitest";
import type { Engine } from "@galacean/engine-core";
import assert from "node:assert/strict";
import { sameMasonryPlan } from "../src/masonry/MasonryPlanningOwnership";
import { leaseResidentResource } from "@galacean/engine-building/building/runtime/ResidentResourcePool.ts";
const building = (id: string, x = 20) => ({
  id,
  regionId: "village",
  center: { x, z: 20 },
  width: 8,
  depth: 6,
  height: 6,
  yaw: 0.4,
  outline: []
});
const plan = (): any => ({
  parameters: { seed: 1, width: 128, depth: 128 },
  buildings: [building("a"), building("b", 60)],
  authoredResources: []
});
test("shared immutable GPU leases survive one scene retirement and release only after final owner", async () => {
  const engine = {} as Engine,
    resource = {
      destroy() {
        destroyed++;
      }
    };
  let created = 0,
    destroyed = 0;
  const create = async () => {
    created++;
    return resource;
  };
  const a = leaseResidentResource(engine, "x", create),
    b = leaseResidentResource(engine, "x", create);
  assert.equal(await a.value, await b.value);
  assert.equal(created, 1);
  a.destroy();
  await Promise.resolve();
  assert.equal(destroyed, 0);
  b.destroy();
  await Promise.resolve();
  assert.equal(destroyed, 1);
  b.destroy();
  assert.equal(destroyed, 1);
});

test("concave UV masks are partitioned without cutting the convex hull", async () => {
  const { triangulateUVPolygon, area } = await import("@galacean/engine-building/building/runtime/RecoveredRoofGeometry.ts");
  const p = [
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 3],
      [0, 3]
    ],
    t = triangulateUVPolygon(p);
  assert.equal(t.length, 4);
  assert.equal(
    t.reduce((s, p) => s + area(p), 0),
    5
  );
});

test("content-only planning may reuse masonry only when houses and enclosures are unchanged", () => {
  const original = plan();
  const vegetation = structuredClone(original);
  vegetation.authoredResources.push({ resourceId: "tree", resourceType: "vegetation-brush" });
  assert.equal(sameMasonryPlan(original, vegetation), true);
  for (const change of [
    (p: ReturnType<typeof plan>) => {
      p.buildings[0].width += 1;
    },
    (p: ReturnType<typeof plan>) => {
      p.buildings[0].center.x += 1;
    },
    (p: ReturnType<typeof plan>) => {
      p.courtyards = [{ regionId: "yard", outline: [{ x: 0, z: 0 }] }];
    },
    (p: ReturnType<typeof plan>) => {
      p.fences = [
        {
          id: "fence",
          path: [
            { x: 0, z: 0 },
            { x: 1, z: 1 }
          ]
        }
      ];
    }
  ]) {
    const changed = structuredClone(original);
    change(changed);
    assert.equal(sameMasonryPlan(original, changed), false);
  }
});
