import { registerPlanningWaterColor } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterColors";
import type { WaterSceneBodyRequest } from "@galacean/engine-water/water/runtime/index";
import { nativePlanningScene } from "./nativePlanningScene.ts";
import { afterEach, expect, it, vi } from "vitest";
import { Vector3, Quaternion } from "@galacean/engine";
import { Entity } from "@galacean/engine-core";
import { WaterReferenceCountedCompiledResource } from "@galacean/engine-water/water/compiler/body/WaterCompiledResource";
import { createWaterResourceMemoryMetrics } from "@galacean/engine-water/water/runtime/resources/WaterResourceMetrics";
import {
  WATER_SPATIAL_FIELD_VERSION,
  WaterSpatialFieldChannel
} from "@galacean/engine-water/water/runtime/spatial/WaterSpatialFieldProvider";
import { WaterBodyRuntimeAdapter } from "@galacean/engine-water/water/runtime/body/WaterBodyRuntime";
import { WaterBodySourceKind } from "@galacean/engine-water/water/authoring/body/WaterBodyAuthoringTypes";
import { createWaterBodyAsset } from "@galacean/engine-water/water/authoring/body/WaterBodyAsset";
import {
  createRiverWaterBodyInstance,
  RIVER_LOCAL_LOOK_PRESET_ID,
  riverQualityPlanIdForQuality
} from "@galacean/engine-water/water/authoring/river/RiverWaterBodyAuthoring";
import { RiverQualityLevel } from "@galacean/engine-water/water/authoring/river/RiverAuthoringEnums";
import { RIVER_HIGH_LOOK_ID } from "@galacean/engine-water/water/authoring/river/RiverHighLook";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { OceanTextureLibrary } from "@galacean/engine-water/water/runtime/ocean/OceanTextureLibrary";
import {
  WaterBodyResource,
  WaterLookResource,
  WaterQualityResource
} from "@galacean/engine-water/water/native/WaterResources";
import { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import { PlanningPlayerState } from "@galacean/engine-world-planning/spatial/runtime/PlanningPlayerState";
import { NativeBuildingWorld } from "@galacean/engine-world-planning/masonry/NativeBuildingHost";
import {
  PlanningSeedScenePublication,
  type PlanningSeedSceneCandidate
} from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { prepareRockFormationPublication } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Publication";
import { ROCK_GENERATION_DEFAULTS } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GenerationProfile";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { SeedWorldAudioRuntime } from "@galacean/engine-world-planning/world/SeedWorldAudioRuntime";
import { SeedWorldRuntimeEnginePort } from "../../demos/seed-world/agent-adapter/runtime/SeedWorldRuntimeEnginePort.ts";
import { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication.ts";
import type { SeedWorldSurfaceSegment } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { createPlanningData } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { adoptPlanningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { sampleSeedWorldHeight } from "@galacean/engine-world-planning/runtime/SeedWorldFields";

// Only GPU texture loading and WebAudio are replaced. Host, Loader, WaterWorld,
// scene publisher, navigation, audio query state and Agent point queries are real.
vi.hoisted(() => Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true }));
vi.mock("@galacean/engine-terrain/terrain/audio/EnvironmentAudioRuntime", () => ({
  createEnvironmentAudioEmitter: (clip: string, id: string) => ({ clip, id, position: { x: 0, y: 0, z: 0 } }),
  EnvironmentAudioRuntime: class {
    entity = { destroy() {} };
    resetWorld = vi.fn();
    setOcclusionProvider() {}
    setActive() {}
    setDucked() {}
    footstep = vi.fn();
    playbackActive = false;
  }
}));

class Resource extends WaterReferenceCountedCompiledResource<{ height: number }> {
  constructor(asset: any, height: number) {
    super(
      {
        resolvedBackendId: "river",
        representation: asset.representation,
        sourceKind: WaterBodySourceKind.SplineProfile,
        sourceId: asset.id,
        sourceHash: asset.sourceHash,
        physicalSurfaceHash: "1".repeat(16),
        compiledHash: asset.sourceHash,
        schemaVersion: 1
      },
      { height },
      createWaterResourceMemoryMetrics({ cpuStaticBytes: 32 })
    );
  }
}
const fixtures: any[] = [];
const gates = new Set<() => void>();
afterEach(async () => {
  for (const resolve of gates) resolve();
  gates.clear();
  for (const fixture of fixtures.splice(0)) await fixture.owner.destroy();
  vi.restoreAllMocks();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const release = () => {
    gates.delete(release);
    resolve();
  };
  gates.add(release);
  return { promise, resolve: release };
}
function fixture() {
  vi.spyOn(OceanTextureLibrary, "create").mockResolvedValue({ destroy: vi.fn() } as never);
  const engine = {
    canvas: { width: 800, height: 600 },
    time: { frameCount: 0 },
    inputManager: { pointers: [] },
    resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {} }
  } as any;
  const { root, scene } = nativePlanningScene(engine);
  const position = new Vector3(5, 20, 10);
  const camera = {
    cullingMask: 1,
    entity: {
      engine,
      scene,
      transform: {
        worldPosition: position,
        worldRotationQuaternion: new Quaternion(),
        worldForward: new Vector3(0, 0, -1),
        setWorldPosition: (x: number, y: number, z: number) => position.set(x, y, z)
      },
      addComponent: () => ({ configure() {}, clear() {}, destroy() {} })
    },
    scene: { createRootEntity: () => ({ addComponent: (Type: any) => new Type() }) }
  } as any;
  const navigation = new TerrainNavigationRuntime(camera.entity);
  navigation.groundCollision = true;
  const audio = new SeedWorldAudioRuntime(
    camera,
    navigation,
    { subscribeLightningStrikes: () => () => {} } as never,
    {} as never
  );
  const water = new PlanningWaterRuntime({ engine, root, camera });
  water.system.onEnable();
  const host = (water as any).host;
  host.unregisterBackend("river");
  const state = {
    fail: false,
    failVisibility: false,
    destroyFailures: new Map<number, Error>(),
    visibility: new Map<number, boolean>(),
    gate: undefined as Promise<void> | undefined,
    waterCleanup: undefined as Promise<void> | undefined
  };
  host.registerBackend({
    id: "river",
    transformModel: "finite-planar",
    representationMatchers: [
      { domain: "spline-network", macroSurface: "flow-deformed", sourceKinds: [WaterBodySourceKind.SplineProfile] }
    ],
    compile(source: any, context: any) {
      if (state.fail) throw new Error("Water prepare failed");
      return new Resource(context.asset, context.asset.source.descriptor.height);
    },
    async createRuntime(resource: Resource, context: any) {
      await state.gate;
      const height = resource.data.height;
      return {
        body: new WaterBodyRuntimeAdapter({
          id: context.effectiveSnapshot.instanceId,
          resolvedBackendId: "river",
          kind: "river",
          representation: context.effectiveSnapshot.representation,
          sourceKind: WaterBodySourceKind.SplineProfile,
          bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 },
          priority: 10,
          surfaceFeatures: { velocity: true, deformation: false, latencyFrames: 0 },
          spatialField: {
            metadata: {
              version: WATER_SPATIAL_FIELD_VERSION,
              sourceSchemaVersion: 1,
              sourceHash: resource.identity.sourceHash,
              compiledHash: resource.identity.compiledHash,
              storage: "test-gpu",
              channels:
                WaterSpatialFieldChannel.Bathymetry |
                WaterSpatialFieldChannel.ShoreSignedDistance |
                WaterSpatialFieldChannel.Current,
              bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 },
              outsidePolicy: {
                negativeX: "unresolved",
                positiveX: "unresolved",
                negativeZ: "unresolved",
                positiveZ: "unresolved"
              },
              maximumHorizontalError: 0,
              maximumDepthError: 0
            },
            sampleSpatialField() {
              return false;
            }
          },
          metrics: { meshUploadCount: 0, drawCount: 0, triangleCount: 0 },
          surface: {
            sampleSurface(p, out) {
              out.surfacePosition.set(p.x, height + 2, p.z);
              out.waterDepth = 2;
              return true;
            }
          }
        }),
        setVisible(visible: boolean) {
          state.visibility.set(height, visible);
          if (visible && state.failVisibility) {
            state.failVisibility = false;
            throw Error("controlled Water visibility publication failure");
          }
        },
        updateEffectiveState() {},
        destroy: () => {
          state.visibility.delete(height);
          const failure = state.destroyFailures.get(height);
          if (failure) throw failure;
          return state.waterCleanup;
        }
      };
    }
  });
  Object.assign(water, {
    requests(plan: any) {
      const height = plan.parameters.mountainHeight;
      const asset = createWaterBodyAsset({
        id: `river-${height}`,
        kind: "river",
        sourceHash: `height:${height}`,
        representation: { domain: "spline-network", macroSurface: "flow-deformed" },
        source: {
          schemaVersion: 1,
          kind: WaterBodySourceKind.SplineProfile,
          capabilities: { localBathymetry: true, shoreSdf: true, current: true },
          descriptor: { height }
        }
      });
      return [
        {
          bodyId: "river",
          asset,
          instance: createRiverWaterBodyInstance({
            id: "river",
            assetId: asset.id,
            lookPresetId: RIVER_LOCAL_LOOK_PRESET_ID,
            qualityPlanId: riverQualityPlanIdForQuality(RiverQualityLevel.High),
            visible: true
          }),
          createRuntimeContext: (bodyRoot: Entity) => ({ engine, root: bodyRoot })
        }
      ];
    }
  });
  const canvas = { dataset: {} } as HTMLCanvasElement;
  const orbit = { target: new Vector3(5, 1, 10) };
  const owner = new PlanningSeedScenePublication({ water, navigation, audio, camera, canvas, orbit: orbit as never });
  const port = new SeedWorldRuntimeEnginePort({
    readContext: () => {
      const current = owner.current!;
      return { plan: current.data.plan, fields: current.data.fields, world: current.world, water } as any;
    },
    isDestroyed: () => false
  } as never);
  const candidates: any[] = [];
  function candidate(height: number) {
    const worldRoot = root.createChild(`terrain-${height}`);
    worldRoot.isActive = false;
    const fields = {
      sizeMetres: 100,
      worldOrigin: [0, 0],
      heightResolution: 3,
      surfaceResolution: 2,
      heightDecode: { offset: height, scale: 1 },
      heightSamples: new Uint16Array(9),
      materialWeights: new Uint8Array(16),
      waterMask: new Uint8Array(4),
      flow: new Uint8Array(4),
      wetness: new Uint8Array(4),
      wetlandWeight: new Uint8Array(4),
      habitat: new Uint8Array(4),
      riverBankDistanceMetres: new Float32Array(4),
      rockySlopeWeight: new Uint8Array(4)
    };
    const population = { treeInstances: [], detailDensityFields: [] };
    const result = {
      data: {
        fields,
        population,
        plan: { sizeMetres: 100, worldOrigin: [0, 0], resolution: 3, roadDistance: new Uint16Array(9) }
      },
      world: {
        root: worldRoot,
        population: { getPopulationLayout: () => population, setRockGrassGround: vi.fn() },
        destroy: vi.fn(async () => worldRoot.destroy())
      },
      solids: { root: worldRoot, commit: vi.fn(), rollbackCommit: vi.fn(), finalizeCommit: vi.fn(), dispose: vi.fn() },
      vegetation: { dispose: vi.fn(), getAuthoringSnapshot: () => ({ trees: [] }) },
      template: { dispose: vi.fn() }
    };
    candidates.push(result);
    return result as any;
  }
  function plan(height: number) {
    const plan = {
      parameters: { seed: 1, width: 100, depth: 100, mountainHeight: height, riverWidth: 8, valleyWidth: 20 },
      land: [],
      islands: [],
      waters: [],
      rocks: [],
      mountains: [],
      routes: [],
      places: [],
      sights: [],
      regions: [],
      buildings: [],
      ridges: [],
      supports: [],
      slopes: [],
      spawn: { x: 5, z: 10 },
      planning: createPlanningData(),
      bridges: [{ a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, deckY: height + 5, width: 3 }]
    } as any;
    adoptPlanningHeightmap(plan, {
      resolution: 3,
      spacingX: 50,
      spacingZ: 50,
      heights: new Float32Array(9).fill(height),
      encoded: new Uint16Array(9),
      decodeOffset: height,
      decodeScale: 1
    });
    return plan;
  }
  const publish = (height: number, prepare = async () => candidate(height)) => owner.publish(plan(height), prepare);
  function assertScene(height: number) {
    const current = owner.current!;
    expect(sampleSeedWorldHeight(current.data.fields, 5, 10)).toBe(height);
    expect(water.querySurface(5, 10)).toMatchObject({
      water: true,
      surfaceElevationMetres: height + 2,
      waterDepthMetres: 2
    });
    expect(current.navigation.sampleHeightInterpolated(5, 10)).toBe(height);
    expect(current.navigation.sampleHeightInterpolated(5, 0)).toBe(height + 5);
    expect(current.navigation.sampleContactIsWater(5, 0)).toBe(false);
    expect((navigation as any)._groundProvider).toBe(current.navigation);
    expect((audio as any).world.fields).toBe(current.data.fields);
    expect((audio as any).world.navigation).toBe(current.navigation);
    expect(
      port.queryWorldPoints({ mode: "sample", positions: [{ x: 5, z: 10 }], sampleDistance: 1 } as never)
    ).toMatchObject({ samples: [{ height, water: true, waterSurfaceElevationMetres: height + 2 }] });
    expect(current.world.root.isActive).toBe(true);
    expect(canvas.dataset.publicationRevision).toBe(String(current.revision));
  }
  const result = {
    owner,
    port,
    host,
    state,
    water,
    audio,
    navigation,
    camera,
    canvas,
    orbit,
    publish,
    candidate,
    candidates,
    plan,
    assertScene
  };
  fixtures.push(result);
  return result;
}

it("cancels work owned by a failed candidate factory before losing its controller", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current,
    outer = new AbortController();
  let inner: AbortSignal | undefined;
  let released = false;
  await expect(
    f.owner.prepare(
      f.plan(2),
      async (signal) => {
        inner = signal;
        signal.addEventListener(
          "abort",
          () => {
            released = true;
          },
          { once: true }
        );
        throw Error("factory failed before handing back candidate");
      },
      outer.signal
    )
  ).rejects.toThrow("factory failed");
  expect(inner!.aborted).toBe(true);
  expect(released).toBe(true);
  expect(f.owner.current).toBe(previous);
  await f.publish(3);
  f.assertScene(3);
});

it("preserves a High color across real Host appearance replacement and subsequent scene generation", async () => {
  const f = fixture();
  const target = f.water as unknown as { requests(plan: IslandPlan): any[] };
  const requests = target.requests.bind(target);
  target.requests = (plan) =>
    requests(plan).map((request) => ({
      ...request,
      instance: {
        ...request.instance,
        lookPresetId: RIVER_HIGH_LOOK_ID
      }
    }));
  await f.publish(1);
  await f.water.colorAuthoring.update("river", [224, 64, 128], new AbortController().signal);
  await f.publish(2);
  f.assertScene(2);
  expect(f.water.colorAuthoring.read("river")).toEqual([224, 64, 128]);
});

it("keeps every consumer old during preparation, then publishes before delayed Terrain/Water retirement", async () => {
  const f = fixture();
  await f.publish(1);
  f.assertScene(1);
  const old = f.owner.current!;
  const retirement = deferred();
  vi.spyOn(old.world, "destroy").mockImplementation(() => retirement.promise);
  f.state.waterCleanup = retirement.promise;
  const preparation = deferred();
  f.state.gate = preparation.promise;
  const next = f.publish(8);
  await vi.waitFor(() => expect(f.candidates).toHaveLength(2));
  f.assertScene(1);
  expect(f.candidates[1].world.root.isActive).toBe(false);
  preparation.resolve();
  await next;
  f.assertScene(8);
  expect(old.world.root.isActive).toBe(false);
  expect(old.vegetation?.dispose).toHaveBeenCalledOnce();
  expect(old.template?.dispose).toHaveBeenCalledOnce();
  expect(f.owner.current!.vegetation?.dispose).not.toHaveBeenCalled();
  expect(f.owner.current!.template).toBe(f.candidates[1].template);
  expect(f.owner.current!.template?.dispose).not.toHaveBeenCalled();
  expect(f.owner.getDiagnostics().retiredCount).toBeGreaterThan(0);
  retirement.resolve();
  await vi.waitFor(() => expect(f.owner.getDiagnostics().retiredCount).toBe(0));
  f.state.waterCleanup = undefined;
});

it("preserves the complete previous scene through Terrain/Water preparation failures and allows retry", async () => {
  const f = fixture();
  await f.publish(2);
  await expect(
    f.publish(3, async () => {
      throw new Error("Terrain prepare failed");
    })
  ).rejects.toThrow("Terrain prepare failed");
  f.assertScene(2);
  f.state.fail = true;
  await expect(f.publish(4)).rejects.toThrow("Water prepare failed");
  f.assertScene(2);
  expect(f.candidates.at(-1).world.destroy).toHaveBeenCalledOnce();
  expect(f.candidates.at(-1).vegetation.dispose).toHaveBeenCalledOnce();
  f.state.fail = false;
  await f.publish(6);
  f.assertScene(6);
});

it("a late superseded Terrain cannot overwrite B and releases its candidate exactly once", async () => {
  const f = fixture();
  await f.publish(1);
  const late = deferred();
  const a = f.publish(2, async () => {
    await late.promise;
    return f.candidate(2);
  });
  const failed = expect(a).rejects.toThrow();
  await f.publish(3);
  f.assertScene(3);
  late.resolve();
  await failed;
  f.assertScene(3);
  expect(f.candidates.at(-1).world.destroy).toHaveBeenCalledOnce();
  expect(f.candidates.at(-1).vegetation.dispose).toHaveBeenCalledOnce();
});

it("cancels before destruction waits, releases late preparation and destroys active Water to zero", async () => {
  const f = fixture();
  await f.publish(1);
  const late = deferred();
  let signal: AbortSignal | undefined;
  const pending = f.owner.publish(f.plan(2), async (s) => {
    signal = s;
    await late.promise;
    return f.candidate(2);
  });
  const failed = expect(pending).rejects.toThrow();
  const destruction = f.owner.destroy();
  expect(signal!.aborted).toBe(true);
  expect(f.owner.current!.world.root.isActive).toBe(false);
  late.resolve();
  await failed;
  await destruction;
  for (const c of f.candidates) {
    expect(c.world.destroy).toHaveBeenCalledOnce();
    expect(c.solids.dispose).toHaveBeenCalledOnce();
    expect(c.vegetation.dispose).toHaveBeenCalledOnce();
  }
  expect(f.host.getDiagnostics()).toMatchObject({ activeBodyCount: 0, world: { registeredBodyCount: 0 } });
  await f.owner.destroy();
});

it("cleanup failure records diagnostics after successful publication, and a prepared Water set cannot commit twice", async () => {
  const f = fixture();
  await f.publish(1);
  const old = f.owner.current!;
  vi.spyOn(old.world, "destroy").mockRejectedValue(new Error("retired Terrain cleanup failed"));
  const cleanupLog = vi.spyOn(console, "error").mockImplementation(() => {});
  f.state.waterCleanup = Promise.reject(new Error("retired Water cleanup failed"));
  void f.state.waterCleanup.catch(() => {});
  await f.publish(2);
  f.assertScene(2);
  await vi.waitFor(() =>
    expect(f.owner.getDiagnostics().cleanupErrors).toContain("Error: retired Terrain cleanup failed")
  );
  // Loader replacement finalization reports cleanup failure and resolves; it does not reject Host cleanup.
  await vi.waitFor(() =>
    expect(cleanupLog).toHaveBeenCalledWith(
      expect.stringContaining("replacement retired runtime cleanup failed"),
      expect.objectContaining({ message: "retired Water cleanup failed" })
    )
  );
  expect(f.host.getDiagnostics().lastCurrentRevisionError).toBeNull();
  f.state.waterCleanup = undefined;
  const prepared = await f.water.prepare(f.plan(3));
  prepared.commit();
  expect(() => prepared.commit()).toThrow("no longer active");
  await prepared.rollback();
});

it("releases first exposure and unaccepted player state after Water failure, then retries cleanly", async () => {
  const f = fixture();
  const player = new PlanningPlayerState(
    () => ({ getItem: () => null, setItem() {} }),
    () => ({ position: [5, 20, 10], yawDegrees: 0, pitchDegrees: 0, mode: "roam" }),
    () => {}
  );
  const exposure = { destroy: vi.fn() };
  const prepare = async () => ({
    ...f.candidate(2),
    windExposure: exposure,
    playerState: player.prepare({
      seed: 2,
      width: 100,
      depth: 100,
      groundClearance: 3,
      allowOrbit: false,
      sampleHeight: () => 2
    })
  });
  f.state.fail = true;
  await expect(f.publish(2, prepare)).rejects.toThrow("Water prepare failed");
  expect(exposure.destroy).toHaveBeenCalledOnce();
  expect((player as any).seed).toBeUndefined();
  expect(f.owner.current).toBeUndefined();
  f.state.fail = false;
  await f.publish(2, async () => ({
    ...f.candidate(2),
    playerState: player.prepare({
      seed: 2,
      width: 100,
      depth: 100,
      groundClearance: 3,
      allowOrbit: false,
      sampleHeight: () => 2
    })
  }));
  f.assertScene(2);
  expect((player as any).seed).toBe(2);
  await player.dispose();
});

it("failed acoustic preparation leaves old queries and audio; a Water environment race rolls back before scene acceptance", async () => {
  const f = fixture();
  await f.publish(1);
  const acoustic = vi.spyOn(f.audio, "prepareWorld").mockImplementationOnce(() => {
    throw new Error("Audio preparation failed");
  });
  await expect(f.publish(2)).rejects.toThrow("Audio preparation failed");
  f.assertScene(1);
  acoustic.mockRestore();
  const prepare = f.water.prepare.bind(f.water);
  const racing = vi.spyOn(f.water, "prepare").mockImplementation(async (...args) => {
    const prepared = await prepare(...args);
    await f.host.publishEnvironmentSnapshot({ surfaceNormalVariance: 0.5 });
    return prepared;
  });
  await expect(f.publish(3)).rejects.toThrow();
  f.assertScene(1);
  racing.mockRestore();
  await f.publish(4);
  f.assertScene(4);
});

it("stages building and prewarmed water together until the authoring transaction commits", async () => {
  const f = fixture();
  await f.publish(1);
  const masonry = { commitPublication: vi.fn(), rollbackPublication: vi.fn(), activate: vi.fn(), destroy: vi.fn() };
  const preparedWater = await f.water.prepare(f.plan(4));
  const waterPrepare = vi.spyOn(f.water, "prepare");
  const next = await f.owner.prepare(f.plan(4), async () => ({
    ...f.candidate(4),
    masonry,
    preparedWater
  }));
  f.assertScene(1);
  expect(waterPrepare).not.toHaveBeenCalled();
  expect(f.candidates.at(-1).world.root.isActive).toBe(false);
  next.commit();
  await next.discard();
  f.assertScene(4);
  expect(masonry.destroy).not.toHaveBeenCalled();
  await f.owner.destroy();
  expect(masonry.destroy).toHaveBeenCalledOnce();
});

it("discards a staged building scene on authoring cancellation and joins it during destruction", async () => {
  const f = fixture();
  await f.publish(1);
  const masonry = { commitPublication: vi.fn(), rollbackPublication: vi.fn(), activate: vi.fn(), destroy: vi.fn() };
  const abort = new AbortController();
  const next = await f.owner.prepare(f.plan(4), async () => ({ ...f.candidate(4), masonry }), abort.signal);
  abort.abort();
  expect(() => next.commit()).toThrow();
  f.assertScene(1);
  await f.owner.destroy();
  await next.discard();
  expect(masonry.destroy).toHaveBeenCalledOnce();
  expect(f.candidates.at(-1).world.destroy).toHaveBeenCalledOnce();
  expect(f.candidates.at(-1).vegetation.dispose).toHaveBeenCalledOnce();
});

it("publishes live scene owners without retaining preparation handles or reading the candidate from audio", async () => {
  const f = fixture();
  const audio = vi.spyOn(f.audio, "prepareWorld");
  const preparedWater = await f.water.prepare(f.plan(4));
  const rollback = vi.spyOn(preparedWater, "rollback");
  const assertCurrent = vi.fn();
  const candidate: PlanningSeedSceneCandidate = {
    ...f.candidate(4),
    preparedWater,
    assertCurrent,
    playerState: {
      bookmark: { mode: "roam", position: [5, 20, 10], yawDegrees: 0, pitchDegrees: 0 },
      commit: vi.fn(),
      rollback: vi.fn(),
      finalize: vi.fn()
    },
    cameraPose: { position: new Vector3(5, 20, 10), rotation: new Quaternion() }
  };
  const world = candidate.world;
  const staged = await f.owner.prepare(f.plan(4), async () => candidate);
  expect(assertCurrent).not.toHaveBeenCalled();
  const published = staged.commit();
  expect(assertCurrent).toHaveBeenCalledOnce();
  expect(candidate.playerState!.finalize).toHaveBeenCalledOnce();
  for (const key of ["preparedWater", "assertCurrent", "playerState", "cameraPose"]) {
    expect(Object.hasOwn(published, key)).toBe(false);
  }
  expect(published.world).toBe(world);
  expect(published.playerBookmark).toBe(candidate.playerState!.bookmark);
  Object.defineProperty(candidate, "world", {
    get() {
      throw Error("retired candidate read");
    }
  });
  expect(audio.mock.calls.at(-1)![0].population()).toBe(world.population.getPopulationLayout());
  expect(published.navigation.sampleHeightInterpolated(5, 10)).toBe(4);
  await staged.discard();
  expect(rollback).not.toHaveBeenCalled();
});

it("starts terrain presentation only on commit and shares its fields with navigation and audio", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!.data.fields;
  const candidate = f.candidate(4);
  const fields = { ...candidate.data.fields };
  const start = vi.fn(() => {
    fields.heightDecode = { offset: 1, scale: 1 };
  });
  const staged = await f.owner.prepare(f.plan(4), async () => ({
    ...candidate,
    heightTransition: { fields, start, pause: async () => () => {}, dispose: vi.fn() }
  }));
  expect(start).not.toHaveBeenCalled();
  f.assertScene(1);
  staged.commit();
  expect(start).toHaveBeenCalledWith(previous);
  const current = f.owner.current!;
  expect(current.navigation.sampleHeightInterpolated(5, 10)).toBe(1);
  expect(sampleSeedWorldHeight(current.data.fields, 5, 10)).toBe(4);
  fields.heightDecode = { offset: 2, scale: 1 };
  expect(current.navigation.sampleHeightInterpolated(5, 10)).toBe(2);
  expect(sampleSeedWorldHeight((f.audio as any).world.fields, 5, 10)).toBe(2);
});

it("does not start discarded terrain presentation and retains the old scene if its initial upload fails", async () => {
  const f = fixture();
  await f.publish(1);
  const start = vi.fn();
  const discarded = await f.owner.prepare(f.plan(2), async () => ({
    ...f.candidate(2),
    heightTransition: { start, pause: async () => () => {}, dispose: vi.fn() }
  }));
  await discarded.discard();
  expect(start).not.toHaveBeenCalled();
  const failing = await f.owner.prepare(f.plan(3), async () => ({
    ...f.candidate(3),
    heightTransition: {
      dispose: vi.fn(),
      start() {
        throw new Error("height upload failed");
      }
    }
  }));
  expect(() => failing.commit()).toThrow("height upload failed");
  f.assertScene(1);
  await failing.discard();
});

it("validates prepared author dependencies before changing any live scene consumers", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current;
  let current = true;
  const replacement = f.candidate(7);
  replacement.assertCurrent = () => {
    if (!current) throw Error("author edit completed or pending");
  };
  const staged = await f.owner.prepare(f.plan(7), async () => replacement);
  current = false;
  expect(() => staged.commit()).toThrow("author edit");
  expect(f.owner.current).toBe(previous);
  f.assertScene(1);
  expect(replacement.world.root.isActive).toBe(false);
  await staged.discard();
  expect(replacement.world.destroy).toHaveBeenCalledTimes(1);
  f.assertScene(1);
});
it("discards unpublished vegetation exactly once without retiring the active plants", async () => {
  const f = fixture();
  await f.publish(1);
  const active = f.owner.current!;
  const staged = await f.owner.prepare(f.plan(2), async () => f.candidate(2));
  const candidate = f.candidates.at(-1);
  expect(f.owner.current).toBe(active);
  expect(candidate.vegetation.dispose).not.toHaveBeenCalled();
  await staged.discard();
  await staged.discard();
  expect(candidate.vegetation.dispose).toHaveBeenCalledOnce();
  expect(candidate.template.dispose).toHaveBeenCalledOnce();
  expect(candidate.world.destroy).toHaveBeenCalledOnce();
  expect(active.vegetation?.dispose).not.toHaveBeenCalled();
  expect(active.template).toBe(f.candidates[0].template);
  expect(active.template?.dispose).not.toHaveBeenCalled();
});

it.each(["prepareRocks", "prepareContent"] as const)(
  "%s retains terrain, navigation, plants and water while publishing one content frame",
  async (method) => {
    const f = fixture();
    await f.publish(1);
    const previous = f.owner.current!;
    const waterPrepare = vi.spyOn(f.water, "prepare"),
      frame = { commit: vi.fn(), discard: vi.fn() };
    const plan = structuredClone(previous.plan);
    const staged = await f.owner[method](plan, async () => frame);
    expect(f.owner.current).toBe(previous);
    const next = staged.commit();
    await staged.discard();
    expect(frame.commit).toHaveBeenCalledOnce();
    expect(frame.discard).not.toHaveBeenCalled();
    expect(next.plan).toBe(plan);
    expect(next.world).toBe(previous.world);
    expect(next.data).toBe(previous.data);
    expect(next.vegetation).toBe(previous.vegetation);
    expect(next.solids).toBe(previous.solids);
    expect(next.navigation).toBe(previous.navigation);
    expect(next.revision).toBeGreaterThan(previous.revision);
    expect(previous.world.destroy).not.toHaveBeenCalled();
    expect(previous.vegetation!.dispose).not.toHaveBeenCalled();
    expect(waterPrepare).not.toHaveBeenCalled();
    f.assertScene(1);
  }
);

it("publishes a rock and its dependent building supports without recreating any world owners", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!,
    source = previous as any;
  const rocks = { commit: vi.fn(), discard: vi.fn(), metrics: { uploaded: 1, retained: 12 } };
  const supports = {
    commit: vi.fn(),
    rollback: vi.fn(),
    finalize: vi.fn(),
    discard: vi.fn(),
    metrics: { buildingSupportsUpdated: 1, buildingsRetained: 20 }
  };
  const grass = {
    commit: vi.fn(),
    discard: vi.fn(),
    metrics: { grassFormationsChanged: 1, grassFormationsRetained: 12 }
  };
  source.world.population.prepareRockGrass = vi.fn(() => grass);
  source.world.population.setRockGrassGround = vi.fn();
  source.solids.prepareRocks = vi.fn(() => rocks);
  source.vegetation.prepareRocks = vi.fn(() => ({ commit: vi.fn(), discard: vi.fn() }));
  source.masonry = { prepareRockSupports: vi.fn(() => supports), destroy: vi.fn(), root: { isActive: true } };
  const plan = {
    ...previous.plan,
    buildings: [
      {
        id: "house",
        regionId: "village",
        center: { x: 20, z: 20 },
        width: 8,
        depth: 6,
        height: 6,
        baseHeight: 1,
        yaw: 0,
        outline: []
      }
    ]
  } as unknown as IslandPlan;
  const waterPrepare = vi.spyOn(f.water, "prepare"),
    fullPrepare = vi.spyOn(f.owner, "prepare");
  const profile = { ...ROCK_GENERATION_DEFAULTS, platformShare: 0.9, platformHeightScale: 0.3 };
  const frame = await f.owner.prepareRocks(plan, (signal) =>
    prepareRockFormationPublication(previous, plan, [], {} as any, {} as any, 2, signal, profile)
  );
  expect(source.vegetation.prepareRocks).toHaveBeenCalledWith({}, {}, expect.any(AbortSignal), profile);
  expect(rocks.commit).not.toHaveBeenCalled();
  expect(supports.commit).not.toHaveBeenCalled();
  expect(grass.commit).not.toHaveBeenCalled();
  frame.commit();
  expect(rocks.commit).toHaveBeenCalledOnce();
  expect(supports.commit).toHaveBeenCalledOnce();
  expect(grass.commit).toHaveBeenCalledOnce();
  for (const key of ["world", "data", "solids", "vegetation", "masonry", "navigation"] as const)
    expect(f.owner.current![key]).toBe(previous[key]);
  expect(waterPrepare).not.toHaveBeenCalled();
  expect(fullPrepare).not.toHaveBeenCalled();
  expect(previous.world.destroy).not.toHaveBeenCalled();
});

it("retains the audio world for tree reveal, movement and removal", async () => {
  const f = fixture();
  await f.publish(1);
  const audioWorld = (f.audio as any).world;
  const prepareAudio = vi.spyOn(f.audio, "prepareWorld"),
    publishAudio = vi.spyOn(f.audio, "publishWorld");
  const tree = {
    id: "tree",
    ownerId: "forest",
    sourceId: "forest",
    kind: "tree" as const,
    center: { x: 20, z: 20 },
    width: 4,
    depth: 4,
    height: 10,
    yaw: 0,
    baseHeight: 1,
    outline: [],
    collisionRadius: 1
  };
  for (const landscapes of [[tree], [{ ...tree, center: { x: 25, z: 30 } }], []]) {
    const plan = { ...f.owner.current!.plan, landscapes };
    const staged = await f.owner.prepareContent(plan, async () => ({ commit() {}, discard() {} }));
    staged.commit();
    expect((f.audio as any).world).toBe(audioWorld);
  }
  expect(prepareAudio).not.toHaveBeenCalled();
  expect(publishAudio).not.toHaveBeenCalled();
  f.assertScene(1);
});

it("updates changed acoustic solids while reusing the published water audio adapter", async () => {
  const f = fixture();
  await f.publish(1);
  const audioWorld = (f.audio as any).world;
  const prepareAudio = vi.spyOn(f.audio, "prepareWorld"),
    publishAudio = vi.spyOn(f.audio, "publishWorld");
  const rock = {
    id: "rock",
    groupId: "rock",
    center: { x: 25, z: 30 },
    width: 4,
    depth: 6,
    height: 8,
    yaw: 0,
    baseHeight: 1,
    role: "peak" as const,
    outline: [],
    obb: []
  };
  const plan: IslandPlan = { ...f.owner.current!.plan, rocks: [rock] };
  const staged = await f.owner.prepareRocks(plan, async () => ({ commit() {}, discard() {} }));
  expect(prepareAudio).toHaveBeenCalledOnce();
  expect(publishAudio).not.toHaveBeenCalled();
  const preparedWorld = prepareAudio.mock.calls[0][0];
  expect(preparedWorld.waterAudio).toBe(audioWorld.waterAudio);
  expect(preparedWorld.population).toBe(audioWorld.population);
  expect(preparedWorld.fields).toBe(audioWorld.fields);
  expect(preparedWorld.rocks.some((solid) => solid.obbCenter[0] === 25 && solid.obbCenter[1] === 5)).toBe(true);
  staged.commit();
  expect(publishAudio).toHaveBeenCalledOnce();
  const unchanged = await f.owner.prepareContent(structuredClone(plan), async () => ({ commit() {}, discard() {} }));
  unchanged.commit();
  expect(prepareAudio).toHaveBeenCalledOnce();
  expect(publishAudio).toHaveBeenCalledOnce();
  f.assertScene(1);
});

it("discards superseded local rock meshes while leaving the live world intact", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!;
  const old = { commit: vi.fn(), discard: vi.fn() },
    fresh = { commit: vi.fn(), discard: vi.fn() };
  const stale = await f.owner.prepareRocks(previous.plan, async () => old);
  const latest = await f.owner.prepareRocks(previous.plan, async () => fresh);
  expect(() => stale.commit()).toThrow("stale");
  await stale.discard();
  expect(old.discard).toHaveBeenCalledOnce();
  expect(old.commit).not.toHaveBeenCalled();
  latest.commit();
  expect(fresh.commit).toHaveBeenCalledOnce();
  expect(previous.world.destroy).not.toHaveBeenCalled();
});

it("destroys staged rock edits before retiring their shared published world", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!,
    frame = { commit: vi.fn(), discard: vi.fn() };
  const staged = await f.owner.prepareRocks(previous.plan, async () => frame);
  await f.owner.destroy();
  expect(frame.discard).toHaveBeenCalledOnce();
  expect(previous.world.destroy).toHaveBeenCalledOnce();
  expect(() => staged.commit()).toThrow();
});

it.each([
  "solids",
  "navigation",
  "audio",
  "player",
  "dataset",
  "orbit-target",
  "camera-position",
  "camera-rotation",
  "water"
] as const)("restores every accepted consumer when %s publication mutates and then fails", async (boundary) => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!,
    previousWaterRevision = f.water.getDiagnostics().hostRevision;
  const previousMetadata = { ...f.canvas.dataset },
    previousPosition = f.camera.entity.transform.worldPosition.clone();
  const previousRotation = f.camera.entity.transform.worldRotationQuaternion.clone();
  const previousOrbitTarget = f.orbit.target.clone();
  const player = new PlanningPlayerState(
    () => ({ getItem: () => null, setItem() {} }),
    () => ({ position: [5, 20, 10], yawDegrees: 0, pitchDegrees: 0, mode: "roam" }),
    () => {}
  );
  const playerWorld = { seed: 1, width: 100, depth: 100, groundClearance: 3, allowOrbit: false, sampleHeight: () => 1 };
  player.publish(playerWorld);
  const previousPlayer = (player as any).state;
  const next = f.candidate(2);
  next.playerState = player.prepare({ ...playerWorld, seed: 2 });
  next.cameraPose = {
    position: new Vector3(12, 30, 16),
    rotation: new Quaternion(0, 0.5, 0, Math.sqrt(0.75)),
    orbitTarget: new Vector3(12, 2, 16)
  };
  let bridgeOwner = previous.solids;
  next.solids.commit = () => {
    bridgeOwner = next.solids;
  };
  next.solids.rollbackCommit = () => {
    bridgeOwner = previous.solids;
  };
  const fail = (target: any, key: string) => {
    const original = target[key].bind(target);
    return vi.spyOn(target, key).mockImplementationOnce((...args: any[]) => {
      original(...args);
      throw new Error(`controlled ${boundary} publication failure`);
    });
  };
  if (boundary === "solids") fail(next.solids, "commit");
  if (boundary === "navigation") fail(f.navigation, "publishGroundProvider");
  if (boundary === "audio") fail(f.audio, "publishWorld");
  if (boundary === "player") fail(next.playerState, "commit");
  if (boundary === "orbit-target") fail(f.orbit.target, "copyFrom");
  if (boundary === "camera-position") fail(f.camera.entity.transform, "setWorldPosition");
  if (boundary === "dataset" || boundary === "camera-rotation") {
    const target = boundary === "dataset" ? f.canvas.dataset : f.camera.entity.transform;
    const key = boundary === "dataset" ? "publicationRevision" : "worldRotationQuaternion";
    let value = target[key],
      shouldFail = true;
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set(nextValue) {
        value = nextValue;
        if (shouldFail) {
          shouldFail = false;
          throw new Error(`controlled ${boundary} publication failure`);
        }
      }
    });
  }
  if (boundary === "water") {
    // Fail inside the real Loader/Host commit, after its runtime changed visibility.
    next.preparedWater = await f.water.prepare(f.plan(2));
    f.state.failVisibility = true;
  }
  try {
    await expect(f.publish(2, async () => next)).rejects.toThrow();
    f.assertScene(1);
    expect(f.owner.current).toBe(previous);
    expect(f.water.getDiagnostics().hostRevision).toBe(previousWaterRevision);
    expect(f.state.visibility.get(1)).toBe(true);
    expect(f.state.visibility.has(2)).toBe(false);
    expect(f.canvas.dataset).toEqual(previousMetadata);
    expect(f.camera.entity.transform.worldPosition).toEqual(previousPosition);
    expect(f.camera.entity.transform.worldRotationQuaternion).toEqual(previousRotation);
    expect([f.orbit.target.x, f.orbit.target.y, f.orbit.target.z]).toEqual([
      previousOrbitTarget.x,
      previousOrbitTarget.y,
      previousOrbitTarget.z
    ]);
    expect((player as any).seed).toBe(1);
    expect((player as any).state).toBe(previousPlayer);
    expect(bridgeOwner).toBe(previous.solids);
    expect(next.world.destroy).toHaveBeenCalledOnce();
    expect(next.solids.dispose).toHaveBeenCalledOnce();
    await f.publish(3);
    f.assertScene(3);
  } finally {
    await player.dispose();
  }
});

it("reports rollback failures while still restoring the other owners and releasing the candidate", async () => {
  const f = fixture();
  await f.publish(1);
  const next = f.candidate(2);
  next.solids.rollbackCommit = () => {
    throw Error("bridge rollback failed");
  };
  const original = f.audio.publishWorld.bind(f.audio);
  vi.spyOn(f.audio, "publishWorld").mockImplementationOnce((prepared) => {
    original(prepared);
    throw Error("audio publish failed");
  });
  let error: unknown;
  try {
    await f.publish(2, async () => next);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors.map(String)).toEqual([
    "Error: audio publish failed",
    "Error: bridge rollback failed"
  ]);
  f.assertScene(1);
  expect(next.world.destroy).toHaveBeenCalledOnce();
});

it("keeps accepted publication when a lifecycle notification fails and continues activation and retirement", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!;
  const next = f.candidate(2);
  next.playerState = {
    commit() {},
    rollback() {},
    finalize() {
      throw Error("player retirement notification failed");
    }
  };
  await f.publish(2, async () => next);
  f.assertScene(2);
  expect(previous.world.root.isActive).toBe(false);
  await vi.waitFor(() => expect(previous.world.destroy).toHaveBeenCalledOnce());
  expect(f.owner.getDiagnostics().cleanupErrors).toContain("Error: player retirement notification failed");
});

it("continues candidate resource cleanup if Water rollback reports a failure", async () => {
  const f = fixture();
  await f.publish(1);
  const next = f.candidate(2),
    water = await f.water.prepare(f.plan(2));
  next.preparedWater = {
    ...water,
    rollback: async () => {
      await water.rollback();
      throw Error("Water cleanup failed");
    }
  };
  const candidate = await f.owner.prepare(f.plan(2), async () => next);
  await expect(candidate.discard()).rejects.toThrow("candidate cleanup failed");
  await candidate.discard();
  f.assertScene(1);
  expect(next.world.destroy).toHaveBeenCalledOnce();
  expect(next.vegetation.dispose).toHaveBeenCalledOnce();
});

function cleanupLeaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(cleanupLeaves) : [error];
}

it("releases every Planner candidate owner when its registered backend fails during rollback", async () => {
  const f = fixture();
  await f.publish(1);
  const target = f.water as unknown as { requests(plan: IslandPlan): any[] };
  const requests = target.requests.bind(target);
  target.requests = (plan) =>
    requests(plan).map((request) => ({
      ...request,
      bodyId: "candidate-river",
      instance: { ...request.instance, id: "candidate-river" }
    }));
  const resourceManager = f.water.system.engine.resourceManager as unknown as {
    _addReferResource(resource: unknown): void;
  };
  const allocations = vi.spyOn(resourceManager, "_addReferResource");
  const prepared = await f.water.prepare(f.plan(2));
  const resources = [
    ...new Set(
      allocations.mock.calls
        .map(([resource]) => resource)
        .filter(
          (resource): resource is WaterBodyResource | WaterLookResource | WaterQualityResource =>
            resource instanceof WaterBodyResource ||
            resource instanceof WaterLookResource ||
            resource instanceof WaterQualityResource
        )
    )
  ];
  const candidateRoot = f.water.system.entity.findByName("candidate-river")!;
  expect(candidateRoot).toBeTruthy();
  expect(resources.length).toBeGreaterThanOrEqual(3);
  const backendError = Error("registered backend rollback cleanup failed");
  f.state.destroyFailures.set(2, backendError);
  const resourceError = Error("candidate resource cleanup reported failure"),
    owned = resources[0]!;
  const destroyOwned = owned.destroy.bind(owned);
  vi.spyOn(owned, "destroy").mockImplementationOnce(() => {
    destroyOwned();
    throw resourceError;
  });
  let failure: unknown;
  try {
    await prepared.rollback();
  } catch (error) {
    failure = error;
  }
  expect(cleanupLeaves(failure)).toEqual([backendError, resourceError]);
  expect(candidateRoot.destroyed).toBe(true);
  expect(resources.every((resource) => resource.destroyed)).toBe(true);
  f.assertScene(1);
  f.state.destroyFailures.clear();
});

it("drains Native and Planner owners after a real Host backend-destruction failure", async () => {
  const f = fixture();
  await f.publish(1);
  const bodies = [...f.water.system.bodies];
  const resources = bodies.flatMap((body) => [
    body.configuration!.asset,
    body.configuration!.look,
    body.configuration!.quality
  ]);
  const plannerRoot = f.water.system.entity;
  const native = f.water.system as unknown as { _runtimeRoot: Entity; _textures?: Promise<OceanTextureLibrary> };
  const runtimeRoot = native._runtimeRoot;
  // GPU loading is already substituted by this fixture. Install its owned result
  // without replacing Host/Loader disposal, which must reach the registered test backend.
  const textures = { destroy: vi.fn() };
  native._textures = Promise.resolve(textures as unknown as OceanTextureLibrary);
  const backendError = Error("registered backend shutdown cleanup failed");
  f.state.destroyFailures.set(1, backendError);
  let failure: unknown;
  try {
    await f.owner.destroy();
  } catch (error) {
    failure = error;
  }
  // This test explicitly owns and verifies the rejected, memoized shutdown.
  fixtures.splice(fixtures.indexOf(f), 1);
  expect(cleanupLeaves(failure)).toContain(backendError);
  expect(runtimeRoot.destroyed).toBe(true);
  expect(plannerRoot.destroyed).toBe(true);
  expect(textures.destroy).toHaveBeenCalledOnce();
  expect(resources.every((resource) => resource.destroyed)).toBe(true);
  expect(bodies.every((body) => body.destroyed)).toBe(true);
  expect(f.water.system.bodies).toHaveLength(0);
  expect(f.host.getDiagnostics()).toMatchObject({ activeBodyCount: 0, world: { registeredBodyCount: 0 } });
});

it("starts building presentation only at accepted scene publication", async () => {
  const f = fixture();
  const first = f.candidate(1);
  first.masonry = {
    commitPublication: vi.fn(),
    rollbackPublication: vi.fn(),
    activate: vi.fn(),
    destroy: vi.fn(async () => {})
  };
  await f.publish(1, async () => first);
  expect(first.masonry.activate).toHaveBeenCalledExactlyOnceWith();
  const rejected = f.candidate(2);
  rejected.masonry = {
    commitPublication: vi.fn(),
    rollbackPublication: vi.fn(),
    activate: vi.fn(),
    destroy: vi.fn(async () => {})
  };
  rejected.solids.commit = () => {
    throw Error("controlled failed publication");
  };
  await expect(f.publish(2, async () => rejected)).rejects.toThrow("controlled failed publication");
  expect(rejected.masonry.activate).not.toHaveBeenCalled();
  expect(first.masonry.activate).toHaveBeenCalledTimes(1);
  const next = f.candidate(3);
  let observed: unknown[] = [];
  next.masonry = {
    commitPublication: vi.fn(),
    rollbackPublication: vi.fn(),
    activate: vi.fn(() => {
      observed = [f.owner.current?.masonry, next.world.root.isActive];
    }),
    destroy: vi.fn(async () => {})
  };
  await f.publish(3, async () => next);
  expect(next.masonry.activate).toHaveBeenCalledTimes(1);
  expect(observed).toEqual([next.masonry, false]);
  expect(next.world.root.isActive).toBe(true);
});

const simpleFill = {
  bodyId: "river",
  appearance: false,
  surface: true,
  edit: { mode: "simple" as const, affectTerrain: false, rebuildShoreVegetation: false }
};

it.each(["surface", "appearance"] as const)(
  "keeps subject measurements current after a simple %s publication",
  async (effect) => {
    const f = fixture();
    let activeRevision = 10;
    await f.publish(1, async () => ({ ...f.candidate(1), authoringRevision: activeRevision }));
    vi.spyOn(f.port, "readAuthoringSnapshot").mockImplementation(() => ({
      activeRevision,
      draftRevision: activeRevision,
      authoringStateHash: String(activeRevision),
      resources: [],
      removedObjectIds: []
    }));
    // The Demo tags retained masonry queries with the accepted scene's authoring revision.
    vi.spyOn(f.port, "querySubjectSegments").mockImplementation((segments) => ({
      publicationRevision: f.owner.current!.authoringRevision,
      hits: segments.map(() => null)
    }));
    vi.spyOn(f.port, "querySubjectCapsules").mockImplementation((capsules) => ({
      publicationRevision: f.owner.current!.authoringRevision,
      hits: capsules.map(() => null)
    }));
    const application = new SeedWorldAgentApplication(f.port);
    const segment: SeedWorldSurfaceSegment = { start: [0, 0, 0], end: [1, 0, 0] };
    const assertCurrent = () => {
      expect(application.querySubjectSegments([segment])).toMatchObject({
        available: true,
        geometryState: "current",
        samples: [null]
      });
      expect(application.querySubjectCapsules([{ ...segment, radius: 0.2 }])).toMatchObject({
        available: true,
        geometryState: "current",
        samples: [null]
      });
    };
    const update = { ...simpleFill, surface: effect === "surface", appearance: effect === "appearance" };
    const plan = f.plan(effect === "surface" ? 2 : 1);
    const previous = f.owner.current!;
    const controller = new AbortController();
    const cancelled = await f.owner.prepareWater(plan, update, controller.signal, 11);
    controller.abort();
    expect(() => cancelled.commit()).toThrow();
    await cancelled.discard();
    expect(f.owner.current).toBe(previous);
    assertCurrent();
    const candidate = await f.owner.prepareWater(plan, update, undefined, 11);
    expect(f.owner.current).toBe(previous);
    assertCurrent();
    candidate.commit();
    activeRevision = 11;
    assertCurrent();
    expect(f.owner.current!.authoringRevision).toBe(activeRevision);
    for (const key of ["world", "data", "masonry", "solids", "vegetation"] as const)
      expect(f.owner.current![key]).toBe(previous[key]);
    // The guard still rejects a genuinely mismatched author version.
    activeRevision = 12;
    expect(application.querySubjectSegments([segment])).toMatchObject({
      available: false,
      geometryState: "stale",
      samples: []
    });
  }
);

it("publishes water and contact queries while retaining terrain, vegetation, solids, navigation and camera", async () => {
  const f = fixture();
  await f.publish(1);
  const before = f.owner.current!,
    position = f.camera.entity.transform.worldPosition.clone();
  const batch = vi.spyOn(f.water.system, "prepareBatch");
  const staged = await f.owner.prepareWater(f.plan(2), simpleFill);
  expect(f.water.querySurface(5, 10).surfaceElevationMetres).toBe(3);
  expect(f.owner.current).toBe(before);
  staged.commit();
  const after = f.owner.current!;
  for (const key of ["world", "data", "vegetation", "solids", "navigation"] as const)
    expect(after[key]).toBe(before[key]);
  expect(before.world.destroy).not.toHaveBeenCalled();
  expect(f.water.querySurface(5, 10).surfaceElevationMetres).toBe(4);
  expect(after.navigation.sampleContactIsWater(5, 10)).toBe(true);
  expect(f.camera.entity.transform.worldPosition).toEqual(position);
  expect(batch).toHaveBeenCalledTimes(1);
  await staged.discard();
});

it("water preparation failure, cancellation and commit failure leave the accepted world and queries intact", async () => {
  const f = fixture();
  await f.publish(1);
  const before = f.owner.current!;
  f.state.fail = true;
  await expect(f.owner.prepareWater(f.plan(2), simpleFill)).rejects.toThrow("Water prepare failed");
  expect(f.owner.current).toBe(before);
  f.assertScene(1);
  f.state.fail = false;
  const controller = new AbortController();
  const aborted = await f.owner.prepareWater(f.plan(2), simpleFill, controller.signal);
  controller.abort();
  expect(() => aborted.commit()).toThrow();
  await aborted.discard();
  expect(f.owner.current).toBe(before);
  f.assertScene(1);
  const failure = await f.owner.prepareWater(f.plan(3), simpleFill);
  f.state.failVisibility = true;
  expect(() => failure.commit()).toThrow();
  await failure.discard();
  expect(f.owner.current).toBe(before);
  f.assertScene(1);
});

it("colour-only publication reuses physical and quality resources through the real Host batch", async () => {
  const f = fixture();
  const target = f.water as unknown as { requests(plan: IslandPlan): WaterSceneBodyRequest[] };
  const requests = target.requests.bind(target);
  let colour: [number, number, number] | undefined;
  Object.assign(f.water, {
    requests: (plan: IslandPlan) =>
      requests(plan).map((request) => ({
        ...request,
        instance: {
          ...request.instance,
          lookPresetId: f.water.system.runtimeHost.registerAuthoring((assets) =>
            registerPlanningWaterColor(assets, request.bodyId, request.instance.lookPresetId, colour)
          )
        }
      }))
  });
  await f.publish(1);
  const before = f.water.system.bodies[0].configuration!;
  const destroyAsset = vi.spyOn(before.asset, "destroy"),
    destroyQuality = vi.spyOn(before.quality, "destroy");
  colour = [26, 179, 51];
  const staged = await f.owner.prepareWater(f.plan(1), { ...simpleFill, appearance: true, surface: false });
  expect(f.water.system.bodies[0].configuration).toBe(before);
  staged.commit();
  await Promise.resolve();
  const after = f.water.system.bodies[0].configuration!;
  expect(after.asset).toBe(before.asset);
  expect(after.quality).toBe(before.quality);
  expect(after.look).not.toBe(before.look);
  expect(destroyAsset).not.toHaveBeenCalled();
  expect(destroyQuality).not.toHaveBeenCalled();
});

it("publishes complex local terrain with retained native owners, new navigation/audio and Water as final boundary", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!,
    data = f.candidate(2).data;
  const events: string[] = [];
  let terrain = 1;
  const update = {
    commit: () => {
      terrain = 2;
      events.push("terrain");
    },
    rollback: () => {
      terrain = 1;
      events.push("rollback");
    },
    discard: vi.fn(),
    finalize: vi.fn()
  };
  const original = f.water.prepare.bind(f.water);
  vi.spyOn(f.water, "prepare").mockImplementation(async (...args) => {
    const water = await original(...args);
    return {
      ...water,
      commit: () => {
        expect(terrain).toBe(2);
        events.push("water");
        return water.commit();
      }
    };
  });
  const candidate = await f.owner.prepareWaterImpact(f.plan(2), async () => ({
    data,
    updates: [update],
    bounds: { minimumX: 0, minimumZ: 0, maximumX: 100, maximumZ: 100 },
    preparationMs: 0
  }));
  expect(f.owner.current).toBe(previous);
  expect(terrain).toBe(1);
  const next = candidate.commit();
  expect(events).toEqual(["terrain", "water"]);
  for (const key of ["world", "solids", "masonry", "vegetation", "playerBookmark"] as const)
    expect(next[key]).toBe(previous[key]);
  expect(next.data).toBe(data);
  expect(next.navigation).not.toBe(previous.navigation);
  f.assertScene(2);
  await vi.waitFor(() => expect(update.finalize).toHaveBeenCalledOnce());
  expect(previous.world.destroy).not.toHaveBeenCalled();
});
it.each(["terrain", "water"])("restores the entire complex scene when %s mutates then throws", async (stage) => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!,
    data = f.candidate(2).data;
  let terrain = 1;
  const update = {
    commit: () => {
      terrain = 2;
      if (stage === "terrain") throw Error("local failure");
    },
    rollback: () => {
      terrain = 1;
    },
    discard: vi.fn(),
    finalize: vi.fn()
  };
  const candidate = await f.owner.prepareWaterImpact(f.plan(2), async () => ({
    data,
    updates: [update],
    bounds: { minimumX: 0, minimumZ: 0, maximumX: 100, maximumZ: 100 },
    preparationMs: 0
  }));
  if (stage === "water") f.state.failVisibility = true;
  expect(() => candidate.commit()).toThrow();
  expect(terrain).toBe(1);
  expect(f.owner.current).toBe(previous);
  f.assertScene(1);
  f.state.failVisibility = false;
  await candidate.discard();
  expect(update.discard).toHaveBeenCalledOnce();
  expect(update.finalize).not.toHaveBeenCalled();
});
it("cancels prepared local updates and rejects stale publication without touching accepted owners", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current!;
  const controller = new AbortController(),
    update = { commit: vi.fn(), rollback: vi.fn(), discard: vi.fn(), finalize: vi.fn() };
  const frame = () => ({
    data: previous.data,
    updates: [update],
    bounds: { minimumX: 0, minimumZ: 0, maximumX: 1, maximumZ: 1 },
    preparationMs: 0
  });
  const cancelled = await f.owner.prepareWaterImpact(f.plan(2), async () => frame(), controller.signal);
  controller.abort();
  expect(() => cancelled.commit()).toThrow();
  await cancelled.discard();
  const stale = await f.owner.prepareWaterImpact(f.plan(2), async () => frame());
  await f.publish(3);
  expect(() => stale.commit()).toThrow();
  await stale.discard();
  expect(update.commit).not.toHaveBeenCalled();
  expect(update.discard).toHaveBeenCalledTimes(2);
  f.assertScene(3);
});

it("commits native buildings before Water and rolls them back if Water rejects publication", async () => {
  const f = fixture();
  await f.publish(1);
  const previous = f.owner.current;
  const next = f.candidate(2);
  let geometry = "previous";
  const system = { visible: false, destroy: vi.fn() };
  const prepared = {
    assertCurrent: vi.fn(),
    commit: vi.fn(() => {
      geometry = "candidate";
    }),
    rollback: vi.fn(() => {
      geometry = "previous";
    }),
    finalize: vi.fn(),
    discard: vi.fn()
  };
  const accept = vi.fn();
  next.masonry = new NativeBuildingWorld(system as any, prepared as any, accept, () => false);
  const staged = await f.owner.prepare(f.plan(2), async () => next);
  f.state.failVisibility = true;
  expect(() => staged.commit()).toThrow();
  expect(prepared.commit).toHaveBeenCalledOnce();
  expect(prepared.rollback).toHaveBeenCalledOnce();
  expect(geometry).toBe("previous");
  expect(system.visible).toBe(false);
  expect(f.owner.current).toBe(previous);
  expect(accept).not.toHaveBeenCalled();
  expect(prepared.finalize).not.toHaveBeenCalled();
  f.state.failVisibility = false;
  await staged.discard();
  expect(prepared.discard).toHaveBeenCalledOnce();
  expect(system.destroy).not.toHaveBeenCalled();
});

it("retires world handles without destroying native buildings or leaving old pick owners active", async () => {
  const f = fixture(),
    order: string[] = [];
  let current: NativeBuildingWorld | undefined;
  const system = { visible: false, visitPickBatches: vi.fn(), destroy: vi.fn() };
  const prepare = (height: number) => {
    const candidate = f.candidate(height);
    const frame = {
      assertCurrent: vi.fn(),
      commit: () => order.push(`geometry-${height}`),
      rollback: vi.fn(),
      finalize: () => {
        expect(f.owner.current?.masonry).toBe(candidate.masonry);
        order.push(`finalize-${height}`);
      },
      discard: vi.fn()
    };
    const handle: NativeBuildingWorld = new NativeBuildingWorld(
      system as any,
      frame as any,
      () => {
        current = handle;
      },
      () => current === handle
    );
    candidate.masonry = handle;
    return { candidate, handle, frame };
  };
  const first = prepare(1);
  await f.publish(1, async () => first.candidate);
  const visit = vi.fn();
  first.handle.visitPickBatches(visit);
  expect(system.visitPickBatches).toHaveBeenCalledExactlyOnceWith(visit);
  const second = prepare(2);
  await f.publish(2, async () => second.candidate);
  await first.handle.destroy(); // Idempotent retirement, as during scene cleanup.
  expect(order).toEqual(["geometry-1", "finalize-1", "geometry-2", "finalize-2"]);
  system.visitPickBatches.mockClear();
  first.handle.visitPickBatches(visit);
  expect(system.visitPickBatches).not.toHaveBeenCalled();
  second.handle.visitPickBatches(visit);
  expect(system.visitPickBatches).toHaveBeenCalledExactlyOnceWith(visit);
  expect(system.visible).toBe(true);
  expect(first.frame.discard).not.toHaveBeenCalled();
  expect(second.frame.discard).not.toHaveBeenCalled();
  expect(system.destroy).not.toHaveBeenCalled();
});

it.each(["accept", "discard", "rock-failure", "abort"] as const)(
  "keeps native building support ownership atomic across rock %s",
  async (mode) => {
    const f = fixture();
    await f.publish(1);
    const published = f.owner.current!,
      source = published as any;
    const original = {
      revision: 1,
      grid: {
        samples: new Uint16Array(4),
        resolution: 2,
        origin: [0, 0] as [number, number],
        size: 100,
        decode: { offset: 0, scale: 1 },
        supports: []
      }
    };
    let terrain: unknown = original,
      next: unknown;
    const candidate = {
      metrics: { buildingSupportsUpdated: 1 },
      assertCurrent: vi.fn(),
      commit: vi.fn(() => {
        terrain = next;
      }),
      rollback: vi.fn(() => {
        terrain = original;
      }),
      finalize: vi.fn(),
      discard: vi.fn()
    };
    const system = {
      visible: true,
      terrainSource: original,
      prepareTerrain: vi.fn(async (value) => {
        next = value;
        return candidate;
      }),
      destroy: vi.fn()
    };
    source.masonry = new NativeBuildingWorld(
      system as any,
      { discard: vi.fn() } as any,
      () => {},
      () => true
    );
    const rocks = {
      metrics: {},
      discard: vi.fn(),
      commit: vi.fn(() => {
        if (mode === "rock-failure") throw Error("controlled rock replacement failure");
      })
    };
    const grass = { metrics: {}, commit: vi.fn(), discard: vi.fn() };
    source.solids.prepareRocks = vi.fn(() => rocks);
    source.world.population.prepareRockGrass = vi.fn(() => grass);
    source.vegetation.prepareRocks = vi.fn(async () => ({ commit: vi.fn(), discard: vi.fn() }));
    const controller = new AbortController();
    const mesh = {
      id: "rock",
      origin: [10, 3, 20],
      owners: ["rock"],
      mesh: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
        indices: new Uint32Array([0, 2, 1])
      }
    };
    const frame = await prepareRockFormationPublication(
      published,
      published.plan,
      [mesh] as any,
      {} as any,
      {} as any,
      2,
      controller.signal
    );
    expect(terrain).toBe(original);
    expect(candidate.commit).not.toHaveBeenCalled();
    expect((next as any).grid.samples).toBe(original.grid.samples);
    expect(Array.from((next as any).grid.supports[0].positions)).toEqual([10, 3, 20, 11, 3, 20, 10, 3, 21]);
    expect(original.grid.supports).toEqual([]);
    if (mode === "accept") {
      frame.commit();
      expect(terrain).toBe(next);
      expect(candidate.finalize).toHaveBeenCalledOnce();
      expect(candidate.rollback).not.toHaveBeenCalled();
      expect(grass.commit).toHaveBeenCalledOnce();
    } else {
      if (mode === "abort") controller.abort();
      if (mode !== "discard") expect(() => frame.commit()).toThrow();
      frame.discard();
      expect(terrain).toBe(original);
      expect(candidate.finalize).not.toHaveBeenCalled();
      expect(candidate.discard).toHaveBeenCalledOnce();
      expect(grass.commit).not.toHaveBeenCalled();
      if (mode === "rock-failure") expect(candidate.rollback).toHaveBeenCalledOnce();
      else expect(candidate.commit).not.toHaveBeenCalled();
    }
    expect(system.destroy).not.toHaveBeenCalled();
  }
);
