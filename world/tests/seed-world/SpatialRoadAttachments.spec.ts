import { expect, it, vi } from "vitest";
import type { IslandPlan, PlanRoute } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  attachRoadBranches,
  isRoadDestination,
  pruneUnservedRoadTails
} from "@galacean/engine-world-planning/spatial/layout/RoadAttachments";
import { publishRoadPath } from "@galacean/engine-world-planning/spatial/layout/RoadGeometry";
import { rebuildRoadTopology } from "@galacean/engine-world-planning/spatial/layout/RoadTopology";
import { compileRoadGraphSplines } from "@galacean/engine-world-planning/spatial/layout/RoadGraphSplines";

import * as roadGeometry from "@galacean/engine-world-planning/spatial/layout/RoadGeometry";
import * as topology from "@galacean/engine-world-planning/spatial/layout/RoadTopology";

function fixture(): IslandPlan {
  const routes: PlanRoute[] = [
    publishRoadPath({ id: "stem", from: "a:port", to: "b", width: 3 }, [
      { x: 0, z: 0 },
      { x: 0, z: 20 }
    ]),
    publishRoadPath({ id: "main", from: "c:port", to: "d:port", width: 4 }, [
      { x: -30, z: 40 },
      { x: 30, z: 40 }
    ])
  ];
  const plan = {
    routes,
    spatialLayout: {
      groups: [
        {
          id: "content",
          rule: { pattern: "connected" },
          volumes: [{ id: "a" }, { id: "c" }, { id: "d" }],
          ports: [
            { id: "a:port", position: { x: 0, z: 0 } },
            { id: "c:port", position: { x: -30, z: 40 } },
            { id: "d:port", position: { x: 30, z: 40 } }
          ]
        }
      ]
    }
  } as unknown as IslandPlan;
  rebuildRoadTopology(plan, () => true);
  return plan;
}
it("retains physical edge identity when pruning removes the last logical owner", () => {
  const plan = fixture();
  plan.routes = [];
  plan.land = [
    { x: -100, z: -100 },
    { x: 100, z: -100 },
    { x: 100, z: 100 },
    { x: -100, z: 100 }
  ];
  plan.islands = [];
  plan.buildings = [];
  plan.rocks = [];
  plan.waters = [];
  plan.plazas = [];
  const main = plan.roadGraph!.sections.find((section) => section.owners.includes("main"))!;
  const id = main.id;
  pruneUnservedRoadTails(plan, () => true);
  const retained = plan.roadGraph!.sections.find((section) => section.id === id)!;
  expect(retained.owners).toEqual([]);
  expect(retained.route.id).toBe(id);
  expect(() => compileRoadGraphSplines(plan, () => true)).not.toThrow();
  expect(retained.route.id).toBe(id);
});
it("joins a free branch into the middle of pavement, splitting a real three-way junction", () => {
  const plan = fixture();
  const original = structuredClone(plan.routes);
  expect(
    attachRoadBranches(
      plan,
      (a, b) => [a, b],
      () => true
    )
  ).toEqual([]);
  expect(plan.routes).toHaveLength(3);
  const join = plan.roadGraph!.nodes.find((n) => Math.abs(n.position.x) < 1e-6 && Math.abs(n.position.z - 40) < 1e-6)!;
  expect(join.degree).toBe(3);
  expect(plan.roadGraph!.nodes.find((n) => n.id === "b")!.degree).toBe(2);
  for (const road of original) {
    const current = plan.routes.find((r) => r.id === road.id)!;
    expect(current.points[0]).toEqual(road.points[0]);
    expect(current.points.at(-1)).toEqual(road.points.at(-1));
  }
  const after = structuredClone(plan);
  expect(
    attachRoadBranches(
      plan,
      (a, b) => [a, b],
      () => true
    )
  ).toEqual([]);
  expect(plan).toEqual(after);
});
it("keeps actual content entrances and reports a blocked free end without drawing through obstacles", () => {
  const plan = fixture(),
    before = structuredClone(plan);
  const checks = attachRoadBranches(
    plan,
    () => undefined,
    () => false
  );
  expect(checks).toHaveLength(1);
  expect(checks[0].id).toBe("terminal:b");
  expect(plan).toEqual(before);
});

it("tapers to internal entrances, varies deterministically, and narrows to fit available pavement", async () => {
  const { compileRoadPath } = await import("@galacean/engine-world-planning/spatial/layout/RoadGeometry");
  const definition = { id: "width-profile", from: "a", to: "b", width: 8 };
  const points = [
    { x: 0, z: 0 },
    { x: 120, z: 0 }
  ];
  const road = compileRoadPath(definition, points, () => true, 1, 1, { startWidth: 2, endWidth: 3 })!;
  expect(road.widths![0]).toBe(2);
  expect(road.widths!.at(-1)).toBe(3);
  expect(Math.max(...road.widths!)).toBeGreaterThan(6);
  expect(compileRoadPath(definition, points, () => true, 1, 1, { startWidth: 2, endWidth: 3 })).toEqual(road);
  const narrow = compileRoadPath(definition, points, (_, outline) => outline.every((p) => Math.abs(p.z) <= 1.01))!;
  expect(narrow).toBeDefined();
  expect(narrow.width).toBe(8);
  expect(narrow.maxWidth).toBeLessThanOrEqual(2.02);
  expect(narrow.outline!.every((p) => Math.abs(p.z) <= 1.01)).toBe(true);
});

it("compiles topology once for multiple accepted branch attachments", () => {
  const plan = fixture();
  plan.routes.push(
    publishRoadPath({ id: "second", from: "e:port", to: "f", width: 3 }, [
      { x: 20, z: 0 },
      { x: 20, z: 20 }
    ])
  );
  const group = plan.spatialLayout!.groups[0];
  group.volumes.push({ id: "e" } as (typeof group.volumes)[number]);
  group.ports.push({ id: "e:port", position: { x: 20, z: 0 } } as (typeof group.ports)[number]);
  rebuildRoadTopology(plan, () => true);
  const rebuild = vi.spyOn(topology, "rebuildPhysicalRoadTopology");
  try {
    expect(
      attachRoadBranches(
        plan,
        (a, b) => [a, b],
        () => true
      )
    ).toEqual([]);
    expect(plan.routes.length).toBeGreaterThanOrEqual(5);
    expect(rebuild).toHaveBeenCalledTimes(1);
  } finally {
    rebuild.mockRestore();
  }
});

it.each([false, true])("keeps parallel paths, widths and ownership distinct (reverse journey: %s)", (reverse) => {
  const plan = {
    routes: [-1, 1].map((sign, i) => {
      const points = [
        { x: 0, z: 0 },
        { x: 20, z: sign * 20 },
        { x: 40, z: 0 }
      ];
      const reversed = reverse && i === 1;
      return publishRoadPath(
        { id: "parallel-" + i, from: reversed ? "b" : "a", to: reversed ? "a" : "b", width: 2, widths: [2, 3, 4] },
        reversed ? points.reverse() : points
      );
    })
  } as IslandPlan;
  rebuildRoadTopology(plan, () => true);
  const original = structuredClone(plan.routes);
  expect(topology.rebuildPhysicalRoadTopology(plan, () => true)).toBe(true);
  for (const route of original) {
    expect(plan.routes.find((r) => r.id === route.id)!.points).toEqual(route.points);
    expect(plan.routes.find((r) => r.id === route.id)!.widths).toEqual(route.widths);
  }
  expect(plan.roadGraph!.sections.map((s) => s.owners)).toEqual([["parallel-0"], ["parallel-1"]]);
});

it("recognizes explicitly selected POI entrances even when no volume survives placement", () => {
  const plan = fixture();
  const point = { x: 0, z: 20 };
  plan.roadNetwork = {
    nodes: [{ id: "selected", poiId: "content", position: point }],
    edges: [{ a: "selected", b: "other" }]
  } as IslandPlan["roadNetwork"];
  expect(isRoadDestination(plan, point)).toBe(true);
  const search = vi.fn((a, b) => [a, b]);
  expect(attachRoadBranches(plan, search, () => true)).toEqual([]);
  expect(search).not.toHaveBeenCalled();
  expect(plan.routes).toHaveLength(2);
  plan.roadNetwork!.edges = [];
  expect(isRoadDestination(plan, point)).toBe(false);
  plan.roadNetwork!.edges = [{ a: "selected", b: "other" }] as NonNullable<IslandPlan["roadNetwork"]>["edges"];
  plan.spatialLayout!.groups[0].volumes = [];
  expect(isRoadDestination(plan, point)).toBe(true);
  plan.spatialLayout!.groups = [];
  expect(isRoadDestination(plan, point)).toBe(false);
});

it("stops a curved attachment at its first pavement intersection instead of crossing and returning", () => {
  const plan = fixture();
  // Isolate joining from curve compilation: the accepted path reaches the trunk
  // before its requested endpoint. It must stop there even if the provider overshoots.
  const compile = vi.spyOn(roadGeometry, "compileRoadPath").mockImplementation((definition) =>
    publishRoadPath(definition, [
      { x: 0, z: 20 },
      { x: 20, z: 45 },
      { x: 0, z: 40 }
    ])
  );
  try {
    attachRoadBranches(
      plan,
      (a, b) => [a, b],
      () => true
    );
  } finally {
    compile.mockRestore();
  }
  const joined = plan.routes.find((route) => route.id.startsWith("road-attachment:"))!;
  expect(joined).toBeDefined();
  expect(joined.points.at(-1)!.z).toBeCloseTo(40, 6);
  expect(joined.points.at(-1)!.x).toBeGreaterThan(0);
  expect(plan.roadGraph!.nodes.filter((node) => node.degree === 3)).toHaveLength(1);
  expect(plan.roadGraph!.sections.length - plan.roadGraph!.nodes.length + 1).toBe(0);
});

it("does not add a narrow return loop and prunes only the unsupported guide tail", () => {
  const plan = fixture();
  plan.routes = [
    publishRoadPath({ id: "stem", from: "a:port", to: "b", width: 1 }, [
      { x: 0, z: 0 },
      { x: 0, z: 20 }
    ]),
    publishRoadPath({ id: "main", from: "a:port", to: "c:port", width: 1 }, [
      { x: 0, z: 0 },
      { x: -2, z: 0 }
    ])
  ];
  const group = plan.spatialLayout!.groups[0];
  group.ports[1].position = { x: -2, z: 0 };
  rebuildRoadTopology(plan, () => true);
  attachRoadBranches(
    plan,
    (a, b) => [a, b],
    () => true
  );
  expect(plan.routes.some((route) => route.id.startsWith("road-attachment:"))).toBe(false);
  pruneUnservedRoadTails(plan, () => true);
  expect(plan.routes.map((route) => route.id)).toEqual(["main"]);
  expect(plan.roadGraph!.sections).toHaveLength(1);
  expect(plan.roadGraph!.nodes.map((node) => node.id).sort()).toEqual(["a:port", "c:port"]);
  expect(plan.routes[0].points).toEqual([
    { x: 0, z: 0 },
    { x: -2, z: 0 }
  ]);
  const once = structuredClone(plan);
  pruneUnservedRoadTails(plan, () => true);
  expect(plan).toEqual(once);
});

it("does not complete an unused organization guide by circling back to its own connected spine", () => {
  const plan = fixture();
  plan.routes = [
    publishRoadPath({ id: "arm", from: "a:port", to: "b", width: 1 }, [
      { x: 0, z: 0 },
      { x: 0, z: 40 }
    ]),
    publishRoadPath({ id: "other-arm", from: "a:port", to: "c:port", width: 1 }, [
      { x: 0, z: 0 },
      { x: 25, z: 0 },
      { x: 25, z: 70 }
    ])
  ];
  const group = plan.spatialLayout!.groups[0];
  group.ports[1].position = { x: 25, z: 70 };
  group.paths = plan.routes.map((route) => ({ id: route.id })) as typeof group.paths;
  rebuildRoadTopology(plan, () => true);
  attachRoadBranches(
    plan,
    (a, b) => [a, b],
    () => true
  );
  expect(plan.routes.some((route) => route.id.startsWith("road-attachment:"))).toBe(false);
  pruneUnservedRoadTails(plan, () => true);
  expect(plan.routes.map((route) => route.id)).toEqual(["other-arm"]);
});

it("keeps a declared member approach without adding a return road; stale references are pruned", () => {
  const plan = fixture();
  const group = plan.spatialLayout!.groups[0];
  group.paths = plan.routes;
  group.ports.push({ id: "b", position: { x: 0, z: 20 }, access: false, servesVolumeId: "a" });
  expect(isRoadDestination(plan, { x: 0, z: 20 })).toBe(true);
  const before = structuredClone(plan);
  const search = vi.fn((a, b) => [a, b]);
  attachRoadBranches(plan, search, () => true);
  expect(search).not.toHaveBeenCalled();
  pruneUnservedRoadTails(plan, () => true);
  expect(plan).toEqual(before);
  // A role alone cannot protect an abandoned guide: the served member must exist.
  group.ports.at(-1)!.servesVolumeId = "deleted-member";
  expect(isRoadDestination(plan, { x: 0, z: 20 })).toBe(false);
  pruneUnservedRoadTails(plan, () => true);
  expect(plan.routes.map((r) => r.id)).toEqual(["main"]);
});
