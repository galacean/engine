import { describe, expect, it } from "vitest";
import { buildRadialLayout } from "@galacean/engine-world-planning/spatial/layout/RadialLayout";
import { layoutRandom, type LayoutRule } from "@galacean/engine-world-planning/spatial/layout/LayoutRules";
import {
  connectLayoutGroup,
  RoadObstacleIndex,
  solveLayoutGroup
} from "@galacean/engine-world-planning/spatial/layout/LayoutKernel";
import { VolumeIndex } from "@galacean/engine-world-planning/spatial/layout/Volumes";
import type { PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { envelope } from "@galacean/engine-world-planning/semantic-study/IslandPlanAtoms";
import { createPlanningRingQuery } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset";
import { inspectSpatialSelection } from "../../demos/seed-world/src/planning/spatial/SpatialInspector";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { buildCurveLayout } from "@galacean/engine-world-planning/spatial/layout/ConnectedCurve";

const center = { x: 0, z: 0 };
const rule: LayoutRule = {
  pattern: "connected",
  branchShape: "radial",
  memberMin: 1,
  memberMax: 1,
  roadMode: "none",
  orientationVariation: 0,
  radialVariationM: 0,
  radiusM: 200,
  widthMinM: 100,
  widthMaxM: 100,
  depthMinM: 60,
  depthMaxM: 60,
  heightMinM: 80,
  heightMaxM: 80,
  headingDegrees: 30,
  spacingMinM: 1000,
  spacingMaxM: 1000,
  pathWidthM: 3,
  openRadiusM: 0,
  maxGroundSlopeDegrees: 12
};
const region = envelope(center, 300, 300, 0);
const ring = createPlanningRingQuery(region);
const construct = (parameters = rule) =>
  buildRadialLayout({
    owner: "subject",
    center,
    region,
    parameters,
    components: {},
    random: layoutRandom(17, "subject", 0, 0, parameters.variationSeed)
  });
const solve = (
  parameters = rule,
  ground: (point: PlanPoint) => number = () => 100,
  inside = (outline: typeof region) => ring.containsPolygon(outline),
  collision = new VolumeIndex()
) =>
  solveLayoutGroup(
    "subject",
    center,
    parameters,
    17,
    collision,
    inside,
    ground,
    undefined,
    {},
    "",
    {},
    () => true,
    undefined,
    construct(parameters)
  );

describe("generic member count ranges", () => {
  it("limits accepted automatic members, keeps searching after rejection and removes capped retained collisions", () => {
    const dense = {
      ...rule,
      memberMin: 0,
      widthMinM: 8,
      widthMaxM: 8,
      depthMinM: 8,
      depthMaxM: 8,
      spacingMinM: 2,
      spacingMaxM: 2
    };
    expect(solve({ ...dense, memberMax: 0 })).toMatchObject({ volumes: [], attempts: 0 });
    const three = solve({ ...dense, memberMax: 3 });
    expect(three.volumes).toHaveLength(3);
    expect(three.attempts).toBe(3);
    expect(solve({ ...dense, memberMax: undefined }).volumes.length).toBeGreaterThan(3);
    let attempts = 0;
    const rejectedFirst = solve(
      { ...dense, memberMax: 2 },
      () => 100,
      () => ++attempts > 1
    );
    expect(rejectedFirst.volumes).toHaveLength(2);
    expect(rejectedFirst.attempts).toBe(3);
    expect(rejectedFirst.volumes[0].id).toBe("subject:volume:1");
    const index = new VolumeIndex([{ id: "retained", a: three.volumes.map((volume) => volume.id), b: ["probe"] }]);
    const capped = solveLayoutGroup(
      "subject",
      center,
      { ...dense, memberMax: 1 },
      17,
      index,
      () => true,
      () => 100,
      three,
      {},
      "",
      {},
      () => true,
      undefined,
      construct(dense)
    );
    expect(capped.volumes).toHaveLength(1);
    expect(index.conflicts({ ...three.volumes[2], id: "probe" })).toEqual([]);
  });

  it("uses the same member range for curved and courtyard organizations and applies element heading", () => {
    const curveRule = {
      ...rule,
      branchShape: "curve" as const,
      memberMin: 0,
      memberMax: 3,
      widthMinM: 8,
      widthMaxM: 8,
      depthMinM: 8,
      depthMaxM: 8,
      curveBendM: 0,
      curveHeadingDegrees: 0,
      spacingMinM: 2,
      spacingMaxM: 2
    };
    const construction = buildCurveLayout({
      owner: "curve",
      center,
      region,
      parameters: curveRule,
      components: {},
      random: layoutRandom(17, "curve", 0, 0)
    });
    const curve = solveLayoutGroup(
      "curve",
      center,
      curveRule,
      17,
      new VolumeIndex(),
      () => true,
      () => 100,
      undefined,
      {},
      "",
      {},
      () => true,
      undefined,
      construction
    );
    expect(curve.volumes).toHaveLength(3);
    expect(curve.volumes[0].boxes[0].yaw).toBeCloseTo(Math.PI / 6);
    expect(solve({ ...curveRule, pattern: "courtyard", branchShape: "radial", openRadiusM: 12 }).volumes).toHaveLength(
      3
    );
  });

  it("declares optional nonnegative integer ranges and a readonly actual count", () => {
    const definition = planningRegistry.get("layout");
    expect(definition.ranges).toContainEqual(["memberMin", "memberMax"]);
    expect(definition.fields.find((field) => field.key === "memberMin")).toMatchObject({
      min: 0,
      default: 0,
      integer: true
    });
    expect(definition.fields.find((field) => field.key === "memberMax")!.default).toBeUndefined();
    expect(() => planningRegistry.validate("layout", { memberMin: -1 })).toThrow();
    expect(() => planningRegistry.validate("layout", { memberMax: 1.2 })).toThrow();
    expect(() => planningRegistry.project("layout", { memberMin: 3, memberMax: 2 }, {})).toThrow();
    expect(() => planningRegistry.validate("layout", { memberCount: 1 })).toThrow();
  });
  it("creates exactly one unchanged large OBB and external approaches without internal roads", () => {
    const group = solve();
    expect(group.volumes).toHaveLength(1);
    expect(group.volumes[0].boxes[0]).toMatchObject({ width: 100, depth: 60, height: 80, elevation: 99.95 });
    expect(group.volumes[0].boxes[0].yaw).toBeCloseTo(Math.PI / 6);
    const obstacles = new RoadObstacleIndex(group.volumes);
    const connected = connectLayoutGroup(group, 17, obstacles, (outline) => ring.containsPolygon(outline));
    expect(connected.paths).toEqual([]);
    expect(connected.ports.filter((port) => port.access)).toHaveLength(4);
    for (const port of connected.ports) expect(obstacles.collides(envelope(port.position, 3, 3, 0))).toBe(false);
  });

  it("samples size ranges deterministically while the local seed changes the envelope", () => {
    const ranged = { ...rule, widthMaxM: 140, depthMaxM: 90, heightMaxM: 120 };
    expect(construct(ranged)).toEqual(construct(ranged));
    expect(construct({ ...ranged, variationSeed: 1 })).not.toEqual(construct(ranged));
    const box = construct(ranged).members[0][0];
    expect(box.width).toBeGreaterThanOrEqual(100);
    expect(box.width).toBeLessThanOrEqual(140);
  });

  it("rejects unsupported footprints or explicit exclusions without shrinking or duplicating the subject", () => {
    const tooLarge = { ...rule, widthMinM: 400, widthMaxM: 400 };
    expect(solve(tooLarge).volumes).toEqual([]);
    expect(construct(tooLarge).members[0][0].width).toBe(400);
    expect(
      solve(
        rule,
        () => 100,
        () => false
      ).volumes
    ).toEqual([]);
    expect(solve(rule, (point) => 100 + point.x * Math.tan((13 * Math.PI) / 180)).volumes).toEqual([]);
    const collision = new VolumeIndex([{ id: "blocked", a: ["subject:volume:0"], b: ["other"] }]);
    collision.set({ id: "other", owner: "other", boxes: [{ ...construct().members[0][0], elevation: 99.95 }] });
    expect(
      solve(
        rule,
        () => 100,
        () => true,
        collision
      ).volumes
    ).toEqual([]);
  });

  it("accepts the public parameter edit, refreshes UI fields, and reproduces actual roads and OBBs from native Scene", async () => {
    const document = createSeedPlanningInputs(17);
    for (const type of ["terrain", "rivers", "lakes"])
      Object.assign(document.entities.world.components[type].values, { countMin: 0, countMax: 0 });
    document.entities.world.components.world.values.offshoreCoverage = 0;
    document.entities.world.components.layout.values = {
      pattern: "connected",
      branchShape: "radial",
      memberMin: 1,
      memberMax: 1,
      roadMode: "none",
      orientationVariation: 0,
      radialVariationM: 0,
      elementProfile: "habitable",
      widthMinM: 8,
      widthMaxM: 8,
      depthMinM: 8,
      depthMaxM: 8,
      heightMinM: 5,
      heightMaxM: 5
    };
    const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
    await session.initialize();
    const group = session
      .result!.plan.spatialLayout!.groups.filter((group) => group.volumes.length)
      .sort(
        (a, b) => Math.hypot(a.center.x - 512, a.center.z - 512) - Math.hypot(b.center.x - 512, b.center.z - 512)
      )[0];
    expect(group).toBeDefined();
    const values = {
      pattern: "connected",
      branchShape: "radial",
      memberMin: 1,
      memberMax: 1,
      roadMode: "none",
      orientationVariation: 0,
      radialVariationM: 0,
      widthMinM: 60,
      widthMaxM: 60,
      depthMinM: 40,
      depthMaxM: 40,
      heightMinM: 90,
      heightMaxM: 90,
      headingDegrees: 25,
      variationSeed: 41
    };
    const receipt = await session.dispatchParameters([{ op: "set", entity: group.id, component: "layout", values }]);
    expect(receipt.status, receipt.message).toBe("accepted");
    const result = session.result!.plan;
    const actual = result.spatialLayout!.groups.find((item) => item.id === group.id)!;
    expect(actual.volumes).toHaveLength(1);
    expect(actual.volumes[0].boxes[0]).toMatchObject({ width: 60, depth: 40, height: 90 });
    expect(actual.paths).toEqual([]);
    expect(
      actual.ports.some((port) =>
        result.routes.some((route) =>
          route.points.some((point) => Math.hypot(point.x - port.position.x, point.z - port.position.z) < 0.001)
        )
      )
    ).toBe(true);
    const fields = inspectSpatialSelection(session, group.id).groups.find((group) => group.c.type === "layout")!
      .definition.fields;
    expect(fields.find((field) => field.key === "pattern")!.options).not.toContain("single");
    expect(fields.map((field) => field.key)).toContain("headingDegrees");
    expect(fields.map((field) => field.key)).not.toContain("memberCount");
    for (const key of [
      "memberMin",
      "memberMax",
      "spacingMinM",
      "spacingMaxM",
      "orientationVariation",
      "roadMode",
      "branchShape"
    ])
      expect(fields.map((field) => field.key)).toContain(key);
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(session.export()))));
    expect(restored.entities[group.id].components.layout.values).toMatchObject(values);
    const cold = new PlanningSession(exportPlanningRecipe(restored), undefined, restored);
    await cold.initialize();
    expect(cold.result!.plan.spatialLayout!.groups.map((group) => group.volumes)).toEqual(
      result.spatialLayout!.groups.map((group) => group.volumes)
    );
    expect(cold.result!.plan.routes).toEqual(result.routes);
    expect(cold.result!.plan.roadGraph).toEqual(result.roadGraph);
    const moved = await session.dispatchParameters([
      {
        op: "set",
        entity: actual.volumes[0].id,
        component: "solid",
        values: { x: actual.volumes[0].boxes[0].center.x + 2 }
      }
    ]);
    expect(moved.status, moved.message).toBe("accepted");
    const movedGroup = session.result!.plan.spatialLayout!.groups.find((item) => item.id === group.id)!;
    for (const port of actual.ports)
      expect(movedGroup.ports.find((item) => item.id === port.id)!.position.x).toBeCloseTo(port.position.x + 2, 7);
    const movedDocument = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(session.export()))));
    const movedCold = new PlanningSession(exportPlanningRecipe(movedDocument), undefined, movedDocument);
    await movedCold.initialize();
    expect(movedCold.result!.plan.routes).toEqual(session.result!.plan.routes);
    await session.dispatchParameters([
      { op: "reset", entity: actual.volumes[0].id, component: "solid", fields: ["x"] }
    ]);
    const impossible = await session.dispatchParameters([
      { op: "set", entity: group.id, component: "layout", values: { widthMinM: 5000, widthMaxM: 5000 } }
    ]);
    expect(impossible.status, impossible.message).toBe("accepted");
    expect(session.result!.plan.spatialLayout!.groups.find((item) => item.id === group.id)!.volumes).toEqual([]);
    expect(session.result!.checks).toContainEqual(
      expect.objectContaining({ rule: "layout-member-count", owners: [group.id], measured: 0 })
    );
    expect(
      session.inspect(group.id).components.find((component) => component.type === "layout")!.values.memberCount
    ).toBe(0);
    expect(session.document.entities[group.id].components.layout.values.widthMinM).toBe(5000);
    const emptyOrganization = await session.dispatchParameters([
      { op: "set", entity: group.id, component: "layout", values: { pattern: "region" } }
    ]);
    expect(emptyOrganization.status, emptyOrganization.message).toBe("accepted");
    expect(session.result!.plan.spatialLayout!.groups.find(item => item.id === group.id)!.volumes).toEqual([]);
    expect(session.result!.checks).toContainEqual(
      expect.objectContaining({ rule: "layout-member-count", owners: [group.id], measured: 0, required: false })
    );
  }, 120000);
});
