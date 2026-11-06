import { expect, it } from "vitest";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { publishRoadPath } from "@galacean/engine-world-planning/spatial/layout/RoadGeometry";
import { rebuildRoadTopology } from "@galacean/engine-world-planning/spatial/layout/RoadTopology";
import { updateSpatialInstanceConnections } from "@galacean/engine-world-planning/spatial/layout/SpatialInstanceConnections";
import { applyLayoutGroupEdits } from "@galacean/engine-world-planning/spatial/layout/LayoutKernel";

function fixture() {
  const road = publishRoadPath({ id: "drive", from: "house:port", to: "junction", width: 2 }, [
    { x: 8, z: 0 },
    { x: 20, z: 0 },
    { x: 40, z: 0 }
  ]);
  const unrelated = publishRoadPath({ id: "main", from: "north", to: "south", width: 2 }, [
    { x: 40, z: -20 },
    { x: 40, z: 0 },
    { x: 40, z: 20 }
  ]);
  const group = {
    id: "village",
    volumes: [
      { id: "house", boxes: [{ center: { x: 0, z: 0 }, width: 10, depth: 8, height: 4, yaw: 0, elevation: 0 }] }
    ],
    paths: [road],
    ports: [{ id: "house:port", position: { x: 8, z: 0 }, access: false }],
    rule: { pattern: "connected" }
  };
  const plan = {
    routes: [road, unrelated],
    bridges: [],
    regions: [],
    buildings: [],
    rocks: [],
    waters: [],
    islands: [],
    land: [
      { x: -100, z: -100 },
      { x: 100, z: -100 },
      { x: 100, z: 100 },
      { x: -100, z: 100 }
    ],
    planning: { ports: group.ports },
    spatialLayout: { groups: [group], baselineGroups: [group] }
  } as unknown as IslandPlan;
  rebuildRoadTopology(plan, () => true);
  plan.spatialLayout!.instanceConnections = {
    routes: plan.routes,
    graph: plan.roadGraph,
    network: plan.roadNetwork,
    ports: plan.planning!.ports
  };
  return plan;
}

it("moves member entrances and published physical/navigation roads without moving neighbours", () => {
  const plan = fixture(),
    baseline = structuredClone(plan);
  const state = plan.spatialLayout!;
  state.groups = [applyLayoutGroupEdits(state.baselineGroups![0], { house: { x: 10, z: 8, width: 20 } }, () => 0)];
  updateSpatialInstanceConnections(plan);
  expect(state.groups[0].ports[0].position).toEqual({ x: 23, z: 8 });
  const drive = plan.routes.find((r) => r.id === "drive")!;
  expect(drive.points[0]).toEqual({ x: 23, z: 8 });
  expect(drive.navigationLinks![0].points[0]).toEqual(drive.points[0]);
  expect(plan.roadGraph!.nodes.some((n) => n.position.x === 23 && n.position.z === 8)).toBe(true);
  const physical = plan.roadGraph!.sections.filter((s) => s.owners.includes("drive"));
  expect(physical.some((s) => s.route.points.some((p) => p.x === 23 && p.z === 8))).toBe(true);
  expect(plan.routes.find((r) => r.id === "main")!.points).toEqual(
    baseline.routes.find((r) => r.id === "main")!.points
  );
  expect(state.baselineGroups).toEqual(baseline.spatialLayout!.baselineGroups);
  const once = JSON.stringify([plan.routes, plan.roadGraph, plan.planning!.ports]);
  updateSpatialInstanceConnections(plan);
  expect(JSON.stringify([plan.routes, plan.roadGraph, plan.planning!.ports])).toBe(once);
  state.groups = state.baselineGroups!;
  updateSpatialInstanceConnections(plan);
  expect(plan.routes).toEqual(baseline.routes);
  expect(plan.roadGraph).toEqual(baseline.roadGraph);
});

it("keeps a moved object but removes a blocked connection and restores the logical network on reset", () => {
  const plan = fixture(),
    state = plan.spatialLayout!;
  plan.roadNetwork = { nodes: [], domains: [], edges: [{ routeId: "drive", a: "a", b: "b", gridPath: [] }] };
  state.instanceConnections!.network = plan.roadNetwork;
  plan.waters = [
    {
      id: "lake",
      kind: "lake",
      label: "Lake",
      outline: [
        { x: 20, z: 2 },
        { x: 30, z: 2 },
        { x: 30, z: 20 },
        { x: 20, z: 20 }
      ]
    }
  ];
  state.groups = [applyLayoutGroupEdits(state.baselineGroups![0], { house: { z: 16 } }, () => 0)];
  updateSpatialInstanceConnections(plan);
  expect(state.groups[0].volumes[0].boxes[0].center.z).toBe(16);
  expect(state.instanceConnectionChecks!.some((c) => c.status === "fail" && !c.required)).toBe(true);
  expect(plan.routes.some((route) => route.id === "drive")).toBe(false);
  expect(plan.roadGraph!.sections.some((section) => section.owners.includes("drive"))).toBe(false);
  expect(plan.roadNetwork!.edges).toEqual([]);
  state.groups = state.baselineGroups!;
  updateSpatialInstanceConnections(plan);
  expect(plan.roadNetwork!.edges).toHaveLength(1);
  expect(plan.routes.some((route) => route.id === "drive")).toBe(true);
});

it("rejects a road crossing a sea inlet even when its ribbon corners are on land", () => {
  const plan = fixture(),
    state = plan.spatialLayout!;
  plan.land = [
    { x: -100, z: -100 },
    { x: 100, z: -100 },
    { x: 100, z: 100 },
    { x: 30, z: 100 },
    { x: 30, z: 2 },
    { x: 20, z: 2 },
    { x: 20, z: 100 },
    { x: -100, z: 100 }
  ];
  state.groups = [applyLayoutGroupEdits(state.baselineGroups![0], { house: { z: 16 } }, () => 0)];
  updateSpatialInstanceConnections(plan);
  expect(plan.routes.some((route) => route.id === "drive")).toBe(false);
  expect(state.instanceConnectionChecks!.length).toBeGreaterThan(0);
});

it("keeps authored intermediate points fixed while an entrance moves and allows a new detour", () => {
  const plan = fixture(),
    state = plan.spatialLayout!;
  const points = [
    { id: "south", x: 18, z: -12 },
    { id: "east", x: 32, z: -8 }
  ];
  state.authoredRoadPaths = { drive: points };
  updateSpatialInstanceConnections(plan);
  expect(plan.routes.find((route) => route.id === "drive")!.points.some((p) => p.x === 18 && p.z === -12)).toBe(true);
  state.groups = [applyLayoutGroupEdits(state.baselineGroups![0], { house: { z: 10 } }, () => 0)];
  updateSpatialInstanceConnections(plan);
  const route = plan.routes.find((route) => route.id === "drive")!;
  expect(route.points[0]).toEqual({ x: 8, z: 10 });
  for (const pin of points) expect(route.points.some((p) => Math.hypot(p.x - pin.x, p.z - pin.z) < 1e-4)).toBe(true);
  const once = JSON.stringify([plan.routes, plan.roadGraph]);
  updateSpatialInstanceConnections(plan);
  expect(JSON.stringify([plan.routes, plan.roadGraph])).toBe(once);
});

it("reuses fixed bridge support and retains an unsupported authored crossing as a diagnostic", () => {
  const plan = fixture(),
    state = plan.spatialLayout!;
  plan.waters = [
    {
      id: "river",
      kind: "river",
      label: "river",
      outline: [
        { x: 22, z: -100 },
        { x: 28, z: -100 },
        { x: 28, z: 100 },
        { x: 22, z: 100 }
      ]
    }
  ];
  plan.bridges = [{ id: "bridge", a: { x: 20, z: 0 }, b: { x: 30, z: 0 }, width: 4 } as any];
  state.authoredRoadPaths = {
    drive: [
      { id: "before", x: 18, z: -8 },
      { id: "after", x: 34, z: 8 }
    ]
  };
  const originalBridge = structuredClone(plan.bridges);
  updateSpatialInstanceConnections(plan);
  const route = plan.routes.find((r) => r.id === "drive");
  expect(route, JSON.stringify(state.instanceConnectionChecks)).toBeDefined();
  for (const p of [
    { x: 18, z: -8 },
    { x: 34, z: 8 },
    { x: 20, z: 0 },
    { x: 30, z: 0 }
  ])
    expect(route!.points.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 1e-4)).toBe(true);
  expect(plan.bridges).toEqual(originalBridge);
  state.authoredRoadPaths.drive = [{ id: "unsupported", x: 25, z: 12 }];
  updateSpatialInstanceConnections(plan);
  expect(plan.routes.some((r) => r.id === "drive")).toBe(false);
  expect(state.authoredRoadPaths.drive).toEqual([{ id: "unsupported", x: 25, z: 12 }]);
  expect(state.instanceConnectionChecks!.some((c) => c.rule === "authored-road-path")).toBe(true);
  expect(plan.bridges).toEqual(originalBridge);
});

it("preserves an ordered return to an earlier mandatory location", () => {
  const plan = fixture();
  const pins = [{id:"first",x:18,z:0},{id:"turn",x:30,z:0},{id:"return",x:18,z:0}];
  plan.spatialLayout!.authoredRoadPaths = {drive:pins};
  updateSpatialInstanceConnections(plan);
  const route = plan.routes.find((r)=>r.id==="drive")!;
  expect(route,JSON.stringify(plan.spatialLayout!.instanceConnectionChecks)).toBeDefined();
  let previous=-1;
  for(const pin of pins){
    const index=route.points.findIndex((p,i)=>i>previous&&Math.hypot(p.x-pin.x,p.z-pin.z)<1e-4);
    expect(index).toBeGreaterThan(previous); previous=index;
  }
});
