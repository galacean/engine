import { expect, it, vi } from "vitest";
import { BoundingBox, Matrix, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { FarmingWorldPresentation } from "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation";
import { FarmingItemInteraction } from "@galacean/engine-farming/farming/application/FarmingItemInteraction";

// Real selector, pointer listener, async click and beginPlayerWork. Only scene/GPU
// services are substituted; native WebGL coverage exercises the depth producer.
function fixture() {
  const eye = new Vector3(0.625, 1.8, 2.925);
  const camera = {
    entity: {
      transform: { worldPosition: eye, worldForward: new Vector3(0, -0.7, -0.7), worldRight: new Vector3(1, 0, 0) }
    },
    viewMatrix: new Matrix(),
    projectionMatrix: new Matrix(),
    farClipPlane: 100,
    aspectRatio: 1,
    fieldOfView: 60,
    worldToViewportPoint: (_: Vector3, out: Vector3) => out.set(0.5, 0.5, 1),
    screenPointToRay: (_: unknown, ray: Ray) => {
      ray.origin.copyFrom(eye);
      ray.direction.set(0, -1, -1).normalize();
    },
    viewportPointToRay: (_: unknown, ray: Ray) => {
      ray.origin.copyFrom(eye);
      ray.direction.set(0, -1, -3).normalize();
    }
  };
  const snapshot: any = {
    revision: 1,
    grid: { originX: 0, originZ: 0, cellSize: 1.25 },
    crops: {},
    plots: [],
    storage: { containers: [], layout: { groundId: "ground" } },
    items: { instances: [{ id: "hoe", type: "hoe", groundId: "ground" }], carried: { itemId: "hoe" } }
  };
  const ground = {
    revision: 1,
    sample: (_: string, x: number, z: number) => ({ position: [x, 0, z] }),
    raycast: vi.fn(() => null)
  };
  const service = { getSnapshot: () => presentation.snapshot, inspectCultivation: () => ({ canCultivate: true }) };
  const presentation: any = Object.assign(Object.create(FarmingWorldPresentation.prototype), {
    surfaces: new Map(),
    camera,
    ground: { capture: () => ground },
    snapshot,
    service,
    playerTargetKey: "",
    playerTargetCheckedAt: -Infinity,
    playerTarget: null,
    workPoint: new Vector3(),
    workScreen: new Vector3(),
    workRay: new Ray(),
    viewRay: new Ray(),
    viewportCenter: new Vector2(0.5, 0.5),
    previousRay: new Float64Array(6).fill(NaN),
    targetGroundRevision: -1,
    refreshSelection() {},
    items: { hitHeld: () => false, worldBounds: () => null },
    endPlayerWork() {
      this.playerActionTarget = undefined;
    }
  });
  const nearBlocked = (ray: Ray) => Math.abs(ray.direction.z / ray.direction.y) < 1;
  const visibility = { hint: nearBlocked, strict: nearBlocked };
  const prepare = vi.fn(async (_: Ray, _root?: unknown) => true);
  const execute = vi.fn(async (..._args: unknown[]) => ({ receipt: { ok: true } })),
    result = vi.fn();
  const document = Object.assign(new EventTarget(), { defaultView: new EventTarget() });
  const canvas = {
    ownerDocument: document,
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
  };
  const interaction = new FarmingItemInteraction({
    canvas,
    camera,
    service,
    coordinator: { execute },
    presentation,
    ground: { capture: () => ground },
    definitions: {},
    isEnabled: () => true,
    isStorageContainerVisible: () => false,
    occluded: (r: Ray) => visibility.strict(r),
    hintOccluded: (r: Ray) => visibility.hint(r),
    prepareOcclusion: prepare,
    result
  } as any);
  const tap = () => {
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new Event(type);
      for (const [key, value] of Object.entries({
        target: canvas,
        pointerId: 1,
        clientX: 50,
        clientY: 30,
        button: 0,
        isPrimary: true
      }))
        Object.defineProperty(event, key, { value });
      document.dispatchEvent(event);
    }
  };
  return { presentation, interaction, visibility, prepare, execute, result, ground, camera, snapshot, tap };
}

import { SeedWorldVisualQuery as PlanningVisualOcclusion } from "@galacean/engine-world-planning/world/SeedWorldVisualQuery";

async function timedClick({
  delays,
  item = true,
  blockedPointer = false,
  blockedA = true,
  invalidate = false,
  heldHit = false,
  sync = false,
  held = "hoe",
  facility = false,
  remote = false
}: {
  delays: number[];
  item?: boolean;
  blockedPointer?: boolean;
  blockedA?: boolean;
  invalidate?: boolean;
  heldHit?: boolean;
  sync?: boolean;
  held?: string;
  facility?: boolean;
  remote?: boolean;
}) {
  let now = 1000,
    reads = 0;
  const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
  const f = fixture(),
    camera: any = f.camera;
  camera.engine = { on() {}, off() {} };
  Object.assign(f.snapshot.items.instances[0], { type: held, seedId: "tomato", contents: [{ quantity: 1 }] });
  if (held === "watering-can") {
    for (const cellZ of [0, 1])
      f.snapshot.plots.push({
        groundId: "ground",
        cellX: 0,
        cellZ,
        plotId: `ground/x0z${cellZ}`,
        ground: { availability: "available" }
      });
  }
  if (remote) {
    f.snapshot.plots.push({ groundId: "ground", cellX: 0, cellZ: -3, plotId: "remote", occupantId: "crop" });
    f.ground.raycast.mockReturnValue({ groundId: "ground", position: [0.625, 0, -3.125], distance: 6.31 } as any);
    f.camera.screenPointToRay = (_: unknown, ray: Ray) => {
      ray.origin.copyFrom(f.camera.entity.transform.worldPosition);
      ray.direction.set(0.625, 0, -3.125).subtract(ray.origin).normalize();
    };
  }
  if (facility)
    f.snapshot.storage.containers.push({
      id: "store",
      typeId: "basket",
      groundId: "ground",
      position: [0.625, 0, 1.125],
      yaw: 0
    });
  const picker = {
    waitForFrame: async () => {},
    depthAlongRay: async (_: unknown, ray: Ray) => {
      const index = reads++;
      now += delays[index] ?? delays.at(-1)!;
      if (invalidate) f.presentation.snapshot = { ...f.snapshot, revision: 2 };
      return Math.abs(ray.direction.z / ray.direction.y - 1) < 0.0001
        ? blockedPointer
          ? 0
          : Infinity
        : blockedA && Math.abs(ray.direction.z / ray.direction.y) < 1
          ? 0
          : Infinity;
    },
    dispose() {}
  };
  const query = new PlanningVisualOcclusion(
    camera,
    () => f.ground,
    () => 1,
    () => {},
    picker as any
  );
  try {
    const opts = (f.interaction as any).options;
    opts.occluded = (ray: Ray, distance: number, root: any) => query.occluded(ray, distance, root);
    opts.occlusionState = (ray: Ray, distance: number, root: any) => query.occlusionState(ray, distance, root);
    f.presentation.setPlayerOcclusionQuery(opts.occluded, () => true);
    f.prepare.mockImplementation((ray: Ray, root: any) => query.prepare(ray, root, true));
    if (item)
      f.snapshot.items.instances.push({
        id: "seed",
        type: "seed-bag",
        groundId: "ground",
        position: [0.625, 0, 1.125],
        yaw: 0
      });
    f.snapshot.grid.maximumSlopeDegrees = 30;
    Object.assign(f.ground, {
      inspectBounds: () => ({
        covered: true,
        blocked: false,
        underwater: false,
        surfaces: ["soil"],
        maximumSlopeDegrees: 0,
        minimumHeight: 0,
        maximumHeight: 0
      })
    });
    f.presentation.items.worldBounds = (id: string) =>
      id === "seed" ? new BoundingBox(new Vector3(0.525, 0, 1.025), new Vector3(0.725, 0.35, 1.225)) : null;
    f.presentation.items.hitHeld = () => heldHit;
    const executeItem = vi.fn(async (..._args: any[]) => ({ receipt: { ok: true } }));
    opts.coordinator.executeItem = executeItem;
    opts.isStorageContainerVisible = () => facility;
    if (sync) {
      opts.prepareOcclusion = undefined;
      opts.occlusionState = undefined;
      opts.occluded = () => false;
      f.presentation.setPlayerOcclusionQuery(opts.occluded);
    }
    const original = (f.interaction as any).prepareClick.bind(f.interaction);
    let pending: Promise<void> | undefined;
    (f.interaction as any).prepareClick = (...args: unknown[]) => (pending = original(...args));
    const candidates = vi.spyOn(f.presentation, "getPlayerWorkCandidates");
    f.tap();
    await pending;
    return {
      reads,
      elapsed: now - 1000,
      items: executeItem.mock.calls.map((c) => c[0]),
      work: f.execute.mock.calls.map((c) => c[0]),
      candidates: candidates.mock.calls.length
    };
  } finally {
    query.dispose();
    f.interaction.dispose();
    clock.mockRestore();
  }
}

it.each([30, 60, 80, 149])("picks the item without preparing work candidates with %sms readback", async (delay) => {
  const result = await timedClick({ delays: [delay] });
  expect(result.items).toEqual([expect.objectContaining({ type: "pickup-item", itemId: "seed" })]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(1);
  expect(result.candidates).toBe(0);
});

it.each([150, 151, 400])("an expired pointer sample at %sms never changes pickup into work", async (delay) => {
  const result = await timedClick({ delays: [delay, 10, 10] });
  expect(result.items).toEqual([]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(1);
});

it("an expired work candidate is unavailable, not a reason to operate the next candidate", async () => {
  const result = await timedClick({ delays: [150, 10], item: false, blockedA: false });
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(1);
});

it("a fresh blocked work candidate still permits confirming the second candidate", async () => {
  const result = await timedClick({ delays: [60, 60], item: false });
  expect(result.work).toEqual([
    expect.objectContaining({ type: "hoe", target: expect.objectContaining({ cellZ: 0 }) })
  ]);
  expect(result.reads).toBe(2);
});

it("a genuinely blocked item preserves the existing nearby work fallback", async () => {
  const result = await timedClick({ delays: [10], blockedPointer: true, blockedA: false });
  expect(result.items).toEqual([]);
  expect(result.work).toEqual([
    expect.objectContaining({ type: "hoe", target: expect.objectContaining({ cellZ: 1 }) })
  ]);
});

it("invalidates a pickup when the snapshot changes during readback", async () => {
  const result = await timedClick({ delays: [10], invalidate: true });
  expect(result.items).toEqual([]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(1);
});

it("placing the held tool does not wait for unrelated world or work visibility", async () => {
  const result = await timedClick({ delays: [400], heldHit: true });
  expect(result.items).toEqual([expect.objectContaining({ type: "place-item", expectedItemId: "hoe" })]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(0);
});

it("preserves synchronous item pickup for hosts without asynchronous depth", async () => {
  const result = await timedClick({ delays: [10], sync: true });
  expect(result.items).toEqual([expect.objectContaining({ type: "pickup-item", itemId: "seed" })]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(0);
});

it("picks another item while holding a watering can without querying either work plot", async () => {
  const result = await timedClick({ delays: [80], held: "watering-can" });
  expect(result.items).toEqual([expect.objectContaining({ type: "pickup-item", itemId: "seed" })]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(1);
  expect(result.candidates).toBe(0);
});

it("keeps facility unloading ahead of plot actions", async () => {
  const result = await timedClick({ delays: [60], held: "harvest-basket", item: false, facility: true });
  expect(result.items).toEqual([expect.objectContaining({ type: "unload-basket", containerId: "store" })]);
  expect(result.work).toEqual([]);
  expect(result.reads).toBe(1);
});

it.each([
  ["seed-bag", "plant"],
  ["harvest-basket", "harvest"]
])("preserves remote %s actions", async (held, action) => {
  const result = await timedClick({ delays: [60], held, item: false, remote: true });
  expect(result.items).toEqual([]);
  expect(result.work).toEqual([expect.objectContaining({ type: action, plotId: "remote" })]);
  expect(result.reads).toBe(1);
});

it("preserves synchronous nearby work for hosts without asynchronous depth", async () => {
  const result = await timedClick({ delays: [10], sync: true, item: false });
  expect(result.items).toEqual([]);
  expect(result.work).toEqual([expect.objectContaining({ type: "hoe" })]);
  expect(result.reads).toBe(0);
});

it("a single-query host stops after the first clear work candidate", async () => {
  const result = await timedClick({ delays: [10], item: false, blockedA: false });
  expect(result.work).toEqual([expect.objectContaining({ type: "hoe", target: expect.objectContaining({ cellZ: 1 }) })]);
  expect(result.reads).toBe(1);
});
