import { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";
import { createSeedWorldSpatialTools } from "../../demos/seed-world/agent-adapter/tools/spatial-tools";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime.ts";
import type { Entity } from "@galacean/engine";
import { describe, expect, it, vi } from "vitest";
import { DayNightSystem, WeatherSystem, WindSystem } from "@galacean/engine";
import { state } from "../../../packages/world-planning/tests/editor/seed-world-fixture";
import { createSeedWorldEngineDraft } from "../../demos/seed-world/agent-adapter/SeedWorldEngineDraft";
import {
  SeedWorldRuntimeEnginePort,
  type SeedWorldRuntimeEnginePortOptions,
  type SeedWorldRuntimeContext
} from "../../demos/seed-world/agent-adapter/runtime/SeedWorldRuntimeEnginePort";
import { SEED_WORLD_HEIGHT_RANGE, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields.ts";
import { SeedWorldLandCover, type SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner.ts";
import { TerrainTimeTransition } from "@galacean/engine-environment/terrain/lighting/TerrainTimeTransition.ts";
import { Vector3 } from "@galacean/engine";
import { environmentUpdateOutputSchema } from "../../demos/seed-world/agent-adapter/tools/tool-contract";

vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
});

describe("SeedWorldRuntimeEnginePort", () => {
  it("uses draft navigation height without replaying the height delta at activation", async () => {
    const port = createPort({});
    vi.spyOn(port, "readWorldState").mockImplementation(state);
    const teleport = vi.spyOn(port, "teleport").mockReturnValue({});
    const edit = createSeedWorldEngineDraft(port, { environment: () => { throw new Error("unused"); },
      teleport: input => ({ cameraPosition: [input.x, 10 + input.heightOffset, input.z], navigationSurfaceHeight: 10 }),
      restoreCamera() {}, validateMount() {} }, "terrain-teleport");
    let height = 20;
    edit.setNavigationGround!(() => height);
    edit.port.teleport({ x: 1, z: 2, heightOffset: 3 });
    expect(edit.port.readWorldState()!.camera.position).toEqual([1, 23, 2]);
    height = 30;
    edit.port.teleport({ x: 1, z: 2, heightOffset: 3 });
    expect(edit.settings.camera!.position).toEqual([1, 33, 2]);
    expect(teleport).not.toHaveBeenCalled();
    edit.seal(); await edit.activate(new AbortController().signal);
    expect(teleport).toHaveBeenCalledTimes(2);
    expect(teleport).toHaveBeenLastCalledWith({ x: 1, z: 2, heightOffset: 3 });
  });
  it("includes host-owned planning solids in the published object catalog", () => {
    const port = createPort(createObjectContext(), { readAdditionalObjects: revision => [{
      worldId: "seed-world-1729", worldRevision: revision, objectId: "planned-rock", objectKind: "rock",
      source: { kind: "decoration", sourceId: "planned-rock" }, position: [0, 12, 0], footprintMetres: [4, 6], properties: {}
    }] });
    expect(port.queryWorldObjects({ kinds: ["rock"], orderBy: [], limit: 10 }).objects)
      .toEqual(expect.arrayContaining([expect.objectContaining({ objectId: "planned-rock", footprintMetres: [4, 6] })]));
    expect(port.getWorldObject("planned-rock").position).toEqual([0, 12, 0]);
  });
  it("queries the latest draft terrain and water without changing published fields", () => {
    const fields = createFields(), plan = createPlan();
    const port = createPort({ plan, fields, water: { querySurface: () => ({ water: false }) } });
    let draftFields = { ...fields, heightSamples: new Uint16Array(9).fill(encodeHeight(20)) };
    const draft = port.createSpatialQueryPort(() => ({ plan, fields: draftFields,
      queryWater: () => ({ water: true, surfaceElevationMetres: 30 }),
      queryWaterRegions: kind => ({ kind, features: [{ id: "new-draft-river" }] }) }), () => 1);
    expect(draft.queryWorldRegions("river", 1)).toEqual({ kind: "river", features: [{ id: "new-draft-river" }] });
    const input = { mode: "sample" as const, positions: [{ x: 0, z: 0 }], sampleDistance: 1 };
    const height = (query: typeof port.queryWorldPoints) => (query(input) as { samples: { height: number }[] }).samples[0].height;
    expect(height(draft.queryWorldPoints)).toBeCloseTo(20, 1);
    expect(draft.queryWorldPoints(input)).toMatchObject({ samples: [{ water: true, waterSurfaceElevationMetres: 30 }] });
    draftFields = { ...draftFields, heightSamples: new Uint16Array(9).fill(encodeHeight(25)) };
    expect(height(draft.queryWorldPoints)).toBeCloseTo(25, 1);
    expect(height(port.queryWorldPoints.bind(port))).toBeCloseTo(12, 1);
  });
  it("projects draft time using the real lighting profile without advancing the live clock", async () => {
    const system = new DayNightSystem();
    const port = createPort({ lighting: { system }, environment: { weatherSystem: new WeatherSystem(), getSnapshot: () => ({ wind: { baseDirection: [0, 0, -1], direction: [1, 0, 0], baseSpeedMps: 1 } }) } });
    vi.spyOn(port, "readWorldState").mockImplementation(state);
    const liveUpdate = vi.spyOn(port, "updateEnvironment").mockResolvedValue(null);
    const edit = port.beginEdit("draft");
    await edit.port.updateEnvironment({ timeHours: 24, waitForIbl: false, transitionDuration: 0 }, new AbortController().signal);
    expect(edit.port.readWorldState()?.lighting).toMatchObject({ timeHours: 0, phase: system.profile.createState(0).phase });
    expect(port.readWorldState()?.lighting.timeHours).toBe(12);
    expect(liveUpdate).not.toHaveBeenCalled();
    edit.discard();
  });
  it("never probes subject geometry after unpublication or host destruction",()=>{
    let published=true,destroyed=false;
    const measured={publicationRevision:12,hits:[null]};
    const querySubjectSegments=vi.fn(()=>measured),querySubjectCapsules=vi.fn(()=>measured);
    const port=createPort({}, {readContext:()=>published?{} as SeedWorldRuntimeContext:null,
      isDestroyed:()=>destroyed,querySubjectSegments,querySubjectCapsules});
    const segments=[{start:[0,0,0] as [number,number,number],end:[0,0,1] as [number,number,number]}];
    expect(port.querySubjectSegments(segments)).toBe(measured);
    expect(querySubjectSegments).toHaveBeenCalledWith(segments);
    const capsules=segments.map(segment=>({...segment,radius:.5}));
    expect(port.querySubjectCapsules(capsules)).toBe(measured);
    expect(querySubjectCapsules).toHaveBeenCalledWith(capsules);
    published=false;expect(port.querySubjectSegments(segments)).toBeUndefined();
    expect(port.querySubjectCapsules(capsules)).toBeUndefined();
    published=true;destroyed=true;expect(port.querySubjectSegments(segments)).toBeUndefined();
    expect(port.querySubjectCapsules(capsules)).toBeUndefined();
    expect(querySubjectSegments).toHaveBeenCalledTimes(1);expect(querySubjectCapsules).toHaveBeenCalledTimes(1);
    expect(createPort({}).querySubjectSegments(segments)).toBeUndefined();
  });
  it("persists grounded teleport clearance rather than only its immediate camera pose", () => {
    const position = new Vector3(1, 3, 2);
    const transform = {
      worldPosition: position, worldForward: new Vector3(0, 0, -1),
      setWorldPosition: (x: number, y: number, z: number) => position.set(x, y, z), lookAt: vi.fn()
    };
    const navigation = {
      groundCollision: true, locomotionOwner: null, eyeHeight: 1.8, verticalOffset: 4,
      setVerticalOffset(value: number) { this.verticalOffset = value; },
      setEyeHeight(value: number) { this.eyeHeight = value; }, synchronizeView: vi.fn()
    };
    const port = createPort({ plan: createPlan(), fields: createFields(), cameraMode: "roam",
      camera: { entity: { transform } }, navigation, orbit: { target: new Vector3() }
    }, { sampleNavigationHeight: () => 12 });
    expect(port.teleport({ x: 20, z: 30, heightOffset: 7 })).toMatchObject({ cameraPosition: [20, 19, 30] });
    // The next grounded update consumes these persisted navigation values.
    expect(12 + navigation.eyeHeight + navigation.verticalOffset).toBe(position.y);
    expect(navigation.verticalOffset).toBe(0);
    expect(navigation.synchronizeView).toHaveBeenCalledOnce();
  });

  it("uses the published planner water catalogue without hydrology artifacts", () => {
    const output = { kind: "river", features: [{ id: "canyon-river", surfaceElevationMetres: 26 }] };
    const queryWaterRegions = vi.fn(() => output);
    const port = createPort({ plan: createPlan(), fields: createFields() }, { queryWaterRegions });
    expect(port.queryWorldRegions("river", 4)).toBe(output);
    expect(queryWaterRegions).toHaveBeenCalledWith("river", 4);
    const detached = createPort({}, { readContext: () => null, queryWaterRegions });
    expect(() => detached.queryWorldRegions("river", 4)).toThrow();
    expect(queryWaterRegions).toHaveBeenCalledTimes(1);
  });

  it("searches zero-origin planner heights using their actual decode range", () => {
    const base = createFields();
    base.heightSamples.fill(0);
    base.heightSamples[8] = 65535;
    const fields = { ...base, worldOrigin: [0, 0] as const, heightDecode: { offset: 10, scale: 40 } };
    const plan = { ...createPlan(), worldOrigin: [0, 0] as const };
    const port = createPort({ plan, fields });
    const result = port.queryWorldPoints({ mode: "search", where: { minimumElevation: 49 },
      orderBy: [{ field: "elevation", direction: "desc" }], limit: 1, spacingMetres: 50 });
    expect(result).toMatchObject({ strategy: "authoritative-height-lattice", points: [{ x: 100, z: 100, elevation: 50 }] });
    expect(port.queryWorldRegions("summit", 1)).toMatchObject({ features: [{ position: [50, expect.any(Number), 50] }] });
  });

  it("keeps water color publication and its dirty notification inside the mutation boundary", async () => {
    const events: string[] = [];
    let finish!: () => void;
    const publication = new Promise<void>((resolve) => { finish = resolve; });
    const color = [12, 34, 56] as const;
    const port = createPort({
      hydrologyArtifact: { waterBodyCatalog: [{ bodyId: "lake-a", waterType: "lake" }] },
      water: { colorAuthoring: { update: async () => { events.push("publish"); await publication; return color; } } }
    }, {
      runWorldAppearanceMutation: async (operation) => {
        events.push("begin");
        try { return await operation(); } finally { events.push("end"); }
      },
      onWorldAppearanceChanged: async () => { events.push("dirty"); }
    });
    const result = port.updateWaterColor({ id: "natural:lake:lake-a", domain: "water", kind: "lake", source: "natural" }, color, new AbortController().signal);
    expect(events).toEqual(["begin", "publish"]);
    finish();
    await expect(result).resolves.toEqual(color);
    expect(events).toEqual(["begin", "publish", "dirty", "end"]);
  });

  it("forwards mount intents to the scene host and does not dispatch after cancellation or disposal", async () => {
    const commandMount = vi.fn((input) => ({ status: "accepted" as const, intent: input.intent, commandId: "mount-1" }));
    let destroyed = false;
    const port = createPort({}, { commandMount, isDestroyed: () => destroyed });
    const signal = new AbortController().signal;
    for (const intent of ["appear", "dismount", "dismiss"] as const) {
      expect(await port.commandMount({ intent }, signal)).toEqual({ status: "accepted", intent, commandId: "mount-1" });
      expect(commandMount).toHaveBeenLastCalledWith({ intent }, signal);
    }
    const cancelled = new AbortController();
    cancelled.abort();
    expect(() => port.commandMount({ intent: "appear" }, cancelled.signal)).toThrow();
    destroyed = true;
    expect(() => port.commandMount({ intent: "appear" }, signal)).toThrow("unavailable");
    expect(commandMount).toHaveBeenCalledTimes(3);
    expect(() => createPort({}).commandMount({ intent: "appear" }, signal)).toThrow("unavailable");
  });

  it("waits for a real frame-driven time transition before returning the final state", async () => {
    let hours = 10;
    const transition = new TerrainTimeTransition((value) => { hours = value; });
    const lighting = { transitionTime: (target: number, seconds: number, signal: AbortSignal, from?: number) =>
      transition.start(hours, target, seconds, signal, from) };
    const port = createPort({ lighting, environment: { setTransitionDuration: vi.fn() } });
    vi.spyOn(port, "readWorldState").mockImplementation(() => ({ lighting: { timeHours: hours } }) as never);
    let done = false;
    const result = port.updateEnvironment({ fromTimeHours: 6, timeHours: 24, transitionDuration: 15, waitForIbl: false }, new AbortController().signal);
    void result.then(() => { done = true; });
    expect(hours).toBe(6);
    transition.update(5);
    await Promise.resolve();
    expect(hours).toBe(12);
    expect(done).toBe(false);
    transition.update(10);
    await expect(result).resolves.toMatchObject({ state: { lighting: { timeHours: 0 } } });
  });

  it("cancels the running clock when the API request is aborted", async () => {
    let hours = 6;
    const transition = new TerrainTimeTransition((value) => { hours = value; });
    const port = createPort({
      lighting: { transitionTime: (target: number, seconds: number, signal: AbortSignal) => transition.start(hours, target, seconds, signal) },
      environment: { setTransitionDuration: vi.fn() }
    });
    const controller = new AbortController();
    const result = port.updateEnvironment({ timeHours: 24, transitionDuration: 15, waitForIbl: false }, controller.signal);
    const failure = expect(result).rejects.toThrow("cancelled");
    transition.update(5);
    controller.abort();
    await failure;
    transition.update(10);
    expect(hours).toBe(12);
  });

  it("applies sky-only color changes and reset without changing the clock or waiting on weather", async () => {
    const lighting = { setSkyColor: vi.fn(), setTuning: vi.fn() };
    const environment = { setTransitionDuration: vi.fn(), getSnapshot: vi.fn() };
    const port = createPort({ environment, lighting });
    vi.spyOn(port, "readWorldState").mockReturnValue(null);
    const signal = new AbortController().signal;
    for (const skyColorRgb of [[180, 80, 255] as const, null]) {
      const result = await port.updateEnvironment({
        atmosphere: { skyColorRgb }, transitionDuration: 1, waitForIbl: false
      }, signal);
      expect(lighting.setSkyColor).toHaveBeenLastCalledWith(skyColorRgb);
      expect(result).toMatchObject({ requested: { atmosphere: { skyColorRgb } } });
    }
    expect(lighting.setTuning).not.toHaveBeenCalled();
    expect(environment.getSnapshot).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(port.updateEnvironment({
      atmosphere: { skyColorRgb: [0, 0, 0] }, transitionDuration: 0, waitForIbl: false
    }, controller.signal)).rejects.toThrow();
    expect(lighting.setSkyColor).toHaveBeenCalledTimes(2);
  });
  it("uses explicit vegetation ownership independently of object ID spelling", () => {
    const context = createObjectContext();
    const population = (context.world as any).population;
    const template = population.getExactPopulationInstances()[0];
    population.getExactPopulationInstances = () => [
      { ...template, id: "single-tree", authoringBrushId: "single-tree" },
      { ...template, id: "population:single-tree:unrelated" }
    ];
    const port = createPort(context, { readAuthoringSnapshot: () => ({
      activeRevision: 0, draftRevision: 0, authoringStateHash: "test", removedObjectIds: [],
      resources: [{ resourceType: "vegetation-brush", resourceId: "single-tree", contentHash: "test", properties: {
        category: "tree", plantKind: "tree", distributionKind: "single", x: 0, z: 10, radiusMetres: 4, densityScale: 1
      } }]
    }) });
    expect(port.getWorldObject("single-tree").source).toEqual({ kind: "authoring", sourceId: "single-tree" });
    expect(port.getWorldObject("population:single-tree:unrelated").source.kind).toBe("population");
  });
  it("invalidates shared tree readback after panel edits without changing the world revision", () => {
    const context = createObjectContext();
    const population = (context.world as { population: Record<string, unknown> }).population;
    Object.assign(population, {
      treeAppearanceRevision: 0,
      readProceduralTreeInstance: vi.fn((_instance, position, patch) => ({
        recipeId: "tree-recipe", recipeLabel: "Tree", effectIndex: 1, position,
        treeShape: { leafDensity: 0.5 + Number(population.treeAppearanceRevision) * 0.25, ...patch },
        scale: [1, 1, 1], yawRadians: 0,
        bounds: { minimum: [position[0] - 1, 0, position[2] - 1], maximum: [position[0] + (patch?.horizontalScale ?? 1), patch ? 20 : 10, position[2] + 1] }
      }))
    });
    const port = createPort(context);
    expect(port.getWorldObject("population:tree:front:1").properties).toMatchObject({ treeRecipeId: "tree-recipe", treeEffectIndex: 1, treeShape: { leafDensity: 0.5 } });
    population.treeAppearanceRevision = 1;
    expect(port.getWorldObject("population:tree:front:1").properties.treeShape).toEqual({ leafDensity: 0.75 });
    const bounds = port.previewTreeVariationEdit("tree-recipe", 0, { verticalScale: 2 });
    expect(bounds.minimum[0]).toBeCloseTo(-1);
    expect(bounds.maximum[0]).toBeCloseTo(11);
    expect(bounds.maximum[1]).toBe(20);
    expect(port.getWorldObject("population:tree:front:1").worldRevision).toBe(0);
    const original = port.getWorldObject("population:tree:front:1");
    expect(original.footprintMetres).toEqual([2, 2]);
    const edited = port.projectTreeVariationObject(original, { horizontalScale: 4 });
    expect(edited.footprintMetres).toEqual([5, 2]);
    expect(original.footprintMetres).toEqual([2, 2]);
  });
  it("derives Terrain Patch representability from the authoritative Heightmap lattice", () => {
    const port = createPort({ plan: createPlan(), fields: createFields() });

    expect(port.readTerrainPatchConstraints()).toEqual({
      heightSampleSpacingMetres: 50,
      minimumRadiusMetres: 100 * Math.SQRT2
    });
  });

  it("runs the public point check against the actual published terrain sampler",async()=>{
    const port=createPort({plan:createPlan(),fields:createFields()});
    const tool=createSeedWorldSpatialTools(new SeedWorldAgentApplication(port)).find(t=>t.name==="spatial.check")!;
    const result=tool.parseOutput(await tool.execute(tool.parseInput({positions:[{x:0,z:0},{x:80,z:0}],constraints:{water:false}}),
      {signal:new AbortController().signal}));
    expect(result).toMatchObject({items:[
      {position:{x:0,z:0},matches:false,failedConstraints:["water"],surface:{water:true}},
      {position:{x:80,z:0},matches:false,failedConstraints:["outside_world"],surface:null}
    ]});
  });

  it("samples known points and translates plan regions into world coordinates", () => {
    const port = createPort({ plan: createPlan(), fields: createFields() });

    const result = port.queryWorldPoints({
      mode: "sample",
      positions: [
        { x: 0, z: 0 },
        { x: 80, z: 0 }
      ],
      sampleDistance: 10
    }) as { samples: Array<Record<string, unknown>> };
    expect(result.samples[0]).toMatchObject({ insideWorld: true, landCover: "forest", water: true });
    expect(result.samples[0].neighbors).toHaveLength(8);
    expect(result.samples[1]).toEqual({ x: 80, z: 0, insideWorld: false });

    expect(port.queryWorldRegions("summit", 4)).toMatchObject({
      kind: "summit",
      features: [{ id: "summit-0", position: [0, expect.any(Number), 0], elevation: 0.9 }]
    });
    expect(port.queryWorldRegions("river", 4)).toMatchObject({
      kind: "river",
      features: [{ id: "hydrology-basin-1-trunk-1", maximumDepthMetres: 6 }]
    });
  });

  it("answers elevation extrema by scanning the authoritative final height lattice", () => {
    const fields = createFields();
    fields.heightSamples[8] = encodeHeight(64);
    const port = createPort({ plan: createPlan(), fields });

    const result = port.queryWorldPoints({
      mode: "search",
      where: {},
      orderBy: [{ field: "elevation", direction: "desc" }],
      limit: 1,
      spacingMetres: 50
    }) as { strategy: string; inspectedPointCount: number; points: Array<Record<string, unknown>> };

    expect(result.strategy).toBe("authoritative-height-lattice");
    expect(result.inspectedPointCount).toBe(9);
    expect(result.points[0]).toMatchObject({ x: 50, z: 50, elevation: expect.closeTo(64, 1) });
  });

  it("merges locally published Water into point sampling and semantic search", () => {
    const fields = createFields();
    fields.waterMask.fill(0);
    fields.riverBankDistanceMetres.fill(50);
    const queryAuthoredSurface = vi.fn((x: number, z: number) =>
      Math.abs(x) < 1 && Math.abs(z) < 1
        ? { water: true, bodyId: "pond-1", surfaceElevationMetres: 14 }
        : { water: false }
    );
    const port = createPort({
      plan: createPlan(),
      fields,
      water: { queryAuthoredSurface }
    });

    expect(port.queryWorldPoints({
      mode: "sample",
      positions: [{ x: 0, z: 0 }],
      sampleDistance: 1
    })).toMatchObject({
      samples: [{ water: true, waterSurfaceElevationMetres: 14 }]
    });

    expect(port.queryWorldPoints({
      mode: "search",
      where: { water: true },
      nearestTo: { x: 0, z: 0 },
      orderBy: [{ field: "distance", direction: "asc" }],
      limit: 1,
      spacingMetres: 50
    })).toMatchObject({
      points: [{ position: [0, 14, 0], water: true }]
    });
    expect(queryAuthoredSurface).toHaveBeenCalled();
  });

  it("treats a complete published Water miss as authoritative over the planning mask in sample and search", () => {
    const fields = createFields();
    fields.waterMask.fill(1);
    const querySurface = vi.fn(() => ({ water: false }));
    const queryAuthoredSurface = vi.fn(() => ({ water: true }));
    const port = createPort({ plan: createPlan(), fields, water: { querySurface, queryAuthoredSurface } });
    expect(port.queryWorldPoints({ mode: "sample", positions: [{ x: 0, z: 0 }], sampleDistance: 1 }))
      .toMatchObject({ samples: [{ water: false }] });
    expect(port.queryWorldPoints({ mode: "search", where: { water: true },
      orderBy: [{ field: "elevation", direction: "asc" }], limit: 10, spacingMetres: 50 }))
      .toMatchObject({ points: [] });
    expect(port.queryWorldPoints({ mode: "search", where: {},
      orderBy: [{ field: "elevation", direction: "desc" }], limit: 1, spacingMetres: 50 }))
      .toMatchObject({ strategy: "authoritative-height-lattice", points: [{ water: false }] });
    querySurface.mockReturnValue({ water: true, surfaceElevationMetres: 1000 } as never);
    const exact = port.queryWorldPoints({ mode: "search", where: { maximumElevation: 100 },
      orderBy: [{ field: "elevation", direction: "desc" }], limit: 1, spacingMetres: 50 }) as { points: Array<{ elevation: number; position: number[]; water: boolean }> };
    expect(exact.points[0].water).toBe(true);
    expect(exact.points[0].elevation).toBeLessThan(100);
    expect(exact.points[0].position[1]).toBe(exact.points[0].elevation);
    expect(querySurface).toHaveBeenCalled();
    expect(queryAuthoredSurface).not.toHaveBeenCalled();
    const legacy = createPort({ plan: createPlan(), fields, water: { queryAuthoredSurface: () => ({ water: false }) } });
    expect(legacy.queryWorldPoints({ mode: "sample", positions: [{ x: 0, z: 0 }], sampleDistance: 1 }))
      .toMatchObject({ samples: [{ water: true }] });
  });

  it("queries stable world objects in view space and resolves an object-relative area", () => {
    const port = createPort(createObjectContext());

    const result = port.queryWorldObjects({
      kinds: ["tree"],
      spatial: {
        anchor: { kind: "viewer" },
        relation: "in-front-of",
        maximumDistanceMetres: 100,
        maximumViewAngleDegrees: 30
      },
      orderBy: [
        { field: "viewAngle", direction: "asc" },
        { field: "distance", direction: "asc" }
      ],
      limit: 1
    });

    expect(result).toMatchObject({
      worldId: "seed-world-1729",
      worldRevision: 0,
      objects: [
        {
          objectId: "population:tree:front:1",
          objectKind: "tree",
          position: [0, expect.any(Number), expect.any(Number)],
          viewAngleDegrees: 0,
          distanceMetres: expect.any(Number)
        }
      ]
    });
    expect(result.objects[0].position[2]).toBeCloseTo(10);
    expect(result.objects[0].distanceMetres).toBeCloseTo(10);
    expect(port.getWorldObject("population:tree:front:1")).toMatchObject({
      footprintMetres: [2, 3],
      source: { kind: "population", sourceId: "cell-0-0" }
    });
    const resolvedTarget = port.resolveSpatialTarget({
      anchor: { kind: "object", objectId: "population:tree:front:1" },
      relation: { kind: "around", radiusMetres: 6 },
      expectedWorldRevision: 0
    });
    expect(resolvedTarget).toMatchObject({
      geometry: "area",
      position: [0, 0, expect.any(Number)],
      radiusMetres: 6,
      anchor: { object: { objectId: "population:tree:front:1" } },
      worldRevision: 0
    });
    expect(resolvedTarget.position[2]).toBeCloseTo(10);
    expect(() =>
      port.resolveSpatialTarget({
        anchor: { kind: "object", objectId: "population:tree:front:1" },
        relation: { kind: "around", radiusMetres: 6 },
        expectedWorldRevision: 1
      })
    ).toThrow("current revision is 0");
  });

  it("checks cancellation before applying an Environment Resource update", async () => {
    const lighting = { getSnapshot: vi.fn(), setTuning: vi.fn() };
    const environment = { setTransitionDuration: vi.fn(), setWeatherState: vi.fn(), setSeason: vi.fn() };
    const port = createPort({ lighting, environment });
    const controller = new AbortController();
    controller.abort();

    await expect(
      port.updateEnvironment(
        { timeHours: 18, weatherPreset: "rain", transitionDuration: 2, waitForIbl: false },
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(lighting.setTuning).not.toHaveBeenCalled();
    expect(environment.setWeatherState).not.toHaveBeenCalled();
  });

  it("publishes canonical time and configured sustained wind instead of an instantaneous gust sample", () => {
    const context = createObjectContext();
    Object.assign(context, {
      cameraMode: "roam",
      lighting: {
        getSnapshot: () => ({
          timeHours: 20.000000000000004,
          phase: "Night",
          playing: false,
          iblBake: { phase: "idle", progress: 1, publishedRevision: 9 },
          iblBakingEnabled: true
        })
      },
      environment: {
        getSnapshot: () => ({
          season: { id: "winter", transitionProgress: 1 },
          weather: {
            cloud: { cloudCoverage: 1 },
            skyLighting: { fogDensityMultiplier: 1 },
            wind: { forceMultiplier: 1.4, directionOffsetDegrees: -30, gustStrength: 0.3, turbulence: 0.2 },
            precipitation: { rainRate: 1, snowRate: 0 },
            lightning: { frequency: 0.2, strength: 3.2 }
          },
          wind: { baseDirection: [0, 0, -1], direction: [1, 0, 0], baseSpeedMps: 5, speedMps: 6.06814269275855 }
        })
      },
      water: {
        getDiagnostics: () => ({ ready: true, visible: true, bodyCount: 2, chunkCount: 2, hostRevision: 1,
          host: { bodies: [{ bodyId: "lake-1" }] } }),
        colorAuthoring: { read: () => [80, 120, 160] }
      }
    });
    const world = context.world as Record<string, unknown>;
    Object.assign(world, {
      population: {
        residentCellCount: 1,
        residentAcceptedCounts: { tree: 2, shrub: 0, flower: 0, grass: 0 },
        submittedCounts: { tree: 2, shrub: 0, flower: 0, grass: 0 }
      },
      stones: { placementCount: 1 },
      smallRocks: { placementCount: 2 },
      mushrooms: { placementCount: 3 },
      lotus: { placementCount: 0 }
    });

    const state = createPort(context).readWorldState();
    expect(state).toMatchObject({
      lighting: { timeHours: 20 },
      water: { colors: [{ bodyId: "lake-1", colorRgb: [80, 120, 160] }] },
      decorations: { rocks: 1, smallRocks: 2, mushrooms: 3, lotus: 0 },
      environment: { windSpeed: 7, windDirectionDegrees: 90 }
    });
    expect(environmentUpdateOutputSchema.parse({ requested: { timeHours: 20 }, state }).state?.world)
      .toEqual(state?.world);
    expect(() => environmentUpdateOutputSchema.parse({
      requested: {}, state: { ...state, world: { ...state!.world, origin: [0, 0, 0] } }
    })).toThrow();
  });

  it("applies season defaults, then a weather preset, then explicit Environment channel overrides", async () => {
    const environment = {
      getSnapshot: vi.fn(() => ({
        weather: {
          cloud: {
            cloudCoverage: 0.2,
            cloudDensityMultiplier: 1,
            cloudTransmittance: 0.8,
            skyOcclusion: 0.1
          },
          skyLighting: { fogDensityMultiplier: 1 },
          wind: { forceMultiplier: 0.8, directionOffsetDegrees: 0, gustStrength: 0.1, turbulence: 0.12 },
          precipitation: { rainRate: 0, snowRate: 0, temperatureCelsius: 22, relativeHumidity: 0.38 },
          lightning: { frequency: 0, strength: 0 }
        },
        wind: { baseDirection: [0, 0, -1], direction: [1, 0, 0], baseSpeedMps: 5, speedMps: 4 },
        season: { transitionProgress: 1 },
        transitionProgress: { skyLighting: 1, cloud: 1, precipitation: 1, wind: 1, lightning: 1 }
      })),
      setWeatherState: vi.fn(),
      setTransitionDuration: vi.fn(),
      setSeason: vi.fn(),
      setWind: vi.fn(),
      setPrecipitation: vi.fn(),
      setCloud: vi.fn(),
      setSkyLighting: vi.fn(),
      setLightning: vi.fn()
    };
    const lighting = { getSnapshot: () => ({ iblBakingEnabled: true }), transitionTime: vi.fn().mockResolvedValue(undefined) };
    const port = createPort({ environment, lighting });
    vi.spyOn(port, "readWorldState").mockReturnValue(null);

    await port.updateEnvironment(
      {
        timeHours: 20,
        season: "autumn",
        weatherPreset: "storm",
        wind: { speedMetresPerSecond: 8, directionDegrees: -30, gustiness: 0.25, turbulence: 0.75 },
        precipitation: { rainIntensity: 0.8, snowIntensity: 0.1 },
        atmosphere: { fogIntensity: 0.4 },
        lightning: { frequency: 0.3, intensity: 0.9 },
        transitionDuration: 2,
        waitForIbl: false
      },
      new AbortController().signal
    );

    expect(environment.setWeatherState).toHaveBeenCalledOnce();
    expect(environment.setSeason).toHaveBeenCalledWith("autumn");
    expect(environment.setSeason.mock.invocationCallOrder[0]).toBeLessThan(
      environment.setWeatherState.mock.invocationCallOrder[0]!
    );
    expect(environment.setTransitionDuration).toHaveBeenCalledWith(2);
    expect(environment.setTransitionDuration.mock.invocationCallOrder[0]).toBeLessThan(
      environment.setWeatherState.mock.invocationCallOrder[0]!
    );
    expect(environment.setWeatherState.mock.invocationCallOrder[0]).toBeLessThan(
      environment.setWind.mock.invocationCallOrder[0]!
    );
    expect(lighting.transitionTime).toHaveBeenCalledWith(20, 2, expect.any(AbortSignal), undefined);
    expect(environment.setWind).toHaveBeenCalledWith({
      forceMultiplier: 1.6,
      directionOffsetDegrees: 30,
      gustStrength: 0.15,
      turbulence: 0.75
    });
    expect(environment.setPrecipitation).toHaveBeenCalledWith({
      rainRate: 0.8,
      snowRate: 0.1,
      temperatureCelsius: 11,
      relativeHumidity: 1
    });
    expect(environment.setCloud).not.toHaveBeenCalled();
    expect(environment.setSkyLighting.mock.calls[0]![0].fogDensityMultiplier).toBeCloseTo(3.8);
    expect(environment.setLightning).toHaveBeenCalledWith({ frequency: 0.3, strength: 3.6 });
  });

  it.each([[1, 0, 0], [0, 0, -1], [1, 1, 1]])("maps world headings independently of wind baseline %j", async (x, y, z) => {
    const baseDirection = [x, y, z] as [number, number, number];
    const system = new WindSystem({ baseDirection, baseSpeedMps: 5 });
    const forcing = { forceMultiplier: 1, directionOffsetDegrees: 17, gustStrength: 0, turbulence: 0 };
    const environment = {
      getSnapshot: () => ({ wind: { baseSpeedMps: 5, baseDirection }, weather: { wind: forcing }, transitionProgress: { wind: 1 } }),
      setTransitionDuration: vi.fn(),
      setWind: vi.fn(value => { Object.assign(forcing, value); system.applyWeatherForcing(value); })
    };
    const port = createPort({ environment });
    vi.spyOn(port, "readWorldState").mockReturnValue(null);
    for (const heading of [0, 90, -90, 180]) {
      await port.updateEnvironment({ wind: { directionDegrees: heading }, waitForIbl: false, transitionDuration: 0 }, new AbortController().signal);
      const vector = system.getTargetVelocityWS(), radians = heading * Math.PI / 180;
      const length = Math.hypot(vector[0], vector[2]);
      expect(vector[0] / length).toBeCloseTo(Math.sin(radians), 8);
      expect(vector[2] / length).toBeCloseTo(-Math.cos(radians), 8);
    }
    const previous = forcing.directionOffsetDegrees;
    await port.updateEnvironment({ wind: { speedMetresPerSecond: 0 }, waitForIbl: false, transitionDuration: 0 }, new AbortController().signal);
    expect(forcing.directionOffsetDegrees).toBe(previous);
  });

  it("returns a JSON-safe Environment update receipt without undefined optional fields", async () => {
    const lighting = { getSnapshot: vi.fn(), transitionTime: vi.fn().mockResolvedValue(undefined) };
    const environment = { setTransitionDuration: vi.fn(), setWeatherState: vi.fn(), setSeason: vi.fn() };
    const port = createPort({ lighting, environment });
    vi.spyOn(port, "readWorldState").mockReturnValue(null);

    const result = await port.updateEnvironment(
      {
        timeHours: 18,
        season: undefined,
        weatherPreset: undefined,
        wind: undefined,
        precipitation: undefined,
        atmosphere: undefined,
        lightning: undefined,
        transitionDuration: 1,
        waitForIbl: false
      },
      new AbortController().signal
    );

    expect(result).toEqual({
      requested: { timeHours: 18, transitionDuration: 1, waitForIbl: false },
      state: null
    });
  });

  it.each(["spring", "summer", "autumn"] as const)(
    "keeps %s temperature when an explicit stop-snow channel overrides a cold transition snapshot",
    async (season) => {
      const environment = {
        getSnapshot: () => ({
          weather: { precipitation: { rainRate: 0, snowRate: 0.78, temperatureCelsius: -5, relativeHumidity: 0.9 } },
          season: { transitionProgress: 1 },
          transitionProgress: { skyLighting: 1, cloud: 1, precipitation: 1 }
        }),
        setTransitionDuration: vi.fn(),
        setSeason: vi.fn(),
        setPrecipitation: vi.fn()
      };
      const port = createPort({ environment, lighting: {} });
      vi.spyOn(port, "readWorldState").mockReturnValue(null);
      await port.updateEnvironment(
        { season, precipitation: { snowIntensity: 0 }, transitionDuration: 2, waitForIbl: false },
        new AbortController().signal
      );
      expect(environment.setSeason).toHaveBeenCalledWith(season);
      expect(environment.setPrecipitation).toHaveBeenCalledWith({
        rainRate: 0,
        snowRate: 0,
        temperatureCelsius: 22,
        relativeHumidity: 0.38
      });
    }
  );

  it("delegates all resource CRUD mutations through one host transaction callback", async () => {
    const mutateWorldResource = vi.fn(async () => ({ mutation: true }));
    const context = {} as SeedWorldRuntimeContext;
    const port = new SeedWorldRuntimeEnginePort({
      readContext: () => context,
      isDestroyed: () => false,
      sampleNavigationHeight: () => 0,
      readAuthoringSnapshot: () => ({
        activeRevision: 0,
        draftRevision: 0,
        authoringStateHash: "a".repeat(64),
        resources: [],
        removedObjectIds: []
      }),
      mutateWorldResource,
      mutateWorldResources: vi.fn(async () => ({ mutation: true })),
    });
    const signal = new AbortController().signal;
    const mutation = {
      action: "create" as const,
      resourceType: "terrain-patch" as const,
      value: { x: 1, z: 2, radiusMetres: 30, heightDeltaMetres: 4 }
    };

    await port.mutateWorldResource(mutation, signal);
    expect(mutateWorldResource).toHaveBeenCalledWith(mutation, signal);
  });
});

function createPort(context: Record<string, unknown>, options: Partial<SeedWorldRuntimeEnginePortOptions> = {}): SeedWorldRuntimeEnginePort {
  return new SeedWorldRuntimeEnginePort({
    readContext: () => context as unknown as SeedWorldRuntimeContext,
    isDestroyed: () => false,
    sampleNavigationHeight: () => 0,
    readAuthoringSnapshot: () => ({
      activeRevision: 0,
      draftRevision: 0,
      authoringStateHash: "a".repeat(64),
      resources: [],
      removedObjectIds: []
    }),
    mutateWorldResource: vi.fn(async () => ({ mutation: true })),
    mutateWorldResources: vi.fn(async () => ({ mutation: true })),
    ...options
  });
}

function createObjectContext(): Record<string, unknown> {
  const plan = createPlan();
  const fields = createFields();
  const instance = (id: string, x: number, z: number) => ({
    id,
    category: "tree",
    sourceCellId: "cell-0-0",
    ordinal: 1,
    normalizedPosition: { x: x / fields.sizeMetres + 0.5, y: z / fields.sizeMetres + 0.5 },
    intent: {},
    profileVersion: 1,
    prototypeFamily: "tree",
    prototypeRank: 1,
    assetRecipeId: "tree-recipe",
    scale: [1, 1, 1],
    footprintMetres: [2, 3],
    yawRadians: 0,
    colorVariation: 0
  });
  return {
    plan,
    fields,
    world: {
      population: {
        getExactPopulationInstances: () => [
          instance("population:tree:front:1", 0, 10),
          instance("population:tree:right:1", 10, 0)
        ]
      },
      exactPrefabs: { exactInstances: [] }
    },
    camera: {
      entity: {
        transform: {
          worldPosition: { x: 0, y: 10, z: 0 },
          worldForward: { x: 0, y: 0, z: 1 }
        }
      }
    }
  };
}

function createPlan(): SeedWorldPlan {
  const point = (x: number, y: number) => ({ x, y });
  const riverPoint = (x: number, y: number, widthMetres: number, depthMetres: number) => ({
    x,
    y,
    elevation: 0.5,
    discharge: 1,
    widthMetres,
    depthMetres,
    bankFeatherMetres: 3,
    bedElevationMetres: 2
  });
  return {
    rootSeed: 1729,
    sizeMetres: 100,
    resolution: 2,
    coastShape: {
      sizeMetres: 100,
      center: point(0.5, 0.5),
      radiusXMetres: 50,
      radiusZMetres: 50,
      angleRadians: 0,
      squareness: 2,
      warpSeed: 1729,
      contourLevel: 0
    },
    riverDistance: new Uint16Array(4).fill(1),
    roadDistance: new Uint16Array(4).fill(2),
    summits: [{ ...point(0.5, 0.5), elevation: 0.9 }],
    rivers: [
      {
        id: "river-0",
        kind: "trunk",
        points: [riverPoint(0.2, 0.2, 3, 2), riverPoint(0.5, 0.5, 7, 6), riverPoint(0.8, 0.8, 5, 4)]
      }
    ],
    pois: [
      { id: "poi-a", kind: "settlement", position: point(0.25, 0.25) },
      { id: "poi-b", kind: "lookout", position: point(0.75, 0.75) }
    ],
    roads: [
      {
        id: "road-0",
        fromPoiId: "poi-a",
        toPoiId: "poi-b",
        points: [
          { ...point(0.25, 0.25), bridge: false, naturalHeightMetres: 3 },
          { ...point(0.75, 0.75), bridge: true, naturalHeightMetres: 4 }
        ],
        bridgeIntervals: [{ startArcMetres: 1, endArcMetres: 2, waterStartArcMetres: 1.2, waterEndArcMetres: 1.8 }]
      }
    ]
  } as unknown as SeedWorldPlan;
}

function createFields(): SeedWorldFields {
  const height = encodeHeight(12);
  return {
    rootSeed: 1729,
    sizeMetres: 100,
    heightResolution: 3,
    surfaceResolution: 2,
    heightSamples: new Uint16Array(9).fill(height),
    materialWeights: new Uint8Array(16),
    waterMask: new Uint8Array(4).fill(1),
    flow: new Uint8Array(4).fill(128),
    sediment: new Uint8Array(4),
    wetness: new Uint8Array(4).fill(192),
    wetlandWeight: new Uint8Array(4).fill(64),
    riverBankDistanceMetres: new Float32Array(4),
    rockySlopeWeight: new Uint8Array(4),
    wetlandWaterLevelMetres: new Float32Array(4).fill(13),
    habitat: new Uint8Array(4).fill(SeedWorldLandCover.Forest),
    wetlandBasinStyle: {} as SeedWorldFields["wetlandBasinStyle"],
    riverCurves: [
      {
        id: "hydrology-basin-1-trunk-1",
        controls: [
          riverControl("source", 0.2, 0.2, 3, 2),
          riverControl("middle", 0.5, 0.5, 7, 6),
          riverControl("outlet", 0.8, 0.8, 5, 4)
        ]
      }
    ],
    riverCurveSamples: [[]],
    hydrologyGeometryHash: 0,
    hydrologyBakeHash: 0,
    hash: 1
  };
}

function riverControl(id: string, x: number, y: number, widthMetres: number, depthMetres: number) {
  return {
    id,
    x,
    y,
    widthMetres,
    depthMetres,
    bankFeatherMetres: 3,
    flow: 1,
    bedElevationMetres: 2,
    in: [0, 0] as const,
    out: [0, 0] as const
  };
}

function encodeHeight(height: number): number {
  const range = SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum;
  return Math.round(((height - SEED_WORLD_HEIGHT_RANGE.minimum) / range) * 0xffff);
}

// The entity is a headless fixture; contact and frame updates use the real navigation runtime.
it.each([0, 2.5])("restores teleport navigation through undo and real frame updates (offset %s)", async (offset) => {
  const position = new Vector3(1, 0, 2), forward = new Vector3(0, 0, -1);
  const entity = {
    engine: { inputManager: { pointers: [] }, canvas: { width: 1280, height: 720 } },
    transform: { worldPosition: position, worldForward: forward,
      setWorldPosition: (x: number, y: number, z: number) => position.set(x, y, z),
      lookAt: (target: Vector3) => forward.copyFrom(target).subtract(position).normalize() }
  } as unknown as Entity;
  const navigation = new TerrainNavigationRuntime(entity);
  navigation.setGroundProvider({ sampleHeightInterpolated: () => 12 });
  navigation.setEyeHeight(1.8);
  navigation.setGroundCollision(true);
  navigation.setVerticalOffset(offset);
  const port = createPort({ plan: createPlan(), fields: createFields(), cameraMode: "roam",
    camera: { entity }, navigation, orbit: { target: new Vector3() } }, { sampleNavigationHeight: () => 12 });
  vi.spyOn(port, "readWorldState").mockImplementation(() => ({ ...state(), camera: {
    mode: "roam", position: [position.x, position.y, position.z], forward: [forward.x, forward.y, forward.z],
    navigation: { eyeHeight: navigation.eyeHeight, verticalOffset: navigation.verticalOffset }
  } }));
  const signal = new AbortController().signal;
  const initialSettings = {waterColors: [], camera: structuredClone(port.readWorldState()!.camera)};
  const first = port.beginEdit("first");
  first.port.teleport({ x: 20, z: 30, heightOffset: 7 });
  first.seal(); await first.activate(signal);
  navigation.onLateUpdate(1 / 60);
  expect(position.y).toBe(19);
  const second = port.beginEdit("second", first.settings);
  second.port.teleport({ x: 40, z: 50, heightOffset: 4 });
  second.seal(); await second.activate(signal);
  const undoSecond = port.beginEdit("undo-second", second.settings);
  await undoSecond.restoreSettings(first.settings, signal);
  undoSecond.seal(); await undoSecond.activate(signal);
  navigation.onLateUpdate(1 / 60);
  expect(position).toEqual(new Vector3(20, 19, 30));
  expect(navigation.eyeHeight).toBe(7);
  const undoFirst = port.beginEdit("undo-first", undoSecond.settings);
  await undoFirst.restoreSettings(initialSettings, signal);
  undoFirst.seal(); await undoFirst.activate(signal);
  navigation.onLateUpdate(1 / 60);
  expect(position).toEqual(new Vector3(1, 13.8 + offset, 2));
  expect(navigation.eyeHeight).toBe(1.8);
  expect(navigation.verticalOffset).toBe(offset);
  navigation.onDestroy();
});
