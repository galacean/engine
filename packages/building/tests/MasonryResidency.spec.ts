import { describe, expect, it, vi } from "vitest";
import { MasonryLodProbe, getMasonryResidencyBudget } from "../src/building/runtime/MasonryLodPolicy";
import { MasonryLodTransition } from "../src/building/runtime/MasonryLodTransition";
import { EngineResidentScene } from "../src/building/runtime/EngineResidentScene";
import {
  MasonryResidency,
  createMasonryResidencyMetrics,
  type MasonryResidencyEntry
} from "../src/building/runtime/MasonryResidency";

function makeEntry(
  id: number,
  zDist: number,
  opts: { residentBytes?: number; loaded?: boolean; x?: number } = {}
): MasonryResidencyEntry & {
  id: number;
  farProxyActive: boolean;
  visualVisible: boolean;
  releaseCalls: number;
  releaseWhenFarProxyActive: boolean[];
  setLodStatesMock: ReturnType<typeof vi.fn>;
} {
  const { residentBytes = 1024, loaded = true, x = 0 } = opts;
  const probe = new MasonryLodProbe({ min: [-5, 0, -5], max: [5, 10, 5] }, [x, 0, -zDist]);
  const setLodStatesMock = vi.fn();
  const root = { isActive: false };
  const entry: MasonryResidencyEntry & {
    id: number;
    farProxyActive: boolean;
    visualVisible: boolean;
    releaseCalls: number;
    releaseWhenFarProxyActive: boolean[];
    setLodStatesMock: ReturnType<typeof vi.fn>;
  } = {
    id,
    farProxyActive: false,
    visualVisible: false,
    releaseCalls: 0,
    releaseWhenFarProxyActive: [],
    setLodStatesMock,
    fine: loaded
      ? {
          runtime: {
            root,
            metrics: {
              residentBytes,
              lodUploadBytes: 0,
              lodSelectionMs: 0,
              lod: 1,
              triangles: 10_000,
              fullTriangles: 150_000,
              mediumTriangles: 25_000,
              fullCoverage: false
            },
            setLodStates: (states: readonly { lodIndex: number; signedFade: number }[]) => {
              setLodStatesMock(states);
              const detail = states.filter((s) => s.lodIndex < 2);
              entry.fine!.runtime.metrics.fullCoverage = detail.some((s) => s.lodIndex === 0);
              entry.fine!.runtime.metrics.lod = (detail[detail.length - 1]?.lodIndex ?? 1) as 0 | 1;
            },
            setLodDebugTint: () => {}
          } as unknown as NonNullable<MasonryResidencyEntry["fine"]>["runtime"],
          destroy: () => {}
        }
      : undefined,
    view: {
      root: { isActive: true } as unknown as MasonryResidencyEntry["view"]["root"],
      recentlyRendered: true,
      setVisualVisible: (visible: boolean) => {
        entry.visualVisible = visible;
      },
      setFarProxyActive: (active: boolean) => {
        entry.farProxyActive = active;
      },
      releaseDetailedVisual: () => {
        entry.releaseCalls++;
        entry.releaseWhenFarProxyActive.push(entry.farProxyActive);
      },
      setFade: () => {}
    },
    lod: 2,
    transition: new MasonryLodTransition(),
    prefetch: false,
    probe,
    budgetLod: 2,
    lastUsed: 0,
    priority: 0,
    visible: false
  };
  return entry;
}

function makeFakeCameraAndEngine() {
  const engine = { canvas: { width: 2556, height: 1596 } } as unknown as ConstructorParameters<
    typeof MasonryResidency
  >[0];
  // Perspective camera at origin looking along -Z, FOV ~50 deg (projection[5] ~= 2.1445)
  const viewElements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projElements = new Float32Array([1.34, 0, 0, 0, 0, 2.1445, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]);
  const camera = {
    viewMatrix: { elements: viewElements },
    projectionMatrix: { elements: projElements },
    viewport: { x: 0, y: 0, z: 1, w: 1 },
    isOrthographic: false,
    nearClipPlane: 0.1,
    farClipPlane: 2000,
    entity: { transform: { worldPosition: { x: 0, y: 2, z: 0 } } }
  } as unknown as ConstructorParameters<typeof MasonryResidency>[1];
  return { engine, camera };
}

describe("MasonryResidency budget caps", () => {
  it("caps simultaneous LOD0 to maxFullBuildings and LOD0+LOD1 to maxDetailBuildings, routing overflow to far proxy", () => {
    const budget = getMasonryResidencyBudget();
    expect(budget.maxFullBuildings).toBe(1);
    expect(budget.maxDetailBuildings).toBe(6);

    const { engine, camera } = makeFakeCameraAndEngine();
    // 9 visible buildings in front of camera: 3 within LOD0 range (<26m), 6 within LOD1 range (30m..58m)
    const distances = [10, 15, 20, 30, 36, 42, 48, 53, 58];
    const entries = distances.map((d, idx) => makeEntry(idx, d));
    const metrics = createMasonryResidencyMetrics();
    const residency = new MasonryResidency(
      engine,
      camera,
      entries,
      metrics,
      () => {},
      () => {}
    );

    residency.updateDemand(0.016);
    residency.updatePresentation(1000);
    // Advance past crossfade/downgrade timer so transitions settle
    residency.updateDemand(2.0);
    residency.updatePresentation(3000);

    // Nearest building (id=0, 10m) gets LOD0
    expect(entries[0]!.budgetLod).toBe(0);
    // Next 5 buildings (ids 1..5) get LOD1 (even ids 1,2 that are within LOD0 distance are capped to LOD1)
    for (let i = 1; i < 6; i++) {
      expect(entries[i]!.budgetLod).toBe(1);
    }
    // Overflow buildings (ids 6..8) are capped to LOD2, excluded from desired, and routed to GlobalProxy
    expect(residency.desired.size).toBe(budget.maxDetailBuildings);
    for (let i = 6; i < entries.length; i++) {
      expect(residency.desired.has(entries[i]!)).toBe(false);
      expect(entries[i]!.budgetLod).toBe(2);
      expect(entries[i]!.farProxyActive).toBe(true);
    }
  });

  it("excludes unloaded overflow buildings from desired, routes them to FarProxy, and evicts visible capped residents during admit()", () => {
    const budget = getMasonryResidencyBudget();
    const { engine, camera } = makeFakeCameraAndEngine();
    const perBldgBytes = Math.ceil(budget.detailBytes / 12); // 14 loaded > detailBytes

    // 14 already-loaded buildings (ids 0..5 at 15..40m, ids 6..13 at 45..59m) + 1 closer unloaded building (id 14 at 10m)
    const entries = [
      ...[15, 20, 25, 30, 35, 40].map((d, idx) => makeEntry(idx, d, { residentBytes: perBldgBytes, loaded: true })),
      ...[45, 47, 49, 51, 53, 55, 57, 59].map((d, idx) =>
        makeEntry(idx + 6, d, { residentBytes: perBldgBytes, loaded: true })
      ),
      makeEntry(14, 10, { residentBytes: perBldgBytes, loaded: false }),
      makeEntry(15, 62, { residentBytes: perBldgBytes, loaded: false })
    ];

    const metrics = createMasonryResidencyMetrics();
    const residency = new MasonryResidency(
      engine,
      camera,
      entries,
      metrics,
      () => {},
      () => {}
    );

    residency.updateDemand(0.016);
    // Unloaded overflow building (id 15, 62m) must NOT enter desired and must route directly to FarProxy
    expect(residency.desired.size).toBe(budget.maxDetailBuildings);
    expect(residency.desired.has(entries[14]!)).toBe(true);
    expect(residency.desired.has(entries[15]!)).toBe(false);
    expect(entries[15]!.farProxyActive).toBe(true);

    // Settle transitions so ids 6..13 become inactive capped residents (budgetLod=2, root.isActive=false)
    residency.updatePresentation(1000);
    residency.updateDemand(2.0);
    residency.updatePresentation(3000);

    // Closest unloaded building (id 14) must be admitted by evicting inactive visible overflow buildings
    residency.refreshPriorities();
    expect(residency.admit(entries[14]!)).toBe(true);
    expect(metrics.residentBytes).toBeLessThanOrEqual(budget.detailBytes);
    expect(metrics.evictions).toBeGreaterThan(0);

    // Advancing past retainMs must evict any remaining inactive overflow residents
    residency.updatePresentation(3000 + budget.retainMs + 1000);
    for (let i = 6; i < 14; i++) {
      expect(entries[i]!.fine).toBeUndefined();
      expect(entries[i]!.farProxyActive).toBe(true);
    }
  });

  it("hands off the single LOD0 slot when walking closer to another visible LOD0 building without leaving the LOD0 band", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    // Place two buildings side-by-side at x=-6 and x=+6, z=-18m (both visible and inside LOD0 <26m)
    const entryA = makeEntry(0, 18, { x: -6 });
    const entryB = makeEntry(1, 18, { x: 6 });
    // Start closer to A (x=-4, z=0): distA ~= 18.1m, distB ~= 20.6m -> A wins LOD0, B gets LOD1
    camera.entity.transform.worldPosition.x = -4;
    camera.entity.transform.worldPosition.z = 0;

    const metrics = createMasonryResidencyMetrics();
    const residency = new MasonryResidency(
      engine,
      camera,
      [entryA, entryB],
      metrics,
      () => {},
      () => {}
    );

    residency.updateDemand(0.016);
    residency.updatePresentation(1000);
    residency.updateDemand(2.0);
    residency.updatePresentation(3000);

    expect(entryA.lod).toBe(0);
    expect(entryB.lod).toBe(0);
    expect(entryA.budgetLod).toBe(0);
    expect(entryB.budgetLod).toBe(1);

    // Walk right up to B (x=+6, z=-10 -> distB=8m, distA=14.4m; both STILL visible and STILL lod===0!)
    camera.entity.transform.worldPosition.x = 6;
    camera.entity.transform.worldPosition.z = -10;
    // Update view matrix translation to keep both buildings in front of the camera
    (camera.viewMatrix.elements as Float32Array)[12] = -6;
    (camera.viewMatrix.elements as Float32Array)[14] = 10;

    residency.updateDemand(0.016);
    residency.updatePresentation(3016);
    residency.updateDemand(2.0);
    residency.updatePresentation(5016);

    expect(entryA.lod).toBe(0);
    expect(entryB.lod).toBe(0);
    expect(entryA.visible).toBe(true);
    expect(entryB.visible).toBe(true);
    // B must now claim the single LOD0 slot and A must step down to LOD1
    expect(entryB.budgetLod).toBe(0);
    expect(entryA.budgetLod).toBe(1);
  });

  it("keeps hidden buildings inactive across cache evictions and camera moves when shown=false", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    const farState = { rootActive: true, farActive: false, visualVisible: false };
    const nearState = { rootActive: true, farActive: false, visualVisible: false };
    const farCached = makeEntry(1, 400, { loaded: true });
    farCached.visible = true;
    farCached.view = {
      root: {
        get isActive() { return farState.rootActive; },
        set isActive(v: boolean) { farState.rootActive = v; }
      } as unknown as MasonryResidencyEntry["view"]["root"],
      recentlyRendered: true,
      setVisualVisible: (v: boolean) => { farState.visualVisible = v; },
      setFarProxyActive: (v: boolean) => { farState.farActive = v; },
      setFade: () => {}
    };
    const coarseNearby = makeEntry(2, 30, { loaded: false });
    coarseNearby.visible = true;
    coarseNearby.view = {
      root: {
        get isActive() { return nearState.rootActive; },
        set isActive(v: boolean) { nearState.rootActive = v; }
      } as unknown as MasonryResidencyEntry["view"]["root"],
      recentlyRendered: true,
      setVisualVisible: (v: boolean) => { nearState.visualVisible = v; },
      setFarProxyActive: (v: boolean) => { nearState.farActive = v; },
      setFade: () => {}
    };

    const residency = new MasonryResidency(
      engine,
      camera,
      [farCached, coarseNearby],
      createMasonryResidencyMetrics(),
      () => {},
      () => {}
    );
    residency.updateDemand(0.016);
    // Advance past retainMs (60_000) while shown=false to trigger evict(farCached)
    residency.updatePresentation(100_000, false);
    expect(farCached.fine).toBeUndefined();
    expect(farState.rootActive).toBe(false);
    expect(farState.farActive).toBe(false);
    expect(farState.visualVisible).toBe(false);

    // Move camera while shown=false: selectLod() must not reactivate coarse visuals
    camera.viewMatrix.elements[12] = 0.5;
    residency.updateDemand(0.016);
    expect(nearState.visualVisible).toBe(false);
    expect(nearState.farActive).toBe(false);

    // Repeated hidden publishes must not fabricate synthetic cacheHits while runtime.root stays inactive.
    const metrics = (residency as unknown as { metrics: { cacheHits: number } }).metrics;
    metrics.cacheHits = 0;
    const fineVisible = makeEntry(3, 12, { loaded: true });
    fineVisible.lod = 0;
    fineVisible.visible = true;
    residency.entries.push(fineVisible);
    residency.publishResidency(100_008, false);
    residency.publishResidency(100_012, false);
    expect(metrics.cacheHits).toBe(0);

    // Re-enabling shown=true activates the visible fine resident and records one cache hit.
    residency.updatePresentation(100_016, true);
    expect(metrics.cacheHits).toBe(1);
    expect(farState.rootActive).toBe(true);
    expect(farState.farActive).toBe(true);
    expect(farState.visualVisible).toBe(true);
  });

  it("never releases LOD1 on entering LOD0 and only releases at lod === 2 after farProxy is activated", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    const nearEntry = makeEntry(0, 12, { loaded: true });
    const farEntry = makeEntry(1, 250, { loaded: false });
    const metrics = createMasonryResidencyMetrics();
    const residency = new MasonryResidency(
      engine,
      camera,
      [nearEntry, farEntry],
      metrics,
      () => {},
      () => {}
    );

    residency.updateDemand(0.016);
    residency.updatePresentation(1000);
    residency.updateDemand(2.0);
    residency.updatePresentation(3000);

    // Entering and settling at LOD0 must keep LOD1 views re-hydratable, not strip them.
    expect(nearEntry.budgetLod).toBe(0);
    expect(nearEntry.releaseCalls).toBe(0);

    // Distant LOD2 entry has releaseDetailedVisual called at lod === 2 with farProxyActive already true.
    expect(farEntry.lod).toBe(2);
    expect(farEntry.releaseCalls).toBeGreaterThan(0);
    expect(farEntry.releaseWhenFarProxyActive.every(Boolean)).toBe(true);
  });

  it("keeps farProxy active while waiting for async fine load and during coarse<->fine crossfades, falling back only on error", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    const loadingEntry = makeEntry(0, 35, { loaded: false });
    const crossfadeEntry = makeEntry(1, 35, { loaded: true });
    const metrics = createMasonryResidencyMetrics();
    const residency = new MasonryResidency(
      engine,
      camera,
      [loadingEntry, crossfadeEntry],
      metrics,
      () => {},
      () => {}
    );

    // Walking into LOD1 range while fine is still loading must keep farProxy active (no throwaway detailed build).
    residency.updateDemand(0.016);
    expect(loadingEntry.lod).toBe(1);
    expect(residency.desired.has(loadingEntry)).toBe(true);
    expect(loadingEntry.farProxyActive).toBe(true);

    // Mid-crossfade (coarse + fine both visible): farProxy stays active so GlobalProxy dithers directly against fine.
    residency.updatePresentation(1000);
    residency.updateDemand(0.2);
    residency.updatePresentation(1200);
    expect(crossfadeEntry.coarseVisible).toBe(true);
    expect(crossfadeEntry.farProxyActive).toBe(true);

    // If fine fails to load (error set), fall back to detailed distance view (farProxyActive=false).
    loadingEntry.error = "compile failed";
    residency.invalidate();
    residency.updatePresentation(1216);
    expect(loadingEntry.farProxyActive).toBe(false);

    // Retreating to LOD2 must restore farProxyActive=true and allow releaseDetailedVisual() even with e.error set.
    camera.entity.transform.worldPosition = { x: 0, y: 2, z: 265 } as never;
    camera.viewMatrix.elements[14] = -265;
    residency.invalidate();
    residency.updateDemand(0.016);
    expect(loadingEntry.lod).toBe(2);
    expect(loadingEntry.farProxyActive).toBe(true);
    expect(loadingEntry.releaseCalls).toBeGreaterThan(0);
    expect(loadingEntry.releaseWhenFarProxyActive.every(Boolean)).toBe(true);
  });

  it("hides visualVisible before changing farProxyActive so coarse hide never flashes detailed views", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    const events: string[] = [];
    const entry = makeEntry(0, 300, { loaded: false });
    const origSetVisualVisible = entry.view.setVisualVisible;
    const origSetFarProxyActive = entry.view.setFarProxyActive!;
    entry.view.setVisualVisible = (v: boolean) => {
      events.push(`vis:${v}`);
      origSetVisualVisible(v);
    };
    entry.view.setFarProxyActive = (a: boolean) => {
      events.push(`far:${a}`);
      origSetFarProxyActive(a);
    };

    const residency = new MasonryResidency(engine, camera, [entry], createMasonryResidencyMetrics(), () => {}, () => {});
    residency.updateDemand(0.016);
    residency.updatePresentation(1000, true);
    expect(entry.visualVisible).toBe(true);
    expect(entry.farProxyActive).toBe(true);

    events.length = 0;
    // Move view frustum offscreen horizontally so visible flips true -> false
    camera.viewMatrix.elements[12] = 5000;
    residency.invalidate();
    residency.updateDemand(0.016);
    expect(entry.visualVisible).toBe(false);
    expect(entry.farProxyActive).toBe(false);
    expect(events).toEqual(["vis:false", "far:false"]);
  });

  it("keeps evicted nodes hidden when publishResidency(now, false) is called directly", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    const entry = makeEntry(0, 200, { loaded: true });
    const residency = new MasonryResidency(engine, camera, [entry], createMasonryResidencyMetrics(), () => {}, () => {});

    entry.lod = 2;
    entry.visible = true;
    entry.lastUsed = 0;
    residency.publishResidency(1_000_000, false);

    expect(entry.fine).toBeUndefined();
    expect(entry.view.root.isActive).toBe(false);
    expect(entry.visualVisible).toBe(false);
    expect(entry.farProxyActive).toBe(false);
  });

  it("synchronizes shown in updateDemand(dt, shown) so hiding never toggles coarse visuals on then off", () => {
    const { engine, camera } = makeFakeCameraAndEngine();
    const events: string[] = [];
    const entry = makeEntry(0, 200, { loaded: false });
    const origSetVisualVisible = entry.view.setVisualVisible;
    const origSetFarProxyActive = entry.view.setFarProxyActive!;
    entry.view.setVisualVisible = (v: boolean) => {
      events.push(`vis:${v}`);
      origSetVisualVisible(v);
    };
    entry.view.setFarProxyActive = (a: boolean) => {
      events.push(`far:${a}`);
      origSetFarProxyActive(a);
    };

    const residency = new MasonryResidency(engine, camera, [entry], createMasonryResidencyMetrics(), () => {}, () => {});
    residency.updateDemand(0.016, true);
    residency.updatePresentation(500, true);
    expect(entry.visualVisible).toBe(true);
    expect(entry.farProxyActive).toBe(true);

    events.length = 0;
    residency.updateDemand(0.016, false);
    residency.updatePresentation(1000, false);
    expect(entry.visualVisible).toBe(false);
    expect(entry.farProxyActive).toBe(false);
    expect(events).not.toContain("vis:true");
    expect(events).not.toContain("far:true");
    expect(events).toEqual(["vis:false", "far:false"]);
  });
});

describe("EngineResidentScene.setLodStates unit-LOD clamping (B2)", () => {
  it("forces unitLod to low representation (forced=1) when building is at LOD1 and restores screen-space selection (-1) at LOD0", () => {
    const fakeParent = { createChild: () => ({ transform: { position: { y: 0 } } }) };
    const scene = new EngineResidentScene({} as never, fakeParent as never);
    const makeRenderer = () => ({
      enabled: false,
      mesh: null as unknown,
      shaderData: {
        setFloat: vi.fn(),
        setVector4: vi.fn(),
        enableMacro: vi.fn(),
        disableMacro: vi.fn()
      }
    });
    const highMesh = { instanceCount: 100, subMesh: { count: 900 } };
    const lowMesh = { instanceCount: 100, subMesh: { count: 132 } };
    const unitLod = {
      selector: { highCount: 40, lowCount: 60, hasHighFade: false, hasLowFade: false, selection: { length: 100 } },
      lists: [],
      words: [],
      fades: [],
      forced: -1,
      active: true,
      lodFade: 1
    };
    scene.draws.set("brick-0", {
      renderer: makeRenderer() as never,
      lodRenderer: makeRenderer() as never,
      enabled: true,
      mesh: highMesh as never,
      meshes: [highMesh as never, lowMesh as never],
      material: {} as never,
      unitLod: unitLod as never,
      resources: new Map()
    });

    // LOD1 building: must clamp unitLod.forced = 1 so 300-tri bricks cannot leak into LOD1 buildings
    scene.setLodStates([{ lodIndex: 1, signedFade: 1 }]);
    expect(scene.metrics.fullCoverage).toBe(false);
    expect(unitLod.forced).toBe(1);

    // LOD0 building: must restore screen-space unit selection (forced = -1)
    scene.setLodStates([{ lodIndex: 0, signedFade: 1 }]);
    expect(scene.metrics.fullCoverage).toBe(true);
    expect(unitLod.forced).toBe(-1);

    // Crossfade LOD0 -> LOD1 keeps fullCoverage=true (forced=-1) until fade completes to pure LOD1 (forced=1)
    scene.setLodStates([
      { lodIndex: 0, signedFade: 0.4 },
      { lodIndex: 1, signedFade: -0.6 }
    ]);
    expect(scene.metrics.fullCoverage).toBe(true);
    expect(unitLod.forced).toBe(-1);

    scene.setLodStates([{ lodIndex: 1, signedFade: 1 }]);
    expect(scene.metrics.fullCoverage).toBe(false);
    expect(unitLod.forced).toBe(1);
  });
});
